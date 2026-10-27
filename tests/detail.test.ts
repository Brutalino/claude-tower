import { expect, test } from 'claude-code/testing'

import type { TowerRailRow } from '../types/index'
import {
  checksSummary,
  detailRow,
  formatAge,
  isStale,
  paneColumns,
  parseBehind,
  parsePaneWidth,
  parsePullRequest as parsePullRequestWith,
  phaseProgress,
  reviewVerdict as reviewVerdictWith,
  planExcerpt,
  PLAN_MAX_CHARS,
  titleFromBranch,
  truncateStart,
} from '../hooks/core/detail'
import { parseWorkDetail } from '../hooks/core/workState'
import { ticketStep as ticketStepWith } from '../hooks/core/nextStep'
import { ticketLiveSessions } from '../hooks/core/sessionStatus'
import { LINEAR_CONFIG } from './linearConfig'

const parsePullRequest = (result: Parameters<typeof parsePullRequestWith>[0]) => parsePullRequestWith(result, LINEAR_CONFIG.review)
const reviewVerdict = (comments: Parameters<typeof reviewVerdictWith>[0], headRefOid: string | null, checks: Parameters<typeof reviewVerdictWith>[2]) => reviewVerdictWith(comments, headRefOid, checks, LINEAR_CONFIG.review)

type StepInputOf = Parameters<typeof ticketStepWith>[0]

const ticketStep = (input: StepInputOf) => ticketStepWith(input, LINEAR_CONFIG.workflow)

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '' })

const GH_DRAFT = ok('{"number":12,"state":"OPEN","isDraft":true,"reviewDecision":"","statusCheckRollup":[],"url":"https://github.com/o/r/pull/12"}')
const GH_OPEN_FAILING = ok(JSON.stringify({
  number: 13, state: 'OPEN', isDraft: false, reviewDecision: 'REVIEW_REQUIRED', url: 'https://github.com/o/r/pull/13',
  statusCheckRollup: [
    { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
    { __typename: 'StatusContext', state: 'PENDING' },
  ],
}))
const GH_MERGED = ok(JSON.stringify({
  number: 14, state: 'MERGED', isDraft: false, reviewDecision: 'APPROVED', url: 'https://github.com/o/r/pull/14',
  statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }],
}))
const GH_NONE = { exitCode: 1, stdout: '', stderr: 'no pull requests found for branch "me/tkt-2-second-thing"\n' }

test('gh pr view output parses into the pull request block', async () => {
  expect(parsePullRequest(GH_DRAFT)).toMatchObject({ kind: 'pr', number: 12, state: 'draft', checks: 'none', headRefOid: null, green: false, rounds: 0, lastReviewAt: null })
  expect(parsePullRequest(GH_OPEN_FAILING)).toMatchObject({ kind: 'pr', number: 13, state: 'open', checks: 'failing', headRefOid: null, green: false, rounds: 0, lastReviewAt: null })
  expect(parsePullRequest(GH_MERGED)).toMatchObject({ kind: 'pr', number: 14, state: 'merged', checks: 'passing', headRefOid: null, green: false, rounds: 0, lastReviewAt: null })
  expect(parsePullRequest(GH_NONE)).toEqual({ kind: 'none' })
})

test('gh missing is unavailable; any other failure (signed out included) keeps its first line', async () => {
  expect(parsePullRequest(null)).toEqual({ kind: 'unavailable' })
  expect(parsePullRequest({ exitCode: 127, stdout: '', stderr: '' })).toEqual({ kind: 'unavailable' })
  expect(parsePullRequest({ exitCode: 4, stdout: '', stderr: 'To get started with GitHub CLI, please run:  gh auth login\n' }))
    .toEqual({ kind: 'error', message: 'To get started with GitHub CLI, please run:  gh auth login' })
  expect(parsePullRequest({ exitCode: 1, stdout: '', stderr: 'no pull requests found for branch "x"' })).toEqual({ kind: 'none' })
  expect(parsePullRequest({ exitCode: 1, stdout: '', stderr: 'none of the git remotes point to a known GitHub host\nmore' }))
    .toEqual({ kind: 'error', message: 'none of the git remotes point to a known GitHub host' })
  expect(parsePullRequest(ok('not json')).kind).toBe('error')
})

test('checks summary: running beats passing, empty is none', async () => {
  expect(checksSummary([{ status: 'IN_PROGRESS' }, { conclusion: 'SUCCESS', status: 'COMPLETED' }])).toBe('running')
  expect(checksSummary([{ state: 'SUCCESS' }, { status: 'COMPLETED', conclusion: 'SKIPPED' }])).toBe('passing')
  expect(checksSummary([])).toBe('none')
  expect(checksSummary(null)).toBe('none')
})

test('phase steps come from the ticket step', async () => {
  const pr = (state: 'draft' | 'open' | 'merged' | 'closed') => ({ kind: 'pr' as const, number: 1, state, checks: 'none' as const, headRefOid: 'abc', green: false })
  const progress = (phase: 'planning' | 'implementing' | 'not started', pullRequest: ReturnType<typeof pr> | null, green = false) =>
    phaseProgress(ticketStep({ ticket: 'TKT-1', work: phase === 'not started' ? null : { phase, blockers: [] }, pullRequest, session: { working: false, agent: null }, green }))
  expect(progress('implementing', pr('merged'))).toEqual({ done: 5, current: null })
  expect(progress('implementing', pr('open'))).toEqual({ done: 3, current: 3 })
  expect(progress('implementing', pr('open'), true)).toEqual({ done: 4, current: 4 })
  expect(progress('not started', pr('draft'))).toEqual({ done: 2, current: 2 })
  expect(progress('implementing', null)).toEqual({ done: 1, current: 1 })
  expect(progress('planning', null)).toEqual({ done: 0, current: 0 })
  expect(progress('not started', null)).toEqual({ done: 0, current: null })
  expect(progress('implementing', pr('closed'))).toEqual({ done: 1, current: 1 })
})

const REVIEW = (round: string, blockers: string) =>
  `## Self-review${round}\n\n### Scope check\nMatches.\n\n### Quality check\n- **Performance:** no concerns\n\n### Blockers\n${blockers}\n\n### Suggestions\n_(none)_\n\n### Good stuff\nTests.`

test('the verdict is green only for a clean newest self-review and passing checks on the head', async () => {
  const clean = { body: REVIEW(' (round 2)', '_(none)_'), createdAt: '2026-10-02T10:00:00Z' }
  const dirty = { body: REVIEW('', '1. Missing test.'), createdAt: '2026-10-01T10:00:00Z' }
  expect(reviewVerdict([dirty, clean], 'abc', 'passing')).toBe(true)
  expect(reviewVerdict([dirty, clean], 'abc', 'none')).toBe(false)
  expect(reviewVerdict([dirty, clean], 'abc', 'running')).toBe(false)
  expect(reviewVerdict([dirty, clean], null, 'passing')).toBe(false)
  expect(reviewVerdict([clean, { ...dirty, createdAt: '2026-10-03T10:00:00Z' }], 'abc', 'passing')).toBe(false)
  expect(reviewVerdict([{ body: 'LGTM ### Blockers _(none)_', createdAt: '2026-10-04T10:00:00Z' }], 'abc', 'passing')).toBe(false)
  expect(reviewVerdict([], 'abc', 'passing')).toBe(false)
  const gh = ok(JSON.stringify({
    number: 15, state: 'OPEN', isDraft: false, headRefOid: 'abc', comments: [clean, 'junk', { body: 3 }],
    statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
  }))
  expect(parsePullRequest(gh)).toMatchObject({ kind: 'pr', number: 15, state: 'open', checks: 'passing', headRefOid: 'abc', green: true, rounds: 1, lastReviewAt: clean.createdAt })
})

test('rounds count every self-review heading: the first without a round number, later ones with it', async () => {
  const gh = ok(JSON.stringify({
    number: 16, state: 'OPEN', isDraft: false, headRefOid: 'abc', statusCheckRollup: [],
    comments: [
      { body: REVIEW('', '1. Missing test.'), createdAt: '2026-10-01T10:00:00Z' },
      { body: 'Fixed in abc.', createdAt: '2026-10-01T11:00:00Z' },
      { body: REVIEW(' (round 2)', '_(none)_'), createdAt: '2026-10-02T10:00:00Z' },
      { body: REVIEW(' (Round 3)', '_(none)_'), createdAt: '2026-10-03T10:00:00Z' },
      { body: 'See ## Self-review above.', createdAt: '2026-10-04T10:00:00Z' },
    ],
  }))
  const parsed = parsePullRequest(gh)
  expect(parsed.kind === 'pr' ? [parsed.rounds, parsed.lastReviewAt] : null).toEqual([3, '2026-10-03T10:00:00Z'])
})

test('title from branch drops the owner and the ticket id', async () => {
  expect(titleFromBranch('me/tkt-2-second-thing', 'TKT-2')).toBe('second thing')
  expect(titleFromBranch('feature/tkt-1650-wrong-invite-path', 'TKT-1650')).toBe('wrong invite path')
  expect(titleFromBranch('spike/cache-warmup', 'spike/cache-warmup')).toBe('cache warmup')
})

test('ages are one short unit', async () => {
  expect(formatAge(12_400)).toBe('12s')
  expect(formatAge(4 * 60_000 + 59_000)).toBe('4m')
  expect(formatAge(2 * 3_600_000 + 5)).toBe('2h')
  expect(formatAge(-5)).toBe('0s')
})

test('start truncation keeps the end', async () => {
  expect(truncateStart('/home/me/wt/tkt-2', 30)).toBe('/home/me/wt/tkt-2')
  expect(truncateStart('/home/me/wt/tkt-2', 8)).toBe('…t/tkt-2')
  expect(truncateStart('abc', 0)).toBe('')
})

test('the width request leaves the transcript its columns, never below 23', async () => {
  expect(paneColumns(220)).toBe(194)
  expect(paneColumns(40)).toBe(23)
  expect(paneColumns(null)).toBeUndefined()
  expect(parsePaneWidth('220\n')).toBe(220)
  expect(parsePaneWidth('@0')).toBeNull()
})

test('the detail shows the focused ticket, else the centre, else the first row', async () => {
  const row = (key: string) => ({ key }) as TowerRailRow
  const rows = [row('TKT-1'), row('TKT-2'), row('TKT-3')]
  expect(detailRow(rows, 'TKT-3', 'TKT-2')?.key).toBe('TKT-3')
  expect(detailRow(rows, null, 'TKT-2')?.key).toBe('TKT-2')
  expect(detailRow(rows, 'gone', null)?.key).toBe('TKT-1')
  expect(detailRow([], null, null)).toBeNull()
})

test('behind count, staleness, plan cut, state detail and live sessions', async () => {
  expect(parseBehind(ok('1\n'))).toBe(1)
  expect(parseBehind({ exitCode: 128, stdout: '' })).toBeNull()
  expect(isStale(0, 59_999)).toBe(false)
  expect(isStale(0, 60_000)).toBe(true)
  expect(planExcerpt('short')).toBe('short')
  expect(planExcerpt('# Plan\n1. one')).toBe('1. one')
  expect(planExcerpt('Plan\n\n1. one\n2. two')).toBe('1. one\n2. two')
  expect(planExcerpt('## Steps\n1. one')).toBe('1. one')
  expect(planExcerpt('Planning notes\n1. one')).toBe('Planning notes\n1. one')
  expect(planExcerpt('x'.repeat(PLAN_MAX_CHARS + 10)).length).toBe(PLAN_MAX_CHARS + 3)
  expect(parseWorkDetail('{"plan":"## Plan","base":"main"}')).toEqual({ plan: '## Plan', base: 'main' })
  expect(parseWorkDetail(undefined)).toEqual({ plan: null, base: null })
  const status = (id: string, ticket: string | null, state: 'idle' | 'working' | 'ended', since: number, updatedAt: number) =>
    ({ v: 1, id, role: 'ticket', ticket, cwd: '/', pane: null, state, since, updatedAt }) as const
  expect(ticketLiveSessions([
    status('a', 'TKT-1', 'working', 50, 90_000), status('b', 'TKT-1', 'ended', 10, 90_000),
    status('c', 'TKT-2', 'idle', 10, 90_000), status('d', 'TKT-1', 'idle', 5, 1),
  ], 'TKT-1', 100_000)).toEqual([{ role: 'ticket', state: 'working', since: 50 }])
})
