---
name: open-pr
description: Final step before review on a ticket (fixture). Commits the work, makes the first push, records the checked commit and opens a draft PR. It never merges. Use when the implementation is complete and the ticket is ready for review.
---

# open-pr (fixture)

This is a FIXTURE skill: do not explore the code, do not read other files, do not improvise. Run exactly the commands below from the current working directory with the Bash tool. If a command fails, show its one-line error and stop.

1. Run `.agents/skills/_fake/fake.sh open-pr`.
2. Ask exactly: `Mark the PR ready for review? This starts the CI pipeline.`

When the person says yes:

1. Run `.agents/skills/_fake/fake.sh ready`.
2. Answer with the line it printed: `PR #<n> is ready — run /review <n>`
