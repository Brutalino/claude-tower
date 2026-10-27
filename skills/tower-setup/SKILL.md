---
name: tower-setup
description: Sets up Tower for the git repository of this session. Reads the repository (CLAUDE.md, README, docs, stack files, skills, workflows, tags, worktrees, recent issues and PRs), writes a short brief with its sources, compares the repository's flow with Tower's reference flow, proposes the missing flow skills adapted to the repository (a guided interview when there is no flow), and a Tower configuration with the evidence and a confidence for each item. It asks only what the documents do not say, delivers accepted skills by pull request or direct commit only after a yes, validates the configuration with Tower's own schema, and saves it in Tower's folder only after an explicit yes. Use when the person asks to set up Tower, to configure Tower for a repository, or to run tower-setup.
allowed-tools: Bash("${CLAUDE_PLUGIN_ROOT}/tools/tower-setup-scan.sh" *), Bash("${CLAUDE_PLUGIN_ROOT}/tools/tower-config.sh" validate *), Bash("${CLAUDE_PLUGIN_ROOT}/tools/tower-config.sh" path *), Bash("${CLAUDE_PLUGIN_ROOT}/tools/tower-config.sh" render *)
---

# tower-setup

This skill reads a repository and gives Tower its configuration, and, when the repository's flow lacks stages, the skills for them. Until the person accepts a delivery it is read only for the repository: it changes no file in it, makes no commit, runs no git command that writes (no fetch, no checkout, no worktree), and writes nothing to GitHub or Linear. It writes, each only after its own explicit yes: the accepted skills (one commit, through `tower-config.sh deliver`), the push and the pull request that carry them, the first tickets, and the configuration in Tower's own folder.

Talk to the person in their language (the language of their messages; the repository's rule when CLAUDE.md names one). Ask one question at a time, and only what the documents do not answer.

The tools are in Tower's plugin folder, `${CLAUDE_PLUGIN_ROOT}` (two folders above this skill, `${CLAUDE_SKILL_DIR}`). They need node 22.18 or later; when the tool says node is missing or too old, tell the person and stop.

## 0. The repository

- The repository is the git repository of the current folder. Run `git rev-parse --show-toplevel`; when it fails, say "tower-setup needs a git repository" and stop.
- A worktree is fine: the scan always reads the main checkout.

## 1. Scan

Run:

```sh
"${CLAUDE_PLUGIN_ROOT}/tools/tower-setup-scan.sh" "<the repository>"
```

It prints JSON: `facts` (each fact with its evidence, `path:line` or `git: …`), `proposal` (`config`, `items` with a confidence each, `notSupported`, `questions`, `errors`) and `flow` (`skills`: the reference-flow skills the repository lacks, each with its stage and reason; `notes`: stages covered only in part; `firstTickets`: large missing work; `values`: the draft values for the skill templates). The scan is mechanical: it finds what files and git say. You read the rest.

## 2. Read

Read, as far as needed to write the brief and to check the scan:

- every `CLAUDE.md` and `AGENTS.md` (`facts.instructions`), the README, the documents the skills name, and `docs/` titles (`facts.docs`);
- the stack files (`facts.stack`): build and test commands, scripts (`facts.scripts`), `Makefile`, Dockerfiles;
- `.github/workflows` (`facts.workflows`): what runs on pull requests, on pushes, on tags;
- the repository's skills (`facts.skills`), each `SKILL.md` of the flow in full;
- tags, branches and worktrees (`facts.releaseTags`, `facts.branchPrefixes`, `facts.worktrees`);
- when the origin is on GitHub (`facts.remote.slug`), with read-only `gh` only: `gh issue list --repo <slug> --limit 20 --json number,title,labels`, `gh pr list --repo <slug> --state all --limit 20 --json number,title,baseRefName,headRefName,state`, `gh label list --repo <slug>`. Never `gh issue create`, `gh pr comment` or any other command that writes.

## 3. The brief

Write a short brief, at most eight lines, in this shape. Every line ends with its sources (`file:line`, or `gh`, or `git`); a line without a source is not written.

```
 Brutalino/oink · O!nk                                       git origin
 iOS expense tracker (Swift 6, SwiftUI) + static site        CLAUDE.md:31
 Build    xcodegen + xcodebuild · iPhone 16 Pro simulator     ios/README.md:17, CLAUDE.md:54
 Tests    unit + UI (≈5.5 min, release only) · per ticket: the use case's   CLAUDE.md:54
 Rules    main = production · nothing merges without the owner's yes        CLAUDE.md:31, CLAUDE.md:42
 Flow     GitHub issue → start-ticket → open-pr → review-pr → wrap-up → release   docs/WORKFLOW.md:9
```

(oink's brief, as an example of the shape.)

## 4. Flow against the reference flow

Read `${CLAUDE_SKILL_DIR}/reference-flow.md`. Compare the repository's flow with it, stage by stage, starting from `facts.flow` and `facts.outcome`, and correct them where your reading says otherwise (say why). Then, by outcome:

- **complete**: say so in one line; mention at most one or two details that differ from the reference; propose no skill. Go to section 7.
- **partial**: show the coverage table (stage, covered yes / partly / no, the skill, the evidence). Propose only the missing stages: each skill of `flow.skills` with its reason, and each `flow.notes` entry as a change to list (no template for it). Go to section 5.
- **none**: show the table, then run the guided interview (section 6) before any proposal, then section 5 for every stage.

When the person wants no change ("leave it as it is"), do not insist: no skill is proposed, the configuration keeps what the repository has, and Tower stays minimal (plain sessions for tickets, phases from git).

## 5. The missing skills

The templates are in `${CLAUDE_SKILL_DIR}/flow/` (`new-ticket`, `triage`, `start-ticket`, `repro`, `open-pr`, `review-pr`, `wrap-up`, `release`). They produce exactly what Tower reads: the state file `.work/state.json` with `phase` planning → implementing → review and the plan-then-"go" rule, the checks recorded as `checks: { sha, at, ran }`, the review comment `## Review (round N)` with `Verdict: ready to merge | fixes needed` saved under `.work/review/` before it is posted, and the questions Tower's waits recognise (commit, post, merge, create the issue, release). Do not change those parts when you adapt a skill.

1. **Values.** Start from `flow.values` and complete them from the brief and the answers: `project`, `baseBranch`, `tickets` (`github` with `ticketsRepo` `owner/name`, or `linear` with `idPrefix`), `talkLanguage`, `publishLanguage`, `build` (null: nothing to build), `test` (a ticket's checks), `fullSuite` (null: the same), `ci`, `releaseHow`, `releaseTagPrefix` (`release-` gives `release-<n>` tags), `feedbackSource`, `rules` (the repository's rules from CLAUDE.md, each with its `file:line`), `worktreeRoot` (`~/tower-work/<repo>`). Without tickets there is no flow to propose: say so and keep Tower minimal.
2. **Render** into the scratchpad (never the repository):
   ```sh
   "${CLAUDE_PLUGIN_ROOT}/tools/tower-config.sh" render <values.json> <scratch>/flow <skill> …
   ```
   It refuses values that do not hold together and any placeholder left unfilled.
3. **Read each rendered skill** against the repository: add what the brief says and the template cannot know (a second build step, a simulator, a rule that applies to that step). Keep the parts Tower reads as they are.
4. **One skill at a time**: show its name, its stage, the reason, and its text (or the differences from the template); ask the person to accept or refuse it. A refused skill is not delivered and its stage stays uncovered (say what Tower then does without it). Keep only the accepted ones in `<scratch>/flow`.

## 6. Questions

Ask only what the documents and the scan do not answer (`proposal.questions` is the starting list; drop a question your reading answered, with its source). One question at a time, in the person's language.

The guided interview (outcome none), the real questions, each only when the documents leave it open:

1. Where do the tickets live: GitHub issues of this repository, Linear, or none?
2. Is there CI on pull requests? If not: how and when do the tests run (the command, before every push or only at release)?
3. How do you release (a tag, a store upload, a package, a deploy), and how often?
4. Which language to talk to you in, and which to publish in (tickets, pull requests, commits, comments)?

Always ask the delivery:

- "How do Tower's skill changes reach this repository: by pull request, or by a direct commit on `<base branch>`?" Suggest pull request when the repository has a no-direct-to-main rule (the evidence in `proposal.items`, path `delivery`). Set `delivery` to `pr` or `commit` from the answer.

## 7. The proposal

When skills were accepted, scan again as if they were in the repository, so the configuration runs them:

```sh
"${CLAUDE_PLUGIN_ROOT}/tools/tower-setup-scan.sh" "<the repository>" --with-skills <scratch>/flow
```

Start from `proposal.config` and `proposal.items`. Show one table, every module of the configuration (`project`, `tickets`, `worktree`, `workflow`, `phases`, `review`, `waits`, `checks`, `env`, `repoActions`, `routing`, `delivery`):

| Item | Value | Evidence | |
|---|---|---|---|
| tickets | GitHub issues of Brutalino/oink · bug → fix/, else feature/ | .claude/skills/start-ticket/SKILL.md:3 | ✓ |

- `✓`: a document or git says it. `?`: inferred, or Tower's default; say what it rests on. `✗`: not supported; it goes to the "not supported yet" list, not into the configuration.
- Correct an item when your reading shows the scan was wrong, and say so with the evidence. Things that no module can express (`proposal.notSupported`, plus any you find) go to the "not supported yet" list.
- Tower's conventions, always proposed:
  - worktrees under `~/tower-work/<repo>/<key>-<slug>` (GitHub issues: `<n>-<slug>`), for every new ticket at once (`worktree.followExisting` false), so every repository uses the same convention. List the open ticket worktrees (the note of `worktree.followExisting`): they stay where they are until their ticket closes, and Tower still finds them through `git worktree list`.
  - branches: a Linear ticket keeps the branch name Linear suggests; a GitHub issue gets `fix/<n>-<slug>` when labelled `bug`, else `feature/<n>-<slug>`.
  - `routing`: `defaults` (the repository's skills on the session's model; per-skill choices from the deck's routing view).
- `permissions` (optional, never scanned): `{ "allow": [...] }`, Claude Code rules in its `permissions.allow` syntax (`"Bash(xcodebuild:*)"`) that every session Tower starts for the project runs without asking (decision 080). Offer it once, after the table: "Commands your sessions should run without asking (builds, simulators, …)?" Propose the commands the repository's own build, test and run steps use (e.g. `Bash(xcodebuild:*)`, `Bash(npm run test:*)`), never `rm` or `kill` (a rule matches the command's prefix, not its folder). Without an answer, leave the key out.
- The person can accept the whole proposal, change an item in words ("the base branch is develop"), ask for the details of an item, or discard the proposal. Apply a change to the JSON and show the changed row again.

## 8. Deliver the accepted skills

Only when skills were accepted, and only after the person's explicit yes to deliver them ("Add these N skills to the repository by <pull request | a commit on <base>>?"):

- **By pull request**:
  ```sh
  "${CLAUDE_PLUGIN_ROOT}/tools/tower-config.sh" deliver "<the repository>" <scratch>/flow pr <base branch>
  ```
  It commits the skills on a new branch `tower/setup-flow` (from `origin/<base>`, else `<base>`) in a temporary worktree; the person's checkout is not touched, and nothing is pushed. Then ask again, because this is visible to others: "Push `tower/setup-flow` and open the pull request?" Only after that yes:
  ```sh
  git -C "<the repository>" push -u origin tower/setup-flow
  gh pr create --base <base branch> --head tower/setup-flow --title "Add Tower's flow skills" --body "<what each skill does, and why>"
  ```
- **By a direct commit**:
  ```sh
  "${CLAUDE_PLUGIN_ROOT}/tools/tower-config.sh" deliver "<the repository>" <scratch>/flow commit <base branch>
  ```
  The main checkout must be on the base branch; the commit holds only the new skills. Push nothing unless the person asks.

`deliver` refuses a skill the repository already has, and an existing `tower/setup-flow` branch. It never overwrites.

## 9. First tickets

Large missing work (`flow.firstTickets`, and any your reading adds: no tests, no CI) is not done during setup. Propose each as a ticket of the new flow: show its title, label and body, and create it only after an explicit yes for that ticket, by the configured tickets (`gh issue create --repo <owner/name> …`, or the Linear MCP `save_issue`). Without a yes it stays a proposal in the summary.

## 10. Validate, then save after a yes

1. Write the final configuration to a temporary file outside the repository (the session's scratchpad, else `${TMPDIR:-/tmp}/tower-setup-<projectId>.json`; `facts.projectId`).
2. Validate it:
   ```sh
   "${CLAUDE_PLUGIN_ROOT}/tools/tower-config.sh" validate <file>
   ```
   After a direct-commit delivery add `--skills "<the repository>"`; with a pull request still open, `--skills <scratch>/flow`. It fails when the configuration runs a skill that is not there. On errors, fix the JSON and validate again. Never offer to save a configuration that does not validate.
3. Show where it would go (`"${CLAUDE_PLUGIN_ROOT}/tools/tower-config.sh" path "<the repository>"`) and ask: "Save this configuration for Tower?" Save only after an explicit yes in the conversation, for this configuration. Any other answer saves nothing. With a pull request still open, say that the flow's steps start working once it is merged.
4. Save:
   ```sh
   "${CLAUDE_PLUGIN_ROOT}/tools/tower-config.sh" save <file> "<the repository>"
   ```
   Exit 3 means a configuration is already stored and differs: show the diff it printed and ask again. Only after a second explicit yes, run the same command with `--replace`. `unchanged` means the stored one is the same.

## 11. Summary

End with, in a few lines:

- the brief's first two lines and the outcome (complete / partial / none);
- the skills delivered and how (the commit, or the pull request's link), and the ones refused;
- what was saved and where (or "nothing saved");
- the "not supported yet" list;
- the first tickets: created (with links) or proposed.

## Hard rules

- Nothing in the repository changes without an explicit yes: no file, no commit, no branch, no worktree but `deliver`'s temporary one, no `git fetch`. The push and the pull request need a yes of their own.
- Read GitHub with read-only `gh` commands; write to GitHub or Linear only the pull request and the tickets the person said yes to.
- Never overwrite a skill the repository has; propose a change to it in words instead.
- Save only after an explicit yes; replace a stored configuration only after a second explicit yes on its diff.
- Do not invent evidence: an item without a source is `?`, and says what it rests on.
