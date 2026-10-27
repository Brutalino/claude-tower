// The $.state contract of tower, and the data types its pure logic shares.

/** `free`: a plain session opened by `+ new session`, no ticket and no start prompt (decision 055). */
export type TowerRole = 'rail' | 'ticket' | 'hub' | 'review' | 'free'

export type TowerSessionState = 'idle' | 'working' | 'ended'

/** One file in <Tower's folder (TOWER_STATE_DIR, else ~/.claude/tower)>/sessions/<id>.json: the registry other sessions read. */
export type TowerSessionStatus = {
  v: 1
  id: string
  role: TowerRole
  ticket: string | null
  cwd: string
  pane: string | null
  /** The session's TOWER_TAG: the rail drops the record once no tmux pane carries the tag. */
  tag?: string
  /** The tmux socket of the Tower the session runs in (TOWER_TMUX_SOCKET, decision 059); absent in older files. */
  socket?: string
  state: TowerSessionState
  since: number
  updatedAt: number
  /** The subagents of a ticket session; absent in a rail's record and in older files (read as none). */
  agents?: { running: number; total: number }
  /** The main loop's model and effort, and the status line's right-hand text; absent in older files. */
  model?: string | null
  effort?: string | null
  footer?: string
  /** The session's own ticket is in the group `needs you`, or the session waits on a permission or a question. */
  needsYou?: true
  /** The session waits on a permission dialog or an AskUserQuestion; absent otherwise and in older files. */
  waiting?: TowerWaiting
  /** Away mode is on (decision 023): the status line shows a dim `away`. */
  away?: true
  /** The session's own ticket waits for a review or a merge. */
  ready?: 'review' | 'merge'
  /** A ticket session's own next step as it will read once idle (`/review 2408`, `/open-pr`, …); absent in other roles and older files. */
  next?: string | null
  /** The running agent with steps (the least far along), for `working · executor 3/5`. */
  agent?: { name: string; done: number; total: number } | null
  /** A stalled loop or one going in circles (decision 033); absent when none and in older files. */
  alert?: TowerAlert
  /** Decision 034: when the main loop's last model request ended, for the board's cold-cache mark; the windows it last read. */
  lastRequestAt?: number
  limits?: TowerLimits
  /** Tokens per model family and the usage cost of a ticket session. */
  tokens?: Record<string, number>
  cost?: number | null
  /** Model requests and their tokens per model family, from the deck's request ring; absent in older files. */
  requests?: Record<string, TowerFamilyRequests>
  /** A review session's last action and last answer (decision 025): another question; whether it is posted is never its own to say. */
  review?: { action: string; asks: string | null; shown?: boolean; body?: string | null; posted?: boolean }
  /**
   * Decision 074: a ticket session's running review round once posted (by tower, the review session or by hand), and
   * when; the review session's wait from before then no longer needs the person. Absent otherwise and in older files.
   */
  reviewPosted?: { round: number; at: number }
  /** A review session's main-loop model spans and its last 20 requests (decision 025): the ticket's deck merges them. */
  spans?: TowerSpan[]
  recentRequests?: TowerRequest[]
  /** Decision 036: the session's open pins (decisions, todos, links); absent when none and in older files. */
  pins?: TowerPin[]
  /** Decision 055: a free session's name, its first prompt's first words; absent before that prompt and in other roles. */
  title?: string
}

/** A permission dialog (`Bash gh pr view 103`) or an AskUserQuestion (its first question) waiting on the person, since when. */
export type TowerWaiting = { kind: 'permission' | 'question'; text: string; since: number; agentId?: string }

/** A model family's requests and tokens, as the status file and the board carry them. */
export type TowerFamilyRequests = { count: number; in: number; out: number }

/** One model request as `turn.step` reported it: who made it, on which model, its tokens, its cost when the engine gave one. */
export type TowerRequest = {
  at: number
  who: string
  model: string
  effort: string | null
  tokensIn: number
  tokensOut: number
  costUsd: number | null
  durationMs: number | null
}

/** What a ticket session's deck shows: its main loop and the subagents it started. */
/** A rate-limit window: how full it is (percent) and when it resets (epoch ms; null when unknown). */
export type TowerLimitWindow = { percent: number; resetsAt: number | null }

/** The rate-limit windows `$.session.usage()` reports, each null when it did not report it. */
export type TowerLimits = { fiveHour: TowerLimitWindow | null; sevenDay: TowerLimitWindow | null; spend: TowerLimitWindow | null }

export type TowerDeck = {
  main: {
    model: string | null
    effort: string | null
    state: 'idle' | 'working'
    requests: number
    turnStartedAt: number | null
    /** The main loop's own last tool call and its TaskCreate/TaskUpdate steps, as an agent's. */
    lastAction: string | null
    steps: TowerStep[]
    stepsCreated: number
    /** Set when a main turn completes: how long it took and how many agents it started. */
    lastTurn: { durationMs: number; agents: number } | null
    /** When the current work period began: the start of the turn the person's last own prompt started. */
    workStartedAt: number | null
    /** When the main loop's last turn ended. */
    turnEndedAt: number | null
    /** Whether the prompt just submitted is the person's own: the next turn then opens a work period. */
    nextTurnByPerson: boolean
    /** The time the main loop spent per model, oldest first. */
    spans: TowerSpan[]
    /** Decision 033: the calls in flight (oldest first), the last tool or step event, the last finished calls, the current step's clock. Absent in a deck from before. */
    inFlight?: TowerInFlight[]
    lastEventAt?: number
    calls?: TowerCall[]
    stepSince?: number | null
    stepText?: string | null
  }
  /** As far as `$.session.usage()` reports them; null when unknown. */
  /** `limits`: each rate-limit window on its own (`five_hour`, `seven_day`, `spend_limit`); absent in a deck from before it. */
  usage: { contextPercent: number | null; cost: number | null; limits?: TowerLimits }
  agents: TowerAgent[]
  routing: TowerRouting
  /** Tokens (input + output) per model family, main loop and agents together. */
  tokens: Record<string, number>
  /** The last log entries, oldest first. Optional here and below: a deck kept from before a hot reload lacks them. */
  log?: TowerLogEntry[]
  /** The permission verdicts of this session and its agents. */
  gate?: TowerGate
  /** The current work period's counters: successful edits, errored tool results, the cost when it began. */
  period?: { edits: number; errors: number; costAtStart: number | null }
  /** The last model requests, oldest first (the advanced view). */
  requests?: TowerRequest[]
  /** A permission dialog or a question waiting on the person; absent or null when none. */
  waiting?: TowerWaiting | null
  /** Decision 036: the pinned decisions, todos and links, open and closed; absent before the first. */
  pins?: TowerPin[]
  /** Decision 034: the main loop's last request (when, its cached tokens) and the tokens of every request so far; absent before the first. */
  cache?: { lastRequestAt: number; cachedTokens: number; sessionTokens: number }
}

/** The `env` of a ticket's `.work/state.json`, as a `dev-env` skill writes it (config env, kind `skill`), merged with the compose stack docker sees (decision 073). */
export type TowerDevEnv = {
  frontendUrl: string
  frontendPort: number | null
  /** The skill's own `failed` is kept; docker running the stack makes it `up`. */
  status: 'up' | 'down' | 'failed'
  loginVerified: boolean
  startedAt: number | null
  /** The compose project, from the state file or docker; absent or null when unknown. */
  project?: string | null
  /** Decision 073: `docker` when a running stack has no state file env naming it, `file` otherwise; absent: the file alone. */
  source?: 'docker' | 'file'
  /** Decision 073: the state file's own status once docker's answer was merged in (a running stack, or a stale `up`); absent otherwise. */
  fileStatus?: 'up' | 'down' | 'failed'
}

/** One row of the deck's log: who did it (`main`, an agent's name, `routing`, `gate`) and what. */
export type TowerLogEntry = { at: number; who: string; text: string }

export type TowerVerdict = 'allow' | 'ask' | 'deny'
/** `blocked` and `riskyAsked`: the safety rules' own denials and asks (decision 037), absent until the first. */
export type TowerGate = { allowed: number; asked: number; denied: number; recent: TowerVerdict[]; blocked?: number; riskyAsked?: number }

/** A stretch of time on one model; `to` is null while it runs. */
export type TowerSpan = { model: string; from: number; to: number | null }

/** What the routing of spawns decided in this session: the last decisions and two counts. */
export type TowerRouting = {
  decisions: { at: number; text: string; kind: 'pass' | 'deny' | 'model' | 'role' }[]
  rerouted: number
  denied: number
}

export type TowerStep = {
  /** The task id from TaskCreate's result, which TaskUpdate names; `marker:<k>` for a step announced in text. */
  id: string
  text: string
  status: 'todo' | 'doing' | 'done'
}

export type TowerAgent = {
  id: string
  name: string
  type: string
  model: string | null
  effort: string | null
  status: 'running' | 'done' | 'failed'
  task: string
  startedAt: number
  endedAt: number | null
  actions: number
  lastAction: string | null
  /** The last 6 action lines, oldest first. */
  recent: string[]
  steps: TowerStep[]
  /** How many steps TaskCreate made: the fallback id of the next one. */
  stepsCreated: number
  tokens: { input: number; output: number }
  lastOutput: string | null
  /** The time the agent spent per model: from its spawn to its end. */
  spans: TowerSpan[]
  /** Decision 033: the calls in flight (oldest first), the last tool or step event, the last finished calls, the current step's clock. Absent in a deck from before. */
  inFlight?: TowerInFlight[]
  lastEventAt?: number
  calls?: TowerCall[]
  stepSince?: number | null
  stepText?: string | null
}

/** A tool call under way: its action line and its start. */
export type TowerInFlight = { id: string; line: string; since: number }
/** One finished tool call as loop detection reads it: the tool, its main argument, whether it failed. */
export type TowerCall = { tool: string; arg: string; failed: boolean; at: number }
/** A ticket session's stall or loop as the rail sees it (`stalled · executor`); `id` is one per stall or loop. */
export type TowerAlert = { kind: 'stalled' | 'loop'; text: string; id: string }

/** `review`: only when a configuration's phases map a word onto it (not the state file's `planning`/`implementing` alone). */
export type TowerPhase = 'planning' | 'implementing' | 'review' | 'not started'

/** One ticket as tower reads it: a Linear issue (`id` its identifier, TKT-1234) or a GitHub issue (`#27`; no priority, story or relations). */
export type TowerIssue = {
  id: string
  title: string
  description: string
  priority: 'none' | 'urgent' | 'high' | 'medium' | 'low'
  branchName: string
  url: string
  stateName: string
  stateType: string
  labels: string[]
  assignedToMe: boolean
  /** Someone else's short name (Linear's `displayName`) when the issue is assigned to another person. */
  assigneeName?: string
  /** Decision 071: Linear's own id of the issue (the self-assign's `issueUpdate`); the identifier stands in when absent. */
  linearId?: string
  /** Decision 071: a story's child assigned to the person that the candidates' query did not give: read by identifier before it is promoted. */
  fromStory?: boolean
  /** The parent story; its state and children when Linear gave them (for `d/t done`). */
  story: { id: string; title: string; stateName?: string; stateType?: string; children?: TowerIssueRef[] } | null
  /** The identifiers of the open issues that block this one. */
  blockedBy: string[]
  /** Every blocker, closed ones too (the detail's `blocked by`). */
  blockers?: TowerIssueRef[]
  /** The issues this one blocks. */
  blocks?: TowerIssueRef[]
  /** The sub-tickets; `blockedBy` lists every `blocks` relation pointing at the child. */
  children: { id: string; title: string; stateName?: string; stateType?: string; blockedBy?: string[] }[]
}

/** Another issue as a relation names it. */
export type TowerIssueRef = { id: string; title: string; stateName: string; stateType: string; blockedBy?: string[]; /** Decision 069: a story's child assigned to the person. */ assignedToMe?: boolean }

/** One ticket worktree as the rail draws it. */
export type TowerRailRow = {
  /** The ticket id (TKT-123), or the branch name when it has none. */
  key: string
  branch: string
  path: string
  phase: TowerPhase
  next: string | null
  hasPlan: boolean
  /** The state file's blockers, as text. */
  blockers: string[]
  session: 'working' | 'idle' | null
  /** Subagents running in the ticket's session. */
  agents: number
  /** The live session's running agent with steps. */
  agent?: { name: string; done: number; total: number } | null
  /** A live session of the ticket (its own or its review) waits on a permission or a question. */
  waiting?: TowerWaiting['kind'] | null
  /** Decision 036: the live session's open pinned decisions. */
  decisions?: number
  /** The ticket session's stall or loop (decision 033). */
  alert?: TowerAlert | null
  /** The live session's last model request (decision 034): its prompt cache is cold past five minutes. */
  lastRequestAt?: number | null
}

/** A worktree that is not a ticket: its folder name, its branch (null when detached) and its path. */
export type TowerOtherWorktree = { name: string; branch: string | null; path: string }

/** What the detail column draws from local files, read with the list. */
export type TowerTicketLocal = {
  plan: string | null
  base: string | null
  sessions: { role: TowerRole; state: 'working' | 'idle'; since: number; waiting?: boolean }[]
  /** The live session's tokens per model family and cost; null without session data. */
  usage?: { tokens: Record<string, number>; cost: number | null; requests?: Record<string, TowerFamilyRequests> | null } | null
}

export type TowerRailView =
  | { kind: 'loading' }
  | {
      kind: 'rows'
      repoName: string
      rows: TowerRailRow[]
      local: Record<string, TowerTicketLocal>
      /** The live hub sessions (a skill in the main checkout), by skill name. */
      hubs: TowerHubRow[]
      /** The linked worktrees whose branch has no ticket id (or a detached HEAD). */
      others?: TowerOtherWorktree[]
      /** The live free sessions (decision 055), in the order they were opened. */
      free?: TowerFreeRow[]
      /** A free Tower's folder branch for its header (decision 060); null outside git or detached, absent elsewhere. */
      branch?: string | null
      /** Decision 064: a free Tower in a git folder, its main checkout and whether its configuration is stored now. */
      setup?: { main: string; configured: boolean }
      /** Decision 070: the ticket worktrees hidden from the rail (`<state dir>/hidden-<project id>.json`), not in `rows`. */
      hidden?: TowerRailRow[]
    }
  | { kind: 'error'; message: string }

export type TowerHubRow = { key: string; state: 'working' | 'idle' }

/** A free session on the rail: its key, name (first prompt's first words, else the folder), branch or folder, state and since when. */
export type TowerFreeRow = { key: string; name: string; place: string; cwd: string; state: 'working' | 'idle' | 'waiting'; since: number; /** What it waits on, while `waiting`. */ wait?: 'permission' | 'question' }

export type TowerPullRequest =
  | {
      kind: 'pr'
      number: number
      state: 'draft' | 'open' | 'merged' | 'closed'
      checks: 'passing' | 'failing' | 'running' | 'none'
      headRefOid: string | null
      /** reviewVerdict: a clean self-review and passing checks on the head commit. */
      green: boolean
      /** `## Self-review (round N)` comments on the PR, and when the newest was posted (decision 025). */
      rounds?: number
      lastReviewAt?: string | null
      /** Decision 035: each check of the head, the merge state, the reviews and the dates (absent in an older read). */
      checkList?: { name: string; state: 'passing' | 'failing' | 'running'; detailsUrl: string | null; startedAt: string | null }[]
      mergeable?: string | null
      mergeStateStatus?: string | null
      reviewDecision?: string | null
      /** GitHub's reviews' states (APPROVED, CHANGES_REQUESTED, COMMENTED…), oldest first. */
      reviewStates?: string[]
      updatedAt?: string | null
      createdAt?: string | null
      baseRefName?: string | null
      /** The newest self-review's blockers: 0 for `_(none)_`, null without one. */
      reviewBlockers?: number | null
      /** Decision 055, without GitHub CI: the state file's checks (null: none recorded) and the last release tag. */
      recorded?: { sha: string; at: string | null; ran: string[] } | null
      release?: { pattern: string; tag: string | null; at: number | null; since: number | null }
      /** Decision 055: the review row's word when not `self-review` (oink: `review`). */
      reviewLabel?: string
      /** Decision 074: the PR's comments and GitHub reviews as the hand-post rule reads them (absent in an older read). */
      posts?: TowerReviewPost[]
    }
  | { kind: 'none' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }

/**
 * Decision 074: a comment (`createdAt`) or GitHub review (`submittedAt`) on the PR: its author's login (null: none),
 * whether it is a review comment (its first line the review heading and, with verdict patterns, a verdict line: decision 081),
 * how many review sections it holds, whether its body is empty.
 */
export type TowerReviewPost = { kind: 'comment' | 'review'; author: string | null; at: string; heading: boolean; sections: number; empty: boolean }

/** What the detail column loads by running gh and git, for the ticket it shows. */
export type TowerTicketRemote = { loadedAt: number; pullRequest: TowerPullRequest; behind: number | null }

/**
 * Decision 063: which configuration a session took at session.start, kept so a hot reload re-derives it: the edition's (decision 083), a free
 * Tower's, the project's stored file under `<state dir>/projects/` (named by its main checkout), or a design Tower's
 * (decision 064; `mainCheckout` its folder).
 */
export type TowerConfigChoice = { mode: 'edition' | 'free' | 'stored' | 'design'; mainCheckout: string | null }

/** Decision 062: the stage state file `.tower/design.json` as hooks/core/design.ts parses it (its DesignState). */
export type TowerDesignState = {
  version: number
  current: number
  stages: {
    n: number
    key: 'idea' | 'research' | 'product' | 'decisions' | 'architecture' | 'design' | 'plan' | 'setup'
    status: 'done' | 'active' | 'todo' | 'skipped'
    doc: string | null
    openQuestions: { id: string; text: string }[]
    resolvedQuestions: { id: string; text: string; answer: string | null }[]
    note: string | null
  }[]
}

/** Decision 064: a design Tower's stage state as last read (null: no file, or not readable) and which documents exist, by stage. */
export type TowerDesignView = { state: TowerDesignState | null; docs: Record<string, boolean> }

declare module 'claude-code' {
  interface PluginState {
    tower: {
      rail: TowerRailView
      /** The ticket whose session is in the centre pane, as tmux last reported it. */
      centre: string | null
      /** The ticket being opened; also the guard against a second press meanwhile. */
      opening: string | null
      /** The short cause of the last failed open, cleared by the next success. */
      openError: string | null
      status: TowerSessionStatus | null
      /** This session's pane found by its TOWER_TAG, when TMUX_PANE is missing. */
      taggedPane: string | null
      /** The ticket whose row Button last took the focus ring. */
      focused: string | null
      /** The pull request and behind-count by ticket, with when they were loaded. */
      remote: Record<string, TowerTicketRemote>
      /** Tickets whose remote data is being loaded now. */
      remoteLoading: string[]
      /** False once gh was found missing or signed out: never run again this session. */
      ghAvailable: boolean
      /** A ticket session's main loop and subagents, fed by the observing hooks. */
      deck: TowerDeck
      watchAgent: string | null
      watchLive: { text: string; dim: boolean }[]
      watchDraft: string
      watchSent: boolean
      docsList: { title: string; path: string; text: string; html: boolean }[]
      docsChosen: number
      bandKeys: boolean
      /** What the deck shows under its legend. */
      deckView: 'agents' | 'routing' | 'log' | 'watch' | 'docs' | 'settings' | 'aside'
      /** Agent durations in ms per agent type, mirrored from $.store. */
      durations: Record<string, number[]>
      /** The command names this session can run, from $.command.list(); the bus runs only these. */
      knownCommands: string[]
      /** The rail's commands, read when the skills launcher opens. */
      launcherCommands: { name: string; description: string; source: string; plugin?: string }[]
      /** The skills launcher's filter text. */
      skillsFilter: string
      /** What the rail pane draws: its list, or the skills launcher in the list's place. */
      railMode: 'list' | 'skills'
      /** This ticket's explain-as mode, mirrored from $.store. */
      explain: 'off' | 'ste' | 'diagram' | 'html' | 'video'
      /** This ticket session's own next step, or null. */
      ownNext: string | null
      bandNotice: string | null
      /** Decision 025: the ticket session's running review round and its review session's last word; the review session's own note. */
      reviewRun: { pr: number; round: number; startedAt: number; baseRounds: number; postedAt: number | null; body?: string; posting?: true; failed?: string; by?: 'tower'; verifying?: number } | null
      reviewPeer: { state: string; since: number; action: string; asks: string | null; waiting?: string | null; shown?: boolean; body?: string | null; posted?: boolean } | null
      /** The ticket's live review sessions' usage, merged into its deck (decision 025). */
      reviewUsage: { model: string | null; effort: string | null; ownCost: number | null; tokens: Record<string, number>; cost: number | null; spans: TowerSpan[]; requests: TowerRequest[]; working: boolean } | null
      reviewNote: { action: string; asks: string | null; shown: boolean; body: string | null; posted?: boolean }
      /** The launcher's candidates that belong to the repository (a skill or command file there). */
      repoCommands: string[] | null
      /** The rail's tmux pane height when the rail was last opened. */
      railHeight: number | null
      /** The last good Linear answer, ordered. */
      linearIssues: TowerIssue[]
      /** Decision 067: the rail's tickets read by identifier, closed ones too. */
      railIssues: TowerIssue[]
      /** The last Linear refresh's error text, null after a success. */
      linearError: string | null
      remoteSweeping: boolean
      boardTab: 'mine' | 'candidates'
      /** The board's detail column shows the settings view. */
      boardSettings: boolean
      boardNotice: string | null
      paneMode: 'board' | 'rail' | null
      boardFocus: string | null
      /** The board's filter typed in the rail's prompt box; '' shows every ticket. */
      boardFilter: string
      /** `q` asked to close tower: the ticket sessions working then; null when nothing is asked. */
      quitAsk: number | null
      /** Decision 068: `x` asking to close a session; decision 069: to remove a ticket not started, or to start a blocked one; decision 070: to hide a ticket; decision 071: to promote a batch with a ticket blocked outside it (`key`: the batch's ids, comma-separated). */
      closeAsk: { role: 'free' | 'hub' | 'ticket' | 'remove' | 'start' | 'hide' | 'promote'; key: string; name: string; question: string; note: string } | null
      /** Decision 071: the narrow rail's candidates view (`a`), its list or a candidate's detail (`l`); null when closed. */
      candidatesView: 'list' | 'detail' | null
      /** Decision 071: the candidates marked with `m`, promoted together by `↵`. */
      candidateMarks: string[]
      /** The ticket whose worktree is being made (decision 069; decision 071: one batch at a time). */
      promoting: string | null
      /** Decision 055: `+ new session` asks the folder: the choices (main checkout, the focused worktree); null when not asking. */
      newSession: { key: 'm' | 'w'; label: string; path: string }[] | null
      /** Decision 055: a free session's name, from its first prompt. */
      freeTitle: string | null
      /** Decision 063: the configuration this session took at session.start; null until then. */
      sessionConfig: TowerConfigChoice | null
      /** Decision 066: `/tower` placed Tower in this plain session (no TOWER_ROLE); `/tower off` clears it. */
      inPlace: boolean
      /** Decision 064: a design Tower's stage state and documents; `+ prototype` asking a name (its draft), null when not asking. */
      design: TowerDesignView
      prototypeAsk: string | null
      /** The attention events this session dismissed. */
      attentionDismissed: string[]
      /** The event this session's popup shows, and since when. */
      attentionShown: { id: string; since: number } | null
      progressAlert: TowerAlert | null
      /** Decision 045: the finished agents the deck folded, and whether `h` opened their history. */
      agentsFolded: number
      agentHistory: boolean
      microAsk: boolean
      asideDraft: string
      asideAnswer: { question: string; status: 'asking' | 'done' | 'failed'; text: string; line: string; at: number } | null
      pinChosen: string | null
      /** Decision 056: the routing view's chosen row (`free`, `skill:<name>`, `role:<name>`). */
      routeChosen: string | null
      boardAsk: { ticket: string; draft: string; sent: number | null } | null
      boardAnswers: Record<string, { question: string; status: 'asking' | 'done' | 'failed'; text: string; line: string; at: number }>
      /** The ticket's dev-env as last read from `.work/state.json`, and a start pressed in the deck. */
      devEnv: {
        env: TowerDevEnv | null
        answers: boolean
        startPressedAt: number | null
        hasSkill: boolean
        restartPending: boolean
      }
    }
  }
}

/** Decision 036: one pinned item: an open decision that needs the person, a todo, or a link the session created. */
export type TowerPin = { id: string; text: string; kind: 'decision' | 'todo' | 'link'; at: number; done: boolean; by: 'model' | 'person' | 'auto' }
