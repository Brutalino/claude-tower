import { expect, test } from 'claude-code/testing'

import type { TowerRequest, TowerSessionStatus } from '../types/index'
import { mergedCost, mergedRequests, mergedTokens, recentRequests, reviewSuffix, reviewUsage, ticketUsage } from '../hooks/core/deckMerge'
import { parseStatus } from '../hooks/core/sessionStatus'

const base = (over: Partial<TowerSessionStatus>): TowerSessionStatus => ({
  v: 1, id: 's', role: 'ticket', ticket: 'TKT-1', cwd: '/w', pane: null, state: 'idle', since: 0, updatedAt: 100_000, ...over,
})
const request = (at: number, who = 'main'): TowerRequest => ({ at, who, model: 'claude-haiku-4-5', effort: null, tokensIn: 10, tokensOut: 5, costUsd: null, durationMs: 1 })

test('reviewUsage: null without a live review session of the ticket', () => {
  expect(reviewUsage([base({})], 'TKT-1', 100_000)).toBe(null)
  expect(reviewUsage([base({ role: 'review', ticket: 'TKT-2' })], 'TKT-1', 100_000)).toBe(null)
  expect(reviewUsage([base({ role: 'review', updatedAt: 0 })], 'TKT-1', 100_000)).toBe(null)
})

test('reviewUsage: sums tokens and cost, relabels its requests as review, keeps spans by time', () => {
  const usage = reviewUsage([
    base({ id: 'a', role: 'review', state: 'working', model: 'claude-haiku-4-5', effort: 'low', tokens: { haiku: 100 }, cost: 0.02,
      spans: [{ model: 'claude-haiku-4-5', from: 50, to: null }], recentRequests: [request(60), request(70, 'Explore')] }),
  ], 'TKT-1', 100_000)!
  expect(usage.model).toBe('claude-haiku-4-5')
  expect(usage.tokens).toEqual({ haiku: 100 })
  expect(usage.cost).toBe(0.02)
  expect(usage.working).toBe(true)
  expect(usage.requests.map(item => item.who)).toEqual(['review', 'review'])
  expect(usage.spans.length).toBe(1)
})

test('merged tokens, cost and requests', () => {
  expect(mergedTokens({ fable: 10 }, { haiku: 5, fable: 1 })).toEqual({ fable: 11, haiku: 5 })
  expect(mergedCost(null, null)).toBe(null)
  expect(mergedCost(1, null, 0.5)).toBe(1.5)
  const own = [request(10), request(30)]
  expect(mergedRequests(own, null)).toEqual(own)
  const review = reviewUsage([base({ role: 'review', recentRequests: [request(20)] })], 'TKT-1', 100_000)
  expect(mergedRequests(own, review).map(item => `${item.at}:${item.who}`)).toEqual(['10:main', '20:review', '30:main'])
})

test('reviewSuffix: model family and effort when known, the review session\'s own cost or $—', () => {
  expect(reviewSuffix(null)).toBe('')
  const usage = { model: 'claude-haiku-4-5-20251001', effort: 'low', ownCost: 0.034, tokens: {}, cost: 0.034, spans: [], requests: [], working: false }
  expect(reviewSuffix(usage)).toBe(' · haiku · low · $0.03')
  expect(reviewSuffix({ ...usage, effort: null, ownCost: null, cost: null })).toBe(' · haiku · $—')
  // The summed cost does not move the box: only the session's own.
  expect(reviewSuffix({ ...usage, effort: null, ownCost: 0.05, cost: 1.2 })).toBe(' · haiku · $0.05')
})

test('reviewUsage: ownCost is the newest review session\'s own cost, not the sum', () => {
  const usage = reviewUsage([
    base({ id: 'old', role: 'review', updatedAt: 90_000, model: 'claude-haiku-4-5', cost: 0.4 }),
    base({ id: 'new', role: 'review', updatedAt: 99_000, model: 'claude-haiku-4-5', cost: 0.05 }),
    base({ id: 't', role: 'ticket', cost: 3 }),
  ], 'TKT-1', 100_000)!
  expect(usage.ownCost).toBe(0.05)
  expect(usage.cost).toBe(0.45)
  expect(reviewSuffix(usage)).toBe(' · haiku · $0.05')
  expect(reviewUsage([base({ role: 'review', model: 'claude-haiku-4-5' })], 'TKT-1', 100_000)!.ownCost).toBe(null)
})

test('ticketUsage: every live ticket and review session of the ticket', () => {
  const statuses = [
    base({ id: 't', tokens: { fable: 1000 }, cost: 1, requests: { fable: { count: 2, in: 900, out: 100 } } }),
    base({ id: 'r', role: 'review', tokens: { haiku: 200 }, cost: 0.05, requests: { haiku: { count: 1, in: 150, out: 50 } } }),
    base({ id: 'x', ticket: 'TKT-2', tokens: { opus: 5 } }),
  ]
  expect(ticketUsage(statuses, 'TKT-1', 100_000)).toEqual({
    tokens: { fable: 1000, haiku: 200 }, cost: 1.05,
    requests: { fable: { count: 2, in: 900, out: 100 }, haiku: { count: 1, in: 150, out: 50 } },
  })
  expect(ticketUsage(statuses, 'TKT-3', 100_000)).toBe(null)
})

test('recentRequests keeps the last 20', () => {
  const all = Array.from({ length: 25 }, (_, index) => request(index))
  expect(recentRequests(all).map(item => item.at)[0]).toBe(5)
})

test('parseStatus: spans and recentRequests are tolerant', () => {
  const text = JSON.stringify(base({ role: 'review' as const, spans: [{ model: 'm', from: 1, to: null }, { bad: 1 } as never], recentRequests: [request(1), { at: 'x' } as never] }))
  const status = parseStatus(text)!
  expect(status.spans).toEqual([{ model: 'm', from: 1, to: null }])
  expect(status.recentRequests?.length).toBe(1)
  expect(parseStatus(JSON.stringify({ ...base({}), spans: 'nope' }))?.spans).toBe(undefined)
})
