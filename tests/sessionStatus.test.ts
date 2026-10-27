import { expect, test } from 'claude-code/testing'

import type { TowerSessionStatus } from '../types/index'
import { footerText, isAlive, nextStatus, parseStatus, ticketSessionStates, ticketWaitText, withLivePanes } from '../hooks/core/sessionStatus'

const IDENTITY = { id: 's1', role: 'ticket', ticket: 'TKT-1', cwd: '/wt', pane: '%3' } as const

test('since moves only when the state changes', async () => {
  const first = nextStatus(null, IDENTITY, 'idle', 1000)
  expect(first).toEqual({ v: 1, ...IDENTITY, state: 'idle', since: 1000, updatedAt: 1000 })
  const beat = nextStatus(first, IDENTITY, 'idle', 6000)
  expect(beat.since).toBe(1000)
  expect(beat.updatedAt).toBe(6000)
  expect(nextStatus(beat, IDENTITY, 'working', 7000).since).toBe(7000)
})

test('a record older than 20 s, or ended, is dead', async () => {
  const status = nextStatus(null, IDENTITY, 'working', 0)
  expect(isAlive(status, 20_000)).toBe(true)
  expect(isAlive(status, 20_001)).toBe(false)
  expect(isAlive({ ...status, state: 'ended' }, 1)).toBe(false)
})

test('parseStatus rejects what is not a status record', async () => {
  expect(parseStatus('nope')).toBe(null)
  expect(parseStatus('{"v":2,"id":"x","role":"rail","updatedAt":1}')).toBe(null)
  expect(parseStatus(JSON.stringify(nextStatus(null, IDENTITY, 'idle', 5)))?.id).toBe('s1')
})

test('ticket session states keep live ticket sessions only, newest first', async () => {
  const at = (id: string, ticket: string, state: 'idle' | 'working', updatedAt: number): TowerSessionStatus =>
    ({ ...nextStatus(null, { ...IDENTITY, id, ticket }, state, updatedAt) })
  const states = ticketSessionStates(
    [
      at('a', 'TKT-1', 'idle', 90_000),
      at('b', 'TKT-1', 'working', 95_000),
      at('c', 'TKT-2', 'working', 10_000),
      { ...at('d', 'TKT-3', 'idle', 99_000), role: 'rail' },
    ],
    100_000,
  )
  expect([...states.entries()]).toEqual([['TKT-1', 'working']])
})

test('the footer names the agent with the longest time left', async () => {
  expect(footerText(true, [{ name: 'reader', leftMs: 30_000 }, { name: 'executor', leftMs: 120_000 }])).toBe('2 agents · executor ≈ 2m left')
  expect(footerText(true, [{ name: 'reader', leftMs: null }])).toBe('1 agent')
  expect(footerText(true, [{ name: 'reader', leftMs: -5 }])).toBe('1 agent · reader ≈ soon')
  expect(footerText(true, [])).toBe('working')
  expect(footerText(false, [])).toBe('')
})

test('the status-line fields go into the record; an old file without them still parses', async () => {
  const identity = { id: 's1', role: 'ticket' as const, ticket: 'TKT-1', cwd: '/w', pane: null }
  const status = nextStatus(null, identity, 'idle', 1, undefined, { model: 'claude-haiku-4-5', effort: 'high', footer: '' })
  expect(status.model).toBe('claude-haiku-4-5')
  expect(status.effort).toBe('high')
  expect(parseStatus(JSON.stringify({ v: 1, id: 's1', role: 'rail', ticket: null, cwd: '/', pane: null, state: 'idle', since: 1, updatedAt: 1 }))?.footer).toBe(undefined)
})

test('a record whose tmux pane (by tag) is gone is dropped; rail and untagged records stay', async () => {
  const at = (id: string, role: 'rail' | 'ticket' | 'review', tag?: string): TowerSessionStatus =>
    ({ ...nextStatus(null, { ...IDENTITY, id, role }, 'idle', 1000), ...(tag !== undefined ? { tag } : {}) })
  const kept = withLivePanes([at('a', 'ticket', 'ticket-1'), at('b', 'review', 'review-2'), at('c', 'rail', 'rail-3'), at('d', 'review')], new Set(['ticket-1']))
  expect(kept.map(status => status.id)).toEqual(['a', 'c', 'd'])
})

test('ticketWaitText: a wait once it counts', async () => {
  const now = 1_000_000
  const base = { v: 1, ticket: null, pane: null, state: 'idle', since: 0 } as const
  const statuses = [
    { ...base, id: 'old', role: 'rail', cwd: '/repo', updatedAt: now - 5_000 },
    { ...base, id: 'new', role: 'rail', cwd: '/repo', updatedAt: now - 1_000 },
    { ...base, id: 'other', role: 'rail', cwd: '/other', updatedAt: now },
    { ...base, id: 'dead', role: 'rail', cwd: '/repo', updatedAt: now - 60_000 },
    { ...base, id: 't', role: 'ticket', ticket: 'TKT-1', cwd: '/w', updatedAt: now, waiting: { kind: 'permission', text: 'Bash gh pr view', since: now - 11_000 } },
    { ...base, id: 'u', role: 'ticket', ticket: 'TKT-2', cwd: '/w', updatedAt: now, waiting: { kind: 'permission', text: 'Bash ls', since: now - 2_000 } },
  ] as TowerSessionStatus[]
  expect(ticketWaitText(statuses, 'TKT-1', now)).toBe('Bash gh pr view')
  expect(ticketWaitText(statuses, 'TKT-2', now)).toBeNull()
})
