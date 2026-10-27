import { expect, test } from 'claude-code/testing'

import { AWAY_OFF, awayBadge, awayMoved, awayNext as awayNextWith, awayNotice, awayOff, awayOn, awayStarts as awayStartsWith, awayToStart as awayToStartWith, parseAway } from '../hooks/core/away'
import { LINEAR_CONFIG } from './linearConfig'

const awayNext = (step: string | null, lastAnswer: string) => awayNextWith(step, lastAnswer, LINEAR_CONFIG.workflow, LINEAR_CONFIG.waits)
const awayStarts = (step: string | null) => awayStartsWith(step, LINEAR_CONFIG.workflow)
const awayToStart = (rows: Parameters<typeof awayToStartWith>[0], driving: string[]) => awayToStartWith(rows, driving, LINEAR_CONFIG.workflow)

test('parseAway: anything malformed reads as off; moves keep only well-formed entries', async () => {
  expect(parseAway(undefined)).toEqual(AWAY_OFF)
  expect(parseAway('on')).toEqual(AWAY_OFF)
  expect(parseAway({ on: true, since: 5, moved: [{ ticket: 'TKT-1', step: '/open-pr', at: 6 }, { ticket: 1 }] }))
    .toEqual({ on: true, since: 5, moved: [{ ticket: 'TKT-1', step: '/open-pr', at: 6 }] })
  expect(parseAway({ on: false, since: 5, moved: [] }).since).toBeNull()
})

test('awayOn / awayOff / awayMoved: on keeps its start; off keeps the moves for the notice', async () => {
  const on = awayOn(AWAY_OFF, 100)
  expect(on).toEqual({ on: true, since: 100, moved: [] })
  expect(awayOn(on, 200).since).toBe(100)
  const moved = awayMoved(on, { ticket: 'TKT-9002', step: '/open-pr', at: 150 })
  expect(awayOff(moved)).toEqual({ on: false, since: null, moved: [{ ticket: 'TKT-9002', step: '/open-pr', at: 150 }] })
})

test('awayNotice lists the last five moves; awayBadge counts minutes and moves', async () => {
  expect(awayNotice(AWAY_OFF)).toBeNull()
  const away = [1, 2, 3, 4, 5, 6].reduce((all, n) => awayMoved(all, { ticket: `TKT-${n}`, step: 'review', at: n }), awayOn(AWAY_OFF, 0))
  expect(awayNotice(away)).toBe('away: TKT-2 review, TKT-3 review, TKT-4 review, TKT-5 review, TKT-6 review')
  expect(awayBadge(away, 12 * 60_000 + 5)).toBe('◆ AWAY · since 12m · 6 moved')
})

test('awayNext: /open-pr runs; its own questions get yes', async () => {
  expect(awayNext('/open-pr', '')).toEqual({ kind: 'run', command: 'open-pr' })
  expect(awayNext('/open-pr', 'PR #103 is a draft.\nMark the PR ready for review? This starts the CI pipeline.')).toEqual({ kind: 'answer', text: 'yes' })
  expect(awayNext('/open-pr', 'Shall I commit these 3 files?')).toEqual({ kind: 'answer', text: 'yes' })
})

test('awayNext: a statement about committing is not a question; it runs instead of answering', async () => {
  expect(awayNext('/open-pr', 'I committed the changes.')).toEqual({ kind: 'run', command: 'open-pr' })
})

test('awayNext: /review <n> opens the review; nothing answers its post question (tower posts the saved review)', async () => {
  expect(awayNext('/review 103', '')).toEqual({ kind: 'review', pr: 103 })
  expect(awayNext('/review 103', 'Ready to post as round 2 — say the word.')).toEqual({ kind: 'review', pr: 103 })
})

test('awayNext: never go, never wrap-up, never a merge, never an unknown question', async () => {
  expect(awayNext('say go', 'Shall I go ahead?')).toBeNull()
  expect(awayNext('/wrap-up 103', '')).toBeNull()
  expect(awayNext('/wrap-up 103', 'Merge TKT-9004 into staging?')).toBeNull()
  expect(awayNext('/review 103', 'Delete the branch?')).toEqual({ kind: 'review', pr: 103 })
  expect(awayNext('/start-ticket TKT-1', '')).toBeNull()
  expect(awayNext(null, 'Commit?')).toBeNull()
})

test('awayToStart: steps away moves, no live session, oldest first, at most two with the ones driven', async () => {
  expect(awayStarts('/open-pr')).toBe(true)
  expect(awayStarts('/review 7')).toBe(true)
  expect(awayStarts('say go')).toBe(false)
  const rows = [
    { key: 'A', step: '/open-pr', live: false, since: 3 },
    { key: 'B', step: '/review 7', live: false, since: 1 },
    { key: 'C', step: '/open-pr', live: true, since: 0 },
    { key: 'D', step: 'say go', live: false, since: 0 },
    { key: 'E', step: '/open-pr', live: false, since: 2 },
  ]
  expect(awayToStart(rows, [])).toEqual(['B', 'E'])
  expect(awayToStart(rows, ['B'])).toEqual(['E'])
  expect(awayToStart(rows, ['X', 'Y'])).toEqual([])
})
