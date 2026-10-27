import { expect, test } from 'claude-code/testing'

import { LINEAR_CONFIG } from './linearConfig'
import { parseWorkState as parseWith } from '../hooks/core/workState'

const parseWorkState = (text: string | undefined) => parseWith(text, LINEAR_CONFIG.phases)

test('only a missing state file reads as not started', async () => {
  expect(parseWorkState(undefined)).toEqual({ phase: 'not started', next: null, hasPlan: false, blockers: [] })
})

test('a state file that exists means started: unknown, empty or unparseable reads as implementing (decision 051)', async () => {
  const started = { phase: 'implementing', next: null, hasPlan: false, blockers: [] }
  expect(parseWorkState('{ nope')).toEqual(started)
  expect(parseWorkState('')).toEqual(started)
  expect(parseWorkState('[]')).toEqual(started)
  expect(parseWorkState('{"phase":""}')).toEqual(started)
  expect(parseWorkState('{"next":"open the PR"}')).toEqual({ ...started, next: 'open the PR' })
  // TKT-2587: the model wrote `review` during a review-fix round.
  expect(parseWorkState('{"ticket":"TKT-2587","phase":"review","next":"fix round 2"}'))
    .toEqual({ phase: 'implementing', next: 'fix round 2', hasPlan: false, blockers: [], rawPhase: 'review' })
  expect(parseWorkState('{"phase":"done"}')).toEqual({ ...started, rawPhase: 'done' })
})

test('phase, next and plan are read from a valid file', async () => {
  expect(parseWorkState('{"ticket":"TKT-1","phase":"planning","plan":"plan.md","next":" approve the plan "}'))
    .toEqual({ phase: 'planning', next: 'approve the plan', hasPlan: true, blockers: [] })
  expect(parseWorkState('{"phase":"implementing","next":""}'))
    .toEqual({ phase: 'implementing', next: null, hasPlan: false, blockers: [] })
  expect(parseWorkState('{"phase":"published"}').phase).toBe('implementing')
  expect(parseWorkState('{"phase":"implementing","blockers":["needs a key",{"text":"waits on TKT-2"},7]}').blockers)
    .toEqual(['needs a key', 'waits on TKT-2'])
})
