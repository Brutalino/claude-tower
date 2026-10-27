---
name: review-pr
description: Reviews a pull request of {{PROJECT}} against its ticket, the earlier review rounds and the repository's rules, and writes one comment with a verdict (ready to merge or fixes needed). It changes no file, never merges and never approves; it posts only after a yes. Use when the user asks to review a pull request.
argument-hint: "<pull request number>"
---

# Review PR

Pull request: `#$ARGUMENTS`. Talk to the user in {{TALK_LANGUAGE}}; the comment is in {{PUBLISH_LANGUAGE}}.

This skill reads and reports. It edits no file, makes no worktree, runs no git command that changes a checkout, and never merges.

## 1. Read

```sh
gh pr view <n> --json title,body,headRefName,baseRefName,headRefOid,state,mergeable
gh pr diff <n>
gh pr view <n> --comments
```

The base must be `{{BASE_BRANCH}}`. Read the ticket the pull request names ({{TICKET_READ}}): the review judges the diff against the ticket.

## 2. Earlier rounds

Read every earlier review comment. Report each earlier point as closed (with the commit) or still open. This review is round N: one more than the last `## Review (round N)` comment, else 1.

## 3. Judge

For each: fine, suggestion, or blocker, with file and line.

- Scope: the diff does what the ticket asks, and nothing else.
- The repository's rules:

{{RULES}}

- Tests: for each test the change adds, what change in the product code would turn it red. A test that cannot fail is a blocker.
- Checks: {{CHECKS_READ}} Stale or missing checks are a blocker.
- A conflict with `{{BASE_BRANCH}}` is a blocker.

## 4. Save, show, then post

Write the review, exactly as it would be posted, to `<the ticket's worktree>/.work/review/pr-<n>-round-<N>.md` (the worktree from `git worktree list`; else the session's scratchpad):

```markdown
## Review (round N)
Verdict: ready to merge | fixes needed

### Blockers
- <file:line — what and why>

### Suggestions
- <file:line — what and why>

### Earlier rounds
- <point> — closed in <sha> | still open
```

`Verdict: ready to merge` only with no blocker. Show it to the user. Post it only after a yes:

```sh
gh pr comment <n> --body-file <the saved file>
```

## Hard rules

- Change no file. Fix nothing. Merge nothing. Approve nothing.
