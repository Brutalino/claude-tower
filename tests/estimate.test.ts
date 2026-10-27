import { expect, test } from 'claude-code/testing'

import { estimateTotal, formatLeft, parseHistory, recordDuration } from '../hooks/core/estimate'

test('the history keeps the last 20 durations per agent type', async () => {
  let history = {}
  for (let i = 1; i <= 25; i++) history = recordDuration(history, 'general-purpose', i * 1000)
  history = recordDuration(history, 'executor', 7000)
  expect((history as Record<string, number[]>)['general-purpose']).toEqual(Array.from({ length: 20 }, (_, i) => (i + 6) * 1000))
  expect((history as Record<string, number[]>).executor).toEqual([7000])
})

test('the estimate is the median from 3 samples on, else null', async () => {
  expect(estimateTotal({}, 'x')).toBeNull()
  expect(estimateTotal({ x: [10, 20] }, 'x')).toBeNull()
  expect(estimateTotal({ x: [30, 10, 20] }, 'x')).toBe(20)
  expect(estimateTotal({ x: [40, 10, 20, 30] }, 'x')).toBe(25)
})

test('the time left reads ≈ 40s, ≈ 2m, ≈ 1h and never goes negative', async () => {
  expect(formatLeft(40_000)).toBe('≈ 40s')
  expect(formatLeft(120_000)).toBe('≈ 2m')
  expect(formatLeft(3_600_000)).toBe('≈ 1h')
  expect(formatLeft(0)).toBe('≈ soon')
  expect(formatLeft(-5_000)).toBe('≈ soon')
})

test('a stored history is read back and anything malformed dropped', async () => {
  expect(parseHistory(undefined)).toEqual({})
  expect(parseHistory({ a: [1, 'x', -2, 3], b: 'no' })).toEqual({ a: [1, 3] })
})
