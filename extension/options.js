// =====================================================
// Clip Vault — 設定頁
//
// Google Picker 一定要在有 DOM 的頁面跑（service worker 沒有 window），
// 所以資料夾選擇器放在這裡；token 簽發還是統一交給 background.js，
// 避免兩個地方各自維護一份 OAuth 邏輯。
// =====================================================

const $ = (id) => document.getElementById(id);

let pickedFolderId = '';
let pickedFolderName = '';

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

// ── Google Picker ────────────────────────

let pickerLoaded = false;

function loadGapi() {
  return new Promise((resolve, reject) => {
    if (window.gapi) return resolve();
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google API 腳本載入失敗（檢查網路連線）'));
    document.head.appendChild(s);
  });
}

function loadPickerLib() {
  return new Promise((resolve, reject) => {
    if (pickerLoaded) return resolve();
    window.gapi.load('picker', {
      callback: () => { pickerLoaded = true; resolve(); },
      onerror: () => reject(new Error('Picker 元件載入失敗')),
    });
  });
}

function openPicker(token, apiKey) {
  const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setSelectFolderEnabled(true)
    .setIncludeFolders(true)
    .setMimeTypes('application/vnd.google-apps.folder');

  const picker = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(token)
    .setDeveloperKey(apiKey)
    .setTitle('選一個資料夾作為 Clip Vault 的目的地')
    .setCallback((data) => {
      if (data.action === google.picker.Action.PICKED) {
        const doc = data.docs && data.docs[0];
        if (doc) {
          pickedFolderId = doc.id;
          pickedFolderName = doc.name;
          $('driveFolderLabel').textContent = `📁 ${pickedFolderName}`;
        }
      }
    })
    .build();
  picker.setVisible(true);
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
    await loadGapi();
    await loadPickerLib();
    openPicker(tokenRes.token, apiKey);
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
