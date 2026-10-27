// Decision 070: the tickets hidden from the rail (`x` on a ticket with work, or started, and no live session): their
// worktree and branch stay; their keys are kept in `<state dir>/hidden-<project id>.json`, `{ version: 1, keys: [...] }`.
// The candidates (`a: candidates`, decision 071) list them under HIDDEN; picking one takes it off the list.

import { projectId } from './config'

/** `<state dir>/hidden-<project id>.json`. */
export function hiddenPath(state: string, mainCheckout: string): string {
  return `${state.replace(/\/+$/, '')}/hidden-${projectId(mainCheckout)}.json`
}

/** The keys a hidden list's file holds, upper-cased, once each; a missing, older or unreadable file holds none. */
export function parseHidden(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 1) return []
  const keys = (raw as { keys?: unknown }).keys
  if (!Array.isArray(keys)) return []
  return [...new Set(keys.filter((key): key is string => typeof key === 'string' && key.trim() !== '').map(key => key.trim().toUpperCase()))]
}

/** The file's text for `keys`, sorted. */
export function hiddenText(keys: readonly string[]): string {
  return `${JSON.stringify({ version: 1, keys: [...new Set(keys.map(key => key.toUpperCase()))].sort() }, null, 2)}\n`
}

/** The work a worktree holds, for the hide question: `2 changed files, 1 commit only here`. */
export function workText(work: { changed: number; commits: number }): string {
  const parts = [
    ...(work.changed > 0 ? [`${work.changed} changed ${work.changed === 1 ? 'file' : 'files'}`] : []),
    ...(work.commits > 0 ? [`${work.commits} ${work.commits === 1 ? 'commit' : 'commits'} only here`] : []),
  ]
  return parts.join(', ')
}
