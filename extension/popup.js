// =====================================================
// Clip Vault — popup
// 只顯示現況，不放設定表單——設定都在 options.html，
// 兩邊各放一份遲早會分岐。
// =====================================================

async function render() {
  const s = await chrome.storage.sync.get([
    'driveEnabled', 'driveFolderId', 'obsidianEnabled', 'obsidianVault',
  ]);
  const driveOn = s.driveEnabled !== false && !!s.driveFolderId;
  const obsOn = !!s.obsidianEnabled && !!s.obsidianVault;
  document.getElementById('driveDot').className = `dot ${driveOn ? 'on' : 'off'}`;
  document.getElementById('obsDot').className = `dot ${obsOn ? 'on' : 'off'}`;

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

document.getElementById('btnOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

render();
