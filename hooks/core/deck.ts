// The deck of a ticket session: its main loop and its subagents, one pure function per observed event.

import type { TowerAgent, TowerDeck, TowerGate, TowerLimits, TowerLimitWindow, TowerLogEntry, TowerRouting, TowerSpan, TowerStep, TowerVerdict, TowerWaiting } from '../../types/index'
import { gaugeCells } from './deckView'
import { initialRouting, routeRecorded } from './routing'
import { modelFamily } from './theme'

export const MAX_AGENTS = 30
const TASK_CHARS = 200
const COMMAND_CHARS = 60
const OUTPUT_CHARS = 300

export function initialDeck(): TowerDeck {
  return {
    main: {
      model: null, effort: null, state: 'idle', requests: 0, turnStartedAt: null,
      lastAction: null, steps: [], stepsCreated: 0, lastTurn: null,
      workStartedAt: null, turnEndedAt: null, nextTurnByPerson: false, spans: [],
    },
    usage: { contextPercent: null, cost: null, limits: { fiveHour: null, sevenDay: null, spend: null } },
    agents: [],
    routing: initialRouting(),
    tokens: {},
    log: [],
    gate: { allowed: 0, asked: 0, denied: 0, recent: [] },
    period: { edits: 0, errors: 0, costAtStart: null },
  }
}

function withAgent(deck: TowerDeck, id: string, change: (agent: TowerAgent) => TowerAgent): TowerDeck {
  if (!deck.agents.some(agent => agent.id === id)) return deck
  return { ...deck, agents: deck.agents.map(agent => (agent.id === id ? change(agent) : agent)) }
}

// ── Main loop ─────────────────────────────────────────────────────────────

/** A prompt is about to start a turn: the person's own (typed, or through the bridge) starts a new work period. */
export function promptSubmitted(deck: TowerDeck, byPerson: boolean): TowerDeck {
  return { ...deck, main: { ...deck.main, nextTurnByPerson: byPerson } }
}

/** A turn the person started opens a work period; the follow-ups (task notifications, continuations) extend it. */
export function turnStarted(deck: TowerDeck, now: number): TowerDeck {
  // `?? null`: a deck kept from before a hot reload may lack the field.
  const opens = deck.main.nextTurnByPerson || (deck.main.workStartedAt ?? null) === null
  return {
    ...deck,
    main: {
      ...deck.main, state: 'working', turnStartedAt: now, nextTurnByPerson: false,
      workStartedAt: opens ? now : deck.main.workStartedAt,
    },
    period: opens ? { edits: 0, errors: 0, costAtStart: deck.usage.cost } : deck.period,
  }
}

/**
 * A main turn ends the main loop's work and leaves its receipt (`durationMs` from turn.complete);
 * a subagent's ends that agent (as SubagentStop does).
 */
export function turnCompleted(deck: TowerDeck, agentId: string | undefined, now: number, durationMs?: number): TowerDeck {
  if (agentId !== undefined) return agentEnded(deck, agentId, null, now)
  const started = deck.main.turnStartedAt
  const lastTurn = {
    durationMs: durationMs ?? (started !== null ? now - started : 0),
    agents: started === null ? 0 : deck.agents.filter(agent => agent.startedAt >= started).length,
  }
  return { ...deck, main: { ...deck.main, state: 'idle', lastTurn, turnEndedAt: now, spans: spansClosed(deck.main.spans ?? [], now) } }
}

/**
 * The receipt of the work since the person's last own prompt: from the period's start to the end of its
 * last turn or last agent, whichever is later, and the agents started in it. Null before any work.
 */
export function workReceipt(
  deck: TowerDeck,
): { durationMs: number; agents: number; edits: number; errors: number; cost: number | null } | null {
  const started = deck.main.workStartedAt ?? null
  if (started === null) return null
  const agents = deck.agents.filter(agent => agent.startedAt >= started)
  const ends = [started, deck.main.turnEndedAt ?? started, ...agents.map(agent => agent.endedAt ?? started)]
  const period = deck.period ?? { edits: 0, errors: 0, costAtStart: null }
  const cost = deck.usage.cost !== null && period.costAtStart !== null ? Math.max(0, deck.usage.cost - period.costAtStart) : null
  return { durationMs: Math.max(...ends) - started, agents: agents.length, edits: period.edits, errors: period.errors, cost }
}

export type StepTokens = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | null | undefined

/** Decision 034: the main loop's last request (its time and the cache it read or wrote) and every count so far, main and agents. */
function cacheSeen(deck: TowerDeck, usage: StepTokens, main: boolean, now: number | undefined): TowerDeck['cache'] {
  const cached = (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0)
  const all = cached + (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0)
  const before = deck.cache
  const sessionTokens = (before?.sessionTokens ?? 0) + all
  if (main && now !== undefined) return { lastRequestAt: now, cachedTokens: cached, sessionTokens }
  return before === undefined ? undefined : { ...before, sessionTokens }
}

/** One model request: the main loop's counts it and names its model; a subagent's adds its tokens. */
export function stepCompleted(
  deck: TowerDeck,
  step: { agentId?: string; model: string; effort?: string | number },
  usage: StepTokens,
  now?: number,
): TowerDeck {
  const effort = step.effort === undefined ? null : String(step.effort)
  const stepTokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0)
  const tokens = tokensAdded(deck.tokens ?? {}, step.model, stepTokens)
  const spans = (current: TowerSpan[] | undefined) => (now === undefined ? current ?? [] : spanStepped(current ?? [], step.model, now))
  const cache = cacheSeen(deck, usage, step.agentId === undefined, now)
  if (step.agentId === undefined) {
    return { ...deck, tokens, ...(cache === undefined ? {} : { cache }), main: { ...deck.main, model: step.model, effort, requests: deck.main.requests + 1, spans: spans(deck.main.spans) } }
  }
  if (!deck.agents.some(agent => agent.id === step.agentId)) return deck
  return {
    ...withAgent(deck, step.agentId, agent => ({
      ...agent,
      model: step.model,
      effort: effort ?? agent.effort,
      tokens: {
        input: agent.tokens.input + (usage?.input_tokens ?? 0),
        output: agent.tokens.output + (usage?.output_tokens ?? 0),
      },
      spans: agent.status === 'running' ? spans(agent.spans) : agent.spans ?? [],
    })),
    tokens,
    ...(cache === undefined ? {} : { cache }),
  }
}

function tokensAdded(tokens: Record<string, number>, model: string, count: number): Record<string, number> {
  if (count <= 0) return tokens
  const family = modelFamily(model)
  return { ...tokens, [family]: (tokens[family] ?? 0) + count }
}

/** A step on `model` at `now`: extends the running span, or closes it and opens one when the model changed. */
export function spanStepped(spans: readonly TowerSpan[], model: string, now: number): TowerSpan[] {
  const last = spans[spans.length - 1]
  if (last !== undefined && last.to === null && last.model === model) return [...spans]
  return [...spansClosed(spans, now), { model, from: now, to: null }]
}

export function spansClosed(spans: readonly TowerSpan[], now: number): TowerSpan[] {
  return spans.map(span => (span.to === null ? { ...span, to: now } : span))
}

export type SessionUsageLike = {
  context?: { percent?: number }
  rateLimits?: readonly { kind?: string; percentUsed: number; resetsAt?: string }[]
  cost?: { usd: number }
}

/** An ISO 8601 reset time as epoch ms; null when absent or unreadable. */
function resetTime(iso: string | undefined): number | null {
  const at = iso === undefined ? NaN : Date.parse(iso)
  return Number.isFinite(at) ? at : null
}

/** `resets in 2d 4h`, `resets in 1h 04m`, `resets in 12m`; `resets soon` under a minute or past the time. */
export function formatReset(now: number, resetsAt: number): string {
  const minutes = Math.floor((resetsAt - now) / 60_000)
  if (minutes < 1) return 'resets soon'
  const hours = Math.floor(minutes / 60)
  if (hours >= 24) return `resets in ${Math.floor(hours / 24)}d ${hours % 24}h`
  return hours === 0 ? `resets in ${minutes}m` : `resets in ${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** Every reading replaces all windows: one it no longer reports is null, not the old figure. */
export function usageRead(deck: TowerDeck, usage: SessionUsageLike): TowerDeck {
  const reported = usage.rateLimits ?? []
  const window = (kind: string): TowerLimitWindow | null => {
    const found = reported.find(limit => limit.kind === kind)
    return found === undefined ? null : { percent: found.percentUsed, resetsAt: resetTime(found.resetsAt) }
  }
  return {
    ...deck,
    usage: {
      contextPercent: usage.context?.percent ?? null,
      cost: usage.cost?.usd ?? null,
      limits: { fiveHour: window('five_hour'), sevenDay: window('seven_day'), spend: window('spend_limit') },
    },
  }
}

/** A window as it stands now: once its reset time has passed it has reset (0%, reset time unknown). */
export function windowNow(window: TowerLimitWindow | null, now: number): TowerLimitWindow | null {
  if (window === null) return null
  return window.resetsAt !== null && window.resetsAt < now ? { percent: 0, resetsAt: null } : window
}

export const LIMIT_CELLS = 5

export type UsageLinePart = { label: '5h' | '7d'; percent: number; cells: number; reset: string | null }

/** `5h ▰▱▱▱▱ 12% · resets in 3h 04m`. */
export function usagePartText(part: UsageLinePart): string {
  const reset = part.reset === null ? '' : ` · ${part.reset}`
  return `${part.label} ${'▰'.repeat(part.cells)}${'▱'.repeat(LIMIT_CELLS - part.cells)} ${Math.round(part.percent)}%${reset}`
}

/**
 * The main card's cost and rate-limit line: `$1.84   5h ▰▱▱▱▱ 12% · resets in 3h 04m   7d ▰▰▰▱▱ 76% · resets in 2d 4h`.
 * The 7-day part only when known and when the whole line fits `width`.
 */
export function usageLine(cost: number | null, limits: TowerLimits | undefined, now: number, width: number): { cost: string | null; parts: UsageLinePart[]; text: string } {
  const costText = cost === null ? null : `$${cost.toFixed(2)}`
  const part = (label: UsageLinePart['label'], window: TowerLimitWindow | null | undefined): UsageLinePart[] => {
    const current = windowNow(window ?? null, now)
    if (current === null) return []
    return [{ label, percent: current.percent, cells: gaugeCells(current.percent, LIMIT_CELLS), reset: current.resetsAt === null ? null : formatReset(now, current.resetsAt) }]
  }
  const text = (parts: UsageLinePart[]) => [...(costText === null ? [] : [costText]), ...parts.map(usagePartText)].join('   ')
  const fiveHour = part('5h', limits?.fiveHour)
  const both = [...fiveHour, ...part('7d', limits?.sevenDay)]
  const parts = text(both).length <= width ? both : fiveHour
  return { cost: costText, parts, text: text(parts) }
}

// ── Agents ────────────────────────────────────────────────────────────────

/** The last segment of the type (`tower:executor` → `executor`), numbered when already taken. */
export function agentName(type: string, taken: readonly string[]): string {
  const base = type.split(':').pop() || type
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export type Spawn = {
  agentId: string
  model: string
  subagentType: string
  description?: string
  prompt?: string
}

export function agentSpawned(deck: TowerDeck, spawn: Spawn, now: number): TowerDeck {
  if (deck.agents.some(agent => agent.id === spawn.agentId)) return deck
  const agent: TowerAgent = {
    id: spawn.agentId,
    name: agentName(spawn.subagentType, deck.agents.map(a => a.name)),
    type: spawn.subagentType,
    model: spawn.model,
    effort: null,
    status: 'running',
    task: spawn.description?.trim() || (spawn.prompt ?? '').slice(0, TASK_CHARS),
    startedAt: now,
    endedAt: null,
    actions: 0,
    lastAction: null,
    recent: [],
    steps: [],
    stepsCreated: 0,
    tokens: { input: 0, output: 0 },
    lastOutput: null,
    spans: spawn.model ? [{ model: spawn.model, from: now, to: null }] : [],
  }
  return { ...deck, agents: [...deck.agents, agent].slice(-MAX_AGENTS) }
}

/** SubagentStop or the agent's turn.complete, whichever comes first; the second keeps the first's end. Its announced steps are all done. */
export function agentEnded(deck: TowerDeck, agentId: string, lastOutput: string | null, now: number): TowerDeck {
  return withAgent(deck, agentId, agent => ({
    ...agent,
    steps: hasMarkerSteps(agent.steps) ? agent.steps.map(step => ({ ...step, status: 'done' as const })) : agent.steps,
    status: agent.status === 'running' ? 'done' : agent.status,
    endedAt: agent.endedAt ?? now,
    spans: spansClosed(agent.spans ?? [], agent.endedAt ?? now),
    lastOutput: lastOutput !== null ? lastOutput.trim().slice(0, OUTPUT_CHARS) : agent.lastOutput,
  }))
}

type ToolInput = Record<string, unknown>

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** A path inside `cwd` relative to it, one under `home` with `~`, any other as it is. */
export function shownPath(path: string, cwd: string | null, home: string | null): string {
  if (cwd !== null && cwd !== '' && path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1)
  if (home !== null && home !== '' && (path === home || path.startsWith(`${home}/`))) return `~${path.slice(home.length)}`
  return path
}

/** The tool input as the log shows it: `file_path` and `path` through shownPath. */
export function shownInput(input: ToolInput, cwd: string | null, home: string | null): ToolInput {
  const shown: Record<string, unknown> = { ...input }
  for (const key of ['file_path', 'path']) {
    const value = text(input[key])
    if (value !== null) shown[key] = shownPath(value, cwd, home)
  }
  return shown as ToolInput
}

/** The tool and its most telling argument (`Edit src/a.ts`, `Bash npm test`); never the whole input. */
export function actionLine(tool: string, input: ToolInput): string {
  const path = text(input.file_path) ?? text(input.path)
  if (path !== null && (tool === 'Read' || tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit')) return `${tool} ${path}`
  const command = text(input.command)
  if (tool === 'Bash' && command !== null) return `Bash ${command.split('\n')[0]!.slice(0, COMMAND_CHARS)}`
  return tool
}

const TASK_STATUS: Record<string, TowerStep['status']> = { pending: 'todo', in_progress: 'doing', completed: 'done' }
const RECENT = 6

/** What the main loop and an agent share: a last action and a step list. */
type Worker = { lastAction: string | null; steps: TowerStep[]; stepsCreated: number }

/** A TaskUpdate's new status (or deletion) applied to the steps. */
function updatedSteps(steps: TowerStep[], tool: string, input: ToolInput): TowerStep[] {
  if (tool !== 'TaskUpdate') return steps
  const id = text(input.taskId)
  const status = typeof input.status === 'string' ? input.status : null
  if (id === null || status === null) return steps
  if (status === 'deleted') return steps.filter(step => step.id !== id)
  const next = TASK_STATUS[status]
  if (next === undefined) return steps
  return steps.map(step => (step.id === id ? { ...step, status: next } : step))
}

function started<W extends Worker>(worker: W, tool: string, input: ToolInput): W {
  return { ...worker, lastAction: actionLine(tool, input), steps: updatedSteps(worker.steps, tool, input) }
}

/** TaskCreate adds its step, with the result's id or else its creation number. */
function finished<W extends Worker>(worker: W, tool: string, input: ToolInput, result: unknown): W {
  if (tool !== 'TaskCreate' || hasMarkerSteps(worker.steps)) return worker
  const created = worker.stepsCreated + 1
  const step: TowerStep = {
    id: createdTaskId(result) ?? String(created),
    text: text(input.subject) ?? text(input.description) ?? `step ${created}`,
    status: 'todo',
  }
  return { ...worker, stepsCreated: created, steps: [...worker.steps, step] }
}

/** Before the call runs: the main loop's (no agentId) or the agent's last action, one more action and recent line, a TaskUpdate's new status. */
export function toolStarted(deck: TowerDeck, agentId: string | undefined, tool: string, input: ToolInput): TowerDeck {
  if (agentId === undefined) return { ...deck, main: started(deck.main, tool, input) }
  return withAgent(deck, agentId, agent => {
    const line = actionLine(tool, input)
    return { ...started(agent, tool, input), actions: agent.actions + 1, recent: [...agent.recent, line].slice(-RECENT) }
  })
}

/** The id in TaskCreate's result (`{ result: { task: { id } } }`), or null when it is not there. */
export function createdTaskId(result: unknown): string | null {
  const record = result as { result?: { task?: { id?: unknown } } } | null | undefined
  const id = record?.result?.task?.id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

/** After the call: TaskCreate adds its step to the main loop (no agentId) or the agent. */
export function toolFinished(deck: TowerDeck, agentId: string | undefined, tool: string, input: ToolInput, result: unknown): TowerDeck {
  if (agentId === undefined) return { ...deck, main: finished(deck.main, tool, input, result) }
  return withAgent(deck, agentId, agent => finished(agent, tool, input, result))
}

// ── Step markers ──────────────────────────────────────────────────────────
// An agent announces each step in its own text, one line: `[step 2/5] what this step does`.

export type StepMarker = { index: number; total: number; text: string }

const MAX_MARKER_STEPS = 20
const MARKER = /^[ \t]*\[step (\d+)\/(\d+)\] ([^\n]*)$/gim
const MARKER_ID = 'marker:'

/** Every valid marker in a text, in order. */
export function stepMarkers(text: string): StepMarker[] {
  const markers: StepMarker[] = []
  for (const match of text.matchAll(MARKER)) {
    const index = Number(match[1])
    const total = Number(match[2])
    if (index < 1 || total < 1 || index > total || total > MAX_MARKER_STEPS) continue
    markers.push({ index, total, text: match[3]!.trim() })
  }
  return markers
}

function hasMarkerSteps(steps: readonly TowerStep[]): boolean {
  return steps.some(step => step.id.startsWith(MARKER_ID))
}

/** One marker on a step list: `total` entries, done before `index`, doing at it, todo after; known texts kept by position. */
export function markedSteps(steps: readonly TowerStep[], marker: StepMarker): TowerStep[] {
  const known = hasMarkerSteps(steps) ? steps : []
  return Array.from({ length: marker.total }, (_, i) => {
    const k = i + 1
    const text = k === marker.index && marker.text !== '' ? marker.text : known[i]?.text ?? `step ${k}`
    const status: TowerStep['status'] = k < marker.index ? 'done' : k === marker.index ? 'doing' : 'todo'
    return { id: `${MARKER_ID}${k}`, text, status }
  })
}

/** A response's markers applied, in order, to the main loop (no agentId) or the agent. */
export function markersRead(deck: TowerDeck, agentId: string | undefined, answer: string): TowerDeck {
  const markers = stepMarkers(answer)
  if (markers.length === 0) return deck
  // A TodoWrite list (decision 033) wins over markers: the loop keeps it.
  const apply = (steps: TowerStep[]) => (steps.some(step => step.id.startsWith('todo:')) ? steps : markers.reduce(markedSteps, steps))
  if (agentId === undefined) return { ...deck, main: { ...deck.main, steps: apply(deck.main.steps) } }
  return withAgent(deck, agentId, agent => ({ ...agent, steps: apply(agent.steps) }))
}

// ── Reading the deck ──────────────────────────────────────────────────────

export function stepProgress(agent: { steps: TowerStep[] }): { done: number; total: number; current: string | null } {
  const current = agent.steps.find(step => step.status === 'doing') ?? agent.steps.find(step => step.status === 'todo')
  return {
    done: agent.steps.filter(step => step.status === 'done').length,
    total: agent.steps.length,
    current: current?.text ?? null,
  }
}

/** The step under way, counted from 1: the one after those done, capped at the total once all are. */
export function stepUnderWay(done: number, total: number): number {
  return Math.min(done + 1, total)
}

export function runningAgents(deck: TowerDeck): number {
  return deck.agents.filter(agent => agent.status === 'running').length
}

/** The session works while its main loop does or any of its agents runs. */
export function deckBusy(deck: TowerDeck): boolean {
  return deck.main.state === 'working' || runningAgents(deck) > 0
}

// ── Routing ───────────────────────────────────────────────────────────────

export function routeDecided(deck: TowerDeck, decision: TowerRouting['decisions'][number]): TowerDeck {
  return { ...deck, routing: routeRecorded(deck.routing, decision) }
}

/** The running agent with steps to show on a rail row; with several, the one least far along. */
export function stepAgent(deck: TowerDeck): { name: string; done: number; total: number } | null {
  let best: { name: string; done: number; total: number; startedAt: number } | null = null
  for (const agent of deck.agents) {
    if (agent.status !== 'running') continue
    const { done, total } = stepProgress(agent)
    if (total === 0) continue
    if (best === null || agent.startedAt < best.startedAt) best = { name: agent.name, done, total, startedAt: agent.startedAt }
  }
  return best === null ? null : { name: best.name, done: best.done, total: best.total }
}

// ── Log, gate, work period ──────────────────────────────────────────────────

export const LOG_SIZE = 200
const PROMPT_CHARS = 40
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

export function logged(deck: TowerDeck, entry: TowerLogEntry): TowerDeck {
  return { ...deck, log: [...(deck.log ?? []), entry].slice(-LOG_SIZE) }
}

/** `main` for the main loop, else the agent's name (its id while unknown). */
export function logWho(deck: TowerDeck, agentId: string | undefined): string {
  if (agentId === undefined) return 'main'
  return deck.agents.find(agent => agent.id === agentId)?.name ?? agentId
}

export function promptLogged(deck: TowerDeck, prompt: string, now: number): TowerDeck {
  const line = prompt.replace(/\s+/g, ' ').trim()
  return logged(deck, { at: now, who: 'main', text: `prompt · ${line.slice(0, PROMPT_CHARS)}` })
}

export function toolLogged(deck: TowerDeck, agentId: string | undefined, tool: string, input: ToolInput, now: number): TowerDeck {
  return logged(deck, { at: now, who: logWho(deck, agentId), text: actionLine(tool, input) })
}

/** A deny or an error reply is an errored result; anything else answered. */
export function toolErrored(result: unknown): boolean {
  const record = result as { deny?: unknown; isError?: unknown } | null | undefined
  return typeof record?.deny === 'string' || record?.isError === true
}

/** Counts the call in the work period: a successful edit, or an error. */
export function toolCounted(deck: TowerDeck, tool: string, result: unknown): TowerDeck {
  const period = deck.period ?? { edits: 0, errors: 0, costAtStart: null }
  if (toolErrored(result)) return { ...deck, period: { ...period, errors: period.errors + 1 } }
  if (EDIT_TOOLS.has(tool)) return { ...deck, period: { ...period, edits: period.edits + 1 } }
  return deck
}

/** One permission verdict; an ask or a deny is also logged as `gate`, a plain allow too when `logAllows` (the advanced view). */
export function gateChecked(deck: TowerDeck, verdict: TowerVerdict, action: string, now: number, logAllows = false): TowerDeck {
  const gate: TowerGate = deck.gate ?? { allowed: 0, asked: 0, denied: 0, recent: [] }
  const counted = {
    ...gate,
    allowed: gate.allowed + (verdict === 'allow' ? 1 : 0),
    asked: gate.asked + (verdict === 'ask' ? 1 : 0),
    denied: gate.denied + (verdict === 'deny' ? 1 : 0),
    recent: [...gate.recent, verdict].slice(-LOG_SIZE),
  }
  const next = { ...deck, gate: counted }
  if (verdict === 'allow') return logAllows ? logged(next, { at: now, who: 'gate', text: `allowed ${action}` }) : next
  return logged(next, { at: now, who: 'gate', text: `${verdict === 'ask' ? 'asked' : 'denied'} ${action}` })
}

/**
 * Decision 037: a safety rule refused a call (`blocked`) or put a risky command to the person (`asked`). Counted on the
 * gate's own line and in its verdict cells (a block as a deny, an ask as an ask), and logged as `safety` in place of `gate`.
 * Decision 082: a squash or rebase merge run as `--merge` (`rewrote`) is logged only; its ask is counted as an ask.
 */
export function safetyNoted(deck: TowerDeck, kind: 'blocked' | 'asked' | 'rewrote', text: string, now: number): TowerDeck {
  if (kind === 'rewrote') return logged(deck, { at: now, who: 'safety', text: `${kind} ${text}` })
  const gate: TowerGate = deck.gate ?? { allowed: 0, asked: 0, denied: 0, recent: [] }
  const counted: TowerGate = kind === 'blocked'
    ? { ...gate, denied: gate.denied + 1, recent: [...gate.recent, 'deny' as const].slice(-LOG_SIZE), blocked: (gate.blocked ?? 0) + 1 }
    : { ...gate, asked: gate.asked + 1, recent: [...gate.recent, 'ask' as const].slice(-LOG_SIZE), riskyAsked: (gate.riskyAsked ?? 0) + 1 }
  return logged({ ...deck, gate: counted }, { at: now, who: 'safety', text: `${kind} ${text}` })
}

// ── Waiting on the person ─────────────────────────────────────────────────
// A permission dialog or an AskUserQuestion: nothing shows it outside the session, so the status file carries it.

const WAITING_CHARS = 60

function cutText(value: string): string {
  const chars = Array.from(value.replace(/\s+/g, ' ').trim())
  return chars.length <= WAITING_CHARS ? chars.join('') : chars.slice(0, WAITING_CHARS - 1).join('') + '…'
}

/** `Bash gh pr view 103`: the tool and its main argument cut to 60 characters. */
export function waitingText(tool: string, input: ToolInput): string {
  const line = actionLine(tool, input)
  return line === tool ? tool : `${tool} ${cutText(line.slice(tool.length + 1))}`
}

/**
 * A permission dialog is shown (`classic.PermissionRequest`): the loop waits on the person. A `tool.check` ask is no
 * wait, since in auto mode the classifier decides it without a dialog.
 */
export function waitingShown(deck: TowerDeck, tool: string, input: ToolInput, agentId: string | undefined, now: number): TowerDeck {
  return { ...deck, waiting: { kind: 'permission', text: waitingText(tool, input), since: now, ...(agentId !== undefined ? { agentId } : {}) } }
}

/**
 * A tool call starts. AskUserQuestion waits on the person with its first question. Any other call of the same loop
 * means its dialog was answered: its permission wait ends; a question, or another loop's wait, stays.
 */
export function waitingAsked(deck: TowerDeck, tool: string, input: ToolInput, now: number, agentId?: string): TowerDeck {
  if (tool !== 'AskUserQuestion') return deck.waiting?.kind === 'permission' ? waitingDone(deck, agentId) : deck
  const questions = Array.isArray(input.questions) ? input.questions : []
  const first = questions[0] as { question?: unknown } | undefined
  const question = typeof first?.question === 'string' ? cutText(first.question) : 'question'
  const waiting: TowerWaiting = { kind: 'question', text: question || 'question', since: now, ...(agentId !== undefined ? { agentId } : {}) }
  return { ...deck, waiting }
}

/** One loop (an agent, or the main loop when undefined) moved on (its call returned or was denied, its next step began): its wait ends. */
export function waitingDone(deck: TowerDeck, agentId: string | undefined): TowerDeck {
  const waiting = deck.waiting ?? null
  return waiting === null || waiting.agentId !== agentId ? deck : { ...deck, waiting: null }
}

/** The turn is over: whatever it waited on is answered. */
export function waitingEnded(deck: TowerDeck): TowerDeck {
  return (deck.waiting ?? null) === null ? deck : { ...deck, waiting: null }
}
