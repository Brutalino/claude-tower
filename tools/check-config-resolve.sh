#!/bin/bash
# Tests bin/CCtower's configuration gate (decision 053) on throwaway git folders, never the person's: tower_config_for
# (the edition's project by its origin, a worktree of it, a stored configuration, nothing), then CCtower itself with a
# stand-in `claude` on PATH and its own tmux socket (an explicit TOWER_TMUX_SOCKET): a folder with no configuration and
# no TOWER_REPO starts a free Tower there (decision 060), TOWER_REPO starts the edition's project as before, a folder
# with a stored configuration wins over TOWER_REPO (decision 055); without an edition TOWER_REPO starts nothing of its
# own (decision 083). The edition is a stand-in, acmeco/shopapp, in a copy of the plugin, whatever edition this tree
# has. Without an explicit socket TOWER_REPO no longer makes a folder the edition's: tools/check-tower-socket.sh.
# Tower's files go to a scratch TOWER_STATE_DIR. Usage: tools/check-config-resolve.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
work=$(cd "$(mktemp -d)" && pwd -P)
socket="towertest-config-$$"
trap 'tmux -L "$socket" kill-server 2>/dev/null || true; rm -rf "$work"' EXIT
awk '/^(edition_file|tower_config_for)\(\) \{/{f=1} f{print} f&&/^}$/{f=0}' "$ROOT/bin/CCtower" >"$work/functions.sh"
# shellcheck source=/dev/null
source "$work/functions.sh"
bad=0
check() { # check NAME WANT GOT
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: want '$2', got '$3'"; bad=$((bad + 1)); fi
}
repo() { # repo DIR ORIGIN: a git folder with one commit and that origin
  mkdir -p "$1"
  git -C "$1" init -q
  git -C "$1" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
  [ -z "$2" ] || git -C "$1" remote add origin "$2"
}
state_dir="$work/state"
# A copy of the plugin whose edition is a stand-in (hooks/testedition/repo-slug): the functions and CCtower read it.
plugin_root="$work/plugin"
mkdir -p "$plugin_root"
rsync -a --exclude .git --exclude node_modules --exclude .smoke --exclude .shots --exclude .env "$ROOT/" "$plugin_root/"
rm -f "$plugin_root"/hooks/*/repo-slug "$plugin_root"/hooks/*/dotenv-repo
mkdir -p "$plugin_root/hooks/testedition"
printf 'acmeco/shopapp\n' >"$plugin_root/hooks/testedition/repo-slug"
id_of() { printf '%s' "$1" | sed 's/[^a-zA-Z0-9]/-/g'; }

repo "$work/shopapp" https://github.com/acmeco/shopapp.git
repo "$work/shopapp-ssh" git@github.com:AcmeCo/ShopApp.git
git -C "$work/shopapp" worktree add -q -b tkt-1 "$work/shopapp-TKT-1"
repo "$work/other" https://github.com/someone/other.git
repo "$work/local" ""
mkdir -p "$work/plain"

check "ShopApp by its https origin" edition "$(tower_config_for "$work/shopapp" || true)"
check "ShopApp by its ssh origin, case aside" edition "$(tower_config_for "$work/shopapp-ssh" || true)"
check "a ShopApp worktree" edition "$(tower_config_for "$work/shopapp-TKT-1" || true)"
check "another repository: nothing" "none" "$(tower_config_for "$work/other" || echo none)"
check "no origin: nothing" "none" "$(tower_config_for "$work/local" || echo none)"
check "not a git folder: nothing" "none" "$(tower_config_for "$work/plain" || echo none)"
mkdir -p "$state_dir/projects"
printf '[]\n' >"$state_dir/projects/$(id_of "$work/other").json"
check "a stored file that is no object: nothing" "none" "$(tower_config_for "$work/other" || echo none)"
printf '{"version": 1}\n' >"$state_dir/projects/$(id_of "$work/other").json"
check "a stored configuration" stored "$(tower_config_for "$work/other" || true)"
check "the stored id is the main checkout's (TS projectId)" "$work/state/projects/$(id_of "$work/other").json" "$(ls "$state_dir"/projects/*.json)"
rm -f "$state_dir/projects/"*.json

# CCtower itself: a stand-in claude, a scratch state folder, no .env, its own socket.
mkdir -p "$work/bin"
printf '#!/bin/sh\nexec sleep 60\n' >"$work/bin/claude"
chmod +x "$work/bin/claude"
run() { # run DIR [TOWER_REPO]: CCtower --no-attach in DIR; prints its exit code, then its error output
  (cd "$1" && env -u TOWER_REPO PATH="$work/bin:$PATH" TOWER_NO_DOTENV=1 TOWER_STATE_DIR="$state_dir" TOWER_MUTE=1 \
    TOWER_TMUX_SOCKET="$socket" TOWER_THEME=claude ${2:+TOWER_REPO="$2"} "$plugin_root/bin/CCtower" --no-attach 2>"$work/err" >/dev/null && echo 0 || echo $?)
  cat "$work/err"
}
out="$(run "$work/other")"
check "CCtower in a folder with no configuration and no TOWER_REPO starts" 0 "$(printf '%s\n' "$out" | head -1)"
check "a free Tower (decision 060)" "TOWER_MODE=free" "$(tmux -L "$socket" show-environment -t tower TOWER_MODE 2>/dev/null)"
check "in that folder" "$work/other" "$(tmux -L "$socket" display-message -p -t tower '#{pane_current_path}' 2>/dev/null)"
tmux -L "$socket" kill-server 2>/dev/null || true
out="$(run "$work/other" "$work/shopapp")"
check "TOWER_REPO starts tower as before" 0 "$(printf '%s\n' "$out" | head -1)"
check "the rail runs in TOWER_REPO" "$work/shopapp" "$(tmux -L "$socket" display-message -p -t tower '#{pane_current_path}' 2>/dev/null)"
check "as ShopApp, not free" none "$(tmux -L "$socket" show-environment -t tower TOWER_MODE 2>/dev/null || echo none)"
tmux -L "$socket" kill-server 2>/dev/null || true
out="$(run "$work/shopapp-TKT-1")"
check "a ShopApp worktree without TOWER_REPO starts as before" 0 "$(printf '%s\n' "$out" | head -1)"
tmux -L "$socket" kill-server 2>/dev/null || true
out="$(run "$work/shopapp-TKT-1" "$work/shopapp")"
check "a ShopApp worktree with TOWER_REPO starts as before" 0 "$(printf '%s\n' "$out" | head -1)"
check "the rail runs in TOWER_REPO, as before" "$work/shopapp" "$(tmux -L "$socket" display-message -p -t tower '#{pane_current_path}' 2>/dev/null)"
tmux -L "$socket" kill-server 2>/dev/null || true

# The current folder first (decision 055): a stored configuration wins over TOWER_REPO; a folder without one
# still opens TOWER_REPO.
mkdir -p "$state_dir/projects"
printf '{"version": 1}\n' >"$state_dir/projects/$(id_of "$work/other").json"
out="$(run "$work/other" "$work/shopapp")"
check "a stored (oink-like) folder with TOWER_REPO set starts" 0 "$(printf '%s\n' "$out" | head -1)"
check "the rail runs in the stored folder, not TOWER_REPO" "$work/other" "$(tmux -L "$socket" display-message -p -t tower '#{pane_current_path}' 2>/dev/null)"
tmux -L "$socket" kill-server 2>/dev/null || true
out="$(run "$work/plain" "$work/shopapp")"
check "a folder outside git with TOWER_REPO starts as before" 0 "$(printf '%s\n' "$out" | head -1)"
check "the rail runs in TOWER_REPO (ShopApp)" "$work/shopapp" "$(tmux -L "$socket" display-message -p -t tower '#{pane_current_path}' 2>/dev/null)"
tmux -L "$socket" kill-server 2>/dev/null || true
rm -f "$state_dir/projects/"*.json

# Without an edition (decision 083): its origin is no project and TOWER_REPO with an explicit socket makes nothing the
# edition's; the folder resolves on its own.
rm -f "$plugin_root/hooks/testedition/repo-slug"
check "no edition: its origin gives nothing" "none" "$(tower_config_for "$work/shopapp" || echo none)"
out="$(run "$work/other" "$work/shopapp")"
check "no edition: CCtower in a folder with no configuration and TOWER_REPO starts" 0 "$(printf '%s\n' "$out" | head -1)"
check "a free Tower in that folder, not TOWER_REPO" "TOWER_MODE=free $work/other" "$(tmux -L "$socket" show-environment -t tower TOWER_MODE 2>/dev/null) $(tmux -L "$socket" display-message -p -t tower '#{pane_current_path}' 2>/dev/null)"
tmux -L "$socket" kill-server 2>/dev/null || true

if [ $bad -eq 0 ]; then echo "config resolve: ok"; else echo "config resolve: $bad failed"; exit 1; fi
