// =====================================================
// Clip Vault — 設定頁
//
// Google Picker 在 MV3 擴充功能裡跑不起來（沙盒頁面是 null-origin，
// Google 的伺服器會用 CORS 擋掉；一般擴充頁面又不能載入遠端腳本），
// 這是 Google 自己都還沒解的限制，Chromium 開發者社群的官方建議是
// 「另外架一個有真實網址的網頁」——這裡選擇不這麼做，改成讓使用者
// 直接填路徑字串，由 background.js 逐層搜尋／自動建立資料夾。
// =====================================================

const $ = (id) => document.getElementById(id);

let resolvedFolderId = '';
let resolvedFolderPath = '';

function showStatus(msg, ok) {
  const box = $('statusBox');
  box.textContent = msg;
  box.className = `status ${ok ? 'ok' : 'err'}`;
  setTimeout(() => { box.className = 'status'; }, 6000);
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
    'captureEnabled',
    'driveEnabled', 'driveFolderId', 'driveFolderPath', 'driveTags',
    'obsidianEnabled', 'obsidianVault', 'obsidianFolder', 'obsidianTags',
    'localEnabled', 'localFolder', 'localTags',
  ]);
  $('captureEnabled').checked = s.captureEnabled !== false;
  $('driveEnabled').checked = s.driveEnabled !== false;
  $('driveTags').value = s.driveTags || '';
  $('driveFolderPath').value = s.driveFolderPath || '';
  resolvedFolderId = s.driveFolderId || '';
  resolvedFolderPath = s.driveFolderPath || '';
  $('driveFolderLabel').textContent = resolvedFolderId
    ? `📁 My Drive/${resolvedFolderPath || '（根目錄）'}` : '尚未確認路徑';

  $('obsidianEnabled').checked = !!s.obsidianEnabled;
  $('obsidianVault').value = s.obsidianVault || '';
  $('obsidianFolder').value = s.obsidianFolder || '';
  $('obsidianTags').value = s.obsidianTags || '';

  $('localEnabled').checked = !!s.localEnabled;
  $('localFolder').value = s.localFolder || 'ClipVault';
  $('localTags').value = s.localTags || '';

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

$('btnResolvePath').addEventListener('click', async () => {
  $('btnResolvePath').disabled = true;
  const path = $('driveFolderPath').value.trim();
  try {
    showStatus('處理中…（找不到的資料夾層會自動建立）', true);
    const res = await sendBg({ type: 'CLIPVAULT_RESOLVE_FOLDER', path });
    if (!res || !res.ok) throw new Error((res && res.error) || '未知錯誤');
    resolvedFolderId = res.folderId;
    resolvedFolderPath = path;
    $('driveFolderLabel').textContent = `📁 My Drive/${path || '（根目錄）'}`;
    showStatus(res.createdSegments && res.createdSegments.length
      ? `已建立：${res.createdSegments.join(' → ')}`
      : '路徑已存在，直接沒用', true);
  } catch (e) {
    showStatus(`路徑處理失敗：${(e && e.message) || '未知錯誤'}`, false);
  } finally {
    $('btnResolvePath').disabled = false;
  }
});

// ── 儲存 ────────────────

$('btnSave').addEventListener('click', async () => {
  const obsidianEnabled = $('obsidianEnabled').checked;
  const obsidianVault = $('obsidianVault').value.trim();
  if (obsidianEnabled && !obsidianVault) {
    showStatus('啟用了 Obsidian 但沒有填 Vault 名稱', false);
    return;
  }
  const driveEnabled = $('driveEnabled').checked;
  if (driveEnabled && !resolvedFolderId) {
    showStatus('啟用了 Google Drive 但還沒按「確認／建立路徑」', false);
    return;
  }

  await chrome.storage.sync.set({
    captureEnabled: $('captureEnabled').checked,
    driveEnabled,
    driveFolderId: resolvedFolderId,
    driveFolderPath: resolvedFolderPath,
    driveTags: $('driveTags').value.trim(),
    obsidianEnabled,
    obsidianVault,
    obsidianFolder: $('obsidianFolder').value.trim(),
    obsidianTags: $('obsidianTags').value.trim(),
    localEnabled: $('localEnabled').checked,
    localFolder: $('localFolder').value.trim() || 'ClipVault',
    localTags: $('localTags').value.trim(),
  });
  showStatus('設定已儲存', true);
});

loadSettings();
