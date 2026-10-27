#!/bin/bash
# Tests bin/tower-install and the `tower` wrapper it writes (decision 066) in a scratch HOME, never the person's: the
# requirements report with stand-in tools, install into ~/.local/bin (off PATH: exit 4; --off-path), a `tower` that is not
# ours (exit 3, untouched; --replace moves it aside), the wrapper finding the installed plugin in a scratch
# installed_plugins.json (user scope, a project install for the folder, the newest, a version gone, CLAUDE_CONFIG_DIR and
# CLAUDE_CODE_PLUGIN_CACHE_DIR), TOWER_DEV_ROOT, the arguments handed to bin/CCtower, uninstall removing only ours, dirs;
# and bin/CCtower's .env lookup (plugin root, then the state dir). Usage: tools/check-tower-install.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
work=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$work"' EXIT
bad=0
check() { # check NAME WANT GOT
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: want '$2', got '$3'"; bad=$((bad + 1)); fi
}
contains() { # contains NAME NEEDLE HAYSTACK
  case "$3" in *"$2"*) echo "ok   $1" ;; *) echo "FAIL $1: '$2' not in: $3"; bad=$((bad + 1)) ;; esac
}

home="$work/home"
mkdir -p "$home" "$work/bin" "$work/empty"
# Stand-in tools: versions only; gh signed in.
stub() { printf '#!/bin/sh\n%s\n' "$2" >"$work/bin/$1"; chmod +x "$work/bin/$1"; }
stub tmux 'echo "tmux 3.5a"'
stub git 'echo "git version 2.50.1"'
stub claude 'echo "2.1.296 (Claude Code)"'
stub node 'echo "v22.18.0"'
stub gh 'case "$1" in --version) echo "gh version 2.80.0 (2025-09-01)";; auth) exit 0;; esac'
base="$work/bin:/usr/bin:/bin"
installer() { env -i HOME="$home" PATH="$1" TOWER_STATE_DIR="$home/.claude/tower" /bin/bash "$ROOT/bin/tower-install" "${@:2}"; }

# ── check
report="$(installer "$base" check)"
contains "check: tmux" "✓ tmux 3.5a" "$report"
contains "check: node 22.18 is enough" "✓ node v22.18.0" "$report"
contains "check: gh signed in" "✓ gh 2.80.0, signed in" "$report"
contains "check: no key" "– LINEAR_API_KEY" "$report"
check "check: nothing to brew" "" "$(printf '%s\n' "$report" | grep '^Missing' || true)"
stub node 'echo "v22.17.1"'
rm "$work/bin/tmux" "$work/bin/gh"
report="$(installer "$base" check)"
contains "check: node too old" "✗ node v22.17.1" "$report"
check "check: the brew line" "Missing: brew install tmux node gh" "$(printf '%s\n' "$report" | grep '^Missing: brew')"
mkdir -p "$home/.claude/tower" && : >"$home/.claude/tower/.env"
contains "check: a .env is only looked for" "? LINEAR_API_KEY" "$(installer "$base" check)"
contains "check: the key in the environment" "✓ LINEAR_API_KEY" "$(env -i HOME="$home" PATH="$base" LINEAR_API_KEY=x /bin/bash "$ROOT/bin/tower-install" check)"

# ── install
set +e
out="$(installer "$base" install)"; code=$?
set -e
check "install: ~/.local/bin off PATH asks (exit 4)" "4" "$code"
check "install: says which folder" "$(printf 'off-path\t%s' "$home/.local/bin")" "$out"
check "install: nothing written" "no" "$([ -e "$home/.local/bin/tower" ] && echo yes || echo no)"
onpath="$home/.local/bin:$base"
out="$(installer "$onpath" install)"
contains "install: written" "✓ tower installed: $home/.local/bin/tower" "$out"
contains "install: next step" "Next: cd <a repository or a folder> && tower" "$out"
check "install: executable" "yes" "$([ -x "$home/.local/bin/tower" ] && echo yes || echo no)"
out="$(installer "$onpath" install)"
contains "install: again over ours, no question" "✓ tower installed" "$out"
out="$(installer "$base" install --dir "$home/other" --off-path)"
contains "install: --off-path says how to add it" "is not on PATH yet" "$out"

# A tower that is not ours: shown, untouched, then replaced only with --replace.
mkdir -p "$home/bin"
printf '#!/bin/sh\nexec ~/dev/bin/CCtower "$@"\n' >"$home/bin/tower"
chmod +x "$home/bin/tower"
set +e
out="$(installer "$home/bin:$base" install --dir "$home/bin")"; code=$?
set -e
check "foreign: exit 3" "3" "$code"
contains "foreign: named" "$(printf 'exists\t%s' "$home/bin/tower")" "$out"
contains "foreign: shown" 'exec ~/dev/bin/CCtower "$@"' "$out"
check "foreign: untouched" 'exec ~/dev/bin/CCtower "$@"' "$(sed -n 2p "$home/bin/tower")"
out="$(installer "$home/bin:$base" install --dir "$home/bin" --replace)"
contains "foreign: replaced, kept aside" "kept as $home/bin/tower.before-tower" "$out"
check "foreign: the old one moved" 'exec ~/dev/bin/CCtower "$@"' "$(sed -n 2p "$home/bin/tower.before-tower")"

# ── the wrapper: which bin/CCtower it runs
fakeroot() { # fakeroot DIR: a plugin folder whose bin/CCtower prints its folder and arguments
  mkdir -p "$1/bin"
  printf '#!/bin/sh\necho "ran %s $*"\n' "$1" >"$1/bin/CCtower"
  chmod +x "$1/bin/CCtower"
}
cache="$home/.claude/plugins/cache/claude-tower/tower"
fakeroot "$cache/1.0.0"
fakeroot "$cache/1.1.0"
fakeroot "$work/money-tracker-local"
mkdir -p "$work/money-tracker/sub"
record() { # record JSON: installed_plugins.json in the default place
  printf '%s\n' "$1" >"$home/.claude/plugins/installed_plugins.json"
}
tower() { (cd "${CWD:-$work/empty}" && env -i HOME="$home" PATH="$onpath" ${EXTRA:+"$EXTRA"} "$home/.local/bin/tower" "$@"); }
set +e
out="$(tower --list 2>&1)"; code=$?
set -e
check "wrapper: no record, exit 1" "1" "$code"
contains "wrapper: no record says how to install" "/plugin install tower@claude-tower" "$out"
record '{"version": 2, "plugins": {"tower@claude-tower": [{"scope": "user", "installPath": "'"$cache/1.0.0"'", "version": "1.0.0", "lastUpdated": "2026-10-01T00:00:00Z"}]}}'
check "wrapper: the user install, arguments handed on" "ran $cache/1.0.0 --list --theme matrix" "$(tower --list --theme matrix)"
check "wrapper: --root" "$cache/1.0.0" "$(tower --root)"
record '{"version": 2, "plugins": {"tower@claude-tower": [{"scope": "user", "installPath": "'"$cache/1.0.0"'", "lastUpdated": "2026-10-01T00:00:00Z"}, {"scope": "user", "installPath": "'"$cache/1.1.0"'", "lastUpdated": "2026-10-12T00:00:00Z"}, {"scope": "local", "projectPath": "'"$work/money-tracker"'", "installPath": "'"$work/money-tracker-local"'", "lastUpdated": "2026-09-01T00:00:00Z"}], "other@x": []}}'
check "wrapper: the newest user install" "$cache/1.1.0" "$(tower --root)"
check "wrapper: a folder's own install wins there" "$work/money-tracker-local" "$(CWD="$work/money-tracker/sub" tower --root)"
rm -rf "$cache/1.1.0"
check "wrapper: a version gone from the cache is skipped" "$cache/1.0.0" "$(tower --root)"
mkdir -p "$work/config/plugins"
fakeroot "$work/config-root"
printf '{"version": 2, "plugins": {"tower@claude-tower": [{"scope": "user", "installPath": "%s"}]}}\n' "$work/config-root" >"$work/config/plugins/installed_plugins.json"
check "wrapper: CLAUDE_CONFIG_DIR" "$work/config-root" "$(EXTRA="CLAUDE_CONFIG_DIR=$work/config" tower --root)"
check "wrapper: CLAUDE_CODE_PLUGIN_CACHE_DIR" "$work/config-root" "$(EXTRA="CLAUDE_CODE_PLUGIN_CACHE_DIR=$work/config/plugins" tower --root)"
fakeroot "$work/dev"
check "wrapper: TOWER_DEV_ROOT wins" "ran $work/dev --kill" "$(EXTRA="TOWER_DEV_ROOT=$work/dev/" tower --kill)"
set +e
out="$(EXTRA="TOWER_DEV_ROOT=$work/nowhere" tower 2>&1)"; code=$?
set -e
check "wrapper: a TOWER_DEV_ROOT without bin/CCtower" "1 tower: TOWER_DEV_ROOT=$work/nowhere has no bin/CCtower" "$code $out"

# ── uninstall, dirs
set +e
out="$(installer "$home/bin:$base" uninstall --dir "$home/bin" 2>&1)"; code=$?
set -e
check "uninstall: ours in ~/bin removed" "0" "$code"
contains "uninstall: points at the old one" "still $home/bin/tower.before-tower" "$out"
mv "$home/bin/tower.before-tower" "$home/bin/tower"
set +e
out="$(installer "$home/bin:$base" uninstall --dir "$home/bin")"; code=$?
set -e
check "uninstall: a foreign tower left alone (exit 3)" "3" "$code"
check "uninstall: still there" "yes" "$([ -f "$home/bin/tower" ] && echo yes || echo no)"
installer "$onpath" uninstall >/dev/null
check "uninstall: ~/.local/bin/tower gone" "no" "$([ -e "$home/.local/bin/tower" ] && echo yes || echo no)"
contains "uninstall: nothing left to remove" "nothing to remove" "$(installer "$onpath" uninstall)"
check "dirs: writable PATH folders under HOME" "$(printf '%s\n%s' "$home/.local/bin" "$home/bin")" "$(installer "$home/.local/bin:/usr/bin:$home/bin:$home/missing:$home/bin/" dirs)"

# ── bin/CCtower's .env: the plugin root's first, then the state dir's
awk '/^dotenv_value\(\) \{/{f=1} f{print} f&&/^}$/{f=0}' "$ROOT/bin/CCtower" >"$work/dotenv.sh"
# shellcheck source=/dev/null
source "$work/dotenv.sh"
plugin_root="$work/plugin" state_dir="$work/state"
mkdir -p "$plugin_root" "$state_dir"
printf 'TOWER_THEME=matrix\n' >"$state_dir/.env"
check ".env: the state dir's when the plugin root has none" "matrix" "$(dotenv_value TOWER_THEME)"
printf 'export TOWER_THEME="claude"\n' >"$plugin_root/.env"
check ".env: the plugin root's first" "claude" "$(dotenv_value TOWER_THEME)"
printf 'LINEAR_API_KEY=fake\n' >>"$state_dir/.env"
check ".env: a name only in the state dir's" "fake" "$(dotenv_value LINEAR_API_KEY)"
check ".env: a name in neither" "missing" "$(dotenv_value NOPE || echo missing)"

if [ "$bad" -gt 0 ]; then echo "tower install: $bad failed"; exit 1; fi
echo "tower install: ok"
