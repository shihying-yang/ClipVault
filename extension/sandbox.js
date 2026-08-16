// =====================================================
// Clip Vault — Picker 沙盒頁面邏輯
//
// 跑在隢離的 null-origin 環境裡，沒有 chrome.* API。
// 跟 options.html 之間全部靠 window.postMessage 溹通：
//   收到 { type: 'CV_OPEN_PICKER', token, apiKey } → 開 Picker
//   選完送出 { type: 'CV_PICKER_RESULT', folderId, folderName }
//   失敗送出 { type: 'CV_PICKER_ERROR', error }
//   使用者按取消送出 { type: 'CV_PICKER_CANCEL' }
// =====================================================

let pickerLoaded = false;

function loadPickerLib() {
  return new Promise((resolve, reject) => {
    if (pickerLoaded) return resolve();
    if (!window.gapi) {
      reject(new Error('Google API 腳本還沒載入完成，稍等一下再試'));
      return;
    }
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
          window.parent.postMessage(
            { type: 'CV_PICKER_RESULT', folderId: doc.id, folderName: doc.name },
            '*',
          );
        }
      } else if (data.action === google.picker.Action.CANCEL) {
        window.parent.postMessage({ type: 'CV_PICKER_CANCEL' }, '*');
      }
    })
    .build();
  picker.setVisible(true);
}

window.addEventListener('message', async (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'CV_OPEN_PICKER') return;
  try {
    await loadPickerLib();
    openPicker(msg.token, msg.apiKey);
  } catch (e) {
    window.parent.postMessage(
      { type: 'CV_PICKER_ERROR', error: (e && e.message) || '未知錯誤' },
      '*',
    );
  }
});

// 告訴 options.html 這個沙盒頁面已經準備好收訊息了，
// 避免 options.html 在 iframe 還沒 load 完就送 CV_OPEN_PICKER 而漏接。
window.parent.postMessage({ type: 'CV_SANDBOX_READY' }, '*');
