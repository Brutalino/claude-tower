import { expect, test } from 'claude-code/testing'

import type { TowerRailRow } from '../types/index'
import { barSegments, branchWithoutOwner, cutPlan, fitItems, railItems, rowFigure, rowGroup } from '../hooks/core/board'

function row(key: string, over: Partial<TowerRailRow> = {}): TowerRailRow {
  return { key, branch: `me/${key.toLowerCase()}-x`, path: `/w/${key}`, phase: 'implementing', next: null, hasPlan: false, blockers: [], session: null, agents: 0, ...over }
}

test('rows go to their group by meaning', async () => {
  const pr = (state: 'draft' | 'merged') => ({ kind: 'pr' as const, number: 3, state, checks: 'none' as const, headRefOid: null, green: false })
  expect(rowGroup(row('A', { phase: 'planning', hasPlan: true }), null)).toBe('needs you')
  expect(rowGroup(row('A', { phase: 'planning', hasPlan: true, session: 'working' }), null)).toBe('working')
  expect(rowGroup(row('A', { session: 'working' }), null)).toBe('working')
  expect(rowGroup(row('A', { agents: 2 }), null)).toBe('working')
  expect(rowGroup(row('A', { blockers: ['waits on TKT-9'] }), null)).toBe('needs you')
  expect(rowGroup(row('A'), pr('draft'))).toBe('ready for the next step')
  expect(rowGroup(row('A'), pr('merged'))).toBe('ready for the next step')
  expect(rowGroup(row('A', { phase: 'not started' }), undefined)).toBe('ready for the next step')
})

test('the list orders the groups, omits empty ones and puts hubs last', async () => {
  const items = railItems([row('B', { phase: 'not started' }), row('A', { phase: 'planning', hasPlan: true })], [{ key: 'triage', state: 'idle' }], {})
  expect(items.map(item => (item.kind === 'label' ? `#${item.text}${item.first ? '!' : ''}` : item.kind === 'ticket' ? item.row.key : item.hub.key))).toEqual([
    '#needs you!', 'A', '#ready for the next step', 'B', '#other sessions', 'triage',
  ])
})

test('what does not fit becomes +n more, the centre always shown', async () => {
  const rows = ['A', 'B', 'C', 'D', 'E'].map(key => row(key))
  const items = railItems(rows, [], {})
  expect(fitItems(items, 11, null).more).toBe(0)
  const fitted = fitItems(items, 8, 'E')
  expect(fitted.more).toBe(2)
  expect(fitted.items.map(item => (item.kind === 'ticket' ? item.row.key : 'label'))).toEqual(['label', 'A', 'B', 'E'])
})

test('a row figure: agents, else the live session age, else nothing', async () => {
  const local = { plan: null, base: null, sessions: [{ role: 'ticket' as const, state: 'idle' as const, since: 0 }] }
  expect(rowFigure(row('A', { agents: 2, session: 'working' }), local, 1_000)).toBe('2 agents')
  expect(rowFigure(row('A', { session: 'idle' }), local, 240_000)).toBe('4m')
  expect(rowFigure(row('A'), local, 240_000)).toBe('')
  expect(branchWithoutOwner('me/tkt-21-x')).toBe('tkt-21-x')
})

test('the plan is cut to the rows it has, with a last line …', async () => {
  expect(cutPlan('a\nb', 10, 2)).toBe('a\nb')
  expect(cutPlan('a\nb\nc\nd', 10, 3)).toBe('a\nb\n…')
  expect(cutPlan('a'.repeat(25) + '\nb', 10, 3)).toBe('…')
  expect(barSegments(14, 5)).toEqual([2, 2, 2, 2, 2])
  expect(barSegments(16, 5)).toEqual([3, 3, 2, 2, 2])
})
