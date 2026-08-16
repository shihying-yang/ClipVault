# ⚡ Clip Vault — 網頁收藏器

開源的 Chrome 擴充功能（MV3）。任何網頁選取一段文字，或整頁收藏，一鍵存進
**你自己的 Google Drive** 或 **Obsidian vault**，兩個目的地各自獨立、可以只開
一邊、也可以兩邊同時開。

在 **Facebook / Threads / X / Instagram / LinkedIn** 上會自動切換成專用的貼文
擷取邏輯（沿用 [PostSync](https://github.com/Joanna8521/PostSync) 驗證過的
DOM 錨點），比通用擷取準確很多；其他任何網頁走通用擷取（選取優先，沒選取就
抓看起來像主文的區塊）。

- **兩個目的地各自獨立**：Drive 路徑、Obsidian vault/資料夾/標籤都在設定頁
  裡先設好，收藏時直接套用，不用每次選
- **Google Drive 目的地填路徑就好**：填一個像 `00 inbox/Clip Vault 收藏`
  的路徑字串，找不到的那一層會自動建立（原因見下面「為什麼不是用 Google
  Picker」）
- **Obsidian 免外掛**：走 Obsidian 原生的 `obsidian://new` URI，不需要裝
  Advanced URI 之類的社群外掛
- **標籤**：兩邊都會把標籤寫成內容開頭的一行文字（`#工作 #靈感`），不是額外
  的中繼資料欄位
- **跨瀏覽器**：從第一天就用 `chrome.identity.launchWebAuthFlow()`，Chrome／
  Vivaldi／Brave／Comet 都能連 Google（原因見下面「OAuth 設定」一節）
- **最小權限**：Drive 只用 `drive.file` scope，不需要 Google 審查、也不會
  出現「未經驗證」的授權提示

## 這是「輕量版」

社群平台的貼文偵測直接繼承 PostSync 的邏輯（`adapters.js` + `extract.js`），
那套錨點是經過大量改版試錯才穩定下來的，這裡原封不動沿用。但整體專案本身是
輕量版：

- 通用網頁擷取是簡化的啟發式（選取優先、沒選取抓主要區塊），不是完整的
  [Readability](https://github.com/mozilla/readability) 演算法或
  [obsidian-clipper](https://github.com/obsidianmd/obsidian-clipper) 官方那套
  可自訂的模板系統
- 沒有 IG 輪播多圖翻頁收集（只收目前畫面上那張）
- 沒有像 PostSync 那樣的逐項診斷面板（`偵測到 N 則但一則都沒鎖定` 時只給簡短
  提示，不列出完整的 DOM 路徑）
- 沒有測試套件（PostSync/MeshSync 都有 `tests/run.html`，這裡沒有）

夠用就好，社群平台的穩健度才是花錢買回來的部分。

## 為什麼不是用 Google Picker 選資料夾

原本的設計是想用 Google 官方的 Picker 元件，讓你在擴充功能裡直接瀏覽、點選
一個現有的 Drive 資料夾。實際做下去才發現這在 Manifest V3 擴充功能裡是一個
**Google 自己都還沒解的限制**：

- 一般擴充頁面（`options.html`）的 CSP 完全不允許載入任何遠端腳本，Picker
  的元件一定要從 `https://apis.google.com` 載入，直接寫死會讓整個 manifest
  被 Chrome 拒絕載入。
- 改用 MV3 的「沙盒頁面」機制（CSP 可以放寬）繞過上一條，但沙盒頁面是
  `null` 來源（opaque origin），而 **Google Picker 的後端伺服器會用 CORS
  擋掉所有來自 `null` 來源的請求**——這不是我們的設定問題，Chromium 官方
  開發者社群的討論串（[連結](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/FhWI_kvDbaA)）
  裡 Google 員工自己給的答案是「另外架一個有真實網址的網頁來跑 Picker」。

這個 repo 選擇不要求你額外架站，改成：**設定頁填一個路徑字串**（例如
`00 inbox/Clip Vault 收藏`），背景服務逐層搜尋、找不到就自動建立。

### 這個做法完全不需要擴大 scope

`drive.file` scope 底下，`files.list`（搜尋）這個 API 呼叫本身**是可以打的**，
只是回傳結果會被限縮在「這個擴充自己建立過的檔案」——這是一個常見的誤解，很
多人以為 `drive.file` 完全禁止查詢，其實只是查詢範圍受限，不是整支 API 被擋
（症狀通常是「明明 Drive 裡有東西，`files.list` 卻回傳空清單」）。

所以路徑解析可以完全留在 `drive.file` scope 裡：

- 路徑裡的某一層**是這個擴充自己建立過**的資料夾 → 找得到，正確重複使用
- 路徑裡的某一層**完全不存在** → 正常建立
- 路徑裡的某一層**是你手動在 Drive 網頁上建立、這個擴充從沒碰過**的既有
  資料夾 → 找不到（不是報錯，是查到「沒有」），會被當成不存在而另外新建
  一個同名的，不會接上既有那一個

第一次設定路徑時，如果你填的是全新的路徑就完全不受影響；之後每次收藏都會
正確重複使用同一批資料夾，因為它們是這個擴充自己建的。唯一真正做不到的是
「附加到一個完全在這個擴充之外手動建立的既有資料夾」——但這不需要用更大的
權限去換，維持 `drive.file` 就好。

## 安裝

三分鐘，不需要開發環境，也不需要 npm。

1. `git clone` 這個 repo，或用 `Code → Download ZIP` 下載後解壓縮
2. 完成下面「OAuth 設定」，跑 `python3 tools/build_manifest.py`
3. 到瀏覽器的擴充功能頁面：
   - Chrome：`chrome://extensions`
   - Vivaldi：`vivaldi://extensions`
   - Brave：`brave://extensions`
   - Comet：擴充功能管理頁（網址列輸入 `comet://extensions`）
4. 右上角開啟「開發人員模式」，按「載入未封裝項目」，選 `extension` 資料夾
   （要選到裡面看得到 `manifest.json` 的那一層——沒有的話代表你還沒跑
   `build_manifest.py`）
5. 裝好後會自動打開設定導覽頁，照著做完設定

只想用 Obsidian、不想碰 Google Drive 的話，可以跳過 OAuth 設定那一節，
`build_manifest.py` 沒填 client_id 也能正常產生 manifest，只是 Drive 功能會
顯示「尚未設定」。

## OAuth 設定（Google Drive 用）

`chrome.identity.getAuthToken()`（很多教學會用的那支 API）只有 **Google
Chrome 本身**才支援，靠瀏覽器內建、對 Google 帳號的私有橋接服務簽發 token。
Vivaldi、Brave、Comet 這類其他 Chromium 核心瀏覽器都沒有實作這層服務，用了
它就只能在 Chrome 上動。

這個 repo 從第一天就用 `chrome.identity.launchWebAuthFlow()`：標準的 OAuth
導頁流程，任何 Chromium 核心瀏覽器都支援。對應地，OAuth client 也必須是
**「網頁應用程式」**類型（不是「Chrome 擴充功能」類型——那個類型在 Google
那邊沒有登記 redirect URI 的欄位，換了流程會被拒絕，出現
`redirect_uri_mismatch`）。

### 設定步驟

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建一個專案，
   啟用 **Google Drive API** 與 **Google Docs API**。
2. 「OAuth 同意畫面」：使用者類型選「外部」，填 App 名稱與聯絡信箱，scope 加
   `.../auth/drive.file`（**非敏感** scope，不需要 Google 審查，也沒有測試
   使用者 100 人上限）。發布狀態改成「正式版」。
3. 「用戶端」→「建立用戶端」→ 應用程式類型選 **「網頁應用程式」**。
4. 先跑一次 `python3 tools/build_manifest.py`（就算 `.env` 還是空的也沒關
   係），它會印出這個 repo 固定 `key` 算出來的擴充功能 ID，例如：

   ```
   這個 repo 的擴充功能 ID：hiekfmjdkkghmkomeahhhghdigbmchcf
   OAuth redirect URI 要登記：https://hiekfmjdkkghmkomeahhhghdigbmchcf.chromiumapp.org/
   ```

   把印出來的那串 redirect URI，加進「已授權的重新導向 URI」。
5. 拿到 client ID 後填進 `.env`（先 `cp .env.example .env`）：

   ```
   GOOGLE_OAUTH_CLIENT_ID=你的client_id.apps.googleusercontent.com
   ```

6. 重跑 `python3 tools/build_manifest.py`，產生真正的 `extension/manifest.json`
   （這個檔案已被 `.gitignore` 排除，不會進 git 歷史——你的 GCP 專案代號不會
   留在公開 repo 的 commit 裡）。

> client_id 本身仍然不是機密——Google 對「公開型用戶端」的設計本來就沒有
> client secret，真正的安全邊界是 redirect URI 綁定跟 scope 縮小到
> `drive.file`。用 `.env` 分開純粹是不想讓你的 GCP 專案代號留在公開 commit
> 歷史裡，跟安全性無關。

## 設定 Google Drive 目的地路徑

1. 設定頁按「連接 Google」完成授權。
2. 在「目的地路徑」填一個路徑，例如 `00 inbox/Clip Vault 收藏`——這是你
   **My Drive 底下的路徑**，不需要事先存在。
3. 按「確認／建立路徑」。背景服務會從 My Drive 根目錄開始，逐層搜尋這個擴充
   自己建立過的同名資料夾，找不到的那一層就自動建立，最後告訴你這次實際
   新建了哪幾層。
4. 之後每次收藏都直接寫進這個路徑，不用再選一次。

已經解析過的路徑存的是資料夾 **ID**，不是文字路徑本身——之後你在 Google
Drive 網頁上把這個資料夾搬到別的地方，收藏功能仍然正常（Drive 認的是 ID，
不是路徑），只是設定頁顯示的路徑文字不會跟著更新（純粹顯示用，不影響功能）。

**注意**：如果你填的路徑裡某一層剛好跟你以前手動建立的既有資料夾同名，這裡
不會接上那一個（`drive.file` scope 看不到它），而是另外新建一個同名的。建議
第一次設定時填一個你確定沒用過的路徑名稱。

## Obsidian 設定

不需要裝任何社群外掛。設定頁填兩個欄位：

- **Vault 名稱**：跟 Obsidian「開啟資料夾為 Vault」畫面上顯示的名稱要完全
  一樣（含大小寫與空格）。
- **資料夾路徑**（選填）：vault 內的相對路徑，例如 `00_inbox/clip-vault`。
  留空就存在 vault 根目錄。

收藏時擴充會開一個背景分頁把 `obsidian://new?vault=...&file=...&content=...`
丟給瀏覽器，觸發作業系統把它交給 Obsidian App，幾秒後那個分頁會自動關掉。
**這一段完全在本機完成，不需要跑任何伺服器**——跟官方 obsidian-clipper
需要另外裝 Local REST API 外掛、跑本機服務的做法不一樣。

### 已知限制

- **第一次會跳出系統確認框**：瀏覽器問「是否要開啟 Obsidian？」，這是外部
  協定處理的標準行為，擴充功能這邊沒辦法繞過去；勾選瀏覽器提供的「一律
  允許」之後就不會再問。
- **本機要有裝 Obsidian 桑面版**，而且該 vault 要用 Obsidian 開過至少一次
  （行動裝置、網頁版 Obsidian 都吃不到 `obsidian://` 協定）。
- **URI 有長度上限**（隨作業系統/瀏覽器而不同，這裡保守拒 6000 字元）。內容
  超長時會自動截斷，並在檔案結尾附上原始連結，不會假裝收完了。

## 在 Vivaldi／Brave／Comet 上使用

不需要額外設定——OAuth 從第一天就是用跨瀏覽器相容的 `launchWebAuthFlow()`，
Obsidian 走的是作業系統層級的 URI 協定，兩者都不依賴任何 Chrome 專屬 API。
照上面的「安裝」步驟，在對應瀏覽器的擴充功能頁面載入未封裝項目即可。

## 使用方式

**社群平台**（Facebook/Threads/X/Instagram/LinkedIn）：捲到一則貼文，右邊
會浮出「⚡ 收這篇」，或右鍵選單裡選「⚡ 收藏到 Clip Vault」——指哪篇收哪篇。

**其他任何網頁**：

- 選取一段文字 → 右鍵「⚡ 收藏到 Clip Vault」或按右下角浮動按鈕 → 收選取
  的內容
- 沒有選取 → 收整頁（抓看起來像主文的區塊）

收藏一律是**使用者手動觸發**，沒有任何自動收集，也不會自己捲動頁面。

## 專案結構

```
extension/
├── manifest.template.json   # 佔位符版本，會 commit
├── manifest.json             # tools/build_manifest.py 產生，不進 git
├── popup.html / popup.js     # 顯示連線狀態與收藏紀錄
├── options.html / options.js # 設定頁：Drive 連接／路徑解析、Obsidian 設定
├── onboarding.html / onboarding.js
├── icons/
└── src/
    ├── adapters.js       # 5 個社群平台的 DOM 錨點（沿用 PostSync）
    ├── extract.js        # 從貼文 DOM 抽出結構化資料（沿用 PostSync）
    ├── naming.js          # 檔名／筆記名規則（沿用 PostSync）
    ├── generic-extract.js # 通用網頁擷取（新增，輕量版）
    ├── content.js         # 浮動按鈕、右鍵選單、toast（整合社群＋通用）
    ├── background.js      # OAuth、資料夾路徑解析、Drive 寫入、Obsidian 交棒、去重
    └── toast.css
tools/
└── build_manifest.py
.env.example
```

- `key.pem`（專案根目錄、不進 git）：打包 .crx 時才需要的私鑰，載入未封裝不
  需要它。

## 隱私

- 擷取動作**全部由使用者手動觸發**，不會自動上傳任何內容，也不會自動捲動
  頁面。
- 資料只寫進使用者自己的 Google Drive 或自己指定的 Obsidian vault；本擴充
  沒有任何自己的伺服器。
- `drive.file` scope 之下，擴充只能看到、修改它自己建立的檔案，看不到你
  Drive 裡的其他東西。
- Obsidian 目的地完全在本機完成，不經過任何網路請求。

## License

MIT
