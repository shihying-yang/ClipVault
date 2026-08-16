# ⚡ Clip Vault — 網頁收藏器

開源的 Chrome 擴充功能（MV3）。任何網頁選取一段文字，或整頁收藏，一鍵存進
**你自己的 Google Drive** 或 **Obsidian vault**，兩個目的地各自獨立、可以只開
一邊、也可以兩邊同時開。

在 **Facebook / Threads / X / Instagram / LinkedIn** 上會自動切換成專用的貼文
擷取邏輯（沿用 [PostSync](https://github.com/Joanna8521/PostSync) 驗證過的
DOM 錨點），比通用擷取準確很多；其他任何網頁走通用擷取（選取優先，沒選取就
抓看起來像主文的區塊）。

- **兩個目的地各自獨立**：Drive 資料夾、Obsidian vault/資料夾/標籤都在設定頁
  裡先設好，收藏時直接套用，不用每次選
- **Google Drive 資料夾自己選**：用 Google 官方 Picker 挑一個現有資料夾，不是
  寫死自動建立
- **Obsidian 免外掛**：走 Obsidian 原生的 `obsidian://new` URI，不需要裝
  Advanced URI 之類的社群外掛
- **標籤**：兩邊都會把標籤寫成內容開頭的一行文字（`#工作 #靈感`），不是額外
  的中繼資料欄位
- **跨瀏覽器**：從第一天就用 `chrome.identity.launchWebAuthFlow()`，Chrome／
  Vivaldi／Brave／Comet 都能連 Google（原因見下面「OAuth 設定」一節）
- **最小權限**：Drive 只用 `drive.file` scope，只碰這個擴充自己建立或使用者
  透過 Picker 明確選過的檔案

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

## 安裝

三分鐘，不需要開發環境，也不需要 npm。

1. `git clone` 這個 repo，或用 `Code → Download ZIP` 下載後解壓縮
2. 完成下面「OAuth 設定」（Google Drive 用）與「Google Picker 設定」（選資料
   夾用），跑 `python3 tools/build_manifest.py`
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

> 這組 client_id 不是機密——Google 對「公開型用戶端」的設計本來就沒有 client
> secret，真正的安全邊界是 redirect URI 綁定跟 scope 縮小到 `drive.file`。
> 用 `.env` 分開純粹是不想讓你的 GCP 專案代號留在公開 commit 歷史裡，跟安全
> 性無關。

## Google Picker 設定（選 Drive 資料夾用）

設定頁的「選擇資料夾」按鈕，是嵌入 Google 官方的
[Picker](https://developers.google.com/workspace/drive/picker) 元件，讓你在
擴充功能裡直接瀏覽、點選一個現有的 Drive 資料夾——不需要把 OAuth scope 擴大
到能瀏覽整個 Drive；`drive.file` scope 底下，Picker 讓你「明確選過的東西」會
被視為使用者主動授權的檔案，一樣維持最小權限。

1. 在同一個 Google Cloud 專案裡，「已啟用的 API 和服務」→ 啟用
   **Google Picker API**。
2. 「憑證」→「建立憑證」→「API 金鑰」（不是 OAuth client，是另一種）。
3. 建議把這組金鑰限制在「HTTP 參照網址」：`chrome-extension://<你的擴充功能
   ID>/*`，避免被其他網站盜用。
4. 填進 `.env`：

   ```
   GOOGLE_PICKER_API_KEY=你的picker_api_key
   ```

5. 重跑 `python3 tools/build_manifest.py`。

## Obsidian 設定

不需要裝任何社群外掛。設定頁填兩個欄位：

- **Vault 名稱**：跟 Obsidian「開啟資料夾為 Vault」畫面上顯示的名稱要完全
  一樣（含大小寫與空格）。
- **資料夾路徑**（選填）：vault 內的相對路徑，例如 `00_inbox/clip-vault`。
  留空就存在 vault 根目錄。

收藏時擴充會開一個背景分頁把 `obsidian://new?vault=...&file=...&content=...`
丟給瀏覽器，觸發作業系統把它交給 Obsidian App，幾秒後那個分頁會自動關掉。

### 已知限制

- **第一次會跳出系統確認框**：瀏覽器問「是否要開啟 Obsidian？」，這是外部
  協定處理的標準行為，擴充功能這邊沒辦法繞過去；勾選瀏覽器提供的「一律
  允許」之後就不會再問。
- **本機要有裝 Obsidian 桑面版**，而且該 vault 要用 Obsidian 開過至少一次
  （行動裝置、網頁版 Obsidian 都吃不到 `obsidian://` 協定）。
- **URI 有長度上限**（隨作業系統/瀏覽器而不同，這裡保守拓 6000 字元）。內容
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
├── options.html / options.js # 設定頁：Drive 連接／資料夾選擇、Obsidian 設定
├── onboarding.html / onboarding.js
├── icons/
└── src/
    ├── adapters.js       # 5 個社群平台的 DOM 錨點（沿用 PostSync）
    ├── extract.js        # 從貼文 DOM 抽出結構化資料（沿用 PostSync）
    ├── naming.js          # 檔名／筆記名規則（沿用 PostSync）
    ├── generic-extract.js # 通用網頁擷取（新增，輕量版）
    ├── content.js         # 浮動按鈕、右鍵選單、toast（整合社群＋通用）
    ├── background.js      # OAuth、Drive 寫入、Obsidian 交棒、去重
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
- `drive.file` scope 之下，擴充只能看到、修改它自己建立的檔案，或使用者透過
  Picker 明確選過的資料夾。
- Obsidian 目的地完全在本機完成，不經過任何網路請求。

## License

MIT
