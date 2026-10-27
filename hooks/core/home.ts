// The home screen (decision 030): the board of cards — four columns, the inspector under them.

import type { TowerIssue } from '../../types/index'
import { groupByStory, orderByDependency, type StoryEntry } from './stories'

export const HOME_COLUMNS = ['needs you', 'working', 'ready', 'candidates'] as const
export type HomeColumn = (typeof HOME_COLUMNS)[number]

export const HOME_GAP = 2
export const HOME_MIN_COLUMN = 30
/** A title takes two lines from this column width up. */
export const HOME_TWO_LINE_TITLE = 40

/**
 * The columns' grid at width W: four side by side while each keeps 30 cells; below that,
 * two rows of two (`needs you` + `working` over `ready` + `candidates`).
 */
export function columnsLayout(width: number): { rows: HomeColumn[][]; width: number } {
  const four = Math.floor((width - 3 * HOME_GAP) / 4)
  if (four >= HOME_MIN_COLUMN) return { rows: [[...HOME_COLUMNS]], width: four }
  return { rows: [['needs you', 'working'], ['ready', 'candidates']], width: Math.max(1, Math.floor((width - HOME_GAP) / 2)) }
}

/** A card's rows, its round border included: id, title (one or two lines), status, the bar row of a working card, the PR row (decision 035). */
export function homeCardRows(column: HomeColumn, width: number, prRow = false): number {
  return 2 + 1 + (width >= HOME_TWO_LINE_TITLE ? 2 : 1) + 1 + (column === 'working' ? 1 : 0) + (prRow ? 1 : 0)
}

export type ColumnWindow = { start: number; end: number; moreAbove: number; moreBelow: number }

/**
 * The items of a column that fit in `rows` (each `heights[i]` rows high), following the focused one:
 * the window keeps `start` while the focus is inside it, and an `n more` line takes one row at each cut end.
 */
export function columnWindow(heights: readonly number[], focused: number, rows: number, start = 0): ColumnWindow {
  const count = heights.length
  const fitsFrom = (from: number): number => {
    let used = from > 0 ? 1 : 0
    let end = from
    while (end < count && used + heights[end]! + (end + 1 < count ? 1 : 0) <= rows) used += heights[end++]!
    // The last item may take the row its `more` line would have needed.
    if (end === count - 1 && used + heights[end]! <= rows) end++
    return Math.max(end, Math.min(count, from + 1))
  }
  let from = Math.max(0, Math.min(start, count - 1))
  const at = focused < 0 || focused >= count ? -1 : focused
  if (at >= 0 && at < from) from = at
  while (at >= 0 && from < at && fitsFrom(from) <= at) from++
  if (count === 0) return { start: 0, end: 0, moreAbove: 0, moreBelow: 0 }
  // No blank rows at the bottom while cards are hidden above: the start moves back while all the rest still fits.
  while (from > 0 && fitsFrom(from - 1) === count) from--
  const end = fitsFrom(from)
  return { start: from, end, moreAbove: from, moreBelow: count - end }
}

/** A thin bar of `done` out of `total`: `▰` done, `▱` left, `width` cells. */
export function progressBar(done: number, total: number, width: number): string {
  if (width <= 0) return ''
  const filled = total <= 0 ? 0 : Math.max(0, Math.min(width, Math.round((done / total) * width)))
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

/** The neighbour column's card for Alt+←/→: the same index, else its last; columns without cards are skipped. */
export function neighbourCard(columns: readonly (readonly string[])[], current: string | null, way: 'left' | 'right'): string | null {
  const col = columns.findIndex(keys => current !== null && keys.includes(current))
  if (col < 0) return columns.find(keys => keys.length > 0)?.[0] ?? null
  const index = columns[col]!.indexOf(current as string)
  for (let next = col + (way === 'left' ? -1 : 1); next >= 0 && next < columns.length; next += way === 'left' ? -1 : 1) {
    const keys = columns[next] ?? []
    if (keys.length > 0) return keys[Math.min(index, keys.length - 1)] ?? null
  }
  return null
}

/** The family with the most tokens: the colour of a working session's figure. */
export function leadFamily(tokens: Record<string, number> | null | undefined): string | null {
  const entries = Object.entries(tokens ?? {}).filter(([, count]) => count > 0)
  if (entries.length === 0) return null
  return entries.sort((x, y) => y[1] - x[1])[0]?.[0] ?? null
}

/**
 * A column's cards with their stories (groupByStory): `↳` children, a header over two or more children of a story
 * not in the column, and a story in the column first, its children in the column right after it, blockers first.
 */
export function columnStories<T>(rows: readonly T[], issues: readonly TowerIssue[], idOf: (row: T) => string): StoryEntry<T>[] {
  const entries = groupByStory(rows, issues, idOf)
  const ids = new Set(rows.map(idOf))
  const storyOf = (row: T) => issues.find(issue => issue.id === idOf(row))?.story?.id ?? null
  const childOfListed = (entry: StoryEntry<T>) => entry.kind === 'ticket' && entry.childPrefix && ids.has(storyOf(entry.row) ?? '')
  const out: StoryEntry<T>[] = []
  for (const entry of entries) {
    if (childOfListed(entry)) continue
    out.push(entry)
    if (entry.kind !== 'ticket') continue
    const story = idOf(entry.row)
    const children = entries.filter(one => childOfListed(one) && one.kind === 'ticket' && storyOf(one.row) === story)
    const byId = new Map(children.map(one => [idOf((one as { row: T }).row), one]))
    for (const id of orderByDependency([...byId.keys()], issues)) out.push(byId.get(id) as StoryEntry<T>)
  }
  return out
}

/**
 * The candidates column: the person's own tickets first, then the rest, each part in its order with its stories
 * (columnStories), so a story never pulls a free ticket above one of the person's.
 */
export function candidateStories<T>(rows: readonly T[], issues: readonly TowerIssue[], idOf: (row: T) => string, mine: (row: T) => boolean): StoryEntry<T>[] {
  return [...columnStories(rows.filter(mine), issues, idOf), ...columnStories(rows.filter(row => !mine(row)), issues, idOf)]
}
