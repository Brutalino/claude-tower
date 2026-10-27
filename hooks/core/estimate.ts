// How long an agent of a given type usually runs, learnt from the agents that ended before.

/** Durations in ms per agent type, most recent last. Kept in $.store so it outlives the session. */
export type DurationHistory = Record<string, number[]>

const KEPT = 20
const MIN_SAMPLES = 3

export function recordDuration(history: DurationHistory, agentType: string, ms: number): DurationHistory {
  return { ...history, [agentType]: [...(history[agentType] ?? []), ms].slice(-KEPT) }
}

/** The median of the type's durations, or null with fewer than 3 of them. */
export function estimateTotal(history: DurationHistory, agentType: string): number | null {
  const samples = [...(history[agentType] ?? [])].sort((a, b) => a - b)
  if (samples.length < MIN_SAMPLES) return null
  const middle = Math.floor(samples.length / 2)
  return samples.length % 2 === 1 ? samples[middle]! : (samples[middle - 1]! + samples[middle]!) / 2
}

/** The time left as `≈ 40s`, `≈ 2m`, `≈ 1h`; `≈ soon` once the estimate is reached. */
export function formatLeft(ms: number): string {
  if (ms <= 0) return '≈ soon'
  const seconds = Math.ceil(ms / 1000)
  if (seconds < 60) return `≈ ${seconds}s`
  if (seconds < 3600) return `≈ ${Math.round(seconds / 60)}m`
  return `≈ ${Math.round(seconds / 3600)}h`
}

/** What the store holds, as a history; anything malformed is dropped. */
export function parseHistory(value: unknown): DurationHistory {
  if (value === null || typeof value !== 'object') return {}
  const history: DurationHistory = {}
  for (const [type, samples] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(samples)) history[type] = samples.filter((n): n is number => typeof n === 'number' && n >= 0).slice(-KEPT)
  }
  return history
}
