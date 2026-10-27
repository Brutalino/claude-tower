#!/bin/bash
# Checks that the colour table in bin/CCtower carries the same values as hooks/core/theme.ts for every theme but
# ghostty, whose colours are read at runtime from Ghostty (decision 039; tools/check-ghostty-palette.sh tests them).
# The unit tests cannot read files, so this guard runs from the shell: tools/check-theme-colours.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
/usr/bin/python3 -I - "$ROOT" <<'PY'
import re, sys
root = sys.argv[1]
ts = open(f"{root}/hooks/core/theme.ts").read()
sh = open(f"{root}/bin/CCtower").read()
names = re.findall(r"THEME_NAMES\s*=\s*\[([^\]]*)\]", ts)
names = re.findall(r"'([a-z]+)'", names[0]) if names else []
keys = ["border", "borderActive", "hintKey", "hintWord"]
bad = 0
for name in names:
    if name == "ghostty":
        continue
    block = re.search(rf"\b{name}\s*:\s*\{{(.*?)\n\s*\}}", ts, re.S) or re.search(rf"const {name.upper()}\b.*?\{{(.*?)\n\}}", ts, re.S)
    if not block:
        print(f"theme.ts: no record for {name}"); bad += 1; continue
    want = {}
    for key in keys:
        m = re.search(rf"\b{key}\s*:\s*'([^']*)'", block.group(1))
        want[key] = m.group(1) if m else None
    case = re.search(rf"\n\s*{name}\)\s*(.*?);;", sh, re.S)
    if not case:
        print(f"CCtower: no case for {name}"); bad += 1; continue
    got = {}
    for key, var in (("border", "border"), ("borderActive", "border_active"), ("hintKey", "hint_key"), ("hintWord", "hint_word")):
        m = re.search(rf"\b{var}=['\"]?([^'\";\s]*)", case.group(1))
        got[key] = m.group(1) if m else None
    for key in keys:
        if want[key] != got[key]:
            print(f"{name}.{key}: theme.ts {want[key]!r} vs CCtower {got[key]!r}"); bad += 1
print("theme colours: ok" if bad == 0 else f"theme colours: {bad} mismatch(es)")
sys.exit(1 if bad else 0)
PY
