import { expect, test } from 'claude-code/testing'

import { keysFilter, LINEAR_KEYS_QUERY, LINEAR_QUERY, parseLinear, parseLinearAll } from '../hooks/core/linear'
import { fitRail, storyBlocks } from '../hooks/core/stories'
import type { RailLine } from '../hooks/core/stories'
import type { TowerIssue } from '../types/index'

// Decision 067: the narrow rail groups its tickets by story first. Reported live: under a story's header sat tickets of
// no story (or of another), because the grouping ran per step group and a single member stayed plain.

const issue = (id: string, extra: Partial<TowerIssue> = {}): TowerIssue => ({
  id, title: `T${id}`, description: '', priority: 'none', branchName: '', url: '', stateName: 'Todo', stateType: 'unstarted',
  labels: [], assignedToMe: false, story: null, blockedBy: [], children: [], ...extra,
})
const ref = (id: string, stateType = 'unstarted') => ({ id, title: `T${id}`, stateName: stateType === 'completed' ? 'Done' : 'Todo', stateType })
const printing = { id: 'TKT-100', title: 'Printing', children: [ref('TKT-101'), ref('TKT-102'), ref('TKT-103', 'completed'), ref('TKT-104')] }
const billing = { id: 'TKT-200', title: 'Billing', children: [ref('TKT-201'), ref('TKT-202')] }

type Row = { key: string; rank: number }
const row = (key: string, rank: number): Row => ({ key, rank })
const shape = (rows: Row[], issues: TowerIssue[]) =>
  storyBlocks(rows, issues, one => one.key, one => one.rank).map(block => [block.story?.text ?? 'NO STORY', ...block.rows.map(one => one.key)])

test('a ticket of no story between and after a story\'s members lands in NO STORY, never under the header', async () => {
  const issues = [issue('TKT-101', { story: printing }), issue('TKT-7'), issue('TKT-102', { story: printing }), issue('TKT-8')]
  // The order the old grouping kept: a member, a loose ticket, a member, a loose one, all in one step group.
  expect(shape([row('TKT-101', 2), row('TKT-7', 2), row('TKT-102', 2), row('TKT-8', 2)], issues)).toEqual([
    ['▾ TKT-100 Printing · 1/4 done', 'TKT-101', 'TKT-102'],
    ['NO STORY', 'TKT-7', 'TKT-8'],
  ])
})

test('one story across different steps is one header; inside: needs you, working, ready, not started, blockers first', async () => {
  const issues = [
    issue('TKT-104', { story: printing, blockedBy: ['TKT-102'] }),
    issue('TKT-102', { story: printing }),
    issue('TKT-101', { story: printing }),
    issue('TKT-201', { story: billing }),
  ]
  expect(shape([row('TKT-104', 2), row('TKT-201', 1), row('TKT-101', 3), row('TKT-102', 2)], issues)).toEqual([
    ['▾ TKT-200 Billing · 0/2 done', 'TKT-201'],
    ['▾ TKT-100 Printing · 1/4 done', 'TKT-102', 'TKT-104', 'TKT-101'],
  ])
  // A story with a `needs you` row comes first; ties by story key.
  expect(shape([row('TKT-201', 1), row('TKT-101', 0)], issues).map(block => block[0])).toEqual(['▾ TKT-100 Printing · 1/4 done', '▾ TKT-200 Billing · 0/2 done'])
  expect(shape([row('TKT-201', 2), row('TKT-101', 2)], issues).map(block => block[0])).toEqual(['▾ TKT-100 Printing · 1/4 done', '▾ TKT-200 Billing · 0/2 done'])
})

test('a ticket whose issue is not loaded is never guessed into a story; a story ticket heads its own block', async () => {
  const issues = [issue('TKT-101', { story: printing }), issue('TKT-100', { children: printing.children })]
  expect(shape([row('TKT-9', 0), row('TKT-101', 1), row('TKT-100', 2)], issues)).toEqual([
    ['▾ TKT-100 Printing · 1/4 done', 'TKT-101', 'TKT-100'],
    ['NO STORY', 'TKT-9'],
  ])
  // Only tickets of no story: one block without a header of its own (the rail draws no NO STORY heading then).
  expect(storyBlocks([row('TKT-9', 0)], [], one => one.key, one => one.rank).map(block => block.story)).toEqual([null])
})

const line = (kind: RailLine['kind'], id = ''): RailLine & { id: string } => ({ kind, rows: kind === 'ticket' ? 2 : 1, id })

test('fitting: a header never stays without its first row, a blank never ends the list, hidden counts tickets', async () => {
  const lines = [line('head', 'S1'), line('ticket', 'A'), line('ticket', 'B'), line('gap'), line('head', 'S2'), line('ticket', 'C'), line('head', 'NO'), line('ticket', 'D')]
  expect(fitRail(lines, 99).hidden).toBe(0)
  // 7 rows: one for `+n more`; S1 A B (5) then the blank (6) and S2 with C would take 9: cut after B.
  expect(fitRail(lines, 7)).toEqual({ shown: lines.slice(0, 3), hidden: 2 })
  // 8 rows: the blank and S2 fit (7) but C does not: S2 is not drawn alone, nor the blank.
  expect(fitRail(lines, 8).shown.map(one => one.id)).toEqual(['S1', 'A', 'B'])
  expect(fitRail(lines, 10).shown.map(one => one.id)).toEqual(['S1', 'A', 'B', '', 'S2', 'C'])
  expect(fitRail(lines, 2)).toEqual({ shown: [], hidden: 4 })
})

test('Linear by identifier: one filter per team, numbers as numbers, read-only, closed issues kept', async () => {
  expect(keysFilter(['TKT-12', 'tkt-7', 'OPS-3', 'TKT-12', 'not-a-key-x'])).toEqual({ or: [
    { team: { key: { eq: 'TKT' } }, number: { in: [12, 7] } },
    { team: { key: { eq: 'OPS' } }, number: { in: [3] } },
  ] })
  expect(keysFilter(['main', 'feature/x'])).toBeNull()
  expect(LINEAR_KEYS_QUERY.startsWith('query RailIssues($filter: IssueFilter) {')).toBe(true)
  // The same fields as the candidates' query; neither one is a mutation.
  expect(LINEAR_KEYS_QUERY).toContain('parent { identifier title state { name type } children(first: 25)')
  expect(`${LINEAR_QUERY}${LINEAR_KEYS_QUERY}`).not.toMatch(/mutation/i)
  const answer = JSON.stringify({ data: { issues: { nodes: [
    { identifier: 'TKT-1', title: 'done one', state: { name: 'Done', type: 'completed' } },
    { identifier: 'TKT-2', title: 'open one', state: { name: 'Todo', type: 'unstarted' }, parent: { identifier: 'TKT-100', title: 'Printing' } },
  ] } } })
  expect('issues' in parseLinearAll(answer) ? parseLinearAll(answer) : null).toMatchObject({ issues: [{ id: 'TKT-1', stateType: 'completed' }, { id: 'TKT-2', story: { id: 'TKT-100' } }] })
  expect('issues' in parseLinear(answer) ? (parseLinear(answer) as { issues: TowerIssue[] }).issues.map(one => one.id) : null).toEqual(['TKT-2'])
})
