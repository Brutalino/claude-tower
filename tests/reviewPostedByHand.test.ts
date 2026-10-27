import { expect, test } from 'claude-code/testing'

import type { TowerSessionStatus } from '../types/index'
import { parsePullRequest, reviewPosts as reviewPostsWith } from '../hooks/core/detail'
import { postedOutsideCount, REVIEW_POST_SKEW_MS, reviewPostDecision, roundPosted } from '../hooks/core/reviewBox'
import { parseStatus, ticketLiveSessions, ticketWaiting, ticketWaitText } from '../hooks/core/sessionStatus'
import { LINEAR_CONFIG } from './linearConfig'

// Decision 074: a round posted by hand, outside the `## Self-review` comment count.

const reviewPosts = (comments: unknown, reviews: unknown = []) => reviewPostsWith(comments, reviews, LINEAR_CONFIG.review)

const START = Date.parse('2026-10-15T10:00:00Z')
const RUN = { pr: 2508, round: 3, startedAt: START, baseRounds: 2, postedAt: null }
const AFTER = '2026-10-15T10:05:00Z'
const SECTIONS = '### Scope check\nok\n\n### Quality check\nok\n\n### Blockers\n_(none)_'
const HEADED = `## Self-review (round 3)\n\n${SECTIONS}`
const comment = (body: string, at = AFTER, login = 'Brutalino') => ({ body, createdAt: at, author: { login } })
const review = (body: string, at = AFTER, login = 'Brutalino', state = 'COMMENTED') => ({ body, submittedAt: at, state, author: { login } })

test('reviewPosts: author, time, heading, sections and an empty body of each comment and GitHub review; no body kept', async () => {
  expect(reviewPosts([comment(HEADED), comment('LGTM', AFTER, 'mnltrf')], [review('', AFTER, 'someone', 'APPROVED')])).toEqual([
    { kind: 'comment', author: 'Brutalino', at: AFTER, heading: true, sections: 3, empty: false },
    { kind: 'comment', author: 'mnltrf', at: AFTER, heading: false, sections: 0, empty: false },
    { kind: 'review', author: 'someone', at: AFTER, heading: false, sections: 0, empty: true },
  ])
  expect(reviewPosts('nope', null)).toEqual([])
  expect(reviewPosts([{ body: 'x' }])).toEqual([{ kind: 'comment', author: null, at: '', heading: false, sections: 0, empty: false }])
})

test('roundPosted: more heading comments than at the start, as before', async () => {
  expect(roundPosted(RUN, { rounds: 2, posts: [] }, null)).toBe(false)
  expect(roundPosted(RUN, { rounds: 3, posts: reviewPosts([comment(HEADED)]) }, null)).toBe(true)
  expect(roundPosted({ ...RUN, postedAt: START + 1 }, { rounds: 3 }, null)).toBe(false)
})

test('roundPosted: a comment by any author with two sections and no heading is posted; one section is not', async () => {
  // A line above the heading, or `### Self-review`: the heading count misses it.
  expect(roundPosted(RUN, { rounds: 2, posts: reviewPosts([comment(`Round 3 below.\n\n## Self-review (round 3)\n\n${SECTIONS}`, AFTER, 'mnltrf')]) }, null)).toBe(true)
  expect(roundPosted(RUN, { rounds: 2, posts: reviewPosts([comment(`### Self-review\n\n${SECTIONS}`, AFTER, 'mnltrf')]) }, 'Brutalino')).toBe(true)
  expect(roundPosted(RUN, { rounds: 2, posts: reviewPosts([comment('### Blockers\n_(none)_', AFTER)]) }, 'Brutalino')).toBe(false)
  // A heading comment is the count's alone: the previous round's, posted just before this one started, is not this round's.
  expect(roundPosted(RUN, { rounds: 2, posts: reviewPosts([comment(HEADED, '2026-10-15T09:59:30Z')]) }, null)).toBe(false)
})

test("roundPosted: the viewer's GitHub review with a body is posted; someone else's without sections is not, with them it is", async () => {
  const mine = reviewPosts([], [review('Self-review round 3: no blockers.', AFTER, 'Brutalino', 'APPROVED')])
  expect(roundPosted(RUN, { rounds: 2, posts: mine }, 'Brutalino')).toBe(true)
  expect(roundPosted(RUN, { rounds: 2, posts: mine }, 'brutalino')).toBe(true)
  // Unknown viewer (gh api user failed): the viewer rule is off.
  expect(roundPosted(RUN, { rounds: 2, posts: mine }, null)).toBe(false)
  // The viewer's review with an empty body (an approval alone) is no review round.
  expect(roundPosted(RUN, { rounds: 2, posts: reviewPosts([], [review('', AFTER, 'Brutalino', 'APPROVED')]) }, 'Brutalino')).toBe(false)
  const theirs = reviewPosts([], [review('Please rename the helper.', AFTER, 'teammate', 'CHANGES_REQUESTED')])
  expect(roundPosted(RUN, { rounds: 2, posts: theirs }, 'Brutalino')).toBe(false)
  expect(roundPosted(RUN, { rounds: 2, posts: reviewPosts([], [review(SECTIONS, AFTER, 'teammate')]) }, 'Brutalino')).toBe(true)
})

test('postedOutsideCount: a post from before the start, beyond the skew, does not count; within it, it does', async () => {
  const at = (ms: number) => new Date(ms).toISOString()
  const sections = (ms: number) => reviewPosts([comment(SECTIONS, at(ms), 'mnltrf')])
  expect(postedOutsideCount(START, sections(START - REVIEW_POST_SKEW_MS - 1_000), null)).toBe(false)
  expect(postedOutsideCount(START, sections(START - REVIEW_POST_SKEW_MS + 1_000), null)).toBe(true)
  const mine = (ms: number) => reviewPosts([], [review('round 3', at(ms))])
  expect(postedOutsideCount(START, mine(START - 2 * REVIEW_POST_SKEW_MS), 'Brutalino')).toBe(false)
  expect(postedOutsideCount(START, mine(START + 1_000), 'Brutalino')).toBe(true)
  // No time: never counts.
  expect(postedOutsideCount(START, reviewPosts([{ body: SECTIONS }]), null)).toBe(false)
})

test('parsePullRequest keeps the posts; reviewPostDecision says none after a hand post', async () => {
  const stdout = JSON.stringify({ number: 2508, state: 'OPEN', comments: [comment(HEADED, '2026-10-15T09:00:00Z')], reviews: [review('Round 3: fine.')] })
  const pr = parsePullRequest({ exitCode: 0, stdout, stderr: '' }, LINEAR_CONFIG.review)
  if (pr.kind !== 'pr') throw new Error('no pr')
  expect(pr.posts?.length).toBe(2)
  expect(pr.rounds).toBe(1)
  expect(roundPosted({ ...RUN, baseRounds: 1 }, pr, 'Brutalino')).toBe(true)
  const base = { setting: 'auto' as const, away: false, shown: true, bodyLength: 120, rounds: 1, baseRounds: 1 }
  expect(reviewPostDecision(base)).toBe('post')
  expect(reviewPostDecision({ ...base, postedElsewhere: true })).toBe('none')
  expect(reviewPostDecision({ ...base, setting: 'key', postedElsewhere: true })).toBe('none')
  expect(reviewPostDecision({ ...base, postedElsewhere: false })).toBe('post')
})

const NOW = 1_000_000
const BASE = { v: 1, pane: null, cwd: '/w', state: 'idle', since: 0, updatedAt: NOW } as const
const ticketRecord = (posted?: number): TowerSessionStatus =>
  ({ ...BASE, id: 't', role: 'ticket', ticket: 'TKT-1', ...(posted !== undefined ? { reviewPosted: { round: 3, at: posted } } : {}) })
const reviewRecord = (since: number, kind: 'permission' | 'question' = 'permission'): TowerSessionStatus =>
  ({ ...BASE, id: 'r', role: 'review', ticket: 'TKT-1', waiting: { kind, text: 'Bash gh pr comment 2508', since } })

test('the rail: a review wait from before the round was posted needs no one; one after it does', async () => {
  const posted = NOW - 30_000
  // Not posted: the review session's wait counts, as before.
  expect(ticketWaiting([ticketRecord(), reviewRecord(NOW - 60_000)], NOW).get('TKT-1')).toBe('permission')
  // Posted after the dialog opened: the dialog is left over.
  const stale = [ticketRecord(posted), reviewRecord(NOW - 60_000)]
  expect(ticketWaiting(stale, NOW).has('TKT-1')).toBe(false)
  expect(ticketWaitText(stale, 'TKT-1', NOW)).toBeNull()
  expect(ticketLiveSessions(stale, 'TKT-1', NOW).some(session => 'waiting' in session)).toBe(false)
  // At the post's very time: still left over.
  expect(ticketWaiting([ticketRecord(posted), reviewRecord(posted)], NOW).has('TKT-1')).toBe(false)
  // A wait that began after the post counts again.
  const fresh = [ticketRecord(posted), reviewRecord(NOW - 15_000, 'question')]
  expect(ticketWaiting(fresh, NOW).get('TKT-1')).toBe('question')
  expect(ticketWaitText(fresh, 'TKT-1', NOW)).toBe('Bash gh pr comment 2508')
  expect(ticketLiveSessions(fresh, 'TKT-1', NOW).find(session => session.role === 'review')).toMatchObject({ waiting: true })
  // The ticket session's own wait is never dropped by the post.
  const own = { ...ticketRecord(posted), waiting: { kind: 'permission' as const, text: 'Bash ls', since: NOW - 60_000 } }
  expect(ticketWaiting([own], NOW).get('TKT-1')).toBe('permission')
})

test('parseStatus keeps a well-formed reviewPosted and drops a malformed one, never the record', async () => {
  expect(parseStatus(JSON.stringify(ticketRecord(5)))?.reviewPosted).toEqual({ round: 3, at: 5 })
  const bad = parseStatus(JSON.stringify({ ...ticketRecord(), reviewPosted: { at: 'x' } }))
  expect(bad?.id).toBe('t')
  expect(bad?.reviewPosted).toBeUndefined()
})
