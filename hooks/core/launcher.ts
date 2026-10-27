// The skills launcher of the rail: which commands it lists, in what order, and what pressing one does.

import { stepCommand, ticketValues, type WorkflowStep } from './config'
import type { Skill, SkillWhere } from './profile'

/** One row of the launcher: a profile skill, or another command of the repository (no model). */
export type LauncherItem = { name: string; what: string; where: SkillWhere; model: string | null; effort: string | null }

/** The part of `$.command.list()` the launcher reads. */
export type ListedCommand = { name: string; description: string; source: string; plugin?: string }

export const MAX_ROWS = 12

/** The ticket the launcher works for: the focused one, else the one in the centre; no first-row fallback. */
export function contextTicket<Row extends { key: string }>(rows: readonly Row[], focused: string | null, centre: string | null): Row | null {
  return rows.find(row => row.key === focused) ?? rows.find(row => row.key === centre) ?? null
}

/** The profile skills present in this repository, then the repository's or user's other commands. */
/** The names that could go under `other skills here`, before the check that they belong to the repository. */
export function otherCandidates(skills: readonly Skill[], commands: readonly ListedCommand[]): string[] {
  const known = new Set(skills.map(skill => skill.name))
  return commands.filter(command => command.source === 'user' && !known.has(command.name)).map(command => command.name)
}

/** `repoNames`: the commands that belong to the repository; only those go under `other skills here`. */
export function launcherItems(
  skills: readonly Skill[],
  commands: readonly ListedCommand[],
  repoNames: ReadonlySet<string> | null = null,
): { skills: LauncherItem[]; other: LauncherItem[] } {
  const own = commands.filter(command => command.source === 'user')
  const names = new Set(own.map(command => command.name))
  const known = new Set(skills.map(skill => skill.name))
  return {
    skills: skills.filter(skill => names.has(skill.name)).map(skill => ({ ...skill })),
    other: own
      .filter(command => !known.has(command.name) && (repoNames === null || repoNames.has(command.name)))
      .map(command => ({ name: command.name, what: command.description, where: 'ticket' as const, model: null, effort: null })),
  }
}

export function canRun(item: LauncherItem, ticket: string | null): boolean {
  return item.where === 'hub' || ticket !== null
}

/** Case-insensitive substring of the name or of `what`. */
export function filterItems(items: readonly LauncherItem[], filter: string): LauncherItem[] {
  const needle = filter.trim().toLowerCase()
  return items.filter(item => item.name.toLowerCase().includes(needle) || item.what.toLowerCase().includes(needle))
}

/** The skills that can run now first, each group in its own order. */
export function orderItems(items: readonly LauncherItem[], ticket: string | null): LauncherItem[] {
  return [...items.filter(item => canRun(item, ticket)), ...items.filter(item => !canRun(item, ticket))]
}

/** What the launcher draws for a filter: both groups filtered and ordered, at most `max` rows in all. */
export function visibleItems(
  groups: { skills: LauncherItem[]; other: LauncherItem[] },
  filter: string,
  ticket: string | null,
  max: number = MAX_ROWS,
): { skills: LauncherItem[]; other: LauncherItem[] } {
  const skills = orderItems(filterItems(groups.skills, filter), ticket).slice(0, max)
  const other = orderItems(filterItems(groups.other, filter), ticket).slice(0, max - skills.length)
  return { skills, other }
}

/** The rows that fit a pane `bodyRows` lines tall: two lines each, after the context line, the field, the group label and `back`. */
export function launcherRows(bodyRows: number | undefined): number {
  return bodyRows === undefined ? MAX_ROWS : Math.max(1, Math.min(MAX_ROWS, Math.floor((bodyRows - 4) / 2)))
}

/** How a session is started for a skill: the slash command as its first prompt, on the skill's model. */
export type SkillStart = { prompt: string; model: string | null; effort: string | null }

/**
 * - `hub`: start or show the hub session of the skill.
 * - `send`: show the ticket's live session and send it the command.
 * - `startTicket`: start the ticket's session with the skill as its first prompt.
 * - `none`: the skill cannot run now.
 */
export type LaunchPlan =
  | { kind: 'hub'; key: string; start: SkillStart }
  | { kind: 'send'; ticket: string; command: string }
  | { kind: 'startTicket'; ticket: string; start: SkillStart }
  | { kind: 'none' }

export function planLaunch(
  item: LauncherItem,
  ticket: string | null,
  ticketLive: boolean,
  modelIds: Readonly<Record<string, string>>,
): LaunchPlan {
  if (!canRun(item, ticket)) return { kind: 'none' }
  const start: SkillStart = {
    prompt: `/${item.name}`,
    model: item.model === null ? null : (modelIds[item.model] ?? item.model),
    effort: item.effort,
  }
  if (item.where === 'hub') return { kind: 'hub', key: item.name, start }
  if (ticket === null) return { kind: 'none' }
  return ticketLive ? { kind: 'send', ticket, command: item.name } : { kind: 'startTicket', ticket, start }
}

/** The dim tail of a row: ` · <where> · <model>[ · <effort>]`. */
export function itemTail(item: LauncherItem): string {
  return ' · ' + [item.where, ...(item.model !== null ? [item.model] : []), ...(item.effort !== null ? [item.effort] : [])].join(' · ')
}

/**
 * A ticket whose work has not started (no state file), or whose folder has no earlier
 * Claude conversation, opens with the workflow's start step (`start`, config workflow.steps.start;
 * e.g. `/start-ticket <TICKET>`) as its first prompt, on the skill's model and effort (the
 * skill resumes from `.work/state.json`); any other ticket opens a plain session that continues
 * its conversation.
 */
export function ticketStart(
  ticket: string,
  phase: string,
  start: WorkflowStep | undefined,
  skills: readonly Skill[],
  modelIds: Readonly<Record<string, string>>,
  hasConversation = true,
): SkillStart | null {
  if (phase !== 'not started' && hasConversation) return null
  const skill = start !== undefined ? skills.find(candidate => candidate.name === start.skill) : undefined
  const prompt = stepCommand(start, ticketValues(ticket))
  if (skill === undefined || prompt === null) return null
  return { prompt, model: skill.model === null ? null : (modelIds[skill.model] ?? skill.model), effort: skill.effort }
}
