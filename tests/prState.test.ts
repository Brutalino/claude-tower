import { expect, test } from 'claude-code/testing'
import { parseChecks, parsePullRequest as parsePullRequestWith, reviewBlockerCount as reviewBlockerCountWith, selfReviews as selfReviewsWith } from '../hooks/core/detail'
import { checkEvents, checklistLines, fixCiPrompt, PR_BOX_ROWS, prBox, prCardLine, prVerdict, shortCheck, waitsOnPerson, waitTone, type PrCheck, type PrFacts } from '../hooks/core/prState'
import { LINEAR_CONFIG } from './linearConfig'

const parsePullRequest = (result: Parameters<typeof parsePullRequestWith>[0]) => parsePullRequestWith(result, LINEAR_CONFIG.review)
const reviewBlockerCount = (comments: Parameters<typeof reviewBlockerCountWith>[0]) => reviewBlockerCountWith(comments, LINEAR_CONFIG.review)
const selfReviews = (comments: Parameters<typeof selfReviewsWith>[0]) => selfReviewsWith(comments, LINEAR_CONFIG.review)

const NOW = Date.parse('2026-10-09T12:00:00Z')
const pass = (name: string): PrCheck => ({ name, state: 'passing', detailsUrl: null, startedAt: null })
const fail = (name: string, url: string | null = null): PrCheck => ({ name, state: 'failing', detailsUrl: url, startedAt: null })
const run = (name: string, startedAt: string | null = null): PrCheck => ({ name, state: 'running', detailsUrl: null, startedAt })
const base: PrFacts = { number: 7, state: 'open', checks: 'passing', green: true, rounds: 2, reviewBlockers: 0, checkList: [pass('ci / lint'), pass('ci / test')], mergeable: 'MERGEABLE', baseRefName: 'staging' }

test('parseChecks: names, states, links and starts; unknown and nameless entries dropped', () => {
  expect(parseChecks([
    { name: 'ci / unit-tests', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://x/run/1' },
    { name: 'e2e', status: 'IN_PROGRESS', conclusion: '', startedAt: '2026-10-09T11:56:00Z' },
    { context: 'deploy/preview', state: 'SUCCESS', targetUrl: 'https://x/preview' },
    { status: 'COMPLETED', conclusion: 'SUCCESS' },
    null, 'junk',
  ])).toEqual([
    { name: 'ci / unit-tests', state: 'failing', detailsUrl: 'https://x/run/1', startedAt: null },
    { name: 'e2e', state: 'running', detailsUrl: null, startedAt: '2026-10-09T11:56:00Z' },
    { name: 'deploy/preview', state: 'passing', detailsUrl: 'https://x/preview', startedAt: null },
  ])
  expect(parseChecks(undefined)).toEqual([])
})

test('parsePullRequest: the new facts, each absent one null', () => {
  const pr = parsePullRequest({ exitCode: 0, stderr: '', stdout: JSON.stringify({
    number: 9, state: 'OPEN', isDraft: false, mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY', reviewDecision: 'CHANGES_REQUESTED',
    reviews: [{ state: 'COMMENTED' }, { state: 'CHANGES_REQUESTED' }, 'x'], updatedAt: '2026-10-01T00:00:00Z', baseRefName: 'staging',
    statusCheckRollup: [{ name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }],
  }) })
  expect(pr).toMatchObject({ kind: 'pr', mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY', reviewDecision: 'CHANGES_REQUESTED', reviewStates: ['COMMENTED', 'CHANGES_REQUESTED'],
    updatedAt: '2026-10-01T00:00:00Z', createdAt: null, baseRefName: 'staging', reviewBlockers: null, checkList: [pass('lint')] })
})

test('reviewBlockerCount: none, listed items, prose, no review', () => {
  const review = (blockers: string) => [{ createdAt: '1', body: `## Self-review (round 1)\n\n### Blockers\n${blockers}\n\n### Suggestions\n_(none)_` }]
  expect(reviewBlockerCount(review('_(none)_'))).toBe(0)
  expect(reviewBlockerCount(review('- one\n- two\n  more of two'))).toBe(2)
  expect(reviewBlockerCount(review('Something is wrong.'))).toBe(1)
  expect(reviewBlockerCount([])).toBe(null)
})

test('prVerdict READY: open, green checks, mergeable, a green self-review', () => {
  const verdict = prVerdict(base, NOW)!
  expect(verdict.label).toBe('READY')
  expect(verdict.tone).toBe('ready')
  expect(verdict.items).toEqual([{ mark: '✓', text: 'checks 2/2' }, { mark: '✓', text: 'self-review round 2' }, { mark: '✓', text: 'no conflict with staging' }])
})

test('prVerdict BLOCKED n: failing checks + review blockers + conflict, failures first', () => {
  const verdict = prVerdict({ ...base, checks: 'failing', green: false, checkList: [pass('ci / lint'), fail('ci / unit-tests')], reviewBlockers: 2, mergeable: 'CONFLICTING' }, NOW)!
  expect(verdict.label).toBe('BLOCKED 4')
  expect(verdict.tone).toBe('blocked')
  expect(verdict.items.map(item => `${item.mark} ${item.text}`)).toEqual([
    '✗ ci / unit-tests', '✗ self-review round 2: 2 blockers', '✗ merge conflict with staging', '· checks 1/2 passed',
  ])
  expect(prVerdict({ ...base, rounds: 0, reviewBlockers: null, green: false }, NOW)!.label).toBe('BLOCKED 1')
  expect(prVerdict({ ...base, reviewDecision: 'CHANGES_REQUESTED' }, NOW)!.label).toBe('BLOCKED 1')
  expect(prVerdict({ ...base, checks: 'none', green: false, checkList: [] }, NOW)!.items[0]).toEqual({ mark: '✗', text: 'no checks reported' })
})

test('prVerdict CONFLICTS, WAITING ON CHECKS, DRAFT; null when merged or closed', () => {
  expect(prVerdict({ ...base, mergeable: 'CONFLICTING' }, NOW)!.label).toBe('CONFLICTS')
  const waiting = prVerdict({ ...base, checks: 'running', green: false, checkList: [pass('ci / lint'), run('e2e', '2026-10-09T11:56:00Z')] }, NOW)!
  expect(waiting.label).toBe('WAITING ON CHECKS')
  expect(waiting.tone).toBe('waiting')
  expect(waiting.items[0]).toEqual({ mark: '◷', text: 'e2e running 4m' })
  const draft = prVerdict({ ...base, state: 'draft', checks: 'none', green: false, checkList: [], rounds: 0, reviewBlockers: null }, NOW)!
  expect([draft.label, draft.tone]).toEqual(['DRAFT', 'draft'])
  expect(draft.items).toContainEqual({ mark: '·', text: 'no checks reported' })
  expect(prVerdict({ ...base, state: 'merged' }, NOW)).toBe(null)
  expect(prVerdict({ ...base, state: 'closed' }, NOW)).toBe(null)
})

test('prCardLine: the verdict and the first failing item, a check by its short name', () => {
  const pr = { ...base, number: 2408, checks: 'failing' as const, green: false, checkList: [pass('ci / lint'), fail('ci / unit-tests')] }
  expect(prCardLine(pr, prVerdict(pr, NOW)!)).toBe('PR #2408 · BLOCKED 1 · ✗ unit-tests')
  expect(prCardLine(base, prVerdict(base, NOW)!)).toBe('PR #7 · READY')
  const running = { ...base, checks: 'running' as const, checkList: [run('ci / e2e', '2026-10-09T11:58:00Z')] }
  expect(prCardLine(running, prVerdict(running, NOW)!)).toBe('PR #7 · WAITING ON CHECKS · ◷ e2e running 2m')
  expect(shortCheck('build')).toBe('build')
})

test('checklistLines: up to five, then the rest counted', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ mark: '✗' as const, text: `c${i}` }))
  expect(checklistLines(items)).toEqual({ items: items.slice(0, 5), more: 2 })
  expect(checklistLines(items.slice(0, 3))).toEqual({ items: items.slice(0, 3), more: 0 })
})

test('waitTone: yellow from 3 days, red from 14; waitsOnPerson', () => {
  const day = 86_400_000
  expect(waitTone(NOW - 2 * day, NOW)).toEqual({ days: 2, tone: null })
  expect(waitTone(NOW - 3 * day, NOW)).toEqual({ days: 3, tone: 'yellow' })
  expect(waitTone(NOW - 14 * day, NOW)).toEqual({ days: 14, tone: 'red' })
  expect(waitTone(null, NOW)).toBe(null)
  expect(waitTone(Number.NaN, NOW)).toBe(null)
  expect(waitsOnPerson('needs you', 'planning · say go')).toBe(true)
  expect(waitsOnPerson('ready', 'ready · merge')).toBe(true)
  expect(waitsOnPerson('ready', 'ready · review')).toBe(true)
  expect(waitsOnPerson('ready', 'not started · /start-ticket')).toBe(false)
  expect(waitsOnPerson('working', 'working')).toBe(false)
})

test('fixCiPrompt: the check, the PR and its link; no link, no colon', () => {
  expect(fixCiPrompt({ name: 'unit-tests', detailsUrl: 'https://x/run/1' }, 103))
    .toBe('CI check "unit-tests" failed on PR #103: https://x/run/1. Read the failing log with gh run view --log-failed and fix it.')
  expect(fixCiPrompt({ name: 'unit-tests', detailsUrl: null }, 103))
    .toBe('CI check "unit-tests" failed on PR #103. Read the failing log with gh run view --log-failed and fix it.')
})

test('prBox: label, tones, border, failures first, up to five rows then +n more, the first failing check', () => {
  const ago = (ms: number) => `${Math.round(ms / 3_600_000)}h ago`
  const updatedAt = '2026-10-09T10:00:00Z'
  const blocked = prBox({ ...base, updatedAt, checks: 'failing', green: false, reviewBlockers: 1, mergeable: 'CONFLICTING',
    checkList: [pass('ci / lint'), fail('ci / unit-tests', 'https://x/1'), fail('ci / e2e'), run('ci / build')] }, NOW, false, ago)!
  expect(blocked).toMatchObject({ number: 7, label: 'BLOCKED 4', tone: 'error', border: 'error', right: { text: 'updated 2h ago', tone: 'dim' }, more: 1 })
  expect(blocked.rows.map(row => `${row.mark} ${row.text} ${row.tone}`)).toEqual([
    '✗ ci / unit-tests error', '✗ ci / e2e error', '✗ self-review round 2: 1 blocker error', '✗ merge conflict with staging error', '◷ ci / build running needsYou',
  ])
  expect(blocked.failed?.name).toBe('ci / unit-tests')

  const ready = prBox({ ...base, updatedAt }, NOW, false, ago)!
  expect(ready).toMatchObject({ label: 'READY', tone: 'done', border: 'done', more: 0, failed: null })
  expect(ready.rows.map(row => row.tone)).toEqual(['done', 'done', 'done'])
  expect(prBox({ ...base, checks: 'running', checkList: [run('ci / e2e')] }, NOW, false, ago)).toMatchObject({ label: 'WAITING ON CHECKS', tone: 'needsYou', border: 'needsYou', right: { text: '' } })
  expect(prBox({ ...base, mergeable: 'CONFLICTING' }, NOW, false, ago)).toMatchObject({ label: 'CONFLICTS', tone: 'error', border: 'needsYou' })
  expect(prBox({ ...base, state: 'draft' }, NOW, false, ago)).toMatchObject({ label: 'DRAFT', tone: 'dim', border: 'panel' })
  expect(prBox({ ...base, state: 'merged' }, NOW, false, ago)).toBe(null)
})

test('PR #2453: a self-review whose heading ends `— head <sha>` counts: rounds 1, `✓ self-review round 1`', () => {
  const body = '## Self-review (round 1) — head `507cf535b`\n\n### Scope check\nOk.\n\n### Blockers\n_(none)_\n\n### Suggestions\n3. Add the partner test.'
  const comments = [{ body, createdAt: '2026-10-09T11:00:00Z' }, { body: '## Self-reviewer notes\nnot one', createdAt: '2026-10-09T11:01:00Z' }]
  expect(selfReviews(comments).map(comment => comment.createdAt)).toEqual(['2026-10-09T11:00:00Z'])
  expect(selfReviews([{ body: '## Self-review\n\n### Blockers\n_(none)_', createdAt: '1' }])).toHaveLength(1)
  const pr = parsePullRequest({ exitCode: 0, stderr: '', stdout: JSON.stringify({
    number: 2453, state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', baseRefName: 'staging', headRefOid: '507cf535b', comments,
    statusCheckRollup: [{ name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }],
  }) })
  expect(pr).toMatchObject({ kind: 'pr', rounds: 1, reviewBlockers: 0, green: true })
  if (pr.kind !== 'pr') throw new Error('not a pr')
  const verdict = prVerdict({ ...pr, number: 2453, state: 'open' }, NOW)!
  expect(verdict.items).toContainEqual({ mark: '✓', text: 'self-review round 1' })
  expect(verdict.label).toBe('READY')
})

test('prBox: the wait age in its colour while the ticket waits on the person, else the last update', () => {
  const ago = () => 'ago'
  const day = 86_400_000
  const at = (days: number) => new Date(NOW - days * day).toISOString()
  expect(prBox({ ...base, updatedAt: at(1) }, NOW, true, ago)!.right).toEqual({ text: 'waiting 1d', tone: 'dim' })
  expect(prBox({ ...base, updatedAt: at(4) }, NOW, true, ago)!.right).toEqual({ text: 'waiting 4d', tone: 'needsYou' })
  expect(prBox({ ...base, updatedAt: at(15) }, NOW, true, ago)!.right).toEqual({ text: 'waiting 15d', tone: 'error' })
  expect(prBox({ ...base, updatedAt: at(15) }, NOW, false, ago)!.right).toEqual({ text: 'updated ago', tone: 'dim' })
  expect(PR_BOX_ROWS).toBe(9)
})

test('checkEvents: a flip to failing once per ticket, check and head; checks green once; first reads quiet', () => {
  const row = (checks: 'running' | 'failing' | 'passing', list: PrCheck[], head = 'a1') => ({ key: 'TKT-1', pr: { number: 7, headRefOid: head, checks, checkList: list } })
  const first = checkEvents(null, [row('running', [run('unit-tests')])], null)
  expect(first.events).toEqual([])
  const flipped = checkEvents(first.seen, [row('failing', [fail('unit-tests')])], null)
  expect(flipped.events.map(event => [event.kind, event.hint])).toEqual([['needs you', 'ci failed · unit-tests']])
  // The same failure read again, or after a pending blink on the same head: nothing more.
  expect(checkEvents(flipped.seen, [row('failing', [fail('unit-tests')])], null).events).toEqual([])
  const blink = checkEvents(flipped.seen, [row('running', [run('unit-tests')])], null)
  expect(checkEvents(blink.seen, [row('failing', [fail('unit-tests')])], null).events).toEqual([])
  // A new head fails again: announced again.
  expect(checkEvents(flipped.seen, [row('failing', [fail('unit-tests')], 'b2')], null).events).toHaveLength(1)
  // Running to all green: one ready event; never for the centre's ticket.
  const green = checkEvents(first.seen, [row('passing', [pass('unit-tests')])], null)
  expect(green.events.map(event => [event.kind, event.hint])).toEqual([['ready', 'checks green']])
  expect(checkEvents(first.seen, [row('passing', [pass('unit-tests')])], 'TKT-1').events).toEqual([])
  // The centre's failure chimes only.
  expect(checkEvents(first.seen, [row('failing', [fail('unit-tests')])], 'TKT-1').events[0]?.centre).toBe(true)
  // A ticket first seen failing raises nothing.
  expect(checkEvents({ reads: {}, announced: [] }, [row('failing', [fail('unit-tests')])], null).events).toEqual([])
})
