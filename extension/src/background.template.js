// =====================================================
// Clip Vault — Background Service Worker v1.0 (template)
//
// 這是模板，進版控。實際使用的 extension/src/background.js 由
// tools/build_manifest.py 從這份模板產生（把 OAUTH_CLIENT_SECRET 的預設值
// 換成你 .env 裡的 GOOGLE_OAUTH_CLIENT_SECRET），不進版控。
//
// 為什麼 secret 放在這裡而不是 manifest.json：Chrome（尤其 Comet）對
// manifest.json 有 schema 驗證，不認得的頂層欄位不是單純警告，是真的
// 會被濴掉（"Unrecognized manifest key"）——把 secret 存成 manifest 自訂
// 欄位會導致 chrome.runtime.getManifest() 永遠拿不到它。background.js
// 是純 JS 檔案，Chrome 不會對它做任何 schema 檢查，寫什麼都不會被濴。
//
// 注意：OAUTH_CLIENT_SECRET 預設值跟下面 clientSecret() 裡的
// .startsWith('REPLACE_ME') 故意不是同一個字串（前者是完整的
// REPLACE_ME_WITH_YOUR_OWN_CLIENT_SECRET，後者只取前段字首）——
// build_manifest.py 是用完整字串做整份檔案的文字替換，如果這兩處用
// 同一個完整字串，換完之後判斷式會變成 secret.startsWith(secret 自己)
// 永遠是 true，導致 clientSecret() 永遠回傳空字串（曾經踩過這個坑）。
//
// 收到的內容往兩個目的地寫，各自獨立、互不影響：
//   Google Drive   使用者自己在設定頁填路徑，背景服務逐層搜尋/建立出來的資料夾
//   Obsidian       使用者自己填的 vault 名稱 + 資料夾路徑
// 任何一邊成功就算成功。兩邊都可以同時開，也可以只開一邊。
//
// 認證從第一天就用 launchWebAuthFlow（不是 getAuthToken）——
// PostSync／MeshSync 這兩個姐妹專案都是先用 getAuthToken 上線，
// 之後才發現 Vivaldi/Brave/Comet 全部不支援，回頭重修一次。
// 這裡直接照那次的教訓做對，見 README「OAuth 設定」一節。
// =====================================================

importScripts('naming.js');

const DRIVE = 'https://www.googleapis.com/drive/v3';
const DOCS = 'https://docs.googleapis.com/v1';
const SEEN_CAP = 5000;

const OAUTH_CLIENT_SECRET = 'REPLACE_ME_WITH_YOUR_OWN_CLIENT_SECRET';

const MENU_ID = 'clipvault-capture';

chrome.runtime.onInstalled.addListener((d) => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: '⚡ 收藏到 Clip Vault',
    contexts: ['page', 'selection', 'link', 'image'],
  }, () => { void chrome.runtime.lastError; });
  if (d.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab) return;
  chrome.tabs.sendMessage(tab.id, { type: 'CLIPVAULT_CONTEXT' }, () => {
    void chrome.runtime.lastError;
  });
});

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd !== 'capture-clip') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'CLIPVAULT_HOTKEY' }, () => {
      void chrome.runtime.lastError;
    });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CLIPVAULT_CAPTURE') {
    handleCapture(msg.payload, !!msg.force, sender.tab && sender.tab.id).then(sendResponse);
    return true;
  }
  if (msg.type === 'CLIPVAULT_CONNECT') {
    getToken(true)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: errMsg(e) }));
    return true;
  }
  if (msg.type === 'CLIPVAULT_STATUS') {
    if (!clientIdSet()) {
      sendResponse({ connected: false, reason: 'no_client_id' });
      return true;
    }
    getToken(false)
      .then(() => sendResponse({ connected: true }))
      .catch(() => sendResponse({ connected: false }));
    return true;
  }
  if (msg.type === 'CLIPVAULT_RESOLVE_FOLDER') {
    withAuthRetry((token) => resolveFolderPath(token, msg.path || ''))
      .then((res) => sendResponse({ ok: true, ...res }))
      .catch((e) => sendResponse({ ok: false, error: errMsg(e) }));
    return true;
  }
  return false;
});

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what}逾時（${Math.round(ms / 1000)} 秒沒有回應）`)), ms);
    }),
  ]);
}

async function fetchT(url, opts = {}, ms = 45000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`連線逾時（${Math.round(ms / 1000)} 秒）：${new URL(url).host}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function errMsg(e) {
  return (e && e.message) || (e && e.constructor && e.constructor.name) || '未知錯誤';
}

function clientIdSet() {
  const m = chrome.runtime.getManifest();
  const id = (m.oauth2 && m.oauth2.client_id) || '';
  return !!id && !id.startsWith('REPLACE_ME');
}

function clientSecret() {
  return OAUTH_CLIENT_SECRET && !OAUTH_CLIENT_SECRET.startsWith('REPLACE_ME')
    ? OAUTH_CLIENT_SECRET
    : '';
}

const TOKEN_KEY = 'cvAuthToken';
const REFRESH_KEY = 'cvRefreshToken';

async function cachedToken() {
  const { [TOKEN_KEY]: t } = await chrome.storage.session.get([TOKEN_KEY]);
  if (t && t.expiresAt > Date.now() + 60000) return t.token;
  return null;
}

async function cacheToken(token, expiresInSec) {
  await chrome.storage.session.set({
    [TOKEN_KEY]: { token, expiresAt: Date.now() + (Number(expiresInSec) || 3600) * 1000 },
  });
}

async function clearCachedToken() {
  await chrome.storage.session.remove([TOKEN_KEY]);
}

async function getRefreshToken() {
  const { [REFRESH_KEY]: t } = await chrome.storage.local.get([REFRESH_KEY]);
  return t || null;
}

async function saveRefreshToken(token) {
  await chrome.storage.local.set({ [REFRESH_KEY]: token });
}

async function clearRefreshToken() {
  await chrome.storage.local.remove([REFRESH_KEY]);
}

async function tokenEndpoint(params) {
  const res = await fetchT('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    const e = new Error(`Google 授權失敗（${res.status}）`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

function launchAuthCodeFlow() {
  return new Promise((resolve, reject) => {
    const m = chrome.runtime.getManifest();
    const clientId = m.oauth2 && m.oauth2.client_id;
    const secret = clientSecret();
    const scopes = ((m.oauth2 && m.oauth2.scopes) || []).join(' ');
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
      + `?client_id=${encodeURIComponent(clientId)}`
      + '&response_type=code'
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&scope=${encodeURIComponent(scopes)}`
      + '&access_type=offline'
      + '&prompt=consent';

    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (redirectedTo) => {
      if (chrome.runtime.lastError || !redirectedTo) {
        reject(new Error(
          (chrome.runtime.lastError && chrome.runtime.lastError.message) || '尚未連接 Google'
        ));
        return;
      }
      try {
        const code = new URL(redirectedTo).searchParams.get('code');
        if (!code) {
          reject(new Error('Google 的授權回應裡沒有 code'));
          return;
        }
        const body = {
          code,
          client_id: clientId,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        };
        if (secret) body.client_secret = secret;
        const tok = await tokenEndpoint(body);
        resolve(tok);
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function refreshAccessToken(refreshToken) {
  const m = chrome.runtime.getManifest();
  const clientId = m.oauth2 && m.oauth2.client_id;
  const secret = clientSecret();
  const body = { client_id: clientId, refresh_token: refreshToken, grant_type: 'refresh_token' };
  if (secret) body.client_secret = secret;
  try {
    return await tokenEndpoint(body);
  } catch (e) {
    e.refreshInvalid = e.status === 400 || e.status === 401;
    throw e;
  }
}

function getToken(interactive) {
  if (!clientIdSet()) {
    return Promise.reject(new Error(
      '尚未設定 Google OAuth client_id。照 README 的「OAuth 設定」做一次，'
      + '把 client_id 填進 .env 並重跑 build_manifest.py；或先只用 Obsidian。'
    ));
  }
  const p = (async () => {
    const cached = await cachedToken();
    if (cached) return cached;

    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      try {
        const tok = await refreshAccessToken(refreshToken);
        await cacheToken(tok.access_token, tok.expires_in);
        return tok.access_token;
      } catch (e) {
        if (!e.refreshInvalid) throw e;
        await clearRefreshToken();
      }
    }

    if (!interactive) {
      throw new Error('尚未連接 Google');
    }

    const tok = await launchAuthCodeFlow();
    if (tok.refresh_token) await saveRefreshToken(tok.refresh_token);
    await cacheToken(tok.access_token, tok.expires_in);
    return tok.access_token;
  })();
  return interactive ? withTimeout(p, 120000, 'Google 授權') : p;
}

async function withAuthRetry(fn) {
  let token = await getToken(true);
  try {
    return await fn(token);
  } catch (e) {
    if (!e.auth) throw e;
    await clearCachedToken();
    token = await getToken(true);
    return fn(token);
  }
}

async function api(token, method, url, body) {
  const res = await fetchT(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    const e = new Error('AUTH_EXPIRED');
    e.auth = true;
    throw e;
  }
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = (j.error && j.error.message) || '';
    } catch (_) { /* 非 JSON 錯誤內文 */ }
    throw new Error(`Google API ${res.status}：${detail || res.statusText || '未知錯誤'}`);
  }
  return res.status === 204 ? null : res.json();
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

function fingerprint(p) {
  const perma = (p.permalink || '').split('#')[0];
  const usable = perma && perma !== p.pageUrl ? perma : (p.permalink || p.pageUrl || '');
  const basis = usable || `${p.author}|${(p.text || '').slice(0, 200)}`;
  return hashStr(`${p.platform}|${basis.replace(/\s+/g, '')}`);
}

async function checkSeen(key) {
  const { cvSeen = {} } = await chrome.storage.local.get(['cvSeen']);
  return cvSeen[key] || null;
}

async function markSeen(key, entry) {
  const { cvSeen = {} } = await chrome.storage.local.get(['cvSeen']);
  cvSeen[key] = entry;
  const keys = Object.keys(cvSeen);
  if (keys.length > SEEN_CAP) {
    keys.sort((a, b) => (cvSeen[a].t || 0) - (cvSeen[b].t || 0));
    keys.slice(0, keys.length - SEEN_CAP).forEach((k) => delete cvSeen[k]);
  }
  await chrome.storage.local.set({ cvSeen });
}

function progress(tabId, text) {
  if (tabId == null) return;
  try {
    chrome.tabs.sendMessage(tabId, { type: 'CLIPVAULT_PROGRESS', text }, () => {
      void chrome.runtime.lastError;
    });
  } catch (_) { /* 分頁不在了 */ }
}

function tagLine(tags) {
  const list = String(tags || '')
    .split(/[\s,，]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
  return list.join(' ');
}

async function handleCapture(p, force, tabId) {
  const key = fingerprint(p);
  if (!force) {
    const prev = await checkSeen(key);
    if (prev) return { ok: false, dup: true, prev };
  }

  const s = await chrome.storage.sync.get([
    'driveEnabled', 'driveFolderId', 'driveFolderPath', 'driveTags',
    'obsidianEnabled', 'obsidianVault', 'obsidianFolder', 'obsidianTags',
    'localEnabled', 'localFolder', 'localTags',
  ]);
  const wantDrive = s.driveEnabled !== false && clientIdSet() && !!s.driveFolderId;
  const wantObsidian = !!s.obsidianEnabled && !!s.obsidianVault;
  const wantLocal = !!s.localEnabled;

  if (!wantDrive && !wantObsidian && !wantLocal) {
    const m = 'Drive、Obsidian、本機檔案都沒有設定好，沒有地方可以寫。'
      + '請點擴充圖示打開設定，至少完成一邊（Drive 要確認路徑、Obsidian 要填 vault 名稱，'
      + '本機檔案只要打開開關就好）。';
    await logEntry({ ok: false, msg: m, time: Date.now() });
    badge(false);
    return { ok: false, error: m };
  }

  let drive = null;
  let driveError = '';
  if (wantDrive) {
    try {
      progress(tabId, '確認 Google 授權…');
      drive = await withAuthRetry((token) => writeDrive(token, p, s, tabId));
    } catch (e) {
      driveError = errMsg(e);
    }
  }

  let obs = null;
  let obsError = '';
  if (wantObsidian) {
    try {
      progress(tabId, '交給 Obsidian…');
      obs = await writeObsidian(p, s, tabId);
    } catch (e) {
      obsError = errMsg(e);
    }
  }

  let local = null;
  let localError = '';
  if (wantLocal) {
    try {
      progress(tabId, '存成本機 Markdown…');
      local = await writeLocal(p, s);
    } catch (e) {
      localError = errMsg(e);
    }
  }

  const ok = !!(drive || obs || local);
  if (ok) {
    await markSeen(key, {
      t: Date.now(),
      when: dateTimeStr(),
      docUrl: drive ? drive.docUrl : '',
      docName: drive ? drive.docName : '',
    });
  }

  const bits = [];
  if (drive) bits.push(`Drive「${drive.docName}」${drive.imgNote ? `（${drive.imgNote}）` : ''}`);
  else if (driveError) bits.push(`Drive 失敗：${driveError}`);
  else if (s.driveEnabled) bits.push('Drive 尚未設定資料夾');

  if (obs) bits.push(`Obsidian「${obs.fileName}」`);
  else if (obsError) bits.push(`Obsidian 失敗：${obsError}`);
  else if (s.obsidianEnabled) bits.push('Obsidian 尚未設定 vault');

  if (local) bits.push(`本機檔案「${local.filePath}」`);
  else if (localError) bits.push(`本機檔案失敗：${localError}`);

  await logEntry({
    ok,
    msg: `${(p.title || p.author || '未命名').slice(0, 30)}・${p.platformLabel}：${bits.join('・')}`,
    docUrl: drive ? drive.docUrl : '',
    time: Date.now(),
  });
  badge(ok);

  if (!ok) return { ok: false, error: bits.join('・') };
  return {
    ok: true,
    bits,
    firstUrl: drive ? drive.docUrl : '',
    obsidianUri: obs && obs.uri ? obs.uri : '',
  };
}

async function writeDrive(token, p, s, tabId) {
  progress(tabId, `建立 Doc（${p.text.length.toLocaleString()} 字）…`);
  const doc = await createDoc(token, s.driveFolderId, p, s.driveTags);

  let imgNote = '';
  if (p.images && p.images.length) {
    progress(tabId, `嵌入 ${p.images.length} 張圖…`);
    imgNote = await insertImages(token, doc.docId, s.driveFolderId, p.images, tabId);
  }
  return {
    docName: doc.name,
    docUrl: `https://docs.google.com/document/d/${doc.docId}/edit`,
    imgNote,
  };
}

async function findChildFolder(token, parentId, name) {
  const q = `name='${escapeQ(name)}' and mimeType='application/vnd.google-apps.folder'`
    + ` and '${parentId}' in parents and trashed=false`;
  const res = await api(
    token, 'GET',
    `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
  );
  const files = res.files || [];
  return files[0] || null;
}

function escapeQ(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function createChildFolder(token, parentId, name) {
  const f = await api(token, 'POST', `${DRIVE}/files?fields=id,name`, {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  });
  return f;
}

async function resolveFolderPath(token, path) {
  const segments = String(path || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  let parentId = 'root';
  const createdSegments = [];
  for (const seg of segments) {
    let found = await findChildFolder(token, parentId, seg);
    if (!found) {
      found = await createChildFolder(token, parentId, seg);
      createdSegments.push(seg);
    }
    parentId = found.id;
  }
  return { folderId: parentId, createdSegments };
}

async function createDoc(token, folderId, p, tags) {
  const topic = topicOf(p);
  const docName = docStem(p);

  const created = await api(token, 'POST', `${DRIVE}/files?fields=id`, {
    name: docName,
    mimeType: 'application/vnd.google-apps.document',
    parents: [folderId],
  });

  const tags_ = tagLine(tags);
  const title = `${topic}\n`;
  const tagsPara = tags_ ? `${tags_}\n` : '';
  const meta = `${p.author || p.platformLabel}${p.timeText ? `・${p.timeText}` : ''}・收錄於 ${dateTimeStr()}\n`;
  const effectiveLink = p.permalink || (p.pageUrl ? p.pageUrl.split('#')[0] : '');
  const link = effectiveLink ? `${effectiveLink}\n\n` : '';
  const body = `${cleanText(p.text)}\n\n`;
  const text = title + tagsPara + meta + link + body;
  const linkStart = 1 + title.length + tagsPara.length + meta.length;

  const requests = [
    { insertText: { location: { index: 1 }, text } },
    {
      updateParagraphStyle: {
        range: { startIndex: 1, endIndex: 1 + title.length },
        paragraphStyle: { namedStyleType: 'TITLE' },
        fields: 'namedStyleType',
      },
    },
  ];
  if (effectiveLink) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: linkStart, endIndex: linkStart + effectiveLink.length },
        textStyle: { link: { url: effectiveLink } },
        fields: 'link',
      },
    });
  }
  await api(token, 'POST', `${DOCS}/documents/${created.id}:batchUpdate`, { requests });
  return { docId: created.id, name: docName };
}

async function docEnd(token, docId) {
  const doc = await api(token, 'GET', `${DOCS}/documents/${docId}?fields=body.content(endIndex)`);
  const content = (doc.body && doc.body.content) || [];
  const last = content[content.length - 1];
  return last ? last.endIndex - 1 : 1;
}

async function insertOneImage(token, docId, uri) {
  const at = await docEnd(token, docId);
  await api(token, 'POST', `${DOCS}/documents/${docId}:batchUpdate`, {
    requests: [
      { insertInlineImage: { location: { index: at }, uri } },
      { insertText: { location: { index: at + 1 }, text: '\n' } },
    ],
  });
}

async function viaDrive(token, docId, folderId, url) {
  const res = await fetchT(url, {}, 30000);
  if (!res.ok) throw new Error(`下載失敗 ${res.status}`);
  const blob = await res.blob();
  if (blob.size > 45 * 1024 * 1024) throw new Error('圖片過大');

  const boundary = `clipvault${Math.random().toString(36).slice(2)}`;
  const meta = { name: `clipvault-tmp-${Date.now()}`, parents: [folderId] };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(meta),
    `\r\n--${boundary}\r\nContent-Type: ${blob.type || 'image/jpeg'}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--\r\n`,
  ]);
  const up = await fetchT(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
    90000,
  );
  if (!up.ok) throw new Error(`上傳失敗 ${up.status}`);
  const fileId = (await up.json()).id;

  try {
    await api(token, 'POST', `${DRIVE}/files/${fileId}/permissions?fields=id`, {
      role: 'reader', type: 'anyone',
    });
    await insertOneImage(token, docId, `https://drive.google.com/uc?export=view&id=${fileId}`);
  } finally {
    try { await api(token, 'DELETE', `${DRIVE}/files/${fileId}`); } catch (_) { /* 之後手動清 */ }
  }
}

async function insertImages(token, docId, folderId, urls, tabId) {
  const failed = [];
  let done = 0;
  for (const url of urls) {
    progress(tabId, `嵌入圖片 ${done + failed.length + 1}/${urls.length}…`);
    try {
      await insertOneImage(token, docId, url);
      done++;
      continue;
    } catch (_) { /* 第一層被擋，換第二層 */ }
    try {
      await viaDrive(token, docId, folderId, url);
      done++;
    } catch (e) {
      failed.push(url);
    }
  }
  if (failed.length) {
    const note = `（另有 ${failed.length} 張圖嵌入失敗，以下網址通常幾天後就會失效）\n${failed.join('\n')}\n`;
    try {
      const end = await docEnd(token, docId);
      await api(token, 'POST', `${DOCS}/documents/${docId}:batchUpdate`, {
        requests: [{ insertText: { location: { index: end }, text: note } }],
      });
    } catch (_) { /* 連註記都寫不進去就算了 */ }
  }
  return failed.length ? `圖 ${done}/${urls.length}` : '';
}

const OBSIDIAN_URI_SAFE_LEN = 6000;

async function writeObsidian(p, s, tabId) {
  const topic = topicOf(p);
  const fileName = docStem(p);
  const folder = String(s.obsidianFolder || '').replace(/^\/+|\/+$/g, '');
  const filePath = folder ? `${folder}/${fileName}` : fileName;

  const tags_ = tagLine(s.obsidianTags);
  const meta = `${p.author || p.platformLabel}${p.timeText ? `・${p.timeText}` : ''}・收錄於 ${dateTimeStr()}`;
  const link = p.permalink ? p.permalink : `（收錄自：${p.pageUrl || ''}）`;

  let content = [
    `# ${topic}`,
    tags_,
    '',
    meta,
    link,
    '',
    cleanText(p.text),
    '',
  ].filter((l, i) => !(i === 1 && !l)).join('\n');

  const params = new URLSearchParams({
    vault: s.obsidianVault,
    file: filePath,
    append: '',
  });
  let uri = `obsidian://new?${params.toString()}&content=${encodeURIComponent(content)}`;

  if (uri.length > OBSIDIAN_URI_SAFE_LEN) {
    const room = OBSIDIAN_URI_SAFE_LEN - (uri.length - encodeURIComponent(content).length) - 40;
    const truncated = `${content.slice(0, Math.max(200, room))}\n\n…（內容過長，已截斷。原始網址：${p.permalink || p.pageUrl}）`;
    content = truncated;
    uri = `obsidian://new?${params.toString()}&content=${encodeURIComponent(content)}`;
  }

  // 若由分頁發起，交由前端 content script 靜默喚醒（避免開關空白分頁造成視覺閃爍）。
  // 僅在無 tabId 的降級情境下才用 chrome.tabs.create。
  if (!tabId) {
    let originId = null;
    try {
      const [cur] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      originId = cur && cur.id;
    } catch (_) { /* 拿不到就算了，不影響主流程 */ }

    const tab = await chrome.tabs.create({ url: uri, active: true });
    setTimeout(() => {
      chrome.tabs.remove(tab.id, () => void chrome.runtime.lastError);
      if (originId != null) {
        chrome.tabs.update(originId, { active: true }, () => void chrome.runtime.lastError);
      }
    }, 1500);
  }

  return { fileName, filePath, uri };
}

async function writeLocal(p, s) {
  const topic = topicOf(p);
  const fileName = `${docStem(p)}.md`;
  const folder = String(s.localFolder || 'ClipVault').trim().replace(/^\/+|\/+$/g, '') || 'ClipVault';
  const filePath = `${folder}/${fileName}`;

  const tags_ = tagLine(s.localTags);
  const meta = `${p.author || p.platformLabel}${p.timeText ? `・${p.timeText}` : ''}・收錄於 ${dateTimeStr()}`;
  const link = p.permalink ? p.permalink : `（收錄自：${p.pageUrl || ''}）`;

  const content = [
    `# ${topic}`,
    tags_,
    '',
    meta,
    link,
    '',
    cleanText(p.text),
    '',
  ].filter((l, i) => !(i === 1 && !l)).join('\n');

  const url = `data:text/markdown;charset=utf-8;base64,${utf8ToBase64(content)}`;

  await new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url, filename: filePath, conflictAction: 'uniquify', saveAs: false },
      (id) => {
        if (chrome.runtime.lastError || id == null) {
          reject(new Error((chrome.runtime.lastError && chrome.runtime.lastError.message) || '下載失敗'));
          return;
        }
        resolve(id);
      },
    );
  });

  return { fileName, filePath };
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function topicOf(p) {
  if (self.CLIP_VAULT_NAME && p.platform !== 'web') {
    return self.CLIP_VAULT_NAME.topicOf(p);
  }
  return sanitizeName(p.title || p.text || '') || '未命名';
}

function docStem(p) {
  if (self.CLIP_VAULT_NAME && p.platform !== 'web') {
    return self.CLIP_VAULT_NAME.docStem(p, ymd());
  }
  return `${ymd()}_${sanitizeName(p.title || p.text || '未命名')}`;
}

function sanitizeName(s) {
  return String(s || '')
    .replace(/[\/\\:*?"<>|\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

function cleanText(s) {
  return String(s || '')
    .replace(/\r/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .replace(/(^|\n)⚡?\s*(收這篇|收藏|存進 Clip Vault)\s*($|\n)/gi, '\n')
    .replace(/(^|\n)Facebook(?=\n|$)/gi, '')
    .replace(/(^|\n)[a-zA-Z](?=\n|$)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function dateTimeStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function badge(ok) {
  chrome.action.setBadgeText({ text: ok ? '✓' : '!' });
  chrome.action.setBadgeBackgroundColor({ color: ok ? '#10704a' : '#dc2626' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
}

async function logEntry(entry) {
  const { cvLog = [] } = await chrome.storage.local.get(['cvLog']);
  cvLog.unshift(entry);
  if (cvLog.length > 50) cvLog.splice(50);
  await chrome.storage.local.set({ cvLog });
}
