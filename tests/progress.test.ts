import { expect, test } from 'claude-code/testing'

import { alertEvents } from '../hooks/core/attention'
import { agentEnded, agentSpawned, initialDeck, markersRead, stepProgress, toolFinished } from '../hooks/core/deck'
import {
  agentFailed,
  agentMissed,
  agentResumed,
  callEnded,
  callFailed,
  callStarted,
  deckAlert,
  formatShort,
  loopDetect,
  loopText,
  mainArgument,
  oldestInFlight,
  reconcileAgents,
  stalledFor,
  STALL_MS,
  stepClock,
  stepsFromTodos,
  typicalText,
} from '../hooks/core/progress'
import type { TowerCall } from '../types/index'

const AGENT = 'a1'
const ON = { stalls: true, loops: true }
const spawned = () => agentSpawned(initialDeck(), { agentId: AGENT, model: 'claude-opus-5-5', subagentType: 'executor', description: 'Do it' }, 0)
const call = (tool: string, arg: string, failed = false, at = 0): TowerCall => ({ tool, arg, failed, at })

test('stepsFromTodos: the list as steps, in_progress doing, malformed entries dropped, null for no list', async () => {
  const steps = stepsFromTodos([
    { content: 'Read', status: 'completed', activeForm: 'Reading' },
    { content: 'Fix', status: 'in_progress', activeForm: 'Fixing' },
    { content: 'Test', status: 'pending', activeForm: 'Testing' },
    { content: '', status: 'pending' },
    { content: 'Odd', status: 'weird' },
  ])
  expect(steps).toEqual([
    { id: 'todo:1', text: 'Read', status: 'done' },
    { id: 'todo:2', text: 'Fix', status: 'doing' },
    { id: 'todo:3', text: 'Test', status: 'todo' },
  ])
  expect(stepProgress({ steps: steps! })).toEqual({ done: 1, total: 3, current: 'Fix' })
  expect(stepsFromTodos('nope')).toBe(null)
})

test('a TodoWrite call sets the steps and the current step clock; markers no longer replace them', async () => {
  const todos = [{ content: 'A', status: 'completed' }, { content: 'B', status: 'in_progress' }]
  let deck = callStarted(spawned(), AGENT, '1', 'TodoWrite', { todos }, 1_000)
  expect(deck.agents[0]!.steps.map(step => step.status)).toEqual(['done', 'doing'])
  expect(deck.agents[0]!.stepSince).toBe(1_000)
  deck = callEnded(deck, AGENT, '1', 'TodoWrite', { todos }, {}, 1_500)
  expect(deck.agents[0]!.stepSince).toBe(1_000)
  expect(markersRead(deck, AGENT, '[step 1/4] Other').agents[0]!.steps).toEqual(deck.agents[0]!.steps)
  deck = callStarted(deck, AGENT, '2', 'TodoWrite', { todos: [{ content: 'A', status: 'completed' }, { content: 'B', status: 'completed' }, { content: 'C', status: 'in_progress' }] }, 9_000)
  expect(deck.agents[0]!.stepSince).toBe(9_000)
  const main = callStarted(initialDeck(), undefined, '3', 'TodoWrite', { todos }, 5)
  expect(main.main.steps).toHaveLength(2)
})

test('stepClock restarts when TaskCreate moved the current step', async () => {
  let deck = toolFinished(spawned(), AGENT, 'TaskCreate', { subject: 'Plan' }, { result: { task: { id: '7' } } })
  deck = stepClock(deck, AGENT, 2_000)
  expect(deck.agents[0]!.stepSince).toBe(2_000)
  expect(stepClock(deck, AGENT, 3_000).agents[0]!.stepSince).toBe(2_000)
})

test('a call is in flight from its start to its end, the oldest shown; its end goes into the history', async () => {
  let deck = callStarted(spawned(), AGENT, '1', 'Bash', { command: 'pnpm test\nmore' }, 100)
  deck = callStarted(deck, AGENT, '2', 'Read', { file_path: 'a.ts' }, 200)
  expect(oldestInFlight(deck.agents[0]!)).toEqual({ id: '1', line: 'Bash pnpm test', since: 100 })
  deck = callEnded(deck, AGENT, '1', 'Bash', { command: 'pnpm test' }, { isError: true }, 300)
  expect(oldestInFlight(deck.agents[0]!)?.id).toBe('2')
  expect(deck.agents[0]!.calls).toEqual([{ tool: 'Bash', arg: 'pnpm test', failed: true, at: 300 }])
  expect(deck.agents[0]!.lastEventAt).toBe(300)
  expect(callStarted(deck, 'unknown', '9', 'Read', {}, 1)).toBe(deck)
})

test('callFailed: a deny, an error, a non-zero exit code', async () => {
  expect(callFailed({ deny: 'no' })).toBe(true)
  expect(callFailed({ isError: true })).toBe(true)
  expect(callFailed({ result: { exitCode: 1 } })).toBe(true)
  expect(callFailed({ result: { exitCode: 0 } })).toBe(false)
  expect(callFailed(null)).toBe(false)
})

test('mainArgument: command, path, pattern; none for an argument-less call', async () => {
  expect(mainArgument('Bash', { command: 'pnpm test' })).toBe('pnpm test')
  expect(mainArgument('Edit', { file_path: 'src/a.ts' })).toBe('src/a.ts')
  expect(mainArgument('Grep', { pattern: 'dedupe' })).toBe('dedupe')
  expect(mainArgument('TodoWrite', { todos: [] })).toBe('')
})

test('loopDetect: three same calls in a row, or the same Bash command failing twice', async () => {
  expect(loopDetect([call('Bash', 'pnpm test', false, 1), call('Bash', 'pnpm test', false, 2), call('Bash', 'pnpm test', false, 3)]))
    .toEqual({ tool: 'Bash', arg: 'pnpm test', count: 3, since: 1 })
  expect(loopDetect([call('Read', 'a'), call('Read', 'a'), call('Read', 'b')])).toBe(null)
  expect(loopDetect([call('Read', 'a'), call('Read', 'a')])).toBe(null)
  const failing = [call('Bash', 'pnpm test', true, 5), call('Edit', 'a.ts'), call('Bash', 'pnpm test', true, 9)]
  expect(loopDetect(failing)).toEqual({ tool: 'Bash', arg: 'pnpm test', count: 2, since: 5 })
  expect(loopDetect([...failing, call('Edit', 'a.ts')])).toBe(null)
  expect(loopDetect([call('Bash', 'pnpm test', true), call('Bash', 'pnpm lint', true)])).toBe(null)
  expect(loopDetect([call('TodoWrite', ''), call('TodoWrite', ''), call('TodoWrite', '')])).toBe(null)
  expect(loopDetect([])).toBe(null)
  expect(loopText({ tool: 'Bash', arg: 'pnpm test', count: 3, since: 0 })).toBe('going in circles · Bash pnpm test ×3')
})

test('stalledFor: a working loop quiet for 2 minutes with no tool in flight', async () => {
  expect(stalledFor({ lastEventAt: 0 }, true, STALL_MS - 1)).toBe(null)
  expect(stalledFor({ lastEventAt: 0 }, true, STALL_MS + 40_000)).toBe(STALL_MS + 40_000)
  expect(stalledFor({ lastEventAt: 0, inFlight: [{ id: '1', line: 'Bash x', since: 0 }] }, true, STALL_MS * 3)).toBe(null)
  expect(stalledFor({ lastEventAt: 0 }, false, STALL_MS * 3)).toBe(null)
  expect(stalledFor({}, true, STALL_MS * 3)).toBe(null)
  expect(formatShort(160_000)).toBe('2m 40s')
  expect(formatShort(45_000)).toBe('45s')
  expect(typicalText(360_000)).toBe('~6:00')
})

test('deckAlert: a stall first (one id per stall), else a loop; none while it waits on the person or with the module off', async () => {
  let deck = callEnded(callStarted(spawned(), AGENT, '1', 'Read', { file_path: 'a' }, 0), AGENT, '1', 'Read', { file_path: 'a' }, {}, 10)
  expect(deckAlert(deck, 60_000, ON)).toBe(null)
  expect(deckAlert(deck, 10 + STALL_MS, ON)).toEqual({ kind: 'stalled', text: 'stalled · executor', id: 'stalled:executor:10' })
  expect(deckAlert(deck, 10 + STALL_MS, { stalls: false, loops: true })).toBe(null)
  expect(deckAlert({ ...deck, waiting: { kind: 'permission', text: 'Bash x', since: 0, agentId: AGENT } }, 10 + STALL_MS, ON)).toBe(null)
  for (const id of ['2', '3']) deck = callEnded(callStarted(deck, AGENT, id, 'Read', { file_path: 'a' }, 20), AGENT, id, 'Read', { file_path: 'a' }, {}, 30)
  expect(deckAlert(deck, 40, ON)).toEqual({ kind: 'loop', text: 'going in circles · executor', id: 'loop:executor:10' })
  expect(deckAlert(deck, 40, { stalls: true, loops: false })).toBe(null)
})

test('reconcile: ends what the engine ended, adds the live agents never seen, leaves the rest', async () => {
  const deck = spawned()
  const list = [
    { id: AGENT, type: 'executor', description: 'Do it', status: 'killed' },
    { id: 'b', type: 'tower:verifier', description: 'Check', status: 'running' },
    { id: 'c', type: 'Explore', description: 'Old', status: 'completed' },
  ]
  const { ended, missed } = reconcileAgents(deck, list)
  expect(ended).toEqual([{ id: AGENT, status: 'failed' }])
  expect(missed.map(one => one.id)).toEqual(['b'])
  const failed = agentFailed(deck, AGENT, 50)
  expect(failed.agents[0]!.status).toBe('failed')
  expect(failed.agents[0]!.endedAt).toBe(50)
  const added = agentMissed(deck, missed[0]!, 60)
  expect(added.agents[1]).toMatchObject({ id: 'b', name: 'verifier', type: 'tower:verifier', status: 'running', task: 'Check', startedAt: 60 })
  expect(agentMissed(added, missed[0]!, 70)).toBe(added)
  expect(reconcileAgents(failed, list).ended).toEqual([])
})

test('reconcile: a done or failed agent the engine lists alive again is resumed; idle or ended is not', async () => {
  const done = agentEnded(spawned(), AGENT, 'ok', 50)
  const failed = agentFailed(spawned(), AGENT, 50)
  const one = (status: string) => [{ id: AGENT, type: 'executor', description: 'Do it', status }]
  expect(reconcileAgents(done, one('running'))).toEqual({ ended: [], missed: [], resumed: [AGENT] })
  expect(reconcileAgents(failed, one('pending')).resumed).toEqual([AGENT])
  expect(reconcileAgents(done, one('waiting')).resumed).toEqual([AGENT])
  expect(reconcileAgents(done, one('idle')).resumed).toEqual([])
  expect(reconcileAgents(done, one('completed')).resumed).toEqual([])
  expect(reconcileAgents(spawned(), one('running'))).toEqual({ ended: [], missed: [], resumed: [] })
})

test('agentResumed: running again from now, its tokens and earlier spans kept; a running agent untouched', async () => {
  const done = agentEnded({ ...spawned(), agents: spawned().agents.map(agent => ({ ...agent, tokens: { input: 7, output: 3 } })) }, AGENT, 'ok', 50)
  const resumed = agentResumed(done, AGENT, 80)
  expect(resumed.agents[0]).toMatchObject({ status: 'running', endedAt: null, startedAt: 80, lastEventAt: 80, inFlight: [], tokens: { input: 7, output: 3 }, lastOutput: 'ok' })
  expect(resumed.agents[0]!.spans).toEqual(done.agents[0]!.spans)
  expect(resumed.agents[0]!.spans).toEqual([{ model: 'claude-opus-5-5', from: 0, to: 50 }])
  const running = spawned()
  expect(agentResumed(running, AGENT, 80)).toEqual(running)
})

test('alertEvents: one needs-you event per alert id, none on the first load, the centre marked', async () => {
  const rows = [{ key: 'TKT-1', alert: { text: 'stalled · executor', id: 's:1' } }, { key: 'TKT-2', alert: null }]
  const first = alertEvents(null, rows, null)
  expect(first.events).toEqual([])
  expect(alertEvents(first.seen, rows, null).events).toEqual([])
  const next = alertEvents({}, rows, 'TKT-1')
  expect(next.events).toEqual([{ key: 'TKT-1', kind: 'needs you', text: '◆ TKT-1 stalled · executor', hint: 'stalled · executor', asset: 'assets/needs-you.wav', centre: true }])
  const again = alertEvents(next.seen, [{ key: 'TKT-1', alert: { text: 'stalled · executor', id: 's:2' } }], null)
  expect(again.events).toHaveLength(1)
})
