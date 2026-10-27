#!/bin/bash
# Starts tower on the test fixture, never on real data.
# Usage: test-launch.sh <tmux socket> [columns rows]
# Rebuilds the fixture in <plugin root>/.smoke (tools/fixture.sh: TKT tickets and their stored configuration; TOWER_FIXTURE
# names another builder, an edition's), then runs bin/CCtower --no-attach from the fixture's main checkout with no .env,
# no real repository and no real Linear key. TOWER_DEMO and TOWER_THEME are kept when exported. A socket a live
# workspace uses is refused: `tower`, `tower-*`, `towergen`, and those the edition lists (hooks/<edition>/live-sockets).
# Tower's files go to <plugin root>/.smoke/state (TOWER_STATE_DIR), never ~/.claude/tower, and no sound plays (TOWER_MUTE=1).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
[ $# -ge 1 ] || { echo "usage: test-launch.sh <tmux socket> [columns rows]" >&2; exit 1; }
socket=$1
columns=${2:-220}
rows=${3:-55}
live() { echo "test-launch.sh: socket '$socket' is a live workspace (or a project's Tower, decision 059); choose another" >&2; exit 1; }
case "$socket" in
  tower|tower-*|towergen) live ;;
esac
for list in "$ROOT"/hooks/*/live-sockets; do
  [ -f "$list" ] || continue
  while IFS= read -r name || [ -n "$name" ]; do [ "$name" != "$socket" ] || live; done <"$list"
done

target=$ROOT/.smoke
tmux -L "$socket" kill-server 2>/dev/null || true
exports=$("${TOWER_FIXTURE:-$ROOT/tools/fixture.sh}" --force "$target")
eval "$exports"
[ "$TOWER_REPO" = "$target/repo" ] || { echo "test-launch.sh: TOWER_REPO is not the fixture: $TOWER_REPO" >&2; exit 1; }
[ -f "$TOWER_LINEAR_FIXTURE" ] || { echo "test-launch.sh: no Linear fixture" >&2; exit 1; }

unset LINEAR_API_KEY
export TOWER_NO_DOTENV=1
export TOWER_STATE_DIR=$target/state
export TOWER_MUTE=1
export TOWER_TMUX_SOCKET=$socket
export TOWER_SESSION_MODEL=${TOWER_SESSION_MODEL:-haiku}
export TOWER_RAIL_MODEL=${TOWER_RAIL_MODEL:-haiku}
(cd "$TOWER_REPO" && "$ROOT/bin/CCtower" --no-attach)
tmux -L "$socket" resize-window -t tower -x "$columns" -y "$rows"
echo "socket=$socket repo=$TOWER_REPO size=${columns}x${rows}"
