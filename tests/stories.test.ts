import { expect, test } from 'claude-code/testing'

import { detailRelations, groupByStory, orderByDependency, storyProgress } from '../hooks/core/stories'
import type { TowerIssue } from '../types/index'

const issue = (id: string, extra: Partial<TowerIssue> = {}): TowerIssue => ({
  id, title: `T${id}`, description: '', priority: 'none', branchName: '', url: '', stateName: 'Todo', stateType: 'unstarted',
  labels: [], assignedToMe: false, story: null, blockedBy: [], children: [], ...extra,
})
const ref = (id: string, stateType = 'unstarted', stateName = 'Todo') => ({ id, title: `T${id}`, stateName, stateType })
const alerting = { id: 'S-1', title: 'Alerting', stateName: 'In Progress', stateType: 'started', children: [ref('A-1'), ref('A-2'), ref('A-3', 'completed', 'Done'), ref('A-4')] }

const shape = (entries: ReturnType<typeof groupByStory<string>>) =>
  entries.map(entry => entry.kind === 'storyHeader' ? entry.text : `${entry.childPrefix ? '↳ ' : ''}${entry.row}${entry.storySuffix ?? ''}`)

test('two children of an unlisted story: a header where the first was, members by dependency', async () => {
  const issues = [
    issue('X-1'),
    issue('A-1', { story: alerting, blockedBy: ['A-2'] }),
    issue('X-2'),
    issue('A-2', { story: alerting }),
  ]
  expect(shape(groupByStory(['X-1', 'A-1', 'X-2', 'A-2'], issues, id => id)))
    .toEqual(['X-1', '▸ S-1 Alerting · 1/4 done', '↳ A-2', '↳ A-1', 'X-2'])
})

test('a single child stays plain; a listed story gets its suffix and its children the arrow', async () => {
  const issues = [
    issue('A-1', { story: alerting }),
    issue('S-2', { children: [ref('B-1', 'completed'), ref('B-2')] }),
    issue('B-2', { story: { id: 'S-2', title: 'Other' } }),
  ]
  expect(shape(groupByStory(['A-1', 'S-2', 'B-2'], issues, id => id))).toEqual(['A-1', 'S-2 · 1/2 done', '↳ B-2'])
})

test('progress: the story itself, else a child’s story children, else the listed children', async () => {
  expect(storyProgress('S-1', [issue('A-1', { story: alerting })])).toEqual({ done: 1, total: 4 })
  expect(storyProgress('S-9', [issue('A-1', { story: { id: 'S-9', title: '' } }), issue('A-2', { story: { id: 'S-9', title: '' }, stateType: 'completed' })]))
    .toEqual({ done: 1, total: 2 })
  expect(storyProgress('S-0', [])).toEqual({ done: 0, total: 0 })
})

test('dependency order: blockers first, a cycle keeps arrival order', async () => {
  const issues = [issue('A', { blockedBy: ['B'] }), issue('B', { blockedBy: ['C'] }), issue('C')]
  expect(orderByDependency(['A', 'B', 'C'], issues)).toEqual(['C', 'B', 'A'])
  const cycle = [issue('A', { blockedBy: ['B'] }), issue('B', { blockedBy: ['A'] }), issue('D')]
  expect(orderByDependency(['A', 'B', 'D'], cycle)).toEqual(['D', 'A', 'B'])
})

test('detail relations: parent, subs by dependency with flags, blocked by, blocks', async () => {
  const story = issue('S-1', {
    story: { id: 'E-1', title: 'Epic', stateName: 'In Progress', stateType: 'started' },
    children: [
      { ...ref('A-1'), blockedBy: ['A-2'] },
      { ...ref('A-2'), blockedBy: [] },
      { ...ref('A-3', 'completed', 'Done'), blockedBy: [] },
      { ...ref('A-4'), blockedBy: ['A-3'] },
    ],
    blockedBy: ['K-1'],
    blockers: [ref('K-1', 'started', 'In Progress'), ref('K-2', 'completed', 'Done')],
    blocks: [ref('Z-1', 'backlog', 'Backlog')],
  })
  expect(detailRelations(story, [story]).map(row => [row.label, row.text, row.tone, row.suffix, row.suffixTone])).toEqual([
    ['parent', 'E-1 — Epic (In Progress)', 'plain', '', null],
    ['sub', '↳ A-2 — TA-2 (Todo)', 'plain', ' · start here', 'done'],
    ['sub', '↳ A-1 — TA-1 (Todo)', 'plain', ' · blocked by A-2', 'error'],
    ['sub', '✓ ↳ A-3 — TA-3 (Done)', 'dim', '', null],
    ['sub', '↳ A-4 — TA-4 (Todo)', 'plain', '', null],
    ['blocked by', 'K-1 — TK-1 (In Progress)', 'error', '', null],
    ['blocked by', '✓ K-2 — TK-2 (Done)', 'dim', '', null],
    ['blocks', 'Z-1 — TZ-1 (Backlog)', 'dim', '', null],
  ])
  expect(detailRelations(issue('Q-1'), [])).toEqual([])
  // Without the full blocker list, the open ids with what the list knows of them.
  expect(detailRelations(issue('Q-2', { blockedBy: ['Q-3'] }), [issue('Q-3', { stateName: 'Backlog', stateType: 'backlog' })]).map(row => row.text))
    .toEqual(['Q-3 — TQ-3 (Backlog)'])
})
