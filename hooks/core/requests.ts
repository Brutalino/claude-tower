// The advanced view's record of model requests: one entry per `turn.step`, only what the engine reported (no price table).

import type { TowerDeck, TowerFamilyRequests, TowerLogEntry, TowerRequest } from '../../types/index'
import { logWho } from './deck'
import { formatTokens } from './deckView'
import { modelFamily } from './theme'

export const REQUESTS_SIZE = 200

/** A step's usage as `turn.step` hands it over; a cost field is taken only when the engine sets one. */
export type StepUsage = {
  input_tokens?: number
  output_tokens?: number
  cost_usd?: number
  costUsd?: number
  costUSD?: number
} | null | undefined

/** The cost the engine gave for the step, or null: never computed from a price. */
export function stepCost(usage: StepUsage): number | null {
  for (const value of [usage?.costUsd, usage?.cost_usd, usage?.costUSD]) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  }
  return null
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)

/** One more model request in the ring (the last REQUESTS_SIZE, oldest first). */
export function requestLogged(
  deck: TowerDeck,
  step: { agentId?: string; model: string; effort?: string | number },
  usage: StepUsage,
  now: number,
  durationMs: number | null = null,
): TowerDeck {
  const request: TowerRequest = {
    at: now,
    who: logWho(deck, step.agentId),
    model: step.model,
    effort: step.effort === undefined ? null : String(step.effort),
    tokensIn: count(usage?.input_tokens),
    tokensOut: count(usage?.output_tokens),
    costUsd: stepCost(usage),
    durationMs: durationMs !== null && Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : null,
  }
  return { ...deck, requests: [...(deck.requests ?? []), request].slice(-REQUESTS_SIZE) }
}

export type RequestTotals = { count: number; in: number; out: number; cost: number | null }

/** Sums of the requests; the cost only over the requests that carry one, null when none does. */
export function requestTotals(requests: readonly TowerRequest[]): RequestTotals {
  let cost: number | null = null
  let tokensIn = 0
  let tokensOut = 0
  for (const request of requests) {
    tokensIn += request.tokensIn
    tokensOut += request.tokensOut
    if (request.costUsd !== null) cost = (cost ?? 0) + request.costUsd
  }
  return { count: requests.length, in: tokensIn, out: tokensOut, cost }
}

/** The totals of one caller (`main` or an agent's name). */
export function requestsOf(requests: readonly TowerRequest[], who: string): RequestTotals {
  return requestTotals(requests.filter(request => request.who === who))
}

/** The totals per model family, families in first-request order. */
export function requestsByFamily(requests: readonly TowerRequest[]): Record<string, RequestTotals> {
  const groups: Record<string, TowerRequest[]> = {}
  for (const request of requests) (groups[modelFamily(request.model)] ??= []).push(request)
  return Object.fromEntries(Object.entries(groups).map(([family, group]) => [family, requestTotals(group)]))
}

/** The status file's `requests`: counts and tokens per family. */
export function familyRequests(requests: readonly TowerRequest[]): Record<string, TowerFamilyRequests> {
  return Object.fromEntries(Object.entries(requestsByFamily(requests)).map(([family, totals]) => [family, { count: totals.count, in: totals.in, out: totals.out }]))
}

/** A status file's `requests`, tolerant: entries that are not `{ count, in, out }` numbers are left out; null when none is left. */
export function parseFamilyRequests(raw: unknown): Record<string, TowerFamilyRequests> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const out: Record<string, TowerFamilyRequests> = {}
  for (const [family, value] of Object.entries(raw as Record<string, unknown>)) {
    const item = value as { count?: unknown; in?: unknown; out?: unknown } | null
    if (typeof item !== 'object' || item === null) continue
    if (typeof item.count !== 'number' || typeof item.in !== 'number' || typeof item.out !== 'number') continue
    out[family] = { count: item.count, in: item.in, out: item.out }
  }
  return Object.keys(out).length === 0 ? null : out
}

/** `$1.23`, or `$—` when no cost is known. */
export function costText(cost: number | null): string {
  return cost === null ? '$—' : `$${cost.toFixed(2)}`
}

/** The log with each model request as a `request · model · in/out` line, merged by time (the advanced log). */
export function logWithRequests(log: readonly TowerLogEntry[], requests: readonly TowerRequest[]): TowerLogEntry[] {
  const lines = requests.map(request => ({
    at: request.at,
    who: request.who,
    text: `request · ${modelFamily(request.model)} · ${formatTokens(request.tokensIn)}/${formatTokens(request.tokensOut)}`,
  }))
  // A stable merge: at equal times the log's own entry comes first.
  const merged: TowerLogEntry[] = []
  let at = 0
  for (const entry of log) {
    while (at < lines.length && lines[at]!.at < entry.at) merged.push(lines[at++]!)
    merged.push(entry)
  }
  return [...merged, ...lines.slice(at)]
}
