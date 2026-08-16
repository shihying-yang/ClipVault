// =====================================================
// Clip Vault — 抽取層
//
// 從 content.js 抽出來的原因只有一個：這是整支擴充最會壞的地方。
// 臉書一改版就可能整組錨點落空，而「抓到半篇」不會有任何錯誤訊息，
// 要三個月後翻到那篇才發現。抽成純函式才測得到（tests/run.html）。
//
// 這一層完全不碰 chrome.*、不碰網路，只吃 DOM、吐資料。
// =====================================================

(function () {
  'use strict';

  const NS = self.CLIP_VAULT;

  function fromAnchor(ad, root) {
    const cfg = ad.postAnchor;
    const found = [];
    for (const seed of (root || document).querySelectorAll(cfg.seed)) {
      let cur = seed.parentElement;
      for (let up = 0; cur && up < (cfg.maxUp || 12); up++) {
        const ok = (cfg.needs || []).every((sel) => cur.querySelector(sel))
          && cur.getBoundingClientRect().height >= (cfg.minHeight || 0);
        if (ok) break;
        cur = cur.parentElement;
      }
      if (cur && cur !== document.body && !found.includes(cur)) found.push(cur);
    }
    return found;
  }

  function keep(ad, list) {
    let all = list;
    if (ad.postTest) {
      all = all.filter((el) => {
        try {
          return ad.postTest(el);
        } catch (_) {
          return false;
        }
      });
    }
    return all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
  }

  function mergePosts(bySeed, byAttr) {
    const out = [...bySeed];
    for (const el of byAttr) {
      if (out.includes(el)) continue;
      if (bySeed.some((s) => el.contains(s))) continue;
      out.push(el);
    }
    return out;
  }

  function outermost(ad, root) {
    const byAttr = keep(ad, [...(root || document).querySelectorAll(ad.post)]);
    if (!ad.postAnchor) return byAttr;
    const bySeed = keep(ad, fromAnchor(ad, root));
    outermost.lastCounts = { seed: bySeed.length, attr: byAttr.length };
    return mergePosts(bySeed, byAttr);
  }

  function outermostOf(ad, el) {
    let found = null;
    let cur = el;
    while (cur && cur.nodeType === 1) {
      if (cur.matches && cur.matches(ad.post)) found = cur;
      cur = cur.parentElement;
    }
    return found;
  }

  function ownedBy(ad, node, root) {
    const p = node.parentElement;
    if (!p) return false;
    const owner = p.closest(ad.post);
    return !owner || owner === root;
  }

  const BASE_EXCLUDE = '[contenteditable="true"], textarea, input, script, style, svg,'
    + ' .clipvault-btn, .clipvault-toast, [role="menu"], [role="menuitem"],'
    + ' [role="tablist"], [role="progressbar"], [aria-hidden="true"]';

  const INVISIBLE = /[­͏​-‏⁠-⁤⁪-⁯﻿]/g;

  function clean(s) {
    return String(s).replace(INVISIBLE, '').replace(/ /g, ' ').trim();
  }

  function hiddenChecker() {
    const cache = new Map();
    return function hidden(el) {
      if (!el || el === document.body) return false;
      if (cache.has(el)) return cache.get(el);
      let v = false;
      try {
        const cs = getComputedStyle(el);
        v = cs.display === 'none'
          || cs.visibility === 'hidden'
          || cs.opacity === '0'
          || parseFloat(cs.fontSize) === 0;
      } catch (_) { v = false; }
      if (!v) v = hidden(el.parentElement);
      cache.set(el, v);
      return v;
    };
  }

  function readable(ad, root, owner) {
    const EXCLUDE = ad.exclude ? `${BASE_EXCLUDE}, ${ad.exclude}` : BASE_EXCLUDE;
    const isHidden = hiddenChecker();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || p.closest(EXCLUDE)) return NodeFilter.FILTER_REJECT;
        if (!ownedBy(ad, node, owner)) return NodeFilter.FILTER_REJECT;
        if (isHidden(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const out = [];
    let n;
    while ((n = walker.nextNode())) {
      const t = clean(n.nodeValue);
      if (!t) continue;
      if (NS.ACTION_WORDS.test(t)) continue;
      out.push(t);
    }
    return out;
  }

  function postText(ad, root) {
    let lines = [];
    if (ad.text) {
      const holders = [...root.querySelectorAll(ad.text)]
        .filter((h) => ownedBy(ad, h, root));
      for (const h of holders) lines.push(...readable(ad, h, root));
    }
    if (lines.join('').trim().length < 8) lines = readable(ad, root, root);

    let text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    if (text.length < 15) {
      text = (root.innerText || '')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s && !NS.ACTION_WORDS.test(s))
        .join('\n')
        .trim();
    }
    return text;
  }

  function firstText(ad, root, sel) {
    if (!sel) return '';
    for (const el of root.querySelectorAll(sel)) {
      if (!ownedBy(ad, el, root)) continue;
      const t = clean(readable(ad, el, root).join(' ').replace(/\s+/g, ' '));
      if (t) return t.slice(0, 80);
    }
    return '';
  }

  const TIME_LIKE = /(\d+\s*(分鐘|分|小時|時|天|週|周|月|年|min|mins|h|hr|hrs|d|w|y))|(\d{1,2}\s*月\s*\d{1,2}\s*日)|(\d{4}[-/]\d{1,2}[-/]\d{1,2})|(昨天|前天|剛剛|Just now|Yesterday)|([A-Z][a-z]{2}\s+\d{1,2})/;

  function timeText(ad, root) {
    const raw = firstText(ad, root, ad.time);
    if (!raw || raw.length > 24) return '';
    return TIME_LIKE.test(raw) ? raw : '';
  }

  const NAME_NOISE = /(已驗證帳號|已驗證|Verified|追蹤中|追蹤|Following|Follow|粉絲專頁|Page|贊助|Sponsored|分享對象[：:][^・·•]*|Shared with[^・·•]*)/g;

  function cleanAuthor(s) {
    const parts = clean(s).split(/[・·•|｜]/);
    for (const raw of parts) {
      const v = raw.replace(NAME_NOISE, '').replace(/\s+/g, ' ').trim();
      if (!v) continue;
      if (TIME_LIKE.test(v)) continue;
      if (v.length > 40) continue;
      return v.slice(0, 60);
    }
    return '';
  }

  const JUNK_PARAMS = ['__tn__', 'ref', 'refid', 'comment_id', 'fbclid', 'rdid', 's', 't', 'igsh', 'img_index'];

  function permalink(ad, root, origin) {
    if (!ad.permalink) return ad.id === 'linkedin' ? NS.linkedinPermalink(root) : '';
    for (const a of root.querySelectorAll(ad.permalink)) {
      if (!ownedBy(ad, a, root)) continue;
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#')) continue;
      try {
        const u = new URL(href, origin || location.origin);
        JUNK_PARAMS.forEach((k) => u.searchParams.delete(k));
        [...u.searchParams.keys()]
          .filter((k) => k.startsWith('__cft__'))
          .forEach((k) => u.searchParams.delete(k));
        return u.toString();
      } catch (_) { /* 組不起來就換下一個 */ }
    }
    if (ad.id === 'linkedin') return NS.linkedinPermalink(root);
    return '';
  }

  const AVATAR_ALT = /profile picture|大頭貼|大头像|个人资料照片|プロフィール写真|avatar/i;

  function images(ad, root, cap = 20) {
    const out = [];
    for (const img of root.querySelectorAll('img')) {
      if (!ownedBy(ad, img, root)) continue;
      if (AVATAR_ALT.test(img.getAttribute('alt') || '')) continue;
      if (img.closest('header')) continue;

      const r = img.getBoundingClientRect();
      const laidOut = r.width > 0 && r.height > 0;
      const w = laidOut ? r.width : (img.naturalWidth || 0);
      const h = laidOut ? r.height : (img.naturalHeight || 0);
      if (w < 120 || h < 120) continue;

      const src = img.currentSrc || img.getAttribute('src') || '';
      if (!/^https?:\/\//.test(src)) continue;
      if (!out.includes(src)) out.push(src);
      if (out.length >= cap) break;
    }
    return out;
  }

  function extract(ad, root) {
    const text = postText(ad, root);

    let author = '';
    if (ad.authorFrom) {
      try { author = cleanAuthor(ad.authorFrom(root) || ''); } catch (_) { author = ''; }
    }
    const bySelector = author ? '' : cleanAuthor(firstText(ad, root, ad.author));
    if (!author) author = bySelector;
    const guessed = !author;

    if (!author) {
      const first = cleanAuthor(readable(ad, root, root)[0] || '');
      if (first && first.length <= 40) author = first;
    }

    const link = permalink(ad, root);

    return {
      platform: ad.id,
      platformLabel: ad.label,
      text,
      author,
      timeText: timeText(ad, root),
      permalink: link,
      images: images(ad, root),
      authorGuessed: guessed,
      pageUrl: location.href,
      capturedAt: Date.now(),
    };
  }

  self.CLIP_VAULT_EXTRACT = {
    outermost, outermostOf, ownedBy, readable, clean, cleanAuthor,
    postText, firstText, timeText, permalink, images, extract,
  };
})();
