// =====================================================
// Clip Vault — Content Script
//
// 社群平台（Facebook/Threads/X/Instagram/LinkedIn）沿用 PostSync
// 驗證過的貼文偵測邏輯（adapters.js + extract.js）。其他任何網頁
// 走通用擷取（generic-extract.js）：選取文字優先，沒選取就抓
// 「看起來像主文」的區塊。
//
// 這是輕量版：不做逐項診斷面板（平台改版時的候選錨點列表、DOM 取樣）
// ——夠用就好，社群那五個平台的貼文偵測、展開全文、IG 輪播多圖收集
// 這些穩健度都是從 PostSync 原封不動繼承過來的部分。
//
// 社群平台的收藏鈕直接嵌在每一則貼文右上角（跟 PostSync 一樣），
// 通用頁面則維持右下角單顆浮動按鈕（沒有「貼文清單」這個概念）。
//
// 觸發一律是人按的（貼文按鈕、浮動按鈕、右鍵選單、快速鍵），沒有任何
// 自動收集、也不會自己捲動頁面。
//
// 設定頁的「啟用收藏按鈕」開關可以整個關掉這支腳本的 UI（不解安裝），
// 存在 chrome.storage.sync 的 captureEnabled，跨分頁即時生效。
// =====================================================

(function () {
  'use strict';

  const NS = self.CLIP_VAULT;
  const EX = self.CLIP_VAULT_EXTRACT;
  const GEN = self.CLIP_VAULT_GENERIC;
  const ad = NS && NS.adapterFor(self.CLIP_VAULT_HOST || location.hostname);

  try {
    document.documentElement.dataset.clipVault = `${chrome.runtime.getManifest().version}/${ad ? ad.id : 'web'}`;
  } catch (_) { /* 版本讀不到就算了，不影響功能 */ }

  let posts = [];
  let active = null;
  let enabled = true;
  let triggerKey = 'alt'; // 'alt' | 'ctrl' | 'always'
  let isModifierActive = false;
  let hoveredPost = null;
  let lastMouseX = -1;
  let lastMouseY = -1;

  chrome.storage.sync.get(['captureEnabled', 'triggerKey'], (r) => {
    enabled = r.captureEnabled !== false;
    triggerKey = r.triggerKey || 'alt';
    if (!enabled) hideAllButtons();
    else updateVisibility();
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'sync') return;
    if (ch.triggerKey) {
      triggerKey = ch.triggerKey.newValue || 'alt';
      updateVisibility();
    }
    if (ch.captureEnabled) {
      enabled = ch.captureEnabled.newValue !== false;
      if (!enabled) {
        hideAllButtons();
      } else if (ad) {
        refreshPosts();
        schedule();
        updateVisibility();
      } else {
        position();
        updateVisibility();
      }
    }
  });

  function hideAllButtons() {
    for (const b of document.querySelectorAll('.clipvault-post-btn')) b.remove();
    if (btn) {
      btn.classList.remove('clipvault-show');
      btn.style.display = 'none';
    }
  }

  function findPostFromElement(target) {
    if (!target || !ad) return null;
    if (target.classList && target.classList.contains('clipvault-post-btn')) {
      return target.parentElement;
    }
    for (const p of posts) {
      if (p === target || p.contains(target)) return p;
    }
    const found = EX && EX.outermostOf ? EX.outermostOf(ad, target) : null;
    if (found && posts.includes(found)) return found;
    return found || null;
  }

  function updateVisibility() {
    if (!enabled) {
      if (btn) btn.classList.remove('clipvault-show');
      for (const b of document.querySelectorAll('.clipvault-post-btn.clipvault-show')) {
        b.classList.remove('clipvault-show');
      }
      return;
    }

    if (!ad) {
      // 通用頁面浮動按鈕
      if (btn) {
        const show = triggerKey === 'always' || isModifierActive;
        if (show) btn.classList.add('clipvault-show');
        else btn.classList.remove('clipvault-show');
      }
    } else {
      // 社群頁面貼文按鈕：滑鼠當前指著該貼文且按住鍵（或設為 always）時才顯示
      for (const post of posts) {
        const b = postButtons.get(post);
        if (!b) continue;
        const show = (triggerKey === 'always' && post === hoveredPost)
          || (isModifierActive && post === hoveredPost);
        if (show) b.classList.add('clipvault-show');
        else b.classList.remove('clipvault-show');
      }
    }
  }

  function refreshPosts() {
    if (!ad || !enabled) return;
    posts = EX.outermost(ad, document);
    syncPostButtons();
  }

  // ── 貼文自帶按鈕（社群頁面）──────────────
  // 每則偵測到的貼文右上角各嵌一顆小按鈕，跟著貼文本身捲動，
  // 不用像單顆浮動按鈕那樣算座標追蹤 active 貼文。

  const postButtons = new WeakMap();

  function ensurePostBtn(post) {
    let b = postButtons.get(post);
    if (b && document.contains(b)) return b;
    b = document.createElement('button');
    b.type = 'button';
    b.className = 'clipvault-post-btn';
    b.textContent = '⚡ 收這篇';
    b.title = '存進 Clip Vault';
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      capture(post);
    });
    if (getComputedStyle(post).position === 'static') {
      post.style.position = 'relative';
    }
    post.appendChild(b);
    postButtons.set(post, b);
    return b;
  }

  function syncPostButtons() {
    const live = new Set(posts);
    for (const post of posts) ensurePostBtn(post);
    for (const b of document.querySelectorAll('.clipvault-post-btn')) {
      const owner = b.parentElement;
      if (!owner || !live.has(owner)) b.remove();
    }
    updateVisibility();
  }

  function rejectReason(r) {
    if (r.height < 80) return '太矮';
    if (r.bottom < 60) return '在視窗上方';
    if (r.top > window.innerHeight - 40) return '在視窗下方';
    if (Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0) <= 0) return '不可見';
    return '';
  }

  function pickActive() {
    if (!ad) return;
    const mid = window.innerHeight / 2;
    let best = null;
    let bestScore = 0;
    for (const el of posts) {
      const r = el.getBoundingClientRect();
      if (rejectReason(r)) continue;
      const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      const score = (r.top <= mid && r.bottom >= mid) ? visible + 100000 : visible;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    setActive(best);
  }

  function setActive(el) {
    if (el === active) {
      position();
      return;
    }
    if (active) active.classList.remove('clipvault-active');
    active = el;
    if (active) active.classList.add('clipvault-active');
    position();
  }

  let btn = null;

  function ensureBtn() {
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'clipvault-btn';
    btn.textContent = '⚡ 收藏';
    btn.title = '存進 Clip Vault';
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (ad) capture(active);
      else captureGeneric();
    });
    document.body.appendChild(btn);
    return btn;
  }

  // 社群頁面改用貼文自帶按鈕（見 ensurePostBtn），這裡只剩通用頁面
  // 那顆右下角固定浮動按鈕要處理；ad 頁面完全不建立這顆按鈕。
  function position() {
    if (ad || !enabled) return;
    const b = ensureBtn();
    b.style.display = 'block';
    b.style.left = '';
    b.style.top = '';
    b.style.right = '18px';
    b.style.bottom = '18px';
    updateVisibility();
  }

  let ticking = false;
  function schedule() {
    if (!ad || !enabled || ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      pickActive();
    });
  }

  if (ad) {
    let listTimer = null;
    const mo = new MutationObserver(() => {
      clearTimeout(listTimer);
      listTimer = setTimeout(() => {
        refreshPosts();
        schedule();
      }, 400);
    });
    document.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('wheel', schedule, { passive: true });
    mo.observe(document.body, { childList: true, subtree: true });
    refreshPosts();
    schedule();
    [400, 1200, 2500, 5000].forEach((ms) => setTimeout(() => {
      refreshPosts();
      schedule();
    }, ms));
  } else {
    setTimeout(position, 300);
  }

  // ── Modifier 鍵與滑鼠懸停事件監聽 ──────────
  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  function getCurrentHoveredPost() {
    if (!ad) return null;
    if (lastMouseX >= 0 && lastMouseY >= 0) {
      const el = document.elementFromPoint(lastMouseX, lastMouseY);
      const p = findPostFromElement(el);
      if (p) return p;
    }
    try {
      const hovered = document.querySelectorAll(':hover');
      if (hovered.length) {
        for (let i = hovered.length - 1; i >= 0; i--) {
          const p = findPostFromElement(hovered[i]);
          if (p) return p;
        }
      }
    } catch (_) {}
    return null;
  }

  window.addEventListener('keydown', (ev) => {
    if (triggerKey === 'always' || !enabled) return;
    if (isTypingTarget(ev.target) && triggerKey === 'ctrl') return;

    let match = false;
    if (triggerKey === 'alt') match = ev.altKey || ev.key === 'Alt';
    else if (triggerKey === 'ctrl') match = ev.ctrlKey || ev.key === 'Control';

    if (match) {
      // 在 Windows 上單獨按 Alt 鍵會啟動瀏覽器選單並導致網頁失焦（blur）。
      // 阻止單鍵預設行為可防止焦點被搶走，確保後續再次按 Alt 依然能連續觸發。
      if (ev.key === 'Alt' || (triggerKey === 'ctrl' && ev.key === 'Control')) {
        ev.preventDefault();
      }

      if (!isModifierActive) {
        isModifierActive = true;
        if (ad) {
          hoveredPost = getCurrentHoveredPost();
        }
        updateVisibility();
      }
    }
  }, true);

  window.addEventListener('keyup', (ev) => {
    if (triggerKey === 'always' || !enabled) return;

    let released = false;
    if (triggerKey === 'alt') released = ev.key === 'Alt' || !ev.altKey;
    else if (triggerKey === 'ctrl') released = ev.key === 'Control' || !ev.ctrlKey;

    if (released) {
      if (ev.key === 'Alt' || (triggerKey === 'ctrl' && ev.key === 'Control')) {
        ev.preventDefault();
      }
      if (isModifierActive) {
        isModifierActive = false;
        updateVisibility();
      }
    }
  }, true);

  window.addEventListener('blur', () => {
    if (isModifierActive) {
      isModifierActive = false;
      updateVisibility();
    }
  });

  window.addEventListener('focus', () => {
    if (isModifierActive) {
      isModifierActive = false;
      updateVisibility();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isModifierActive) {
      isModifierActive = false;
      updateVisibility();
    }
  });

  document.addEventListener('mousemove', (ev) => {
    lastMouseX = ev.clientX;
    lastMouseY = ev.clientY;

    if (triggerKey !== 'always' && enabled) {
      const modDown = triggerKey === 'alt' ? ev.altKey : (triggerKey === 'ctrl' ? ev.ctrlKey : false);
      if (isModifierActive !== modDown) {
        isModifierActive = modDown;
        updateVisibility();
      }
    }

    if (!ad) return;
    const post = findPostFromElement(ev.target);
    if (post !== hoveredPost) {
      hoveredPost = post;
      if (isModifierActive || triggerKey === 'always') {
        updateVisibility();
      }
    }
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    if (hoveredPost) {
      hoveredPost = null;
      if (isModifierActive || triggerKey === 'always') {
        updateVisibility();
      }
    }
  });

  function labelOf(el) {
    return `${el.getAttribute('aria-label') || ''} ${(el.textContent || '')}`
      .replace(/\s+/g, ' ').trim();
  }

  function clickable(el, needSize = true) {
    if (el.closest('a[href]')) return false;
    if (el.tagName === 'A' && el.getAttribute('href')) return false;
    if (NS.MENU_DENY.test(labelOf(el))) return false;
    if (!needSize) return true;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }

  function moreButtons(root) {
    const collapsed = root.getBoundingClientRect().height < 4;
    const out = [];
    for (const el of root.querySelectorAll('[role="button"], button, span[dir="auto"]')) {
      const t = (el.textContent || '').trim();
      if (!t || t.length > 12) continue;
      if (!ad.more.test(t)) continue;
      if (!clickable(el, !collapsed)) continue;
      if (el.closest(ad.post) !== root) continue;
      out.push(el);
    }
    return out;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // 誤觸的最後一道防線：展開「查看更多」的過程裡按下去之後如果誕出
  // 對話框（檢舉、選單……），立刻用 Esc 收掉並停止展開，不要把那個
  // 畫面留在使用者面前。
  function dialogCount() {
    return document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length;
  }

  async function dismissDialog() {
    for (const target of [document.activeElement || document.body, document.body]) {
      target.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true,
      }));
    }
    await sleep(250);
  }

  async function expandAll(root) {
    const before = dialogCount();
    for (let i = 0; i < 3; i++) {
      const btns = moreButtons(root);
      if (!btns.length) return i;
      for (const b of btns) {
        b.click();
        await sleep(220);
        if (dialogCount() > before) {
          await dismissDialog();
          return i; // 按到不該按的東西就收手，剩下的展開不做了
        }
      }
      await sleep(300);
    }
    return 3;
  }

  // ── 輪播（IG 多圖貼文）────────────────────
  // IG 的多圖貼文一次只把當下那張放進 DOM，不翻過去只收得到第一張。
  // 這是「把使用者已經打開的這一則看完」，不是自動巡覽，所以只在按下
  // 收錄之後、只在這一則裡面走，而且有次數上限。

  // IG 的輪播箭頭只有滑鼠移上去才出現，沒有這一步翻頁鈕永遠找不到。
  function hover(el) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + Math.min(r.height / 2, 200);
    for (const type of ['pointerover', 'mouseover', 'pointermove', 'mousemove']) {
      const Ctor = type.startsWith('pointer') && self.PointerEvent ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, {
        bubbles: true, cancelable: true, clientX: x, clientY: y,
      }));
    }
  }

  function nextButton(root) {
    if (!ad.next) return null;
    for (const b of root.querySelectorAll('button, [role="button"]')) {
      const aria = (b.getAttribute('aria-label') || '').trim();
      const txt = (b.textContent || '').trim();
      if (!ad.next.test(aria) && !ad.next.test(txt)) continue;
      if (!clickable(b)) continue;
      return b;
    }
    return null;
  }

  // 剛翻過去的那一張常常還在載入，這時候去讀就會漏掉那張圖。
  async function waitImages(root, ms = 2000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const imgs = [...root.querySelectorAll('img')];
      if (imgs.length && imgs.every((i) => i.complete)) return;
      await sleep(150);
    }
  }

  async function collectCarousel(root) {
    await waitImages(root);
    const seen = new Set(EX.images(ad, root));
    if (!ad.next) return [...seen];

    let dry = 0;
    // 輪播上限抱 20 張，多留幾步當緩衝，但一定要有盡頭
    for (let i = 0; i < 24; i++) {
      if (!document.contains(root)) break; // 平台把整個節點換掉了
      hover(root);
      await sleep(120);
      const nbtn = nextButton(root);
      if (!nbtn) break;
      nbtn.click();
      await sleep(350);
      await waitImages(root);

      const before = seen.size;
      EX.images(ad, root).forEach((u) => seen.add(u));
      // 連續兩次沒有新圖才收手——只判一次的話，中間夹一張影片
      // （拿不到 img）會提早停，後面的照片全部漏掉。
      if (seen.size === before) {
        dry++;
        if (dry >= 2) break;
      } else {
        dry = 0;
      }
    }
    return [...seen];
  }

  let busy = false;

  async function capture(root, force) {
    if (busy) return;
    if (!enabled) {
      toast('❌ 收藏功能目前已停用，到設定頁重新開啟', null, 6000);
      return;
    }
    if (!root || !document.contains(root)) {
      toast('❌ 這一則已經不在畫面上了，捲一下再試', null, 5000);
      return;
    }
    busy = true;
    if (btn) btn.disabled = true;
    try {
      toast('⏳ 展開全文…', null, 0, true);
      await expandAll(root);
      const data = EX.extract(ad, root);
      if (!data.text || data.text.length < 5) {
        toast('❌ 抓不到這一則的內文（平台可能改版了）', null, 8000);
        return;
      }
      if (ad.next) {
        toast('⏳ 翻過輪播收圖…', null, 0, true);
        data.images = await collectCarousel(root);
      }
      await send(data, force);
    } catch (e) {
      toast(`❌ ${(e && e.message) || '未知錯誤'}`, null, 8000);
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  }

  async function captureGeneric(force) {
    if (busy) return;
    if (!enabled) {
      toast('❌ 收藏功能目前已停用，到設定頁重新開啟', null, 6000);
      return;
    }
    busy = true;
    if (btn) btn.disabled = true;
    try {
      const data = GEN.extractGeneric();
      if (!data.text || data.text.length < 5) {
        toast('❌ 抓不到內容——選取一段文字再按一次會比較準', null, 8000);
        return;
      }
      await send(data, force);
    } catch (e) {
      toast(`❌ ${(e && e.message) || '未知錯誤'}`, null, 8000);
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  }

  function extAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  const DEAD_MSG = '擴充剛剛更新過，這個分頁還連著舊版。按 Cmd+R（Windows 是 F5）重新整理這一頁就好。';

  function sendOne(data, force) {
    return new Promise((resolve) => {
      if (!extAlive()) return resolve({ ok: false, error: DEAD_MSG });
      const wd = setTimeout(() => resolve({ ok: false, error: '超過三分鐘沒有回應' }), 180000);
      chrome.runtime.sendMessage(
        { type: 'CLIPVAULT_CAPTURE', payload: data, force: !!force },
        (res) => {
          clearTimeout(wd);
          if (chrome.runtime.lastError) {
            return resolve({ ok: false, error: chrome.runtime.lastError.message });
          }
          resolve(res || { ok: false, error: '沒有回應' });
        },
      );
    });
  }

  function send(data, force) {
    return new Promise((resolve) => {
      toast(`⏳ 準備寫入…（${data.text.length.toLocaleString()} 字・${data.images.length} 張圖）`, null, 0, true);
      sendOne(data, force).then((res) => {
        if (res && res.dup) {
          dupToast(data, res.prev);
          return resolve();
        }
        if (res && res.ok) {
          toast(`✅ 已收錄\n${(res.bits || []).join('\n')}`, res.firstUrl, 6000);
        } else {
          toast(`❌ 寫入失敗：${(res && res.error) || '未知錯誤'}`, null, 10000);
        }
        resolve();
      });
    });
  }

  let lastRightClicked = null;
  let lastPoint = null;
  document.addEventListener('contextmenu', (ev) => {
    lastRightClicked = ev.target;
    lastPoint = { x: ev.clientX, y: ev.clientY };
  }, true);

  function postAtPoint(pt) {
    if (!pt || !ad) return null;
    refreshPosts();
    for (const el of posts) {
      const r = el.getBoundingClientRect();
      if (pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom) return el;
    }
    return null;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'CLIPVAULT_CONTEXT') {
      if (!enabled) {
        toast('❌ 收藏功能目前已停用，到設定頁重新開啟', null, 6000);
        return false;
      }
      if (ad) {
        const el = (lastRightClicked && EX.outermostOf(ad, lastRightClicked))
          || postAtPoint(lastPoint) || active;
        if (el) capture(el);
        else toast('❌ 認不出這是哪一則貼文，捲一下讓貼文完整進入畫面再試', null, 8000);
      } else {
        captureGeneric();
      }
      return false;
    }
    if (msg.type === 'CLIPVAULT_HOTKEY') {
      if (!enabled) return false;
      if (ad && active) capture(active);
      else if (!ad) captureGeneric();
      return false;
    }
    if (msg.type === 'CLIPVAULT_PROGRESS') {
      const span = statusEl && statusEl.querySelector('.clipvault-status-text');
      if (span) span.textContent = `⏳ ${msg.text}`;
      return false;
    }
    return false;
  });

  let statusEl = null;

  function toast(msg, url, autoHideMs, working) {
    if (statusEl) statusEl.remove();
    const el = document.createElement('div');
    el.className = 'clipvault-toast clipvault-status';
    statusEl = el;

    const span = document.createElement('span');
    span.className = 'clipvault-status-text';
    span.textContent = msg;
    el.appendChild(span);

    if (working) {
      el.classList.add('clipvault-busy');
      const bar = document.createElement('div');
      bar.className = 'clipvault-progress';
      bar.appendChild(document.createElement('i'));
      el.appendChild(bar);
    }

    if (url) {
      const a = document.createElement('a');
      a.className = 'clipvault-link';
      a.textContent = '開啟 ↗';
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      el.appendChild(a);
    }

    let timer = null;
    const close = () => {
      clearTimeout(timer);
      el.remove();
      if (statusEl === el) statusEl = null;
    };

    if (autoHideMs > 0) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'clipvault-close';
      x.textContent = '✕';
      x.addEventListener('click', close);
      el.appendChild(x);
      // 卡片本身穿透（pointer-events: none，見 toast.css），不能靠點它來
      // 關掉——那是刻意的：它常常蓋在頁面右下角，那裡剛好是留言框。
      // 用 mouseover／mouseout 而不是 mouseenter／mouseleave：卡片本身
      // 不收事件，只有連結／按鈕收得到，而那兩種事件會從子元素冒泡上來。
      const arm = () => { timer = setTimeout(close, autoHideMs); };
      el.addEventListener('mouseover', () => clearTimeout(timer));
      el.addEventListener('mouseout', arm);
      arm();
    }
    document.body.appendChild(el);
  }

  function dupToast(data, prev) {
    if (statusEl) statusEl.remove();
    const el = document.createElement('div');
    el.className = 'clipvault-toast clipvault-status';
    statusEl = el;

    const span = document.createElement('span');
    span.className = 'clipvault-status-text';
    span.textContent = `這篇已經收過了${prev && prev.when ? `（${prev.when}）` : ''}`;
    el.appendChild(span);

    if (prev && prev.docUrl) {
      const a = document.createElement('a');
      a.className = 'clipvault-link';
      a.textContent = `開啟已收的那份：${prev.docName || 'Doc'} ↗`;
      a.href = prev.docUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      el.appendChild(a);
    }

    const row = document.createElement('div');
    row.className = 'clipvault-actions';

    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'clipvault-mini clipvault-mini-primary';
    again.textContent = '仍要再收一次';
    again.addEventListener('click', () => {
      el.remove();
      statusEl = null;
      send(data, true);
    });

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'clipvault-mini';
    skip.textContent = '算了';
    skip.addEventListener('click', () => {
      el.remove();
      statusEl = null;
    });

    row.appendChild(again);
    row.appendChild(skip);
    el.appendChild(row);
    document.body.appendChild(el);
    setTimeout(() => {
      if (statusEl === el) { el.remove(); statusEl = null; }
    }, 20000);
  }
})();
