// Fable's usage limit (decision 032): a Fable request refused for its limit blocks Fable for every session
// until the limit resets, and every model choice goes through `resolveModel`, which names Opus 5.5 in its place.

/** The `$.store` key: one block for the person, read by every session with the settings. */
export const MODEL_BLOCK_KEY = 'modelBlock'

/** What Fable falls back to while blocked. */
export const FALLBACK_MODEL = 'claude-opus-5-5'

/** How long a block lasts when the refusal named no reset time; then Fable is tried again. */
export const BLOCK_RETRY_MS = 60 * 60 * 1000

/** `until`: when the limit resets (epoch ms), null when unknown; `since`: when it was seen; `reason` `forecast` when raised ahead of the limit (decision 034). */
export type ModelBlock = { family: 'fable'; until: number | null; since: number; reason?: 'forecast' }

/** What a failed request tells: the engine's error kind and text, the model it asked for, the rate-limit windows. */
export type LimitSignal = {
  error: string
  details: string | null
  model: string | null
  rateLimits?: readonly { kind: string; percentUsed: number; resetsAt?: string }[]
}

const FABLE = /fable/i
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})/

export function isFable(model: string | null | undefined): boolean {
  return typeof model === 'string' && FABLE.test(model)
}

/**
 * Whether a failed request says Fable's limit is reached: a `rate_limit` error on a Fable request (or one whose text
 * names Fable). `until`: the reset time the text gives, else a full window's, else null.
 */
export function fableBlocked(signal: LimitSignal): { until: number | null } | null {
  if (signal.error !== 'rate_limit') return null
  if (!isFable(signal.model) && !isFable(signal.details)) return null
  const stated = signal.details?.match(ISO)?.[0]
  const fromText = stated !== undefined ? Date.parse(stated) : NaN
  if (Number.isFinite(fromText)) return { until: fromText }
  const full = (signal.rateLimits ?? []).find(limit => limit.percentUsed >= 100 && limit.resetsAt !== undefined)
  const fromWindow = full?.resetsAt !== undefined ? Date.parse(full.resetsAt) : NaN
  return { until: Number.isFinite(fromWindow) ? fromWindow : null }
}

/** When a block ends: its reset time, else an hour after it was seen. */
export function blockEnds(block: ModelBlock): number {
  return block.until ?? block.since + BLOCK_RETRY_MS
}

export function blockActive(block: ModelBlock | null, now: number): boolean {
  return block !== null && now < blockEnds(block)
}

/** Whatever the store holds as the block: anything malformed is no block. */
export function parseModelBlock(value: unknown): ModelBlock | null {
  if (typeof value !== 'object' || value === null) return null
  const block = value as Partial<ModelBlock>
  if (block.family !== 'fable' || typeof block.since !== 'number') return null
  if (block.until !== null && typeof block.until !== 'number') return null
  return { family: 'fable', until: block.until, since: block.since, ...(block.reason === 'forecast' ? { reason: 'forecast' as const } : {}) }
}

/**
 * The model to use for `wanted` (an alias or a full id): Opus in place of Fable while Fable is blocked, or always
 * when the person turned Fable off (`'off'`); anything else as it is. `fallback`: the catalogue's `opus` (decision 057),
 * else Opus 5.5.
 */
export function resolveModel<M extends string | null>(wanted: M, block: ModelBlock | 'off' | null, now: number, fallback: string = FALLBACK_MODEL): M | string {
  if (!isFable(wanted)) return wanted
  if (block === 'off' || (block !== null && blockActive(block, now))) return fallback
  return wanted
}

/** What is left of a block, short: `45m`, `2h`. */
export function blockLeft(block: ModelBlock, now: number): string {
  const minutes = Math.max(1, Math.ceil((blockEnds(block) - now) / 60_000))
  return minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`
}

/** The board header's chip while blocked: `fable ⊘ 2h`; null when Fable is free. */
export function blockChip(block: ModelBlock | null, now: number): string | null {
  return block !== null && blockActive(block, now) ? `fable ⊘ ${blockLeft(block, now)}` : null
}

/** The one toast when a block is seen. */
export function blockToast(block: ModelBlock, now: number): string {
  if (block.reason === 'forecast') return `fable limit near · switched early, resets in ${blockLeft(block, now)} — Opus 5.5 until then`
  return `fable limit · resets in ${blockLeft(block, now)} — new sessions use Opus 5.5`
}
