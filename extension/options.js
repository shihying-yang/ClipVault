// =====================================================
// Clip Vault — 設定頁
//
// Google Picker 需要從 https://apis.google.com 載入遠端腳本，但
// Chrome MV3 對一般擴充頁面（這裡）的 CSP 完全不允許 script-src
// 放任何遠端網域——直接 <script src="https://apis.google.com/..."> 
// 會讓整個 manifest 被拒絕載入。正確做法是把 Picker 相關的東西
// 丟進一個「沙盒頁面」（sandbox.html，CSP 可以放寬），這裡只負責
// 拿 token、跟沙盒 iframe 用 postMessage 來回傳遞資料。
// =====================================================

const $ = (id) => document.getElementById(id);

let pickedFolderId = '';
let pickedFolderName = '';
let sandboxReady = false;

function showStatus(msg, ok) {
  const box = $('statusBox');
  box.textContent = msg;
  box.className = `status ${ok ? 'ok' : 'err'}`;
  setTimeout(() => { box.className = 'status'; }, 5000);
}

function sendBg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { ok: false, error: '沒有回應' });
    });
  });
}

async function loadSettings() {
  const s = await chrome.storage.sync.get([
    'driveEnabled', 'driveFolderId', 'driveFolderName', 'driveTags',
    'obsidianEnabled', 'obsidianVault', 'obsidianFolder', 'obsidianTags',
  ]);
  $('driveEnabled').checked = s.driveEnabled !== false;
  $('driveTags').value = s.driveTags || '';
  pickedFolderId = s.driveFolderId || '';
  pickedFolderName = s.driveFolderName || '';
  $('driveFolderLabel').textContent = pickedFolderName
    ? `📁 ${pickedFolderName}` : '尚未選擇資料夾';

  $('obsidianEnabled').checked = !!s.obsidianEnabled;
  $('obsidianVault').value = s.obsidianVault || '';
  $('obsidianFolder').value = s.obsidianFolder || '';
  $('obsidianTags').value = s.obsidianTags || '';

  refreshConnStatus();
}

async function refreshConnStatus() {
  const res = await sendBg({ type: 'CLIPVAULT_STATUS' });
  const el = $('driveConnStatus');
  if (res && res.connected) {
    el.textContent = '✅ 已連接 Google';
  } else if (res && res.reason === 'no_client_id') {
    el.textContent = '⚠️ 尚未設定 OAuth client_id（見 README）';
  } else {
    el.textContent = '尚未連接 Google';
  }
}

$('btnConnect').addEventListener('click', async () => {
  $('btnConnect').disabled = true;
  const res = await sendBg({ type: 'CLIPVAULT_CONNECT' });
  $('btnConnect').disabled = false;
  if (res && res.ok) showStatus('已連接 Google', true);
  else showStatus(`連接失敗：${(res && res.error) || '未知錯誤'}`, false);
  refreshConnStatus();
});

// ── 跟沙盒 iframe 溹通 ────────────────────────
// sandbox.html 跑在隢離環境，不能呼叫 chrome.*，所有資料都靠
// postMessage 來回傳遞。iframe 載入完成會主動送一個 READY 訊號，
// 避免我們在它還沒 load 完就送開啟指令而漏接。

let pendingPickerResolve = null;
let pendingPickerReject = null;

window.addEventListener('message', (ev) => {
  const msg = ev.data;
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'CV_SANDBOX_READY') {
    sandboxReady = true;
    return;
  }
  if (msg.type === 'CV_PICKER_RESULT') {
    pickedFolderId = msg.folderId;
    pickedFolderName = msg.folderName;
    $('driveFolderLabel').textContent = `📁 ${pickedFolderName}`;
    if (pendingPickerResolve) pendingPickerResolve();
    pendingPickerResolve = null;
    pendingPickerReject = null;
    return;
  }
  if (msg.type === 'CV_PICKER_CANCEL') {
    if (pendingPickerResolve) pendingPickerResolve(); // 使用者自己取消，不算錯誤
    pendingPickerResolve = null;
    pendingPickerReject = null;
    return;
  }
  if (msg.type === 'CV_PICKER_ERROR') {
    if (pendingPickerReject) pendingPickerReject(new Error(msg.error || '未知錯誤'));
    pendingPickerResolve = null;
    pendingPickerReject = null;
  }
});

function waitForSandbox(timeoutMs = 8000) {
  if (sandboxReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = setInterval(() => {
      if (sandboxReady) {
        clearInterval(check);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(check);
        reject(new Error('Picker 沙盒頁面沒有回應（檢查網路連線）'));
      }
    }, 100);
  });
}

function openPickerInSandbox(token, apiKey) {
  return new Promise((resolve, reject) => {
    pendingPickerResolve = resolve;
    pendingPickerReject = reject;
    const frame = $('pickerSandbox');
    frame.contentWindow.postMessage({ type: 'CV_OPEN_PICKER', token, apiKey }, '*');
  });
}

$('btnPickFolder').addEventListener('click', async () => {
  $('btnPickFolder').disabled = true;
  try {
    const manifest = chrome.runtime.getManifest();
    const apiKey = (manifest.x_config && manifest.x_config.picker_api_key) || '';
    if (!apiKey || apiKey.startsWith('REPLACE_ME')) {
      throw new Error('尚未設定 Google Picker API key（見 README 的「Google Picker 設定」）');
    }
    const tokenRes = await sendBg({ type: 'CLIPVAULT_GET_TOKEN' });
    if (!tokenRes || !tokenRes.ok) throw new Error(tokenRes && tokenRes.error);
    await waitForSandbox();
    await openPickerInSandbox(tokenRes.token, apiKey);
  } catch (e) {
    showStatus(`選擇資料夾失敗：${(e && e.message) || '未知錯誤'}`, false);
  } finally {
    $('btnPickFolder').disabled = false;
  }
});

// ── 儲存 ────────────────────────────────────────

$('btnSave').addEventListener('click', async () => {
  const obsidianEnabled = $('obsidianEnabled').checked;
  const obsidianVault = $('obsidianVault').value.trim();
  if (obsidianEnabled && !obsidianVault) {
    showStatus('啟用了 Obsidian 但沒有填 Vault 名稱', false);
    return;
  }
  const driveEnabled = $('driveEnabled').checked;
  if (driveEnabled && !pickedFolderId) {
    showStatus('啟用了 Google Drive 但還沒選資料夾', false);
    return;
  }

  await chrome.storage.sync.set({
    driveEnabled,
    driveFolderId: pickedFolderId,
    driveFolderName: pickedFolderName,
    driveTags: $('driveTags').value.trim(),
    obsidianEnabled,
    obsidianVault,
    obsidianFolder: $('obsidianFolder').value.trim(),
    obsidianTags: $('obsidianTags').value.trim(),
  });
  showStatus('設定已儲存', true);
});

loadSettings();
