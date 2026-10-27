import { expect, test } from 'claude-code/testing'

import { claudeCommand, modTheme, sessionSettings, skillCommand, claudeProjectDir, towerTag, hasEarlierSession, paneWithTag, parsePaneListing, planBack, planOpen, joinDirection, reviewPane, reviewTitle, resumesConversation as resumesWith, ticketOpenStart as openStartWith } from '../hooks/core/panes'
import { LINEAR_CONFIG } from './linearConfig'
import type { TmuxPane } from '../hooks/core/panes'

const START = LINEAR_CONFIG.workflow.steps.start?.skill ?? null
const resumesConversation = (role: string, start: { prompt: string } | null, hasEarlier: boolean, hasStateFile = false) => resumesWith(role, start, hasEarlier, hasStateFile, START)
const ticketOpenStart = <T extends { prompt: string }>(start: T | null, hasEarlier: boolean, hasStateFile: boolean) => openStartWith(start, hasEarlier, hasStateFile, START)

const RAIL: TmuxPane = { id: '%0', window: '@0', role: 'rail', ticket: '', tag: '' }

function ticket(id: string, window: string, key: string): TmuxPane {
  return { id, window, role: 'ticket', ticket: key, tag: '' }
}

test('parses the pane listing, empty options included', async () => {
  expect(parsePaneListing('%0\t@0\trail\t\n%3\t@1\tticket\tTKT-1\n%7\t@2\t\t\n')).toEqual([
    RAIL,
    ticket('%3', '@1', 'TKT-1'),
    { id: '%7', window: '@2', role: '', ticket: '', tag: '' },
  ])
})

test('parses the tag column', async () => {
  expect(parsePaneListing('%0\t@0\trail\t\trail-0a1b2c3d\n%3\t@1\tticket\tTKT-1\tticket-000f4241\n')).toEqual([
    { ...RAIL, tag: 'rail-0a1b2c3d' },
    { ...ticket('%3', '@1', 'TKT-1'), tag: 'ticket-000f4241' },
  ])
})

test('a tag is the role, a dash and 8 hex digits', async () => {
  expect(towerTag('ticket', 1_000_001)).toBe('ticket-000f4241')
  expect(towerTag('ticket', 0x1_2345_6789)).toBe('ticket-23456789')
  expect(towerTag('rail', 0)).toBe('rail-00000000')
})

test('the pane is found by its tag, never by an empty one', async () => {
  const panes = [{ ...RAIL, tag: 'rail-0a1b2c3d' }, { id: '%7', window: '@2', role: '', ticket: '', tag: '' }]
  expect(paneWithTag(panes, 'rail-0a1b2c3d')).toBe('%0')
  expect(paneWithTag(panes, 'rail-ffffffff')).toBeNull()
  expect(paneWithTag(panes, '')).toBeNull()
})

test('the ticket already in the centre is selected', async () => {
  expect(planOpen([RAIL, ticket('%1', '@0', 'TKT-1')], '%0', '@0', { role: 'ticket', key: 'TKT-1' })).toEqual({ kind: 'select', pane: '%1' })
})

test('no centre and no session: split beside the rail', async () => {
  expect(planOpen([RAIL, { id: '%5', window: '@3', role: '', ticket: '', tag: '' }], '%0', '@0', { role: 'ticket', key: 'TKT-1' })).toEqual({ kind: 'split' })
})

test('a parked session is swapped into the centre', async () => {
  const panes = [RAIL, ticket('%1', '@0', 'TKT-1'), ticket('%2', '@1', 'TKT-2')]
  expect(planOpen(panes, '%0', '@0', { role: 'ticket', key: 'TKT-2' })).toEqual({ kind: 'swap', pane: '%2', centre: '%1', others: [], centreOthers: [] })
})

test('a centre and no session: create hidden, then swap', async () => {
  const panes = [RAIL, ticket('%1', '@0', 'TKT-1'), ticket('%2', '@1', 'TKT-2')]
  expect(planOpen(panes, '%0', '@0', { role: 'ticket', key: 'TKT-3' })).toEqual({ kind: 'createThenSwap', centre: '%1', centreOthers: [] })
})

test('no centre but a parked session: join it beside the rail', async () => {
  expect(planOpen([RAIL, ticket('%2', '@1', 'TKT-2')], '%0', '@0', { role: 'ticket', key: 'TKT-2' })).toEqual({ kind: 'join', pane: '%2', others: [] })
})

test('a pane in the rail window without the ticket role is not a centre', async () => {
  const panes = [RAIL, { id: '%9', window: '@0', role: '', ticket: '', tag: '' }, ticket('%2', '@1', 'TKT-2')]
  expect(planOpen(panes, '%0', '@0', { role: 'ticket', key: 'TKT-2' })).toEqual({ kind: 'join', pane: '%2', others: [] })
})

test('the project folder replaces every non-alphanumeric character with -', async () => {
  expect(claudeProjectDir('/home/me', '/home/me/Repos/wt_TKT-1.x')).toBe('/home/me/.claude/projects/-home-me-Repos-wt-TKT-1-x')
})

test('an earlier session is a .jsonl file in the project folder', async () => {
  expect(hasEarlierSession(['a.jsonl', 'memory'])).toBe(true)
  expect(hasEarlierSession(['memory', 'notes.json'])).toBe(false)
  expect(claudeCommand('/plugin', true)).toEqual(['claude', '--plugin-dir', '/plugin', '--continue'])
  expect(claudeCommand('/plugin', false)).toEqual(['claude', '--plugin-dir', '/plugin'])
  expect(claudeCommand('/plugin', false, 'haiku')).toEqual(['claude', '--plugin-dir', '/plugin', '--model', 'haiku'])
})

test('session settings: the theme\'s Claude Code theme, the main-screen layout for the rail only, our status line', async () => {
  const rail = JSON.parse(sessionSettings({ role: 'rail', pluginDir: '/p', theme: 'claude' }))
  expect(rail).toEqual({ theme: 'custom:tower:tower', tui: 'default', statusLine: { type: 'command', command: '/p/bin/tower-statusline', padding: 0, refreshInterval: 1 }, disableAgentView: true })
  expect(JSON.parse(sessionSettings({ role: 'ticket', pluginDir: '/p', theme: 'matrix' })).theme).toBe('custom:tower:matrix')
  expect(modTheme('claude')).toBe('custom:tower:tower')
  expect(modTheme('terminal')).toBeNull()
  const ticket = JSON.parse(sessionSettings({ role: 'ticket', pluginDir: '/p', theme: 'terminal' }))
  expect(ticket.theme).toBe(undefined)
  expect(ticket.tui).toBe(undefined)
  expect(ticket.statusLine.command).toBe('/p/bin/tower-statusline')
  expect(ticket.disableAgentView).toBe(true)
})

test('session settings carry the project\'s allowed rules as permissions.allow exactly when it has some (decision 080)', async () => {
  const allow = ['Bash(xcrun simctl:*)', 'Bash(nohup xcrun simctl:*)', 'Bash(xcodebuild:*)', 'Bash "quoted" (x):*']
  const ticket = JSON.parse(sessionSettings({ role: 'ticket', pluginDir: '/p', theme: 'claude', allow }))
  expect(ticket.permissions).toEqual({ allow })
  expect(ticket).toEqual({ theme: 'custom:tower:tower', statusLine: { type: 'command', command: '/p/bin/tower-statusline', padding: 0, refreshInterval: 1 }, disableAgentView: true, permissions: { allow } })
  expect(JSON.parse(sessionSettings({ role: 'review', pluginDir: '/p', theme: 'terminal', allow })).permissions).toEqual({ allow })
  expect('permissions' in JSON.parse(sessionSettings({ role: 'ticket', pluginDir: '/p', theme: 'claude', allow: [] }))).toBe(false)
  expect('permissions' in JSON.parse(sessionSettings({ role: 'ticket', pluginDir: '/p', theme: 'claude' }))).toBe(false)
  // One argv word, the rules' brackets, stars, colons and quotes kept through JSON (tmux takes argv, no shell).
  const skill = skillCommand('/p', null, null, '/start-ticket 27', false, sessionSettings({ role: 'ticket', pluginDir: '/p', theme: 'claude', allow }))
  expect(skill.at(-1)).toBe('/start-ticket 27')
  expect(JSON.parse(skill.at(-2)!).permissions.allow).toEqual(allow)
})

test('the settings JSON is one argv word, unquoted, before a skill prompt', async () => {
  const settings = sessionSettings({ role: 'hub', pluginDir: '/a b/p', theme: 'claude' })
  const plain = claudeCommand('/p', false, null, settings)
  expect(plain.slice(-2)).toEqual(['--settings', settings])
  expect(JSON.parse(plain[plain.length - 1]!).statusLine.command).toBe('/a b/p/bin/tower-statusline')
  const skill = skillCommand('/p', 'haiku', null, '/x', false, settings)
  expect(skill.slice(-3)).toEqual(['--settings', settings, '/x'])
  expect(claudeCommand('/p', false)).toEqual(['claude', '--plugin-dir', '/p'])
})

test('a ticket not started yet starts fresh even when its folder has an earlier conversation', () => {
  expect(resumesConversation('ticket', { prompt: '/start-ticket TKT-9001' }, true)).toBe(false)
  expect(resumesConversation('ticket', null, true)).toBe(true)
  expect(resumesConversation('ticket', null, false)).toBe(false)
  expect(resumesConversation('hub', null, true)).toBe(false)
})

test('TKT-2587: a ticket folder with a state file and an earlier conversation resumes, never /start-ticket (decision 051)', () => {
  const start = { prompt: '/start-ticket TKT-2587', model: 'claude-fable-5-1', effort: 'xhigh' }
  expect(ticketOpenStart(start, true, true)).toBeNull()
  expect(resumesConversation('ticket', start, true, true)).toBe(true)
  expect(resumesConversation('ticket', ticketOpenStart(start, true, true), true, true)).toBe(true)
  // No state file: /start-ticket in a new conversation; no earlier conversation: /start-ticket, nothing to continue.
  expect(ticketOpenStart(start, true, false)).toBe(start)
  expect(resumesConversation('ticket', start, true, false)).toBe(false)
  expect(ticketOpenStart(start, false, true)).toBe(start)
  expect(resumesConversation('ticket', start, false, true)).toBe(false)
  // Another skill's start is kept.
  const review = { prompt: '/review 102' }
  expect(ticketOpenStart(review, true, true)).toBe(review)
})

test('the review pane travels with its ticket pane', () => {
  const review = (id: string, window: string, key: string): TmuxPane => ({ id, window, role: 'review', ticket: key, tag: '' })
  const parked = [RAIL, ticket('%2', '@1', 'TKT-2'), review('%3', '@1', 'TKT-2')]
  expect(planOpen(parked, '%0', '@0', { role: 'ticket', key: 'TKT-2' })).toEqual({ kind: 'join', pane: '%2', others: ['%3'] })
  const shown = [RAIL, ticket('%2', '@0', 'TKT-2'), review('%3', '@0', 'TKT-2')]
  expect(planBack(shown, '%0', '@0')).toEqual({ centre: '%2', others: ['%3'] })
  expect(planOpen(shown, '%0', '@0', { role: 'ticket', key: 'TKT-4' })).toEqual({ kind: 'createThenSwap', centre: '%2', centreOthers: ['%3'] })
  expect(planOpen([...shown, ticket('%4', '@1', 'TKT-4')], '%0', '@0', { role: 'ticket', key: 'TKT-4' })).toEqual({ kind: 'swap', pane: '%4', centre: '%2', others: [], centreOthers: ['%3'] })
  expect(reviewPane(shown, 'TKT-2')?.id).toBe('%3')
  expect(reviewPane(shown, 'TKT-1')).toBeNull()
  expect(reviewTitle('TKT-9004', 102)).toBe('TKT-9004 · review · PR #102')
  expect(joinDirection('review')).toBe('-v')
  expect(joinDirection('ticket')).toBe('-h')
})

test('a review session always starts a new conversation on its skill', () => {
  expect(resumesConversation('review', { prompt: '/review 102' }, true)).toBe(false)
  expect(skillCommand('/p', 'haiku', 'high', '/review 102', false, null)).toEqual(['claude', '--plugin-dir', '/p', '--model', 'haiku', '--effort', 'high', '/review 102'])
})
