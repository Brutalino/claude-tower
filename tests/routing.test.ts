import { expect, test } from 'claude-code/testing'

import { initialDeck, routeDecided } from '../hooks/core/deck'
import { STEPS_PARAGRAPH } from '../hooks/core/profile'
import { PROFILE } from './linearConfig'
import { describeRoute, initialRouting, isRecorded, lastDecision, MAX_DECISIONS, routeRecorded, routeSpawn, routingMode } from '../hooks/core/routing'

const ENGINE = { plugin: 'engine' }
const spawnOf = (subagentType: string, provider = ENGINE, fork = false) => ({ subagentType, provider, fork })

test('the profile has four roles, each with the steps paragraph and the tools note', () => {
  expect(PROFILE.roles.map(role => role.name)).toEqual(['executor', 'scout', 'verifier', 'runner'])
  expect(PROFILE.roles.map(role => [role.model, role.effort])).toEqual([['opus', 'medium'], ['sonnet', 'low'], ['sonnet', 'medium'], ['haiku', null]])
  for (const role of PROFILE.roles) {
    expect(role.prompt).toContain(STEPS_PARAGRAPH)
    expect(role.prompt).toContain('Glob and Grep do not exist here')
    expect(role.description.length).toBeGreaterThan(0)
    expect(role.work.length).toBeGreaterThan(0)
  }
  expect(STEPS_PARAGRAPH).toContain('[step 2/5] what this step does')
  expect(STEPS_PARAGRAPH).not.toMatch(/Task(Create|Update|List)/)
  const readOnly = ['Edit', 'Write', 'NotebookEdit']
  expect(PROFILE.roles.map(role => role.disallowedTools)).toEqual([[], readOnly, readOnly, []])
  for (const name of ['scout', 'verifier']) {
    expect(PROFILE.roles.find(role => role.name === name)?.prompt).toContain('never edit')
  }
  for (const role of PROFILE.roles) expect(PROFILE.mainGuidance).toContain(`tower:${role.name}: ${role.work}`)
  expect(PROFILE.mainGuidance).toContain('[step 2/5] what this step does')
})

test('routeSpawn: a fork is denied with the advice, whatever its type', () => {
  expect(routeSpawn(spawnOf('fork', ENGINE, true), PROFILE)).toEqual({ kind: 'deny', reason: PROFILE.forkAdvice })
  expect(routeSpawn(spawnOf('tower:scout', { plugin: 'tower' }, true), PROFILE).kind).toBe('deny')
})

test('routeSpawn: our own roles pass', () => {
  for (const role of PROFILE.roles) expect(routeSpawn(spawnOf(`tower:${role.name}`, { plugin: 'tower' }), PROFILE)).toEqual({ kind: 'pass' })
})

test("routeSpawn: other people's agent types pass untouched, even with a built-in's name", () => {
  expect(routeSpawn(spawnOf('my-reviewer', { plugin: 'userSettings' }), PROFILE)).toEqual({ kind: 'pass' })
  expect(routeSpawn(spawnOf('Explore', { plugin: 'other-plugin' }), PROFILE)).toEqual({ kind: 'pass' })
})

test('routeSpawn: built-in types follow their route; others are left alone', () => {
  expect(routeSpawn(spawnOf('Explore'), PROFILE)).toEqual({ kind: 'role', type: 'tower:scout' })
  expect(routeSpawn(spawnOf('Plan'), PROFILE)).toEqual({ kind: 'model', model: 'sonnet' })
  expect(routeSpawn(spawnOf('general-purpose'), PROFILE)).toEqual({ kind: 'model', model: 'sonnet' })
  expect(routeSpawn(spawnOf('claude'), PROFILE)).toEqual({ kind: 'model', model: 'sonnet' })
  expect(routeSpawn(spawnOf('statusline-setup'), PROFILE)).toEqual({ kind: 'pass' })
  expect(routeSpawn(spawnOf('toString'), PROFILE)).toEqual({ kind: 'pass' })
})

test('describeRoute: one short line per decision', () => {
  expect(describeRoute(spawnOf('fork', ENGINE, true), { kind: 'deny', reason: 'x' }, null)).toBe('fork → denied')
  expect(describeRoute(spawnOf('Explore'), { kind: 'role', type: 'tower:scout' }, 'claude-sonnet-4-6')).toBe('Explore → scout · sonnet-4.6')
  expect(describeRoute(spawnOf('Explore'), { kind: 'role', type: 'tower:scout' }, null)).toBe('Explore → scout')
  expect(describeRoute(spawnOf('general-purpose'), { kind: 'model', model: 'sonnet' }, null)).toBe('general-purpose → sonnet')
  expect(describeRoute(spawnOf('general-purpose'), { kind: 'model', model: 'sonnet' }, 'claude-sonnet-4-6')).toBe('general-purpose → sonnet-4.6')
  expect(describeRoute(spawnOf('tower:executor'), { kind: 'pass' }, 'opus')).toBe('tower:executor · opus')
  expect(describeRoute(spawnOf('my-reviewer'), { kind: 'pass' }, null)).toBe('my-reviewer')
})

test('isRecorded: every decision, the plain pass of one of our roles included', () => {
  expect(isRecorded(spawnOf('tower:scout'), { kind: 'pass' }, PROFILE)).toBe(true)
  expect(isRecorded(spawnOf('my-reviewer'), { kind: 'pass' }, PROFILE)).toBe(true)
  expect(isRecorded(spawnOf('Explore'), { kind: 'role', type: 'tower:scout' }, PROFILE)).toBe(true)
})

test('routingMode: enforce unless observe or off', () => {
  expect(routingMode('observe')).toBe('observe')
  expect(routingMode('off')).toBe('off')
  expect(routingMode('enforce')).toBe('enforce')
  expect(routingMode(undefined)).toBe('enforce')
  expect(routingMode('nonsense')).toBe('enforce')
})

test('routing reducers: counts, last decision, and only the last 20 kept', () => {
  expect(lastDecision(initialRouting())).toBe(null)
  let routing = routeRecorded(initialRouting(), { at: 1, text: 'Explore → scout', kind: 'role' })
  routing = routeRecorded(routing, { at: 2, text: 'general-purpose → sonnet', kind: 'model' })
  routing = routeRecorded(routing, { at: 3, text: 'fork → denied', kind: 'deny' })
  routing = routeRecorded(routing, { at: 4, text: 'my-reviewer', kind: 'pass' })
  expect([routing.rerouted, routing.denied, lastDecision(routing)]).toEqual([2, 1, 'my-reviewer'])
  for (let i = 0; i < 30; i++) routing = routeRecorded(routing, { at: 10 + i, text: `t${i}`, kind: 'model' })
  expect(routing.decisions.length).toBe(MAX_DECISIONS)
  expect(routing.decisions[0]?.text).toBe('t10')
  expect(routing.rerouted).toBe(32)
})

test('routeDecided: the deck carries the routing record', () => {
  const deck = routeDecided(initialDeck(), { at: 1, text: 'fork → denied', kind: 'deny' })
  expect(deck.routing.denied).toBe(1)
  expect(initialDeck().routing).toEqual({ decisions: [], rerouted: 0, denied: 0 })
})
