#!/usr/bin/env python3
"""
Clip Vault 打包工具
功能：
1. 自動執行 build_manifest.py 確保 manifest.json 與 background.js 為最新版本
2. 將 extension/ 目錄打包成 dist/ClipVault-v{version}.zip
3. 自動排除範本檔案 (*.template.*) 與作業系統快取暫存檔
4. 輸出結構符合 Chrome Web Store 上傳規範與手動載入未封裝項目需求
"""
import json
import os
import pathlib
import subprocess
import sys
import zipfile

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXT_DIR = ROOT / "extension"
DIST_DIR = ROOT / "dist"
MANIFEST_TEMPLATE = EXT_DIR / "manifest.template.json"
BUILD_SCRIPT = ROOT / "tools" / "build_manifest.py"

# 打包時應排除的檔案與資料夾名稱
EXCLUDE_PATTERNS = {
    ".DS_Store",
    "Thumbs.db",
    "manifest.template.json",
    "background.template.js",
}


def get_version():
    with open(MANIFEST_TEMPLATE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("version", "1.0.0")


def build():
    print("▶ [1/3] 執行 build_manifest.py 產生最新設定檔...")
    res = subprocess.run([sys.executable, str(BUILD_SCRIPT)], cwd=str(ROOT))
    if res.returncode != 0:
        print("❌ build_manifest.py 執行失敗！")
        sys.exit(res.returncode)


def package():
    version = get_version()
    DIST_DIR.mkdir(exist_ok=True)
    zip_name = f"ClipVault-v{version}.zip"
    zip_path = DIST_DIR / zip_name

    print(f"▶ [2/3] 開始打包擴充功能：{zip_name} ...")

    file_count = 0
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(EXT_DIR):
            dirs[:] = [d for d in dirs if not d.startswith(".") and not d.startswith("__")]
            for file in files:
                if file in EXCLUDE_PATTERNS:
                    continue
                if file.startswith(".") or file.startswith("__"):
                    continue
                full_path = pathlib.Path(root) / file
                rel_path = full_path.relative_to(EXT_DIR)
                zf.write(full_path, arcname=str(rel_path).replace("\\", "/"))
                file_count += 1

    size_kb = zip_path.stat().st_size / 1024
    print(f"▶ [3/3] 打包完成！")
    print(f"  - 檔案路徑: {zip_path}")
    print(f"  - 檔案大小: {size_kb:.2f} KB")
    print(f"  - 包含檔案: {file_count} 個")
    return zip_path


if __name__ == "__main__":
    build()
    package()
