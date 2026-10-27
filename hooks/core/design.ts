// New project mode's path (decision 062): the stage state file `.tower/design.json` that the tower-design skill writes
// through tools/tower-design-state.sh, read tolerantly, and the rows the rail will draw. Pure, tested in tests/design.test.ts.

export const DESIGN_VERSION = 1

/** The state file, relative to the project folder (the folder `tower` was opened in). */
export const DESIGN_STATE_PATH = '.tower/design.json'

export type DesignStageKey = 'idea' | 'research' | 'product' | 'decisions' | 'architecture' | 'design' | 'plan' | 'setup'
export type DesignStageStatus = 'done' | 'active' | 'todo' | 'skipped'

export type DesignQuestion = { id: string; text: string }
export type DesignResolved = DesignQuestion & { answer: string | null }

export type DesignStage = {
  n: number
  key: DesignStageKey
  status: DesignStageStatus
  /** The document the stage produces (a path in the project, or the design canvas's link); null when it has none. */
  doc: string | null
  openQuestions: DesignQuestion[]
  resolvedQuestions: DesignResolved[]
  /** Why a stage was skipped (the design stage of a project without a UI), or any short note. */
  note: string | null
}

export type DesignState = { version: number; current: number; stages: DesignStage[] }

/** The eight stages in order, with the plan's label, summary and default document (`docs/plans/general-tower.md`, "The path"). */
export const DESIGN_STAGES: readonly { n: number; key: DesignStageKey; label: string; summary: string; doc: string | null }[] = [
  { n: 1, key: 'idea', label: 'Idea', summary: "the raw idea, in the user's words", doc: 'docs/IDEA.md' },
  { n: 2, key: 'research', label: 'Research', summary: 'the topic, what exists, users, constraints', doc: 'docs/RESEARCH.md' },
  { n: 3, key: 'product', label: 'Product', summary: 'what, for whom, why, what not', doc: 'docs/PRODUCT.md' },
  { n: 4, key: 'decisions', label: 'Decisions', summary: 'platform, stack, data', doc: 'docs/DECISIONS.md' },
  { n: 5, key: 'architecture', label: 'Architecture', summary: 'modules, data, main flows', doc: 'docs/ARCHITECTURE.md' },
  { n: 6, key: 'design', label: 'Design', summary: 'screens and style (when there is a UI)', doc: null },
  { n: 7, key: 'plan', label: 'Plan', summary: 'milestones and first slices', doc: 'docs/ROADMAP.md' },
  { n: 8, key: 'setup', label: 'Setup', summary: 'tower-setup builds the infrastructure', doc: null },
]

const STATUSES: readonly DesignStageStatus[] = ['done', 'active', 'todo', 'skipped']

/** A new project's state: stage 1 active, the rest to do. */
export function newDesignState(): DesignState {
  return {
    version: DESIGN_VERSION,
    current: 1,
    stages: DESIGN_STAGES.map(stage => ({
      n: stage.n,
      key: stage.key,
      status: stage.n === 1 ? 'active' : 'todo',
      doc: stage.doc,
      openQuestions: [],
      resolvedQuestions: [],
      note: null,
    })),
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** A question as `{ id, text }`; a bare string is a question too, numbered by its place. */
function question(value: unknown, fallbackId: string): DesignQuestion | null {
  if (typeof value === 'string') return text(value) === null ? null : { id: fallbackId, text: value.trim() }
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const body = text(record.text)
  if (body === null) return null
  return { id: text(record.id) ?? fallbackId, text: body }
}

function questions(value: unknown, prefix: string): DesignQuestion[] {
  if (!Array.isArray(value)) return []
  return value.map((entry, i) => question(entry, `${prefix}${i + 1}`)).filter((entry): entry is DesignQuestion => entry !== null)
}

/** Resolved questions keep their `answer` (null when none was written). */
function resolved(value: unknown, prefix: string): DesignResolved[] {
  if (!Array.isArray(value)) return []
  const found: DesignResolved[] = []
  value.forEach((entry, i) => {
    const q = question(entry, `${prefix}${i + 1}`)
    if (q === null) return
    const answer = typeof entry === 'object' && entry !== null ? text((entry as Record<string, unknown>).answer) : null
    found.push({ ...q, answer })
  })
  return found
}

/**
 * The state file read tolerantly: null when it is missing, does not parse (caught mid-write) or is not an object.
 * Otherwise always the eight stages in order: a stage is found by its `n` or its `key`; one missing, or an unknown
 * status, reads `todo`; a missing `doc` takes the stage's default; unknown fields are ignored. `current` is the
 * file's when it is 1–8, else the active stage, else the first stage neither done nor skipped (8 when all are).
 */
export function parseDesignState(raw: string | undefined): DesignState | null {
  if (raw === undefined) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  const listed = Array.isArray(record.stages) ? record.stages.filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null) : []
  const stages: DesignStage[] = DESIGN_STAGES.map(def => {
    const found = listed.find(s => s.n === def.n || s.key === def.key)
    const status = STATUSES.find(s => s === found?.status) ?? 'todo'
    return {
      n: def.n,
      key: def.key,
      status,
      doc: found !== undefined && 'doc' in found ? text(found.doc) : def.doc,
      openQuestions: questions(found?.openQuestions, `${def.key}-`),
      resolvedQuestions: resolved(found?.resolvedQuestions, `${def.key}-r`),
      note: text(found?.note),
    }
  })
  const fileCurrent = typeof record.current === 'number' && Number.isInteger(record.current) && record.current >= 1 && record.current <= 8 ? record.current : null
  const current = fileCurrent ?? stages.find(s => s.status === 'active')?.n ?? stages.find(s => s.status === 'todo')?.n ?? 8
  const version = typeof record.version === 'number' ? record.version : DESIGN_VERSION
  return { version, current, stages }
}

export type DesignRow = {
  n: number
  key: DesignStageKey
  label: string
  /** `✓` done, `◆` active, `○` to do, `–` skipped. */
  mark: string
  status: DesignStageStatus
  summary: string
  /** The document column: the stage's document, `design canvas` for a design stage without one (empty when skipped), empty for setup. */
  doc: string
  /** `3 open questions`, `1 open question`, `skipped: <reason>`, or null. */
  note: string | null
  /** The stage `current` points at. */
  current: boolean
}

const MARKS: Record<DesignStageStatus, string> = { done: '✓', active: '◆', todo: '○', skipped: '–' }

/** The path as the rail draws it: one row per stage, in order. */
export function designPath(state: DesignState): DesignRow[] {
  return DESIGN_STAGES.map(def => {
    const stage = state.stages.find(s => s.n === def.n)
    const status = stage?.status ?? 'todo'
    const open = stage?.openQuestions.length ?? 0
    const note =
      status === 'skipped'
        ? stage?.note !== null && stage?.note !== undefined
          ? `skipped: ${stage.note}`
          : 'skipped'
        : open > 0
          ? `${open} open question${open === 1 ? '' : 's'}`
          : null
    const doc = stage?.doc ?? (def.key === 'design' && status !== 'skipped' ? 'design canvas' : '')
    return { n: def.n, key: def.key, label: def.label, mark: MARKS[status], status, summary: def.summary, doc, note, current: state.current === def.n }
  })
}

/** The path's title: `new project · ~/Repositories/budget-app` (the home folder as `~`). */
export function designTitle(folder: string, home: string): string {
  const shown = home !== '' && (folder === home || folder.startsWith(`${home}/`)) ? `~${folder.slice(home.length)}` : folder
  return `new project · ${shown}`
}

/** The rows as plain text lines, columns aligned as in the plan's mock (for the dry walk-through and the tests). */
export function designPathLines(rows: readonly DesignRow[]): string[] {
  const name = (row: DesignRow) => `${row.n} ${row.label}`
  const nameWidth = Math.max(...rows.map(row => name(row).length))
  const summaryWidth = Math.max(...rows.map(row => row.summary.length))
  const docWidth = Math.max(...rows.map(row => row.doc.length))
  return rows.map(row => {
    const parts = [`${row.mark} ${name(row).padEnd(nameWidth)}`, row.summary.padEnd(summaryWidth), row.doc.padEnd(docWidth)]
    if (row.note !== null) parts.push(row.note)
    return parts.join('  ').trimEnd()
  })
}
