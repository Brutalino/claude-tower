---
name: wrap-up
description: Closes a finished ticket of {{PROJECT}}. Checks that the last review is ready, the checks cover the head commit and there is no conflict, asks for an explicit yes, merges the pull request into {{BASE_BRANCH}}, closes the ticket and removes the worktree and its branch. Use when a pull request is approved and the user asks to merge or close it.
argument-hint: "<pull request number>"
---

# Wrap up

Pull request: `#$ARGUMENTS`. Talk to the user in {{TALK_LANGUAGE}}.

A merge cannot be undone easily. The user's explicit yes for this pull request is required.

## 1. Check

```sh
gh pr view <n> --json state,mergeable,headRefName,headRefOid,title,comments
```

Stop and say why when:

| State | Step |
|---|---|
| The last `## Review (round N)` says `Verdict: fixes needed`, or there is none | `review-pr` first |
| The checks do not cover the head commit | `open-pr` again |
| A conflict with `{{BASE_BRANCH}}` | rebase in the worktree, then `open-pr` |

## 2. Ask

Show the title, the verdict, the checks and what merging does, then ask: `Merge #<n> "<title>"?` Wait for a yes. Never merge without an explicit yes.

## 3. Merge and close

```sh
gh pr merge <n> --merge --delete-branch
```

Then: {{TICKET_CLOSE}}.

## 4. Clean up

From the main checkout: `git fetch origin`, update `{{BASE_BRANCH}}`, then remove the ticket's worktree (`git worktree remove <path>`) and its local branch. The state file goes with the worktree.

Report: merged, the ticket closed, the worktree removed, and how many merged changes wait for a release.

## Hard rules

- Never merge without an explicit yes for this pull request.
