import { expect, test } from 'claude-code/testing'

import { contextTicket, filterItems, itemTail, launcherItems, launcherRows, MAX_ROWS, orderItems, otherCandidates, planLaunch, ticketStart as ticketStartWith, visibleItems } from '../hooks/core/launcher'
import type { LauncherItem } from '../hooks/core/launcher'
import { planOpen, skillCommand } from '../hooks/core/panes'
import { parseWorkState } from '../hooks/core/workState'
import { LINEAR_CONFIG } from './linearConfig'
import { PROFILE } from './linearConfig'

const ticketStart = (ticket: string, phase: string, skills: Parameters<typeof ticketStartWith>[3], modelIds: Readonly<Record<string, string>>, hasConversation = true) => ticketStartWith(ticket, phase, LINEAR_CONFIG.workflow.steps.start, skills, modelIds, hasConversation)

const MODELS = PROFILE.modelIds
const user = (name: string, description = `${name} skill`) => ({ name, description, source: 'user' })
const COMMANDS = [
  user('shape'), user('open-pr'), user('echo-test', 'Replies with a fixed word'),
  { name: 'compact', description: 'built in', source: 'builtin' },
  { name: 'deck', description: 'deck', source: 'plugin', plugin: 'tower' },
]

test('the profile skills: unique names, known models, the two places', () => {
  const names = PROFILE.skills.map(skill => skill.name)
  expect(new Set(names).size).toBe(names.length)
  expect(names).toContain('shape')
  expect(names).toContain('review')
  for (const skill of PROFILE.skills) {
    expect(['ticket', 'hub']).toContain(skill.where)
    expect(Object.keys(MODELS)).toContain(skill.model)
    expect(skill.effort === null || ['low', 'medium', 'high', 'xhigh', 'max'].includes(skill.effort)).toBe(true)
    expect(skill.what.length).toBeGreaterThan(0)
  }
  expect(MODELS).toEqual({ fable: 'claude-fable-5-1', opus: 'opus', sonnet: 'sonnet', haiku: 'haiku' })
})

test('lists the profile skills present here, then the other repository commands', () => {
  const items = launcherItems(PROFILE.skills, COMMANDS)
  expect(items.skills.map(item => item.name)).toEqual(['shape', 'open-pr'])
  expect(items.other).toEqual([{ name: 'echo-test', what: 'Replies with a fixed word', where: 'ticket', model: null, effort: null }])
})

const hub: LauncherItem = { name: 'shape', what: 'Shape an idea', where: 'hub', model: 'fable', effort: 'xhigh' }
const onTicket: LauncherItem = { name: 'open-pr', what: 'Open the draft PR', where: 'ticket', model: 'opus', effort: 'medium' }
const other: LauncherItem = { name: 'echo-test', what: 'Replies', where: 'ticket', model: null, effort: null }

test('filters on the name or what, ignoring case', () => {
  expect(filterItems([hub, onTicket, other], 'SHA')).toEqual([hub])
  expect(filterItems([hub, onTicket, other], 'draft')).toEqual([onTicket])
  expect(filterItems([hub, onTicket, other], '')).toEqual([hub, onTicket, other])
})

test('what can run now comes first; at most twelve rows', () => {
  expect(orderItems([onTicket, hub], null)).toEqual([hub, onTicket])
  expect(orderItems([onTicket, hub], 'TKT-1')).toEqual([onTicket, hub])
  const many = Array.from({ length: 10 }, (_, i) => ({ ...hub, name: `s${i}` }))
  const shown = visibleItems({ skills: many, other: many.map(item => ({ ...item, name: `o${item.name}` })) }, '', null)
  expect(shown.skills.length + shown.other.length).toBe(MAX_ROWS)
})

test('the row tail and the context ticket', () => {
  expect(itemTail(hub)).toBe(' · hub · fable · xhigh')
  expect(itemTail(other)).toBe(' · ticket')
  const rows = [{ key: 'TKT-1' }, { key: 'TKT-2' }]
  expect(contextTicket(rows, 'TKT-2', 'TKT-1')?.key).toBe('TKT-2')
  expect(contextTicket(rows, null, 'TKT-1')?.key).toBe('TKT-1')
  expect(contextTicket(rows, null, 'shape')).toBeNull()
})

test('the launch plan for each case', () => {
  expect(planLaunch(hub, null, false, MODELS)).toEqual({ kind: 'hub', key: 'shape', start: { prompt: '/shape', model: 'claude-fable-5-1', effort: 'xhigh' } })
  expect(planLaunch(onTicket, null, false, MODELS)).toEqual({ kind: 'none' })
  expect(planLaunch(onTicket, 'TKT-1', true, MODELS)).toEqual({ kind: 'send', ticket: 'TKT-1', command: 'open-pr' })
  expect(planLaunch(onTicket, 'TKT-1', false, MODELS)).toEqual({ kind: 'startTicket', ticket: 'TKT-1', start: { prompt: '/open-pr', model: 'opus', effort: 'medium' } })
  expect(planLaunch(other, 'TKT-1', false, MODELS)).toEqual({ kind: 'startTicket', ticket: 'TKT-1', start: { prompt: '/echo-test', model: null, effort: null } })
})

test('a skill session command ends with the slash command', () => {
  expect(skillCommand('/p', 'haiku', null, '/shape')).toEqual(['claude', '--plugin-dir', '/p', '--model', 'haiku', '/shape'])
  expect(skillCommand('/p', 'opus', 'high', '/x')).toEqual(['claude', '--plugin-dir', '/p', '--model', 'opus', '--effort', 'high', '/x'])
})

test('planOpen tells a hub from a ticket of the same key, and a hub counts as the centre', () => {
  const rail = { id: '%0', window: '@0', role: 'rail', ticket: '', tag: '' }
  const centreHub = { id: '%1', window: '@0', role: 'hub', ticket: 'shape', tag: '' }
  expect(planOpen([rail, centreHub], '%0', '@0', { role: 'hub', key: 'shape' })).toEqual({ kind: 'select', pane: '%1' })
  expect(planOpen([rail, centreHub], '%0', '@0', { role: 'ticket', key: 'shape' })).toEqual({ kind: 'createThenSwap', centre: '%1', centreOthers: [] })
  const parkedHub = { ...centreHub, id: '%2', window: '@1' }
  const centreTicket = { id: '%1', window: '@0', role: 'ticket', ticket: 'TKT-1', tag: '' }
  expect(planOpen([rail, centreTicket, parkedHub], '%0', '@0', { role: 'hub', key: 'shape' })).toEqual({ kind: 'swap', pane: '%2', centre: '%1', others: [], centreOthers: [] })
})

test('the launcher rows that fit a pane: two lines each after four, at most MAX_ROWS', () => {
  expect(launcherRows(undefined)).toBe(MAX_ROWS)
  expect(launcherRows(100)).toBe(MAX_ROWS)
  expect(launcherRows(14)).toBe(5)
  expect(launcherRows(3)).toBe(1)
})

test('a skill start resumes with --continue before its prompt', () => {
  expect(skillCommand('/p', 'haiku', null, '/shape', true)).toEqual(['claude', '--plugin-dir', '/p', '--continue', '--model', 'haiku', '/shape'])
})

test('other skills here lists only the commands that belong to the repository', async () => {
  const commands = [
    { name: 'echo-test', description: 'Test skill.', source: 'user' },
    { name: 'personal', description: 'Mine.', source: 'user' },
  ]
  expect(otherCandidates(PROFILE.skills, commands)).toEqual(['echo-test', 'personal'])
  expect(launcherItems(PROFILE.skills, commands, new Set(['echo-test'])).other.map(item => item.name)).toEqual(['echo-test'])
  expect(launcherItems(PROFILE.skills, commands).other.map(item => item.name)).toEqual(['echo-test', 'personal'])
})

test('a not-started ticket opens with /start-ticket <TICKET>; a started one opens plain', () => {
  expect(ticketStart('TKT-9005', 'not started', PROFILE.skills, MODELS)).toEqual({ prompt: '/start-ticket TKT-9005', model: 'claude-fable-5-1', effort: 'xhigh' })
  expect(ticketStart('TKT-9001', 'plan', PROFILE.skills, MODELS)).toBeNull()
  // No earlier conversation in the folder: /start-ticket whatever the phase (the skill resumes from its state file).
  expect(ticketStart('TKT-9004', 'implementing', PROFILE.skills, MODELS, false)).toEqual({ prompt: '/start-ticket TKT-9004', model: 'claude-fable-5-1', effort: 'xhigh' })
  expect(ticketStart('TKT-9004', 'implementing', PROFILE.skills, MODELS, true)).toBeNull()
  // TKT-2587: a state file with phase `review` and an earlier conversation opens plain (continues it).
  expect(ticketStart('TKT-2587', parseWorkState('{"phase":"review"}', LINEAR_CONFIG.phases).phase, PROFILE.skills, MODELS, true)).toBeNull()
})
