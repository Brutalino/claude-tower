# Using Tower

This guide covers every key and every part of the screen, zone by zone. Start the workspace with `tower` (the launcher `/tower install` puts on the PATH) or `bin/CCtower` from a checkout; see the [README](../README.md) for installing.

## `/tower` and `/tower install`

Installed from its marketplace, Tower loads in every Claude Code session but does nothing in an ordinary one: no band, no deck, no routing, no safety rules, no Fable swap, no files, no timers. It only adds the command `/tower` (decision 066).

| Command | What it does |
|---|---|
| `/tower` | Turns this session into a free session in place: the flightdeck beside it (`/deck` opens it when the window is too narrow), the band above the prompt, Tower's safety rules (per the settings), Tower's roles and the free routing for its subagents, pins and waits. No tmux, no rail. The session keeps its own model and effort; the routing view says so (`in place (/tower): …`): its changes reach the subagents, and `new session` applies to sessions a Tower launches. A hot reload keeps it on. |
| `/tower off` | Turns it off again: deck closed, timers stopped, no routing or safety rules. Tower's roles, `/deck`, `/compact-micro` and the pin tool stay registered until the session ends (Claude Code cannot remove them). |
| `/tower install` | Checks what Tower needs (tmux, git, the `claude` CLI, `/usr/bin/python3`, node 22.18 or later, `gh` and its sign-in, Ghostty, whether `LINEAR_API_KEY` is set) and writes the `tower` command, `~/.local/bin/tower` by default. When that folder is not on PATH it asks where; when a `tower` that Tower did not write is there it shows what it runs and asks before replacing it (the old one is kept as `tower.before-tower`). It ends with what is missing (`brew install …`) and the next step. |
| `/tower uninstall` | Removes the `tower` command `/tower install` wrote, and nothing else. |

The same script runs from a terminal: `<plugin root>/bin/tower-install check`, `install [--dir DIR] [--replace] [--off-path]`, `uninstall [--dir DIR]`.

The `tower` command finds the installed plugin each time it runs (its folder changes with every version), in Claude Code's `~/.claude/plugins/installed_plugins.json` (`CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_PLUGIN_CACHE_DIR` respected), and runs its `bin/CCtower` with the same arguments. `tower --root` prints that folder. With `TOWER_DEV_ROOT=<a Tower checkout>` it runs that checkout's `bin/CCtower` instead. The sessions it starts load that same copy (`claude --plugin-dir <root>`): Claude Code loads one plugin per name, and a `--plugin-dir` copy replaces the installed one for that session, so Tower never loads twice.

The launcher reads `LINEAR_API_KEY`, `TOWER_REPO` and `TOWER_THEME` from the environment, else from `<plugin root>/.env`, else from `~/.claude/tower/.env` (an installed plugin's root is replaced at every update, so keep a `.env` there). The lines are read one by one, never sourced.

## Launch

`bin/CCtower` (or a `tower` link to it) in a project's folder opens that project's Tower: it starts one when none runs, else attaches to it. Each project has its own Tower on its own tmux socket (decision 059), so two projects run at the same time from two terminal tabs:

- Another project with a stored configuration: `tower-<slug>`, the main checkout's folder name lowercased with every other character a `-` (`~/Repositories/my-app` → `tower-my-app`). A worktree opens its main checkout's Tower. Two main checkouts with the same folder name: the second takes a short hash (`tower-my-app-3fa2c1`). The socket is kept in `~/.claude/tower/sockets.json` from the first launch on.
- `TOWER_TMUX_SOCKET` set: that socket, whatever the folder.
- A folder with a design state (`.tower/design.json`, stage 8 not done): its **design Tower**, one per folder, on `tower-<slug>` like a project (decision 064, "Design Tower" below).
- A folder remembered as free (`r` in the start menu): a free Tower, without the menu.
- Any other folder (no stored configuration, git or not, `TOWER_REPO` set or not): the **start menu** (below), then a free Tower (a new one at every launch, on its own socket `tower-free-<id>`, decision 060; launch `tower` there as often as you like, close each with `q` then `y` in it), a free Tower that starts tower-setup, or a design Tower.
- The project is asked at every launch, in this order: the folder's stored configuration, the design state, a remembered free folder, the menu. A repository becomes a project, with its one Tower, as soon as its configuration is stored; any subfolder of it or of its worktrees opens the same Tower.

| Command | What it does |
|---|---|
| `bin/CCtower` | Start or attach this folder's Tower. |
| `bin/CCtower --no-attach` | Start it without attaching. |
| `bin/CCtower --kill` | Close this folder's Tower and every session in it: `killed tower-my-app (my-app · /path/to/my-app)`, or `no Tower running on tower-my-app`. With `TOWER_TMUX_SOCKET` set (a shell in a Tower's pane) it closes that Tower. In a folder with no project it closes nothing: it lists the running Towers and ends with `close one with q then y in it, TOWER_TMUX_SOCKET=<socket> CCtower --kill, or every one with CCtower --kill-all`. |
| `bin/CCtower --kill-all` | Close every Tower (the `tower` and `tower-*` sockets, never any other tmux server), one `killed <socket> (<project> · <folder>)` line each, or `no Tower running`. |
| `bin/CCtower --list` | The running Towers, read only: `socket project folder`, one line each, or `no Tower running`. |

A Tower an older launcher started on `tower` for another project (before decision 059 every Tower used `tower`) stops the launch on that socket: `socket tower already runs the Tower of <folder> (started by an older launcher); close it with CCtower --kill-all (or tmux -L tower kill-server), then launch again`.

### Start menu

`tower` in a folder with no project asks first, in the terminal, before anything starts:

```
 Tower · ~/Repositories/notes
 ▸ Git repository — set up Tower for this repository (tower-setup)
   Free session — Claude with the flightdeck, nothing set up
 ↑↓ choose · ↵ open · r remember for this folder · q cancel
```

- **The entries follow the folder.** A git repository without a configuration: Git repository, Free session. An empty folder (nothing but dotfiles such as `.DS_Store`): `New project — design it in this folder (tower-design)`, Free session. Any other folder: Free session, then New project, with a warning line while it is highlighted (`! this folder is not empty: …`). The first entry is the default.
- **Keys**: `↑↓` (or `k` `j`) choose, `↵` opens, `1` `2` open that entry directly, `esc` or `q` cancels (nothing starts; a lone `esc` takes a second).
- **`r` remember for this folder**: with Free session, the folder goes into `~/.claude/tower/folders.json` (`{ "<folder>": "free" }`) and `tower` there opens a free Tower from then on without asking. Only Free session is remembered: the other two make the folder a project. To be asked again, remove the folder's line from that file.
- **No menu** when stdin is not a terminal (a script) or with `TOWER_START=free`, `setup` or `design`: that choice, if the folder offers it (else the launch stops and says what it offers), else Free session. An explicit `TOWER_TMUX_SOCKET` never shows the menu.

What each entry opens:

- **Free session**: the free Tower below.
- **Git repository**: a free Tower whose first session starts on `/tower:tower-setup` (see "tower-setup"). Once tower-setup has stored the configuration, quit (`q` `y`) and run `tower` again in the folder: it opens the project.
- **New project**: writes `.tower/design.json` (stage 1 active) and opens the folder's design Tower, its first session on `/tower:tower-design`.

### Free Tower

`tower` in a folder with no project (`~/Downloads`, a repository without a configuration) opens a free Tower: the rail beside one free session in that folder, opened for you with the keys on it, so Claude is ready to type. The session has the flightdeck (agents, timeline, usage, waits) and the band, like any free session.

- The rail: `Downloads · free` (in a git folder `notes · free · main`, the folder's branch), `refresh  quit`, `+ new session` (`o`; its first choice is `this folder`), SESSIONS with this Tower's free sessions, and in a git folder OTHER BRANCHES (the other worktrees; `↵` opens a free session there). No tickets, no Linear, no skills launcher, no board.
- In a git repository without a configuration the rail also shows `s: set up this repository`: a free session on `/tower:tower-setup` in the folder. When tower-setup has stored the configuration (the rail sees it within a few seconds), that row turns into `✓ Tower is set up for this repository` / `quit (q y) and run tower again here to open the project`. Nothing closes by itself.
- The model of `new session` is chosen in the deck's routing view (`2`) and kept for every free Tower in `~/.claude/tower/routing/free.json`.
- The first time Claude Code sees a folder it asks whether you trust it, in the rail's pane, before anything else.
- `q` then `y` closes this free Tower only; the others, and the project Towers, keep running.

### Design Tower

A folder with `.tower/design.json` (New project, decision 062) opens its design Tower, one per folder, on `tower-<slug>`; `tower` there again attaches to it, `--kill` closes it. No tickets, no Linear, no git needed. At launch it opens the design session (`/tower:tower-design`, which resumes from the state file) in the centre.

```
new project · ~/Repositories/budget-app
                             refresh  quit
  ✓ 1 Idea         docs/IDEA.md
▶ ◆ 2 Research     3 open questions
  ○ 3 Product      docs/PRODUCT.md
  ○ 4 Decisions    docs/DECISIONS.md
  ○ 5 Architecture docs/ARCHITECTURE.md
  ○ 6 Design       design canvas
  ○ 7 Plan         docs/ROADMAP.md
  ○ 8 Setup

+ new session · + prototype
SESSIONS
▶ ◐ budget-app                 budget-app · 2m
```

- **The path**: `✓` done, `◆` active (the current stage `▶`, its open questions in the accent), `○` to do, `–` skipped; beside a session, the open questions or the stage's document; full width, the plan's columns (summary, document, note). It is read again within two seconds of a change.
- **`↵` on a stage** brings the design session to the centre, or opens a new one when none runs.
- **`+ new session`** (`o`): a plain free session in the folder. **`+ prototype`** (`t`): asks a short name, makes `spikes/<nn>-<slug>/` (`spikes/02-swiftdata-10k-rows`) and opens a free session there; an empty name cancels.
- **The flightdeck** of its sessions adds `DOCUMENTS` (each stage's document, `✓` when it is there, `○` missing) and `OPEN QUESTIONS` (the active stage's, `◆` each) above PINNED.
- When stage 8 is done (tower-setup stored the configuration), the next `tower` there opens the project.

Each Tower shows and announces only its own sessions: a wait in one project's Tower never pops up or chimes in another's. Settings, away mode, the Fable block and the model list are shared by every Tower.

The bottom row of the window always shows the keys of the active pane. The top border of each pane shows its title; the active pane's title is the one in the accent colour (orange in `claude`), and every border line stays grey, so the divider between rail and session is one colour along its whole height.

## Board

The board is the rail session at full width. It is the first screen: a board of cards (see decision 030).

- **Header**: `TOWER`; the counts `◆ 1 needs you   ◐ 1 working   ✓ 3 ready   ○ 5 candidates`, each glyph in its state colour; one figure `▟█▙` per working session in its model's colour (it alternates with `▜█▛` every 480 ms); `◆ AWAY` while away mode is on; `filter: <text>   esc clears` while a filter is set.
- **Four columns** `needs you`, `working`, `ready`, `candidates`, each a dim heading with its count over a stack of cards. A column with more cards than fit shows `↑ n more` / `↓ n more`; the window follows the focused card. An arrow past the last card in view puts the ring on `↓ n more`, and `Enter` there moves the window one card. Below four columns of 30 cells, the columns stack in two bands: `needs you` + `working` over `ready` + `candidates`.
- **A card**: `<glyph> TKT-2426` with the age right (`—` without one); the title (two lines when the four columns are 40 cells or wider and stand in one band, else one, cut with `…`); the status in its step's colour (`say go`, `executor 2/5 · opus`, `ready · merge · PR #102`, `blocked by TKT-9008`); a working card adds a bar `▰▱` of the lead agent's steps and the cost. The focused card has an accent border and its id row inverted. In the candidates column, a story with two or more candidates sits as a dim line `▸ TKT-977 Alerting · 2/4 done` above them. The tickets assigned to you come first (each part keeps its order, its stories within it) and carry `★` after the id in the warning colour; a ticket assigned to someone else would carry their short name, dim; a free one carries no mark (decision 041). A candidate's card starts with its mark and Linear's priority glyph, `▢ ▲ TKT-130★` (`▣` when marked; `!` urgent, `▲` high, `■` medium, `▼` low, `·` none), and the column heading counts `· 2 marked` (decision 071). The candidates are the same list as the narrow rail's: no worktree here, not hidden, not closed, and not started unless yours (a ticket of yours started elsewhere reads `· in progress`).
- **PR row** (decision 035): a card with a pull request adds `PR #2408 · BLOCKED 1 · ✗ unit-tests`, the verdict (`READY`, `BLOCKED n`, `WAITING ON CHECKS`, `DRAFT`, `CONFLICTS`) in green, red, amber or dim. A ticket that waits on you (`needs you`, `ready · review`, `ready · merge`) colours its age yellow after 3 days and red after 14 since its PR last changed.
- **Inspector** (the last 9 rows): the focused card's id and title with `↵ open   k: skills` at the right, the meta line (state · story, `blocked by` in red), three lines of what it asks (Problem / Expected / Done when), `next <step>`, `sessions <n> · <models with tokens> · $cost`, and the pull request (`pull request #13 open · checks failing`, `no pull request`, `gh not available`).
- **Keys line** under the inspector.

| Key | What it does |
|---|---|
| `↑` `↓` | Move within a column; past its last card the ring goes on to the next column's first. |
| `Alt+←` `Alt+→` | Move to the same row of the previous / next column (the last card when it is shorter); empty columns are skipped. A pane gets no Left/Right, so `bin/CCtower` writes `left`/`right` to the rail's key file while it is the board, and the rail polls it. |
| `Enter` or a click on a card's id | A ticket: open its session (see "Ticket flow"). A candidate: promote the marked candidates, else this one (decision 071): its worktree only, then the self-assign; no session. |
| `m` | Mark or unmark the focused candidate (`▢` → `▣`). Not while `+ new session` asks (its `m` is the main checkout). |
| `s` `n` `t` | Run `/shape`, `/new-ticket`, `/triage` in a new hub session in the main checkout (only when the repository has the skill). |
| `o` | `+ new session`: a plain Claude session (see "New sessions"). |
| `k` | Open the skills launcher. |
| `r` | Refresh the data. |
| `a` | Away mode on or off. |
| `p` | Settings, in place of the columns. |
| `q` | Close tower: the notice asks `close tower and every session? y: yes   any key: no` (with `(2 sessions are working)` when ticket sessions are working). `y` within 10 s stops tower's tmux server and every session in it, working ones too; Claude Code keeps the conversations, so a ticket session resumes the next time it opens. Any other key leaves everything open. From a shell, `bin/CCtower --kill` in the project's folder does the same ([Launch](#launch)). |

The prompt box under the board is tower's command line, not a chat with the model (see decision 026). While the board holds the keys, the keys go to the cards; `Escape` gives them to the prompt box, whose hint then reads `type a ticket id or a filter · esc gives the keys to the list`. What you submit there never reaches the model. A key the board does not take, pressed while the cards hold the keys, never lands in the box: it shows `"z" is not a key here · esc to type a filter or an id` for 4 s and the keys stay on the cards; should the box hold text anyway, `Alt+→` or `r` clears it and gives the keys back to the cards.

- A ticket id (`TKT-2426`, `tkt-2426` or `2426`): the focus moves to that card and the board takes the keys back. It does not open it: `Enter` on the card opens it, so a typo never starts a session.
- Any other text: a filter. Every column shows only the cards whose id or title contains the text (case-insensitive). `Escape` from the board clears it. The filter is not saved.
- `/…`: a slash command, Claude Code's as usual.

Each one leaves a line `Prompt dropped by a hook: tower board …` in the transcript above the board.

Data: `git worktree list`, each worktree's `.work/state.json`, the session status files, `gh` (tickets with a worktree, placed by their step); Linear (candidates: assigned to you first, then the free ones), read only but for one write: promoting a candidate that is not yours assigns it to you (decision 071). With `TOWER_DEMO=1`, a ticket with a live session works with the demo deck's agents (bar, model, cost, header figure).

## Narrow list

When a ticket is open, the rail is a narrow list on the left.

| Key | What it does |
|---|---|
| `↑` `↓` | Move between tickets. |
| `Enter` | Open that ticket (its group of panes comes back). |
| `b` | Back to the board. The open ticket's panes are parked, still running. |
| `o` | `+ new session`: a plain Claude session (see "New sessions"). |
| `k` | Skills launcher. |
| `r` | Refresh the data. |
| `x` | The header's `x: close` / `x: remove` / `x: hide`, first beside `skills  board  quit` (decision 072): it acts on the row the ring is on, else on the ▶ row, and its label follows that row. On a SESSIONS row, an `other sessions` row or a ticket with a live session: `close …? y: yes   n: no` (decision 068). `y` closes that session (a ticket's: only its session and its review; the worktree stays). On a ticket without a live session it leaves the rail after `y` (decision 070): `x: remove` on one not started (its worktree and branch deleted when it holds no work, else hidden), `x: hide` on a started one (the worktree stays). |
| `a` | `a: candidates`: the candidates in the list's place, then the hidden tickets under `HIDDEN` (see "Candidates" below); `a` or Escape closes them. |

Each ticket takes two rows. Row 1: the identifier and the title. Row 2, dim: the group and the short step, for example `needs you · say go`, `working · executor 2/5`, `ready · /open-pr`, `ready · review`, `ready · merge`, `blocked by TKT-1234`, `not started · /start-ticket`, and `◆ needs you · permission` (or `· question`) while the ticket's session or its review session waits on a permission dialog or a question (the board's `sessions` panel then shows `◆ waiting` for it, its status line `◆ waiting for you`). `▶` marks the ticket that is shown. While the rail has the keys, the `▶` follows the focus ring onto any row: a ticket, a hub, a SESSIONS row, `+ new session` and `a: candidates` included, one row at a time; on a header or action key it stays on the `▶` ticket. The row the ring is on is inverse from its label to the right edge, the engine's own focus inverse (each row is one Button holding its label and padding), so the bar moves in one piece; the `▶` and the glyph stay outside it, a working ticket's spinner keeps turning. In the candidates the ring's row is inverse the same way, in its colours, and the `▶` follows the ring onto a HIDDEN row (no candidate marked meanwhile); on the footer's keys it stays on the `▶` candidate. Every narrow rail does the same: a Git repository's (its issues, OTHER BRANCHES, SESSIONS, `+ new session`) and a design Tower's (its stages, `+ new session`, SESSIONS; off the rows the `▶` is back on the current stage). Hub sessions are listed under their own heading when there are any.

The tickets are grouped by story (decision 067): each Linear story with a ticket here gets a header, `▾ TKT-100 Checkout · 1/3 done` (bold, accent), its tickets two cells in under it (needs you, working, ready, not started, blockers first), a blank line after. The stories with a ticket that needs you come first. Tickets of no story, or whose issue Linear did not give, are listed last under `NO STORY`. The rail asks Linear by identifier (read only) for the worktrees the candidates' query does not cover, so their stories are known. When the list is taller than the pane, whole rows are cut from the bottom (a header never without its first ticket) and `+n more` counts them.

Candidates: bringing Linear tickets in without starting them (decision 071, which replaced decision 069's `+ n more of yours` and `+ add ticket`):

```
skills  board  quit
CANDIDATES · 2 marked
▸ TKT-100 Checkout · 0/4 done
▶ ▣ ▲ TKT-130★ ↳ Card check
  ▢ ! TKT-131★ ↳ Card retry
      blocked by TKT-130
  ▣ ! TKT-300 Docs typo
  ▢ · TKT-500 Billing v2 · 0/1 done
  ▢ · TKT-501 ↳ Invoice PDF

↑↓ move · ↵ promote · esc back
m: mark  l: detail  r: reload  a: back
```

- `a: candidates` under the tickets opens them in the list's place: Linear's tickets with no worktree here and not hidden, not closed, yours first (`★`; one of yours started elsewhere first of all, `· in progress`; a free one only when not started), by story (`↳` under a story listed, a dim `▸` header over two or more children of one that is not), then the free ones; Linear's priority glyph before the id; a blocked one's `blocked by TKT-130` dim red on its second line. `a: back`, `a` or Escape closes them.
- `m` marks the ▶ candidate (`▣`); `m` again unmarks it. `r` reloads and drops the marks of tickets no longer listed. `l` shows the ▶ candidate's detail in the list's place (state and labels, parent, sub-tickets with `blocked by` / `start here`, blockers, blocked, URL, description); `l` or Escape goes back.
- `↵` promotes the marked candidates, else the ▶ one, one at a time: stories first, then blockers before the tickets they block; `promoting TKT-130 (2/4)…` on the notice line. A ticket blocked by an open ticket outside the batch asks first: `⚠ TKT-400 blocked by TKT-399 — promote anyway?` (`y`, or `n` / Escape). Each one: its worktree (fetch, `git worktree add`; resumed from `origin/<its branch>` when origin has it, else on its open blocker's branch, then its story's, when on origin, else `origin/<base branch>`) and nothing else: no session, no `/start-ticket`. Then, a ticket not yours is assigned to you on Linear (Tower's only Linear write; a failure says `(Linear self-assign failed — assign manually)` and keeps the worktree). The summary is a toast and the notice line.
- A ticket brought in and not started (no state file, no session, no PR) reads `○ TKT-130` / `not started · Todo`, or `blocked by TKT-101` in the warning colour, last in its story block. `↵` opens its session on `/start-ticket TKT-130`; a blocked one asks `TKT-130 is blocked by TKT-101 — start anyway?` first.
- `x: remove` on it, in the header (decision 070, decision 072): with no changes and no commit of its own (every commit of its branch on another branch or a remote), `remove TKT-130?` / `deletes its worktree and branch`; `y` runs `git worktree remove` (never forced) and, the commits counted again right before, `git branch -D`. With work, `TKT-130 has work (2 changed files, 1 commit only here): hide it from the rail?` / `the worktree stays`. An earlier conversation in its folder no longer matters. Nothing is written to Linear (the self-assign it got when promoted stays).
- `x: hide` on a started ticket without a live session (with one, `x` closes the session first, then a second `x` offers this): `hide TKT-130 from the rail?`. Hidden tickets are kept in `<state dir>/hidden-<project id>.json` and stay off the rail; `a: candidates` lists them under `HIDDEN`, and `↵` on one shows it again.
- The row goes as soon as you press `y`; a toast and the notice line say what happened (`TKT-130 removed: worktree and branch deleted`, `TKT-130 hidden: worktree kept`, or the error).

The list takes the keys again after each transition (start, its pane becoming active, `b`, a new ticket in the centre, the skills launcher closing). Escape gives the keys to the prompt until the next transition.

## New sessions

A plain Claude session beside the tickets, for planning or anything without a ticket (decision 055). In every project: a Linear project's board and narrow list, and a GitHub repository's board and rail.

```
skills  board  quit
+ new session
SESSIONS
  ○ SwiftData vs GRDB main · 12m
  ◐ tkt-1650 feature/tkt-1650-wrong-in… · 3m
TICKETS
▶ ◆ TKT-1650
    needs you · say go
```

- **`o: + new session`** at the top of the list (on a Linear project's board, the row under the header) asks the folder: `new session in   o: cancel`, then `m: main checkout` (the default: the ring is on it, `↵` takes it) and `w: TKT-1650 worktree` when the focused row is a worktree (an issue in progress, another branch). `o` again drops the question.
- The session opens in the centre like a ticket's (a pane titled `session · ~/…`), started as a plain `claude` with no ticket, no start prompt and no `--continue`: role `free`, its key `free-<8 hex>`.
- **SESSIONS** lists the live free sessions (from the status files; one closed with `/exit` leaves the list): `▶` on the one in the centre, `◐` working, `◆` waiting for you (a permission or a question), `○` idle; its name (the first prompt's first five words, else the folder's name), the branch of the worktree it runs in (else the folder's name) and how long its state has lasted. `↵` on one brings it to the centre (from its parked window); `b` parks it as it parks a ticket. With sessions listed, a Linear project's tickets go under a `TICKETS` heading. On its board the sessions sit on the same row as `+ new session`, as many as fit, then `+n more`.
- Its waits (a permission or a question, after 10 s) are announced by the rail like a ticket's, by the session's name (see "Attention").
- **Closing one** (decision 068, in the header since decision 072): the header shows `x: close` for the row the focus ring is on (a free session, a hub session under `other sessions`, a ticket with a live session; else the ▶ row); on the wide boards it ends the header line; `x` or a click asks `close SwiftData vs GRDB?` (a ticket: `close the session of TKT-123?` / `the worktree stays`) with `y: yes   n: no`. `y` kills that session's panes on this Tower's socket (a ticket's review pane with it, never the rail), marks its status records ended and takes the row away at once (a ticket's row stays, without a session; `↵` opens it again). `n`, Escape or moving the ring leaves the question. On the wide board `x` dismisses the attention popup while one shows (the popup is drawn last and its `x` wins), then closes.
- Its flightdeck has the agents, the timeline, the usage, the pins and the waits; no ticket boxes (no PR, REVIEW or DEV-ENV), no next step, no documents.

## Ticket session

The centre pane is a real Claude Code session in the ticket's worktree. The mod adds a band above the prompt and a status line under it.

### The conversation

Tower draws the transcript rows (ticket, hub and review sessions; see decision 031):

- Your prompt: a `▎` bar in the accent colour and the text in bold.
- A reply: a `▎` bar in the main model's colour beside the text; the later blocks of the same reply get a faint bar. A summary is dim with `※`.
- A tool call: one dim line, `· Bash wc -l NOTES.md`, `· Read src/a.ts`; `◐` while it runs; red with `✗` when it failed. An agent: `· → runner · <task>` in the agent's model colour. A folded run: `· Read 3 files · Bash 2 commands`.
- In a reply (decision 038): a GitHub alert (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) is a rounded box in its colour with its label; a task list is `☐ todo` and a dim `☑ done`; `~~text~~` is struck through; a ```` ```mermaid ```` block with a simple `flowchart`/`graph` (`TD`/`LR`, `A[label] --> B[label]`) or a `sequenceDiagram` (`A->>B: message`) is drawn as box art. Anything else stays as the model wrote it.
- Tool timings: a finished call ends with its time, `· Bash pnpm test · 12.4s` (m:ss from a minute); a running one with a live clock, `◐ Bash sleep 8 · 7s`; a finished folded run with its calls' summed time. The time includes a permission dialog's wait. Times live in the session's memory: after a hooks reload or a resume the older rows have none.
- An edit: `· Edit src/alerts/dedupe.ts  +12 −3` (green and red), a Write `· Write notes.md  +20 lines`.
- Tool results: not shown; a failed one is one red line.
- A finished background task: `↩ <task> finished · m:ss`; an agent's message: `← <name>: <first line>`.
- The end of a turn: `✓ <word> · m:ss`.

`ctrl+o` shows the engine's full rows for your prompts, messages and folded runs; replies and tool calls stay as above there (the engine gives those rows no expanded flag).

### The band

- `e: explain as` and five chips: `○ Off`, `¶ STE`, `◇ Diagram`, `◱ HTML`, `▶ Video`. `e` moves to the next mode. The mode is kept per worktree. The default is STE. Each mode adds one section to the system prompt:
  - **Off**: no section.
  - **STE**: explanations in Simplified Technical English (sentences of 20 words at most, active voice, present tense).
  - **Diagram**: each explanation includes one diagram (box-drawing characters or Mermaid).
  - **HTML**: the explanation is one self-contained HTML file in `.work/explain/<slug>.html`; the answer gives its path.
  - **Video**: one self-contained HTML file in `.work/explain/` that plays the explanation as timed steps, with play/pause.
- `next <step>`: the ticket's next step.
- The band has no review key: the review starts from the deck's REVIEW box (`v`). `next /review <n>` stays as the step.

When the band is narrow, `explain as` goes first, then the chips shrink to their glyphs, then `next` goes.

Another plugin's band (cc-arcade's games, …) still shows in a ticket or review session: it draws above Tower's band, which stays on the last row, nearest the prompt (decision 052).

### The ghost suggestion

In the empty prompt the mod proposes the next step as dim text. Press Tab to take it. It is `go` while planning, the next skill (`/open-pr`, `/wrap-up <n>`, …), or `yes` when the last answer ended with a question. It is never `/review`: a review runs in its own session (`v`).

### The status line

Under the prompt, dim. Left: model and effort (`tower` on the rail). Right: a spinner and the deck's footer while working, `○` when idle, `◆` when the session waits for you, `✓` when the ticket is ready for review or to merge. It is tower's own line and only replaces your status line in tower's sessions.

### Alt+arrows

| Key | What it does |
|---|---|
| `Alt+→` | The deck takes the keys (its first agent card, else a view tab). |
| `Alt+←` | From the deck: back to the prompt. From the prompt: the rail. |
| `Alt+↑` | The pane above, else the band. |
| `Alt+↓` | The pane below (a review session). |

On macOS, Option+←/→ reach tmux as `Esc b` / `Esc f` (the word-jump keys); the launcher binds those too, so no terminal setting is needed. The price: Option+←/→ no longer jump by word inside the prompt of a Tower session (use `Ctrl+←/→` or `Ctrl+b`/`Ctrl+f`).

## Flightdeck

Closed by mistake with the engine's `×`? `Alt+→` from the session reopens it (and gives it the keys); `/deck` typed in the session's prompt does the same.

The deck is docked on the right of a ticket session.

| Key | What it does |
|---|---|
| `1` `2` `3` | Views: agents, routing, log. |
| `j` `e` `d` | Routing (view 2): the chosen row's next model, next effort, back to the table. |
| `o` `r` `s` | DEV-ENV: open the URL, restart, stop (when up). |
| `u` | DEV-ENV: start (when stopped or not started). |
| `v` | REVIEW: start the review, or the next round. |
| `c` | REVIEW: post the saved review (setting `review post` on `key`, when it reads `review ready`). |
| `l` | REVIEW: look at the review session, under the ticket (whenever there is one: reviewing, asking or posted). |
| `f` | PR: put a fix-CI prompt in the prompt box (while a check failed). |
| `h` | Agents: open or close the history of the finished agents folded into `✓ n done`. |

What it shows:

- **Header**: the ticket, the main model, `WORKING` or `IDLE`, and `n RUNNING` agents.
- **Pulse rail**: a moving line while the session works.
- **Main panel**: the main model, its effort, its current step, context and cost, and the rate-limit windows, each on its own: the 5-hour one (`5h ▰▰▱▱▱  31% · resets in 1h 04m`) and, when known and the line has room, the 7-day one (`7d ▰▰▰▱▱  58% · resets in 2d 4h`); the percent stands two cells from its bar (`ctx` too); a window past its reset time reads `0%`, and the figures are read again at session start, after every turn and every minute.
- **Receipt**: the work since your last prompt, follow-up turns and agents included.
- **Agents** (view 1): one card per agent with its role, model, task, step `n/t` and estimated time left; the sessions timeline shows which model ran when.
- **Finished agents fold** (decision 045): a finished agent keeps its card for 20 s, then folds into one dim row, `✓ 14 done · ✗ 2 failed · 12:34` (the failures in red, the summed run time), with `h: history` to show their cards again (`h: hide history` closes them). With nothing running the section is that one row. At most 8 running cards show; the rest read `+n running`. The sessions timeline folds its lanes the same way: main and the running agents always, a finished lane for 20 s, then one dim `✓ n done` row; `h` shows every lane again.
- **Progress, stalls and loops** (decision 033): a running card's clock reads against its type's typical time (`2:45 / ~6:00`, the median of the last runs; amber past 1.5×). The step line follows `TodoWrite` (the `in_progress` item, with its own clock), `TaskCreate`/`TaskUpdate`, or `[step n/t]` markers; a `TodoWrite` list wins over markers. The action line shows the tool in flight with a live clock (`▸ Bash pnpm test · 1m12s`, amber after 30 s; on the main card after `now`). A loop with no tool or step event for 2 minutes and no tool in flight is stalled: amber border, `◐ stalled · 2m 40s quiet`. The same tool with the same main argument 3 times in a row, or the same Bash command failing twice, reads `⟳ going in circles · Bash pnpm test ×3` in amber. A stall or a loop puts `stalled · executor` (or `going in circles · executor`) in amber on the ticket's board card and raises one `needs you` popup and chime per stall or loop ([Attention](#attention)). Every 2 s the deck also checks the engine's agent list: an agent it ended, failed or killed stops running on the deck, and a running agent the deck never saw spawn gets its card. A finished agent the engine lists running again (resumed with SendMessage) runs again on the deck, its clock from the resume (decision 075).
- **Routing** (view 2, decisions 056 and 057): the routing table, editable, then `models` (models on this worktree) and `decisions` (the last routing decisions, for example `Explore → scout · sonnet`, `fork → denied`). The table lists `SESSIONS` (`new session`: a free session started with `o`), `SKILLS` (the ticket skills, then the hub skills) and `SUBAGENTS` (executor, scout, verifier, runner), each with its model and effort, models by their names (`Opus 5.5`, `Sonnet 4.6`); `default · Fable 5.1` is the session's own (no `--model` / `--effort`). ↑/↓ or a click chooses a row (`▸`); `j` moves its model through the models Claude Code offers in `/model`, in its order (`default → Opus 5.5 → Fable 5.1 → Sonnet 5.5 → Haiku 5.5 → Haiku 4.5 → … → default`), `e` its effort through the efforts that model takes (`default → low → medium → high → xhigh → max`; `—` and nothing to change for a model without effort, such as Haiku 4.5), `d` takes it back to the table. A value off the table reads `Sonnet 4.6 ● (Fable 5.1)`, the table's value dimmed; an effort the model does not take reads `xhigh→high` (the next lower level is used, the choice kept); a model Claude Code no longer offers reads `⚠` and its row starts on the table's model. The list of models comes from Claude Code itself, cached in `<state dir>/models.json` and asked again in the background when it is a day old or Claude Code was updated; when it could not be asked, one dim line says so (`models: from cache 3 d ago`, `models: built-in list (could not ask Claude Code)`). Choices are kept per project in `<state dir>/routing/<project>.json` as full model ids and apply to sessions started from then on (a running session keeps its model and its agents); `TOWER_SESSION_MODEL` still wins over any model.
- **Log** (view 3): prompts, spawns, tool calls and routing, and the permission gate's verdicts. The last 200 entries are kept.
- **PR** (decision 044), right above REVIEW while the ticket's own pull request is open or draft (9 rows, always; agent cards give way first): `PR #<n> · BLOCKED 2` with the verdict in its colour and, on the right, `waiting 4d` (yellow from 3 days, red from 14) while the ticket waits on you, else `updated 2h ago`; then the checklist, failures first, up to 5 rows and `+n more`; `f: fix CI` while a check failed. The border is red when blocked, amber while checks run or for a conflict, green when ready.
- **REVIEW**, above the DEV-ENV while the ticket has an open or draft pull request (4 rows; agent cards give way first): `PR #<n> · no review yet` and `v: start review`; `◐ reviewing round N` with the time, the review session's current action and `l: look`, only while it works; `○ waiting for you · round N` (dim) and `v: new round   l: look` once its turn ended with nothing to ask, post or refuse; `◆ needs you · Bash gh pr view …` and `l: look` while it waits on a permission dialog or a question; `◆ asks: …` and `l: look` when it asks a question other than the post question (a line ending `?`; the post question is the configuration's `waits.post` or Tower's own verbs, `pubblic…`, `comment on the PR`, `gh pr comment`, decision 079), or says it cannot post (its last line); `◐ ✓ posted round N · verifying` when it says it posted (an `issuecomment-` link), until a fresh read of the PR shows the comment, or `◆ post failed · post not found on PR` after 2 minutes (decision 046); `◐ posting round N` while tower posts it; `review ready` and `c: post   l: look` with the setting `review post` on `key`; `◆ post failed · <first line of gh's error>` and `l: look`; `✓ posted round N` (`· by tower` when tower posted it), how long ago, and `v: new round   l: look`, also when you posted the round yourself, as a comment or as a GitHub review (decision 074); a posted round no longer reads `needs you` for a dialog or question the review session was left on. Once the review session made a request, line 1 ends with its model, effort and its own cost (`· haiku · low · $0.05`, `$—` when unknown); the ticket and review together are in MODELS ON THIS WORKTREE.
- **DEV-ENV**, at the bottom of every view (`this repository has no /dev-env` without the skill): `● up`, `◐ starting`, `○ stopped` or `○ not started`, the URL, the slot (`slot N of 7`) and the time up. The box sees any compose stack whose working dir is the worktree (`docker ps`, read only, every 5 s): a running stack is up whatever `.work/state.json` says, on its `frontend` service's port (else the first published port in the slots); the state file adds the login check and the start time when it names the same project or port. The note after the URL: `login verified`; `started outside /dev-env` (dim) when the stack runs and the state file does not describe it (started by hand or by the model); `the /dev-env skill reported failed` (dim amber) when the stack runs but the skill's last run wrote `failed`. With no stack, a state file still saying up reads `○ stopped`, and one saying `failed` reads `○ stopped` with `last start failed` (dim amber). A stack with no frontend port reads `◐ starting` with its project's name. Without docker (not installed, not running, no answer within 3 s) the box reads the state file alone. The actions run the real `/dev-env` skill in the session (decision 073).
- **Limits pace, cache warmth** (decision 034): the main card shows one row per rate-limit window, `5h ▰▰▰▰▱  84% · 79% of time · out in ~45m` (the share of the window's time gone, and when it runs out at the rate so far), the forecast in amber when it comes before the reset, the reset time after it when the row has room. Below, `cache warm · 3m left` (dim) while the prompt cache of the main loop's last request lives (5 minutes), then `cache cold · ≈ $0.10 to rebuild` in amber (the cached tokens at the session's own cost per token; no price when the cost is unknown). The board header shows `5h 84%↗` (the arrow when ahead of pace, amber when out before the reset), and a working ticket's board card a `❄` after its age once its session's cache is cold.
- **Compact micro** (decision 034): `/compact micro`, `/compact-micro` or the deck's `k: compact micro` (with a yes/no) replace every Read result but the newest 3 with a short placeholder and rebuild the assistant messages without their thinking, with no model call. It runs between turns; a second run drops nothing more. The line after it says what went and the context before (`context 4% → ?%`: the engine knows the new fill only after the next request).

Demo mode: with `TOWER_DEMO=1` the deck shows a working session with four agents (a stalled one, one going in circles, one with a test run in flight, one done) and an up DEV-ENV, with no model call. Use it for screenshots.

### The REVIEW box and CI

The PR's verdict and checklist are in the PR box above REVIEW (decision 044); REVIEW's line 1 is the review state alone. While a check failed, the PR box's last row shows `f: fix CI`: it puts `CI check "<name>" failed on PR #<n>: <link>. Read the failing log with gh run view --log-failed and fix it.` into the prompt box without sending it. See decision 035.

### Aside and PINNED

`a: aside` in the deck asks a side question about the ticket (`where are you at?`, `what is left?`): Enter sends it as a fork of the session's own conversation, every tool denied, and the answer shows in the view with its latency and tokens (`1.6s · 52.2k cache read · 156 new input · 141 out`). Nothing goes into the session. On the board, `i: ask` in the inspector does the same for a ticket with a live session; the answer takes the description's rows. The setting `aside model` picks `session` (the default, the cache reused) or `sonnet` (the last part of the conversation as text, `cache not reused`).

The session's model has a `pin` tool for open decisions that need you, todos and links it created; links from `gh pr create` and `git push` are pinned on their own. The deck's PINNED box lists decisions first, then todos, then links; `x` closes the one the focus ring is on. While a decision is open the card shows `📌 n` and the ticket reads `needs you · decision`; while its session is still working (its turn or a background agent) it reads `working · decision pinned` instead, and turns `needs you · decision` once the work stops (decision 076). With `pin nudge` on, a reply ending on an unpinned question is sent back once to pin it. See decision 036.

## Review session

`v` in the deck's REVIEW box starts a new Claude Code session, with a fresh context, in a hidden parked tmux window. It runs `/review <n>`, and its system prompt asks it to save the final review, exactly as it would be posted, to the absolute path `<ticket worktree>/.work/review/pr-<n>-round-<N>.md` (the worktree comes in `TOWER_WORKTREE`) before it asks whether to post. When its turn ends with the review shown (`## Self-review` and its sections; or, when the answer shows it in another language without the heading, as oink's Italian review does, the saved file the answer names, `--body-file` or an absolute or `scratchpad/…` `.md` path, once that file reads as the review: then that file is posted as it stands, its round its own, decision 079), the ticket session posts this round's review from the file the answer names (`--body-file`, an absolute path, or `scratchpad/…` in the session's own Claude scratchpad), else from that saved file, else from the answer itself: from `## Self-review…` to the reply options or question after the last section (`Reply with…`, `Shall I…`, …), which are never posted, written to that path first. It posts it itself with `gh pr comment <n> --body-file <file>` in the ticket's worktree, as your tool carrying out your standing choice: nobody answers the review session's question, which is left waiting (the next round's `/review` arrives as a new command). The setting `review post` decides when: `auto` (the default) posts at once, `key` shows `review ready` until `c`; away mode posts as `auto` does. A round is never posted twice: its flag, and the PR's `## Self-review` comments read again just before posting. An answer that says it cannot post (red CI, …) offers nothing to post and shows its last line as `◆ asks: …`; a failed `gh` shows `◆ post failed · <first line>`, and `l` brings the session up to post by hand. Any other question shows in the box as `◆ asks: …`, and a permission dialog or an AskUserQuestion it stops on shows as `◆ needs you · <tool and argument or question>` until the call returns, so `l` can bring it up to answer. The box reads `✓ posted round N` only when tower's own `gh pr comment` exits 0 (`· by tower`), or a fresh read of the PR (every 15 s while it runs) has more `## Self-review` comments than at the round's start (counted fresh when the round starts): a post by hand counts, nothing the review session says or runs does (a post it reports reads `verifying` and makes the ticket session read the PR at once; any heading tail, such as `## Self-review (round 1) — head 507cf535b`, counts, decision 046). A post by hand also counts when it is made after the round's start (60 s earlier at most) as a comment, by any account, whose first line is not the heading but that holds two of the review's sections (`### Scope check`, `### Blockers`, …), as a GitHub review (Review changes on the web, `gh pr review`) by you (the `gh api user` account) with any text, or as anyone's GitHub review holding two of the sections; tower then never posts the round itself. Once the round is posted, a permission dialog or a question the review session still waits on from before the post no longer counts as `needs you`: the rail row, the board card, the attention popup and its chime drop it (it stays in the review pane, where `l` shows it); a wait that begins after the post counts again, as does every wait once `v` starts a new round (decision 074). `v` again runs `/review <n>` in the same session (its context kept): the next round. `l` shows the session in a split under the ticket; there its band shows `review · PR #<n>` and `x: hide`, and `x` parks it again, still running. It has no deck, but it is the same ticket: the ticket's deck reads its status file every 5 s and adds a `review` lane to the sessions timeline, its requests to the REQUESTS table (who `review`, advanced view), its tokens and cost to MODELS ON THIS WORKTREE, and counts it as RUNNING in the header while it works. The board's `models` panel sums every live session of the ticket. Its system prompt tells it to read and judge the diff itself and to send the `gh` commands, the documents and the tests to `tower:runner`, `tower:scout` and `tower:verifier`.

## Ticket flow

1. **Candidate.** Enter on a candidate promotes it (with the marked ones, decision 071): `promoting <id> (1/1)…`, the worktree is created beside the other ticket worktrees and, when the ticket is not yours, it is assigned to you on Linear; no session yet. Enter on its `○ not started` row then opens the ticket session with `/start-ticket <id>`. The skill does the other Linear writes.
2. **Planning.** The list shows `needs you · say go`. The ghost is `go`.
3. **Implementing.** While agents run: `working · <role> n/t`. Afterwards: `ready · /open-pr`.
4. **Draft pull request.** `ready · mark PR ready`; next `/open-pr`.
5. **Open pull request, not green.** `ready · review`; press `v` in the deck's REVIEW box.
6. **Green.** `ready · merge`; next `/wrap-up <n>`. The merge only happens after your explicit yes inside the skill.
7. **Merged.** `merged · /wrap-up`, then the worktree is removed.

Opening a ticket whose folder has an earlier conversation and a `.work/state.json` always continues that conversation (`--continue`), whatever phase the file names; `/start-ticket` opens a new one only when there is no state file, or no earlier conversation to continue. A state file with a phase tower does not know (`review`, `done`) or one caught mid-write counts as started (`implementing`); only a missing file reads `not started` (decision 051).

A blocked ticket stands out in red (the theme's error colour) on the rail and the board: its glyph is `⊘` and its second line reads `blocked by <first blocker>` (`+n` when there are more). It is blocked when Linear lists an open ticket that blocks it (`blocked by TKT-1234`; in a Git repository GitHub's issue dependencies, `blocked by #38`, decision 077), or when its state file has blockers (`blocked by <first blocker>`). It keeps its group: a worktree ticket lists under `needs you`, a candidate under its candidates group. The detail's meta line ends with `· blocked by TKT-1234 <its title>` in red, and a blocked candidate's `next` reads `blocked by TKT-1234 — start it or wait`.

## Skills launcher

`k` on the rail opens the list of the project's skills (its configuration's), with a filter field (`type to filter`). Each skill runs either in the open ticket's session or in a new hub session in the main checkout, with the model and effort the profile gives it. Skills that cannot run in the current context are dim. Escape closes the launcher and the list takes the keys back (the filter field takes every letter, so there is no letter key for it); the `esc back` button at the end does the same with the mouse.

## Themes

Four themes, each one table in `hooks/core/theme.ts` (ghostty's values come from Ghostty at launch):

| Theme | Looks like | Claude Code theme | tmux borders and hint row |
|---|---|---|---|
| `ghostty` (default) | Your Ghostty colours (decision 039): background, text = foreground, accent = cursor colour, panels and borders = selection background, dim = palette 8, needs you = palette 3 (yellow), done = palette 2 (10 when 2 is too dark on the background), error = palette 1; opus palette 5, sonnet 4, haiku 6. With no Ghostty colours found: the claude values. | `custom:tower:tower` (`themes/tower.json` written from those colours at a ghostty launch) | selection background, active title the cursor colour; keys the foreground, words palette 8 |
| `claude` | The design canvas: dark grey, Claude orange `#D97757` for the main model and focus, one colour per model (opus violet, sonnet blue, haiku teal). | `custom:tower:tower` (`themes/tower.json`, the claude palette on the terminal background, written at launch; see the README, Look) | `#5A5A5A`, active title `#D97757`; keys `#E8E8E8`, words `#9A9A9A` |
| `terminal` | Your own Claude Code theme; the mod draws with its theme keys (`claude`, `warning`, `success`, …). | none | `colour240`, active title `colour208`; keys `default`, words `colour245` |
| `matrix` | Green on black: background `#0B0F0B`, text `#B8F5C0`, accent `#00FF41`, needs you `#D7FF5A`, error `#FF5C5C`, greens and teal per model. | `custom:tower:matrix` (`themes/matrix.json`) | `#1F4A26`, active title `#00FF41`; keys `#B8F5C0`, words `#3F8F4A` |

Choosing one, first match wins:

1. `bin/CCtower --theme <name>`.
2. `TOWER_THEME=<name>` in the environment, or a `TOWER_THEME=<name>` line in `<plugin root>/.env` or `~/.claude/tower/.env`.
3. The theme saved in the [settings](#settings) view.
4. The plugin option `theme`.

An unknown name at launch stops the launcher (`unknown theme <x> (ghostty, claude, terminal, matrix)`); an unknown option value means `claude`. A theme given with `--theme` or `TOWER_THEME` goes into every session's environment, so all sessions of one run use it.

The launcher colours Claude Code's own frame and the tmux borders and hint row with the first of 1–3 (reading the saved theme from `~/.claude/tower/settings.json`, read only), else `ghostty` when it found Ghostty colours, else `claude`; it cannot read the plugin option. A theme saved in the settings view therefore recolours the frame and tmux at the next launch, with no flag needed.

## Attention

The rail session (the board, or the narrow list while a ticket is open) watches every ticket's step on each refresh, and every 2 s reads the session status files again for a wait (a ticket session writes its status at once when a wait starts or ends, not only at its 5 s heartbeat), so a permission dialog chimes about 10 s after it opens. When a ticket that is not the one in the centre changes:

- to `needs you` (its plan is saved and waits for `go`, a permission or a question waits in its session, its review asks): a popup `◆ TKT-2426 needs you` over `say go` (the hint is the end of its status: `say go`, `permission · Bash gh pr view …` with the waiting call, `question · …`) and, for a permission or a question only, a short soft two-tone chime (`assets/needs-you.wav`); a plan's `say go` ends an ordinary turn and shows its popup in silence;
- from `working` to `ready` (`✓`): a popup `✓ TKT-2426 ready` over `/open-pr` and a different soft tone (`assets/ready.wav`).

A permission wait starts only when the dialog is shown (`classic.PermissionRequest`), a question when `AskUserQuestion` opens; a `tool.check` ask alone is none, since in auto mode the classifier decides it with no dialog, and the wait ends when that loop's call returns or is denied, it starts another call or another step, or the turn ends. Either counts as `needs you` only once it has waited 10 s (`isRealWait` in `hooks/core/sessionStatus.ts`): in auto mode the classifier answers most permission asks within seconds, and those never show. The same rule holds for the status line, the board's column and the REVIEW box's `◆ needs you`. A working session wins over a `planning` state file (`working`, not `say go`).

The popup is drawn on the board (the wide home), at the top right over the columns; the decks show none. It is a round box, its border in the warning colour for `needs you` and the success colour for `ready`, with `g: go to TKT-2426` (opens the ticket) and `x: dismiss`; Enter on the focused card is untouched. A popup goes away after 10 s by itself and the next waiting event follows. The rail writes each event to `~/.claude/tower/attention-<repo>.json` (the repository path with `/` as `_`, the last 20; `pushEvent` and `pendingFor` in `hooks/core/attention.ts`) and reads it every 2 s; an event older than 2 minutes is never shown.

One popup and at most one chime per change, never on the first load (tickets already waiting when Tower starts stay quiet) and never for a ticket that becomes blocked (`⊘`). The ticket in the centre gets no popup (you are on it), but its permission or question still chimes: you may be looking at another window. The chime plays once, in the rail only, through `afplay` on macOS; a terminal with no player plays nothing and keeps the popup. Both are on by default; the settings' `attention` row turns each off (`popups` was `toasts`: an old choice carries over). The rule is `attentionEvents` in `hooks/core/attention.ts`. A ticket is announced once per kind and reason (`dedupeEvents`, the rail's `announced:<repo>` in the plugin store): an idle session's away recap that flips it `working` and back to the same `say go` stays quiet, and so does every later message's end that lands on the same `ready · /open-pr`; only a new ready step (`ready · review`, `ready · merge`) is announced again. Its `needs you` entry is forgotten when the ticket turns ready, everything when it leaves the lists. Which events chime is `chimes` in `hooks/core/attention.ts` (decision 040).

A free session (`+ new session`, decision 055) is announced the same way when it waits on a permission or a question, by its name: `◆ SwiftData vs GRDB needs you` over `question · Which one?`, the chime once, `g: go to SwiftData vs GRDB` brings it to the centre. Its wait is forgotten once it no longer waits, so its next wait is announced again.

## Settings

Press `p` in the deck (or `p: settings` on the board) to open the settings; `x` closes them. Move with the arrows, Enter applies a choice at once.

- **view**: `simple` is for people who do not want the detail: the header, the tabs, the main card, the pulse, the playground, the result and the dev-env box; no legend, no sessions timeline, no agent cards; the board leaves out its models panel. The playground (`playground · N working · M done`) is a box six rows tall (four when the deck is short) with one small Claude figure per agent in its model's colour, its name under it: a running agent walks back and forth along its row, a finished one sits with a `✓` (a failed one with a `✗`). The main session is the bigger figure at the left edge, labelled `main`, bobbing while it works. Three figures per row, the newest on the lower rows; more than fit show as `+n`. `medium` is the full deck. `advanced` shows every detail, from what the engine reports for each model request (`turn.step`): the main card adds `requests N · in 123k · out 45k · $x.xx` (sums of the last 200 requests; `$—` when the engine gave no cost); under each timeline lane, its request count and tokens (`12 req · 38k`); each agent card shows its last six tool calls as a dim tail (`· Tool arg`, newest last) and `n req · in/out tokens · step k of t`; a `REQUESTS` box lists the last 8 model requests (time, who in its model colour, model, effort, in, out, $), newest at the bottom. When rows run short the agent cards give way first (down to one), then the table shrinks to 4 rows, then the timeline goes. The log adds a `request · model · in/out` line per request and every gate allow; the routing tab's `MODELS ON THIS WORKTREE` adds `n requests · in/out · $` per model family; the board's `models` panel adds requests and tokens in/out per family from the session's status file. See decision 022.
- **modules**: turn off the sessions timeline, the routing view, the log view (with its gate box), the gate box alone, the documents (`m: docs` and its view) or the dev-env box. The deck gives their rows to the rest.
- **modules** also holds `stalls` and `loops` (on by default): the stall and the going-in-circles flags of decision 033, on the cards, the board and the attention.
- **attention**: `☑ popups  ☑ sound  ☑ ci alerts`, all on by default: the popup and the chime of [Attention](#attention), each on its own, and the check-flip events (`ci failed · <check>` when a check of a ticket's PR turns failing, `checks green` when running checks all pass; decision 035).
- **modules** also holds `pr state` (on by default): the PR verdict on the cards, the checklist under the inspector's PR line (up to five items, `+n more`), the verdict in the REVIEW box, the wait colours and `f: fix CI`.
- **review post**: `● auto  ○ key`. `auto` (the default): tower posts the saved review as soon as the review session shows it; `key`: the REVIEW box reads `review ready` and `c` posts it. See [Review session](#review-session).
- **aside model**: `● session  ○ sonnet`. `session` (the default): the aside forks the session's own transcript on its model, served from its prompt cache; `sonnet`: a Sonnet call over the last part of the conversation as text, no cache. **pin nudge**: `● off  ○ on` (off by default): on, a reply that ends on a question with no decision pinned in the turn is sent back once to pin it (decision 036).
- **safety**: `● on  ○ off` (on by default): risky Bash commands are blocked (`git stash`, `--no-verify`, force pushes to main/master/staging/production, `reset --hard` in the main checkout, `rm -rf` outside the worktree, `curl | sh`, `DROP TABLE`, admin merges) or put to you (`risky · <command>`, a red popup on the board); a squash or rebase merge (`gh pr merge --squash`) runs as `--merge` and is put to you as a merge, the log saying `safety rewrote …` and the model told (decision 082); one Tower cannot rewrite with certainty (`"--squash"`, `-sd`, `--squash=true`) is blocked; `.env`, keys and credential files are not read by the model; secrets in tool output reach the model as `«secret-1»`… and are put back in its Bash, Edit and Write calls. The GATE box counts `blocked N · risky asked N`; the log shows each as `safety` (decision 037).
- **fable**: `● auto  ○ off`. `auto` (the default): Fable runs, and Opus 5.5 takes its place only while Fable's limit is reached ([Fable's limit](#fables-limit)); `off`: Opus 5.5 always runs in place of Fable. A launch with `TOWER_NO_FABLE=1` acts as `off`.
- **fable early**: `● on  ○ off`. `on` (the default, with `fable` on `auto`): when the five-hour or the seven-day window is forecast to run out before its reset within 20 minutes and the main loop runs Fable, Fable is blocked ahead of time until that reset, with the toast `fable limit near · switched early …` (decision 034).
- **theme**: `launch` (the default: follow the launch's `--theme`/`TOWER_THEME` or the plugin option), `ghostty`, `claude`, `terminal` or `matrix`. The mod's colours change in every session within 2 s; Claude Code's own frame and the tmux colours follow at the next launch, with no flag needed. A launch with `--theme` or `TOWER_THEME` wins over this choice.

The settings are one file, `~/.claude/tower/settings.json`, the same for every tower session; each session reads it every 2 s (Claude Code's plugin store is cached per process, so a write there never reaches the other sessions; the first read moves a value saved there before into the file). See decision 020.

## Fable's limit

When a request on a Fable model ends the turn with the engine's `rate_limit` error, Tower blocks Fable for every session: the block (`~/.claude/tower/model-block.json`, `{ family, until, since }`) lasts until the limit's reset time when the error text or a full rate-limit window gives one, else one hour, then Fable is tried again. The session that saw it shows one toast `fable limit · resets in 2h — new sessions use Opus 5.5`; the board header shows `fable ⊘ 2h` in the warning colour while it lasts.

While blocked (or with the `fable` setting `off`): new sessions start with `--model claude-opus-5-5` where their skill names Fable (`/start-ticket`, `/review`, the hub skills); an agent spawned with a Fable model gets Opus 5.5; and every model request of a running session that names Fable is sent to Opus 5.5 instead (`turn.step`), so running sessions switch at their next request. Nothing is written to `~/.claude/settings.json`. The rule is `resolveModel` in `hooks/core/fallback.ts`. See decision 032.

## Away mode

A switch for "I am away": `a` on the board (`a: away` in its keys line), or the `away  ○ off  ● on` line in the settings view. `a` again turns it off. While it is on, the board's tabs bar shows `◆ AWAY · since 12m · 3 moved` at the right in the warning colour, the deck header ends with `· AWAY`, and the status line under each prompt shows a dim `away`.

What moves, and only this (see decision 023):

- A ticket whose next step is `/open-pr`: its session runs `/open-pr` after a 3 s pause (the band reads `away → /open-pr in 3 s`, so whoever is there sees it coming). When the skill asks to commit or to mark the pull request ready, away answers `yes`.
- A ticket whose next step is `/review <n>`: the review starts as the REVIEW box's `v` does (once per ticket), and tower posts the saved review as the setting `auto` does, whatever the setting (see [Review session](#review-session)); nothing answers the review session's post question.
- A ticket with one of these steps and no live session: the rail starts its session in a parked tmux window (the screen does not move); its row reads `◐ away  working · away → /open-pr` in amber. Enter on it brings the group (ticket and review) to the centre as usual.

What never moves: `go` on a plan (approving a plan is yours), `/wrap-up` or any merge, any other question. A permission dialog is never answered: the session shows `needs you` and waits for you. At most two tickets move at a time, the oldest first.

Every move is in the deck's log (`away → /open-pr`, `away → yes`, `away → review 103`). When you turn it off, the board's notice lists what moved (`away: TKT-9002 /open-pr, TKT-9002 review`, the last five) and the list is cleared. The state is one file, `~/.claude/tower/away.json` (`{ on, since, moved }`), read by every session every 2 s.

## Git repository

A repository whose stored configuration has GitHub issues as its tickets (decision 054; stored as `~/.claude/tower/projects/<id>.json`, `<id>` the main checkout's path with every character but letters and digits a `-`). Start `bin/CCtower` in its checkout (or any folder of it): a folder whose repository has a configuration opens that repository even when `TOWER_REPO` is set; a folder without one opens a free Tower (decision 060; with an explicit `TOWER_TMUX_SOCKET`, `TOWER_REPO` as before, decision 055).

The board and the rail show one list in place of a Linear project's columns:

```
fixture/oink · main
+ new session
SESSIONS
  ○ SwiftData vs GRDB main · 12m
IN PROGRESS
▶ ✓ #26 Start day duplicates             bug
    review · PR #30 · round 1 · fixes needed
OPEN ISSUES
  ○ #35 Totals wrong after midnight mine bug
  ○ #34 Export to CSV            enhancement
  ○ #33 Crash on restore      bug testflight
OTHER BRANCHES
  fix/crash-restore
```

- **Header**: the repository and its base branch (`project.repo · project.baseBranch`).
- **IN PROGRESS**: the issues with a worktree, those waiting for you first, then working, then ready. The second line is what waits (`planning · say go`), else the state file's phase with the pull request (`PR #30 · round 1 · fixes needed`: its review rounds and the last verdict), else the next step (`ready · /open-pr`). Enter opens the issue's session.
- **OPEN ISSUES**: the open issues without a worktree, yours first with `mine` in the accent, each with its mark `▢` (`▣` marked with `m`). Enter promotes the marked issues, else this one (decision 071): the worktree (`~/tower-work/oink/33-crash-on-restore`) and the branch (`fix/33-crash-on-restore`: `fix` for a `bug` label, else `feature`) from `origin/main` (or from `origin/<branch>` when origin has it), nothing else; the issue moves to IN PROGRESS, where Enter opens the session with `/start-ticket 33`. Nothing is written to GitHub (no self-assign).
- **OTHER BRANCHES**: worktrees whose branch and folder carry no issue number (oink's older `fix/crash-restore`), several to a line. Enter opens a plain session in that folder.
- **Labels** in colour: `bug` red (the error colour), `enhancement` the accent, `testflight` blue (the theme's Sonnet colour), others dim.
- **Detail** (the board, beside the list): the focused row's title and labels, phase and branch, the pull request, the next step, the issue's text, and what Enter does; for an open issue, the worktree and branch it would get.
- **`+ new session` and SESSIONS** above IN PROGRESS, as in "New sessions"; `w` offers the focused issue's worktree or other branch.
- **Scrolling** (decision 078): IN PROGRESS and the open issues scroll apart. The `IN PROGRESS` heading stays at the top, its rows in a window of their own, and the `OPEN ISSUES` heading stays at the top of the part under it, the open issues and OTHER BRANCHES in a window of theirs; each shows `↑ n more` / `↓ n more` when rows are cut. IN PROGRESS takes the rows it needs while that leaves the open issues 6, else what leaves them 6 (3 at least) and scrolls. A window follows the ▶ only while it is on one of its rows, so walking down the open issues never takes the sessions away. An arrow past a window's edge puts the ring on its `n more`, which moves the ▶ one row that way in that window; `↓` from the last session goes to the first open issue.
- **Keys**: the repository's actions (oink: `n` new-ticket, `t` triage, `l` release), each run as a session in the main checkout (a configuration may not put one on Tower's own keys `k r a q p b c y g x i o m w`); `o` new session, `k` skills, `r` refresh, `a` away, `q` quit, `p` settings. Beside a session: `skills refresh board quit` under the header, the actions at the bottom. A typed `33` or `#33` moves the ▶ to that issue.
- **Skills**: the launcher lists the repository's own skills (`.claude/skills/<name>/SKILL.md`, its name and description) (`routing: 'defaults'`); they run on the model every session starts with.
- The issues are read every minute and on `r` (`gh issue list --limit 100`, gh's own order, else gh stops at 30; `gh api user` once); a failed read shows `issues: gh: …` and keeps the last ones. Their open blockers (GitHub's issue dependencies) come from a read-only `gh api graphql` beside it (decision 077): a blocked issue in progress reads `⊘` over `blocked by #38 +1` in red unless its session waits or works, an open one takes a second line `⊘ blocked by #38 +1` in red, and the detail's meta line ends with `· blocked by #38 …`; nothing moves and Enter works as on any issue. A failed blockers read shows the issues without them. A worktree's pull request comes from `gh pr list --head <branch>`.
- **Checks without GitHub CI** (decision 055; oink's `checks.sources` are `stateFile` and `release`): the PR box of an issue's session reads `checks` (`{ sha, at, ran }`) from the worktree's state file, against the PR's head commit. `✓ unit, ui-smoke on b260000 (head)` when they ran on the head; `✗ checks stale (a110000 ≠ head b260000)` when on another commit; `✗ no checks recorded` without them. A dim last row tells the last release: `◷ suite in release · build-14 · 3d ago · 6 commits since` (the newest `build-*` tag, its age, the commits on `origin/<base>` since it), whole in a 60-column deck; it never blocks (a narrower deck cuts it with `…`). The review row uses the configuration's word (`review round 2`, `no review yet`; a `## Self-review` heading gives `self-review`). A review round is a PR comment whose first line is the configuration's heading and, when the configuration has verdict lines, that holds one: oink's `## Review round 2: changes`, the reply listing the fixes, is no round, so the rounds, the box's `posted round N`, the next round's number and the last verdict come from the `## Review (round N)` comments alone; a configuration with no verdict lines counts every comment with its heading (decision 081). READY needs the review's verdict line to say ready to merge, the checks on the head and no conflict; then the next step is `/wrap-up`.

  ```
  ╭─────────────────────────────────────────────────────────────────────────────╮
  │ PR #30 · READY                                               updated 1h ago │
  │ ✓ unit, ui-smoke on b260000 (head)                                          │
  │ ✓ review round 2                                                            │
  │ ✓ no conflict with main                                                     │
  │ ◷ suite in release · build-14 · 3d ago · 6 commits since                    │
  ╰─────────────────────────────────────────────────────────────────────────────╯
  ```

## Allowed commands

A project's configuration may list Claude Code rules its sessions run without asking (decision 080), in Claude Code's own `permissions.allow` syntax:

```json
"permissions": { "allow": ["Bash(xcrun simctl:*)", "Bash(nohup xcrun simctl:*)", "Bash(xcodebuild:*)", "Bash(ffmpeg:*)", "Bash(mkdir:*)", "Bash(cp:*)", "Bash(sleep:*)"] }
```

- Every session Tower starts for the project (an issue's or ticket's session, a free or hub session, the review session) gets them in its `--settings`; Claude Code adds them to the rules of your own and the project's settings. Your `~/.claude/settings.json` and the repository are not touched, and no permission mode is set. The rail keeps the launcher's settings.
- Optional: without the key the sessions get no rules of Tower's. A rule that is not a non-empty string is dropped; the configuration still opens.
- Edit the stored `~/.claude/tower/projects/<id>.json` and start the session again: a running session keeps the settings it started with.
- A rule matches the command's prefix, never its folder, so `rm` and `kill` are better left asking. Tower's safety rules (decision 037) still ask or refuse whatever is allowed.

## tower-setup

`/tower:tower-setup` sets Tower up for a git repository (decisions 061 and 065). Run it in a Claude session in the repository, or let Tower start it: the start menu's Git repository, or the rail's `s: set up this repository` in a free Tower.

- It reads the repository (its `CLAUDE.md`, README, docs, stack files, scripts, workflows, issues and pull requests), writes a short brief with the file each line comes from, and compares its flow with Tower's reference flow (complete, partial or none).
- It proposes the configuration, each item with its evidence and `✓` / `?` / `✗`, and asks only what the documents leave open (always how changes are delivered).
- **No flow, or part of one**: a guided setup. It asks the questions the documents cannot answer (where tickets live, how tests run, how releases happen, the language), then proposes the missing flow skills one by one, each accepted or refused on its own, and delivers the accepted ones by pull request or by a direct commit, as you choose. Every step that leaves the repository (a push, a pull request, the first tickets for missing tests or CI) waits for its own yes.
- Nothing is saved before your yes: then the configuration goes to `~/.claude/tower/projects/<id>.json`. The repository itself is only read, except for the skills you accepted.
- Then quit the Tower you are in and run `tower` again in the folder: it opens the project.

## Testing

- `tools/fixture.sh [--force] <dir>`: builds a fake Linear-ticket project (decision 083): bare origin, main checkout, ticket worktrees (`TKT-9001`…), fake skills, fake `gh`, a fake Linear answer and its stored configuration (`tools/fixture/config.json`) in `<dir>/state`; its exports set `TOWER_REPO`, the fake `gh` on `PATH`, `TOWER_LINEAR_FIXTURE` and `TOWER_STATE_DIR=<dir>/state`. `TOWER_FIXTURE_PREFIX` sets another ticket prefix and `TOWER_FIXTURE_STORED=0` leaves out the stored configuration. `--clean <dir>` removes only what it built.
- `tools/fixture-selftest.sh [<dir>]`: drives TKT-9006 end to end with the fake helpers (no Claude, no tmux), then cleans up; then builds and checks the GitHub fixture.
- `tools/fixture-github.sh [--force] <dir>`: builds an oink-like Git repository (decision 054): bare origin on `main`, the main checkout with its own stand-in skills, a fake `gh` with open issues (#33 bug and testflight, #34 enhancement, #35 the fixture user's bug), #26 in progress (worktree, state file `review` with its checks recorded on the head, PR #30 whose review round 1 asks for fixes), a release tag `build-14` two commits back on `main`, a legacy `fix/crash-restore` worktree, and the stored configuration in `<dir>/state`. Its exports set `TOWER_REPO`, the fake `gh` on `PATH` and `TOWER_STATE_DIR=<dir>/state`. `--clean <dir>` removes only what it built.
- `tools/test-launch.sh <socket> [columns rows]`: the only way tests start the mod. It rebuilds the fixture in `.smoke/` (`TOWER_FIXTURE` names another builder), starts `bin/CCtower` from the fixture's main checkout, unsets `LINEAR_API_KEY`, sets `TOWER_NO_DOTENV=1`, uses `haiku` by default and refuses the sockets `tower`, `tower-*` and `towergen`. It also sets `TOWER_STATE_DIR=<plugin root>/.smoke/state` and `TOWER_MUTE=1`, and the launcher and the rail hand both on to every session: the status files, keys, settings, attention queue, Fable block and away state of a test go to `.smoke/state/`, never to `~/.claude/tower/`, and no chime plays on the Mac. `tools/fixture.sh --clean .smoke` removes `.smoke/state` with the rest.
- `tools/shot.sh <socket> <name> <pane id>…`: a PNG of the panes in `.shots/`.
- `claude plugin validate .` and `claude plugin test`: the plugin and the tests in `tests/`.
- `tools/check-tower-install.sh`: `bin/tower-install` and the `tower` command it writes, in a scratch HOME (decision 066).
- `tools/check-start-menu.sh`: the start menu, `folders.json`, `TOWER_START` and the design Tower's launch, on throwaway folders with a stand-in tmux (and the menu on a real pty through `script`).
- `tsc -p tsconfig.json --noEmit`: the types.
