import { expect, test } from 'claude-code/testing'

import type { TowerIssue, TowerPullRequest, TowerRailRow } from '../types/index'
import { blockedText, railStatus, reviewTarget as reviewTargetWith, rowStep as rowStepWith, statusFlags, ticketStep as ticketStepWith } from '../hooks/core/nextStep'
import type { StepInput } from '../hooks/core/nextStep'
import { blockedMeta, boardLists } from '../hooks/core/board'
import { rowGlyph } from '../hooks/core/rail'
import { theme } from '../hooks/core/theme'
import { LINEAR_CONFIG } from './linearConfig'

type StepInputOf = Parameters<typeof ticketStepWith>[0]
type TowerRailRowOf = Parameters<typeof rowStepWith>[0]

const ticketStep = (input: StepInputOf) => ticketStepWith(input, LINEAR_CONFIG.workflow)
const rowStep = (row: TowerRailRowOf, pullRequest: Parameters<typeof rowStepWith>[1], blockedBy: readonly string[] = []) => rowStepWith(row, pullRequest, blockedBy, LINEAR_CONFIG.workflow)
const reviewTarget = (next: string | null, pullRequest: Parameters<typeof reviewTargetWith>[1]) => reviewTargetWith(next, pullRequest, LINEAR_CONFIG.workflow)

const IDLE = { working: false, agent: null }
const pr = (state: 'draft' | 'open' | 'merged' | 'closed'): TowerPullRequest =>
  ({ kind: 'pr', number: 42, state, checks: 'passing', headRefOid: 'abc', green: false })

function step(over: Partial<StepInput>) {
  return ticketStep({ ticket: 'TKT-1', work: { phase: 'implementing', blockers: [] }, pullRequest: null, session: IDLE, green: false, ...over })
}

test('1. a working session outranks everything', async () => {
  expect(step({ session: { working: true, agent: null }, work: { phase: 'planning', blockers: [] } }))
    .toEqual({ group: 'working', glyph: 'spinner', status: 'working', next: null, phaseIndex: 0 })
  expect(step({ session: { working: true, agent: { name: 'executor', done: 2, total: 5 } } }).status).toBe('working · executor 3/5')
  expect(step({ session: { working: true, agent: { name: 'executor', done: 0, total: 0 } } }).status).toBe('working')
})

test('2. no state file: not started', async () => {
  expect(step({ work: null }))
    .toEqual({ group: 'ready', glyph: '○', status: 'not started · /start-ticket', next: '/start-ticket TKT-1', phaseIndex: 0 })
})

test('2b. no state file but a pull request on the branch: the pull request tells the step, a closed one does not', async () => {
  expect(step({ work: null, pullRequest: pr('open') })).toEqual({ group: 'ready', glyph: '✓', status: 'ready · review', next: '/review 42', phaseIndex: 3 })
  expect(step({ work: { phase: 'not started', blockers: [] }, pullRequest: pr('draft') }).status).toBe('ready · mark PR ready')
  expect(step({ work: null, pullRequest: pr('closed') }).status).toBe('not started · /start-ticket')
})

test('3. planning waits for go', async () => {
  expect(step({ work: { phase: 'planning', blockers: ['x'] } }))
    .toEqual({ group: 'needs you', glyph: '◆', status: 'planning · say go', next: 'say go', phaseIndex: 0 })
})

test('4. blockers need you, the first one cut, `⊘`', async () => {
  const blocked = step({ work: { phase: 'implementing', blockers: ['waits on the staging database migration for printers', 'b'] }, pullRequest: pr('open') })
  expect(blocked.group).toBe('needs you')
  expect(blocked.glyph).toBe('⊘')
  expect(blocked.status).toBe('blocked by waits on the staging database migration… +1')
  expect(blocked.next).toBe(null)
})

test('4b. an open blocker in Linear: `⊘ blocked by TKT-…` under needs you, before planning and not started', async () => {
  for (const work of [{ phase: 'implementing' as const, blockers: [] }, { phase: 'planning' as const, blockers: [] }, null]) {
    const { phaseIndex: _, ...shown } = step({ work, blockedBy: ['TKT-9008'] })
    expect(shown).toEqual({ group: 'needs you', glyph: '⊘', status: 'blocked by TKT-9008', next: null })
  }
  expect(step({ blockedBy: ['TKT-9008', 'TKT-7', 'TKT-6'] }).status).toBe('blocked by TKT-9008 +2')
  // A working session still reads as working.
  expect(step({ session: { working: true, agent: null }, blockedBy: ['TKT-9008'] }).glyph).toBe('spinner')
  expect(step({ blockedBy: [] }).glyph).toBe('✓')
  expect(blockedText([])).toBe(null)
  expect(railStatus(step({ blockedBy: ['TKT-9008'] }))).toBe('blocked by TKT-9008')
  expect(rowStep(row('TKT-9'), null, ['TKT-9008']).status).toBe('blocked by TKT-9008')
  expect(rowGlyph(row('TKT-9'), theme('claude'), null, ['TKT-9008'])).toEqual({ glyph: '⊘', color: theme('claude').error, dim: false })
})

test('4c. the detail meta tail names the blocker and its title when loaded', async () => {
  const blocked = { ...issue('TKT-9009', false), blockedBy: ['TKT-9008'] }
  expect(blockedMeta(blocked, [issue('TKT-9008', false), blocked])).toBe('blocked by TKT-9008 title TKT-9008')
  expect(blockedMeta({ ...blocked, blockedBy: ['TKT-1', 'TKT-2'] }, [])).toBe('blocked by TKT-1 +1')
  expect(blockedMeta(issue('TKT-1', false), [])).toBe(null)
  // A worktree ticket blocked in Linear lists under needs you.
  const lists = boardLists([row('TKT-1')], [{ ...issue('TKT-1', true), blockedBy: ['TKT-2'] }])
  expect(lists.mine.map(group => group.heading)).toEqual(['needs you'])
})

test('5–9. the pull request decides the ready step', async () => {
  expect(step({})).toEqual({ group: 'ready', glyph: '✓', status: 'ready · /open-pr', next: '/open-pr', phaseIndex: 1 })
  expect(step({ pullRequest: { kind: 'none' } }).status).toBe('ready · /open-pr')
  expect(step({ pullRequest: pr('closed') }).status).toBe('ready · /open-pr')
  expect(step({ pullRequest: pr('draft') })).toEqual({ group: 'ready', glyph: '✓', status: 'ready · mark PR ready', next: '/open-pr', phaseIndex: 2 })
  expect(step({ pullRequest: pr('open') })).toEqual({ group: 'ready', glyph: '✓', status: 'ready · review', next: '/review 42', phaseIndex: 3 })
  expect(step({ pullRequest: pr('open'), green: true })).toEqual({ group: 'ready', glyph: '✓', status: 'ready · merge', next: '/wrap-up 42', phaseIndex: 4 })
  expect(step({ pullRequest: pr('merged') })).toEqual({ group: 'ready', glyph: '✓', status: 'merged · /wrap-up', next: '/wrap-up 42', phaseIndex: 5 })
})

test('status file flags: needs you, ready for review, ready to merge', async () => {
  expect(statusFlags(step({ work: { phase: 'planning', blockers: [] } }))).toEqual({ needsYou: true })
  expect(statusFlags(step({ pullRequest: pr('open') }))).toEqual({ ready: 'review' })
  expect(statusFlags(step({ pullRequest: pr('open'), green: true }))).toEqual({ ready: 'merge' })
  expect(statusFlags(step({ pullRequest: pr('draft') }))).toEqual({})
})

function row(key: string, over: Partial<TowerRailRow> = {}): TowerRailRow {
  return { key, branch: `me/${key.toLowerCase()}-from-branch`, path: `/w/${key}`, phase: 'implementing', next: null, hasPlan: false, blockers: [], session: null, agents: 0, ...over }
}

function issue(id: string, assignedToMe: boolean): TowerIssue {
  return { id, title: `title ${id}`, description: '', priority: 'none', branchName: '', url: '', stateName: '', stateType: 'unstarted', labels: [], assignedToMe, story: null, blockedBy: [], children: [] }
}

test('board lists: mine by step group with Linear titles, candidates without a worktree', async () => {
  const lists = boardLists(
    [row('TKT-1'), row('TKT-2', { phase: 'planning' }), row('TKT-3', { session: 'working' })],
    [issue('tkt-1', true), issue('TKT-4', true), issue('TKT-5', false), issue('TKT-6', false)],
    { 'TKT-1': pr('open') },
  )
  expect(lists.mine.map(group => [group.heading, group.tickets.map(ticket => `${ticket.row.key}:${ticket.title}`)])).toEqual([
    ['needs you', ['TKT-2:from branch']],
    ['working', ['TKT-3:from branch']],
    ['ready for the next step', ['TKT-1:title tkt-1']],
  ])
  expect(lists.candidates.map(group => [group.heading, group.issues.map(one => one.id)])).toEqual([
    ['assigned to you', ['TKT-4']],
    ['free', ['TKT-5', 'TKT-6']],
  ])
  expect(lists.counts).toEqual({ mine: 3, candidates: 3 })
  expect(boardLists([], []).mine).toEqual([])
})

test('the pull request a review session reviews', () => {
  expect(reviewTarget('/review 101', null)).toBe(101)
  expect(reviewTarget('/wrap-up 102', { kind: 'pr', number: 102, state: 'open' })).toBe(102)
  expect(reviewTarget(null, { kind: 'pr', number: 101, state: 'draft' })).toBe(101)
  expect(reviewTarget('/wrap-up 102', { kind: 'pr', number: 102, state: 'merged' })).toBeNull()
  expect(reviewTarget('say go', { kind: 'none' })).toBeNull()
})

test('board lists: a ticket merged or cancelled is no candidate; one started is, only when yours (decision 071, the old launcher\'s in progress)', async () => {
  const started = { ...issue('TKT-7', true), stateType: 'started' }
  const startedFree = { ...issue('TKT-12', false), stateType: 'started' }
  const done = { ...issue('TKT-8', true), stateType: 'completed' }
  const cancelled = { ...issue('TKT-9', false), stateType: 'canceled' }
  const backlog = { ...issue('TKT-10', false), stateType: 'backlog' }
  const lists = boardLists([], [started, startedFree, done, cancelled, backlog, issue('TKT-11', true)])
  expect(lists.candidates.flatMap(group => group.issues.map(one => one.id))).toEqual(['TKT-7', 'TKT-11', 'TKT-10'])
  expect(lists.counts.candidates).toEqual(3)
  // With a worktree here, started or not, it is no candidate.
  expect(boardLists([row('TKT-7')], [started]).counts.candidates).toBe(0)
})

test('a gh failure reads as no pull request for the step', async () => {
  const one = row('TKT-1', { phase: 'implementing' })
  expect(rowStep(one, { kind: 'error', message: 'none of the git remotes point to a known GitHub host' })).toEqual(rowStep(one, { kind: 'none' }))
})
