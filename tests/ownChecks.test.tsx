import { expect, mock, test } from 'claude-code/testing'

import { validateConfig } from '../hooks/core/config'
import { parsePullRequest, parsePullRequestList, reviewLabel } from '../hooks/core/detail'
import { LINEAR_CONFIG } from './linearConfig'
import { compactAgo, parseRecordedChecks, parseReleaseTags, prBox, prCardLine, prVerdict, recordedFresh, recordedItem, releaseGlob, releaseItem } from '../hooks/core/prState'
import { BRANCH, HEAD_26, IN_PROGRESS, PORCELAIN, PULL_REQUEST, RELEASE_TAG, REPO, STATE, STORED, stateFile26, storedConfig } from './repoGit'

// Decision 055: a configuration without GitHub CI (oink's) reads its checks from the state file, against the PR's
// head commit, and shows the last release tag as a note that never blocks.

const NOW = Date.parse('2026-10-12T12:00:00Z')
const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '' })
const review = () => {
  const result = validateConfig(storedConfig())
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result.config.review
}
const READY_REVIEW = '## Review (round 2)\n\nAll good.\n\nVerdict: ready to merge'
const RELEASE = { pattern: 'build-*', tag: 'build-14', at: Date.parse('2026-10-09T12:00:00Z'), since: 6 }

test('the state file\'s checks: sha, at and what ran; null when the file, the field or its sha is missing', () => {
  expect(parseRecordedChecks(stateFile26('fresh'))).toEqual({ sha: HEAD_26, at: '2026-10-12T09:30:00Z', ran: ['unit', 'ui-smoke'] })
  expect(parseRecordedChecks(JSON.stringify({ checks: { sha: 'abc1234' } }))).toEqual({ sha: 'abc1234', at: null, ran: [] })
  expect(parseRecordedChecks(stateFile26('none'))).toBeNull()
  expect(parseRecordedChecks(JSON.stringify({ checks: { at: 'x' } }))).toBeNull()
  expect(parseRecordedChecks('not json')).toBeNull()
  expect(parseRecordedChecks(undefined)).toBeNull()
})

test('the recorded checks against the head: fresh, stale or none; a short sha matches the head\'s start', () => {
  const recorded = { sha: HEAD_26, at: null, ran: ['unit', 'ui-smoke'] }
  expect(recordedItem(recorded, HEAD_26)).toEqual({ mark: '✓', text: 'unit, ui-smoke on b260000 (head)' })
  expect(recordedItem({ ...recorded, sha: 'a110000000' }, HEAD_26)).toEqual({ mark: '✗', text: 'checks stale (a110000 ≠ head b260000)' })
  expect(recordedItem(null, HEAD_26)).toEqual({ mark: '✗', text: 'no checks recorded' })
  expect(recordedFresh({ ...recorded, sha: 'B260000' }, HEAD_26)).toBe(true)
  expect(recordedFresh({ ...recorded, sha: 'b26' }, HEAD_26)).toBe(false)
  expect(recordedFresh(recorded, null)).toBe(false)
})

test('the release: build-{n} as build-*, the newest tag and its date, the row in words, dim and never a blocker', () => {
  expect(releaseGlob('build-{n}')).toBe('build-*')
  expect(parseReleaseTags(RELEASE_TAG + 'build-13\t1700000000\n')).toEqual({ tag: 'build-14', at: Date.parse('2026-10-09T12:00:00Z') })
  expect(parseReleaseTags('')).toBeNull()
  expect(releaseItem(RELEASE, NOW)).toEqual({ mark: '◷', text: 'suite in release · build-14 · 3d ago · 6 commits since', info: true })
  expect(releaseItem({ pattern: 'build-*', tag: null, at: null, since: null }, NOW).text).toBe('suite in release · no build-* tag yet')
  expect(compactAgo(90_000)).toBe('1m ago')
  expect(compactAgo(2 * 3_600_000)).toBe('2h ago')
  expect(compactAgo(1_000)).toBe('just now')
  expect(releaseItem({ ...RELEASE, since: 1, at: null }, NOW).text).toBe('suite in release · build-14 · 1 commit since')
})

test('green without GitHub CI: the review\'s verdict says ready and the recorded checks are on the head', () => {
  const ready = { ...PULL_REQUEST, comments: [{ body: READY_REVIEW, createdAt: '2026-10-12T11:00:00Z' }] }
  const fresh = parseRecordedChecks(stateFile26('fresh'))
  const stale = parseRecordedChecks(stateFile26('stale'))
  expect(parsePullRequestList(ok(JSON.stringify([ready])), review(), { recorded: fresh })).toMatchObject({ kind: 'pr', green: true, recorded: fresh })
  expect(parsePullRequestList(ok(JSON.stringify([ready])), review(), { recorded: stale })).toMatchObject({ green: false })
  expect(parsePullRequestList(ok(JSON.stringify([ready])), review(), { recorded: null })).toMatchObject({ green: false, recorded: null })
  // Fixes needed: never green, fresh or not.
  expect(parsePullRequestList(ok(JSON.stringify([PULL_REQUEST])), review(), { recorded: fresh })).toMatchObject({ green: false })
  // Without OwnChecks (GitHub CI, ShopApp) nothing changes: no checks reported is not green, no recorded field.
  const plain = parsePullRequest(ok(JSON.stringify(ready)), review())
  expect(plain).toMatchObject({ green: false })
  expect('recorded' in plain || 'release' in plain).toBe(false)
})

test('the verdict without GitHub CI: READY on a ready verdict, fresh checks and no conflict; stale or none blocks; the release row never does', () => {
  const ready = { ...PULL_REQUEST, comments: [{ body: READY_REVIEW, createdAt: '2026-10-12T11:00:00Z' }] }
  const read = (state: 'fresh' | 'stale' | 'none', body = ready, mergeable = 'MERGEABLE') =>
    parsePullRequestList(ok(JSON.stringify([{ ...body, mergeable }])), review(), { recorded: parseRecordedChecks(stateFile26(state)), release: RELEASE }) as any
  const fresh = prVerdict(read('fresh'), NOW)!
  expect(fresh.kind).toBe('READY')
  expect(fresh.items).toEqual([
    { mark: '✓', text: 'unit, ui-smoke on b260000 (head)' },
    { mark: '✓', text: 'review round 1' },
    { mark: '✓', text: 'no conflict with main' },
    { mark: '◷', text: 'suite in release · build-14 · 3d ago · 6 commits since', info: true },
  ])
  const stale = prVerdict(read('stale'), NOW)!
  expect(stale.label).toBe('BLOCKED 1')
  expect(stale.items[0]).toEqual({ mark: '✗', text: 'checks stale (a110000 ≠ head b260000)' })
  expect(prCardLine({ number: 30 }, stale)).toBe('PR #30 · BLOCKED 1 · ✗ checks stale (a110000 ≠ head b260000)')
  expect(prVerdict(read('none'), NOW)!.items[0]).toEqual({ mark: '✗', text: 'no checks recorded' })
  expect(prVerdict(read('fresh', ready, 'CONFLICTING'), NOW)!.kind).toBe('CONFLICTS')
  expect(prVerdict(read('fresh', PULL_REQUEST as any), NOW)!.label).toBe('BLOCKED 1')
  // The release row: dim in the box, never the card line's first problem.
  const box = prBox(read('fresh'), NOW, false, () => '1h ago')!
  expect(box.rows.at(-1)).toEqual({ mark: '◷', text: 'suite in release · build-14 · 3d ago · 6 commits since', tone: 'dim' })
  expect(prCardLine({ number: 30 }, fresh)).toBe('PR #30 · READY')
})

test('the review row\'s word comes from the configuration: oink\'s `review round N`, ShopApp\'s `self-review round N`', () => {
  expect(reviewLabel(review())).toBe('review')
  expect(reviewLabel(LINEAR_CONFIG.review)).toBe('self-review')
  expect(reviewLabel({ ...review(), heading: { source: '^Code review', flags: '' } })).toBe('review')
  const oink = (comments: { body: string; createdAt: string }[]) =>
    prVerdict(parsePullRequestList(ok(JSON.stringify([{ ...PULL_REQUEST, comments }])), review(), { recorded: null }) as any, NOW)!.items.map(item => item.text)
  expect(oink(PULL_REQUEST.comments)).toContain('review round 1: 1 blocker')
  expect(oink([])).toContain('no review yet')
  expect(oink([{ body: READY_REVIEW, createdAt: '2026-10-12T11:00:00Z' }])).toContain('review round 1')
  // ShopApp: the same words as before, and no reviewLabel on its PRs.
  const shopapp = parsePullRequest(ok(JSON.stringify({ ...PULL_REQUEST, comments: [{ body: '## Self-review (round 2)\n\n### Blockers\n_(none)_', createdAt: 'x' }] })), LINEAR_CONFIG.review)
  expect('reviewLabel' in shopapp).toBe(false)
  expect(prVerdict(shopapp as any, NOW)!.items.map(item => item.text)).toContain('self-review round 1')
  expect(prVerdict({ ...(shopapp as any), rounds: 0, reviewBlockers: null }, NOW)!.items.map(item => item.text)).toContain('no self-review yet')
})

/** #26's ticket session in the oink-like repository (tests/repoGit.ts): its state file as given. */
function ticket26(on: any, state: string) {
  mock.env(on, { TOWER_ROLE: 'ticket', TOWER_TICKET: '#26', TOWER_REPO: REPO, HOME: '/home/test', TOWER_STATE_DIR: STATE, TOWER_WORKTREE: IN_PROGRESS })
  mock.clock(on, { now: NOW })
  mock.store(on)
  const gitDir = `${REPO}/.git/worktrees/26-start-day-duplicates`
  const files: Record<string, string> = {
    [STORED]: JSON.stringify(storedConfig()),
    [`${IN_PROGRESS}/.work/state.json`]: state,
    [`${IN_PROGRESS}/.git`]: `gitdir: ${gitDir}\n`,
    [`${gitDir}/HEAD`]: `ref: refs/heads/${BRANCH}\n`,
  }
  const argv: string[][] = []
  on('session.start', async (_$: unknown, e: any) => e)
  on('command.register' as any, async () => ({ value: undefined }) as any)
  on('session.cwd' as any, async () => ({ value: IN_PROGRESS }) as any)
  on('session.id' as any, async () => ({ value: 's26' }) as any)
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.exists', async (_$: unknown, e: any) => ({ value: e.path in files }) as any)
  on('fs.read', async (_$: unknown, e: any) => (files[e.path] !== undefined ? { value: files[e.path] } : { deny: `ENOENT: ${e.path}` }) as any)
  on('process.run', async (_$: unknown, e: any) => {
    argv.push([...e.argv])
    const line = e.argv.join(' ')
    const answer = (stdout: string) => ({ value: ok(stdout) }) as any
    if (line === 'git worktree list --porcelain') return answer(PORCELAIN)
    if (line === 'git remote get-url origin') return answer('https://github.com/fixture/oink.git\n')
    if (e.argv[0] === 'gh' && e.argv[1] === 'pr' && e.argv[2] === 'list') return answer(JSON.stringify(e.argv[4] === BRANCH ? [PULL_REQUEST] : []))
    if (e.argv[0] === 'git' && e.argv[1] === 'tag') return answer(RELEASE_TAG)
    if (line === 'git rev-list --count build-14..origin/main') return answer('6\n')
    return answer('')
  })
  return argv
}

for (const variant of ['fresh', 'stale'] as const) {
  test(`the oink fixture's PR box, checks ${variant}: the recorded checks, the review, the release row`, async ($, on) => {
    const argv = ticket26(on, stateFile26(variant))
    await $.session.start({ cwd: IN_PROGRESS, surface: 'terminal', isInteractive: true } as any)
    const deck = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'deck', props: { bodyColumns: 66 } } as any)
    const box = await deck.find({ key: 'pr' })
    expect(box).toBeDefined()
    expect(await deck.find({ type: 'Text', text: /^PR #30$/ })).toBeDefined()
    const text = box!.text
    if (variant === 'fresh') {
      // Fixes needed is the one blocker; the checks are fine.
      expect(await deck.find({ type: 'Text', text: /^BLOCKED 1$/ })).toBeDefined()
      expect(text).toContain('✓ unit, ui-smoke on b260000 (head)')
      expect(text).toContain('✗ review round 1: 1 blocker')
      expect(text).not.toContain('self-review')
      expect(text).not.toContain('stale')
    } else {
      expect(await deck.find({ type: 'Text', text: /^BLOCKED 2$/ })).toBeDefined()
      expect(text).toContain('✗ checks stale (a110000 ≠ head b260000)')
    }
    expect(text).toContain('◷ suite in release · build-14 · 3d ago · 6 commits since')
    expect(text).not.toContain('no checks reported')
    // GitHub's checks are not asked for: no statusCheckRollup in the fields.
    const pr = argv.find(one => one[0] === 'gh' && one[2] === 'list')!
    expect(pr.at(-1)).not.toContain('statusCheckRollup')
    await deck.unmount()
  })
}

test('the release row fits a 60-column deck whole: mark, text, the box\'s border and padding; longer text is cut, not wrapped', async ($, on) => {
  ticket26(on, stateFile26('fresh'))
  await $.session.start({ cwd: IN_PROGRESS, surface: 'terminal', isInteractive: true } as any)
  const deck = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'deck', props: { bodyColumns: 60 } } as any)
  const row = (await deck.findAll({ type: 'Text', text: /suite in release/ })).find(one => one.props.wrap === 'truncate-end')
  expect(row?.text).toBe('◷ suite in release · build-14 · 3d ago · 6 commits since')
  // 60 columns less the round border (2) and paddingX 1 (2): 56 cells for the row.
  expect(Array.from(row!.text).length).toBeLessThanOrEqual(60 - 4)
  await deck.unmount()
})
