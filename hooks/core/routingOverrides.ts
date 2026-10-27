// The person's routing overrides (decision 056): the model and effort they chose, from the deck's routing view, for a
// skill, a delegation role or a new free session, over the table of the configuration's profile. One file per project,
// `<state dir>/routing/<project id>.json`; a key absent takes the table's value, an explicit null the session's own
// (no `--model` / `--effort`). Models are full ids from the catalogue (decision 057); the short keys of `modelIds`
// written before it still read. Pure: register.tsx reads and writes the file.

import { projectId } from './config'
import type { SkillStart } from './launcher'
import { defaultLabel, effortFor, effortsOf, FALLBACK_CATALOGUE, modelAvailable, modelIdOf, modelLabelOf, sameModel, type Catalogue } from './models'
import { EFFORTS, type Profile, type RoleName } from './profile'

/**
 * A row's choice: `model` a full id of the catalogue (`claude-opus-5-5`, decision 057) or a key of the profile's
 * `modelIds` (files written before it), `effort` one of EFFORTS; null the session's own.
 */
export type RouteChoice = { model?: string | null; effort?: string | null }

export type RoutingOverrides = {
  skills: Readonly<Record<string, RouteChoice>>
  roles: Readonly<Partial<Record<RoleName, RouteChoice>>>
  /** A new free session (decision 055), which the table does not route: its table value is the session's own. */
  free: RouteChoice
}

/** What a row of the routing view stands for. */
export type RouteTarget = { kind: 'skill'; name: string } | { kind: 'role'; name: RoleName } | { kind: 'free' }

export type RouteField = 'model' | 'effort'

export const NO_OVERRIDES: RoutingOverrides = { skills: {}, roles: {}, free: {} }

/** `<state dir>/routing/<project id>.json`. */
export function overridesPath(state: string, mainCheckout: string): string {
  return `${state.replace(/\/+$/, '')}/routing/${projectId(mainCheckout)}.json`
}

/** Every free Tower's overrides (decision 060): one file, `<state dir>/routing/free.json`, whatever the folder. */
export function freeOverridesPath(state: string): string {
  return `${state.replace(/\/+$/, '')}/routing/free.json`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The override file read whole, with every entry it drops (unknown skill or role, effort, field; a model that is not a
 * string). A model the catalogue no longer has is kept: the view marks it and a launch takes the table's (decision 057).
 */
function readOverrides(raw: unknown, profile: Profile): { overrides: RoutingOverrides; dropped: string[] } {
  const dropped: string[] = []
  const choice = (value: unknown, path: string): RouteChoice | null => {
    if (!isRecord(value)) {
      dropped.push(path)
      return null
    }
    const out: RouteChoice = {}
    for (const [field, one] of Object.entries(value)) {
      if (field === 'model' && (one === null || (typeof one === 'string' && one !== ''))) out.model = one
      else if (field === 'effort' && (one === null || (typeof one === 'string' && (EFFORTS as readonly string[]).includes(one)))) out.effort = one
      else dropped.push(`${path}.${field}`)
    }
    return Object.keys(out).length > 0 ? out : null
  }
  const group = (value: unknown, path: string, known: ReadonlySet<string>): Record<string, RouteChoice> => {
    const out: Record<string, RouteChoice> = {}
    if (value === undefined) return out
    if (!isRecord(value)) {
      dropped.push(path)
      return out
    }
    for (const [name, one] of Object.entries(value)) {
      if (!known.has(name)) {
        dropped.push(`${path}.${name}`)
        continue
      }
      const read = choice(one, `${path}.${name}`)
      if (read !== null) out[name] = read
    }
    return out
  }
  if (!isRecord(raw)) return { overrides: NO_OVERRIDES, dropped: raw === undefined || raw === null ? [] : ['overrides'] }
  for (const key of Object.keys(raw)) if (key !== 'skills' && key !== 'roles' && key !== 'free') dropped.push(key)
  const skills = group(raw.skills, 'skills', new Set(profile.skills.map(skill => skill.name)))
  const roles = group(raw.roles, 'roles', new Set(profile.roles.map(role => role.name)))
  const free = raw.free === undefined ? null : choice(raw.free, 'free')
  return { overrides: { skills, roles, free: free ?? {} }, dropped }
}

/** The override file's JSON as overrides for `profile` (the table); anything it does not know is dropped silently. */
export function parseOverrides(raw: unknown, profile: Profile): RoutingOverrides {
  return readOverrides(raw, profile).overrides
}

/** What parseOverrides drops, by path (`skills.nope`, `roles.executor.effort`): for the tests. */
export function droppedOverrides(raw: unknown, profile: Profile): string[] {
  return readOverrides(raw, profile).dropped
}

/** Whether a chosen model can be launched (null, the session's own, always can). */
function launchable(model: string | null, modelIds: Readonly<Record<string, string>>, catalogue: Catalogue): boolean {
  return model === null || modelAvailable(model, modelIds, catalogue)
}

function applied<T extends { model: string | null; effort: string | null }>(row: T, choice: RouteChoice | undefined, modelIds: Readonly<Record<string, string>>, catalogue: Catalogue): T {
  if (choice === undefined || (choice.model === undefined && choice.effort === undefined)) return row
  const model = choice.model !== undefined && launchable(choice.model, modelIds, catalogue) ? choice.model : undefined
  if (model === undefined && choice.effort === undefined) return row
  return {
    ...row,
    ...(model !== undefined ? { model } : {}),
    ...(choice.effort !== undefined ? { effort: choice.effort } : {}),
  }
}

/** The profile with the overrides over its skills and roles (a model the catalogue lacks keeps the table's); neither is changed. */
export function applyOverrides(profile: Profile, overrides: RoutingOverrides, catalogue: Catalogue = FALLBACK_CATALOGUE): Profile {
  return {
    ...profile,
    skills: profile.skills.map(skill => applied(skill, overrides.skills[skill.name], profile.modelIds, catalogue)),
    roles: profile.roles.map(role => applied(role, overrides.roles[role.name], profile.modelIds, catalogue)),
  }
}

function choiceOf(overrides: RoutingOverrides, target: RouteTarget): RouteChoice | undefined {
  if (target.kind === 'free') return overrides.free
  return target.kind === 'skill' ? overrides.skills[target.name] : overrides.roles[target.name]
}

function withChoice(overrides: RoutingOverrides, target: RouteTarget, choice: RouteChoice): RoutingOverrides {
  const empty = choice.model === undefined && choice.effort === undefined
  if (target.kind === 'free') return { ...overrides, free: empty ? {} : choice }
  const key = target.kind === 'skill' ? 'skills' : 'roles'
  const rest: Record<string, RouteChoice> = { ...overrides[key] }
  delete rest[target.name]
  return { ...overrides, [key]: empty ? rest : { ...rest, [target.name]: choice } }
}

/** The overrides with `field` of `target` set to `value` (null: the session's own). */
export function setOverride(overrides: RoutingOverrides, target: RouteTarget, field: RouteField, value: string | null): RoutingOverrides {
  return withChoice(overrides, target, { ...choiceOf(overrides, target), [field]: value })
}

/** The overrides without `target`'s `field`, or without the whole row when no field is named: back to the table. */
export function resetOverride(overrides: RoutingOverrides, target: RouteTarget, field?: RouteField): RoutingOverrides {
  if (field === undefined) return withChoice(overrides, target, {})
  const rest: RouteChoice = { ...choiceOf(overrides, target) }
  delete rest[field]
  return withChoice(overrides, target, rest)
}

/**
 * The model after `current`: default (null) → each model of the catalogue, in Claude Code's order, as its full id →
 * default. `current` is found by the id it resolves to (`opus` is `claude-opus-5-5`); one the catalogue lacks goes to default.
 */
export function nextModel(current: string | null, modelIds: Readonly<Record<string, string>>, catalogue: Catalogue = FALLBACK_CATALOGUE): string | null {
  const cycle: (string | null)[] = [null, ...catalogue.models.map(model => model.id)]
  const at = current === null ? 0 : cycle.indexOf(modelIdOf(current, modelIds, catalogue))
  return cycle[(at + 1) % cycle.length] ?? null
}

/** The effort after `current`: default (null) → each of `efforts` (all of EFFORTS unless the model takes fewer) → default. */
export function nextEffort(current: string | null, efforts: readonly string[] = EFFORTS): string | null {
  const cycle: (string | null)[] = [null, ...efforts]
  return cycle[(cycle.indexOf(current) + 1) % cycle.length] ?? null
}

/** A row's table value (from the profile before overrides); a free session's is the session's own. */
export function tableValue(table: Profile, target: RouteTarget): { model: string | null; effort: string | null } {
  if (target.kind === 'free') return { model: null, effort: null }
  const row = target.kind === 'skill' ? table.skills.find(skill => skill.name === target.name) : table.roles.find(role => role.name === target.name)
  return row !== undefined ? { model: row.model, effort: row.effort } : { model: null, effort: null }
}

/** A row's value with the overrides over the table. */
export function routeValue(table: Profile, overrides: RoutingOverrides, target: RouteTarget): { model: string | null; effort: string | null } {
  const base = tableValue(table, target)
  const choice = choiceOf(overrides, target) ?? {}
  return { model: choice.model !== undefined ? choice.model : base.model, effort: choice.effort !== undefined ? choice.effort : base.effort }
}

/** The model a row launches on: its value, or the table's when the chosen model is not in the catalogue (decision 057). */
export function launchedModel(table: Profile, overrides: RoutingOverrides, target: RouteTarget, catalogue: Catalogue = FALLBACK_CATALOGUE): string | null {
  const model = routeValue(table, overrides, target).model
  return launchable(model, table.modelIds, catalogue) ? model : tableValue(table, target).model
}

/** The efforts a row's model takes (empty: none, `e` does nothing); all of EFFORTS when the catalogue does not know it. */
export function routeEfforts(table: Profile, overrides: RoutingOverrides, target: RouteTarget, catalogue: Catalogue = FALLBACK_CATALOGUE): readonly string[] {
  const model = launchedModel(table, overrides, target, catalogue)
  return effortsOf(model === null ? null : modelIdOf(model, table.modelIds, catalogue), catalogue) ?? EFFORTS
}

/**
 * The view's key on a row: `field` moves to the next value; landing on the table's value (a model compared by the id it
 * resolves to) drops the override, so the file keeps only what differs. A model is stored as its full id; `e` on a
 * model that takes no effort changes nothing.
 */
export function cycleOverride(table: Profile, overrides: RoutingOverrides, target: RouteTarget, field: RouteField, catalogue: Catalogue = FALLBACK_CATALOGUE): RoutingOverrides {
  const current = routeValue(table, overrides, target)[field]
  const base = tableValue(table, target)[field]
  if (field === 'model') {
    const next = nextModel(current, table.modelIds, catalogue)
    return sameModel(next, base, table.modelIds, catalogue) ? resetOverride(overrides, target, field) : setOverride(overrides, target, field, next)
  }
  const efforts = routeEfforts(table, overrides, target, catalogue)
  if (efforts.length === 0) return overrides
  const next = nextEffort(current, efforts)
  return next === base ? resetOverride(overrides, target, field) : setOverride(overrides, target, field, next)
}

/**
 * A new free session's `--model` (a full id) and `--effort` (as chosen; the launch clamps it): TOWER_SESSION_MODEL
 * (`sessionModel`) wins over the override's model; a chosen model the catalogue lacks is the session's own.
 */
export function freeStart(overrides: RoutingOverrides, modelIds: Readonly<Record<string, string>>, sessionModel: string | null, catalogue: Catalogue = FALLBACK_CATALOGUE): { model: string | null; effort: string | null } {
  const chosen = overrides.free.model ?? null
  const model = chosen !== null && launchable(chosen, modelIds, catalogue) ? modelIdOf(chosen, modelIds, catalogue) : null
  return { model: sessionModel ?? model, effort: overrides.free.effort ?? null }
}

/**
 * A skill session's start on the routing as it is now: a prompt that runs a skill of `skills` (`/start-ticket TKT-1`)
 * takes that skill's model and effort; any other prompt keeps its own.
 */
export function routedStart<T extends SkillStart>(start: T, skills: Profile['skills'], modelIds: Readonly<Record<string, string>>): T {
  const name = /^\/(\S+)/.exec(start.prompt)?.[1]
  const skill = name !== undefined ? skills.find(candidate => candidate.name === name) : undefined
  if (skill === undefined) return start
  return { ...start, model: skill.model === null ? null : (modelIds[skill.model] ?? skill.model), effort: skill.effort }
}

/** A row of the routing view: its group, its element key (`free`, `skill:<name>`, `role:<name>`), its label and target. */
export type RouteRow = { group: 'SESSIONS' | 'SKILLS' | 'SUBAGENTS'; key: string; label: string; target: RouteTarget }

/** The routing view's rows: a new session, the ticket skills then the hub skills (each in the table's order), the roles. */
export function routingRows(table: Profile): RouteRow[] {
  const skills = [...table.skills.filter(skill => skill.where === 'ticket'), ...table.skills.filter(skill => skill.where === 'hub')]
  return [
    { group: 'SESSIONS', key: 'free', label: 'new session', target: { kind: 'free' } },
    ...skills.map(skill => ({ group: 'SKILLS' as const, key: `skill:${skill.name}`, label: `/${skill.name}`, target: { kind: 'skill' as const, name: skill.name } })),
    ...table.roles.map(role => ({ group: 'SUBAGENTS' as const, key: `role:${role.name}`, label: role.name, target: { kind: 'role' as const, name: role.name } })),
  ]
}

/** One cell of a routing row as the view writes it: the value, whether it is off the table (`●`), the table's, a `⚠`. */
export type RouteCell = { text: string; overridden: boolean; base: string; unavailable: boolean }

/**
 * A row's model and effort cells (decision 057): models by their names (`Opus 5.5`; the table's `opus` through the
 * catalogue), `default · Fable 5.1` for the session's own (`default` beside a `●`); a model the catalogue lacks is
 * marked; an effort the launch clamps reads `xhigh→high`, and `—` when the model takes none.
 */
export function routeCells(table: Profile, overrides: RoutingOverrides, target: RouteTarget, catalogue: Catalogue = FALLBACK_CATALOGUE): { model: RouteCell; effort: RouteCell } {
  const value = routeValue(table, overrides, target)
  const base = tableValue(table, target)
  const label = (model: string | null) => (model === null ? 'default' : modelLabelOf(model, table.modelIds, catalogue))
  const modelOff = !sameModel(value.model, base.model, table.modelIds, catalogue)
  const model: RouteCell = {
    text: value.model === null && !modelOff ? defaultLabel(catalogue) : label(value.model),
    overridden: modelOff,
    base: label(base.model),
    unavailable: !launchable(value.model, table.modelIds, catalogue),
  }
  const launched = launchedModel(table, overrides, target, catalogue)
  const launchedId = launched === null ? null : modelIdOf(launched, table.modelIds, catalogue)
  const efforts = effortsOf(launchedId, catalogue)
  if (efforts !== null && efforts.length === 0) return { model, effort: { text: '—', overridden: false, base: '—', unavailable: false } }
  const clamped = effortFor(launchedId, value.effort, catalogue)
  return {
    model,
    effort: {
      text: value.effort === null ? 'default' : clamped !== value.effort ? `${value.effort}→${clamped}` : value.effort,
      overridden: value.effort !== base.effort,
      base: base.effort ?? 'default',
      unavailable: false,
    },
  }
}
