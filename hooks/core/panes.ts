// The tmux layout: which work session (a ticket's or a hub's) sits in the centre, and what opening one does.

import { theme } from './theme'
import type { ThemeName } from './theme'

/** One line of `tmux list-panes -a -F PANE_LISTING_FORMAT`. */
export type TmuxPane = { id: string; window: string; role: string; ticket: string; tag: string }

export const PANE_LISTING_FORMAT = '#{pane_id}\t#{window_id}\t#{@tower_role}\t#{@tower_ticket}\t#{@tower_tag}'

export function parsePaneListing(output: string): TmuxPane[] {
  const panes: TmuxPane[] = []
  for (const line of output.split('\n')) {
    const [id, window, role = '', ticket = '', tag = ''] = line.split('\t')
    if (id && window) panes.push({ id, window, role, ticket, tag })
  }
  return panes
}

/**
 * A session's TOWER_TAG, also its pane's `@tower_tag`: the role, a dash and 8 hex digits
 * taken from `seed`. It names the pane when TMUX_PANE is missing from the session.
 */
export function towerTag(role: string, seed: number): string {
  return `${role}-${(Math.floor(seed) % 0x100000000).toString(16).padStart(8, '0')}`
}

/** The pane carrying `tag` in `@tower_tag`. */
export function paneWithTag(panes: TmuxPane[], tag: string): string | null {
  if (tag === '') return null
  return panes.find(pane => pane.tag === tag)?.id ?? null
}

/** The roles of the sessions that take the centre: a ticket's, a hub's (a skill in the main checkout), or a free one (decision 055). */
export type WorkRole = 'ticket' | 'hub' | 'free'

/** A work session: its role and its key (the ticket, the skill name of a hub, a free session's `free-<hex>`), both also pane options. */
export type WorkTarget = { role: WorkRole; key: string }

export function isWorkRole(role: string): role is WorkRole {
  return role === 'ticket' || role === 'hub' || role === 'free'
}

/** The work pane beside the rail, in the rail's window. */
export function centrePane(panes: TmuxPane[], railPane: string, railWindow: string): TmuxPane | null {
  return panes.find(pane => pane.window === railWindow && pane.id !== railPane && isWorkRole(pane.role)) ?? null
}

/**
 * - `select`: the target is already in the centre.
 * - `split`: no centre and no session yet; create it beside the rail.
 * - `swap`: bring the target's parked pane into the centre.
 * - `createThenSwap`: create the session in a hidden window, then swap.
 * - `join`: no centre (it ended); move the parked pane beside the rail.
 */
export type OpenPlan =
  | { kind: 'select'; pane: string }
  | { kind: 'split' }
  | { kind: 'swap'; pane: string; centre: string; others: string[]; centreOthers: string[] }
  | { kind: 'createThenSwap'; centre: string; centreOthers: string[] }
  | { kind: 'join'; pane: string; others: string[] }

/**
 * A group is a work pane and the panes beside it in its window (a review session under it).
 * `others` travel with the target out of its parked window; `centreOthers` follow the centre
 * into the window the target leaves.
 */
export function planOpen(panes: TmuxPane[], railPane: string, railWindow: string, target: WorkTarget): OpenPlan {
  const isTarget = (pane: TmuxPane) => pane.role === target.role && pane.ticket === target.key
  const centre = centrePane(panes, railPane, railWindow)
  if (centre !== null && isTarget(centre)) return { kind: 'select', pane: centre.id }
  const parked = panes.find(pane => isTarget(pane) && pane.window !== railWindow)
  const others = parked === undefined ? [] : panes.filter(pane => pane.window === parked.window && pane.id !== parked.id).map(pane => pane.id)
  const centreOthers = centre === null ? [] : panes.filter(pane => pane.window === railWindow && pane.id !== railPane && pane.id !== centre.id).map(pane => pane.id)
  if (centre === null) return parked === undefined ? { kind: 'split' } : { kind: 'join', pane: parked.id, others }
  if (parked === undefined) return { kind: 'createThenSwap', centre: centre.id, centreOthers }
  return { kind: 'swap', pane: parked.id, centre: centre.id, others, centreOthers }
}

/** The review session of `ticket`, wherever it is. */
export function reviewPane(panes: TmuxPane[], ticket: string): TmuxPane | null {
  return panes.find(pane => pane.role === 'review' && pane.ticket === ticket) ?? null
}

/** The tmux border title of a review pane. */
export function reviewTitle(ticket: string, pr: number): string {
  return `${ticket} · review · PR #${pr}`
}

/** Joining a pane of a group: a review session goes under the work pane, anything else beside it. */
export function joinDirection(role: string): '-v' | '-h' {
  return role === 'review' ? '-v' : '-h'
}

/** `~/.claude/projects/<encoded>`: Claude Code's folder of earlier sessions for a working directory. */
export function claudeProjectDir(home: string, worktreePath: string): string {
  return `${home}/.claude/projects/${worktreePath.replace(/[^a-zA-Z0-9]/g, '-')}`
}

export function hasEarlierSession(fileNames: string[]): boolean {
  return fileNames.some(name => name.endsWith('.jsonl'))
}

/** Whether the prompt runs the workflow's start step (`startSkill`, config workflow.steps.start; e.g. /start-ticket). */
function isStartPrompt(prompt: string, startSkill: string | null): boolean {
  return startSkill !== null && prompt.startsWith(`/${startSkill}`)
}

/**
 * A ticket session continues its earlier conversation, except a ticket not started yet (its first prompt
 * is the start step, /start-ticket): that one starts fresh. A folder with a state file always continues (decision 051).
 */
export function resumesConversation(role: string, start: { prompt: string } | null, hasEarlier: boolean, hasStateFile: boolean, startSkill: string | null): boolean {
  if (role !== 'ticket' || !hasEarlier) return false
  return hasStateFile || start === null || !isStartPrompt(start.prompt, startSkill)
}

/** Decision 051: a ticket folder with an earlier conversation and a state file never opens with the start step; it continues. */
export function ticketOpenStart<T extends { prompt: string }>(start: T | null, hasEarlier: boolean, hasStateFile: boolean, startSkill: string | null): T | null {
  return start !== null && isStartPrompt(start.prompt, startSkill) && hasEarlier && hasStateFile ? null : start
}

/** The command that starts a session for a skill: `prompt` (the slash command) is its first prompt; `resume` continues the earlier conversation. */
export function skillCommand(pluginDir: string, model: string | null, effort: string | null, prompt: string, resume = false, settings: string | null = null): string[] {
  return ['claude', '--plugin-dir', pluginDir, ...(resume ? ['--continue'] : []), ...(model !== null ? ['--model', model] : []), ...(effort !== null ? ['--effort', effort] : []), ...settingsArgs(settings), prompt]
}

/** `model` (TOWER_SESSION_MODEL of the rail, or a free session's routing, decision 056) and `effort` start the session on them. */
export function claudeCommand(pluginDir: string, resume: boolean, model: string | null = null, settings: string | null = null, effort: string | null = null): string[] {
  return ['claude', '--plugin-dir', pluginDir, ...(resume ? ['--continue'] : []), ...(model !== null ? ['--model', model] : []), ...(effort !== null ? ['--effort', effort] : []), ...settingsArgs(settings)]
}

/** The commands go to tmux as argv (one word each, no shell), so the JSON needs no quoting. */
function settingsArgs(settings: string | null): string[] {
  return settings !== null ? ['--settings', settings] : []
}

/** The Claude Code theme a mod theme selects: `themes/<name>.json` by plugin name and file slug, or null (the terminal's own). */
export function modTheme(name: ThemeName): string | null {
  return theme(name).claudeTheme
}

/**
 * The `--settings` JSON of a session the mod starts: the Claude Code theme of the mod theme `theme`
 * (none for `terminal`), the main-screen layout for the rail (an inline pane may take every free row
 * there), tower's status line, and the project configuration's allowed rules `allow` when it has any (decision 080;
 * Claude Code adds them to the rules of its other settings).
 */
export function sessionSettings({ role, pluginDir, theme: name, allow = [] }: { role: string; pluginDir: string; theme: ThemeName; allow?: readonly string[] }): string {
  const claudeTheme = modTheme(name)
  return JSON.stringify({
    ...(claudeTheme !== null ? { theme: claudeTheme } : {}),
    ...(role === 'rail' ? { tui: 'default' } : {}),
    statusLine: { type: 'command', command: `${pluginDir}/bin/tower-statusline`, padding: 0, refreshInterval: 1 },
    disableAgentView: true,
    ...(allow.length > 0 ? { permissions: { allow: [...allow] } } : {}),
  })
}

/** Back to the board: the centre pane leaves the rail's window into a parked window, the rest of its group joins it there. */
export type BackPlan = { centre: string; others: string[] } | null

export function planBack(panes: TmuxPane[], railPane: string, railWindow: string): BackPlan {
  const centre = centrePane(panes, railPane, railWindow)
  if (centre === null) return null
  const others = panes.filter(pane => pane.window === railWindow && pane.id !== railPane && pane.id !== centre.id).map(pane => pane.id)
  return { centre: centre.id, others }
}
