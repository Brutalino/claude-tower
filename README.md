# Tower

Tower turns Claude Code into a workspace for tickets, projects and free sessions. It is a Claude Code mod (a plugin with a function-hooks module) plus a small launcher, `tower`, that runs everything in a tmux server of its own.

One terminal window, three zones: **the rail** on the left (your issues or tickets, the sessions you opened, and what to do next; on start it is a full-width board), **a real Claude Code session** in the centre (one per ticket, in the ticket's own git worktree, with a band above the prompt and Tower's status line under it), and **the flightdeck** on the right (the main model, every agent with its steps and time left, a timeline of models, usage and rate limits, routing, pins, and for a ticket its pull request, review and dev environment). When a session you are not looking at waits for you (a permission, a question, a plan to approve), a popup and a soft chime say so.

Tower is a personal tool shared as is. It is developed and tested on macOS in Ghostty, on an early-access Claude Code API (mods): expect rough edges, and expect it to need updates when Claude Code changes.

## Modes

`tower` opens the right mode for the folder you run it in. In a folder Tower does not know, a start menu asks.

| Mode | When to use it | What you get |
|---|---|---|
| **Git repository** | Any git repository, with GitHub issues or Linear tickets. | First `/tower:tower-setup` reads the repository and stores its configuration (nothing is written into the repository without your yes). From then on: its issues or tickets on the rail, one worktree and one session per issue, pull requests, reviews and merges through the repository's skills. |
| **New project** | An empty folder where a new project should start. | `/tower:tower-design` takes the idea through seven stages to design documents, then hands over to tower-setup; the rail shows the path. |
| **Free session** | Anything without a ticket: planning, research, work across repositories. | Plain Claude sessions with the flightdeck; open as many as you like. Also available inside any ordinary Claude Code session with `/tower`. |

## Requirements

| What | Needed | Why |
|---|---|---|
| Claude Code with the mods API | required | Tower is a mod. Verified on 2.1.291 to 2.1.296; the mods API is early access. |
| `tmux` | required for the `tower` command | Tower's own tmux server holds the rail and the sessions. |
| `git` | required | Worktrees, branches, repositories. |
| `claude` CLI on `PATH` | required | Every Tower session is a `claude` process. |
| `python3` (`/usr/bin/python3`) | required by the launcher | The launcher reads JSON and the Ghostty theme with it. |
| `node` 22.18 or later | for Git repository setup | tower-setup's tools run Tower's TypeScript with node. |
| `gh`, signed in (`gh auth status`) | for GitHub repositories | Issues, pull requests, checks and reviews. |
| `LINEAR_API_KEY` | for Linear projects only | The ticket lists. Read only but for one write: promoting a ticket that is not yours assigns it to you. |
| Ghostty | optional, recommended | The tested terminal; Tower takes its colours. Without it Tower falls back to its `claude` palette. Other terminals with true colour and mouse support should work but are untested. |

Missing pieces on macOS: `brew install tmux gh node`. `/tower install` checks all of the above and says what is missing.

The deck's bars use `▮ ▯ ▰ ▱` (U+25AE–U+25B1). Many coding fonts (JetBrains Mono among them) lack them, and the terminal then borrows them from another font, which can differ from one window to the next. In Ghostty, pin them to one font so every window draws the same thin bars:

```
font-codepoint-map = U+25AE-U+25B1=Menlo
```

## Install

1. **Install the plugin once, for your user.** It then loads in every session and every folder; nothing is installed into any repository. In a Claude Code session:

   ```text
   /plugin marketplace add Brutalino/claude-tower
   /plugin install tower@claude-tower
   ```

   From a terminal: `claude plugin marketplace add Brutalino/claude-tower`, then `claude plugin install tower@claude-tower --scope user`.

2. **Add the `tower` command.** In a new Claude Code session (so the plugin is loaded):

   ```text
   /tower install
   ```

   It checks the requirements, then writes `~/.local/bin/tower`. It asks first when that folder is not on your `PATH`, or when a `tower` it did not write is already there (shown, and kept as `tower.before-tower` if you replace it). `/tower uninstall` removes only that command. The `tower` command is a small wrapper: at every run it finds the installed plugin in Claude Code's `~/.claude/plugins/installed_plugins.json` (its folder changes with each version) and runs its `bin/CCtower`, so plugin updates need nothing more.

3. **Run it:** open a new terminal tab, then `cd <a repository or a folder> && tower`.

Installed, the plugin does nothing in an ordinary Claude Code session: no band, no deck, no routing, no safety rules, no files, no timers. It only adds `/tower`. If you never want the `tower` command, `/tower` alone already gives you a free session in place (see [Free sessions](#free-sessions)).

### From a checkout

```sh
git clone https://github.com/Brutalino/claude-tower.git ~/Repositories/claude-tower
claude --plugin-dir ~/Repositories/claude-tower          # a session with this checkout's mod (/tower works there)
~/Repositories/claude-tower/bin/CCtower                  # the launcher, straight from the checkout
export TOWER_DEV_ROOT=~/Repositories/claude-tower        # or: the installed `tower` runs this checkout
```

Claude Code loads one plugin per name: a `--plugin-dir` copy replaces the installed one for that session. Every session Tower starts gets `--plugin-dir <the launcher's own folder>`, so a checkout's Tower runs the checkout's code everywhere. Saving a file in the checkout hot-reloads the mod in its running sessions.

## First run

Run `tower` in a folder:

- **A git repository Tower does not know yet**: the start menu offers **Git repository**. It opens a Tower whose first session runs `/tower:tower-setup` (you can also type `/tower:tower-setup` in any session there).
- **An empty folder**: the menu offers **New project**.
- **Any other folder**: **Free session** (press `r` in the menu to remember the folder as free and skip the menu next time).

The first time Claude Code sees a folder it asks whether you trust it, in the rail's pane: answer it there and Tower continues.

### Git repository

1. tower-setup reads the repository (`CLAUDE.md`, README, docs, stack files, scripts, workflows, issues, pull requests), writes a short brief with the file each line comes from, and compares its flow with Tower's reference flow (capture, plan, verification, pull request, review, merge, release).
2. It proposes the configuration, each item with its evidence and `✓` / `?` / `✗`, and asks only what the documents leave open: always how changes are delivered (a pull request, or a direct commit on the main branch). When the repository has no flow or part of one, it asks where tickets live (GitHub issues, Linear, or none), how tests and releases run, and proposes the missing skills (`/start-ticket`, `/open-pr`, `/review`, `/wrap-up`, …) one by one.
3. Nothing is saved before your yes. The configuration goes to `~/.claude/tower/projects/<id>.json`, never into the repository; accepted skills are delivered by a pull request or a direct commit, as you choose. Every step that leaves your machine (a push, a pull request, new issues) waits for its own yes.
4. Quit (`q` then `y`) and run `tower` again: the repository is now a project.

Then the rail lists the issues in progress (with a worktree) and the open ones. `m` marks open issues and `Enter` promotes them: a worktree in `~/tower-work/<repo>/<issue>-<slug>` on a branch `fix/<n>-<slug>` (for a `bug` label) or `feature/<n>-<slug>`, and nothing else. `Enter` on an issue in progress opens its session on the start skill. The rail shows each step: `needs you · say go` while a plan waits for your approval, `working · executor 2/5` while agents run, `ready · /open-pr`, `ready · review` (press `v` in the deck's REVIEW box: a review in its own session, posted to the pull request), `ready · merge` (`/wrap-up <n>`; the merge needs your explicit yes).

A Linear project works the same way on a board of cards (needs you, working, ready, candidates), with Linear's branch names; it needs `LINEAR_API_KEY` in the environment or as a `LINEAR_API_KEY=` line in `~/.claude/tower/.env` (read line by line, never sourced). Tower's only Linear write is assigning to you a ticket you promote.

One Tower per project, on its own tmux socket (`tower-<folder name>`): a worktree or a subfolder opens the same Tower, and several projects run side by side in separate terminal tabs.

### New project

In an empty folder, `tower` offers **New project**. It writes `.tower/design.json` and opens a design Tower whose session runs `/tower:tower-design`: idea, research (with sources), product, decisions, architecture, design (when there is a UI) and plan, each stage closed only by your explicit go, one question at a time. The rail shows the path (`✓` done, `◆` active, `○` to do) with each stage's document; `↵` on a stage brings the design session back. `o` opens a free session in the folder; `t` makes a prototype folder `spikes/<nn>-<slug>/` and opens a session there. Stage 8 hands over to tower-setup; after it the folder is a Git repository project.

### Free sessions

A free Tower is the rail beside one Claude session in the folder, with the flightdeck. `o` opens more; SESSIONS lists them with their state, `↵` brings one to the centre. Each launch opens a new free Tower, so you can run as many as you like; `q` then `y` closes one.

Or type `/tower` in an ordinary Claude Code session: it becomes a free session in place, with the flightdeck beside it, the band, Tower's safety rules and its routing for subagents. No tmux is needed. `/tower off` turns it off again. The session keeps its own model; routing changes reach its subagents.

## Keys

The bottom row of the window always shows the keys of the active pane. The full reference is [docs/usage.md](docs/usage.md).

| Where | Keys |
|---|---|
| Board | `↑` `↓` within a column · `Alt+←` `Alt+→` across columns · `Enter` open (a candidate: promote it and the marked ones) · `m` mark a candidate · `o` new session · `k` skills · `r` refresh · `a` away mode · `p` settings · `x` close the session the focus is on (then `y`) · `q` then `y` quit |
| Rail beside a session | `↑` `↓` · `Enter` open · `b` back to the board · `o` new session · `k` skills · `r` refresh · `x` close the row's session, or take a ticket without one off the rail (then `y`) · `a` candidates (`m` mark, `Enter` promote, `l` detail, `a` or `esc` back) |
| Session | `Alt+→` the deck · `Alt+←` back, then the rail · `Alt+↑` the band (then `e`: explain as) · `Tab` takes the ghost suggestion |
| Deck | `1` agents · `2` routing · `3` log · `m` docs · `w` watch an agent · `a` aside · `k` compact micro · `p` settings · `h` agent history · `v` `c` `l` review · `f` fix CI · `o` `r` `s` `u` dev env · `x` close |
| Routing view | `↑` `↓` row · `j` model · `e` effort · `d` back to the table |
| Board prompt box | a ticket id moves the focus to it, other text filters the board, `esc` gives the keys back |

On macOS, Option+←/→ reach tmux as `Esc b` / `Esc f`; the launcher binds those too, so no terminal setting is needed. The price: Option+←/→ no longer jump by word inside the prompt of a Tower session (use `Ctrl+←/→`).

## Commands

| Command | What it does |
|---|---|
| `tower` | Start or attach this folder's Tower. |
| `tower --no-attach` | Start it without attaching. |
| `tower --list` | The running Towers: socket, project, folder. |
| `tower --kill` | Close this folder's Tower and its sessions (conversations are kept; a ticket resumes next time). |
| `tower --kill-all` | Close every Tower. |
| `tower --theme <name>` · `--bg <hex>` | Launch with a theme (`ghostty`, `claude`, `terminal`, `matrix`) or a background colour. |
| `tower --root` | The plugin folder the wrapper runs (wrapper only). |
| `/tower` · `/tower off` | Tower in an ordinary session, and off again. |
| `/tower install` · `/tower uninstall` | Write or remove the `tower` command. |
| `/deck` | Reopen the flightdeck. |
| `/compact-micro` (or `/compact micro`) | Drop old Read results and thinking from the context, with no model call. |
| `/tower:tower-setup` | Set Tower up for a git repository. |
| `/tower:tower-design` | Design a new project from an idea. |

Without the wrapper, `bin/CCtower` takes the same arguments.

## Models and routing

The main session thinks; Tower's roles do the work (`executor`, `scout`, `verifier`, `runner`), each on the model and effort the routing table gives it. The deck's routing view (`2`) lists `new session`, the skills and the roles: `j` moves the chosen row through the models Claude Code itself offers in `/model` (asked from Claude Code and cached, so a new model shows up without a Tower update), `e` through the efforts that model takes, `d` back to the table. Choices apply to sessions started from then on. The plugin option `routing` is `enforce` (spawns rerouted, forks refused with advice), `observe` (only recorded) or `off`.

When Fable's usage limit is reached, every session switches to Opus 5.5 until the reset (and ahead of a forecast run-out, with the `fable early` setting), with no change to your Claude Code settings.

## Safety

On by default in every Tower session (the `safety` setting):

- Risky Bash commands are blocked or put to you: `git stash`, `--no-verify`, force pushes to main/master/staging/production, `reset --hard` in the main checkout, `rm -rf` outside the worktree, `curl | sh`, `DROP TABLE`, admin merges.
- A squash or rebase merge runs as `--merge` and is put to you as a merge.
- `.env` files, keys and credential files are not read by the model.
- Secrets in tool output reach the model as `«secret-1»` placeholders and are put back in its Bash, Edit and Write calls.
- A merge happens only after your explicit yes inside the merge skill. Away mode (`a` on the board) moves a ticket only through `/open-pr` and the review; never a plan approval, `/wrap-up` or a merge.

In an ordinary session nothing of this applies until `/tower`.

## Configuration and state

Tower keeps its own files in `~/.claude/tower/` (`TOWER_STATE_DIR` to move it), shared by every Tower:

| File | What it holds |
|---|---|
| `projects/<id>.json` | A repository's configuration, written by tower-setup (`<id>`: the main checkout's path). |
| `routing/<project>.json`, `routing/free.json` | Your model and effort choices from the routing view, per project and for every free session. |
| `models.json` | The list of models from Claude Code's `/model`, refreshed when a day old or after a Claude Code update. |
| `settings.json` | The settings view's choices (view, modules, attention, review post, safety, Fable, theme). |
| `sockets.json` | Each project's tmux socket. |
| `folders.json` | Folders remembered as free (`r` in the start menu). |
| `.env` | Optional: `LINEAR_API_KEY`, `TOWER_THEME`. |
| `sessions/`, `keys/`, `attention-*.json`, `away.json`, `model-block.json`, `palette.json` | Runtime state: session status, key presses, popups, away mode, Fable's limit, Ghostty's colours. |

Plugin options (`claude plugin configure tower@claude-tower`): `theme` (`ghostty`, `claude`, `terminal`, `matrix`) and `routing` (`enforce`, `observe`, `off`). Environment: `TOWER_THEME`, `TOWER_BG`, `TOWER_SESSION_MODEL` (the model of every session the rail starts), `TOWER_DEMO=1` (a demo deck), `TOWER_DEV_ROOT`; the full list is in [docs/usage.md](docs/usage.md).

## Troubleshooting

- **The first launch in a folder shows Claude Code's trust question** in the rail's pane: answer it there; Tower continues.
- **What is running?** `tower --list`; close one with `q` `y` in it or `tower --kill` in its folder; `tower --kill-all` closes every Tower.
- **After a plugin update**, quit Tower (`q` `y`) and run `tower` again; ordinary sessions take the update when they start.
- **`tower: Tower's plugin is not installed`**: the wrapper found no `tower@claude-tower` in `installed_plugins.json`; install the plugin, or set `TOWER_DEV_ROOT`.
- **No Linear tickets**: `/tower install` reports whether `LINEAR_API_KEY` is set (in the environment, or a `LINEAR_API_KEY=` line in `~/.claude/tower/.env`).
- **No GitHub issues**: `gh auth status` must show you signed in; a failed read shows `issues: gh: …` on the rail.
- **The deck is closed**: `Alt+→` from the session, or `/deck`.
- **The bars look different from one window to the next**: see the `font-codepoint-map` tip under [Requirements](#requirements).

## Development

```sh
claude plugin validate .                          # the plugin, its marketplace and its hooks module
claude plugin test .                              # the tests in tests/
npx -p typescript tsc -p tsconfig.json --noEmit   # the types (needs Claude Code's mod types in .claude-plugin/types/, gitignored)
tools/check-tower-install.sh                      # the installer and the wrapper, in a scratch HOME
tools/check-start-menu.sh                         # the start menu and the design Tower's launch
tools/check-tower-socket.sh                       # one Tower per project, free Towers
tools/check-config-resolve.sh                     # which project a folder opens
tools/check-tower-setup.sh                        # tower-setup's tools on a throwaway repository
tools/check-tower-design-state.sh                 # tower-design's state file
tools/check-theme-colours.sh                      # the launcher's colours match the mod's
tools/check-ghostty-palette.sh                    # Ghostty's colours
tools/fixture.sh <dir>                            # a fake Linear-ticket project (origin, worktrees, fake gh and Linear, its configuration)
tools/fixture-github.sh <dir>                     # a fake Git repository with GitHub issues (fake gh)
tools/test-launch.sh <socket>                     # Tower on the fixture in .smoke/ (never the socket "tower")
```

Tests never touch real repositories, a Linear key or your settings. [docs/usage.md](docs/usage.md) is the full reference of keys and screens.

## License

MIT. See [LICENSE](LICENSE).
