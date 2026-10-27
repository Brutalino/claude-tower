#!/bin/bash
# Builds a throwaway oink-like repository for testing Tower's Git repository mode (decision 054): bare origin on main, main
# checkout with its own skills, a release tag build-14 two commits back, fake gh (issues, pull requests), one issue in
# progress (worktree, state file `review` with its checks recorded on the head, PR #30 whose review round 1 asks for
# fixes), one legacy branch worktree, and the stored configuration in the fixture's own state folder.
# Usage: fixture-github.sh [--force] <target-dir> | fixture-github.sh --clean <target-dir>
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd -P)
TPL=$HERE/fixture
PY=/usr/bin/python3
MARK=.tower-fixture

die() { echo "fixture-github.sh: $*" >&2; exit 1; }
usage() { die "usage: fixture-github.sh [--force] <target-dir> | fixture-github.sh --clean <target-dir>"; }

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
wipe() {
  is_fixture || die "$T is not a fixture directory (no $MARK); not deleting it"
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
R=$T/repo
WORK=$T/tower-work/repo
BRANCH=fix/26-start-day-duplicates
LEGACY=$T/repo-crash-restore

# 1. Bare origin and main checkout, with the repository's own skills (stand-ins: Tower lists them, nothing runs them here).
git init -q --bare -b main "$T/origin.git"
git clone -q "$T/origin.git" "$R" 2>/dev/null
g symbolic-ref HEAD refs/heads/main
g config user.name "Fixture Dev"
g config user.email fixture@example.invalid
g config commit.gpgsign false
g config core.hooksPath /dev/null
printf '# O!nk (fixture)\n\nA throwaway stand-in for an iOS repository with GitHub issues, built by tower tools/fixture-github.sh.\n' > "$R/README.md"
printf '.work/\n' > "$R/.gitignore"
mkdir -p "$R/Sources"
printf 'struct Day { var entries: [String] = [] }\n' > "$R/Sources/Day.swift"
skill() { # <name> <description>
  mkdir -p "$R/.claude/skills/$1"
  printf -- '---\nname: %s\ndescription: %s\n---\n\n# %s (fixture)\n\nA FIXTURE skill: answer exactly `fixture: /%s is a stand-in` and stop.\n' "$1" "$2" "$1" "$1" > "$R/.claude/skills/$1/SKILL.md"
}
skill start-ticket "Plan a GitHub issue in its worktree and wait for the go (fixture)"
skill open-pr "Commit, verify and open the pull request (fixture)"
skill review-pr "Review a pull request: Review (round N) and a verdict (fixture)"
skill wrap-up "Merge after the owner's yes and clean up (fixture)"
skill release "Cut a TestFlight build and tag it (fixture)"
skill new-ticket "Write one GitHub issue from an agreed scope (fixture)"
skill triage "Label and order the open issues (fixture)"
g add -A
g commit -q -m "chore: initial oink fixture"
# The last release (decision 055): build-14 on the first commit, two commits on main since.
g tag build-14
printf '# Changelog\n\n- Totals per day.\n' > "$R/CHANGELOG.md"
g add -A
g commit -q -m "docs: changelog"
printf 'struct Totals { var day = 0 }\n' > "$R/Sources/Totals.swift"
g add -A
g commit -q -m "feat: day totals"
g push -q -u origin main 2>/dev/null
g push -q origin build-14 2>/dev/null

# 2. Fake gh: pull requests in gh-state/, the issues in gh-issues.json (read only).
mkdir -p "$T/bin" "$T/gh-state"
cp "$TPL/gh" "$TPL/gh.py" "$T/bin/"
chmod +x "$T/bin/gh"

# 3. The issue in progress: its worktree by the convention, a commit pushed, its state file in `review`.
mkdir -p "$WORK"
g worktree add -q -b "$BRANCH" "$WORK/26-start-day-duplicates" origin/main
W=$WORK/26-start-day-duplicates
printf 'func startDay(_ day: inout Day) { guard day.entries.isEmpty else { return } }\n' >> "$W/Sources/Day.swift"
git -C "$W" add -A
git -C "$W" commit -q -m "fix(#26): starting a day twice keeps one set of entries"
git -C "$W" push -q -u origin "$BRANCH" 2>/dev/null

# 4. A legacy worktree on a branch without an issue number (oink's fix/crash-restore).
g worktree add -q -b fix/crash-restore "$LEGACY" origin/main

# 5. Issues, the pull request, the state file and the stored configuration.
"$PY" - "$T" "$ROOT/hooks/core/configs/examples/oink.ts" <<'PY'
import json, os, re, subprocess, sys, datetime
T, EXAMPLE = sys.argv[1], sys.argv[2]
AT = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
def issue(n, title, labels, assignees, body):
    return {"number": n, "title": title, "state": "OPEN", "labels": [{"name": l} for l in labels],
            "assignees": [{"login": a} for a in assignees], "updatedAt": AT, "body": body,
            "url": "https://example.invalid/fixture/oink/issues/%d" % n}
issues = [
    issue(35, "Totals wrong after midnight", ["bug"], ["fixture-dev"], "The day total keeps yesterday's expenses after midnight."),
    issue(34, "Export to CSV", ["enhancement"], [], "Export the month's expenses as a CSV file."),
    issue(33, "Crash on restore", ["bug", "testflight"], [], "**Steps.** Restore a backup on TestFlight build 41.\n\n**Expected.** The app opens."),
    issue(26, "Start day duplicates", ["bug"], ["fixture-dev"], "Starting a day twice duplicates its entries."),
]
with open(os.path.join(T, "gh-issues.json"), "w") as fh:
    json.dump(issues, fh, indent=2); fh.write("\n")
W = os.path.join(T, "tower-work", "repo", "26-start-day-duplicates")
sha = subprocess.check_output(["git", "-C", W, "rev-parse", "HEAD"], text=True).strip()
os.makedirs(os.path.join(W, ".work"), exist_ok=True)
with open(os.path.join(W, ".work", "state.json"), "w") as fh:
    json.dump({"ticket": "#26", "base": "origin/main", "phase": "review", "plan": "## Plan\n1. Guard startDay.\n2. Test it.\n",
               "checks": {"sha": sha, "at": AT, "ran": ["unit", "ui-smoke"]}, "blockers": [], "next": "fix review round 1"}, fh, indent=2); fh.write("\n")
review = ("## Review (round 1)\n\nThe guard misses a second tap while the first save is in flight.\n\n"
          "- Sources/Day.swift: check the entries after the save, not before.\n\nVerdict: fixes needed")
pr = {"number": 30, "headRefName": "fix/26-start-day-duplicates", "baseRefName": "main", "title": "Fix #26 Start day duplicates",
      "body": "Fixes #26.", "state": "OPEN", "isDraft": False, "reviewDecision": "REVIEW_REQUIRED", "statusCheckRollup": [],
      "url": "https://example.invalid/fixture/oink/pull/30", "headRefOid": sha, "mergedAt": None,
      "comments": [{"author": {"login": "fixture-dev"}, "body": review, "createdAt": AT}],
      "mergeable": "MERGEABLE", "mergeStateStatus": "CLEAN", "reviews": [], "createdAt": AT, "updatedAt": AT}
with open(os.path.join(T, "gh-state", "30.json"), "w") as fh:
    json.dump(pr, fh, indent=2); fh.write("\n")
# The stored configuration: oink's example (written as JSON in its .ts file), on this repository and these folders.
text = open(EXAMPLE).read()
config = json.loads(text[text.index("{", text.index("OINK_CONFIG")):text.rindex("}") + 1])
repo = os.path.join(T, "repo")
config["project"].update({"repo": "fixture/oink", "mainCheckout": repo})
config["tickets"]["repo"] = "fixture/oink"
config["worktree"]["pathTemplate"] = os.path.join(T, "tower-work") + "/{repo}/{n}-{slug}"
state = os.path.join(T, "state", "projects")
os.makedirs(state, exist_ok=True)
with open(os.path.join(state, re.sub(r"[^a-zA-Z0-9]", "-", repo) + ".json"), "w") as fh:
    json.dump(config, fh, indent=2); fh.write("\n")
PY

echo "github fixture ready in $T" >&2
echo "export TOWER_REPO=$T/repo"
echo "export PATH=$T/bin:\$PATH"
echo "export TOWER_STATE_DIR=$T/state"
