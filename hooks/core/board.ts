// How the rail and the board lay out: the list's groups, what fits the pane's height, the detail's sizes.

import type { TowerHubRow, TowerIssue, TowerPullRequest, TowerRailRow, TowerTicketLocal } from '../../types/index'
import { formatAge, titleFromBranch } from './detail'
import { rowShape } from './nextStep'
import type { StepGroup } from './nextStep'

export type RailGroup = 'needs you' | 'working' | 'ready for the next step'

export const RAIL_GROUPS: readonly RailGroup[] = ['needs you', 'working', 'ready for the next step']

const GROUP_HEADINGS: Record<StepGroup, RailGroup> = { 'needs you': 'needs you', working: 'working', ready: 'ready for the next step' }

/** The heading of the ticket's step group. */
export function rowGroup(row: TowerRailRow, pullRequest: TowerPullRequest | null | undefined, blockedBy: readonly string[] = []): RailGroup {
  return GROUP_HEADINGS[rowShape(row, pullRequest, blockedBy).group]
}

export type CandidateGroup = 'assigned to you' | 'free'

export type MineTicket = { row: TowerRailRow; issue: TowerIssue | null; title: string }

export type BoardLists = {
  mine: { heading: RailGroup; tickets: MineTicket[] }[]
  candidates: { heading: CandidateGroup; issues: TowerIssue[] }[]
  counts: { mine: number; candidates: number }
}

/**
 * `mine`: every ticket with a worktree, with its Linear issue when one has the same identifier, by step group.
 * `candidates`: the Linear issues without a worktree, assigned to me first, then the free ones. Empty groups are left out.
 */
export function boardLists(
  rows: readonly TowerRailRow[],
  issues: readonly TowerIssue[],
  pullRequests: Record<string, TowerPullRequest | undefined> = {},
): BoardLists {
  const byId = new Map(issues.map(issue => [issue.id.toUpperCase(), issue]))
  const tickets = rows.map(row => {
    const issue = byId.get(row.key.toUpperCase()) ?? null
    return { row, issue, title: issue?.title || titleFromBranch(row.branch, row.key) }
  })
  const mine = RAIL_GROUPS.map(heading => ({
    heading,
    tickets: tickets.filter(ticket => rowGroup(ticket.row, pullRequests[ticket.row.key], ticket.issue?.blockedBy ?? []) === heading),
  })).filter(group => group.tickets.length > 0)
  const worktrees = new Set(rows.map(row => row.key.toUpperCase()))
  // A candidate is work to pick up: merged, done or cancelled is not one; started only when it is the person's (decision
  // 071, the old launcher's `· in progress`: begun elsewhere, no worktree here).
  const open = issues.filter(issue => !worktrees.has(issue.id.toUpperCase()) && !CLOSED.has(issue.stateType) && (issue.stateType !== 'started' || issue.assignedToMe))
  const candidates = [
    { heading: 'assigned to you' as const, issues: open.filter(issue => issue.assignedToMe) },
    { heading: 'free' as const, issues: open.filter(issue => !issue.assignedToMe) },
  ].filter(group => group.issues.length > 0)
  return { mine, candidates, counts: { mine: rows.length, candidates: open.length } }
}

const CLOSED = new Set(['completed', 'canceled'])

export type RailItem =
  | { kind: 'label'; text: string; first: boolean }
  | { kind: 'ticket'; row: TowerRailRow }
  | { kind: 'hub'; hub: TowerHubRow }

/** The list top to bottom: each non-empty group under its label, then the hub sessions under `other sessions`. */
export function railItems(
  rows: readonly TowerRailRow[],
  hubs: readonly TowerHubRow[],
  pullRequests: Record<string, TowerPullRequest | undefined>,
): RailItem[] {
  const items: RailItem[] = []
  const label = (text: string) => items.push({ kind: 'label', text, first: items.length === 0 })
  for (const group of boardLists(rows, [], pullRequests).mine) {
    label(group.heading)
    for (const ticket of group.tickets) items.push({ kind: 'ticket', row: ticket.row })
  }
  if (hubs.length > 0) {
    label('other sessions')
    for (const hub of hubs) items.push({ kind: 'hub', hub })
  }
  return items
}

/** A label takes a blank line above it unless it is the first; a row takes two lines. */
export function itemRows(item: RailItem): number {
  if (item.kind === 'label') return item.first ? 1 : 2
  return 2
}

function itemKey(item: RailItem): string | null {
  if (item.kind === 'ticket') return item.row.key
  if (item.kind === 'hub') return item.hub.key
  return null
}

/** The items with only the given rows, labels kept above the rows they head. */
function keepRows(items: readonly RailItem[], keep: ReadonlySet<string>): RailItem[] {
  const out: RailItem[] = []
  let label: RailItem | null = null
  for (const item of items) {
    if (item.kind === 'label') {
      label = item
      continue
    }
    if (!keep.has(itemKey(item) ?? '')) continue
    if (label !== null) {
      out.push({ kind: 'label', text: label.text, first: out.length === 0 })
      label = null
    }
    out.push(item)
  }
  return out
}

function totalRows(items: readonly RailItem[]): number {
  return items.reduce((sum, item) => sum + itemRows(item), 0)
}

/**
 * The items that fit `height` rows. When all do not, the first rows that fit with a `+<n> more` line
 * under them (`more`), the centre's row always among them.
 */
export function fitItems(items: readonly RailItem[], height: number, centre: string | null): { items: RailItem[]; more: number } {
  if (totalRows(items) <= height) return { items: [...items], more: 0 }
  const keys = items.map(itemKey).filter((key): key is string => key !== null)
  const keep = new Set<string>()
  if (centre !== null && keys.includes(centre)) keep.add(centre)
  for (const key of keys) {
    if (keep.has(key)) continue
    const tried = new Set(keep).add(key)
    if (totalRows(keepRows(items, tried)) + 1 > height) continue
    keep.add(key)
  }
  return { items: keepRows(items, keep), more: keys.length - keep.size }
}

/** The short dim figure at the end of a row's first line: running agents, else the live session's age. */
export function rowFigure(row: TowerRailRow, local: TowerTicketLocal | undefined, now: number): string {
  if (row.agents > 0) return `${row.agents} ${row.agents === 1 ? 'agent' : 'agents'}`
  if (row.session === null || local === undefined || local.sessions.length === 0) return ''
  const since = Math.max(...local.sessions.map(session => session.since))
  return formatAge(now - since)
}

/** `me/tkt-21-printer-offline` → `tkt-21-printer-offline`. */
export function branchWithoutOwner(branch: string): string {
  return branch.replace(/^[^/]+\//, '')
}

/** How many rows a text takes wrapped at `width`. */
export function wrappedRows(text: string, width: number): number {
  const w = Math.max(1, width)
  return text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).length / w)), 0)
}

/** The first lines of the plan that fit `rows` rows at `width`; a last line `…` when some are left out. */
export function cutPlan(plan: string, width: number, rows: number): string {
  if (rows <= 0) return ''
  if (wrappedRows(plan, width) <= rows) return plan
  const kept: string[] = []
  let used = 0
  for (const line of plan.split('\n')) {
    const need = wrappedRows(line, width)
    if (used + need > rows - 1) break
    kept.push(line)
    used += need
  }
  return [...kept, '…'].join('\n')
}

/** `count` segment widths that, with one space between them, fill `width`. */
export function barSegments(width: number, count: number): number[] {
  const room = Math.max(count, width - (count - 1))
  const base = Math.floor(room / count)
  return Array.from({ length: count }, (_, index) => base + (index < room % count ? 1 : 0))
}

/** The board's columns: the list (44..60, about 27% of the screen), the side (42 when it fits) and the main detail. */
export function boardColumns(bodyColumns: number): { list: number; main: number; side: number } {
  const list = Math.max(44, Math.min(60, Math.round(bodyColumns * 0.27)))
  const rest = bodyColumns - list - 1 - 4
  const side = rest >= 42 + 4 + 40 ? 42 : 0
  return { list, main: rest - (side > 0 ? side + 4 : 0), side }
}

/** The id column: as wide as the longest id (9..14 cells) plus one space. */
export function idWidth(ids: readonly string[]): number {
  return Math.min(14, Math.max(9, ...ids.map(id => Array.from(id).length))) + 1
}

/** A row's first line in cells: marker 2, glyph 2, the id in `idCells` (cut with `…` past 14), the title cut with `…`, the figure right-aligned in 6. */
export function rowCells(width: number, id: string, title: string, figure: string, idCells = 10): { id: string; title: string; figure: string } {
  const room = Math.max(0, width - 2 - 2 - idCells - 6)
  const cut = Array.from(title).length > room ? Array.from(title).slice(0, Math.max(0, room - 1)).join('') + '…' : title
  const idChars = Array.from(id)
  const idText = idChars.length > idCells - 1 ? idChars.slice(0, idCells - 2).join('') + '…' : id
  return { id: idText.padEnd(idCells), title: cut.padEnd(room), figure: figure.slice(-6).padStart(6) }
}

/**
 * The board list's visible slice: a heading takes 1 row, a ticket 2, and a dim `↑ n more` / `↓ n more` line
 * takes 1 row at the top / bottom when tickets are cut there. The window starts at `start` (the previous one)
 * and moves only as far as the focused item needs.
 */
export function listWindow<T extends { kind: 'heading' | 'ticket' }>(
  items: readonly T[],
  focusedIndex: number,
  rows: number,
  start = 0,
): { items: T[]; start: number; moreAbove: number; moreBelow: number } {
  const size = (item: T) => (item.kind === 'heading' ? 1 : 2)
  const tickets = (from: number, to: number) => items.slice(from, to).filter(item => item.kind === 'ticket').length
  const focus = Math.max(0, Math.min(focusedIndex, items.length - 1))
  const fill = (from: number) => {
    let budget = rows - (tickets(0, from) > 0 ? 1 : 0)
    let end = from
    while (end < items.length && size(items[end] as T) <= budget) {
      budget -= size(items[end] as T)
      end++
    }
    if (tickets(end, items.length) > 0) {
      while (budget < 1 && end > from) {
        end--
        budget += size(items[end] as T)
      }
    }
    return end
  }
  let from = Math.max(0, Math.min(start, focus))
  if (from === focus && from > 0 && items[from - 1]?.kind === 'heading') from--
  let end = fill(from)
  while (end <= focus && from < focus) end = fill(++from)
  return { items: items.slice(from, end), start: from, moreAbove: tickets(0, from), moreBelow: tickets(end, items.length) }
}

export type DescriptionLine =
  | { kind: 'lead'; label: string; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'check'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'more'; text: string }

/** `[text](<url>)` and `[text](url)` → `text`; `**` dropped. */
export function plainText(text: string): string {
  return text.replace(/\[([^\]]*)\]\(<?[^)>]*>?\)/g, '$1').replace(/\*\*/g, '')
}

/**
 * Word wrap at `width`: the first row has `first` cells less, every next row `indent` cells less.
 * A word is never broken: one longer than its row (a URL) is cut with `…`.
 */
export function wrapWords(text: string, width: number, first = 0, indent = 0): string[] {
  const out: string[] = []
  let row = ''
  const room = () => Math.max(1, width - (out.length === 0 ? first : indent))
  const len = (value: string) => Array.from(value).length
  for (const word of text.split(/\s+/).filter(part => part !== '')) {
    const joined = row === '' ? word : `${row} ${word}`
    if (len(joined) <= room()) {
      row = joined
      continue
    }
    if (row !== '') out.push(row)
    row = len(word) <= room() ? word : Array.from(word).slice(0, room() - 1).join('') + '…'
  }
  out.push(row)
  return out
}

/** One source line as rows of at most `width` cells; continuation rows keep the item's indent. */
function descriptionRows(raw: string, width: number): DescriptionLine[] {
  const line = raw.trim()
  if (line === '') return []
  const lead = /^\*\*([^*]+?\.)\*\*\s*(.*)$/.exec(line)
  if (lead !== null) {
    const label = lead[1] ?? ''
    const [head = '', ...rest] = wrapWords(plainText(lead[2] ?? ''), width, Array.from(label).length + 1)
    return [{ kind: 'lead', label, text: head }, ...rest.map(text => ({ kind: 'text' as const, text }))]
  }
  const heading = /^(?:\*\*([^*]+)\*\*|#+\s*(.+))$/.exec(line)
  if (heading !== null) return [{ kind: 'heading', text: wrapWords(plainText(heading[1] ?? heading[2] ?? '').replace(/:$/, ''), width)[0] ?? '' }]
  const check = /^[-*]\s*\[[ xX]?\]\s*(.*)$/.exec(line)
  if (check !== null) {
    const [head = '', ...rest] = wrapWords(plainText(check[1] ?? ''), width, 2, 2)
    return [{ kind: 'check', text: head }, ...rest.map(text => ({ kind: 'text' as const, text: `  ${text}` }))]
  }
  const item = /^(\d+[.)]|[-*+])\s+/.exec(line)
  const indent = item !== null ? Array.from(item[0]).length : 0
  const [head = '', ...rest] = wrapWords(plainText(line), width, 0, indent)
  return [{ kind: 'text', text: head }, ...rest.map(text => ({ kind: 'text' as const, text: ' '.repeat(indent) + text }))]
}

/** The Linear description as the board draws it, one entry per screen row, cut to `rows` with a last `… n more lines`. */
export function descriptionLines(description: string, width: number, rows: number): DescriptionLine[] {
  const all = description.split('\n').flatMap(raw => descriptionRows(raw, Math.max(1, width)))
  if (all.length <= rows) return all
  const kept = all.slice(0, Math.max(0, rows - 1))
  return [...kept, { kind: 'more', text: `… ${all.length - kept.length} more lines` }]
}

/**
 * The home inspector's `asks`: the description's first `rows` lines as plain text, heading-only lines left out
 * (a heading, a single word, or a line ending in `:` with no sentence), the last one ending in `…` when text was cut.
 */
export function asksLines(description: string, width: number, rows: number): string[] {
  const headingOnly = (raw: string) => {
    const text = plainText(raw.trim().replace(/^#+\s*/, '').replace(/\*\*/g, '')).trim()
    return !/\s/.test(text) || (text.endsWith(':') && !/[.!?]\s/.test(text))
  }
  const all = description.split('\n')
    .filter(raw => raw.trim() !== '' && !headingOnly(raw))
    .flatMap(raw => descriptionRows(raw, Math.max(1, width)))
    .filter(line => line.kind !== 'heading')
    .map(line => ('label' in line ? `${line.label} ${line.text}` : plainText(line.text)))
  if (all.length <= rows) return all
  const kept = all.slice(0, Math.max(0, rows))
  const last = Array.from(kept[kept.length - 1] ?? '')
  if (kept.length > 0) kept[kept.length - 1] = `${last.slice(0, Math.max(0, width - 2)).join('').trimEnd()} …`
  return kept
}

/** `12345` → `12k`, `900` → `900`. */
export function tokenCount(tokens: number): string {
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens)
}

/** The models line: each family that used tokens, largest first, as `[name, count]`. */
export function modelsLine(tokens: Record<string, number> | null | undefined): [string, string][] {
  return Object.entries(tokens ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => [name, tokenCount(count)])
}

const PRIORITY: Record<TowerIssue['priority'], string> = { none: 'none', urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }

/** Neither the person's nor anyone else's. */
function unassigned(issue: TowerIssue): boolean {
  return !issue.assignedToMe && issue.assigneeName === undefined
}

/** A candidate's second line: `Next · High`, `Backlog · bug · unassigned`. */
export function candidateStatus(issue: TowerIssue): string {
  return [issue.stateName, issue.priority !== 'none' ? PRIORITY[issue.priority] : '', ...issue.labels, unassigned(issue) ? 'unassigned' : '']
    .filter(part => part !== '')
    .join(' · ')
}

/** A candidate card's mark after its id: `mine` in the accent for the person's own ticket, someone else's short name dim, none when free. */
export function candidateMark(issue: TowerIssue): { text: string; tone: 'accent' | 'dim' } | null {
  if (issue.assignedToMe) return { text: 'mine', tone: 'accent' }
  if (issue.assigneeName !== undefined) return { text: issue.assigneeName, tone: 'dim' }
  return null
}

/** The detail's meta line: `In Progress · story TKT-1300 Home dashboard`. */
export function issueMeta(issue: TowerIssue): string {
  const parts = [issue.stateName]
  if (!issue.assignedToMe && issue.priority !== 'none') parts.push(PRIORITY[issue.priority])
  parts.push(issue.story !== null ? `story ${issue.story.id} ${issue.story.title}` : 'no story')
  if (unassigned(issue)) parts.push('unassigned')
  return parts.join(' · ')
}

/** The detail's meta tail for a ticket blocked in Linear: `blocked by TKT-1234 <its title when loaded>`, `+n` when more. */
export function blockedMeta(issue: TowerIssue, issues: readonly TowerIssue[]): string | null {
  const first = issue.blockedBy[0]
  if (first === undefined) return null
  const title = issues.find(one => one.id.toUpperCase() === first.toUpperCase())?.title ?? ''
  const more = issue.blockedBy.length > 1 ? `+${issue.blockedBy.length - 1}` : ''
  return [`blocked by ${first}`, title, more].filter(part => part !== '').join(' ')
}

/** The `linear` panel of a candidate. */
export function linearLines(issue: TowerIssue): string[] {
  return [
    `state ${issue.stateName}`,
    `priority ${PRIORITY[issue.priority]}`,
    `labels ${issue.labels.length > 0 ? issue.labels.join(', ') : 'none'}`,
    `story ${issue.story !== null ? `${issue.story.id} ${issue.story.title}` : 'none'}`,
    ...(issue.blockedBy.length > 0 ? [`blocked by ${issue.blockedBy.join(', ')}`] : []),
    ...(issue.url !== '' ? [issue.url] : []),
  ]
}

/** The board row's dim figure: the age of the live session, else nothing. */
export function boardFigure(local: TowerTicketLocal | undefined, now: number): string {
  if (local === undefined || local.sessions.length === 0) return ''
  return formatAge(now - Math.max(...local.sessions.map(session => session.since)))
}
