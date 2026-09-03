// =====================================================
// Clip Vault — 擷取層
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
    + ' .clipvault-btn, .clipvault-post-btn, .clipvault-toast, [role="menu"], [role="menuitem"],'
    + ' [role="tablist"], [role="progressbar"], [aria-hidden="true"]';

  const INVISIBLE = /[\u00AD\u034F\u200B-\u200F\u2060-\u2064\u206A-\u206F\uFEFF]/g;

  function clean(s) {
    return String(s).replace(INVISIBLE, '').replace(/\u00A0/g, ' ').trim();
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

  const CLIPVAULT_UI_TEXT = /^⚡?\s*(收這篇|收藏|存進 Clip Vault)$/i;

  function isJunkLine(ad, s) {
    if (!s) return true;
    if (CLIPVAULT_UI_TEXT.test(s)) return true;
    if (NS.ACTION_WORDS.test(s)) return true;
    if (ad && ad.id === 'facebook' && /^facebook$/i.test(s)) return true;
    if (/^[a-zA-Z]$/.test(s)) return true;
    return false;
  }

  function postText(ad, root) {
    let lines = [];
    if (ad.text) {
      const holders = [...root.querySelectorAll(ad.text)]
        .filter((h) => ownedBy(ad, h, root));
      for (const h of holders) lines.push(...readable(ad, h, root));
    }
    if (lines.join('').trim().length < 8) lines = readable(ad, root, root);

    lines = lines.filter((s) => !isJunkLine(ad, s));
    let text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    if (text.length < 15) {
      text = (root.innerText || '')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s && !isJunkLine(ad, s))
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
      if (v.toLowerCase() === 'facebook') continue;
      if (TIME_LIKE.test(v)) continue;
      if (v.length > 40) continue;
      return v.slice(0, 60);
    }
    return '';
  }

  const JUNK_PARAMS = ['__tn__', 'ref', 'refid', 'comment_id', 'fbclid', 'rdid', 's', 't', 'igsh', 'img_index', 'mibextid'];

  function isStandalonePost(ad, rawUrl) {
    try {
      const u = new URL(rawUrl);
      const path = u.pathname || '';
      const search = u.search || '';
      if (ad.id === 'facebook') {
        return /(\/posts\/|\/permalink\/|\/share\/[pv]\/|\/photos?\/|\/reel\/)/i.test(path)
          || (path.includes('story.php') && search.includes('story_fbid='));
      }
      if (ad.id === 'x') return /\/status\/\d+/i.test(path);
      if (ad.id === 'threads') return /\/post\/[A-Za-z0-9_-]+/i.test(path);
      if (ad.id === 'instagram') return /\/(p|reel)\/[A-Za-z0-9_-]+/i.test(path);
      if (ad.id === 'linkedin') return /(\/feed\/update\/|\/posts\/)/i.test(path);
    } catch (_) {}
    return false;
  }

  function cleanPostUrl(rawUrl, base) {
    try {
      const u = new URL(rawUrl, base || location.origin);
      JUNK_PARAMS.forEach((k) => u.searchParams.delete(k));
      [...u.searchParams.keys()]
        .filter((k) => k.startsWith('__cft__') || k.startsWith('mibextid') || k.startsWith('rdid'))
        .forEach((k) => u.searchParams.delete(k));
      u.hash = '';
      return u.toString();
    } catch (_) {
      return '';
    }
  }

  function permalink(ad, root, origin) {
    if (!ad.permalink) return ad.id === 'linkedin' ? NS.linkedinPermalink(root) : '';
    for (const a of root.querySelectorAll(ad.permalink)) {
      if (!ownedBy(ad, a, root)) continue;
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#')) continue;
      const cleaned = cleanPostUrl(href, origin);
      if (cleaned) return cleaned;
    }
    if (ad.id === 'linkedin') return NS.linkedinPermalink(root);

    // 後備：若貼文內部找不到連向自身的超連結，但當前分頁網址本身就是貼文獨立網址
    try {
      const cur = origin || location.href;
      if (isStandalonePost(ad, cur)) {
        const cleaned = cleanPostUrl(cur);
        if (cleaned) return cleaned;
      }
    } catch (_) {}

    return '';
  }

  const AVATAR_ALT = /profile picture|大頭貼|大头像|个人资料照片|プロフィール写真|avatar/i;

  // 一張圖收不收，理由是什麼。診斷與實際過濾走同一個函式
  function imageVerdict(ad, img, root) {
    if (!ownedBy(ad, img, root)) return '留言區的圖';
    if (AVATAR_ALT.test(img.getAttribute('alt') || '')) return '頭像（alt）';
    if (img.closest('header')) return '頭像（在 header 裡）';

    const r = img.getBoundingClientRect();
    const laidOut = r.width > 0 && r.height > 0;
    // 輪播裡還沒捲到的那幾張，版面寬高是 0，但 natural 尺寸是真的。
    // 只看 rect 的話會把它們整批丟掉。反過來說，有版面而且很小的
    // （40px 頭像、18px reaction icon）就是真的小，不能拿 natural 放行。
    const w = laidOut ? r.width : (img.naturalWidth || 0);
    const h = laidOut ? r.height : (img.naturalHeight || 0);
    if (w < 120 || h < 120) return `太小（${Math.round(w)}×${Math.round(h)}）`;

    const src = img.currentSrc || img.getAttribute('src') || '';
    if (!/^https?:\/\//.test(src)) return '不是 http(s) 網址';
    return ''; // 空字串＝要收
  }

  function images(ad, root, cap = 20) {
    const out = [];
    for (const img of root.querySelectorAll('img')) {
      if (imageVerdict(ad, img, root)) continue;
      const src = img.currentSrc || img.getAttribute('src') || '';
      if (!out.includes(src)) out.push(src);
      if (out.length >= cap) break;
    }
    return out;
  }

  // 相簿型貼文的指紋：「+7」那種疊圖。看到它就代表還有幾張圖根本不在 DOM 裡
  function albumOverlay(root) {
    return [...root.querySelectorAll('span, div')]
      .find((e) => e.childElementCount === 0
        && /^\+\s?\d+$/.test((e.textContent || '').trim())) || null;
  }

  function isAlbum(root) {
    return !!albumOverlay(root) && !!root.querySelector('a[href*="/photo"]');
  }

  // 點「+7」那一張最省事：它直接開到相簿，不用先翻過前面幾張
  function albumOpener(root) {
    const ov = albumOverlay(root);
    return (ov && ov.closest('a[href*="/photo"]'))
      || root.querySelector('a[href*="/photo"]');
  }

  function imageReport(ad, root) {
    const imgs = [...root.querySelectorAll('img')];
    const rows = imgs.slice(0, 16).map((img) => {
      const r = img.getBoundingClientRect();
      const why = imageVerdict(ad, img, root) || '✅ 收';
      const alt = (img.getAttribute('alt') || '').replace(/\s+/g, ' ').slice(0, 14);
      return `  ${Math.round(r.width)}×${Math.round(r.height)}`
        + ` nat ${img.naturalWidth}×${img.naturalHeight}`
        + (img.complete ? '' : ' [載入中]')
        + (alt ? ` alt="${alt}"` : '')
        + ` → ${why}`;
    });
    const photoLinks = root.querySelectorAll('a[href*="/photo"]').length;
    const ov = albumOverlay(root);
    const moreOverlay = ov ? (ov.textContent || '').trim() : '';
    return {
      total: imgs.length,
      taken: images(ad, root).length,
      photoLinks,
      moreOverlay,
      rows,
    };
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
    postText, firstText, timeText, permalink, images, imageVerdict,
    albumOverlay, isAlbum, albumOpener, imageReport, extract,
  };
})();
