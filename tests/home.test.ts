import { expect, test } from 'claude-code/testing'
import { asksLines } from '../hooks/core/board'
import { candidateStories, columnStories, homeCardRows, columnWindow, columnsLayout, leadFamily, neighbourCard, progressBar } from '../hooks/core/home'
import type { TowerIssue } from '../types/index'

test('columnsLayout: four columns while each keeps 30 cells', () => {
  expect(columnsLayout(220)).toEqual({ rows: [['needs you', 'working', 'ready', 'candidates']], width: 53 })
  expect(columnsLayout(160).width).toBe(38)
  expect(columnsLayout(126).rows).toHaveLength(1)
})
test('columnsLayout: below that, two rows of two', () => {
  expect(columnsLayout(120)).toEqual({ rows: [['needs you', 'working'], ['ready', 'candidates']], width: 59 })
})

test('homeCardRows: two title lines from 40 cells, a bar row for working', () => {
  expect(homeCardRows('ready', 38)).toBe(5)
  expect(homeCardRows('ready', 53)).toBe(6)
  expect(homeCardRows('working', 38)).toBe(6)
})

const five = [5, 5, 5, 5, 5]
test('columnWindow: all fit', () => {
  expect(columnWindow(five, 0, 25)).toEqual({ start: 0, end: 5, moreAbove: 0, moreBelow: 0 })
})
test('columnWindow: cut at the bottom with a more line', () => {
  expect(columnWindow(five, 0, 12)).toEqual({ start: 0, end: 2, moreAbove: 0, moreBelow: 3 })
})
test('columnWindow: follows the focus down, a more line at each end', () => {
  expect(columnWindow(five, 2, 12)).toEqual({ start: 1, end: 3, moreAbove: 1, moreBelow: 2 })
})
test('columnWindow: keeps its start while the focus is inside', () => {
  expect(columnWindow(five, 2, 12, 2).start).toBe(2)
})
test('columnWindow: the focus above the window moves it up', () => {
  expect(columnWindow(five, 1, 12, 3).start).toBe(1)
})
test('columnWindow: the last card needs no more line', () => {
  expect(columnWindow(five, 4, 12)).toEqual({ start: 3, end: 5, moreAbove: 3, moreBelow: 0 })
})
test('columnWindow: an empty column', () => {
  expect(columnWindow([], -1, 10)).toEqual({ start: 0, end: 0, moreAbove: 0, moreBelow: 0 })
})

const columns = [['a1'], ['b1', 'b2', 'b3'], [], ['d1', 'd2']]
test('neighbourCard: the same index, else the last', () => {
  expect(neighbourCard(columns, 'b3', 'right')).toBe('d2')
  expect(neighbourCard(columns, 'b2', 'left')).toBe('a1')
})
test('neighbourCard: skips empty columns, stops at the edges', () => {
  expect(neighbourCard(columns, 'd1', 'left')).toBe('b1')
  expect(neighbourCard(columns, 'a1', 'left')).toBeNull()
})
test('neighbourCard: no current card: the first card', () => {
  expect(neighbourCard(columns, null, 'right')).toBe('a1')
})

test('progressBar', () => {
  expect(progressBar(3, 5, 10)).toBe('▰▰▰▰▰▰▱▱▱▱')
  expect(progressBar(0, 0, 4)).toBe('▱▱▱▱')
})

test('leadFamily', () => {
  expect(leadFamily({ fable: 21_000, opus: 46_000 })).toBe('opus')
  expect(leadFamily(null)).toBeNull()
})

const issue = (id: string, extra: Partial<TowerIssue> = {}): TowerIssue => ({
  id, title: `T${id}`, description: '', priority: 'none', branchName: '', url: '', stateName: 'Todo', stateType: 'unstarted',
  labels: [], assignedToMe: false, story: null, blockedBy: [], children: [], ...extra,
})
const ref = (id: string, stateType = 'unstarted') => ({ id, title: `T${id}`, stateName: 'Todo', stateType })
const story = { id: 'S-1', title: 'Org admin', stateName: 'In Progress', stateType: 'started', children: [ref('C-1'), ref('C-2', 'completed'), ref('C-3'), ref('C-4')] }
const shape = (entries: ReturnType<typeof columnStories<string>>) =>
  entries.map(entry => entry.kind === 'storyHeader' ? entry.text : `${entry.childPrefix ? '↳ ' : ''}${entry.row}${entry.storySuffix ?? ''}`)

test('columnStories: the story first with its done count, its children after it, blockers first', () => {
  const issues = [
    issue('C-3', { story, blockedBy: ['C-1'] }), issue('X-1'), issue('C-1', { story }), issue('S-1', { children: story.children }), issue('C-4', { story }),
  ]
  expect(shape(columnStories(['C-3', 'X-1', 'C-1', 'S-1', 'C-4'], issues, id => id)))
    .toEqual(['X-1', 'S-1 · 1/4 done', '↳ C-1', '↳ C-3', '↳ C-4'])
})
test('columnStories: two children of a story not in the column get a header; one stays plain', () => {
  const issues = [issue('C-1', { story }), issue('C-3', { story, blockedBy: ['C-1'] }), issue('X-1')]
  expect(shape(columnStories(['C-3', 'X-1', 'C-1'], issues, id => id))).toEqual(['▸ S-1 Org admin · 1/4 done', '↳ C-1', '↳ C-3', 'X-1'])
  expect(shape(columnStories(['C-1', 'X-1'], issues, id => id))).toEqual(['C-1', 'X-1'])
})

test('candidateStories: the person\'s own tickets on top, each part in its order; a story never pulls a free ticket up', () => {
  const issues = [
    issue('F-1'), issue('M-1', { assignedToMe: true }), issue('C-1', { story }), issue('F-2'),
    issue('C-3', { story, assignedToMe: true }), issue('M-2', { assignedToMe: true }), issue('C-4', { story, assignedToMe: true }),
  ]
  const mine = (id: string) => issues.find(one => one.id === id)?.assignedToMe === true
  const rows = ['F-1', 'C-1', 'M-1', 'F-2', 'C-3', 'M-2', 'C-4']
  expect(shape(candidateStories(rows, issues, id => id, mine))).toEqual(['M-1', '▸ S-1 Org admin · 1/4 done', '↳ C-3', '↳ C-4', 'M-2', 'F-1', 'C-1', 'F-2'])
  // No ticket of the person's: the column as before.
  expect(shape(candidateStories(['F-1', 'F-2'], issues, id => id, mine))).toEqual(shape(columnStories(['F-1', 'F-2'], issues, id => id)))
})

test('asksLines: heading-only lines are skipped, a cut ends in …', () => {
  const text = '## Context\nContext\nSteps:\nThe import fails on large files. Root cause is not a rejected token but a timeout in the parser.\nSecond line.'
  expect(asksLines(text, 40, 3)).toEqual(['The import fails on large files. Root', 'cause is not a rejected token but a', 'timeout in the parser. …'])
  expect(asksLines('Context\nShort ask.', 40, 3)).toEqual(['Short ask.'])
  expect(asksLines('Note: the import fails. See logs.', 40, 3)).toEqual(['Note: the import fails. See logs.'])
})
