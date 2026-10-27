import { expect, test } from 'claude-code/testing'

import { validateConfig } from '../hooks/core/config'
import { LINEAR_CONFIG } from './linearConfig'
import { effortPips } from '../hooks/core/deckView'
import { claudeCommand } from '../hooks/core/panes'
import { EFFORTS, type Profile } from '../hooks/core/profile'
import { PROFILE } from './linearConfig'
import { parseCatalogue, parseInitialize } from '../hooks/core/models'
import {
  applyOverrides, cycleOverride, droppedOverrides, freeStart, launchedModel, nextEffort, nextModel, NO_OVERRIDES, overridesPath, parseOverrides,
  resetOverride, routeCells, routedStart, routeEfforts, routeValue, routingRows, setOverride, tableValue, type RoutingOverrides,
} from '../hooks/core/routingOverrides'
import { STDOUT } from './modelsFixture'

type Json = any

const clone = (value: unknown): Json => JSON.parse(JSON.stringify(value))

const skill = (profile: Profile, name: string) => profile.skills.find(one => one.name === name)!
const role = (profile: Profile, name: string) => profile.roles.find(one => one.name === name)!

test('overridesPath: <state dir>/routing/<project id>.json', async () => {
  expect(overridesPath('/tmp/state/', '/home/x/shopapp')).toBe('/tmp/state/routing/-home-x-shopapp.json')
})

test('parseOverrides: keeps known skills, roles and free; an absent file or bad JSON is no override', async () => {
  const raw = {
    skills: { review: { model: 'opus', effort: 'max' }, shape: { effort: null } },
    roles: { executor: { model: 'fable' }, runner: { model: null, effort: 'low' } },
    free: { model: 'sonnet', effort: 'high' },
  }
  expect(parseOverrides(raw, PROFILE)).toEqual(raw)
  expect(droppedOverrides(raw, PROFILE)).toEqual([])
  expect(parseOverrides(undefined, PROFILE)).toEqual(NO_OVERRIDES)
  expect(parseOverrides('nonsense', PROFILE)).toEqual(NO_OVERRIDES)
  expect(droppedOverrides(undefined, PROFILE)).toEqual([])
})

test('parseOverrides: unknown skills and roles, a model that is not a string, unknown efforts and fields are dropped and reported; an unknown model id is kept', async () => {
  const raw = {
    skills: { nope: { model: 'opus' }, review: { model: 'gpt', effort: 'medium' }, shape: { effort: 'extreme' }, triage: 'opus' },
    roles: { boss: { model: 'opus' }, scout: { model: 'haiku', colour: 'red' } },
    free: { model: 7, effort: 'low' },
    extra: true,
  }
  expect(parseOverrides(raw, PROFILE)).toEqual({ skills: { review: { model: 'gpt', effort: 'medium' } }, roles: { scout: { model: 'haiku' } }, free: { effort: 'low' } })
  expect(droppedOverrides(raw, PROFILE).sort()).toEqual([
    'extra', 'free.model', 'roles.boss', 'roles.scout.colour', 'skills.nope', 'skills.shape.effort', 'skills.triage',
  ].sort())
})

test('applyOverrides: skills and roles take the override; absent keeps the table, null is the session default; nothing mutated', async () => {
  const before = clone(PROFILE)
  const overrides: RoutingOverrides = {
    skills: { review: { model: 'opus' }, shape: { model: null, effort: null } },
    roles: { executor: { effort: 'high' }, runner: { model: null } },
    free: { model: 'haiku' },
  }
  const routed = applyOverrides(PROFILE, overrides)
  expect(skill(routed, 'review')).toEqual({ ...skill(PROFILE, 'review'), model: 'opus' })
  expect(skill(routed, 'review').effort).toBe('high')
  expect(skill(routed, 'shape')).toEqual({ ...skill(PROFILE, 'shape'), model: null, effort: null })
  expect(skill(routed, 'triage')).toBe(skill(PROFILE, 'triage'))
  expect(role(routed, 'executor')).toEqual({ ...role(PROFILE, 'executor'), effort: 'high' })
  expect(role(routed, 'runner').model).toBeNull()
  expect(role(routed, 'scout')).toBe(role(PROFILE, 'scout'))
  expect(clone(PROFILE)).toEqual(before)
  expect(applyOverrides(PROFILE, NO_OVERRIDES).skills).toEqual(PROFILE.skills)
})

test('free: the override as `--model` / `--effort`; TOWER_SESSION_MODEL wins over the model; no override passes no flag', async () => {
  const overrides: RoutingOverrides = { skills: {}, roles: {}, free: { model: 'fable', effort: 'xhigh' } }
  expect(freeStart(overrides, PROFILE.modelIds, null)).toEqual({ model: 'claude-fable-5-1', effort: 'xhigh' })
  expect(freeStart(overrides, PROFILE.modelIds, 'haiku')).toEqual({ model: 'haiku', effort: 'xhigh' })
  expect(freeStart(NO_OVERRIDES, PROFILE.modelIds, null)).toEqual({ model: null, effort: null })
  expect(freeStart({ ...NO_OVERRIDES, free: { model: null } }, PROFILE.modelIds, null)).toEqual({ model: null, effort: null })
  const free = freeStart(overrides, PROFILE.modelIds, null)
  expect(claudeCommand('/p', false, free.model, null, free.effort)).toEqual(['claude', '--plugin-dir', '/p', '--model', 'claude-fable-5-1', '--effort', 'xhigh'])
  expect(claudeCommand('/p', false, null, '{}', null)).toEqual(['claude', '--plugin-dir', '/p', '--settings', '{}'])
})

test('cycles: models default → the built-in list as full ids → default; efforts default → low … max → default', async () => {
  const order: (string | null)[] = [null]
  for (let at = 0; at < 5; at++) order.push(nextModel(order.at(-1)!, PROFILE.modelIds))
  expect(order).toEqual([null, 'claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', null])
  // An old short key moves on from the id it resolves to.
  expect(nextModel('opus', PROFILE.modelIds)).toBe('claude-sonnet-5-5')
  expect(nextModel('haiku', PROFILE.modelIds)).toBeNull()
  const efforts: (string | null)[] = [null]
  for (let at = 0; at < 6; at++) efforts.push(nextEffort(efforts.at(-1)!))
  expect(efforts).toEqual([null, 'low', 'medium', 'high', 'xhigh', 'max', null])
  expect([...EFFORTS]).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
})

test('cycleOverride: moves from the effective value; landing on the table value drops the override', async () => {
  // review: fable · high on the table.
  const target = { kind: 'skill' as const, name: 'review' }
  let overrides = cycleOverride(PROFILE, NO_OVERRIDES, target, 'model')
  expect(overrides.skills.review).toEqual({ model: 'claude-opus-5-5' })
  expect(routeValue(PROFILE, overrides, target)).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
  for (let at = 0; at < 4; at++) overrides = cycleOverride(PROFILE, overrides, target, 'model')
  expect(overrides.skills.review).toBeUndefined()
  overrides = cycleOverride(PROFILE, overrides, target, 'effort')
  expect(overrides.skills.review).toEqual({ effort: 'xhigh' })
  // runner: haiku · no effort; free: no table value.
  expect(cycleOverride(PROFILE, NO_OVERRIDES, { kind: 'role', name: 'runner' }, 'model').roles.runner).toEqual({ model: null })
  expect(cycleOverride(PROFILE, NO_OVERRIDES, { kind: 'free' }, 'effort').free).toEqual({ effort: 'low' })
  expect(tableValue(PROFILE, { kind: 'free' })).toEqual({ model: null, effort: null })
})

test('setOverride and resetOverride: one field or the whole row; an emptied row leaves the file', async () => {
  const target = { kind: 'role' as const, name: 'executor' as const }
  let overrides = setOverride(NO_OVERRIDES, target, 'model', 'fable')
  overrides = setOverride(overrides, target, 'effort', null)
  expect(overrides.roles.executor).toEqual({ model: 'fable', effort: null })
  expect(resetOverride(overrides, target, 'effort').roles.executor).toEqual({ model: 'fable' })
  expect(resetOverride(overrides, target)).toEqual(NO_OVERRIDES)
  expect(resetOverride(resetOverride(overrides, target, 'effort'), target, 'model')).toEqual(NO_OVERRIDES)
  const free = setOverride(NO_OVERRIDES, { kind: 'free' }, 'model', 'sonnet')
  expect(free.free).toEqual({ model: 'sonnet' })
  expect(resetOverride(free, { kind: 'free' })).toEqual(NO_OVERRIDES)
  expect(NO_OVERRIDES).toEqual({ skills: {}, roles: {}, free: {} })
})

test('routedStart: a skill start takes the routing as it is now; another prompt keeps its own', async () => {
  const routed = applyOverrides(PROFILE, { skills: { 'start-ticket': { model: 'opus', effort: 'low' } }, roles: {}, free: {} })
  expect(routedStart({ prompt: '/start-ticket TKT-1', model: 'claude-fable-5-1', effort: 'xhigh' }, routed.skills, routed.modelIds))
    .toEqual({ prompt: '/start-ticket TKT-1', model: 'opus', effort: 'low' })
  expect(routedStart({ prompt: '/shape', model: 'claude-fable-5-1', effort: 'xhigh' }, routed.skills, routed.modelIds))
    .toEqual({ prompt: '/shape', model: 'claude-fable-5-1', effort: 'xhigh' })
  expect(routedStart({ prompt: '/unknown', model: 'x', effort: null }, routed.skills, routed.modelIds)).toEqual({ prompt: '/unknown', model: 'x', effort: null })
})

test('routingRows: the new session, the ticket skills then the hub skills, the roles', async () => {
  const rows = routingRows(PROFILE)
  expect(rows[0]).toEqual({ group: 'SESSIONS', key: 'free', label: 'new session', target: { kind: 'free' } })
  const skills = rows.filter(row => row.group === 'SKILLS')
  expect(skills.length).toBe(PROFILE.skills.length)
  expect(skills.findIndex(row => row.key === 'skill:shape')).toBeGreaterThan(skills.findIndex(row => row.key === 'skill:new-widget'))
  expect(rows.filter(row => row.group === 'SUBAGENTS').map(row => row.label)).toEqual(['executor', 'scout', 'verifier', 'runner'])
  expect(rows.length).toBe(1 + PROFILE.skills.length + PROFILE.roles.length)
})

test('validateConfig: an effort outside low, medium, high, xhigh, max is refused with a clear message', async () => {
  const raw = clone(LINEAR_CONFIG)
  raw.routing.skills[0].effort = 'extreme'
  raw.routing.roles[0].effort = 'turbo'
  const result = validateConfig(raw)
  expect(result.ok).toBe(false)
  const errors = result.ok ? [] : result.errors
  expect(errors).toContain("routing.roles[0].effort: effort 'turbo' is not one of low, medium, high, xhigh, max (or null)")
  expect(errors).toContain("routing.skills[0].effort: effort 'extreme' is not one of low, medium, high, xhigh, max (or null)")
  const max = clone(LINEAR_CONFIG)
  max.routing.skills[0].effort = 'max'
  max.routing.roles[0].effort = null
  expect(validateConfig(max).ok).toBe(true)
})

test('the deck pips know every effort the view offers', async () => {
  for (const effort of EFFORTS) expect(effortPips(effort)).not.toBeNull()
  expect(effortPips('max')).toBe(4)
})

// ── Decision 057: the routing on the model catalogue (Claude Code's `/model` list)

const CATALOGUE = parseCatalogue(parseInitialize(STDOUT)!.models)!

test('an old override file with short keys still reads, launches as full ids and shows the catalogue names', async () => {
  const overrides = parseOverrides({ skills: { review: { model: 'opus' } }, roles: {}, free: { model: 'sonnet', effort: 'high' } }, PROFILE)
  expect(overrides.skills.review).toEqual({ model: 'opus' })
  expect(freeStart(overrides, PROFILE.modelIds, null, CATALOGUE)).toEqual({ model: 'claude-sonnet-5-5', effort: 'high' })
  const cells = routeCells(PROFILE, overrides, { kind: 'skill', name: 'review' }, CATALOGUE)
  expect(cells.model).toEqual({ text: 'Opus 5.5', overridden: true, base: 'Fable 5.1', unavailable: false })
  // The table's alias (`opus`) and its full id are the same model: no ●.
  const same = routeCells(PROFILE, { ...NO_OVERRIDES, roles: { executor: { model: 'claude-opus-5-5' } } }, { kind: 'role', name: 'executor' }, CATALOGUE)
  expect(same.model).toEqual({ text: 'Opus 5.5', overridden: false, base: 'Opus 5.5', unavailable: false })
})

test('a model the catalogue no longer has is kept in the file, marked, and the launch takes the table\'s', async () => {
  const raw = { skills: { review: { model: 'claude-opus-4-1', effort: 'max' } }, roles: { executor: { model: 'claude-opus-4-1' } }, free: { model: 'claude-opus-4-1' } }
  const overrides = parseOverrides(raw, PROFILE)
  expect(overrides).toEqual(raw)
  expect(droppedOverrides(raw, PROFILE)).toEqual([])
  const target = { kind: 'skill' as const, name: 'review' }
  expect(routeValue(PROFILE, overrides, target).model).toBe('claude-opus-4-1')
  expect(launchedModel(PROFILE, overrides, target, CATALOGUE)).toBe('fable')
  const routed = applyOverrides(PROFILE, overrides, CATALOGUE)
  expect(skill(routed, 'review')).toEqual({ ...skill(PROFILE, 'review'), effort: 'max' })
  expect(role(routed, 'executor')).toBe(role(PROFILE, 'executor'))
  expect(freeStart(overrides, PROFILE.modelIds, null, CATALOGUE)).toEqual({ model: null, effort: null })
  expect(routeCells(PROFILE, overrides, target, CATALOGUE).model).toEqual({ text: 'Opus 4.1', overridden: true, base: 'Fable 5.1', unavailable: true })
  // Once Claude Code offers it again, it is launched.
  const back = parseCatalogue([...parseInitialize(STDOUT)!.models, { value: 'claude-opus-4-1', resolvedModel: 'claude-opus-4-1', displayName: 'Opus 4.1' }])!
  expect(skill(applyOverrides(PROFILE, overrides, back), 'review').model).toBe('claude-opus-4-1')
})

test('j: default → every model of the catalogue in Claude Code order → default; landing on the table drops the override', async () => {
  const target = { kind: 'free' as const }
  const seen: (string | null)[] = []
  let overrides: RoutingOverrides = NO_OVERRIDES
  for (let at = 0; at < 13; at++) {
    overrides = cycleOverride(PROFILE, overrides, target, 'model', CATALOGUE)
    seen.push(routeValue(PROFILE, overrides, target).model)
  }
  expect(seen).toEqual([...CATALOGUE.models.map(model => model.id), null])
  expect(overrides).toEqual(NO_OVERRIDES)
  // executor is `opus` on the table: default comes first, then Opus 5.5 is the table's (dropped), then Fable 5.1.
  const executor = { kind: 'role' as const, name: 'executor' as const }
  let roles = cycleOverride(PROFILE, NO_OVERRIDES, executor, 'model', CATALOGUE)
  expect(roles.roles.executor).toEqual({ model: 'claude-fable-5-1' })
  for (let at = 0; at < 11; at++) roles = cycleOverride(PROFILE, roles, executor, 'model', CATALOGUE)
  expect(roles.roles.executor).toEqual({ model: null })
  roles = cycleOverride(PROFILE, roles, executor, 'model', CATALOGUE)
  expect(roles.roles.executor).toBeUndefined()
})

test('e: the efforts of the row\'s model; none on Haiku 4.5 (—, e does nothing); a clamped effort reads xhigh→high', async () => {
  const target = { kind: 'skill' as const, name: 'start-ticket' }
  // start-ticket: fable · xhigh on the table; Opus 4.6 takes no xhigh.
  const opus46 = setOverride(NO_OVERRIDES, target, 'model', 'claude-opus-4-6')
  expect(routeEfforts(PROFILE, opus46, target, CATALOGUE)).toEqual(['low', 'medium', 'high', 'max'])
  expect(routeCells(PROFILE, opus46, target, CATALOGUE).effort).toEqual({ text: 'xhigh→high', overridden: false, base: 'xhigh', unavailable: false })
  const efforts: (string | null)[] = []
  let overrides = opus46
  for (let at = 0; at < 5; at++) {
    overrides = cycleOverride(PROFILE, overrides, target, 'effort', CATALOGUE)
    efforts.push(routeValue(PROFILE, overrides, target).effort)
  }
  expect(efforts).toEqual([null, 'low', 'medium', 'high', 'max'])
  const haiku45 = setOverride(setOverride(NO_OVERRIDES, target, 'model', 'claude-haiku-4-5-20251001'), target, 'effort', 'max')
  expect(routeEfforts(PROFILE, haiku45, target, CATALOGUE)).toEqual([])
  expect(cycleOverride(PROFILE, haiku45, target, 'effort', CATALOGUE)).toBe(haiku45)
  expect(routeCells(PROFILE, haiku45, target, CATALOGUE).effort).toEqual({ text: '—', overridden: false, base: '—', unavailable: false })
  // The file keeps what the person chose.
  expect(haiku45.skills['start-ticket']).toEqual({ model: 'claude-haiku-4-5-20251001', effort: 'max' })
})

test('the view\'s names: default · Fable 5.1 for the session\'s own, default beside a ●, table aliases through the catalogue', async () => {
  expect(routeCells(PROFILE, NO_OVERRIDES, { kind: 'free' }, CATALOGUE).model).toEqual({ text: 'default · Fable 5.1', overridden: false, base: 'default', unavailable: false })
  expect(routeCells(PROFILE, NO_OVERRIDES, { kind: 'role', name: 'runner' }, CATALOGUE).model.text).toBe('Haiku 5.5')
  const runner = setOverride(NO_OVERRIDES, { kind: 'role', name: 'runner' }, 'model', null)
  expect(routeCells(PROFILE, runner, { kind: 'role', name: 'runner' }, CATALOGUE).model).toEqual({ text: 'default', overridden: true, base: 'Haiku 5.5', unavailable: false })
  const sonnet46 = setOverride(NO_OVERRIDES, { kind: 'free' }, 'model', 'claude-sonnet-4-6')
  expect(routeCells(PROFILE, sonnet46, { kind: 'free' }, CATALOGUE).model).toEqual({ text: 'Sonnet 4.6', overridden: true, base: 'default', unavailable: false })
})
