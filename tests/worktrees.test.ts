import { expect, test } from 'claude-code/testing'

import { ticketIdPattern } from '../hooks/core/config'
import { LINEAR_CONFIG } from './linearConfig'
import { gitError, newWorktree as planWith, otherWorktrees, parseWorktreePorcelain, repoName, slug, ticketIdFromBranch, ticketWorktrees, worktreeKey } from '../hooks/core/worktrees'

const ID = ticketIdPattern(LINEAR_CONFIG.tickets)
const keyOf = (entry: Parameters<typeof worktreeKey>[0]) => worktreeKey(entry, ID)
const newWorktree = (input: Parameters<typeof planWith>[0]) => planWith(input, LINEAR_CONFIG.worktree, '/home/me')

const PORCELAIN = [
  'worktree /repo/shopapp',
  'HEAD 1111111111111111111111111111111111111111',
  'branch refs/heads/main',
  '',
  'worktree /repo/wt/tkt-1650',
  'HEAD 2222222222222222222222222222222222222222',
  'branch refs/heads/feature/tkt-1650-wrong-invite-path',
  '',
  'worktree /repo/wt/spike',
  'HEAD 3333333333333333333333333333333333333333',
  'branch refs/heads/spike/cache-warmup',
  '',
  'worktree /repo/wt/hotfix-cache',
  'HEAD 4444444444444444444444444444444444444444',
  'detached',
  '',
  'worktree /repo/wt/locked',
  'HEAD 5555555555555555555555555555555555555555',
  'branch refs/heads/TKT-7-locked',
  'locked reason here',
  '',
  'worktree /repo/wt/gone',
  'HEAD 6666666666666666666666666666666666666666',
  'branch refs/heads/tkt-8-gone',
  'prunable gitdir file points to non-existent location',
  '',
].join('\n')

test('parses every porcelain block with its flags', async () => {
  const entries = parseWorktreePorcelain(PORCELAIN)
  expect(entries.length).toBe(6)
  expect(entries[0]).toEqual({
    path: '/repo/shopapp', head: '1111111111111111111111111111111111111111', branch: 'main',
    isBare: false, isLocked: false, isPrunable: false,
  })
  expect(entries[3]?.branch).toBe(null)
  expect(entries[4]?.isLocked).toBe(true)
  expect(entries[5]?.isPrunable).toBe(true)
})

test('ticket worktrees skip the main checkout, prunable entries and branches without a ticket id', async () => {
  const keys = ticketWorktrees(parseWorktreePorcelain(PORCELAIN), ID).map(keyOf)
  expect(keys).toEqual(['TKT-1650', 'TKT-7'])
})

test('the other worktrees are the detached ones and the branches without a ticket id', async () => {
  const others = otherWorktrees(parseWorktreePorcelain(PORCELAIN), ID).map(keyOf)
  expect(others).toEqual(['spike/cache-warmup', 'hotfix-cache'])
  const real = 'worktree /r/main\nHEAD a\nbranch refs/heads/staging\n\nworktree /r/BRAG-DEMO\nHEAD b\ndetached\n\nworktree /r/SHAPE-autocharge\nHEAD c\nbranch refs/heads/feature/autocharge\n\nworktree /r/TKT-9001\nHEAD d\nbranch refs/heads/feature/tkt-9001-x\n'
  expect(ticketWorktrees(parseWorktreePorcelain(real), ID).map(keyOf)).toEqual(['TKT-9001'])
  expect(otherWorktrees(parseWorktreePorcelain(real), ID).map(entry => [entry.path, entry.branch])).toEqual([['/r/BRAG-DEMO', null], ['/r/SHAPE-autocharge', 'feature/autocharge']])
})

test('ticket id from a branch name', async () => {
  expect(ticketIdFromBranch('feature/tkt-1650-wrong-invite-path', ID)).toBe('TKT-1650')
  expect(ticketIdFromBranch('TKT-42', ID)).toBe('TKT-42')
  expect(ticketIdFromBranch('fix/Tkt-9_typo', ID)).toBe('TKT-9')
  expect(ticketIdFromBranch('spike/cache-warmup', ID)).toBe(null)
  expect(ticketIdFromBranch('xtkt-12', ID)).toBe(null)
  expect(ticketIdFromBranch('ABC-12-other-team', ID)).toBe(null)
})

test('repo name is the last path segment', async () => {
  expect(repoName('/home/me/shopapp/')).toBe('shopapp')
})

const BASE = { repo: '/r/shopapp', ticket: 'TKT-77', issue: null, existing: [], blockerBranch: null, originBranches: ['staging'], baseBranch: 'staging' }

test('a new worktree with none beside it goes to ../<repo>-<TICKET> from origin/staging', () => {
  expect(newWorktree({ ...BASE, issue: { title: 'Fix the: invite path!', branchName: '' } }))
    .toEqual({ path: '/r/shopapp-TKT-77', branch: 'tkt-77-fix-the-invite-path', base: 'origin/staging' })
})

test('a new worktree goes where most ticket worktrees are, named like them', () => {
  const existing = [
    { path: '/w/TKT-1', ticket: 'TKT-1' },
    { path: '/w/TKT-2', ticket: 'TKT-2' },
    { path: '/r/shopapp-TKT-3', ticket: 'TKT-3' },
  ]
  expect(newWorktree({ ...BASE, existing }).path).toBe('/w/TKT-77')
  expect(newWorktree({ ...BASE, existing: [{ path: '/r/shopapp-TKT-3', ticket: 'TKT-3' }] }).path).toBe('/r/shopapp-TKT-77')
})

test("Linear's branch name wins; the title slug is cut at 40 characters", () => {
  expect(newWorktree({ ...BASE, issue: { title: 'x', branchName: 'me/tkt-77-from-linear' } }).branch).toBe('me/tkt-77-from-linear')
  expect(slug('a'.repeat(39) + ' bcd')).toBe('a'.repeat(39))
  expect(newWorktree(BASE).branch).toBe('tkt-77')
})

test("the first open blocker's branch is the base only when it is on origin", () => {
  expect(newWorktree({ ...BASE, blockerBranch: 'me/tkt-70-x', originBranches: ['staging', 'me/tkt-70-x'] }).base).toBe('origin/me/tkt-70-x')
  expect(newWorktree({ ...BASE, blockerBranch: 'me/tkt-70-x' }).base).toBe('origin/staging')
})

test("git's failure is told by its fatal line, not by its progress line", () => {
  expect(gitError("Preparing worktree (new branch 'x')\nfatal: '/r/x' already exists\n")).toBe("fatal: '/r/x' already exists")
  expect(gitError('could not lock\n')).toBe('could not lock')
  expect(gitError('')).toBe('')
})

test('a repository at the root: the new worktree is /<repo>-<TICKET>, never //…', () => {
  expect(newWorktree({ ...BASE, repo: '/shopapp' }).path).toBe('/shopapp-TKT-77')
  expect(newWorktree({ ...BASE, repo: '/shopapp', existing: [{ path: '/TKT-1', ticket: 'TKT-1' }] }).path).toBe('/TKT-77')
})

test('worktree configuration: the path template, no following, no stacking, a branch template', () => {
  const own = { ...LINEAR_CONFIG.worktree, followExisting: false, stackOnBlocker: false, pathTemplate: '~/tower-work/{repo}/{n}-{slug}', slugMax: 10 }
  const existing = [{ path: '/w/TKT-1', ticket: 'TKT-1' }]
  const issue = { title: 'Fix the: invite path!', branchName: '' }
  const plan = planWith({ ...BASE, issue, existing, blockerBranch: 'me/tkt-70-x', originBranches: ['staging', 'me/tkt-70-x'] }, own, '/home/me')
  expect(plan).toEqual({ path: '/home/me/tower-work/shopapp/77-fix-the-in', branch: 'tkt-77-fix-the-in', base: 'origin/staging' })
  const template = { ...own, branch: { kind: 'template' as const, template: 'feature/{n}-{slug}', kindFromLabel: false } }
  expect(planWith({ ...BASE, issue: { ...issue, branchName: 'me/from-linear' } }, template, '/home/me').branch).toBe('feature/77-fix-the-in')
})

