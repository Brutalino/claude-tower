import { expect, test } from 'claude-code/testing'

import { attentionEvents, chimes, dedupeEvents, parseAnnounced, parseQueue, pendingFor, popupTitle, pushEvent, queuedEvent, type AttentionRow, type QueuedEvent } from '../hooks/core/attention'

const working = (key: string): AttentionRow => ({ key, group: 'working', glyph: 'spinner', status: 'working' })
const planned = (key: string): AttentionRow => ({ key, group: 'needs you', glyph: '◆', status: 'planning · say go' })
const ready = (key: string): AttentionRow => ({ key, group: 'ready', glyph: '✓', status: 'ready · /open-pr' })

test('the first load gives no event, even with tickets already needing you', async () => {
  expect(attentionEvents(null, [planned('TKT-1'), ready('TKT-2')], null)).toEqual([])
})

test('a ticket that turns needs you, or working to ready, gives one event each', async () => {
  const events = attentionEvents([working('TKT-2426'), working('TKT-7')], [planned('TKT-2426'), ready('TKT-7')], null)
  expect(events.map(event => event.text)).toEqual(['◆ TKT-2426 needs you · say go', '✓ TKT-7 ready · /open-pr'])
  expect(events.map(event => event.asset)).toEqual(['assets/needs-you.wav', 'assets/ready.wav'])
  const waiting: AttentionRow = { key: 'TKT-3', group: 'needs you', glyph: '◆', status: 'needs you · permission' }
  expect(attentionEvents([working('TKT-3')], [waiting], null).map(event => event.text)).toEqual(['◆ TKT-3 needs you · permission'])
})

test('one event per transition: the next pass with the same state is quiet', async () => {
  expect(attentionEvents([planned('TKT-1')], [planned('TKT-1')], null)).toEqual([])
  expect(attentionEvents([ready('TKT-1')], [ready('TKT-1')], null)).toEqual([])
})

test('the ticket in the centre: its needs you chimes only (marked centre), its ready gives nothing', async () => {
  const events = attentionEvents([working('TKT-1')], [planned('TKT-1')], 'TKT-1')
  expect(events.map(event => [event.kind, event.centre, event.asset])).toEqual([['needs you', true, 'assets/needs-you.wav']])
  expect(attentionEvents([working('TKT-1')], [ready('TKT-1')], 'TKT-1')).toEqual([])
  expect(attentionEvents([working('TKT-2')], [planned('TKT-2')], 'TKT-1')[0]?.centre).toBeUndefined()
})

test('no event for a blocked ticket, a not-started one, a new row, or ready from not working', async () => {
  const blocked: AttentionRow = { key: 'TKT-1', group: 'needs you', glyph: '⊘', status: 'blocked by TKT-9' }
  const notStarted: AttentionRow = { key: 'TKT-2', group: 'ready', glyph: '○', status: 'not started · /start-ticket' }
  expect(attentionEvents([working('TKT-1'), working('TKT-2')], [blocked, notStarted], null)).toEqual([])
  expect(attentionEvents([], [planned('TKT-3')], null)).toEqual([])
  expect(attentionEvents([planned('TKT-4')], [ready('TKT-4')], null)).toEqual([])
})

const queued = (ticket: string, at: number, kind: 'needs' | 'ready' = 'needs'): QueuedEvent => ({ id: `${at}:${ticket}:${kind}`, ticket, kind, text: 'say go', at })

test('queuedEvent: the id, ticket, kind and the hint as the text', async () => {
  const [event] = attentionEvents([working('TKT-2426')], [planned('TKT-2426')], null)
  expect(queuedEvent(event!, 5000)).toEqual({ id: '5000:TKT-2426:needs', ticket: 'TKT-2426', kind: 'needs', text: 'say go', at: 5000 })
  expect(queuedEvent(event!, 5000, 'permission · Bash gh pr view').text).toBe('permission · Bash gh pr view')
})

test('pushEvent keeps the last 20, the newest at the end, no id twice', async () => {
  let queue: QueuedEvent[] = []
  for (let at = 1; at <= 25; at++) queue = pushEvent(queue, queued(`TKT-${at}`, at))
  expect(queue.length).toBe(20)
  expect(queue[0]?.ticket).toBe('TKT-6')
  expect(queue[19]?.ticket).toBe('TKT-25')
  expect(pushEvent(queue, queued('TKT-25', 25)).length).toBe(20)
})

test('pendingFor: the oldest fresh event not seen and not about the own ticket', async () => {
  const now = 1_000_000
  const queue = [queued('TKT-1', now - 130_000), queued('TKT-2', now - 60_000), queued('TKT-3', now - 30_000), queued('TKT-4', now - 1_000, 'ready')]
  expect(pendingFor(queue, [], now)?.ticket).toBe('TKT-2')
  expect(pendingFor(queue, [queue[1]!.id], now)?.ticket).toBe('TKT-3')
  expect(pendingFor(queue, [queue[1]!.id], now, 'TKT-3')?.ticket).toBe('TKT-4')
  expect(pendingFor(queue, queue.map(event => event.id), now)).toBeNull()
  expect(pendingFor([], [], now)).toBeNull()
})

test('parseQueue drops anything malformed; popupTitle per kind', async () => {
  expect(parseQueue(undefined)).toEqual([])
  expect(parseQueue([queued('TKT-1', 1), { id: 'x' }, null, { ...queued('TKT-2', 2), kind: 'other' }])).toEqual([queued('TKT-1', 1)])
  expect(popupTitle(queued('TKT-2426', 1))).toBe('◆ TKT-2426 needs you')
  expect(popupTitle(queued('TKT-2426', 1, 'ready'))).toBe('✓ TKT-2426 ready')
})

test('dedupeEvents: a recap-like needs(say go) → working → needs(say go) announces once; ready clears the needs you', async () => {
  let announced = {}
  const step = (previous: AttentionRow[], rows: AttentionRow[], now: number) => {
    const out = dedupeEvents(attentionEvents(previous, rows, null), announced, rows, now)
    announced = out.announced
    return out.events.map(event => event.text)
  }
  expect(step([working('TKT-1')], [planned('TKT-1')], 1)).toEqual(['◆ TKT-1 needs you · say go'])
  expect(step([planned('TKT-1')], [working('TKT-1')], 2)).toEqual([])
  expect(step([working('TKT-1')], [planned('TKT-1')], 3)).toEqual([])
  const waiting: AttentionRow = { key: 'TKT-1', group: 'needs you', glyph: '◆', status: 'needs you · permission' }
  expect(step([working('TKT-1')], [waiting], 4)).toEqual(['◆ TKT-1 needs you · permission'])
  expect(step([waiting], [working('TKT-1')], 5)).toEqual([])
  expect(step([working('TKT-1')], [ready('TKT-1')], 6)).toEqual(['✓ TKT-1 ready · /open-pr'])
  expect(announced).toEqual({ 'TKT-1': { ready: { reason: '/open-pr', at: 6 } } })
  expect(step([working('TKT-1')], [planned('TKT-1')], 7)).toEqual(['◆ TKT-1 needs you · say go'])
  expect(step([planned('TKT-1')], [], 8)).toEqual([])
  expect(announced).toEqual({})
  expect(parseAnnounced({ 'TKT-1': { kind: 'needs you', reason: 'say go', at: 1 }, bad: 3 })).toEqual({ 'TKT-1': { 'needs you': { reason: 'say go', at: 1 } } })
  expect(parseAnnounced({ 'TKT-1': { ready: { reason: '/open-pr', at: 2 }, 'needs you': { reason: 'permission' } }, 'TKT-2': {} }))
    .toEqual({ 'TKT-1': { ready: { reason: '/open-pr', at: 2 }, 'needs you': { reason: 'permission', at: 0 } } })
})

/** The rail's pass as register.tsx runs it: the events, deduped, then the ones that chime. */
function chimed() {
  let seen: AttentionRow[] | null = null
  let announced = {}
  return (rows: AttentionRow[], centre: string | null = null, now = 0) => {
    const out = dedupeEvents(attentionEvents(seen, rows, centre), announced, rows, now)
    seen = rows
    announced = out.announced
    return out.events.filter(chimes).map(event => event.text)
  }
}

test('an ordinary turn end does not chime: say go, and ready · /open-pr after each message, stay quiet', async () => {
  const pass = chimed()
  expect(pass([working('TKT-1'), working('TKT-2')])).toEqual([])
  // A plan's turn end, in the centre and away from it: a popup at most, never a chime.
  expect(pass([planned('TKT-1'), working('TKT-2')], 'TKT-1')).toEqual([])
  expect(pass([working('TKT-1'), working('TKT-2')])).toEqual([])
  expect(pass([planned('TKT-1'), working('TKT-2')])).toEqual([])
  // An implementing ticket: the first ready chimes, each later message's end that lands on the same ready does not.
  expect(pass([planned('TKT-1'), ready('TKT-2')])).toEqual(['✓ TKT-2 ready · /open-pr'])
  for (let turn = 0; turn < 3; turn++) {
    expect(pass([planned('TKT-1'), working('TKT-2')])).toEqual([])
    expect(pass([planned('TKT-1'), ready('TKT-2')])).toEqual([])
  }
  // A new step (the pull request opened) is a new reason: one chime.
  const review: AttentionRow = { key: 'TKT-2', group: 'ready', glyph: '✓', status: 'ready · review' }
  expect(pass([planned('TKT-1'), working('TKT-2')])).toEqual([])
  expect(pass([planned('TKT-1'), review])).toEqual(['✓ TKT-2 ready · review'])
})

test('a permission request chimes once, in the centre too; a question does as well', async () => {
  const pass = chimed()
  const permission: AttentionRow = { key: 'TKT-1', group: 'needs you', glyph: '◆', status: 'needs you · permission' }
  const question: AttentionRow = { key: 'TKT-1', group: 'needs you', glyph: '◆', status: 'needs you · question' }
  expect(pass([working('TKT-1')], 'TKT-1')).toEqual([])
  expect(pass([permission], 'TKT-1')).toEqual(['◆ TKT-1 needs you · permission'])
  expect(pass([permission], 'TKT-1')).toEqual([])
  expect(pass([working('TKT-1')], 'TKT-1')).toEqual([])
  expect(pass([permission], 'TKT-1')).toEqual([])
  expect(pass([working('TKT-1')], 'TKT-1')).toEqual([])
  expect(pass([question], 'TKT-1')).toEqual(['◆ TKT-1 needs you · question'])
  expect(chimes(attentionEvents([working('TKT-2')], [planned('TKT-2')], null)[0]!)).toBe(false)
})

test('an open pinned decision chimes once like a question (decision 036)', async () => {
  const pass = chimed()
  const decision: AttentionRow = { key: 'TKT-1', group: 'needs you', glyph: '◆', status: 'needs you · decision' }
  expect(pass([working('TKT-1')])).toEqual([])
  expect(pass([decision])).toEqual(['◆ TKT-1 needs you · decision'])
  expect(pass([working('TKT-1')])).toEqual([])
  expect(pass([decision])).toEqual([])
})
