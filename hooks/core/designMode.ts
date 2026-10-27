// The start menu's choices inside the mod (decision 064): a free session that starts with one of Tower's own skills
// (`/tower:tower-setup`, `/tower:tower-design`), the design Tower's DOCUMENTS and OPEN QUESTIONS boxes, its path rows
// beside a session and `+ prototype`'s folder in `spikes/`. Pure, tested in tests/designMode.test.ts.

import type { SkillStart } from './launcher'
import type { Profile } from './profile'
import { DESIGN_STAGES, type DesignQuestion, type DesignRow, type DesignState } from './design'

/** Tower's own skills a free session may start with. */
export type TowerSkill = 'tower-setup' | 'tower-design'

/** The key prefix of a design session (`design-<8 hex>`): a free session opened on `/tower:tower-design`. */
export const DESIGN_SESSION_TAG = 'design'

export function isDesignSession(key: string): boolean {
  return key.startsWith(`${DESIGN_SESSION_TAG}-`)
}

/** `/tower:tower-setup`: the skill as a session's first prompt (plugin `tower`). */
export function towerSkillPrompt(skill: TowerSkill): string {
  return `/tower:${skill}`
}

/**
 * A free session that starts with one of Tower's skills: the skill's model and effort when the routing table names it
 * (`tower:<skill>` or `<skill>`), else `fallback` (the routing view's `new session`, freeStart).
 */
export function towerSkillStart(skill: TowerSkill, skills: Profile['skills'], modelIds: Readonly<Record<string, string>>, fallback: { model: string | null; effort: string | null }): SkillStart {
  const prompt = towerSkillPrompt(skill)
  const named = skills.find(one => one.name === `tower:${skill}` || one.name === skill)
  if (named === undefined) return { prompt, model: fallback.model, effort: fallback.effort }
  return { prompt, model: named.model === null ? null : (modelIds[named.model] ?? named.model), effort: named.effort }
}

/** A stage's document in the DOCUMENTS box: the stage, the path or link, and the name drawn (`IDEA.md`, `design canvas`). */
export type DesignDocument = { n: number; label: string; doc: string; name: string; link: boolean }

function isLink(doc: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(doc)
}

/** Every stage's document, in stage order: none for a skipped stage or one without a document (an unset design stage, setup). */
export function designDocuments(state: DesignState): DesignDocument[] {
  return state.stages.flatMap(stage => {
    if (stage.status === 'skipped' || stage.doc === null) return []
    const label = DESIGN_STAGES.find(def => def.n === stage.n)?.label ?? stage.key
    const link = isLink(stage.doc)
    const name = link ? 'design canvas' : (stage.doc.replace(/\/+$/, '').split('/').pop() ?? stage.doc)
    return [{ n: stage.n, label, doc: stage.doc, name, link }]
  })
}

/** Where a document is on disk (`<folder>/docs/IDEA.md`); null for a link (the canvas counts as there). */
export function documentPath(folder: string, doc: DesignDocument): string | null {
  if (doc.link) return null
  return doc.doc.startsWith('/') ? doc.doc : `${folder.replace(/\/+$/, '')}/${doc.doc}`
}

/** The DOCUMENTS box's lines: `✓ IDEA.md  ○ RESEARCH.md …`, as many to a line as fit in `width`, two spaces between. */
export function documentLines(docs: readonly DesignDocument[], exists: Readonly<Record<string, boolean>>, width: number): { mark: '✓' | '○'; name: string; n: number }[][] {
  const lines: { mark: '✓' | '○'; name: string; n: number }[][] = []
  let used = 0
  for (const doc of docs) {
    const entry = { mark: exists[String(doc.n)] === true ? '✓' as const : '○' as const, name: doc.name, n: doc.n }
    const cells = 2 + Array.from(doc.name).length
    const last = lines[lines.length - 1]
    if (last !== undefined && used + 2 + cells <= width) {
      last.push(entry)
      used += 2 + cells
    } else {
      lines.push([entry])
      used = cells
    }
  }
  return lines
}

/** The OPEN QUESTIONS box: the active stage (its number and label) and its open questions; no stage when none is active. */
export function designQuestions(state: DesignState): { stage: { n: number; label: string } | null; questions: DesignQuestion[] } {
  const active = state.stages.find(stage => stage.status === 'active')
  if (active === undefined) return { stage: null, questions: [] }
  const label = DESIGN_STAGES.find(def => def.n === active.n)?.label ?? active.key
  return { stage: { n: active.n, label }, questions: active.openQuestions }
}

/** The width of the stage names `5 Architecture`, the longest. */
export const STAGE_NAME_WIDTH = Math.max(...DESIGN_STAGES.map(def => `${def.n} ${def.label}`.length))

/** A path row beside a session: the stage's name padded, then its note (`3 open questions`, `skipped: …`) or its document. */
export function designRowTail(row: DesignRow): string {
  return row.note ?? row.doc
}

/**
 * `+ prototype`'s folder (plan "Prototypes"): `spikes/<nn>-<slug>`, `<nn>` one more than the highest number among the
 * folders already there (two digits at least), `<slug>` the name lowercased, accents dropped, every other run of
 * characters one `-`, at most 32 characters. Null for a name with no letter or digit.
 */
export function prototypeFolder(name: string, existing: readonly string[]): string | null {
  const slug = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/, '')
  if (slug === '') return null
  const highest = existing.reduce((top, entry) => {
    const n = /^(\d+)-/.exec(entry)?.[1]
    return n !== undefined ? Math.max(top, Number(n)) : top
  }, 0)
  return `${String(highest + 1).padStart(2, '0')}-${slug}`
}
