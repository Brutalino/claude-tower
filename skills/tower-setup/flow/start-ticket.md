---
name: start-ticket
description: First step on a ticket of {{PROJECT}}. Creates the ticket's worktree and branch, reads the {{TICKET}} in full, explores the code read-only, and writes a diagnosis and a plan into .work/state.json. It changes no product code until the user says "go"; after "go" it implements the plan. Use when the user asks to start, pick up or continue a ticket.
argument-hint: "{{TICKET_ARG}}"
---

# Start ticket

Ticket: `$ARGUMENTS` (for example `{{TICKET_EXAMPLE}}`). Talk to the user in {{TALK_LANGUAGE}}; write everything published (code, comments, commits, tickets, pull requests) in {{PUBLISH_LANGUAGE}}.

The user must find a complete picture, and approve it, before any product code changes.

The repository's rules:

{{RULES}}

## 1. The worktree

- When the current folder is already this ticket's worktree (its branch or its folder name carries the ticket's number), or `git worktree list` shows one: go there, read `.work/state.json`, and continue from its `phase` and `next`. Do not rebuild it.
- Otherwise, from the main checkout:

```sh
git fetch origin {{BASE_BRANCH}}
git worktree add {{WORKTREE_PATH}} -b <branch> origin/{{BASE_BRANCH}}
```

- Branch: {{BRANCH_RULE}}.
{{BLOCKER_RULE}}- From here on every command runs in the worktree. Never run git in the main checkout, never change branch, never use `git stash`.

## 2. Read the ticket in full

Read it with {{TICKET_READ}}: the body, the labels, every comment. When it is closed, or a pull request already exists for it, say so and stop. When it is unclear, or needs more than it says, do not guess: the questions go to the user and into the plan's open questions.

When the ticket is a bug that no test or command proves yet, propose `repro` before the plan.

## 3. Explore the code, read only

Find the code the ticket touches and the closest existing pattern; the plan reuses the project's patterns. Note the checks the change needs: the build ({{BUILD}}) and the tests of what it touches (`{{TEST}}`).

## 4. Write the state file

Write `.work/state.json` in the worktree (git-ignored; add `.work/` to `.gitignore` when it is not there):

```json
{
  "ticket": "{{TICKET_EXAMPLE}}",
  "phase": "planning",
  "base": "origin/{{BASE_BRANCH}}",
  "plan": "## Diagnosis\n…\n\n## Plan\n1. …\n\n## Open questions\n…",
  "checks": { "sha": null, "at": null, "ran": [] },
  "evidence": [],
  "next": "approve the plan, then implement"
}
```

- `phase` is `planning` until the user says "go", then `implementing`, then `review` once the pull request is open (open-pr sets it).
- The branch, the path and the pull request are read from git, never stored twice.

End the planning with these lines: the diagnosis in one sentence, the plan's steps as titles, the open questions, and

`plan saved to .work/state.json — review it, then say "go" to start implementing`

## 5. "go" is the approval

When the user says "go": set `phase` to `implementing`, then implement the plan, step by step, in this worktree. A test added for the change must fail without it. When the work is done, say so and name the next step: `open-pr`.

## Hard rules

- No product code, no commit and no push while `phase` is `planning`.
- Keep to the ticket's scope: other work goes into the open questions, or into a new ticket.
