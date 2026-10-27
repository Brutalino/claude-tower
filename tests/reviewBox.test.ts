import { expect, test } from 'claude-code/testing'

import { asksToPost as asksToPostWith } from '../hooks/core/away'
import { ago, cannotPost, elapsed, extractReviewBody as extractReviewBodyWith, reviewAnswer, reviewBodyPath as reviewBodyPathWith, reviewBox, reviewKeys, REVIEW_VERIFY_MS, reviewPostDecision, reviewPosted, reviewRound as reviewRoundWith, reviewShown as reviewShownWith, reviewVerifyExpired } from '../hooks/core/reviewBox'
import { LINEAR_CONFIG } from './linearConfig'

const extractReviewBody = (answer: string) => extractReviewBodyWith(answer, LINEAR_CONFIG.review)
const asksToPost = (answer: string) => asksToPostWith(answer, LINEAR_CONFIG.waits)
const reviewBodyPath = (answer: string, places: Parameters<typeof reviewBodyPathWith>[1], pr: number, saved: readonly string[] = []) => reviewBodyPathWith(answer, places, pr, saved, LINEAR_CONFIG.review.savePath)
const reviewRound = (answer: string) => reviewRoundWith(answer, LINEAR_CONFIG.review)
const reviewShown = (answer: string) => reviewShownWith(answer, LINEAR_CONFIG.review)

const PR = { kind: 'pr', number: 103, state: 'open', rounds: 0, lastReviewAt: null }
const RUN = { pr: 103, round: 1, startedAt: 1_000, baseRounds: 0, postedAt: null }

test('reviewBox: no box without an open or draft PR; no review yet; reviewing; asks; posted', async () => {
  expect(reviewBox(null, null, null)).toBeNull()
  expect(reviewBox({ kind: 'none' }, null, null)).toBeNull()
  expect(reviewBox({ ...PR, state: 'merged' }, null, null)).toBeNull()
  expect(reviewBox(PR, null, null)).toEqual({ kind: 'none', pr: 103 })
  expect(reviewBox({ ...PR, state: 'draft' }, RUN, { state: 'working', since: 2_000, action: 'Bash gh pr diff', asks: null }))
    .toEqual({ kind: 'reviewing', pr: 103, round: 1, startedAt: 1_000, action: 'Bash gh pr diff' })
  // A question from before the round started does not count.
  expect(reviewBox(PR, RUN, { state: 'idle', since: 500, action: '', asks: 'Which base?' })?.kind).toBe('reviewing')
  expect(reviewBox(PR, RUN, { state: 'idle', since: 2_000, action: '', asks: 'Which base?' }))
    .toEqual({ kind: 'asks', pr: 103, round: 1, startedAt: 1_000, question: 'Which base?' })
  expect(reviewBox(PR, { ...RUN, postedAt: 9_000 }, null)).toEqual({ kind: 'posted', pr: 103, round: 1, at: 9_000 })
  expect(reviewBox({ ...PR, rounds: 2, lastReviewAt: '2026-10-01T10:00:00Z' }, null, null))
    .toEqual({ kind: 'posted', pr: 103, round: 2, at: Date.parse('2026-10-01T10:00:00Z') })
})

test('reviewPosted: only more self-review comments than at the round start, from a fresh read', async () => {
  expect(reviewPosted(RUN, 0)).toBe(false)
  expect(reviewPosted(RUN, 1)).toBe(true)
  expect(reviewPosted({ ...RUN, postedAt: 3_000 }, 1)).toBe(false)
  // TKT-2428: round 3 started with two comments on the PR; the PR still has two, so round 3 is not posted.
  expect(reviewPosted({ ...RUN, round: 3, baseRounds: 2 }, 2)).toBe(false)
  expect(reviewPosted({ ...RUN, round: 3, baseRounds: 2 }, 3)).toBe(true)
})

test('reviewAnswer: the post question is no question to show; any other is; a reported post is posted, to verify', async () => {
  expect(reviewAnswer('Verdict: fine.\nPost this review to the PR?', asksToPost)).toEqual({ asks: null, posted: false })
  expect(reviewAnswer('Which base branch should I compare against, staging or main?', asksToPost))
    .toEqual({ asks: 'Which base branch should I compare again', posted: false })
  // Decision 046: no last-line fallback; a closing summary is no question.
  expect(reviewAnswer('Posted round 1 to PR #103.', asksToPost)).toEqual({ asks: null, posted: false })
  expect(reviewAnswer('Verdict: two blockers.\n\nI stopped here: the diff is empty on main.\n', asksToPost)).toEqual({ asks: null, posted: false })
  expect(reviewAnswer('Suggestions:\n1. Rename x.\n3. Add the partner test.', asksToPost)).toEqual({ asks: null, posted: false })
  // PR #2453: the posting turn's summary reports the post: nothing asked, the ticket session verifies it on the PR.
  expect(reviewAnswer('Posted: https://github.com/acmeco/shopapp/pull/2453#issuecomment-3391234567\n\n3. Add the partner test.', asksToPost))
    .toEqual({ asks: null, posted: true })
  expect(reviewAnswer('Done, I posted the round on the PR.', asksToPost)).toEqual({ asks: null, posted: true })
  expect(reviewAnswer('Dimmi se procedo a pubblicare il commento.', asksToPost)).toEqual({ asks: null, posted: false })
  expect(reviewAnswer('', asksToPost)).toEqual({ asks: null, posted: false })
})

test('reviewBox idle: a session whose turn ended with nothing to ask, post or refuse waits for the person; reviewing only while it works', async () => {
  expect(reviewBox(PR, RUN, { state: 'idle', since: 2_000, action: '', asks: null })).toEqual({ kind: 'idle', pr: 103, round: 1, startedAt: 1_000 })
  expect(reviewBox(PR, RUN, { state: 'working', since: 2_000, action: 'Read a.ts', asks: null })?.kind).toBe('reviewing')
  // Before its first turn of this round ended (an older status), it is still reviewing.
  expect(reviewBox(PR, RUN, { state: 'idle', since: 500, action: '', asks: null })?.kind).toBe('reviewing')
  expect(reviewBox(PR, RUN, null)?.kind).toBe('reviewing')
  expect(reviewKeys({ kind: 'idle', pr: 103, round: 1, startedAt: 1_000 })).toEqual(['v', 'l'])
})

test('reviewBox verifying: a reported post reads `verifying` until the PR shows it; 2 minutes, then not found', async () => {
  const posted = { state: 'idle', since: 2_000, action: '', asks: null, posted: true }
  expect(reviewBox(PR, RUN, posted)).toEqual({ kind: 'verifying', pr: 103, round: 1, startedAt: 1_000 })
  // A claim from before the round started does not count.
  expect(reviewBox(PR, RUN, { ...posted, since: 500 })?.kind).toBe('reviewing')
  expect(reviewBox(PR, { ...RUN, verifying: 3_000 }, null)?.kind).toBe('verifying')
  expect(reviewBox(PR, { ...RUN, verifying: 3_000, postedAt: 9_000 }, posted)?.kind).toBe('posted')
  expect(reviewBox(PR, { ...RUN, failed: 'post not found on PR' }, posted)).toEqual({ kind: 'failed', pr: 103, round: 1, startedAt: 1_000, error: 'post not found on PR' })
  expect(reviewKeys({ kind: 'verifying', pr: 103, round: 1, startedAt: 1_000 })).toEqual(['l'])
  expect(reviewVerifyExpired({ ...RUN, verifying: 3_000 }, 3_000 + 119_000)).toBe(false)
  expect(reviewVerifyExpired({ ...RUN, verifying: 3_000 }, 3_000 + 121_000)).toBe(true)
  expect(reviewVerifyExpired(RUN, 1e9)).toBe(false)
  expect(REVIEW_VERIFY_MS).toBe(120_000)
})

// ShopApp's `/review` fixes no wording ("Show the review to the user and wait. Post only after they agree."), so
// the model words the question itself, differently each round; the fixture asks exactly `Post this review to the PR?`.
test('asksToPost: the last paragraph asks, with or without `?`, to post or publish the review; nothing else', async () => {
  for (const question of [
    'Post this review to the PR?',
    'Verdict: two blockers.\nShall I post it?',
    'Want me to post this as round 2 on PR #103?',
    'Should I post `## Self-review (round 3)` to the PR? (yes/no)',
    'OK to post?',
    'Ready to publish this review as a PR comment?',
    'Shall I run `gh pr comment 103` with this body?',
    // The last paragraph asks without `?`, in English or Italian.
    'Dimmi se procedo a pubblicare il commento.',
    'Ready to post as round 2 — say the word.',
    'Let me know if you want me to post it to the PR',
    'Verdict: two blockers.\n\nVuoi che lo pubblichi sulla PR?',
    'Blockers: none.\n\nPosso pubblicare la review come commento.',
    'Round 2 is ready.\n\nWant me to leave it as a comment on the PR',
    'Shall I post it?\n\n(Full text above.)',
  ]) expect(asksToPost(question)).toBe(true)
  for (const answer of [
    'Which base branch should I compare against, staging or main?',
    'Posted round 2 to PR #103.',
    'Was the post-merge hook meant to run here?',
    'Blocker: why does `notify()` post twice?\nShould I wait for CI first?',
    'Post this review to the PR.',
    'Blocker: `notify()` should post once.\n\nLet me know if the base is staging.',
    'Ho pubblicato il commento sulla PR.',
    '',
  ]) expect(asksToPost(answer)).toBe(false)
})

test('elapsed and ago', async () => {
  expect(elapsed(72_000)).toBe('1:12')
  expect(ago(30_000)).toBe('just now')
  expect(ago(125_000)).toBe('2m ago')
  expect(ago(3 * 3_600_000)).toBe('3h ago')
})

const SHOWN = '## Self-review\n\n### Scope check\nMatches the ticket.\n\n### Blockers\nNone.\n\n### Good stuff\nTests.'

test('the self-review heading: the real one with a head tail, a bare one; not Self-reviewer', async () => {
  const real = '## Self-review (round 1) — head `507cf535b`\n\n### Blockers\n_(none)_'
  expect(reviewShown(real)).toBe(true)
  expect(reviewRound(real)).toBe(1)
  expect(reviewRound('## Self-review (round 4) — head `abc`')).toBe(4)
  expect(reviewShown('## Self-review\n\nFine.')).toBe(true)
  expect(reviewRound('## Self-review\n\nFine.')).toBe(1)
  expect(reviewShown('## Self-reviewer notes\n\nFine.')).toBe(false)
})

test('reviewShown: the skeleton with or without the round, or two section headings; a plain answer is not', async () => {
  expect(reviewShown(SHOWN)).toBe(true)
  expect(reviewShown('Here it is.\n\n## Self-review (round 2)\n\nBoth blockers closed.')).toBe(true)
  expect(reviewShown('### Quality check\nFine.\n\n### Suggestions\nRename `x`.')).toBe(true)
  expect(reviewShown('### Blockers\nNone.')).toBe(false)
  expect(reviewShown('The review is ready. The diff looks fine; no blockers.')).toBe(false)
  expect(reviewShown('')).toBe(false)
})

test('reviewBox: ready to post (posting or waiting for the key), failed, posted by tower; their keys', async () => {
  const ready = reviewBox(PR, { ...RUN, body: '/w/.work/review/pr-103-round-1.md' }, null)
  expect(ready).toEqual({ kind: 'ready', pr: 103, round: 1, startedAt: 1_000, posting: false })
  expect(reviewKeys(ready!)).toEqual(['post', 'l'])
  const posting = reviewBox(PR, { ...RUN, body: '/w/r.md', posting: true }, null)
  expect(posting).toEqual({ kind: 'ready', pr: 103, round: 1, startedAt: 1_000, posting: true })
  expect(reviewKeys(posting!)).toEqual(['l'])
  const failed = reviewBox(PR, { ...RUN, body: '/w/r.md', failed: 'HTTP 403: Resource not accessible' }, null)
  expect(failed).toEqual({ kind: 'failed', pr: 103, round: 1, startedAt: 1_000, error: 'HTTP 403: Resource not accessible' })
  expect(reviewKeys(failed!)).toEqual(['l'])
  expect(reviewBox(PR, { ...RUN, body: '/w/r.md', postedAt: 9_000, by: 'tower' }, null)).toEqual({ kind: 'posted', pr: 103, round: 1, at: 9_000, by: 'tower' })
})

test('reviewBodyPath: the --body-file the last paragraph names, an absolute or scratchpad path, else the newest saved round, else none', async () => {
  const shown = SHOWN + '\n\nOk to post? I will run `gh pr comment 2408 --body-file scratchpad/pr2408/review.md`.'
  // TKT-2428: `scratchpad/…` is the review session's own scratchpad, not a folder of its working directory.
  const SCRATCHPAD = '/private/tmp/claude-501/-repo/abc/scratchpad'
  expect(reviewBodyPath(shown, { cwd: '/repo', scratchpad: SCRATCHPAD }, 2408)).toBe(`${SCRATCHPAD}/pr2408/review.md`)
  // Without a scratchpad found, no guess under the working directory.
  expect(reviewBodyPath(shown, { cwd: '/repo' }, 2408)).toBeNull()
  expect(reviewBodyPath('Post it?\n\ngh pr comment 7 --body-file "/tmp/x/review.md"', { cwd: '/repo/' }, 7)).toBe('/tmp/x/review.md')
  expect(reviewBodyPath('Post it with --body-file ./r.md?', { cwd: '/repo' }, 7, ['pr-7-round-1.md'])).toBe('/repo/r.md')
  // An absolute path anywhere in the answer, the last one named.
  expect(reviewBodyPath(`${SHOWN}\n\nSaved to ${SCRATCHPAD}/pr7/review.md.\n\nReply with one of these:\n  - post`, { cwd: '/repo' }, 7))
    .toBe(`${SCRATCHPAD}/pr7/review.md`)
  expect(reviewBodyPath(`${SHOWN}\n\nSaved to \`scratchpad/pr7/review.md\`.`, { cwd: '/repo', scratchpad: SCRATCHPAD }, 7)).toBe(`${SCRATCHPAD}/pr7/review.md`)
  // A --body-file in an earlier paragraph is not the one it posts; the saved rounds are the worktree's.
  expect(reviewBodyPath('Saved with --body-file old.md\n\nPost it?', { cwd: '/repo' }, 7, ['pr-7-round-1.md', 'pr-7-round-2.md', 'pr-8-round-5.md', 'notes.md']))
    .toBe('/repo/.work/review/pr-7-round-2.md')
  expect(reviewBodyPath('Post it?', { cwd: '/repo', worktree: '/wt/TKT-7/' }, 7, ['pr-7-round-1.md'])).toBe('/wt/TKT-7/.work/review/pr-7-round-1.md')
  expect(reviewBodyPath(SHOWN, { cwd: '/repo' }, 7, ['pr-8-round-1.md'])).toBeNull()
  expect(reviewBodyPath(SHOWN, { cwd: '/repo' }, 7)).toBeNull()
})

// TKT-2428 round 3, in its real shape: the review, then a last paragraph with the reply options and no file saved.
const ROUND_3 = [
  'Round 3 of the self-review for PR #2408.',
  '',
  '## Self-review (round 3)',
  '',
  '### Scope check',
  'Matches TKT-2428: the retry only wraps the export call.',
  '',
  '### Quality check',
  '- Tests cover the retry and the give-up path.',
  '- Post-merge cleanup is not needed.',
  '',
  '### Blockers',
  '_(none)_',
  '',
  '### Suggestions',
  '- Name the backoff constant.',
  '',
  '### Good stuff',
  'Small, focused diff.',
  '',
  'Reply with one of these:',
  '  - post: I post this as round 3 on PR #2408',
  '  - post + ready: I post it and mark the PR ready for review',
].join('\n')

test('extractReviewBody: the review from its heading to the reply options, which are never posted', async () => {
  const body = extractReviewBody(ROUND_3)
  expect(body?.startsWith('## Self-review (round 3)\n\n### Scope check')).toBe(true)
  expect(body?.endsWith('### Good stuff\nSmall, focused diff.')).toBe(true)
  expect(body).not.toContain('Reply with')
  expect(body).not.toContain('post + ready')
  expect(body).not.toContain('Round 3 of the self-review')
  // `Post-merge` inside a section is no question to the person.
  expect(body).toContain('- Post-merge cleanup is not needed.')
  expect(reviewRound(ROUND_3)).toBe(3)
  expect(reviewShown(ROUND_3)).toBe(true)
  expect(asksToPost(ROUND_3)).toBe(true)
  // Other trailing asks, and a horizontal rule after the last section.
  for (const tail of ['Shall I post it?', 'Want me to post it?', 'Should I post it?', 'Post this review to the PR?', 'Vuoi che la pubblichi?', 'Dimmi se pubblico.', 'Posso pubblicarla?', '---\nAnything else?']) {
    expect(extractReviewBody(`${SHOWN}\n\n${tail}`)).toBe(SHOWN)
  }
  // Nothing after the review: the whole of it.
  expect(extractReviewBody(SHOWN)).toBe(SHOWN)
  // No heading, or fewer than two sections: nothing to post.
  expect(extractReviewBody('### Blockers\nNone.\n\n### Good stuff\nTests.')).toBeNull()
  expect(extractReviewBody('## Self-review\n\n### Blockers\nNone.\n\nShall I post it?')).toBeNull()
  expect(extractReviewBody('')).toBeNull()
  expect(reviewRound(SHOWN)).toBe(1)
})

test('reviewPostDecision: auto or away posts, key waits; nothing without the review shown, an empty or missing file, or once posted', async () => {
  const base = { setting: 'auto' as const, away: false, shown: true, bodyLength: 120, rounds: 0, baseRounds: 0 }
  expect(reviewPostDecision(base)).toBe('post')
  expect(reviewPostDecision({ ...base, setting: 'key' })).toBe('ready')
  expect(reviewPostDecision({ ...base, setting: 'key', away: true })).toBe('post')
  expect(reviewPostDecision({ ...base, shown: false })).toBe('none')
  expect(reviewPostDecision({ ...base, bodyLength: 0 })).toBe('none')
  expect(reviewPostDecision({ ...base, bodyLength: null })).toBe('none')
  // Never twice for a round: a new self-review comment on the PR since the round started.
  expect(reviewPostDecision({ ...base, rounds: 3, baseRounds: 2 })).toBe('none')
  expect(reviewPostDecision({ ...base, rounds: 2, baseRounds: 2 })).toBe('post')
})

test('cannotPost: red CI, cannot or not posting, Italian; waiting for agreement is no refusal', async () => {
  expect(cannotPost('I cannot post: the PR body has no Testing section.')).toBe(true)
  expect(cannotPost("Can't post it: the base is main, not staging.")).toBe(true)
  expect(cannotPost('Not posting this round.')).toBe(true)
  expect(cannotPost('Non pubblico: la CI è rossa.')).toBe(true)
  expect(cannotPost('CI is red.')).toBe(true)
  expect(cannotPost('Blocked by red CI.')).toBe(true)
  expect(cannotPost('Not posting until you agree. Ok to post?')).toBe(false)
  expect(cannotPost("I won't post it without your go-ahead.")).toBe(false)
  expect(cannotPost('Post this review to the PR?')).toBe(false)
  expect(reviewAnswer('Verdict: two blockers.\nCI is red, so I am not posting.', asksToPost))
    .toEqual({ asks: 'CI is red, so I am not posting.', posted: false })
})
