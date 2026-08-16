// =====================================================
// Clip Vault — Background Service Worker v1.0
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

// ── 右鍵選單 ─────────────────────────────────────────

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
    void chrome.runtime.lastError; // 這個分頁沒有 content script 就算了
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

// ── OAuth（launchWebAuthFlow，跨 Chromium 瀏覽器）──────
// 細節與理由見 README「在 Vivaldi／Brave／Comet 上使用」一節。

function clientIdSet() {
  const m = chrome.runtime.getManifest();
  const id = (m.oauth2 && m.oauth2.client_id) || '';
  return !!id && !id.startsWith('REPLACE_ME');
}

const TOKEN_KEY = 'cvAuthToken';

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

function launchAuthFlow(interactive) {
  return new Promise((resolve, reject) => {
    const m = chrome.runtime.getManifest();
    const clientId = m.oauth2 && m.oauth2.client_id;
    const scopes = ((m.oauth2 && m.oauth2.scopes) || []).join(' ');
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
      + `?client_id=${encodeURIComponent(clientId)}`
      + '&response_type=token'
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&scope=${encodeURIComponent(scopes)}`
      + '&include_granted_scopes=true'
      + `&prompt=${interactive ? 'consent' : 'none'}`;

    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (redirectedTo) => {
      if (chrome.runtime.lastError || !redirectedTo) {
        reject(new Error(
          (chrome.runtime.lastError && chrome.runtime.lastError.message) || '尚未連接 Google'
        ));
        return;
      }
      const tokenMatch = redirectedTo.match(/[#&]access_token=([^&]+)/);
      const expMatch = redirectedTo.match(/[#&]expires_in=([^&]+)/);
      if (!tokenMatch) {
        reject(new Error('Google 的授權回應裡沒有 access_token'));
        return;
      }
      resolve({
        token: decodeURIComponent(tokenMatch[1]),
        expiresIn: expMatch ? Number(expMatch[1]) : 3600,
      });
    });
  });
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
    const { token, expiresIn } = await launchAuthFlow(interactive);
    await cacheToken(token, expiresIn);
    return token;
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

// ── 去重 ─────────────────────────────────────────────
// 用 permalink／頁面網址當指紋；社群貼文抓不到 permalink 時退回
// 「平台＋作者＋內文前 200 字」，跟 PostSync 同一套邏輯。

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

// ── 主流程 ───────────────────────────────────────────

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
  ]);
  const wantDrive = s.driveEnabled !== false && clientIdSet() && !!s.driveFolderId;
  const wantObsidian = !!s.obsidianEnabled && !!s.obsidianVault;

  if (!wantDrive && !wantObsidian) {
    const m = 'Drive 與 Obsidian 都沒有設定好，沒有地方可以寫。'
      + '請點擴充圖示打開設定，至少完成一邊（Drive 要確認路徑、Obsidian 要填 vault 名稱）。';
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
      obs = await writeObsidian(p, s);
    } catch (e) {
      obsError = errMsg(e);
    }
  }

  const ok = !!(drive || obs);
  if (ok) {
    await markSeen(key, {
      t: Date.now(),
      when: dateTimeStr(),
      docUrl: drive ? drive.docUrl : '',
    });
  }

  const bits = [];
  if (drive) bits.push(`Drive「${drive.docName}」${drive.imgNote ? `（${drive.imgNote}）` : ''}`);
  else if (driveError) bits.push(`Drive 失敗：${driveError}`);
  else if (s.driveEnabled) bits.push('Drive 尚未設定資料夾');

  if (obs) bits.push(`Obsidian「${obs.fileName}」`);
  else if (obsError) bits.push(`Obsidian 失敗：${obsError}`);
  else if (s.obsidianEnabled) bits.push('Obsidian 尚未設定 vault');

  await logEntry({
    ok,
    msg: `${(p.title || p.author || '未命名').slice(0, 30)}・${p.platformLabel}：${bits.join('・')}`,
    docUrl: drive ? drive.docUrl : '',
    time: Date.now(),
  });
  badge(ok);

  if (!ok) return { ok: false, error: bits.join('・') };
  return { ok: true, bits, firstUrl: drive ? drive.docUrl : '' };
}

// ── Google Drive ───────────────────────────────
// 資料夾是從 resolveFolderPath() 解析出來的（見下方），使用者在設定頁
// 填路徑、逐層搜尋/自動建立。

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

// ── 資料夾路徑解析 ─────────────────────────────
// Google Picker 在 MV3 擴充功能裡跑不起來（見 README「為什麼不是用
// Google Picker」），改成讓使用者填路徑字串，這裡逐層搜尋、自動建立。
//
// 這整段刻意只用 drive.file scope（不擴大成完整 drive）：
// files.list 底下的查詢在 drive.file scope 一樣能呼叫，只是回傳範圍
// 被限縮在「這個擴充自己建立過的檔案」——查得到的，一定是它自己建的，
// 天生就有存取權限，重複使用不會有問題。
//
// 唯一的限制：如果路徑裡某一層是使用者手動在 Drive 網頁上建立、
// 這個擴充從沒碰過的既有資料夾，這裡的搜尋找不到它（不是報錯，是
// 查得到「沒有」），會被當成不存在而另外新建一個同名的——不是接上
// 既有那一個。第一次設定路徑時如果填全新路徑就完全不受影響；
// 之後每次都會正確重複使用同一個。

function escapeQ(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

async function createChildFolder(token, parentId, name) {
  const f = await api(token, 'POST', `${DRIVE}/files?fields=id,name`, {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  });
  return f;
}

// path 例如 "00 inbox/Clip Vault 收藏"；空字串代表 My Drive 根目錄。
// 逐層搜尋，找不到就建立，回傳最終那一層的 folderId，以及這次實際
// 建立了哪幾層（讓設定頁能告訴使用者「這幾層是新建的」，不要含糊帶過）。
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
  const link = p.permalink
    ? `${p.permalink}\n\n`
    : `（這則抓不到原文連結，於 ${p.pageUrl || ''} 收錄）\n\n`;
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
  if (p.permalink) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: linkStart, endIndex: linkStart + p.permalink.length },
        textStyle: { link: { url: p.permalink } },
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

// 圖片嵌入沿用 PostSync 驗證過的兩層做法：先讓 Docs API 直接抓網址，
// 被擋（時效簽章網址、host 被防盃連擋）就自己下載再經 Drive 轉一手。
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

// ── Obsidian ─────────────────────────────────
// 走 Obsidian 原生的 obsidian://new URI（不需要 Advanced URI 外掛）。
// 開一個分頁把 URI 丟給作業系統，讓它交棒給 Obsidian App，
// 短暫延遲後把那個分頁關掉——它只是個信差，不需要留著。
//
// 已知限制：第一次執行瀏覽器會跳出「是否要開啟 Obsidian？」的系統確認框，
// 這是外部協定處理的正常行為，沒辦法從擴充這邊繞過去；勾選瀏覽器提供的
// 「一律允許」之後就不會再跳。URI 長度也有上限（隨作業系統/瀏覽器而不同，
// 大約幾千字元），超長的內容會被截斷並在檔案結尾加註記，不會假裝收完了。

const OBSIDIAN_URI_SAFE_LEN = 6000;

async function writeObsidian(p, s) {
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

  // 記錄目前作用中的分頁，交接完後要把焦點還回去
  let originId = null;
  try {
    const [cur] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    originId = cur && cur.id;
  } catch (_) { /* 拿不到就算了，不影響主流程 */ }

  // 外部協定（obsidian://）的「是否要開啟外部應用程式」確認框，Chromium
  // 系瀏覽器只認「目前作用中（active）」的分頁——背景分頁（active:false）
  // 觸發外部協定常常會被直接非声静點忽略，連確認框都不會跳出來，Obsidian
  // 也就永遠不會被叫起來，但這裡完全不會產生任何錯誤或例外。
  // 所以這裡短暫搞一下焦點讓協定交接成功，關閉分頁後再把焦點還回去。
  const tab = await chrome.tabs.create({ url: uri, active: true });
  setTimeout(() => {
    chrome.tabs.remove(tab.id, () => void chrome.runtime.lastError);
    if (originId != null) {
      chrome.tabs.update(originId, { active: true }, () => void chrome.runtime.lastError);
    }
  }, 1500);

  return { fileName, filePath };
}

// ── 命名（跟社群貼文共用同一套規則，見 naming.js）────

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

// ── 工具 ─────────────────────────────────────────────

function cleanText(s) {
  return String(s || '')
    .replace(/\r/g, '')
    .replace(/[ --]/g, '')
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
