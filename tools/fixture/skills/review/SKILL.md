---
name: review
description: Self-review of a pull request (fixture). Shows the diff stat and a short self-review, and posts it to the PR only after the person agrees. Use with a PR number once the PR is ready for review.
---

# review (fixture)

This is a FIXTURE skill: do not explore the code, do not read other files, do not improvise. Run exactly the commands below from the current working directory with the Bash tool. If a command fails, show its one-line error and stop.

The argument is the PR number `<n>`.

1. Run `.agents/skills/_fake/fake.sh review <n>` and show its output unchanged, as your whole answer: nothing before it, nothing after it. Save no file.

When the person replies `post`:

1. Run `.agents/skills/_fake/fake.sh review-post <n>`.
2. Answer exactly: `review posted — run /wrap-up <n>`
