// What the deck pane draws, reduced to numbers and strings: pips, gauges, durations and which cards fit.

import type { TowerAgent, TowerSpan } from '../../types/index'
import { truncateStart } from './detail'
import { truncateEnd } from './rail'
import { modelFamily, type ModelFamily } from './theme'

export const EFFORT_PIPS = 4
const PIPS: Record<string, number> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 4 }

/** How many of the four effort pips are lit, or null for an effort it does not know. */
export function effortPips(effort: string | null): number | null {
  return effort === null ? null : (PIPS[effort.toLowerCase()] ?? null)
}

/** How many of `cells` a percentage fills, 0 to `cells`. */
export function gaugeCells(percent: number, cells: number): number {
  return Math.min(cells, Math.max(0, Math.round((percent / 100) * cells)))
}

/** `41s`, `2m 05s`, `1h 02m`. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** A ticking clock's face: `m:ss`, or `h:mm:ss` past an hour. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const ss = String(seconds % 60).padStart(2, '0')
  if (minutes < 60) return `${minutes}:${ss}`
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${ss}`
}

/** A running agent's bar: by its steps, else by its estimate (capped at 0.95), else none. */
export function progressFraction(steps: { done: number; total: number }, elapsedMs: number, estimateMs: number | null): number | null {
  if (steps.total > 0) return Math.min(1, (steps.done + 0.5) / steps.total)
  if (estimateMs !== null && estimateMs > 0) return Math.min(0.95, elapsedMs / estimateMs)
  return null
}

/** Running agents first (oldest first), then the finished ones (most recent first). */
export function cardOrder(agents: readonly TowerAgent[]): TowerAgent[] {
  const running = agents.filter(agent => agent.status === 'running').sort((a, b) => a.startedAt - b.startedAt)
  const ended = agents.filter(agent => agent.status !== 'running').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  return [...running, ...ended]
}

/** A card's rows with its border: running 7, finished 5. */
export function cardRows(agent: TowerAgent): number {
  return (agent.status === 'running' ? 5 : 3) + 2
}

/** Which cards fit in `rows` (the block header included), in the given order; when cards are cut one row is kept for the `+n more` line. `extra`: rows each card adds (the advanced view). */
export function fitCards(ordered: readonly TowerAgent[], rows: number, extra = 0): { shown: TowerAgent[]; more: number } {
  const rowsOf = (agent: TowerAgent) => cardRows(agent) + extra
  const all = 1 + ordered.reduce((sum, agent) => sum + rowsOf(agent), 0)
  if (all <= rows) return { shown: [...ordered], more: 0 }

  let left = rows - 2
  const shown: TowerAgent[] = []
  for (const agent of ordered) {
    if (rowsOf(agent) > left) break
    left -= rowsOf(agent)
    shown.push(agent)
  }
  return { shown, more: ordered.length - shown.length }
}

/** A finished agent stays a card this long after its end, then folds into the summary row (decision 045). */
export const AGENT_FOLD_MS = 20_000
/** The running agents drawn at most; the rest read `+n running`. */
export const LIVE_AGENTS_MAX = 8

/** The folded finished agents: how many ended done, how many failed, and their summed run time. */
export type AgentFold = { done: number; failed: number; ms: number }

/** A finished agent folds AGENT_FOLD_MS after its end (at once without an end time). */
export function agentFolded(agent: TowerAgent, now: number): boolean {
  return agent.status !== 'running' && (agent.endedAt === null || now - agent.endedAt >= AGENT_FOLD_MS)
}

/**
 * The agents section: `cards` are the running agents (oldest first, at most LIVE_AGENTS_MAX; `moreRunning` the
 * rest), the finished ones still unfolded (most recent first), then, with the history open, the folded ones.
 * `fold` sums the folded ones, null when none folded; `foldOnly`: nothing runs or just ended and the history is
 * closed, so the section is the summary row alone.
 */
export function agentSections(agents: readonly TowerAgent[], now: number, history: boolean): {
  cards: TowerAgent[]; moreRunning: number; fold: AgentFold | null; foldOnly: boolean
} {
  const order = cardOrder(agents)
  const running = order.filter(agent => agent.status === 'running')
  const recent = order.filter(agent => agent.status !== 'running' && !agentFolded(agent, now))
  const folded = order.filter(agent => agentFolded(agent, now))
  const fold = folded.length === 0 ? null : {
    done: folded.filter(agent => agent.status === 'done').length,
    failed: folded.filter(agent => agent.status === 'failed').length,
    ms: folded.reduce((sum, agent) => sum + (agent.endedAt === null ? 0 : Math.max(0, agent.endedAt - agent.startedAt)), 0),
  }
  return {
    cards: [...running.slice(0, LIVE_AGENTS_MAX), ...recent, ...(history ? folded : [])],
    moreRunning: Math.max(0, running.length - LIVE_AGENTS_MAX),
    fold,
    foldOnly: fold !== null && !history && running.length === 0 && recent.length === 0,
  }
}

/**
 * The sessions timeline's rows (decision 045): its heading and the main lane, one lane per drawn agent (the agents
 * section's cards), `+n running`, the folded lanes' `✓ n done` row while the history is closed, and the review lane;
 * the advanced view adds a request row under main, under each agent lane and under the review lane.
 */
export function sessionRowsOf(sections: { cards: readonly unknown[]; moreRunning: number; fold: AgentFold | null }, history: boolean, advanced: boolean, reviewLane: boolean): number {
  const lanes = sections.cards.length
  return 2 + lanes + (sections.moreRunning > 0 ? 1 : 0) + (sections.fold !== null && !history ? 1 : 0)
    + (advanced ? 1 + lanes : 0) + (reviewLane ? (advanced ? 2 : 1) : 0)
}

/** How many finished agents are folded now: the deck redraws when it changes. */
export function foldedCount(agents: readonly TowerAgent[], now: number): number {
  return agents.filter(agent => agentFolded(agent, now)).length
}

/** An action line cut to `width`: a path argument keeps its end (`Read …/src/a.ts`), anything else its start. */
export function fitAction(line: string, width: number): string {
  const space = line.indexOf(' ')
  if (space < 0 || line[space + 1] !== '/' || line.length <= width) return truncateEnd(line, width)
  return `${line.slice(0, space + 1)}${truncateStart(line.slice(space + 1), Math.max(1, width - space - 1))}`
}

export type LaneCell = { model: string | null; head: boolean }

/**
 * A timeline of `cells` cells from `from` to `to`: each cell the model of the span covering its middle
 * (null outside every span); the last cell a running span reaches is its head.
 */
export function laneCells(spans: readonly TowerSpan[], from: number, to: number, cells: number): LaneCell[] {
  const width = Math.max(1, to - from) / Math.max(1, cells)
  const out: LaneCell[] = Array.from({ length: Math.max(0, cells) }, (_, i) => {
    const at = from + (i + 0.5) * width
    const span = spans.find(s => s.from <= at && at < (s.to ?? to))
    return { model: span?.model ?? null, head: false }
  })
  const last = spans[spans.length - 1]
  if (last !== undefined && last.to === null) {
    const end = out.map(cell => cell.model).lastIndexOf(last.model)
    const index = end >= 0 ? end : Math.min(out.length - 1, Math.max(0, Math.floor((last.from - from) / width)))
    if (out[index] !== undefined) out[index] = { model: last.model, head: true }
  }
  return out
}

/** The families a lane's spans used, each once, in the order they first appear. */
export function laneModels(spans: readonly TowerSpan[]): ModelFamily[] {
  return [...new Set(spans.map(span => modelFamily(span.model)))]
}

/** A lane's model label parts: `fable` alone, or two-letter names joined by `→` (`fa→op`). */
export function laneLabel(families: readonly ModelFamily[]): { family: ModelFamily; text: string }[] {
  if (families.length <= 1) return families.map(family => ({ family, text: family }))
  return families.slice(0, 2).map((family, i) => ({ family, text: `${i > 0 ? '→' : ''}${family.slice(0, 2)}` }))
}

/** The bar of `cells` cells split by token share per family, in legend order; each used family keeps one cell. */
export function tokenBar(tokens: Record<string, number>, cells: number): { family: ModelFamily; cells: number }[] {
  const order: ModelFamily[] = ['fable', 'opus', 'sonnet', 'haiku', 'other']
  const used = order.filter(family => (tokens[family] ?? 0) > 0)
  const sum = used.reduce((total, family) => total + (tokens[family] ?? 0), 0)
  if (sum === 0 || cells <= 0) return []
  const parts = used.map(family => ({ family, cells: Math.max(1, Math.round(((tokens[family] ?? 0) / sum) * cells)) }))
  const big = parts.reduce((best, part) => (part.cells > best.cells ? part : best))
  big.cells += cells - parts.reduce((total, part) => total + part.cells, 0)
  return parts
}

/** `46k`, `4k`, `850`. */
export function formatTokens(count: number): string {
  return count >= 1000 ? `${Math.round(count / 1000)}k` : String(count)
}

/**
 * The agents view's row budget: the dev-env and result boxes are fixed; the cards give way first,
 * then the sessions lanes, which go only when not even the cards' header and one finished card fit.
 */
export function deckRowsFit(rows: number, fixed: number, sessionRows: number): { sessions: boolean; cardRows: number } {
  const withSessions = rows - fixed - sessionRows
  if (sessionRows === 0 || withSessions >= MIN_CARD_ROWS) return { sessions: sessionRows > 0, cardRows: withSessions }
  return { sessions: false, cardRows: rows - fixed }
}

/** The least rows the agent cards keep before the timeline gives way. */
export const MIN_CARD_ROWS = 6

/** The REQUESTS box: its border, title and column header, then 8 rows, or 4 when the deck is short. */
export const REQUEST_TABLE_ROWS = 8
export const REQUEST_TABLE_SHORT = 4
const REQUEST_BOX_ROWS = 4

/**
 * The advanced agents view's budget: cards give way first (down to `minCardRows`, room for the first card), then the
 * REQUESTS table shrinks to 4 rows, then the timeline goes. `tableRows` is 0 when there is no request to show.
 */
export function advancedRowsFit(
  rows: number, fixed: number, sessionRows: number, hasRequests: boolean, minCardRows = MIN_CARD_ROWS,
): { sessions: boolean; cardRows: number; tableRows: number } {
  if (!hasRequests) return { ...deckRowsFit(rows, fixed, sessionRows), tableRows: 0 }
  for (const tableRows of [REQUEST_TABLE_ROWS, REQUEST_TABLE_SHORT]) {
    const fit = deckRowsFit(rows, fixed + REQUEST_BOX_ROWS + tableRows, sessionRows)
    if (fit.sessions === sessionRows > 0 && fit.cardRows >= Math.max(MIN_CARD_ROWS, minCardRows)) return { ...fit, tableRows }
  }
  // Then the timeline goes.
  return { sessions: false, cardRows: rows - fixed - REQUEST_BOX_ROWS - REQUEST_TABLE_SHORT, tableRows: REQUEST_TABLE_SHORT }
}

/** The log rows that fit, newest last. */
export function logWindow<T>(entries: readonly T[], rows: number): T[] {
  return rows <= 0 ? [] : entries.slice(-rows)
}

/** One view tab: its key (`agents`, `routing`, `log`, `docs`, `watch`, `settings`) and drawn width (a hotkey Button is `k: label`). */
export type DeckTab = { key: string; width: number; active?: boolean }

/**
 * The view tabs that fit `columns`: while the row is too wide, `watch` goes first (Enter on a card opens it anyway),
 * then `docs` (also in the band), then the gaps shrink from 2 to 1; the active tab and `settings` always stay.
 */
export function tabsFit(columns: number, items: readonly DeckTab[]): { shown: string[]; gap: number } {
  const width = (tabs: readonly DeckTab[], gap: number) =>
    tabs.reduce((sum, tab) => sum + tab.width, 0) + gap * Math.max(0, tabs.length - 1)
  let tabs = [...items]
  for (const drop of ['watch', 'docs']) {
    if (width(tabs, 2) <= columns) break
    tabs = tabs.filter(tab => tab.key !== drop || tab.active === true)
  }
  return { shown: tabs.map(tab => tab.key), gap: width(tabs, 2) <= columns ? 2 : 1 }
}
