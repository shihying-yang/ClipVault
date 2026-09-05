[English](CHANGELOG.md) | [繁體中文](CHANGELOG_zh.md)

---

# Changelog & Release Notes

All notable changes to Clip Vault will be documented in this file.

## [1.2.3] - 2026-09-05

### 🚀 Optimizations & Upstream Sync (PostSync v1.5.0)
- **Shared Binary Image Cache (`blobCache`)**:
  - Implemented an in-memory byte buffer cache in the service worker (`background.js`).
  - Ensures that during multi-step image uploading and processing (e.g., Google Drive fallback uploads), any given image URL is downloaded from the origin server (Facebook / Instagram CDN) strictly once, saving bandwidth and preventing rate-limiting.
- **Static Invisible Characters Scanner Tool (`tools/scan_invisible.py`)**:
  - Added an automated developer tool to recursively inspect all JavaScript files for unescaped non-printable Unicode characters (such as zero-width spaces, BiDi overrides, and control codes).
  - Enforces standard hex escape sequences (`\x00-\x08`, `\u00AD`, `\u200B`) across all regex patterns, permanently preventing OS tools, Git, and grep from misidentifying source files as binary.
- **Upstream Alignment**:
  - Verified and confirmed parity with upstream PostSync v1.5.0 updates.

---

## [1.2.2] - 2026-09-03

### 🐛 Bug Fixes & Text Sanitization
- **Standalone Post URL Inheritance (`story.php`, etc.)**:
  - When the internal post DOM lacks an internal self-referential hyperlink, Clip Vault automatically checks if the active browser tab URL is a standalone post permalink (e.g. Facebook `story.php`, `/posts/`, or standalone posts on X/Threads/IG).
  - Sanitizes tracking and junk parameters (`mibextid`, `rdid`, `fbclid`, `__cft__`, `__tn__`, `#`) and adopts the canonical URL directly.
  - Formats valid markdown hyperlinks directly, eliminating confusing "cannot find original link" warnings.
- **Pure String-Level Filtering for Facebook Navigation & Decoy Characters**:
  - Drops isolated lines containing only the brand name `Facebook`.
  - Drops isolated single-character ASCII lines (`^[\x20-\x7E]$` — letters, digits, timestamps, and colons) split by Facebook anti-scraping logic.
  - Cleans invisible bidirectional control characters (BiDi overrides `\u202A-\u202E` and `\u2060-\u2069`).
  - Automatically deduplicates author name if repeated at the very start of the body text.
  - Ignores `Facebook` in author cleaning to accurately detect true author names.
  - **Zero Side-Effects**: Keeps post container matching and DOM visibility checks strictly unchanged, ensuring 100% stability for Alt-hover buttons and post text extraction.
- **Automated Packaging & Release Workflows (CI/CD & Local Package)**:
  - Added `tools/package_extension.py` for one-click local packaging of standard, clean `dist/ClipVault-vX.X.X.zip`.
  - Established GitHub Actions workflow (`.github/workflows/release.yml`) to automatically build and attach `.zip` release assets whenever version tags (`v*`) are pushed.

---

## [1.2.1] - 2026-09-03

### 🐛 Bug Fixes
- **Completely Fixed "⚡ Clip this" Button Text Leaking into Post Body**:
  - **Root Cause**: In specific social post DOM structures where internal `ad.text` anchors missed or triggered `innerText` fallback while the button was visible, browsers read the top-right button text into the document body.
  - **5-Layer Defense Net**:
    1. **Temporarily Hide During Capture**: `content.js` hides `.clipvault-post-btn` (`display: none`) while extracting to prevent browser selection/innerText leakage.
    2. **DOM Text Filtering**: `extract.js` filters out `CLIPVAULT_UI_TEXT` in `postText` and `innerText` fallbacks.
    3. **Action Words Exclusion**: Added extension UI button labels to `adapters.js` `ACTION_WORDS`.
    4. **Generic Page Protection**: `generic-extract.js` rejects `.clipvault-*` elements in text selection and tree walking.
    5. **Backend Sanitization**: `background.js` `cleanText()` performs a final clean before writing to any storage destination.

---

## [1.2.0] - 2026-09-03

### 🚀 New Features
- **Facebook Album Multi-Photo Automatic Pagination**:
  - For album posts containing "+N" overlay tiles, automatically opens the photo viewer temporarily and paginates with the right arrow key (`ArrowRight`) to harvest original high-resolution photos (up to 30 images).
  - Safety Guards: 45-second timeout and 2-consecutive-dry-run exit mechanism; automatically presses `Escape` to close the viewer and restores the exact URL and scroll position.
  - Added toggle in Settings to enable/disable album photo pagination.
- **Popup Diagnostics & Utilities Toolbox**:
  - **"🔍 Inspect Current Tab"**: Live audit of DOM selector matches, post count, lock status, and image verdict reports.
  - **"🧹 Clear Seen Cache"**: Instantly flushes the 5,000-entry `cvSeen` local cache for re-testing.
  - **Status Indicator**: Added LED indicator for "Local Markdown" in popup.

### 🛡 Security & Performance
- **Infinite Scroll Memory Protection**: When accumulated post count on social feeds exceeds 120, sorts by distance to the viewport vertical center and retains only the closest 120 posts, releasing distant button instances and DOM references to prevent memory leaks.
- **Escaped Hex Invisible Characters**: Standardized anti-scraping character cleanup regexes to standard hex escapes (`\x00-\x08\x0b-\x1f\x7f` and `\u00AD\u034F\u200B-\u200F`), preventing Git, OS tools, and grep from misidentifying source code as binary files.
- **Unified Image Verdict (`imageVerdict`)**: Centralized decision logic for avatars (header/alt tags), reaction icons, and unexpanded carousel images.

---

## [1.1.0] - 2026-09-03

### 🚀 New Features
- **On-Demand Clip Button Reveal**:
  - Kept off by default to maintain clean web reading.
  - Gently reveals "⚡ Clip this" only when holding `Alt` (Mac: `Option`) while hovering over a post.
  - Settings allows configuring trigger key to `Alt`, `Ctrl`, or `Always visible`.
- **Obsidian Zero-Tab-Flicker Silent Invocation**:
  - Invokes `obsidian://` protocol via dynamic hidden anchor in the content script.
  - Completely eliminates blank tab flashes that previously interrupted browsing for 1.5 seconds per clip.

### 🐛 Bug Fixes
- **Fixed Windows Chrome Alt Key Focus Hijacking**: On Windows, releasing `Alt` activated Chrome's top menu bar and blurred the web page, breaking subsequent Alt key presses; added `preventDefault()` on Alt key events.
- **Fixed IDM (Internet Download Manager) Conflict**: Removed redundant global `onDeterminingFilename` listener, passing filenames directly via `chrome.downloads.download({ filename })` parameters.
- **Permission Slimming**: Removed unused `scripting` permission from Manifest to adhere to Chrome Web Store least-privilege standards.

---

## [1.0.0] - 2026-09-02

### 🚀 Initial Release
- Support for 3 storage backends: Google Drive, Obsidian, Local Markdown.
- Dedicated adapters for Facebook, Threads, X, Instagram, LinkedIn.
- Generic web clipper for text selection and full-page heuristic extraction.
- Google Drive automatic multi-level folder creation and inline image embedding.
- 5,000-entry deduplication cache.
