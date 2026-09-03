// =====================================================
// Clip Vault — popup
// 只顯示現況，不放設定表單——設定都在 options.html，
// 兩邊各放一份遲早會分岐。
// =====================================================

async function render() {
  const s = await chrome.storage.sync.get([
    'driveEnabled', 'driveFolderId', 'obsidianEnabled', 'obsidianVault', 'localEnabled',
  ]);
  const driveOn = s.driveEnabled !== false && !!s.driveFolderId;
  const obsOn = !!s.obsidianEnabled && !!s.obsidianVault;
  const localOn = !!s.localEnabled;
  document.getElementById('driveDot').className = `dot ${driveOn ? 'on' : 'off'}`;
  document.getElementById('obsDot').className = `dot ${obsOn ? 'on' : 'off'}`;
  const localDot = document.getElementById('localDot');
  if (localDot) localDot.className = `dot ${localOn ? 'on' : 'off'}`;

  const { cvLog = [] } = await chrome.storage.local.get(['cvLog']);
  const box = document.getElementById('log');
  box.innerHTML = '';
  if (!cvLog.length) {
    box.innerHTML = '<div class="log-empty">還沒有收藏紀錄</div>';
    return;
  }
  for (const entry of cvLog.slice(0, 10)) {
    const div = document.createElement('div');
    div.className = `log-item ${entry.ok ? '' : 'fail'}`;
    const when = new Date(entry.time).toLocaleString('zh-TW', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    div.textContent = `${when}　${entry.msg}`;
    if (entry.docUrl) {
      div.appendChild(document.createTextNode(' '));
      const a = document.createElement('a');
      a.href = entry.docUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = '開啟 ↗';
      div.appendChild(a);
    }
    box.appendChild(div);
  }
}

function showDiag(text, type = 'ok') {
  const box = document.getElementById('diagBox');
  if (!box) return;
  box.style.display = 'block';
  box.className = `diag-box ${type}`;
  box.textContent = text;
}

document.getElementById('btnClearSeen').addEventListener('click', async () => {
  await chrome.storage.local.set({ cvSeen: {} });
  showDiag('✅ 去重紀錄已清空，之前收藏過的貼文與網頁可立即重新測試收藏。', 'ok');
});

document.getElementById('btnDiag').addEventListener('click', () => {
  showDiag('⏳ 正在診斷目前分頁…', 'ok');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      showDiag('❌ 找不到目前分頁', 'warn');
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { type: 'CLIPVAULT_DIAG' }, (res) => {
      if (chrome.runtime.lastError || !res) {
        showDiag('❌ 這個分頁沒有載入 Clip Vault（可能是 Chrome 系統頁，或請按 F5 重新整理網頁後再試一次）。', 'warn');
        return;
      }
      const lines = [
        `版本：${res.build || '?'}　平台：${res.label}`,
        `網址路徑：${res.path || '/'}`,
      ];

      if (res.platform === 'web') {
        const g = res.generic || {};
        lines.push(
          '模式：通用網頁模式',
          `選取文字：${g.hasSelection ? `有（${g.selectionLen} 字）` : '無'}`,
          `內文長度：約 ${g.textLen} 字`,
          `頁面圖片：${g.imagesCount} 張`,
          `按鈕時機：${res.triggerKey || 'alt'}`,
          res.enabled ? '✅ 收藏功能已開啟' : '⚠️ 收藏功能已停用',
        );
        showDiag(lines.join('\n'), 'ok');
        return;
      }

      const ok = res.posts > 0;
      lines.push(
        `貼文錨點：${res.selector || ''}`,
        `→ 偵測到 ${res.posts} 則貼文${ok ? '' : '　⚠️ 結構可能變更'}`,
        res.hasActive ? '目前鎖定：有' : '目前鎖定：無（按住 Alt 滑鼠指著貼文可喚出）',
        res.enabled ? '' : '⚠️ 收藏功能已停用',
      );

      if (!ok && res.probe) {
        lines.push('', '候選錨點命中數量：');
        for (const [name, n] of Object.entries(res.probe)) {
          lines.push(`  ${n > 0 ? '●' : '○'} ${name}：${n < 0 ? '不支援' : n}`);
        }
      }

      if (res.picks) {
        lines.push('', `視窗 ${res.viewport}，候選貼文狀態：`, ...res.picks);
      }

      if (!ok && res.sample) {
        lines.push('', '畫面中央結構取樣：', ...res.sample);
      }

      const m = res.media;
      if (m) {
        lines.push('', `圖片：DOM 裡 ${m.total} 個 <img>，判定收錄 ${m.taken} 張`);
        if (m.moreOverlay) {
          lines.push(`⭐️ 偵測到相簿「${m.moreOverlay}」疊圖（支援翻頁收圖）`);
        }
        lines.push(`/photo 連結：${m.photoLinks} 個　輪播下一頁鈕：${m.hasNext ? '有' : '無'}`);
        if (m.imgs && m.imgs.length) {
          lines.push(...m.imgs.slice(0, 8));
        }
      }

      showDiag(lines.filter(Boolean).join('\n'), ok ? 'ok' : 'warn');
    });
  });
});

document.getElementById('btnOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

render();
