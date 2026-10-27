---
name: dev-env
description: Starts, stops or reports the ticket's local dev stack (fixture: a tiny static server). Use with up, down or status from a ticket worktree.
---

# dev-env (fixture)

This is a FIXTURE skill: do not explore the code, do not read other files, do not improvise. Run exactly the commands below from the current working directory with the Bash tool. If a command fails, show its one-line error and stop.

The argument is `up`, `down` or `status` (default `status`).

1. Run `.agents/skills/_fake/fake.sh dev-env <verb>`.
2. Answer with the one line it printed (for `up`: `stack is up on <url>`).
