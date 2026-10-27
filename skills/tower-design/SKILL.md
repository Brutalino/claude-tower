---
name: tower-design
description: "Tower's New project mode: takes a new project from a raw idea to its design documents in the folder the session was opened in, as a guided brainstorm in seven stages (idea, research, product, decisions, architecture, design, plan), each closed only by the user's explicit go, then hands over to tower-setup. Resumes where it stopped. Use when the user wants to design a new project from nothing in an empty folder, or says /tower:tower-design; not for an existing repository (that is tower-setup)."
argument-hint: "[the idea, in your words]"
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/tools/tower-design-state.sh *)
---

# tower-design: a new project, from the idea to the plan

The folder this session was opened in **is** the project. Never pick, propose or move to another location, never create a subfolder for the project: everything goes here. You guide the user through stages 1 to 7; each produces a document in `docs/` and closes only on the user's explicit go. Stage 8 is tower-setup's.

| # | Stage | Produces | Template |
|---|---|---|---|
| 1 | Idea | `docs/IDEA.md` (and `docs/README.md`, `docs/DECISIONS.md` started) | `IDEA.md`, `README.md`, `DECISIONS.md` |
| 2 | Research | `docs/RESEARCH.md`; `IDEA.md` rewritten sharper at its end | `RESEARCH.md` |
| 3 | Product | `docs/PRODUCT.md` | `PRODUCT.md` |
| 4 | Decisions | `docs/DECISIONS.md`: platform, stack, data | `DECISIONS.md` |
| 5 | Architecture | `docs/ARCHITECTURE.md` | `ARCHITECTURE.md` |
| 6 | Design | a design canvas, or `design/iteration-<n>.html`; skipped without a UI | `design-iteration.html` |
| 7 | Plan | `docs/ROADMAP.md` | `ROADMAP.md` |
| 8 | Setup | tower-setup: git, the stack, a first test, `CLAUDE.md`, the workflow, the first tickets | (not this skill) |

The templates are in `${CLAUDE_SKILL_DIR}/templates/` (if that is not filled in, `${CLAUDE_PLUGIN_ROOT}/skills/tower-design/templates/`; else Glob for `**/tower-design/templates/PRODUCT.md`). They follow the shape of a project Tower already runs (PRODUCT, DECISIONS, ROADMAP with their own intros), so every project born in Tower looks alike: copy the template, replace every `<…>`, delete what does not apply, keep the intro paragraphs.

## The state file

The stage state lives in `.tower/design.json` in the project folder. Tower's rail reads it to draw the path (`✓ 1 Idea … docs/IDEA.md`, `◆ 2 Research … 3 open questions`, `○ 3 Product …`). Change it **only** through the script, never by editing the JSON:

Always run it by its full path, `${CLAUDE_PLUGIN_ROOT}/tools/tower-design-state.sh`, from the project folder (that is what this skill is allowed to run without asking); below it is written `tower-design-state.sh` for short.

```
tower-design-state.sh init                                   # create it (stage 1 active), or show where it stands
tower-design-state.sh show                                   # the stages and the open questions
tower-design-state.sh advance                                # the go: the active stage done, the next one to do active
tower-design-state.sh add-question <stage> "<question>"       # prints its id, q1, q2, …
tower-design-state.sh resolve-question <id> "<answer>"
tower-design-state.sh set-stage <stage> skipped "<reason>"   # the design stage of a product without a UI
tower-design-state.sh set-stage <stage> <done|active|todo>   # reopening a stage (see "Going back")
tower-design-state.sh set-doc design "<canvas link or design/>"
```

`<stage>` is the number or the key (`idea research product decisions architecture design plan setup`). The script refuses anything that would break the file and says why; fix the command, never the file. If `${CLAUDE_PLUGIN_ROOT}` is not filled in, Glob for `**/tools/tower-design-state.sh` in the Tower plugin.

## On start

1. **The folder.** List it (`ls -A`). Go on when it is empty, or holds only what this skill makes (`.tower/`, `docs/`, `design/`, `spikes/`, a `README.md`, `.DS_Store`, an empty `.git`). If it holds a project already (source files, a package manifest, a git history with commits), stop and say so: an existing repository is tower-setup's (Git repository mode), not this skill's. Go on only if the user says so explicitly.
2. **The state.** Run `tower-design-state.sh init`.
   - New: say in two lines what is going to happen (seven stages, each closed by their go, no code before the setup), then start stage 1. If the user gave the idea as the argument, that is the raw idea.
   - Existing: you are resuming. Read `tower-design-state.sh show`, the documents of the stages done and the current stage's document as far as it goes. Tell the user in three lines where things stand (the stage, what is written, the open questions) and continue the current stage from where it stopped. Never redo a stage that is done unless the user asks.

## Rules, at every stage

- **The user's language.** Talk in the language the user writes in. Write the documents in that language too, unless the user asks for another; record the choice as the first entry of `DECISIONS.md` and in `docs/README.md`.
- **One question at a time**, each with its options and their trade-offs, and your recommendation with its reason. Use the question tool when the session has one (two to four options, the trade-off in each option's description), else a short numbered list. Never a questionnaire; ask only what the documents and the research do not already say.
- **Every choice goes into `DECISIONS.md`** in the same turn it is made: date, the decision, the options weighed with their trade-offs, why, what it rules out, the evidence. Append-only: a changed decision is a new entry that points at the old one.
- **A stage closes only on the user's explicit go.** At the end of a stage: show what the document now says (a short summary, not the whole file), list what is still open, and ask whether to close it and move to the next stage. Only an explicit yes for that (go, vai, ok procedi, next stage, …) closes it: then run `tower-design-state.sh advance`. An answer to a question inside the stage is not a go. Never close two stages at once.
- **No product code before stage 8.** Write only in `docs/`, `design/`, `spikes/` and `.tower/` (the last through the script). No `git init`, no package manifest, no `src/`, no dependency installed, no external account touched: all of that is tower-setup's, with the user's yes for each action.
- **Prototypes** are throwaway and run in a separate session, never in this one (see "Prototypes").
- **Open questions** that block a stage go into the state file (`add-question`), so the path shows them; when answered, `resolve-question` with the answer, and the answer goes where it belongs (`RESEARCH.md` "Answered", a `DECISIONS.md` entry when it is a choice).
- **Sources.** A finding without a source is marked *unverified*. Never present a guess as research.

## Stage 1 — Idea

Goal: the idea in the user's own words, nothing decided yet.

- Ask for the idea if it was not given. Then at most two or three questions, one at a time, only to understand it (the problem, who has it, what made the user think of it); not about solutions, platforms or features.
- Write `docs/IDEA.md` from the template: the user's words quoted, unedited, with the date, and their follow-up answers quoted below. The "Sharper" section stays "Not yet: written at the end of the research."
- Start `docs/README.md` (the index) and `docs/DECISIONS.md` (the log, with the language entry) from their templates.
- Close: read the quoted idea back and ask for the go to research.

## Stage 2 — Research

Goal: the idea shaped by what is true out there, before anything is decided.

- Launch research agents **in parallel** (the Agent tool, one per topic, each told the idea from `IDEA.md` and to search the web): (1) the topic and its domain; (2) existing products, what they do, price, and their gaps for this idea; (3) the users, what they do today and complain about (reviews, forums); (4) technical and legal constraints (platforms, APIs and their limits, costs; privacy, licences, the domain's rules). Ask each for findings as short statements, **each with its source URL** and the date read, plus the questions the findings raise. Without an Agent tool, research the topics yourself one by one; without web search, say so and mark every finding *unverified*.
- Check what comes back: drop a finding whose source does not say it, mark the doubtful ones. Write `docs/RESEARCH.md` from the template.
- Every open question for the user: `add-question research "<question>"`. Go through them one at a time with the user (options and trade-offs); `resolve-question` each answered one, and record it in RESEARCH.md "Answered" (and DECISIONS.md when it is a choice). A question the user wants to leave open stays open: it is shown on the path.
- At the end, rewrite the "Sharper" section of `IDEA.md` (one sentence, the problem, who, why now, what changed from the raw idea) and show it.
- Close: the sharper idea, the open questions left; ask for the go to the product.

## Stage 3 — Product

Goal: what it is, for whom, why, and what it is not.

- From the sharper idea and the research, propose `PRODUCT.md` section by section, asking only where there is a real choice: the one sentence, who it is for, why, the USP in order of importance, what is explicitly secondary, what is out of scope. Out of scope matters as much as the USP: propose it from the research (what competitors do that this will not).
- Platforms: write "decided in stage 4" unless the user already decided.
- Every scope choice is a DECISIONS.md entry.
- Close: the one sentence and the out-of-scope list; ask for the go to the decisions.

## Stage 4 — Decisions

Goal: platform, stack and data, each chosen with its options and reasons.

- One decision at a time, in this order unless the product says otherwise: platform(s); language and framework; data (where it lives, local or server, the store); accounts and identity, if any; hosting and costs, if any; anything the research flagged as a constraint (privacy, offline, payments). For each: two to four real options, their trade-offs for *this* product (cite RESEARCH.md and PRODUCT.md), your recommendation, the user's choice.
- When a choice needs evidence the research does not give ("does it hold 10,000 rows?"), propose a prototype instead of guessing (see "Prototypes"); the decision waits for its result or is taken provisionally and marked so.
- Update PRODUCT.md "Platforms" from the decisions.
- Close: the list of decisions taken in this stage, one line each; ask for the go to the architecture.

## Stage 5 — Architecture

Goal: modules, data, main flows: the shape, not the code.

- Propose `ARCHITECTURE.md` from the decisions: the overview, the modules with their responsibility and dependencies, the data (entities, where they live, what must never be lost), the main flows step by step with their failure cases, the testing levels and the first test that must pass at setup.
- Ask only about real alternatives (one at a time); record each in DECISIONS.md.
- Close: the modules and the flows in a few lines; ask for the go to the design, or, when the product has no UI, say the design stage will be skipped and why, and ask for the go to the plan (see stage 6).

## Stage 6 — Design (only with a UI)

- **No UI** (a library, a command-line tool, a service): the stage is skipped, decided at the close of stage 5. Write a DECISIONS.md entry with the reason; on the go, first `tower-design-state.sh set-stage design skipped "<reason>"`, then `advance` (it goes from 5 past the skipped stage to 7). If stage 6 is already active (a resumed session), on the go run `set-stage design skipped "<reason>"`, then `set-stage plan active`.
- **A UI**: design iterations, each showing two or three directions **side by side**, every screen in its states (empty, filled, error).
  - With a design canvas or artifact tool in the session (one that publishes HTML pages): one canvas for the project; every iteration is a new page, the older ones kept. Record its link: `set-doc design "<link>"`.
  - Without one: `design/iteration-<n>.html` from the template `design-iteration.html` (one file per iteration, the older ones kept); tell the user to open it (`open design/iteration-<n>.html`). `set-doc design design/`.
  - Each round: show, collect the user's feedback (quote it), make the next iteration. The approved direction is a DECISIONS.md entry that names the iteration and quotes the approval. Mockups are not product code.
- Close: the approved direction; ask for the go to the plan.

## Stage 7 — Plan

Goal: milestones and the first slices, sized as tickets.

- Write `docs/ROADMAP.md` from the template: M0 is always the setup (empty project, a first passing test, the workflow); M1 the first thing a user can really do; then the next milestones.
- The first slices of M1 as tickets: a title a ticket can carry, size (S, M, L), why (the USP it serves), done when (the observable result and its test), dependencies. Each small enough for one worktree and one pull request. These become the first tickets at setup (GitHub issues by default); when tower-setup's reference flow is installed (`${CLAUDE_PLUGIN_ROOT}/skills/tower-setup/reference-flow.md`), size them for its ticket steps.
- Ask about the order and the size of M1 (one question at a time).
- Close: the milestones and the first slices in one line each; ask for the go to the setup.

## Stage 8 — the hand-over to tower-setup

On the go after stage 7, `advance` makes stage 8 active. This skill's work ends here: do not run any setup action yourself. Tell the user:

- the next step is **tower-setup**, in its "no flow" case: run `/tower:tower-setup` in this same folder (in Tower, the path's Setup row will open it). It reads `docs/` (IDEA, RESEARCH, PRODUCT, DECISIONS, ARCHITECTURE, ROADMAP) and `.tower/design.json`, so it asks only what the documents do not say;
- it asks before every external action: `git init` and the empty project in the chosen stack; a first passing test; `CLAUDE.md` written from the documents; the GitHub repository (private), only if wanted; CI, only if wanted; the reference-flow skills adapted to the project (a direct commit: nothing to protect yet); `ROADMAP.md`'s first slices as tickets (GitHub issues by default);
- when it is done, tower-setup marks the stage (`set-stage setup done`) and the folder becomes an ordinary Git repository project: issues on the left, Start, pull requests, review.

## Prototypes

A prototype answers one question a decision needs ("does SwiftData hold 10,000 rows?") and is thrown away.

1. Propose it with its question, what would settle it, and a budget; on the user's yes, create `spikes/<nn>-<slug>/SPIKE.md` from the template (`nn` counts from 01).
2. It runs in **a separate session**, never in this one: tell the user to open a new Claude session in that folder (`cd spikes/<nn>-<slug> && claude`; in Tower, `+ prototype` will do it). That session builds the prototype there and writes the result into `SPIKE.md`.
3. When the user says it is done, read `SPIKE.md` "Result" and file it as the evidence of the DECISIONS.md entry it informs (`Evidence: spikes/<nn>-<slug>/SPIKE.md`); fill in its "Filed in".

Nothing from `spikes/` is ever copied into the product.

## Going back

When the user wants to change a stage already done: say which later documents the change touches, then on their yes `tower-design-state.sh set-stage <current> todo`, `tower-design-state.sh set-stage <earlier> active`, and work there. Its go (`advance`) then goes to the next stage still to do. Every change made on the way back is a new DECISIONS.md entry that points at the one it overrides; later documents are updated in the same pass.
