// =====================================================
// Clip Vault — 通用網頁擷取層
//
// 5 個社群平台走 adapters.js／extract.js 的專用邏輯（沿用 PostSync
// 驗證過的錨點）。除此之外的任何網頁，走這裡：輕量版，不做像
// obsidian-clipper 官方那樣的完整可讀性演算法／模板系統，只做兩件事：
//   1. 使用者選取了文字 → 收選取範圍本身的內容
//   2. 沒有選取 → 收整頁裡「看起來像主文」的區塊（粗略啟發式，不保證每次都準）
//
// 這一層完全不碰 chrome.*、不碰網路，只吃 DOM、吐資料，跟
// extract.js 的分工原則一致：好測試、改壞了容易看出來。
// =====================================================

(function () {
  'use strict';

  const NOISE_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'NAV', 'FOOTER', 'HEADER',
    'FORM', 'BUTTON', 'INPUT', 'TEXTAREA', 'IFRAME', 'ASIDE',
  ]);

  function isHiddenEl(el) {
    if (!el || el === document.body) return false;
    try {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return true;
    } catch (_) { /* 取不到樣式就當作可視 */ }
    return isHiddenEl(el.parentElement);
  }

  const CLIPVAULT_UI_TEXT = /^⚡?\s*(收這篇|收藏|存進 Clip Vault)$/i;

  function fromSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;
    let text = sel.toString().trim();
    text = text
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => !CLIPVAULT_UI_TEXT.test(s))
      .join('\n')
      .trim();
    const range = sel.getRangeAt(0);
    const images = [];
    try {
      const container = range.commonAncestorContainer;
      const root = container.nodeType === 1 ? container : container.parentElement;
      if (root && root.querySelectorAll) {
        for (const img of root.querySelectorAll('img')) {
          const src = img.currentSrc || img.getAttribute('src') || '';
          if (/^https?:\/\//.test(src) && !images.includes(src)) images.push(src);
          if (images.length >= 10) break;
        }
      }
    } catch (_) { /* 選取範圍抱不到容器就算了，純文字仍然收得到 */ }
    return { text, images, source: 'selection' };
  }

  function mainCandidate() {
    const preferred = document.querySelector(
      'article, main, [role="main"], [itemprop="articleBody"]',
    );
    if (preferred) return preferred;

    let best = document.body;
    let bestScore = 0;
    const candidates = document.body.querySelectorAll('div, section');
    for (const el of candidates) {
      if (NOISE_TAGS.has(el.tagName)) continue;
      if (isHiddenEl(el)) continue;
      const pCount = el.querySelectorAll(':scope > p, :scope p').length;
      const textLen = (el.innerText || '').length;
      if (pCount < 2 && textLen < 400) continue;
      const score = textLen + pCount * 50;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function extractText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('.clipvault-btn, .clipvault-post-btn, .clipvault-toast')) return NodeFilter.FILTER_REJECT;
        if (NOISE_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (isHiddenEl(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const lines = [];
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (t && !CLIPVAULT_UI_TEXT.test(t)) lines.push(t);
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function extractImages(root, cap = 10) {
    const out = [];
    for (const img of root.querySelectorAll('img')) {
      if (isHiddenEl(img)) continue;
      const r = img.getBoundingClientRect();
      if (r.width < 150 || r.height < 150) continue;
      const src = img.currentSrc || img.getAttribute('src') || '';
      if (!/^https?:\/\//.test(src)) continue;
      if (!out.includes(src)) out.push(src);
      if (out.length >= cap) break;
    }
    return out;
  }

  function extractGeneric() {
    const picked = fromSelection();
    const usingSelection = !!picked;
    const root = usingSelection ? null : mainCandidate();
    const text = usingSelection ? picked.text : extractText(root);
    const images = usingSelection ? picked.images : extractImages(root);

    return {
      platform: 'web',
      platformLabel: '網頁',
      title: (document.title || '').trim().slice(0, 120) || '未命名網頁',
      text,
      author: '',
      timeText: '',
      permalink: location.href,
      images,
      authorGuessed: true,
      pageUrl: location.href,
      capturedAt: Date.now(),
      captureMode: usingSelection ? 'selection' : 'page',
    };
  }

  self.CLIP_VAULT_GENERIC = { extractGeneric, mainCandidate, extractText, extractImages };
})();
