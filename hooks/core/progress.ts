// Progress, stalls and loops (decision 033): steps from the task tools, the tool in flight, the quiet loop, the loop in circles.

import type { TowerAgent, TowerAlert, TowerCall, TowerDeck, TowerInFlight, TowerStep } from '../../types/index'
import { actionLine, agentName, MAX_AGENTS, spansClosed, toolErrored } from './deck'

/** A tool running longer than this turns its line amber. */
export const LONG_TOOL_MS = 30_000
/** A loop with no tool or step event for this long, and no tool in flight, is stalled. */
export const STALL_MS = 120_000
/** Past this many times its typical time, an agent's clock turns amber. */
export const OVER_TYPICAL = 1.5
const CALLS_KEPT = 8
const ARG_CHARS = 60

// ── Steps from TodoWrite ──────────────────────────────────────────────────

const TODO_STATUS: Record<string, TowerStep['status']> = { pending: 'todo', in_progress: 'doing', completed: 'done' }
export const TODO_ID = 'todo:'

/** TodoWrite's `todos` as steps (`todo:<n>`), the in_progress one `doing`; null when it is no list. */
export function stepsFromTodos(todos: unknown): TowerStep[] | null {
  if (!Array.isArray(todos)) return null
  const steps: TowerStep[] = []
  for (const todo of todos) {
    const one = todo as { content?: unknown; status?: unknown } | null
    const status = typeof one?.status === 'string' ? TODO_STATUS[one.status] : undefined
    const text = typeof one?.content === 'string' ? one.content.trim() : ''
    if (status === undefined || text === '') continue
    steps.push({ id: `${TODO_ID}${steps.length + 1}`, text, status })
  }
  return steps
}

/** The current step's text (the doing one, else the next todo); null when none. */
function currentStep(steps: readonly TowerStep[]): string | null {
  return (steps.find(step => step.status === 'doing') ?? steps.find(step => step.status === 'todo'))?.text ?? null
}

// ── Calls in flight and their history ─────────────────────────────────────

/** What a loop's tool and step events touch, on an agent or the main loop. */
type Tracked = { steps: TowerStep[]; inFlight?: TowerInFlight[]; lastEventAt?: number; calls?: TowerCall[]; stepSince?: number | null; stepText?: string | null }

/** The call's main argument: the command's first line, the path, the pattern, the url, the query; '' when none. */
export function mainArgument(tool: string, input: Record<string, unknown>): string {
  const line = actionLine(tool, input)
  if (line !== tool) return line.slice(tool.length + 1)
  for (const key of ['pattern', 'url', 'query', 'skill', 'description']) {
    const value = input[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim().split('\n')[0]!.slice(0, ARG_CHARS)
  }
  return ''
}

/** The current step's clock: it restarts when the current step changed, by any tool or marker. */
function clocked<W extends Tracked>(worker: W, now: number): W {
  const current = currentStep(worker.steps)
  if (current === (worker.stepText ?? null) && worker.stepSince !== undefined) return worker
  return { ...worker, stepText: current, stepSince: current === null ? null : now }
}

function changed(deck: TowerDeck, agentId: string | undefined, change: <W extends Tracked>(worker: W) => W): TowerDeck {
  if (agentId === undefined) return { ...deck, main: change(deck.main) }
  if (!deck.agents.some(agent => agent.id === agentId)) return deck
  return { ...deck, agents: deck.agents.map(agent => (agent.id === agentId ? change(agent) : agent)) }
}

/** A call starts: it is in flight from `now`; a TodoWrite's list becomes the steps. */
export function callStarted(deck: TowerDeck, agentId: string | undefined, id: string, tool: string, input: Record<string, unknown>, now: number): TowerDeck {
  return changed(deck, agentId, worker => {
    const todos = tool === 'TodoWrite' ? stepsFromTodos(input.todos) : null
    const next = { ...worker, lastEventAt: now, inFlight: [...(worker.inFlight ?? []), { id, line: actionLine(tool, input), since: now }] }
    return clocked(todos === null || todos.length === 0 ? next : { ...next, steps: todos }, now)
  })
}

/** A call ends: out of flight, into the history loop detection reads. */
export function callEnded(deck: TowerDeck, agentId: string | undefined, id: string, tool: string, input: Record<string, unknown>, result: unknown, now: number): TowerDeck {
  return changed(deck, agentId, worker => {
    const call: TowerCall = { tool, arg: mainArgument(tool, input), failed: callFailed(result), at: now }
    return { ...clocked(worker, now), lastEventAt: now, inFlight: (worker.inFlight ?? []).filter(one => one.id !== id), calls: [...(worker.calls ?? []), call].slice(-CALLS_KEPT) }
  })
}

/** A model request started or ended in the loop: an event, not a stall. */
export function stepSeen(deck: TowerDeck, agentId: string | undefined, now: number): TowerDeck {
  return changed(deck, agentId, worker => ({ ...worker, lastEventAt: now }))
}

/** After the deck moved the steps (TaskCreate, TaskUpdate, a marker): the current step's clock follows. */
export function stepClock(deck: TowerDeck, agentId: string | undefined, now: number): TowerDeck {
  return changed(deck, agentId, worker => clocked(worker, now))
}

/** A deny, an error result, or a non-zero exit code. */
export function callFailed(result: unknown): boolean {
  if (toolErrored(result)) return true
  const inner = (result as { result?: { exitCode?: unknown; code?: unknown } } | null | undefined)?.result
  const code = inner?.exitCode ?? inner?.code
  return typeof code === 'number' && code !== 0
}

/** The oldest call still in flight; null when none. */
export function oldestInFlight(worker: { inFlight?: TowerInFlight[] }): TowerInFlight | null {
  return worker.inFlight?.[0] ?? null
}

// ── Loops ─────────────────────────────────────────────────────────────────

export type Loop = { tool: string; arg: string; count: number; since: number }

/**
 * Going in circles (after receipt's idea): the last 3 or more calls are the same tool with the same main argument,
 * or the last call is a Bash command that failed and failed before in the window. Calls with no argument never count.
 */
export function loopDetect(calls: readonly TowerCall[]): Loop | null {
  const last = calls[calls.length - 1]
  if (last === undefined || last.arg === '') return null
  let run = 1
  while (run < calls.length && calls[calls.length - 1 - run]!.tool === last.tool && calls[calls.length - 1 - run]!.arg === last.arg) run++
  if (run >= 3) return { tool: last.tool, arg: last.arg, count: run, since: calls[calls.length - run]!.at }
  if (last.tool !== 'Bash' || !last.failed) return null
  const failures = calls.filter(call => call.tool === 'Bash' && call.failed && call.arg === last.arg)
  return failures.length >= 2 ? { tool: last.tool, arg: last.arg, count: failures.length, since: failures[0]!.at } : null
}

/** `going in circles · Bash pnpm test ×3`. */
export function loopText(loop: Loop): string {
  return `going in circles · ${loop.tool} ${loop.arg} ×${loop.count}`
}

// ── Stalls ────────────────────────────────────────────────────────────────

/** How long a working loop has been quiet once that counts as a stall (no tool in flight); null otherwise. */
export function stalledFor(worker: { lastEventAt?: number; inFlight?: TowerInFlight[] }, working: boolean, now: number): number | null {
  if (!working || worker.lastEventAt === undefined || (worker.inFlight ?? []).length > 0) return null
  const quiet = now - worker.lastEventAt
  return quiet >= STALL_MS ? quiet : null
}

/** `2m 40s`, `45s`. */
export function formatShort(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  if (minutes === 0) return `${seconds}s`
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** `~6:00`: an agent's typical time beside its clock. */
export function typicalText(ms: number): string {
  const seconds = Math.round(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `~${minutes}:${String(seconds % 60).padStart(2, '0')}` : `~${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/** A loop waiting on the person (a dialog, a question) is not stalled. */
export function waitsOn(deck: TowerDeck, agentId: string | undefined): boolean {
  const waiting = deck.waiting ?? null
  return waiting !== null && waiting.agentId === agentId
}

/** What the session tells the rail: the first stalled loop, else the first going in circles; null when none. */
export function deckAlert(deck: TowerDeck, now: number, modules: { stalls: boolean; loops: boolean }): TowerAlert | null {
  const workers: { who: string; worker: Tracked; working: boolean }[] = [
    { who: 'main', worker: deck.main, working: deck.main.state === 'working' && !waitsOn(deck, undefined) },
    ...deck.agents.filter(agent => agent.status === 'running').map(agent => ({ who: agent.name, worker: agent as Tracked, working: !waitsOn(deck, agent.id) })),
  ]
  if (modules.stalls) {
    for (const { who, worker, working } of workers) {
      if (stalledFor(worker, working, now) !== null) return { kind: 'stalled', text: `stalled · ${who}`, id: `stalled:${who}:${worker.lastEventAt}` }
    }
  }
  if (modules.loops) {
    for (const { who, worker } of workers) {
      const loop = loopDetect(worker.calls ?? [])
      if (loop !== null) return { kind: 'loop', text: `going in circles · ${who}`, id: `loop:${who}:${loop.since}` }
    }
  }
  return null
}

// ── Reconcile with $.agent.list() ─────────────────────────────────────────

export type AgentInfoLike = { id: string; type: string; description: string; status: string }

const ENDED: Record<string, 'done' | 'failed'> = { completed: 'done', failed: 'failed', killed: 'failed' }
const ALIVE = new Set(['running', 'pending', 'waiting'])

/** What the engine's list says the deck missed: agents it shows running that ended, agents still alive it never saw spawn, and finished agents running again (resumed). */
export function reconcileAgents(deck: TowerDeck, list: readonly AgentInfoLike[]): { ended: { id: string; status: 'done' | 'failed' }[]; missed: AgentInfoLike[]; resumed: string[] } {
  const ended: { id: string; status: 'done' | 'failed' }[] = []
  const missed: AgentInfoLike[] = []
  const resumed: string[] = []
  for (const info of list) {
    const known = deck.agents.find(agent => agent.id === info.id)
    const end = ENDED[info.status]
    if (known !== undefined) {
      if (known.status === 'running' && end !== undefined) ended.push({ id: info.id, status: end })
      else if (known.status !== 'running' && ALIVE.has(info.status)) resumed.push(info.id)
    } else if (end === undefined) {
      // An ended agent the deck never saw stays out: it may be one the deck already let go (MAX_AGENTS).
      missed.push(info)
    }
  }
  return { ended, missed, resumed }
}

/** An agent the engine reports failed or killed. */
export function agentFailed(deck: TowerDeck, agentId: string, now: number): TowerDeck {
  return {
    ...deck,
    agents: deck.agents.map(agent => (agent.id !== agentId || agent.status !== 'running' ? agent
      : { ...agent, status: 'failed' as const, endedAt: now, inFlight: [], spans: spansClosed(agent.spans ?? [], now) })),
  }
}

/** An agent SendMessage resumed: running again from now; its earlier runs stay in its spans. */
export function agentResumed(deck: TowerDeck, agentId: string, now: number): TowerDeck {
  return {
    ...deck,
    agents: deck.agents.map(agent => (agent.id !== agentId || agent.status === 'running' ? agent
      : { ...agent, status: 'running' as const, endedAt: null, startedAt: now, lastEventAt: now, inFlight: [] })),
  }
}

/** A running agent the deck never saw spawn: its type and task from the list, its start now. */
export function agentMissed(deck: TowerDeck, info: AgentInfoLike, now: number): TowerDeck {
  if (deck.agents.some(agent => agent.id === info.id)) return deck
  const agent: TowerAgent = {
    id: info.id, name: agentName(info.type || 'agent', deck.agents.map(one => one.name)), type: info.type || 'agent',
    model: null, effort: null, status: 'running', task: info.description, startedAt: now, endedAt: null,
    actions: 0, lastAction: null, recent: [], steps: [], stepsCreated: 0, tokens: { input: 0, output: 0 }, lastOutput: null, spans: [],
    lastEventAt: now,
  }
  return { ...deck, agents: [...deck.agents, agent].slice(-MAX_AGENTS) }
}
