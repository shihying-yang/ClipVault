#!/usr/bin/env python3
"""
原始碼靜態掃描工具：檢查 JavaScript 檔案中是否存在未跳脫的字面不可見字元。

背景說明：
若將不可見字元（如零寬空格 U+200B、字元混淆 U+034F、ASCII 控制碼）以字面形式直接貼進代碼，
在 JS 引擎中雖然可能正常執行，但會導致整個原始碼被作業系統與 Git / grep 當作二進位（Binary）檔案，
從而使 grep 搜尋完全靜音回傳空值，造成「明明有寫函式卻搜不到」的重大困擾。

規範：
所有不可見字元必須一律寫成標準十六進位跳脫形式（例如 \\x00、\\u00AD、\\u200B）。
"""
import pathlib
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent

# 偵測非跳脫形式的實體不可見字元
INVISIBLE = re.compile(
    "[\x00-\x08\x0b-\x1f\x7f"           # 控制字元 (Control characters)
    "\u00ad\u034f\u200b-\u200f"          # 軟連字號、組合用字元、方向控制
    "\u202a-\u202e"                      # 雙向文字控制字元 (BiDi controls)
    "\u2060-\u2069\u206a-\u206f\ufeff]"   # 格式字元、BOM
)


def scan_sources() -> int:
    bad = 0
    js_files = sorted((ROOT / "extension").rglob("*.js"))
    print(f"=== 🔍 正在掃描 {len(js_files)} 個 JavaScript 檔案中的不可見字元 ===")

    for f in js_files:
        try:
            text = f.read_text(encoding="utf-8")
        except Exception as e:
            print(f"  ⚠️ 無法讀取 {f.relative_to(ROOT)}: {e}")
            continue

        for n, line in enumerate(text.split("\n"), 1):
            for m in INVISIBLE.finditer(line):
                bad += 1
                char_code = ord(m.group())
                print(
                    f"  ❌ {f.relative_to(ROOT)}:{n} 發現字面不可見字元 "
                    f"U+{char_code:04X}（請改寫為跳脫形式 \\u{char_code:04X} 或 \\x{char_code:02X}）"
                )

    if bad == 0:
        print("  ✅ 掃描完成！所有原始碼均乾淨無未跳脫的不可見字元。")
    else:
        print(f"  ❌ 掃描完成：共發現 {bad} 處未跳脫的不可見字元！")
    return bad


if __name__ == "__main__":
    sys.exit(scan_sources())
