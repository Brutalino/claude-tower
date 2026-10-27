// The review session's usage in its ticket's deck and on the board (decision 025): it is the same ticket.

import { parseFamilyRequests } from './requests'
import { isAlive } from './sessionStatus'
import { modelFamily, modelLabel } from './theme'
import type { TowerFamilyRequests, TowerRequest, TowerSessionStatus, TowerSpan } from '../../types/index'

/** What the ticket's live review sessions add to its deck; `ownCost`: the newest session's own, for the REVIEW box. */
export type ReviewUsage = {
  model: string | null
  effort: string | null
  ownCost: number | null
  tokens: Record<string, number>
  cost: number | null
  spans: TowerSpan[]
  requests: TowerRequest[]
  working: boolean
}

/** The live review sessions of `ticket` summed, or null without one. Model and effort are the newest session's. */
export function reviewUsage(statuses: readonly TowerSessionStatus[], ticket: string, now: number): ReviewUsage | null {
  const live = statuses.filter(status => status.role === 'review' && status.ticket === ticket && isAlive(status, now))
  if (live.length === 0) return null
  const newest = [...live].sort((a, b) => b.updatedAt - a.updatedAt)[0]!
  return {
    model: newest.model ?? null,
    effort: newest.effort ?? null,
    ownCost: newest.cost ?? null,
    tokens: mergedTokens(...live.map(status => status.tokens ?? {})),
    cost: mergedCost(...live.map(status => status.cost ?? null)),
    spans: live.flatMap(status => status.spans ?? []).sort((a, b) => a.from - b.from),
    requests: live.flatMap(status => status.recentRequests ?? []).map(request => ({ ...request, who: 'review' })).sort((a, b) => a.at - b.at),
    working: live.some(status => status.state === 'working'),
  }
}

/** Tokens per model family, summed. */
export function mergedTokens(...all: readonly Record<string, number>[]): Record<string, number> {
  const sum: Record<string, number> = {}
  for (const tokens of all) for (const [family, count] of Object.entries(tokens)) sum[family] = (sum[family] ?? 0) + count
  return sum
}

/** Costs summed; null only when none is known. */
export function mergedCost(...all: readonly (number | null)[]): number | null {
  const known = all.filter((cost): cost is number => cost !== null)
  return known.length === 0 ? null : known.reduce((sum, cost) => sum + cost, 0)
}

/** The ticket's own requests and the review's, by time. */
export function mergedRequests(own: readonly TowerRequest[], review: ReviewUsage | null): TowerRequest[] {
  if (review === null || review.requests.length === 0) return [...own]
  return [...own, ...review.requests].sort((a, b) => a.at - b.at)
}

/**
 * The REVIEW box's line 1 ending: ` · haiku · low · $0.03`, model and effort only when known, `$—` for an unknown cost.
 * The cost is the review session's own, so it stays still while the ticket works; the sum is in MODELS ON THIS WORKTREE.
 */
export function reviewSuffix(review: ReviewUsage | null): string {
  if (review === null) return ''
  const model = review.model === null ? null : modelFamily(review.model) === 'other' ? modelLabel(review.model) : modelFamily(review.model)
  const parts = [model, review.effort, typeof review.ownCost === 'number' ? `$${review.ownCost.toFixed(2)}` : '$—'].filter((part): part is string => part !== null && part !== '')
  return parts.map(part => ` · ${part}`).join('')
}

/** The board's `models` panel: every live ticket and review session of `ticket` summed; null without session data. */
export function ticketUsage(
  statuses: readonly TowerSessionStatus[],
  ticket: string,
  now: number,
): { tokens: Record<string, number>; cost: number | null; requests: Record<string, TowerFamilyRequests> | null } | null {
  const live = statuses.filter(status => (status.role === 'ticket' || status.role === 'review') && status.ticket === ticket && isAlive(status, now) && status.tokens !== undefined)
  if (live.length === 0) return null
  const requests: Record<string, TowerFamilyRequests> = {}
  for (const status of live) {
    for (const [family, item] of Object.entries(parseFamilyRequests(status.requests) ?? {})) {
      const seen = requests[family] ?? { count: 0, in: 0, out: 0 }
      requests[family] = { count: seen.count + item.count, in: seen.in + item.in, out: seen.out + item.out }
    }
  }
  return {
    tokens: mergedTokens(...live.map(status => status.tokens ?? {})),
    cost: mergedCost(...live.map(status => status.cost ?? null)),
    requests: Object.keys(requests).length === 0 ? null : requests,
  }
}

/** The status file's view of a review session's request ring: its last 20 requests. */
export function recentRequests(requests: readonly TowerRequest[]): TowerRequest[] {
  return requests.slice(-20)
}
