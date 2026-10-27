#!/bin/bash
# Tests tower-setup's command line (decisions 061, 065) on throwaway git repositories, never the person's: the scan of an
# oink-like repository (skills, a ticket worktree, release tags, an origin that is never fetched) from its main checkout
# and from a worktree, skills behind a symbolic `.claude/skills` (a layout some repositories use), then validate and save into a
# scratch TOWER_STATE_DIR with a scratch HOME: saved, unchanged, a different file kept with its diff (exit 3), --replace,
# a configuration for another checkout refused; then the guided flow on a tiny repository without a flow (render, scan
# with the rendered skills, deliver by commit and on a branch for a PR; nothing pushed). Usage: tools/check-tower-setup.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
work=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$work"' EXIT
export HOME="$work/home" TOWER_STATE_DIR="$work/state" GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
mkdir -p "$HOME"
cli="$ROOT/tools/tower-config.sh"
scan="$ROOT/tools/tower-setup-scan.sh"
bad=0
check() { # check NAME WANT GOT
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: want '$2', got '$3'"; bad=$((bad + 1)); fi
}
json() { # json FILE EXPRESSION: the expression on the parsed file (`it`), printed
  node -e 'const it = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const v = eval(process.argv[2]); console.log(typeof v === "string" ? v : JSON.stringify(v))' "$1" "$2"
}
skill() { # skill DIR NAME DESCRIPTION BODY
  mkdir -p "$1/$2"
  printf -- '---\nname: %s\ndescription: %s\n---\n\n%s\n' "$2" "$3" "$4" >"$1/$2/SKILL.md"
}
commit() { git -C "$1" add -A && git -C "$1" -c user.email=t@t -c user.name=t commit -q -m "$2"; }

# ── An oink-like repository ──
oink="$work/money-tracker"
mkdir -p "$oink/docs"
git -C "$oink" init -q -b main
printf '# Money Tracker\n\n- **Bugs and features reach `main` through a pull request**.\n- Conversation with the user is in Italian.\n' >"$oink/CLAUDE.md"
printf '# Workflow\n\n- `phase` is `planning`, then `implementing`, then `review`.\n- A ticket simulator is `iPhone 16 Pro (Oink <issue>)`.\n' >"$oink/docs/WORKFLOW.md"
skills="$oink/.claude/skills"
skill "$skills" start-ticket 'First step on a ticket of O!nk.' 'Read `docs/WORKFLOW.md`. `gh issue view <n> --repo fixture/oink`; `git worktree add <path> -b <fix|feature>/<n>-<slug> origin/main`; write `.work/state.json`, `phase` `planning`.'
skill "$skills" open-pr 'Publishes a ticket of O!nk.' 'Record `checks.sha`. Set `phase` to `review`.'
skill "$skills" review-pr 'Reviews a pull request.' "$(printf 'Post it only after a yes:\n\n```markdown\n## Review (round N)\nVerdict: ready to merge | fixes needed\n\n### Blockers\n- x\n```')"
skill "$skills" wrap-up 'Closes a ticket of O!nk.' 'Wait for a yes. Never merge without an explicit yes.'
skill "$skills" release 'Ships a build.' 'Tag `build-<n>`. Wait for a yes.'
commit "$oink" init
git -C "$oink" tag build-1 && git -C "$oink" tag build-2
git -C "$oink" remote add origin https://github.com/fixture/oink.git
git -C "$oink" worktree add -q -b fix/26-start-day "$work/tower-work/oink/26-start-day"
"$scan" "$oink" >"$work/oink.json"
check "scan: no validation error" "[]" "$(json "$work/oink.json" 'it.proposal.errors')"
check "scan: no capture skill, so the flow is partial" partial "$(json "$work/oink.json" 'it.facts.outcome')"
check "scan: GitHub issues of the origin" "fixture/oink" "$(json "$work/oink.json" 'it.proposal.config.tickets.repo')"
check "scan: new worktrees to the convention at once, the open one stays" "false" "$(json "$work/oink.json" 'it.proposal.config.worktree.followExisting')"
check "scan: the open ticket worktree named in the note" "1" "$(json "$work/oink.json" 'it.proposal.items.find(i => i.path === "worktree.followExisting").note' | grep -c '26-start-day #26) stay where they are until their ticket closes')"
check "scan: phases with review" '["planning","implementing","review"]' "$(json "$work/oink.json" 'it.proposal.config.phases.values')"
check "scan: checks from the state file and the build tags" '[{"stateFile":".work/state.json"},{"release":"build-{n}"}]' "$(json "$work/oink.json" 'it.proposal.config.checks.sources')"
check "scan: the simulator from the workflow document" 'iPhone 16 Pro (Oink {n})' "$(json "$work/oink.json" 'it.proposal.config.env.nameTemplate')"
check "scan: the main checkout" "$oink" "$(json "$work/oink.json" 'it.facts.root')"
"$scan" "$work/tower-work/oink/26-start-day" --config >"$work/oink-from-worktree.json"
check "scan from a worktree: the main checkout's" "$(json "$work/oink.json" 'it.proposal.config')" "$(json "$work/oink-from-worktree.json" 'it')"
check "scan wrote nothing in the repository" "" "$(git -C "$oink" status --porcelain)"

# ── Skills behind a symbolic link (.claude/skills -> ../.agents/skills) ──
linked="$work/linked"
mkdir -p "$linked/.claude"
git -C "$linked" init -q -b main
skill "$linked/.agents/skills" start-ticket 'Starts a Linear ticket.' 'Use the Linear MCP on `ABC-12`; `git worktree add -b x ../linked-<KEY> origin/main`.'
ln -s ../.agents/skills "$linked/.claude/skills"
commit "$linked" init
"$scan" "$linked" >"$work/linked.json"
check "symbolic skills folder: the skills read" '["start-ticket"]' "$(json "$work/linked.json" 'it.facts.skills.map(s => s.name)')"
check "symbolic skills folder: Linear ids" "ABC-{n}" "$(json "$work/linked.json" 'it.proposal.config.tickets.idTemplate')"

# ── validate ──
json "$work/oink.json" 'it.proposal.config' >"$work/config.json"
check "validate: a proposal" "ok O!nk (fixture/oink)" "$("$cli" validate "$work/config.json")"
printf '{"version": 1, "project": {}}\n' >"$work/broken.json"
set +e
out=$("$cli" validate "$work/broken.json" 2>&1); code=$?
set -e
check "validate: a broken file exits 1" 1 "$code"
check "validate: the errors as path: what" "1" "$(printf '%s\n' "$out" | grep -c '^  project: missing name$')"

# ── save ──
target="$TOWER_STATE_DIR/projects/$(printf '%s' "$oink" | sed 's/[^a-zA-Z0-9]/-/g').json"
check "path: where save writes" "$target" "$("$cli" path "$work/tower-work/oink/26-start-day")"
check "save: written" "saved $target" "$("$cli" save "$work/config.json" "$oink")"
check "save: the file is the configuration" "$(json "$work/config.json" 'it')" "$(json "$target" 'it')"
check "save: no temporary file left" "1" "$(find "$TOWER_STATE_DIR/projects" -type f | wc -l | tr -d ' ')"
check "save again: unchanged" "unchanged $target" "$("$cli" save "$work/config.json" "$work/tower-work/oink/26-start-day")"
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); c.project.name = "Oink"; fs.writeFileSync(process.argv[2], JSON.stringify(c))' "$work/config.json" "$work/renamed.json"
before=$(cat "$target")
set +e
out=$("$cli" save "$work/renamed.json" "$oink" 2>&1); code=$?
set -e
check "save over a different file: exit 3" 3 "$code"
check "save over a different file: the diff shown" "1" "$(printf '%s\n' "$out" | grep -c '^+    "name": "Oink",$')"
check "save over a different file: nothing written" "$before" "$(cat "$target")"
check "save --replace: replaced" "replaced $target" "$("$cli" save "$work/renamed.json" "$oink" --replace)"
check "save --replace: the new name" "Oink" "$(json "$target" 'it.project.name')"
set +e
"$cli" save "$work/config.json" "$linked" >/dev/null 2>&1; code=$?
set -e
check "save for another checkout than project.mainCheckout: refused" 1 "$code"
mkdir -p "$work/plain"
set +e
"$cli" save "$work/config.json" "$work/plain" >/dev/null 2>&1; code=$?
set -e
check "save outside git: refused" 1 "$code"
check "nothing written under the scratch HOME's ~/.claude" "0" "$(find "$HOME" -path '*/.claude/*' -type f | wc -l | tr -d ' ')"

# ── The guided flow (decision 065): a tiny repository without a flow and without a remote ──
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
tiny="$work/tiny"
mkdir -p "$tiny"
git -C "$tiny" init -q -b main
printf '# Tiny\n\nA tiny tool.\n' >"$tiny/README.md"
printf '{ "name": "tiny", "scripts": { "build": "tsc" } }\n' >"$tiny/package.json"
commit "$tiny" init
"$scan" "$tiny" >"$work/tiny.json"
check "flow: no flow" none "$(json "$work/tiny.json" 'it.facts.outcome')"
check "flow: every template proposed" '["new-ticket","triage","start-ticket","repro","open-pr","review-pr","wrap-up","release"]' "$(json "$work/tiny.json" 'it.flow.skills.map(s => s.skill)')"
check "flow: tests and CI as first tickets" '["Add a first test suite","Run the tests on every pull request (CI)"]' "$(json "$work/tiny.json" 'it.flow.firstTickets.map(t => t.title)')"
check "flow: the interview's tickets question" "1" "$(json "$work/tiny.json" 'it.proposal.questions.filter(q => q.startsWith("Where do the tickets live")).length')"
# The person's answers: GitHub issues of me/tiny, Italian, npm test, npm publish.
json "$work/tiny.json" 'Object.assign(it.flow.values, { ticketsRepo: "me/tiny", talkLanguage: "Italian", test: "npm test", releaseHow: "npm publish" })' >"$work/values.json"
"$cli" render "$work/values.json" "$work/flow" >/dev/null
check "render: the eight skills" "8" "$(find "$work/flow" -name SKILL.md | wc -l | tr -d ' ')"
check "render: no placeholder left" "0" "$(cat "$work/flow"/*/SKILL.md | grep -c '{{' || true)"
check "render: the base branch and the issues' repository filled" "1" "$(grep -c 'gh issue view <n> --repo me/tiny --comments' "$work/flow/start-ticket/SKILL.md")"
json "$work/values.json" 'Object.assign(it, { tickets: "none" })' >"$work/bad-values.json"
set +e
"$cli" render "$work/bad-values.json" "$work/flow-bad" >/dev/null 2>&1; code=$?
set -e
check "render: values without tickets refused" 1 "$code"
check "render: nothing written for refused values" "no" "$([ -e "$work/flow-bad" ] && echo yes || echo no)"
"$scan" "$tiny" --with-skills "$work/flow" >"$work/tiny-flow.json"
check "with the skills: the flow complete" complete "$(json "$work/tiny-flow.json" 'it.facts.outcome')"
check "with the skills: no validation error" "[]" "$(json "$work/tiny-flow.json" 'it.proposal.errors')"
check "with the skills: the steps run them" '{"start":"start-ticket","openPr":"open-pr","review":"review-pr","wrapUp":"wrap-up","release":"release"}' "$(json "$work/tiny-flow.json" 'Object.fromEntries(Object.entries(it.proposal.config.workflow.steps).map(([k, s]) => [k, s.skill]))')"
check "with the skills: phases from the state file" '["planning","implementing","review"]' "$(json "$work/tiny-flow.json" 'it.proposal.config.phases.values')"
check "with the skills: the review Tower reads" '["Review","ready to merge","fixes needed",["Blockers","Suggestions","Earlier rounds"]]' "$(json "$work/tiny-flow.json" '[it.facts.review.heading.value, it.facts.review.verdict.value.ready, it.facts.review.verdict.value.fixes, it.proposal.config.review.sections]')"
check "with the skills: the waits Tower recognises" '["openPr","post","merge","issue","release"]' "$(json "$work/tiny-flow.json" 'Object.keys(it.proposal.config.waits)')"
check "with the skills: checks recorded in the state file" '[{"stateFile":".work/state.json"}]' "$(json "$work/tiny-flow.json" 'it.proposal.config.checks.sources')"
check "with the skills: the board's keys" '["n","t","l"]' "$(json "$work/tiny-flow.json" 'it.proposal.config.repoActions.map(a => a.key)')"
check "with the skills: the project from the answers" '["Tiny","me/tiny","~/tower-work/tiny/{n}-{slug}"]' "$(json "$work/tiny-flow.json" '[it.proposal.config.project.name, it.proposal.config.project.repo, it.proposal.config.worktree.pathTemplate]')"
check "with the skills: only the delivery is asked" "1" "$(json "$work/tiny-flow.json" 'it.proposal.questions.length')"
json "$work/tiny-flow.json" 'it.proposal.config' >"$work/tiny-config.json"
set +e
"$cli" validate "$work/tiny-config.json" --skills "$tiny" >/dev/null 2>&1; code=$?
set -e
check "validate --skills: refused before the delivery" 1 "$code"
check "validate --skills: the rendered folder has them" "ok Tiny (me/tiny)" "$("$cli" validate "$work/tiny-config.json" --skills "$work/flow")"
cp -R "$tiny" "$work/tiny-pr"
cp -R "$tiny" "$work/tiny-other"
# A direct commit on main.
check "deliver commit: one commit on main" "committed" "$("$cli" deliver "$tiny" "$work/flow" commit main | cut -d' ' -f1)"
check "deliver commit: the message" "Add Tower's flow skills: new-ticket, open-pr, release, repro, review-pr, start-ticket, triage, wrap-up" "$(git -C "$tiny" log -1 --format=%s)"
check "deliver commit: only the skills in it" "8" "$(git -C "$tiny" show --name-only --format= HEAD | grep -c '^\.claude/skills/[a-z-]*/SKILL\.md$')"
check "deliver commit: the checkout clean" "" "$(git -C "$tiny" status --porcelain)"
check "after the commit: validate --skills on the repository" "ok Tiny (me/tiny)" "$("$cli" validate "$work/tiny-config.json" --skills "$tiny")"
check "after the commit: the scan proposes the same configuration" "$(json "$work/tiny-config.json" 'it')" "$(json <("$scan" "$tiny" --config) 'it')"
set +e
"$cli" deliver "$tiny" "$work/flow" commit main >/dev/null 2>&1; code=$?
set -e
check "deliver again: refused, nothing overwritten" 1 "$code"
git -C "$work/tiny-other" checkout -q -b other
set +e
"$cli" deliver "$work/tiny-other" "$work/flow" commit main >/dev/null 2>&1; code=$?
set -e
check "deliver commit: refused when the checkout is not on the base branch" 1 "$code"
check "deliver commit refused: nothing written" "no" "$([ -e "$work/tiny-other/.claude" ] && echo yes || echo no)"
# A branch for a pull request: two skills, nothing pushed, the person's checkout untouched.
check "deliver pr: committed on tower/setup-flow" "committed" "$("$cli" deliver "$work/tiny-pr" "$work/flow" pr main start-ticket open-pr | head -1 | cut -d' ' -f1)"
check "deliver pr: the branch holds the two skills" ".claude/skills/open-pr/SKILL.md .claude/skills/start-ticket/SKILL.md" "$(git -C "$work/tiny-pr" show --name-only --format= tower/setup-flow | sort | tr '\n' ' ' | sed 's/ $//')"
check "deliver pr: the checkout still on main, without the skills" "main no" "$(git -C "$work/tiny-pr" branch --show-current) $([ -e "$work/tiny-pr/.claude" ] && echo yes || echo no)"
check "deliver pr: the temporary worktree removed" "1" "$(git -C "$work/tiny-pr" worktree list | wc -l | tr -d ' ')"
set +e
"$cli" deliver "$work/tiny-pr" "$work/flow" pr main >/dev/null 2>&1; code=$?
set -e
check "deliver pr again: refused while tower/setup-flow exists" 1 "$code"
# The Linear wording renders and maps too.
json "$work/values.json" 'Object.assign(it, { tickets: "linear", ticketsRepo: null, idPrefix: "ABC" })' >"$work/linear-values.json"
"$cli" render "$work/linear-values.json" "$work/flow-linear" >/dev/null
"$scan" "$work/tiny-other" --with-skills "$work/flow-linear" >"$work/tiny-linear.json"
check "linear: no validation error" "[]" "$(json "$work/tiny-linear.json" 'it.proposal.errors')"
check "linear: Linear ids, its branch names, stacked on blockers" '["linear","ABC-{n}","linear-branch-name",true,"~/tower-work/tiny-other/{key}-{slug}"]' "$(json "$work/tiny-linear.json" '[it.proposal.config.tickets.kind, it.proposal.config.tickets.idTemplate, it.proposal.config.worktree.branch.kind, it.proposal.config.worktree.stackOnBlocker, it.proposal.config.worktree.pathTemplate]')"
tiny_target="$TOWER_STATE_DIR/projects/$(printf '%s' "$tiny" | sed 's/[^a-zA-Z0-9]/-/g').json"
check "flow: the configuration saved" "saved $tiny_target" "$("$cli" save "$work/tiny-config.json" "$tiny")"

if [ "$bad" -gt 0 ]; then echo "$bad failed"; exit 1; fi
echo "all passed"
