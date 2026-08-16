#!/usr/bin/env python3
"""
從 extension/manifest.template.json 讀佔位符版本，套上 .env 裡的
GOOGLE_OAUTH_CLIENT_ID 與 GOOGLE_PICKER_API_KEY，輸出成真正的
extension/manifest.json。

extension/manifest.json 本身不進版控（見 .gitignore）——這樣你自己的
Google Cloud 專案代號就不會出現在 git 歷史裡，即使這個 repo 是公開的。

用法：
    cp .env.example .env      # 第一次用先建立自己的 .env
    # 編輯 .env，填入 Google Cloud Console 拿到的兩組憑證
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

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "extension" / "manifest.template.json"
OUTPUT = ROOT / "extension" / "manifest.json"
ENV_FILE = ROOT / ".env"

CLIENT_ID_PLACEHOLDER = "REPLACE_ME_WITH_YOUR_OWN_CLIENT_ID.apps.googleusercontent.com"
PICKER_KEY_PLACEHOLDER = "REPLACE_ME_WITH_YOUR_PICKER_API_KEY"


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

    template = json.loads(TEMPLATE.read_text(encoding="utf-8"))
    ext_id = extension_id(template)
    if ext_id:
        print(f"這個 repo 的擴充功能 ID：{ext_id}")
        print(f"OAuth redirect URI 要登記：https://{ext_id}.chromiumapp.org/")

    env = dict(__import__("os").environ)
    env.update(load_env(ENV_FILE))

    client_id = env.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    picker_key = env.get("GOOGLE_PICKER_API_KEY", "").strip()

    if not client_id:
        print(
            "尚未設定 GOOGLE_OAUTH_CLIENT_ID（Google Drive 功能無法使用，"
            "Obsidian 仍可正常運作）。cp .env.example .env 後填入即可。",
            file=sys.stderr,
        )
    if not picker_key:
        print(
            "尚未設定 GOOGLE_PICKER_API_KEY（設定頁的「選擇資料夾」按鈕無法使用）。",
            file=sys.stderr,
        )

    manifest_text = TEMPLATE.read_text(encoding="utf-8")
    manifest_text = manifest_text.replace(CLIENT_ID_PLACEHOLDER, client_id or CLIENT_ID_PLACEHOLDER)
    manifest_text = manifest_text.replace(PICKER_KEY_PLACEHOLDER, picker_key or PICKER_KEY_PLACEHOLDER)

    manifest = json.loads(manifest_text)  # 驗證輸出仍是合法 JSON，壞掉的話寧可不寫檔
    OUTPUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已產生 {OUTPUT}")


if __name__ == "__main__":
    main()
