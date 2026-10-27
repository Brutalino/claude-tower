// Stories and their sub-tickets in the lists and the detail, the way the old tower showed them:
// `↳ ` before a child's title, a dim `▸ <story> <title> · d/t done` header above two or more children
// whose story is not in the list, the story row's own ` · d/t done`, and the detail's relations block.

import type { TowerIssue, TowerIssueRef } from '../../types/index'

const CLOSED = new Set(['completed', 'canceled'])

export type StoryEntry<T> =
  | { kind: 'ticket'; row: T; childPrefix: boolean; storySuffix: string | null }
  | { kind: 'storyHeader'; storyId: string; text: string }

/** The blockers of `id` as Linear gave them: its own open blockers, else what a story's children list says. */
function blockersOf(id: string, issues: readonly TowerIssue[]): string[] {
  const own = issues.find(issue => issue.id === id)
  if (own !== undefined) return own.blockedBy
  for (const issue of issues) {
    const child = [...(issue.children ?? []), ...(issue.story?.children ?? [])].find(one => one.id === id)
    if (child?.blockedBy !== undefined) return child.blockedBy
  }
  return []
}

/** `ids` with blockers first; a cycle (or what is left of one) keeps arrival order. */
export function orderByDependency(ids: readonly string[], issues: readonly TowerIssue[], blockers = (id: string) => blockersOf(id, issues)): string[] {
  const left = [...ids]
  const out: string[] = []
  while (left.length > 0) {
    const ready = left.findIndex(id => blockers(id).every(blocker => !left.includes(blocker) || blocker === id))
    const [next] = left.splice(ready === -1 ? 0 : ready, 1)
    out.push(next as string)
  }
  return out
}

/** The story's children done (completed) of all: from the story itself when listed, else from a child's `story.children`, else the listed children. */
export function storyProgress(storyId: string, issues: readonly TowerIssue[]): { done: number; total: number } {
  const story = issues.find(issue => issue.id === storyId)
  const fromStory = story?.children ?? []
  const fromChild = issues.find(issue => issue.story?.id === storyId && (issue.story.children ?? []).length > 0)?.story?.children ?? []
  const states: string[] = fromStory.length > 0 && fromStory.every(child => child.stateType !== undefined)
    ? fromStory.map(child => child.stateType ?? '')
    : fromChild.length > 0 ? fromChild.map(child => child.stateType ?? '')
      : issues.filter(issue => issue.story?.id === storyId).map(issue => issue.stateType)
  return { done: states.filter(state => state === 'completed').length, total: states.length }
}

function progressText(storyId: string, issues: readonly TowerIssue[]): string | null {
  const { done, total } = storyProgress(storyId, issues)
  return total > 0 ? ` · ${done}/${total} done` : null
}

/**
 * One list group in display order. A row whose story is in the group gets `↳ `; two or more rows whose story
 * is not get a header where the first of them was, then those rows by dependency, each with `↳ `. A single
 * such row stays plain. A row that is a story gets ` · d/t done`.
 */
export function groupByStory<T>(rows: readonly T[], issues: readonly TowerIssue[], idOf: (row: T) => string): StoryEntry<T>[] {
  const byId = new Map(issues.map(issue => [issue.id, issue]))
  const ids = new Set(rows.map(idOf))
  const storyOf = (row: T) => byId.get(idOf(row))?.story ?? null
  const members = new Map<string, T[]>()
  for (const row of rows) {
    const story = storyOf(row)
    if (story === null || ids.has(story.id)) continue
    members.set(story.id, [...(members.get(story.id) ?? []), row])
  }
  const ticket = (row: T, childPrefix: boolean): StoryEntry<T> => {
    const issue = byId.get(idOf(row))
    const isStory = issue !== undefined && ((issue.children ?? []).length > 0 || issues.some(other => other.story?.id === issue.id))
    return { kind: 'ticket', row, childPrefix, storySuffix: isStory ? progressText(idOf(row), issues) : null }
  }
  const out: StoryEntry<T>[] = []
  const placed = new Set<string>()
  for (const row of rows) {
    const story = storyOf(row)
    if (story === null) {
      out.push(ticket(row, false))
      continue
    }
    if (ids.has(story.id)) {
      out.push(ticket(row, true))
      continue
    }
    const group = members.get(story.id) ?? []
    if (group.length < 2) {
      out.push(ticket(row, false))
      continue
    }
    if (placed.has(story.id)) continue
    placed.add(story.id)
    out.push({ kind: 'storyHeader', storyId: story.id, text: `▸ ${story.id} ${story.title}${progressText(story.id, issues) ?? ''}` })
    const order = orderByDependency(group.map(idOf), issues)
    for (const id of order) out.push(ticket(group.find(one => idOf(one) === id) as T, true))
  }
  return out
}

/** A story block of the narrow rail (decision 067): the story (null: the tickets with no story, or none known) and its rows in order. */
export type StoryBlock<T> = { story: { id: string; title: string; text: string } | null; rows: T[] }

const byKey = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

/**
 * The narrow rail's tickets in story blocks (decision 067). A row's story is its Linear issue's parent; a row that is
 * itself the story of another row heads its own block; a row whose issue is not loaded is never guessed into one.
 * Inside a block: by `rankOf` (needs you 0, working 1, ready 2, not started 3), then blockers first, then by key.
 * The blocks: by their best rank, then by story key; the rows with no story last, in one block with `story: null`.
 * Header text: `▾ TKT-123 Story title · d/t done`.
 */
export function storyBlocks<T>(rows: readonly T[], issues: readonly TowerIssue[], keyOf: (row: T) => string, rankOf: (row: T) => number): StoryBlock<T>[] {
  const byId = new Map(issues.map(issue => [issue.id.toUpperCase(), issue]))
  const storyOf = (row: T) => byId.get(keyOf(row).toUpperCase())?.story ?? null
  const stories = new Map<string, { id: string; title: string }>()
  for (const row of rows) {
    const story = storyOf(row)
    if (story !== null && !stories.has(story.id.toUpperCase())) stories.set(story.id.toUpperCase(), { id: story.id, title: story.title })
  }
  const blockOf = (row: T): string | null => {
    const story = storyOf(row)
    if (story !== null) return story.id.toUpperCase()
    const own = keyOf(row).toUpperCase()
    return stories.has(own) ? own : null
  }
  const ordered = (members: readonly T[]): T[] => {
    const out: T[] = []
    for (const rank of [...new Set(members.map(rankOf))].sort((a, b) => a - b)) {
      const same = members.filter(row => rankOf(row) === rank).sort((a, b) => byKey(keyOf(a), keyOf(b)))
      for (const key of orderByDependency(same.map(keyOf), issues)) out.push(same.find(row => keyOf(row) === key) as T)
    }
    return out
  }
  const groups = new Map<string, T[]>()
  const loose: T[] = []
  for (const row of rows) {
    const block = blockOf(row)
    if (block === null) loose.push(row)
    else groups.set(block, [...(groups.get(block) ?? []), row])
  }
  const best = (members: readonly T[]) => Math.min(...members.map(rankOf))
  const blocks: StoryBlock<T>[] = [...groups]
    .sort(([a, one], [b, other]) => best(one) - best(other) || byKey(a, b))
    .map(([key, members]) => {
      const story = stories.get(key) as { id: string; title: string }
      return { story: { ...story, text: `▾ ${story.id} ${story.title}${progressText(story.id, issues) ?? ''}` }, rows: ordered(members) }
    })
  return loose.length > 0 ? [...blocks, { story: null, rows: ordered(loose) }] : blocks
}

/** One line of the narrow rail's ticket list as fitRail counts it: a heading, a blank, a ticket (two rows), or a one-row line. */
export type RailLine = { kind: 'head' | 'gap' | 'ticket' | 'line'; rows: number }

/**
 * The lines that fit `room` rows (decision 067): all of them, else the first ones with one row kept for `+N more`. A
 * heading is kept only with the line under it; a blank or a heading left last is dropped. `hidden`: the tickets cut.
 */
export function fitRail<T extends RailLine>(lines: readonly T[], room: number): { shown: T[]; hidden: number } {
  const tickets = (list: readonly T[]) => list.filter(line => line.kind === 'ticket').length
  if (lines.reduce((sum, line) => sum + line.rows, 0) <= room) return { shown: [...lines], hidden: 0 }
  let budget = room - 1
  const shown: T[] = []
  for (const [at, line] of lines.entries()) {
    const need = line.rows + (line.kind === 'head' ? (lines[at + 1]?.rows ?? 0) : 0)
    if (need > budget) break
    shown.push(line)
    budget -= line.rows
  }
  while (shown.length > 0 && (shown[shown.length - 1]?.kind === 'gap' || shown[shown.length - 1]?.kind === 'head')) shown.pop()
  return { shown, hidden: tickets(lines) - tickets(shown) }
}

export type RelationRow = {
  label: 'parent' | 'sub' | 'blocked by' | 'blocks'
  text: string
  /** `error` (red), `dim`, or the plain text colour. */
  tone: 'plain' | 'dim' | 'error'
  suffix: string
  suffixTone: 'error' | 'done' | null
}

const refText = (ref: { id: string; title: string; stateName?: string }) => `${ref.id} — ${ref.title}${ref.stateName ? ` (${ref.stateName})` : ''}`

function refOf(id: string, issues: readonly TowerIssue[]): TowerIssueRef {
  const issue = issues.find(one => one.id === id)
  return { id, title: issue?.title ?? '', stateName: issue?.stateName ?? '', stateType: issue?.stateType ?? '' }
}

/** The detail's relations: `parent`, one `sub` per child (by dependency), `blocked by`, `blocks`; only the rows that exist. */
export function detailRelations(issue: TowerIssue, issues: readonly TowerIssue[]): RelationRow[] {
  const rows: RelationRow[] = []
  const row = (label: RelationRow['label'], text: string, tone: RelationRow['tone'], suffix = '', suffixTone: RelationRow['suffixTone'] = null) =>
    rows.push({ label, text, tone, suffix, suffixTone })
  if (issue.story !== null) row('parent', refText(issue.story), 'plain')
  const children = issue.children ?? []
  const childById = new Map(children.map(child => [child.id, child]))
  const open = (id: string) => !CLOSED.has(childById.get(id)?.stateType ?? '')
  const siblingBlockers = (id: string) => (childById.get(id)?.blockedBy ?? []).filter(blocker => childById.has(blocker) && open(blocker))
  let startHere = false
  for (const id of orderByDependency(children.map(child => child.id), issues, siblingBlockers)) {
    const child = childById.get(id) as (typeof children)[number]
    if (!open(id)) {
      row('sub', `✓ ↳ ${refText(child)}`, 'dim')
      continue
    }
    const blockers = siblingBlockers(id)
    if (blockers.length > 0) row('sub', `↳ ${refText(child)}`, 'plain', ` · blocked by ${blockers.join(', ')}`, 'error')
    else if (!startHere) {
      startHere = true
      row('sub', `↳ ${refText(child)}`, 'plain', ' · start here', 'done')
    } else row('sub', `↳ ${refText(child)}`, 'plain')
  }
  const blockers = issue.blockers ?? issue.blockedBy.map(id => refOf(id, issues))
  for (const blocker of blockers) {
    if (CLOSED.has(blocker.stateType)) row('blocked by', `✓ ${refText(blocker)}`, 'dim')
    else row('blocked by', refText(blocker), 'error')
  }
  for (const blocked of issue.blocks ?? []) row('blocks', refText(blocked), 'dim')
  return rows
}
