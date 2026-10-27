---
name: open-pr
description: Publishes a ticket of {{PROJECT}} for review. Rebases on {{BASE_BRANCH}}, reads the whole diff, runs the checks the change needs, records the commit they ran on in .work/state.json, makes the first push and opens the pull request. It never merges. Use when the implementation of a ticket is done.
---

# Open PR

Talk to the user in {{TALK_LANGUAGE}}; the commits and the pull request are in {{PUBLISH_LANGUAGE}}.

## 1. Preconditions

Read `.work/state.json`. Stop and name the right step when:

| State | Step |
|---|---|
| No state file | `start-ticket` first |
| `phase` is `planning` | the plan has no "go" yet |
| Nothing changed | there is nothing to publish |

## 2. Commit the open work

Ask the user before you commit. Never commit without an answer. One message per change: what changed and why.

## 3. Rebase

```sh
git fetch origin
git rebase origin/{{BASE_BRANCH}}
```

Stop and report a conflict the ticket does not cover.

## 4. Read the diff

`git diff origin/{{BASE_BRANCH}}...HEAD`, all of it, against the plan in the state file. Remove debug output and commented code. Work outside the ticket goes into a new ticket.

## 5. Checks

Run, in the worktree: the build ({{BUILD}}), then `{{TEST}}`. Stop on any failure.

Then record the commit they ran on, in `.work/state.json`:

```json
"checks": { "sha": "<the full SHA of HEAD>", "at": "<UTC time>", "ran": ["build", "tests"] }
```

A new commit makes the record stale: run the checks again before the next push.

## 6. Push and open the pull request

```sh
git push -u origin HEAD
gh pr create --base {{BASE_BRANCH}} --title "<what changed>" --body-file <file>
```

The body:

```markdown
{{PR_LINKS}}

## Problem and solution
<what was wrong, what the change does>

## How to try it
<steps>

Tested: <the checks that ran on the head commit, with counts>
```

Set `phase` to `review` in `.work/state.json`. Report: the pull request's number and link, the checks, and the next step: `review-pr <number>` in a session of its own.

## Hard rules

- Never merge. Never push without the checks recorded on the head commit.
