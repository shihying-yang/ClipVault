#!/usr/bin/env python3
"""
從 extension/manifest.template.json + extension/src/background.template.js
讀佔位符版本，套上 .env 裡的 GOOGLE_OAUTH_CLIENT_ID／
GOOGLE_OAUTH_CLIENT_SECRET，輸出成真正的 extension/manifest.json 與
extension/src/background.js。

extension/manifest.json 、extension/src/background.js 本身都不進版控
（見 .gitignore）——這樣你自己的 GCP 專案代號與 client secret 就不會出現
在 git 歷史裡，即使這個 repo 是公開的。

為什麼 client secret 要嵌在 background.js 而不是放在 manifest.json：
Chrome（尤其 Comet）對 manifest.json 有 schema 驗證，不認得的頂層自訂
欄位不是單純警告，是真的會被濴掉（"Unrecognized manifest key"），
導致 chrome.runtime.getManifest() 永遠拿不到它。background.js 是純 JS
檔案，Chrome 不會對它做 manifest schema 檢查，寫什麼都不會被濴。

重要：SECRET_PLACEHOLDER 這個完整字串只會出現在
 background.template.js 裡「宣告預設值」那一行，不能跟檔案裡其他
地方用來判斷「有沒有被設定過」的字串完全相同，否則那個判斷式也會被
這裡的整體字串替換一併換掉，變成 secret.startsWith(secret 自己) 永遠
是 true。所以 background.template.js 裡的判斷式用的是跟這個完整字串不同
的短前綴（REPLACE_ME），跟 client_id 那邊的 clientIdSet() 寫法一致。

用法：
    cp .env.example .env      # 第一次用先建立自己的 .env
    # 編輯 .env，填入 Google Cloud Console 拿到的 client_id 與 client_secret
    python3 tools/build_manifest.py

跑完之後 extension/ 資料夾就是完整可載入的擴充功能，到瀏覽器的
擴充功能頁面（chrome://extensions、vivaldi://extensions、
brave://extensions、Comet 對應頁面）「載入未封裝項目」選 extension
資料夾即可。
"""
import base64
import hashlib
import json
import pathlib
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "extension" / "manifest.template.json"
OUTPUT = ROOT / "extension" / "manifest.json"
BG_TEMPLATE = ROOT / "extension" / "src" / "background.template.js"
BG_OUTPUT = ROOT / "extension" / "src" / "background.js"
ENV_FILE = ROOT / ".env"

PLACEHOLDER = "REPLACE_ME_WITH_YOUR_OWN_CLIENT_ID.apps.googleusercontent.com"
SECRET_PLACEHOLDER = "REPLACE_ME_WITH_YOUR_OWN_CLIENT_SECRET"


def load_env(path):
    values = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        values[key.strip()] = val.strip().strip('"').strip("'")
    return values


def extension_id(manifest):
    key_b64 = manifest.get("key", "")
    if not key_b64:
        return None
    der = base64.b64decode(key_b64)
    digest = hashlib.sha256(der).hexdigest()[:32]
    return "".join(chr(ord("a") + int(c, 16)) for c in digest)


def main():
    if not TEMPLATE.exists():
        print(f"找不到 {TEMPLATE}", file=sys.stderr)
        sys.exit(1)
    if not BG_TEMPLATE.exists():
        print(f"找不到 {BG_TEMPLATE}", file=sys.stderr)
        sys.exit(1)

    template = json.loads(TEMPLATE.read_text(encoding="utf-8"))
    ext_id = extension_id(template)
    if ext_id:
        print(f"這個 repo 的擴充功能 ID：{ext_id}")
        print(f"OAuth redirect URI 要登記：https://{ext_id}.chromiumapp.org/")

    env = dict(__import__("os").environ)
    env.update(load_env(ENV_FILE))

    client_id = env.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    client_secret = env.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
    if not client_id:
        print(
            "尚未設定 GOOGLE_OAUTH_CLIENT_ID（Google Drive 功能無法使用，"
            "Obsidian 仍可正常運作）。cp .env.example .env 後填入即可。",
            file=sys.stderr,
        )
    elif not client_secret:
        print(
            "尚未設定 GOOGLE_OAUTH_CLIENT_SECRET——Drive 授權改用 Authorization "
            "Code 流程（換 refresh_token，避免每天都要重新同意），這個流程需要"
            "同一個 OAuth client 底下的 client secret，去 Google Cloud Console "
            "那個 OAuth 用戶端的頁面複製貼上即可。",
            file=sys.stderr,
        )

    manifest_text = TEMPLATE.read_text(encoding="utf-8")
    manifest_text = manifest_text.replace(PLACEHOLDER, client_id or PLACEHOLDER)
    manifest = json.loads(manifest_text)  # 驗證輸出仍是合法 JSON，壞掉的話寧可不寫檔
    OUTPUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已產生 {OUTPUT}")

    bg_text = BG_TEMPLATE.read_text(encoding="utf-8")
    bg_text = bg_text.replace(SECRET_PLACEHOLDER, client_secret or SECRET_PLACEHOLDER)
    BG_OUTPUT.write_text(bg_text, encoding="utf-8")
    print(f"已產生 {BG_OUTPUT}")


if __name__ == "__main__":
    main()
