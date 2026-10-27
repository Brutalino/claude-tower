import { expect, test } from 'claude-code/testing'

import type { TowerSessionStatus } from '../types/index'
import { attentionEvents, chimes } from '../hooks/core/attention'
import { freeAttentionRows, freeSessionRows } from '../hooks/core/freeSessions'
import { liveSessionId, nextStatus, ofTower, parseStatus, ticketWaiting, ticketWaitText } from '../hooks/core/sessionStatus'

// Decision 059: ShopApp's Tower on `tower`, oink's on `tower-money-tracker`, both writing to one state dir.
const NOW = 1_000_000
const WAIT = { kind: 'permission', text: 'Bash gh pr view 30', since: NOW - 30_000 } as const

function record(id: string, role: TowerSessionStatus['role'], ticket: string | null, socket?: string, extra: Partial<TowerSessionStatus> = {}): TowerSessionStatus {
  return { ...nextStatus(null, { id, role, ticket, cwd: `/wt/${id}`, pane: null }, 'idle', NOW - 1_000), ...(socket !== undefined ? { socket } : {}), ...extra }
}

const SHOPAPP = [record('f-rail', 'rail', null, 'tower'), record('f-ticket', 'ticket', 'TKT-1', 'tower'), record('f-free', 'free', 'free-1', 'tower', { title: 'fleet notes' })]
const OINK = [record('o-rail', 'rail', null, 'tower-money-tracker'), record('o-ticket', 'ticket', '#26', 'tower-money-tracker', { waiting: WAIT }),
  record('o-free', 'free', 'free-1', 'tower-money-tracker', { title: 'oink notes', waiting: WAIT, updatedAt: NOW - 500 })]
const OLD = record('old', 'ticket', 'TKT-2')
const ALL = [...SHOPAPP, ...OINK, OLD]

test('ofTower keeps this Tower records and older ones without a socket, drops another Tower', async () => {
  expect(ofTower(ALL, 'tower').map(status => status.id)).toEqual(['f-rail', 'f-ticket', 'f-free', 'old'])
  expect(ofTower(ALL, 'tower-money-tracker').map(status => status.id)).toEqual(['o-rail', 'o-ticket', 'o-free', 'old'])
})

test('a session without a socket (outside a Tower) reads every record', async () => {
  expect(ofTower(ALL, null)).toEqual(ALL)
})

test('the socket goes through a status file; an older file without one still parses', async () => {
  expect(parseStatus(JSON.stringify(OINK[1]))?.socket).toBe('tower-money-tracker')
  expect(parseStatus(JSON.stringify(OLD))?.socket).toBe(undefined)
})

test('a wait in oink never reaches ShopApp Tower: no needs-you, no wait text, no popup or chime', async () => {
  // Unfiltered, ShopApp's rail would see oink's wait, and oink's newer free-1 in place of its own.
  expect(ticketWaiting(ALL, NOW).get('#26')).toBe('permission')
  expect(freeSessionRows(ALL, NOW, []).map(row => row.name)).toEqual(['oink notes'])
  const fleet = ofTower(ALL, 'tower')
  expect(ticketWaiting(fleet, NOW).size).toBe(0)
  expect(ticketWaitText(fleet, '#26', NOW)).toBe(null)
  const free = freeAttentionRows(freeSessionRows(fleet, NOW, []))
  expect(free.rows.map(row => row.label)).toEqual(['fleet notes'])
  expect(free.rows.map(row => row.group)).toEqual(['working'])
  const seen = free.rows.map(row => ({ ...row, group: 'working' as const, status: 'working' }))
  expect(attentionEvents(seen, free.rows, null)).toEqual([])
})

test('oink Tower announces its own wait, with a chime', async () => {
  const oink = ofTower(ALL, 'tower-money-tracker')
  expect(ticketWaiting(oink, NOW).get('#26')).toBe('permission')
  expect(ticketWaitText(oink, '#26', NOW)).toBe('Bash gh pr view 30')
  const free = freeAttentionRows(freeSessionRows(oink, NOW, []))
  expect(free.rows.map(row => [row.label, row.group])).toEqual([['oink notes', 'needs you']])
  const seen = free.rows.map(row => ({ ...row, group: 'working' as const, status: 'working' }))
  const events = attentionEvents(seen, free.rows, null)
  expect(events.length).toBe(1)
  expect(chimes(events[0]!)).toBe(true)
})

test('the same free key in both Towers: each goes to its own session', async () => {
  expect(liveSessionId(ofTower(ALL, 'tower'), 'free', 'free-1', NOW)).toBe('f-free')
  expect(liveSessionId(ofTower(ALL, 'tower-money-tracker'), 'free', 'free-1', NOW)).toBe('o-free')
})

test('two Towers on their own sockets (free ones too) never read each other', async () => {
  const a = record('a', 'free', 'free-1', 'tower-free-k3x9a1', { waiting: WAIT })
  const b = record('b', 'free', 'free-1', 'tower-free-m2p7q0')
  expect(ofTower([a, b], 'tower-free-k3x9a1').map(status => status.id)).toEqual(['a'])
  expect(freeSessionRows(ofTower([a, b], 'tower-free-m2p7q0'), NOW, []).map(row => row.state)).toEqual(['idle'])
})
