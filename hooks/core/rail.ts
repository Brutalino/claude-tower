// What the rail draws: rows from worktrees, and the text of each row.

import type { TowerPullRequest, TowerRailRow } from '../../types/index'
import { rowShape } from './nextStep'
import type { TicketIdPattern } from './config'
import type { Theme } from './theme'
import type { WorkSummary } from './workState'
import type { WorktreeEntry } from './worktrees'
import { worktreeKey } from './worktrees'

export function railRow(
  entry: WorktreeEntry,
  work: WorkSummary,
  session: 'working' | 'idle' | null,
  idPattern: TicketIdPattern | null,
): TowerRailRow {
  return {
    key: worktreeKey(entry, idPattern),
    branch: entry.branch ?? entry.head.slice(0, 7),
    path: entry.path,
    phase: work.phase,
    next: work.next,
    hasPlan: work.hasPlan,
    blockers: work.blockers,
    session,
    agents: 0,
  }
}

export type RowGlyph = { glyph: '◆' | '◐' | '✓' | '○' | '⊘'; color: string | undefined; dim: boolean }

/** The ticket step's glyph; the spinner draws as `◐`, a blocked ticket's `⊘` in the error colour. */
export function rowGlyph(row: TowerRailRow, colours: Theme, pullRequest?: TowerPullRequest | null, blockedBy: readonly string[] = []): RowGlyph {
  const glyph = rowShape(row, pullRequest, blockedBy).glyph
  if (glyph === '⊘') return { glyph: '⊘', color: colours.error, dim: false }
  if (glyph === '◆') return { glyph: '◆', color: colours.needsYou, dim: false }
  if (glyph === 'spinner') return { glyph: '◐', color: colours.working, dim: false }
  if (glyph === '✓') return { glyph: '✓', color: colours.done, dim: false }
  return { glyph: '○', color: undefined, dim: true }
}

export type RowMarker = { text: '▶' | '·' | ' '; color: string | undefined; dim: boolean }

/** `▶` for the ticket in the centre (or being opened), a dim `·` for a ticket with no session yet. */
export function rowMarker(row: TowerRailRow, centreKey: string | null, openingKey: string | null, colours: Theme): RowMarker {
  if (row.key === centreKey || row.key === openingKey) return { text: '▶', color: colours.accent, dim: false }
  if (row.session === null) return { text: '·', color: undefined, dim: true }
  return { text: ' ', color: undefined, dim: false }
}

/** A hub session's row (always live): the ticket rows' glyph and marker, from its state alone. */
export function hubGlyph(state: 'working' | 'idle', colours: Theme): RowGlyph {
  return state === 'working' ? { glyph: '◐', color: colours.working, dim: false } : { glyph: '○', color: undefined, dim: true }
}

export function hubMarker(key: string, centreKey: string | null, openingKey: string | null, colours: Theme): RowMarker {
  return key === centreKey || key === openingKey ? { text: '▶', color: colours.accent, dim: false } : { text: ' ', color: undefined, dim: false }
}

/** ` · 2 agents` after a ticket's phase while its session runs subagents. */
export function agentsSuffix(running: number): string {
  if (running <= 0) return ''
  return ` · ${running} ${running === 1 ? 'agent' : 'agents'}`
}

export function truncateEnd(text: string, width: number): string {
  if (width <= 0) return ''
  const chars = Array.from(text)
  if (chars.length <= width) return text
  return chars.slice(0, Math.max(0, width - 1)).join('') + '…'
}
