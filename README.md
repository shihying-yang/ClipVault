[English](README.md) | [繁體中文](README_zh.md)

---

# ⚡ Clip Vault — Web & Social Media Content Clipper

> Capture posts, long-form articles, and high-resolution images from the web and social platforms straight into your **Google Drive**, **Obsidian**, or **Local Computer (Markdown)** with one click!

Clip Vault is an open-source, privacy-first Chrome / Chromium browser extension. Designed specifically for avid readers, researchers, and knowledge workers: accurately captures structured post formatting and full-resolution images across Facebook, Threads, Instagram, X (Twitter), and LinkedIn, while also intelligently extracting clean article content from general web pages.

---

## ✨ Why You Will Love Clip Vault

* 🕊 **Clean, Elegant & Non-Intrusive**  
  Zero annoying UI overlays during regular browsing. By default, the **"⚡ Clip this"** button gently reveals itself in the top-right corner only when you **hold down the `Alt` key (Mac: `Option`) and hover over a post**.
* 📱 **Flawless Social Media Formatting**  
  Fine-tuned for modern social algorithms and dynamic layouts: automatically expands truncated text ("See more"), strips sponsor / tracking noise, and captures author attribution, publication timestamp, and canonical post permalinks.
* 🖼 **Deep Image Harvesting (Multi-Photo Album Pagination)**  
  When encountering Facebook album posts with more than 5 images (e.g. "+7", "+12" overlay tiles), Clip Vault automatically and safely paginates through the photo viewer in the background, **collecting up to 30 full-resolution original photos** without downscaled thumbnails or broken links!
* 📦 **Three Independent Storage Destinations**  
  Mix and match freely — enable only what you need:
  1. **Local Markdown**: 100% account-free, zero setup. Directly saves clean `.md` files to your Downloads folder.
  2. **Obsidian**: Silent native URI invocation with **zero tab flicker**. Creates formatted notes inside your local vault instantly.
  3. **Google Drive**: Generates a dedicated Google Doc per clipping with images embedded inline and automatic multi-level subfolder creation.
* 🔒 **100% Private & Serverless Architecture**  
  All network operations occur strictly between your local browser and your personal storage (local disk or personal cloud). No intermediate third-party servers, tracking, or data leakage.

---

## 🚀 3-Minute Quick Start

### 1. Choose Your Installation Path

Clip Vault provides two distribution methods. Choose according to your preferred storage destination:

| Installation Path | Python Required? | Local Markdown | Obsidian | Google Drive | Best For |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Path A: Release ZIP (Ready to Use)** | ❌ **No** | ✅ Supported | ✅ Supported | ❌ **Not Supported** | Most users who want immediate clipping to Local MD or Obsidian without setup. |
| **Path B: Source Code (Full Customization)** | Requires Python 3 | ✅ Supported | ✅ Supported | ✅ **Supported** | Users who want to save clippings directly to personal Google Drive documents. |

---

#### Path A: Download Release ZIP (Recommended! Ready in 30 seconds)
> 💡 **Note**: Tailored for users who only want to save to **Local Markdown** or **Obsidian**. **No Python installation or API setup required!**  
> *(Notice: Due to open-source security standards, pre-packaged release ZIPs do not bundle private Google OAuth credentials, so **Google Drive is disabled by default**).*

1. Go to the [Releases Page](https://github.com/shihying-yang/ClipVault/releases) and download the latest `ClipVault-vX.X.X.zip`.
2. Extract the ZIP archive to a folder on your computer (e.g., `D:\ClipVault` or Documents).
3. Open your Chromium-based browser and navigate to the Extensions management page:
   * **Google Chrome**: `chrome://extensions`
   * **Brave**: `brave://extensions`
   * **Vivaldi**: `vivaldi://extensions`
   * **Microsoft Edge**: `edge://extensions`
4. Toggle on **"Developer mode"** in the top-right (or left sidebar).
5. Click **"Load unpacked"** and select the unzipped folder.
6. Done! The ⚡ **Clip Vault** icon will appear in your browser toolbar. Pin it for easy access and start clipping!

---

#### Path B: Download Source Code (If you need Google Drive)
> 💡 **Note**: To save clippings as Google Docs in your personal Google Drive, you must download the source repository to link your own free Google Cloud API credentials for privacy and quota isolation.

1. **Download the Repository**:
   * **ZIP Download**: Click the green **`Code`** button on GitHub → select **`Download ZIP`** and extract it.
   * **Or via Git**: `git clone https://github.com/shihying-yang/ClipVault.git`
2. **One-Click Build**: Make sure Python 3 is installed, open your terminal in the project directory, and run:
   ```bash
   python tools/build_manifest.py
   ```
3. **Load into Browser**: In `chrome://extensions`, enable Developer mode → click "Load unpacked" → ⚠️ **Select the `extension` subfolder** inside the repository.
4. **Authorize Google Drive**: Follow the [Google Drive First-Time Setup](#-google-drive-first-time-setup) section below.

#### 💡 Tip: How to Package and Share with Others
To package the built extension for backup or sharing:
* **One-Click Local Packaging Script**: Run `python tools/package_extension.py` in your terminal to automatically output a clean, standards-compliant `dist/ClipVault-vX.X.X.zip`.
* **Pack via Browser**: Click "Pack extension" in `chrome://extensions` and select the `extension` folder to create a `.crx` package.

---

### 2. Configure Your Storage Destinations

Click the Clip Vault icon on your browser toolbar → select **"⚙️ Settings"**:
* **Save to Local Markdown (Recommended for beginners)**:
  * Check "Enable Local Markdown Files". Zero accounts required!
* **Sync to Obsidian**:
  * Check "Enable Obsidian" and type your Vault name (e.g., `My Notes`). Notes will be created silently with zero screen flash.
* **Save to Google Drive**:
  * Create your free Google API credentials (one-time setup; see [Google Drive First-Time Setup](#-google-drive-first-time-setup)), click "Connect Google" to authorize, and set your destination folder path.

---

## 🔑 Google Drive First-Time Setup

> [!IMPORTANT]
> **Why doesn't the Release ZIP support Google Drive out of the box?**  
> Clip Vault operates on a 100% serverless, zero-telemetry architecture. Data travels directly from your browser to your Google Drive without intermediate servers. To protect your privacy and API quotas, public release ZIPs **never bundle private Google OAuth credentials**.  
> If you want to use Google Drive, please follow **Path B** to download the source repository and complete the 6 steps below using your own free Google Cloud project.

If you only use **Local Markdown** or **Obsidian**, **you can safely skip this entire section**!

1. **Create a Google Cloud Project**: Visit the [Google Cloud Console](https://console.cloud.google.com/), create a new project, and enable both the **Google Drive API** and **Google Docs API** under "APIs & Services".
2. **Configure OAuth Consent Screen**:
   - Go to "OAuth consent screen" → select User Type: **External**.
   - Enter your App name (e.g. `Clip Vault`) and developer contact email.
   - Under Scopes, add `.../auth/drive.file` (this is a non-sensitive scope that requires no Google verification and has no user count limits).
   - Switch Publishing status to **In Production**.
3. **Obtain Redirect URI**:
   - Run the build script once in your terminal:
     ```bash
     python tools/build_manifest.py
     ```
   - The terminal will print your unique extension redirect URI, for example:
     `https://hiekfmjdkkghmkomeahhhghdigbmchcf.chromiumapp.org/`
4. **Create Credentials**:
   - Go to "Credentials" → click "Create Credentials" → select **"OAuth client ID"**.
   - Choose Application type: **"Web application"**.
   - Under "Authorized redirect URIs", paste the exact URI printed in Step 3.
5. **Fill in `.env`**:
   - Copy `.env.example` in the project root to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Open `.env` and fill in your Client ID and Client Secret:
     ```env
     GOOGLE_OAUTH_CLIENT_ID=your_client_id.apps.googleusercontent.com
     GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
     ```
6. **Generate Extension Files**:
   - Re-run the build script:
     ```bash
     python tools/build_manifest.py
     ```
   - In your browser, open Clip Vault Settings, click "Connect Google", complete OAuth authorization, and configure your target Drive folder!

---

## 💡 Daily Usage Guide

### 1. Clipping Social Media Posts (FB / IG / Threads / X / LinkedIn)
* **Method A (Alt-Hover, Recommended)**: Hold down the `Alt` key (Mac: `Option`), move your mouse over any post, and click the floating **"⚡ Clip this"** button.
* **Method B (Right-Click Context Menu)**: Right-click anywhere on the post container → select **"⚡ Clip to Clip Vault"**.

### 2. Clipping General Web Articles
* **Selected Text Only**: Highlight any passage you want to extract → press `Alt` and click the floating button in the bottom-right corner (or right-click) → extracts only the highlighted excerpt.
* **Full Article Extraction**: With nothing highlighted → press `Alt` and click the bottom-right button → automatically detects the main article content and archives the full post.

### 3. Popup Diagnostics & Utilities
Click the Clip Vault extension icon in your browser toolbar to access handy tools anytime:
* **`🔍 Inspect Current Tab`**: Diagnostic scanner that audits DOM selectors, post count, target locks, and image evaluation reports.
* **`🧹 Clear Seen Cache`**: Wipes the 5,000-entry local deduplication cache instantly if you want to re-test or force-reclip a post.

---

## ❓ Frequently Asked Questions (FAQ)

**Q: Do I have to sign in with a Google account to use Clip Vault?**  
Not at all! Clip Vault provides completely independent "Local Markdown" and "Obsidian" storage backends. If you do not need Google Drive cloud syncing, zero Google sign-in or setup is required.

**Q: Will the clip buttons obstruct my web reading?**  
No! Clip Vault is designed to be quiet and invisible. Buttons only appear when you hold down the `Alt` key while hovering over a post. You can also change the trigger key to `Ctrl` or set it to `Always visible` in Settings.

**Q: Can it capture Facebook album posts with more than 5 images?**  
Yes! Facebook hides extra photos behind "+N" overlay tiles. Clip Vault automatically opens the photo viewer in the background and pages through each photo with the right arrow key, gathering up to 30 original high-resolution photos before restoring your reading position.

**Q: Is it compatible with Vivaldi, Brave, and Edge?**  
100% compatible! Any modern Chromium-based browser (Chrome, Brave, Vivaldi, Microsoft Edge, Comet) works out of the box.

---

## 🛠 For Developers & Maintainers

To explore architectural blueprints, MV3 background service worker lifecycle, cross-browser OAuth 2.0 exchange, image harvesting mechanisms, and anti-scraping text normalization:

👉 Read the [**Maintainer Implementation Guide (docs/IMPLEMENTATION.md)**](docs/IMPLEMENTATION.md)  
👉 Read the [**Changelog & Release Notes (CHANGELOG.md)**](CHANGELOG.md)

---

## 📄 License

[MIT License](LICENSE)
