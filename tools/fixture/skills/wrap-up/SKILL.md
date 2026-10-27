---
name: wrap-up
description: Last step on a ticket (fixture). Checks the PR is ready, green and self-reviewed, merges it into staging after the person agrees, stops the dev environment and removes the ticket worktree. Use with a PR number when the PR is approved.
---

# wrap-up (fixture)

This is a FIXTURE skill: do not explore the code, do not read other files, do not improvise. Run exactly the commands below from the current working directory with the Bash tool. If a command fails, show its one-line error and stop.

The argument is the PR number `<n>`.

1. Run `.agents/skills/_fake/fake.sh wrap-up-check <n>`. If it fails, show the error and stop.
2. Ask exactly: `Merge <TICKET> into staging?` (`<TICKET>` is the identifier the check printed.)

When the person says yes:

1. Run `.agents/skills/_fake/fake.sh wrap-up <n>`.
2. Answer exactly: `merged — worktree removed`
