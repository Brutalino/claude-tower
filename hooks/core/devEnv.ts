import type { TowerDevEnv } from '../../types/index'
import type { EnvConfig } from './config'

// The ticket's local stack as the env skill (config env, kind `skill`; e.g. `dev-env`) leaves it in the state file (`env`),
// and as docker sees it: a compose stack whose working dir is the worktree (decision 073).

export type DevEnv = TowerDevEnv

export type DevEnvState = 'up' | 'starting' | 'stopped' | 'none'

/** How long a start pressed in the deck may show `starting`. */
export const START_WAIT_MS = 5 * 60_000

/** The env skill's name (e.g. `dev-env`); null when the configuration's env is not a skill (`none`, or a simulator: not supported yet). */
export function envSkill(env: EnvConfig): string | null {
  return env.kind === 'skill' ? env.name : null
}

/** The env skill's frontend ports in slots (e.g. 7 from 5173); null without them. */
export function envPorts(env: EnvConfig): { first: number; slots: number } | null {
  return env.kind === 'skill' ? env.ports : null
}

/** The rows the deck's dev-env box takes: none when the module is off or the configuration has no env skill (`env: none` hides it). */
export function envBoxRows(env: EnvConfig, moduleOn: boolean, hasSkill: boolean): number {
  if (!moduleOn || envSkill(env) === null) return 0
  return hasSkill ? 5 : 3
}

/** The `env` of a state file; null when absent, null or unreadable. */
export function parseEnv(text: string | undefined): DevEnv | null {
  let env: Record<string, unknown>
  try {
    const parsed = JSON.parse(text ?? '') as { env?: unknown }
    if (parsed.env === null || typeof parsed.env !== 'object') return null
    env = parsed.env as Record<string, unknown>
  } catch {
    return null
  }
  const ports = (env.ports ?? {}) as Record<string, unknown>
  const port = typeof ports.frontend === 'number' ? ports.frontend : null
  const url = typeof env.frontendUrl === 'string' ? env.frontendUrl : port !== null ? `http://localhost:${port}` : ''
  const started = typeof env.startedAt === 'string' ? Date.parse(env.startedAt) : typeof env.startedAt === 'number' ? env.startedAt : NaN
  return {
    frontendUrl: url,
    frontendPort: port,
    status: env.status === 'up' || env.status === 'failed' ? env.status : 'down',
    loginVerified: env.loginVerified === true,
    startedAt: Number.isFinite(started) ? started : null,
    project: typeof env.project === 'string' && env.project !== '' ? env.project : null,
  }
}

/** Decision 073: a compose stack running for the worktree, as `docker ps` lists its containers. */
export type ComposeStack = { project: string; services: string[]; frontendPort: number | null }

/** The `docker ps --format` of composeStack: project, working dir, service and published ports, one container a line. */
export const COMPOSE_PS_FORMAT = '{{.Label "com.docker.compose.project"}}|{{.Label "com.docker.compose.project.working_dir"}}|{{.Label "com.docker.compose.service"}}|{{.Ports}}'

/** A path without its trailing slashes (`/` stays `/`). */
export function trimSlash(path: string): string {
  return path.replace(/\/+$/, '') || '/'
}

/**
 * Decision 073: the compose stack whose working dir is `cwd`, from `docker ps --format COMPOSE_PS_FORMAT`; null when no line names it
 * (the label is compared here too, so a filter that let others through gives no false positive). The frontend port is the host
 * port of the `frontend` service (its first `host:port->`, IPv4 or IPv6), else the first published host port inside the slots
 * (e.g. 5173–5179), else null.
 */
export function parseComposePs(text: string, cwd: string, ports: { first: number; slots: number } | null): ComposeStack | null {
  const want = trimSlash(cwd)
  let project: string | null = null
  const services: string[] = []
  let frontend: number | null = null
  let inSlots: number | null = null
  for (const line of text.split('\n')) {
    const [name = '', dir, service = '', published = ''] = line.split('|').map(part => part.trim())
    if (dir === undefined || name === '' || trimSlash(dir) !== want || (project !== null && name !== project)) continue
    project = name
    if (service !== '' && !services.includes(service)) services.push(service)
    const hostPorts = [...published.matchAll(/:(\d+)->/g)].map(match => Number(match[1]))
    if (service === 'frontend' && frontend === null) frontend = hostPorts[0] ?? null
    if (inSlots === null && ports !== null) inSlots = hostPorts.find(port => port >= ports.first && port < ports.first + ports.slots) ?? null
  }
  return project === null ? null : { project, services, frontendPort: frontend ?? inSlots }
}

/** The port of a URL (`http://localhost:5174` → 5174); null without one. */
function urlPort(url: string): number | null {
  const port = Number(/:(\d+)/.exec(url)?.[1] ?? NaN)
  return Number.isInteger(port) ? port : null
}

/**
 * Decision 073: docker is the ground truth for a running stack, the state file adds the login and the start time.
 * - A stack runs: `up` whatever the file says; the file's URL when its port is the stack's, else `http://localhost:<port>`
 *   (no port: no URL, the box shows `starting`); login and start time from the file when it names the same project or port.
 *   `source` is `file` then, `docker` when no file env describes it; `fileStatus` keeps the file's own status.
 * - Docker answered with no stack: a file still saying `up` is stale (`down`); anything else as the file says.
 * - Docker unknown (no binary, a non-zero exit, a timeout): the file alone, as before.
 */
export function mergeEnv(file: DevEnv | null, stack: ComposeStack | null | 'unknown'): DevEnv | null {
  if (stack === 'unknown') return file
  if (stack === null) return file !== null && file.status === 'up' ? { ...file, status: 'down', fileStatus: 'up' } : file
  const filePort = file === null ? null : file.frontendPort ?? urlPort(file.frontendUrl)
  const samePort = file !== null && filePort !== null && filePort === stack.frontendPort
  const same = file !== null && (samePort || (file.project != null && file.project === stack.project))
  return {
    frontendUrl: samePort && file.frontendUrl !== '' ? file.frontendUrl : stack.frontendPort !== null ? `http://localhost:${stack.frontendPort}` : '',
    frontendPort: stack.frontendPort,
    status: 'up',
    loginVerified: same ? file.loginVerified : false,
    startedAt: same ? file.startedAt : null,
    project: stack.project,
    source: same ? 'file' : 'docker',
    ...(file !== null ? { fileStatus: file.status } : {}),
  }
}

/** Slot N of `ports.slots` (e.g. 7): frontend port − first + 1 (5172); null outside them (5173–5179) or without ports. */
export function envSlot(env: DevEnv, ports: { first: number; slots: number } | null): number | null {
  if (ports === null) return null
  const port = env.frontendPort ?? Number(/:(\d+)/.exec(env.frontendUrl)?.[1] ?? NaN)
  const slot = port - ports.first + 1
  return Number.isInteger(slot) && slot >= 1 && slot <= ports.slots ? slot : null
}

/** `up` only when the URL answers; a start pressed here shows `starting` for at most five minutes. */
export function envState(env: DevEnv | null, answers: boolean, startPressedAt: number | null, now: number): DevEnvState {
  if (env?.status === 'up') return answers ? 'up' : 'starting'
  if (startPressedAt !== null && now - startPressedAt < START_WAIT_MS) return 'starting'
  return env === null ? 'none' : 'stopped'
}

/** The keys the box offers in a state, as the mock-up: open, restart, stop when up; start when stopped or none. */
export function envActions(state: DevEnvState): ('o' | 'r' | 's' | 'u')[] {
  if (state === 'up') return ['o', 'r', 's']
  if (state === 'stopped' || state === 'none') return ['u']
  return []
}
