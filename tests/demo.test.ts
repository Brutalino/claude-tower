import { expect, test } from 'claude-code/testing'

import { deckBusy, runningAgents, stepProgress } from '../hooks/core/deck'
import { demoDeck, demoDurations } from '../hooks/core/demo'
import { estimateTotal } from '../hooks/core/estimate'

const NOW = 1_800_000_000_000

test('the demo deck is a working session with three running agents (one stalled) and one done', () => {
  const deck = demoDeck(NOW)
  expect(runningAgents(deck)).toBe(3)
  expect(deck.agents.length).toBe(4)
  expect(deckBusy(deck)).toBe(true)
  expect(NOW - (deck.main.workStartedAt ?? 0)).toBe(252_000)
})

test("the demo executor is on its third step of five, and the scout took 1:31", () => {
  const [executor, , scout] = demoDeck(NOW).agents
  if (executor === undefined || scout === undefined) throw new Error('the demo deck has three agents')
  expect(stepProgress(executor)).toEqual({ done: 2, total: 5, current: 'Reset the window on a confirmed recovery' })
  expect((scout.endedAt ?? 0) - scout.startedAt).toBe(91_000)
  expect(scout.status).toBe('done')
})

test('the demo routing counts two reroutes and no denials', () => {
  const { routing } = demoDeck(NOW)
  expect(routing.rerouted).toBe(2)
  expect(routing.denied).toBe(0)
  expect(routing.decisions.length).toBe(2)
})

test('the demo history gives the executor 6 min and the verifier 80 s', () => {
  expect(estimateTotal(demoDurations(), 'executor')).toBe(360_000)
  expect(estimateTotal(demoDurations(), 'verifier')).toBe(80_000)
})

test('the demo main loop ran fable with 40 s of opus in the middle; the agents have one span each', () => {
  const deck = demoDeck(NOW)
  expect(deck.main.spans.map(span => span.model)).toEqual(['claude-fable-5-1', 'claude-opus-5-5', 'claude-fable-5-1'])
  const opus = deck.main.spans[1]
  expect((opus?.to ?? 0) - (opus?.from ?? 0)).toBe(40_000)
  expect(deck.main.spans[0]?.from).toBe(deck.main.workStartedAt)
  expect(deck.agents.map(agent => agent.spans.length)).toEqual([1, 1, 1, 1])
  expect(deck.agents[2]?.spans[0]?.to).toBe(deck.agents[2]?.endedAt)
  expect(deck.tokens).toEqual({ fable: 21_000, opus: 46_000, sonnet: 29_000, haiku: 4_000 })
})
