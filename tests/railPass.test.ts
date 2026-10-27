import { expect, test } from 'claude-code/testing'

import { stepAgent, stepUnderWay } from '../hooks/core/deck'
import { demoDeck } from '../hooks/core/demo'
import { railStatus, ticketStep as ticketStepWith } from '../hooks/core/nextStep'
import type { StepInput } from '../hooks/core/nextStep'
import { planBack } from '../hooks/core/panes'
import type { TmuxPane } from '../hooks/core/panes'
import { newestTicketStatuses, parseStatus } from '../hooks/core/sessionStatus'
import { LINEAR_CONFIG } from './linearConfig'

type StepInputOf = Parameters<typeof ticketStepWith>[0]

const ticketStep = (input: StepInputOf) => ticketStepWith(input, LINEAR_CONFIG.workflow)

const pane = (id: string, window: string, role: string, ticket = ''): TmuxPane => ({ id, window, role, ticket, tag: '' })
const input = (over: Partial<StepInput>): StepInput => ({ ticket: 'TKT-1', work: null, pullRequest: null, session: { working: false, agent: null }, green: false, ...over })

test('the demo deck names its first started running agent with steps', async () => {
  expect(stepAgent(demoDeck(0))).toEqual({ name: 'executor', done: 2, total: 5 })
})

test('with several agents with steps, the first started wins; agents without steps or ended are skipped', async () => {
  const deck = demoDeck(0)
  const base = deck.agents[0]!
  const steps = (done: number, total: number) => Array.from({ length: total }, (_, i) => ({ id: String(i), text: 's', status: i < done ? 'done' as const : 'todo' as const }))
  const agents = [
    { ...base, name: 'a', status: 'running' as const, startedAt: 30, steps: steps(1, 2) },
    { ...base, name: 'b', status: 'running' as const, startedAt: 20, steps: steps(1, 4) },
    { ...base, name: 'c', status: 'running' as const, startedAt: 10, steps: [] },
    { ...base, name: 'd', status: 'done' as const, startedAt: 0, steps: steps(0, 4) },
  ]
  expect(stepAgent({ ...deck, agents })).toEqual({ name: 'b', done: 1, total: 4 })
  expect(stepAgent({ ...deck, agents: [] })).toBe(null)
})

test('the rail status reads in the source words', async () => {
  expect(railStatus(ticketStep(input({ session: { working: true, agent: { name: 'executor', done: 3, total: 5 } } })))).toBe('working · executor 4/5')
  expect(railStatus(ticketStep(input({ session: { working: true, agent: null } })))).toBe('working')
  expect(railStatus(ticketStep(input({ work: { phase: 'planning', blockers: [] } })))).toBe('needs you · say go')
  expect(railStatus(ticketStep(input({ work: { phase: 'implementing', blockers: ['waits on API'] } })))).toBe('blocked by waits on API')
  expect(railStatus(ticketStep(input({ work: { phase: 'implementing', blockers: [] }, blockedBy: ['TKT-9', 'TKT-8'] })))).toBe('blocked by TKT-9 +1')
  const pr = { kind: 'pr' as const, number: 7, state: 'open' as const, checks: 'passing', green: false }
  expect(railStatus(ticketStep(input({ work: { phase: 'implementing', blockers: [] }, pullRequest: pr as never })))).toBe('ready · review')
  expect(railStatus(ticketStep(input({ work: { phase: 'implementing', blockers: [] }, pullRequest: pr as never, green: true })))).toBe('ready · merge')
})

test('a status file keeps agent, tokens and cost', async () => {
  const raw = { v: 1, id: 's', role: 'ticket', ticket: 'TKT-1', cwd: '/w', pane: null, state: 'working', since: 0, updatedAt: 10, agent: { name: 'executor', done: 3, total: 5 }, tokens: { fable: 9000 }, cost: 0.52 }
  const status = parseStatus(JSON.stringify(raw))
  expect(status?.agent).toEqual({ name: 'executor', done: 3, total: 5 })
  expect(newestTicketStatuses([status!], 20).get('TKT-1')?.tokens).toEqual({ fable: 9000 })
  expect(status?.cost).toBe(0.52)
})

test('back to the board parks the centre pane and the rest of its group', async () => {
  const panes = [pane('%0', '@0', 'rail'), pane('%1', '@0', 'ticket', 'TKT-2'), pane('%2', '@0', ''), pane('%3', '@1', 'ticket', 'TKT-3')]
  expect(planBack(panes, '%0', '@0')).toEqual({ centre: '%1', others: ['%2'] })
  expect(planBack([pane('%0', '@0', 'rail'), pane('%3', '@1', 'ticket', 'TKT-3')], '%0', '@0')).toBe(null)
})

test('the list and the agent card name the same step under way: done + 1, capped at the total', () => {
  // The card reads `step 2 of 3` for one step done; the list must read 2/3, not 1/3.
  expect(stepUnderWay(1, 3)).toBe(2)
  expect(stepUnderWay(3, 3)).toBe(3)
  expect(railStatus(ticketStep(input({ session: { working: true, agent: { name: 'executor', done: 1, total: 3 } } })))).toBe('working · executor 2/3')
  expect(railStatus(ticketStep(input({ session: { working: true, agent: { name: 'executor', done: 3, total: 3 } } })))).toBe('working · executor 3/3')
})
