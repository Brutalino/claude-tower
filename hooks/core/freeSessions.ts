// Free sessions (decision 055, plan general-tower.md "+ new session"): a plain Claude session in a folder of the
// repository, with no ticket and no start prompt, in the centre like a ticket's. The rail lists the live ones under
// SESSIONS from the shared status files: the name (its first prompt's first words, else the folder), a state glyph and
// how long ago its state last changed.

import type { TowerFreeRow, TowerSessionStatus } from '../../types/index'
import type { AttentionRow } from './attention'
import { formatAge } from './detail'
import { isRealWait, newestTicketStatuses } from './sessionStatus'
import { folderName } from './worktrees'

/** The words of the first prompt a free session's name keeps, and its length at most. */
export const TITLE_WORDS = 5
export const TITLE_MAX = 32

/** `SwiftData vs GRDB for 10k rows…` → `SwiftData vs GRDB for 10k`: the first prompt's first words; null when it has none. */
export function sessionTitle(prompt: string): string | null {
  const line = prompt.split('\n').map(one => one.trim()).find(one => one !== '')
  if (line === undefined) return null
  const words = line.split(/\s+/).slice(0, TITLE_WORDS).join(' ')
  const chars = Array.from(words)
  return chars.length <= TITLE_MAX ? words : `${chars.slice(0, TITLE_MAX - 1).join('').trimEnd()}…`
}

/**
 * The live free sessions, one per key (the newest record), in the order they were opened (the key carries the clock):
 * the name, where it runs (the branch of the worktree it is in, else its folder's name) and its state, a real wait first.
 */
export function freeSessionRows(statuses: TowerSessionStatus[], now: number, worktrees: readonly { path: string; branch: string | null }[]): TowerFreeRow[] {
  return [...newestTicketStatuses(statuses, now, 'free').values()]
    .sort((a, b) => (a.ticket ?? '').localeCompare(b.ticket ?? ''))
    .map(status => {
      const tree = worktrees.find(one => one.path === status.cwd)
      return {
        key: status.ticket ?? '',
        name: status.title || folderName(status.cwd),
        place: tree?.branch ?? folderName(status.cwd),
        cwd: status.cwd,
        state: isRealWait(status.waiting, now) ? 'waiting' : status.state === 'working' ? 'working' : 'idle',
        since: status.since,
        ...(isRealWait(status.waiting, now) ? { wait: status.waiting.kind } : {}),
      }
    })
}

/**
 * The free sessions as the rail's attention reads them (decision 055): a real wait is `needs you · permission` (or
 * `· question`), labelled with the session's name, so it pops up and chimes once by `chimes`; any other state is
 * `working`, and its key is `cleared`, so the next wait announces again.
 */
export function freeAttentionRows(rows: readonly TowerFreeRow[]): { rows: AttentionRow[]; cleared: Set<string> } {
  const cleared = new Set<string>()
  const attention = rows.map((row): AttentionRow => {
    if (row.state === 'waiting') return { key: row.key, label: row.name, group: 'needs you', glyph: '◆', status: `needs you · ${row.wait ?? 'question'}` }
    cleared.add(row.key)
    return { key: row.key, label: row.name, group: 'working', glyph: 'spinner', status: 'working' }
  })
  return { rows: attention, cleared }
}

/** A free session's row glyph: ◐ working, ◆ waiting for you, ○ idle. */
export function freeGlyph(state: TowerFreeRow['state']): string {
  return state === 'working' ? '◐' : state === 'waiting' ? '◆' : '○'
}

/** `main · 12m`: where it runs and how long its state has lasted. */
export function freeDetail(row: TowerFreeRow, now: number): string {
  return `${row.place} · ${formatAge(now - row.since)}`
}

function cut(text: string, width: number): string {
  const chars = Array.from(text)
  return chars.length <= width ? text : `${chars.slice(0, Math.max(0, width - 1)).join('')}…`
}

/**
 * A rail row's name and detail in `width` cells (a space between them): the name keeps its length while the place
 * keeps at least a few cells, then the place gives way, the age never.
 */
export function freeLineParts(row: TowerFreeRow, now: number, width: number): { name: string; detail: string } {
  const age = ` · ${formatAge(now - row.since)}`
  const room = width - 1 - age.length
  const nameWidth = Math.min(Array.from(row.name).length, Math.max(8, room - Math.min(Array.from(row.place).length, 12)))
  return { name: cut(row.name, nameWidth), detail: `${cut(row.place, Math.max(1, room - nameWidth))}${age}` }
}

/** A free Tower's header (decision 060): `Downloads · free`, `· <branch>` after it in a git folder. */
export function freeHeader(folder: string, branch: string | null): string {
  return `${folderName(folder)} · free${branch !== null ? ` · ${branch}` : ''}`
}

/** The folders `+ new session` offers: the main checkout first (the default), then the focused worktree when it is another. */
export type NewSessionChoice = { key: 'm' | 'w'; label: string; path: string }

export function newSessionChoices(main: string | null, selected: { label: string; path: string } | null, mainLabel = 'main checkout'): NewSessionChoice[] {
  const choices: NewSessionChoice[] = main !== null ? [{ key: 'm', label: mainLabel, path: main }] : []
  if (selected !== null && selected.path !== main) choices.push({ key: 'w', label: selected.label, path: selected.path })
  return choices
}
