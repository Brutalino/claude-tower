---
name: repro
description: Proves a bug of {{PROJECT}} before it is fixed. Reproduces it with a test, a command or exact steps, scores the confidence from 0 to 100, and records the evidence in .work/state.json. It fixes nothing. Use when a bug ticket is not proven yet, before its plan is approved.
argument-hint: "{{TICKET_ARG}}"
---

# Repro

Ticket: `$ARGUMENTS`. Talk to the user in {{TALK_LANGUAGE}}.

Run in the ticket's worktree (start-ticket made it). Read `.work/state.json` and the ticket ({{TICKET_READ}}).

## 1. Reproduce

- Find the smallest way to see the bug: a failing test first, else a command, else exact steps.
- Run it. Note what happens and what should happen.
- Never change product code to make the bug appear.

## 2. Score

`confidence` from 0 to 100: 90 or more when a test or a command shows the bug every time; 50 to 89 when steps show it sometimes; under 50 when it is not seen.

## 3. Record

In `.work/state.json`: set `confidence`, and add one entry per finding to `evidence[]`: `{ "what": "...", "how": "the test or the command", "result": "what happened" }`.

Show the findings to the user. Write them as a comment on the ticket ({{TICKET_COMMENT}}), in {{PUBLISH_LANGUAGE}}, only after a yes.

## Hard rules

- Fix nothing. Commit nothing.
