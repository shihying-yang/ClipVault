// =====================================================
// Clip Vault — 平台轉接器
//
// 一個平台一組錨點。臉書那類 class name 是亂數（x1i10hfl 每次發版都會變），
// 拿來當選擇器等於保證下次改版就壞，所以這裡一律只認結構性錨點：
role、data-testid、href 樣式、標題階層。
//
// 每個 adapter 的欄位：
//   id / label   識別字與顯示名
//   hosts        比對 location.hostname
//   post         貼文容器（巢狀命中由 content.js 取最外層）
//   text         內文容器（可省略，省略就讀整個 post）
//   author       作者
//   permalink    這則貼文自己的網址（通常掛在時間戳上）
//   time         時間文字
//   more         「查看更多」按鈕的文字樣式
//   exclude      額外要排除的區塊（互動列、留言框…）
// =====================================================

// 介面上的按鈕字，各平台幾乎一樣，一律不算內文。
// 特別注意展開／收合這一組：「查看更多」按下去之後標籤會變成「顯示較少」
// 留在 DOM 裡，所以「展開全文」這個動作反而讓它更容易混進內文。
const ACTION_WORDS = new RegExp(`^(${[
  // 互動列
  '讚', '說讚', '大心', '哈', '嗹', '怒', '留言', '分享', '轉發', '回覆', '檢視',
  '追蹤', '已追蹤', '追蹤中', '加入', '傳送',
  'Like', 'Comment', 'Share', 'Reply', 'Repost', 'Retweet', 'View', 'Follow', 'Send',
  // 展開／收合
  '查看更多', '顯示更多', '見更多', '更多', '顯示較少', '較少', '收合', '隱藏',
  '全部顯示', '查看全部', '查看更多留言', '查看先前的留言',
  'See more', 'See less', 'Show more', 'Show less', 'View more', 'View all',
  // 翻譯
  '翻譯', '查看翻譯', '已翻譯', '顯示原文', '查看原文',
  'Translate', 'See translation', 'See original',
  // 其他殻字
  '所有心情', '最相關', '最新', '已編輯', '贊助', '已贊助', 'Sponsored', 'Edited',
].join('|')})$`, 'i');

// 臉書貼文的永久連結長相。permalink 抽取與「這是不是一則貼文」的判定
// 共用同一份，兩邊各寫一份遲早會分岔。
const FB_PERMALINK = 'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="],'
  + ' a[href*="/share/p/"], a[href*="/share/v/"], a[href*="/videos/"],'
  + ' a[href*="/photo/"], a[href*="/photos/"], a[href*="/reel/"]';

// 絕對不能按的按鈕。程式會去按「查看更多」把全文展開，而選單鈕、檢舉、
// 追蹤這些東西的標籤常常也含有「更多」——IG 的「⋯」按鈕裡有一個
// <title>更多選項</title>，SVG 的 title 會被算進 textContent，
// 於是「展開全文」變成幫使用者按下檢舉選單。
// 這種誤按是會造成真實後果的（取消追蹤、檢舉別人），寧可少展開也不能按錯。
const MENU_DENY = /選項|選單|options?|menu|檢舉|report|封鎖|block|取消追蹤|unfollow|追蹤|follow|分享|share|設定|settings|傳送|send|複製|copy|刪除|delete|編輯|edit|收藏|save/i;

self.CLIP_VAULT = {
  ACTION_WORDS,
  MENU_DENY,

  ADAPTERS: [
    {
      id: 'facebook',
      label: 'Facebook',
      hosts: /(^|\.)facebook\.com$/,
      post: '[role="article"], div[aria-labelledby], div[aria-posinset]',
      postTest: (el) => {
        const wrapsAnother = el.querySelector(
          ':scope div[aria-labelledby] [data-ad-preview="message"],'
          + ' :scope div[aria-posinset] [data-ad-preview="message"],'
          + ' :scope div[aria-posinset] [aria-posinset],'
          + ' :scope div[aria-posinset] a[href*="/posts/"]',
        );
        if (wrapsAnother) return false;
        if (el.matches('[role="article"]')) return true;
        if (el.querySelector('[data-ad-preview="message"]')) return true;
        return el.hasAttribute('aria-posinset') && !!el.querySelector(FB_PERMALINK);
      },
      postAnchor: {
        seed: '[data-ad-preview="message"]',
        needs: ['a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="], a[href*="/share/"]'],
        maxUp: 25,
        minHeight: 120,
      },
      text: '[data-ad-preview="message"]',
      authorFrom: (el) => {
        const ids = el.getAttribute('aria-labelledby');
        if (!ids) return '';
        const first = ids.trim().split(/\s+/)[0];
        const n = first && document.getElementById(first);
        return n ? (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      },
      author: 'h2 a[role="link"], h3 a[role="link"], h4 a[role="link"], h2 strong, h3 strong, span > h2 a, span > h3 a',
      permalink: FB_PERMALINK,
      time: 'a[href*="/posts/"] span, a[href*="permalink"] span, abbr',
      more: /^(查看更多|顯示更多|見更多|…\s*更多|全文|See more|Voir plus)$/i,
      exclude: '[role="toolbar"], form, [aria-label*="留言"], [aria-label*="Comment"], [data-visualcompletion="ignore"]',
    },
    {
      id: 'threads',
      label: 'Threads',
      hosts: /(^|\.)threads\.(net|com)$/,
      post: '[data-pressable-container="true"], article',
      text: null,
      author: 'a[href^="/@"]',
      permalink: 'a[href*="/post/"]',
      time: 'time',
      more: /^(更多|More|顯示更多|Show more)$/i,
      exclude: '[role="toolbar"], form',
    },
    {
      id: 'x',
      label: 'X',
      hosts: /(^|\.)(x\.com|twitter\.com)$/,
      post: 'article[data-testid="tweet"]',
      text: '[data-testid="tweetText"]',
      author: '[data-testid="User-Name"] a[role="link"], [data-testid="User-Name"]',
      permalink: 'a[href*="/status/"]',
      time: 'time',
      more: /^(Show more|顯示更多)$/i,
      exclude: '[role="group"], [data-testid="card.wrapper"]',
    },
    {
      id: 'instagram',
      label: 'Instagram',
      hosts: /(^|\.)instagram\.com$/,
      post: 'article',
      postAnchor: {
        seed: 'a[href*="/p/"], a[href*="/reel/"]',
        needs: ['time', 'img'],
        maxUp: 12,
        minHeight: 200,
      },
      text: 'h1, ul li span[dir="auto"]',
      author: 'a[href^="/"][role="link"] span, header a',
      permalink: 'a[href*="/p/"], a[href*="/reel/"]',
      time: 'time',
      more: /^(更多|more|較多|展開)$/i,
      next: /^(下一張|下一個|下一頁|Next|Go forward)$/i,
      exclude: '[role="button"][tabindex], section > div > button',
      probes: {
        'article 標籤': 'article',
        '貼文連結 a[href*=/p/]': 'a[href*="/p/"]',
        'Reel 連結': 'a[href*="/reel/"]',
        'time 元素': 'time',
        'role=presentation': '[role="presentation"]',
        'main': 'main',
      },
    },
    {
      id: 'linkedin',
      label: 'LinkedIn',
      hosts: /(^|\.)linkedin\.com$/,
      post: '[role="listitem"], .feed-shared-update-v2,'
        + ' [data-urn^="urn:li:activity"], [data-id^="urn:li:activity"]',
      postTest: (el) => !el.matches('[role="listitem"]')
        || !!el.querySelector('[data-testid^="expandable-text"], .update-components-text,'
          + ' .update-components-actor, .feed-shared-inline-show-more-text'),
      probes: {
        'role=listitem': '[role="listitem"]',
        'data-testid=mainFeed': '[data-testid="mainFeed"]',
        'expandable-text': '[data-testid^="expandable-text"]',
        'data-urn（舊版）': '[data-urn]',
        '.feed-shared-update-v2（舊版）': '.feed-shared-update-v2',
        '.update-components-actor': '.update-components-actor',
      },
      text: '[data-testid^="expandable-text"], .update-components-text,'
        + ' .feed-shared-inline-show-more-text',
      author: '[data-testid^="actor-name"], .update-components-actor__title,'
        + ' .update-components-actor__name, .update-components-actor a[href*="/in/"]',
      permalink: 'a[href*="/feed/update/"], a[href*="/posts/"]',
      time: '.update-components-actor__sub-description, time',
      more: /^(…\s*more|…more|顯示更多|see more|展開)$/i,
      exclude: '.social-details-social-counts, .feed-shared-social-action-bar, .comments-comment-item',
    },
  ],

  adapterFor(hostname) {
    return self.CLIP_VAULT.ADAPTERS.find((a) => a.hosts.test(hostname)) || null;
  },

  linkedinPermalink(el) {
    const pick = (n) => n && (n.getAttribute('data-urn') || n.getAttribute('data-id'));
    let urn = pick(el)
      || pick(el.querySelector('[data-urn^="urn:li:activity"], [data-id^="urn:li:activity"]'))
      || pick(el.closest('[data-urn^="urn:li:activity"], [data-id^="urn:li:activity"]'));
    if (!urn || !urn.startsWith('urn:li:activity')) return '';
    return `https://www.linkedin.com/feed/update/${urn}/`;
  },
};
