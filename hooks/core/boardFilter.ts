import { renderTemplate, toRegExp, type LinearTickets } from './config'

/** What the person submits in the rail session's prompt box: tower's own command line, never the model's. */
export type RailInput =
  | { kind: 'ticket'; id: string }
  | { kind: 'filter'; text: string }
  | { kind: 'clear' }
  | { kind: 'passthrough' }

/**
 * A ticket id by the tickets' `inputPattern` and `idTemplate` (e.g. `TKT-2426`, `tkt-2426` or `2426` is
 * `TKT-2426`); `/…` is a slash command, Claude Code's; an empty prompt clears the filter; any other text is a filter.
 */
export function parseRailInput(text: string, ids: Pick<LinearTickets, 'inputPattern' | 'idTemplate'> | null): RailInput {
  const trimmed = text.trim()
  if (trimmed.startsWith('/')) return { kind: 'passthrough' }
  if (trimmed === '') return { kind: 'clear' }
  const id = ids === null ? null : toRegExp(ids.inputPattern).exec(trimmed)
  if (ids !== null && id?.[1] !== undefined) return { kind: 'ticket', id: renderTemplate(ids.idTemplate, { n: id[1] }) }
  return { kind: 'filter', text: trimmed }
}

/** The rows whose id or title contains the text, case-insensitive; an empty text keeps them all. */
export function filterRows<T>(rows: readonly T[], text: string, fields: (row: T) => readonly string[]): T[] {
  const needle = text.trim().toLowerCase()
  if (needle === '') return [...rows]
  return rows.filter(row => fields(row).some(field => field.toLowerCase().includes(needle)))
}

/**
 * An edit of the rail's prompt box while the cards hold the keys, into an empty box: a key the board does not take,
 * which the engine passed on to the box (a stray key). After Escape (the box holds the keys) it is typing.
 */
export function strayEdit(hadKeys: boolean, previousText: string, nextText: string): boolean {
  return hadKeys && previousText === '' && nextText !== ''
}
