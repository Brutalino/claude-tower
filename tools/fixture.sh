#!/bin/bash
# Builds a throwaway Linear-ticket project for testing tower: bare origin, main checkout, ticket worktrees,
# fake gh state, fake Linear answer, and its stored configuration (tools/fixture/config.json, ids TKT-<n>) in
# <target-dir>/state. TOWER_FIXTURE_PREFIX names another ticket prefix (default TKT) and TOWER_FIXTURE_STORED=0 leaves
# the configuration out: an edition's own fixture (decision 083), whose project TOWER_REPO names.
# Usage: fixture.sh [--force] <target-dir> | fixture.sh --clean <target-dir>
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
TPL=$HERE/fixture
PY=/usr/bin/python3
MARK=.tower-fixture
PREFIX=${TOWER_FIXTURE_PREFIX:-TKT}
STORED=${TOWER_FIXTURE_STORED:-1}
LOWER=$(printf '%s' "$PREFIX" | tr 'A-Z' 'a-z')

die() { echo "fixture.sh: $*" >&2; exit 1; }
usage() { die "usage: fixture.sh [--force] <target-dir> | fixture.sh --clean <target-dir>"; }

MODE=build
case "${1:-}" in
  --clean) MODE=clean; shift ;;
  --force) MODE=force; shift ;;
esac
[ $# -eq 1 ] || usage
if [ $MODE = clean ] && [ ! -d "$1" ]; then echo "nothing to clean at $1"; exit 0; fi
mkdir -p "$1" 2>/dev/null || die "cannot create $1"
T=$(cd "$1" && pwd -P)

# Refuse to delete anything that this script did not build.
is_fixture() { [ -f "$T/$MARK" ] || [ -z "$(ls -A "$T")" ]; }

stop_servers() {
  local f pid
  for f in "$T"/repo-*/.work/fake-dev-env.pid "$T/.dev-env/pids"; do
    [ -f "$f" ] || continue
    while read -r pid; do
      [ -n "$pid" ] || continue
      if ps -p "$pid" -o command= 2>/dev/null | grep -q http.server; then kill "$pid" 2>/dev/null || true; fi
    done < "$f"
  done
}

# The whole target goes, the state folder a test launch writes in it (<target>/state, TOWER_STATE_DIR) included.
wipe() {
  is_fixture || die "$T is not a fixture directory (no $MARK); not deleting it"
  stop_servers
  rm -rf "$T"
}

if [ $MODE = clean ]; then
  wipe
  echo "removed $T"
  exit 0
fi
if [ -e "$T/repo" ]; then
  [ $MODE = force ] || die "$T/repo exists (use --force to rebuild)"
fi
if [ $MODE = force ]; then wipe; mkdir -p "$T"; T=$(cd "$T" && pwd -P); fi
is_fixture || die "$T is not empty and not a fixture directory"
touch "$T/$MARK"

g() { git -C "$T/repo" "$@"; }
slug() { echo "$1" | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-//; s/-$//'; }

# 1. Fake Linear answer (also the source of titles and branch names below).
"$PY" - "$T/linear.json" "$PREFIX" <<'PY'
import json, re, sys, uuid
P = sys.argv[2]
def slug(s): return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))
ST = {"started": {"name": "In Progress", "type": "started"}, "unstarted": {"name": "Todo", "type": "unstarted"},
      "backlog": {"name": "Backlog", "type": "backlog"}}
rows = [  # id, title, priority, state, label, mine
    (P + "-9001", "Offline alert repeats", 2, "started", "Bug", True),
    (P + "-9002", "Map pins overlap at low zoom", 3, "started", "Bug", True),
    (P + "-9003", "CSV export misses the tax column", 2, "started", "Bug", True),
    (P + "-9004", "Order list shows the wrong time zone", 1, "started", "Bug", True),
    (P + "-9005", "Reminder e-mail is sent twice", 3, "started", "Bug", True),
    (P + "-9006", "Store filter resets after reload", 3, "unstarted", "Bug", True),
    (P + "-9007", "Price editor rounds to whole cents", 4, "unstarted", "Feature", True),
    (P + "-9008", "Device status flickers between online and offline", 1, "backlog", "Bug", False),
    (P + "-9009", "Duplicate orders after reconnect", 2, "backlog", "Bug", False),
    (P + "-9010", "Battery icon ignores dark mode", 4, "unstarted", "Bug", False),
]
def ref(i):
    r = next(x for x in rows if x[0] == i)
    return {"identifier": r[0], "title": r[1], "state": ST[r[3]]}
# The story <P>-9000 is not in the answer (neither a bug nor assigned); its children are, but for one done.
STORY = {"identifier": P + "-9000", "title": "Alerting", "state": ST["started"], "children": {"nodes": [
    {"identifier": P + "-8999", "title": "Alert e-mail template", "state": {"name": "Done", "type": "completed"}},
    ref(P + "-9001"), ref(P + "-9006"), ref(P + "-9007")]}}
nodes = []
for ident, title, prio, st, label, mine in rows:
    n = int(ident.split("-")[1])
    nodes.append({
        "id": str(uuid.UUID(int=0xF1EE7000000000000000000000000000 + n)), "identifier": ident, "title": title,
        "description": "**Problem.** %s.\n\n**Expected.** The app behaves as documented.\n\n"
                       "**Done when**\n- [ ] The fix is covered by a test\n- [ ] %s no longer reproduces on staging\n"
                       "%s" % (title, ident, "- [ ] Support is told\n" if n % 2 else ""),
        "priority": prio, "branchName": "fixture/%s-%s" % (ident.lower(), slug(title)),
        "url": "https://linear.example.invalid/app/issue/%s" % ident, "state": ST[st],
        "labels": {"nodes": [{"name": label}]}, "assignee": {"isMe": True, "displayName": "fixture.dev"} if mine else None,
        "parent": STORY if ident in (P + "-9001", P + "-9006", P + "-9007") else None,
        "children": {"nodes": []}, "relations": {"nodes": []}, "inverseRelations": {"nodes": []}})
rel = {"id": str(uuid.UUID(int=0xF1EE7B00000000000000000000009009)), "type": "blocks",
       "issue": ref(P + "-9008"), "relatedIssue": ref(P + "-9009")}
nodes[7]["relations"]["nodes"].append(rel)
nodes[8]["inverseRelations"]["nodes"].append(rel)
with open(sys.argv[1], "w") as fh:
    json.dump({"data": {"issues": {"nodes": nodes}}}, fh, indent=2)
    fh.write("\n")
PY
title() { "$PY" -c 'import json,sys; print(next(n["title"] for n in json.load(open(sys.argv[1]))["data"]["issues"]["nodes"] if n["identifier"]==sys.argv[2]))' "$T/linear.json" "$1"; }
branch_of() { local t; t=$(echo "$1" | tr 'A-Z' 'a-z'); echo "fixture/$t-$(slug "$(title "$1")")"; }

# 2. Bare origin and main checkout.
git init -q --bare -b staging "$T/origin.git"
git clone -q "$T/origin.git" "$T/repo" 2>/dev/null
g symbolic-ref HEAD refs/heads/staging
g config user.name "Fixture Dev"
g config user.email fixture@example.invalid
g config commit.gpgsign false
g config core.hooksPath /dev/null
R=$T/repo
mkdir -p "$R/src/alerts" "$R/.agents/skills/_fake" "$R/.claude"
printf '# App (fixture)\n\nA throwaway stand-in for a Linear-ticket repository, built by tower tools/fixture.sh.\n' > "$R/README.md"
for i in $(seq 1 20); do echo "note $i: fixture line"; done > "$R/NOTES.md"
cat > "$R/src/alerts/notify.ts" <<'EOF'
export function notify(deviceId: string, message: string): string {
  return `[${deviceId}] ${message}`;
}
EOF
cat > "$R/src/alerts/dedupe-window.ts" <<'EOF'
export const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

export function isDuplicate(lastSentAt: number, now: number): boolean {
  return now - lastSentAt < DEDUPE_WINDOW_MS;
}
EOF
printf '.work/\nrepro/\n' > "$R/.gitignore"
for d in "$TPL"/skills/*/; do cp -R "${d%/}" "$R/.agents/skills/"; done
cp "$TPL/fake.sh" "$TPL/fake.py" "$R/.agents/skills/_fake/"
ln -s ../.agents/skills "$R/.claude/skills"
g add -A
g commit -q -m "chore: initial fixture"
g push -q -u origin staging 2>/dev/null

# 3. Fake gh.
mkdir -p "$T/bin" "$T/gh-state"
cp "$TPL/gh" "$TPL/gh.py" "$T/bin/"
chmod +x "$T/bin/gh"

mkwt() {  # <TICKET>: worktree beside the main checkout, branch from origin/staging, like /start-ticket
  g fetch -q origin staging
  g worktree add -q -b "$(branch_of "$1")" "$T/repo-$1" origin/staging
}
commit_in() {  # <TICKET> <file> <line> <message>
  local w=$T/repo-$1
  mkdir -p "$(dirname "$w/$2")"
  echo "$3" >> "$w/$2"
  git -C "$w" add -A
  git -C "$w" commit -q -m "$4"
}

# <PREFIX>-9005 first, so the next staging commit leaves it one behind.
mkwt "$PREFIX-9005"
printf '\n## Changelog\n- staging moved on after %s-9005 branched\n' "$PREFIX" >> "$R/README.md"
g commit -q -am "docs: add changelog section"
g push -q origin staging 2>/dev/null

for t in "$PREFIX-9001" "$PREFIX-9002" "$PREFIX-9003" "$PREFIX-9004"; do mkwt "$t"; done
commit_in "$PREFIX-9002" src/map/pins.ts 'export const MIN_PIN_SPACING_PX = 24;' "fix($LOWER-9002): space pins at low zoom (step 1)"
commit_in "$PREFIX-9003" src/export/csv.ts 'export const CSV_COLUMNS = ["order", "total", "tax"];' "fix($LOWER-9003): add the tax column to the CSV export"
commit_in "$PREFIX-9004" src/orders/timezone.ts 'export const displayZone = (tz: string) => tz || "Europe/Vienna";' "fix($LOWER-9004): show orders in the store's time zone"
for t in "$PREFIX-9003" "$PREFIX-9004"; do git -C "$T/repo-$t" push -q -u origin "$(branch_of "$t")" 2>/dev/null; done

# 4. State files and pull requests.
"$PY" - "$T" "$PREFIX" <<'PY'
import json, os, subprocess, sys, datetime
T, P = sys.argv[1], sys.argv[2]
nodes = {n["identifier"]: n for n in json.load(open(os.path.join(T, "linear.json")))["data"]["issues"]["nodes"]}
AT = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
def ago(days): return (datetime.datetime.utcnow() - datetime.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
GREEN = [{"name": "ci / lint", "status": "COMPLETED", "conclusion": "SUCCESS"},
         {"name": "ci / test", "status": "COMPLETED", "conclusion": "SUCCESS"}]
def sha(t): return subprocess.check_output(["git", "-C", os.path.join(T, "repo-" + t), "rev-parse", "HEAD"], text=True).strip()
def plan(t):
    return ("## Diagnosis\n%s: %s. The fixture stands in for the real cause.\n\n## Plan\n1. Reproduce it.\n"
            "2. Fix it.\n3. Open the pull request.\n\n## Open questions\n- None.\n" % (t, nodes[t]["title"]))
spec = {P + "-9001": ("planning", None, "approve the plan, then implement"),
        P + "-9002": ("implementing", None, "finish step 2, then /open-pr"),
        P + "-9003": ("implementing", True, "mark the PR ready, then /review 101"),
        P + "-9004": ("implementing", True, "/wrap-up 102")}
for t, (phase, checks, nxt) in spec.items():
    s = {"ticket": t, "story": (nodes[t]["parent"] or {}).get("identifier"), "base": "origin/staging",
         "phase": phase, "plan": plan(t), "checks": {"sha": sha(t), "at": AT} if checks else None, "env": None,
         "evidence": [], "blockers": [], "next": nxt}
    os.makedirs(os.path.join(T, "repo-" + t, ".work"), exist_ok=True)
    with open(os.path.join(T, "repo-" + t, ".work", "state.json"), "w") as fh:
        json.dump(s, fh, indent=2); fh.write("\n")
def pr(n, t, draft, extra):
    p = {"number": n, "headRefName": nodes[t]["branchName"], "baseRefName": "staging",
         "title": "%s %s" % (t, nodes[t]["title"]), "body": "Fixes %s.\n\n%s" % (t, plan(t)), "state": "OPEN",
         "isDraft": draft, "reviewDecision": "REVIEW_REQUIRED", "statusCheckRollup": [],
         "url": "https://example.invalid/pr/%d" % n, "headRefOid": sha(t), "mergedAt": None, "comments": [],
         "mergeable": "MERGEABLE", "mergeStateStatus": "CLEAN", "reviews": [], "createdAt": AT, "updatedAt": AT}
    p.update(extra)
    with open(os.path.join(T, "gh-state", "%d.json" % n), "w") as fh:
        json.dump(p, fh, indent=2); fh.write("\n")
pr(101, P + "-9003", True, {"createdAt": ago(16), "updatedAt": ago(16)})
# Decision 035: a failing check with its log link, a check still running, one passed.
pr(103, P + "-9002", False, {"statusCheckRollup": [
    {"name": "ci / lint", "status": "COMPLETED", "conclusion": "SUCCESS", "detailsUrl": "https://example.invalid/run/1031"},
    {"name": "ci / unit-tests", "status": "COMPLETED", "conclusion": "FAILURE", "detailsUrl": "https://example.invalid/run/1032"},
    {"name": "ci / e2e", "status": "IN_PROGRESS", "conclusion": "", "startedAt": AT, "detailsUrl": "https://example.invalid/run/1033"}]})
pr(102, P + "-9004", False, {"reviewDecision": "APPROVED", "statusCheckRollup": GREEN, "createdAt": ago(5), "updatedAt": ago(5),
    "reviews": [{"state": "APPROVED"}], "comments": [
    {"author": {"login": "fixture-dev"}, "createdAt": AT,
     "body": "## Self-review (round 1)\n\n### Scope check\nThe change is limited to the ticket's scope.\n\n### Quality check\nTests cover the change.\n\n### Blockers\n_(none)_\n\n### Suggestions\n_(none)_\n\n### Good stuff\nSmall, focused diff."}]})
PY

# 5. The stored configuration (decision 053): tools/fixture/config.json for this main checkout, in the fixture's own
# state folder (a test launch's TOWER_STATE_DIR).
if [ "$STORED" != 0 ]; then
  mkdir -p "$T/state/projects"
  cp "$TPL/config.json" "$T/state/projects/$(printf '%s' "$T/repo" | sed 's/[^a-zA-Z0-9]/-/g').json"
fi

echo "fixture ready in $T" >&2
echo "export TOWER_REPO=$T/repo"
echo "export PATH=$T/bin:\$PATH"
echo "export TOWER_LINEAR_FIXTURE=$T/linear.json"
[ "$STORED" = 0 ] || echo "export TOWER_STATE_DIR=$T/state"
