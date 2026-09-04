# ⚡ Clip Vault — 網頁與社群貼文收藏神器

> 瀏覽網頁或社群動態時，看到精采的貼文、長文或圖片，一鍵存入你的 **Google Drive**、**Obsidian** 或 **電腦本機（Markdown）**！

Clip Vault 是一款開源、隱私至上的 Chrome / Chromium 瀏覽器擴充功能。專為熱愛閱讀與做知識筆記的使用者打造：在 Facebook、Threads、Instagram、X (Twitter)、LinkedIn 上能精準抓取貼文格式與高畫質圖片；在一般網頁上亦能智慧萃取重點文章。

---

## ✨ 為什麼你會喜歡 Clip Vault？

* 🕊 **乾淨無擾，安靜優雅**  
  平常閱讀時網頁完全不顯示任何突兀按鈕。預設**按住 `Alt` 鍵（Mac 為 `Option`）且滑鼠指向貼文時**，右上角才會悄悄浮現「⚡ 收這篇」，絕不打擾你的瀏覽體驗。
* 📱 **社群貼文格式完美保留**  
  專為各大社群演算法與複雜排版調校：自動展開「查看更多」、過濾廣告干擾，作者、發布時間與原文超連結自動歸檔。
* 🖼 **極限圖片收集（相簿多圖翻頁）**  
  遇到 Facebook 超過 5 張圖的相簿貼文（帶有「+7」、「+12」等疊圖）時，自動在背景安全翻頁，**完整收集高達 30 張高畫質原圖**，徹底告別縮圖與破圖！
* 📦 **三大儲存目的地，自由隨心搭配**  
  三個目的地各自獨立，想存哪裡就開哪裡：
  1. **本機 Markdown**：完全免帳號、免設定，一鍵直接下載標準 `.md` 檔案至下載資料夾。
  2. **Obsidian**：原生協定無感喚起，**零分頁閃爍**，筆記瞬間在你的本機筆記庫中建立。
  3. **Google Drive**：一文一份專屬 Google Doc，圖片直接內嵌於文件內，支援多層子資料夾自動建立。
* 🔒 **100% 隱私安全，無中繼伺服器**  
  你的每一份資料都直接在瀏覽器與你的個人儲存空間（本機或私有雲端）之間流通，不經由任何第三方伺服器，安全零外洩。

---

## 🚀 三分鐘快速上手

### 1. 選擇最適合你的安裝途徑

Clip Vault 提供兩種取得方式，請依據你預計使用的儲存目的地選擇：

| 安裝途徑 | 免安裝 Python？ | 支援本機 Markdown | 支援 Obsidian | 支援 Google Drive | 適合對象 |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **途徑 A：下載 Release ZIP（即裝即用）** | ✅ **是** | ✅ 支援 | ✅ 支援 | ❌ **不支援** | 絕大多數使用者，不想安裝 Python 或設定 API。 |
| **途徑 B：下載專案原始碼（完整自訂）** | 需 Python 3 | ✅ 支援 | ✅ 支援 | ✅ **支援** | 需要存入個人 Google Drive 雲端文件的使用者。 |

---

#### 途徑 A：下載 Release ZIP（推薦！30 秒即裝即用）
> 💡 **說明**：專為只想使用「本機 Markdown」或「Obsidian」的使用者設計。**完全不需安裝 Python，解壓即用！**  
> *(注意：因開源安全規範，公開預先封裝的 ZIP 檔不含任何私有 Google 金鑰，故**不支援 Google Drive** 功能)*

1. 前往本專案的 [Releases 頁面](https://github.com/shihying-yang/ClipVault/releases)，下載最新版本的 `ClipVault-vX.X.X.zip`。
2. 將壓縮檔解壓縮到你喜歡的位置（例如 `D:\ClipVault` 或「文件」資料夾中）。
3. 打開瀏覽器（Chrome/Brave/Vivaldi/Edge），在網址列輸入進入擴充管理頁面：
   * **Google Chrome**：`chrome://extensions`
   * **Brave**：`brave://extensions`
   * **Vivaldi**：`vivaldi://extensions`
   * **Microsoft Edge**：`edge://extensions`
4. 開啟右上角（或左側欄）的 **「開發人員模式 (Developer mode)」**。
5. 點擊 **「載入未封裝項目 (Load unpacked)」**，選取剛才解壓縮出來的資料夾。
6. 安裝成功！現在瀏覽器右上角擴充圖示列會出現 ⚡ **Clip Vault**，直接開始享受乾淨無干擾的網頁收錄！

---

#### 途徑 B：下載專案原始碼（若需要存入 Google Drive）
> 💡 **說明**：若您想將貼文轉存為個人 Google Drive 上的 Google Docs，因涉及個人隱私與免費 API 配額，需下載專案原始碼並綁定個人專屬金鑰。

1. **下載專案**：
   * **下載 ZIP**：點擊 GitHub 頁面右上角綠色的 **`Code`** 按鈕 → 選擇 **`Download ZIP`** 並解壓。
   * **或使用 Git**：`git clone https://github.com/shihying-yang/ClipVault.git`
2. **一鍵建置**：確保電腦安裝有 Python 3，在專案資料夾打開終端機執行：
   ```bash
   python tools/build_manifest.py
   ```
3. **載入瀏覽器**：至 `chrome://extensions` 開啟開發人員模式 → 點選「載入未封裝項目」→ ⚠️ **選取專案資料夾裡的 `extension` 子資料夾**。
4. **綁定 Google 授權**：依照下方 [Google Drive 首次連接設定](#-google-drive-首次連接設定) 填入金鑰即大功告成！

#### 💡 補充：如何自行打包分享給他人？
若您想把已建置好的擴充功能打包備份或分享：
* **一鍵本機打包腳本**：在專案終端機執行 `python tools/package_extension.py`，系統會在 `dist/` 目錄產出乾淨、標準的 `ClipVault-vX.X.X.zip`。
* **瀏覽器封裝成 .crx 檔**：在 `chrome://extensions` 頁面點擊「封裝擴充功能」，擴充功能根目錄選取 `extension` 資料夾即可。

### 2. 選擇你的儲存方式
點擊瀏覽器工具列的 Clip Vault 圖示 → 點選 **「⚙️ 開啟設定」**：
* **想直接存本機（新手最推薦）**：
  * 勾選「啟用本機 Markdown 檔案」，免任何帳號即可直接使用！
* **想同步到 Obsidian**：
  * 勾選「啟用 Obsidian」，輸入你的 Vault 名稱（例如 `我的筆記庫`），收錄時零分頁閃爍直接寫入。
* **想存到 Google Drive**：
  * 需要建立免費的 Google API 金鑰（只需設定一次，請見下方 [Google Drive 首次連接設定](#-google-drive-首次連接設定)），按「連接 Google」完成授權並填入存放路徑即可。

---

## 🔑 Google Drive 首次連接設定

> [!IMPORTANT]
> **為什麼 Release 的預先封裝 ZIP 不支援 Google Drive？**  
> Clip Vault 採用 100% 無伺服器架構，資料直連您的雲端硬碟，不經由任何第三方伺服器。為了保護個人帳戶隱私與 API 配額安全，公開發布的 `ClipVault-vX.X.X.zip` **絕不夾帶任何私有 Google 金鑰**。  
> 若您希望使用 Google Drive，請務必依照「途徑 B」下載專案原始碼，並依照下方 6 步驟綁定您專屬的免費 Google API 金鑰。

因為 Clip Vault 採用 100% 無伺服器架構，因此需要使用您自己的 Google Cloud 免費 API 金鑰：

1. **建立 Google 專案**：前往 [Google Cloud Console](https://console.cloud.google.com/)，點擊建立新專案，並在「API 和服務」中啟用 **Google Drive API** 與 **Google Docs API**。
2. **設定同意畫面**：
   - 前往「OAuth 同意畫面」→ 使用者類型選擇「外部」。
   - 填寫應用程式名稱（如 `Clip Vault`）與聯絡信箱。
   - 在 Scope 權限加入 `.../auth/drive.file`（此為非敏感權限，不需要 Google 審查，亦無使用者人數限制）。
   - 將發布狀態切換為「正式版」。
3. **取得重新導向網址 (Redirect URI)**：
   - 在終端機執行一次建置腳本：
     ```bash
     python tools/build_manifest.py
     ```
   - 終端機將會印出專屬的 Redirect URI，例如：
     `https://hiekfmjdkkghmkomeahhhghdigbmchcf.chromiumapp.org/`
4. **建立憑證**：
   - 前往「憑證」→「建立憑證」→ 選擇 **「OAuth 用戶端 ID」**。
   - 應用程式類型選擇 **「網頁應用程式」**。
   - 在「已授權的重新導向 URI」貼上步驟 3 印出的那串網址。
5. **填入設定檔**：
   - 複製專案目錄下的 `.env.example` 並命名為 `.env`：
     ```bash
     cp .env.example .env
     ```
   - 打開 `.env` 填入剛才拿到的 Client ID 與 Client Secret：
     ```env
     GOOGLE_OAUTH_CLIENT_ID=你的Client_ID.apps.googleusercontent.com
     GOOGLE_OAUTH_CLIENT_SECRET=你的Client_Secret
     ```
6. **產生擴充功能檔案**：
   - 重新執行一次建置指令：
     ```bash
     python tools/build_manifest.py
     ```
   - 回到瀏覽器點擊擴充功能圖示進入「⚙️ 開啟設定」，點擊「連接 Google」，即可一鍵登入授權並設定存放路徑！

---

## 💡 日常使用指南

### 1. 收藏社群貼文（FB / IG / Threads / X / LinkedIn）
* **方式 A（鍵盤懸停，推薦）**：按住鍵盤 `Alt` 鍵（Mac 為 `Option`），將滑鼠移至想收藏的貼文上方，點擊浮現的 **「⚡ 收這篇」**。
* **方式 B（滑鼠右鍵）**：直接在貼文上點擊滑鼠右鍵 → 選擇 **「⚡ 收藏到 Clip Vault」**。

### 2. 收藏一般網頁文章
* **選取部分文字**：反白選取想摘錄的精華段落 → 按住 `Alt` 點擊右下角按鈕（或右鍵選單）→ 僅收錄該段落精華。
* **收藏整篇網頁**：未選取任何文字時 → 按住 `Alt` 點擊右下角按鈕 → 自動辨識文章主文並收錄全篇。

### 3. 便捷工具箱（Popup 面板）
點擊瀏覽器右上角工具列的 Clip Vault 圖示，隨時可用：
* **`🔍 檢查目前分頁`**：遇到社群平台排版異常或想確認圖片收錄張數時，點擊即可一鍵探測當前頁面分析報告。
* **`🧹 清除去重紀錄`**：剛收錄過的貼文如果想重新測試或強制再存一次，點擊即可一秒清空去重快取。

---

## ❓ 常見問題 FAQ

**Q：我一定要登入 Google 帳號才能使用嗎？**  
完全不用！Clip Vault 提供獨立的「本機 Markdown 檔案」與「Obsidian」儲存方式。如果您不想使用雲端 Drive，不需要做任何 Google 授權，直接使用本機儲存即可。

**Q：按鈕平常會擋住我看網頁嗎？**  
不會！Clip Vault 預設為按需浮現（按住 `Alt` 鍵且滑鼠指著該貼文才出現）。如果您習慣常駐顯示按鈕，或是想改用 `Ctrl` 鍵觸發，都可以在設定頁的「按鈕顯示時機」中自由切換。

**Q：臉書多圖貼文（超過 5 張）能完整收錄嗎？**  
可以！臉書貼文常將其餘圖片藏在「+N」疊圖後面。Clip Vault 會自動辨識多圖相簿並在背景逐張翻頁，最高可收集 30 張原尺寸高畫質照片，收完會自動返回原網址與閱讀位置。

**Q：在 Vivaldi、Brave 等瀏覽器可以使用嗎？**  
完全相容！所有基於 Chromium 核心的現代瀏覽器（如 Chrome、Brave、Vivaldi、Edge、Comet）皆可完美執行。

---

## 🛠 給開發者與維護者

如果您想了解底層架構、MV3 權限模型、跨瀏覽器 OAuth 2.0 協定交換、相簿檢視器控制安全網、防爬蟲字元清洗等底層細節：

👉 請閱讀：[**維護者完整實作手冊 (docs/IMPLEMENTATION.md)**](docs/IMPLEMENTATION.md)  
👉 版本發布紀錄：[**更新日誌 (CHANGELOG.md)**](CHANGELOG.md)

---

## 📄 License

[MIT License](LICENSE)
