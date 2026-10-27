import { expect, test } from 'claude-code/testing'

import { validateConfig, type ReviewConfig } from '../hooks/core/config'
import { OINK_CONFIG } from '../hooks/core/configs/examples/oink'
import { LINEAR_CONFIG } from './linearConfig'
import { parsePullRequest, reviewPosts } from '../hooks/core/detail'
import { prVerdict } from '../hooks/core/prState'
import { isReviewComment, reviewBox, roundPosted } from '../hooks/core/reviewBox'

// Decision 081: a PR comment is a review round only when it has the heading and, when the configuration has verdict
// lines, one of them. oink's `## Review round N: changes` replies are no rounds.

const result = validateConfig(OINK_CONFIG)
if (!result.ok) throw new Error(result.errors.join('\n'))
// oink's live configuration lists no sections.
const REVIEW: ReviewConfig = { ...result.config.review, sections: [] }
const EXAMPLE = result.config.review

// oink PR #105's four comments of 2026-10-26, shortened.
const ROUND_1 = '## Review (round 1)\nVerdict: ready to merge\n\n### Blockers\nNone.\n\n### Suggestions\n1. Give the start day an identifier.\n\n### Earlier rounds\nNone: this is round 1.'
const CHANGES_1 = '## Review round 1: changes\nHead: 5b808c5\n\n- **Start day found by bare text**: the number has its own identifier `settings.monthStart.day`.\n- **Export round-trip test**: its comment now says what it guards.'
const ROUND_2 = '## Review (round 2)\nVerdict: fixes needed\n\n### Blockers\n- `docs/DECISIONS.md` (end of file): the branch conflicts with its base.\n- PR body, "Tested and not tested": names 5533310, the head is 5b808c5.\n\n### Suggestions\nNone.\n\n### Earlier rounds\n- Settings UI test found the start day by bare texts: closed in 5b808c5.'
const CHANGES_2 = '## Review round 2: changes\nHead: e77baec\n\n- **Conflict with the base**: rebased on `first-audit-big-fix` after #104 (#35).\n- **Claims in the body**: "Tested and not tested" now names this head.\n\nChecks on e77baec (iPhone 16 Pro, iOS 26.5):\n- Unit tests: 52 passed.'
const at = (body: string, createdAt: string) => ({ body, createdAt, author: { login: 'Brutalino' } })
const PR_105 = [
  at(ROUND_1, '2026-10-26T14:36:15Z'),
  at(CHANGES_1, '2026-10-26T15:17:11Z'),
  at(ROUND_2, '2026-10-26T15:20:18Z'),
  at(CHANGES_2, '2026-10-26T15:23:55Z'),
]

const read = (comments: unknown[], review = REVIEW, checks = 'SUCCESS') => parsePullRequest({ exitCode: 0, stderr: '', stdout: JSON.stringify({
  number: 105, state: 'OPEN', isDraft: false, headRefOid: 'e77baec', comments, statusCheckRollup: [{ name: 'build', status: 'COMPLETED', conclusion: checks }],
}) }, review)

test('isReviewComment: the heading and, with verdict lines, a verdict; the changes replies are none', async () => {
  expect(isReviewComment(ROUND_1, REVIEW)).toBe(true)
  expect(isReviewComment(ROUND_2, REVIEW)).toBe(true)
  expect(isReviewComment(CHANGES_1, REVIEW)).toBe(false)
  expect(isReviewComment(CHANGES_2, REVIEW)).toBe(false)
  // A verdict line without the heading is no review comment either.
  expect(isReviewComment('Round 2 below.\n\n## Review (round 2)\nVerdict: fixes needed', REVIEW)).toBe(false)
})

test('oink PR #105: two rounds, not four; the next review is round 3; the verdict and blockers from `## Review (round 2)`', async () => {
  const pullRequest = read(PR_105)
  // Round 2 says fixes needed: one blocker (no blockers section in oink's configuration), not green.
  expect(pullRequest).toMatchObject({ kind: 'pr', rounds: 2, lastReviewAt: '2026-10-26T15:20:18Z', reviewBlockers: 1, green: false })
  if (pullRequest.kind !== 'pr') throw new Error('a pull request')
  // The box and the start of the next round (register.tsx: round = rounds + 1, baseRounds = rounds).
  expect(reviewBox(pullRequest, null, null)).toMatchObject({ kind: 'posted', pr: 105, round: 2, at: Date.parse('2026-10-26T15:20:18Z') })
  const rounds = pullRequest.rounds ?? 0
  const run = { pr: 105, round: rounds + 1, startedAt: Date.parse('2026-10-26T15:25:00Z'), baseRounds: rounds, postedAt: null }
  expect(reviewBox(pullRequest, run, null)).toMatchObject({ kind: 'reviewing', round: 3 })
  // The rail and board read `review round 2: 1 blocker`.
  expect(prVerdict(pullRequest, Date.parse('2026-10-26T15:30:00Z'))?.items).toContainEqual({ mark: '✗', text: 'review round 2: 1 blocker' })
  // A ready round followed by its changes reply: the verdict is the round's, not the reply's.
  expect(read(PR_105.slice(0, 2))).toMatchObject({ rounds: 1, lastReviewAt: '2026-10-26T14:36:15Z', reviewBlockers: 0, green: true })
  // The same through the example configuration, which lists sections.
  expect(read(PR_105, EXAMPLE)).toMatchObject({ rounds: 2, lastReviewAt: '2026-10-26T15:20:18Z', reviewBlockers: 1, green: false })
})

test('a changes reply posted while round 3 runs is no round posted, by the count or by hand (decision 074); round 3 is', async () => {
  const run = { pr: 105, round: 3, startedAt: Date.parse('2026-10-26T15:21:00Z'), baseRounds: 2, postedAt: null }
  for (const review of [REVIEW, EXAMPLE]) {
    const pullRequest = read(PR_105, review)
    if (pullRequest.kind !== 'pr') throw new Error('a pull request')
    expect(reviewPosts(PR_105, [], review).map(post => post.heading)).toEqual([true, false, true, false])
    expect(roundPosted(run, pullRequest, 'Brutalino')).toBe(false)
    const round3 = at('## Review (round 3)\nVerdict: ready to merge\n\n### Blockers\nNone.\n\n### Suggestions\nNone.\n\n### Earlier rounds\n- Conflict: closed in e77baec.', '2026-10-26T15:26:28Z')
    const after = read([...PR_105, round3], review)
    if (after.kind !== 'pr') throw new Error('a pull request')
    expect(after).toMatchObject({ rounds: 3, reviewBlockers: 0, green: true })
    expect(roundPosted(run, after, 'Brutalino')).toBe(true)
  }
})

test('a configuration without verdict lines counts by the heading alone, as before', async () => {
  const headingOnly = { ...REVIEW, verdict: null, blockersSection: { heading: 'Blockers', none: 'None.' } }
  expect(isReviewComment(CHANGES_2, headingOnly)).toBe(true)
  expect(read(PR_105, headingOnly)).toMatchObject({ rounds: 4, lastReviewAt: '2026-10-26T15:23:55Z' })
  // ShopApp has none: every `## Self-review` comment is a round, with or without a verdict-like line.
  expect(LINEAR_CONFIG.review.verdict).toBeNull()
  expect(isReviewComment('## Self-review (round 2)\n\n### Blockers\n_(none)_', LINEAR_CONFIG.review)).toBe(true)
  expect(isReviewComment('## Self-review\n\nStill reading.', LINEAR_CONFIG.review)).toBe(true)
  expect(isReviewComment('## Self-reviewer\n\n### Blockers\n_(none)_', LINEAR_CONFIG.review)).toBe(false)
  expect(isReviewComment(ROUND_2, LINEAR_CONFIG.review)).toBe(false)
})
