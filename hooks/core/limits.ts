// Limits pace, the run-out forecast and the prompt cache's warmth (decision 034): pure readings of the deck's figures.

import type { TowerLimits, TowerLimitWindow } from '../../types/index'
import { windowNow } from './deck'
import { isFable, blockActive, type ModelBlock } from './fallback'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** How long each rate-limit window lasts: its start is its reset time less this. */
export const WINDOW_MS = { '5h': 5 * HOUR, '7d': 7 * DAY } as const

/** Under this much of a window gone, the rate is too young to forecast from. */
const MIN_ELAPSED_MS = MINUTE

/** How near a run-out before the reset raises Fable's block early. */
export const FORECAST_HORIZON_MS = 20 * MINUTE

/**
 * Where a window stands against its clock: `elapsedPercent` of its time gone, `pace` the used % less that (above 0:
 * ahead of pace), `outInMs` when it reaches 100 % at the rate so far (null when the rate is ~0 or too young to tell),
 * `outBeforeReset` when that comes before the reset.
 */
export type Pace = { used: number; elapsedPercent: number; pace: number; outInMs: number | null; outBeforeReset: boolean }

/** A window's pace now; null when the window is unknown or its reset time is. */
export function windowPace(window: TowerLimitWindow | null | undefined, lengthMs: number, now: number): Pace | null {
  const current = windowNow(window ?? null, now)
  if (current === null || current.resetsAt === null) return null
  const elapsedMs = Math.min(lengthMs, Math.max(0, now - (current.resetsAt - lengthMs)))
  const used = current.percent
  const elapsedPercent = (elapsedMs / lengthMs) * 100
  const outInMs = used >= 100 ? 0 : used <= 0 || elapsedMs < MIN_ELAPSED_MS ? null : ((100 - used) * elapsedMs) / used
  const outBeforeReset = outInMs !== null && now + outInMs < current.resetsAt
  return { used, elapsedPercent, pace: used - elapsedPercent, outInMs, outBeforeReset }
}

/** `~1h 50m`, `~12m`, `~2d 4h`; `~0m` when already out. */
export function formatLeft(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / MINUTE))
  const hours = Math.floor(minutes / 60)
  if (hours >= 24) return `~${Math.floor(hours / 24)}d ${hours % 24}h`
  return hours === 0 ? `~${minutes}m` : `~${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** What follows a window's gauge: `31% of time · out in ~1h 50m` (the forecast only when there is one). */
export function paceText(pace: Pace): string {
  const out = pace.outInMs === null ? '' : ` · out in ${formatLeft(pace.outInMs)}`
  return `${Math.round(pace.elapsedPercent)}% of time${out}`
}

/** The board header's chip: `5h 42%↗` ahead of pace, `5h 42%` otherwise. */
export function paceChip(label: string, pace: Pace): string {
  return `${label} ${Math.round(pace.used)}%${pace.pace > 0 ? '↗' : ''}`
}

/**
 * The reset of a window forecast to run out before it, within `horizon`: the later of the five-hour's and the
 * seven-day's when both are; null when neither is.
 */
export function forecastOutUntil(limits: TowerLimits | undefined, now: number, horizon = FORECAST_HORIZON_MS): number | null {
  const resets: number[] = []
  for (const [window, length] of [[limits?.fiveHour, WINDOW_MS['5h']], [limits?.sevenDay, WINDOW_MS['7d']]] as const) {
    const pace = windowPace(window, length, now)
    const current = windowNow(window ?? null, now)
    if (pace === null || current?.resetsAt == null) continue
    if (pace.outBeforeReset && pace.outInMs !== null && pace.outInMs <= horizon) resets.push(current.resetsAt)
  }
  return resets.length === 0 ? null : Math.max(...resets)
}

/** What decides the early block: the person's choices, the main loop's model, the block as it stands, the windows. */
export type EarlyBlockInput = {
  fable: 'auto' | 'off'
  early: 'on' | 'off'
  noFableEnv: boolean
  mainModel: string | null
  block: ModelBlock | null
  limits: TowerLimits | undefined
  now: number
}

/**
 * The Fable block to raise ahead of the limit (reason `forecast`, until the window's reset): only with `fable` on
 * `auto` and `fable switch early` on, the main loop on Fable, no block already active, and a window out within the
 * horizon before its reset. Null otherwise.
 */
export function earlyBlock(input: EarlyBlockInput): ModelBlock | null {
  if (input.fable !== 'auto' || input.early !== 'on' || input.noFableEnv) return null
  if (!isFable(input.mainModel) || blockActive(input.block, input.now)) return null
  const until = forecastOutUntil(input.limits, input.now)
  return until === null ? null : { family: 'fable', until, since: input.now, reason: 'forecast' }
}

// ── The prompt cache ──────────────────────────────────────────────────────────

/**
 * The prompt cache's lifetime after the last request: the API's default 5 minutes. The engine reports no 1-hour cache
 * writes to a mod's main loop (`turn.step`'s usage has no `ephemeral_1h` split), so the 1-hour lifetime is never assumed.
 */
export const CACHE_TTL_MS = 5 * MINUTE

/** The main loop's last request: when it ended, the tokens it read or wrote to the cache, and every count so far. */
export type CacheSeen = { lastRequestAt: number; cachedTokens: number; sessionTokens: number }

/** Warm with `leftMs` to go, or cold; `rebuildUsd` from the session's own cost per token, null when it cannot be told. */
export type CacheWarmth = { cold: boolean; leftMs: number; rebuildUsd: number | null }

export function cacheWarmth(seen: CacheSeen | null | undefined, cost: number | null, now: number, ttl = CACHE_TTL_MS): CacheWarmth | null {
  if (seen == null) return null
  const leftMs = seen.lastRequestAt + ttl - now
  const priced = cost !== null && cost > 0 && seen.sessionTokens > 0 && seen.cachedTokens > 0
  return { cold: leftMs <= 0, leftMs: Math.max(0, leftMs), rebuildUsd: priced ? (cost * seen.cachedTokens) / seen.sessionTokens : null }
}

/** `cache warm · 3m left`, `cache cold · ≈ $0.10 to rebuild`, `cache cold`. */
export function cacheText(warmth: CacheWarmth): string {
  if (!warmth.cold) return `cache warm · ${Math.max(1, Math.ceil(warmth.leftMs / MINUTE))}m left`
  return warmth.rebuildUsd === null ? 'cache cold' : `cache cold · ≈ $${warmth.rebuildUsd.toFixed(2)} to rebuild`
}

/** Whether a session's cache has gone cold, from its status file's last request time. */
export function cacheCold(lastRequestAt: number | null | undefined, now: number, ttl = CACHE_TTL_MS): boolean {
  return typeof lastRequestAt === 'number' && now - lastRequestAt > ttl
}
