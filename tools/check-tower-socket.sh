#!/bin/bash
# Tests bin/CCtower's socket per project (decision 059) on throwaway git folders and a scratch TOWER_STATE_DIR, never
# the person's: ShopApp and its worktree on `tower`, an oink-like stored configuration (and its worktree) on
# `tower-<slug>`, a slug two main checkouts share taking a hash, the slug's shape, which sockets count as Towers; then
# CCtower itself with a stand-in `claude`: an explicit TOWER_TMUX_SOCKET wins, --kill in a folder with no project
# closes nothing, --list and --kill-all with no Tower and with one (a `tower-check` link to a towertest server's
# socket). Every tmux server it starts is a `towertest-*` one, killed at the end; TMUX_TMPDIR is a scratch folder, so
# no command can reach the person's sockets.
# Usage: tools/check-tower-socket.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
work=$(cd "$(mktemp -d)" && pwd -P)
# A short path: a unix socket's path has at most 104 bytes on macOS.
export TMUX_TMPDIR="$(cd "$(mktemp -d /tmp/towertest.XXXXXX)" && pwd -P)"
socket="towertest-socket-$$"
trap 'tmux -L "$socket" kill-server 2>/dev/null || true; rm -rf "$work" "$TMUX_TMPDIR"' EXIT
awk '/^(edition_file|tower_config_for|resolve_project|design_open|remembered_free|tower_socket_for|project_socket|base36|free_socket|tower_socket_dir|tower_sockets|main_of|project_of)\(\) \{/{f=1} f{print} f&&/^}$/{f=0}' \
  "$ROOT/bin/CCtower" >"$work/functions.sh"
# shellcheck source=/dev/null
source "$work/functions.sh"
# resolve_project asks the design state through the plugin's tools (decision 064).
# A plugin root of the check's own (decision 083): the plugin's tools, and a stand-in edition whose repository is
# acmeco/shopapp (hooks/<edition>/repo-slug), whatever edition this tree has.
plugin_root="$work/plugin"
mkdir -p "$plugin_root/hooks/testedition"
ln -s "$ROOT/tools" "$plugin_root/tools"
printf 'acmeco/shopapp\n' >"$plugin_root/hooks/testedition/repo-slug"
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
id_of() { printf '%s' "$1" | sed 's/[^a-zA-Z0-9]/-/g'; }
store() { mkdir -p "$state_dir/projects"; printf '{"version": 1}\n' >"$state_dir/projects/$(id_of "$1").json"; }
hash6() { /usr/bin/python3 -I -c 'import hashlib, sys; print(hashlib.sha1(sys.argv[1].encode()).hexdigest()[:6])' "$1"; }
socket_in() { # socket_in DIR [record]: the socket a launch in DIR opens, TOWER_REPO unset; `free`: a free Tower's own
  (cd "$1" && unset TOWER_REPO && resolve_project && if [ "$project_kind" = free ]; then echo free; else project_socket "${2:-}"; fi) || echo "none"
}

repo "$work/shopapp" https://github.com/acmeco/shopapp.git
git -C "$work/shopapp" worktree add -q -b tkt-1 "$work/shopapp-TKT-1"
repo "$work/money-tracker" https://github.com/Brutalino/oink.git
git -C "$work/money-tracker" worktree add -q -b issue-26 "$work/oink-26"
repo "$work/other/money-tracker" ""
repo "$work/My Repo.v2!" ""
repo "$work/a-very-long-repository-name-for-the-socket" ""
repo "$work/unknown" ""
store "$work/money-tracker"
store "$work/other/money-tracker"
store "$work/My Repo.v2!"
store "$work/a-very-long-repository-name-for-the-socket"

check "the edition's project: tower" tower "$(socket_in "$work/shopapp")"
check "a ShopApp worktree: tower" tower "$(socket_in "$work/shopapp-TKT-1")"
check "TOWER_REPO set, no explicit socket: a folder with no project is free (decision 060)" free "$(cd "$work/unknown" && TOWER_REPO="$work/shopapp" && unset TOWER_TMUX_SOCKET && resolve_project && echo "$project_kind")"
check "TOWER_REPO set with an explicit socket: the edition's, as test launches need" "edition $work/shopapp" "$(cd "$work/unknown" && TOWER_REPO="$work/shopapp" TOWER_TMUX_SOCKET=towertest-x && resolve_project && echo "$project_kind $repo")"
mv "$plugin_root/hooks/testedition/repo-slug" "$work/repo-slug"
check "without an edition: its origin is no project, TOWER_REPO with an explicit socket neither (decision 083)" "free free" "$(socket_in "$work/shopapp") $(cd "$work/unknown" && TOWER_REPO="$work/shopapp" TOWER_TMUX_SOCKET=towertest-x && resolve_project && echo "$project_kind")"
mv "$work/repo-slug" "$plugin_root/hooks/testedition/repo-slug"
check "a folder outside git: free" free "$(socket_in "$work")"
check "an oink-like stored configuration: tower-<slug>" tower-money-tracker "$(socket_in "$work/money-tracker")"
check "nothing recorded before a launch" none "$(cat "$state_dir/sockets.json" 2>/dev/null || echo none)"
check "a launch records it" tower-money-tracker "$(socket_in "$work/money-tracker" record)"
check "in sockets.json, by main checkout" tower-money-tracker "$(/usr/bin/python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$state_dir/sockets.json" "$work/money-tracker")"
check "its worktree: the main checkout's socket" tower-money-tracker "$(socket_in "$work/oink-26")"
check "another main checkout with the same folder name: hashed" "tower-money-tracker-$(hash6 "$work/other/money-tracker")" "$(socket_in "$work/other/money-tracker" record)"
check "the hashed one is stable" "tower-money-tracker-$(hash6 "$work/other/money-tracker")" "$(socket_in "$work/other/money-tracker")"
check "the first keeps its plain socket" tower-money-tracker "$(socket_in "$work/money-tracker")"
check "the slug: lowercase, other characters one -" tower-my-repo-v2 "$(socket_in "$work/My Repo.v2!")"
check "the slug: at most 24 characters" tower-a-very-long-repository-n "$(socket_in "$work/a-very-long-repository-name-for-the-socket")"
check "a git folder with no configuration: free" free "$(socket_in "$work/unknown")"
mkdir -p "$work/money-tracker/Sources/App" "$work/oink-26/Sources" "$work/shopapp-TKT-1/apps/web"
check "a subfolder of the main checkout: its socket" tower-money-tracker "$(socket_in "$work/money-tracker/Sources/App")"
check "a subfolder of a worktree: the main checkout's socket" tower-money-tracker "$(socket_in "$work/oink-26/Sources")"
check "a subfolder of a ShopApp worktree: tower" tower "$(socket_in "$work/shopapp-TKT-1/apps/web")"
# The configuration is read at every launch: a repository with none is free until its file is written.
repo "$work/later" ""
git -C "$work/later" worktree add -q -b later-1 "$work/later-1"
check "a repository before its configuration: free" free "$(socket_in "$work/later")"
check "its worktree before: free" free "$(socket_in "$work/later-1")"
store "$work/later"
check "the same repository once its configuration is written: tower-<slug>" tower-later "$(socket_in "$work/later")"
check "its worktree after: the same socket" tower-later "$(socket_in "$work/later-1")"
rm -f "$state_dir/projects/$(id_of "$work/later").json"
check "its configuration removed: free again" free "$(socket_in "$work/later")"
# A free Tower's socket: new at every launch (each launch is its own process).
one="$(bash -c 'source "$1"; free_socket' _ "$work/functions.sh")"
two="$(bash -c 'source "$1"; free_socket' _ "$work/functions.sh")"
check "a free socket: tower-free-<base 36>" yes "$(printf '%s' "$one" | grep -qE '^tower-free-[0-9a-z]+$' && echo yes || echo "no: $one")"
check "two launches, two sockets" different "$([ "$one" != "$two" ] && echo different || echo "same: $one")"
check "base36" "0 z 10 zz" "$(base36 0) $(base36 35) $(base36 36) $(base36 1295)"

# Which sockets are Towers: `tower` and `tower-*` sockets in tmux's folder, never legacyui, towergen or a plain file.
dir="$(tower_socket_dir)"
check "tmux's folder follows TMUX_TMPDIR" "$TMUX_TMPDIR/tmux-$(id -u)" "$dir"
mkdir -p "$dir"
chmod 700 "$dir" # tmux refuses a folder others can read
/usr/bin/python3 -I -c '
import os, socket, sys
for name in sys.argv[2:]:
    socket.socket(socket.AF_UNIX).bind(os.path.join(sys.argv[1], name))
' "$dir" tower tower-money-tracker legacyui towergen towertest-1
: >"$dir/tower-file"
check "tower_sockets: tower and tower-* sockets only" "$dir/tower $dir/tower-money-tracker" "$(tower_sockets | tr '\n' ' ' | sed 's/ $//')"
rm -f "$dir"/tower "$dir"/tower-*

# CCtower itself: a stand-in claude, a scratch state folder, no .env.
mkdir -p "$work/bin"
printf '#!/bin/sh\nexec sleep 60\n' >"$work/bin/claude"
chmod +x "$work/bin/claude"
run() { # run DIR ARGS...: CCtower ARGS in DIR, TOWER_REPO unset; prints its exit code, then its output
  local dir="$1"
  shift
  (cd "$dir" && env -u TOWER_REPO PATH="$work/bin:$PATH" TOWER_NO_DOTENV=1 TOWER_STATE_DIR="$state_dir" TOWER_MUTE=1 \
    TOWER_THEME=claude "$ROOT/bin/CCtower" "$@" </dev/null >"$work/out" 2>&1 && echo 0 || echo $?)
  cat "$work/out"
}
rm -f "$state_dir/sockets.json"
out="$(TOWER_TMUX_SOCKET="$socket" run "$work/money-tracker" --no-attach)"
check "an explicit TOWER_TMUX_SOCKET wins: the Tower starts there" 0 "$(printf '%s\n' "$out" | head -1)"
check "and runs in the stored folder" "$work/money-tracker" "$(tmux -L "$socket" display-message -p -t tower '#{pane_current_path}' 2>/dev/null)"
check "and records no project socket" none "$(cat "$state_dir/sockets.json" 2>/dev/null || echo none)"
out="$(TOWER_TMUX_SOCKET="$socket" run "$work/shopapp" --kill)"
check "--kill with TOWER_TMUX_SOCKET closes that Tower, whatever the folder" "killed $socket (money-tracker · $work/money-tracker)" "$(printf '%s\n' "$out" | sed -n 2p)"
check "and it is gone" none "$(tmux -L "$socket" has-session -t tower 2>/dev/null && echo running || echo none)"
out="$(TOWER_TMUX_SOCKET="$socket" run "$work/shopapp" --kill)"
check "--kill with nothing running says so" "no Tower running on $socket" "$(printf '%s\n' "$out" | sed -n 2p)"
out="$(run "$work/unknown" --kill)"
check "--kill in a folder with no project closes nothing and fails" 1 "$(printf '%s\n' "$out" | head -1)"
check "and says why" "CCtower: this folder has no project: each launch here opens a free Tower of its own; nothing closed" "$(printf '%s\n' "$out" | sed -n 2p)"
check "then lists the Towers and how to close one" "no Tower running|close one with q then y in it, TOWER_TMUX_SOCKET=<socket> CCtower --kill, or every one with CCtower --kill-all" "$(printf '%s\n' "$out" | sed -n '3,4p' | paste -sd '|' -)"
out="$(run "$work/unknown" --list)"
check "--list with no Tower" "0 no Tower running" "$(printf '%s\n' "$out" | tr '\n' ' ' | sed 's/ $//')"
out="$(run "$work/unknown" --kill-all)"
check "--kill-all with no Tower" "0 no Tower running" "$(printf '%s\n' "$out" | tr '\n' ' ' | sed 's/ $//')"
check "--kill-all leaves other servers' sockets alone" "legacyui towergen towertest-1" "$(ls "$dir" | grep -vx "$socket" | tr '\n' ' ' | sed 's/ $//')"
# A live Tower for --list and --kill-all: the towertest server, seen through a `tower-check` link to its socket.
out="$(TOWER_TMUX_SOCKET="$socket" run "$work/money-tracker" --no-attach)"
check "a towertest Tower starts" 0 "$(printf '%s\n' "$out" | head -1)"
ln -s "$dir/$socket" "$dir/tower-check"
out="$(run "$work/unknown" --list)"
check "--list: a header, then socket, project and folder" "$(printf '0\n%-28s %-20s %s\n%-28s %-20s %s' socket project folder tower-check money-tracker "$work/money-tracker")" "$out"
out="$(run "$work/unknown" --kill)"
check "--kill in a folder with no project lists the running Tower and closes nothing" "$(printf '1\nCCtower: this folder has no project: each launch here opens a free Tower of its own; nothing closed\n%-28s %-20s %s\n%-28s %-20s %s\nclose one with q then y in it, TOWER_TMUX_SOCKET=<socket> CCtower --kill, or every one with CCtower --kill-all' socket project folder tower-check money-tracker "$work/money-tracker")" "$out"
check "and it still runs" running "$(tmux -L "$socket" has-session -t tower 2>/dev/null && echo running || echo none)"
mv "$dir/tower-check" "$dir/tower-free-k3x9a1"
out="$(run "$work/unknown" --list)"
check "--list names any tower-* socket (a free Tower's too)" "tower-free-k3x9a1" "$(printf '%s\n' "$out" | sed -n 3p | awk '{print $1}')"
mv "$dir/tower-free-k3x9a1" "$dir/tower-check"
check "--list leaves it running" running "$(tmux -L "$socket" has-session -t tower 2>/dev/null && echo running || echo none)"
out="$(run "$work/unknown" --kill-all)"
check "--kill-all says what it killed" "$(printf '0\nkilled tower-check (money-tracker · %s)' "$work/money-tracker")" "$out"
check "and it is gone" none "$(tmux -L "$socket" has-session -t tower 2>/dev/null && echo running || echo none)"
rm -f "$dir/tower-check"
# Launches with a stand-in tmux that starts nothing and logs every call: free launches never reach a real server.
mkdir -p "$work/fake"
cat >"$work/fake/tmux" <<'FAKE'
#!/bin/bash
# A stand-in tmux: logs each call (and whether LINEAR_API_KEY reached it); FAKE_RUNNING names the one running socket.
printf '%s | LINEAR=%s\n' "$*" "${LINEAR_API_KEY:-}" >>"$FAKE_LOG"
[ "$1" = -L ] || [ "$1" = -S ] || exit 1
name="${2##*/}"
shift 2
case "$1" in
  has-session|list-sessions) [ "$name" = "${FAKE_RUNNING:-}" ] ;;
  show-environment) [ "$name" = "${FAKE_RUNNING:-}" ] && printf 'TOWER_REPO=%s\n' "$FAKE_REPO" ;;
  new-session) printf '%%0\n' ;;
  show-options) exit 1 ;;
  *) exit 0 ;;
esac
FAKE
chmod +x "$work/fake/tmux"
fake() { # fake DIR ARGS...: CCtower in DIR with the stand-in tmux and a LINEAR_API_KEY in its environment
  local dir="$1"
  shift
  (cd "$dir" && env -u TOWER_REPO -u TOWER_TMUX_SOCKET PATH="$work/fake:$work/bin:$PATH" FAKE_LOG="$work/tmux.log" TOWER_NO_DOTENV=1 \
    TOWER_STATE_DIR="$state_dir" TOWER_MUTE=1 TOWER_THEME=claude LINEAR_API_KEY=lin_test_key "$ROOT/bin/CCtower" "$@" </dev/null >/dev/null 2>&1 && echo 0 || echo $?)
}
started() { grep ' new-session ' "$work/tmux.log" | sed -E 's/^-L ([^ ]+) .*/\1/'; }
: >"$work/tmux.log"
check "tower in a folder with no project starts" 0 "$(fake "$work/unknown")"
check "tower there again starts another" 0 "$(fake "$work/unknown")"
check "two free Towers, two sockets" "2 2" "$(started | wc -l | tr -d ' ') $(started | sort -u | grep -cE '^tower-free-[0-9a-z]+$')"
check "each a free one: TOWER_MODE=free" 2 "$(grep ' new-session ' "$work/tmux.log" | grep -c -- '-e TOWER_MODE=free')"
check "each attached to its own socket" "$(started | tr '\n' ' ')" "$(grep ' attach -t tower ' "$work/tmux.log" | sed -E 's/^-L ([^ ]+) .*/\1/' | tr '\n' ' ')"
check "a free Tower never gets the Linear key" 0 "$(grep -c 'LINEAR=lin_test_key' "$work/tmux.log")"
: >"$work/tmux.log"
check "outside git, with TOWER_REPO in the environment: free too" 0 "$(cd "$work" && TOWER_REPO="$work/shopapp" fake "$work")"
check "on a tower-free socket" yes "$(started | grep -qE '^tower-free-' && echo yes || echo no)"
: >"$work/tmux.log"
check "a project folder starts its own Tower" 0 "$(fake "$work/money-tracker")"
check "on tower-money-tracker, with the Linear key, not free" "tower-money-tracker 1 0" "$(started) $(grep ' new-session ' "$work/tmux.log" | grep -c 'LINEAR=lin_test_key') $(grep ' new-session ' "$work/tmux.log" | grep -c 'TOWER_MODE=free')"
: >"$work/tmux.log"
check "a project folder whose Tower runs attaches" 0 "$(FAKE_RUNNING=tower-money-tracker FAKE_REPO="$work/money-tracker" fake "$work/oink-26")"
check "without starting another" "0 1" "$(started | wc -l | tr -d ' ') $(grep -c '^-L tower-money-tracker attach -t tower ' "$work/tmux.log")"
out="$(run "$work/unknown" --bogus)"
check "the usage line names every mode" "usage: CCtower [--no-attach | --kill | --kill-all | --list] [--theme ghostty|claude|terminal|matrix] [--bg <hex>]" "$(printf '%s\n' "$out" | sed -n 2p)"

if [ $bad -eq 0 ]; then echo "tower socket: ok"; else echo "tower socket: $bad failed"; exit 1; fi
