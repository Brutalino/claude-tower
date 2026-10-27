// The model catalogue (decision 057): the models Claude Code offers in `/model`, asked from Claude Code itself (an SDK
// `initialize` control request answered without calling any model), kept in `<state dir>/models.json` and refreshed in
// the background. Pure: register.tsx runs the probe and reads and writes the file.

import { EFFORTS } from './profile'
import { modelName } from './theme'

/** One model of `/model`: its full id (`resolvedModel`), the alias Claude Code knows it by, its name, and the efforts it takes (empty: none). */
export type ModelEntry = { id: string; alias: string; label: string; description: string; efforts: readonly string[] }

/** The models in Claude Code's order, without `default`; `defaultId` and `defaultDescription` are what `default` stands for. */
export type Catalogue = { models: readonly ModelEntry[]; defaultId: string | null; defaultDescription: string | null }

/** `<state dir>/models.json`: the `/model` list as Claude Code gave it, its version and when it was asked. */
export type ModelCache = { claudeCodeVersion: string | null; fetchedAt: number; models: readonly unknown[] }

/** A cache older than this is asked again. */
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** How long the probe may take before it counts as failed. */
export const PROBE_TIMEOUT_MS = 20_000

const ALL_EFFORTS: readonly string[] = EFFORTS

/** The built-in list, used when there is no cache and Claude Code could not be asked. */
export const FALLBACK_CATALOGUE: Catalogue = {
  models: [
    { id: 'claude-fable-5-1', alias: 'fable', label: 'Fable 5.1', description: 'For your toughest challenges', efforts: ALL_EFFORTS },
    { id: 'claude-opus-5-5', alias: 'opus', label: 'Opus 5.5', description: 'For complex work and everyday tasks', efforts: ALL_EFFORTS },
    { id: 'claude-sonnet-5-5', alias: 'sonnet', label: 'Sonnet 5.5', description: 'Most efficient for simpler tasks', efforts: ALL_EFFORTS },
    { id: 'claude-haiku-5-5', alias: 'haiku', label: 'Haiku 5.5', description: 'Fastest for quick answers', efforts: ALL_EFFORTS },
  ],
  defaultId: 'claude-fable-5-1',
  defaultDescription: 'Fable 5.1',
}

/** The probe: Claude Code in print mode reading SDK messages on stdin, run in the state dir without Tower's plugin. */
export const PROBE_ARGV: readonly string[] = ['claude', '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']

/** The one line written to the probe's stdin (closed after it): Claude Code answers it and exits. */
export const PROBE_INPUT = `${JSON.stringify({ type: 'control_request', request_id: 'tower-models', request: { subtype: 'initialize' } })}\n`

export function modelsPath(state: string): string {
  return `${state.replace(/\/+$/, '')}/models.json`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The probe's stdout: the `/model` list and Claude Code's version from its `control_response` line; null without one. */
export function parseInitialize(stdout: string): { version: string | null; models: unknown[] } | null {
  for (const line of stdout.split('\n')) {
    if (!line.includes('"control_response"')) continue
    let message: unknown
    try {
      message = JSON.parse(line)
    } catch {
      continue
    }
    if (!isRecord(message) || message.type !== 'control_response' || !isRecord(message.response)) continue
    const answer = message.response.response
    if (!isRecord(answer) || !Array.isArray(answer.models)) continue
    return { version: typeof answer.claude_code_version === 'string' ? answer.claude_code_version : null, models: answer.models }
  }
  return null
}

/** `claude --version`'s `2.1.296 (Claude Code)` → `2.1.296`; null when it says nothing. */
export function parseVersion(stdout: string): string | null {
  return stdout.trim().split(/\s+/)[0] || null
}

/**
 * The `/model` list as a catalogue: `default` left out of the choices (remembered as `defaultId` and
 * `defaultDescription`), one entry per full id (the first, the alias's), in Claude Code's order; an effort is kept
 * only when it is one of EFFORTS. Null when no entry is readable.
 */
export function parseCatalogue(raw: unknown): Catalogue | null {
  if (!Array.isArray(raw)) return null
  const models: ModelEntry[] = []
  let defaultId: string | null = null
  let defaultDescription: string | null = null
  for (const item of raw) {
    if (!isRecord(item) || typeof item.value !== 'string' || item.value === '') continue
    const id = typeof item.resolvedModel === 'string' && item.resolvedModel !== '' ? item.resolvedModel : item.value
    const description = typeof item.description === 'string' ? item.description : ''
    if (item.value === 'default') {
      defaultId = id
      defaultDescription = description !== '' ? description : null
      continue
    }
    if (models.some(model => model.id === id)) continue
    const levels = item.supportsEffort === true && Array.isArray(item.supportedEffortLevels) ? item.supportedEffortLevels : []
    models.push({
      id,
      alias: item.value,
      label: typeof item.displayName === 'string' && item.displayName !== '' ? item.displayName : modelName(id),
      description,
      efforts: ALL_EFFORTS.filter(effort => levels.includes(effort)),
    })
  }
  return models.length > 0 ? { models, defaultId, defaultDescription } : null
}

/** The cache file's JSON; null when it is not one or its list has no readable model. */
export function parseModelCache(raw: unknown): ModelCache | null {
  if (!isRecord(raw) || typeof raw.fetchedAt !== 'number' || !Array.isArray(raw.models) || parseCatalogue(raw.models) === null) return null
  return { claudeCodeVersion: typeof raw.claudeCodeVersion === 'string' ? raw.claudeCodeVersion : null, fetchedAt: raw.fetchedAt, models: raw.models }
}

/** The catalogue the cache holds, else the built-in list. */
export function catalogueOf(cache: ModelCache | null): Catalogue {
  return (cache !== null ? parseCatalogue(cache.models) : null) ?? FALLBACK_CATALOGUE
}

/**
 * Whether Claude Code should be asked again: no cache, one older than 24 h, or one written by another version than the
 * installed one (`installed` null: not known, not checked).
 */
export function cacheStale(cache: ModelCache | null, now: number, installed: string | null): boolean {
  if (cache === null || now - cache.fetchedAt > CACHE_MAX_AGE_MS) return true
  return installed !== null && cache.claudeCodeVersion !== installed
}

/** `40 min`, `5 h`, `3 d`. */
function ageShort(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`
}

/** The routing view's one dim line about the list: null while the cache is fresh. */
export function catalogueSource(cache: ModelCache | null, now: number, probing: boolean): string | null {
  if (cache === null) return probing ? 'models: built-in list (asking Claude Code…)' : 'models: built-in list (could not ask Claude Code)'
  return now - cache.fetchedAt > CACHE_MAX_AGE_MS ? `models: from cache ${ageShort(now - cache.fetchedAt)} ago` : null
}

/** The entry of `model`, by its full id or its alias. */
export function findModel(catalogue: Catalogue, model: string): ModelEntry | undefined {
  return catalogue.models.find(entry => entry.id === model) ?? catalogue.models.find(entry => entry.alias === model)
}

/** A model as its full id: a key of `modelIds` through it (`opus` → `opus`), then an alias through the catalogue (`opus` → `claude-opus-5-5`). */
export function modelIdOf(model: string, modelIds: Readonly<Record<string, string>>, catalogue: Catalogue): string {
  const named = Object.hasOwn(modelIds, model) ? modelIds[model]! : model
  return findModel(catalogue, named)?.id ?? named
}

/** Whether a stored model can be launched: a key of `modelIds`, or a model of the catalogue. */
export function modelAvailable(model: string, modelIds: Readonly<Record<string, string>>, catalogue: Catalogue): boolean {
  return Object.hasOwn(modelIds, model) || findModel(catalogue, model) !== undefined
}

/** Two choices are the same model when they resolve to the same id (null: the session's own). */
export function sameModel(a: string | null, b: string | null, modelIds: Readonly<Record<string, string>>, catalogue: Catalogue): boolean {
  if (a === null || b === null) return a === b
  return modelIdOf(a, modelIds, catalogue) === modelIdOf(b, modelIds, catalogue)
}

/** A model's name for people: the catalogue's (`Opus 5.5`), else one read from its id (`claude-opus-4-1` → `Opus 4.1`). */
export function modelLabelOf(model: string, modelIds: Readonly<Record<string, string>>, catalogue: Catalogue): string {
  const id = modelIdOf(model, modelIds, catalogue)
  return findModel(catalogue, id)?.label ?? modelName(id)
}

/** The `default` choice's name: `default · Fable 5.1`, or `default` when the catalogue does not say. */
export function defaultLabel(catalogue: Catalogue): string {
  const named = catalogue.defaultDescription ?? (catalogue.defaultId !== null ? modelLabelOf(catalogue.defaultId, {}, catalogue) : null)
  return named !== null ? `default · ${named}` : 'default'
}

/** The efforts a model takes (null: the session's own, the catalogue's default); null when the catalogue does not know it. */
export function effortsOf(model: string | null, catalogue: Catalogue): readonly string[] | null {
  const id = model ?? catalogue.defaultId
  if (id === null) return null
  return findModel(catalogue, id)?.efforts ?? null
}

/**
 * The effort a launch passes on `model`: as chosen when the model takes it (or is unknown); else the nearest lower level
 * it takes (xhigh → high), else its lowest; null when the model takes no effort at all.
 */
export function clampEffort(effort: string | null, efforts: readonly string[] | null): string | null {
  if (effort === null || efforts === null || efforts.includes(effort)) return effort
  if (efforts.length === 0) return null
  const at = ALL_EFFORTS.indexOf(effort)
  const lower = ALL_EFFORTS.slice(0, Math.max(0, at)).filter(level => efforts.includes(level)).at(-1)
  return lower ?? ALL_EFFORTS.find(level => efforts.includes(level)) ?? efforts[0] ?? null
}

/** `clampEffort` for a model of the catalogue (a full id, an alias, or null for the session's own). */
export function effortFor(model: string | null, effort: string | null, catalogue: Catalogue): string | null {
  return clampEffort(effort, effortsOf(model, catalogue))
}
