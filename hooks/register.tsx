import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunResult, Register, RenderChildren } from 'claude-code'

import type {
  TowerAgent,
  TowerConfigChoice,
  TowerDesignView,
  TowerSpan,
  TowerDeck,
  TowerLimits,
  TowerIssue,
  TowerPullRequest,
  TowerOtherWorktree,
  TowerRailRow,
  TowerRailView,
  TowerRole,
  TowerSessionState,
  TowerAlert,
  TowerSessionStatus,
  TowerTicketLocal,
  TowerTicketRemote,
} from '../types/index'
import {
  detailRow,
  formatAge,
  isStale,
  LIST_COLUMNS,
  PHASE_STEPS,
  parseBehind,
  parsePaneWidth,
  parsePullRequest,
  parsePullRequestList,
  prViewFields,
  phaseProgress,
  planExcerpt,
  titleFromBranch,
  truncateStart,
  WIDE_FROM_COLUMNS,
  type OwnChecks,
} from './core/detail'
import { isMuted, stateDir } from './core/stateDir'
import { freeAttentionRows, freeDetail, freeGlyph, freeHeader, freeLineParts, freeSessionRows, newSessionChoices, sessionTitle } from './core/freeSessions'
import { alertEvents, announcedKey, attentionEvents, chimes, dedupeEvents, parseAnnounced, parseQueue, pendingFor, popupTitle, POPUP_SHOWN_MS, pushEvent, queuedEvent, type AttentionRow, type QueuedEvent } from './core/attention'
import { centrePane, claudeCommand, claudeProjectDir, towerTag, hasEarlierSession, isWorkRole, PANE_LISTING_FORMAT, paneWithTag, parsePaneListing, planBack, planOpen, joinDirection, reviewPane, reviewTitle, resumesConversation, sessionSettings, skillCommand, ticketOpenStart } from './core/panes'
import type { OpenPlan, TmuxPane, WorkTarget } from './core/panes'
import { decodeCommand, encodeCommand, isAllowed } from './core/bus'
import { canRun, contextTicket, itemTail, launcherItems, launcherRows, otherCandidates, planLaunch, ticketStart, visibleItems } from './core/launcher'
import { asksLines, barSegments, blockedMeta, boardColumns, boardFigure, boardLists, candidateMark, candidateStatus, cutPlan, descriptionLines, fitItems, idWidth, issueMeta, linearLines, listWindow, modelsLine, wrapWords, railItems, rowCells, rowFigure, tokenCount, wrappedRows } from './core/board'
import { blockedText, railStatus, reviewTarget, rowStep, statusFlags, ticketStep } from './core/nextStep'
import { filterRows, parseRailInput, strayEdit } from './core/boardFilter'
import { chipsFit, EXPLAIN_CHIPS, EXPLAIN_MODES, EXPLAIN_SECTION, explainKey, explainMode, explainSection, ghostText, nextMode } from './core/explain'
import type { ExplainMode } from './core/explain'
import { keysFilter, LINEAR_ASSIGN_MUTATION, LINEAR_KEYS_QUERY, LINEAR_QUERY, LINEAR_URL, LINEAR_VIEWER_QUERY, linearAuth, parseAssigned, parseLinear, parseLinearAll, parseViewerId } from './core/linear'
import { githubBlockedArgs, githubIssueArgs, GH_USER_ARGS, issueKind, labelColour, labelTone, parseGhLogin, parseGithubBlocked, parseGithubIssues } from './core/github'
import { repoSections, rowFit } from './core/repoBoard'
import { buttonKeys, ringRests, ringRowOf } from './core/railRing'
import type { MineTicket, RailItem } from './core/board'
import { candidateStories, columnStories, columnsLayout, columnWindow, type ColumnWindow, HOME_COLUMNS, HOME_GAP, HOME_TWO_LINE_TITLE, homeCardRows, leadFamily, neighbourCard, progressBar, type HomeColumn } from './core/home'
import { detailRelations, fitRail, groupByStory, storyBlocks } from './core/stories'
import { blockedOutside, candidateIssues, priorityGlyph, promoteOrder, promoteTargets, pruneMarks, toggleMark } from './core/candidates'
import { hiddenPath, hiddenText, parseHidden, workText } from './core/hidden'
import type { StoryEntry } from './core/stories'
import type { LauncherItem, SkillStart } from './core/launcher'
import { estimateTotal, formatLeft, parseHistory, recordDuration } from './core/estimate'
import type { DurationHistory } from './core/estimate'
import {
  agentFolded,
  agentSections,
  cardOrder,
  cardRows,
  foldedCount,
  sessionRowsOf,
  EFFORT_PIPS,
  effortPips,
  fitCards,
  fitAction,
  formatClock,
  formatDuration,
  gaugeCells,
  formatTokens,
  deckRowsFit,
  advancedRowsFit,
  REQUEST_TABLE_ROWS,
  laneCells,
  laneLabel,
  logWindow,
  laneModels,
  progressFraction,
  tabsFit,
  tokenBar,
} from './core/deckView'
import {
  agentEnded,
  actionLine,
  shownInput,
  agentSpawned,
  deckBusy,
  gateChecked,
  safetyNoted,
  initialDeck,
  logged,
  logWho,
  promptLogged,
  toolCounted,
  toolLogged,
  markersRead,
  promptSubmitted,
  routeDecided,
  runningAgents,
  stepAgent,
  stepUnderWay,
  stepCompleted,
  stepProgress,
  toolFinished,
  toolStarted,
  turnCompleted,
  turnStarted,
  usageRead,
  waitingAsked,
  waitingDone,
  waitingEnded,
  waitingShown,
  workReceipt,
  usageLine,
  LIMIT_CELLS,
} from './core/deck'
import { agentFailed, agentMissed, agentResumed, callEnded, callStarted, deckAlert, formatShort, LONG_TOOL_MS, loopDetect, loopText, oldestInFlight, OVER_TYPICAL, reconcileAgents, stalledFor, stepClock, stepSeen, typicalText, waitsOn } from './core/progress'
import { demoAlert, demoDeck, demoDevEnv, demoDurations } from './core/demo'
import { reviewUsage as reviewUsageOf, mergedCost, mergedRequests, mergedTokens, recentRequests, reviewSuffix, ticketUsage, type ReviewUsage } from './core/deckMerge'
import { costText, familyRequests, logWithRequests, requestLogged, requestsByFamily, requestsOf, requestTotals, type StepUsage } from './core/requests'
import { COMPOSE_PS_FORMAT, envActions, envBoxRows, envPorts, envSkill, envSlot, envState, mergeEnv, parseComposePs, parseEnv, trimSlash } from './core/devEnv'
import type { ComposeStack, DevEnv } from './core/devEnv'
import { playgroundScene, type PlaygroundLine } from './core/playground'
import type { Profile } from './core/profile'
import { defaultsProfile, parseSkillFile, type RepoSkill } from './core/routingDefaults'
import { applyOverrides, cycleOverride, freeOverridesPath, freeStart, NO_OVERRIDES, overridesPath, parseOverrides, resetOverride, routeCells, routedStart, routeEfforts, routeValue, routingRows, type RouteCell, type RouteRow, type RoutingOverrides } from './core/routingOverrides'
import { cacheStale, catalogueOf, catalogueSource, effortFor, FALLBACK_CATALOGUE, findModel, modelIdOf, modelsPath, parseInitialize, parseModelCache, parseVersion, PROBE_ARGV, PROBE_INPUT, PROBE_TIMEOUT_MS, type Catalogue, type ModelCache } from './core/models'
import { agentCall, durationText, editCounts, groupDuration, groupLine, notificationLine, outputFirstLine, peerLine, rememberDuration, toolLine, turnLine } from './core/transcript'
import { replyBlocks, taskLine, type AlertKind } from './core/replyBlocks'
import { describeRoute, isRecorded, routeSpawn, routingMode } from './core/routing'
import type { RouteDecision } from './core/routing'
import { hubGlyph, hubMarker, railRow, rowGlyph, rowMarker, truncateEnd } from './core/rail'
import { footerText, hubSessionStates, isAlive, isRealWait, liveSessionId, newestTicketStatuses, nextStatus, ofTower, parseStatus, ticketLiveSessions, ticketWaitText, ticketRunningAgents, ticketSessionStates, ticketWaiting, withLivePanes } from './core/sessionStatus'
import { modelFamily, modelLabel, modelName, PALETTE_FILE, theme, themeChoice, THEME_NAMES, usePalette } from './core/theme'
import { checkEvents, checklistLines, fixCiPrompt, parseRecordedChecks, parseReleaseTags, PR_BOX_ITEMS, PR_BOX_ROWS, prBox, prCardLine, prVerdict, releaseGlob, waitsOnPerson, waitTone, type CheckSeen, type PrTone, type PrVerdict } from './core/prState'
import { REVIEW_BOX_ROWS, ago, cannotPost, elapsed, extractReviewBody, reviewAnswer, reviewBodyPath, reviewBox, reviewKeys as reviewBoxKeys, reviewNamedPath, reviewPostDecision, reviewRound, roundPosted, reviewSaveFolder, reviewSeen, reviewShown, reviewVerifyExpired, type ReviewPeer, type ReviewRun } from './core/reviewBox'
import { AWAY_DELAY_MS, AWAY_OFF, asksToPost, awayBadge, awayMoved, awayNext, awayNotice, awayOff, awayOn, awayStarts, awayToStart, parseAway, type Away } from './core/away'
import { blockChip, blockToast, FALLBACK_MODEL, fableBlocked, parseModelBlock, resolveModel, type ModelBlock } from './core/fallback'
import { MICRO_INSTRUCTIONS, isMicro, microCompact } from './core/microCompact'
import { WINDOW_MS, cacheCold, cacheText, cacheWarmth, earlyBlock, paceChip, paceText, windowPace } from './core/limits'
import { ATTENTION_MODULES, DEFAULT_SETTINGS, FABLE_CHOICES, FABLE_EARLY_CHOICES, MODULE_LABELS, REVIEW_POST_CHOICES, ASIDE_MODEL_CHOICES, PIN_NUDGE_CHOICES, SAFETY_CHOICES, MODULE_NAMES, parseSettings, sameSettings, SETTINGS_KEY, toggleModule, VIEW_LEVELS, type Settings } from './core/settings'
import type { Theme } from './core/theme'
import type { StatusIdentity, StatusLineFields } from './core/sessionStatus'
import { answerRows, applyPins, ASIDE_COMMAND, asideArgs, asideCompleteRequest, asideForkPrompt, asideUsageLine, createdLinks, parseAsideRecord, type AsideRecord, openDecisions, parsePinInput, PIN_NUDGE, PIN_SECTION, PIN_SECTION_ID, PIN_TOOL, PIN_TOOL_DESCRIPTION, PIN_TOOL_SCHEMA, pinReply, shouldNudge, shownPins, toolOutputText, type TowerPin } from './core/pins'
import { parseWorkDetail, parseWorkState } from './core/workState'
import { docEntries, liveLines, recentLines } from './core/docs'
import type { TowerDoc, LiveLine } from './core/docs'
import { credentialRead, maskSecrets, maskValue, mergeOnly, newSecretMap, restoreInput, riskOf, riskyText, type Risk, type RiskContext } from './core/safety'
import { branchOfFolder, folderName, gitError, newWorktree, otherWorktrees, parseWorktreePorcelain, repoName, ticketWorktrees, worktreeTicketId } from './core/worktrees'
import { configInputFrom, editionConfig, isDesignMode, isFreeMode, mainCheckoutFromListing, mainCheckoutOf, profileOf, renderTemplate, resolveConfig, storedConfigPath, ticketIdPattern, ticketInput, validateConfig, type GithubTickets, type RepoAction, type ResolvedConfig, type TowerConfig } from './core/config'
import { FREE_CONFIG } from './core/configs/free'
import { DESIGN_CONFIG } from './core/configs/design'
import { DESIGN_STATE_PATH, designPath, designTitle, parseDesignState } from './core/design'
import { DESIGN_SESSION_TAG, designDocuments, designQuestions, designRowTail, documentLines, documentPath, isDesignSession, prototypeFolder, STAGE_NAME_WIDTH, towerSkillStart, type TowerSkill } from './core/designMode'

// `$` may only be handed to functions declared in this file (`claude plugin
// validate` refuses it across an import), so every call on `$` lives here and
// hooks/core/ stays pure.

const PANE = 'tower'
const PANE_TITLE = 'tickets'
const HEARTBEAT_MS = 5_000
const RAIL_REFRESH_MS = 15_000
/** The rail's attention check, on the status files alone: a wait reaches the chime within seconds. */
const ATTENTION_CHECK_MS = 2_000
const RAIL_COLUMNS = 44
const LAYOUT_CHECK_MS = 3_000
const KEYS_CHECK_MS = 700
/**
 * The rows of the rail's tmux pane that are not the inline pane's body, in the main-screen layout:
 * the banner and its blank row (4), the pane's frame (2), a blank row, the prompt box (3), the status
 * line and the mode line (2). Measured at 220×55 and 160×45: one more row scrolls the banner off.
 */
const BELOW_RAIL_ROWS = 12
/** Decision 078: the rows the GitHub board's open issues keep under IN PROGRESS, their heading not counted. */
const REPO_ISSUES_MIN = 6
/** The theme option, for the sessions this one starts. */
let themeOption: unknown
/**
 * The configuration of the repository this session works in (decision 053): resolveConfig at session.start for a Tower
 * session (TOWER_ROLE); the edition's for any other, and when nothing resolves (bin/CCtower starts no session there),
 * the free one without an edition (decision 083). A hot reload starts this module over there: ensureSessionConfig takes
 * it back from `sessionConfig` (decision 063).
 */
let activeConfig: TowerConfig = fallbackChoice(null).config

/**
 * Decision 063: which configuration session.start took, in host state (it survives a hot reload, this module's
 * variables do not). A key, never the configuration: `stored` reads the project's file again.
 */
const sessionConfig = atom({ plugin: 'tower', key: 'sessionConfig' } as const, null as TowerConfigChoice | null)
/** This module instance holds its session's configuration: set by session.start, or by ensureSessionConfig after a reload. */
let configSettled = false
/** ensureSessionConfig under way: the hooks that arrive meanwhile wait on the same one. */
let configSettling: Promise<void> | null = null

function config(): TowerConfig {
  return activeConfig
}

/** A free Tower's session (decision 060: TOWER_MODE=free, a folder with no project): the free configuration. */
function freeTower(): boolean {
  return activeConfig === FREE_CONFIG
}

/** A design Tower's session (decision 064: TOWER_MODE=design, a New project folder): the design configuration. */
function designTower(): boolean {
  return activeConfig === DESIGN_CONFIG
}

/** A Tower with no project behind it, free or design: no tickets, no repository skills, the free routing file, no git required. */
function noProject(): boolean {
  return freeTower() || designTower()
}

/** The repository's own skills (`.claude/skills/<folder>/SKILL.md`), read at session.start for `routing: 'defaults'`. */
let repoSkills: RepoSkill[] = []

/**
 * The roles, skills, model ids, built-in routes and guidance of the session's configuration (config routing, profile.ts's
 * shape). `defaults` (decision 054): Tower's roles and the repository's own skills on the session's model, never
 * another configuration's skills.
 */
function tableProfile(): Profile {
  return profileOf(config()) ?? defaultsProfile(config(), repoSkills)
}

/**
 * The person's routing overrides (decision 056) as last read from `<state dir>/routing/<project>.json`: re-read when a
 * session starts or is launched, when the routing view opens and before each change, never kept for the process's life
 * (another session's deck may have written the file).
 */
let routingOverrides: RoutingOverrides = NO_OVERRIDES

/** The table with the person's overrides over it (decision 056): what every launch, the roles and the routing view read. */
function routingProfile(): Profile {
  return applyOverrides(tableProfile(), routingOverrides, catalogue)
}

/** The overrides file of this session's project; null without a state folder or a main checkout. */
async function routingOverridesFile($: EngineInterface): Promise<string | null> {
  const state = await towerState($)
  // Decision 060: every free Tower shares one file, whatever its folder; a design Tower too (decision 064).
  if (state !== null && noProject()) return freeOverridesPath(state)
  const main = mainCheckoutOf(config().project, (await $.env.get('TOWER_REPO')) ?? null, (await $.env.get('HOME')) ?? null)
  return state === null || main === null || main === '' ? null : overridesPath(state, main)
}

/** Reads the overrides file again (and the model catalogue's cache, decision 057); none when it is missing or unreadable. */
async function refreshRoutingOverrides($: EngineInterface): Promise<RoutingOverrides> {
  await readModelCache($)
  const path = await routingOverridesFile($)
  let raw: unknown
  try {
    raw = path === null ? undefined : JSON.parse(await $.fs.read(path))
  } catch {
    raw = undefined
  }
  routingOverrides = parseOverrides(raw, tableProfile())
  return routingOverrides
}

/** A change of the routing view: on the file as it is now, written whole through a temporary file and `mv` (`$.fs` has no rename). */
async function changeRoutingOverrides($: EngineInterface, change: (overrides: RoutingOverrides) => RoutingOverrides) {
  const next = change(await refreshRoutingOverrides($))
  routingOverrides = next
  const path = await routingOverridesFile($)
  if (path !== null) {
    const text = `${JSON.stringify(next, null, 2)}\n`
    const tmp = `${path}.${await $.session.id()}.tmp`
    await $.fs.write(tmp, text)
    const moved = await $.process.run(['mv', '-f', tmp, path], { timeoutMs: 5_000 }).then(result => result.exitCode === 0).catch(() => false)
    if (!moved) await $.fs.write(path, text)
  }
  $.ui.invalidate('ui.render')
}

// ── The model catalogue (decision 057): `/model`'s list, asked from Claude Code, cached in `<state dir>/models.json` ──

/** The cache as last read (null: none, or unreadable); `catalogue` what it holds, else the built-in list. */
let modelCache: ModelCache | null = null
let catalogue: Catalogue = FALLBACK_CATALOGUE
/** The probe under way in this process: one at a time (another Tower process may run its own; the file is written whole). */
let modelsProbe: Promise<void> | null = null

/** Reads `<state dir>/models.json` again; a missing or unreadable file leaves the built-in list. */
async function readModelCache($: EngineInterface): Promise<void> {
  const state = await towerState($).catch(() => null)
  let raw: unknown
  try {
    raw = state === null ? undefined : JSON.parse(await $.fs.read(modelsPath(state)))
  } catch {
    raw = undefined
  }
  modelCache = parseModelCache(raw)
  catalogue = catalogueOf(modelCache)
}

/** What Fable falls back to while blocked: the catalogue's `opus`, else Opus 5.5. */
function fableFallback(): string {
  return findModel(catalogue, 'opus')?.id ?? FALLBACK_MODEL
}

/**
 * Asks Claude Code for its `/model` list in the background when the cache is missing, older than 24 h or (with
 * `checkVersion`) written by another version than `claude --version`'s; never blocks, never throws. The answer is
 * written through a temporary file and `mv`; a failure keeps the old cache (or the built-in list).
 */
function refreshModels($: EngineInterface, checkVersion: boolean): void {
  if (modelsProbe !== null) return
  modelsProbe = (async () => {
    const state = await towerState($)
    if (state === null) return
    await readModelCache($)
    const now = await $.clock.now()
    if (!cacheStale(modelCache, now, null)) {
      if (!checkVersion) return
      const version = await $.process.run(['claude', '--version'], { timeoutMs: 10_000 }).then(result => (result.exitCode === 0 ? parseVersion(result.stdout) : null), () => null)
      if (!cacheStale(modelCache, now, version)) return
    }
    $.ui.invalidate('ui.render')
    // Print mode answers the `initialize` request on stdin (closed after it) without calling a model, then exits.
    const result = await $.process.run(PROBE_ARGV, { cwd: state, stdin: PROBE_INPUT, env: { TOWER_ROLE: '' }, timeoutMs: PROBE_TIMEOUT_MS })
    const answer = parseInitialize(result.stdout)
    const next = answer === null ? null : parseModelCache({ claudeCodeVersion: answer.version, fetchedAt: await $.clock.now(), models: answer.models })
    if (next === null) return
    const path = modelsPath(state)
    const text = `${JSON.stringify(next, null, 2)}\n`
    const tmp = `${path}.${await $.session.id()}.tmp`
    await $.fs.write(tmp, text)
    const moved = await $.process.run(['mv', '-f', tmp, path], { timeoutMs: 5_000 }).then(result => result.exitCode === 0).catch(() => false)
    if (!moved) await $.fs.write(path, text)
    modelCache = next
    catalogue = catalogueOf(next)
  })()
    .catch(() => {})
    .finally(() => {
      modelsProbe = null
      $.ui.invalidate('ui.render')
    })
}

/**
 * A launch's `--model` and `--effort` (decision 057): the model as its full id (`opus` → `claude-opus-5-5`), Opus in
 * Fable's place while Fable is blocked, the effort clamped to what that model takes (none when it takes none).
 */
function launchFlags(model: string | null, effort: string | null, now: number): { model: string | null; effort: string | null } {
  const id = model === null ? null : modelIdOf(model, tableProfile().modelIds, catalogue)
  const resolved = resolveModel(id, fableBlock(), now, fableFallback())
  return { model: resolved, effort: effortFor(resolved, effort, catalogue) }
}

/** `/start-ticket`: the workflow's start step as the board names it. */
function startName(): string {
  const start = config().workflow.steps.start
  return start !== undefined ? `/${start.skill}` : 'the start step'
}

/** `/review <n>`: the review module's command for a pull request. */
function reviewCommand(pr: number): string {
  const { skill, args } = config().review
  const rendered = renderTemplate(args, { pr: String(pr) })
  return rendered === '' ? `/${skill}` : `/${skill} ${rendered}`
}
/** The board's side column. */
const SIDE_COLUMNS = 44
/** Under this, the detail stacks its side panels under the main ones. */
const DETAIL_TWO_COLUMNS_FROM = 90
const DECK_PANE = 'deck'
const DECK_COLUMNS = 66
/** The agent watch and the docs viewer: deck views (a second pane is only a background tab), each with `x: close`. */
const WATCH_REFRESH_MS = 2_000
const DOCS_REFRESH_MS = 20_000
const USAGE_REFRESH_MS = 60_000
const DURATIONS_KEY = 'durations'

const railView = atom({ plugin: 'tower', key: 'rail' } as const, { kind: 'loading' } as TowerRailView)
const centreTicket = atom({ plugin: 'tower', key: 'centre' } as const, null as string | null)
/** The attention events this session dismissed (x, g, or shown for POPUP_SHOWN_MS). */
const attentionDismissed = atom({ plugin: 'tower', key: 'attentionDismissed' } as const, [] as string[])
/** The event this session's popup shows, and since when. */
const attentionShown = atom({ plugin: 'tower', key: 'attentionShown' } as const, null as { id: string; since: number } | null)
const openingTicket = atom({ plugin: 'tower', key: 'opening' } as const, null as string | null)
const openError = atom({ plugin: 'tower', key: 'openError' } as const, null as string | null)
/** The deck's stall or loop as last checked (decision 033): the pane redraws when it changes. */
const progressAlert = atom({ plugin: 'tower', key: 'progressAlert' } as const, null as TowerAlert | null)
/** Decision 045: how many finished agents the deck folded (the pane redraws when one folds), and `h` opening them all. */
const agentsFolded = atom({ plugin: 'tower', key: 'agentsFolded' } as const, 0)
const agentHistory = atom({ plugin: 'tower', key: 'agentHistory' } as const, false)
const ownStatus = atom({ plugin: 'tower', key: 'status' } as const, null as TowerSessionStatus | null)
const focusedTicket = atom({ plugin: 'tower', key: 'focused' } as const, null as string | null)
const remoteDetails = atom({ plugin: 'tower', key: 'remote' } as const, {} as Record<string, TowerTicketRemote>)
const remoteSweeping = atom({ plugin: 'tower', key: 'remoteSweeping' } as const, false)
const boardTab = atom({ plugin: 'tower', key: 'boardTab' } as const, 'mine' as 'mine' | 'candidates')
const boardNotice = atom({ plugin: 'tower', key: 'boardNotice' } as const, null as string | null)
/** The board's filter, typed in the rail's prompt box (decision 026); '' shows every ticket. */
const boardFilter = atom({ plugin: 'tower', key: 'boardFilter' } as const, '')
/** `q` asked to close tower: the ticket sessions working then; null when nothing is asked. */
const quitAsk = atom({ plugin: 'tower', key: 'quitAsk' } as const, null as number | null)
/** Decision 068: `x` asked to close a session (a free one, a hub's, a ticket's), its question and the note beside y/n. */
const closeAsk = atom({ plugin: 'tower', key: 'closeAsk' } as const, null as CloseAsk | null)
/** Decision 071: the narrow rail's candidates view (`a`: its list, `l`: a candidate's detail), the marks (`m`), the ticket whose worktree is being made. */
const candidatesView = atom({ plugin: 'tower', key: 'candidatesView' } as const, null as 'list' | 'detail' | null)
const candidateMarks = atom({ plugin: 'tower', key: 'candidateMarks' } as const, [] as string[])
const promoting = atom({ plugin: 'tower', key: 'promoting' } as const, null as string | null)
const boardFocus = atom({ plugin: 'tower', key: 'boardFocus' } as const, null as string | null)
const paneMode = atom({ plugin: 'tower', key: 'paneMode' } as const, null as 'board' | 'rail' | null)
const deckState = atom({ plugin: 'tower', key: 'deck' } as const, initialDeck())
/** The ticket's dev-env as last read: the state file's `env`, whether its URL answers, a start pressed here, and the repo's skill. */
const devEnv = atom({ plugin: 'tower', key: 'devEnv' } as const, {
  env: null as DevEnv | null, answers: false, startPressedAt: null as number | null, hasSkill: true, restartPending: false,
})
const watchAgent = atom({ plugin: 'tower', key: 'watchAgent' } as const, null as string | null)
const watchLive = atom({ plugin: 'tower', key: 'watchLive' } as const, [] as LiveLine[])
const watchDraft = atom({ plugin: 'tower', key: 'watchDraft' } as const, '')
const watchSent = atom({ plugin: 'tower', key: 'watchSent' } as const, false)
const docsList = atom({ plugin: 'tower', key: 'docsList' } as const, [] as TowerDoc[])
const docsChosen = atom({ plugin: 'tower', key: 'docsChosen' } as const, 0)
/** True from Alt+Up's ctrl+x tab until the keys go back: the band holds them (no engine flag says so). */
const bandKeys = atom({ plugin: 'tower', key: 'bandKeys' } as const, false)
// The element the deck's focus ring is on (`agent:<id>`, `doc:<n>`, …), for `w` and the docs list.
let deckRing: string | null = null
/** Decision 034: the deck's `compact micro` waits on its yes. */
const microAsk = atom({ plugin: 'tower', key: 'microAsk' } as const, false as boolean)
const deckView = atom({ plugin: 'tower', key: 'deckView' } as const, 'agents' as 'agents' | 'routing' | 'log' | 'watch' | 'docs' | 'settings' | 'aside')
// Decision 036: the deck's aside (its draft and last answer), the PINNED box's chosen pin, the board's ask.
const asideDraft = atom({ plugin: 'tower', key: 'asideDraft' } as const, '')
const asideAnswer = atom({ plugin: 'tower', key: 'asideAnswer' } as const, null as AsideRecord | null)
const pinChosen = atom({ plugin: 'tower', key: 'pinChosen' } as const, null as string | null)
/** The routing view's chosen row (decision 056): `free`, `skill:<name>` or `role:<name>`; null: the first. */
const routeChosen = atom({ plugin: 'tower', key: 'routeChosen' } as const, null as string | null)
const boardAsk = atom({ plugin: 'tower', key: 'boardAsk' } as const, null as { ticket: string; draft: string; sent: number | null } | null)
const boardAnswers = atom({ plugin: 'tower', key: 'boardAnswers' } as const, {} as Record<string, AsideRecord>)
/** Decision 036: a decision pinned in the main loop's current turn (the nudge leaves such a turn alone). */
let pinnedThisTurn = false
const PINNED_MAX = 6
/** Decision 064: the open questions the design deck lists before `+n more`. */
const QUESTIONS_MAX = 5
const boardSettings = atom({ plugin: 'tower', key: 'boardSettings' } as const, false)
const durations = atom({ plugin: 'tower', key: 'durations' } as const, {} as DurationHistory)
const taggedPane = atom({ plugin: 'tower', key: 'taggedPane' } as const, null as string | null)
const knownCommands = atom({ plugin: 'tower', key: 'knownCommands' } as const, [] as string[])
const launcherCommands = atom({ plugin: 'tower', key: 'launcherCommands' } as const, [] as TowerListedCommand[])
const skillsFilter = atom({ plugin: 'tower', key: 'skillsFilter' } as const, '')
const repoCommands = atom({ plugin: 'tower', key: 'repoCommands' } as const, null as string[] | null)
const railHeight = atom({ plugin: 'tower', key: 'railHeight' } as const, null as number | null)
const railMode = atom({ plugin: 'tower', key: 'railMode' } as const, 'list' as 'list' | 'skills')
const linearIssues = atom({ plugin: 'tower', key: 'linearIssues' } as const, [] as TowerIssue[])
/** Decision 067: the rail's tickets the candidates' query left out, read by identifier (closed ones too), for their stories. */
const railIssues = atom({ plugin: 'tower', key: 'railIssues' } as const, [] as TowerIssue[])
const linearError = atom({ plugin: 'tower', key: 'linearError' } as const, null as string | null)
const explainState = atom({ plugin: 'tower', key: 'explain' } as const, 'off' as ExplainMode)
const ownNext = atom({ plugin: 'tower', key: 'ownNext' } as const, null as string | null)
const bandNotice = atom({ plugin: 'tower', key: 'bandNotice' } as const, null as string | null)
/** The ticket session: the review it started (decision 025) and what its review session last said. */
const reviewRun = atom({ plugin: 'tower', key: 'reviewRun' } as const, null as ReviewRun | null)
const reviewPeer = atom({ plugin: 'tower', key: 'reviewPeer' } as const, null as ReviewPeer | null)
/** The ticket's live review sessions' usage, merged into its deck (decision 025). */
const reviewUsage = atom({ plugin: 'tower', key: 'reviewUsage' } as const, null as ReviewUsage | null)
/** The review session: its last action and its last answer (the review shown, the file it is saved in), for its status file. */
const reviewNote = atom({ plugin: 'tower', key: 'reviewNote' } as const, { action: '', asks: null as string | null, shown: false, body: null as string | null, posted: false as boolean })
/** Decision 055: the rail's `+ new session` asking the folder (its choices), and a free session's name from its first prompt. */
const newSessionAsk = atom({ plugin: 'tower', key: 'newSession' } as const, null as { key: 'm' | 'w'; label: string; path: string }[] | null)
const freeTitle = atom({ plugin: 'tower', key: 'freeTitle' } as const, null as string | null)
/** Decision 064: a design Tower's stage state and which documents exist; `+ prototype` asking a name (its draft). */
const designView = atom({ plugin: 'tower', key: 'design' } as const, { state: null, docs: {} } as TowerDesignView)
const prototypeAsk = atom({ plugin: 'tower', key: 'prototypeAsk' } as const, null as string | null)

type TowerListedCommand = { name: string; description: string; source: string; plugin?: string }

/**
 * Decision 068: the session `x` asks to close: its role and key (as its pane's `@tower_role` and `@tower_ticket`).
 * Decision 069: `remove`, a ticket not started leaving the rail (its worktree and branch deleted); `start`, a blocked one started anyway.
 * Decision 070: `hide`, a ticket leaving the rail with its worktree kept (its key in the hidden list).
 */
type CloseAsk = { role: 'free' | 'hub' | 'ticket' | 'remove' | 'start' | 'hide' | 'promote'; key: string; name: string; question: string; note: string }

/** A work session to show or start: a ticket's in its worktree, or a hub's in the main checkout. */
type WorkSession = WorkTarget & { cwd: string; start: SkillStart | null; /** Started by away mode: no `/start-ticket`, parked. */ away?: true }

type Context = {
  role: TowerRole
  repo: string | null
  ticket: string | null
  pane: string | null
  home: string | null
  /** Tower's own folder: TOWER_STATE_DIR, else ~/.claude/tower (see core/stateDir). */
  state: string | null
  pluginDir: string | null
}

// ── Context ───────────────────────────────────────────────────────────────

function parseRole(value: string | undefined): TowerRole | null {
  return value === 'rail' || value === 'ticket' || value === 'hub' || value === 'review' || value === 'free' ? value : null
}

/**
 * Decision 066: `/tower` in a plain session (no TOWER_ROLE: not launched by bin/CCtower) placed Tower in it, a free session
 * in place; `/tower off` takes it out. In host state, so a hot reload keeps it; `inPlaceOn` is this module instance's copy.
 */
const inPlace = atom({ plugin: 'tower', key: 'inPlace' } as const, false as boolean)
let inPlaceOn = false

/** The session's role: TOWER_ROLE, else `free` while Tower is placed in it (decision 066), else null: the mod stays inert. */
async function sessionRole($: EngineInterface): Promise<TowerRole | null> {
  return parseRole(await $.env.get('TOWER_ROLE')) ?? (inPlaceOn ? 'free' : null)
}

/** Tower acts in this session: launched by bin/CCtower, or placed by `/tower` (decision 066). */
async function towerOn($: EngineInterface): Promise<boolean> {
  return (await sessionRole($)) !== null
}

/** The timers Tower started in this session, so `/tower off` can stop them (decision 066). */
const timers: { cancel: () => void }[] = []

/** `$.clock.every`, its timer kept for `/tower off`. */
function every($: EngineInterface, ms: number, fn: () => void) {
  timers.push($.clock.every(ms, fn))
}

/** Null when this session is not part of an tower workspace: the mod then does nothing. */
async function readContext($: EngineInterface): Promise<Context | null> {
  const role = await sessionRole($)
  if (role === null) return null
  // Decision 066: a session `/tower` placed Tower in: a free session of no Tower, no tmux, no status file, no plugin dir to launch with.
  if (parseRole(await $.env.get('TOWER_ROLE')) === null) {
    return { role, repo: null, ticket: null, pane: null, home: (await $.env.get('HOME')) ?? null, state: null, pluginDir: null }
  }

  const home = (await $.env.get('HOME')) ?? null
  return {
    role,
    repo: mainCheckoutOf(config().project, (await $.env.get('TOWER_REPO')) ?? null, home),
    ticket: (await $.env.get('TOWER_TICKET')) ?? null,
    pane: (await $.env.get('TMUX_PANE')) || (await paneOfTag($)),
    home,
    state: await towerState($),
    pluginDir: (await $.env.get('TOWER_PLUGIN_DIR')) ?? null,
  }
}

/** TMUX_PANE can be missing from the session: the pane whose `@tower_tag` is our TOWER_TAG, looked up once. */
async function paneOfTag($: EngineInterface): Promise<string | null> {
  const known = await read($, taggedPane)
  if (known !== null) return known
  const tag = await $.env.get('TOWER_TAG')
  if (!tag) return null
  let pane: string | null
  try {
    pane = paneWithTag(parsePaneListing(await tmux($, ['list-panes', '-a', '-F', PANE_LISTING_FORMAT])), tag)
  } catch {
    return null
  }
  // A render may not write state; session.start, the first to ask, keeps it.
  if (pane !== null) await update($, taggedPane, () => pane).catch(() => {})
  return pane
}

/**
 * The session's configuration (decision 053): its folder's main checkout (`git worktree list --porcelain`), origin
 * (`git remote get-url origin`), TOWER_REPO and the stored `<state dir>/projects/<id>.json`, through resolveConfig.
 */
async function resolveSessionConfig($: EngineInterface): Promise<(ResolvedConfig & { mainCheckout: string }) | null> {
  const cwd = await $.session.cwd()
  const gitOut = async (args: string[]): Promise<string | null> => {
    try {
      const result = await $.process.run(['git', ...args], { cwd, timeoutMs: 5_000 })
      return result.exitCode === 0 ? result.stdout : null
    } catch {
      return null
    }
  }
  const listing = await gitOut(['worktree', 'list', '--porcelain'])
  const main = mainCheckoutFromListing(listing)
  if (main === null) return null
  const state = await towerState($)
  const text = state === null ? undefined : await $.fs.read(storedConfigPath(state, main)).catch(() => undefined)
  const input = configInputFrom({
    listing,
    originUrl: await gitOut(['remote', 'get-url', 'origin']),
    towerRepo: (await $.env.get('TOWER_REPO')) || null,
    storedText: typeof text === 'string' ? text : undefined,
  })
  const resolved = input === null ? null : resolveConfig(input)
  return resolved === null ? null : { ...resolved, mainCheckout: main }
}

/**
 * Decision 083: what a session takes where nothing else decides: the edition's configuration, else (a tree without an
 * edition) the free one.
 */
function fallbackChoice(mainCheckout: string | null): { config: TowerConfig; choice: TowerConfigChoice } {
  const edition = editionConfig()
  return edition !== null ? { config: edition, choice: { mode: 'edition', mainCheckout } } : { config: FREE_CONFIG, choice: { mode: 'free', mainCheckout: null } }
}

/**
 * The session's configuration and the key that names it: the fallback outside Tower (no TOWER_ROLE); a free Tower's from
 * TOWER_MODE, never from its folder (decision 060); else its folder's through resolveSessionConfig, the fallback when
 * nothing resolves (fallbackChoice: the edition's, else free).
 */
async function sessionChoice($: EngineInterface): Promise<{ config: TowerConfig; choice: TowerConfigChoice }> {
  if (parseRole(await $.env.get('TOWER_ROLE')) === null) {
    // Decision 066: a plain session takes the free configuration while Tower is placed in it; the fallback is inert there.
    return inPlaceOn ? { config: FREE_CONFIG, choice: { mode: 'free', mainCheckout: null } } : fallbackChoice(null)
  }
  const towerMode = await $.env.get('TOWER_MODE')
  if (isFreeMode(towerMode)) return { config: FREE_CONFIG, choice: { mode: 'free', mainCheckout: null } }
  // Decision 064: the launcher chose design mode (no stored configuration, a design state file); handed on as free is.
  if (isDesignMode(towerMode)) return { config: DESIGN_CONFIG, choice: { mode: 'design', mainCheckout: (await $.env.get('TOWER_REPO')) || null } }
  const resolved = await resolveSessionConfig($).catch(() => null)
  if (resolved !== null && resolved.source === 'stored') return { config: resolved.config, choice: { mode: 'stored', mainCheckout: resolved.mainCheckout } }
  // No mode handed on and no configuration: a design state file whose stage 8 is not done is a design Tower, as bin/CCtower resolves it.
  const folder = (await $.env.get('TOWER_REPO')) || null
  if (resolved === null && folder !== null && (await designOpen($, folder))) return { config: DESIGN_CONFIG, choice: { mode: 'design', mainCheckout: folder } }
  return fallbackChoice(resolved?.mainCheckout ?? null)
}

/** Decision 064: `folder` holds a design state file whose stage 8 (setup) is not done. */
async function designOpen($: EngineInterface, folder: string): Promise<boolean> {
  const state = parseDesignState(await readTextFile($, `${folder.replace(/\/+$/, '')}/${DESIGN_STATE_PATH}`))
  return state !== null && state.stages.find(stage => stage.n === 8)?.status !== 'done'
}

/** The configuration a kept key names (decision 063); null when the stored file is gone or no longer validates. */
async function configOfChoice($: EngineInterface, choice: TowerConfigChoice): Promise<TowerConfig | null> {
  if (choice.mode === 'edition') return editionConfig()
  if (choice.mode === 'free') return FREE_CONFIG
  if (choice.mode === 'design') return DESIGN_CONFIG
  const state = await towerState($)
  if (state === null || choice.mainCheckout === null) return null
  let raw: unknown
  try {
    raw = JSON.parse(await $.fs.read(storedConfigPath(state, choice.mainCheckout)))
  } catch {
    return null
  }
  const result = validateConfig(raw)
  return result.ok ? result.config : null
}

/**
 * Decision 063: this module instance's configuration, before a hook reads config(). session.start sets it; after a hot
 * reload, a hook that runs before the new instance's session.start has resolved it (a draw, a prompt; the old
 * instance's clocks are cancelled) takes it from the kept key, else resolves it as session.start does. Once per module
 * instance; never writes host state (a draw may not). With it, what session.start derived: the repository's skills, the
 * routing overrides and the model catalogue, the settings (the theme each draw reads).
 */
async function ensureSessionConfig($: EngineInterface): Promise<void> {
  if (configSettled) return
  configSettling ??= settleSessionConfig($).finally(() => {
    configSettling = null
  })
  await configSettling
}

async function settleSessionConfig($: EngineInterface): Promise<void> {
  try {
    // Decision 066: after a hot reload, a session Tower was placed in is placed again before anything reads its role.
    if (parseRole(await $.env.get('TOWER_ROLE')) === null) inPlaceOn = (await read($, inPlace).catch(() => false)) === true
    const kept = await read($, sessionConfig).catch(() => null)
    const taken = (kept !== null ? await configOfChoice($, kept).catch(() => null) : null) ?? (await sessionChoice($)).config
    // session.start settled it meanwhile: its own is the newer.
    if (configSettled) return
    activeConfig = taken
    configSettled = true
    // Decision 066: a plain session reads nothing of Tower's.
    if ((await sessionRole($)) === null) return
    towerSettings = parseSettings(await readShared($, SETTINGS_FILE))
    const repo = mainCheckoutOf(config().project, (await $.env.get('TOWER_REPO')) ?? null, (await $.env.get('HOME')) ?? null)
    repoSkills = config().routing === 'defaults' && repo !== null && !noProject() ? await readRepoSkills($, repo) : []
    await refreshRoutingOverrides($)
  } catch {
    configSettled = true
  }
}

/** The skills of the main checkout's `.claude/skills/<folder>/SKILL.md` files; none when the folder is missing. */
async function readRepoSkills($: EngineInterface, repo: string): Promise<RepoSkill[]> {
  const folder = `${repo.replace(/\/+$/, '')}/.claude/skills`
  const entries = await $.fs.list(folder).catch(() => [])
  const skills: RepoSkill[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    const text = await $.fs.read(`${folder}/${entry.name}/SKILL.md`).catch(() => undefined)
    const skill = typeof text === 'string' ? parseSkillFile(text, entry.name) : null
    if (skill !== null) skills.push(skill)
  }
  return skills
}

/** Tower's own folder for this session (TOWER_STATE_DIR, else ~/.claude/tower); null without HOME. */
async function towerState($: EngineInterface): Promise<string | null> {
  return stateDir(await $.env.get('HOME'), await $.env.get('TOWER_STATE_DIR'))
}

function sessionsDir(state: string): string {
  return `${state}/sessions`
}

// ── Shared files: what every session must see, in Tower's folder (`$.store` is cached per process) ──

/** The attention queue of a repository: `attention-<repo, its / and other marks as _>.json`. */
function attentionFile(repo: string | null): string {
  return `attention-${(repo ?? '').replace(/[^A-Za-z0-9._-]/g, '_')}.json`
}

/** A shared file's JSON value; undefined when it is missing, unreadable or half written. */
async function readShared($: EngineInterface, name: string): Promise<unknown> {
  const state = await towerState($)
  if (state === null) return undefined
  try {
    return JSON.parse(await $.fs.read(`${state}/${name}`))
  } catch {
    return undefined
  }
}

/** Writes a shared file whole (small JSON); `$.fs` has no rename, a reader that meets a half file reads it at the next tick. */
async function writeShared($: EngineInterface, name: string, value: unknown) {
  const state = await towerState($)
  if (state === null) return
  await $.fs.write(`${state}/${name}`, JSON.stringify(value))
}

// ── Session status file ───────────────────────────────────────────────────

async function writeStatus($: EngineInterface, context: Context, state: TowerSessionState) {
  if (context.state === null) return
  const identity: StatusIdentity = {
    id: await $.session.id(),
    role: context.role,
    ticket: context.ticket,
    cwd: await $.session.cwd(),
    pane: context.pane,
  }
  let shown = state
  let agents: TowerSessionStatus['agents']
  let line: StatusLineFields | undefined
  let flags: ReturnType<typeof statusFlags> = {}
  let work: Pick<TowerSessionStatus, 'agent' | 'tokens' | 'cost' | 'requests' | 'spans' | 'recentRequests' | 'waiting' | 'alert' | 'lastRequestAt' | 'limits' | 'pins'> = {}
  let waiting = false
  let ownNextStep: { next?: string | null } = {}
  const now = await $.clock.now()
  // A review session collects a deck for its data alone: the ticket's deck merges it (decision 025).
  if (isWorkRole(context.role) || context.role === 'review') {
    const deck = await read($, deckState)
    agents = { running: runningAgents(deck), total: deck.agents.length }
    if (state === 'idle' && agents.running > 0) shown = 'working'
    const history = (await isDemo($)) ? demoDurations() : await read($, durations)
    const running = deck.agents.filter(agent => agent.status === 'running').map(agent => {
      const estimate = estimateTotal(history, agent.type)
      return { name: agent.name, leftMs: estimate === null ? null : estimate - (now - agent.startedAt) }
    })
    work = { agent: stepAgent(deck), tokens: deck.tokens, cost: deck.usage.cost, ...((deck.requests ?? []).length > 0 ? { requests: familyRequests(deck.requests ?? []) } : {}) }
    // Decision 034: the board's cold-cache mark and its pace chip read these.
    if (deck.cache !== undefined) work = { ...work, lastRequestAt: deck.cache.lastRequestAt }
    if (deck.usage.limits !== undefined) work = { ...work, limits: deck.usage.limits }
    line = { model: deck.main.model, effort: deck.main.effort, footer: footerText(shown === 'working', running) }
    if (context.role === 'review') work = { ...work, spans: deck.main.spans ?? [], recentRequests: recentRequests(deck.requests ?? []) }
    // A permission dialog or a question: the rail, the ticket's REVIEW box and the status line show it.
    // The file always carries the wait with its start; it counts as `needs you` once it lasted (an auto-mode ask resolves in seconds).
    const pending = deck.waiting ?? null
    if (pending !== null) work = { ...work, waiting: pending }
    const alert = deckAlert(deck, now, towerSettings.modules)
    if (alert !== null) work = { ...work, alert }
    const openPins = shownPins(deck.pins ?? [])
    if (openPins.length > 0) work = { ...work, pins: openPins }
    if (isRealWait(pending, now)) waiting = true
    if (isWorkRole(context.role) && context.role !== 'free' && context.ticket !== null) {
      const step = await ownStep($, context.ticket, identity.cwd, shown === 'working')
      flags = statusFlags(step)
      // The chips row shows the step that follows the work under way, as it will read once idle.
      const idle = shown === 'working' ? await ownStep($, context.ticket, identity.cwd, false) : step
      ownNextStep = { next: idle.next }
      if (idle.next !== (await read($, ownNext))) {
        await update($, ownNext, () => idle.next)
        // The step moved on outside this session's turns (the review session posted): the ghost follows.
        const text = context.role === 'ticket' && shown === 'idle' ? ghostText({ next: idle.next }, '', config().workflow) : null
        if (text !== null) await $.prompt.suggest({ text }).catch(() => {})
      }
    }
  }
  if (waiting) flags = { ...flags, needsYou: true }
  const previous = await read($, ownStatus)
  const tag = (await $.env.get('TOWER_TAG')) || null
  // Decision 059: the Tower's socket, so another Tower's rail leaves the record alone.
  const socket = await tmuxSocket($)
  const review = context.role === 'review' ? { review: await read($, reviewNote) } : {}
  // Decision 074: the running round posted; the rail stops counting the review session's wait from before it.
  const run = context.role === 'ticket' ? await read($, reviewRun) : null
  const reviewDone = run !== null && run.postedAt !== null ? { reviewPosted: { round: run.round, at: run.postedAt } } : {}
  // Decision 055: a free session's name, once its first prompt gave one.
  const title = context.role === 'free' ? ((await read($, freeTitle)) ?? previous?.title ?? null) : null
  const status = { ...nextStatus(previous, identity, shown, now, agents, line), ...flags, ...ownNextStep, ...work, ...review, ...reviewDone, ...(title !== null ? { title } : {}), ...(tag !== null ? { tag } : {}), ...(socket !== null ? { socket } : {}), ...(awayState.on && context.role !== 'rail' ? { away: true as const } : {}) }
  await update($, ownStatus, () => status)
  try {
    await $.fs.write(`${sessionsDir(context.state)}/${status.id}.json`, JSON.stringify(status))
  } catch {
    // The next heartbeat tries again.
  }
}

/** The ticket session's own step: its state file, and its pull request loaded at most once a minute. */
async function ownStep($: EngineInterface, ticket: string, cwd: string, working: boolean) {
  const work = parseWorkState(await readStateFile($, cwd), config().phases)
  const cached = (await read($, remoteDetails))[ticket]
  let pullRequest = cached?.pullRequest ?? null
  if ((cached === undefined || isStale(cached.loadedAt, await $.clock.now())) && !remoteInFlight.has(ticket)) {
    remoteInFlight.add(ticket)
    try {
      pullRequest = await readPullRequest($, cwd)
      const loaded: TowerTicketRemote = { loadedAt: await $.clock.now(), pullRequest, behind: cached?.behind ?? null }
      await update($, remoteDetails, all => ({ ...all, [ticket]: loaded }))
    } finally {
      remoteInFlight.delete(ticket)
    }
  }
  return ticketStep({
    ticket,
    work: work.phase === 'not started' ? null : work,
    pullRequest,
    session: { working, agent: null },
    green: pullRequest?.kind === 'pr' && pullRequest.green,
  }, config().workflow)
}

/** Rewrites the current state, which refreshes `updatedAt` and keeps `since`. */
async function heartbeat($: EngineInterface, context: Context) {
  // Wrap-up removed the worktree under this session: no reads in a folder that is gone; the rail closes the pane.
  if (isWorkRole(context.role) && !(await $.fs.exists(await $.session.cwd()).catch(() => true))) return
  const working = isWorkRole(context.role) ? deckBusy(await read($, deckState)) : (await read($, ownStatus))?.state === 'working'
  await writeStatus($, context, working ? 'working' : 'idle')
}

async function readStatuses($: EngineInterface, state: string): Promise<TowerSessionStatus[]> {
  let names: string[]
  try {
    const entries = await $.fs.list(sessionsDir(state))
    names = entries.filter(entry => entry.name.endsWith('.json')).map(entry => entry.name)
  } catch {
    return []
  }
  const statuses: TowerSessionStatus[] = []
  for (const name of names) {
    try {
      const status = parseStatus(await $.fs.read(`${sessionsDir(state)}/${name}`))
      if (status !== null) statuses.push(status)
    } catch {
      // A file removed or half written between list and read.
    }
  }
  // Decision 059: only this Tower's sessions; another project's Tower writes to the same folder.
  return ofTower(statuses, await tmuxSocket($))
}

// ── Rail data ─────────────────────────────────────────────────────────────

async function readTextFile($: EngineInterface, path: string): Promise<string | undefined> {
  try {
    return await $.fs.read(path)
  } catch {
    return undefined
  }
}

/** The ticket's state file under the worktree (config phases.path); undefined when missing, or when the phases come from no file. */
async function readStateFile($: EngineInterface, worktree: string): Promise<string | undefined> {
  const phases = config().phases
  return phases.source === 'state-file' ? readTextFile($, `${worktree}/${phases.path}`) : undefined
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? ''
}

async function loadRailView($: EngineInterface, context: Context): Promise<TowerRailView> {
  if (context.repo === null) return { kind: 'error', message: 'TOWER_REPO is not set' }
  // Decision 060: a free Tower in a folder outside git asks git nothing: `+ new session` and SESSIONS alone; a design Tower too (decision 064).
  if (noProject() && !(await insideGit($, context.repo))) {
    const statuses = context.state === null ? [] : await liveStatuses($, context.state)
    const now = await $.clock.now()
    return { kind: 'rows', repoName: repoName(context.repo), rows: [], local: {}, hubs: hubSessionStates(statuses, now), others: [], free: freeSessionRows(statuses, now, []), branch: null }
  }
  let listing: ProcessRunResult
  try {
    listing = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd: context.repo, timeoutMs: 10_000 })
  } catch (err) {
    return { kind: 'error', message: `git failed: ${firstLine(String(err))}` }
  }
  if (listing.exitCode !== 0) {
    return { kind: 'error', message: firstLine(listing.stderr) || `git exited with ${listing.exitCode}` }
  }

  const statuses = context.state === null ? [] : await liveStatuses($, context.state)
  const now = await $.clock.now()
  const liveOf = liveFields(statuses, now)
  // Decision 034: the windows are the account's; the session that read them last speaks for all.
  boardLimits = [...statuses].filter(status => status.limits !== undefined).sort((a, b) => b.updatedAt - a.updatedAt)[0]?.limits ?? boardLimits
  const rows: TowerRailRow[] = []
  const local: Record<string, TowerTicketLocal> = {}
  const idPattern = ticketIdPattern(config().tickets)
  for (const entry of ticketWorktrees(parseWorktreePorcelain(listing.stdout), idPattern)) {
    const stateText = await readStateFile($, entry.path)
    const row = railRow(entry, parseWorkState(stateText, config().phases), null, idPattern)
    rows.push({ ...row, ...liveOf(row.key) })
    // Every live session of the ticket counts: its review session is the same ticket (decision 025).
    const usage = ticketUsage(statuses, row.key, now)
    local[row.key] = { ...parseWorkDetail(stateText), sessions: ticketLiveSessions(statuses, row.key, now), usage }
  }
  const others = otherWorktrees(parseWorktreePorcelain(listing.stdout), idPattern).map(entry => ({ name: folderName(entry.path), branch: entry.branch, path: entry.path }))
  const free = freeSessionRows(statuses, now, parseWorktreePorcelain(listing.stdout))
  // A free Tower's header names the folder's branch (decision 060).
  const branch = noProject() ? { branch: branchOfFolder(parseWorktreePorcelain(listing.stdout), context.repo) } : {}
  // Decision 064: a free Tower in a git folder offers tower-setup until its configuration is stored.
  const main = freeTower() && context.state !== null ? mainCheckoutFromListing(listing.stdout) : null
  const setup = main !== null && context.state !== null ? { setup: { main, configured: await storedConfigured($, context.state, main) } } : {}
  // Decision 070: the tickets hidden from the rail leave `rows`; the candidates (`a`, decision 071) list them under HIDDEN.
  const hiddenKeys = new Set(await readHidden($, context))
  const hidden = rows.filter(row => hiddenKeys.has(row.key.toUpperCase()))
  const shown = hidden.length === 0 ? rows : rows.filter(row => !hiddenKeys.has(row.key.toUpperCase()))
  return { kind: 'rows', repoName: repoName(context.repo), rows: shown, local, hubs: hubSessionStates(statuses, now), others, free, ...branch, ...setup, ...(hidden.length > 0 ? { hidden } : {}) }
}

/** Decision 070: the hidden list's file of this project; null without a state folder or a main checkout. */
function hiddenFile(context: Context): string | null {
  return context.state === null || context.repo === null || context.repo === '' ? null : hiddenPath(context.state, context.repo)
}

/** The keys hidden from the rail; none when the file is missing or unreadable. */
async function readHidden($: EngineInterface, context: Context): Promise<string[]> {
  const path = hiddenFile(context)
  if (path === null) return []
  try {
    return parseHidden(JSON.parse(await $.fs.read(path)))
  } catch {
    return []
  }
}

/** A change of the hidden list, on the file as it is now, written whole through a temporary file and `mv` (as the routing overrides). */
async function changeHidden($: EngineInterface, context: Context, change: (keys: string[]) => string[]) {
  const path = hiddenFile(context)
  if (path === null) throw new Error('no state folder: the hidden list cannot be written')
  const text = hiddenText(change(await readHidden($, context)))
  const tmp = `${path}.${await $.session.id()}.tmp`
  await $.fs.write(tmp, text)
  const moved = await $.process.run(['mv', '-f', tmp, path], { timeoutMs: 5_000 }).then(result => result.exitCode === 0).catch(() => false)
  if (!moved) await $.fs.write(path, text)
}

/** Whether `folder` is in a git work tree: a `.git` in it or above it, found without running git (decision 060). */
async function insideGit($: EngineInterface, folder: string): Promise<boolean> {
  for (let path = folder.replace(/\/+$/, ''); path !== ''; path = path.slice(0, path.lastIndexOf('/'))) {
    if (await $.fs.exists(`${path}/.git`).catch(() => false)) return true
  }
  return $.fs.exists('/.git').catch(() => false)
}

/**
 * Decision 064: the project's configuration is stored, a JSON object at `<state dir>/projects/<id>.json` (what bin/CCtower's
 * tower_config_for asks); the file is read only once it exists.
 */
async function storedConfigured($: EngineInterface, state: string, main: string): Promise<boolean> {
  const path = storedConfigPath(state, main)
  if (!(await $.fs.exists(path).catch(() => false))) return false
  try {
    const parsed: unknown = JSON.parse(await $.fs.read(path))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

/** The status records, each whose tmux pane is gone dropped (without the pane listing the records alone decide). */
async function liveStatuses($: EngineInterface, state: string): Promise<TowerSessionStatus[]> {
  const statuses = await readStatuses($, state)
  try {
    const tags = new Set(parsePaneListing(await tmux($, ['list-panes', '-a', '-F', PANE_LISTING_FORMAT])).map(pane => pane.tag).filter(tag => tag !== ''))
    return withLivePanes(statuses, tags)
  } catch {
    return statuses
  }
}

/** A row's fields that come from the session records: its session, agents, step agent and wait. */
function liveFields(statuses: TowerSessionStatus[], now: number) {
  const sessions = ticketSessionStates(statuses, now)
  const agents = ticketRunningAgents(statuses, now)
  const live = newestTicketStatuses(statuses, now)
  const waiting = ticketWaiting(statuses, now)
  return (key: string) => {
    const newest = live.get(key)
    return { session: sessions.get(key) ?? null, agents: agents.get(key) ?? 0, agent: newest?.agent ?? null, waiting: waiting.get(key) ?? null, decisions: openDecisions(newest?.pins),
      alert: newest?.state === 'working' ? newest.alert ?? null : null, lastRequestAt: newest?.lastRequestAt ?? null }
  }
}

/** Writes the view only when it changed, so the pane does not redraw for nothing. */
async function refreshRail($: EngineInterface, context: Context, reloadRemote = false) {
  const view = await loadRailView($, context)
  const current = await read($, railView)
  if (JSON.stringify(current) !== JSON.stringify(view)) await update($, railView, () => view)
  await refreshCentre($, context)
  if (context.role === 'rail') await announceAttention($, context, view).catch(() => {})
  await refreshShownRemote($, context, reloadRemote)
  void loadEveryRemote($).catch(() => {})
  if (context.role === 'rail') void refreshRailIssues($, false).catch(() => {})
  if (context.role === 'rail') await awayStartTickets($, context).catch(() => {})
}

/** The rail's last steps per ticket; null until the first load, which never chimes. */
let attentionSeen: AttentionRow[] | null = null
/** The rail's last read of each ticket's PR checks and the check flips announced (decision 035). */
let checkSeen: CheckSeen | null = null
/** The rail's last stall or loop id per ticket (decision 033); null until the first load, which never chimes. */
let alertSeen: Record<string, string> | null = null

/** The rail's 2 s attention check: the rows as last loaded, their session fields read again from the status files alone. */
async function checkAttention($: EngineInterface, context: Context) {
  const view = await read($, railView)
  if (view.kind !== 'rows' || context.state === null) return
  // Decision 064: a free Tower in a git folder sees tower-setup's stored configuration within seconds (one exists a check until then).
  if (view.setup !== undefined && !view.setup.configured && (await storedConfigured($, context.state, view.setup.main))) {
    await update($, railView, current => (current.kind === 'rows' && current.setup !== undefined ? { ...current, setup: { ...current.setup, configured: true } } : current))
  }
  const statuses = await liveStatuses($, context.state)
  const liveOf = liveFields(statuses, await $.clock.now())
  await announceAttention($, context, { ...view, rows: view.rows.map(row => ({ ...row, ...liveOf(row.key) })) }, statuses)
}

/**
 * A ticket away from the centre turned `needs you`, or a working one turned ready: an event in the queue
 * (the board's popup) and, for a real wait or a ready, a soft chime, each per the settings. The centre's `needs you` chimes only.
 */
async function announceAttention($: EngineInterface, context: Context, view: Awaited<ReturnType<typeof loadRailView>>, known?: TowerSessionStatus[]) {
  if (view.kind !== 'rows') return
  const remotes = await read($, remoteDetails)
  const issues = await read($, linearIssues)
  const rows = view.rows.map(row => {
    const blockedBy = issues.find(issue => issue.id.toUpperCase() === row.key.toUpperCase())?.blockedBy ?? []
    const step = rowStep(row, remotes[row.key]?.pullRequest, blockedBy, config().workflow)
    return { key: row.key, group: step.group, glyph: step.glyph, status: step.status }
  })
  const centre = await read($, centreTicket)
  // Decision 055: the free sessions' waits, by their names; read again from the status files on the 2 s check.
  const free = freeAttentionRows(known !== undefined ? freeSessionRows(known, await $.clock.now(), []) : (view.free ?? []))
  const raised = attentionEvents(attentionSeen, [...rows, ...free.rows], centre)
  attentionSeen = [...rows, ...free.rows]
  // A stall or a loop: one event per stall, its own dedupe by the alert's id.
  const alerts = alertEvents(alertSeen, view.rows.map(row => ({ key: row.key, alert: row.alert ?? null })), centre)
  alertSeen = alerts.seen
  // Decision 035: a check of a ticket's PR that turned failing, or a PR's checks all turned green.
  const checks = checkEvents(checkSeen, view.rows.map(row => {
    const pr = remotes[row.key]?.pullRequest
    return { key: row.key, pr: pr?.kind === 'pr' ? pr : null }
  }), centre)
  checkSeen = checks.seen
  const ciEvents = towerSettings.modules.prstate && towerSettings.modules.ciAlerts ? checks.events : []
  const now = await $.clock.now()
  // One announcement per ticket and reason: an away recap's working ↔ needs you flip-flop stays quiet.
  const stored = parseAnnounced(await $.store.get(announcedKey(context.repo)))
  const deduped = dedupeEvents(raised, stored, [...rows, ...free.rows], now, free.cleared)
  const announced = deduped.announced
  const events = [...deduped.events, ...alerts.events, ...ciEvents]
  if (JSON.stringify(announced) !== JSON.stringify(stored)) await $.store.set(announcedKey(context.repo), announced)
  if (events.length === 0) return
  const statuses = known ?? (context.state === null ? [] : await readStatuses($, context.state))
  const popups = events.filter(event => event.centre === undefined)
  if (towerSettings.modules.popups && popups.length > 0) {
    let queue = parseQueue(await readShared($, attentionFile(context.repo)))
    for (const event of popups) {
      // A wait's own text when there is one: `permission · Bash gh pr view …`.
      const wait = event.kind === 'needs you' ? ticketWaitText(statuses, event.key, now) : null
      queue = pushEvent(queue, queuedEvent(event, now, wait !== null ? `${event.hint} · ${wait}` : event.hint))
    }
    await writeShared($, attentionFile(context.repo), queue)
    void loadAttention($).catch(() => {})
  }
  // A refused or missing player keeps the popup; the chime is best effort.
  const muted = isMuted(await $.env.get('TOWER_MUTE'))
  // Only a real wait, a decision or a ready chimes among the step events (`chimes`): an ordinary turn's end that asks
  // `say go` shows its popup in silence. Stalls, loops and check flips keep their chime.
  for (const event of [...deduped.events.filter(chimes), ...alerts.events, ...ciEvents]) if (towerSettings.modules.sound && !muted) void $.audio.play({ asset: event.asset }).catch(() => {})
}

/**
 * The rail's 2 s look at the queue: the event the board's popup shows (the oldest it has not seen), dismissed once
 * shown for POPUP_SHOWN_MS; the pane redraws when it changes.
 */
async function loadAttention($: EngineInterface) {
  const context = await readContext($)
  if (context === null || context.role !== 'rail') return
  const now = await $.clock.now()
  const own = null
  const queue = parseQueue(await readShared($, attentionFile(context.repo)))
  const shown = await read($, attentionShown)
  let event = pendingFor(queue, await read($, attentionDismissed), now, own)
  if (event !== null && shown?.id === event.id && now - shown.since >= POPUP_SHOWN_MS) {
    await dismissAttention($, event.id)
    event = pendingFor(queue, await read($, attentionDismissed), now, own)
  }
  const next = event === null ? null : shown?.id === event.id ? shown : { id: event.id, since: now }
  if (next?.id === shown?.id) return
  await update($, attentionShown, () => next)
  $.ui.invalidate('ui.render')
}

async function dismissAttention($: EngineInterface, id: string) {
  await update($, attentionDismissed, ids => [...ids.filter(one => one !== id), id].slice(-50))
  await update($, attentionShown, () => null)
  $.ui.invalidate('ui.render')
}

/** The event the board's popup shows now, read from the queue file (null when none, and in every other session). */
async function attentionPopup($: EngineInterface, context: Context | null): Promise<QueuedEvent | null> {
  if (context === null || context.role !== 'rail' || !towerSettings.modules.popups) return null
  const queue = parseQueue(await readShared($, attentionFile(context.repo)))
  return pendingFor(queue, await read($, attentionDismissed), await $.clock.now())
}

/** `g` on the board's popup: the rail opens the ticket. */
async function goToAttention($: EngineInterface, context: Context, event: QueuedEvent) {
  await dismissAttention($, event.id)
  await openTicketKey($, context, event.ticket)
}

/** The rail opens a ticket by its key, as Enter on its card does; a free session's key brings it to the centre (decision 055). */
async function openTicketKey($: EngineInterface, context: Context, key: string) {
  const view = await read($, railView)
  const row = view.kind === 'rows' ? view.rows.find(one => one.key === key) : undefined
  if (row !== undefined) await openWork($, context, ticketSession(row))
  const free = view.kind === 'rows' ? (view.free ?? []).find(one => one.key === key) : undefined
  if (free !== undefined) await openWork($, context, { role: 'free', key: free.key, cwd: free.cwd, start: null })
}

const LINEAR_TIMEOUT_MS = 8_000
const LINEAR_REFRESH_MS = 60_000

/** The fixture file's text when TOWER_LINEAR_FIXTURE names one, else Linear's answer. The key goes only into the request. */
async function fetchLinear($: EngineInterface): Promise<{ text: string } | { error: string }> {
  const fixture = await $.env.get('TOWER_LINEAR_FIXTURE')
  if (fixture) {
    const text = await readTextFile($, fixture)
    return text === undefined ? { error: 'TOWER_LINEAR_FIXTURE could not be read' } : { text }
  }
  return linearRequest($, { query: LINEAR_QUERY })
}

/** One request to Linear (a read-only query, or decision 071's self-assign): its answer's text, or why there is none. The key goes only into the request. */
async function linearRequest($: EngineInterface, body: { query: string; variables?: Record<string, unknown> }): Promise<{ text: string } | { error: string }> {
  const key = await $.env.get('LINEAR_API_KEY')
  if (!key || key.trim() === '') return { error: 'LINEAR_API_KEY not set' }
  const request = $.http
    .fetch(LINEAR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: linearAuth(key) },
      body: JSON.stringify(body),
    })
    .then(response => (response.ok ? { text: response.text } : { error: `Linear request failed: HTTP ${response.status}` }))
    .catch(() => ({ error: 'Linear request failed' }))
  const timeout = $.clock.sleep(LINEAR_TIMEOUT_MS).then(() => ({ error: 'Linear did not answer in 8 s' }))
  return Promise.race([request, timeout])
}

/** The person signed in to gh (`gh api user`), read once per session: GitHub issues assigned to them are `mine`. */
let githubLogin: string | null = null

/**
 * The repository's open GitHub issues (config tickets `github`, decision 054): `gh issue list`, read only; with their open
 * blockers (`gh api graphql`, decision 077) read beside it. A failed blockers read shows the issues without them.
 */
async function fetchGithub($: EngineInterface, tickets: GithubTickets): Promise<{ issues: TowerIssue[] } | { error: string }> {
  const run = async (args: readonly string[]) => $.process.run(['gh', ...args], { timeoutMs: 15_000 })
  try {
    if (githubLogin === null) {
      const user = await run(GH_USER_ARGS)
      githubLogin = user.exitCode === 0 ? parseGhLogin(user.stdout) : null
    }
    const [list, blocked] = await Promise.all([
      run(githubIssueArgs(tickets)),
      run(githubBlockedArgs(tickets)).then(result => parseGithubBlocked(result, tickets), () => new Map<number, string[]>()),
    ])
    return parseGithubIssues(list, githubLogin, tickets, blocked)
  } catch {
    return { error: 'gh is not available' }
  }
}

/** A failed refresh keeps the last good issues and records why. Linear's, or GitHub's; none: nothing to read. */
async function refreshLinear($: EngineInterface) {
  const tickets = config().tickets
  if (tickets.kind === 'none') return
  let parsed: { issues: TowerIssue[] } | { error: string }
  if (tickets.kind === 'github') {
    parsed = await fetchGithub($, tickets)
  } else {
    const fetched = await fetchLinear($)
    parsed = 'error' in fetched ? fetched : parseLinear(fetched.text)
  }
  if ('error' in parsed) {
    if ((await read($, linearError)) !== parsed.error) await update($, linearError, () => parsed.error)
    return
  }
  if (JSON.stringify(await read($, linearIssues)) !== JSON.stringify(parsed.issues)) await update($, linearIssues, () => parsed.issues)
  if ((await read($, linearError)) !== null) await update($, linearError, () => null)
  linearRead = true
  if (await isRail($)) await refreshRailIssues($, true)
  await pruneCandidateMarks($)
}

/** Decision 071: a reload keeps the marks only on the candidates still listed. */
async function pruneCandidateMarks($: EngineInterface) {
  const marks = await read($, candidateMarks)
  if (marks.length === 0) return
  const view = await read($, railView)
  const here = view.kind === 'rows' ? [...view.rows, ...(view.hidden ?? [])] : []
  const listed = candidateIssues(await knownIssues($), new Set(here.map(row => row.key.toUpperCase()))).map(issue => issue.id)
  const kept = pruneMarks(marks, listed)
  if (kept.length !== marks.length) await update($, candidateMarks, () => kept)
}

/** Decision 067: when each rail ticket was last asked of Linear by identifier; whether the candidates' query answered once. */
const railIssuesAsked = new Map<string, number>()
let linearRead = false

/**
 * Decision 067: the rail's tickets missing from the candidates' query, read by identifier, so each one's story is known
 * (and none is guessed into another's). `force` (the minute's refresh) asks them all again; otherwise only a new one,
 * once a minute at most. A failure keeps what was read before. Linear is only read.
 */
async function refreshRailIssues($: EngineInterface, force: boolean) {
  if (config().tickets.kind !== 'linear' || !linearRead) return
  const view = await read($, railView)
  if (view.kind !== 'rows') return
  const loaded = new Set((await read($, linearIssues)).map(issue => issue.id.toUpperCase()))
  const known = new Set((await read($, railIssues)).map(issue => issue.id.toUpperCase()))
  const now = await $.clock.now()
  const missing = view.rows.map(row => row.key).filter(key => !loaded.has(key.toUpperCase()))
  const ask = missing.filter(key => force || (!known.has(key.toUpperCase()) && now - (railIssuesAsked.get(key) ?? -LINEAR_REFRESH_MS) >= LINEAR_REFRESH_MS))
  if (ask.length === 0) {
    if (force && known.size > 0) await update($, railIssues, () => [])
    return
  }
  for (const key of ask) railIssuesAsked.set(key, now)
  const fetched = await fetchLinearKeys($, ask)
  if ('error' in fetched) return
  const asked = new Set(ask.map(key => key.toUpperCase()))
  const wanted = new Set(missing.map(key => key.toUpperCase()))
  const next = [
    ...(await read($, railIssues)).filter(issue => wanted.has(issue.id.toUpperCase()) && !asked.has(issue.id.toUpperCase())),
    ...fetched.issues.filter(issue => asked.has(issue.id.toUpperCase())),
  ]
  if (JSON.stringify(await read($, railIssues)) !== JSON.stringify(next)) await update($, railIssues, () => next)
}

/** Decision 067: the issues of `keys` by identifier (TOWER_LINEAR_FIXTURE's own when it names one), whatever their state. */
async function fetchLinearKeys($: EngineInterface, keys: readonly string[]): Promise<{ issues: TowerIssue[] } | { error: string }> {
  const fixture = await $.env.get('TOWER_LINEAR_FIXTURE')
  let answer: { text: string } | { error: string }
  if (fixture) {
    const text = await readTextFile($, fixture)
    answer = text === undefined ? { error: 'TOWER_LINEAR_FIXTURE could not be read' } : { text }
  } else {
    const filter = keysFilter(keys)
    if (filter === null) return { issues: [] }
    answer = await linearRequest($, { query: LINEAR_KEYS_QUERY, variables: { filter } })
  }
  if ('error' in answer) return answer
  const parsed = parseLinearAll(answer.text)
  if ('error' in parsed) return parsed
  const wanted = new Set(keys.map(key => key.toUpperCase()))
  return { issues: parsed.issues.filter(issue => wanted.has(issue.id.toUpperCase())) }
}

/** The narrow rail's issues (decision 067): the candidates' query's, then the rail's own read by identifier. */
async function knownIssues($: EngineInterface): Promise<TowerIssue[]> {
  const issues = await read($, linearIssues)
  const ids = new Set(issues.map(issue => issue.id.toUpperCase()))
  return [...issues, ...(await read($, railIssues)).filter(issue => !ids.has(issue.id.toUpperCase()))]
}

async function refreshCentre($: EngineInterface, context: Context) {
  let centre: string | null = null
  if (context.pane !== null) {
    try {
      const layout = await readLayout($, context.pane)
      centre = centrePane(layout.panes, context.pane, layout.railWindow)?.ticket ?? null
    } catch {
      // Outside tmux, or tmux is gone: no centre to mark.
    }
  }
  await applyCentre($, context, centre)
}

/** The quick check between list refreshes: one tmux call, state written only on a change. */
async function checkLayout($: EngineInterface, context: Context) {
  if (context.pane === null) return
  let panes: TmuxPane[]
  try {
    panes = parsePaneListing(await tmux($, ['list-panes', '-a', '-F', PANE_LISTING_FORMAT]))
  } catch {
    return
  }
  const railWindow = panes.find(pane => pane.id === context.pane)?.window
  if (railWindow === undefined) return
  const centre = centrePane(panes, context.pane, railWindow)
  if (await closeMergedGroups($, context, panes, railWindow)) return
  await applyCentre($, context, centre?.ticket ?? null)
  const height = await railPaneHeight($, context)
  if (height !== null && height !== (await read($, railHeight)) && (await read($, centreTicket)) !== null) await openRail($, context, false)
  await refreshShownRemote($, context, false)
}

/**
 * Merged and cleaned up (wrap-up removed the worktree): the group of every ticket whose worktree is gone,
 * in the centre or parked, goes; the board comes back with a notice. True when the centre group went.
 */
async function closeMergedGroups($: EngineInterface, context: Context, panes: TmuxPane[], railWindow: string): Promise<boolean> {
  const paths = await knownTicketPaths($, context)
  let centreGone = false
  const gone: string[] = []
  for (const ticket of new Set(panes.filter(pane => pane.role === 'ticket' && pane.ticket !== '').map(pane => pane.ticket))) {
    const path = paths[ticket]
    if (path === undefined || (await $.fs.exists(path).catch(() => true))) continue
    gone.push(ticket)
    for (const window of new Set(panes.filter(pane => pane.ticket === ticket).map(pane => pane.window))) {
      if (window === railWindow) {
        centreGone = true
        for (const pane of panes.filter(pane => pane.window === railWindow && pane.id !== context.pane)) await tmux($, ['kill-pane', '-t', pane.id]).catch(() => '')
      } else {
        await tmux($, ['kill-window', '-t', window]).catch(() => '')
      }
    }
  }
  if (gone.length === 0) return false
  for (const ticket of gone) ticketPaths.delete(ticket)
  await saveTicketPaths($, context, Object.fromEntries(Object.entries(paths).filter(([ticket]) => !gone.includes(ticket))))
  await update($, boardNotice, () => `${gone.join(', ')} merged and cleaned up`)
  if (centreGone) await applyCentre($, context, null)
  return centreGone
}

function ticketPathsKey(context: Context): string {
  return `ticketPaths:${context.repo ?? ''}`
}

/** The worktree of each ticket the rail opened, kept in the store so a restarted rail still knows them. */
async function knownTicketPaths($: EngineInterface, context: Context): Promise<Record<string, string>> {
  const raw = await $.store.get(ticketPathsKey(context)).catch(() => undefined)
  const stored: Record<string, string> = {}
  if (typeof raw === 'object' && raw !== null) {
    for (const [ticket, path] of Object.entries(raw as Record<string, unknown>)) if (typeof path === 'string') stored[ticket] = path
  }
  const merged = { ...stored, ...Object.fromEntries(ticketPaths) }
  if (JSON.stringify(merged) !== JSON.stringify(stored)) await saveTicketPaths($, context, merged)
  return merged
}

async function saveTicketPaths($: EngineInterface, context: Context, paths: Record<string, string>) {
  await $.store.set(ticketPathsKey(context), paths).catch(() => {})
}

/** When the centre session goes, the rail has the window again: reopen it wide and holding the keys. */
async function applyCentre($: EngineInterface, context: Context, centre: string | null) {
  const previous = await read($, centreTicket)
  await markPaneMode($, context, centre === null ? 'board' : 'rail')
  if (previous === centre) return
  await update($, centreTicket, () => centre)
  ringElement = null
  if (previous !== null && centre === null) await openRail($, context, true)
  // Beside a new centre session the rail turns inline once Claude Code redraws: the next check asks again for its height.
  if (previous === null && centre !== null) await update($, railHeight, () => null)
}

// ── Detail data (gh, git) ─────────────────────────────────────────────────

// In flight and gh's absence live in module variables, not atoms: an atom outlives a hot reload, and a load the
// reload cut short (its `finally` never ran) or one failed gh call (a timeout read as `gh missing`) then kept the
// ticket session from ever reading its pull request again (TKT-2428: no REVIEW box for its draft PR #2408).
/** The tickets whose pull request is being read now. */
const remoteInFlight = new Set<string>()
/** When gh last looked missing; it is tried again once that is stale (a minute). */
let ghMissingAt: number | null = null

/**
 * The checks a configuration without GitHub CI reads itself (decision 055): the worktree's state file's `checks`
 * (config checks source `stateFile`) and the newest release tag with the base's commits since it (`release`).
 */
async function readOwnChecks($: EngineInterface, worktree: string): Promise<OwnChecks> {
  const sources = config().checks.sources
  const own: OwnChecks = {}
  const stateFile = sources.find((source): source is { stateFile: string } => typeof source === 'object' && 'stateFile' in source)
  if (!sources.includes('github-ci') && stateFile !== undefined) own.recorded = parseRecordedChecks(await readTextFile($, `${worktree}/${stateFile.stateFile}`))
  const release = sources.find((source): source is { release: string } => typeof source === 'object' && 'release' in source)
  if (release !== undefined) {
    const pattern = releaseGlob(release.release)
    const gitOut = async (args: string[]): Promise<string | null> => {
      try {
        const result = await $.process.run(['git', ...args], { cwd: worktree, timeoutMs: 10_000 })
        return result.exitCode === 0 ? result.stdout : null
      } catch {
        return null
      }
    }
    const newest = parseReleaseTags((await gitOut(['tag', '--list', pattern, '--sort=-creatordate', '--format=%(refname:short)%09%(creatordate:unix)'])) ?? '')
    const since = newest === null ? null : parseBehind({ exitCode: 0, stdout: (await gitOut(['rev-list', '--count', `${newest.tag}..origin/${config().project.baseBranch}`])) ?? '' })
    own.release = { pattern, tag: newest?.tag ?? null, at: newest?.at ?? null, since }
  }
  return own
}

/**
 * The worktree's pull request: `gh pr view` in it (Linear tickets), or with GitHub tickets (decision 054) `gh pr list --head
 * <its branch>`, the branch given or read from the worktree's HEAD; with the checks the configuration reads itself.
 */
async function readPullRequest($: EngineInterface, worktree: string, branch?: string | null): Promise<TowerPullRequest> {
  const now = await $.clock.now()
  if (ghMissingAt !== null && !isStale(ghMissingAt, now)) return { kind: 'unavailable' }
  const byBranch = config().tickets.kind === 'github'
  const head = byBranch ? (branch ?? (await branchAt($, worktree))) : null
  if (byBranch && head === null) return { kind: 'none' }
  let result: ProcessRunResult | null
  try {
    result = await $.process.run(
      head !== null ? ['gh', 'pr', 'list', '--head', head, '--state', 'all', '--json', prViewFields(config().checks)] : ['gh', 'pr', 'view', '--json', prViewFields(config().checks)],
      { cwd: worktree, timeoutMs: 15_000 },
    )
  } catch {
    result = null
  }
  const own = result !== null && result.exitCode === 0 ? await readOwnChecks($, worktree) : {}
  const pullRequest = head !== null ? parsePullRequestList(result, config().review, own) : parsePullRequest(result, config().review, own)
  ghMissingAt = pullRequest.kind === 'unavailable' ? now : null
  return pullRequest
}

/** Commits on the base the worktree lacks, from local refs only (never fetches). */
async function readBehind($: EngineInterface, worktree: string, base: string): Promise<number | null> {
  try {
    const result = await $.process.run(['git', 'rev-list', '--count', `HEAD..origin/${base}`], { cwd: worktree, timeoutMs: 10_000 })
    return parseBehind(result)
  } catch {
    return null
  }
}

/** Loads the pull request and behind-count of one ticket, unless fresh or already loading. */
async function loadRemote($: EngineInterface, row: TowerRailRow, base: string, force: boolean) {
  const cached = (await read($, remoteDetails))[row.key]
  if (!force && cached !== undefined && !isStale(cached.loadedAt, await $.clock.now())) return
  if (remoteInFlight.has(row.key)) return
  remoteInFlight.add(row.key)
  try {
    const pullRequest = await readPullRequest($, row.path, row.branch)
    const behind = await readBehind($, row.path, base)
    const loaded: TowerTicketRemote = { loadedAt: await $.clock.now(), pullRequest, behind }
    await update($, remoteDetails, all => ({ ...all, [row.key]: loaded }))
  } finally {
    remoteInFlight.delete(row.key)
  }
}

/** The detail follows the ticket whose row took the focus; its remote data loads behind the draw. */
async function followFocus($: EngineInterface, key: string) {
  if ((await read($, focusedTicket)) === key) return
  await update($, focusedTicket, () => key)
  const context = await readContext($)
  if (context !== null) void refreshShownRemote($, context, false).catch(() => {})
}

/** Only while the rail has the window (no centre): beside a ticket session it draws no detail. */
async function refreshShownRemote($: EngineInterface, context: Context, force: boolean) {
  const view = await read($, railView)
  if (view.kind !== 'rows' || (await read($, centreTicket)) !== null) return
  const row = detailRow(view.rows, await read($, focusedTicket), null)
  if (row === null) return
  await loadRemote($, row, view.local[row.key]?.base ?? config().project.baseBranch, force)
}

/** Every ticket's pull request, one gh at a time, so each row's status is right before it is focused. */
async function loadEveryRemote($: EngineInterface) {
  if (await read($, remoteSweeping)) return
  await update($, remoteSweeping, () => true)
  try {
    const view = await read($, railView)
    if (view.kind !== 'rows') return
    for (const row of view.rows) await loadRemote($, row, view.local[row.key]?.base ?? config().project.baseBranch, false).catch(() => {})
  } finally {
    await update($, remoteSweeping, () => false)
  }
}

// ── tmux ──────────────────────────────────────────────────────────────────

/** The launcher's tmux socket name (TOWER_TMUX_SOCKET): without TMUX, plain tmux would reach the default server. */
async function tmuxSocket($: EngineInterface): Promise<string | null> {
  return (await $.env.get('TOWER_TMUX_SOCKET')) || null
}

/** Runs one tmux command on the workspace's server; rejects with the short cause when it fails. */
async function tmux($: EngineInterface, args: string[]): Promise<string> {
  const socket = await tmuxSocket($)
  const result = await $.process.run(['tmux', ...(socket !== null ? ['-L', socket] : []), ...args], { timeoutMs: 10_000 })
  if (result.exitCode !== 0) {
    throw new Error(firstLine(result.stderr) || `tmux ${args[0]} exited with ${result.exitCode}`)
  }
  return result.stdout.trim()
}

async function readLayout($: EngineInterface, railPane: string) {
  const railWindow = await tmux($, ['display-message', '-p', '-t', railPane, '#{window_id}'])
  const panes = parsePaneListing(await tmux($, ['list-panes', '-a', '-F', PANE_LISTING_FORMAT]))
  return { railWindow, panes }
}

// ── Opening a ticket ──────────────────────────────────────────────────────

async function hasClaudeSession($: EngineInterface, home: string | null, worktreePath: string): Promise<boolean> {
  if (home === null) return false
  try {
    const entries = await $.fs.list(claudeProjectDir(home, worktreePath))
    return hasEarlierSession(entries.map(entry => entry.name))
  } catch {
    return false
  }
}

let tagCount = 0

/** A new TOWER_TAG for a work session: the clock plus a counter, for opens in the same millisecond. */
async function newWorkTag($: EngineInterface, role: string): Promise<string> {
  tagCount += 1
  return towerTag(role, (await $.clock.now()) + tagCount)
}

/** The session's command: a skill's slash command as first prompt; `resume` continues the ticket's earlier conversation. */
async function workCommand($: EngineInterface, pluginDir: string, session: WorkSession, resume: boolean): Promise<string[]> {
  const modelOverride = (await $.env.get('TOWER_SESSION_MODEL')) || null
  const settings = sessionSettings({ role: session.role, pluginDir, theme: themeChoice(await $.env.get('TOWER_THEME'), themeOption, towerSettings.theme), allow: config().permissions?.allow })
  const now = await $.clock.now()
  if (session.start === null) {
    // A new free session on the routing view's `new session` row (decision 056); TOWER_SESSION_MODEL still wins.
    const free = session.role === 'free' && !resume ? freeStart(routingOverrides, routingProfile().modelIds, modelOverride, catalogue) : { model: modelOverride, effort: null }
    const flags = launchFlags(free.model, free.effort, now)
    return claudeCommand(pluginDir, resume, flags.model, settings, flags.effort)
  }
  const flags = launchFlags(modelOverride ?? session.start.model, session.start.effort, now)
  return skillCommand(pluginDir, flags.model, flags.effort, session.start.prompt, resume, settings)
}

/** TOWER_MAIN_MODEL and TOWER_MAIN_EFFORT: what workCommand passes as `--model` and `--effort`, when it passes them. */
async function launchEnv($: EngineInterface, session: WorkSession): Promise<string[]> {
  const sessionModel = (await $.env.get('TOWER_SESSION_MODEL')) || null
  const free = session.role === 'free' && session.start === null ? freeStart(routingOverrides, routingProfile().modelIds, sessionModel, catalogue) : null
  const { model, effort } = launchFlags(free !== null ? free.model : sessionModel ?? session.start?.model ?? null, free !== null ? free.effort : session.start?.effort ?? null, await $.clock.now())
  return [...(model !== null ? ['-e', `TOWER_MAIN_MODEL=${model}`] : []), ...(effort !== null ? ['-e', `TOWER_MAIN_EFFORT=${effort}`] : [])]
}

/** The arguments that start a work session in its folder, ending with its command. */
async function workSessionArgs($: EngineInterface, context: Context, opened: WorkSession, tag: string): Promise<string[]> {
  if (context.pluginDir === null) throw new Error('TOWER_PLUGIN_DIR is not set')
  const hasEarlier = opened.role === 'ticket' && (await hasClaudeSession($, context.home, opened.cwd))
  const hasStateFile = opened.role === 'ticket' && (await readStateFile($, opened.cwd)) !== undefined
  const startSkill = config().workflow.steps.start?.skill ?? null
  // A ticket folder without an earlier conversation starts with /start-ticket, whatever the phase.
  // One with an earlier conversation and a state file continues it, never /start-ticket (decision 051).
  const session = opened.role === 'ticket' && opened.start === null && opened.away !== true && !hasEarlier
    ? { ...opened, start: ticketStart(opened.key, '', config().workflow.steps.start, routingProfile().skills, routingProfile().modelIds, false) }
    : opened.role === 'ticket' ? { ...opened, start: ticketOpenStart(opened.start, hasEarlier, hasStateFile, startSkill) } : opened
  // A ticket not started yet (no state file: its first prompt is /start-ticket) starts a new conversation.
  const resume = resumesConversation(session.role, session.start, hasEarlier, hasStateFile, startSkill)
  const socket = await tmuxSocket($)
  const themeEnv = (await $.env.get('TOWER_THEME')) || null
  const demoEnv = (await $.env.get('TOWER_DEMO')) || null
  // A test launch's own state folder and silence reach every session it starts.
  const stateEnv = (await $.env.get('TOWER_STATE_DIR')) || null
  const muteEnv = (await $.env.get('TOWER_MUTE')) || null
  // Decision 060: a free Tower's sessions are free too.
  const modeEnv = (await $.env.get('TOWER_MODE')) || null
  return [
    '-c', session.cwd,
    '-e', `TOWER_ROLE=${session.role}`,
    '-e', `TOWER_TICKET=${session.key}`,
    '-e', `TOWER_REPO=${context.repo ?? ''}`,
    '-e', `TOWER_PLUGIN_DIR=${context.pluginDir}`,
    '-e', `TOWER_TAG=${tag}`,
    ...(socket !== null ? ['-e', `TOWER_TMUX_SOCKET=${socket}`] : []),
    ...(themeEnv !== null ? ['-e', `TOWER_THEME=${themeEnv}`] : []),
    ...(demoEnv !== null ? ['-e', `TOWER_DEMO=${demoEnv}`] : []),
    ...(stateEnv !== null ? ['-e', `TOWER_STATE_DIR=${stateEnv}`] : []),
    ...(muteEnv !== null ? ['-e', `TOWER_MUTE=${muteEnv}`] : []),
    ...(modeEnv !== null ? ['-e', `TOWER_MODE=${modeEnv}`] : []),
    // The model and effort the session is launched with, for its deck before the first turn reports them.
    ...(await launchEnv($, session)),
    '-e', 'CLAUDE_CODE_TMUX_TRUECOLOR=1',
    '-e', 'COLORTERM=truecolor',
    ...(await workCommand($, context.pluginDir, session, resume)),
  ]
}

async function markWorkPane($: EngineInterface, context: Context, pane: string, session: WorkSession, tag: string) {
  const target: WorkTarget = session
  await tmux($, ['set-option', '-p', '-t', pane, '@tower_role', target.role])
  await tmux($, ['set-option', '-p', '-t', pane, '@tower_title', paneTitle(target, session.cwd, context.home)])
  await tmux($, ['set-option', '-p', '-t', pane, '@tower_ticket', target.key])
  await tmux($, ['set-option', '-p', '-t', pane, '@tower_tag', tag])
}

/** The tmux border title of a work pane: `TKT-41 · ticket session · ~/wt`, `name · session` or a free one's `session · ~/wt`. */
function paneTitle(target: WorkTarget, cwd: string, home: string | null): string {
  if (target.role === 'hub') return `${target.key} · session`
  const shown = home !== null && (cwd === home || cwd.startsWith(`${home}/`)) ? `~${cwd.slice(home.length)}` : cwd
  if (target.role === 'free') return `session · ${shown}`
  return `${target.key} · ticket session · ${shown}`
}

async function executeOpen($: EngineInterface, context: Context, railPane: string, railWindow: string, plan: OpenPlan, session: WorkSession) {
  switch (plan.kind) {
    case 'select':
      await tmux($, ['select-pane', '-t', plan.pane])
      return
    case 'split': {
      const tag = await newWorkTag($, session.role)
      const args = await workSessionArgs($, context, session, tag)
      const pane = await tmux($, ['split-window', '-h', '-t', railPane, '-P', '-F', '#{pane_id}', ...args])
      await markWorkPane($, context, pane, session, tag)
      await tmux($, ['resize-pane', '-t', railPane, '-x', String(RAIL_COLUMNS)])
      await tmux($, ['select-pane', '-t', pane])
      return
    }
    case 'swap':
      await tmux($, ['swap-pane', '-d', '-s', plan.pane, '-t', plan.centre])
      // The groups follow: the centre's review into the parked window, the target's beside it in the centre.
      await joinGroup($, plan.centreOthers, plan.centre)
      await joinGroup($, plan.others, plan.pane)
      await tmux($, ['select-pane', '-t', plan.pane])
      return
    case 'createThenSwap': {
      const tag = await newWorkTag($, session.role)
      const args = await workSessionArgs($, context, session, tag)
      // -a -t: a new window right after the rail's, in the rail's tmux session.
      const pane = await tmux($, ['new-window', '-d', '-a', '-t', railWindow, '-P', '-F', '#{pane_id}', '-n', session.key, ...args])
      await markWorkPane($, context, pane, session, tag)
      await tmux($, ['swap-pane', '-d', '-s', pane, '-t', plan.centre])
      await joinGroup($, plan.centreOthers, plan.centre)
      await tmux($, ['select-pane', '-t', pane])
      return
    }
    case 'join':
      await tmux($, ['join-pane', '-h', '-s', plan.pane, '-t', railPane])
      await tmux($, ['resize-pane', '-t', railPane, '-x', String(RAIL_COLUMNS)])
      await joinGroup($, plan.others, plan.pane)
      await tmux($, ['select-pane', '-t', plan.pane])
      return
  }
}

/** Moves the rest of a group to its work pane: a review session under it, anything else beside it. */
async function joinGroup($: EngineInterface, others: string[], under: string) {
  for (const pane of others) {
    const direction = joinDirection(await tmux($, ['display-message', '-p', '-t', pane, '#{@tower_role}']))
    await tmux($, ['join-pane', '-d', direction, ...(direction === '-v' ? ['-l', REVIEW_SIZE] : []), '-s', pane, '-t', under])
  }
}

/** `b`: the centre session and its group leave the window, still running, into a parked window; the rail gets the window back. */
async function backToBoard($: EngineInterface, context: Context) {
  keysClaim = true
  if (context.pane === null) return
  const panes = parsePaneListing(await tmux($, ['list-panes', '-a', '-F', PANE_LISTING_FORMAT]))
  const railWindow = panes.find(pane => pane.id === context.pane)?.window
  if (railWindow === undefined) return
  const plan = planBack(panes, context.pane, railWindow)
  if (plan === null) return
  const ticket = panes.find(pane => pane.id === plan.centre)?.ticket ?? 'parked'
  await tmux($, ['break-pane', '-d', '-s', plan.centre, '-n', ticket])
  await joinGroup($, plan.others, plan.centre)
  await tmux($, ['select-pane', '-t', context.pane])
  await applyCentre($, context, null)
}

async function isRail($: EngineInterface): Promise<boolean> {
  return (await sessionRole($)) === 'rail'
}

/** The worktree of each ticket the rail opened this run: when it disappears, the rail closes the ticket's group (persisted by `knownTicketPaths`). */
const ticketPaths = new Map<string, string>()

function ticketSession(row: TowerRailRow, start: SkillStart | null = ticketStart(row.key, row.phase, config().workflow.steps.start, routingProfile().skills, routingProfile().modelIds)): WorkSession {
  ticketPaths.set(row.key, row.path)
  return { role: 'ticket', key: row.key, cwd: row.path, start }
}

async function showError($: EngineInterface, err: unknown) {
  const cause = err instanceof Error ? err.message : String(err)
  await update($, openError, () => firstLine(cause))
}

/** Shows the session in the centre, starting it when it has none. False (cause on the rail) when that failed. */
async function openWork($: EngineInterface, context: Context, opened: WorkSession): Promise<boolean> {
  if ((await read($, openingTicket)) !== null) return false
  await update($, openingTicket, () => opened.key)
  try {
    if (context.pane === null) throw new Error('not running in a tmux pane')
    // The routing as the file holds it now (decision 056): a skill's start takes its model and effort from it.
    await refreshRoutingOverrides($)
    const session = opened.start === null ? opened : { ...opened, start: routedStart(opened.start, routingProfile().skills, routingProfile().modelIds) }
    const { railWindow, panes } = await readLayout($, context.pane)
    await executeOpen($, context, context.pane, railWindow, planOpen(panes, context.pane, railWindow, session), session)
    await update($, openError, () => null)
    await refreshRail($, context)
    return true
  } catch (err) {
    await showError($, err)
    return false
  } finally {
    await update($, openingTicket, () => null)
  }
}

/** A git command in `cwd`; its first error line is thrown when it fails. */
async function git($: EngineInterface, cwd: string, args: string[], timeoutMs = 30_000): Promise<string> {
  const result = await $.process.run(['git', ...args], { cwd, timeoutMs })
  if (result.exitCode !== 0) throw new Error(gitError(result.stderr) || `git ${args[0]} exited with ${result.exitCode}`)
  return result.stdout
}

/**
 * The fixed part of the start-ticket skill (decision 069; decision 071's promote): fetch the base, `git worktree add -b`
 * beside the others, worktreeConfig and the tracked hooks. The base as the old launcher's promote: the ticket's own branch when
 * origin has it (resumed), else, stacked when the configuration says so, its open blocker's branch, then its story's
 * branch (the story's worktree here), each when on origin, else origin/<base branch>. Returns the new row and the base;
 * throws with git's first error line. Writes nothing to Linear or GitHub.
 */
async function createTicketWorktree($: EngineInterface, context: Context, issue: TowerIssue): Promise<{ row: TowerRailRow; base: string; branch: string }> {
  if (context.repo === null) throw new Error('TOWER_REPO is not set')
  const repo = context.repo
  const idPattern = ticketIdPattern(config().tickets)
  const entries = ticketWorktrees(parseWorktreePorcelain(await git($, repo, ['worktree', 'list', '--porcelain'], 10_000)), idPattern)
  const existing = entries.flatMap(entry => {
    const ticket = worktreeTicketId(entry, idPattern)
    return ticket === null ? [] : [{ path: entry.path, ticket, branch: entry.branch ?? '' }]
  })
  const worktree = config().worktree
  const tickets = config().tickets
  // GitHub issues (decision 054): `{kind}` from the labels, `bug` → `fix`, else `feature`.
  const kind = tickets.kind === 'github' && worktree.branch.kind === 'template' && worktree.branch.kindFromLabel ? issueKind(issue.labels, tickets.labels) : undefined
  const blocker = worktree.stackOnBlocker ? issue.blockedBy[0] ?? null : null
  const issues = await read($, linearIssues)
  const blockerBranch = blocker === null ? null
    : existing.find(entry => entry.ticket === blocker)?.branch || issues.find(other => other.id === blocker)?.branchName || null
  // Decision 071: the story's own worktree here gives its branch (the old launcher's story base).
  const storyId = issue.story?.id.toUpperCase() ?? null
  const storyBranch = worktree.stackOnBlocker && storyId !== null ? existing.find(entry => entry.ticket.toUpperCase() === storyId)?.branch || null : null
  const input = {
    repo,
    ticket: issue.id,
    issue,
    existing,
    blockerBranch,
    storyBranch,
    originBranches: [config().project.baseBranch],
    baseBranch: config().project.baseBranch,
    ...(kind !== undefined ? { kind } : {}),
  }
  // Which of the ticket's own branch, the blocker's and the story's origin has: one ls-remote; none when it fails.
  const asked = [...new Set([newWorktree(input, worktree, context.home).branch, blockerBranch, storyBranch].filter((name): name is string => name !== null && name !== ''))]
  const listed = await $.process.run(['git', 'ls-remote', '--heads', 'origin', ...asked], { cwd: repo, timeoutMs: 30_000 }).catch(() => null)
  const onOrigin = listed === null || listed.exitCode !== 0 ? [] : listed.stdout.split('\n').map(line => /\trefs\/heads\/(.+)$/.exec(line.trim())?.[1] ?? '').filter(name => asked.includes(name))
  const plan = newWorktree({ ...input, originBranches: [config().project.baseBranch, ...onOrigin] }, worktree, context.home)
  await git($, repo, ['fetch', 'origin', plan.base.slice('origin/'.length)], 60_000)
  if (await $.fs.exists(plan.path)) throw new Error(`the folder ${folderName(plan.path)} already exists`)
  const hadBranch = (await $.process.run(['git', 'rev-parse', '--verify', '--quiet', `refs/heads/${plan.branch}`], { cwd: repo, timeoutMs: 10_000 })).exitCode === 0
  try {
    await git($, repo, ['worktree', 'add', '-b', plan.branch, plan.path, plan.base])
  } catch (err) {
    // git may make the branch before it fails on the folder: nothing half-made stays.
    if (!hadBranch) await $.process.run(['git', 'branch', '-D', plan.branch], { cwd: repo, timeoutMs: 10_000 }).catch(() => {})
    throw err
  }
  await git($, plan.path, ['config', 'extensions.worktreeConfig', 'true'])
  if (await $.fs.exists(`${plan.path}/.husky`)) await git($, plan.path, ['config', '--worktree', 'core.hooksPath', '.husky'])
  await refreshRail($, context)
  const view = await read($, railView)
  const row = view.kind === 'rows' ? view.rows.find(candidate => candidate.path === plan.path) : undefined
  if (row === undefined) throw new Error(`the worktree ${plan.path} was made but is not listed`)
  return { row, base: plan.base, branch: plan.branch }
}

/** Decision 071: the Linear id of the API key's person, asked once (`viewer { id }`) before the first self-assign. */
let linearViewerId: string | null = null

/**
 * Decision 071, Tower's one Linear write: the issue assigned to the person (`issueUpdate` with `assigneeId`, nothing
 * else). True when Linear says it succeeded; false on any failure (the promote stands, the person assigns by hand).
 */
async function assignToMe($: EngineInterface, issue: TowerIssue): Promise<boolean> {
  if (linearViewerId === null) {
    const answer = await linearRequest($, { query: LINEAR_VIEWER_QUERY })
    const id = 'error' in answer ? null : parseViewerId(answer.text)
    if (id === null) return false
    linearViewerId = id
  }
  const answer = await linearRequest($, { query: LINEAR_ASSIGN_MUTATION, variables: { id: issue.linearId ?? issue.id, assigneeId: linearViewerId } })
  return !('error' in answer) && parseAssigned(answer.text)
}

type PromoteResult = { ok: true; message: string; assignFailed: boolean } | { ok: false; message: string }

/**
 * Decision 071: one candidate promoted as the old launcher did: its worktree made (createTicketWorktree; no session, no
 * /start-ticket), then, a Linear ticket not already the person's, self-assigned — only after the worktree is there; a
 * failed self-assign never undoes the promote. A story's child the query did not give is read by identifier first.
 * A Linear fixture (TOWER_LINEAR_FIXTURE) writes nothing; a GitHub issue is never assigned.
 */
async function promoteOne($: EngineInterface, context: Context, target: TowerIssue): Promise<PromoteResult> {
  try {
    let issue = target
    if (target.fromStory === true) {
      const fetched = await fetchLinearKeys($, [target.id])
      const found = 'issues' in fetched ? fetched.issues[0] : undefined
      if (found === undefined) throw new Error('error' in fetched ? fetched.error : `${target.id} was not found in Linear`)
      issue = found
    }
    const made = await createTicketWorktree($, context, issue)
    const message = `${issue.id} promoted — ${made.base === `origin/${made.branch}` ? `worktree resumed from ${made.base}`
      : made.base === `origin/${config().project.baseBranch}` ? `worktree ready on ${made.base}` : `worktree based on ${made.base}`}`
    if (config().tickets.kind !== 'linear' || issue.assignedToMe || (await $.env.get('TOWER_LINEAR_FIXTURE'))) return { ok: true, message, assignFailed: false }
    if (await assignToMe($, issue)) {
      await update($, linearIssues, list => list.map(one => (one.id === issue.id ? { ...one, assignedToMe: true } : one)))
      return { ok: true, message: `${message}, assigned to you`, assignFailed: false }
    }
    return { ok: true, message: `${message} (Linear self-assign failed — assign manually)`, assignFailed: true }
  } catch (err) {
    return { ok: false, message: `${target.id}: ${firstLine(err instanceof Error ? err.message : String(err))}` }
  }
}

/** Decision 071: the batch a `promote anyway?` question waits on (its ids are the question's key). */
let pendingBatch: TowerIssue[] = []

/**
 * Decision 071: `↵` in the candidates (the board's column, the narrow rail's view, a Git repository's open issues): the
 * marked candidates, else the focused one, stories first, then blockers first. A ticket blocked by an open ticket that
 * is not in the batch asks first (`y` promotes, `n` or Escape leaves it); then promoteBatch.
 */
async function promoteCandidates($: EngineInterface, context: Context, list: readonly TowerIssue[], focused: string | null) {
  if ((await read($, promoting)) !== null) return
  const targets = promoteOrder(promoteTargets(list, await read($, candidateMarks), focused))
  if (targets.length === 0) return
  const outside = blockedOutside(targets)
  if (outside.length === 0) return promoteBatch($, context, targets)
  pendingBatch = targets
  const ids = targets.map(one => one.id).join(',')
  await askClose($, { role: 'promote', key: ids, name: ids, question: `⚠ ${outside.join(', ')} — promote anyway?`, note: '' })
}

/**
 * Decision 071: the batch one ticket at a time, never two at once (each one fetches and adds a worktree in the main
 * checkout): `promoting TKT-X (i/n)…` on the notice line meanwhile; each promoted one leaves the marks and the
 * candidates (it has a worktree now: on the rail, `○ not started`). The summary as a toast and on the notice line.
 */
async function promoteBatch($: EngineInterface, context: Context, targets: readonly TowerIssue[]) {
  if (context.repo === null) return update($, boardNotice, () => 'TOWER_REPO is not set')
  if ((await read($, promoting)) !== null) return
  const promoted: string[] = []
  const messages: string[] = []
  const unassigned: string[] = []
  let lastError: string | null = null
  try {
    for (const [at, target] of targets.entries()) {
      await update($, promoting, () => target.id)
      await update($, boardNotice, () => `promoting ${target.id} (${at + 1}/${targets.length})…`)
      const result = await promoteOne($, context, target)
      if (!result.ok) {
        lastError = result.message
        continue
      }
      promoted.push(target.id)
      messages.push(result.message)
      if (result.assignFailed) unassigned.push(target.id)
      await update($, candidateMarks, marks => marks.filter(id => id !== target.id))
    }
  } finally {
    await update($, promoting, () => null)
  }
  const said = lastError === null
    ? promoted.length === 1 ? messages[0] ?? ''
      : `promoted ${promoted.join(', ')} — worktrees ready${unassigned.length > 0 ? ` (Linear self-assign failed for ${unassigned.join(', ')} — assign manually)` : ''}`
    : promoted.length > 0 ? `promoted ${promoted.length}/${targets.length} — last error: ${lastError}` : lastError
  await update($, openError, () => null)
  await tellRail($, said)
}

/** Decision 069: a ticket brought to the rail and not started yet: no state file, no live session, no pull request. */
function notStartedRow(row: TowerRailRow, pullRequest: TowerPullRequest | null | undefined): boolean {
  const pr = pullRequest?.kind === 'pr' && pullRequest.state !== 'closed'
  return row.phase === 'not started' && row.session === null && row.agents === 0 && (row.waiting ?? null) === null && !pr && row.blockers.length === 0
}

/**
 * Decision 069: the work a ticket's worktree holds: its changed files (`git status --porcelain`) and its commits that no
 * other branch or remote has (its base included). Null when git could not tell: nothing is deleted then.
 */
async function ticketWork($: EngineInterface, row: TowerRailRow): Promise<{ changed: number; commits: number } | null> {
  try {
    const status = await $.process.run(['git', 'status', '--porcelain'], { cwd: row.path, timeoutMs: 10_000 })
    if (status.exitCode !== 0) return null
    const commits = await commitsOnlyHere($, row.path, 'HEAD', row.branch)
    return commits === null ? null : { changed: status.stdout.split('\n').filter(line => line.trim() !== '').length, commits }
  } catch {
    return null
  }
}

/** The commits of `rev` that no branch but `branch` and no remote has; null when git could not count them. */
async function commitsOnlyHere($: EngineInterface, cwd: string, rev: string, branch: string): Promise<number | null> {
  try {
    const result = await $.process.run(['git', 'rev-list', '--count', rev, '--not', `--exclude=${branch}`, '--branches', '--remotes'], { cwd, timeoutMs: 10_000 })
    const count = result.stdout.trim()
    return result.exitCode === 0 && /^\d+$/.test(count) ? Number(count) : null
  } catch {
    return null
  }
}

/**
 * Decision 070: `x` on a ticket with no live session: one y/n, then it leaves the rail. A ticket not started holding no
 * work (no change, no commit of its own) is removed: its worktree and branch deleted. One with work, or one started (a
 * state file, a PR or blockers), is hidden: its worktree stays, its key in the hidden list.
 */
async function askRemove($: EngineInterface, row: TowerRailRow, fresh: boolean) {
  const hide = (question: string) => askClose($, { role: 'hide', key: row.key, name: row.key, question, note: 'the worktree stays' })
  if (!fresh) return hide(`hide ${row.key} from the rail?`)
  const work = await ticketWork($, row)
  if (work === null) return hide(`${row.key}: git could not check its work: hide it from the rail?`)
  if (work.changed > 0 || work.commits > 0) return hide(`${row.key} has work (${workText(work)}): hide it from the rail?`)
  await askClose($, { role: 'remove', key: row.key, name: row.key, question: `remove ${row.key}?`, note: 'deletes its worktree and branch' })
}

/** Decision 070: what `x` did, said twice: a toast and the rail's notice line. */
async function tellRail($: EngineInterface, text: string) {
  $.ui.toast(text)
  await flashBoardNotice($, text)
}

/** Decision 070: a ticket's row off the rail at once, before git or the hidden list answer; a hidden one listed under HIDDEN. */
async function dropTicketRow($: EngineInterface, row: TowerRailRow, hiding: boolean) {
  await update($, railView, current => (current.kind === 'rows'
    ? { ...current, rows: current.rows.filter(one => one.key !== row.key), hidden: [...(current.hidden ?? []).filter(one => one.key !== row.key), ...(hiding ? [row] : [])] }
    : current))
}

/**
 * `y` after askRemove: the row leaves at once; the work checked again (work found now: hidden instead), then
 * `git worktree remove` (never --force: git refuses a worktree with changes) and, only when the branch's commits are all
 * on another branch or a remote (counted again right before), `git branch -D`: `-d` refuses a branch not merged into the
 * main checkout's HEAD even when origin has its commits. Linear is not touched.
 */
async function removeTicket($: EngineInterface, context: Context, key: string) {
  const view = await read($, railView)
  const row = view.kind === 'rows' ? view.rows.find(one => one.key === key) : undefined
  if (row === undefined || context.repo === null) return
  await dropTicketRow($, row, false)
  const work = await ticketWork($, row)
  if (work === null || work.changed > 0 || work.commits > 0) {
    return hideTicket($, context, row, `${row.key} hidden, not removed: ${work === null ? 'git could not check its work' : `it has work now (${workText(work)})`} · the worktree stays`)
  }
  try {
    await git($, context.repo, ['worktree', 'remove', row.path])
  } catch (err) {
    await tellRail($, `${row.key} not removed: ${firstLine(err instanceof Error ? err.message : String(err))}`)
    await refreshRail($, context)
    return
  }
  ticketPaths.delete(row.key)
  const commits = row.branch === '' ? null : await commitsOnlyHere($, context.repo, `refs/heads/${row.branch}`, row.branch)
  let said = `${row.key} removed: worktree and branch deleted`
  if (commits !== 0) {
    said = `${row.key} removed: worktree deleted, its branch stays (${commits === null ? 'git could not count its commits' : `${commits} ${commits === 1 ? 'commit' : 'commits'} only there`})`
  } else {
    try {
      await git($, context.repo, ['branch', '-D', row.branch])
    } catch (err) {
      said = `${row.key} removed: worktree deleted, its branch stays (${firstLine(err instanceof Error ? err.message : String(err))})`
    }
  }
  await tellRail($, said)
  await refreshRail($, context)
}

/** Decision 070: `y` after a hide question: the row leaves at once, its key goes in the hidden list; the worktree stays. */
async function hideTicket($: EngineInterface, context: Context, row: TowerRailRow, said = `${row.key} hidden: worktree kept`) {
  await dropTicketRow($, row, true)
  try {
    await changeHidden($, context, keys => [...keys, row.key])
  } catch (err) {
    await tellRail($, `${row.key} not hidden: ${firstLine(err instanceof Error ? err.message : String(err))}`)
    await refreshRail($, context)
    return
  }
  await tellRail($, said)
  await refreshRail($, context)
}

/** Decision 070: a hidden ticket picked under HIDDEN in the candidates (decision 071): off the hidden list, its row back (its worktree is there). */
async function unhideTicket($: EngineInterface, context: Context, key: string) {
  try {
    await changeHidden($, context, keys => keys.filter(one => one !== key.toUpperCase()))
  } catch (err) {
    await tellRail($, `${key} not shown again: ${firstLine(err instanceof Error ? err.message : String(err))}`)
    return
  }
  await update($, railView, current => {
    if (current.kind !== 'rows') return current
    const row = (current.hidden ?? []).find(one => one.key === key)
    const hidden = (current.hidden ?? []).filter(one => one.key !== key)
    return { ...current, rows: row === undefined ? current.rows : [...current.rows, row], hidden }
  })
  await tellRail($, `${key} is back on the rail`)
  await refreshRail($, context)
}

/** `y` on the rail's question: close a session (decision 068), remove a ticket not started or start a blocked one (decision 069), hide a ticket (decision 070), promote a batch with a ticket blocked outside it (decision 071). */
async function answerAsk($: EngineInterface, context: Context) {
  const ask = await read($, closeAsk)
  if (ask === null) return
  if (ask.role === 'promote') {
    await dropClose($)
    const batch = pendingBatch.map(one => one.id).join(',') === ask.key ? pendingBatch : []
    pendingBatch = []
    if (batch.length > 0) await promoteBatch($, context, batch)
    return
  }
  if (ask.role === 'remove' || ask.role === 'start' || ask.role === 'hide') {
    await dropClose($)
    if (ask.role === 'remove') return removeTicket($, context, ask.key)
    const view = await read($, railView)
    const row = view.kind === 'rows' ? view.rows.find(one => one.key === ask.key) : undefined
    if (row === undefined) return
    if (ask.role === 'hide') return hideTicket($, context, row)
    await openWork($, context, ticketSession(row))
    return
  }
  await closeSession($, context)
}

/** Decision 071: Escape (the keys to the prompt box) in the candidates: a candidate's detail goes back to the list (the list takes the keys back), the list closes. */
async function leaveCandidates($: EngineInterface) {
  const shown = await read($, candidatesView)
  if (shown === 'detail') {
    await update($, candidatesView, () => 'list')
    keysClaim = true
  } else if (shown === 'list') await closeCandidates($)
}

/** Decision 071: the ▶ row the rail had before `a` opened the candidates, put back when they close. */
let focusBeforeCandidates: string | null = null

/** Decision 071: `a` opens the candidates in the list's place, the ring on the first one; `a` again (or Escape) closes them. */
async function openCandidates($: EngineInterface, first: string | null) {
  focusBeforeCandidates = await read($, focusedTicket)
  await update($, candidatesView, () => 'list')
  if (first === null) return
  await followFocus($, first)
  markedElement = `cand:${first}`
  await focusMarked($)
}

async function closeCandidates($: EngineInterface) {
  await update($, candidatesView, () => null)
  await update($, focusedTicket, () => focusBeforeCandidates)
  focusBeforeCandidates = null
}

/** Decision 071: the ring on the candidates' `↓ n more` (`↑`): the ▶ moves to the next candidate that way, which scrolls the list by one. */
let railCandidateKeys: string[] = []
let railCandidateStart = 0
async function moveCandidateWindow($: EngineInterface, way: 'up' | 'down') {
  const keys = railCandidateKeys
  const at = keys.indexOf((await read($, focusedTicket)) ?? '')
  const key = keys[Math.max(0, Math.min(keys.length - 1, at < 0 ? (way === 'up' ? keys.length - 1 : 0) : at + (way === 'up' ? -1 : 1)))]
  if (key === undefined) return
  await followFocus($, key)
  markedElement = `cand:${key}`
}

// ── Bus (commands between sessions) ─────────────────────────────────────────

async function loadKnownCommands($: EngineInterface): Promise<string[]> {
  try {
    const names = (await $.command.list()).map(command => command.name)
    await update($, knownCommands, () => names)
    return names
  } catch {
    return read($, knownCommands)
  }
}

/** Runs a received command when this session knows it; the list is read again, once, for a name it lacks. */
async function runReceived($: EngineInterface, command: string, args: string | undefined) {
  let known = await read($, knownCommands)
  if (!isAllowed(command, known)) known = await loadKnownCommands($)
  if (!isAllowed(command, known)) return
  // Not awaited: the run is submitted from inside the receive hook, where it works.
  void $.command.run({ command, ...(args !== undefined ? { args } : {}) }).catch(() => {})
}

/** Sends a command to the live session of a ticket or hub key; true when it was delivered. */
async function sendCommand($: EngineInterface, context: Context, target: WorkTarget, command: string): Promise<boolean> {
  if (context.state === null) return false
  const sessionId = liveSessionId(await readStatuses($, context.state), target.role, target.key, await $.clock.now())
  if (sessionId === null) return false
  const result = await $.session.send({ to: { sessionId }, text: encodeCommand({ command }) })
  return result.isDelivered
}

// ── Skills launcher (rail) ──────────────────────────────────────────────────

/** The rail pane draws the launcher in its list's place, with the commands of this moment. */
async function openLauncher($: EngineInterface) {
  try {
    const commands = await $.command.list()
    const repo = (await readContext($))?.repo ?? null
    // `routing: 'defaults'`: the repository's skills as they are now.
    if (config().routing === 'defaults' && repo !== null && !noProject()) repoSkills = await readRepoSkills($, repo)
    await refreshRoutingOverrides($)
    const listed = commands.map(command => ({ name: command.name, description: command.description, source: command.source, plugin: command.plugin }))
    const owned: string[] = []
    for (const name of otherCandidates(routingProfile().skills, listed)) {
      if (repo === null) break
      if ((await $.fs.exists(`${repo}/.claude/skills/${name}/SKILL.md`)) || (await $.fs.exists(`${repo}/.claude/commands/${name}.md`))) owned.push(name)
    }
    await update($, repoCommands, () => owned)
    await update($, launcherCommands, () => commands.map(command => ({ name: command.name, description: command.description, source: command.source, plugin: command.plugin })))
    await update($, skillsFilter, () => '')
    await update($, railMode, () => 'skills')
  } catch (err) {
    await showError($, err)
  }
}

/** The rail pane draws its list again, the keyboard on the launcher's ticket's row (else the first). */
async function closeLauncher($: EngineInterface) {
  keysClaim = true
  launcherHadKeys = false
  await update($, skillsFilter, () => '')
  await update($, railMode, () => 'list')
  const view = await read($, railView)
  const row = (await launcherTicket($)) ?? (view.kind === 'rows' ? view.rows[0] : undefined)
  // The filter's autoFocus takes the ring by itself; back on the list, a ring the pane holds lands nowhere.
  if (row !== undefined) await $.ui.focus({ requestId: PANE, key: `row:${row.key}` }).catch(() => {})
}

/** The ticket the launcher works for: the one the detail shows (focused, else in the centre). */
async function launcherTicket($: EngineInterface): Promise<TowerRailRow | null> {
  const view = await read($, railView)
  if (view.kind !== 'rows') return null
  return contextTicket(view.rows, await read($, focusedTicket), await read($, centreTicket))
}

/** Never throws: a failure shows on the rail's error line; the rail returns to its list either way. */
async function launchSkill($: EngineInterface, context: Context, item: LauncherItem) {
  const row = await launcherTicket($)
  const plan = planLaunch(item, row?.key ?? null, row?.session != null, routingProfile().modelIds)
  if (plan.kind === 'none') return
  try {
    if (plan.kind === 'hub') {
      if (context.repo === null) throw new Error('TOWER_REPO is not set')
      await openWork($, context, { role: 'hub', key: plan.key, cwd: context.repo, start: plan.start })
    } else if (row === null) {
      // No ticket to run it for: nothing launched.
    } else if (plan.kind === 'startTicket') {
      await openWork($, context, ticketSession(row, plan.start))
    } else {
      const sent = (await openWork($, context, ticketSession(row))) && (await sendCommand($, context, { role: 'ticket', key: row.key }, plan.command))
      if (!sent && (await read($, openError)) === null) await showError($, `/${plan.command} not delivered to ${row.key}`)
    }
  } catch (err) {
    await showError($, err)
  }
  await closeLauncher($).catch(() => {})
}

// ── Rail pane ─────────────────────────────────────────────────────────────

/** The tmux pane's height, for the inline rail to fill its column. */
async function railPaneHeight($: EngineInterface, context: Context): Promise<number | null> {
  if (context.role !== 'rail' || context.pane === null) return null
  try {
    return parsePaneWidth(await tmux($, ['display-message', '-p', '-t', context.pane, '#{pane_height}']))
  } catch {
    return null
  }
}

// The element the rail marks with ▶ (as drawn), the one the pane's focus ring stands on, and whether the rail's tmux pane was active.
let markedElement: string | null = null
let ringElement: string | null = null
/** The rail's Buttons as last drawn: the ring the person put on one (`+ new session`, a SESSIONS row, a key) stays there. */
let drawnButtons: ReadonlySet<string> = new Set()
let railWasActive = false
/** The list held the keys at the last ensureKeys: a change redraws the prompt hint. */
let listHadKeys = false
/** The launcher's filter held the keys at the last ensureKeys: Escape gives them away, and the launcher closes. */
let launcherHadKeys = false
/** Set on a transition (start, the rail's tmux pane becoming active, a new centre session, `b`, the launcher closing); spent once the list holds the keys. */
let keysClaim = true
let lastCentre: string | null = null
/** The home's card elements per column (needs you, working, ready, candidates), for Alt+←/→. */
let homeColumnKeys: string[][] = [[], [], [], []]
const homeWindowStart: Partial<Record<HomeColumn, number>> = {}
/** The GitHub board's rows top to bottom (`row:#26`, `cand:#33`, `row:other:<folder>`) and the first item of the open issues' window (decisions 054, 078). */
let repoKeys: string[] = []
let repoWindowStart = 0
/** Decision 078: the IN PROGRESS rows scroll in a window of their own, above the open issues' (repoWindowStart): its first item. */
let repoTopStart = 0
/** Decision 078: the GitHub board's two windows, `top` IN PROGRESS, `bottom` the open issues and OTHER BRANCHES. */
type RepoRegion = 'top' | 'bottom'
/** Each window's rows top to bottom, and the rows it draws: `keys[first]` up to `keys[end - 1]`. */
let repoRegions: Record<RepoRegion, { keys: string[]; first: number; end: number }> = { top: { keys: [], first: 0, end: 0 }, bottom: { keys: [], first: 0, end: 0 } }
let boardKeys: Record<'mine' | 'candidates', string[]> = { mine: [], candidates: [] }
/** The first item of each board list's scrolling window. */
const boardWindowStart: Record<'mine' | 'candidates', number> = { mine: 0, candidates: 0 }
/** False after a start or a hot reload until the ring stands once on the ▶ row. */
let ringSynced = false

/** An arrow past the window's edge (the ring on an `n more` line): the ▶ moves to the next row that way; ensureKeys puts the ring on it. */
async function moveWindow($: EngineInterface, way: 'up' | 'down') {
  const tab = await read($, boardTab)
  const keys = boardKeys[tab]
  const at = keys.indexOf((await read($, focusedTicket)) ?? '')
  const key = keys[Math.max(0, Math.min(keys.length - 1, at < 0 ? 0 : at + (way === 'up' ? -1 : 1)))]
  if (key === undefined) return
  await followFocus($, key)
  markedElement = `${tab === 'mine' ? 'row' : 'cand'}:${key}`
}

/** The ring on a home column's `↓ n more` (`↑`): the ▶ moves to that column's next card that way, which scrolls the window by one card; ensureKeys puts the ring on it. */
async function moveHomeWindow($: EngineInterface, column: HomeColumn, way: 'up' | 'down') {
  const keys = homeColumnKeys[HOME_COLUMNS.indexOf(column)] ?? []
  const focused = (await read($, focusedTicket)) ?? ''
  const at = keys.findIndex(key => key.slice(key.indexOf(':') + 1) === focused)
  const key = keys[Math.max(0, Math.min(keys.length - 1, at < 0 ? (way === 'up' ? keys.length - 1 : 0) : at + (way === 'up' ? -1 : 1)))]
  if (key === undefined) return
  await followFocus($, key.slice(key.indexOf(':') + 1))
  markedElement = key
}

/**
 * The ring on the GitHub board's `↓ n more` (`↑`) of `region`'s window (decision 078): the ▶ moves to that window's next
 * row that way, which scrolls it by one; the ▶ in the other window, to the row just past this window's edge that way.
 */
async function moveRepoWindow($: EngineInterface, region: RepoRegion, way: 'up' | 'down') {
  const { keys, first, end } = repoRegions[region]
  const focused = (await read($, focusedTicket)) ?? ''
  const at = keys.findIndex(key => key.slice(key.indexOf(':') + 1) === focused)
  const key = keys[Math.max(0, Math.min(keys.length - 1, at < 0 ? (way === 'up' ? first - 1 : end) : at + (way === 'up' ? -1 : 1)))]
  if (key === undefined) return
  await followFocus($, key.slice(key.indexOf(':') + 1))
  markedElement = key
}

async function railPaneActive($: EngineInterface, context: Context): Promise<boolean> {
  if (context.pane === null) return false
  try {
    return (await tmux($, ['display-message', '-p', '-t', context.pane, '#{pane_active}#{window_active}'])).trim() === '11'
  } catch {
    return false
  }
}

/** A drawing of the rail, its Buttons kept whole for the keys check (a check during a drawing reads the last one). */
function keptButtons<T>(drawn: T): T {
  drawnButtons = new Set(buttonKeys(drawn))
  return drawn
}

async function focusMarked($: EngineInterface) {
  if (markedElement === null) return
  const result = await $.ui.focus({ requestId: PANE, key: markedElement }).catch(() => ({ deny: 'failed' }))
  if (!('deny' in result)) ringElement = markedElement
}

/**
 * The box cleared and the keys back to the cards, the ring on the ▶ card: after a stray key, and on Alt+→ or `r` with text
 * in the box (ensureKeys never takes the keys from a box holding text). As in ensureKeys, only an open with `focus` takes them from the box.
 */
async function keysToCards($: EngineInterface, context: Context | null) {
  if ((await boxText($)) !== '') await $.prompt.fill({ text: '', mode: 'replace' })
  if (context !== null) await openRail($, context, true)
  await focusMarked($)
  // The prompt hint follows the keys; ensureKeys redraws it only when it saw them move.
  $.ui.invalidate('ui.render')
}

/** The prompt box's text; a surface without one (a test) reads as empty. */
async function boxText($: EngineInterface): Promise<string> {
  return $.prompt.read().then(box => box.text, () => '')
}

const STRAY_NOTICE_MS = 4_000

/** A notice on the board, cleared after a few seconds unless another replaced it. */
async function flashBoardNotice($: EngineInterface, notice: string) {
  await update($, boardNotice, () => notice)
  $.clock.after(STRAY_NOTICE_MS, () => {
    void update($, boardNotice, current => (current === notice ? null : current)).catch(() => {})
  })
}

/**
 * After a transition, while the rail's tmux pane is active and the prompt is empty, the list takes the keys, its ring on the ▶ row.
 * Keys the person gave away (Escape) stay with the prompt until the next transition.
 */
async function ensureKeys($: EngineInterface, context: Context) {
  if ((await read($, railMode)) !== 'list') return leaveLauncherOnEscape($, context)
  const active = await railPaneActive($, context)
  // Coming back to the rail's tmux pane, the ring is put on the ▶ row again: a redraw may have moved it unseen.
  if (active && !railWasActive) {
    ringElement = null
    keysClaim = true
  }
  railWasActive = active
  const centre = await read($, centreTicket)
  if (centre !== lastCentre) {
    lastCentre = centre
    keysClaim = true
  }
  const pane = (await $.ui.panes()).find(open => open.id === PANE)
  if (pane === undefined || !pane.isPlaced) return
  // The keys passing between the list and the prompt box: the prompt hint follows; Escape from the list clears the filter (decision 026).
  if (pane.isFocused !== listHadKeys) {
    const gaveAway = listHadKeys && active
    listHadKeys = pane.isFocused
    if (gaveAway && (await read($, boardFilter)) !== '') await update($, boardFilter, () => '')
    if (gaveAway) await dropClose($)
    if (gaveAway) await leaveCandidates($)
    $.ui.invalidate('ui.render')
  }
  if (pane.isFocused && active) keysClaim = false
  // The board's settings hold the ring while open.
  if (pane.isFocused && (await read($, boardSettings))) return
  if (pane.isFocused && ringRests(ringElement, markedElement, drawnButtons) && ringSynced) return
  if (!pane.isFocused) {
    ringElement = null
    if (!active || !keysClaim || (await $.prompt.read()).text !== '') return
    await openRail($, context, true)
    if (!(await $.ui.panes()).some(open => open.id === PANE && open.isFocused)) return
  }
  await focusMarked($)
  if (markedElement !== null && ringElement === markedElement) ringSynced = true
}

/**
 * Escape in the launcher's filter gives the keys to the prompt (an Input never sees Escape):
 * the launcher closes, and the list takes the keys back on its row (closeLauncher's transition).
 */
async function leaveLauncherOnEscape($: EngineInterface, context: Context) {
  const pane = (await $.ui.panes()).find(open => open.id === PANE)
  const focused = pane !== undefined && pane.isPlaced && pane.isFocused
  const gaveAway = launcherHadKeys && !focused && (await railPaneActive($, context))
  launcherHadKeys = focused
  if (gaveAway) await closeLauncher($)
}

/** `c`: the board shows its other list, the ring on that list's first row. */
async function switchList($: EngineInterface) {
  const tab = (await read($, boardTab)) === 'mine' ? 'candidates' : 'mine'
  await update($, boardTab, () => tab)
  const first = boardKeys[tab][0]
  if (first === undefined) return
  await followFocus($, first)
  markedElement = `${tab === 'mine' ? 'row' : 'cand'}:${first}`
  await focusMarked($)
}

/** A ticket id typed in the rail's prompt: the ▶ moves to it (its list shown, the filter cleared); a second ↵ on the row opens it. */
async function railJump($: EngineInterface, id: string) {
  const view = await read($, railView)
  const rows = view.kind === 'rows' ? view.rows : []
  const mine = rows.find(row => row.key.toUpperCase() === id)
  const candidate = boardLists(rows, await read($, linearIssues)).candidates.flatMap(group => group.issues).find(issue => issue.id.toUpperCase() === id)
  const key = mine?.key ?? candidate?.id
  if (key === undefined) {
    await update($, boardNotice, () => `${id} is not on the board`)
    return
  }
  const tab = mine !== undefined ? 'mine' : 'candidates'
  await update($, boardFilter, () => '')
  await update($, boardTab, () => tab)
  await followFocus($, key)
  markedElement = `${tab === 'mine' ? 'row' : 'cand'}:${key}`
  ringElement = null
  keysClaim = true
}

const RAIL_PROMPT_HINT = 'type a ticket id or a filter · esc gives the keys to the list'
const QUIT_WINDOW_MS = 10_000
let quitToken = 0

/** `q`: asks first, for QUIT_WINDOW_MS; `y` closes tower, any other key leaves it. */
async function askQuit($: EngineInterface) {
  await dropClose($)
  const view = await read($, railView)
  const working = view.kind === 'rows' ? view.rows.filter(row => row.session === 'working').length : 0
  await update($, quitAsk, () => working)
  await update($, boardNotice, () => `close tower and every session? y: yes   any key: no${quitWorking(working)}`)
  const token = ++quitToken
  $.clock.after(QUIT_WINDOW_MS, () => {
    if (token === quitToken) void dropQuit($).catch(() => {})
  })
}

function quitWorking(working: number): string {
  return working === 0 ? '' : ` (${working} ${working === 1 ? 'session is' : 'sessions are'} working)`
}

async function dropQuit($: EngineInterface) {
  if ((await read($, quitAsk)) === null) return
  quitToken++
  await update($, quitAsk, () => null)
  await update($, boardNotice, () => null)
}

/** `y` after `q`: tower's own tmux server goes, every session with it; Claude Code keeps the conversations. */
async function quitTower($: EngineInterface) {
  if ((await read($, quitAsk)) === null) return
  await dropQuit($)
  if ((await tmuxSocket($)) === null) {
    await update($, boardNotice, () => 'TOWER_TMUX_SOCKET is not set: CCtower --kill closes tower')
    return
  }
  await tmux($, ['kill-server']).catch(async err => update($, boardNotice, () => firstLine(err instanceof Error ? err.message : String(err))))
}

/** Decision 068: `x` on a session's row asks first; `y` closes it, `n`, Escape or the ring moving on leaves it. */
async function askClose($: EngineInterface, ask: CloseAsk) {
  await dropQuit($)
  await update($, closeAsk, () => ask)
}

async function dropClose($: EngineInterface) {
  if ((await read($, closeAsk)) !== null) await update($, closeAsk, () => null)
}

/**
 * `y` after `x` (decision 068): the session's panes on this Tower's own socket go (a ticket's review pane with it; never
 * the rail's pane), its status records are marked ended, and its row leaves the list at once (a ticket's row stays, without
 * a session: its worktree, branch and state file are untouched). The centre left empty, the rail takes the window back.
 */
async function closeSession($: EngineInterface, context: Context) {
  const ask = await read($, closeAsk)
  if (ask === null) return
  await dropClose($)
  if (ask.role === 'remove' || ask.role === 'start' || ask.role === 'hide' || ask.role === 'promote') return
  const roles = ask.role === 'ticket' ? ['ticket', 'review'] : [ask.role]
  let centred = false
  try {
    if (context.pane === null) throw new Error('not running in a tmux pane')
    const panes = parsePaneListing(await tmux($, ['list-panes', '-a', '-F', PANE_LISTING_FORMAT]))
    const railWindow = panes.find(pane => pane.id === context.pane)?.window
    const targets = panes.filter(pane => pane.id !== context.pane && pane.role !== 'rail' && roles.includes(pane.role) && pane.ticket === ask.key)
    centred = targets.some(pane => pane.window === railWindow)
    for (const pane of targets) await tmux($, ['kill-pane', '-t', pane.id]).catch(() => '')
  } catch (err) {
    await showError($, err)
    return
  }
  if (context.state !== null) {
    const now = await $.clock.now()
    for (const status of await readStatuses($, context.state)) {
      if (!roles.includes(status.role) || status.ticket !== ask.key || status.state === 'ended') continue
      await $.fs.write(`${sessionsDir(context.state)}/${status.id}.json`, JSON.stringify({ ...status, state: 'ended', updatedAt: now })).catch(() => {})
    }
  }
  await update($, railView, view => {
    if (view.kind !== 'rows') return view
    if (ask.role === 'free') return { ...view, free: (view.free ?? []).filter(row => row.key !== ask.key) }
    if (ask.role === 'hub') return { ...view, hubs: view.hubs.filter(hub => hub.key !== ask.key) }
    const local = view.local[ask.key]
    return {
      ...view,
      rows: view.rows.map(row => (row.key === ask.key ? { ...row, session: null, agents: 0, agent: null, waiting: null } : row)),
      local: local === undefined ? view.local : { ...view.local, [ask.key]: { ...local, sessions: [] } },
    }
  })
  if (centred) await applyCentre($, context, null)
  await flashBoardNotice($, `${ask.name} closed`)
}

async function openRail($: EngineInterface, context: Context, focus: boolean) {
  const height = await railPaneHeight($, context)
  await update($, railHeight, () => height)
  // The rail runs in the main-screen layout: inline at full width, down to Claude Code's prompt box.
  const rows = height !== null && height - BELOW_RAIL_ROWS > 0 ? height - BELOW_RAIL_ROWS : undefined
  try {
    await $.ui.open({ id: PANE, title: PANE_TITLE, ...(focus ? { focus: true } : {}), ...(rows !== undefined ? { rows } : {}) })
  } catch {
    // Not placed (a narrow main screen): /tower opens it on demand.
  }
}

async function startRail($: EngineInterface, context: Context) {
  await $.command.register({ name: 'tower', description: 'Open and focus the tower ticket rail' })
  await startHomeKeys($, context)
  await openRail($, context, true)
  await refreshRail($, context)
  // Decision 060: a free Tower opens with one free session in its folder, in the centre, the keys on it. Decision 064: the
  // start menu's Git repository (TOWER_FREE_START=setup) starts it on /tower:tower-setup; a design Tower opens its design session.
  const opened = await read($, railView)
  if (noProject() && context.repo !== null && opened.kind === 'rows' && (opened.free ?? []).length === 0) {
    if (designTower()) await openDesignSession($, context)
    else if ((await $.env.get('TOWER_FREE_START')) === 'setup') await openSkillSession($, context, context.repo, 'tower-setup')
    else await openFreeSession($, context, context.repo)
  }
  void refreshLinear($).catch(() => {})
  $.clock.every(RAIL_REFRESH_MS, () => {
    void refreshRail($, context)
  })
  $.clock.every(ATTENTION_CHECK_MS, () => {
    void checkAttention($, context).catch(() => {})
  })
  $.clock.every(LINEAR_REFRESH_MS, () => {
    void refreshLinear($).catch(() => {})
  })
  $.clock.every(LAYOUT_CHECK_MS, () => {
    void checkLayout($, context)
  })
  $.clock.every(KEYS_CHECK_MS, () => {
    void ensureKeys($, context).catch(() => {})
  })
}

// ── Chat zone (work sessions) ──────────────────────────────────────────────

async function loadExplain($: EngineInterface) {
  const mode = explainMode(await $.store.get(explainKey(await $.session.cwd())))
  await update($, explainState, () => mode)
}

async function chooseExplain($: EngineInterface, mode: ExplainMode) {
  await update($, explainState, () => mode)
  await $.store.set(explainKey(await $.session.cwd()), mode)
}

// ── Settings ──────────────────────────────────────────────────────────────

/** The person's settings as this session last read them from the store; the defaults until the first read (a hot reload starts here too). */
let towerSettings: Settings = DEFAULT_SETTINGS

const SETTINGS_CHECK_MS = 2_000

/** The rows the advanced view adds to an agent card: a tail of its last ADVANCED_TAIL tool calls and a requests line. */
const ADVANCED_TAIL = 6
const ADVANCED_CARD_ROWS = ADVANCED_TAIL + 1

/** The shared settings file; its first read moves the value the store held before (decision 020) into it. */
const SETTINGS_FILE = 'settings.json'
let settingsMigrated = false

/** Reads the shared settings; a change made in another session redraws this one's panes. */
async function loadSettings($: EngineInterface) {
  await loadAway($)
  await loadModelBlock($)
  // The ghostty theme's colours (decision 039): a new launch's palette redraws this session's panes.
  if (usePalette(await readShared($, PALETTE_FILE))) $.ui.invalidate('ui.render')
  let value = await readShared($, SETTINGS_FILE)
  if (value === undefined && !settingsMigrated) {
    settingsMigrated = true
    const state = await towerState($)
    const old = await $.store.get(SETTINGS_KEY).catch(() => undefined)
    if (state !== null && old !== undefined && !(await $.fs.exists(`${state}/${SETTINGS_FILE}`).catch(() => true))) {
      await writeShared($, SETTINGS_FILE, parseSettings(old)).catch(() => {})
      value = old
    }
  }
  const stored = parseSettings(value)
  if (sameSettings(stored, towerSettings)) return
  towerSettings = stored
  $.ui.invalidate('ui.render')
}

/** The design state file's modification time at its last read; undefined until this module read it. */
let designMtime: number | null | undefined

/**
 * Decision 064: a design Tower's `.tower/design.json`, on the 2 s settings check: stat first, the file read again only
 * when its time changed; a work session (the deck) also asks which stage documents exist. Redraws only on a change.
 */
async function loadDesign($: EngineInterface) {
  if (!designTower()) return
  const folder = (await $.env.get('TOWER_REPO')) || null
  if (folder === null) return
  const path = `${folder.replace(/\/+$/, '')}/${DESIGN_STATE_PATH}`
  const mtime = await $.fs.stat(path).then(stat => stat.mtimeMs, () => null)
  const current = await read($, designView)
  let state = current.state
  // Read again when the time changed, and while nothing readable was kept (a file caught mid-write, a fresh host state).
  if (mtime !== designMtime || (state === null && mtime !== null)) {
    state = mtime === null ? null : parseDesignState(await readTextFile($, path))
    designMtime = mtime
  }
  const docs: Record<string, boolean> = {}
  if (state !== null && isWorkRole((await sessionRole($)) ?? 'rail')) {
    for (const doc of designDocuments(state)) {
      const where = documentPath(folder, doc)
      docs[String(doc.n)] = where === null ? true : await $.fs.exists(where).catch(() => false)
    }
  }
  const next: TowerDesignView = { state, docs }
  if (JSON.stringify(next) !== JSON.stringify(current)) await update($, designView, () => next)
}

async function saveSettings($: EngineInterface, next: Settings) {
  towerSettings = next
  $.ui.invalidate('ui.render')
  await writeShared($, SETTINGS_FILE, next)
}

// ── Fable's limit (decision 032) ──────────────────────────────────────────────

/** The shared Fable block file (decision 032): every session falls back with it. */
const MODEL_BLOCK_FILE = 'model-block.json'

/** The Fable block as this session last read it from its file; TOWER_NO_FABLE=1 at launch, read with it. */
let modelBlock: ModelBlock | null = null
/** The rate-limit windows the board shows (decision 034): the newest a work session's status file carried. */
let boardLimits: TowerLimits | undefined
let noFableEnv = false
/** The model the main loop's last request named, for a refusal that follows. */
let lastMainModel: string | null = null

async function loadModelBlock($: EngineInterface) {
  noFableEnv = ((await $.env.get('TOWER_NO_FABLE')) || '') === '1'
  const stored = parseModelBlock(await readShared($, MODEL_BLOCK_FILE))
  if (JSON.stringify(stored) === JSON.stringify(modelBlock)) return
  modelBlock = stored
  $.ui.invalidate('ui.render')
}

/** Decision 034: raise the Fable block ahead of a limit forecast to run out before its reset, within 20 minutes. */
async function noteForecast($: EngineInterface, deck: TowerDeck) {
  const now = await $.clock.now()
  const block = earlyBlock({
    fable: towerSettings.fable, early: towerSettings.fableEarly, noFableEnv, mainModel: lastMainModel ?? deck.main.model, block: modelBlock, limits: deck.usage.limits, now,
  })
  if (block === null) return
  modelBlock = block
  $.ui.invalidate('ui.render')
  await writeShared($, MODEL_BLOCK_FILE, block).catch(() => {})
  $.ui.toast(blockToast(block, now))
}

/** What the last micro compaction dropped (decision 034), for the line that reports it. */
let lastMicro: { reads: number; replies: number } | null = null

/** Runs `/compact micro` between turns and says what it did, with the context before and after. */
async function compactMicro($: EngineInterface): Promise<string> {
  const percent = async () => (await $.session.usage().catch(() => null))?.context.percent ?? null
  const spent = async () => (await $.session.usage().catch(() => null))?.cost?.usd ?? null
  const before = await percent()
  const costBefore = await spent()
  lastMicro = null
  try {
    // As the person's `/compact micro`: `$.session.compact` skips this plugin's own session.compact hook, and core would summarize.
    await $.command.run({ command: 'compact', args: MICRO_INSTRUCTIONS })
  } catch (err) {
    return `compact micro: not now · ${firstLine(String(err))}`
  }
  const after = await percent()
  const dropped = lastMicro as { reads: number; replies: number } | null
  const costAfter = await spent()
  const figures = (before === null ? '' : ` · context ${before}% → ${after ?? '?'}%`) + (costBefore !== null && costAfter !== null && costAfter > costBefore ? ` · cost +$${(costAfter - costBefore).toFixed(3)}` : '')
  return `compact micro: ${dropped?.reads ?? 0} old Read results and the thinking of ${dropped?.replies ?? 0} replies dropped${figures}`
}

/** The board header's pace chips (decision 034): the five-hour window's, from the newest status file (the demo's deck under TOWER_DEMO). */
async function boardPaces($: EngineInterface, now: number) {
  const limits = (await isDemo($)) ? demoDeck(now).usage.limits : boardLimits
  const pace = windowPace(limits?.fiveHour, WINDOW_MS['5h'], now)
  return pace === null ? [] : [{ label: '5h', pace }]
}

/** What `resolveModel` reads: `off` when the person turned Fable off, else the shared block. */
function fableBlock(): ModelBlock | 'off' | null {
  return towerSettings.fable === 'off' || noFableEnv ? 'off' : modelBlock
}

/** A Fable request refused for its limit: every session falls back until it resets (or an hour), with one toast here. */
async function noteLimit($: EngineInterface, error: string, details: string | null) {
  const usage = await $.session.usage().catch(() => null)
  const found = fableBlocked({ error, details, model: lastMainModel, rateLimits: usage?.rateLimits ?? [] })
  if (found === null) return
  const now = await $.clock.now()
  const block: ModelBlock = { family: 'fable', until: found.until, since: now }
  modelBlock = block
  $.ui.invalidate('ui.render')
  await writeShared($, MODEL_BLOCK_FILE, block).catch(() => {})
  $.ui.toast(blockToast(block, now))
}

// ── Away mode (decision 023) ────────────────────────────────────────────────
// A ticket moves only through `/open-pr`, its own questions, then the review in a new session and its post question.

/** The shared away file (decision 023). */
const AWAY_FILE = 'away.json'

/** Away as this session last read it from its file. */
let awayState: Away = AWAY_OFF
/** This ticket session ran `/open-pr` / opened the review for away mode: once each. */
let awayRanOpenPr = false
let awayOpenedReview = false
let awayPending = false
/** The rail: the tickets away mode started this away period, with when. */
const awayDriven = new Map<string, { at: number; step: string }>()
const AWAY_LIVE_GRACE_MS = 60_000

async function loadAway($: EngineInterface) {
  const stored = parseAway(await readShared($, AWAY_FILE))
  if (JSON.stringify(stored) === JSON.stringify(awayState)) return
  const turnedOn = stored.on && !awayState.on
  awayState = stored
  if (!stored.on) awayDriven.clear()
  $.ui.invalidate('ui.render')
  if (!turnedOn) return
  const context = await readContext($)
  // Turned on while this session is idle: it moves now, not at its next turn.
  if (context !== null && isWorkRole(context.role) && !deckBusy(await read($, deckState))) await awayAct($, context, '')
}

/** `a` on the board, or the settings line: on; off shows what moved, then forgets it. */
async function setAway($: EngineInterface, on: boolean) {
  const stored = parseAway(await readShared($, AWAY_FILE))
  if (on === stored.on) return
  if (on) awayState = awayOn(stored, await $.clock.now())
  else {
    const notice = awayNotice(stored)
    await update($, boardNotice, () => notice ?? 'away: nothing moved')
    awayState = { ...awayOff(stored), moved: [] }
    awayDriven.clear()
  }
  $.ui.invalidate('ui.render')
  await writeShared($, AWAY_FILE, awayState)
}

/** One move into the store's list (the board's notice at return) and the deck log. */
async function awayRecord($: EngineInterface, ticket: string, step: string, logText: string) {
  const now = await $.clock.now()
  await observe($, deck => logged(deck, { at: now, who: 'away', text: logText }))
  if (step === '') return
  const stored = parseAway(await readShared($, AWAY_FILE))
  if (!stored.on) return
  awayState = awayMoved(stored, { ticket, step, at: now })
  await writeShared($, AWAY_FILE, awayState)
}

/** A ticket session, idle with away on: the step the rule allows, or nothing. The review is posted by refreshReview (decision 025). */
async function awayAct($: EngineInterface, context: Context, answer: string) {
  if (!awayState.on || awayPending || context.ticket === null || context.role !== 'ticket') return
  const ticket = context.ticket
  const step = (await ownStep($, ticket, await $.session.cwd(), false)).next
  const action = awayNext(step, answer, config().workflow, config().waits)
  if (action === null) return
  if (action.kind === 'answer') {
    await awayRecord($, ticket, '', `→ ${action.text}`)
    await $.prompt.submit({ text: action.text })
    return
  }
  if (action.kind === 'review') {
    if (awayOpenedReview) return
    awayOpenedReview = true
    // The REVIEW box's start (decision 025); a review already running is not started or counted again.
    if (await startReview($, context)) await awayRecord($, ticket, 'review', `→ review ${action.pr}`)
    return
  }
  if (awayRanOpenPr) return
  awayRanOpenPr = true
  awayPending = true
  const command = action.command
  await update($, bandNotice, () => `away → /${command} in ${AWAY_DELAY_MS / 1000} s`)
  $.clock.after(AWAY_DELAY_MS, () => {
    void (async () => {
      awayPending = false
      await update($, bandNotice, () => null)
      if (!awayState.on || deckBusy(await read($, deckState))) return
      await awayRecord($, ticket, `/${command}`, `→ /${command}`)
      await $.command.run({ command })
    })().catch(() => {})
  })
}

/** The rail, away on: starts the tickets the rule moves in parked windows, at most two at a time. */
async function awayStartTickets($: EngineInterface, context: Context) {
  if (!awayState.on || context.pane === null || (await read($, openingTicket)) !== null) return
  const view = await read($, railView)
  if (view.kind !== 'rows') return
  const remotes = await read($, remoteDetails)
  const now = await $.clock.now()
  const live = (key: string) => view.rows.some(row => row.key === key && row.session !== null)
  const driving = [...awayDriven].filter(([key, started]) => live(key) || now - started.at < AWAY_LIVE_GRACE_MS).map(([key]) => key)
  const candidates = view.rows
    .filter(row => !awayDriven.has(row.key))
    .map((row, index) => ({ row, key: row.key, step: rowStep(row, remotes[row.key]?.pullRequest ?? null, [], config().workflow).next, live: row.session !== null, since: index }))
  for (const key of awayToStart(candidates, driving, config().workflow)) {
    const candidate = candidates.find(entry => entry.key === key)
    if (candidate === undefined) continue
    awayDriven.set(key, { at: now, step: candidate.step ?? '' })
    try {
      const { railWindow } = await readLayout($, context.pane)
      const session: WorkSession = { ...ticketSession(candidate.row, null), away: true }
      const tag = await newWorkTag($, session.role)
      const args = await workSessionArgs($, context, session, tag)
      // Parked from the start (-d): the screen stays where it is; Enter on the row brings the group in.
      const pane = await tmux($, ['new-window', '-d', '-a', '-t', railWindow, '-P', '-F', '#{pane_id}', '-n', session.key, ...args])
      await markWorkPane($, context, pane, session, tag)
    } catch (err) {
      await showError($, err)
    }
  }
}

/** The REVIEW box's post key (decision 025); `p` is the deck's settings tab. */
const REVIEW_POST_KEY = 'c'

/** The settings view's label column: `review post` and a space. */
const SETTINGS_LABEL = 13

/** The settings view, in the deck and in the board's detail column: one Button per choice, the chosen one in the text colour. */
function settingsBody($: EngineInterface, els: Elements, close: () => Promise<void>) {
  const { Box, Text, Button } = els
  const now = towerSettings
  const choice = (key: string, label: string, chosen: boolean, next: () => Settings) => (
    <Button key={key} label={label} plain dimColor={!chosen} onPress={async () => saveSettings($, next())} />
  )
  const row = (name: string, items: JSX.Element[]) => (
    <Box key={`row:${name}`} flexDirection="row">
      <Box width={SETTINGS_LABEL} flexShrink={0}><Text dimColor>{name}</Text></Box>
      <Box flexDirection="row" flexWrap="wrap" flexShrink={1}>
        {items.map((item, index) => <Box key={`item:${name}:${index}`} flexShrink={0}>{item}{index < items.length - 1 ? <Text>{'   '}</Text> : null}</Box>)}
      </Box>
    </Box>
  )
  return (
    <Box flexDirection="column">
      {row('view', VIEW_LEVELS.map(level =>
        choice(`set:view:${level}`, `${now.view === level ? '●' : '○'} ${level}`, now.view === level, () => ({ ...towerSettings, view: level }))))}
      {row('modules', MODULE_NAMES.filter(name => !ATTENTION_MODULES.includes(name)).map(name =>
        choice(`set:module:${name}`, `${now.modules[name] ? '☑' : '☐'} ${MODULE_LABELS[name]}`, now.modules[name], () => toggleModule(towerSettings, name))))}
      {row('attention', ATTENTION_MODULES.map(name =>
        choice(`set:module:${name}`, `${now.modules[name] ? '☑' : '☐'} ${MODULE_LABELS[name]}`, now.modules[name], () => toggleModule(towerSettings, name))))}
      {row('theme', [
        // `launch`: no theme chosen, the launch's TOWER_THEME or the plugin option decides.
        choice('set:theme:launch', `${now.theme === null ? '●' : '○'} launch`, now.theme === null, () => ({ ...towerSettings, theme: null })),
        ...THEME_NAMES.map(name =>
          choice(`set:theme:${name}`, `${now.theme === name ? '●' : '○'} ${name}`, now.theme === name, () => ({ ...towerSettings, theme: name }))),
      ])}
      <Box paddingLeft={SETTINGS_LABEL}><Text dimColor wrap="wrap">Claude Code's own frame and tmux follow the theme at the next launch</Text></Box>
      {row('fable', FABLE_CHOICES.map(choiceName =>
        choice(`set:fable:${choiceName}`, `${now.fable === choiceName ? '●' : '○'} ${choiceName}`, now.fable === choiceName, () => ({ ...towerSettings, fable: choiceName }))))}
      {row('fable early', FABLE_EARLY_CHOICES.map(choiceName =>
        choice(`set:fableEarly:${choiceName}`, `${now.fableEarly === choiceName ? '●' : '○'} ${choiceName}`, now.fableEarly === choiceName, () => ({ ...towerSettings, fableEarly: choiceName }))))}
      {row('review post', REVIEW_POST_CHOICES.map(choiceName =>
        choice(`set:reviewPost:${choiceName}`, `${now.reviewPost === choiceName ? '●' : '○'} ${choiceName}`, now.reviewPost === choiceName, () => ({ ...towerSettings, reviewPost: choiceName }))))}
      {row('aside model', ASIDE_MODEL_CHOICES.map(choiceName =>
        choice(`set:asideModel:${choiceName}`, `${now.asideModel === choiceName ? '●' : '○'} ${choiceName}`, now.asideModel === choiceName, () => ({ ...towerSettings, asideModel: choiceName }))))}
      {row('pin nudge', PIN_NUDGE_CHOICES.map(choiceName =>
        choice(`set:pinNudge:${choiceName}`, `${now.pinNudge === choiceName ? '●' : '○'} ${choiceName}`, now.pinNudge === choiceName, () => ({ ...towerSettings, pinNudge: choiceName }))))}
      {row('safety', SAFETY_CHOICES.map(choiceName =>
        choice(`set:safety:${choiceName}`, `${now.safety === choiceName ? '●' : '○'} ${choiceName}`, now.safety === choiceName, () => ({ ...towerSettings, safety: choiceName }))))}
      {row('away', [
        <Button key="set:away:off" label={`${awayState.on ? '○' : '●'} off`} plain dimColor={awayState.on} onPress={async () => setAway($, false)} />,
        <Button key="set:away:on" label={`${awayState.on ? '●' : '○'} on`} plain dimColor={!awayState.on} onPress={async () => setAway($, true)} />,
      ])}
      <Text> </Text>
      <Text dimColor wrap="wrap">settings are kept in Claude Code's plugin store and apply to every tower session</Text>
      <Text> </Text>
      <Button key="set:close" label="close" hotkey="x" plain dimColor onPress={close} />
    </Box>
  )
}

/** The dim suggestion in the empty prompt: what the person would type for the session's next step. */
async function suggestNext($: EngineInterface, context: Context, lastAnswer: string) {
  if (context.role !== 'ticket') return
  await update($, bandNotice, () => null)
  const text = ghostText({ next: await read($, ownNext) }, lastAnswer, config().workflow)
  if (text !== null) await $.prompt.suggest({ text }).catch(() => {})
}

// ── Review session (decision 025) ─────────────────────────────────────────
// `v` in the REVIEW box: a Claude Code session in a hidden parked window runs `/review <n>` and the mod answers its
// post question; `v` again runs the next round in the same session; `o` shows it under the ticket, `x` there hides it.

const REVIEW_SIZE = '45%'
const REVIEW_REFRESH_MS = 5_000
const REVIEW_PR_MS = 15_000
/** Decision 046: a review session's turn ended; its ticket session reads the review and the PR at once. */
const REVIEW_CHECK_COMMAND = 'tower-review-check'
/** When the ticket session last read its pull request for a running round. */
let reviewPrReadAt = 0

async function listPanes($: EngineInterface) {
  return parsePaneListing(await tmux($, ['list-panes', '-a', '-F', PANE_LISTING_FORMAT]))
}

/** The newest live status record of this ticket's review session. */
async function reviewStatus($: EngineInterface, context: Context): Promise<TowerSessionStatus | null> {
  if (context.state === null || context.ticket === null) return null
  const now = await $.clock.now()
  const live = (await readStatuses($, context.state)).filter(status => status.role === 'review' && status.ticket === context.ticket && isAlive(status, now))
  return live.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
}

/** The REVIEW box's start, for `v` and away mode: true when a round started. */
async function startReview($: EngineInterface, context: Context): Promise<boolean> {
  const ticket = context.ticket
  if (ticket === null || context.pane === null || context.pluginDir === null) return false
  const pullRequest = (await read($, remoteDetails))[ticket]?.pullRequest ?? null
  const pr = reviewTarget(await read($, ownNext), pullRequest, config().workflow)
  if (pr === null) {
    await flashBandNotice($, 'no pull request to review yet')
    return false
  }
  const running = await read($, reviewRun)
  // A round not posted yet takes no new one, unless its session waits idle for the person (decision 046).
  if (running !== null && running.postedAt === null && reviewBox(pullRequest, running, await read($, reviewPeer))?.kind !== 'idle') return false
  // The round's start count from a fresh `gh pr view`, never the cache: a stale count would make the PR's
  // earlier rounds read as this round posted (decision 025).
  const worktree = await $.session.cwd()
  const fresh = await readPullRequest($, worktree)
  if (fresh.kind !== 'pr') {
    await flashBandNotice($, 'could not read the PR comments')
    return false
  }
  const rounds = fresh.rounds ?? 0
  try {
    const existing = reviewPane(await listPanes($), ticket)
    if (existing !== null) {
      // The same session, its context kept: the skill reads the earlier rounds and posts the next one.
      const status = await reviewStatus($, context)
      const sent = status === null ? null : await $.session.send({ to: { sessionId: status.id }, text: encodeCommand({ command: config().review.skill, args: renderTemplate(config().review.args, { pr: String(pr) }) }) })
      if (sent === null || !sent.isDelivered) {
        await flashBandNotice($, 'the review session did not take the round')
        return false
      }
    } else {
      await refreshRoutingOverrides($)
      const skill = routingProfile().skills.find(candidate => candidate.name === config().review.skill)
      const wanted = ((await $.env.get('TOWER_SESSION_MODEL')) || null) ?? (skill !== undefined && skill.model !== null ? routingProfile().modelIds[skill.model] ?? skill.model : null)
      const { model, effort } = launchFlags(wanted, skill?.effort ?? null, await $.clock.now())
      const settings = sessionSettings({ role: 'review', pluginDir: context.pluginDir, theme: themeChoice(await $.env.get('TOWER_THEME'), themeOption, towerSettings.theme), allow: config().permissions?.allow })
      const tag = await newWorkTag($, 'review')
      const socket = await tmuxSocket($)
      const themeEnv = (await $.env.get('TOWER_THEME')) || null
      const cwd = context.repo ?? (await $.session.cwd())
      // new-window takes a window, never a pane ("can't specify pane here"): the ticket pane's window.
      const ticketWindow = (await tmux($, ['display-message', '-p', '-t', context.pane, '#{window_id}'])).trim()
      const pane = await tmux($, [
        // Hidden from the start (-d): a parked window of its own; `l` brings it under the ticket.
        'new-window', '-d', '-a', '-t', ticketWindow, '-n', `${ticket}-review`, '-c', cwd, '-P', '-F', '#{pane_id}',
        '-e', 'TOWER_ROLE=review',
        '-e', `TOWER_TICKET=${ticket}`,
        '-e', `TOWER_PR=${pr}`,
        '-e', `TOWER_WORKTREE=${worktree}`,
        '-e', `TOWER_REPO=${context.repo ?? ''}`,
        '-e', `TOWER_PLUGIN_DIR=${context.pluginDir}`,
        '-e', `TOWER_TAG=${tag}`,
        ...(socket !== null ? ['-e', `TOWER_TMUX_SOCKET=${socket}`] : []),
        ...(themeEnv !== null ? ['-e', `TOWER_THEME=${themeEnv}`] : []),
        ...(model !== null ? ['-e', `TOWER_MAIN_MODEL=${model}`] : []),
        ...(effort !== null ? ['-e', `TOWER_MAIN_EFFORT=${effort}`] : []),
        '-e', 'CLAUDE_CODE_TMUX_TRUECOLOR=1',
        '-e', 'COLORTERM=truecolor',
        ...skillCommand(context.pluginDir, model, effort, reviewCommand(pr), false, settings),
      ])
      await tmux($, ['set-option', '-p', '-t', pane, '@tower_role', 'review'])
      await tmux($, ['set-option', '-p', '-t', pane, '@tower_title', reviewTitle(ticket, pr)])
      await tmux($, ['set-option', '-p', '-t', pane, '@tower_ticket', ticket])
      await tmux($, ['set-option', '-p', '-t', pane, '@tower_tag', tag])
    }
  } catch (err) {
    await flashBandNotice($, firstLine(err instanceof Error ? err.message : String(err)))
    return false
  }
  const now = await $.clock.now()
  reviewPrReadAt = now
  await update($, reviewPeer, () => null)
  await update($, reviewRun, () => ({ pr, round: rounds + 1, startedAt: now, baseRounds: rounds, postedAt: null }))
  return true
}

/** Decision 074: the gh account's login (`gh api user`), kept once read; null when gh could not say, asked again on the next need. */
let ghViewer: Promise<string | null> | null = null

function viewerLogin($: EngineInterface): Promise<string | null> {
  ghViewer ??= $.process.run(['gh', 'api', 'user', '--jq', '.login'], { timeoutMs: 15_000 })
    .then(result => (result.exitCode === 0 && result.stdout.trim() !== '' ? result.stdout.trim() : null))
    .catch(() => null)
    .then(login => {
      if (login === null) ghViewer = null
      return login
    })
  return ghViewer
}

/** The running round posted on this read of the PR (roundPosted); the viewer is asked only when a GitHub review is on it (decision 074). */
async function postedOnPr($: EngineInterface, run: ReviewRun, pullRequest: TowerPullRequest | undefined): Promise<boolean> {
  if (pullRequest?.kind !== 'pr') return false
  const viewer = (pullRequest.posts ?? []).some(post => post.kind === 'review') ? await viewerLogin($) : null
  return roundPosted(run, pullRequest, viewer)
}

/**
 * Every 5 s in a ticket session while a round runs: the review session's status, the PR every 15 s; `force` (the
 * review session's turn ended, decision 046) reads the PR at once, as does a post the review session reports.
 */
async function refreshReview($: EngineInterface, force = false) {
  const context = await readContext($)
  if (context === null || context.role !== 'ticket' || context.ticket === null) return
  const run = await read($, reviewRun)
  if (run === null || run.postedAt !== null) return
  const ticket = context.ticket
  const status = await reviewStatus($, context)
  const now = await $.clock.now()
  const peer: ReviewPeer | null = status === null ? null
    : {
      state: status.state, since: status.since, action: status.review?.action ?? '', asks: status.review?.asks ?? null,
      waiting: isRealWait(status.waiting, now) ? status.waiting.text : null, shown: status.review?.shown ?? false, body: status.review?.body ?? null,
      posted: status.review?.posted === true,
    }
  await update($, reviewPeer, () => peer)
  // The review session is gone (closed outside tower): the box falls back to the PR, `v` starts a new one.
  if (status === null && now - run.startedAt > REVIEW_PR_MS * 2 && reviewPane(await listPanes($), ticket) === null) {
    await update($, reviewRun, () => null)
    return
  }
  // Posted by hand or by the review session: only a fresh `gh pr view` says so, never the cache: more self-review
  // comments than at the round's start (decision 025), or the round's review posted otherwise (decision 074).
  let freshPosted = false
  // Decision 046: a reported post is verified on the PR, read at once, then every 15 s for 2 minutes.
  const reported = peer !== null && peer.state !== 'working' && peer.since >= run.startedAt && peer.posted === true && run.verifying === undefined && run.failed === undefined
  if (reported) await update($, reviewRun, current => (current === null || current.postedAt !== null ? current : { ...current, verifying: now }))
  if (force || reported || now - reviewPrReadAt >= REVIEW_PR_MS) {
    reviewPrReadAt = now
    const pullRequest = await readPullRequest($, await $.session.cwd())
    if (pullRequest.kind === 'pr') {
      freshPosted = await postedOnPr($, run, pullRequest)
      await update($, remoteDetails, all => ({ ...all, [ticket]: { loadedAt: now, pullRequest, behind: all[ticket]?.behind ?? null } }))
    }
  }
  if (freshPosted) {
    await update($, reviewRun, current => {
      if (current === null) return null
      const { verifying: _verifying, ...rest } = current
      return { ...rest, postedAt: now }
    })
    return
  }
  const verifyRun = await read($, reviewRun)
  if (verifyRun !== null && reviewVerifyExpired(verifyRun, now)) {
    await update($, reviewRun, current => {
      if (current === null) return null
      const { verifying: _verifying, ...rest } = current
      return { ...rest, failed: 'post not found on PR' }
    })
    return
  }
  const cached = (await read($, remoteDetails))[ticket]?.pullRequest
  const rounds = cached?.kind === 'pr' ? cached.rounds ?? 0 : 0
  // A post cut short by a reload leaves no `posting` behind; a review ready waits for the key, unless auto or away.
  if (run.posting === true && !reviewPosting) await update($, reviewRun, current => {
    if (current === null) return null
    const { posting: _posting, ...rest } = current
    return rest
  })
  if (run.body !== undefined) {
    if (run.failed === undefined && (towerSettings.reviewPost === 'auto' || awayState.on)) await postReview($)
    return
  }
  // The review shown and saved in this round's last turn: tower posts it, or waits for the key (decision 025).
  const fresh = peer !== null && peer.state !== 'working' && peer.since >= run.startedAt
  if (!fresh || run.failed !== undefined || peer.body === null || peer.body === undefined) return
  const body = peer.body
  const text = await $.fs.read(body).catch(() => null)
  const decision = reviewPostDecision({
    setting: towerSettings.reviewPost, away: awayState.on, shown: peer.shown === true,
    bodyLength: text === null ? null : text.trim().length, rounds, baseRounds: run.baseRounds, postedElsewhere: await postedOnPr($, run, cached),
  })
  if (decision === 'none') return
  await update($, reviewRun, current => (current === null || current.postedAt !== null ? current : { ...current, body }))
  if (decision === 'post') await postReview($)
}

/** The review guidance with the absolute folder its file goes to: the ticket's worktree (TOWER_WORKTREE). */
function reviewGuidanceFor(worktree: string): string {
  return routingProfile().reviewGuidance.replaceAll('<worktree>', worktree.replace(/\/+$/, ''))
}

/**
 * This session's Claude scratchpad, `<tmp>/claude-<uid>/<cwd with - for every other character>/<session id>/scratchpad`:
 * the folder of its cwd first, else any folder that holds this session's; null when none is found.
 */
async function scratchpadDir($: EngineInterface): Promise<string | null> {
  const id = await $.session.id()
  const slug = (await $.session.cwd()).replace(/[^A-Za-z0-9]/g, '-')
  for (const tmp of ['/private/tmp', '/tmp']) {
    const owners = (await $.fs.list(tmp).catch(() => [])).filter(entry => entry.name.startsWith('claude-')).map(entry => `${tmp}/${entry.name}`)
    for (const owner of owners) if (await $.fs.exists(`${owner}/${slug}/${id}/scratchpad`).catch(() => false)) return `${owner}/${slug}/${id}/scratchpad`
    for (const owner of owners) {
      for (const project of await $.fs.list(owner).catch(() => [])) {
        const dir = `${owner}/${project.name}/${id}/scratchpad`
        if (await $.fs.exists(dir).catch(() => false)) return dir
      }
    }
  }
  return null
}

/**
 * The review session's file to post for the review its answer shows (decision 025): the file the answer names or
 * the round's file in the save path's folder under `<worktree>`, when it reads as this round's review; else the
 * review taken from the answer itself, written to `<worktree>/<review.savePath>` (e.g.
 * `.work/review/pr-<n>-round-<N>.md`); else null. Only the review is posted, never the reply options after it.
 */
async function reviewBodyFile($: EngineInterface, answer: string): Promise<string | null> {
  const cwd = await $.session.cwd()
  const worktree = ((await $.env.get('TOWER_WORKTREE')) || null)
  const pr = Number((await $.env.get('TOWER_PR')) ?? '')
  const review = config().review
  const round = reviewRound(answer, review)
  const folder = reviewSaveFolder(worktree ?? cwd, review.savePath)
  const saved = await $.fs.list(folder).then(entries => entries.map(entry => entry.name)).catch(() => [] as string[])
  const scratchpad = await scratchpadDir($).catch(() => null)
  const named = reviewBodyPath(answer, { cwd, worktree, scratchpad }, pr, saved, review.savePath)
  if (named !== null) {
    const text = await $.fs.read(named).catch(() => null)
    if (typeof text === 'string' && reviewShown(text, review) && reviewRound(text, review) === round) return named
  }
  const body = extractReviewBody(answer, review)
  if (body === null || !Number.isFinite(pr) || pr <= 0) return null
  const path = `${(worktree ?? cwd).replace(/\/+$/, '')}/${renderTemplate(review.savePath, { pr: String(pr), round: String(round) })}`
  await $.fs.write(path, `${body}\n`)
  return path
}

/**
 * The saved review the review session's answer names (reviewNamedPath, never a guess in the folder) and its text;
 * null without one, or when it cannot be read. How a review shown in another language is recognised (decision 079).
 */
async function namedReviewFile($: EngineInterface, answer: string): Promise<{ path: string; text: string } | null> {
  const cwd = await $.session.cwd()
  const worktree = ((await $.env.get('TOWER_WORKTREE')) || null)
  const scratchpad = await scratchpadDir($).catch(() => null)
  const path = reviewNamedPath(answer, { cwd, worktree, scratchpad })
  if (path === null) return null
  const text = await $.fs.read(path).catch(() => null)
  return typeof text === 'string' ? { path, text } : null
}

/** Set while `gh pr comment` runs: one post at a time. */
let reviewPosting = false

/**
 * Tower posts the saved review as the person's tool (decision 025): `gh pr comment <n> --body-file <file>` in the
 * ticket's worktree, never twice for a round (its flag, then the PR's self-review comments read again).
 */
async function postReview($: EngineInterface) {
  const run = await read($, reviewRun)
  if (reviewPosting || run === null || run.postedAt !== null || run.body === undefined || run.failed !== undefined) return
  reviewPosting = true
  const body = run.body
  const finish = (change: Partial<ReviewRun>) => update($, reviewRun, current => {
    if (current === null || current.pr !== run.pr || current.startedAt !== run.startedAt) return current
    const { posting: _posting, ...rest } = current
    return { ...rest, ...change }
  })
  try {
    await update($, reviewRun, current => (current === null ? null : { ...current, posting: true as const }))
    const cwd = await $.session.cwd()
    const pullRequest = await readPullRequest($, cwd)
    const now = await $.clock.now()
    if (pullRequest.kind !== 'pr') {
      await finish({ failed: 'could not read the PR comments' })
      return
    }
    if (reviewPostDecision({ setting: 'auto', away: false, shown: true, bodyLength: 1, rounds: pullRequest.rounds ?? 0, baseRounds: run.baseRounds, postedElsewhere: await postedOnPr($, run, pullRequest) }) === 'none') {
      // Posted already (a fresh read shows a new self-review comment or the review posted otherwise, decision 074, by hand or by the review session): nothing posts twice.
      await finish({ postedAt: now })
      return
    }
    const result = await $.process.run(['gh', 'pr', 'comment', String(run.pr), '--body-file', body], { cwd, timeoutMs: 60_000 })
    if (result.exitCode !== 0) {
      await finish({ failed: firstLine(result.stderr) || firstLine(result.stdout) || `gh exited ${result.exitCode}` })
      return
    }
    await finish({ postedAt: await $.clock.now(), by: 'tower' })
    // The PR's comments are read again at the next refresh.
    const ticket = (await readContext($))?.ticket ?? null
    if (ticket !== null) await update($, remoteDetails, details => {
      const cached = details[ticket]
      return cached === undefined ? details : { ...details, [ticket]: { ...cached, loadedAt: 0 } }
    })
  } catch (err) {
    await finish({ failed: firstLine(err instanceof Error ? err.message : String(err)) || 'gh pr comment failed' })
  } finally {
    reviewPosting = false
  }
}

/** Every 5 s in a ticket session: its live review sessions' usage for the deck; the atom changes only when it does. */
async function refreshReviewUsage($: EngineInterface) {
  const context = await readContext($)
  if (context === null || context.role !== 'ticket' || context.ticket === null || context.state === null) return
  const usage = reviewUsageOf(await readStatuses($, context.state), context.ticket, await $.clock.now())
  if (JSON.stringify(usage) !== JSON.stringify(await read($, reviewUsage))) await update($, reviewUsage, () => usage)
}

/** `l` in the REVIEW box: the review session under the ticket (today's split), wherever it was. */
async function showReview($: EngineInterface, context: Context) {
  if (context.ticket === null || context.pane === null) return
  const panes = await listPanes($)
  const review = reviewPane(panes, context.ticket)
  if (review === null) {
    await flashBandNotice($, 'no review session')
    return
  }
  // The deck gives the keys back first: the pane takes the tmux focus.
  await releaseKeys($, context)
  const own = panes.find(pane => pane.id === context.pane)
  if (own !== undefined && review.window !== own.window) await tmux($, ['join-pane', '-v', '-l', REVIEW_SIZE, '-s', review.id, '-t', context.pane])
  await tmux($, ['select-pane', '-t', review.id])
}

const BAND_NOTICE_MS = 5_000

/** A notice in the band in place of `next`, cleared after a few seconds unless another replaced it. */
async function flashBandNotice($: EngineInterface, notice: string) {
  await update($, bandNotice, () => notice)
  $.clock.after(BAND_NOTICE_MS, () => {
    void update($, bandNotice, current => (current === notice ? null : current)).catch(() => {})
  })
}

/** `x` in a review session: back to a parked window of its own, still running; the ticket fills the centre again. */
async function hideReview($: EngineInterface, context: Context) {
  if (context.pane === null) return
  const panes = await listPanes($).catch(() => [])
  const own = panes.find(pane => pane.id === context.pane)
  // Already alone in its window (hidden): nothing to do.
  if (own === undefined || panes.filter(pane => pane.window === own.window).length < 2) return
  await tmux($, ['break-pane', '-d', '-s', context.pane, '-n', `${context.ticket ?? 'review'}-review`]).catch(() => '')
}

// ── Deck (ticket sessions) ──────────────────────────────────────────────────

/** Read on every observed event: cheaper than the whole context, and only work sessions (ticket, hub) collect. */
async function isTicketSession($: EngineInterface): Promise<boolean> {
  return isWorkRole((await sessionRole($)) ?? '')
}

/** A session whose transcript Tower draws (decision 031): every role but the rail's. */
async function dressed($: EngineInterface): Promise<boolean> {
  const role = (await sessionRole($))
  return role !== null && role !== 'rail'
}

/** A session whose hooks fill a deck: the work roles, and the review session for its data alone (no deck pane). */
async function collectsDeck($: EngineInterface): Promise<boolean> {
  const role = (await sessionRole($)) ?? ''
  return isWorkRole(role) || role === 'review'
}

/** Applies one reducer to the deck; an observation that fails is dropped, never the event. */
async function observe($: EngineInterface, change: (deck: TowerDeck) => TowerDeck) {
  if (await isDemo($)) return
  try {
    const before = (await read($, deckState)).waiting ?? null
    await update($, deckState, change)
    // A wait that starts or ends is written at once, not at the next heartbeat: the rail's 2 s check sees it.
    if (JSON.stringify((await read($, deckState)).waiting ?? null) !== JSON.stringify(before)) void writeWaitNow($).catch(() => {})
  } catch {
    // The deck misses one event; the session goes on.
  }
}

async function writeWaitNow($: EngineInterface) {
  const context = await readContext($)
  if (context !== null) await heartbeat($, context)
}

/** Ends an agent; the first end of a running agent adds its duration to the history in $.store. */
async function endAgent($: EngineInterface, change: (deck: TowerDeck) => TowerDeck, agentId: string) {
  const before = (await read($, deckState)).agents.find(agent => agent.id === agentId)
  await observe($, change)
  const after = (await read($, deckState)).agents.find(agent => agent.id === agentId)
  if (before?.status !== 'running' || after === undefined || after.endedAt === null) return
  const ended = after.endedAt
  await observe($, deck => logged(deck, { at: ended, who: 'main', text: `${after.name} done · ${formatClock(ended - after.startedAt)}` }))
  try {
    const history = recordDuration(await read($, durations), after.type, after.endedAt - after.startedAt)
    await update($, durations, () => history)
    await $.store.set(DURATIONS_KEY, history)
  } catch {
    // The estimate learns from the next agent.
  }
}

async function loadDurations($: EngineInterface) {
  try {
    const history = parseHistory(await $.store.get(DURATIONS_KEY))
    await update($, durations, () => history)
  } catch {
    // No estimates until an agent ends.
  }
}

/** The tool uses tool.check denied, so PermissionDenied does not count them twice. */
const gateDenied = new Set<string>()

/** Decision 037: this session's secrets and their placeholders, in memory only (never in a file or the status). */
const secrets = newSecretMap()

/** Decision 037: the safety rules apply in every work session (ticket, hub, review), main loop and agents alike. */
async function safetyOn($: EngineInterface): Promise<boolean> {
  return towerSettings.safety !== 'off' && (await collectsDeck($))
}

/** Where a Bash command runs: the session's cwd, its worktree, the main checkout, the branch checked out there. */
async function riskContext($: EngineInterface): Promise<RiskContext> {
  const cwd = await $.session.cwd().catch(() => null)
  const home = (await $.env.get('HOME')) ?? null
  const main = mainCheckoutOf(config().project, (await $.env.get('TOWER_REPO')) || null, home)
  // The hub works in the main checkout; a ticket or review session in its worktree.
  const worktree = (await $.env.get('TOWER_WORKTREE')) || main
  return { cwd, worktree, main, branch: await branchAt($, worktree ?? cwd), home, baseBranch: config().project.baseBranch }
}

/** The branch checked out in a checkout or a worktree, read from its HEAD; null when unknown or detached. */
async function branchAt($: EngineInterface, dir: string | null): Promise<string | null> {
  if (dir === null) return null
  const dotGit = await readTextFile($, `${dir}/.git`).catch(() => undefined)
  const gitDir = dotGit?.startsWith('gitdir:') ? dotGit.slice(7).trim() : `${dir}/.git`
  const head = await readTextFile($, `${gitDir}/HEAD`).catch(() => undefined)
  const match = head?.match(/^ref: refs\/heads\/(.+)\s*$/)
  return match?.[1]?.trim() ?? null
}

/** What the model reads after a masked result, so a placeholder is not mistaken for the tool's real output. */
const MASK_NOTE = 'Tower masked secrets in this tool result as «secret-N» placeholders. Use them as they are: Tower puts the real values back in Bash commands, Edit and Write.'

/** Decision 037: an answered result with its secrets as placeholders, as a result of the hook's own (core maps it for the model). */
function masked<R extends { result?: unknown; isError?: true; context?: readonly string[] }>(result: R, safety: boolean): R {
  if (!safety || !('result' in result) || result.isError === true || result.result === undefined) return result
  const value = maskValue(result.result, secrets)
  if (value === result.result) return result
  return { result: value, context: [...(result.context ?? []), MASK_NOTE] } as unknown as R
}

/** A Bash command's risk, or a credential read's refusal, in this session; `ok` for any other tool. */
async function callRisk($: EngineInterface, tool: string, input: Record<string, unknown>): Promise<Risk> {
  const credential = credentialRead(tool, input)
  if (credential !== null) return { level: 'block', reason: credential }
  if (tool !== 'Bash' || typeof input.command !== 'string') return { level: 'ok', reason: '' }
  return riskOf(input.command, await riskContext($))
}

/** What the model reads after a merge Tower ran with `--merge` in place of its `--squash` or `--rebase` (decision 082). */
const MERGE_NOTE = 'Tower ran it with --merge (pull requests are merged only with --merge).'
/** The same after an errored call, which may not have run (the person said no): the command was changed all the same. */
const MERGE_NOTE_ERRORED = 'Tower changed it to --merge before it was asked or run (pull requests are merged only with --merge).'

/**
 * Decision 082: a Bash call whose `gh pr merge --squash|--rebase` the safety rule blocks, with its command rewritten to
 * `--merge`, when that rewrite is a plain merge confirmation; else null, and the block stands.
 */
async function mergedCall($: EngineInterface, tool: string, input: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (tool !== 'Bash' || typeof input.command !== 'string') return null
  const command = mergeOnly(input.command)
  if (command === null) return null
  const rewritten = { ...input, command }
  if ((await callRisk($, tool, input)).level !== 'block' || (await callRisk($, tool, rewritten)).level !== 'confirm') return null
  return rewritten
}

/** TOWER_DEMO=1: the deck shows its fixture, and no event or timer writes over it. */
async function isDemo($: EngineInterface): Promise<boolean> {
  return (await $.env.get('TOWER_DEMO')) === '1'
}

async function refreshUsage($: EngineInterface) {
  if (await isDemo($)) return
  try {
    const usage = await $.session.usage()
    await observe($, deck => usageRead(deck, usage))
    await noteForecast($, await read($, deckState))
  } catch {
    // Figures stay as they were.
  }
}

const DEV_ENV_REFRESH_MS = 5_000
const DEV_ENV_FETCH_MS = 2_000

async function urlAnswers($: EngineInterface, url: string): Promise<boolean> {
  try {
    const timeout = new Promise<null>(resolve => $.clock.after(DEV_ENV_FETCH_MS, () => resolve(null)))
    return (await Promise.race([$.http.fetch(url), timeout])) !== null
  } catch {
    return false
  }
}

const DOCKER_PS_MS = 3_000

/** Decision 073: the compose stack whose working dir is the worktree (`docker ps`, read only); `unknown` without docker, on a non-zero exit or a timeout. */
async function composeStack($: EngineInterface, cwd: string): Promise<ComposeStack | null | 'unknown'> {
  const dir = trimSlash(cwd)
  try {
    const result = await $.process.run(
      ['docker', 'ps', '--filter', `label=com.docker.compose.project.working_dir=${dir}`, '--format', COMPOSE_PS_FORMAT],
      { timeoutMs: DOCKER_PS_MS },
    )
    return result.exitCode === 0 ? parseComposePs(result.stdout, dir, envPorts(config().env)) : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Reads the worktree's state file (`.work/state.json`) env and the compose stack docker runs for the worktree (decision 073),
 * and, when they say up, whether its URL answers; the env skill is config env.name (e.g. dev-env).
 */
async function refreshDevEnv($: EngineInterface) {
  if (await isDemo($)) return
  const skill = envSkill(config().env)
  if (skill === null) return
  try {
    const cwd = await $.session.cwd()
    const hasSkill = (await $.fs.exists(`${cwd}/.claude/skills/${skill}/SKILL.md`)) || (await $.fs.exists(`${cwd}/.claude/commands/${skill}.md`))
    const env = mergeEnv(parseEnv(await readStateFile($, cwd)), await composeStack($, cwd))
    const answers = env?.status === 'up' && env.frontendUrl !== '' ? await urlAnswers($, env.frontendUrl) : false
    await update($, devEnv, state => ({
      ...state, env, answers, hasSkill,
      startPressedAt: env?.status === 'up' && answers ? null : state.startPressedAt,
    }))
  } catch {
    // The box keeps what it showed.
  }
}

async function runDevEnv($: EngineInterface, verb: 'up' | 'down') {
  const skill = envSkill(config().env)
  if (skill === null) return
  try {
    await $.command.run({ command: skill, args: verb })
  } catch {
    // The session shows why.
  }
}

/** A hub's deck shows its skill, `/<skill>`, where a ticket's shows the ticket. */
function deckTitle(role: string | null, key: string | null): string {
  if (role === 'free') return 'session'
  if (key === null) return 'deck'
  return role === 'hub' ? `/${key}` : key
}

/** The deck knows the model before the first turn: the one the session was launched with (session.start does not carry it). */
async function launchedModel($: EngineInterface) {
  const model = (await $.env.get('TOWER_MAIN_MODEL')) || null
  const effort = (await $.env.get('TOWER_MAIN_EFFORT')) || null
  if (model === null && effort === null) return
  await observe($, deck => ({ ...deck, main: { ...deck.main, model: deck.main.model ?? model, effort: deck.main.effort ?? effort } }))
}

async function openDeck($: EngineInterface, context: Context, focus: boolean) {
  try {
    await $.ui.open({ id: DECK_PANE, title: deckTitle(context.role, context.ticket), columns: DECK_COLUMNS, ...(focus ? { focus: true } : {}) })
  } catch {
    // Not placed (a narrow main screen): /deck opens it on demand.
  }
}

// ── Alt+arrows between the zones ──────────────────────────────────────────
// tmux cannot call the mod: the launcher's Alt+Left/Right/Up bindings write one word
// (`left`, `right`, `up`) to <Tower's folder>/keys/<TOWER_TAG> of the active ticket or hub pane,
// and the session polls that file. $.fs has no remove, so a taken word is cleared by writing ''.

const KEYS_POLL_MS = 250
const CTRL_X_TAB = ['18', '09']

function keysPath(state: string, tag: string): string {
  return `${state}/keys/${tag}`
}

async function startKeys($: EngineInterface, context: Context) {
  const tag = await $.env.get('TOWER_TAG')
  if (!tag || context.state === null) return
  const path = keysPath(context.state, tag)
  let taking = false
  // The watch or docs view had the keys: Escape (or any move away) closes it, as x does.
  let viewHeld = false
  const viewFollowsKeys = async () => {
    const view = await read($, deckView)
    if (view !== 'watch' && view !== 'docs' && view !== 'settings') {
      viewHeld = false
      return
    }
    if (await deckHoldsKeys($)) viewHeld = true
    else if (viewHeld) {
      viewHeld = false
      await update($, deckView, () => 'agents')
      await update($, watchAgent, () => null)
    }
  }
  $.clock.every(KEYS_POLL_MS, () => {
    if (taking) return
    taking = true
    void takeKeyWord($, context, path)
      .then(() => keysFollowTmux($, context))
      .then(viewFollowsKeys)
      .catch(() => {})
      .finally(() => {
        taking = false
      })
  })
}

/** A site of the mod holds the keys: the deck, the watch, the docs, or the band after Alt+Up. */
async function modHoldsKeys($: EngineInterface): Promise<boolean> {
  if (await read($, bandKeys)) return true
  return (await $.ui.panes()).some(pane => pane.isFocused)
}

/** tmux focus left this session's pane (a click, Alt+Left, a split): the keys go back to the prompt, so they work on return. */
async function keysFollowTmux($: EngineInterface, context: Context) {
  try {
    if (context.pane === null || !(await modHoldsKeys($))) return
    if ((await tmux($, ['display-message', '-p', '-t', context.pane, '#{pane_active}'])).trim() === '1') return
    await releaseKeys($, context)
  } catch {
    // The next tick tries again.
  }
}

/** Every mod site gives the keys back: the deck (with the watch or docs in it) reopens without focus; the band lets go on Escape only. */
async function releaseKeys($: EngineInterface, context: Context) {
  const panes = await $.ui.panes()
  if (panes.some(pane => pane.id === DECK_PANE && pane.isFocused)) await keysToPrompt($, context)
  if (!(await read($, bandKeys))) return
  await update($, bandKeys, () => false)
  // The one Escape the mod sends: by its own flag the band holds the keys, this pane is not the active
  // tmux pane, no turn runs (an Escape would interrupt it) and the prompt is empty (nothing to lose).
  if (context.pane === null) return
  if ((await tmux($, ['display-message', '-p', '-t', context.pane, '#{pane_active}'])).trim() === '1') return
  if ((await read($, deckState)).main.state === 'working') return
  if ((await $.prompt.read()).text !== '') return
  await tmux($, ['send-keys', '-t', context.pane, 'Escape'])
}

async function takeKeyWord($: EngineInterface, context: Context, path: string) {
  try {
    if (!(await $.fs.exists(path))) return
    const word = (await $.fs.read(path)).trim()
    if (word === '') return
    await $.fs.write(path, '')
    await moveKeys($, context, word)
  } catch {
    // A word missed; the next press writes another.
  }
}

/**
 * The home's Alt+←/→ (decision 030): a pane gets no Left/Right, so the launcher writes `left`/`right`
 * to the rail's key file too, and the ring moves to the same row of the neighbour column.
 */
async function startHomeKeys($: EngineInterface, context: Context) {
  const tag = await $.env.get('TOWER_TAG')
  if (!tag || context.state === null) return
  const path = keysPath(context.state, tag)
  let taking = false
  $.clock.every(KEYS_POLL_MS, () => {
    if (taking) return
    taking = true
    void (async () => {
      if (!(await $.fs.exists(path))) return
      const word = (await $.fs.read(path)).trim()
      if (word === '') return
      await $.fs.write(path, '')
      // Alt+→ while the box holds the keys (text in it, or Escape): back to the ▶ card first.
      if (word === 'right' && !(await railHoldsKeys($))) await keysToCards($, context)
      else if (word === 'left' || word === 'right') await homeMove($, word)
    })().catch(() => {}).finally(() => {
      taking = false
    })
  })
}

/** The rail's pane holds the keys and the box is empty. */
async function railHoldsKeys($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(open => open.id === PANE && open.isFocused) && (await boxText($)) === ''
}

async function homeMove($: EngineInterface, way: 'left' | 'right') {
  const target = neighbourCard(homeColumnKeys, ringElement ?? markedElement, way)
  if (target === null) return
  markedElement = target
  await followFocus($, target.slice(target.indexOf(':') + 1))
  await focusMarked($)
}

async function deckHoldsKeys($: EngineInterface): Promise<boolean> {
  try {
    return (await $.ui.panes()).some(pane => pane.id === DECK_PANE && pane.isFocused)
  } catch {
    // No pane listing (a surface without one): the deck does not hold the keys.
    return false
  }
}

/** The keys back to the prompt: no call hands them back, so the deck closes and opens again without `focus`. */
async function keysToPrompt($: EngineInterface, context: Context) {
  await $.ui.close({ id: DECK_PANE })
  await openDeck($, context, false)
}

// ── The agent watch and the docs viewer ──────────────────────────────────

async function openWatch($: EngineInterface, agentId: string) {
  await update($, watchAgent, () => agentId)
  await update($, watchSent, () => false)
  await refreshWatch($)
  await update($, deckView, () => 'watch')
  if (await deckHoldsKeys($)) await $.ui.focus({ requestId: DECK_PANE, key: 'close' }).catch(() => {})
}

/** The watch closes: the agents view again, the keys in the deck, the ring on the first card. */
async function closeWatch($: EngineInterface) {
  await update($, watchAgent, () => null)
  await backToAgents($)
}

/** Back from the watch or the docs: the agents view, the keys in the deck, the ring on the first card. */
async function backToAgents($: EngineInterface) {
  await update($, deckView, () => 'agents')
  const context = await readContext($)
  if (context === null) return
  await openDeck($, context, true)
  const first = cardOrder((await read($, deckState)).agents)[0]
  const key = first !== undefined ? `agent:${first.id}` : 'view:routing'
  await $.ui.focus({ requestId: DECK_PANE, key }).catch(() => {})
}

/** The watch from the deck's `w`: the card with the ring, else the first running agent. */
async function watchFromDeck($: EngineInterface) {
  const agents = (await read($, deckState)).agents
  const ringed = deckRing?.startsWith('agent:') ? deckRing.slice('agent:'.length) : null
  const agent = agents.find(candidate => candidate.id === ringed) ?? cardOrder(agents).find(candidate => candidate.status === 'running')
  if (agent === undefined) {
    await flashBandNotice($, 'no agent running')
    return
  }
  await openWatch($, agent.id)
}

/** The watched agent's newest conversation lines; a demo id (no transcript) shows its recent actions. */
async function refreshWatch($: EngineInterface) {
  const agentId = await read($, watchAgent)
  if (agentId === null) return
  const agent = (await read($, deckState)).agents.find(candidate => candidate.id === agentId)
  let lines: LiveLine[] = agent !== undefined ? recentLines(agent.recent, 20) : []
  if (!(await isDemo($))) {
    try {
      const messages = await $.session.messages({ agentId })
      const fromTranscript = Array.isArray(messages) ? liveLines(messages, 20) : []
      if (fromTranscript.length > 0) lines = fromTranscript
    } catch {
      // No transcript for this id: the recent actions stay.
    }
  }
  await update($, watchLive, () => lines)
  await $.ui.scroll({ in: DECK_PANE, to: 'end' }).catch(() => {})
}

/** The ticket's documents: the plan, the pull request text, the .md and .html files under .work/ and repro/. */
async function refreshDocs($: EngineInterface): Promise<TowerDoc[]> {
  const cwd = await $.session.cwd()
  const plan = parseWorkDetail(await readStateFile($, cwd)).plan
  let prBody: string | null = null
  if (!(await isDemo($))) {
    try {
      const view = await $.process.run(['gh', 'pr', 'view', '--json', 'body', '-q', '.body'], { cwd, timeoutMs: 10_000 })
      if (view.exitCode === 0) prBody = view.stdout
    } catch {
      // No gh or no pull request.
    }
  }
  const files: { path: string; text: string }[] = []
  try {
    const found = await $.process.run(['find', '.work', 'repro', '-maxdepth', '3', '-type', 'f', '(', '-name', '*.md', '-o', '-name', '*.html', ')'], { cwd, timeoutMs: 5_000 })
    for (const path of found.stdout.split('\n').filter(line => line !== '').slice(0, 20)) {
      const text = await readTextFile($, `${cwd}/${path.replace(/^\.\//, '')}`)
      if (text !== undefined) files.push({ path, text })
    }
  } catch {
    // No such folders.
  }
  const docs = docEntries({ plan, prBody, files })
  await update($, docsList, () => docs)
  await update($, docsChosen, chosen => Math.min(chosen, Math.max(0, docs.length - 1)))
  return docs
}

/** The deck shows the docs view; the keys stay where they are (the band's `m` cannot hand them over). */
async function openDocs($: EngineInterface) {
  if (!towerSettings.modules.documents) return
  const docs = await refreshDocs($)
  if (docs.length === 0) {
    await flashBandNotice($, 'no document in this session yet')
    return
  }
  await update($, deckView, () => 'docs')
  if (await deckHoldsKeys($)) await $.ui.focus({ requestId: DECK_PANE, key: `doc:${await read($, docsChosen)}` }).catch(() => {})
}

/** The docs close: the agents view again, the keys in the deck, the ring on the first card. */
async function closeDocs($: EngineInterface) {
  await backToAgents($)
}

// ── The aside and the pins (decision 036) ────────────────────────────────────

/** One side question about this session: a fork of its own transcript (cache reused) or a Sonnet call over its last part. */
async function askAside($: EngineInterface, question: string): Promise<AsideRecord> {
  const started = await $.clock.now()
  const model = towerSettings.asideModel
  const forked = model === 'session' ? await $.model.fork({ prompt: asideForkPrompt(question) }) : null
  // Nothing to fork (a resumed session before its first new request): the session's model over the last part as text, no cache.
  const textModel = model === 'sonnet' ? 'sonnet' : lastMainModel ?? (await read($, deckState)).main.model ?? 'sonnet'
  const cached = forked !== null && !(!forked.isAnswered && forked.reason === 'nothing-to-fork')
  const reply = cached && forked !== null ? forked
    : await $.model.complete({ ...asideCompleteRequest(question, await $.session.messages(), textModel), timeoutMs: 120_000 })
  const at = await $.clock.now()
  if (reply.isAnswered) return { question, status: 'done', text: reply.text, line: asideUsageLine(reply.usage, at - started, cached ? 'session' : 'sonnet') + (cached ? '' : ` · ${familyName(textModel)}`), at }
  const why = reply.reason === 'api-error' ? `api error ${reply.status ?? ''} ${reply.error}`.replace(/\s+/g, ' ') : reply.reason === 'nothing-to-fork' ? 'nothing to ask about yet: the session has no reply' : reply.reason
  return { question, status: 'failed', text: why, line: '', at }
}

async function openAside($: EngineInterface) {
  await update($, deckView, () => 'aside')
  await $.ui.focus({ requestId: DECK_PANE, key: 'aside:input' }).catch(() => {})
}

async function submitAside($: EngineInterface) {
  const question = (await read($, asideDraft)).trim()
  if (question === '' || (await read($, asideAnswer))?.status === 'asking') return
  await update($, asideDraft, () => '')
  await update($, asideAnswer, () => ({ question, status: 'asking', text: '', line: '', at: 0 }))
  const answer = await askAside($, question).catch(error => ({ question, status: 'failed' as const, text: String(error), line: '', at: 0 }))
  await update($, asideAnswer, () => answer)
}

/** The board asked this session's aside over the bus: the answer goes to `<state>/asides/<ticket>.json`. */
async function answerBoardAside($: EngineInterface, question: string) {
  const context = await readContext($)
  if (context === null || context.state === null || context.ticket === null) return
  const path = `${context.state}/asides/${context.ticket}.json`
  const write = async (record: AsideRecord) => $.fs.write(path, JSON.stringify(record)).catch(() => {})
  await write({ question, status: 'asking', text: '', line: '', at: await $.clock.now() })
  const answer = await askAside($, question).catch(async error => ({ question, status: 'failed' as const, text: String(error), line: '', at: await $.clock.now() }))
  await update($, asideAnswer, () => answer)
  await write(answer)
}

/** The board's `i: ask`: the question to the ticket's live session; its answer file is read until it is there. */
async function sendBoardAside($: EngineInterface, ticket: string, question: string) {
  const context = await readContext($)
  if (context === null || context.state === null) return
  const state = context.state
  const sessionId = liveSessionId(await readStatuses($, state), 'ticket', ticket, await $.clock.now())
  const sent = await $.clock.now()
  const mark = async (record: AsideRecord) => update($, boardAnswers, all => ({ ...all, [ticket]: record }))
  if (sessionId === null) return mark({ question, status: 'failed', text: 'no live session for this ticket', line: '', at: sent })
  const result = await $.session.send({ to: { sessionId }, text: encodeCommand({ command: ASIDE_COMMAND, args: asideArgs(question) }) })
  if (!result.isDelivered) return mark({ question, status: 'failed', text: 'the session did not take the question', line: '', at: sent })
  await mark({ question, status: 'asking', text: '', line: '', at: sent })
  await update($, boardAsk, ask => (ask?.ticket === ticket ? { ...ask, draft: '', sent } : ask))
  const poll = async (left: number) => {
    const record = parseAsideRecord((await readTextFile($, `${state}/asides/${ticket}.json`)) ?? null)
    if (record !== null && record.status !== 'asking' && record.at >= sent) return mark(record)
    if (left > 0) $.clock.after(2_000, () => void poll(left - 1).catch(() => {}))
    else await mark({ question, status: 'failed', text: 'no answer in 3 minutes', line: '', at: sent })
  }
  $.clock.after(2_000, () => void poll(90).catch(() => {}))
}

/** The pin tool's call, the person's `x`, the links seen in tool output: every change goes through here. */
async function changePins($: EngineInterface, change: (pins: TowerPin[]) => TowerPin[]) {
  await update($, deckState, deck => ({ ...deck, pins: change(deck.pins ?? []) }))
  const context = await readContext($)
  if (context !== null) await writeStatus($, context, deckBusy(await read($, deckState)) ? 'working' : 'idle').catch(() => {})
}

async function asideBody($: EngineInterface, els: Elements, width: number, colours: Theme) {
  const { Box, Text, Button, Markdown } = els
  const Input = 'Input' in els ? els.Input : null
  const answer = await read($, asideAnswer)
  const draft = await read($, asideDraft)
  const ticket = (await $.env.get('TOWER_TICKET')) ?? ''
  const how = towerSettings.asideModel === 'session' ? 'the session\'s own transcript and model, cache reused' : 'Sonnet over the last part as text, cache not reused'
  return (
    <Box flexDirection="column" width={width}>
      <Box justifyContent="space-between">
        <Text wrap="truncate" dimColor><Text dimColor={false}>aside</Text>{` · ${ticket} · nothing goes into the session`}</Text>
        <Button key="close" label="close" hotkey="x" plain dimColor onPress={async () => backToAgents($)} />
      </Box>
      <Text dimColor wrap="truncate">{how}</Text>
      <Text> </Text>
      {Input !== null && (
        <Input
          key="aside:input"
          placeholder="ask about this ticket… (where are you at? what is left?)"
          value={draft}
          onInput={(value: string) => {
            void update($, asideDraft, () => value).catch(() => {})
          }}
          onSubmit={() => {
            void submitAside($).catch(() => {})
          }}
        />
      )}
      <Text> </Text>
      {answer !== null && <Text wrap="wrap"><Text dimColor>{'? '}</Text>{answer.question}</Text>}
      {answer?.status === 'asking' && <Text><Text color={colours.accent}>◐</Text><Text dimColor> asking…</Text></Text>}
      {answer?.status === 'failed' && <Text color={colours.error} wrap="wrap">{`no answer · ${answer.text}`}</Text>}
      {answer?.status === 'done' && <Markdown text={answer.text} />}
      {answer?.status === 'done' && <Text dimColor wrap="truncate">{answer.line}</Text>}
    </Box>
  )
}

// The engine shows a second pane only as a tab behind the deck, so both are deck views (`4 watch`, `m docs`).
type Elements = ReturnType<EngineInterface['ui']['resolve']>
async function watchBody($: EngineInterface, els: Elements, width: number, rows: number, colours: Theme) {
  const { Box, Text, Button } = els
  const Input = 'Input' in els ? els.Input : null
  const agentId = await read($, watchAgent)
  const agent = (await read($, deckState)).agents.find(candidate => candidate.id === agentId)
  const close = <Button key="close" label="close" hotkey="x" plain dimColor onPress={async () => closeWatch($)} />
  if (agent === undefined) {
    return (
      <Box flexDirection="column" width={width}>
        <Box justifyContent="space-between"><Text dimColor>no agent to watch</Text>{close}</Box>
      </Box>
    )
  }
  const ticket = (await $.env.get('TOWER_TICKET')) ?? ''
  const name = agent.name
  const model = agent.model !== null && agent.model !== '' ? familyName(agent.model) : '–'
  const effort = agent.effort ?? '–'
  const running = agent.status === 'running'
  const live = await read($, watchLive)
  const sent = await read($, watchSent)
  const draft = await read($, watchDraft)
  // The live panel gets the rows the rest leaves, at most 20 lines.
  const used = 6 + Math.ceil(agent.task.length / width) + agent.steps.length + 4
  const liveRows = Math.max(3, Math.min(20, rows - used))
  const shown = live.slice(-liveRows)
  const done = agent.endedAt !== null ? formatClock(agent.endedAt - agent.startedAt) : ''
  return (
    <Box flexDirection="column" width={width}>
      <Box justifyContent="space-between">
        <Text wrap="truncate" dimColor>{`${name} · agent of ${ticket} · ${model} · ${effort} · `}<Text dimColor={false}>{running ? 'live' : agent.status}</Text></Text>
        {close}
      </Box>
      <Text dimColor>task</Text>
      <Text wrap="wrap">{agent.task !== '' ? agent.task : '–'}</Text>
      <Text dimColor>steps</Text>
      {agent.steps.length === 0 && <Text dimColor>no steps yet</Text>}
      {agent.steps.map((step, index) =>
        step.status === 'done' ? (
          <Text key={`step:${index}`} wrap="truncate"><Text color={colours.done}>✓ </Text>{step.text}</Text>
        ) : step.status === 'doing' ? (
          <Text key={`step:${index}`} wrap="truncate" bold><Text color={colours.accent}>▸ </Text>{step.text}</Text>
        ) : (
          <Text key={`step:${index}`} wrap="truncate" dimColor>{`○ ${step.text}`}</Text>
        ),
      )}
      {!running && <Text><Text color={agent.status === 'failed' ? colours.error : colours.done}>{agent.status === 'failed' ? '✗ failed' : '✓ done'}</Text><Text dimColor>{` · ${done}`}</Text></Text>}
      <Text dimColor>live</Text>
      {shown.map((line, index) => (
        <Text key={`live:${index}`} wrap="truncate" dimColor={line.dim}>{line.text}</Text>
      ))}
      {!running && agent.lastOutput !== null && <Text wrap="wrap">{agent.lastOutput}</Text>}
      {running && <Text><Text color={colours.accent}>◐</Text><Text dimColor> working…</Text></Text>}
      {running && Input !== null ? (
        <Input
          key="message"
          placeholder={`message ${name}… (it reads it at its next step)`}
          value={draft}
          onInput={(value: string) => {
            void update($, watchDraft, () => value).catch(() => {})
          }}
          onSubmit={() => {
            void (async () => {
              const text = (await read($, watchDraft)).trim()
              if (text === '') return
              await $.session.send({ to: { agentId: agent.id }, text })
              await update($, watchDraft, () => '')
              await update($, watchSent, () => true)
              $.clock.after(3_000, () => {
                void update($, watchSent, () => false).catch(() => {})
              })
            })().catch(() => {})
          }}
        />
      ) : (
        <Text dimColor>agent finished</Text>
      )}
      <Box justifyContent="space-between">
        <Text dimColor wrap="truncate">{`${model} · ${effort} · ${agent.actions} tool calls · ${formatTokens(agent.tokens.input + agent.tokens.output)} tokens`}</Text>
        {sent ? <Text color={colours.done}>sent</Text> : <Text dimColor><Text dimColor={false}>x</Text> close</Text>}
      </Box>
    </Box>
  )
}

// ── The docs viewer: the ticket's documents, one drawn as markdown
async function docsBody($: EngineInterface, els: Elements, width: number) {
  const { Box, Text, Button, Markdown } = els
  const docs = await read($, docsList)
  const index = Math.min(await read($, docsChosen), Math.max(0, docs.length - 1))
  const doc = docs[index]
  const close = <Button key="close" label="close" hotkey="x" plain dimColor onPress={async () => closeDocs($)} />
  // Opened from the band the deck does not hold the keys yet: the header names the way in.
  const held = await deckHoldsKeys($)
  const ends = <Box flexShrink={0} paddingLeft={1}>{!held && <Text dimColor><Text dimColor={false}>esc, alt →</Text>{' keys · '}</Text>}{close}</Box>
  if (doc === undefined) {
    return (
      <Box flexDirection="column" width={width}>
        <Box justifyContent="space-between"><Text dimColor>no document in this session yet</Text>{ends}</Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" width={width}>
      <Box justifyContent="space-between">
        <Text wrap="truncate" dimColor><Text dimColor={false}>{doc.title}</Text>{` · ${doc.path} · ${index + 1} of ${docs.length} · `}<Text dimColor={false}>document</Text></Text>
        {ends}
      </Box>
      <Box flexWrap="wrap">
        {docs.map((entry, at) => (
          <Button key={`doc:${at}`} label={entry.title} plain dimColor={at !== index} onPress={async () => { await update($, docsChosen, () => at) }} />
        )).flatMap((element, at) => (at === 0 ? [element] : [<Text key={`gap:${at}`}>{'  '}</Text>, element]))}
      </Box>
      <Text> </Text>
      {doc.html ? <Text wrap="wrap">{doc.text}</Text> : <Markdown text={doc.text} />}
      <Text> </Text>
      <Box justifyContent="space-between">
        <Text dimColor>{`${doc.text.split("\n").length} lines`}</Text>
        <Text dimColor wrap="truncate">{`rendered from ${doc.path}`}</Text>
      </Box>
    </Box>
  )
}

/** The routing view's ring: on the chosen row, else the first (`route:free`). */
async function routeRing($: EngineInterface): Promise<string> {
  const rows = routingRows(tableProfile())
  const chosen = await read($, routeChosen)
  return `route:${(rows.find(row => row.key === chosen) ?? rows[0])?.key ?? 'free'}`
}

async function moveKeys($: EngineInterface, context: Context, word: string) {
  const own = context.pane
  if (word === 'right') {
    await openDeck($, context, true)
    if (!(await deckHoldsKeys($))) return
    await update($, bandKeys, () => false)
    // The ring on the view's first Button: the first agent card, else the first tab that is a Button.
    const view = await read($, deckView)
    const first = view === 'agents' ? cardOrder((await read($, deckState)).agents)[0] : undefined
    const key = view === 'docs' ? `doc:${await read($, docsChosen)}` : view === 'watch' ? 'close' : view === 'settings' ? `set:view:${towerSettings.view}` : view === 'routing' ? await routeRing($) : first !== undefined ? `agent:${first.id}` : `view:${(['agents', 'routing', 'log'] as const).find(name => name !== view)}`
    await $.ui.focus({ requestId: DECK_PANE, key }).catch(() => {})
    return
  }
  if (word === 'left') {
    if ((await $.ui.panes()).some(pane => pane.isFocused)) {
      await releaseKeys($, context)
      return
    }
    if (own !== null) await tmux($, ['select-pane', '-L', '-t', own])
    if (await read($, bandKeys)) await releaseKeys($, context)
    return
  }
  if (word === 'up') {
    if (own !== null && (await tmux($, ['display-message', '-p', '-t', own, '#{pane_at_top}'])) !== '1') {
      await tmux($, ['select-pane', '-U', '-t', own])
      return
    }
    // No pane above: the band takes the keys, as the ctrl+x tab chord gives them from the prompt.
    if (await deckHoldsKeys($)) await keysToPrompt($, context)
    if (own !== null) {
      await tmux($, ['send-keys', '-t', own, '-H', ...CTRL_X_TAB])
      await update($, bandKeys, () => true)
    }
  }
}

/** Tool calls of this module, numbered: the id of a call in flight when the engine gives no tool_use_id. */
let callCount = 0
/** Decision 038: finished calls' durations by tool_use_id, for the dressed tool rows. */
const callDurations = new Map<string, number>()
/** Running tool rows drawn before their call was in flight: when each was first drawn. */
const rowSeen = new Map<string, number>()

/** A running call's start: its in-flight entry (pack 1), else the row's first drawing; none without an id or a clock. */
async function runningSince($: EngineInterface, id: string | undefined): Promise<{ now: number; flight?: { since: number } }> {
  if (id === undefined) return { now: 0 }
  const now = await $.clock.now().catch(() => null)
  if (now === null) return { now: 0 }
  const deck = await read($, deckState)
  const inFlight = [deck.main, ...deck.agents].flatMap(worker => worker.inFlight ?? []).find(one => one.id === id)
  if (inFlight === undefined && !rowSeen.has(id)) rowSeen.set(id, now)
  if (rowSeen.size > 200) rowSeen.delete(rowSeen.keys().next().value!)
  return { now, flight: inFlight ?? { since: rowSeen.get(id)! } }
}
const RECONCILE_MS = 2_000

/**
 * Every 2 s (decision 033, after agent-flow): the engine's agent list ends the agents the deck still shows running,
 * adds the ones it never saw spawn and runs again the finished ones a SendMessage resumed (decision 075); a stall or
 * a loop that starts or ends is written at once (status file, pane).
 */
async function reconcileDeck($: EngineInterface) {
  if (await isDemo($)) return
  const now = await $.clock.now()
  const list = await $.agent.list().catch(() => null)
  if (list !== null) {
    const { ended, missed, resumed } = reconcileAgents(await read($, deckState), list)
    for (const one of ended) {
      if (one.status === 'done') await endAgent($, deck => agentEnded(deck, one.id, null, now), one.id)
      else await observe($, deck => agentFailed(deck, one.id, now))
    }
    // A SendMessage resume fires no agent.spawn: the list tells a finished agent runs again (decision 075).
    for (const id of resumed) await observe($, deck => logged(agentResumed(deck, id, now), { at: now, who: 'main', text: `→ ${logWho(deck, id)} · resumed` }))
    for (const info of missed) await observe($, deck => agentMissed(deck, info, now))
  }
  // A finished agent folds AGENT_FOLD_MS after its end: the count changing redraws the deck (decision 045).
  const folded = foldedCount((await read($, deckState)).agents, now)
  if (folded !== (await read($, agentsFolded))) await update($, agentsFolded, () => folded)
  const alert = deckAlert(await read($, deckState), now, towerSettings.modules)
  if (JSON.stringify(alert) !== JSON.stringify(await read($, progressAlert))) {
    await update($, progressAlert, () => alert)
    const context = await readContext($)
    if (context !== null) await heartbeat($, context)
  }
}

async function startDeck($: EngineInterface, context: Context) {
  await $.command.register({ name: 'deck', description: "Open and focus this ticket session's deck of subagents" })
  await $.command.register({ name: 'compact-micro', description: 'Drop old Read results and thinking from the context, no model call' })
  await loadDurations($)
  await openDeck($, context, false)
  // A free session (decision 055) has no ticket: no dev-env, no ticket documents.
  const ticketBoxes = context.role !== 'free'
  if (ticketBoxes) void refreshDevEnv($)
  every($, DEV_ENV_REFRESH_MS, () => {
    if (ticketBoxes) void refreshDevEnv($)
  })
  every($, REVIEW_REFRESH_MS, () => {
    void refreshReview($).catch(() => {})
    void refreshReviewUsage($).catch(() => {})
  })
  every($, RECONCILE_MS, () => {
    void reconcileDeck($).catch(() => {})
  })
  // At start and every minute while the session lives, busy or idle: the limit windows reset while nobody types.
  void refreshUsage($)
  every($, USAGE_REFRESH_MS, () => {
    void refreshUsage($)
  })
  if (ticketBoxes) void refreshDocs($).catch(() => {})
  every($, DOCS_REFRESH_MS, () => {
    if (ticketBoxes) void refreshDocs($).catch(() => {})
  })
  // The watch's live lines while its agent runs.
  every($, WATCH_REFRESH_MS, () => {
    void (async () => {
      const agentId = await read($, watchAgent)
      if (agentId === null || (await read($, deckView)) !== 'watch') return
      const agent = (await read($, deckState)).agents.find(candidate => candidate.id === agentId)
      if (agent?.status === 'running') await refreshWatch($)
    })().catch(() => {})
  })
}

/** The deck's legend: the model families in their colours. */
const LEGEND = ['fable', 'opus', 'sonnet', 'haiku'] as const

/** `opus` for any Opus id; an id of no known family as `modelLabel`. */
function familyName(modelId: string): string {
  const family = modelFamily(modelId)
  return family === 'other' ? modelLabel(modelId) : family
}

/** `42m`, `3h 05m`: how long the dev-env has been up. */
function upFor(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** `12:04:11`, local time. */
function clockTime(at: number): string {
  const date = new Date(at)
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(part => String(part).padStart(2, '0')).join(':')
}

/** The colour of a model's family; `other` while the model is unknown. */
/** TOWER_THEME when it names a theme, else the settings' theme, else the option. */
async function sessionTheme($: EngineInterface, option: unknown): Promise<Theme> {
  return theme(themeChoice(await $.env.get('TOWER_THEME'), option, towerSettings.theme))
}

function modelColour(model: string | null, colours: Theme): string {
  return colours.models[model !== null && model !== '' ? modelFamily(model) : 'other']
}

// ── Routing ───────────────────────────────────────────────────────────────

const PASS: RouteDecision = { kind: 'pass' }
/** Decision 066: the routing view's line in a session `/tower` placed Tower in. */
const ROUTING_PLACED = 'in place (/tower): this session keeps its own model and effort · roles reach its subagents · new session: sessions a Tower launches'
const GUIDANCE_SECTION = 'tower:routing'

/** The board's keys that run a repository skill as a hub session (config repoActions; e.g. s shape, n new-ticket, t triage). */
function boardActions(): RepoAction[] {
  return config().repoActions
}

/** The action on a board key; its button reads the skill's name (`new-ticket`), the label is bin/CCtower's hint wording. */
function boardAction(key: string): RepoAction | undefined {
  return boardActions().find(action => action.key === key)
}

/**
 * `o: + new session` (decision 055): asks the folder, the main checkout first with the ring on it (↵ takes it), then the
 * focused worktree when it is another; `o` again drops the question.
 */
async function askNewSession($: EngineInterface, context: Context, selected: { label: string; path: string } | null) {
  if ((await read($, newSessionAsk)) !== null) {
    await update($, newSessionAsk, () => null)
    return
  }
  const choices = newSessionChoices(context.repo, selected, noProject() ? 'this folder' : 'main checkout')
  if (choices.length === 0) {
    await update($, boardNotice, () => 'TOWER_REPO is not set')
    return
  }
  await update($, newSessionAsk, () => choices)
  await $.ui.focus({ requestId: PANE, key: `new-session:${choices[0]!.key}` }).catch(() => {})
}

/** A plain Claude session in `path`, in the centre like a ticket's: role `free`, its own key, no ticket and no start prompt. */
async function openFreeSession($: EngineInterface, context: Context, path: string) {
  await update($, newSessionAsk, () => null)
  await openWork($, context, { role: 'free', key: await newWorkTag($, 'free'), cwd: path, start: null })
}

/**
 * Decision 064: a free session in `path` that starts with one of Tower's skills (`/tower:tower-setup`, `/tower:tower-design`),
 * on the skill's routing when the table names it, else the routing view's `new session`. A design session's key is `design-<hex>`.
 */
async function openSkillSession($: EngineInterface, context: Context, path: string, skill: TowerSkill) {
  await update($, newSessionAsk, () => null)
  await refreshRoutingOverrides($).catch(() => NO_OVERRIDES)
  const profile = routingProfile()
  const start = towerSkillStart(skill, profile.skills, profile.modelIds, freeStart(routingOverrides, profile.modelIds, null, catalogue))
  await openWork($, context, { role: 'free', key: await newWorkTag($, skill === 'tower-design' ? DESIGN_SESSION_TAG : 'free'), cwd: path, start })
}

/** Decision 064: the design session to the centre, the one already running `/tower:tower-design` in this Tower, else a new one (it resumes from the state file). */
async function openDesignSession($: EngineInterface, context: Context) {
  if (context.repo === null) return
  const view = await read($, railView)
  const running = view.kind === 'rows' ? (view.free ?? []).find(row => isDesignSession(row.key)) : undefined
  if (running !== undefined) await openWork($, context, { role: 'free', key: running.key, cwd: running.cwd, start: null })
  else await openSkillSession($, context, context.repo, 'tower-design')
}

/**
 * Decision 064: `+ prototype`'s name given: the folder `<project>/spikes/<nn>-<slug>/` made, a free session opened in it.
 * An empty name or one with no letter or digit only closes the question.
 */
async function openPrototype($: EngineInterface, context: Context, name: string) {
  await update($, prototypeAsk, () => null)
  if (context.repo === null) return
  const spikes = `${context.repo.replace(/\/+$/, '')}/spikes`
  const existing = (await $.fs.list(spikes).catch(() => [])).map(entry => entry.name)
  const folder = prototypeFolder(name, existing)
  if (folder === null) return
  const path = `${spikes}/${folder}`
  const made = await $.process.run(['mkdir', '-p', path], { timeoutMs: 5_000 }).then(result => result.exitCode === 0, () => false)
  if (!made) {
    await update($, boardNotice, () => `cannot make ${path}`)
    return
  }
  await openWork($, context, { role: 'free', key: await newWorkTag($, 'free'), cwd: path, start: null })
}

/** A hub skill from the board's hotkeys, when this repository has it. */
async function launchBoardSkill($: EngineInterface, context: Context, name: string) {
  const repo = context.repo
  const owned = repo !== null && ((await $.fs.exists(`${repo}/.claude/skills/${name}/SKILL.md`)) || (await $.fs.exists(`${repo}/.claude/commands/${name}.md`)))
  const listed = launcherItems(routingProfile().skills, [], new Set([name]))
  const item = [...listed.skills, ...listed.other].find(one => one.name === name)
  if (!owned || item === undefined) {
    await update($, boardNotice, () => `this repository has no /${name}`)
    return
  }
  await update($, boardNotice, () => null)
  await launchSkill($, context, item)
}

/** Tells the tmux hint row which form the pane has: `@tower_mode` board or rail. */
async function markPaneMode($: EngineInterface, context: Context | null, mode: 'board' | 'rail') {
  if ((await read($, paneMode)) === mode) return
  await update($, paneMode, () => mode)
  if (context?.pane) await tmux($, ['set-option', '-p', '-t', context.pane, '@tower_mode', mode]).catch(() => {})
}

/** The dim keys under the board's list, the repository's actions first (e.g. `s n t`): one row when it fits, else two. */
function keyRows(width: number): string[][] {
  const actions = boardActions().map(action => action.key)
  const own = ['k', 'r', 'a', 'q']
  return width >= 68 || actions.length === 0 ? [[...actions, ...own]] : [actions, own]
}

/** `/x/app-TKT-1` beside the repo `/x/app` reads `../app-TKT-1`. */
function besideRepo(path: string, repo: string | null): string {
  if (repo === null) return path
  const parent = repo.slice(0, repo.lastIndexOf('/') + 1)
  return parent !== '' && path.startsWith(parent) ? `../${path.slice(parent.length)}` : path
}

function sessionGlyph(state: string): string {
  if (state === 'working') return '◐'
  if (state === 'needs you' || state === 'waiting') return '◆'
  if (state === 'finished') return '✓'
  return '○'
}

/** The profile's roles as this plugin's agent types (`tower:executor`, …), whatever the routing mode. */
async function registerRoles($: EngineInterface) {
  // The routing view's choices (decision 056) reach the roles of the sessions that start after them.
  await refreshRoutingOverrides($).catch(() => NO_OVERRIDES)
  const profile = routingProfile()
  for (const role of profile.roles) {
    // A full id (a key of modelIds or an alias through the catalogue, decision 057); null: the session's subagent default.
    const model = role.model !== null ? modelIdOf(role.model, profile.modelIds, catalogue) : null
    const effort = effortFor(model, role.effort, catalogue)
    try {
      await $.agent.register({
        name: role.name,
        description: role.description,
        prompt: role.prompt,
        ...(model !== null ? { model } : {}),
        ...(role.disallowedTools.length > 0 ? { disallowedTools: role.disallowedTools } : {}),
        ...(effort !== null ? { effort } : {}),
      })
    } catch {
      // This role is missing for the session; the others still register.
    }
  }
}

// ── Attention popup ─────────────────────────────────────────────────────────

/** The attention popup: what happened, its hint, and `g: go to` / `x: dismiss`. */
function attentionPopupView($: EngineInterface, els: Elements, colours: Theme, event: QueuedEvent, width: number, context: Context) {
  const { Box, Text, Button } = els
  // Decision 037: a risky command waiting on the person draws the popup red.
  const colour = event.kind === 'needs' ? (event.text.startsWith('risky · ') ? colours.error : colours.needsYou) : colours.done
  return (
    <Box key="attention" flexDirection="column" borderStyle="round" borderColor={colour} paddingX={1} width={width} flexShrink={0}>
      <Text bold color={colour} wrap="truncate-end">{popupTitle(event)}</Text>
      <Text wrap="truncate-end">{truncateEnd(event.text, Math.max(1, width - 4))}</Text>
      <Box>
        <Button key="attention:go" label={`go to ${event.label ?? event.ticket}`} hotkey="g" plain onPress={async () => goToAttention($, context, event)} />
        <Text>{'   '}</Text>
        <Button key="attention:dismiss" label="dismiss" hotkey="x" plain dimColor onPress={async () => dismissAttention($, event.id)} />
      </Box>
    </Box>
  )
}

// ── Tower in a plain session, and the launcher (decision 066) ────────────────

/** `/tower` in every session but the rail (which registers its own): its words in the typeahead. */
const TOWER_COMMAND = {
  name: 'tower',
  description: 'Tower: a free session with the flightdeck here (/tower off stops it) · /tower install adds the tower launcher',
  argumentHint: '[off | install | uninstall]',
}

const TOWER_USAGE = 'usage: /tower (Tower in this session) · /tower off · /tower install (the tower launcher) · /tower uninstall'

const PLACED_TEXT = 'Tower is on in this session: the flightdeck beside it (/deck when it does not fit), the band above the prompt, '
  + "Tower's safety rules (its settings) and the free routing for its subagents. This session keeps its own model: the "
  + "routing view's changes reach its subagents. /tower off turns it off."

/** `/tower off`: everything Tower started here stops; what Claude Code cannot take back stays registered, idle. */
async function unplaceTower($: EngineInterface): Promise<string> {
  if (!inPlaceOn) return 'tower: Tower is not on in this session · /tower turns it on'
  inPlaceOn = false
  await update($, inPlace, () => false)
  for (const timer of timers.splice(0)) timer.cancel()
  const fallback = fallbackChoice(null)
  activeConfig = fallback.config
  await update($, sessionConfig, () => fallback.choice)
  await $.ui.close({ id: DECK_PANE }).catch(() => {})
  $.ui.invalidate('ui.render')
  return 'Tower is off in this session: no flightdeck, band, safety rules or routing, no timers. Its roles (executor, scout, '
    + 'verifier, runner), /deck, /compact-micro and the pin tool stay registered until the session ends (Claude Code cannot '
    + 'remove them). /tower turns it on again.'
}

/** bin/tower-install's exit codes for a question (decision 066): a `tower` that is not ours, a folder not on PATH. */
const INSTALL_EXISTS = 3
const INSTALL_OFF_PATH = 4

/** Runs `bin/tower-install <args>` from this plugin's root: its exit code and its output. */
async function installScript($: EngineInterface, args: string[]): Promise<{ code: number; out: string }> {
  try {
    const result = await $.process.run([`${$.plugin.root}/bin/tower-install`, ...args], { timeoutMs: 60_000 })
    return { code: result.exitCode, out: `${result.stdout}${result.stderr}`.trimEnd() }
  } catch (err) {
    return { code: 1, out: `tower install: ${firstLine(String(err))}` }
  }
}

/** The person's answer; null when dismissed or when nobody can be asked (`claude -p`). */
async function askPerson($: EngineInterface, question: string, options: string[]): Promise<string | null> {
  try {
    return await $.ui.ask(question, options)
  } catch {
    return null
  }
}

/**
 * `/tower install`: the requirements report, then the wrapper written, asking before it replaces a `tower` that is not
 * ours and when its folder is not on PATH. `/tower uninstall` removes only our wrapper.
 */
async function launcherCommand($: EngineInterface, verb: 'install' | 'uninstall', rest: string[]): Promise<string> {
  if (verb === 'uninstall') return (await installScript($, ['uninstall', ...rest])).out
  const report = (await installScript($, ['check'])).out
  let args = ['install', ...rest]
  for (let round = 0; round < 4; round += 1) {
    const result = await installScript($, args)
    const [head = '', detail = ''] = result.out.split('\n')[0]?.split('\t') ?? []
    if (result.code === INSTALL_EXISTS && head === 'exists') {
      const answer = await askPerson($, `${detail} is a tower command Tower did not write (${result.out.split('\n').slice(1).join(' ').trim() || 'its content is shown above'}). Replace it?`, ['Replace it', 'Keep it'])
      if (answer !== 'Replace it') return `${report}\n\nNot installed: ${detail} kept as it is.`
      args = [...args, '--replace']
      continue
    }
    if (result.code === INSTALL_OFF_PATH && head === 'off-path') {
      const dirs = (await installScript($, ['dirs'])).out.split('\n').filter(line => line !== '' && line !== detail).slice(0, 2)
      const anyway = `${detail} (I will add it to PATH)`
      const answer = await askPerson($, `${detail} is not on your PATH. Where should the tower command go?`, [anyway, ...dirs, 'Cancel'])
      if (answer === null || answer === 'Cancel') return `${report}\n\nNot installed: no folder chosen.`
      args = answer === anyway ? [...args, '--off-path'] : [...args.filter(arg => arg !== '--off-path'), '--dir', answer.trim()]
      continue
    }
    return `${report}\n\n${result.out}`
  }
  return `${report}\n\nNot installed: too many questions; run ${$.plugin.root}/bin/tower-install install --help in a terminal.`
}

/**
 * What a Tower session sets up at its start: its configuration, settings, status file, roles, timers, and the rail or
 * the deck. session.start runs it in a session bin/CCtower launched, `/tower` in a plain session (decision 066).
 */
async function beginSession($: EngineInterface): Promise<void> {
  // Decision 060: a free Tower's sessions take the free configuration from TOWER_MODE, never from their folder.
  // Decision 063: the choice is kept in host state, so a hot reload's hooks take it back before this runs again.
  const chosen = await sessionChoice($)
  activeConfig = chosen.config
  configSettled = true
  await update($, sessionConfig, () => chosen.choice).catch(() => {})
  await loadSettings($).catch(() => {})
  const context = await readContext($)
  if (context === null) return
  // Decision 066: placed by `/tower`, no tmux of Tower's around it: no keys file, no heartbeat of a status file.
  const placed = parseRole(await $.env.get('TOWER_ROLE')) === null
  repoSkills = config().routing === 'defaults' && context.repo !== null && !noProject() ? await readRepoSkills($, context.repo) : []

  every($, SETTINGS_CHECK_MS, () => {
    void loadSettings($).catch(() => {})
    void loadAttention($).catch(() => {})
    void loadDesign($).catch(() => {})
  })
  await loadDesign($).catch(() => {})

  await writeStatus($, context, 'idle')
  await registerRoles($)
  // The rail and the deck ask Claude Code for `/model`'s list in the background when the cache is stale (decision 057).
  if (context.role === 'rail' || isWorkRole(context.role)) refreshModels($, true)
  if (!placed) {
    every($, HEARTBEAT_MS, () => {
      void heartbeat($, context)
    })
  }
  if (context.role === 'rail') await startRail($, context)
  if (isWorkRole(context.role)) {
    await launchedModel($)
    // Decision 036: the model's own tool for the PINNED box.
    await $.tool.register({ name: PIN_TOOL, description: PIN_TOOL_DESCRIPTION, inputSchema: PIN_TOOL_SCHEMA as unknown as Record<string, unknown> }).catch(() => {})
    await startDeck($, context)
    if (!placed) await startKeys($, context)
    await loadKnownCommands($)
    await loadExplain($)
    if (context.role === 'ticket' && (await isDemo($))) {
      const now = await $.clock.now()
      await update($, deckState, () => demoDeck(now))
    }
  }

  if (isWorkRole(context.role)) await suggestNext($, context, '')
}

/** Decision 066: `/tower` in a plain session places Tower in it, a free session in place, as session.start would. */
async function placeTower($: EngineInterface): Promise<string> {
  if (inPlaceOn) return 'tower: Tower is already on in this session · /tower off turns it off'
  inPlaceOn = true
  await update($, inPlace, () => true)
  await beginSession($)
  $.ui.invalidate('ui.render')
  return PLACED_TEXT
}

// ── Hooks ─────────────────────────────────────────────────────────────────

export const register: Register = (on, options) => {
  themeOption = options.theme
  // TOWER_THEME, read at session start and at each draw (a hot reload's draws may come before its session start, decision 063).
  let colours = theme(themeChoice(null, options.theme))
  const mode = routingMode(options.routing)

  on('session.start', async ($, e, next) => {
    // Decision 066: installed from the marketplace, Tower loads in every session; a plain one (no TOWER_ROLE) only gets
    // `/tower`, and stays inert unless `/tower` placed Tower in it (host state: kept across a hot reload).
    const envRole = parseRole(await $.env.get('TOWER_ROLE'))
    inPlaceOn = envRole === null && (await read($, inPlace).catch(() => false)) === true
    if (envRole !== 'rail') await $.command.register(TOWER_COMMAND).catch(() => {})
    if (envRole === null && !inPlaceOn) return next(e)
    await beginSession($)
    colours = await sessionTheme($, options.theme)
    return next(e)
  })

  // Who submitted the prompt: the person's own (typed, or through the bridge) opens a new work period at turn.start.
  // In the rail, what the person submits never reaches the model (decision 026): a ticket id moves the ▶ to it,
  // other text filters the board, an empty prompt clears the filter. `/…` stays Claude Code's.
  on('prompt.submit', async ($, e, next) => {
    await ensureSessionConfig($)
    if (e.origin.kind === 'composer' && (await isRail($))) {
      const input = parseRailInput(e.text, ticketInput(config().tickets))
      if (input.kind === 'ticket') await railJump($, input.id)
      else if (input.kind !== 'passthrough') await update($, boardFilter, () => (input.kind === 'filter' ? input.text : ''))
      // The engine always writes `Prompt dropped by a hook: <reason>` in the transcript; the reason says what tower did.
      if (input.kind !== 'passthrough') {
        keysClaim = true
        return { drop: input.kind === 'ticket' ? `tower board → ${input.id}` : input.kind === 'filter' ? `tower board filter: ${input.text}` : 'tower board filter cleared' }
      }
    }
    // Decision 055: a free session takes its name from the person's first prompt.
    if ((e.origin.kind === 'composer' || e.origin.kind === 'bridge') && (await sessionRole($)) === 'free' && (await read($, freeTitle)) === null) {
      const title = sessionTitle(typeof (e as { text?: unknown }).text === 'string' ? (e as { text: string }).text : '')
      if (title !== null) await update($, freeTitle, () => title)
    }
    // Decision 046: the person answered the review session; its last question no longer stands.
    const submitContext = (await sessionRole($)) === 'review' ? await readContext($) : null
    if (submitContext !== null && (e.origin.kind === 'composer' || e.origin.kind === 'bridge')) {
      await update($, reviewNote, note => ({ ...note, asks: null }))
      await writeStatus($, submitContext, 'working')
    }
    if (await collectsDeck($)) {
      const byPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
      await observe($, deck => promptSubmitted(deck, byPerson))
      const prompt = (e as { text?: unknown }).text
      if (byPerson && typeof prompt === 'string') {
        const now = await $.clock.now()
        // Decision 038: a secret pasted into the prompt is logged masked.
        await observe($, deck => promptLogged(deck, maskSecrets(prompt, secrets), now))
      }
    }
    return next(e)
  })

  // A key the board does not take goes on to the rail's prompt box even while the cards hold the keys; once the box
  // holds text the cards never get them back. So a stray key into the empty box is consumed with a notice, the ring
  // kept on the ▶ card. After Escape (the box holds the keys) it is typing: a filter or an id.
  on('prompt.edit', async ($, e, next) => {
    await ensureSessionConfig($)
    if (e.origin.kind !== 'composer' || !(await isRail($))) return next(e)
    // The engine has already moved the keys to the box when the edit arrives: the cards held them at the last ensureKeys, the ring on a card.
    const hadKeys = (listHadKeys && ringElement !== null) || (await $.ui.panes()).some(open => open.id === PANE && open.isFocused)
    if (!strayEdit(hadKeys, e.text, e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end))) return next(e)
    await flashBoardNotice($, `"${e.inputText}" is not a key here · esc to type a filter or an id`)
    await keysToCards($, await readContext($))
    return { text: e.text, cursor: e.cursor }
  })

  on('turn.start', async ($, e, next) => {
    await ensureSessionConfig($)
    const context = await readContext($)
    if (context === null) return next(e)
    // turn.start is the main loop's alone: a subagent's turn has none.
    if (context.role === 'review') await update($, reviewNote, () => ({ action: '', asks: null, shown: false, body: null, posted: false }))
    pinnedThisTurn = false
    if (isWorkRole(context.role) || context.role === 'review') {
      const now = await $.clock.now()
      await observe($, deck => turnStarted(deck, now))
    }
    await writeStatus($, context, 'working')

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await ensureSessionConfig($)
    const context = await readContext($)
    if (context === null) return next(e)
    if (isWorkRole(context.role) || context.role === 'review') {
      const now = await $.clock.now()
      const agentId = e.agentId
      if (agentId === undefined) {
        // A finished turn waits on nothing: an ask the classifier denied leaves no stale wait behind.
        await observe($, deck => waitingEnded(turnCompleted(deck, undefined, now, e.durationMs)))
        await observe($, deck => logged(deck, { at: now, who: 'main', text: `turn done · ${formatDuration(deck.main.lastTurn?.durationMs ?? 0)}` }))
        if ((await read($, devEnv)).restartPending) {
          await update($, devEnv, state => ({ ...state, restartPending: false }))
          await runDevEnv($, 'up')
        }
      }
      else await endAgent($, deck => turnCompleted(deck, agentId, now), agentId)
      if (e.agentId === undefined) await refreshUsage($)
    }
    if (e.agentId === undefined && context.ticket !== null) {
      // A turn can open or change the pull request: the step after it reads it again, not the minute-old copy.
      const ticket = context.ticket
      await update($, remoteDetails, details => {
        const cached = details[ticket]
        return cached === undefined ? details : { ...details, [ticket]: { ...cached, loadedAt: 0 } }
      })
    }
    if (e.agentId === undefined && context.role === 'review') {
      // The review shown and saved: the ticket session posts it (decision 025), so its post question is no question to show.
      // An answer that says it cannot post (red CI, …) offers nothing to post.
      // Decision 079: an answer that shows the review in another language (no heading) shows the saved review it
      // names; that file is the body as it stands, its round the file's own (the answer names none).
      const review = config().review
      const named = reviewShown(e.answer, review) ? null : await namedReviewFile($, e.answer).catch(() => null)
      const seen = reviewSeen(e.answer, named?.text ?? null, review)
      const shown = seen.shown
      const body = !shown || cannotPost(e.answer) ? null
        : seen.source === 'file' && named !== null ? named.path : await reviewBodyFile($, e.answer).catch(() => null)
      const answer = reviewAnswer(e.answer, body !== null ? text => asksToPost(text, config().waits) : () => false)
      // A reported post is only a claim: the ticket session verifies it on the PR (decisions 025, 046).
      await update($, reviewNote, () => ({ action: '', asks: answer.asks, shown, body, posted: answer.posted }))
    }
    if (e.agentId === undefined) await writeStatus($, context, 'idle')
    // Decision 046: the ticket session reads its status and the PR now, not at its next 5 s / 15 s tick.
    if (e.agentId === undefined && context.role === 'review') await sendCommand($, context, { role: 'ticket', key: context.ticket ?? '' }, REVIEW_CHECK_COMMAND).catch(() => false)
    if (e.agentId === undefined && isWorkRole(context.role)) await suggestNext($, context, e.answer)
    if (e.agentId === undefined && isWorkRole(context.role)) await awayAct($, context, e.answer).catch(() => {})

    return next(e)
  })

  // The observing hooks below feed the deck and never change what passes: same input on, same result back.

  on('turn.step', async function* ($, e, next) {
    await ensureSessionConfig($)
    const startedAt = await $.clock.now()
    // While Fable is blocked or off, the request names Opus 5.5 instead (this request only; settings untouched). Decision 066:
    // only where Tower acts; a plain session's requests pass as they are.
    const model = (await towerOn($)) ? resolveModel(e.model, fableBlock(), startedAt, fableFallback()) : e.model
    if (e.agentId === undefined) lastMainModel = model
    // A loop that steps again waits on no dialog.
    if ((await collectsDeck($)) && ((await read($, deckState)).waiting ?? null) !== null) await observe($, deck => waitingDone(deck, e.agentId))
    if (await collectsDeck($)) await observe($, deck => stepSeen(deck, e.agentId, startedAt))
    const result = yield* next(model === e.model ? e : { ...e, model })
    if (await collectsDeck($)) {
      const now = await $.clock.now()
      await observe($, deck => stepCompleted(deck, { agentId: e.agentId, model: e.model, effort: e.effort }, result.usage, now))
      // The advanced view's request ring: the step's own tokens, a cost only when the engine gave one.
      await observe($, deck => requestLogged(deck, { agentId: e.agentId, model: e.model, effort: e.effort }, result.usage as StepUsage, now, now - startedAt))
      // The `[step n/t]` lines of the response's visible text move the step list.
      await observe($, deck => stepClock(stepSeen(markersRead(deck, e.agentId, result.answer), e.agentId, now), e.agentId, now))
    }
    return result
  })

  // Routing changes what passes (in `enforce`), then the spawn feeds the deck as the hooks above do.
  // Any error lets the spawn through unchanged: routing never breaks delegation.
  on('agent.spawn', async ($, e, next) => {
    await ensureSessionConfig($)
    const routed = (await sessionRole($)) !== null && mode !== 'off'
    const decision = routed ? routeSpawn(e, routingProfile()) : PASS
    const applied = mode === 'enforce' ? decision : PASS
    const ticket = await collectsDeck($)
    const record = async (resolvedModel: string | null) => {
      if (!ticket || !routed || !isRecorded(e, decision, routingProfile())) return
      const shown = mode === 'enforce' || decision.kind === 'pass' ? resolvedModel : null
      const entry = { at: await $.clock.now(), text: describeRoute(e, decision, shown), kind: decision.kind }
      await observe($, deck => logged(routeDecided(deck, entry), { at: entry.at, who: 'routing', text: entry.text }))
    }

    if (applied.kind === 'deny') {
      await record(null)
      return { deny: applied.reason }
    }
    const routedInput = applied.kind === 'model' ? { ...e, model: applied.model } : applied.kind === 'role' ? { ...e, subagentType: applied.type } : e
    // Decision 066: Fable's fallback only where Tower acts.
    const spawnModel = routedInput.model === undefined || !(await towerOn($)) ? routedInput.model : resolveModel(routedInput.model, fableBlock(), await $.clock.now(), fableFallback())
    const input = spawnModel === routedInput.model ? routedInput : { ...routedInput, model: spawnModel }
    const result = await next(input)
    const spawned = result as { model?: string; agentId?: string }
    await record(spawned.model ?? null)
    if (spawned.agentId !== undefined && ticket) {
      const spawn = { agentId: spawned.agentId, model: spawned.model ?? '', subagentType: input.subagentType, description: e.description, prompt: e.prompt }
      const now = await $.clock.now()
      await observe($, deck => stepSeen(agentSpawned(deck, spawn, now), spawn.agentId, now))
      await observe($, deck => logged(deck, { at: now, who: 'main', text: `→ ${logWho(deck, spawn.agentId)} · ${familyName(spawn.model)}` }))
    }
    return result
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))

  // The main session is told how to delegate: one section, added last, nothing else touched.
  on('prompt.compose', async ($, e, next) => {
    await ensureSessionConfig($)
    const composed = await next(e)
    const role = (await sessionRole($))
    if (role === null) return composed
    const sections = [...composed.sections]
    // The review session keeps reading and judging the diff; its own section sends the mechanics to agents.
    const guidance = role === 'review' ? reviewGuidanceFor(((await $.env.get('TOWER_WORKTREE')) || null) ?? (await $.session.cwd())) : routingProfile().mainGuidance
    if (mode !== 'off') sections.push({ id: GUIDANCE_SECTION, text: guidance, scope: 'session' as const })
    const explain = (await isTicketSession($)) ? explainSection(await read($, explainState)) : null
    if (explain !== null) sections.push({ id: EXPLAIN_SECTION, text: explain, scope: 'session' as const })
    if (isWorkRole(role)) sections.push({ id: PIN_SECTION_ID, text: PIN_SECTION, scope: 'session' as const })
    return { sections }
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))

  on('tool.call', async ($, e, next) => {
    await ensureSessionConfig($)
    // Without agentId the call is the main loop's own.
    const agentId = e.agentId
    const reviewing = (await sessionRole($)) === 'review'
    if (agentId === undefined && reviewing) {
      // The REVIEW box's line 2: what the review session does now.
      // Decision 038: a secret in the command never reaches the status file.
      const action = maskSecrets(actionLine((e as { tool: string }).tool, e as unknown as Record<string, unknown>), secrets)
      await update($, reviewNote, note => ({ ...note, action }))
    }
    if (!(await collectsDeck($))) return next(e)
    const tool = (e as { tool: string }).tool
    const now = await $.clock.now()
    // Decision 037: a blocked command or a credential read is refused before it runs; placeholders go back to the real
    // secrets on the way in, and secrets in the result become placeholders before the model reads it.
    const safety = await safetyOn($)
    const asked = e as unknown as Record<string, unknown>
    // Decision 082: a squash or rebase merge runs as `--merge`, so tool.check and the dialog see `--merge`.
    const merged = safety ? await mergedCall($, tool, asked) : null
    if (merged !== null) await observe($, deck => safetyNoted(deck, 'rewrote', `${maskValue(actionLine(tool, asked), secrets)} · ran with --merge`, now))
    const input = merged ?? asked
    const risk = safety ? await callRisk($, tool, input) : null
    if (risk?.level === 'block') {
      await observe($, deck => safetyNoted(deck, 'blocked', `${maskValue(actionLine(tool, input), secrets)} · ${risk.reason}`, now))
      return { deny: `${risk.reason} (Tower safety rule)` }
    }
    const restored = safety ? restoreInput(tool, input, secrets) : null
    const cwd = await $.session.cwd().catch(() => null)
    // Decision 038: the deck's log and actions, and so the status file, hold the masked text.
    const shown = maskValue(shownInput(input, cwd, (await $.env.get('HOME')) ?? null), secrets)
    const useId = (e as { tool_use_id?: unknown }).tool_use_id
    const callId = typeof useId === 'string' && useId !== '' ? useId : String(++callCount)
    await observe($, deck => stepClock(callStarted(waitingAsked(toolLogged(toolStarted(deck, agentId, tool, shown), agentId, tool, shown, now), tool, input, now, agentId), agentId, callId, tool, shown, now), agentId, now))
    try {
      const ran = masked(await next((restored ?? input) as unknown as typeof e), safety)
      const result = merged !== null && ran.deny === undefined ? { ...ran, context: [...(ran.context ?? []), ran.isError === true ? MERGE_NOTE_ERRORED : MERGE_NOTE] } : ran
      const ended = await $.clock.now()
      rememberDuration(callDurations, callId, ended - now)
      // Decision 036: a pull request or a pushed branch the main loop created is pinned as a link, no model involved.
      if (agentId === undefined && tool === 'Bash' && typeof input.command === 'string') {
        const links = createdLinks(input.command, toolOutputText(result))
        if (links.length > 0) await changePins($, pins => applyPins(pins, { add: links.map(text => ({ text, kind: 'link' as const })) }, ended, 'auto').pins)
      }
      await observe($, deck => callEnded(waitingDone(toolCounted(toolFinished(deck, agentId, tool, input, result), tool, result), agentId), agentId, callId, tool, shown, result, ended))
      return result
    } catch (error) {
      // The call threw: it is no longer in flight.
      rememberDuration(callDurations, callId, (await $.clock.now()) - now)
      await observe($, deck => callEnded(deck, agentId, callId, tool, shown, { isError: true }, now))
      throw error
    }
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))

  // Decision 036: the pin tool, served here; its list lives in the deck and the status file.
  on('tool.call', { tool: /^mcp__tower__pin$/ }, async ($, e) => {
    await ensureSessionConfig($)
    const input = parsePinInput(e)
    if (input === null) return { result: 'Not pinned: give `add` as [{ text, kind: "decision" | "todo" | "link" }] and/or `done` as [id].', isError: true }
    const now = await $.clock.now()
    let reply = ''
    await changePins($, pins => {
      const applied = applyPins(pins, input, now)
      reply = pinReply(applied.pins, applied.added, applied.closed)
      if (applied.added.length > 0 && (input.add ?? []).some(item => item.kind === 'decision')) pinnedThisTurn = true
      return applied.pins
    })
    return { result: reply }
  })

  // Decision 036 (opt-in): a reply that ends on a question nobody pinned goes back once, to pin it.
  on('classic.Stop', async ($, e, next) => {
    await ensureSessionConfig($)
    if (towerSettings.pinNudge !== 'on' || !(await isTicketSession($))) return next(e)
    if (!shouldNudge({ setting: towerSettings.pinNudge, answer: e.last_assistant_message ?? '', pinnedThisTurn, nudgedAlready: e.stop_hook_active })) return next(e)
    return { ...(await next(e)), block: PIN_NUDGE }
  }).catch(($, e, next) => next(e))

  // An API error that ended the turn: a Fable `rate_limit` blocks Fable for every session (decision 032).
  on('classic.StopFailure', async ($, e, next) => {
    await ensureSessionConfig($)
    // Decision 066: a plain session's limit is its own; it blocks Fable for no Tower session.
    if (await towerOn($)) await noteLimit($, e.error, e.error_details ?? null).catch(() => {})
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStop', async ($, e, next) => {
    await ensureSessionConfig($)
    if (await collectsDeck($)) {
      const now = await $.clock.now()
      await endAgent($, deck => agentEnded(deck, e.agent_id, e.last_assistant_message ?? null, now), e.agent_id)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The gate only watches: the verdict passes back unchanged.
  // Decision 037: a risky command turns the verdict to `ask` (never weakening a deny), in auto mode too, and the board
  // hears it as `risky · <command>`; a blocked one is a deny here as well, for `$.tool.check` queries.
  on('tool.check', async ($, e, next) => {
    await ensureSessionConfig($)
    const core = await next(e)
    const input = (e.input ?? {}) as Record<string, unknown>
    const risk = core.decision !== 'deny' && (await safetyOn($)) ? await callRisk($, e.tool, input) : null
    const result = risk?.level === 'block' ? { decision: 'deny' as const, reason: `${risk.reason} (Tower safety rule)` }
      : risk?.level === 'confirm' ? { decision: 'ask' as const, reason: `Tower safety: ${risk.reason}` }
      : core
    const now = await $.clock.now()
    const action = actionLine(e.tool, input)
    if (risk?.level === 'confirm' && typeof input.command === 'string') {
      const command = input.command
      await observe($, deck => ({ ...safetyNoted(deck, 'asked', `${maskValue(action, secrets)} · ${risk.reason}`, now), waiting: { kind: 'permission' as const, text: maskValue(riskyText(command), secrets), since: now, ...(e.agentId !== undefined ? { agentId: e.agentId } : {}) } }))
      return result
    }
    if (await isTicketSession($)) {
      if (result.decision === 'deny' && e.tool_use_id !== undefined) gateDenied.add(e.tool_use_id)
      await observe($, deck => gateChecked(deck, result.decision, action, now, towerSettings.view === 'advanced'))
    }
    return result
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))

  // A permission dialog is shown (an ask auto mode's classifier decides opens none): the loop waits on the person,
  // which the status file says until the call starts, returns or is denied, or the loop's next step begins.
  on('classic.PermissionRequest', async ($, e, next) => {
    await ensureSessionConfig($)
    if (await collectsDeck($)) {
      const now = await $.clock.now()
      const toolInput = (e.tool_input ?? {}) as Record<string, unknown>
      const shown = shownInput(toolInput, await $.session.cwd().catch(() => null), (await $.env.get('HOME')) ?? null)
      // Decision 037: a risky command's dialog keeps its `risky · <command>` text (the board's red popup).
      const risky = (await safetyOn($)) && (await callRisk($, e.tool_name, toolInput)).level === 'confirm' && typeof toolInput.command === 'string'
      await observe($, deck => {
        const waited = waitingShown(deck, e.tool_name, shown, e.agent_id, now)
        return risky && waited.waiting ? { ...waited, waiting: { ...waited.waiting, text: maskValue(riskyText(String(toolInput.command)), secrets) } } : waited
      })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PostToolUse', async ($, e, next) => {
    await ensureSessionConfig($)
    if (await collectsDeck($)) await observe($, deck => waitingDone(deck, e.agent_id))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PermissionDenied', async ($, e, next) => {
    await ensureSessionConfig($)
    if (await collectsDeck($)) await observe($, deck => waitingDone(deck, e.agent_id))
    const id = (e as { tool_use_id?: string }).tool_use_id
    if (id !== undefined && gateDenied.has(id)) return next(e)
    if (await isTicketSession($)) {
      const now = await $.clock.now()
      const action = actionLine(e.tool_name, (e.tool_input ?? {}) as Record<string, unknown>)
      await observe($, deck => gateChecked(deck, 'deny', action, now))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // $.fs has no delete: the record is marked ended, and readers skip it.
  on('session.end', async ($, e, next) => {
    await ensureSessionConfig($)
    const context = await readContext($)
    if (context !== null) await writeStatus($, context, 'ended')

    return next(e)
  })

  on('command.run', { command: 'tower' }, async ($, e) => {
    await ensureSessionConfig($)
    const [verb = '', ...rest] = e.args.trim().split(/\s+/).filter(word => word !== '')
    // Decision 066: the launcher's install and removal, from any session.
    if (verb === 'install' || verb === 'uninstall') return { text: await launcherCommand($, verb, rest) }
    if (parseRole(await $.env.get('TOWER_ROLE')) === null) {
      if (verb === '' || verb === 'on') return { text: await placeTower($) }
      if (verb === 'off') return { text: await unplaceTower($) }
      return { text: TOWER_USAGE }
    }
    const context = await readContext($)
    if (context === null) return { text: 'tower: this session is not part of an tower workspace.' }
    if (context.role !== 'rail') return { text: `tower: this is a Tower ${context.role} session already · /tower install · /tower uninstall` }
    await openRail($, context, true)
    await refreshRail($, context)

    return { text: 'Ticket rail opened.' }
  })

  on('command.run', { command: 'compact-micro' }, async $ => {
    await ensureSessionConfig($)
    const context = await readContext($)
    if (context === null || !isWorkRole(context.role)) return { text: 'tower: /compact-micro belongs to a ticket session.' }
    // The engine refuses a compaction from inside command.run (it holds the turn): it runs once the command has returned.
    $.clock.after(0, () => {
      void compactMicro($).then(text => $.ui.toast(text))
    })
    return { text: 'compact micro: dropping old Read results and thinking…' }
  })

  // Decision 034: `/compact micro` (and /compact-micro) answers the compaction itself: no summary, no model call.
  on('session.compact', async ($, e, next) => {
    await ensureSessionConfig($)
    if (e.agentId !== undefined || e.trigger === 'precompute' || !isMicro(e.instructions) || !(await towerOn($))) return next(e)
    const out = microCompact(e.messages)
    lastMicro = { reads: out.reads, replies: out.replies }
    // Typed `/compact micro` has no other report: this line says what went.
    if (e.trigger === 'manual') $.ui.toast(`compact micro: ${out.reads} old Read results and the thinking of ${out.replies} replies dropped`)
    return { messages: out.messages }
  })

  on('command.run', { command: 'deck' }, async ($, e) => {
    await ensureSessionConfig($)
    const context = await readContext($)
    if (context === null || !isWorkRole(context.role)) return { text: 'tower: the deck belongs to a ticket session.' }
    await openDeck($, context, true)

    return { text: 'Deck opened.' }
  })

  // The chips row above the prompt: `explain as` and its five chips, at the right the session's next step.
  // Decision 052: the plugins beneath draw first (cc-arcade's board, …), Tower's band last, nearest the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await ensureSessionConfig($)
    const stacked = (others: Awaited<ReturnType<typeof next>> | null | undefined, band: JSX.Element) => {
      // Core's own drawing (`{ type: 'engine' }`) is no other plugin's band: Tower's draws alone, as before.
      if (others === null || others === undefined || others.type === 'engine') return band
      const { Box } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Box key="others">{others}</Box>
          <Box key="tower">{band}</Box>
        </Box>
      )
    }
    if (!e.props.hasSurvey && (await sessionRole($)) === 'review') {
      const others = await next(e)
      const { Box, Text, Button } = $.ui.resolve(e)
      const pr = (await $.env.get('TOWER_PR')) ?? '?'
      return stacked(
        others,
        <Box width={e.props.bodyColumns} justifyContent="space-between">
          <Text dimColor>{`review · PR #${pr}`}</Text>
          <Button key="close" label="hide" hotkey="x" plain onPress={async () => { const context = await readContext($); if (context !== null) await hideReview($, context) }} />
        </Box>
      )
    }
    if (e.props.hasSurvey || !(await isTicketSession($))) return next(e)
    const others = await next(e)
    colours = await sessionTheme($, options.theme)
    const { Box, Text, Button } = $.ui.resolve(e)
    const chosen = await read($, explainState)
    const nextStep = (await sessionRole($)) === 'ticket' ? await read($, ownNext) : null
    const fit = chipsFit(e.props.bodyColumns, nextStep)
    const notice = await read($, bandNotice)
    // The review starts from the deck's REVIEW box (decision 025), not from the band.
    const canReview = (await sessionRole($)) === 'ticket'
    const docCount = (await read($, docsList)).length
    const gap = (key: string) => <Text key={key}>{'  '}</Text>
    const chip = (mode: ExplainMode) => {
      const { glyph, word } = EXPLAIN_CHIPS[mode]
      const label = fit.short ? glyph : `${glyph} ${word}`
      if (mode === chosen) {
        return <Text key={`chip:${mode}`} bold><Text color={colours.accent}>{glyph}</Text>{fit.short ? '' : ` ${word}`}</Text>
      }
      return <Button key={`chip:${mode}`} label={label} plain dimColor onPress={() => void chooseExplain($, mode)} />
    }
    const chips = EXPLAIN_MODES.flatMap((mode, index) => (index === 0 ? [chip(mode)] : [gap(`gap:${mode}`), chip(mode)]))
    return stacked(
      others,
      <Box width={e.props.bodyColumns} justifyContent="space-between">
        <Box>
          {fit.label ? [<Button key="explain" label="explain as" hotkey="e" plain dimColor onPress={() => void chooseExplain($, nextMode(chosen))} />, gap('gap:label')] : []}
          {chips}
        </Box>
        <Box>
          {notice !== null ? <Text wrap="truncate" dimColor>{notice}</Text> : fit.next && nextStep !== null ? <Text wrap="truncate"><Text dimColor>next </Text>{nextStep}</Text> : <Text />}
          {canReview && towerSettings.modules.documents ? [gap('gap:docs'), <Button key="docs" label={`docs ${docCount}`} hotkey="m" plain dimColor={docCount === 0} onPress={async () => openDocs($)} />] : []}
        </Box>
      </Box>
    )
  })

  // ── The agent watch: task, steps, live lines, a message to the agent

  // The deck's ring: remembered for `w`; over a document it chooses it (Up/Down in the docs view), over a routing row too.
  on('ui.focus', { requestId: DECK_PANE }, async ($, e, next) => {
    await ensureSessionConfig($)
    deckRing = e.element ?? null
    const doc = /^doc:(\d+)$/.exec(deckRing ?? '')
    if (doc !== null) await update($, docsChosen, () => Number(doc[1]))
    const route = /^route:(.+)$/.exec(deckRing ?? '')
    if (route !== null) await update($, routeChosen, () => route[1]!)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: DECK_PANE }, async ($, e) => {
    await ensureSessionConfig($)
    colours = await sessionTheme($, options.theme)
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    if (!(await isTicketSession($))) return <Box />
    const deck = await read($, deckState)
    // A stall or a loop that starts or ends redraws the pane (decision 033); so does an agent that folds (decision 045).
    await read($, progressAlert)
    await read($, agentsFolded)
    const history = (await isDemo($)) ? demoDurations() : await read($, durations)
    const modules = towerSettings.modules
    const level = towerSettings.view
    const chosenView = await read($, deckView)
    const view = (chosenView === 'routing' && !modules.routing) || (chosenView === 'log' && !modules.log) ? 'agents' : chosenView
    const now = await $.clock.now()
    const ticket = deckTitle((await sessionRole($)), (await $.env.get('TOWER_TICKET')) ?? null)
    const columns = Math.max(30, e.props.bodyColumns ?? DECK_COLUMNS)
    if (view === 'watch') return await watchBody($, els, columns - 2, e.props.scroll?.bodyRows ?? 40, colours)
    if (view === 'docs' && towerSettings.modules.documents) return await docsBody($, els, columns - 2)
    if (view === 'aside') return await asideBody($, els, columns - 2, colours)
    if (view === 'settings') {
      return (
        <Box flexDirection="column" width={columns} paddingX={1}>
          <Text bold color={colours.accent}>settings</Text>
          <Text> </Text>
          {settingsBody($, els, async () => {
            await update($, deckView, () => 'agents')
          })}
        </Box>
      )
    }
    const inner = columns - 4
    const main = deck.main
    const working = main.state === 'working'
    const mainColour = modelColour(main.model, colours)
    // The catalogue's name when it knows the model (decision 057): `Opus 4.6`.
    const label = main.model !== null ? (findModel(catalogue, main.model)?.label ?? modelName(main.model)) : 'model ?'
    const running = runningAgents(deck)
    // The main turn may be over while its background agents still run: the session still works.
    const busy = deckBusy(deck)
    const usage = deck.usage
    // The ticket's review session: its usage joins this deck (decision 025); null in any other session.
    const reviewSpend = (await sessionRole($)) === 'ticket' ? await read($, reviewUsage) : null

    const hasClient = 'Client' in els
    const clock = (key: string, since: number) =>
      hasClient ? <els.Client key={key} module="./clock.tsx" props={{ since, now }} /> : <Text dimColor>{formatClock(now - since)}</Text>
    // Decision 033: a live clock with a short face, a suffix and an amber turn; the static face without the Client.
    const liveClock = (key: string, since: number, opts: { short?: boolean; gap?: boolean; suffix?: string; warnAfter?: number }) => {
      const warn = opts.warnAfter !== undefined && now - since >= opts.warnAfter
      const face = (opts.short === true ? (opts.gap === true ? formatShort(now - since) : formatShort(now - since).replace(' ', '')) : formatClock(now - since)) + (opts.suffix ?? '')
      return hasClient ? <els.Client key={key} module="./clock.tsx" props={{ since, now, ...opts, warnColour: colours.needsYou }} />
        : warn ? <Text key={key} color={colours.needsYou}>{face}</Text> : <Text key={key} dimColor>{face}</Text>
    }
    type Tracked = { lastEventAt?: number; inFlight?: TowerAgent['inFlight']; calls?: TowerAgent['calls'] }
    const stallOf = (worker: Tracked, working: boolean) => (modules.stalls ? stalledFor(worker, working, now) : null)
    // The action line: a loop in circles, else a stall, else the tool in flight with its clock; null leaves the card's own line.
    const progressLine = (key: string, worker: Tracked, working: boolean, width: number) => {
      const loop = modules.loops ? loopDetect(worker.calls ?? []) : null
      if (loop !== null) return <Text key={key} color={colours.needsYou}>{truncateEnd(`⟳ ${loopText(loop)}`, width)}</Text>
      if (stallOf(worker, working) !== null && worker.lastEventAt !== undefined) {
        return <Box key={key}><Text color={colours.needsYou}>◐ stalled · </Text>{liveClock(`${key}:quiet`, worker.lastEventAt, { short: true, gap: true, suffix: ' quiet', warnAfter: 0 })}</Box>
      }
      const flight = oldestInFlight(worker)
      if (flight === null) return null
      const long = now - flight.since >= LONG_TOOL_MS
      return (
        <Box key={key}>
          <Text color={long ? colours.needsYou : undefined}>{`▸ ${fitAction(flight.line, Math.max(1, width - 10))} · `}</Text>
          {liveClock(`${key}:tool`, flight.since, { short: true, warnAfter: LONG_TOOL_MS })}
        </Box>
      )
    }
    const spinner = (key: string) =>
      hasClient ? <els.Client key={key} module="./spinner.tsx" props={{ colour: colours.accent }} /> : <Text key={key} color={colours.accent}>◐</Text>
    // A bar's percent stands two cells from it: `▰▰▱▱▱  12%`.
    const percentGap = (percent: number) => `  ${Math.round(percent)}%`
    const gauge = (percent: number, cells: number, colour: string) => {
      const filled = gaugeCells(percent, cells)
      return [
        <Text key="on" color={colour}>{'▰'.repeat(filled)}</Text>,
        <Text key="off" dimColor>{'▱'.repeat(cells - filled)}</Text>,
      ]
    }

    // ── Header
    const headRunning = running + (reviewSpend?.working ? 1 : 0)
    const headTail = `${busy ? 'WORKING' : 'IDLE'}${headRunning > 0 ? ` · ${headRunning} RUNNING` : ''}`
    const head = truncateEnd(`${ticket} · `, Math.max(1, columns - label.length - headTail.length - 2))
    const header = (
      <Box justifyContent="center">
        <Text bold>{head}</Text>
        <Text bold color={mainColour}>{`${label.toUpperCase()} `}</Text>
        <Text bold>{headTail}</Text>
        {awayState.on && <Text bold color={colours.needsYou}>{' · AWAY'}</Text>}
      </Box>
    )

    const legend = (
      <Box justifyContent="center">
        {LEGEND.flatMap((family, index) => [
          <Text key={`square:${family}`} color={colours.models[family]}>{`${index > 0 ? '  ' : ''}■ `}</Text>,
          <Text key={`name:${family}`} dimColor>{family}</Text>,
        ])}
      </Box>
    )

    // ── Pulse rail
    const pulse = !deckBusy(deck) ? (
      <Text color={colours.panel}>{'─'.repeat(columns)}</Text>
    ) : hasClient ? (
      <els.Client key="pulse" module="./pulse.tsx" props={{ width: columns, accent: colours.accent, panel: colours.panel }} />
    ) : (
      <Box>
        <Text dimColor>•</Text>
        <Text color={colours.accent}>●</Text>
        <Text color={colours.panel}>{'─'.repeat(columns - 2)}</Text>
      </Box>
    )

    // ── Main panel
    const pips = effortPips(main.effort) ?? 0
    const mainSteps = stepProgress(main)
    const doing =
      mainSteps.current !== null ? `step ${stepUnderWay(mainSteps.done, mainSteps.total)}/${mainSteps.total} · ${mainSteps.current}` : working ? main.lastAction : busy ? `waiting for ${running} agent${running === 1 ? '' : 's'}` : null
    // One row per window: both always fit (the width given usageLine is the whole line's).
    const usageParts = usageLine(usage.cost, usage.limits, now, Number.MAX_SAFE_INTEGER)
    const paces = usageParts.parts.flatMap(part => {
      const pace = windowPace(part.label === '5h' ? usage.limits?.fiveHour : usage.limits?.sevenDay, WINDOW_MS[part.label], now)
      return pace === null ? [] : [{ label: part.label, pace }]
    })
    const warmth = cacheWarmth(deck.cache, usage.cost, now)
    const showContext = usage.contextPercent !== null
    const sessionTokens = Object.values(deck.tokens ?? {}).reduce((sum, count) => sum + count, 0)
    const requests = deck.requests ?? []
    const showRequests = level === 'advanced' && (main.requests > 0 || sessionTokens > 0 || requests.length > 0)
    const totals = requestTotals(requests)
    // The REQUESTS table, the lanes and the MODELS box add the review session's requests (who = review).
    const allRequests = mergedRequests(requests, reviewSpend)
    const panel = (
      <Box flexDirection="column" borderStyle="round" borderColor={mainColour} paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold color={mainColour}>{truncateEnd(`${label} · main`, inner - 10)}</Text>
          {busy ? <Text color={colours.working}>● working</Text> : <Text dimColor>○ idle</Text>}
        </Box>
        <Box>
          {main.effort === null ? (
            <Text dimColor>effort —</Text>
          ) : (
            [
              <Text key="label" dimColor>effort </Text>,
              <Text key="on" color={mainColour}>{'▮'.repeat(pips)}</Text>,
              <Text key="off" dimColor>{'▯'.repeat(EFFORT_PIPS - pips)}</Text>,
              <Text key="level" bold>{` ${main.effort}`}</Text>,
            ]
          )}
          <Text dimColor>{`   ${main.requests} req`}</Text>
        </Box>
        {usage.contextPercent !== null && (
          <Box>
            <Text dimColor>ctx </Text>
            {gauge(usage.contextPercent, 10, usage.contextPercent >= 80 ? colours.error : mainColour)}
            <Text bold>{percentGap(usage.contextPercent)}</Text>
          </Box>
        )}
        {usageParts.cost !== null && <Text>{usageParts.cost}</Text>}
        {usageParts.parts.map(part => {
          // Decision 034: `5h ▰▰▰▰▱ 84% · 78% of time · out in ~45m · resets in 1h 04m`, the forecast amber when out before the reset.
          const pace = paces.find(one => one.label === part.label)?.pace ?? null
          const head = `${part.label} ${'▰'.repeat(part.cells)}${'▱'.repeat(LIMIT_CELLS - part.cells)}${percentGap(part.percent)}`
          const paced = pace === null ? '' : ` · ${paceText(pace)}`
          const reset = part.reset === null || (head + paced + ` · ${part.reset}`).length > inner ? '' : ` · ${part.reset}`
          return (
            <Box key={part.label}>
              <Text dimColor>{`${part.label} `}</Text>
              <Text color={mainColour}>{'▰'.repeat(part.cells)}</Text>
              <Text dimColor>{'▱'.repeat(LIMIT_CELLS - part.cells)}</Text>
              <Text dimColor>{percentGap(part.percent)}</Text>
              {pace !== null && <Text dimColor={!pace.outBeforeReset} color={pace.outBeforeReset ? colours.needsYou : undefined}>{truncateEnd(paced, Math.max(0, inner - head.length))}</Text>}
              {reset !== '' && <Text dimColor>{reset}</Text>}
            </Box>
          )
        })}
        {warmth !== null && (
          <Text dimColor={!warmth.cold} color={warmth.cold ? colours.needsYou : undefined}>{truncateEnd(cacheText(warmth), inner)}</Text>
        )}
        {showRequests && (
          <Text dimColor>{truncateEnd(`requests ${totals.count} · in ${formatTokens(totals.in)} · out ${formatTokens(totals.out)} · ${costText(totals.cost)}`, inner)}</Text>
        )}
        <Box>
          <Text dimColor>now </Text>
          {(working ? progressLine('main:progress', main, !waitsOn(deck, undefined), inner - 4) : null)
            ?? (doing !== null ? <Text>{fitAction(doing, inner - 4)}</Text> : <Text dimColor>idle</Text>)}
        </Box>
      </Box>
    )

    // ── Receipt
    // The work since the person's last own prompt, its follow-up turns and agents included.
    const work = workReceipt(deck)
    const receipt =
      work === null || main.workStartedAt === null ? null : (
        <Box borderStyle="round" borderColor={colours.panel} paddingX={1}>
          {deckBusy(deck) ? (
            [
              spinner('glyph'),
              <Text key="label"> turn </Text>,
              clock('clock:work', main.workStartedAt),
              <Text key="counts">{` · ${work.edits} edits · ${work.errors} errors`}</Text>,
            ]
          ) : (
            [
              <Text key="glyph" color={colours.done}>✓</Text>,
              <Text key="label">{` last turn ${formatDuration(work.durationMs)} · ${work.agents} agents · ${work.edits} edits · ${work.errors} errors`}</Text>,
              work.cost !== null && <Text key="sep">{' · '}</Text>,
              work.cost !== null && <Text key="cost" color={colours.accent}>{`+$${work.cost.toFixed(2)}`}</Text>,
            ]
          )}
        </Box>
      )

    // ── Agents
    const nameButton = (agent: TowerAgent, label: string) => (
      <Button
        key={`agent:${agent.id}`}
        label={label}
        plain
        onPress={async () => {
          await openWatch($, agent.id)
        }}
      />
    )
    // The advanced view: a card's tool calls as a scrolled tail (newest last) and its requests (ADVANCED_CARD_ROWS rows at most).
    const advancedLines = (agent: TowerAgent) => {
      if (level !== 'advanced') return null
      const own = requestsOf(requests, agent.name)
      const steps = stepProgress(agent)
      const stepText = steps.total > 0 ? ` · step ${stepUnderWay(steps.done, steps.total)} of ${steps.total}` : ''
      return [
        ...agent.recent.slice(-ADVANCED_TAIL).map((line, index) => <Text key={`recent:${index}`} dimColor>{`· ${fitAction(line, inner - 2)}`}</Text>),
        <Text key="counts" dimColor>{truncateEnd(`${own.count} req · ${formatTokens(own.in)}/${formatTokens(own.out)} tokens${stepText}`, inner)}</Text>,
      ]
    }
    const card = (agent: TowerAgent) => {
      const colour = modelColour(agent.model, colours)
      const model = agent.model !== null && agent.model !== '' ? familyName(agent.model) : '–'
      const effort = agent.effort !== null ? ` · ${agent.effort}` : ''
      const isRunning = agent.status === 'running'
      const failed = agent.status === 'failed'
      const steps = stepProgress(agent)
      const estimate = isRunning ? estimateTotal(history, agent.type) : null
      const elapsed = now - agent.startedAt
      const fraction = progressFraction(steps, elapsed, estimate)

      // Row 1 is laid out to exactly `inner` cells: a filler, not space-between, sits between its halves.
      const stepText = steps.total > 0 ? `step ${stepUnderWay(steps.done, steps.total)} of ${steps.total}` : `${agent.actions} actions`
      const left = estimate === null ? '' : ` · ${formatLeft(estimate - elapsed)}${estimate > elapsed ? ' left' : ''}`
      const doneText = `done · ${formatClock((agent.endedAt ?? now) - agent.startedAt)}`
      const rightWidth = isRunning ? stepText.length + left.length : doneText.length
      const name = truncateEnd(agent.name, Math.max(1, Math.min(24, inner - rightWidth - model.length - effort.length - 6)))
      const tail = truncateEnd(`  ${model}`, Math.max(0, inner - rightWidth - name.length - 3))
      const tailEffort = truncateEnd(effort, Math.max(0, inner - rightWidth - name.length - 3 - tail.length))
      const gap = Math.max(1, inner - 2 - name.length - tail.length - tailEffort.length - rightWidth)
      const head = (
        <Box width={inner}>
          {isRunning ? spinner(`spin:${agent.id}`) : <Text color={failed ? colours.error : colours.done}>{failed ? '✗' : '✓'}</Text>}
          <Text> </Text>
          {nameButton(agent, name)}
          <Text color={colour}>{tail}</Text>
          <Text dimColor>{tailEffort}</Text>
          <Text>{' '.repeat(gap)}</Text>
          {isRunning ? [
            steps.total > 0 ? <Text key="step" bold>{stepText}</Text> : <Text key="step" dimColor>{stepText}</Text>,
            left !== '' && <Text key="left" dimColor>{left}</Text>,
          ] : <Text dimColor>{doneText}</Text>}
        </Box>
      )

      if (!isRunning) {
        return (
          <Box key={`card:${agent.id}`} flexDirection="column" borderStyle="round" borderColor={colours.panel} paddingX={1}>
            {head}
            <Text>{truncateEnd(agent.task, inner)}</Text>
            <Text dimColor>{truncateEnd(`» ${firstLine(agent.lastOutput ?? '') || '—'}`, inner)}</Text>
            {advancedLines(agent)}
          </Box>
        )
      }
      // The clock against the type's typical time (decision 033, after gsd-status-mod): `2:45 / ~6:00`, amber past 1.5×.
      const typical = estimate === null ? '' : ` / ${typicalText(estimate)}`
      const cells = inner - 7 - typical.length
      const filled = fraction === null ? 0 : Math.round(fraction * cells)
      const current = steps.current ?? agent.lastAction
      const working = !waitsOn(deck, agent.id)
      const stepClockShown = steps.current !== null && agent.stepSince != null
      return (
        <Box key={`card:${agent.id}`} flexDirection="column" borderStyle="round" borderColor={stallOf(agent, working) !== null ? colours.needsYou : colour} paddingX={1}>
          {head}
          <Text>{truncateEnd(agent.task, inner)}</Text>
          <Box width={inner} justifyContent="space-between">
            {fraction === null ? (
              <Text dimColor>{'no estimate yet'.padEnd(cells)}</Text>
            ) : (
              <Box>
                <Text color={colour}>{'▰'.repeat(filled)}</Text>
                <Text color={colours.panel}>{'▱'.repeat(cells - filled)}</Text>
              </Box>
            )}
            {estimate === null ? clock(`clock:${agent.id}`, agent.startedAt)
              : liveClock(`clock:${agent.id}`, agent.startedAt, { suffix: typical, warnAfter: estimate * OVER_TYPICAL })}
          </Box>
          <Box>
            <Text color={colour}>▸ </Text>
            {current !== null ? <Text bold>{fitAction(current, inner - 2 - (stepClockShown ? 9 : 0))}</Text> : <Text dimColor>starting…</Text>}
            {stepClockShown && <Text dimColor> · </Text>}
            {stepClockShown && liveClock(`step:${agent.id}`, agent.stepSince!, { short: true })}
          </Box>
          {progressLine(`progress:${agent.id}`, agent, working, inner) ?? <Text dimColor>{`· ${fitAction(agent.lastAction ?? '—', inner - 2)}`}</Text>}
          {advancedLines(agent)}
        </Box>
      )
    }

    // ── View tabs: each laid out at its drawn width (a hotkey Button is `k: label`), so none is cut
    const microAsking = await read($, microAsk)
    const tabViews = [
      ...(['agents', 'routing', 'log'] as const).flatMap((name, index) => name !== 'agents' && !modules[name] ? [] : [{
        key: name as string, label: name as string, hotkey: String(index + 1), active: view === name,
        onPress: async () => {
          // The routing view reads the overrides file as it is now (another session's deck may have changed it).
          if (name === 'routing') await refreshRoutingOverrides($)
          // A stale model list is asked again in the background (decision 057).
          if (name === 'routing') refreshModels($, false)
          await update($, deckView, () => name)
          if (name === 'routing') await $.ui.focus({ requestId: DECK_PANE, key: await routeRing($) }).catch(() => {})
        },
      }]),
      ...(modules.documents ? [{ key: 'docs', label: 'docs', hotkey: 'm', active: false, onPress: async () => openDocs($) }] : []),
      { key: 'watch', label: 'watch', hotkey: 'w', active: false, onPress: async () => watchFromDeck($) },
      { key: 'aside', label: 'aside', hotkey: 'a', active: false, onPress: async () => openAside($) },
      { key: 'micro', label: 'compact micro', hotkey: 'k', active: false, onPress: async () => { await update($, microAsk, () => true) } },
      {
        key: 'settings', label: 'settings', hotkey: 'p', active: false,
        onPress: async () => {
          await update($, deckView, () => 'settings')
          await $.ui.focus({ requestId: DECK_PANE, key: `set:view:${towerSettings.view}` }).catch(() => {})
        },
      },
    ]
    const tabWidth = (tab: (typeof tabViews)[number]) => tab.active ? tab.label.length : tab.label.length + 3
    const tabsRow = tabsFit(columns, tabViews.map(tab => ({ key: tab.key, width: tabWidth(tab), active: tab.active })))
    const tabs = (
      <Box justifyContent="center" flexShrink={0}>
        {tabViews.filter(tab => tabsRow.shown.includes(tab.key)).map((tab, index) => [
          index > 0 ? <Box key={`gap:${tab.key}`} width={tabsRow.gap} flexShrink={0}><Text>{' '.repeat(tabsRow.gap)}</Text></Box> : null,
          <Box key={`tab:${tab.key}`} width={tabWidth(tab)} flexShrink={0}>
            {tab.active ? (
              <Text bold>{tab.label}</Text>
            ) : (
              <Button key={`view:${tab.key}`} label={tab.label} hotkey={tab.hotkey} plain dimColor onPress={tab.onPress} />
            )}
          </Box>,
        ])}
      </Box>
    )

    // ── Sessions timeline
    const order = cardOrder(deck.agents)
    const axisFrom = main.workStartedAt ?? (deck.agents.length > 0 ? Math.min(...deck.agents.map(agent => agent.startedAt)) : null)
      ?? reviewSpend?.spans[0]?.from ?? null
    const laneCount = Math.max(8, columns - 25)
    const cellRuns = (cells: { model: string | null; head: boolean }[]) => {
      const runs: { model: string | null; head: boolean; length: number }[] = []
      for (const cell of cells) {
        const last = runs[runs.length - 1]
        if (last !== undefined && last.model === cell.model && !last.head && !cell.head) last.length++
        else runs.push({ ...cell, length: 1 })
      }
      return runs.map((run, index) =>
        run.model === null ? (
          <Text key={`cell:${index}`} color={colours.panel}>{'·'.repeat(run.length)}</Text>
        ) : (
          <Text key={`cell:${index}`} color={modelColour(run.model, colours)}>{(run.head ? '╸' : '━').repeat(run.length)}</Text>
        ),
      )
    }
    // The advanced view: under each lane, the lane's request count and tokens in dim.
    const laneRequests = (key: string, who: string) => {
      if (level !== 'advanced') return null
      const own = requestsOf(allRequests, who)
      return <Box key={`lane-req:${key}`} paddingLeft={12}><Text dimColor>{`${own.count} req · ${formatTokens(own.in + own.out)}`}</Text></Box>
    }
    const lane = (key: string, glyph: ReturnType<typeof spinner>, name: string, spans: TowerSpan[], time: ReturnType<typeof spinner>) => [
      <Box key={`lane:${key}`}>
        <Box width={2}>{glyph}</Box>
        <Box width={10}><Text>{truncateEnd(name, 9)}</Text></Box>
        <Box width={laneCount}>{cellRuns(laneCells(spans, axisFrom ?? now, now, laneCount))}</Box>
        <Box width={7} paddingLeft={1}>
          {laneLabel(laneModels(spans)).map(part => (
            <Text key={`label:${part.text}`} color={colours.models[part.family]}>{part.text}</Text>
          ))}
        </Box>
        <Box width={6} justifyContent="flex-end">{time}</Box>
      </Box>,
      laneRequests(key, key === 'main' ? 'main' : name),
    ]
    const agentSpans = (agent: TowerAgent): TowerSpan[] =>
      agent.spans ?? (agent.model !== null ? [{ model: agent.model, from: agent.startedAt, to: agent.endedAt }] : [])
    const laneRunning = (working ? 1 : 0) + running + (reviewSpend?.working ? 1 : 0)
    // The review session's lane (decision 025), under the agents, once it made a request.
    const reviewLane = reviewSpend !== null && reviewSpend.spans.length > 0
    // Decision 045: at most 8 running cards and lanes, finished ones for 20 s, then one summary row (`h` opens them all).
    const historyOpen = await read($, agentHistory)
    const sections = agentSections(deck.agents, now, historyOpen)
    const laneOf = (agent: TowerAgent) =>
      lane(
        agent.id,
        agent.status === 'running' ? (
          spinner(`lane-spin:${agent.id}`)
        ) : (
          <Text color={agent.status === 'failed' ? colours.error : colours.done}>{agent.status === 'failed' ? '✗' : '✓'}</Text>
        ),
        agent.name,
        agentSpans(agent),
        agent.status === 'running' ? (
          clock(`lane-clock:${agent.id}`, agent.startedAt)
        ) : (
          <Text dimColor>{formatClock((agent.endedAt ?? now) - agent.startedAt)}</Text>
        ),
      )
    const sessions =
      axisFrom === null ? null : (
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text bold>{`sessions · ${laneRunning} running · ${deck.agents.length + 1 + (reviewLane ? 1 : 0)} total`}</Text>
            <Text dimColor>model over time</Text>
          </Box>
          {lane(
            'main',
            working ? spinner('lane-spin:main') : <Text dimColor>○</Text>,
            'main',
            main.spans ?? [],
            working ? clock('lane-clock:main', axisFrom) : <Text dimColor>{formatClock((main.turnEndedAt ?? now) - axisFrom)}</Text>,
          )}
          {sections.cards.filter(agent => agent.status === 'running').map(agent => laneOf(agent))}
          {sections.moreRunning > 0 && <Box key="lane:more-running" paddingLeft={2}><Text dimColor>{`+${sections.moreRunning} running`}</Text></Box>}
          {sections.cards.filter(agent => agent.status !== 'running').map(agent => laneOf(agent))}
          {sections.fold !== null && !historyOpen && (
            <Box key="lane:fold">
              <Box width={2}><Text dimColor>✓</Text></Box>
              <Text dimColor>{`${sections.fold.done} done`}</Text>
              {sections.fold.failed > 0 && [<Text key="sep" dimColor>{' · '}</Text>, <Text key="failed" color={colours.error}>{`✗ ${sections.fold.failed} failed`}</Text>]}
            </Box>
          )}
          {reviewLane &&
            lane(
              'review',
              reviewSpend.working ? spinner('lane-spin:review') : <Text dimColor>○</Text>,
              'review',
              reviewSpend.spans,
              reviewSpend.working ? clock('lane-clock:review', reviewSpend.spans[0]!.from) : <Text dimColor>{formatClock((reviewSpend.spans.at(-1)!.to ?? now) - reviewSpend.spans[0]!.from)}</Text>,
            )}
        </Box>
      )
    const sessionRows = axisFrom === null ? 0 : sessionRowsOf(sections, historyOpen, level === 'advanced', reviewLane)

    // ── Routing view
    const routing = deck.routing
    // The table with the person's overrides (decision 056): one row per new session, skill and role; ↑↓ or a click chooses
    // one, `j` `e` `d` change it (the file is written only then). A value off the table shows ● and the table's, dimmed.
    const table = tableProfile()
    const routeRows = routingRows(table)
    // Decision 066: a session `/tower` placed Tower in is never relaunched: its own model stays, the roles reach its subagents.
    const placedHere = parseRole(await $.env.get('TOWER_ROLE')) === null
    const chosenRoute = await read($, routeChosen)
    const selectedRoute = routeRows.find(row => row.key === chosenRoute) ?? routeRows[0]
    // Decision 057: models by their names from Claude Code's `/model` list; a model it no longer has reads `⚠`.
    const routeName = Math.max(10, Math.min(16, inner - 42))
    const routeModelWidth = 24
    const routeEffortWidth = Math.max(8, inner - 2 - routeName - routeModelWidth)
    const routeCell = (key: string, cell: RouteCell, width: number, colour: string | undefined, isDefault: boolean) => {
      // The value, ` ⚠`, ` ●` and ` (table)` cut to `width`: the table's name first (left out below 4 cells), then the value's.
      const warn = cell.unavailable ? ' ⚠' : ''
      const mark = cell.overridden ? ' ●' : ''
      const room = width - cell.text.length - warn.length - mark.length - 3
      const base = !cell.overridden ? null : room >= cell.base.length ? cell.base : room >= 4 ? truncateEnd(cell.base, room) : null
      const text = truncateEnd(cell.text, Math.max(3, width - warn.length - mark.length - (base !== null ? base.length + 3 : 0)))
      return [
        <Text key={`${key}:value`} color={isDefault ? undefined : colour} dimColor={isDefault}>{text}</Text>,
        ...(cell.unavailable ? [<Text key={`${key}:warn`} color={colours.needsYou}>{warn}</Text>] : []),
        ...(cell.overridden ? [<Text key={`${key}:mark`} color={colours.accent}>{mark}</Text>] : []),
        ...(base !== null ? [<Text key={`${key}:table`} dimColor>{` (${base})`}</Text>] : []),
      ]
    }
    const routeRow = (row: RouteRow) => {
      const cells = routeCells(table, routingOverrides, row.target, catalogue)
      const chosen = routeValue(table, routingOverrides, row.target).model
      const modelId = chosen === null ? null : modelIdOf(chosen, table.modelIds, catalogue)
      return (
        <Box key={`routerow:${row.key}`}>
          <Text dimColor>{row.key === selectedRoute?.key ? '▸ ' : '  '}</Text>
          <Box width={routeName} flexShrink={0}>
            <Button key={`route:${row.key}`} label={truncateEnd(row.label, routeName - 1)} plain onPress={async () => { await update($, routeChosen, () => row.key) }} />
          </Box>
          <Box width={routeModelWidth} flexShrink={0}>{routeCell(`${row.key}:model`, cells.model, routeModelWidth - 1,modelId !== null ? modelColour(modelId, colours) : undefined, modelId === null)}</Box>
          <Box flexShrink={1}>{routeCell(`${row.key}:effort`, cells.effort, routeEffortWidth, undefined, cells.effort.text === 'default' || cells.effort.text === '—')}</Box>
        </Box>
      )
    }
    const routeKey = (field: 'model' | 'effort' | 'reset') => async () => {
      // The row chosen when the key is pressed, on the table and the file as they are now.
      const rows = routingRows(tableProfile())
      const chosen = await read($, routeChosen)
      const row = rows.find(one => one.key === chosen) ?? rows[0]
      if (row === undefined) return
      // `e` on a model that takes no effort (Haiku 4.5) does nothing, the file untouched.
      if (field === 'effort' && routeEfforts(tableProfile(), routingOverrides, row.target, catalogue).length === 0) return
      await changeRoutingOverrides($, overrides => field === 'reset' ? resetOverride(overrides, row.target) : cycleOverride(tableProfile(), overrides, row.target, field, catalogue))
    }
    // One dim line when the list is not fresh from Claude Code (decision 057).
    const modelsLine = catalogueSource(modelCache, now, modelsProbe !== null)
    const box = (key: string, children: unknown) => (
      <Box key={key} flexDirection="column" borderStyle="round" borderColor={colours.panel} paddingX={1}>
        {children as never}
      </Box>
    )
    // MODELS ON THIS WORKTREE: the ticket session and its review session (decision 025).
    const worktreeTokens = mergedTokens(deck.tokens ?? {}, reviewSpend?.tokens ?? {})
    const worktreeCost = mergedCost(usage.cost, reviewSpend?.cost ?? null)
    const bar = tokenBar(worktreeTokens, inner)
    const families = bar.map(part => part.family)
    const decisions = routing.decisions.slice(-5).reverse()
    const routingView = (
      <Box flexDirection="column">
        {box('rules', [
          <Box key="head" justifyContent="space-between">
            <Text bold>{`ROUTING · ${mode === 'enforce' ? 'rules on' : mode === 'observe' ? 'rules observed' : 'rules off'}`}</Text>
            <Text dimColor>{`${routing.rerouted} rerouted`}</Text>
          </Box>,
          ...routeRows.flatMap((row, index) => [
            ...(routeRows[index - 1]?.group !== row.group ? [<Text key={`routegroup:${row.group}`} bold>{row.group}</Text>] : []),
            routeRow(row),
          ]),
          <Box key="routekeys" flexWrap="wrap">
            <Button key="routekey:model" label="model" hotkey="j" plain dimColor onPress={routeKey('model')} />
            <Text dimColor>{' · '}</Text>
            <Button key="routekey:effort" label="effort" hotkey="e" plain dimColor onPress={routeKey('effort')} />
            <Text dimColor>{' · '}</Text>
            <Button key="routekey:reset" label="reset" hotkey="d" plain dimColor onPress={routeKey('reset')} />
            <Text dimColor>{' · applies to sessions started from now'}</Text>
          </Box>,
          ...(placedHere ? [<Text key="routeplaced" dimColor wrap="wrap">{ROUTING_PLACED}</Text>] : []),
          ...(modelsLine !== null ? [<Text key="routesource" dimColor wrap="truncate-end">{modelsLine}</Text>] : []),
        ])}
        {box('models', [
          <Box key="head" justifyContent="space-between">
            <Text bold>MODELS ON THIS WORKTREE</Text>
            <Text>{worktreeCost !== null ? `$${worktreeCost.toFixed(2)}` : ''}</Text>
          </Box>,
          bar.length === 0 ? (
            <Text key="bar" dimColor>no tokens yet</Text>
          ) : (
            <Box key="bar">
              {bar.map(part => (
                <Text key={`bar:${part.family}`} color={colours.models[part.family]}>{'█'.repeat(part.cells)}</Text>
              ))}
            </Box>
          ),
          <Box key="names">
            {families.flatMap((family, index) => [
              <Text key={`sep:${family}`}>{index > 0 ? ' · ' : ''}</Text>,
              <Text key={`name:${family}`} color={colours.models[family]}>{family}</Text>,
              <Text key={`count:${family}`}>{` ${formatTokens(worktreeTokens[family] ?? 0)}`}</Text>,
            ])}
          </Box>,
          // The advanced view: a second line per model family, from the request ring.
          ...(level !== 'advanced' ? [] : Object.entries(requestsByFamily(allRequests)).map(([family, totals]) => (
            <Box key={`requests:${family}`}>
              <Box width={8} flexShrink={0}><Text color={colours.models[family as keyof typeof colours.models]}>{family}</Text></Box>
              <Text dimColor wrap="truncate-end">{`${totals.count} requests · ${formatTokens(totals.in)}/${formatTokens(totals.out)} · ${costText(totals.cost)}`}</Text>
            </Box>
          ))),
        ])}
        {box('decisions', [
          <Text key="head" bold>DECISIONS</Text>,
          decisions.length === 0 ? (
            <Text key="none" dimColor>no decision yet</Text>
          ) : (
            decisions.map((decision, index) => (
              <Text key={`decision:${index}`} dimColor={index > 0} wrap="truncate-end">
                {`${clockTime(decision.at)}  ${decision.text}`}
              </Text>
            ))
          ),
        ])}
      </Box>
    )

    const mainRows = 5 + (showContext ? 1 : 0) + (usageParts.cost !== null ? 1 : 0) + usageParts.parts.length + (warmth !== null ? 1 : 0) + (showRequests ? 1 : 0)
    const bodyRows = e.props.scroll?.bodyRows
    // ── Dev-env, pinned at the bottom of every view
    const env = (await isDemo($)) ? demoDevEnv(now) : await read($, devEnv)
    const envNow = envState(env.env, env.answers, env.startPressedAt, now)
    const envUp = envNow === 'up'
    // A free session (decision 055) has no ticket boxes: no dev-env.
    const envRows = (await sessionRole($)) === 'free' ? 0 : envBoxRows(config().env, modules.devEnv, env.hasSkill)
    const ports = envPorts(config().env)
    const pinsShown = shownPins(deck.pins ?? [])
    const pinRing = deckRing !== null && deckRing.startsWith('pin:') ? deckRing.slice(4) : null
    const chosenPin = await read($, pinChosen)
    const pinSelected = pinsShown.find(pin => pin.id === pinRing) ?? pinsShown.find(pin => pin.id === chosenPin) ?? pinsShown[0]
    const pinCounts = (['decision', 'todo', 'link'] as const).map(kind => [kind, pinsShown.filter(pin => pin.kind === kind).length] as const)
      .filter(([, count]) => count > 0).map(([kind, count]) => `${count} ${kind}${count > 1 ? 's' : ''}`).join(' · ')
    const pinnedRows = view !== 'agents' || pinsShown.length === 0 ? 0 : 4 + Math.min(PINNED_MAX, pinsShown.length) + (pinsShown.length > PINNED_MAX ? 1 : 0)
    const envUrl = env.env?.frontendUrl ?? ''
    const envSlotNo = env.env !== null ? envSlot(env.env, ports) : null
    const envWord = { up: '● up', starting: '◐ starting', stopped: '○ stopped', none: '○ not started' }[envNow]
    const envRight = envSlotNo === null ? '' : envUp
      ? `slot ${envSlotNo} of ${ports?.slots ?? 0}${env.env?.startedAt != null ? ` · up ${upFor(now - env.env.startedAt)}` : ''}`
      : envNow === 'starting' ? `slot ${envSlotNo} of ${ports?.slots ?? 0}` : ''
    // Decision 073: a running compose stack (source set) the skill reported failed, or started without it, takes the note;
    // a stopped stack whose last start failed says so. The note stays on the URL row: the box keeps its rows.
    const envSkillName = envSkill(config().env) ?? 'dev-env'
    const envStack = env.env?.source !== undefined
    const envReportedFailed = envStack && env.env?.fileStatus === 'failed'
    const envLastFailed = envNow === 'stopped' && env.env?.status === 'failed'
    const envNote = envUp
      ? (envReportedFailed ? `   the /${envSkillName} skill reported failed` : env.env?.source === 'docker' ? `   started outside /${envSkillName}`
        : env.env?.loginVerified ? '   login verified' : '')
      : envNow === 'starting'
        ? (envReportedFailed ? `the /${envSkillName} skill reported failed`
          : envStack && envUrl === '' ? `${env.env?.project ?? 'the stack'} is running · no frontend port`
          : `starting the stack${envUrl !== '' ? ` on ${envUrl}` : ''}`)
      : envNow === 'stopped' ? (envLastFailed ? 'last start failed' : `stopped${envUrl !== '' ? ` · ${envUrl} is free again` : ''}`) : 'no local stack for this ticket yet'
    const envKeys = envActions(envNow)
    const envAction = (key: 'o' | 'r' | 's' | 'u', word: string, act: () => Promise<void>) =>
      envKeys.includes(key) && [
        <Text key={`gap:${key}`}>{key === envKeys[0] ? '' : '   '}</Text>,
        <Button key={`env:${key}`} label={word} hotkey={key} plain onPress={act} />,
      ]
    const devEnvBox = (
      <Box flexDirection="column" borderStyle="round" paddingX={1}
        borderColor={envUp ? colours.done : envNow === 'starting' ? colours.accent : colours.panel}>
        {env.hasSkill ? [
          <Box key="head" justifyContent="space-between">
            <Box>
              <Text bold>DEV-ENV</Text>
              <Text dimColor>{' · '}</Text>
              {envNow === 'starting' ? [spinner('spin:env'), <Text key="w" color={colours.accent}>{' starting'}</Text>]
                : <Text color={envUp ? colours.done : undefined} dimColor={!envUp}>{envWord}</Text>}
            </Box>
            <Text dimColor>{envRight}</Text>
          </Box>,
          <Box key="url">
            {envUp && <Text underline>{truncateEnd(envUrl, inner)}</Text>}
            <Text dimColor color={envReportedFailed || envLastFailed ? colours.needsYou : undefined} wrap="truncate-end">{envNote}</Text>
          </Box>,
          <Box key="keys">
            {envNow === 'starting' && <Text dimColor>wait…</Text>}
            {envAction('o', 'open', async () => {
              try { await $.process.run(['open', envUrl]) } catch { /* nothing to open */ }
            })}
            {envAction('r', 'restart', async () => {
              await update($, devEnv, state => ({ ...state, restartPending: true, startPressedAt: now }))
              await runDevEnv($, 'down')
            })}
            {envAction('s', 'stop', async () => runDevEnv($, 'down'))}
            {envAction('u', 'start', async () => {
              await update($, devEnv, state => ({ ...state, startPressedAt: now }))
              await runDevEnv($, 'up')
            })}
          </Box>,
        ] : <Text dimColor>{`this repository has no /${envSkill(config().env) ?? 'dev-env'}`}</Text>}
      </Box>
    )

    // ── REVIEW, pinned above the dev-env while the ticket has an open or draft PR (decision 025)
    const isTicketRole = (await sessionRole($)) === 'ticket'
    const ownTicket = (await $.env.get('TOWER_TICKET')) ?? ''
    const review = !isTicketRole ? null : reviewBox((await read($, remoteDetails))[ownTicket]?.pullRequest ?? null, await read($, reviewRun), await read($, reviewPeer))
    // Decision 044: the PR box above REVIEW, the verdict and checklist of decision 035, and `f: fix CI` while a check failed.
    const ownPr = review === null ? null : (await read($, remoteDetails))[ownTicket]?.pullRequest ?? null
    const ownState = await read($, ownStatus)
    const pr = towerSettings.modules.prstate && ownPr?.kind === 'pr' ? prBox(ownPr, now, ownState?.ready !== undefined || ownState?.needsYou === true, ago) : null
    // ── DOCUMENTS and OPEN QUESTIONS (decision 064): a design Tower's session, from the stage state file. Each stage's
    // document ✓ when it exists, ○ when missing; the active stage's open questions, as the PINNED box draws its decisions.
    const designShown = designTower() && view === 'agents' ? await read($, designView) : null
    const designState = designShown?.state ?? null
    const designDocs = designState === null ? [] : designDocuments(designState)
    const docLines = designShown === null ? [] : documentLines(designDocs, designShown.docs, inner)
    const docsPresent = designDocs.filter(doc => designShown?.docs[String(doc.n)] === true).length
    const asked = designState === null ? null : designQuestions(designState)
    const askedCount = asked?.questions.length ?? 0
    const documentsBox = designState === null ? null : (
      <Box key="documents" flexDirection="column" borderStyle="round" borderColor={colours.panel} paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold>DOCUMENTS</Text>
          <Text dimColor>{`${docsPresent} of ${designDocs.length}`}</Text>
        </Box>
        {docLines.length === 0 ? <Text dimColor>none yet</Text> : docLines.map((line, index) => (
          <Text key={`docline:${index}`} wrap="truncate-end">{line.map((entry, at) => [
            <Text key={`docmark:${entry.n}`} color={entry.mark === '✓' ? colours.done : undefined} dimColor={entry.mark !== '✓'}>{`${at > 0 ? '  ' : ''}${entry.mark} `}</Text>,
            <Text key={`docname:${entry.n}`} dimColor={entry.mark !== '✓'}>{entry.name}</Text>,
          ])}</Text>
        ))}
      </Box>
    )
    const questionsBox = asked === null || asked.stage === null ? null : (
      <Box key="questions" flexDirection="column" borderStyle="round" paddingX={1} borderColor={askedCount > 0 ? colours.needsYou : colours.panel}>
        <Box justifyContent="space-between">
          <Text bold>OPEN QUESTIONS</Text>
          <Text dimColor>{`${asked.stage.n} ${asked.stage.label}`}</Text>
        </Box>
        {askedCount === 0 ? <Text dimColor>none open</Text> : asked.questions.slice(0, QUESTIONS_MAX).map(question => (
          <Text key={`question:${question.id}`} wrap="truncate-end"><Text color={colours.needsYou}>{'◆ '}</Text>{truncateEnd(question.text, Math.max(8, inner - 2))}</Text>
        ))}
        {askedCount > QUESTIONS_MAX && <Text dimColor>{`+${askedCount - QUESTIONS_MAX} more`}</Text>}
      </Box>
    )
    const designRows = (documentsBox === null ? 0 : 3 + Math.max(1, docLines.length))
      + (questionsBox === null ? 0 : 3 + Math.max(1, Math.min(QUESTIONS_MAX, askedCount)) + (askedCount > QUESTIONS_MAX ? 1 : 0))
    const reviewRows = (review === null ? 0 : REVIEW_BOX_ROWS) + (pr === null ? 0 : PR_BOX_ROWS) + pinnedRows + designRows
    const withContext = (act: (context: Context) => Promise<unknown>) => async () => {
      const context = await readContext($)
      if (context !== null) await act(context)
    }
    const reviewKeys = (keys: ('v' | 'post' | 'l')[]) => keys.map((key, index) => [
      <Text key={`gap:review:${key}`}>{index === 0 ? '' : '   '}</Text>,
      key === 'v'
        ? <Button key="review:v" label={review?.kind === 'none' ? 'start review' : 'new round'} hotkey="v" plain onPress={withContext(context => startReview($, context))} />
        : key === 'post'
          ? <Button key="review:post" label="post" hotkey={REVIEW_POST_KEY} plain onPress={async () => postReview($)} />
          : <Button key="review:l" label="look" hotkey="l" plain onPress={withContext(context => showReview($, context))} />,
    ])
    const reviewBoxView = review === null ? null : (
      <Box key="review" flexDirection="column" borderStyle="round" paddingX={1}
        borderColor={review.kind === 'posted' ? colours.done : review.kind === 'reviewing' || review.kind === 'verifying' || (review.kind === 'ready' && review.posting) ? colours.accent
          : review.kind === 'asks' || review.kind === 'ready' || review.kind === 'failed' ? colours.needsYou : colours.panel}>
        <Box justifyContent="space-between">
          <Box>
            {/* The label, the posted line and the time keep their width; the model and cost suffix gives way first. */}
            {/* A fixed width: Ink measures ' · ' without its trailing space and wraps it when the line is full. */}
            <Box flexShrink={0} width={9}><Text bold>REVIEW</Text><Text dimColor>{' · '}</Text></Box>
            {review.kind === 'none' && <Text dimColor>{`PR #${review.pr} · no review yet`}</Text>}
            {review.kind === 'reviewing' && [spinner('spin:review'), <Text key="w" color={colours.accent}>{` reviewing round ${review.round}`}</Text>]}
            {review.kind === 'asks' && <Text color={colours.needsYou} wrap="truncate-end">{review.waiting ? `◆ needs you · ${review.question}` : `◆ asks: ${review.question}`}</Text>}
            {review.kind === 'ready' && (review.posting
              ? [spinner('spin:review'), <Text key="w" color={colours.accent}>{` posting round ${review.round}`}</Text>]
              : <Text color={colours.needsYou}>review ready</Text>)}
            {review.kind === 'failed' && <Text color={colours.needsYou} wrap="truncate-end">{`◆ post failed · ${review.error}`}</Text>}
            {review.kind === 'idle' && <Text dimColor>{`○ waiting for you · round ${review.round}`}</Text>}
            {review.kind === 'verifying' && [spinner('spin:review'), <Text key="w" color={colours.accent}>{` ✓ posted round ${review.round} · verifying`}</Text>]}
            {review.kind === 'posted' && <Box flexShrink={0}><Text color={colours.done}>{`✓ posted round ${review.round}${review.by === 'tower' ? ' · by tower' : ''}`}</Text></Box>}
            {review.kind !== 'none' && <Text dimColor wrap="truncate-end">{reviewSuffix(reviewSpend)}</Text>}
          </Box>
          <Box flexShrink={0}><Text dimColor>{review.kind === 'reviewing' || review.kind === 'asks' || review.kind === 'ready' || review.kind === 'failed' || review.kind === 'verifying' ? elapsed(now - review.startedAt) : review.kind === 'posted' && review.at !== null ? ago(now - review.at) : ''}</Text></Box>
        </Box>
        <Box>
          {review.kind === 'reviewing' && <Text dimColor wrap="truncate-end">{truncateEnd(review.action || 'starting…', Math.max(1, inner - 10)) + '   '}</Text>}
          {reviewKeys(reviewBoxKeys(review))}
        </Box>
      </Box>
    )

    // ── PR (decision 044): the ticket's own pull request, right above REVIEW, always PR_BOX_ROWS tall
    const prColour = (tone: PrTone) => (tone === 'dim' ? undefined : colours[tone])
    const prBoxView = pr === null ? null : (
      <Box key="pr" flexDirection="column" borderStyle="round" paddingX={1} borderColor={pr.border === 'panel' ? colours.panel : colours[pr.border]}>
        <Box justifyContent="space-between">
          <Box>
            <Box flexShrink={0}><Text bold>{`PR #${pr.number}`}</Text><Text dimColor>{' · '}</Text></Box>
            <Text color={prColour(pr.tone)} dimColor={pr.tone === 'dim'} wrap="truncate-end">{pr.label}</Text>
          </Box>
          <Box flexShrink={0}><Text color={prColour(pr.right.tone)} dimColor={pr.right.tone === 'dim'}>{pr.right.text}</Text></Box>
        </Box>
        {Array.from({ length: PR_BOX_ITEMS }, (_, index) => {
          const row = pr.rows[index]
          return row === undefined ? <Text key={`pr:row:${index}`}> </Text> : (
            <Text key={`pr:row:${index}`} wrap="truncate-end"><Text color={prColour(row.tone)} dimColor={row.tone === 'dim'}>{`${row.mark} `}</Text>{row.text}</Text>
          )
        })}
        <Box>
          {pr.more > 0 && <Text dimColor>{`+${pr.more} more`}</Text>}
          {pr.more === 0 && pr.failed === null && <Text> </Text>}
          {pr.failed !== null && [
            <Text key="gap:pr:f">{pr.more > 0 ? '   ' : ''}</Text>,
            // Puts the prompt in the box; the person sends it (decision 035).
            <Button key="pr:f" label="fix CI" hotkey="f" plain onPress={async () => $.prompt.fill({ text: fixCiPrompt(pr.failed!, pr.number), mode: 'replace' })} />,
          ]}
        </Box>
      </Box>
    )

    // ── PINNED (decision 036): open decisions, then todos, then links; `x` closes the one the ring or ↵ chose
    const pinnedBox = pinsShown.length === 0 ? null : (
      <Box key="pinned" flexDirection="column" borderStyle="round" paddingX={1}
        borderColor={pinsShown.some(pin => pin.kind === 'decision') ? colours.needsYou : colours.panel}>
        <Box justifyContent="space-between">
          <Text bold>PINNED</Text>
          <Text dimColor>{pinCounts}</Text>
        </Box>
        {pinsShown.slice(0, PINNED_MAX).map(pin => (
          <Box key={`pinrow:${pin.id}`} flexDirection="row">
            <Text color={pin.kind === 'decision' ? colours.needsYou : undefined} dimColor={pin.kind !== 'decision'}>{`${pin.id === pinSelected?.id ? '▸' : ' '} ${pin.kind === 'decision' ? '◆' : pin.kind === 'todo' ? '○' : '↗'} `}</Text>
            <Button key={`pin:${pin.id}`} label={truncateEnd(pin.text, Math.max(8, inner - 4))} plain dimColor={pin.kind === 'link'} onPress={async () => { await update($, pinChosen, () => pin.id) }} />
          </Box>
        ))}
        {pinsShown.length > PINNED_MAX && <Text dimColor>{`+${pinsShown.length - PINNED_MAX} more`}</Text>}
        {pinSelected !== undefined && (
          <Box flexDirection="row">
            <Button key="pin:done" label={`done: ${pinSelected.id}`} hotkey="x" plain dimColor onPress={async () => {
              // The ring may have moved since this frame was drawn: the pin it is on now wins.
              const ring = deckRing !== null && deckRing.startsWith('pin:') ? deckRing.slice(4) : null
              const id = ring !== null && pinsShown.some(pin => pin.id === ring) ? ring : pinSelected.id
              await changePins($, pins => applyPins(pins, { done: [id] }, now, 'person').pins)
              await update($, pinChosen, () => null)
            }} />
          </Box>
        )}
      </Box>
    )

    // ── Log view
    const WHO_COLOURS: Record<string, string> = { main: colours.accent, gate: colours.done, safety: colours.error, review: colours.accent, runner: colours.models.haiku }
    const whoColour = (who: string) => {
      const agent = deck.agents.find(item => item.name === who)
      return agent !== undefined ? modelColour(agent.model, colours) : WHO_COLOURS[who]
    }
    const gate = deck.gate ?? { allowed: 0, asked: 0, denied: 0, recent: [] }
    const gateCells = gate.recent.slice(-Math.max(0, inner))
    // The advanced log adds each model request; the medium log stays as it was.
    const logEntries = level === 'advanced' ? logWithRequests(deck.log ?? [], allRequests) : deck.log ?? []
    // Decision 037: the gate box's safety line, once a rule blocked or asked.
    const safetyLine = (gate.blocked ?? 0) + (gate.riskyAsked ?? 0) > 0 ? `blocked ${gate.blocked ?? 0} · risky asked ${gate.riskyAsked ?? 0}` : null
    const logRows = bodyRows === undefined ? 16 : Math.max(1, bodyRows - 3 - 3 - (modules.gate ? 5 + (safetyLine !== null ? 1 : 0) : 0) - 3 - envRows - reviewRows)
    const logView = [
      <Box key="log" flexDirection="column" borderStyle="round" borderColor={colours.panel} paddingX={1}>
        <Text dimColor>session log</Text>
        {logEntries.length === 0 && <Text dimColor>nothing yet</Text>}
        {logWindow(logEntries, logRows).map((entry, index) => (
          <Box key={`log:${index}`}>
            <Box width={9} flexShrink={0}><Text dimColor>{clockTime(entry.at)}</Text></Box>
            <Box width={10} flexShrink={0}>
              {entry.who === 'routing' ? <Text bold dimColor>{entry.who.slice(0, 9)}</Text>
                : <Text bold color={whoColour(entry.who)}>{entry.who.slice(0, 9)}</Text>}
            </Box>
            <Text wrap="truncate-end">{truncateEnd(entry.text, Math.max(1, inner - 19))}</Text>
          </Box>
        ))}
      </Box>,
      modules.gate && <Box key="gate" flexDirection="column" borderStyle="round" borderColor={colours.done} paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold color={colours.done}>GATE · permissions</Text>
          <Text dimColor>{`${gate.allowed + gate.asked + gate.denied} checks`}</Text>
        </Box>
        <Text>{gateCells.length === 0 ? ' ' : gateCells.map((verdict, index) => (
          <Text key={`cell:${index}`} color={verdict === 'allow' ? colours.done : verdict === 'ask' ? colours.needsYou : colours.error}>■</Text>
        ))}</Text>
        <Text dimColor>
          <Text color={colours.done}>■</Text>{` ${gate.allowed} allowed  `}
          <Text color={colours.needsYou}>■</Text>{` ${gate.asked} asked  `}
          <Text color={colours.error}>✗</Text>{` ${gate.denied} denied`}
        </Text>
        {safetyLine !== null && <Text color={colours.error} wrap="truncate-end">{safetyLine}</Text>}
      </Box>,
    ]

    // The simple view draws no legend: one row less above the main card.
    const fixedRows = (level === 'simple' ? 3 : 4) + mainRows + (receipt !== null ? 3 : 0) + envRows + reviewRows
    // The timeline off (or the simple view): no lanes to fit.
    const laneRows = modules.timeline && level !== 'simple' ? sessionRows : 0
    // The advanced view adds the REQUESTS box: cards give way first, then the table (8 rows, then 4), then the timeline.
    const tableWanted = level === 'advanced' && allRequests.length > 0
    const rowsFit = bodyRows === undefined ? { sessions: laneRows > 0, cardRows: Number.POSITIVE_INFINITY, tableRows: tableWanted ? REQUEST_TABLE_ROWS : 0 }
      : level === 'advanced' ? advancedRowsFit(bodyRows, fixedRows, laneRows, tableWanted, order.length === 0 ? 0 : 2 + cardRows(order[0]!) + ADVANCED_CARD_ROWS)
      : { ...deckRowsFit(bodyRows, fixedRows, laneRows), tableRows: 0 }
    // Left-aligned cells keep one blank before the next; the effort column is followed by right-aligned numbers, so it may fill its 6.
    const requestCell = (width: number, text: string, colour?: string, right = true, gap = 1) => (
      <Box width={width} flexShrink={0} justifyContent={right ? 'flex-end' : 'flex-start'}>
        {colour !== undefined ? <Text color={colour}>{truncateEnd(text, width - gap)}</Text> : <Text dimColor>{truncateEnd(text, width - gap)}</Text>}
      </Box>
    )
    const requestTable = rowsFit.tableRows === 0 ? null : (
      <Box key="requests" flexDirection="column" borderStyle="round" borderColor={colours.panel} paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold>REQUESTS</Text>
          <Text dimColor>{`last ${Math.min(rowsFit.tableRows, allRequests.length)} of ${allRequests.length}`}</Text>
        </Box>
        <Box>
          {requestCell(9, 'time', undefined, false)}
          {requestCell(10, 'who', undefined, false)}
          {requestCell(8, 'model', undefined, false)}
          {requestCell(6, 'effort', undefined, false, 0)}
          {requestCell(6, 'in')}
          {requestCell(6, 'out')}
          {requestCell(6, '$')}
        </Box>
        {allRequests.slice(-rowsFit.tableRows).map((request, index) => (
          <Box key={`request:${index}`}>
            {requestCell(9, clockTime(request.at), undefined, false)}
            {requestCell(10, request.who, modelColour(request.model, colours), false)}
            {requestCell(8, familyName(request.model), undefined, false)}
            {requestCell(6, request.effort ?? '—', undefined, false, 0)}
            {requestCell(6, formatTokens(request.tokensIn))}
            {requestCell(6, formatTokens(request.tokensOut))}
            {requestCell(6, request.costUsd === null ? '—' : request.costUsd.toFixed(2))}
          </Box>
        ))}
      </Box>
    )
    const spareRows = rowsFit.cardRows
    const fold = sections.fold
    const fit = fitCards(sections.cards, spareRows - (sections.moreRunning > 0 ? 1 : 0) - (fold !== null ? 1 : 0), level === 'advanced' ? ADVANCED_CARD_ROWS : 0)
    const foldRow = fold === null ? null : (
      <Box key="agents:fold">
        <Text dimColor>{`✓ ${fold.done} done`}</Text>
        {fold.failed > 0 && [<Text key="sep" dimColor>{' · '}</Text>, <Text key="failed" color={colours.error}>{`✗ ${fold.failed} failed`}</Text>]}
        <Text dimColor>{` · ${formatClock(fold.ms)}   `}</Text>
        <Button key="agents:history" label={historyOpen ? 'hide history' : 'history'} hotkey="h" plain dimColor onPress={async () => { await update($, agentHistory, open => !open) }} />
      </Box>
    )
    const done = deck.agents.length - running
    // ── Playground (simple view): six rows of figures, four when the deck is short (title and border take three).
    const playRows = spareRows >= 6 + 3 ? 6 : 4
    const playWidth = Math.max(10, columns - 4)
    const playAgents = deck.agents.map(agent => ({ id: agent.id, name: agent.name, status: agent.status, colour: modelColour(agent.model, colours) }))
    const playLine = (line: PlaygroundLine, row: number) => (
      <Text key={`play:${row}`}>{line.map((run, index) => (
        run.tone === 'dim' ? <Text key={`r${index}`} dimColor>{run.text}</Text>
        : run.tone === 'plain' ? <Text key={`r${index}`}>{run.text}</Text>
        : <Text key={`r${index}`} color={run.tone === 'agent' ? run.colour : run.tone === 'accent' ? colours.accent : run.tone === 'done' ? colours.done : colours.error}>{run.text}</Text>
      ))}</Text>
    )
    const playground = (
      <Box key="playground" flexDirection="column" borderStyle="round" borderColor={colours.panel} paddingX={1}>
        <Text dimColor>{`playground · ${running} working · ${done} done`}</Text>
        {hasClient ? (
          <els.Client
            key="playfield"
            module="./playground.tsx"
            props={{ agents: playAgents, mainWorking: working, width: playWidth, rows: playRows, accent: colours.accent, done: colours.done, error: colours.error }}
          />
        ) : playgroundScene(playAgents, working, 0, playWidth, playRows).map(playLine)}
      </Box>
    )
    const agents =
      level === 'simple' ? (
        playground
      ) : deck.agents.length === 0 ? (
        <Text dimColor>no agent has started in this session</Text>
      ) : sections.foldOnly ? (
        foldRow
      ) : (
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text bold>{`agents · ${running} running · ${deck.agents.length} total`}</Text>
            <Text dimColor>↑↓ ↵ watch</Text>
          </Box>
          {fit.shown.filter(agent => agent.status === 'running').map(card)}
          {sections.moreRunning > 0 && <Text key="agents:more-running" dimColor>{`+${sections.moreRunning} running`}</Text>}
          {fit.shown.filter(agent => agent.status !== 'running' && !agentFolded(agent, now)).map(card)}
          {foldRow}
          {fit.shown.filter(agent => agentFolded(agent, now)).map(card)}
          {fit.more > 0 && <Text dimColor>{`+${fit.more} more`}</Text>}
        </Box>
      )

    return (
      <Box flexDirection="column" width={columns} {...(bodyRows !== undefined ? { minHeight: bodyRows } : {})}>
        {header}
        {level !== 'simple' && legend}
        {tabs}
        {microAsking && (
          <Box key="micro:ask" justifyContent="center">
            <Text color={colours.needsYou}>{'compact micro: drop old Read results and thinking?  '}</Text>
            <Button key="micro:yes" label="yes" hotkey="y" plain onPress={async () => { await update($, microAsk, () => false); $.ui.toast(await compactMicro($)) }} />
            <Text>{'  '}</Text>
            <Button key="micro:no" label="no" hotkey="n" plain dimColor onPress={async () => { await update($, microAsk, () => false) }} />
          </Box>
        )}
        {view === 'agents' && [panel, pulse, rowsFit.sessions ? sessions : null, agents, requestTable, receipt]}
        {view === 'routing' && routingView}
        {view === 'log' && [...logView, receipt]}
        <Box flexGrow={1} />
        {view === 'agents' && documentsBox}
        {view === 'agents' && questionsBox}
        {view === 'agents' && pinnedBox}
        {prBoxView}
        {reviewBoxView}
        {envRows > 0 && devEnvBox}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await ensureSessionConfig($)
    colours = await sessionTheme($, options.theme)
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Markdown } = els
    // The mobile app draws no field: there the launcher shows unfiltered.
    const Input = 'Input' in els ? els.Input : null
    const bodyColumns = Math.max(10, e.props.bodyColumns ?? 30)
    const wide = bodyColumns >= WIDE_FROM_COLUMNS
    const width = wide ? LIST_COLUMNS : bodyColumns
    const view = await read($, railView)
    // Decision 036: the inspector's aside to a ticket's live session.
    const asking = await read($, boardAsk)
    const asideAnswers = await read($, boardAnswers)
    const centre = await read($, centreTicket)
    const opening = await read($, openingTicket)
    const error = await read($, openError)
    const context = await readContext($)
    const mode = await read($, railMode)

    // The skills launcher, in the list's place: its rows fit the pane's height so the arrows walk them.
    const drawLauncher = async () => {
      const ticket = (await launcherTicket($))?.key ?? null
      const filter = await read($, skillsFilter)
      const max = launcherRows(wide ? undefined : e.props.scroll?.bodyRows)
      const shown = visibleItems(launcherItems(routingProfile().skills, await read($, launcherCommands), new Set((await read($, repoCommands)) ?? [])), filter, ticket, max)
      const launch = async (item: LauncherItem | undefined) => {
        if (context !== null && item !== undefined) await launchSkill($, context, item)
      }
      const itemRow = (item: LauncherItem) => {
        const runnable = canRun(item, ticket)
        return (
          <Box key={`item:${item.name}`} flexDirection="column">
            <Box flexDirection="row">
              <Button key={`skill:${item.name}`} label={`/${item.name}`} plain dimColor={!runnable} onPress={async () => launch(runnable ? item : undefined)} />
              <Text dimColor>{itemTail(item)}</Text>
            </Box>
            <Text dimColor>{truncateEnd(`  ${item.what}`, width)}</Text>
          </Box>
        )
      }
      return (
        <Box flexDirection="column" width={width}>
          <Text dimColor>{ticket !== null ? `for ${ticket}` : 'for no ticket'}</Text>
          {Input !== null && (
            <Input
              key="filter"
              label=">"
              placeholder="type to filter"
              value={filter}
              autoFocus
              onInput={(value: string) => {
                void update($, skillsFilter, () => value).catch(() => {})
              }}
              onSubmit={() => {
                void launch([...shown.skills, ...shown.other][0]).catch(() => {})
              }}
            />
          )}
          {shown.skills.map(itemRow)}
          {shown.other.length > 0 && <Text dimColor>other skills here</Text>}
          {shown.other.map(itemRow)}
          {/* No letter hotkey: the filter would take it. Escape closes the launcher (leaveLauncherOnEscape); the Button stays for the mouse. */}
          <Button key="back" label="esc back" plain dimColor onPress={async () => closeLauncher($)} />
        </Box>
      )
    }

    const refresh = (
      <Button
        key="refresh"
        label="refresh"
        hotkey="r"
        plain
        dimColor
        onPress={async () => {
          if ((await boxText($)) !== '') await keysToCards($, context)
          if (context !== null) await Promise.all([refreshRail($, context, true), refreshLinear($)])
        }}
      />
    )

    const skills = (
      <Button key="skills" label="skills" hotkey="k" plain dimColor onPress={async () => openLauncher($)} />
    )
    /** Decision 071: a candidate's priority as the old launcher drew it (`!` `▲` `■` `▼` `·`). */
    const priorityText = (priority: TowerIssue['priority']) => {
      const glyph = priorityGlyph(priority)
      return <Text color={glyph.tone === 'dim' ? undefined : colours[glyph.tone]} bold={glyph.bold} dimColor={glyph.tone === 'dim'}>{glyph.glyph}</Text>
    }

    // Decision 055: `+ new session` at the top of the rail and the board, and while it asks, the folders it offers
    // (`m` the main checkout, `w` the focused worktree); then SESSIONS, the live free sessions.
    const newAsk = await read($, newSessionAsk)
    const freeRows = view.kind === 'rows' ? (view.free ?? []) : []
    // Decision 068: `x` asks to close the session of the row the ring is on, `y` closes it. Decision 072: the action sits in
    // the header (`x: close`, `x: remove`, `x: hide`), never on the row; keyed `close:<row>`, so the ring standing on it
    // still names that row (ringRow), and `x` pressed with the ring on the row acts on that row.
    const closing = await read($, closeAsk)
    const ringOn = (await read($, boardFocus)) ?? ''
    const ringRow = ringOn.startsWith('close:') ? ringOn.slice('close:'.length) : ringOn
    type CloseTarget = { element: string; label: 'close' | 'remove' | 'hide'; press: () => Promise<unknown> }
    /** Decision 072: the header's `x: <label>` for `target` (none: nothing to close), `gap` cells after it. */
    const headerClose = (target: CloseTarget | null, gap: 'before' | 'after') => (target === null ? null : [
      ...(gap === 'before' ? [<Text key="close:gap">{'  '}</Text>] : []),
      <Button key={`close:${target.element}`} label={target.label} hotkey="x" plain dimColor onPress={target.press} />,
      ...(gap === 'after' ? [<Text key="close:gap">{'  '}</Text>] : []),
    ])
    const freeClose = (row: (typeof freeRows)[number]) => ({ role: 'free' as const, key: row.key, name: row.name, question: `close ${row.name}?`, note: '' })
    /** The free session the ring is on, as a header close target (the boards and the Git repository rail close only those). */
    const freeTarget = (element: string): CloseTarget | null => {
      const row = freeRows.find(one => `free:${one.key}` === element)
      return row === undefined ? null : { element, label: 'close', press: async () => askClose($, freeClose(row)) }
    }
    // The question, as quit's: `y` closes, `n` (when no repository action holds it) or any move of the ring leaves it.
    // The question wraps; a note too long to share the row with `y: yes   n: no` (18 cells and a gap) takes rows of its own.
    const noteAlone = (rowWidth: number) => closing !== null && closing.note !== '' && Array.from(closing.note).length + 21 > rowWidth
    const askLines = (rowWidth: number) => closing === null ? [] : [...wrapWords(closing.question, rowWidth), ...(noteAlone(rowWidth) ? wrapWords(closing.note, rowWidth) : [])]
    const closeAskRowsAt = (rowWidth: number) => (closing === null ? 0 : askLines(rowWidth).length + 1)
    const closeAskRows = closeAskRowsAt(width)
    const closeAskView = (rowWidth: number, cancelKey = true) => closing === null ? null : (
      <Box key="close-ask" flexDirection="column" width={rowWidth}>
        {askLines(rowWidth).map((line, at) => (at < wrapWords(closing.question, rowWidth).length
          ? <Text key={`ask:${at}`} color={colours.needsYou}>{line}</Text>
          : <Text key={`ask:${at}`} dimColor>{line}</Text>))}
        <Box flexDirection="row">
          {closing.note !== '' && !noteAlone(rowWidth) && <Text dimColor>{`${closing.note}   `}</Text>}
          <Button key="close:yes" label="yes" hotkey="y" plain onPress={async () => { if (context !== null) await answerAsk($, context) }} />
          <Text>{'   '}</Text>
          <Button key="close:no" label="no" {...(cancelKey ? { hotkey: 'n' } : {})} plain dimColor onPress={async () => dropClose($)} />
        </Box>
      </Box>
    )
    // The clock only when there is a session to age (a view in error never asks it).
    const freeNow = freeRows.length > 0 ? await $.clock.now() : 0
    /** Rows `+ new session` takes: one, or while it asks in a column, its line and one per folder. */
    const newSessionRows = (column: boolean) => (newAsk !== null && column ? 1 + newAsk.length : 1)
    // `room`: the cells the row leaves it; the Button then holds its padding too, so the engine's focus inverse is the bar.
    const newSessionButton = (selected: { label: string; path: string } | null, room: number | null = null) => {
      const press = async () => { if (context !== null) await askNewSession($, context, selected) }
      return room === null ? <Button key="new-session" label="+ new session" hotkey="o" plain onPress={press} /> : (
        <Button key="new-session" label="+ new session" hotkey="o" plain onPress={press}>
          {'+ new session' + ' '.repeat(Math.max(0, room - Array.from('o: + new session').length))}
        </Button>
      )
    }
    // `ringed`: the narrow rail's ring is on it: `▶ ` before it; the Button holds the padding to `rowWidth` (the engine draws
    // `o: + new session`), the engine's focus inverse the bar.
    const newSessionView = (rowWidth: number, column: boolean, selected: { label: string; path: string } | null, ringed = false) => {
      const press = async () => { if (context !== null) await askNewSession($, context, selected) }
      if (newAsk === null) {
        return (
          <Box key="new-session-row" flexDirection="row" width={rowWidth}>
            {ringed && <Text color={colours.accent}>{'▶ '}</Text>}
            {newSessionButton(selected, rowWidth - (ringed ? 2 : 0))}
          </Box>
        )
      }
      const cancel = <Button key="new-session" label="cancel" hotkey="o" plain dimColor onPress={press} />
      const choice = (one: { key: 'm' | 'w'; label: string; path: string }) => (
        <Button key={`new-session:${one.key}`} label={truncateEnd(one.label, Math.max(4, rowWidth - 7))} hotkey={one.key} plain
          onPress={async () => { if (context !== null) await openFreeSession($, context, one.path) }} />
      )
      return column ? (
        <Box key="new-session-ask" flexDirection="column" width={rowWidth}>
          <Box flexDirection="row"><Text color={colours.accent}>{'new session in   '}</Text>{cancel}</Box>
          {newAsk.map(one => <Box key={`ns:${one.key}`} flexDirection="row"><Text>{'  '}</Text>{choice(one)}</Box>)}
        </Box>
      ) : (
        <Box key="new-session-ask" flexDirection="row" width={rowWidth}>
          <Text color={colours.accent}>{'new session in   '}</Text>
          {newAsk.map(one => [choice(one), <Text key={`ns:gap:${one.key}`}>{'   '}</Text>])}
          {cancel}
        </Box>
      )
    }
    /**
     * One free session a row: ▶ on the one in the centre, its glyph, its name (↵ shows it), where and how long.
     * `ringed`: the narrow rail's ring is on it: the ▶. The Button holds the name and the detail across `rowWidth`, so
     * the engine's focus inverse is the row's bar.
     */
    const freeLine = (row: (typeof freeRows)[number], rowWidth: number, ringed = false) => {
      const { name, detail } = freeLineParts(row, freeNow, rowWidth - 4)
      const marked = ringed || centre === row.key
      const glyphColour = row.state === 'working' ? colours.working : row.state === 'waiting' ? colours.needsYou : undefined
      const gap = Math.max(0, rowWidth - 4 - Array.from(name).length - 1 - Array.from(detail).length)
      return (
        <Box key={`free-row:${row.key}`} flexDirection="row" width={rowWidth}>
          <Text color={marked ? colours.accent : undefined}>{marked ? '▶ ' : '  '}</Text>
          <Text color={glyphColour} dimColor={row.state === 'idle'}>{`${freeGlyph(row.state)} `}</Text>
          <Button key={`free:${row.key}`} label={name} plain onPress={async () => {
            if (context !== null) await openWork($, context, { role: 'free', key: row.key, cwd: row.cwd, start: null })
          }}>
            {name}
            <Text dimColor>{`${' '.repeat(gap)} ${detail}`}</Text>
          </Button>
        </Box>
      )
    }
    /** The rows of `+ new session` (not while it asks) and SESSIONS the ▶ may follow the ring onto. */
    const freeRingRows = [...(newAsk === null ? ['new-session'] : []), ...freeRows.map(row => `free:${row.key}`)]
    /** `+ new session`, then SESSIONS and its rows when there are any, in a column `rowWidth` wide; `ringed`: the narrow rail's ring row. */
    const freeBlockRows = (column: boolean) => newSessionRows(column) + (freeRows.length > 0 ? 1 + freeRows.length : 0)
    const freeBlock = (rowWidth: number, selected: { label: string; path: string } | null, ringed: string | null = null) => (
      <Box key="free-block" flexDirection="column" width={rowWidth}>
        {newSessionView(rowWidth, true, selected, ringed === 'new-session')}
        {freeRows.length > 0 && <Text key="free-heading" dimColor>SESSIONS</Text>}
        {freeRows.map(row => freeLine(row, rowWidth, ringed === `free:${row.key}`))}
      </Box>
    )
    // The keys, on the pane's last row: the letters stay real Buttons so their hotkeys work.
    const actions = (
      <Box key="keys" flexDirection="row">
        <Text color={colours.accent}>↵</Text>
        <Text dimColor>{' open   '}</Text>
        {skills}
        <Text dimColor>{'   '}</Text>
        {refresh}
        {headerClose(freeTarget(ringRow), 'before')}
      </Box>
    )
    const height = Math.max(6, e.props.scroll?.bodyRows ?? 40)

    // The board: the rail alone in its window, drawn as the approved mock-up's first screen.
    const drawBoard = async () => {
      const tab = await read($, boardTab)
      const settingsOpen = await read($, boardSettings)
      const notice = await read($, boardNotice)
      const linearFailure = await read($, linearError)
      const issues = await read($, linearIssues)
      const remotes = await read($, remoteDetails)
      const now = await $.clock.now()
      const headerPaces = await boardPaces($, now)
      const rows = view.kind === 'rows' ? view.rows : []
      const pullRequests = Object.fromEntries(Object.entries(remotes).map(([key, remote]) => [key, remote.pullRequest]))
      const quitting = await read($, quitAsk)
      // The filter typed in the prompt box (decision 026): each list keeps the tickets whose id or title holds it.
      const filter = await read($, boardFilter)
      const all = boardLists(rows, issues, pullRequests)
      const filteredMine = all.mine.map(group => ({ ...group, tickets: filterRows(group.tickets, filter, ticket => [ticket.row.key, ticket.title]) })).filter(group => group.tickets.length > 0)
      const filteredCandidates = all.candidates.map(group => ({ ...group, issues: filterRows(group.issues, filter, issue => [issue.id, issue.title]) })).filter(group => group.issues.length > 0)
      const lists = filter === '' ? all : {
        mine: filteredMine,
        candidates: filteredCandidates,
        counts: { mine: filteredMine.reduce((sum, group) => sum + group.tickets.length, 0), candidates: filteredCandidates.reduce((sum, group) => sum + group.issues.length, 0) },
      }
      const cols = boardColumns(bodyColumns)
      const focused = await read($, focusedTicket)
      const others = filterRows(view.kind === 'rows' ? (view.others ?? []) : [], filter, other => [other.name, other.branch ?? ''])
      const otherKey = (other: TowerOtherWorktree) => `other:${other.name}`
      // Stories inside each group: `↳` children, a dim header over two or more children of an unlisted story.
      const mineGroups = lists.mine.map(group => ({ heading: group.heading, entries: groupByStory(group.tickets, issues, ticket => ticket.row.key) }))
      const candidateGroups = lists.candidates.map(group => ({ heading: group.heading, entries: groupByStory(group.issues, issues, issue => issue.id) }))
      const rowsOf = <T,>(entries: readonly StoryEntry<T>[]): T[] => entries.flatMap(entry => entry.kind === 'ticket' ? [entry.row] : [])
      const mineKeys = [...mineGroups.flatMap(group => rowsOf(group.entries).map(ticket => ticket.row.key)), ...others.map(otherKey)]
      const candidateKeys = candidateGroups.flatMap(group => rowsOf(group.entries).map(issue => issue.id))
      boardKeys = { mine: mineKeys, candidates: candidateKeys }
      const keys = tab === 'mine' ? mineKeys : candidateKeys
      const selected = focused !== null && keys.includes(focused) ? focused : (keys[0] ?? null)
      const hasClient = 'Client' in els
      const tabButton = (name: 'mine' | 'candidates', label: string, count: number) => (
        <Box key={`tab:${name}`} flexDirection="row" marginRight={4}>
          {tab === name ? <Text>{label}</Text> : <Button key={`tab:${name}`} label={label} hotkey="c" plain dimColor onPress={async () => switchList($)} />}
          <Text dimColor>{` ${count}`}</Text>
        </Box>
      )
      const idCells = idWidth(tab === 'mine' ? [...lists.mine.flatMap(group => group.tickets.map(ticket => ticket.row.key)), ...others.map(other => other.name)] : candidateKeys)
      const line = (key: string, id: string, title: string, figure: string, glyph: RenderChildren, second: string, press: () => Promise<unknown>, shown = id, away = false, blocked = false, suffix = '') => {
        const chosen = id === selected
        if (chosen) markedElement = key
        const cells = rowCells(cols.list - 2, shown, title + suffix, figure, idCells)
        return (
          <Box key={`item:${key}`} flexDirection="column" paddingLeft={1}>
            <Box flexDirection="row">
              <Text inverse={chosen}>{chosen ? '▶ ' : '  '}</Text>
              {glyph}
              <Button key={key} label={cells.id} plain onPress={press} />
              <Text inverse={chosen}>{cells.title.slice(0, title.length)}</Text>
              {cells.title.length > title.length && <Text dimColor={!chosen} inverse={chosen}>{cells.title.slice(title.length)}</Text>}
              <Text dimColor={!chosen} inverse={chosen}>{cells.figure}</Text>
            </Box>
            {away ? (
              <Text>{'    '}<Text color={colours.needsYou}>◐ away </Text><Text dimColor>{truncateEnd(second, Math.max(1, cols.list - 13))}</Text></Text>
            ) : blocked ? <Text color={colours.error}>{'    ' + truncateEnd(second, cols.list - 6)}</Text>
              : <Text dimColor>{'    ' + truncateEnd(second, cols.list - 6)}</Text>}
          </Box>
        )
      }
      const glyphOf = (id: string, glyph: { glyph: string; color: string | undefined; dim: boolean }) =>
        glyph.glyph === '◐' && hasClient && id !== selected ? (
          <Box key={`glyph:${id}`} width={2}><els.Client key={`spin:${id}`} module="./spinner.tsx" props={{ colour: glyph.color }} /></Box>
        ) : (
          <Text key={`glyph:${id}`} color={id === selected ? undefined : glyph.color} dimColor={glyph.dim && id !== selected} inverse={id === selected}>{`${glyph.glyph} `}</Text>
        )
      // A heading takes one row; a ticket two (listWindow counts the same).
      type Entry = { kind: 'heading' | 'ticket'; key: string | null; node: () => RenderChildren }
      const heading = (text: string): Entry => ({
        kind: 'heading', key: null, node: () => <Box key={`heading:${text}`} paddingLeft={1}><Text dimColor>{text}</Text></Box>,
      })
      // A story header is not a row: dim text, one row, the ring skips it.
      const storyHeader = (storyId: string, text: string): Entry => ({
        kind: 'heading', key: null, node: () => <Box key={`story:${storyId}`} paddingLeft={1}><Text dimColor>{truncateEnd(text, cols.list - 2)}</Text></Box>,
      })
      const entries: Entry[] = tab === 'mine'
        ? [...mineGroups.flatMap(group => [heading(group.heading), ...group.entries.map((entry): Entry => entry.kind === 'storyHeader' ? storyHeader(entry.storyId, entry.text) : { kind: 'ticket', key: entry.row.row.key, node: () => {
          const ticket = entry.row
          const blockedBy = ticket.issue?.blockedBy ?? []
          const step = rowStep(ticket.row, pullRequests[ticket.row.key], blockedBy, config().workflow)
          // A ticket away mode started, while its session lives: what away is taking it through.
          // Past the steps away moves (`ready · merge`), the row reads as usual.
          const started = awayState.on && ticket.row.session !== null ? awayDriven.get(ticket.row.key) : undefined
          const driven = started !== undefined && (ticket.row.session === 'working' || awayStarts(step.next, config().workflow)) ? started : undefined
          return line(`row:${ticket.row.key}`, ticket.row.key, `${entry.childPrefix ? '↳ ' : ''}${ticket.title}`, boardFigure(view.kind === 'rows' ? view.local[ticket.row.key] : undefined, now),
            glyphOf(ticket.row.key, rowGlyph(ticket.row, colours, pullRequests[ticket.row.key], blockedBy)),
            driven !== undefined ? `${ticket.row.session === 'working' ? 'working' : 'idle'} · away → ${step.next ?? driven.step}` : step.status,
            async () => { if (context !== null) await openWork($, context, ticketSession(ticket.row)) }, ticket.row.key, driven !== undefined,
            driven === undefined && step.glyph === '⊘', entry.storySuffix ?? '')
        } })]),
        // The worktrees that are not tickets: dim, at the end, not counted in the tab; ↵ opens a plain session there.
        ...(others.length > 0 ? [heading('other worktrees')] : []),
        ...others.map((other): Entry => ({ kind: 'ticket', key: otherKey(other), node: () =>
          line(`row:${otherKey(other)}`, otherKey(other), other.branch ?? 'detached', '', glyphOf(otherKey(other), { glyph: '·', color: undefined, dim: true }), 'no ticket',
            async () => { if (context !== null) await openWork($, context, { role: 'ticket', key: other.name, cwd: other.path, start: null }) }, other.name) }))]
        : candidateGroups.flatMap(group => [heading(group.heading), ...group.entries.map((entry): Entry => entry.kind === 'storyHeader' ? storyHeader(entry.storyId, entry.text) : { kind: 'ticket', key: entry.row.id, node: () => {
          const issue = entry.row
          // A candidate blocked by an open ticket: `⊘` and `blocked by …` in the error colour, in its own group still.
          const blocked = blockedText(issue.blockedBy)
          return line(`cand:${issue.id}`, issue.id, `${entry.childPrefix ? '↳ ' : ''}${issue.title}`, '—',
            glyphOf(issue.id, blocked !== null ? { glyph: '⊘', color: colours.error, dim: false } : { glyph: '○', color: undefined, dim: true }), blocked ?? candidateStatus(issue),
            async () => { if (context !== null) await promoteCandidates($, context, candidateGroups.flatMap(group => rowsOf(group.entries)), issue.id) }, issue.id, false, blocked !== null, entry.storySuffix ?? '')
        } })])
      const bodyRows = height - 2 - (linearFailure !== null ? 1 : 0)
      const hintRows = keyRows(cols.list - 2)
      const listRows = bodyRows - hintRows.length - (notice !== null ? 1 : 0) - (error !== null ? 1 : 0)
      const shown = listWindow(entries, Math.max(0, entries.findIndex(entry => entry.key === selected)), listRows, boardWindowStart[tab])
      boardWindowStart[tab] = shown.start
      // The `n more` lines are Buttons: the ring reaching one (an arrow past the window's edge) moves the window a row.
      const moreLine = (way: 'up' | 'down', count: number) => (
        <Box key={`more:${way}`} paddingLeft={1}>
          <Button key={`more:${way}`} label={`${way === 'up' ? '↑' : '↓'} ${count} more`} plain dimColor onPress={async () => moveWindow($, way)} />
        </Box>
      )
      const list = (
        <Box key="list" flexDirection="column" width={cols.list} height={bodyRows}>
          {shown.moreAbove > 0 && moreLine('up', shown.moreAbove)}
          {shown.items.map(entry => entry.node())}
          {shown.moreBelow > 0 && moreLine('down', shown.moreBelow)}
          <Box flexGrow={1} />
          {notice !== null && (quitting === null ? <Text dimColor>{' ' + truncateEnd(notice, cols.list - 2)}</Text> : (
            <Box key="quit-ask" flexDirection="row" paddingLeft={1}>
              <Text>{'close tower and every session? '}</Text>
              <Button key="quit:yes" label="yes" hotkey="y" plain onPress={async () => quitTower($)} />
              <Text dimColor>{'   any key: no' + quitWorking(quitting)}</Text>
            </Box>
          ))}
          {error !== null && <Text dimColor>{' ' + truncateEnd(error, cols.list - 2)}</Text>}
          {hintRows.map((keysOfRow, index) => (
            <Box key={`keys:${index}`} flexDirection="row" paddingLeft={1}>
              {keysOfRow.map((key, at) => (
                <Box key={`key:${key}`} flexDirection="row">
                  {at > 0 && <Text> </Text>}
                  {key === 'k' ? skills : key === 'r' ? refresh : key === 'q' ? (
                    <Button key="quit" label="quit" hotkey="q" plain dimColor onPress={async () => askQuit($)} />
                  ) : key === 'a' ? (
                    <Button key="away" label="away" hotkey="a" plain dimColor={!awayState.on} onPress={async () => setAway($, !awayState.on)} />
                  ) : (
                    <Button key={`board-skill:${key}`} label={boardAction(key)?.skill ?? key} hotkey={key} plain dimColor onPress={async () => { const action = boardAction(key); if (context !== null && action !== undefined) await launchBoardSkill($, context, action.skill) }} />
                  )}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )
      const border = <Box key="border" width={1} height={bodyRows}><Text color={colours.accent}>{Array.from({ length: bodyRows }, () => '│').join('\n')}</Text></Box>

      const ticket = tab === 'mine' ? lists.mine.flatMap(group => group.tickets).find(one => one.row.key === selected) ?? null : null
      const other = tab === 'mine' ? others.find(one => otherKey(one) === selected) ?? null : null
      const candidate = tab === 'candidates' ? issues.find(issue => issue.id === selected) ?? null : null
      const issue = ticket?.issue ?? candidate
      const local = ticket !== null && view.kind === 'rows' ? view.local[ticket.row.key] : undefined
      const remote = ticket !== null ? remotes[ticket.row.key] : undefined
      const step = ticket !== null ? rowStep(ticket.row, remote?.pullRequest, ticket.issue?.blockedBy ?? [], config().workflow) : null
      const progress = step !== null ? phaseProgress(step) : null
      const main = cols.main
      const meta = issue !== null ? issueMeta(issue) : ticket !== null ? `${ticket.row.phase} · ${ticket.row.branch}` : other !== null ? `no ticket · ${besideRepo(other.path, context?.repo ?? null)}` : ''
      const metaBlocked = issue !== null ? blockedMeta(issue, issues) : null
      const metaLine = truncateEnd(metaBlocked !== null ? `${meta} · ${metaBlocked}` : meta, main)
      const candidateBlocked = candidate !== null ? blockedText(candidate.blockedBy) : null
      const nextText = candidateBlocked !== null ? `${candidateBlocked} — start it or wait` : candidate !== null ? 'Not started. No worktree and no session exist yet.' : other !== null ? 'No next step: this worktree is not a ticket.' : (step?.next ?? ticket?.row.next ?? 'nothing recorded')
      const enter = other !== null ? '↵ opens a plain session in this worktree' : candidate === null ? '↵ opens the session of this ticket'
        : candidate.assignedToMe ? `↵ creates the worktree, opens the session and runs ${startName()}`
          : `↵ assigns it to you, creates the worktree, opens the session and runs ${startName()}`
      const phase = (
        <Box key="phase" flexDirection="row" flexWrap="wrap">
          <Text dimColor>{'phase  '}</Text>
          {PHASE_STEPS.map((name, index) => {
            const done = progress !== null && index < progress.done && index !== progress.current
            const current = progress !== null && index === progress.current
            const sep = index < PHASE_STEPS.length - 1 ? ' ── ' : ''
            return (
              <Box key={`step:${name}`} flexDirection="row" flexShrink={0}>
                <Text color={done ? colours.done : undefined} bold={current} dimColor={!done && !current}>{done ? `✓ ${name}` : current ? `▸ ${name}` : name}</Text>
                <Text dimColor>{sep}</Text>
              </Box>
            )
          })}
        </Box>
      )
      // The relations under the meta line: label dim in its own column, the text wrapping beside it.
      const relations = issue !== null ? detailRelations(issue, issues) : []
      const relWidth = Math.max(1, main - 12)
      const relationsBlock = relations.length === 0 ? null : (
        <Box key="relations" flexDirection="column">
          {relations.map((row, index) => (
            <Box key={`rel:${index}`} flexDirection="row">
              <Box width={12} flexShrink={0}><Text dimColor>{relations[index - 1]?.label === row.label ? '' : row.label}</Text></Box>
              <Box width={relWidth}>
                <Text wrap="wrap">
                  <Text color={row.tone === 'error' ? colours.error : undefined} dimColor={row.tone === 'dim'}>{row.text}</Text>
                  {row.suffix !== '' && <Text color={row.suffixTone === 'error' ? colours.error : colours.done}>{row.suffix}</Text>}
                </Text>
              </Box>
            </Box>
          ))}
          <Text> </Text>
        </Box>
      )
      const relationRows = relations.length === 0 ? 0 : 1 + relations.reduce((sum, row) => sum + wrappedRows(row.text + row.suffix, relWidth), 0)
      const fixedRows = 2 + 1 + 1 + 1 + 1 + 1 + 2 + 1 + 1 + 1 + 1 + relationRows
      const textRows = Math.max(2, bodyRows - fixedRows)
      const descWidth = Math.min(70, main)
      const description = issue !== null && issue.description.trim() !== '' ? descriptionLines(issue.description, descWidth, textRows) : null
      const descriptionBody = description === null ? (
        local?.plan ? <Markdown text={cutPlan(planExcerpt(local.plan), descWidth, textRows)} /> : <Text dimColor>no description</Text>
      ) : (
        <Box flexDirection="column" width={descWidth}>
          {description.map((part, index) => {
            if (part.kind === 'lead') return <Text key={`d:${index}`}><Text bold>{part.label}</Text>{` ${part.text}`}</Text>
            if (part.kind === 'heading') return <Text key={`d:${index}`} bold>{part.text}</Text>
            if (part.kind === 'check') return <Text key={`d:${index}`}><Text dimColor>{'☐ '}</Text>{part.text}</Text>
            if (part.kind === 'more') return <Text key={`d:${index}`} dimColor>{part.text}</Text>
            return <Text key={`d:${index}`}>{part.text}</Text>
          })}
        </Box>
      )
      const settingsButton = (
        <Button key="settings" label="settings" hotkey="p" plain dimColor onPress={async () => {
          await update($, boardSettings, () => true)
          await $.ui.focus({ requestId: PANE, key: `set:view:${towerSettings.view}` }).catch(() => {})
        }} />
      )
      const detail = settingsOpen ? (
        <Box key="detail" flexDirection="column" width={main} height={bodyRows - 1}>
          <Text bold color={colours.accent}>settings</Text>
          <Text> </Text>
          {settingsBody($, els, async () => {
            await update($, boardSettings, () => false)
            // The ring goes back to the marked ticket row, which stayed drawn in the list column.
            await focusMarked($)
          })}
        </Box>
      ) : selected === null ? (
        <Box key="detail" flexDirection="column" width={main}>
          <Text dimColor>{tab === 'mine' ? 'no ticket worktrees' : 'no candidates'}</Text>
          <Box flexGrow={1} />
          {settingsButton}
        </Box>
      ) : (
        <Box key="detail" flexDirection="column" width={main} height={bodyRows - 1}>
          <Text dimColor>{other?.name ?? selected}</Text>
          <Text bold>{truncateEnd(ticket?.title ?? candidate?.title ?? (other !== null ? other.branch ?? 'detached' : ''), main)}</Text>
          <Text> </Text>
          <Text><Text dimColor>{metaLine.slice(0, meta.length)}</Text><Text color={colours.error}>{metaLine.slice(meta.length)}</Text></Text>
          <Text> </Text>
          {candidate !== null && relationsBlock}
          {phase}
          <Text> </Text>
          {candidate === null && relationsBlock}
          <Text dimColor>next</Text>
          <Text>{truncateEnd(nextText, main)}</Text>
          <Text> </Text>
          <Text dimColor>{description === null && local?.plan ? 'plan' : 'description'}</Text>
          {descriptionBody}
          <Box flexGrow={1} />
          {/* The hint wraps onto a second line rather than lose its end at the column's width. */}
          <Box width={main}>
            <Text dimColor wrap="wrap">{enter}</Text>
          </Box>
          {settingsButton}
        </Box>
      )
      const sideWidth = cols.side
      const sideLines = (title: string, lines: string[]) => (
        <Box key={`side:${title}`} flexDirection="column" marginBottom={1}>
          <Text dimColor>{title}</Text>
          {(lines.length > 0 ? lines : ['—']).map((text, index) => <Text key={`${title}:${index}`} dimColor>{truncateEnd(text, sideWidth)}</Text>)}
        </Box>
      )
      // The source's models panel: names in their colours with counts, the cost below; `—` without session data.
      const modelsPanel = (usage: NonNullable<TowerTicketLocal['usage']> | null) => {
        const rank = (name: string) => { const at = (LEGEND as readonly string[]).indexOf(name); return at < 0 ? LEGEND.length : at }
        const parts = modelsLine(usage?.tokens).sort((x, y) => rank(x[0]) - rank(y[0]))
        if (usage === null || parts.length === 0) return sideLines('models', [])
        return (
          <Box key="side:models" flexDirection="column" marginBottom={1}>
            <Text dimColor>models</Text>
            <Box flexDirection="row" flexWrap="wrap">
              {parts.map(([name, count], index) => (
                <Box key={`model:${name}`} flexShrink={0}>
                  <Text>
                    <Text color={colours.models[name as keyof typeof colours.models] ?? undefined}>{name}</Text>
                    {` ${count}${index < parts.length - 1 ? ' · ' : ''}`}
                  </Text>
                </Box>
              ))}
            </Box>
            {usage.cost !== null && <Text>{`$${usage.cost.toFixed(2)}`}</Text>}
            {/* The advanced view: requests and tokens in/out per family, when the status file carries them. */}
            {towerSettings.view === 'advanced' && usage.requests != null && Object.entries(usage.requests)
              .sort((x, y) => rank(x[0]) - rank(y[0]))
              .map(([name, item]) => (
                <Text key={`requests:${name}`} wrap="truncate-end">
                  <Text color={colours.models[name as keyof typeof colours.models] ?? undefined}>{name}</Text>
                  <Text dimColor>{` ${item.count} requests · ${tokenCount(item.in)}/${tokenCount(item.out)}`}</Text>
                </Text>
              ))}
          </Box>
        )
      }
      const pullRequest = remote?.pullRequest
      const side = sideWidth === 0 || selected === null ? null : (
        <Box key="side" flexDirection="column" width={sideWidth}>
          {ticket !== null && sideLines('sessions', (local?.sessions ?? []).map(session => `${session.role}  ${sessionGlyph(session.state)} ${session.state}  ${formatAge(now - session.since)}`))}
          {ticket !== null && sideLines('worktree', [truncateStart(besideRepo(ticket.row.path, context?.repo ?? null), sideWidth), ...(remote?.behind != null ? [`behind origin/${local?.base ?? config().project.baseBranch}: ${remote.behind}`] : [])])}
          {ticket !== null && sideLines('pull request',
            pullRequest === undefined ? ['loading…'] : pullRequest.kind === 'pr' ? [`#${pullRequest.number} ${pullRequest.state}`, `checks ${pullRequest.checks}`]
              : pullRequest.kind === 'none' ? ['none yet'] : pullRequest.kind === 'unavailable' ? ['gh not available'] : [`gh: ${pullRequest.message}`])}
          {other !== null && sideLines('pull request', [other.branch === null ? 'no branch' : 'none (not a ticket)'])}
          {ticket !== null && towerSettings.view !== 'simple' && modelsPanel(local?.usage ?? null)}
          {candidate !== null && sideLines('linear', linearLines(candidate))}
        </Box>
      )
      return (
        <Box flexDirection="column" width={bodyColumns}>
          <Box flexDirection="row" paddingLeft={1}>
            {tabButton('mine', 'My tickets', lists.counts.mine)}
            {tabButton('candidates', 'Candidates', lists.counts.candidates)}
            {filter !== '' && <Text>{`filter: ${truncateEnd(filter, 30)}`}<Text dimColor>{'   esc clears'}</Text></Text>}
            <Box flexGrow={1} />
            {headerPaces.map(({ label, pace }) => (
              // Decision 034: `5h 84%↗`, amber when the window runs out before its reset.
              <Text key={`pace:${label}`} dimColor={!pace.outBeforeReset} color={pace.outBeforeReset ? colours.needsYou : undefined}>{`${paceChip(label, pace)}  `}</Text>
            ))}
            {blockChip(modelBlock, now) !== null && <Text color={colours.needsYou}>{`${blockChip(modelBlock, now)} `}</Text>}
            {awayState.on && <Text color={colours.needsYou}>{awayBadge(awayState, now) + ' '}</Text>}
          </Box>
          <Text color={colours.panel}>{'─'.repeat(bodyColumns)}</Text>
          {linearFailure !== null && <Text dimColor>{truncateEnd(` linear: ${linearFailure}`, bodyColumns)}</Text>}
          <Box flexDirection="row">
            {list}
            {border}
            <Box width={2} />
            {detail}
            {side !== null && <Box width={4} />}
            {side}
          </Box>
        </Box>
      )
    }

    // The home (decision 030): four columns of cards, the inspector of the focused card under them.
    const drawHome = async () => {
      const notice = await read($, boardNotice)
      const linearFailure = await read($, linearError)
      const issues = await read($, linearIssues)
      const remotes = await read($, remoteDetails)
      const now = await $.clock.now()
      const quitting = await read($, quitAsk)
      const filter = await read($, boardFilter)
      const demo = await isDemo($)
      const settingsOpen = await read($, boardSettings)
      const rows = view.kind === 'rows' ? view.rows : []
      const pullRequests = Object.fromEntries(Object.entries(remotes).map(([key, remote]) => [key, remote.pullRequest]))
      const all = boardLists(rows, issues, pullRequests)
      const W = bodyColumns
      // An attention popup sits over the header's right, above the columns; Enter on the focused card stays as it is.
      const homePopup = await attentionPopup($, context)
      const layout = columnsLayout(W)
      const cw = layout.width
      // Two title lines only in the single band of four columns ≥ 40 wide: the stacked bands keep their cards short.
      const twoLines = layout.rows.length === 1 && cw >= HOME_TWO_LINE_TITLE
      const hasClient = 'Client' in els
      // TOWER_DEMO=1: a ticket with a live session works with the demo deck's agents (the deck shows the same fixture).
      const demoAgents = demo ? demoDeck(now).agents : []
      type Card = { kind: 'card'; key: string; id: string; title: string; glyph: string; glyphColour: string | undefined; age: string; status: string; statusColour: string | undefined; statusModel: string | null
        bar: { done: number; total: number; cost: number | null } | null; model: string | null; press: () => Promise<unknown>; ticket: MineTicket | null; issue: TowerIssue | null
        /** `↳ ` before a story's child's id; ` · d/t done` after a story's title. */
        prefix: string; suffix: string
        /** Decision 035: the PR row and its verdict; the age figure's colour while the ticket waits on the person. */
        prLine: string | null; verdict: PrVerdict | null; ageColour: string | undefined
        /** A candidate's owner after its id: someone else's short name (dim); null when free or the person's (decision 071: `★`). */
        mark: ReturnType<typeof candidateMark>
        /** Decision 071: a candidate's `▢`/`▣` and priority glyph, `★` when the person's; null on a ticket's card. */
        candidate: { marked: boolean; star: boolean; priority: TowerIssue['priority'] } | null }
      type Item = Card | { kind: 'story'; key: string; text: string }
      const columns: Record<HomeColumn, Item[]> = { 'needs you': [], working: [], ready: [], candidates: [] }
      const plain: Record<HomeColumn, Card[]> = { 'needs you': [], working: [], ready: [], candidates: [] }
      const stateColour: Record<HomeColumn, string | undefined> = { 'needs you': colours.needsYou, working: colours.working, ready: colours.done, candidates: undefined }
      const glyphOfColumn: Record<HomeColumn, string> = { 'needs you': '◆', working: '◐', ready: '✓', candidates: '○' }
      for (const ticket of all.mine.flatMap(group => group.tickets)) {
        if (filterRows([ticket], filter, one => [one.row.key, one.title]).length === 0) continue
        const blockedBy = ticket.issue?.blockedBy ?? []
        const step = rowStep(ticket.row, pullRequests[ticket.row.key], blockedBy, config().workflow)
        const local = view.kind === 'rows' ? view.local[ticket.row.key] : undefined
        const lead = demo && ticket.row.session !== null ? demoAgents.find(one => one.status === 'running') : undefined
        const column: HomeColumn = lead !== undefined ? 'working' : step.group
        const model = lead !== undefined ? modelFamily(lead.model ?? '') : leadFamily(local?.usage?.tokens)
        const agent = lead !== undefined ? { done: lead.steps.filter(one => one.status === 'done').length, total: lead.steps.length, name: lead.name } : ticket.row.agent ?? null
        // A stall or a loop (decision 033) takes the working card's status line, in amber.
        const alert = column === 'working' ? (demo && lead !== undefined ? demoAlert() : ticket.row.alert ?? null) : null
        const status = alert !== null ? alert.text
          : lead !== undefined || (column === 'working' && agent !== null) ? `${agent?.name ?? 'working'} ${agent?.done ?? 0}/${agent?.total ?? 0}${model !== null ? ` · ${model}` : ''}` : step.status
        const pr = pullRequests[ticket.row.key]
        // Decision 035: the merge-readiness verdict; the wait colour from the PR's last update.
        const verdict = towerSettings.modules.prstate && pr?.kind === 'pr' ? prVerdict(pr, now) : null
        const wait = towerSettings.modules.prstate && pr?.kind === 'pr' && waitsOnPerson(column, step.status) ? waitTone(pr.updatedAt ? Date.parse(pr.updatedAt) : null, now) : null
        const figure = boardFigure(local, now) || (wait !== null && wait.tone !== null ? `${wait.days}d` : '—')
        plain[column].push({
          kind: 'card', key: `row:${ticket.row.key}`, id: ticket.row.key, title: ticket.title, glyph: step.glyph === '⊘' || step.glyph === '○' ? step.glyph : glyphOfColumn[column],
          glyphColour: step.glyph === '⊘' ? colours.error : stateColour[column],
          // Decision 034: `❄` once the live session's prompt cache has gone cold.
          // Decision 036: `📌 n` while the live session has open pinned decisions.
          age: `${(ticket.row.decisions ?? 0) > 0 ? `📌 ${ticket.row.decisions} ` : ''}${figure}${(demo && lead !== undefined) || (ticket.row.session !== null && cacheCold(ticket.row.lastRequestAt, now)) ? ' ❄' : ''}`,
          status: column === 'ready' && pr?.kind === 'pr' && verdict === null ? `${step.status} · PR #${pr.number}` : status,
          prLine: verdict !== null && pr?.kind === 'pr' ? prCardLine(pr, verdict) : null, verdict,
          ageColour: wait?.tone === 'red' ? colours.error : wait?.tone === 'yellow' ? colours.needsYou : undefined,
          statusColour: step.glyph === '⊘' ? colours.error : column === 'needs you' || alert !== null ? colours.needsYou : column === 'ready' ? colours.done : undefined,
          statusModel: column === 'working' && alert === null ? model : null,
          bar: column === 'working' ? { done: agent?.done ?? 0, total: agent?.total ?? 0, cost: demo && lead !== undefined ? demoDeck(now).usage.cost : local?.usage?.cost ?? null } : null,
          model, press: async () => { if (context !== null) await openWork($, context, ticketSession(ticket.row)) }, ticket, issue: ticket.issue, prefix: '', suffix: '', mark: null, candidate: null,
        })
      }
      // Decision 071: the candidates as the narrow rail's view lists them (no worktree here, the hidden ones neither), in
      // the old launcher's order; ↵ promotes the marked ones (else this one): their worktree only, no session.
      const homeHidden = view.kind === 'rows' ? (view.hidden ?? []) : []
      const homeCandidates = candidateIssues(issues, new Set([...rows, ...homeHidden].map(row => row.key.toUpperCase())))
      const storyIssues = [...issues, ...homeCandidates.filter(one => one.fromStory === true)]
      const marks = await read($, candidateMarks)
      let promoteList: TowerIssue[] = []
      for (const issue of filterRows(homeCandidates, filter, one => [one.id, one.title])) {
        const blocked = blockedText(issue.blockedBy)
        plain.candidates.push({
          kind: 'card', key: `cand:${issue.id}`, id: issue.id, title: issue.title, glyph: blocked !== null ? '⊘' : '○', glyphColour: blocked !== null ? colours.error : undefined,
          age: '—', status: blocked ?? candidateStatus(issue), statusColour: blocked !== null ? colours.error : undefined, statusModel: null, bar: null, model: null,
          press: async () => { if (context !== null) await promoteCandidates($, context, promoteList, issue.id) }, ticket: null, issue, prefix: '', suffix: '',
          mark: issue.assignedToMe ? null : candidateMark(issue), candidate: { marked: marks.includes(issue.id), star: issue.assignedToMe, priority: issue.priority },
          prLine: null, verdict: null, ageColour: undefined,
        })
      }
      // Stories in every column: `↳` children after their story, a dim header over two or more children of a story not there.
      // Candidates: the person's own first (a story header can then appear once in each part: its key carries the position).
      for (const column of HOME_COLUMNS) {
        const entries = column === 'candidates' ? candidateStories(plain[column], storyIssues, one => one.id, one => one.issue?.assignedToMe === true) : columnStories(plain[column], issues, one => one.id)
        for (const [index, entry] of entries.entries()) {
          columns[column].push(entry.kind === 'storyHeader'
            ? { kind: 'story', key: `story:${column}:${entry.storyId}:${index}`, text: entry.text }
            : { ...entry.row, prefix: entry.childPrefix ? '↳ ' : '', suffix: entry.storySuffix ?? '' })
        }
      }
      const cardsOf = (column: HomeColumn) => columns[column].filter((item): item is Card => item.kind === 'card')
      promoteList = cardsOf('candidates').flatMap(card => (card.issue !== null ? [card.issue] : []))
      const markedCount = promoteList.filter(issue => marks.includes(issue.id)).length
      homeColumnKeys = HOME_COLUMNS.map(column => cardsOf(column).map(card => card.key))
      boardKeys = { mine: homeColumnKeys.slice(0, 3).flat().map(key => key.slice('row:'.length)), candidates: (homeColumnKeys[3] ?? []).map(key => key.slice('cand:'.length)) }
      const everyCard = HOME_COLUMNS.flatMap(cardsOf)
      const focusedKey = await read($, focusedTicket)
      const selected = everyCard.find(card => card.id === focusedKey) ?? everyCard[0] ?? null
      if (selected !== null) markedElement = selected.key

      // Decision 035: the inspector's checklist rows, as many as the longest card's, so the board keeps still as the focus moves.
      const checklistOf = (one: Card | null) => (one?.verdict ? checklistLines(one.verdict.items) : null)
      const checklistRows = Math.max(0, ...everyCard.map(one => {
        const list = checklistOf(one)
        return list === null ? 0 : list.items.length + (list.more > 0 ? 1 : 0)
      }))
      // Decision 055: one row under the header for `+ new session` and the live free sessions.
      const headerRows = 3 + (linearFailure !== null ? 1 : 0)
      const footRows = 9 + checklistRows + 1 + (notice !== null ? 1 : 0) + (error !== null ? 1 : 0) + closeAskRowsAt(W - 2)
      const gridRows = Math.max(6, height - headerRows - footRows)
      const bandRows = layout.rows.length === 1 ? gridRows : Math.floor(gridRows / 2)
      const verdictColour = (verdict: PrVerdict | null) => verdict === null ? undefined
        : verdict.tone === 'ready' ? colours.done : verdict.tone === 'blocked' ? colours.error : verdict.tone === 'waiting' ? colours.needsYou : undefined
      const card = (column: HomeColumn, item: Card) => {
        const chosen = item.key === selected?.key
        const inner = Math.max(4, cw - 4)
        const titleLines = twoLines ? wrapWords(item.title, inner).slice(0, 2) : [item.title]
        const lastTitle = titleLines.length - 1
        const cut = titleLines.map((text, index) => truncateEnd(index === lastTitle && wrapWords(item.title, inner).length > titleLines.length ? text + ' …' : text,
          index === lastTitle ? Math.max(1, inner - item.suffix.length) : inner))
        while (cut.length < (twoLines ? 2 : 1)) cut.push(' ')
        const cost = item.bar?.cost != null ? `$${item.bar.cost.toFixed(2)}` : ''
        const statusText = truncateEnd(item.status, inner)
        const modelAt = item.statusModel !== null ? statusText.lastIndexOf(' · ') : -1
        return (
          <Box key={`card:${item.key}`} flexDirection="column" width={cw} borderStyle="round" borderColor={chosen ? colours.accent : colours.panel} paddingX={1}>
            <Box flexDirection="row">
              {item.candidate === null ? <Text color={chosen ? undefined : item.glyphColour} inverse={chosen}>{item.glyph + ' '}</Text> : [
                <Text key="mark">{item.candidate.marked ? '▣' : '▢'}{' '}{priorityText(item.candidate.priority)}{' '}</Text>,
              ]}
              {item.prefix !== '' && <Text dimColor>{item.prefix}</Text>}
              <Button key={item.key} label={item.id} plain onPress={item.press} />
              {item.candidate?.star === true && <Text color={colours.needsYou}>★</Text>}
              {item.mark !== null && <Text color={item.mark.tone === 'accent' ? colours.accent : undefined} dimColor={item.mark.tone === 'dim'} wrap="truncate-end">{` ${item.mark.text}`}</Text>}
              <Box flexGrow={1} />
              {/* An empty figure is never inverted: a `—` would draw as a white block. */}
              <Text dimColor={(!chosen && item.ageColour === undefined) || item.age === '—'} color={item.ageColour} inverse={chosen && item.age !== '—'}>{item.age}</Text>
            </Box>
            {cut.map((text, index) => <Text key={`t:${index}`} wrap="truncate-end">{text}{index === lastTitle && item.suffix !== '' && <Text dimColor>{item.suffix}</Text>}</Text>)}
            <Text wrap="truncate-end" color={item.statusColour}>
              {modelAt < 0 ? statusText : statusText.slice(0, modelAt + 3)}
              {modelAt >= 0 && <Text color={colours.models[item.statusModel as keyof typeof colours.models] ?? undefined}>{statusText.slice(modelAt + 3)}</Text>}
            </Text>
            {item.prLine !== null && (
              <Text wrap="truncate-end">
                <Text dimColor>{item.prLine.slice(0, item.prLine.indexOf(' · ') + 3)}</Text>
                <Text color={verdictColour(item.verdict)} dimColor={item.verdict?.tone === 'draft'}>{truncateEnd(item.prLine, inner).slice(item.prLine.indexOf(' · ') + 3)}</Text>
              </Text>
            )}
            {item.bar !== null && (
              <Box flexDirection="row">
                <Text color={colours.working}>{progressBar(item.bar.done, item.bar.total, Math.max(1, inner - cost.length - 1))}</Text>
                <Box flexGrow={1} />
                <Text dimColor>{cost}</Text>
              </Box>
            )}
          </Box>
        )
      }
      const windowOf = (column: HomeColumn) => {
        const items = columns[column]
        const heights = items.map(item => (item.kind === 'story' ? 1 : homeCardRows(column, twoLines ? HOME_TWO_LINE_TITLE : 0, item.prLine !== null)))
        const at = items.findIndex(item => item.key === selected?.key)
        const fitted = columnWindow(heights, at, bandRows - 1, homeWindowStart[column] ?? 0)
        // A story header is never the last line of the window: it goes below with the cards it heads.
        const trailing = fitted.end > fitted.start + 1 && items[fitted.end - 1]?.kind === 'story' ? 1 : fitted.end === fitted.start + 1 && items[fitted.start]?.kind === 'story' && fitted.moreBelow > 0 ? 1 : 0
        const shown = { ...fitted, end: fitted.end - trailing, moreBelow: fitted.moreBelow + trailing }
        homeWindowStart[column] = shown.start
        const used = 1 + (shown.moreAbove > 0 ? 1 : 0) + heights.slice(shown.start, shown.end).reduce((sum, rows) => sum + rows, 0) + (shown.moreBelow > 0 ? 1 : 0) + (items.length === 0 ? 1 : 0)
        return { shown, used }
      }
      const windows = Object.fromEntries(HOME_COLUMNS.map(column => [column, windowOf(column)])) as Record<HomeColumn, ReturnType<typeof windowOf>>
      // Blank rows left under every column of the last band (no further card fits): one goes to the inspector's `asks`.
      const spare = settingsOpen ? 0 : Math.min(1, ...(layout.rows[layout.rows.length - 1] ?? []).map(column => bandRows - windows[column].used))
      const columnView = (column: HomeColumn, rows: number) => {
        const items = columns[column]
        const { shown } = windows[column]
        const more = (way: 'up' | 'down', count: number) => (
          <Button key={`more:${column}:${way}`} label={`${way === 'up' ? '↑' : '↓'} ${count} more`} plain dimColor onPress={async () => {
            const keys = homeColumnKeys[HOME_COLUMNS.indexOf(column)] ?? []
            const next = keys[Math.max(0, Math.min(keys.length - 1, keys.indexOf(selected?.key ?? '') + (way === 'up' ? -1 : 1)))]
            if (next === undefined) return
            markedElement = next
            await focusMarked($)
          }} />
        )
        return (
          <Box key={`col:${column}`} flexDirection="column" width={cw} height={rows}>
            <Text dimColor>{`${column} ${cardsOf(column).length}${column === 'candidates' && markedCount > 0 ? ` · ${markedCount} marked` : ''}`}</Text>
            {shown.moreAbove > 0 && more('up', shown.moreAbove)}
            {items.slice(shown.start, shown.end).map(item => item.kind === 'story'
              ? <Text key={item.key} dimColor wrap="truncate-end">{truncateEnd(item.text, cw)}</Text>
              : card(column, item))}
            {items.length === 0 && <Text dimColor>{'  —'}</Text>}
            {shown.moreBelow > 0 && more('down', shown.moreBelow)}
          </Box>
        )
      }

      // The header: the name, the counts, a figure per working session, away.
      const counts: [HomeColumn, string][] = [['needs you', 'needs you'], ['working', 'working'], ['ready', 'ready'], ['candidates', 'candidates']]
      const working = cardsOf('working')
      const headerPaces = await boardPaces($, now)
      const header = (
        <Box key="home:header" flexDirection="row" width={W}>
          <Text bold color={colours.accent}>TOWER</Text>
          {filter !== '' && <Text>{`   filter: ${truncateEnd(filter, 24)}`}<Text dimColor>{'  esc clears'}</Text></Text>}
          <Box flexGrow={1} />
          {counts.map(([column, label]) => (
            <Text key={`count:${column}`}>
              <Text color={stateColour[column]} dimColor={column === 'candidates'}>{glyphOfColumn[column]}</Text>
              <Text bold>{` ${cardsOf(column).length}`}</Text>
              <Text dimColor>{` ${label}   `}</Text>
            </Text>
          ))}
          <Box flexGrow={1} />
          {working.map(one => {
            const colour = colours.models[one.model as keyof typeof colours.models] ?? colours.working
            return hasClient
              ? <Box key={`fig:${one.id}`} marginLeft={1}><els.Client key={`figure:${one.id}`} module="./figure.tsx" props={{ colour }} /></Box>
              : <Text key={`fig:${one.id}`} color={colour}>{' ▟█▙'}</Text>
          })}
          {headerPaces.map(({ label, pace }) => (
            <Text key={`pace:${label}`} dimColor={!pace.outBeforeReset} color={pace.outBeforeReset ? colours.needsYou : undefined}>{`  ${paceChip(label, pace)}`}</Text>
          ))}
          {awayState.on && <Text color={colours.needsYou}>{'  ◆ AWAY'}</Text>}
          {headerClose(freeTarget(ringRow), 'before')}
        </Box>
      )

      // The inspector: the focused card's ticket in a round box, 9 rows.
      const inner = Math.max(10, W - 4)
      const issue = selected?.issue ?? null
      const ticket = selected?.ticket ?? null
      const local = ticket !== null && view.kind === 'rows' ? view.local[ticket.row.key] : undefined
      const meta = issue !== null ? issueMeta(issue) : ticket !== null ? `${ticket.row.phase} · ${ticket.row.branch}` : ''
      const metaBlocked = issue !== null ? blockedMeta(issue, issues) : null
      const askRows = 3 + Math.max(0, spare)
      const asks = issue !== null && issue.description.trim() !== '' ? asksLines(issue.description, inner, askRows) : ['no description']
      while (asks.length < askRows) asks.push('')
      // Decision 036: `i: ask` on a ticket with a live session; its question and answer take the description's rows.
      const asideLive = ticket !== null && ticket.row.session !== null
      const asideOpen = selected !== null && asking?.ticket === selected.id
      const asideShown = selected !== null ? asideAnswers[selected.id] ?? null : null
      const asideRows = !asideOpen && asideShown === null ? null : [
        ...(asideShown === null ? [] : [`? ${asideShown.question}`]),
        ...(asideShown?.status === 'asking' ? ['asking…'] : asideShown?.status === 'failed' ? [`no answer · ${asideShown.text}`]
          : asideShown?.status === 'done' ? [...answerRows(asideShown.text, inner, Math.max(1, askRows - (asideOpen ? 3 : 2))), asideShown.line] : []),
      ].slice(0, Math.max(1, askRows - (asideOpen ? 1 : 0)))
      const step = ticket !== null ? rowStep(ticket.row, remotes[ticket.row.key]?.pullRequest, ticket.issue?.blockedBy ?? [], config().workflow) : null
      const nextText = selected === null ? '' : ticket === null ? (blockedText(issue?.blockedBy ?? []) ?? `not started: ↵ promotes it (its worktree, no session); ↵ on its card then runs ${startName()}`) : (step?.next ?? ticket.row.next ?? 'nothing recorded')
      const usage = local?.usage ?? null
      const models = modelsLine(usage?.tokens)
      const pr = ticket !== null ? remotes[ticket.row.key]?.pullRequest : undefined
      const prText = ticket === null ? 'no pull request' : pr === undefined ? 'pull request loading…' : pr.kind === 'pr' ? `pull request #${pr.number} ${pr.state}${selected?.verdict ? '' : ` · checks ${pr.checks}`}` : pr.kind === 'unavailable' ? 'gh not available' : 'no pull request'
      const checklist = checklistOf(selected)
      const markColour = (mark: string) => (mark === '✓' ? colours.done : mark === '✗' ? colours.error : mark === '◷' ? colours.needsYou : undefined)
      const actions = (
        <Box key="home:actions" flexDirection="row">
          <Text color={colours.accent}>↵</Text>
          <Text dimColor>{selected?.candidate != null ? ' promote   ' : ' open   '}</Text>
          {asideLive && selected !== null && [
            <Button key="aside:ask" label="ask" hotkey="i" plain dimColor={!asideOpen} onPress={async () => {
              await update($, boardAsk, () => ({ ticket: selected.id, draft: '', sent: null }))
              await $.ui.focus({ requestId: PANE, key: 'board:ask' }).catch(() => {})
            }} />,
            <Text key="aside:gap">{'   '}</Text>,
          ]}
          {skills}
        </Box>
      )
      const inspector = (
        <Box key="home:inspector" flexDirection="column" width={W} height={9 + askRows - 3 + checklistRows} borderStyle="round" borderColor={colours.panel} paddingX={1}>
          {selected === null ? <Text dimColor>no tickets</Text> : (
            <Box flexDirection="column">
              <Box flexDirection="row">
                <Text bold color={colours.accent}>{selected.id}</Text>
                <Text wrap="truncate-end">{'  ' + selected.title}</Text>
                <Box flexGrow={1} />
                {actions}
              </Box>
              <Text wrap="truncate-end"><Text dimColor>{meta}</Text>{metaBlocked !== null && <Text color={colours.error}>{` · ${metaBlocked}`}</Text>}</Text>
              {asideOpen && Input !== null && selected !== null && (
                <Input
                  key="board:ask"
                  placeholder={`ask ${selected.id}'s session… ↵ asks · nothing goes into it`}
                  value={asking?.draft ?? ''}
                  onInput={(value: string) => {
                    void update($, boardAsk, ask => (ask === null ? ask : { ...ask, draft: value })).catch(() => {})
                  }}
                  onSubmit={() => {
                    void (async () => {
                      const question = ((await read($, boardAsk))?.draft ?? '').trim()
                      if (question !== '') await sendBoardAside($, selected.id, question)
                    })().catch(() => {})
                  }}
                />
              )}
              {asideRows !== null
                ? asideRows.map((text, index) => <Text key={`aside:${index}`} wrap="truncate-end" dimColor={index === 0 || text === asideShown?.line}>{text}</Text>)
                : asks.slice(0, askRows).map((text, index) => <Text key={`ask:${index}`} wrap="truncate-end">{text}</Text>)}
              {asideRows !== null && Array.from({ length: Math.max(0, askRows - asideRows.length - (asideOpen ? 1 : 0)) }, (_, index) => <Text key={`aside:pad:${index}`}> </Text>)}
              <Text wrap="truncate-end"><Text dimColor>next </Text>{nextText}</Text>
              <Text wrap="truncate-end">
                <Text dimColor>sessions </Text>{`${local?.sessions?.length ?? 0}`}
                {models.map(([name, count]) => <Text key={`m:${name}`}>{' · '}<Text color={colours.models[name as keyof typeof colours.models] ?? undefined}>{name}</Text>{` ${count}`}</Text>)}
                {usage?.cost != null && ` · $${usage.cost.toFixed(2)}`}
                <Text dimColor>{'   '}</Text>
                <Text dimColor>{prText}</Text>
                {selected?.verdict && <Text>{' · '}<Text color={verdictColour(selected.verdict)} dimColor={selected.verdict.tone === 'draft'}>{selected.verdict.label}</Text></Text>}
              </Text>
              {checklist?.items.map((item, index) => (
                <Text key={`check:${index}`} wrap="truncate-end"><Text color={item.info ? undefined : markColour(item.mark)} dimColor={item.info === true || item.mark === '·'}>{`  ${item.mark} `}</Text>{item.text}</Text>
              ))}
              {checklist !== null && checklist.more > 0 && <Text dimColor>{`  +${checklist.more} more`}</Text>}
            </Box>
          )}
        </Box>
      )
      const keyLine = (
        <Box key="home:keys" flexDirection="row" paddingLeft={1}>
          {(keyRows(1000)[0] ?? []).map((key, at) => (
            <Box key={`hk:${key}`} flexDirection="row">
              {at > 0 && <Text>{'   '}</Text>}
              {key === 'k' ? <Text dimColor>k: skills</Text> : key === 'r' ? refresh : key === 'q' ? (
                <Button key="quit" label="quit" hotkey="q" plain dimColor onPress={async () => askQuit($)} />
              ) : key === 'a' ? (
                <Button key="away" label="away" hotkey="a" plain dimColor={!awayState.on} onPress={async () => setAway($, !awayState.on)} />
              ) : (
                <Button key={`board-skill:${key}`} label={boardAction(key)?.skill ?? key} hotkey={key} plain dimColor onPress={async () => { const action = boardAction(key); if (context !== null && action !== undefined) await launchBoardSkill($, context, action.skill) }} />
              )}
            </Box>
          ))}
          <Text>{'   '}</Text>
          <Button key="settings" label="settings" hotkey="p" plain dimColor onPress={async () => {
            await update($, boardSettings, () => true)
            await $.ui.focus({ requestId: PANE, key: `set:view:${towerSettings.view}` }).catch(() => {})
          }} />
          {/* Decision 071: `m` marks the focused candidate; not while `+ new session` asks (its `m` is the main checkout). */}
          {promoteList.length > 0 && newAsk === null && [
            <Text key="mark:gap">{'   '}</Text>,
            <Button key="mark" label="mark" hotkey="m" plain dimColor onPress={async () => {
              if (selected?.candidate != null) await update($, candidateMarks, list => toggleMark(list, selected.id))
            }} />,
          ]}
          <Text dimColor>{'   alt ←→ columns'}</Text>
        </Box>
      )
      // Decision 055: `+ new session`, then SESSIONS on the same row, as many as fit (each ↵ shows it), else `+n more`.
      const homeSelected = selected?.ticket ? { label: `${selected.id} worktree`, path: selected.ticket.row.path } : null
      const freeCost = (row: (typeof freeRows)[number]) => 2 + Math.min(24, Array.from(row.name).length) + 3 + Array.from(freeDetail(row, now)).length + 3
      let freeBudget = W - 16 - 13 - 10
      const freeShown = freeRows.filter(row => (freeBudget -= freeCost(row)) >= 0)
      const sessionsLine = newAsk !== null ? newSessionView(W, false, homeSelected) : (
        <Box key="home:sessions" flexDirection="row" width={W} paddingLeft={1}>
          {newSessionButton(homeSelected)}
          {freeRows.length > 0 && <Text dimColor>{'   SESSIONS  '}</Text>}
          {freeShown.map((row, at) => (
            <Box key={`free-row:${row.key}`} flexDirection="row">
              {at > 0 && <Text>{'   '}</Text>}
              <Text color={centre === row.key ? colours.accent : row.state === 'working' ? colours.working : row.state === 'waiting' ? colours.needsYou : undefined}
                dimColor={centre !== row.key && row.state === 'idle'}>{`${centre === row.key ? '▶' : freeGlyph(row.state)} `}</Text>
              <Button key={`free:${row.key}`} label={truncateEnd(row.name, 24)} plain onPress={async () => {
                if (context !== null) await openWork($, context, { role: 'free', key: row.key, cwd: row.cwd, start: null })
              }} />
              <Text dimColor>{` · ${freeDetail(row, now)}`}</Text>
            </Box>
          ))}
          {freeShown.length < freeRows.length && <Text dimColor>{`   +${freeRows.length - freeShown.length} more`}</Text>}
        </Box>
      )
      return (
        <Box flexDirection="column" width={W}>
          {header}
          <Text color={colours.panel}>{'─'.repeat(W)}</Text>
          {sessionsLine}
          {linearFailure !== null && <Text dimColor>{truncateEnd(`linear: ${linearFailure}`, W)}</Text>}
          {settingsOpen ? (
            <Box key="home:settings" flexDirection="column" height={gridRows}>
              <Text bold color={colours.accent}>settings</Text>
              {settingsBody($, els, async () => {
                await update($, boardSettings, () => false)
                await focusMarked($)
              })}
            </Box>
          ) : layout.rows.map((band, index) => (
            <Box key={`band:${index}`} flexDirection="row" height={bandRows - (index === layout.rows.length - 1 ? Math.max(0, spare) : 0)}>
              {band.map((column, at) => (
                <Box key={`slot:${column}`} flexDirection="row">
                  {at > 0 && <Box width={HOME_GAP} />}
                  {columnView(column, bandRows - (index === layout.rows.length - 1 ? Math.max(0, spare) : 0))}
                </Box>
              ))}
            </Box>
          ))}
          <Box flexGrow={1} />
          {inspector}
          {keyLine}
          {closing !== null && <Box key="home:close" paddingLeft={1}>{closeAskView(W - 2)}</Box>}
          {notice !== null && (quitting === null ? <Text dimColor>{' ' + truncateEnd(notice, W - 2)}</Text> : (
            <Box key="quit-ask" flexDirection="row" paddingLeft={1}>
              <Text>{'close tower and every session? '}</Text>
              <Button key="quit:yes" label="yes" hotkey="y" plain onPress={async () => quitTower($)} />
              <Text dimColor>{'   any key: no' + quitWorking(quitting)}</Text>
            </Box>
          ))}
          {error !== null && <Text dimColor>{' ' + truncateEnd(error, W - 2)}</Text>}
          {homePopup !== null && context !== null && (
            <Box key="home:attention" position="absolute" top={0} right={0}>
              {attentionPopupView($, els, colours, homePopup, Math.min(56, Math.max(30, Math.floor(W / 3))), context)}
            </Box>
          )}
        </Box>
      )
    }

    // A repository with GitHub issues (decision 054, plan general-tower.md "Left column"): `<slug> · <base>`, IN
    // PROGRESS, OPEN ISSUES, OTHER BRANCHES. Wide, in the board's place with the focused row's detail beside it;
    // narrow, as the rail beside a session. Linear tickets keep their columns (drawHome).
    const drawRepo = async (withDetail: boolean) => {
      const notice = await read($, boardNotice)
      const ticketsFailure = await read($, linearError)
      const issues = await read($, linearIssues)
      const remotes = await read($, remoteDetails)
      const now = await $.clock.now()
      const quitting = await read($, quitAsk)
      const filter = await read($, boardFilter)
      const settingsOpen = withDetail && (await read($, boardSettings))
      const popup = withDetail ? await attentionPopup($, context) : null
      const pullRequests = Object.fromEntries(Object.entries(remotes).map(([key, remote]) => [key, remote.pullRequest]))
      const sections = repoSections({
        project: config().project, rows: view.kind === 'rows' ? view.rows : [], issues, others: view.kind === 'rows' ? (view.others ?? []) : [],
        pullRequests, workflow: config().workflow,
      })
      // Decision 060: a free Tower's header is its folder (and branch), its keys refresh, away, quit and settings only.
      const free = freeTower()
      const header = free ? freeHeader(context?.repo ?? '', view.kind === 'rows' ? view.branch ?? null : null) : sections.header
      const inProgress = filterRows(sections.inProgress, filter, one => [one.row.key, one.title])
      const openIssues = filterRows(sections.openIssues, filter, issue => [issue.id, issue.title])
      const otherBranches = filterRows(sections.otherBranches, filter, other => [other.name, other.branch ?? ''])
      const otherKey = (other: TowerOtherWorktree) => `other:${other.name}`
      repoKeys = [...inProgress.map(one => `row:${one.row.key}`), ...openIssues.map(issue => `cand:${issue.id}`), ...otherBranches.map(other => `row:${otherKey(other)}`)]
      // One column: Alt+←/→ has nowhere to go; `c` and a typed id find the rows by these lists.
      homeColumnKeys = [repoKeys]
      boardKeys = { mine: [...inProgress.map(one => one.row.key), ...otherBranches.map(otherKey)], candidates: openIssues.map(issue => issue.id) }
      const focusedKey = await read($, focusedTicket)
      const shownKey = centre ?? opening
      const selectedKey = repoKeys.find(key => key.slice(key.indexOf(':') + 1) === focusedKey) ?? repoKeys.find(key => key === `row:${shownKey}`) ?? repoKeys[0] ?? null
      if (selectedKey !== null) markedElement = selectedKey
      const listWidth = withDetail ? boardColumns(bodyColumns).list : width
      const marker = (chosen: boolean) => <Text color={chosen ? colours.accent : undefined}>{chosen ? '▶ ' : '  '}</Text>
      // The narrow rail: the ▶ follows the ring onto any row drawn (an issue, a branch, a session, `+ new session`), else
      // stays on the selected row (repoRing, known once the window is; the rows are drawn after it).
      const markedRow = () => repoRing ?? selectedKey
      const tilde = (path: string) => (context?.home && path.startsWith(`${context.home}/`) ? `~${path.slice(context.home.length)}` : path)
      // A row: marker, glyph, then the Button: the id, the title cut to fit, the mark and the labels in their colours, across
      // the row (the engine's focus inverse its bar).
      // Decision 071: an open issue's glyph is its mark (`▢`/`▣`; `m` toggles it).
      const marks = await read($, candidateMarks)
      const row = (elementKey: string, id: string, title: string, labels: readonly string[], mark: { text: string; tone: 'accent' | 'dim' } | null,
        glyph: { glyph: string; color: string | undefined; dim: boolean }, press: () => Promise<unknown>, second: { text: string; colour?: string } | null, markable = false) => {
        const chosen = elementKey === markedRow()
        const tail = [...(mark !== null ? [mark.text] : []), ...labels].join(' ')
        const fit = rowFit(listWidth - 4, id, title, tail)
        return (
          <Box key={`item:${elementKey}`} flexDirection="column" width={listWidth}>
            <Box flexDirection="row">
              {marker(chosen)}
              {markable ? [
                <Text key="mark">{`${marks.includes(id) ? '▣' : '▢'} `}</Text>,
              ] : <Text color={glyph.color} dimColor={glyph.dim}>{`${glyph.glyph} `}</Text>}
              <Button key={elementKey} label={id} plain onPress={press}>
                {id}
                <Text>{` ${fit.title}${' '.repeat(fit.gap)}`}</Text>
                {[
                  ...(mark !== null ? [<Text key="mark" color={mark.tone === 'accent' ? colours.accent : undefined} dimColor={mark.tone === 'dim'}>{mark.text}</Text>] : []),
                  ...labels.map((label, index) => {
                    const colour = labelColour(labelTone(label), colours)
                    return <Text key={`label:${index}`} color={colour} dimColor={colour === undefined}>{`${index > 0 || mark !== null ? ' ' : ''}${label}`}</Text>
                  }),
                ]}
              </Button>
            </Box>
            {second !== null && <Text color={second.colour} dimColor={second.colour === undefined}>{'    ' + truncateEnd(second.text, listWidth - 4)}</Text>}
          </Box>
        )
      }
      type RepoItem = { keys: string[]; rows: number; node: () => RenderChildren }
      const heading = (text: string): RepoItem => ({ keys: [], rows: 1, node: () => <Text key={`heading:${text}`} dimColor>{text}</Text> })
      // The other branches, compact: as many to a line as fit, ` · ` between them; ↵ opens a plain session in the folder.
      const branchLines: TowerOtherWorktree[][] = []
      for (const other of otherBranches) {
        const last = branchLines[branchLines.length - 1]
        const used = last === undefined ? 0 : last.reduce((sum, one) => sum + Array.from(one.branch ?? one.name).length + 3, 0)
        if (last !== undefined && last.length > 0 && 2 + used + Array.from(other.branch ?? other.name).length > listWidth) branchLines.push([other])
        else if (last === undefined) branchLines.push([other])
        else last.push(other)
      }
      // Decision 078: two windows. IN PROGRESS (the issues with their sessions), its heading pinned over its rows' window;
      // under it OPEN ISSUES, its heading pinned over a window of the open issues and OTHER BRANCHES: scrolling the
      // issues never takes the sessions away.
      const topItems: RepoItem[] = inProgress.map((one): RepoItem => ({ keys: [`row:${one.row.key}`], rows: 2, node: () => {
          const starting = one.row.key === opening && one.row.key !== centre
          return row(`row:${one.row.key}`, one.row.key, one.title, one.labels, null, rowGlyph(one.row, colours, pullRequests[one.row.key], one.issue?.blockedBy ?? []),
            async () => { if (context !== null) await openWork($, context, ticketSession(one.row)) },
            { text: starting ? 'starting' : one.status, ...(one.step.glyph === '⊘' && !starting ? { colour: colours.error } : {}) })
        } }))
      const bottomItems: RepoItem[] = [
        // Decision 077: an open issue with open blockers takes a second line, `⊘ blocked by #38 +1` in red (its glyph's
        // place holds the mark); ↵ still promotes it.
        ...openIssues.map((issue): RepoItem => ({ keys: [`cand:${issue.id}`], rows: issue.blockedBy.length > 0 ? 2 : 1, node: () => {
          const blocked = blockedText(issue.blockedBy)
          return row(`cand:${issue.id}`, issue.id, issue.title, issue.labels, candidateMark(issue), { glyph: '○', color: undefined, dim: true },
            async () => { if (context !== null) await promoteCandidates($, context, openIssues, issue.id) }, blocked !== null ? { text: `⊘ ${blocked}`, colour: colours.error } : null, true)
        } })),
        ...(branchLines.length > 0 ? [heading('OTHER BRANCHES')] : []),
        ...branchLines.map((line, index): RepoItem => ({ keys: line.map(other => `row:${otherKey(other)}`), rows: 1, node: () => (
          <Box key={`branches:${index}`} flexDirection="row" width={listWidth}>
            {marker(line.some(other => `row:${otherKey(other)}` === markedRow()))}
            {line.map((other, at) => (
              <Box key={`branch:${other.name}`} flexDirection="row">
                {at > 0 && <Text dimColor>{' · '}</Text>}
                <Button key={`row:${otherKey(other)}`} label={other.branch ?? other.name} plain dimColor={`row:${otherKey(other)}` !== markedRow()}
                  onPress={async () => {
                    if (context === null) return
                    // A free Tower opens a free session there (decision 060): no ticket session without tickets.
                    if (free) await openFreeSession($, context, other.path)
                    else await openWork($, context, { role: 'ticket', key: other.name, cwd: other.path, start: null })
                  }} />
              </Box>
            ))}
          </Box>
        ) })),
      ]
      const keyButtons = (keys: readonly string[]) => keys.map((key, at) => (
        <Box key={`rk:${key}`} flexDirection="row">
          {at > 0 && <Text>{'   '}</Text>}
          {key === 'k' ? skills : key === 'r' ? refresh : key === 'q' ? <Button key="quit" label="quit" hotkey="q" plain dimColor onPress={async () => askQuit($)} />
            : key === 'm' ? <Button key="mark" label="mark" hotkey="m" plain dimColor onPress={async () => {
              const focusedIssue = openIssues.find(issue => `cand:${issue.id}` === selectedKey)
              if (focusedIssue !== undefined) await update($, candidateMarks, list => toggleMark(list, focusedIssue.id))
            }} />
            : key === 'a' ? <Button key="away" label="away" hotkey="a" plain dimColor={!awayState.on} onPress={async () => setAway($, !awayState.on)} />
              : key === 'p' ? <Button key="settings" label="settings" hotkey="p" plain dimColor onPress={async () => {
                await update($, boardSettings, () => true)
                await $.ui.focus({ requestId: PANE, key: `set:view:${towerSettings.view}` }).catch(() => {})
              }} />
                : <Button key={`board-skill:${key}`} label={boardAction(key)?.skill ?? key} {...(/^[0-9a-z]$/.test(key) ? { hotkey: key } : {})} plain dimColor
                  onPress={async () => { const action = boardAction(key); if (context !== null && action !== undefined) await launchBoardSkill($, context, action.skill) }} />}
        </Box>
      ))
      const actionKeys = boardActions().map(action => action.key)
      // Decision 071: `m` marks the focused open issue; not while `+ new session` asks (its `m` is the main checkout).
      const markKey = openIssues.length > 0 && newAsk === null ? ['m'] : []
      // The engine draws a hotkey Button as `n: new-ticket`: beside a session the actions take a row of their own (wrapping).
      const keyLine = withDetail || actionKeys.length > 0 || markKey.length > 0 ? (
        <Box key="repo:keys" flexDirection="row" flexWrap="wrap" width={withDetail ? bodyColumns : width}>
          {keyButtons(withDetail ? [...markKey, ...actionKeys, ...(free ? [] : ['k']), 'r', 'a', 'q', 'p'] : [...markKey, ...actionKeys])}
        </Box>
      ) : null
      const failureLine = ticketsFailure !== null ? <Text key="repo:failure" dimColor>{truncateEnd(`issues: ${ticketsFailure}`, withDetail ? bodyColumns : width)}</Text> : null
      const noticeLine = notice === null ? null : quitting === null ? <Text key="repo:notice" dimColor>{truncateEnd(notice, withDetail ? bodyColumns : width)}</Text> : (
        <Box key="quit-ask" flexDirection="row">
          <Text>{'close tower and every session? '}</Text>
          <Button key="quit:yes" label="yes" hotkey="y" plain onPress={async () => quitTower($)} />
          <Text dimColor>{'   any key: no' + quitWorking(quitting)}</Text>
        </Box>
      )
      const errorLine = error !== null ? <Text key="repo:error" dimColor>{truncateEnd(error, withDetail ? bodyColumns : width)}</Text> : null
      const footRows = (keyLine !== null ? 1 : 0) + (noticeLine !== null ? 1 : 0) + (errorLine !== null ? 1 : 0) + closeAskRowsAt(withDetail ? bodyColumns : width)
      // Decision 068: the actions' keys come after the question; one on `n` would win over its `n: no`.
      const closeView = closeAskView(withDetail ? bodyColumns : width, !actionKeys.includes('n'))
      const headRows = 2 + (failureLine !== null ? 1 : 0)
      const listRows = Math.max(4, height - headRows - footRows)
      // Decision 055: `+ new session` and SESSIONS above the sections, outside their scrolling window.
      const selectedProgress = inProgress.find(one => `row:${one.row.key}` === selectedKey)
      const selectedOther = otherBranches.find(one => `row:${otherKey(one)}` === selectedKey)
      const repoSelected = selectedProgress !== undefined ? { label: `${selectedProgress.row.key} worktree`, path: selectedProgress.row.path }
        : selectedOther !== undefined ? { label: selectedOther.branch ?? selectedOther.name, path: selectedOther.path } : null
      // Decision 064: a free Tower in a git folder without a configuration offers tower-setup (`s`); once its configuration
      // is stored, a highlighted row says how to open the project (a Tower cannot reopen itself as another).
      const setup = free && view.kind === 'rows' ? view.setup : undefined
      const SETUP_DONE = 'quit (q y) and run tower again here to open the project'
      const setupDoneRows = Math.ceil(Array.from(SETUP_DONE).length / Math.max(1, listWidth - 2))
      const setupRows = setup === undefined ? 0 : setup.configured ? 1 + setupDoneRows : 1
      const setupView = setup === undefined ? null : setup.configured ? (
        <Box key="setup:done" flexDirection="column" width={listWidth}>
          <Text bold color={colours.done}>{truncateEnd('✓ Tower is set up for this repository', listWidth)}</Text>
          <Box paddingLeft={2} width={listWidth}><Text color={colours.done} wrap="wrap">{SETUP_DONE}</Text></Box>
        </Box>
      ) : (
        <Box key="setup:row" flexDirection="row" width={listWidth}>
          <Button key="setup" label="set up this repository" hotkey="s" plain onPress={async () => {
            if (context !== null && context.repo !== null) await openSkillSession($, context, context.repo, 'tower-setup')
          }} />
        </Box>
      )
      const itemRows = Math.max(3, listRows - freeBlockRows(true) - setupRows)
      // Decision 078: the IN PROGRESS rows take the rows they need while that leaves the open issues' window 6, else
      // what leaves it 6 (3 at least) and they scroll; the open issues' window takes the rest.
      const topHead = topItems.length > 0 ? 1 : 0
      const bottomHead = openIssues.length > 0 ? 1 : 0
      const topNeed = topItems.reduce((sum, item) => sum + item.rows, 0)
      const topRows = topItems.length === 0 ? 0 : bottomItems.length === 0 ? itemRows - topHead
        : Math.min(topNeed, Math.max(3, itemRows - topHead - REPO_ISSUES_MIN - bottomHead))
      const bottomRows = Math.max(1, itemRows - topHead - topRows - bottomHead)
      // Each window follows the focus only while it is on one of its rows; else it keeps its start (columnWindow, -1).
      const windowOf = (list: readonly RepoItem[], rows: number, start: number) =>
        columnWindow(list.map(item => item.rows), list.findIndex(item => selectedKey !== null && item.keys.includes(selectedKey)), rows, start)
      const top = windowOf(topItems, topRows, repoTopStart)
      const shown = windowOf(bottomItems, bottomRows, repoWindowStart)
      repoTopStart = top.start
      repoWindowStart = shown.start
      const keyCount = (list: readonly RepoItem[], from: number, to: number) => list.slice(from, to).reduce((sum, item) => sum + item.keys.length, 0)
      const regionOf = (list: readonly RepoItem[], window: ColumnWindow) => ({ keys: list.flatMap(item => item.keys), first: keyCount(list, 0, window.start), end: keyCount(list, 0, window.end) })
      repoRegions = { top: regionOf(topItems, top), bottom: regionOf(bottomItems, shown) }
      const shownKeys = (list: readonly RepoItem[], window: ColumnWindow) => list.slice(window.start, window.end).flatMap(item => item.keys)
      const repoRing = ringRowOf(ringOn, !withDetail && e.props.isFocused === true, [...shownKeys(topItems, top), ...shownKeys(bottomItems, shown), ...freeRingRows])
      const more = (region: RepoRegion, way: 'up' | 'down', count: number) => (
        <Button key={`more:${region === 'top' ? 'repo-top' : 'repo'}:${way}`} label={`${way === 'up' ? '↑' : '↓'} ${count} more`} plain dimColor onPress={async () => moveRepoWindow($, region, way)} />
      )
      const sectionList = (
        <Box key="repo:list" flexDirection="column" width={listWidth} height={itemRows}>
          {topItems.length > 0 && (
            <Box key="repo:top" flexDirection="column" width={listWidth} height={topHead + topRows}>
              {heading('IN PROGRESS').node()}
              {top.moreAbove > 0 && more('top', 'up', keyCount(topItems, 0, top.start))}
              {topItems.slice(top.start, top.end).map(item => item.node())}
              {top.moreBelow > 0 && more('top', 'down', keyCount(topItems, top.end, topItems.length))}
            </Box>
          )}
          {bottomHead > 0 && heading('OPEN ISSUES').node()}
          {shown.moreAbove > 0 && more('bottom', 'up', keyCount(bottomItems, 0, shown.start))}
          {bottomItems.slice(shown.start, shown.end).map(item => item.node())}
          {topItems.length === 0 && bottomItems.length === 0 && !free && <Text dimColor>{filter !== '' ? 'nothing matches the filter' : view.kind === 'rows' ? 'no open issues and no worktrees' : view.kind === 'loading' ? 'loading…' : truncateEnd(view.message, listWidth)}</Text>}
          {shown.moreBelow > 0 && more('bottom', 'down', keyCount(bottomItems, shown.end, bottomItems.length))}
        </Box>
      )
      const list = (
        <Box key="repo:column" flexDirection="column" width={listWidth} height={listRows}>
          {setupView}
          {freeBlock(listWidth, repoSelected, repoRing)}
          {sectionList}
        </Box>
      )
      if (!withDetail) {
        const narrowQuit = quitting === null ? null : (
          <Box key="quit-row" flexDirection="row" width={width}>
            <Text color={colours.needsYou}>{'close everything? '}</Text>
            <Button key="quit:yes" label="yes" hotkey="y" plain onPress={async () => quitTower($)} />
            <Text dimColor>{`${quitWorking(quitting)}`}</Text>
          </Box>
        )
        return (
          <Box flexDirection="column" width={width} height={height}>
            <Text key="repo:header" bold>{truncateEnd(header, width)}</Text>
            <Box key="repo:back" flexDirection="row" width={width}>
              <Box flexGrow={1} />
              {headerClose(freeTarget(ringRow), 'after')}
              {!free && skills}
              {!free && <Text>{'  '}</Text>}
              {refresh}
              <Text>{'  '}</Text>
              {!free && <Button key="board" label="board" hotkey="b" plain dimColor onPress={async () => { if (context !== null) await backToBoard($, context) }} />}
              {!free && <Text>{'  '}</Text>}
              <Button key="quit" label="quit" hotkey="q" plain dimColor onPress={async () => askQuit($)} />
            </Box>
            {narrowQuit}
            {closeView}
            {failureLine}
            {list}
            <Box flexGrow={1} />
            {noticeLine !== null && quitting === null && noticeLine}
            {errorLine}
            {keyLine}
          </Box>
        )
      }

      // The detail of the focused row: an issue in progress, an open issue, or another branch.
      const progress = inProgress.find(one => `row:${one.row.key}` === selectedKey) ?? null
      const open = openIssues.find(issue => `cand:${issue.id}` === selectedKey) ?? null
      const other = otherBranches.find(one => `row:${otherKey(one)}` === selectedKey) ?? null
      const issue = progress?.issue ?? open
      const main = Math.max(20, bodyColumns - listWidth - 3)
      const remote = progress !== null ? remotes[progress.row.key] : undefined
      const local = progress !== null && view.kind === 'rows' ? view.local[progress.row.key] : undefined
      const tickets = config().tickets
      const kind = open !== null && tickets.kind === 'github' ? issueKind(open.labels, tickets.labels) : undefined
      const planned = open !== null && context?.repo ? newWorktree({
        repo: context.repo, ticket: open.id, issue: open, existing: [], blockerBranch: null, originBranches: [config().project.baseBranch],
        baseBranch: config().project.baseBranch, ...(kind !== undefined ? { kind } : {}),
      }, config().worktree, context.home) : null
      const start = open !== null ? ticketStart(open.id, 'not started', config().workflow.steps.start, routingProfile().skills, routingProfile().modelIds)?.prompt ?? null : null
      const mark = issue !== null ? candidateMark(issue) : null
      // Decision 077: the meta line ends with `· blocked by #38 <its title> +1` in red, as a Linear ticket's detail.
      const metaBlocked = issue !== null ? blockedMeta(issue, issues) : null
      const meta = progress !== null ? `${progress.row.phase} · ${progress.row.branch}${remote?.behind ? ` · behind origin/${local?.base ?? config().project.baseBranch}: ${remote.behind}` : ''}`
        : open !== null ? `open · ${open.assignedToMe ? 'assigned to you' : open.assigneeName !== undefined ? `assigned to ${open.assigneeName}` : 'unassigned'}`
          : other !== null ? `no issue · ${tilde(other.path)}` : ''
      const prText = progress === null ? null : progress.prLine ?? (remote === undefined ? 'pull request loading…' : remote.pullRequest.kind === 'unavailable' ? 'gh not available' : remote.pullRequest.kind === 'error' ? `gh: ${remote.pullRequest.message}` : 'no pull request')
      const nextText = progress !== null ? (progress.step.next ?? progress.row.next ?? 'nothing recorded')
        : planned !== null ? `worktree ${tilde(planned.path)} · branch ${planned.branch}` : 'no next step: this worktree has no issue'
      const enter = progress !== null ? '↵ opens the session of this issue' : open !== null ? `↵ creates its worktree (the marked issues' too, m marks); ↵ on it under IN PROGRESS then opens its session${start !== null ? ` and runs ${start}` : ''}`
        : other !== null ? '↵ opens a plain session in this worktree' : ''
      const descWidth = Math.min(70, main)
      const textRows = Math.max(2, listRows - 13)
      const description = issue !== null && issue.description.trim() !== '' ? descriptionLines(issue.description, descWidth, textRows) : null
      const detail = settingsOpen ? (
        <Box key="repo:detail" flexDirection="column" width={main} height={listRows}>
          <Text bold color={colours.accent}>settings</Text>
          <Text> </Text>
          {settingsBody($, els, async () => {
            await update($, boardSettings, () => false)
            await focusMarked($)
          })}
        </Box>
      ) : selectedKey === null ? (
        <Box key="repo:detail" flexDirection="column" width={main} height={listRows}><Text dimColor>nothing to show</Text></Box>
      ) : (
        <Box key="repo:detail" flexDirection="column" width={main} height={listRows}>
          <Text dimColor>{progress?.row.key ?? open?.id ?? other?.name ?? ''}</Text>
          <Text bold>{truncateEnd(progress?.title ?? open?.title ?? other?.branch ?? 'detached', main)}</Text>
          {(issue?.labels.length ?? 0) > 0 || mark !== null ? (
            <Box key="repo:labels" flexDirection="row">
              {mark !== null && <Text color={mark.tone === 'accent' ? colours.accent : undefined} dimColor={mark.tone === 'dim'}>{mark.text}</Text>}
              {(issue?.labels ?? []).map((label, index) => {
                const colour = labelColour(labelTone(label), colours)
                return <Text key={`dl:${index}`} color={colour} dimColor={colour === undefined}>{`${index > 0 || mark !== null ? ' ' : ''}${label}`}</Text>
              })}
            </Box>
          ) : <Text> </Text>}
          <Text> </Text>
          <Text wrap="truncate-end"><Text dimColor>{meta}</Text>{metaBlocked !== null && <Text color={colours.error}>{` · ${metaBlocked}`}</Text>}</Text>
          {prText !== null && <Text>{truncateEnd(prText, main)}</Text>}
          <Text> </Text>
          <Text dimColor>next</Text>
          <Text>{truncateEnd(nextText, main)}</Text>
          <Text> </Text>
          <Text dimColor>{description === null && local?.plan ? 'plan' : 'description'}</Text>
          {description === null ? (
            local?.plan ? <Markdown text={cutPlan(planExcerpt(local.plan), descWidth, textRows)} /> : <Text dimColor>{other !== null ? '—' : 'no description'}</Text>
          ) : (
            <Box flexDirection="column" width={descWidth}>
              {description.map((part, index) => {
                if (part.kind === 'lead') return <Text key={`d:${index}`}><Text bold>{part.label}</Text>{` ${part.text}`}</Text>
                if (part.kind === 'heading') return <Text key={`d:${index}`} bold>{part.text}</Text>
                if (part.kind === 'check') return <Text key={`d:${index}`}><Text dimColor>{'☐ '}</Text>{part.text}</Text>
                if (part.kind === 'more') return <Text key={`d:${index}`} dimColor>{part.text}</Text>
                return <Text key={`d:${index}`}>{part.text}</Text>
              })}
            </Box>
          )}
          <Box flexGrow={1} />
          <Box width={main}><Text dimColor wrap="wrap">{enter}</Text></Box>
        </Box>
      )
      const headerPaces = await boardPaces($, now)
      return (
        <Box flexDirection="column" width={bodyColumns}>
          <Box key="repo:header" flexDirection="row" width={bodyColumns}>
            <Text bold color={colours.accent}>{header}</Text>
            {filter !== '' && <Text>{`   filter: ${truncateEnd(filter, 24)}`}<Text dimColor>{'  esc clears'}</Text></Text>}
            <Box flexGrow={1} />
            {headerPaces.map(({ label, pace }) => (
              <Text key={`pace:${label}`} dimColor={!pace.outBeforeReset} color={pace.outBeforeReset ? colours.needsYou : undefined}>{`  ${paceChip(label, pace)}`}</Text>
            ))}
            {awayState.on && <Text color={colours.needsYou}>{'  ◆ AWAY'}</Text>}
            {headerClose(freeTarget(ringRow), 'before')}
          </Box>
          <Text color={colours.panel}>{'─'.repeat(bodyColumns)}</Text>
          {failureLine}
          <Box flexDirection="row">
            {list}
            <Box key="repo:border" width={1} height={listRows}><Text color={colours.accent}>{Array.from({ length: listRows }, () => '│').join('\n')}</Text></Box>
            <Box width={2} />
            {detail}
          </Box>
          {closeView}
          {noticeLine}
          {errorLine}
          {keyLine}
          {popup !== null && context !== null && (
            <Box key="repo:attention" position="absolute" top={0} right={0}>
              {attentionPopupView($, els, colours, popup, Math.min(56, Math.max(30, Math.floor(bodyColumns / 3))), context)}
            </Box>
          )}
        </Box>
      )
    }

    // A design Tower (decision 064, plan "New project mode"): `new project · <folder>`, the path's eight stages (✓ ◆ ○ –, the
    // current one ▶, its open questions), `+ new session · + prototype`, SESSIONS. ↵ on a stage brings the design session
    // to the centre (a new one on /tower:tower-design when none runs). Wide, the plan's columns: summary and document too.
    const drawDesign = async (withDetail: boolean) => {
      const notice = await read($, boardNotice)
      const quitting = await read($, quitAsk)
      const popup = withDetail ? await attentionPopup($, context) : null
      const design = await read($, designView)
      const asking = await read($, prototypeAsk)
      const W = withDetail ? bodyColumns : width
      const title = designTitle(context?.repo ?? '', context?.home ?? '')
      const stages = design.state !== null ? designPath(design.state) : []
      const current = stages.find(row => row.current)
      markedElement = current !== undefined ? `stage:${current.n}` : 'new-session'
      // The narrow rail: the ▶ follows the ring onto a stage, `+ new session` or a session; else it stays on the current
      // stage. A stage's Button holds its name, its tail and the padding: the engine's focus inverse is the row's bar.
      const designRing = ringRowOf(ringOn, !withDetail && e.props.isFocused === true, [...stages.map(row => `stage:${row.n}`), ...freeRingRows])
      const summaryWidth = Math.max(0, ...stages.map(row => row.summary.length))
      const docWidth = Math.max(0, ...stages.map(row => row.doc.length))
      const stageRow = (row: (typeof stages)[number]) => {
        const markColour = row.status === 'done' ? colours.done : row.status === 'active' ? colours.accent : undefined
        const name = `${row.n} ${row.label}`
        const room = Math.max(1, W - 5 - STAGE_NAME_WIDTH)
        const tail = withDetail ? [row.summary.padEnd(summaryWidth), row.doc.padEnd(docWidth), row.note ?? ''].join('  ').trimEnd() : designRowTail(row)
        const gap = ' '.repeat(Math.max(1, STAGE_NAME_WIDTH - name.length + 1))
        const text = truncateEnd(tail, room)
        const marked = designRing !== null ? designRing === `stage:${row.n}` : row.current
        return (
          <Box key={`stage-row:${row.n}`} flexDirection="row" width={W}>
            <Text color={marked ? colours.accent : undefined}>{marked ? '▶ ' : '  '}</Text>
            <Text color={markColour} dimColor={markColour === undefined}>{`${row.mark} `}</Text>
            <Button key={`stage:${row.n}`} label={name} plain dimColor={row.status === 'skipped'} onPress={async () => { if (context !== null) await openDesignSession($, context) }}>
              {name}
              <Text>{gap}</Text>
              <Text color={row.current && row.note !== null ? colours.accent : undefined} dimColor={!row.current || row.note === null}>{text}</Text>
              {' '.repeat(Math.max(0, W - 4 - name.length - gap.length - Array.from(text).length))}
            </Button>
          </Box>
        )
      }
      const prototypeButton = (
        <Button key="prototype" label="+ prototype" hotkey="t" plain onPress={async () => { await update($, prototypeAsk, ask => (ask === null ? '' : null)) }} />
      )
      // The ring on `+ new session`: `▶ ` before the row; the bar is the engine's focus inverse on `o: + new session` alone
      // (`t: + prototype` is a Button of its own after it, so the row's padding cannot be inside it).
      const actionsRinged = designRing === 'new-session'
      const actionsRow = newAsk !== null ? newSessionView(W, true, null) : (
        <Box key="design:new" flexDirection="row" width={W}>
          {actionsRinged && <Text color={colours.accent}>{'▶ '}</Text>}
          {newSessionButton(null)}
          <Text dimColor>{' · '}</Text>
          {prototypeButton}
        </Box>
      )
      // `+ prototype` asks a short name; ↵ makes spikes/<nn>-<slug>/ and opens a free session there, an empty one closes the question.
      const prototypeRow = asking === null || Input === null ? null : (
        <Box key="design:prototype" flexDirection="row" width={W}>
          <Text color={colours.accent}>{'prototype '}</Text>
          <Input
            key="prototype:input"
            placeholder="a short name · ↵ opens it in spikes/"
            value={asking}
            autoFocus
            onInput={(value: string) => {
              void update($, prototypeAsk, ask => (ask === null ? ask : value)).catch(() => {})
            }}
            onSubmit={() => {
              void (async () => {
                const name = (await read($, prototypeAsk)) ?? ''
                if (context !== null) await openPrototype($, context, name)
              })().catch(() => {})
            }}
          />
        </Box>
      )
      const quitButton = <Button key="quit" label="quit" hotkey="q" plain dimColor onPress={async () => askQuit($)} />
      const noticeLine = notice === null ? null : quitting === null ? <Text key="design:notice" dimColor>{truncateEnd(notice, W)}</Text> : (
        <Box key="quit-ask" flexDirection="row">
          <Text color={withDetail ? undefined : colours.needsYou}>{withDetail ? 'close tower and every session? ' : 'close everything? '}</Text>
          <Button key="quit:yes" label="yes" hotkey="y" plain onPress={async () => quitTower($)} />
          <Text dimColor>{(withDetail ? '   any key: no' : '') + quitWorking(quitting)}</Text>
        </Box>
      )
      const errorLine = error !== null ? <Text key="design:error" dimColor>{truncateEnd(error, W)}</Text> : null
      return (
        <Box flexDirection="column" width={W} {...(withDetail ? {} : { height })}>
          {withDetail ? (
            <Box key="design:header" flexDirection="row" width={W}>
              <Text bold color={colours.accent}>{truncateEnd(title, W)}</Text>
              <Box flexGrow={1} />
              {awayState.on && <Text color={colours.needsYou}>{'  ◆ AWAY'}</Text>}
              {headerClose(freeTarget(ringRow), 'before')}
            </Box>
          ) : <Text key="design:header" bold>{truncateEnd(title, W)}</Text>}
          {withDetail ? <Text color={colours.panel}>{'─'.repeat(W)}</Text> : (
            <Box key="design:keys" flexDirection="row" width={W}>
              <Box flexGrow={1} />
              {headerClose(freeTarget(ringRow), 'after')}
              {refresh}
              <Text>{'  '}</Text>
              {quitButton}
            </Box>
          )}
          {stages.length === 0 ? <Text dimColor>{truncateEnd(`no design state yet · ${DESIGN_STATE_PATH}`, W)}</Text> : stages.map(stageRow)}
          <Text> </Text>
          {actionsRow}
          {prototypeRow}
          {freeRows.length > 0 && <Text key="free-heading" dimColor>SESSIONS</Text>}
          {freeRows.map(row => freeLine(row, W, designRing === `free:${row.key}`))}
          <Box flexGrow={1} />
          {closeAskView(W)}
          {noticeLine}
          {errorLine}
          {withDetail && (
            <Box key="design:footer" flexDirection="row" width={W}>
              {refresh}
              <Text>{'   '}</Text>
              <Button key="away" label="away" hotkey="a" plain dimColor={!awayState.on} onPress={async () => setAway($, !awayState.on)} />
              <Text>{'   '}</Text>
              {quitButton}
            </Box>
          )}
          {popup !== null && context !== null && (
            <Box key="design:attention" position="absolute" top={0} right={0}>
              {attentionPopupView($, els, colours, popup, Math.min(56, Math.max(30, Math.floor(W / 3))), context)}
            </Box>
          )}
        </Box>
      )
    }

    // Every drawing goes out through keptButtons: the keys check reads its Buttons, the ring's stops.
    if (designTower() && mode !== 'skills') return keptButtons(await drawDesign(wide))
    // A free Tower (decision 060) draws the same list: no issues, SESSIONS and, in git, OTHER BRANCHES.
    if ((config().tickets.kind === 'github' || freeTower()) && mode !== 'skills') return keptButtons(await drawRepo(wide))

    if (wide && mode !== 'skills') return keptButtons(await drawHome())
    if (mode === 'skills' && (view.kind !== 'rows' || view.rows.length === 0)) return keptButtons(await drawLauncher())
    if (view.kind !== 'rows') {
      const line = view.kind === 'loading' ? 'loading…' : view.message
      return keptButtons(
        <Box flexDirection="column">
          <Text dimColor>{truncateEnd(line, width)}</Text>
          {actions}
        </Box>
      )
    }
    if (view.rows.length === 0) {
      return keptButtons(
        <Box flexDirection="column">
          {closeAskView(width)}
          {freeBlock(width, null)}
          <Text dimColor>{truncateEnd(`no ticket worktrees in ${view.repoName}`, width)}</Text>
          {actions}
        </Box>
      )
    }

    const remotes = await read($, remoteDetails)
    const now = await $.clock.now()
    const pullRequests = Object.fromEntries(Object.entries(remotes).map(([key, remote]) => [key, remote.pullRequest]))
    const shownKey = centre ?? opening
    const focused = await read($, focusedTicket)
    const hasClient = 'Client' in els
    // The source's rail: two lines a row, `▶` on the shown one. The Button (`element`) holds the label and the padding
    // across the row: the engine's focus inverse is its bar, the ▶ and the glyph outside it (the spinner always turns).
    // Decision 067: a story's rows sit `indent` cells in, under its header.
    const rowLine = (key: string, element: string, marked: boolean, glyph: { glyph: string; color: string | undefined; dim: boolean }, press: () => Promise<unknown>, label: string, second: string, secondColour: string | null = null, indent = 0) => {
      const spins = glyph.glyph === '◐' && hasClient
      const pad = ' '.repeat(indent)
      return (
        <Box key={`item:${key}`} flexDirection="column" width={width}>
          <Box flexDirection="row">
            <Text color={marked ? colours.accent : undefined}>{(marked ? '▶ ' : '  ') + pad}</Text>
            {spins ? (
              <Box width={2}><els.Client key={`spin:${key}`} module="./spinner.tsx" props={{ colour: glyph.color }} /></Box>
            ) : (
              <Text color={glyph.color} dimColor={glyph.dim}>{`${glyph.glyph} `}</Text>
            )}
            <Button key={element} label={label} plain onPress={press}>{label + ' '.repeat(Math.max(0, width - 4 - indent - label.length))}</Button>
          </Box>
          <Text color={secondColour ?? undefined} dimColor={secondColour === null}>{'    ' + pad + truncateEnd(second, width - 4 - indent)}</Text>
        </Box>
      )
    }
    const order = { 'needs you': 0, working: 1, ready: 2 } as const
    // Decision 067: the candidates' issues and the rail's own read by identifier, so every worktree's story is known.
    const issues = await knownIssues($)
    const blockersOf = (key: string) => issues.find(issue => issue.id.toUpperCase() === key.toUpperCase())?.blockedBy ?? []
    // Decision 069: a ticket brought to the rail and not started (no state file, no session, no PR): `○`, `not started · Todo`.
    const tickets = view.rows.map(row => ({ row, step: rowStep(row, pullRequests[row.key], blockersOf(row.key), config().workflow), fresh: notStartedRow(row, pullRequests[row.key]) }))
    const ticketLine = ({ row, step, fresh }: (typeof tickets)[number], indent = 0) => {
      const label = truncateEnd(row.key, width - 4 - indent)
      const blockers = blockersOf(row.key)
      // Decision 069: ↵ on a ticket not started opens its session on /start-ticket; a blocked one asks first.
      const press = async () => {
        if (context === null) return
        if (fresh && blockers.length > 0) {
          await askClose($, { role: 'start', key: row.key, name: row.key, question: `${row.key} is blocked by ${blockers.join(', ')} — start anyway?`, note: '' })
          return
        }
        await openWork($, context, ticketSession(row))
      }
      const starting = row.key === opening && row.key !== centre
      const state = issues.find(issue => issue.id.toUpperCase() === row.key.toUpperCase())?.stateName ?? ''
      const second = starting ? 'starting' : fresh ? (blockedText(blockers) ?? `not started${state !== '' ? ` · ${state}` : ''}`) : railStatus(step)
      const secondColour = starting ? null : fresh ? (blockers.length > 0 ? colours.needsYou : null) : step.glyph === '⊘' ? colours.error : null
      if (row.key === (focused ?? shownKey)) markedElement = `row:${row.key}`
      const glyph = fresh ? { glyph: '○', color: undefined, dim: true } : rowGlyph(row, colours, pullRequests[row.key], blockers)
      return rowLine(row.key, `row:${row.key}`, highlighted(`row:${row.key}`, row.key), glyph, press, label, second, secondColour, indent)
    }
    const hubLine = (hub: (typeof view.hubs)[number]) => {
      const label = truncateEnd(`/${hub.key}`, width - 4)
      const press = async () => {
        if (context !== null && context.repo !== null) await openWork($, context, { role: 'hub', key: hub.key, cwd: context.repo, start: null })
      }
      if (hub.key === (focused ?? shownKey)) markedElement = `hub:${hub.key}`
      return rowLine(`hub:${hub.key}`, `hub:${hub.key}`, highlighted(`hub:${hub.key}`, hub.key), hubGlyph(hub.state, colours), press, label, 'main checkout', null, 0)
    }
    /**
     * Decision 068/070, placed by decision 072: what the header's `x` acts on — the row the ring is on, else the ▶ row:
     * a free or hub session, `close`; a ticket with a live session, `close` (only its session); one without, `remove`
     * when not started (its worktree and branch when it holds no work, else hidden) or `hide` (the worktree stays).
     */
    const railTarget = (element: string | null): CloseTarget | null => {
      if (element === null) return null
      if (element.startsWith('free:')) return freeTarget(element)
      const hub = element.startsWith('hub:') ? view.hubs.find(one => `hub:${one.key}` === element) : undefined
      if (hub !== undefined) return { element, label: 'close', press: async () => askClose($, { role: 'hub', key: hub.key, name: `/${hub.key}`, question: `close /${hub.key}?`, note: '' }) }
      const ticket = element.startsWith('row:') ? tickets.find(one => `row:${one.row.key}` === element) : undefined
      if (ticket === undefined) return null
      const { row, fresh } = ticket
      if (row.session !== null) {
        return { element, label: 'close', press: async () => askClose($, { role: 'ticket', key: row.key, name: `the session of ${row.key}`, question: `close the session of ${row.key}?`, note: 'the worktree stays' }) }
      }
      return { element, label: fresh ? 'remove' : 'hide', press: async () => askRemove($, row, fresh) }
    }
    const shownHub = view.hubs.find(one => one.key === (focused ?? shownKey))
    const shownElement = tickets.some(one => one.row.key === (focused ?? shownKey)) ? `row:${focused ?? shownKey}` : shownHub !== undefined ? `hub:${shownHub.key}` : null
    const narrowClose = railTarget(ringRow) ?? railTarget(shownElement)
    // Rows: the header, `+ new session` and SESSIONS (decision 055; then TICKETS heads the tickets), two a ticket; the hubs and their heading only when there are any.
    // Decision 068: the narrow rail's notice line (`… closed`), under the list as the error line; not while quit asks.
    const narrowNotice = (await read($, quitAsk)) === null ? await read($, boardNotice) : null
    // Decision 071: `a: candidates` under the tickets opens the candidates in the list's place (Linear only).
    const adding = config().tickets.kind === 'linear'
    const room = height - 1 - (error !== null ? 1 : 0) - (narrowNotice !== null ? 1 : 0) - (view.hubs.length > 0 ? 1 + 2 * view.hubs.length : 0) - freeBlockRows(true) - (freeRows.length > 0 ? 1 : 0) - closeAskRows - (adding ? 1 : 0)
    const focusedRow = view.rows.find(one => one.key === (focused ?? shownKey))
    const narrowSelected = focusedRow === undefined ? null : { label: `${focusedRow.key} worktree`, path: focusedRow.path }
    // Decision 067: story blocks. Each story with a row here heads its rows (`▾ TKT-1 title · d/t done`, the rows two cells
    // in, a blank line after); the rows with no story (or whose issue is not loaded) under NO STORY at the end.
    type NarrowLine =
      | { kind: 'head'; rows: 1; key: string; text: string; story: boolean }
      | { kind: 'gap'; rows: 1; key: string }
      | { kind: 'ticket'; rows: 2; ticket: (typeof tickets)[number]; indent: number }
    const blocks = storyBlocks(tickets, issues, one => one.row.key, one => (one.fresh ? 3 : order[one.step.group]))
    const storied = blocks.some(block => block.story !== null)
    const blockLines: NarrowLine[] = blocks.flatMap((block, at): NarrowLine[] => {
      const rows = block.rows.map((ticket): NarrowLine => ({ kind: 'ticket', rows: 2, ticket, indent: block.story !== null ? 2 : 0 }))
      if (block.story === null) return [...(storied ? [{ kind: 'head' as const, rows: 1 as const, key: 'no-story', text: 'NO STORY', story: false }] : []), ...rows]
      return [{ kind: 'head', rows: 1, key: `story:${block.story.id}`, text: block.story.text, story: true }, ...rows,
        ...(at < blocks.length - 1 ? [{ kind: 'gap' as const, rows: 1 as const, key: `gap:${block.story.id}` }] : [])]
    })
    const fitted = fitRail(blockLines, room)

    // Decision 071: the candidates (the old launcher's): Linear's tickets with no worktree here (the hidden ones neither), the
    // person's own first, by story; `▢`/`▣` marks (`m`), `↵` promotes the marked ones (else the ▶ one):
    // their worktree only, then they are on the rail as `○ not started`. `l` shows the ▶ one's detail in the list's place.
    // The mark is plain text: no Button, so the ring stops once a row (the engine has no Button out of the ring).
    const candMode = adding ? await read($, candidatesView) : null
    // The row the ring is on while the pane holds the keys (a ticket or hub row drawn, a session, `+ new session` not
    // asking, `a: candidates` while the candidates are closed): the ▶ follows it there, one row at a time (the bar is the
    // engine's focus inverse on the row's Button). Off the rows (a header or action key, the question's Buttons) it stays
    // on the ▶ row: the focused ticket, else the one shown.
    const ringListRow = ringRowOf(ringOn, e.props.isFocused === true, [
      ...fitted.shown.flatMap(line => (line.kind === 'ticket' ? [`row:${line.ticket.row.key}`] : [])), ...view.hubs.map(hub => `hub:${hub.key}`), ...freeRingRows,
      ...(adding && candMode === null ? ['candidates'] : []),
    ])
    const highlighted = (element: string, key: string) => (ringListRow !== null ? ringListRow === element : key === (focused ?? shownKey))
    // Decision 070: the tickets hidden from the rail have their worktree: never candidates, listed under HIDDEN.
    const hiddenRows = adding ? (view.hidden ?? []) : []
    const cands = candMode !== null ? candidateIssues(issues, new Set([...view.rows, ...hiddenRows].map(row => row.key.toUpperCase()))) : []
    const candEntries = candidateStories(cands, [...issues, ...cands.filter(one => one.fromStory === true)], one => one.id, one => one.assignedToMe)
    const candOrder = candEntries.flatMap(entry => (entry.kind === 'ticket' ? [entry.row] : []))
    railCandidateKeys = candOrder.map(one => one.id)
    const candFocused = focused !== null && railCandidateKeys.includes(focused) ? focused : railCandidateKeys[0] ?? null
    if (candMode !== null && candFocused !== null) markedElement = `cand:${candFocused}`
    const marks = candMode !== null ? await read($, candidateMarks) : []
    const making = await read($, promoting)
    // The candidates' ring row (set once the window is known; the rows are drawn after it): a candidate or a HIDDEN row.
    // On a HIDDEN row no candidate is marked; off the rows (the footer's keys) the ▶ stays on the chosen candidate.
    const candLine = (issue: TowerIssue, child: boolean, suffix: string) => {
      const chosen = candRing !== null ? candRing === `cand:${issue.id}` : issue.id === candFocused
      const started = issue.stateType === 'started'
      const blocked = blockedText(issue.blockedBy)
      // `▶ ▢ ▲ TKT-130★ ↳ title · in progress`: six cells before the id, the star, a space.
      const head = 6 + Array.from(issue.id).length + (issue.assignedToMe ? 1 : 0) + 1
      const tail = making === issue.id ? ' creating worktree…' : started ? ' · in progress' : ''
      const title = making === issue.id ? '' : truncateEnd(`${child ? '↳ ' : ''}${issue.title}${suffix}`, Math.max(1, width - head - Array.from(tail).length))
      // The Button holds the row after the ▶ across the width, in its colours: the engine's focus inverse is its bar.
      const pad = ' '.repeat(Math.max(0, width - head + 1 - (title === '' ? 0 : 1 + Array.from(title).length) - Array.from(tail).length))
      return (
        <Box key={`item:cand:${issue.id}`} flexDirection="column" width={width}>
          <Box flexDirection="row">
            <Text color={chosen ? colours.accent : undefined}>{chosen ? '▶ ' : '  '}</Text>
            <Button key={`cand:${issue.id}`} label={issue.id} plain onPress={async () => { if (context !== null) await promoteCandidates($, context, candOrder, issue.id) }}>
              <Text>{marks.includes(issue.id) ? '▣' : '▢'}{' '}{priorityText(issue.priority)}{' '}</Text>
              {issue.id}
              {[
                ...(issue.assignedToMe ? [<Text key="star" color={colours.needsYou}>★</Text>] : []),
                <Text key="title" color={started ? colours.needsYou : undefined}>{title === '' ? '' : ` ${title}`}</Text>,
                ...(tail !== '' ? [<Text key="tail" dimColor>{tail}</Text>] : []),
              ]}
              {pad}
            </Button>
          </Box>
          {blocked !== null && <Text color={colours.error} dimColor>{'      ' + truncateEnd(blocked, width - 6)}</Text>}
        </Box>
      )
    }
    /** `ring`: the row's Button, which the ▶ may follow. */
    type CandItem = { keys: string[]; rows: number; node: () => RenderChildren; ring?: string }
    const candItems: CandItem[] = [
      ...candEntries.map((entry): CandItem => (entry.kind === 'storyHeader'
        ? { keys: [], rows: 1, node: () => <Text key={`cand-story:${entry.storyId}`} dimColor>{truncateEnd(entry.text, width)}</Text> }
        : { keys: [entry.row.id], rows: blockedText(entry.row.blockedBy) !== null ? 2 : 1, node: () => candLine(entry.row, entry.childPrefix, entry.storySuffix ?? ''), ring: `cand:${entry.row.id}` })),
      // Decision 070: the hidden tickets; ↵ shows one on the rail again (its worktree is there).
      ...(hiddenRows.length === 0 ? [] : [{ keys: [], rows: 1, node: () => <Text key="cand-hidden" dimColor>HIDDEN</Text> }, ...hiddenRows.map((row): CandItem => ({ keys: [], rows: 1, ring: `unhide:${row.key}`, node: () => {
        const title = issues.find(issue => issue.id.toUpperCase() === row.key.toUpperCase())?.title || titleFromBranch(row.branch, row.key)
        const label = truncateEnd(`+ ${row.key} ${title}`, Math.max(4, width - 2))
        const ringed = candRing === `unhide:${row.key}`
        return (
          <Box key={`item:unhide:${row.key}`} flexDirection="row" width={width}>
            <Text color={ringed ? colours.accent : undefined}>{ringed ? '▶ ' : '  '}</Text>
            <Button key={`unhide:${row.key}`} label={label} plain dimColor
              onPress={async () => { if (context !== null) await unhideTicket($, context, row.key) }}>
              {label + ' '.repeat(Math.max(0, width - 2 - Array.from(label).length))}
            </Button>
          </Box>
        )
      } }))]),
    ]
    const narrowQuit = await read($, quitAsk)
    const candFailure = candMode !== null ? await read($, linearError) : null
    // The header, quit's row, the question, CANDIDATES, the two footer rows, the notice and error lines.
    const candRoom = Math.max(3, height - 1 - (narrowQuit === null ? 0 : 1) - closeAskRows - 1 - 2 - (error !== null ? 1 : 0) - (narrowNotice !== null ? 1 : 0))
    const candWindow = columnWindow(candItems.map(item => item.rows), candItems.findIndex(item => candFocused !== null && item.keys.includes(candFocused)), candRoom, railCandidateStart)
    if (candMode === 'list') railCandidateStart = candWindow.start
    const candRing = ringRowOf(ringOn, e.props.isFocused === true, candItems.slice(candWindow.start, candWindow.end).flatMap(item => (item.ring !== undefined ? [item.ring] : [])))
    const candMore = (way: 'up' | 'down', count: number) => (
      <Button key={`more:cands:${way}`} label={`${way === 'up' ? '↑' : '↓'} ${count} more`} plain dimColor onPress={async () => moveCandidateWindow($, way)} />
    )
    const candHidden = (from: number, to: number) => candItems.slice(from, to).reduce((sum, item) => sum + item.keys.length, 0)
    const markedCount = candOrder.filter(issue => marks.includes(issue.id)).length
    const detailIssue = candMode === 'detail' ? candOrder.find(issue => issue.id === candFocused) ?? null : null
    // the old launcher's detail: id · title, ★ assigned, state and labels, parent, sub-tickets, blocked by, blocks, the URL, the description.
    const candDetail = () => {
      if (detailIssue === null) return <Text key="cand-detail:none" dimColor>no candidate</Text>
      const relations = detailRelations(detailIssue, issues)
      const fixed = wrapWords(`${detailIssue.id} · ${detailIssue.title}`, width).length + (detailIssue.assignedToMe ? 1 : 0) + 1 + relations.length + (detailIssue.url !== '' ? 1 : 0)
      const description = detailIssue.description.trim() === '' ? [] : descriptionLines(detailIssue.description, width, Math.max(1, candRoom - fixed - 1))
      return (
        <Box key="cand-detail" flexDirection="column" width={width} height={candRoom}>
          {wrapWords(`${detailIssue.id} · ${detailIssue.title}`, width).map((line, at) => (at === 0
            ? <Text key={`cd:t:${at}`}><Text dimColor>{`${detailIssue.id} · `}</Text><Text bold>{line.slice(Array.from(`${detailIssue.id} · `).length)}</Text></Text>
            : <Text key={`cd:t:${at}`} bold>{line}</Text>))}
          {detailIssue.assignedToMe && <Text color={colours.needsYou}>{truncateEnd('★ assigned to you on Linear', width)}</Text>}
          <Text wrap="truncate-end"><Text bold>{detailIssue.stateName}</Text>{detailIssue.labels.length > 0 && <Text dimColor>{` · ${detailIssue.labels.join(', ')}`}</Text>}</Text>
          {relations.map((relation, at) => {
            const label = `${relation.label}  `
            const room = Math.max(4, width - Array.from(label).length - Array.from(relation.suffix).length)
            return (
              <Text key={`cd:r:${at}`} wrap="truncate-end">
                <Text dimColor>{label}</Text>
                <Text color={relation.tone === 'error' ? colours.error : undefined} dimColor={relation.tone === 'dim'}>{truncateEnd(relation.text, room)}</Text>
                {relation.suffix !== '' && <Text color={relation.suffixTone === 'error' ? colours.error : relation.suffixTone === 'done' ? colours.done : undefined}>{relation.suffix}</Text>}
              </Text>
            )
          })}
          {detailIssue.url !== '' && <Text dimColor>{truncateEnd(detailIssue.url, width)}</Text>}
          {description.length > 0 && <Text bold color={colours.accent}>Description</Text>}
          {description.map((part, at) => (part.kind === 'lead' ? <Text key={`cd:d:${at}`}><Text bold>{part.label}</Text>{` ${part.text}`}</Text>
            : part.kind === 'heading' ? <Text key={`cd:d:${at}`} bold>{part.text}</Text>
              : part.kind === 'check' ? <Text key={`cd:d:${at}`}><Text dimColor>{'☐ '}</Text>{part.text}</Text>
                : part.kind === 'more' ? <Text key={`cd:d:${at}`} dimColor>{part.text}</Text> : <Text key={`cd:d:${at}`}>{part.text}</Text>))}
        </Box>
      )
    }
    // `room`: the cells the row leaves it; the Button then holds its padding too, so the engine's focus inverse is the bar.
    const candidatesButton = (label: string, room: number | null = null) => {
      const press = async () => {
        if ((await read($, candidatesView)) !== null) return closeCandidates($)
        const listed = candidateIssues(await knownIssues($), new Set([...view.rows, ...hiddenRows].map(row => row.key.toUpperCase())))
        const first = candidateStories(listed, await knownIssues($), one => one.id, one => one.assignedToMe).find(entry => entry.kind === 'ticket')
        await openCandidates($, first?.kind === 'ticket' ? first.row.id : null)
      }
      return room === null ? <Button key="candidates" label={label} hotkey="a" plain dimColor onPress={press} /> : (
        <Button key="candidates" label={label} hotkey="a" plain dimColor onPress={press}>
          {label + ' '.repeat(Math.max(0, room - Array.from(`a: ${label}`).length))}
        </Button>
      )
    }
    // the old launcher's keys: `↑↓ move · ↵ promote · esc back`, then the letters as Buttons (`m: mark  l: detail  r: reload  a: back`).
    const candFooter = (
      <Box key="cand-footer" flexDirection="column" width={width}>
        <Text dimColor>{truncateEnd(candMode === 'detail' ? 'esc back to the list' : '↑↓ move · ↵ promote · esc back', width)}</Text>
        <Box flexDirection="row" width={width}>
          {candMode === 'list' && [
            <Button key="cands:mark" label="mark" hotkey="m" plain dimColor onPress={async () => {
              const id = candFocused
              if (id !== null) await update($, candidateMarks, list => toggleMark(list, id))
            }} />,
            <Text key="cands:gap:m">{'  '}</Text>,
          ]}
          <Button key="cands:detail" label={candMode === 'detail' ? 'list' : 'detail'} hotkey="l" plain dimColor onPress={async () => {
            await update($, candidatesView, current => (current === 'detail' ? 'list' : 'detail'))
          }} />
          <Text>{'  '}</Text>
          {candMode === 'list' && [
            <Button key="cands:reload" label="reload" hotkey="r" plain dimColor onPress={async () => {
              await refreshLinear($)
              await pruneCandidateMarks($)
            }} />,
            <Text key="cands:gap:r">{'  '}</Text>,
          ]}
          {candidatesButton('back')}
        </Box>
      </Box>
    )
    // The ring on `a: candidates` (the engine's drawing, 13 cells): `▶ ` before it; the Button holds the padding, as
    // `+ new session`'s.
    const addRinged = ringListRow === 'candidates'
    const addTicket = adding ? (
      <Box key="candidates-row" flexDirection="row" width={width}>
        {addRinged && <Text color={colours.accent}>{'▶ '}</Text>}
        {candidatesButton('candidates', width - (addRinged ? 2 : 0))}
      </Box>
    ) : null
    // Decision 072: `x: close` / `x: remove` / `x: hide` beside `skills  board  quit`, for the ring's row (else the ▶ row).
    const back = (
      <Box key="header" flexDirection="row" width={width}>
        <Box flexGrow={1} />
        {candMode === null && headerClose(narrowClose, 'after')}
        {skills}
        <Text>{'  '}</Text>
        <Button key="board" label="board" hotkey="b" plain dimColor onPress={async () => { if (context !== null) await backToBoard($, context) }} />
        <Text>{'  '}</Text>
        <Button key="quit" label="quit" hotkey="q" plain dimColor onPress={async () => askQuit($)} />
      </Box>
    )
    // `q` asked: the same question as the board's, in one row under the header.
    const quitRow =
      narrowQuit === null ? null : (
        <Box key="quit-row" flexDirection="row" width={width}>
          <Text color={colours.needsYou}>{'close everything? '}</Text>
          <Button key="quit:yes" label="yes" hotkey="y" plain onPress={async () => quitTower($)} />
          <Text dimColor>{`${quitWorking(narrowQuit)}`}</Text>
        </Box>
      )

    const list = mode === 'skills' ? await drawLauncher() : candMode !== null ? (
      <Box flexDirection="column" width={width} height={height}>
        {back}
        {quitRow}
        {closeAskView(width)}
        <Text key="cand-heading" dimColor>{truncateEnd(`CANDIDATES${markedCount > 0 ? ` · ${markedCount} marked` : ''}`, width)}</Text>
        {candMode === 'detail' ? candDetail() : (
          <Box key="cand-list" flexDirection="column" width={width} height={candRoom}>
            {candWindow.moreAbove > 0 && candMore('up', candHidden(0, candWindow.start))}
            {candItems.slice(candWindow.start, candWindow.end).map(item => item.node())}
            {candItems.length === 0 && <Text dimColor>{truncateEnd(candFailure !== null ? `linear: ${candFailure}` : 'no candidates', width)}</Text>}
            {candWindow.moreBelow > 0 && candMore('down', candHidden(candWindow.end, candItems.length))}
          </Box>
        )}
        <Box flexGrow={1} />
        {candFooter}
        {narrowNotice !== null && <Text dimColor>{truncateEnd(narrowNotice, width)}</Text>}
        {error !== null && <Text dimColor>{truncateEnd(error, width)}</Text>}
      </Box>
    ) : (
      <Box flexDirection="column" width={width} height={height}>
        {back}
        {quitRow}
        {closeAskView(width)}
        {freeBlock(width, narrowSelected, ringListRow)}
        {freeRows.length > 0 && <Text key="tickets-heading" dimColor>TICKETS</Text>}
        {fitted.shown.map(line => line.kind === 'head'
          ? (line.story ? <Text key={line.key} bold color={colours.accent}>{truncateEnd(line.text, width)}</Text> : <Text key={line.key} dimColor>{truncateEnd(line.text, width)}</Text>)
          : line.kind === 'gap' ? <Text key={line.key}> </Text> : ticketLine(line.ticket, line.indent))}
        {fitted.hidden > 0 && <Text dimColor>{`    +${fitted.hidden} more`}</Text>}
        {addTicket}
        {view.hubs.length > 0 && <Text dimColor>other sessions</Text>}
        {view.hubs.map(hubLine)}
        <Box flexGrow={1} />
        {narrowNotice !== null && <Text dimColor>{truncateEnd(narrowNotice, width)}</Text>}
        {error !== null && <Text dimColor>{truncateEnd(error, width)}</Text>}
      </Box>
    )
    if (!wide) return keptButtons(list)

    const row = detailRow(view.rows, await read($, focusedTicket), centre)
    if (row === null) return keptButtons(list)
    const detailWidth = bodyColumns - LIST_COLUMNS - 2
    const twoColumns = detailWidth >= DETAIL_TWO_COLUMNS_FROM
    const mainWidth = twoColumns ? detailWidth - SIDE_COLUMNS - 2 : detailWidth
    const mainInner = mainWidth - 4
    const sideInner = (twoColumns ? SIDE_COLUMNS : detailWidth) - 4
    const local = view.local[row.key]
    const remote = remotes[row.key]
    const pullRequest = remote?.pullRequest
    const step = rowStep(row, pullRequest, [], config().workflow)
    const progress = phaseProgress(step)
    const needsYou = step.group === 'needs you'
    const nextText = step.next ?? row.next
    const issue = (await read($, linearIssues)).find(one => one.id.toUpperCase() === row.key.toUpperCase())

    // The deck's vocabulary: a round border, one column of padding, the title bold on the first row.
    const panel = (title: string, body: RenderChildren, borderColor: string = colours.panel) => (
      <Box key={`panel:${title}`} flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1}>
        <Text bold>{title}</Text>
        {body}
      </Box>
    )

    const stepText = PHASE_STEPS.map((step, index) => (index === 0 ? '' : ' ── ') + (index === progress.current || index < progress.done ? '✓ ' : '') + step).join('')
    const phasePanel = panel(
      'phase',
      <Box key="phase-body" flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap">
          {PHASE_STEPS.map((step, index) => {
            // The space before a separator ends the previous step, so a wrapped line starts with `──`, not a blank.
            const separator = index === 0 ? '' : '── '
            const after = index === PHASE_STEPS.length - 1 ? '' : ' '
            if (index < progress.done && index !== progress.current) {
              return <Text key={step} color={colours.done}>{`${separator}✓ ${step}${after}`}</Text>
            }
            if (index === progress.current) return <Text key={step} bold>{`${separator}▸ ${step}${after}`}</Text>
            return <Text key={step} dimColor>{`${separator}${step}${after}`}</Text>
          })}
        </Box>
        <Box flexDirection="row">
          {barSegments(mainInner, PHASE_STEPS.length).map((size, index) => {
            const gap = index === 0 ? '' : ' '
            if (index === progress.current) return <Text key={`bar:${index}`} color={colours.working}>{gap + '━'.repeat(size)}</Text>
            if (index < progress.done) return <Text key={`bar:${index}`} color={colours.done}>{gap + '━'.repeat(size)}</Text>
            return <Text key={`bar:${index}`} dimColor>{gap + '─'.repeat(size)}</Text>
          })}
        </Box>
      </Box>,
    )
    const nextPanel = panel(
      'next',
      nextText !== null ? <Text bold>{nextText}</Text> : <Text dimColor>nothing recorded</Text>,
      needsYou ? colours.needsYou : colours.panel,
    )
    const sessionsBody =
      local === undefined || local.sessions.length === 0 ? (
        <Text dimColor>none</Text>
      ) : (
        <Box flexDirection="column">
          {local.sessions.map((session, index) => (
            <Box key={`session:${index}`} flexDirection="row">
              <Text>{`${session.role}  `}</Text>
              {session.waiting === true
                ? <Text color={colours.needsYou}>{'◆ waiting'}</Text>
                : <Text color={session.state === 'working' ? colours.working : undefined} dimColor={session.state !== 'working'}>{session.state}</Text>}
              <Text dimColor>{`  ${formatAge(now - session.since)}`}</Text>
            </Box>
          ))}
        </Box>
      )
    const worktreeBody = (
      <Box flexDirection="column">
        <Text>{truncateStart(row.path, sideInner)}</Text>
        {remote === undefined ? (
          <Text dimColor>loading…</Text>
        ) : (
          remote.behind !== null && <Text dimColor>{`behind origin/${local?.base ?? config().project.baseBranch}: ${remote.behind}`}</Text>
        )}
      </Box>
    )
    const pullRequestBody = (
      <Box flexDirection="column">
        {pullRequest === undefined && <Text dimColor>loading…</Text>}
        {pullRequest?.kind === 'pr' && <Text>{`#${pullRequest.number} ${pullRequest.state}`}</Text>}
        {pullRequest?.kind === 'pr' && <Text dimColor>{`checks ${pullRequest.checks}`}</Text>}
        {pullRequest?.kind === 'none' && <Text dimColor>none yet</Text>}
        {pullRequest?.kind === 'unavailable' && <Text dimColor>gh not available</Text>}
        {pullRequest?.kind === 'error' && <Text dimColor>{truncateEnd(`gh: ${pullRequest.message}`, sideInner)}</Text>}
      </Box>
    )
    const sidePanels = [
      panel('sessions', sessionsBody),
      panel('worktree', worktreeBody),
      panel('pull request', pullRequestBody),
    ]
    // Rows the panels take, to give the plan what is left: a panel's border and title are three.
    const sideRows =
      3 + Math.max(1, local?.sessions.length ?? 0) +
      3 + 1 + (remote === undefined || remote.behind !== null ? 1 : 0) +
      3 + (pullRequest?.kind === 'pr' ? 2 : 1)
    const headerRows = 4
    const fixedRows = headerRows + 3 + wrappedRows(stepText, mainInner) + 1 + 3 + wrappedRows(nextText ?? 'nothing recorded', mainInner) + 3
    const planRows = Math.max(1, height - fixedRows - (twoColumns ? 0 : sideRows))
    const planPanel = panel(
      'plan',
      local?.plan ? <Markdown text={cutPlan(planExcerpt(local.plan), mainInner, planRows)} /> : <Text dimColor>no plan yet</Text>,
    )

    return keptButtons(
      <Box flexDirection="row">
        {list}
        <Box width={2} />
        <Box flexDirection="column" width={detailWidth}>
          <Box flexDirection="column" marginBottom={1}>
            <Text dimColor>{row.key}</Text>
            <Text bold>{truncateEnd(issue?.title || titleFromBranch(row.branch, row.key), detailWidth)}</Text>
            <Text dimColor>{truncateEnd(`${row.phase} · ${row.branch}`, detailWidth)}</Text>
          </Box>
          {twoColumns ? (
            <Box flexDirection="row">
              <Box flexDirection="column" width={mainWidth} height={height - headerRows}>
                {phasePanel}
                {nextPanel}
                {planPanel}
              </Box>
              <Box width={2} />
              <Box flexDirection="column" width={SIDE_COLUMNS}>
                {sidePanels}
              </Box>
            </Box>
          ) : (
            <Box flexDirection="column">
              {phasePanel}
              {nextPanel}
              {planPanel}
              {sidePanels}
            </Box>
          )}
        </Box>
      </Box>
    )
  })

  // ── The dressed conversation (decision 031): ticket, hub and review sessions; the rail keeps the engine's.
  // Every compact row passes while `isExpanded` (ctrl+o), so the full rows still show there.

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    await ensureSessionConfig($)
    if (e.props.isExpanded || !(await dressed($))) return next(e)
    colours = await sessionTheme($, options.theme)
    const { Box, Text } = $.ui.resolve(e)
    if (e.props.origin.kind === 'task-notification') return <Text dimColor wrap="truncate">{notificationLine(e.props.task, e.props.text)}</Text>
    if (e.props.from !== undefined) return <Text dimColor wrap="truncate">{peerLine(e.props.from.name, e.props.text)}</Text>
    if (e.props.origin.kind !== 'composer') return next(e)
    return (
      <Box flexDirection="column" marginTop={1}>
        {e.props.text.split('\n').map((line, index) => (
          <Box key={`line:${index}`}>
            <Text color={colours.accent}>{'▎ '}</Text>
            <Text bold>{line}</Text>
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    await ensureSessionConfig($)
    if (!(await dressed($))) return next(e)
    colours = await sessionTheme($, options.theme)
    const { Box, Text, Markdown } = $.ui.resolve(e)
    if (e.props.isSummary) return <Text dimColor>{`※ ${e.props.text}`}</Text>
    const model = (await read($, deckState)).main.model
    const colour = !e.props.isFirstOfReply ? colours.panel : model !== null && model !== '' ? modelColour(model, colours) : colours.accent
    return (
      <Box>
        <Text color={colour}>{'▎ '}</Text>
        <Box flexDirection="column" flexGrow={1}>
          {replyBlocks(e.props.text).map((block, index) => {
            const key = `block:${index}`
            if (block.kind === 'markdown') return <Markdown key={key} text={block.text} />
            if (block.kind === 'tasks') return (
              <Box key={key} flexDirection="column">
                {block.items.map((item, k) => <Text key={`task:${k}`} dimColor={item.done}>{taskLine(item)}</Text>)}
              </Box>
            )
            if (block.kind === 'diagram') return (
              <Box key={key} flexDirection="column">
                {block.lines.map((line, k) => <Text key={`art:${k}`} wrap="truncate">{line}</Text>)}
              </Box>
            )
            const tint = alertColour(block.alert)
            return (
              <Box key={key} flexDirection="column" borderStyle="round" borderColor={tint} paddingX={1}>
                <Text color={tint} bold>{block.label}</Text>
                {block.text.trim() !== '' && <Markdown text={block.text} />}
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })

  /** Decision 038: each GitHub alert in the theme's colours. */
  const alertColour = (kind: AlertKind): string => ({ note: colours.accent, tip: colours.done, important: colours.models.opus, warning: colours.needsYou, caution: colours.error })[kind]

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    await ensureSessionConfig($)
    if (!(await dressed($))) return next(e)
    colours = await sessionTheme($, options.theme)
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const input = (e.props.input ?? {}) as Record<string, unknown>
    // A static glyph while running: a Client per row to animate it costs more than it gives.
    const mark = e.props.isRunning ? '◐' : '·'
    // Decision 038: a finished row ends with its duration; a running one with the live clock of its in-flight entry.
    const id = e.props.tool_use_id
    const ranMs = !e.props.isRunning ? callDurations.get(id) : undefined
    // A refused call never ran: no `0.0s` on its row.
    const doneMs = ranMs !== undefined && (!e.props.isErrored || ranMs >= 100) ? ranMs : undefined
    const { now, flight } = await runningSince($, e.props.isRunning ? id : undefined)
    const timing = (key: string) =>
      doneMs !== undefined ? <Text key={key} dimColor>{` · ${durationText(doneMs)}`}</Text>
      : flight !== undefined ? <Box key={key}><Text dimColor>{' · '}</Text>{'Client' in els ? <els.Client key={`${key}:clock`} module="./clock.tsx" props={{ since: flight.since, now, short: true }} /> : <Text dimColor>{durationText(now - flight.since)}</Text>}</Box>
      : null
    const agent = agentCall(e.props.tool, input)
    if (agent !== null && !e.props.isErrored) {
      const model = agent.model ?? routingProfile().roles.find(role => role.name === agent.agent)?.model ?? (await read($, deckState)).main.model
      return <Box><Text color={modelColour(model, colours)} wrap="truncate">{`${mark} → ${agent.agent}${agent.task !== '' ? ` · ${agent.task}` : ''}`}</Text>{timing('time')}</Box>
    }
    const shown = shownInput(input, await $.session.cwd().catch(() => null), (await $.env.get('HOME')) ?? null)
    const line = `${mark} ${toolLine(e.props.tool, shown)}`
    if (e.props.isErrored) return <Box><Text color={colours.error} wrap="truncate">{`${line} ✗`}</Text>{timing('time')}</Box>
    // Decision 038: an edit card, `· Edit src/a.ts  +12 −3` (Write: `+N lines`), the numbers green and red.
    const counts = editCounts(e.props.tool, input)
    const card = counts === null ? null
      : 'lines' in counts ? <Text color={colours.done}>{`  +${counts.lines} ${counts.lines === 1 ? 'line' : 'lines'}`}</Text>
      : <Box><Text color={colours.done}>{`  +${counts.added}`}</Text><Text color={colours.error}>{` −${counts.removed}`}</Text></Box>
    return <Box><Text dimColor wrap="truncate">{line}</Text>{card}{timing('time')}</Box>
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    await ensureSessionConfig($)
    if (e.props.isExpanded || !(await dressed($))) return next(e)
    const { Text } = $.ui.resolve(e)
    // A group of one call reads as the call itself: `· Bash wc -l NOTES.md`.
    const only = e.props.calls.length === 1 ? e.props.calls[0]! : null
    const what = only !== null ? toolLine(only.tool, shownInput((only.input ?? {}) as Record<string, unknown>, await $.session.cwd().catch(() => null), (await $.env.get('HOME')) ?? null)) : groupLine(e.props.calls)
    // Decision 038: a finished group ends with its calls' summed time.
    const ms = e.props.isActive ? null : groupDuration(e.props.calls, callDurations)
    const row = <Text dimColor wrap="truncate">{`${e.props.isActive ? '◐' : '·'} ${what}${ms !== null ? ` · ${durationText(ms)}` : ''}`}</Text>
    // While active: the live clock of its first running call.
    const { now, flight } = await runningSince($, e.props.isActive ? e.props.calls.find(call => call.isRunning)?.tool_use_id : undefined)
    if (flight === undefined) return row
    const els = $.ui.resolve(e)
    const { Box } = els
    return <Box>{row}<Text dimColor>{' · '}</Text>{'Client' in els ? <els.Client key="group:clock" module="./clock.tsx" props={{ since: flight.since, now, short: true }} /> : <Text dimColor>{durationText(now - flight.since)}</Text>}</Box>
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    await ensureSessionConfig($)
    if (!(await dressed($))) return next(e)
    colours = await sessionTheme($, options.theme)
    const { Box, Text } = $.ui.resolve(e)
    if (!e.props.isErrored) return <Box height={0} />
    return <Text color={colours.error} wrap="truncate">{`  ✗ ${outputFirstLine(e.props.output) || 'error'}`}</Text>
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    await ensureSessionConfig($)
    if (!(await dressed($))) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{turnLine(e.props.word, e.props.durationMs)}</Text>
  })

  // The rail session shows only the mod: no hint line under its prompt.
  // The rail's prompt box is tower's command line (decision 026): its hint says so while it has the keys.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    await ensureSessionConfig($)
    if (!(await isRail($))) return next(e)
    const listHasKeys = (await $.ui.panes()).some(open => open.id === PANE && open.isFocused)
    return next({ ...e, props: { ...e.props, hint: listHasKeys ? '' : RAIL_PROMPT_HINT } })
  })

  // Every move of the pane's focus ring (the person's arrows, Tab, a click): always let it land.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    await ensureSessionConfig($)
    // The list switches only on a press of a tab, never as the ring passes over one.
    ringElement = e.element ?? null
    if (/^(row|cand|hub):/.test(ringElement ?? '')) markedElement = ringElement
    // The ring moves only once next(e) runs: the ▶ row's highlight starts with it, and everything else waits until
    // the ring has landed, so the highlight and the ring move together (each awaited update before redrew the rows alone).
    const key = e.element?.startsWith('row:') ? e.element.slice('row:'.length) : e.element?.startsWith('cand:') ? e.element.slice('cand:'.length) : null
    const highlight = Promise.all([update($, boardFocus, () => e.element ?? null), key !== null ? followFocus($, key) : null])
    const result = await next(e)
    await highlight
    // Any key but `y` after `q` leaves tower open.
    if (e.element !== 'quit' && e.element !== 'quit:yes') await dropQuit($)
    // Decision 068: the ring moving off the close Buttons leaves a close question. Decision 070: only the person's move;
    // Tower's own (the keys check putting the ring back on the ▶ row) never takes a question away.
    if (e.origin.kind === 'person' && !(e.element ?? '').startsWith('close:')) await dropClose($)
    if (ringElement === 'more:up' || ringElement === 'more:down') await moveWindow($, ringElement === 'more:up' ? 'up' : 'down')
    const homeMore = /^more:(.+):(up|down)$/.exec(ringElement ?? '')
    if (homeMore !== null && (HOME_COLUMNS as readonly string[]).includes(homeMore[1] ?? '')) await moveHomeWindow($, homeMore[1] as HomeColumn, homeMore[2] as 'up' | 'down')
    if (homeMore !== null && (homeMore[1] === 'repo' || homeMore[1] === 'repo-top')) await moveRepoWindow($, homeMore[1] === 'repo' ? 'bottom' : 'top', homeMore[2] as 'up' | 'down')
    if (homeMore !== null && homeMore[1] === 'cands') await moveCandidateWindow($, homeMore[2] as 'up' | 'down')
    return result
  })

  // An tower command from another session never reaches the model: consumed, and run only when this
  // session knows it. Any other text passes untouched; an error lets only such text through.
  on('session.receive', async ($, e, next) => {
    await ensureSessionConfig($)
    const command = decodeCommand(e.text)
    // Decision 066: a plain session is no Tower's: what it receives passes untouched.
    if (command === null || !(await towerOn($))) return next(e)
    const role = (await sessionRole($)) ?? ''
    // Decision 036: the board's aside; answered off the main conversation, not awaited here.
    if (command.command === ASIDE_COMMAND) {
      if (role === 'ticket' && command.args !== undefined) void answerBoardAside($, command.args).catch(() => {})
      return { consumed: 'tower' }
    }
    // Decision 046: the review session's turn ended: read its status and the PR now.
    if (command.command === REVIEW_CHECK_COMMAND) {
      if (role === 'ticket') void refreshReview($, true).catch(() => {})
      return { consumed: 'tower' }
    }
    // A review session takes only the next round from its ticket's REVIEW box (decision 025).
    if (isWorkRole(role) || (role === 'review' && command.command === config().review.skill)) await runReceived($, command.command, command.args)
    return { consumed: 'tower' }
  }).catch(($, e, next) => (decodeCommand(e.text) !== null ? { consumed: 'tower' } : next(e)))
}
