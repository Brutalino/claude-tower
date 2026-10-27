// Routing: which model does which kind of work. Pure rules applied at spawn time, and the
// deck's record of what they decided.

import type { TowerRouting } from '../../types/index'
import type { Profile } from './profile'
import { modelLabel } from './theme'

export type RoutingMode = 'enforce' | 'observe' | 'off'

export type RouteDecision =
  | { kind: 'pass' }
  | { kind: 'deny'; reason: string }
  | { kind: 'model'; model: string }
  | { kind: 'role'; type: string }

/** The fields of a spawn the rules read. */
export type SpawnFacts = { subagentType: string; fork: boolean; provider: { plugin: string } }

export const ROLE_PREFIX = 'tower:'
const ENGINE = 'engine'
export const MAX_DECISIONS = 20

export function routingMode(value: unknown): RoutingMode {
  return value === 'observe' || value === 'off' ? value : 'enforce'
}

function isOwnRole(type: string, profile: Profile): boolean {
  return profile.roles.some(role => `${ROLE_PREFIX}${role.name}` === type)
}

export function routeSpawn(input: SpawnFacts, profile: Profile): RouteDecision {
  if (input.fork) return { kind: 'deny', reason: profile.forkAdvice }
  if (isOwnRole(input.subagentType, profile)) return { kind: 'pass' }
  // Other people's agent definitions (a user's, another plugin's) are respected.
  if (input.provider.plugin !== ENGINE) return { kind: 'pass' }
  const route = Object.hasOwn(profile.builtinRoutes, input.subagentType) ? profile.builtinRoutes[input.subagentType] : undefined
  if (route === undefined) return { kind: 'pass' }
  return 'role' in route ? { kind: 'role', type: `${ROLE_PREFIX}${route.role}` } : { kind: 'model', model: route.model }
}

/**
 * Whether a decision is worth a line in the deck: every spawn's, the plain pass of one of our roles
 * included, so the routing view names the role and model each agent got (`tower:runner · haiku`).
 */
export function isRecorded(_input: SpawnFacts, _decision: RouteDecision, _profile: Profile): boolean {
  return true
}

/** One short line for the deck: `fork → denied`, `Explore → scout · sonnet`, `tower:executor · opus`. */
export function describeRoute(input: SpawnFacts, decision: RouteDecision, resolvedModel: string | null): string {
  const model = resolvedModel !== null && resolvedModel !== '' ? ` · ${modelLabel(resolvedModel)}` : ''
  switch (decision.kind) {
    case 'deny':
      return `${input.fork ? 'fork' : input.subagentType} → denied`
    case 'model':
      return `${input.subagentType} → ${modelLabel(resolvedModel || decision.model)}`
    case 'role':
      return `${input.subagentType} → ${decision.type.slice(ROLE_PREFIX.length)}${model}`
    case 'pass':
      return `${input.subagentType}${model}`
  }
}

// ── The deck's record ─────────────────────────────────────────────────────

export function initialRouting(): TowerRouting {
  return { decisions: [], rerouted: 0, denied: 0 }
}

export function routeRecorded(routing: TowerRouting, decision: { at: number; text: string; kind: RouteDecision['kind'] }): TowerRouting {
  return {
    decisions: [...routing.decisions, decision].slice(-MAX_DECISIONS),
    rerouted: routing.rerouted + (decision.kind === 'model' || decision.kind === 'role' ? 1 : 0),
    denied: routing.denied + (decision.kind === 'deny' ? 1 : 0),
  }
}

export function lastDecision(routing: TowerRouting): string | null {
  return routing.decisions.at(-1)?.text ?? null
}
