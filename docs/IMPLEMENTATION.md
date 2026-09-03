# Clip Vault 實作文件（給維護者看的）

這份文件是寫給**下一個接手維護這個 repo的人**看的——目的是讓你不用把
整個專案從頭蹩一遍、也不用重新蹩過我們已經蹩過的坑。假設你已經看過
[README.md](../README.md)（使用者角度的安裝與設定說明），這裡只談**程式碼內部長什麼樣、
為什麼這樣寫、下次要改到哪裡**。

## 目錄

- [一句話總結](#一句話總結)
- [檔案結構與哪些檔案不進版控](#檔案結構與哪些檔案不進版控)
- [建置流程（build_manifest.py）](#建置流程 build_manifestpy)
- [OAuth 架構（Authorization Code + refresh_token）](#oauth-架構-authorization-code--refresh_token)
- [Content script 架構](#content-script-架構)
- [三個收藏目的地的實作細節](#三個收藏目的地的實作細節)
- [Storage schema 總表](#storage-schema-總表)
- [蹩過的坑（以後別再蹩一次）](#蹩過的坑以後別再蹩一次)
- [常見維護任務](#常見維護任務)
- [與 PostSync 上游同步的做法](#與-postsync-上游同步的做法)
- [法定測試（沒有自動化測試套件）](#法定測試沒有自動化測試套件)

## 一句話總結

Manifest V3 Chrome 擴充功能。使用者在任何網頁選取文字或整頁，內容寫進三個
可狨立開關的目的地（Google Drive、Obsidian、本機 `.md` 檔案）。社群平台
（Facebook/Threads/X/Instagram/LinkedIn）走專用的貼文偵測（沿用上游
[PostSync](https://github.com/Joanna8521/PostSync) 驗證過的邏輯），其他網頁走
自寫的通用擷取。整個擴充沒有自己的伺服器，所有宫鐘都直接由使用者自己的
瀏覽器發出。

## 檔案結構與哪些檔案不進版控

```
extension/
├── manifest.template.json     佔位符版本，進版控
├── manifest.json               build_manifest.py 產生，不進版控（.gitignore）
├── popup.html / popup.js       彈出窗：顯示 Drive/Obsidian 連線狀態與最近 10 筆收藏紀錄
├── options.html / options.js   設定頁：三個目的地的開關與參數、全局收藏開關
├── onboarding.html / onboarding.js   首次安裝引導頁（只有一個按鈕連到 options）
├── icons/
└── src/
    ├── adapters.js             5 個社群平台的 DOM 錨點表（沿用 PostSync，見下文）
    ├── extract.js               從貼文 DOM 抽出結構化資料（沿用 PostSync）
    ├── naming.js                檔名／筆記名規則（沿用 PostSync）
    ├── generic-extract.js       通用網頁擷取（自寫，輕量版）
    ├── content.js               浮動按鈕、貼文自帶按鈕、右鍵選單、toast（主水）
    ├── background.template.js   OAuth、資料夾路徑解析、Drive 寫入、Obsidian 交棒、
    │                              本機檔案、去重（進版控）
    ├── background.js            build_manifest.py 產生，不進版控（.gitignore）
    └── toast.css                注入頁面的 UI 樣式
tools/
└── build_manifest.py           從上面兩個佔位符檔 + .env 產生實際使用的兩個檔案
.env.example                       cp 成 .env 後填自己的 client_id/client_secret
docs/
└── IMPLEMENTATION.md           你現在看的這份
```

**重要規則**：`extension/manifest.json` 與 `extension/src/background.js` **永遠不手動
編輯**，它們都是 `python3 tools/build_manifest.py` 的輸出。改 OAuth、改 permissions、
改 content_scripts 都去改 `manifest.template.json`；改 background 邏輯都去改
`background.template.js`。如果你直接改了生成出來的檔，下次重跑建置持沙就會被覆掉，
改的人也会因為不知情碰到同樣的事。

> 已知历史問題：這兩個檔案一度不小心真的進了版控（在把它們加進 `.gitignore`
> 之前）。`.gitignore` 只能擋掉之後新的變動，不會回頭把已經 commit 過的檔案從
> git 索引中移除。如果你發現這兩個檔案奇怪地又出現在 git 歷史裡，用
> `git rm --cached <path>` 把它們從版控裡抽掉（本地檔案仍保留），再 commit 那次
> 移除。

## 建置流程（build_manifest.py）

```
cp .env.example .env
# 編輯 .env，填 GOOGLE_OAUTH_CLIENT_ID 與 GOOGLE_OAUTH_CLIENT_SECRET
python3 tools/build_manifest.py
```

執行後會做三件事：

1. 從 `manifest.template.json` 裡固定的 `key` 欄位（base64 公開金鑰）算出擴充
   功能 ID（sha256 前 32 hex 碼、每个 hex 位元映射到 a–p），印在終端機。這個 ID
   **固定不變**（只要 `key` 不換），不管你在哪台電腦、哪個路徑載入都一樣，
   這樣 OAuth 的 redirect URI 才能登記一次就一直有效。
2. 把 `manifest.template.json` 裡的 `client_id` 佔位符換成 `.env` 裡的真實值，
   輸出成 `extension/manifest.json`。
3. 把 `background.template.js` 裡的 `OAUTH_CLIENT_SECRET` 佔位符換成 `.env` 裡的真實
   `GOOGLE_OAUTH_CLIENT_SECRET`，輸出成 `extension/src/background.js`。

若 `.env` 沒填，兩個檔案仍然會產生，只是佔位符保持原樣——Drive 功能會顯示
「尚未設定」，但 Obsidian、本機檔案兩條路仍可正常運作。

### 為什麼 secret 是嵌在 background.js、不是 manifest.json

**這是整個建置流程裡最重要的一點，也是我們實際蹩過的坑**：一開始把
`clipvault_oauth_client_secret` 當成 `manifest.json` 的一個自訂頂層欄位。看起來沒
問題，Chrome 會在 console 印一句「Unrecognized manifest key」警告，但不影響載入。
實際上：

- 這個警告**不是單純警告**。Chrome（尤其 Comet 這類 Chromium 分支）對
  `manifest.json` 有 schema 驗證，不認得的頂層欄位會真的被濾掉。
- 於是 `chrome.runtime.getManifest()` 回傳的物件裡永遠沒有這個欄位，
  `clientSecret()` 永遠回傳空字串。
- Google 的 token 交換那一步（`grant_type=authorization_code`）對「網頁應用
  程式」類型的 client 一定要求帶 `client_secret`，沒帶就回 `invalid_request`
  `client_secret is missing`。
- 症狀：不管你點幾次「連接 Google」，都回同樣的失敗，而且包含 `background.js`
  實際內容、即使確認過真實 secret 已經正確寫進去，都依然失敗。

修正方式是把 secret 嵌入 `background.js`（純 JS 檔案，Chrome 不會對它做任何
格式檢查，寫什麼都不會被濾掉）。`manifest.template.json` 不再包含任何自訂頂層
欄位。

### 佔位符自我參照的替換坑（第二個真實蹩過的坑）

修完上面那個問題後，發現 **client_secret 依然送不到**，進一步查才發現第二層
問題。`build_manifest.py` 是把整份檔案文字裡所有出現過佔位符完整字串的地方全部
換成真實值，而 `background.template.js` 初次實作時這樣寫：

```js
// 錯誤示範（已修正）
const OAUTH_CLIENT_SECRET = 'OAUTH_CLIENT_SECRET_PLACEHOLDER';

function clientSecret() {
  return OAUTH_CLIENT_SECRET && !OAUTH_CLIENT_SECRET.startsWith('OAUTH_CLIENT_SECRET_PLACEHOLDER')
    ? OAUTH_CLIENT_SECRET
    : '';
}
```

`OAUTH_CLIENT_SECRET_PLACEHOLDER` 這個完整字串在檔案裡出現了**兩次**：一次是字進
預設值，一次是當成判斷式的比對目標。替換後這兩處都被換成同一個真實 secret，
判斷式變成 `secret.startsWith(secret 自己)`，一定是 `true`，`clientSecret()` 永遠
回傳空字串——不管 `.env` 填得多對都一樣。

現在的寫法：判斷式只比對佔位符的**前段字首**（`REPLACE_ME`），跟用來做整體
替換的完整佔位符字串（`REPLACE_ME_WITH_YOUR_OWN_CLIENT_SECRET`）不是同一個
字串，與 `manifest.template.json` 裡 `client_id` 的 `clientIdSet()` 寫法一致：

```js
const OAUTH_CLIENT_SECRET = 'REPLACE_ME_WITH_YOUR_OWN_CLIENT_SECRET';

function clientSecret() {
  return OAUTH_CLIENT_SECRET && !OAUTH_CLIENT_SECRET.startsWith('REPLACE_ME')
    ? OAUTH_CLIENT_SECRET
    : '';
}
```

**以後在模板裡新增任何需要替換的佔位符時，都要照這個模式寫**：完整佔位符字串
只能出現在「安放預設值」那一行，判斷「有沒有被設定過」的地方只能用一段不同於
完整佔位符的子字串，否則一定會被同一個替換動作誤傷。

## OAuth 架構（Authorization Code + refresh_token）

相關邏輯全部在 `background.template.js`，大概分成下面幾個函式：

| 函式 | 負責 |
|---|---|
| `clientIdSet()` / `clientSecret()` | 檢查佔位符有沒有被替換過 |
| `launchAuthCodeFlow()` | 第一次授權：跳 `chrome.identity.launchWebAuthFlow()`，拿 `code`，換 `access_token` + `refresh_token` |
| `refreshAccessToken(refreshToken)` | 安靜續期：純 HTTPS POST 到 `oauth2.googleapis.com/token`，不開任何視窗 |
| `getToken(interactive)` | 封裝後的入口：先查快取審 → 先試 refresh_token → 真的沒有才走完整授權（需 `interactive=true`） |
| `withAuthRetry(fn)` | 包住任何要用 token 的 API 呼叫，401 時清掉快取重試一次 |

### 為什麼不用 `chrome.identity.getAuthToken()`

這個 API 只有 Chrome 本身支援（靠瀏覽器內建的私有橋接服務）。Vivaldi、Brave、
Comet 這類其他 Chromium 核心瀏覽器沒有實作這層，用了就只能在 Chrome 上動。
改用 `chrome.identity.launchWebAuthFlow()`：標準 OAuth 導頁流程，任何 Chromium 分支
都支援。對應地，OAuth client 必須登記成「網頁應用程式」類型（不能選「Chrome
擴充功能」類型，那個類型在 Google 那邊沒有登記 redirect URI 的欄位）。

### 為什麼不用 implicit flow（`response_type=token`）

最早的實作是走 implicit flow：access token 大約 1 小時過期，續期靠瀏覽器對
`accounts.google.com` 的登入 cookie（`prompt=none` 安靜重試）。問題是不同
 Chromium 分支（尤其 Comet）在擴充功能的沙盒環境裡對這份 cookie 的保留方式不
一致，導致有時候一天內需要重新互動好幾次，而且每次都要開一個瀏覽器視窗。
現在的 Authorization Code 流程從第一次授權就拿到 `refresh_token`，之後全部
續期都走背景的 HTTPS 呼叫，不依賴任何瀏覽器登入狀態。

### Token 存在哪裡

| 存什麼 | 存哪裡 | 為什麼 |
|---|---|---|
| access_token | `chrome.storage.session`（key: `cvAuthToken`） | 短命，瀏覽器重啟就清除即可 |
| refresh_token | `chrome.storage.local`（key: `cvRefreshToken`） | 需要跨瀏覽器重啟、跨天保留 |

`refresh_token` 只有在 `refreshAccessToken()` 回傳 400/401（`e.refreshInvalid`）時才會
被清掉重走完整授權——其他錯誤（例如網路問題）不會把它清掉，避免一時網路不穩就
強迫使用者重新同意一次。

### 如果你需要新增一個需要授權的 API

直接包在 `withAuthRetry((token) => ...)` 裡叫，它會自動處理 token 取得與 401 重試。
不要自己直接叫 `getToken()`——除非你不需要 401 自動重試那套邏輯。

## Content script 架構

`extension/src/content.js` 是注入進每個網頁的主要邏輯，依賴兩個先載入的模組：

- `self.CLIP_VAULT`（adapters.js）：依 hostname 判斷現在是哪個社群平台（`adapterFor()`）
- `self.CLIP_VAULT_EXTRACT`（extract.js）：從貼文 DOM 抽出結構化資料（`extract()`、
  `outermost()`、`outermostOf()`、`images()`）
- `self.CLIP_VAULT_GENERIC`（generic-extract.js）：非社群頁面的通用擷取（`extractGeneric()`）

`content.js` 開頭就判斷 `ad = NS.adapterFor(hostname)`，之後整支腳本大量地方都用
`if (ad) { ... } else { ... }` 分屈社群頁面與通用頁面的行為。

### 社群頁面（`ad` 存在）

- **貼文偵測**：`refreshPosts()` 叫 `EX.outermost(ad, document)` 拿到目前畫面上所有貼
  文的最外層元素，由 `MutationObserver`（debounce 400ms）+ `scroll`/`resize`/`wheel`
  事件觸發。`scroll` 監聽故意掛在 `document` 上並加 `capture: true`，因為臉書的
  動態牆有時是在內層容器量捲動，只聽 `window` 會完全漏接。
  - **長滾動記憶體保護**：若頁面累積超過 120 篇貼文，依距離視窗中線（`vMid`）由近到遠排序，
    只保留最近的 120 篇，自動移除遠處貼文的自帶按鈕與 DOM 引用，防止動態牆無限滾動造成記憶體洩漏。
- **每則貼文自帶按鈕與按需顯示**：`ensurePostBtn(post)` / `syncPostButtons()`。用 `WeakMap`
  （`postButtons`）追蹤哪則貼文已經有按鈕，避免重複建立；已不在畫面上的貼文會把
  對應的按鈕一起移除。
  - **按需浮現（`triggerKey`）**：預設為 `'alt'`，只有當使用者按住 `Alt`（Mac 為 `Option`）
    且滑鼠正指向該則貼文（`hoveredPost`）時，按鈕才帶有 `.clipvault-show` 浮現。
  - **Windows Alt 鍵防劫持**：Windows 平台單按 Alt 會把焦點交給 Chrome 右上角功能表並觸發網頁 `blur`，
    導致後續 Alt 鍵事件被瀏覽器吞掉；`content.js` 特別在 `ev.key === 'Alt'` 時調用 `ev.preventDefault()`
    保持網頁焦點。
- **展開全文**：`expandAll(root)` 按到「查看更多」類的按鈕（`moreButtons()` 找，
  `ad.more` 錨定比對，不是包含比對），最多循環 3 次。附帶這兩道保險：
  1. `NS.MENU_DENY` 對標籤進行黑名單比對（避免點到選單、取消追蹤之類的真實後果按鈕）；
  2. `dialogCount()`/`dismissDialog()`：每次點一下就檢查畫面上的 `[role="dialog"]`
     數量有沒有增加，有就按 Esc 收掉並終止展開。
- **IG 輪播多圖**：只有當 `ad.next` 存在時走 `collectCarousel(root)`：先 `hover(root)`
  讓箭頭出現→找 `nextButton()` → `waitImages()` 等圖片載入完 → 重複，直到連續 2 次沒新圖（`dry >= 2`）或超過 24 次。
- **Facebook 相簿翻頁收圖（`collectAlbum`）**：臉書相簿貼文（超過 5 張圖）帶有「+N」疊圖時，
  其餘圖片根本不在 DOM 裡。在 `albumEnabled` 開啟且偵測到 `EX.isAlbum(root)` 時，暫時點開檢視器
  以右方向鍵（`ArrowRight`）逐張收集原圖（上限 30 張），收完自動按 Esc 關閉檢視器並精準還原網址與捲動位置。
- **收藏目標**：選取根據 `pickActive()`（最接近畫面中線的貼文，或右鍵/快速鍵時用
  最後一次右鍵目標/點擊坐標定位）。

### 通用頁面（`ad` 不存在）

只有右下角一顆固定浮動按鈕（`ensureBtn()`），沒有貼文清單概念。`captureGeneric()`
叫 `GEN.extractGeneric()`：有選取文字就收選取範圍（`fromSelection()`），沒有選取
就抓 `mainCandidate()` 找到的「看起來像主文」區塊（先試 `article, main,
[role="main"], [itemprop="articleBody"]`，都沒有就把全頁 div/section 按段落數與文字
長度評分）。

### 全局開關（`captureEnabled`）

`enabled` 變數於頁面載入時從 `chrome.storage.sync` 讀一次，並用
`chrome.storage.onChanged` 追蹤後續變化（設定頁存檔即時跨分頁生效）。關掉時
`hideAllButtons()` 會移除所有 `.clipvault-post-btn`、隱藏浮動按鈕，並在
`capture()`/`captureGeneric()`/右鍵選單/快速鍵入口都加上檢查，避免既有按鈕的
遺留事件監聽器進行中的收藏。

## 三個收藏目的地的實作細節

三個目的地都在 `background.template.js` 的 `handleCapture()` 裡被嘗試（依序：
不是並發，是依序 try/catch，但一邊失敗不會影響另兩邊），任何一邊成功就算成功。

### Google Drive

- `resolveFolderPath(token, path)`：把使用者填的路徑字串（例 `00 inbox/Clip Vault`）
  逐段拆開，每一段用 `findChildFolder()` 搜、找不到就 `createChildFolder()` 建。只用
  `drive.file` scope，搜尋結果只會包含這個擴充自己建立過的資料夾。解析結果（`folderId`）存在 `chrome.storage.sync`。
- `createDoc()`：建空白 Google Doc，用 Docs API `batchUpdate` 寫入標題（`TITLE` 樣式）、
  標籤行、作者/時間/收錄時間、原文連結（超連結）、正文。
- `insertImages()`：圖片嵌入有兩層後備——先讓 Docs API 直接抓原始網址
  （`insertInlineImage`），失敗（時效簽章網址、host 防盜連擋）就改自己下載、上傳到
  Drive、拿公開分享連結、再嵌入，最後把自己上傳的中間檔刪掉（`viaDrive()`）。兩層
  都失敗的圖就排到文末作成連結清單。

#### 架構決策：為什麼不是用 Google Picker 選資料夾？
原本的設計是想用 Google 官方的 Picker 元件，讓使用者直接視覺化挑選現有的 Drive 資料夾。然而在 Manifest V3 擴充功能中這會撞上 Chromium 至今未解的底層限制：
1. **CSP 封鎖遠端腳本**：一般擴充頁面（`options.html`）的 Content Security Policy 完全禁止載入任何遠端腳本，而 Picker 必須從 `https://apis.google.com` 載入外部 JS，直接引入會導致整個擴充被拒絕載入。
2. **沙盒頁面被 CORS 阻擋**：改用 MV3 沙盒頁面（Sandbox Page）繞過 CSP 後，沙盒頁面屬於不透明來源（`null` origin），但 **Google Picker 的後端伺服器在 CORS 政策中直接封鎖所有來自 `null` 來源的請求**。Chromium 官方討論串中 Google 工程師給出的解法也是「另外自行架設一個有實體網域的伺服器跑 Picker」。
3. **字串解析＋最小權限原則**：為了讓使用者不必額外架設伺服器，本專案改走「填入文字路徑（如 `00 inbox/Clip Vault`）由背景自動搜尋與建立」。此作法在 `drive.file` scope 下完全合規——`files.list` 雖然只能搜尋擴充自身建立的資料夾，但只要第一次建立成功後，後續即可完美重複使用相同資料夾 ID，既免去架站成本，又維持了嚴格的最小權限原則。

#### 架構決策：為什麼不用 `chrome.identity.getAuthToken()`？
- `chrome.identity.getAuthToken()` 是 Chrome 專屬的私有 API，依賴 Chrome 內建對 Google 帳號的私有橋接服務。在 Vivaldi、Brave、Comet 等第三方 Chromium 分支中均未實作此服務，使用它會導致跨瀏覽器相容性全滅。
- 本專案改採標準的 `chrome.identity.launchWebAuthFlow()`，配合 OAuth 2.0「網頁應用程式」類型，並實作 Authorization Code 交換 `refresh_token`。token 過期後在背景無感刷新，一次授權即可長久運作。

#### 客戶端 Client Secret 的安全邊界
- 在 Chrome Extension 等客戶端環境中，Client Secret 屬於公開型用戶端憑證，無法對使用者本機真正保密。Google 對此類憑證的安全邊界設計重點在於：**嚴格綁定 OAuth Redirect URI（`https://<extension-id>.chromiumapp.org/`）** 以及 **權限嚴格限制在 `drive.file` scope**。
- 本專案採用 `tools/build_manifest.py` 從本地 `.env` 動態注入 secret，純粹是為了確保使用者的個人 GCP 憑證不會意外提交至公開的 Git Commit 歷史中。

### Obsidian

完全不需要伺服器、不需要 Advanced URI 外掛。`writeObsidian()` 組好
`obsidian://new?vault=...&file=...&content=...` 的 URI 並回傳給呼叫端。
由前端 content script 透過動態隱藏連結喚醒（`triggerObsidianUri()`）：
- **零分頁閃爍**：瀏覽器畫面完全不會彈出或關閉任何空白分頁，本機 Obsidian App 零感喚起寫入。
- 僅在極端無 `tabId` 降級情境下才由背景調用 `chrome.tabs.create`。
- URI 長度有上限（`OBSIDIAN_URI_SAFE_LEN = 6000`），超過會自動截斷內容並在結尾附上原始連結。

### 本機 Markdown 檔案

`writeLocal()` 把內容編成 `data:text/markdown;charset=utf-8;base64,...` 的 data URI（**不用
**`Blob` + `URL.createObjectURL()`，因為不是每個 Chromium 分支的 service worker 都實作了
後者），中文字先經 `TextEncoder` 轉 UTF-8 位元組、再逐位元組轉 Latin1 字串交給
`btoa`（`utf8ToBase64()`）。

- 直接在 `chrome.downloads.download({ url, filename: filePath, conflictAction: 'uniquify' })` 指定相對路徑與檔名。
- **不再註冊全域 `onDeterminingFilename` 監聽器**：這徹底避免了與第三方下載工具（例如 IDM Integration Module）競爭檔名決定權所產生的 Extension Conflict 錯誤警告。

## Storage schema 總表

### `chrome.storage.sync`（設定，跨裝置同步）

| Key | 型別 | 說明 |
|---|---|---|
| `captureEnabled` | boolean | 全局收藏開關，預設 `true` |
| `triggerKey` | string | 按鈕顯示時機：`'alt'`（預設）、`'ctrl'`、`'always'` |
| `albumEnabled` | boolean | 臉書相簿貼文是否自動逐張翻頁收圖，預設 `true` |
| `driveEnabled` | boolean | 預設 `true`（`!== false` 判斷） |
| `driveFolderId` | string | 解析後的 Drive 資料夾 ID（不是路徑字串） |
| `driveFolderPath` | string | 使用者填的路徑字串（只用來顯示，不影響功能） |
| `driveTags` | string | 原始輸入（空格/逗號分隔） |
| `obsidianEnabled` | boolean | 預設 `false` |
| `obsidianVault` | string | 必須跟 Obsidian 顯示的 vault 名稱完全一樣 |
| `obsidianFolder` | string | vault 內相對路徑，可留空 |
| `obsidianTags` | string | |
| `localEnabled` | boolean | 預設 `false` |
| `localFolder` | string | 預設 `'ClipVault'` |
| `localTags` | string | |

### `chrome.storage.local`（本機，不同步）

| Key | 型別 | 說明 |
|---|---|---|
| `cvRefreshToken` | string | Google OAuth refresh_token |
| `cvSeen` | object | 去重用，key 是 `fingerprint()` 算出的 hash，值是 `{t, when, docUrl, docName}`，上限 `SEEN_CAP = 5000` 筆，超過時根據 `t` 清最舊的 |
| `cvLog` | array | popup 顯示的最近收藏紀錄，上限 50 筆 |

### `chrome.storage.session`（進程內記憶，重啟 service worker 或瀏覽器就清）

| Key | 型別 | 說明 |
|---|---|---|
| `cvAuthToken` | object | `{token, expiresAt}`，access_token 快取 |

## 踩過的坑（以後別再踩一次）

1. **manifest.json 自訂頂層欄位會被濾掉** — 已在上面「OAuth 架構」詳述。結論：任何需要在 runtime 讀到的比較敏感的值，都別放進 `manifest.template.json`，放進 `.js` 檔案。
2. **佔位符自我參照的替換坑** — 宣告預設值跟判斷式永遠用不同長度的字串。
3. **MV3 service worker 更新後卡舊版本** — 在擴充功能頁面點「重新整理」有時不會真的重啟 service worker。遇到行為奇怪且確定程式碼沒問題時，先把擴充功能完全「移除」後重新「載入未封裝項目」。
4. **Chrome extension ID 只跟 `manifest.json` 的 `key` 欄位有關** — 只要 `key` 一樣，不管在哪個目錄載入都是同一個 ID。
5. **不要用全域 `onDeterminingFilename` 命名自己的下載** — 全域監聽器會攔截瀏覽器的每一個下載（包含其他外掛或使用者手動下載），若多個擴充（如 IDM）同時呼叫 `suggest()`，Chrome 會跳出 Extension Conflict 衝突錯誤。直接在 `chrome.downloads.download({ filename })` 帶參數即可。
6. **Windows Chrome 單按 Alt 鍵劫持焦點** — Windows 系統上放開 Alt 鍵會將焦點移至 Chrome 功能表並觸發網頁 `blur`，導致下一次按 Alt 無反應；必須在 keydown/keyup 判定 `ev.key === 'Alt'` 時執行 `ev.preventDefault()`。
7. **不可見控制字元讓 Git 與 grep 靜音** — 正則表達式中若寫入未跳脫的二進位字面不可見字元（如零寬字元、U+034F、ASCII 控制碼），Git 與 Linux/Mac 工具會把該 JS 檔視為 binary，導致 grep 靜音。必須一律使用 `\x00-\x08` 或 `\u00AD` 十六進位跳脫表示。

## 常見維護任務

### 新增一個社群平台錨點

1. 在 `extension/src/adapters.js` 的 `self.CLIP_VAULT.ADAPTERS` 陣列新增一個項目，
   包含 `id`、`label`、`hosts`（hostname 正則）、`post`（貼文容器選擇子）、`more`
   （「查看更多」標籤錨定錨點）、選靠的 `next`（輪播翻頁錨點）等。參考現有的
   Facebook/Threads/X/Instagram/LinkedIn 實作。
2. `extract.js` 一般不需要改，它是完全通用於 `ad` 物件描述的邏輯。
3. 在 `extension/manifest.template.json` 的 `content_scripts.matches` 確認該域名模式有
   被涵蓋（一般都是 `https://*/*`，不用動）。
4. 告訴使用者需要重新載入擴充功能（adapters.js 不需要重跑 `build_manifest.py`）。

### 新增一個收藏目的地

1. `background.template.js` 新增 `write<XYZ>(p, s)` 函式，回傳包含至少 `{fileName,
   filePath}` 或相應識別字段的物件。
2. `handleCapture()` 新增 `wantXYZ` 判斷、對應的 try/catch 區塊、到最後的 `bits`
   拼接。
3. `extension/options.html` + `extension/options.js` 新增對應的 fieldset 與 load/save
   邏輯。
4. 若需要新的 `chrome.storage.sync` key，記得同步更新上面的 storage schema 總表。

### 新增一個需要嵌進 background.js 的敏感值

依照現有 `OAUTH_CLIENT_SECRET` 的模式：在 `background.template.js` 安放一個
`REPLACE_ME_WITH_...` 項佔位符，判斷式只比對前段字首，在 `tools/build_manifest.py` 新增
對應的 `.env` 讀取與替換。万萬不要直接放進 `manifest.template.json`。

## 與 PostSync 上游同步的做法

`adapters.js`／`extract.js`／`naming.js` 這三個檔案目前跟
[PostSync](https://github.com/Joanna8521/PostSync) `main` 分支幾乎逐字相同（只差
`CLIP_VAULT` vs `POST_SYNC` 命名）。定期檢查方式：

```bash
curl -s https://raw.githubusercontent.com/Joanna8521/PostSync/main/extension/src/adapters.js -o /tmp/ps_adapters.js
curl -s https://raw.githubusercontent.com/shihying-yang/ClipVault/main/extension/src/adapters.js -o /tmp/cv_adapters.js
diff /tmp/cv_adapters.js /tmp/ps_adapters.js
```

`extract.js`、`naming.js` 亦同法炮製。如果 diff 出現不只是命名差異的地方，通常代表
上游修了某個平台的錨點（他們會定期碰到社群平台改版導致偵測失效的問題，見他們
自己的 commit history 與 CHANGELOG.md），直接把新版本整檔拉過來比手動轉換安全得多。

`content.js` 則完全不同——PostSync 只處理社群平台、有自己的診斷面板與右上角單顆
浮動按鈕模式，這裡多了通用網頁支援、貼文自帶按鈕、三目的地寫入。這份文件上一次
整理過两邊差異的時間點是 2026-08，確定沒漏接的項目可參考 git log 中提到
「PostSync」的 commit。

## 法定測試（沒有自動化測試套件）

這個 repo 沒有 `tests/`，因為 PostSync 那套需要维护一整套 fixture HTML 來模擬各平台
的真實 DOM，成本夠高——直接沿用他們已經驗證過的錨點比自己重複驗證划算。改到
`content.js`／`background.template.js` 後，建議手動走一遍下面這張清單：

1. **Google Drive**：連接 Google（第一次應該跳 Google 同意畫面）→ 確認/建立路徑
   → 到一個社群頁面收藏 → 到 Drive 確認有新 Doc 、標題、連結、圖片都對。
2. **重新連接模擬**：手動清掉 `chrome.storage.local` 的 `cvRefreshToken`，確認下一次
   收藏會重新走一次完整授權、不會卡住。
3. **Obsidian**：確認分頁會自動關掉、Obsidian App 真的收到筆記。
4. **本機 Markdown**：檢查下載下來的檔名是否正確（不是 `download.md`），在開著
   「下載前問要存哪裡」設定的情況下也要測一次。
5. **每個社群平台至少測一則**：普通文字貼文、需要展開的長貼文（確認沒截斷）、
   IG 多圖貼文（確認收到不只一張）。
6. **通用頁面**：選取一段文字收藏，再不選取抓整頁收藏。
7. **重複收藏**：同一則貼文收兩次，確認第二次跳出重複提示且「開啟已收的那份」連
   結能點。
8. **全局開關**：設定頁關掉「啟用收藏按鈕」，確認所有按鈕真的消失，重新打開後
   按鈕回來。

若日後真的想加自動化測試，可參考 PostSync 的 `tests/run.html` + `tools/run_tests.py`
架構（headless Chrome 跑），但記得這是一項不小的投資，不是順手加上去就好。
