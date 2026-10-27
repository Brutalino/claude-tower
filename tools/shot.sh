#!/usr/bin/env bash
# Screenshot of tmux panes, side by side, as a PNG (no browser needed).
#   tools/shot.sh <tmux socket> <output name> <pane id> [<pane id> ...]
# Captures each pane with colours (tmux capture-pane -e), lays them out in one HTML page with
# tools/ansi2html.py, renders it with macOS Quick Look (qlmanage, which draws a square view) and
# crops the square to the content (columns x rows of the panes, found by a marker outline) with sips. Writes .shots/<output name>.png (and the .html beside it).
set -euo pipefail
[ $# -ge 3 ] || { echo "usage: $0 <tmux socket> <output name> <pane id> [<pane id> ...]" >&2; exit 2; }
socket=$1 name=$2; shift 2
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/.shots"; mkdir -p "$out"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
captures=()
for pane in "$@"; do
  f="$work/$(printf '%s' "$pane" | tr -c 'A-Za-z0-9' '_').ansi"
  tmux -L "$socket" capture-pane -e -p -t "$pane" > "$f"
  captures+=("$f")
done
read -r side width height < <(python3 "$root/tools/ansi2html.py" "$work/$name.html" "${captures[@]}")
qlmanage -t -s 3000 -o "$work" "$work/$name.html" >/dev/null 2>&1
png="$work/$name.html.png"
[ -f "$png" ] || { echo "Quick Look wrote no image" >&2; exit 1; }
# The content sits inside a 1px marker outline somewhere in the square: find it and crop just inside.
sips -s format bmp "$png" --out "$work/page.bmp" >/dev/null
read -r x y w h < <(python3 "$root/tools/ansi2html.py" --box "$work/page.bmp")
sips --cropOffset "$y" "$x" -c "$h" "$w" "$png" --out "$out/$name.png" >/dev/null
cp "$work/$name.html" "$out/$name.html"
echo "$out/$name.png"
