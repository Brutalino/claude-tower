import { expect, test } from 'claude-code/testing'

import { agentSpawned, initialDeck } from '../hooks/core/deck'
import { advancedRowsFit, REQUEST_TABLE_ROWS, REQUEST_TABLE_SHORT } from '../hooks/core/deckView'
import { demoDeck } from '../hooks/core/demo'
import {
  costText,
  familyRequests,
  logWithRequests,
  parseFamilyRequests,
  requestLogged,
  requestsByFamily,
  requestsOf,
  REQUESTS_SIZE,
  requestTotals,
  stepCost,
} from '../hooks/core/requests'

test('requestLogged: who, model, effort, tokens; cost only when the engine gives one', async () => {
  const spawned = agentSpawned(initialDeck(), { agentId: 'a1', model: 'claude-opus-5-5', subagentType: 'executor' }, 0)
  let deck = requestLogged(spawned, { model: 'claude-fable-5-1', effort: 'high' }, { input_tokens: 1200, output_tokens: 300 }, 10, 900)
  deck = requestLogged(deck, { agentId: 'a1', model: 'claude-opus-5-5' }, { input_tokens: 500, output_tokens: 50, cost_usd: 0.04 }, 20)
  expect(deck.requests).toEqual([
    { at: 10, who: 'main', model: 'claude-fable-5-1', effort: 'high', tokensIn: 1200, tokensOut: 300, costUsd: null, durationMs: 900 },
    { at: 20, who: 'executor', model: 'claude-opus-5-5', effort: null, tokensIn: 500, tokensOut: 50, costUsd: 0.04, durationMs: null },
  ])
})

test('requestLogged: missing usage counts zero tokens; the ring keeps the last REQUESTS_SIZE', async () => {
  let deck = requestLogged(initialDeck(), { model: 'claude-haiku-4-5' }, undefined, 1)
  expect(deck.requests?.[0]).toMatchObject({ tokensIn: 0, tokensOut: 0, costUsd: null })
  for (let i = 0; i < REQUESTS_SIZE + 5; i++) deck = requestLogged(deck, { model: 'claude-haiku-4-5' }, null, 100 + i)
  expect(deck.requests?.length).toBe(REQUESTS_SIZE)
  expect(deck.requests?.[REQUESTS_SIZE - 1]?.at).toBe(100 + REQUESTS_SIZE + 4)
})

test('stepCost: a number the engine set, never a computed price', async () => {
  expect(stepCost({ input_tokens: 1000 })).toBeNull()
  expect(stepCost({ costUsd: 0.5 })).toBe(0.5)
  expect(stepCost({ costUSD: -1 })).toBeNull()
  expect(stepCost(null)).toBeNull()
})

test('totals per caller and per family; cost null while no request carries one', async () => {
  let deck = initialDeck()
  deck = requestLogged(deck, { model: 'claude-fable-5-1' }, { input_tokens: 10, output_tokens: 2 }, 1)
  deck = requestLogged(deck, { model: 'claude-opus-5-5' }, { input_tokens: 20, output_tokens: 4, costUsd: 0.25 }, 2)
  const requests = deck.requests ?? []
  expect(requestTotals(requests)).toEqual({ count: 2, in: 30, out: 6, cost: 0.25 })
  expect(requestsOf(requests, 'main').count).toBe(2)
  expect(requestsOf(requests, 'scout')).toEqual({ count: 0, in: 0, out: 0, cost: null })
  expect(requestsByFamily(requests).fable).toEqual({ count: 1, in: 10, out: 2, cost: null })
  expect(familyRequests(requests)).toEqual({ fable: { count: 1, in: 10, out: 2 }, opus: { count: 1, in: 20, out: 4 } })
  expect(costText(null)).toBe('$—')
  expect(costText(1.5)).toBe('$1.50')
})

test('parseFamilyRequests is tolerant', async () => {
  expect(parseFamilyRequests(undefined)).toBeNull()
  expect(parseFamilyRequests([1])).toBeNull()
  expect(parseFamilyRequests({ opus: { count: 2, in: 5, out: 1 }, bad: { count: '2' }, worse: null })).toEqual({ opus: { count: 2, in: 5, out: 1 } })
  expect(parseFamilyRequests({ bad: 3 })).toBeNull()
})

test('logWithRequests merges request lines by time, log entries first at equal times', async () => {
  let deck = initialDeck()
  deck = requestLogged(deck, { model: 'claude-opus-5-5' }, { input_tokens: 12_000, output_tokens: 3_000 }, 5)
  deck = requestLogged(deck, { model: 'claude-opus-5-5' }, { input_tokens: 1, output_tokens: 1 }, 30)
  const merged = logWithRequests([{ at: 5, who: 'main', text: 'Read a' }, { at: 20, who: 'gate', text: 'allow' }], deck.requests ?? [])
  expect(merged.map(entry => entry.at)).toEqual([5, 5, 20, 30])
  expect(merged[1]).toEqual({ at: 5, who: 'main', text: 'request · opus · 12k/3k' })
})

test('advancedRowsFit: cards give way first, then the table shrinks, then the timeline goes', async () => {
  // Plenty: 8 table rows, sessions kept.
  expect(advancedRowsFit(60, 20, 8, true)).toMatchObject({ sessions: true, tableRows: REQUEST_TABLE_ROWS, cardRows: 60 - 20 - 12 - 8 })
  // Cards would fall under 6 rows with 8 table rows: the table goes to 4.
  expect(advancedRowsFit(44, 20, 8, true)).toMatchObject({ sessions: true, tableRows: REQUEST_TABLE_SHORT, cardRows: 44 - 20 - 8 - 8 })
  // Still too short: the timeline goes.
  expect(advancedRowsFit(36, 20, 8, true)).toMatchObject({ sessions: false, tableRows: REQUEST_TABLE_SHORT, cardRows: 36 - 20 - 8 })
  // Room for the first card is kept before the table shrinks.
  expect(advancedRowsFit(60, 20, 8, true, 21)).toMatchObject({ sessions: true, tableRows: REQUEST_TABLE_SHORT, cardRows: 60 - 20 - 8 - 8 })
  // No request: no table.
  expect(advancedRowsFit(40, 20, 8, false)).toMatchObject({ sessions: true, tableRows: 0 })
})

test('the demo deck carries about a dozen requests across main and its agents', async () => {
  const requests = demoDeck(1_000_000).requests ?? []
  expect(requests.length).toBe(12)
  expect(new Set(requests.map(request => request.who))).toEqual(new Set(['main', 'executor', 'verifier', 'scout']))
  expect(requests.map(request => request.at)).toEqual([...requests.map(request => request.at)].sort((a, b) => a - b))
})
