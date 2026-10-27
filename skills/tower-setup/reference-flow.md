# Tower's reference flow

The flow a ticket follows from the first report to a release, in general terms. tower-setup compares a repository's own process with it; it is not a copy of any one repository's skills. Each stage says what it must produce and what Tower reads from it (the configuration field in brackets). A stage can be done by a skill of the repository, by a document the skills share, or by CI.

| # | Stage | Typical skill | Covered when |
|---|---|---|---|
| 1 | Capture | `new-ticket`, `triage`, `shape` | a skill turns a request or feedback into one ticket |
| 2 | Plan | `start-ticket` (+ `repro`) | a skill makes the worktree and writes a plan before any code |
| 3 | Verification recorded | in `open-pr`, or CI | the checks are tied to the commit they ran on |
| 4 | Pull request | `open-pr` | a skill publishes the branch and opens the PR |
| 5 | Review | `review`, `review-pr` | a skill writes a review comment in a fixed format |
| 6 | Merge | `wrap-up` | a skill merges after an explicit yes and cleans up |
| 7 | Release | `release` | a skill (or CI on tags or pushes) ships what is merged |

Outcome: **complete** when every stage is covered; **none** when the repository has no start, pull request, review or merge skill; **partial** otherwise. A stage is only partly covered when a start skill writes no state file, when a review skill has no heading with a verdict or a blockers section, and when a release is only CI on pushes or tags (no skill).

## 1. Capture

- Produces: one ticket per change, with the problem in the reporter's words, its kind (bug or feature, as a label), and what "done" means. The ticket is created only after the person's explicit yes.
- A feature request is checked against the product's scope before it becomes a ticket.
- Tower reads: where the tickets live [`tickets`: GitHub issues, Linear, none] and their labels (a `bug` label gives a `fix/` branch); the skills as keys on the board, run in the main checkout [`repoActions`: `s` shape, `n` new ticket, `t` triage]; the question before the ticket is created [`waits.issue`].

## 2. Plan

- Produces, in this order:
  1. the ticket's worktree, outside the main checkout, on its own branch cut from the base branch [`worktree`, `project.baseBranch`];
  2. a state file in the worktree (git-ignored) that holds the phase, the plan (diagnosis, steps, open questions) and the next step [`phases`];
  3. for a bug that is not proven yet: a reproduction, with its evidence and a confidence, before the plan is approved (`repro`).
- No product code changes while the phase is `planning`. The person's "go" moves it to `implementing`.
- Tower reads: the state file's path and its phase words [`phases.path`, `phases.values`, `phases.mapping`]; a state file that exists means the ticket started; the start skill and its arguments [`workflow.steps.start`].
- Without a state file Tower reads the phase from git (no commits, commits, an open PR, merged).

## 3. Verification recorded

- Produces: the checks that ran, recorded against the commit they ran on, so that a later commit makes them stale. Either:
  - CI that runs on the pull request's head [`checks.sources`: `github-ci`]; or
  - a record in the state file: `checks: { sha, at, ran[] }` [`checks.sources`: `{ stateFile }`]; Tower compares `sha` with the PR's head and shows `checks stale` when they differ.
- When the full suite runs only at release: the release tags [`checks.sources`: `{ release: '<prefix>{n}' }`], shown as the last release and the commits since it.

## 4. Pull request

- Produces: the branch rebased on the base branch, the checks run and recorded, the first push, and a pull request whose body says what changed, why, and which checks ran on the head commit. The state file's phase becomes `review` when the repository uses that phase.
- Asks before it commits, and before it starts anything that costs (a CI run).
- Tower reads: the step [`workflow.steps.openPr`]; its questions [`waits.openPr`], which away mode answers yes.

## 5. Review

- Runs in a session of its own, never the author's. It reads the diff against the ticket and the earlier rounds, and reports each earlier point as closed or still open. It changes no file and never merges.
- Produces: one comment with a fixed shape:
  - a heading line, the same every round, with the round: `## <Heading> (round N)` [`review.heading`, `review.roundPattern`];
  - fixed `###` sections [`review.sections`];
  - and how to tell ready from not ready: a verdict line (`Verdict: ready to merge | fixes needed`) [`review.verdict`], or a blockers section with a fixed text for none (`_(none)_`) [`review.blockersSection`].
- Before it asks to post, the review is saved, exactly as it would be posted, under the worktree [`review.savePath`]. It posts only after a yes [`waits.post`; away mode never answers it].
- Tower reads: the step [`workflow.steps.review`, `review.skill`]; the round, the verdict and the blockers from the comment.

## 6. Merge

- Produces: the merge, only when the last review is ready, the checks cover the head and there is no conflict, and only after the person's explicit yes for this pull request. Then the ticket closes, and the worktree and its branch are removed.
- Tower never merges by itself and never runs this step by itself.
- Tower reads: the step [`workflow.steps.wrapUp`]; its question [`waits.merge`].

## 7. Release

- Runs in the main checkout. Produces: the list of what ships since the last release, the person's yes, the full suite when it runs only here, the build, a tag (`<prefix><n>`), and a note on each shipped ticket.
- Tower reads: the step and its key [`workflow.steps.release`, a `hub` step; `repoActions` `l`]; the tags [`checks.sources` `{ release }`]; its question [`waits.release`].

## Across the stages

- **Environment per ticket** [`env`]: a skill that starts the ticket's stack and writes `env` in the state file, with its port slots; or a simulator named per ticket; or nothing.
- **Language**: the language to talk to the person in, and the language of everything published (tickets, PRs, commits, comments).
- **Delivery** [`delivery`]: how Tower's own skill changes reach the repository, by pull request or by a direct commit on the base branch; asked once per repository.

## The templates

`flow/` holds one skill template per stage (`new-ticket`, `triage`, `start-ticket`, `repro`, `open-pr`, `review-pr`, `wrap-up`, `release`), written in these terms with `{{PLACEHOLDERS}}` for what the repository decides (base branch, tickets, commands, languages, rules). tower-setup proposes the ones a repository lacks, fills them (`tower-config.sh render`) and delivers the accepted ones (`tower-config.sh deliver`). The review template is `review-pr`, not `review`: Claude Code has a `/review` of its own.
