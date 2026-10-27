import { expect, test } from 'claude-code/testing'

import { blockedOutside, candidateIssues, priorityGlyph, promoteOrder, promoteTargets, pruneMarks, toggleMark } from '../hooks/core/candidates'
import { newWorktree } from '../hooks/core/worktrees'
import type { TowerIssue } from '../types/index'

// Decision 071: the candidates as the old launcher listed them, the marks, and the order a batch is promoted in.

const issue = (id: string, extra: Partial<TowerIssue> = {}): TowerIssue => ({
  id, title: id, description: '', priority: 'none', branchName: '', url: '', stateName: 'Todo', stateType: 'unstarted', labels: [],
  assignedToMe: false, story: null, blockedBy: [], children: [], ...extra,
})

test('candidates: no worktree here, none closed, a started one only when yours; the person\'s own first (in progress first), then priority, then id; a listed story\'s children right under it, blockers first', () => {
  const story = { id: 'S-2', title: 'Other story', children: [
    { id: 'C-3', title: 'Only the story knows', stateName: 'Backlog', stateType: 'backlog', assignedToMe: true },
    { id: 'C-4', title: 'Someone else', stateName: 'Todo', stateType: 'unstarted' },
    { id: 'C-5', title: 'Done', stateName: 'Done', stateType: 'completed', assignedToMe: true },
  ] }
  const issues = [
    issue('F-2', { priority: 'urgent' }),
    issue('M-2', { assignedToMe: true, priority: 'low' }),
    issue('M-1', { assignedToMe: true, priority: 'high' }),
    issue('S-1', { children: [{ id: 'C-1', title: 'C-1' }, { id: 'C-2', title: 'C-2' }] }),
    issue('C-2', { story: { id: 'S-1', title: 'Story' } }),
    issue('C-1', { story: { id: 'S-1', title: 'Story' }, blockedBy: ['C-2'], priority: 'urgent' }),
    issue('X-1', { stateType: 'started', assignedToMe: true }),
    issue('X-3', { stateType: 'started' }),
    issue('W-2', { stateType: 'started', assignedToMe: true }),
    issue('X-2', { stateType: 'canceled' }),
    issue('W-1', { assignedToMe: true }),
    issue('M-9', { assignedToMe: true, story }),
  ]
  const list = candidateIssues(issues, new Set(['W-1', 'W-2']))
  // the old launcher's compare: yours, then in progress, then priority: X-1 (started elsewhere, yours) first; X-3 (started, free) and W-2 (a worktree here) out.
  expect(list.map(one => one.id)).toEqual(['X-1', 'M-1', 'M-2', 'C-3', 'M-9', 'F-2', 'S-1', 'C-2', 'C-1'])
  // A story's child the query did not give: assigned to the person, read by identifier when promoted.
  expect(list.find(one => one.id === 'C-3')).toMatchObject({ assignedToMe: true, fromStory: true, story: { id: 'S-2', title: 'Other story' }, stateName: 'Backlog' })
})

test('the marks: m toggles, a reload keeps only the listed; ↵ takes the marked in the list\'s order, else the focused one', () => {
  expect(toggleMark(['A'], 'B')).toEqual(['A', 'B'])
  expect(toggleMark(['A', 'B'], 'A')).toEqual(['B'])
  expect(pruneMarks(['A', 'Z', 'B'], ['B', 'A', 'C'])).toEqual(['A', 'B'])
  const list = [issue('A'), issue('B'), issue('C')]
  expect(promoteTargets(list, ['C', 'A'], 'B').map(one => one.id)).toEqual(['A', 'C'])
  expect(promoteTargets(list, [], 'B').map(one => one.id)).toEqual(['B'])
  expect(promoteTargets(list, ['gone'], 'C').map(one => one.id)).toEqual(['C'])
  expect(promoteTargets(list, [], null)).toEqual([])
})

test('a batch: the stories first, then blockers before the tickets they block; a ticket blocked outside the batch is named', () => {
  const batch = [
    issue('T-3', { blockedBy: ['T-2'], priority: 'urgent' }),
    issue('T-2', { blockedBy: ['T-1'] }),
    issue('S-9', { labels: ['Story'] }),
    issue('T-1'),
    issue('S-1', { children: [{ id: 'T-1', title: 'T-1' }] }),
    issue('T-7', { blockedBy: ['T-99'], assignedToMe: true }),
  ]
  expect(promoteOrder(batch).map(one => one.id)).toEqual(['S-9', 'S-1', 'T-7', 'T-1', 'T-2', 'T-3'])
  expect(blockedOutside(batch)).toEqual(['T-7 blocked by T-99'])
  expect(blockedOutside([issue('T-2', { blockedBy: ['T-1'] })])).toEqual(['T-2 blocked by T-1'])
  // A cycle never stops the batch: the rest in the old launcher's order.
  expect(promoteOrder([issue('A', { blockedBy: ['B'] }), issue('B', { blockedBy: ['A'] })]).map(one => one.id)).toEqual(['A', 'B'])
})

test('the old launcher\'s priority glyphs', () => {
  expect((['urgent', 'high', 'medium', 'low', 'none'] as const).map(one => priorityGlyph(one).glyph).join('')).toBe('!▲■▼·')
  expect(priorityGlyph('urgent')).toEqual({ glyph: '!', tone: 'error', bold: true })
})

test('decision 071: the base as the old launcher\'s promote — the ticket\'s own branch on origin resumes it, else blocker, else story (stacking), else the base branch', () => {
  const config = { pathTemplate: '{repoParent}/{repo}-{key}', followExisting: false, branch: { kind: 'linear' as const, fallback: '{keyLower}-{slug}' }, slugMax: 40, stackOnBlocker: true }
  const plan = (originBranches: string[], extra: Record<string, unknown> = {}) => newWorktree({
    repo: '/r/shopapp', ticket: 'TKT-2', issue: { title: 'Two', branchName: 'me/tkt-2-two' }, existing: [], blockerBranch: 'me/tkt-1-one', storyBranch: 'me/tkt-9-story',
    originBranches, baseBranch: 'staging', ...extra,
  }, config as any, null).base
  expect(plan(['staging', 'me/tkt-2-two', 'me/tkt-1-one', 'me/tkt-9-story'])).toBe('origin/me/tkt-2-two')
  expect(plan(['staging', 'me/tkt-1-one', 'me/tkt-9-story'])).toBe('origin/me/tkt-1-one')
  expect(plan(['staging', 'me/tkt-9-story'])).toBe('origin/me/tkt-9-story')
  expect(plan(['staging'])).toBe('origin/staging')
  // Without stacking, only the ticket's own branch counts.
  expect(newWorktree({ repo: '/r/shopapp', ticket: 'TKT-2', issue: { title: 'Two', branchName: 'me/tkt-2-two' }, existing: [], blockerBranch: 'me/tkt-1-one', storyBranch: 'me/tkt-9-story',
    originBranches: ['staging', 'me/tkt-1-one', 'me/tkt-9-story'], baseBranch: 'staging' }, { ...config, stackOnBlocker: false } as any, null).base).toBe('origin/staging')
})
