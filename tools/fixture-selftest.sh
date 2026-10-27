#!/bin/bash
# Self-test of tools/fixture.sh: builds a fixture, drives TKT-9006 end to end with the fake helpers
# (no Claude, no tmux), checks the prepared tickets, then cleans up. Then tools/fixture-github.sh, the oink-like
# Git repository fixture (decision 054): its issues, PR, worktrees and stored configuration. Usage: fixture-selftest.sh [<dir>]
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
DIR=${1:-${TMPDIR:-/tmp}/tower-fixture-selftest}
T=$DIR/t
PY=/usr/bin/python3
FAILS=0
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; FAILS=$((FAILS + 1)); }
ok() { local d=$1; shift; if "$@" >/dev/null 2>&1; then pass "$d"; else fail "$d"; fi; }
refuses() { local d=$1; shift; if "$@" >/dev/null 2>&1; then fail "$d"; else pass "$d"; fi; }
eq() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (got '$2', want '$3')"; fi; }
# jsonq <python expr over d> : reads JSON from stdin
jsonq() { "$PY" -c 'import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1]))' "$1" 2>/dev/null; }
st() { jsonq "$2" < "$1/.work/state.json"; }
alive() { ps -p "$1" -o command= 2>/dev/null | grep -q http.server; }

mkdir -p "$DIR"
EXPORTS=$("$HERE/fixture.sh" --force "$T") || { echo "FAIL fixture.sh build"; exit 1; }
eval "$EXPORTS"
ok "exports name the fixture's gh first on PATH" test "$(command -v gh)" = "$T/bin/gh"
ok "TOWER_REPO and TOWER_LINEAR_FIXTURE exported" test "$TOWER_REPO" = "$T/repo" -a "$TOWER_LINEAR_FIXTURE" = "$T/linear.json"
ok "TOWER_STATE_DIR exported: the fixture's own state folder" test "$TOWER_STATE_DIR" = "$T/state"
STOREDT=$T/state/projects/$(printf '%s' "$T/repo" | sed 's/[^a-zA-Z0-9]/-/g').json
ok "the stored configuration is tools/fixture/config.json (TKT ids, routing defaults)" cmp -s "$STOREDT" "$HERE/fixture/config.json"
F=.agents/skills/_fake/fake.sh

# --- prepared tickets -----------------------------------------------------------------------------
eq "linear.json has 10 nodes" "$(jsonq 'len(d["data"]["issues"]["nodes"])' < "$T/linear.json")" 10
eq "TKT-9009 blocked by TKT-9008" "$(jsonq '[n for n in d["data"]["issues"]["nodes"] if n["identifier"]=="TKT-9009"][0]["inverseRelations"]["nodes"][0]["issue"]["identifier"]' < "$T/linear.json")" TKT-9008
eq "TKT-9001 phase planning" "$(st "$T/repo-TKT-9001" 'd["phase"]')" planning
eq "TKT-9001 story TKT-9000" "$(st "$T/repo-TKT-9001" 'd["story"]')" TKT-9000
eq "TKT-9002 phase implementing" "$(st "$T/repo-TKT-9002" 'd["phase"]')" implementing
eq "TKT-9002 one commit ahead of staging" "$(git -C "$T/repo-TKT-9002" rev-list --count origin/staging..HEAD)" 1
eq "TKT-9003 phase implementing, checks set" "$(st "$T/repo-TKT-9003" 'd["phase"]+" "+str(bool(d["checks"]))')" "implementing True"
eq "TKT-9004 phase implementing" "$(st "$T/repo-TKT-9004" 'd["phase"]')" implementing
ok "TKT-9005 has no state file" test ! -e "$T/repo-TKT-9005/.work/state.json"
eq "TKT-9005 one commit behind origin/staging" "$(git -C "$T/repo-TKT-9005" rev-list --count HEAD..origin/staging)" 1
eq "TKT-9002 gh pr view: #103, unit-tests failed, e2e running" "$(cd "$T/repo-TKT-9002" && gh pr view --json number,mergeable,statusCheckRollup | jsonq 'd["number"],d["mergeable"],[c["conclusion"] or c["status"] for c in d["statusCheckRollup"]]')" "(103, 'MERGEABLE', ['SUCCESS', 'FAILURE', 'IN_PROGRESS'])"
eq "TKT-9003 gh pr view: draft #101" "$(cd "$T/repo-TKT-9003" && gh pr view --json number,isDraft,state | jsonq 'd["number"],d["isDraft"],d["state"]')" "(101, True, 'OPEN')"
eq "TKT-9004 gh pr view: ready, approved, green #102" "$(cd "$T/repo-TKT-9004" && gh pr view --json number,isDraft,reviewDecision,statusCheckRollup | jsonq 'd["number"],d["isDraft"],d["reviewDecision"],all(c["conclusion"]=="SUCCESS" for c in d["statusCheckRollup"])')" "(102, False, 'APPROVED', True)"
ok "TKT-9004 wrap-up-check passes" sh -c "cd '$T/repo-TKT-9004' && $F wrap-up-check 102"
ok "gh pr list shows 3 open PRs" test "$(cd "$T/repo" && gh pr list --json number | jsonq 'len(d)')" = 3
eq "gh pr merge --squash refused" "$(gh pr merge 102 --squash 2>&1)" "merge method not allowed"
eq "unsupported gh command" "$(gh repo view 2>&1)" "fake gh: unsupported: repo view"
ok "gh auth status" gh auth status
ok "triage prints two lines from the main checkout" test "$(cd "$T/repo" && $F triage | wc -l | tr -d ' ')" = 2

# --- TKT-9006 end to end --------------------------------------------------------------------------
B=fixture/tkt-9006-store-filter-resets-after-reload
W=$T/repo-TKT-9006
(cd "$T/repo" && git fetch -q origin staging && git worktree add -q -b "$B" ../repo-TKT-9006 origin/staging) 2>/dev/null
ok "TKT-9006 worktree created" test -d "$W/.agents/skills/_fake"
cd "$W" || exit 1
ok "fake.sh plan" $F plan TKT-9006
eq "phase planning" "$(st "$W" 'd["phase"]')" planning
ok "fake.sh plan is idempotent" $F plan TKT-9006
refuses "open-pr refuses while planning" $F open-pr
ok "fake.sh go" $F go
eq "phase implementing" "$(st "$W" 'd["phase"]')" implementing
echo "fix: Store filter resets after reload" >> NOTES.md
ok "fake.sh implemented" $F implemented
eq "next is run /open-pr" "$(st "$W" 'd["next"]')" "run /open-pr"
ok "fake.sh open-pr" $F open-pr
ok "open-pr is idempotent" $F open-pr
PR=$(gh pr view --json number,state,isDraft,reviewDecision,statusCheckRollup,url)
eq "gh pr view shows a draft" "$(echo "$PR" | jsonq 'd["state"],d["isDraft"],d["url"]')" "('OPEN', True, 'https://example.invalid/pr/104')"
N=$(echo "$PR" | jsonq 'd["number"]')
ok "checks recorded at HEAD" test "$(st "$W" 'd["checks"]["sha"]')" = "$(git rev-parse HEAD)"
ok "fake.sh ready" $F ready
eq "PR is ready and green" "$(gh pr view "$N" --json isDraft,statusCheckRollup | jsonq 'd["isDraft"],len(d["statusCheckRollup"])')" "(False, 2)"
refuses "wrap-up-check refuses without review" $F wrap-up-check "$N"
ok "fake.sh review shows the self-review and the reply options, saves no file" sh -c "o=\$(mktemp) && $F review $N > \$o && grep -q '^## Self-review (round 1)' \$o && grep -q '^Reply with one of these:' \$o && test ! -e .work/review/pr-$N-round-1.md"
ok "fake.sh review-post" $F review-post "$N"
eq "review posted, decision approved" "$(gh pr view "$N" --json reviewDecision,comments | jsonq 'd["reviewDecision"],d["comments"][0]["body"].splitlines()[0]')" "('APPROVED', '## Self-review (round 1)')"
ok "wrap-up-check passes" $F wrap-up-check "$N"
ok "fake.sh dev-env up" $F dev-env up
URL=$(st "$W" 'd["env"]["frontendUrl"]')
PID=$(head -1 .work/fake-dev-env.pid 2>/dev/null)
eq "dev server answers HTTP 200" "$(curl -s -o /dev/null -w '%{http_code}' "$URL/")" 200
eq "state env up" "$(st "$W" 'd["env"]["status"],d["env"]["loginVerified"],d["env"]["project"]')" "('up', True, 'app-tkt-9006')"
eq "dev-env up is idempotent" "$($F dev-env up)" "stack is up on $URL"
ok "fake.sh wrap-up" $F wrap-up "$N"
cd "$T/repo" || exit 1
eq "PR merged" "$(gh pr view "$N" --json state,mergedAt | jsonq 'd["state"],bool(d["mergedAt"])')" "('MERGED', True)"
git fetch -q origin
ok "origin/staging holds the NOTES line" sh -c "git show origin/staging:NOTES.md | grep -qx 'fix: Store filter resets after reload'"
ok "merge commit on staging" sh -c "git log -1 --format=%s origin/staging | grep -q '^Merge pull request #$N'"
ok "worktree is gone" test ! -e "$W"
refuses "branch is deleted" git rev-parse --verify -q "refs/heads/$B"
refuses "dev server is gone" alive "$PID"

# --- clean ----------------------------------------------------------------------------------------
(cd "$T/repo-TKT-9001" && $F dev-env up >/dev/null)
PID2=$(head -1 "$T/repo-TKT-9001/.work/fake-dev-env.pid" 2>/dev/null)
ok "second dev server started for --clean" alive "$PID2"
cd "$DIR" || exit 1
ok "fixture.sh --clean" "$HERE/fixture.sh" --clean "$T"
ok "target is gone" test ! -e "$T"
sleep 0.3
refuses "no fixture http.server left" alive "$PID2"

# --- the GitHub fixture (decision 054) -----------------------------------------------------------------------------
G=$DIR/g
GEXPORTS=$("$HERE/fixture-github.sh" --force "$G") || { echo "FAIL fixture-github.sh build"; exit 1; }
ok "github exports: TOWER_REPO, the fixture's gh, its own state folder" sh -c "echo '$GEXPORTS' | grep -qx 'export TOWER_REPO=$G/repo' && echo '$GEXPORTS' | grep -qx 'export TOWER_STATE_DIR=$G/state' && echo '$GEXPORTS' | grep -q 'export PATH=$G/bin:'"
GH=$G/bin/gh
ISSUES=$("$GH" issue list --repo fixture/oink --state open --limit 100 --json number,title,labels,assignees,updatedAt,body,url)
eq "gh issue list: 4 open issues, newest first" "$(echo "$ISSUES" | jsonq '[i["number"] for i in d]')" "[35, 34, 33, 26]"
eq "#33 bug and testflight, nobody's" "$(echo "$ISSUES" | jsonq '[([l["name"] for l in i["labels"]], i["assignees"]) for i in d if i["number"]==33][0]')" "(['bug', 'testflight'], [])"
eq "#34 an enhancement" "$(echo "$ISSUES" | jsonq '[[l["name"] for l in i["labels"]] for i in d if i["number"]==34][0]')" "['enhancement']"
eq "#35 a bug assigned to the fixture user" "$(echo "$ISSUES" | jsonq '[([l["name"] for l in i["labels"]], [a["login"] for a in i["assignees"]]) for i in d if i["number"]==35][0]')" "(['bug'], ['fixture-dev'])"
eq "gh api user: the fixture user" "$("$GH" api user | jsonq 'd["login"]')" fixture-dev
eq "gh issue create: no writes to issues" "$("$GH" issue create --title x 2>&1)" "fake gh: unsupported: issue create --title x"
W26=$G/tower-work/repo/26-start-day-duplicates
eq "#26 in progress: its worktree on fix/26-start-day-duplicates" "$(git -C "$W26" rev-parse --abbrev-ref HEAD)" fix/26-start-day-duplicates
eq "#26 one commit ahead of origin/main" "$(git -C "$W26" rev-list --count origin/main..HEAD)" 1
eq "#26 state file in review" "$(st "$W26" 'd["phase"]')" review
eq "#26 checks recorded on its head (decision 055)" "$(st "$W26" '(d["checks"]["sha"], d["checks"]["ran"])')" "('$(git -C "$W26" rev-parse HEAD)', ['unit', 'ui-smoke'])"
eq "the last release: build-14, two commits on origin/main since" "$(git -C "$W26" tag --list 'build-*' --sort=-creatordate --format='%(refname:short)') $(git -C "$W26" rev-list --count build-14..origin/main)" "build-14 2"
PR30=$("$GH" pr list --head fix/26-start-day-duplicates --state all --json number,state,isDraft,headRefOid,comments)
eq "gh pr list --head: PR #30 open, not a draft, on the worktree's head" "$(echo "$PR30" | jsonq '[(p["number"], p["state"], p["isDraft"], p["headRefOid"]) for p in d]')" "[(30, 'OPEN', False, '$(git -C "$W26" rev-parse HEAD)')]"
eq "PR #30's review: round 1, fixes needed" "$(echo "$PR30" | jsonq '(d[0]["comments"][0]["body"].splitlines()[0], d[0]["comments"][0]["body"].splitlines()[-1])')" "('## Review (round 1)', 'Verdict: fixes needed')"
eq "gh pr list --head of the legacy branch: none" "$("$GH" pr list --head fix/crash-restore --state all --json number)" "[]"
eq "the legacy worktree on fix/crash-restore" "$(git -C "$G/repo-crash-restore" rev-parse --abbrev-ref HEAD)" fix/crash-restore
eq "three worktrees: main, #26, the legacy one" "$(git -C "$G/repo" worktree list | wc -l | tr -d ' ')" 3
eq "the repository's own skills" "$(ls "$G/repo/.claude/skills" | tr '\n' ' ')" "new-ticket open-pr release review-pr start-ticket triage wrap-up "
STORED=$G/state/projects/$(printf '%s' "$G/repo" | sed 's/[^a-zA-Z0-9]/-/g').json
ok "the stored configuration in the fixture's state folder" test -f "$STORED"
eq "stored: github tickets of fixture/oink, the main checkout, worktrees in the fixture" "$(jsonq '(d["tickets"]["kind"], d["tickets"]["repo"], d["project"]["mainCheckout"], d["worktree"]["pathTemplate"], d["routing"])' < "$STORED")" "('github', 'fixture/oink', '$G/repo', '$G/tower-work/{repo}/{n}-{slug}', 'defaults')"
eq "stored: oink's example but for the repository and its folders" "$("$PY" - "$STORED" "$HERE/../hooks/core/configs/examples/oink.ts" <<'PY'
import json, sys
stored = json.load(open(sys.argv[1]))
text = open(sys.argv[2]).read()
example = json.loads(text[text.index("{", text.index("OINK_CONFIG")):text.rindex("}") + 1])
for module, key in (("project", "repo"), ("project", "mainCheckout"), ("tickets", "repo"), ("worktree", "pathTemplate")):
    stored[module][key] = example[module][key]
print(stored == example)
PY
)" True
# The hand-written oink configuration (docs/plans/oink.config.json, when this tree has it) is oink's example, which the
# unit tests validate.
[ ! -f "$HERE/../docs/plans/oink.config.json" ] || eq "docs/plans/oink.config.json is oink's example" "$("$PY" - "$HERE/../docs/plans/oink.config.json" "$HERE/../hooks/core/configs/examples/oink.ts" <<'PY'
import json, sys
text = open(sys.argv[2]).read()
print(json.load(open(sys.argv[1])) == json.loads(text[text.index("{", text.index("OINK_CONFIG")):text.rindex("}") + 1]))
PY
)" True
ok "fixture-github.sh --clean" "$HERE/fixture-github.sh" --clean "$G"
ok "github target is gone" test ! -e "$G"
rmdir "$DIR" 2>/dev/null

if [ $FAILS -eq 0 ]; then echo "selftest: all passed"; else echo "selftest: $FAILS failed"; exit 1; fi
