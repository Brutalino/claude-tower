// The session status records other sessions read to know who is alive and busy.

import { formatLeft } from './estimate'
import type { TowerRequest, TowerRole, TowerSessionState, TowerSessionStatus, TowerSpan, TowerWaiting } from '../../types/index'

export const STATUS_DEAD_AFTER_MS = 20_000

export type StatusIdentity = {
  id: string
  role: TowerRole
  ticket: string | null
  cwd: string
  pane: string | null
}

/** The record after a change of state (`since` moves) or a heartbeat (only `updatedAt` moves). */
export function nextStatus(
  previous: TowerSessionStatus | null,
  identity: StatusIdentity,
  state: TowerSessionState,
  now: number,
  agents?: TowerSessionStatus['agents'],
  line?: StatusLineFields,
): TowerSessionStatus {
  const since = previous !== null && previous.state === state ? previous.since : now
  return { v: 1, ...identity, state, since, updatedAt: now, ...(agents !== undefined ? { agents } : {}), ...(line ?? {}) }
}

/** What the status line script reads: the main loop's model and effort, and the right-hand text. */
export type StatusLineFields = { model: string | null; effort: string | null; footer: string }

/** One running subagent: its name and the time it probably has left (null without an estimate). */
export type RunningAgent = { name: string; leftMs: number | null }

/**
 * The status line's right-hand text: `2 agents · executor ≈ 2m left` (the agent with the longest
 * estimate left), `1 agent` without estimates, `working` with none running, empty when idle.
 */
export function footerText(working: boolean, running: readonly RunningAgent[]): string {
  if (running.length === 0) return working ? 'working' : ''
  const count = `${running.length} agent${running.length === 1 ? '' : 's'}`
  const longest = running.reduce<RunningAgent | null>((best, agent) => agent.leftMs !== null && (best === null || agent.leftMs > best.leftMs!) ? agent : best, null)
  if (longest === null) return count
  return `${count} · ${longest.name} ${formatLeft(longest.leftMs!)}${longest.leftMs! > 0 ? ' left' : ''}`
}

/** A parsed status file, or null when it is not one of ours. */
export function parseStatus(text: string): TowerSessionStatus | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Partial<TowerSessionStatus>
  if (record.v !== 1 || typeof record.id !== 'string' || typeof record.updatedAt !== 'number') return null
  if (record.role !== 'rail' && record.role !== 'ticket' && record.role !== 'hub' && record.role !== 'review' && record.role !== 'free') return null
  // A review session's spans and requests: malformed entries are dropped, never the record.
  const spans = Array.isArray(record.spans) ? record.spans.filter(isSpan) : undefined
  const recentRequests = Array.isArray(record.recentRequests) ? record.recentRequests.filter(isRequest) : undefined
  const { spans: _spans, recentRequests: _requests, waiting: rawWaiting, reviewPosted: rawPosted, ...rest } = record
  const waiting = isWaiting(rawWaiting) ? { waiting: rawWaiting } : {}
  const posted = isReviewPosted(rawPosted) ? { reviewPosted: rawPosted } : {}
  return { ...rest, ...(spans !== undefined ? { spans } : {}), ...(recentRequests !== undefined ? { recentRequests } : {}), ...waiting, ...posted } as TowerSessionStatus
}

/** A malformed `reviewPosted` is dropped, never the record. */
function isReviewPosted(raw: unknown): raw is NonNullable<TowerSessionStatus['reviewPosted']> {
  const posted = raw as Partial<NonNullable<TowerSessionStatus['reviewPosted']>> | null
  return typeof posted === 'object' && posted !== null && typeof posted.round === 'number' && typeof posted.at === 'number'
}

/** A malformed `waiting` is dropped, never the record. */
function isWaiting(raw: unknown): raw is TowerWaiting {
  const waiting = raw as Partial<TowerWaiting> | null
  return typeof waiting === 'object' && waiting !== null && (waiting.kind === 'permission' || waiting.kind === 'question')
    && typeof waiting.text === 'string' && typeof waiting.since === 'number'
}

function isSpan(raw: unknown): raw is TowerSpan {
  const span = raw as Partial<TowerSpan> | null
  return typeof span === 'object' && span !== null && typeof span.model === 'string' && typeof span.from === 'number' && (span.to === null || typeof span.to === 'number')
}

function isRequest(raw: unknown): raw is TowerRequest {
  const request = raw as Partial<TowerRequest> | null
  return typeof request === 'object' && request !== null && typeof request.at === 'number' && typeof request.model === 'string'
    && typeof request.tokensIn === 'number' && typeof request.tokensOut === 'number'
}

/**
 * The records of this Tower's sessions (decision 059): every Tower shares the state dir, each runs on its own tmux socket.
 * A record of another socket is dropped; one without a socket (an older file) is kept, as is every record when this
 * session has no socket.
 */
export function ofTower(statuses: TowerSessionStatus[], socket: string | null): TowerSessionStatus[] {
  if (socket === null) return statuses
  return statuses.filter(status => status.socket === undefined || status.socket === socket)
}

/** Drops the records of sessions whose tmux pane (by `@tower_tag`) is gone: a killed pane leaves its record behind. */
export function withLivePanes(statuses: TowerSessionStatus[], paneTags: ReadonlySet<string>): TowerSessionStatus[] {
  return statuses.filter(status => status.role === 'rail' || status.tag === undefined || paneTags.has(status.tag))
}

export function isAlive(status: TowerSessionStatus, now: number): boolean {
  return status.state !== 'ended' && now - status.updatedAt <= STATUS_DEAD_AFTER_MS
}

/** The live status of each work session of `role`, by its key (`ticket`); the most recently updated wins. */
export function newestTicketStatuses(statuses: TowerSessionStatus[], now: number, role: 'ticket' | 'hub' | 'free' = 'ticket'): Map<string, TowerSessionStatus> {
  const newest = new Map<string, TowerSessionStatus>()
  for (const status of statuses) {
    if (status.role !== role || status.ticket === null || !isAlive(status, now)) continue
    const seen = newest.get(status.ticket)
    if (seen === undefined || seen.updatedAt < status.updatedAt) newest.set(status.ticket, status)
  }
  return newest
}

/** The live state of each ticket's session, by ticket id; the most recently updated wins. */
export function ticketSessionStates(
  statuses: TowerSessionStatus[],
  now: number,
): Map<string, 'working' | 'idle'> {
  const states = new Map<string, 'working' | 'idle'>()
  for (const [ticket, status] of newestTicketStatuses(statuses, now)) states.set(ticket, status.state === 'working' ? 'working' : 'idle')
  return states
}

/** The subagents running in each ticket's live session; a record without `agents` has none. */
export function ticketRunningAgents(statuses: TowerSessionStatus[], now: number): Map<string, number> {
  const running = new Map<string, number>()
  for (const [ticket, status] of newestTicketStatuses(statuses, now)) running.set(ticket, status.agents?.running ?? 0)
  return running
}

/** How long a permission or question must wait before it counts: in auto mode the classifier answers most asks within seconds. */
export const REAL_WAIT_MS = 10_000

/** Whether a wait has lasted long enough to need the person (the status line, the board, the REVIEW box, the toast). */
export function isRealWait(waiting: TowerWaiting | null | undefined, now: number): waiting is TowerWaiting {
  return waiting !== null && waiting !== undefined && now - waiting.since >= REAL_WAIT_MS
}

/** Decision 074: when each ticket's running review round was posted, as its live ticket session's record says. */
function reviewPostedTimes(statuses: TowerSessionStatus[], now: number): Map<string, number> {
  const posted = new Map<string, number>()
  for (const [ticket, status] of newestTicketStatuses(statuses, now)) if (status.reviewPosted !== undefined) posted.set(ticket, status.reviewPosted.at)
  return posted
}

/**
 * A session's wait once it counts (isRealWait); a review session's wait that began before its round was posted
 * (`posted`: reviewPostedTimes) never needs the person: the round is done, the dialog is left over (decision 074).
 */
function countedWait(status: TowerSessionStatus, posted: ReadonlyMap<string, number>, now: number): TowerWaiting | null {
  if (!isRealWait(status.waiting, now)) return null
  const at = status.role === 'review' && status.ticket !== null ? posted.get(status.ticket) : undefined
  return at !== undefined && status.waiting.since <= at ? null : status.waiting
}

/** The live sessions of one ticket, oldest first. */
export function ticketLiveSessions(statuses: TowerSessionStatus[], ticket: string, now: number) {
  const posted = reviewPostedTimes(statuses, now)
  return statuses
    .filter(status => status.ticket === ticket && isAlive(status, now))
    .sort((a, b) => a.since - b.since)
    .map(status => ({ role: status.role, state: status.state === 'working' ? 'working' as const : 'idle' as const, since: status.since, ...(countedWait(status, posted, now) !== null ? { waiting: true } : {}) }))
}

/** What each ticket's live sessions (its own or its review) wait on: a permission, else a question; absent when none waits. */
export function ticketWaiting(statuses: TowerSessionStatus[], now: number): Map<string, TowerWaiting['kind']> {
  const posted = reviewPostedTimes(statuses, now)
  const waiting = new Map<string, TowerWaiting['kind']>()
  for (const status of statuses) {
    if ((status.role !== 'ticket' && status.role !== 'review') || status.ticket === null || !isAlive(status, now)) continue
    const wait = countedWait(status, posted, now)
    if (wait !== null && waiting.get(status.ticket) !== 'permission') waiting.set(status.ticket, wait.kind)
  }
  return waiting
}

/** The live hub sessions, by skill name, in the order of their start. */
export function hubSessionStates(statuses: TowerSessionStatus[], now: number): { key: string; state: 'working' | 'idle' }[] {
  return [...newestTicketStatuses(statuses, now, 'hub').values()]
    .sort((a, b) => a.since - b.since)
    .map(status => ({ key: status.ticket ?? '', state: status.state === 'working' ? 'working' as const : 'idle' as const }))
}

/** The id of the live session of a ticket or hub key, the most recently updated; null when none. */
export function liveSessionId(statuses: TowerSessionStatus[], role: 'ticket' | 'hub' | 'free', key: string, now: number): string | null {
  return newestTicketStatuses(statuses, now, role).get(key)?.id ?? null
}

/** The text of a ticket's wait once it counts (`Bash gh pr view …`, the question); null when none. */
export function ticketWaitText(statuses: TowerSessionStatus[], ticket: string, now: number): string | null {
  const posted = reviewPostedTimes(statuses, now)
  const status = statuses.find(one => (one.role === 'ticket' || one.role === 'review' || one.role === 'free') && one.ticket === ticket && isAlive(one, now) && countedWait(one, posted, now) !== null)
  return status?.waiting?.text ?? null
}
