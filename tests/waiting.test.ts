import { expect, test } from 'claude-code/testing'

import type { TowerRailRow, TowerSessionStatus } from '../types/index'
import { initialDeck, waitingAsked, waitingDone, waitingEnded, waitingShown, waitingText } from '../hooks/core/deck'
import { railStatus, rowStep as rowStepWith } from '../hooks/core/nextStep'
import { rowGlyph } from '../hooks/core/rail'
import { reviewBox, reviewKeys } from '../hooks/core/reviewBox'
import { isRealWait, parseStatus, REAL_WAIT_MS, ticketLiveSessions, ticketWaiting } from '../hooks/core/sessionStatus'
import { theme } from '../hooks/core/theme'
import { LINEAR_CONFIG } from './linearConfig'

type TowerRailRowOf = Parameters<typeof rowStepWith>[0]

const rowStep = (row: TowerRailRowOf, pullRequest: Parameters<typeof rowStepWith>[1], blockedBy: readonly string[] = []) => rowStepWith(row, pullRequest, blockedBy, LINEAR_CONFIG.workflow)

const LONG = 'gh pr view 103 --json title,body,comments,reviews,files,commits,headRefName,baseRefName'

test('waitingText: the tool and its main argument cut to 60 characters', async () => {
  expect(waitingText('Bash', { command: 'gh pr view 103' })).toBe('Bash gh pr view 103')
  expect(Array.from(waitingText('Bash', { command: LONG })).length).toBeLessThanOrEqual(65)
  expect(waitingText('Edit', { file_path: 'src/a.ts' })).toBe('Edit src/a.ts')
  expect(waitingText('WebFetch', { url: 'https://x' })).toBe('WebFetch')
})

test('waitingShown: a shown dialog waits on a permission; only the same loop moving on ends it', async () => {
  const main = waitingShown(initialDeck(), 'Bash', { command: 'gh pr view 103' }, undefined, 5)
  expect(main.waiting).toEqual({ kind: 'permission', text: 'Bash gh pr view 103', since: 5 })
  expect(waitingDone(main, undefined).waiting).toBeNull()
  // An agent's call returning or its step leaves the main loop's dialog up.
  expect(waitingDone(main, 'a1')).toBe(main)
  const agent = waitingShown(initialDeck(), 'Bash', { command: 'make test' }, 'a1', 6)
  expect(agent.waiting).toEqual({ kind: 'permission', text: 'Bash make test', since: 6, agentId: 'a1' })
  expect(waitingDone(agent, undefined)).toBe(agent)
  expect(waitingDone(agent, 'a2')).toBe(agent)
  expect(waitingDone(agent, 'a1').waiting).toBeNull()
  // The same loop starting another call answered the dialog; another loop's call does not.
  expect(waitingAsked(agent, 'Read', { file_path: 'a.ts' }, 7, 'a1').waiting).toBeNull()
  expect(waitingAsked(agent, 'Read', { file_path: 'a.ts' }, 7, 'a2')).toBe(agent)
  expect(waitingEnded(agent).waiting).toBeNull()
  // Nothing waiting: the same deck back.
  const deck = initialDeck()
  expect(waitingDone(deck, undefined)).toBe(deck)
  expect(waitingEnded(deck)).toBe(deck)
})

test('waitingAsked: AskUserQuestion waits with its first question, cut; any other tool leaves the deck', async () => {
  const deck = initialDeck()
  expect(waitingAsked(deck, 'Bash', { command: 'ls' }, 1)).toBe(deck)
  const asked = waitingAsked(deck, 'AskUserQuestion', { questions: [{ question: 'Which base branch?' }, { question: 'Second?' }] }, 7)
  expect(asked.waiting).toEqual({ kind: 'question', text: 'Which base branch?', since: 7 })
  const long = waitingAsked(deck, 'AskUserQuestion', { questions: [{ question: 'x'.repeat(100) }] }, 7)
  expect(Array.from(long.waiting!.text).length).toBe(60)
  expect(waitingAsked(deck, 'AskUserQuestion', {}, 7).waiting).toEqual({ kind: 'question', text: 'question', since: 7 })
  expect(waitingEnded(asked).waiting).toBeNull()
  // A question stays while other calls start; its own call returning ends it.
  expect(waitingAsked(asked, 'Read', {}, 8)).toBe(asked)
  expect(waitingDone(asked, undefined).waiting).toBeNull()
  expect(waitingAsked(deck, 'AskUserQuestion', { questions: [{ question: 'Q?' }] }, 9, 'a1').waiting).toEqual({ kind: 'question', text: 'Q?', since: 9, agentId: 'a1' })
})

const STATUS = { v: 1, id: 's1', role: 'review', ticket: 'TKT-1', cwd: '/wt', pane: null, state: 'working', since: 1, updatedAt: 1_000 }

test('parseStatus keeps a valid waiting and drops a malformed one, never the record', async () => {
  const waiting = { kind: 'permission', text: 'Bash gh pr view 103', since: 900 }
  expect(parseStatus(JSON.stringify({ ...STATUS, waiting }))?.waiting).toEqual(waiting)
  const bad = parseStatus(JSON.stringify({ ...STATUS, waiting: { kind: 'other', text: 1 } }))
  expect(bad?.id).toBe('s1')
  expect(bad !== null && 'waiting' in bad).toBe(false)
})

test('ticketWaiting and ticketLiveSessions: a waiting ticket or review session marks its ticket', async () => {
  const statuses = [
    { ...STATUS, waiting: { kind: 'question', text: 'Which?', since: -9_000 } },
    { ...STATUS, id: 's2', role: 'ticket', state: 'idle' },
    { ...STATUS, id: 's3', ticket: 'TKT-2', waiting: { kind: 'permission', text: 'Bash x', since: -9_000 }, updatedAt: -100_000 },
  ] as TowerSessionStatus[]
  expect([...ticketWaiting(statuses, 1_000)]).toEqual([['TKT-1', 'question']])
  expect(ticketLiveSessions(statuses, 'TKT-1', 1_000)).toEqual([
    { role: 'review', state: 'working', since: 1, waiting: true },
    { role: 'ticket', state: 'idle', since: 1 },
  ])
  // A permission wins over a question.
  const both = [...statuses, { ...STATUS, id: 's4', role: 'ticket', waiting: { kind: 'permission', text: 'Bash y', since: -9_500 } }] as TowerSessionStatus[]
  expect(ticketWaiting(both, 1_000).get('TKT-1')).toBe('permission')
})

test('isRealWait: a wait counts once it lasted 10 s; an auto-mode ask resolved sooner never shows', async () => {
  const wait = { kind: 'permission' as const, text: 'Bash x', since: 1_000 }
  expect(isRealWait(wait, 1_000 + REAL_WAIT_MS - 1)).toBe(false)
  expect(isRealWait(wait, 1_000 + REAL_WAIT_MS)).toBe(true)
  expect(isRealWait(null, 99_999)).toBe(false)
  expect(isRealWait(undefined, 99_999)).toBe(false)
  // A fresh wait marks no ticket and no session yet.
  const fresh = [{ ...STATUS, waiting: { kind: 'permission', text: 'Bash x', since: 995 } }] as TowerSessionStatus[]
  expect(ticketWaiting(fresh, 1_000).size).toBe(0)
  expect(ticketLiveSessions(fresh, 'TKT-1', 1_000)).toEqual([{ role: 'review', state: 'working', since: 1 }])
})

test('waitingAsked: any other call starting ends a permission wait (its ask was answered); a question stays', async () => {
  const asked = waitingShown(initialDeck(), 'Bash', { command: 'ls' }, undefined, 5)
  expect(waitingAsked(asked, 'Bash', { command: 'ls' }, 6).waiting).toBeNull()
  const question = waitingAsked(initialDeck(), 'AskUserQuestion', { questions: [{ question: 'Which?' }] }, 5)
  expect(waitingAsked(question, 'Read', { file_path: 'a.ts' }, 6)).toBe(question)
})

function row(over: Partial<TowerRailRow> = {}): TowerRailRow {
  return { key: 'TKT-1', branch: 'me/tkt-1', path: '/w/TKT-1', phase: 'implementing', next: null, hasPlan: false, blockers: [], session: 'working', agents: 1, ...over }
}

test('the rail: a waiting session reads `needs you · permission` with ◆, before working', async () => {
  const step = rowStep(row({ waiting: 'permission' }), null)
  expect(step.group).toBe('needs you')
  expect(step.glyph).toBe('◆')
  expect(railStatus(step)).toBe('needs you · permission')
  expect(railStatus(rowStep(row({ waiting: 'question' }), null))).toBe('needs you · question')
  expect(rowGlyph(row({ waiting: 'question' }), theme('claude'))).toEqual({ glyph: '◆', color: theme('claude').needsYou, dim: false })
  expect(rowStep(row({ waiting: null }), null).group).toBe('working')
})

const PR = { kind: 'pr', number: 103, state: 'open', rounds: 0, lastReviewAt: null }
const RUN = { pr: 103, round: 2, startedAt: 1_000, baseRounds: 1, postedAt: null }
const PEER = { state: 'working', since: 2_000, action: 'Bash gh pr diff', asks: null }

test('reviewBox: a waiting review session is `asks` with waiting, while working and whatever its since', async () => {
  expect(reviewBox(PR, RUN, { ...PEER, waiting: 'Bash gh pr view 103' }))
    .toEqual({ kind: 'asks', pr: 103, round: 2, startedAt: 1_000, question: 'Bash gh pr view 103', waiting: true })
  expect(reviewBox(PR, RUN, { ...PEER, since: 500, waiting: 'Which base?' })?.kind).toBe('asks')
  expect(reviewBox(PR, RUN, { ...PEER, waiting: null })?.kind).toBe('reviewing')
  expect(reviewBox(PR, RUN, PEER)?.kind).toBe('reviewing')
  // Posted: waiting no longer matters.
  expect(reviewBox(PR, { ...RUN, postedAt: 9_000 }, { ...PEER, waiting: 'Bash x' })?.kind).toBe('posted')
})

test('reviewKeys: `l: look` in every state with a review session', async () => {
  expect(reviewKeys({ kind: 'none', pr: 103 })).toEqual(['v'])
  expect(reviewKeys({ kind: 'reviewing', pr: 103, round: 1, startedAt: 1, action: '' })).toEqual(['l'])
  expect(reviewKeys({ kind: 'asks', pr: 103, round: 1, startedAt: 1, question: 'Which?' })).toEqual(['l'])
  expect(reviewKeys({ kind: 'asks', pr: 103, round: 1, startedAt: 1, question: 'Bash x', waiting: true })).toEqual(['l'])
  expect(reviewKeys({ kind: 'posted', pr: 103, round: 1, at: null })).toEqual(['v', 'l'])
})

test('a working session wins over a planning state file: `working`, not needs you', async () => {
  expect(rowStep(row({ phase: 'planning', session: 'working', agents: 0 }), null).group).toBe('working')
  expect(rowStep(row({ phase: 'planning', session: 'idle', agents: 0 }), null).status).toBe('planning · say go')
})
