#!/bin/bash
# Tests bin/CCtower's start menu and design mode (decision 064) on throwaway folders and a scratch TOWER_STATE_DIR, never
# the person's: the folder kinds and their entries, the menu's keys (fed from a file), the resolution order (stored
# configuration, then the design state, then a remembered free folder), TOWER_START, then CCtower itself with a stand-in
# tmux that starts no server and logs every call: Git repository hands TOWER_FREE_START=setup to the rail, New project writes
# .tower/design.json and starts one design Tower on tower-<slug> (attached to after), a stored configuration beats the
# design state; and the menu on a real terminal (`script`'s pty, keys typed with pauses): ↵, r remember (the next launch
# skips the menu), q. TMUX_TMPDIR is a scratch folder. Usage: tools/check-start-menu.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
work=$(cd "$(mktemp -d)" && pwd -P)
export TMUX_TMPDIR="$(cd "$(mktemp -d /tmp/towertest.XXXXXX)" && pwd -P)"
trap 'rm -rf "$work" "$TMUX_TMPDIR"' EXIT
awk '/^(die|edition_file|tower_config_for|resolve_project|design_open|remembered_free|remember_free|folder_kind|start_entries|start_menu|choose_start|apply_start|tower_socket_for|project_socket)\(\) \{/{f=1} f{print} f&&/^}$/{f=0}' \
  "$ROOT/bin/CCtower" >"$work/functions.sh"
# shellcheck source=/dev/null
source "$work/functions.sh"
# A plugin root of the check's own (decision 083): the plugin's tools, and a stand-in edition whose repository is
# acmeco/shopapp (hooks/<edition>/repo-slug), whatever edition this tree has.
plugin_root="$work/plugin"
mkdir -p "$plugin_root/hooks/testedition"
ln -s "$ROOT/tools" "$plugin_root/tools"
printf 'acmeco/shopapp\n' >"$plugin_root/hooks/testedition/repo-slug"
state_dir="$work/state"
bad=0
check() { # check NAME WANT GOT
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: want '$2', got '$3'"; bad=$((bad + 1)); fi
}
repo() { # repo DIR: a git folder with one commit
  mkdir -p "$1"
  git -C "$1" init -q
  git -C "$1" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
}
id_of() { printf '%s' "$1" | sed 's/[^a-zA-Z0-9]/-/g'; }
store() { mkdir -p "$state_dir/projects"; printf '{"version": 1}\n' >"$state_dir/projects/$(id_of "$1").json"; }
design() { "$ROOT/tools/tower-design-state.sh" -C "$1" init >/dev/null; }
stage8_done() { /usr/bin/python3 -I -c 'import json, sys
p = sys.argv[1]; s = json.load(open(p))
for stage in s["stages"]: stage["status"] = "done"
s["current"] = 8
json.dump(s, open(p, "w"))' "$1/.tower/design.json"; }
plain() { sed -E $'s/\033\\[[0-9;?]*[A-Za-z]//g; s/\r//g'; }
menu() { # menu KIND KEYS: the menu fed KEYS from a file; prints `<choice> <remember>` or `cancel`
  printf "$2" >"$work/keys"
  (menu_in="$work/keys" menu_out="$work/drawn" start_menu "$1" '~/x' && echo "$start_choice ${start_remember:-0}") || echo cancel
}

repo "$work/git"
mkdir -p "$work/empty" "$work/other"
: >"$work/empty/.DS_Store"
: >"$work/other/notes.txt"
check "a git folder" git "$(folder_kind "$work/git")"
check "a folder with only dotfiles is empty" empty "$(folder_kind "$work/empty")"
check "a folder with a file is other" other "$(folder_kind "$work/other")"
check "git: Git repository first, then Free session" "setup free" "$(start_entries git | cut -f1 | paste -sd ' ' -)"
check "empty: New project first, then Free session" "design free" "$(start_entries empty | cut -f1 | paste -sd ' ' -)"
check "other: Free session first, then New project" "free design" "$(start_entries other | cut -f1 | paste -sd ' ' -)"

# The menu's keys.
check "↵ opens the first entry" "setup 0" "$(menu git '\n')"
check "j then ↵ the second" "free 0" "$(menu git 'j\n')"
check "↓ (esc [ B) then ↵ the second" "free 0" "$(menu git '\033[B\n')"
check "j k then ↵ the first again" "setup 0" "$(menu git 'jk\n')"
check "k on the first stays" "design 0" "$(menu empty 'k\n')"
check "a digit opens its entry" "free 0" "$(menu git '2')"
check "a digit past the entries does nothing" "setup 0" "$(menu git '9\n')"
check "q cancels" cancel "$(menu git 'q')"
check "esc alone cancels" cancel "$(menu git '\033')"
check "the end of the keys cancels" cancel "$(menu git '')"
check "r then ↵ remembers" "free 1" "$(menu other 'r\n')"
check "r twice does not" "free 0" "$(menu other 'rr\n')"
menu git '' >/dev/null
check "the menu as drawn (git)" "$(printf ' Tower · ~/x\n ▸ Git repository — set up Tower for this repository (tower-setup)\n   Free session — Claude with the flightdeck, nothing set up\n ↑↓ choose · ↵ open · r remember for this folder · q cancel')" "$(plain <"$work/drawn")"
menu other 'j' >/dev/null
check "New project in a folder that is not empty: a warning line" " ! this folder is not empty: the new project is designed in it, beside what is there" "$(plain <"$work/drawn" | grep '^ !' | tail -1)"
menu other 'jr' >/dev/null
check "r on New project: only Free session is remembered" " ✓ remember: only Free session is remembered (the others become projects)" "$(plain <"$work/drawn" | grep '✓ remember' | tail -1)"

# The resolution order: stored configuration → design state → remembered free → free (the menu).
resolve_in() { (cd "$1" && unset TOWER_REPO TOWER_TMUX_SOCKET && resolve_project && echo "$project_kind${remembered:+ remembered}"); }
mkdir -p "$work/idea"
check "an empty folder: free" free "$(resolve_in "$work/idea")"
design "$work/idea"
check "with a design state: design" design "$(resolve_in "$work/idea")"
check "a design Tower's main is its folder" "$work/idea" "$(cd "$work/idea" && unset TOWER_REPO TOWER_TMUX_SOCKET && resolve_project && echo "$project_main")"
printf '{"version": 2}\n' >"$work/idea/.tower/design.json.bad"
mkdir -p "$work/broken/.tower" && printf '{"version": 1, "stages": []}\n' >"$work/broken/.tower/design.json"
check "an invalid design state: free" free "$(resolve_in "$work/broken")"
mkdir -p "$work/finished" && design "$work/finished" && stage8_done "$work/finished"
check "a design state with stage 8 done: no design Tower" free "$(resolve_in "$work/finished")"
repo "$work/handed"
design "$work/handed"
check "a design folder in git without a configuration: design" design "$(resolve_in "$work/handed")"
store "$work/handed"
check "its configuration stored (stage 8): the stored configuration wins" stored "$(resolve_in "$work/handed")"
check "on tower-<slug>" tower-handed "$(cd "$work/handed" && unset TOWER_REPO TOWER_TMUX_SOCKET && resolve_project && project_socket)"
check "an explicit socket with TOWER_REPO stays the edition's over a design state" edition "$(cd "$work/idea" && TOWER_TMUX_SOCKET=towertest-x TOWER_REPO="$work/git" && resolve_project && echo "$project_kind")"
mv "$plugin_root/hooks/testedition/repo-slug" "$work/repo-slug"
check "without an edition, an explicit socket with TOWER_REPO: the folder's own (design here)" design "$(cd "$work/idea" && TOWER_TMUX_SOCKET=towertest-x TOWER_REPO="$work/git" && resolve_project && echo "$project_kind")"
mv "$work/repo-slug" "$plugin_root/hooks/testedition/repo-slug"
check "nothing remembered yet" free "$(resolve_in "$work/other")"
remember_free "$work/other"
check "folders.json keeps the folder as free" free "$(/usr/bin/python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$state_dir/folders.json" "$work/other")"
check "a remembered folder resolves free, remembered" "free remembered" "$(resolve_in "$work/other")"
remember_free "$work/empty"
check "a second folder kept beside the first" 2 "$(/usr/bin/python3 -I -c 'import json, sys; print(len(json.load(open(sys.argv[1]))))' "$state_dir/folders.json")"
check "a remembered folder takes free without the menu" "free" "$(cd "$work/other" && resolve_project && choose_start menu </dev/null && echo "$start_choice")"
check "TOWER_START takes that choice" "setup" "$(cd "$work/git" && resolve_project && TOWER_START=setup choose_start menu && echo "$start_choice")"
check "TOWER_START not offered in the folder stops" "CCtower: TOWER_START=setup is not offered in this folder (empty: design free)" "$(mkdir -p "$work/e2" && cd "$work/e2" && resolve_project && (TOWER_START=setup choose_start menu) 2>&1 || true)"
check "no terminal and no TOWER_START: free" "free" "$(cd "$work/git" && resolve_project && choose_start menu </dev/null && echo "$start_choice")"

# CCtower with a stand-in claude and a stand-in tmux that starts nothing and logs every call.
mkdir -p "$work/bin" "$work/fake"
printf '#!/bin/sh\nexec sleep 60\n' >"$work/bin/claude"
chmod +x "$work/bin/claude"
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
launch_env() { env -u TOWER_REPO -u TOWER_TMUX_SOCKET PATH="$work/fake:$work/bin:$PATH" FAKE_LOG="$work/tmux.log" TOWER_NO_DOTENV=1 \
  TOWER_STATE_DIR="$state_dir" TOWER_MUTE=1 TOWER_THEME=claude LINEAR_API_KEY=lin_test_key HOME="$work" "$@"; }
fake() { # fake DIR [VAR=value...] [--flag]: CCtower in DIR (the flag passed on), stdin no terminal; prints its exit code
  local dir="$1" flags=() vars=() arg
  shift
  for arg in "$@"; do case "$arg" in --*) flags+=("$arg") ;; *) vars+=("$arg") ;; esac; done
  (cd "$dir" && launch_env ${vars[@]+"${vars[@]}"} "$ROOT/bin/CCtower" ${flags[@]+"${flags[@]}"} </dev/null >"$work/out" 2>&1 && echo 0 || echo $?)
}
started() { grep ' new-session ' "$work/tmux.log" | sed -E 's/^-L ([^ ]+) .*/\1/'; }
rail() { grep ' new-session ' "$work/tmux.log" || true; }

: >"$work/tmux.log"
check "a git folder, no terminal, no TOWER_START: starts" 0 "$(fake "$work/git")"
check "a free Tower with no setup start" "1 1 0" "$(started | grep -c '^tower-free-') $(rail | grep -c -- '-e TOWER_MODE=free') $(rail | grep -c TOWER_FREE_START)"
: >"$work/tmux.log"
check "TOWER_START=setup in a git folder: starts" 0 "$(fake "$work/git" TOWER_START=setup)"
check "a free Tower whose rail gets TOWER_FREE_START=setup" "1 1 1" "$(started | grep -c '^tower-free-') $(rail | grep -c -- '-e TOWER_MODE=free') $(rail | grep -c -- '-e TOWER_FREE_START=setup')"
: >"$work/tmux.log"
check "TOWER_START=design in a git folder stops" 1 "$(fake "$work/git" TOWER_START=design)"
check "and starts nothing" 0 "$(started | wc -l | tr -d ' ')"
mkdir -p "$work/Budget App"
: >"$work/tmux.log"
check "TOWER_START=design in an empty folder: starts" 0 "$(fake "$work/Budget App" TOWER_START=design)"
check "the design state written, stage 1 active" "1 active" "$(/usr/bin/python3 -I -c 'import json, sys; s = json.load(open(sys.argv[1])); print(s["current"], s["stages"][0]["status"])' "$work/Budget App/.tower/design.json")"
check "a design Tower on tower-<slug>" tower-budget-app "$(started)"
check "with TOWER_MODE=design, the folder as TOWER_REPO, no Linear key" "1 1 0" "$(rail | grep -c -- '-e TOWER_MODE=design') $(rail | grep -c -- "-e TOWER_REPO=$work/Budget App") $(grep -c 'LINEAR=lin_test_key' "$work/tmux.log")"
check "its socket recorded in sockets.json" tower-budget-app "$(/usr/bin/python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$state_dir/sockets.json" "$work/Budget App")"
: >"$work/tmux.log"
check "tower there again while it runs: attaches" 0 "$(fake "$work/Budget App" FAKE_RUNNING=tower-budget-app FAKE_REPO="$work/Budget App")"
check "one design Tower: no second started, attached to its socket" "0 1" "$(started | wc -l | tr -d ' ') $(grep -c '^-L tower-budget-app attach -t tower ' "$work/tmux.log")"
: >"$work/tmux.log"
check "tower there with its Tower gone: starts it again" 0 "$(fake "$work/Budget App")"
check "on the same socket" tower-budget-app "$(started)"
: >"$work/tmux.log"
check "--kill in a design folder closes its Tower" "0 killed tower-budget-app (Budget App · $work/Budget App)" "$(fake "$work/Budget App" FAKE_RUNNING=tower-budget-app FAKE_REPO="$work/Budget App" --kill) $(cat "$work/out")"
: >"$work/tmux.log"
check "a design folder whose configuration is stored: starts" 0 "$(fake "$work/handed")"
check "as the stored project, not design mode" "tower-handed 0 0" "$(started) $(rail | grep -c TOWER_MODE) $(rail | grep -c 'LINEAR=$')"

# The menu on a real terminal: `script` gives CCtower a pty; keys are typed after it has drawn.
typed() { # typed DIR KEYS...: CCtower in DIR on a pty, each KEY typed after a pause; prints its exit code
  local dir="$1"
  shift
  # The typing may outlive a launch that never asks (SIGPIPE): the launch's own exit code counts.
  ( set +o pipefail; (sleep 1.5; for key in "$@"; do printf "$key"; sleep 0.4; done; sleep 1) 2>/dev/null \
    | (cd "$dir" && launch_env script -q "$work/pty.out" "$ROOT/bin/CCtower" >/dev/null 2>&1) && echo 0 || echo $? )
}
: >"$work/tmux.log"
check "a terminal in a git folder: ↵ takes Git repository" 0 "$(typed "$work/git" '\r')"
check "a free Tower with TOWER_FREE_START=setup" "1 1" "$(started | grep -c '^tower-free-') $(rail | grep -c -- '-e TOWER_FREE_START=setup')"
check "the menu was drawn" " Tower · ~/git" "$(plain <"$work/pty.out" | grep -m1 ' Tower · ')"
mkdir -p "$work/scratch-notes" && : >"$work/scratch-notes/a.txt"
: >"$work/tmux.log"
check "a terminal: r then ↵ on Free session" 0 "$(typed "$work/scratch-notes" 'r' '\r')"
check "a free Tower started" 1 "$(started | grep -c '^tower-free-')"
check "the folder remembered as free" free "$(/usr/bin/python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1])).get(sys.argv[2]))' "$state_dir/folders.json" "$work/scratch-notes")"
: >"$work/tmux.log"
check "next time there: no menu (q would cancel), a free Tower" "0 1" "$(typed "$work/scratch-notes" 'q') $(started | grep -c '^tower-free-')"
check "and nothing drawn" 0 "$(plain <"$work/pty.out" | grep -c ' Tower · ' || true)"
mkdir -p "$work/fresh"
: >"$work/tmux.log"
check "a terminal: q cancels, exit 0" 0 "$(typed "$work/fresh" 'q')"
check "nothing started, no design state" "0 none" "$(started | wc -l | tr -d ' ') $([ -e "$work/fresh/.tower" ] && echo there || echo none)"
: >"$work/tmux.log"
check "a terminal in an empty folder: ↵ takes New project" 0 "$(typed "$work/fresh" '\r')"
check "a design Tower on tower-fresh" "tower-fresh 1" "$(started) $(rail | grep -c -- '-e TOWER_MODE=design')"

if [ $bad -eq 0 ]; then echo "start menu: ok"; else echo "start menu: $bad failed"; exit 1; fi
