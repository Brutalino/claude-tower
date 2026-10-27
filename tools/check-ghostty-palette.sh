#!/bin/bash
# Tests bin/CCtower's Ghostty colours (decision 039) on fixture files, never the person's config:
# ghostty_palette (theme file, config override, light:/dark:, Ghostty's own theme folder, nothing found) and
# ghostty_roles (the mapping and the done contrast pick). Usage: tools/check-ghostty-palette.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
awk '/^(ghostty_palette|ghostty_roles)\(\) \{/{f=1} f{print} f&&/^}$/{f=0}' "$ROOT/bin/CCtower" >"$work/functions.sh"
# shellcheck source=/dev/null
source "$work/functions.sh"
bad=0
check() { # check NAME WANT GOT
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: want $2, got $3"; bad=$((bad + 1)); fi
}
field() { /usr/bin/python3 -I -c 'import json,sys; v=json.loads(sys.argv[1])
for k in sys.argv[2].split("."): v=v[k]
print(v)' "$1" "$2"; }

config="$work/config" builtin="$work/builtin"
mkdir -p "$config/themes" "$builtin"
cat >"$config/themes/leaf" <<'T'
background = #080b08
foreground = a9cdb2
cursor-color = #81b991
selection-background = #1b452d
palette = 1=#ec5d5d
palette = 2=#589c6f
palette = 8=#4a6152
palette = 10=#81b991
palette = 15=#e1f1e5
T
cat >"$builtin/night" <<'T'
background = #000000
palette = 2=#102010
palette = 10=#80ff80
T
cat >"$builtin/day" <<'T'
background = #ffffff
T

printf 'theme = leaf\n' >"$config/config"
json=$(ghostty_palette "$config" "$builtin")
check 'theme file: background' '#080B08' "$(field "$json" background)"
check 'theme file: foreground without #' '#A9CDB2' "$(field "$json" foreground)"
check 'theme file: palette 2' '#589C6F' "$(field "$json" palette.2)"

printf 'theme = leaf\nbackground = #111111\npalette = 2=#222222\nbackground = 121212\n' >"$config/config"
json=$(ghostty_palette "$config" "$builtin")
check 'config overrides the theme, last line wins' '#121212' "$(field "$json" background)"
check 'config palette overrides the theme' '#222222' "$(field "$json" palette.2)"
check 'theme colours the config leaves alone stay' '#81B991' "$(field "$json" cursor-color)"

printf 'theme = light:day,dark:night\n' >"$config/config"
json=$(ghostty_palette "$config" "$builtin")
check 'light:/dark: takes dark, from the built-in folder' '#000000' "$(field "$json" background)"
check 'the theme name' 'night' "$(field "$json" theme)"

printf 'font-family = Mono\n' >"$config/config"
if ghostty_palette "$config" "$builtin" >/dev/null; then check 'no colours fails' fail ok; else check 'no colours fails' fail fail; fi
if ghostty_palette "$work/none" "$builtin" >/dev/null; then check 'no config fails' fail ok; else check 'no config fails' fail fail; fi

printf 'theme = leaf\n' >"$config/config"
roles=$(ghostty_roles "$(ghostty_palette "$config" "$builtin")" '#080B08')
check 'surface' '#080B08' "$(field "$roles" surface)"
check 'text = foreground' '#A9CDB2' "$(field "$roles" text)"
check 'bright text = palette 15 without selection-foreground' '#E1F1E5' "$(field "$roles" brightText)"
check 'dim = palette 8' '#4A6152' "$(field "$roles" dim)"
check 'faint = selection-background' '#1B452D' "$(field "$roles" faint)"
check 'accent = cursor-color' '#81B991' "$(field "$roles" accent)"
check 'error = palette 1' '#EC5D5D' "$(field "$roles" error)"
check 'done = palette 2 with enough contrast' '#589C6F' "$(field "$roles" done)"
check 'a missing colour takes the claude one' '#E0B341' "$(field "$roles" needsYou)"
check 'other = palette 8' '#4A6152' "$(field "$roles" models.other)"

printf 'theme = night\n' >"$config/config"
roles=$(ghostty_roles "$(ghostty_palette "$config" "$builtin")" '#000000')
check 'done = palette 10 when 2 is too dark' '#80FF80' "$(field "$roles" done)"

echo "ghostty palette: $([ "$bad" = 0 ] && echo ok || echo "$bad failure(s)")"
exit $((bad > 0))
