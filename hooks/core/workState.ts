// Reading the ticket's state file (config phases.path; e.g. `<worktree>/.work/state.json`, written by its ticket skills).

import type { TowerPhase } from '../../types/index'
import type { PhasesConfig } from './config'

/** `rawPhase`: the file's own phase text when Tower does not know it (`review`, `done`), read as `unknownAs` (e.g. `implementing`). */
export type WorkSummary = { phase: TowerPhase; next: string | null; hasPlan: boolean; blockers: string[]; rawPhase?: string }

const NOT_STARTED: WorkSummary = { phase: 'not started', next: null, hasPlan: false, blockers: [] }

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** A blocker as text: a string, or an object's `text`, `description`, `title` or `reason`. */
function blockerText(value: unknown): string | null {
  if (typeof value === 'string') return nonEmptyString(value)
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  for (const key of ['text', 'description', 'title', 'reason']) {
    const found = nonEmptyString(record[key])
    if (found !== null) return found
  }
  return JSON.stringify(value)
}

function parseBlockers(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(blockerText).filter((text): text is string => text !== null)
}

/**
 * Only a missing file (undefined) reads as `not started` (decision 051): a file that exists means
 * the work started. A phase word maps by `phases.mapping`; an unknown or empty one reads as
 * `phases.unknownAs` (its own text in `rawPhase`), and so does a file that does not parse (caught
 * mid-write). Phases that do not come from a state file read as `not started` here.
 */
export function parseWorkState(text: string | undefined, phases: PhasesConfig): WorkSummary {
  if (text === undefined || phases.source !== 'state-file') return NOT_STARTED
  const started: WorkSummary = { phase: phases.unknownAs, next: null, hasPlan: false, blockers: [] }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return started
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return started
  const record = raw as Record<string, unknown>
  const rawPhase = nonEmptyString(record.phase)
  // Own keys only: a word like `constructor` is not a phase.
  const phase = rawPhase !== null && Object.hasOwn(phases.mapping, rawPhase) ? phases.mapping[rawPhase]! : phases.unknownAs
  return {
    phase,
    next: nonEmptyString(record.next),
    hasPlan: nonEmptyString(record.plan) !== null,
    blockers: parseBlockers(record.blockers),
    ...(rawPhase !== null && rawPhase !== phase ? { rawPhase } : {}),
  }
}

/** The plan text and the base branch, for the detail column; null where absent. */
export function parseWorkDetail(text: string | undefined): { plan: string | null; base: string | null } {
  let raw: unknown
  try {
    raw = text === undefined ? null : JSON.parse(text)
  } catch {
    raw = null
  }
  if (typeof raw !== 'object' || raw === null) return { plan: null, base: null }
  const record = raw as Record<string, unknown>
  return { plan: nonEmptyString(record.plan), base: nonEmptyString(record.base) }
}
