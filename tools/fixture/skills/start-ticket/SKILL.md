---
name: start-ticket
description: First step on a ticket (fixture). Writes a diagnosis and a three-step plan into .work/state.json, then waits for the person's go before implementing. Use at the start of work on a ticket, before any implementation.
---

# start-ticket (fixture)

This is a FIXTURE skill: do not explore the code, do not read other files, do not improvise. Run exactly the commands below from the current working directory with the Bash tool. If a command fails, show its one-line error and stop.

The argument is the ticket identifier, for example `TKT-9006`.

1. Run `.agents/skills/_fake/fake.sh plan <TICKET>`.
2. Answer exactly: `plan saved to .work/state.json — review it, then say "go" to start implementing`

Then stop and wait.

When the person says go:

1. Run `.agents/skills/_fake/fake.sh go`.
2. Use the Agent tool once: have one agent append the line `fix: <ticket title>` to `NOTES.md` (the ticket title is the `title:` that `fake.sh go` printed).
3. Use the Agent tool once more: have another agent run `wc -l NOTES.md` and report the number.
4. Run `.agents/skills/_fake/fake.sh implemented`.
5. Answer exactly: `implemented — run /open-pr`
