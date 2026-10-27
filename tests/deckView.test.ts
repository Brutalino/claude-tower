import { expect, test } from 'claude-code/testing'

import type { TowerAgent } from '../types/index'
import {
  agentFolded, agentSections, cardOrder, cardRows, effortPips, foldedCount, LIVE_AGENTS_MAX, sessionRowsOf, fitAction, fitCards, formatClock, formatDuration, gaugeCells, laneCells, laneLabel, laneModels,
  progressFraction, tabsFit, tokenBar,
} from '../hooks/core/deckView'

function agent(id: string, change: Partial<TowerAgent> = {}): TowerAgent {
  return {
    id, name: id, type: 'general-purpose', model: 'claude-haiku-4-5', effort: null, status: 'running', task: 't',
    startedAt: 0, endedAt: null, actions: 0, lastAction: null, recent: [], steps: [], stepsCreated: 0,
    tokens: { input: 0, output: 0 }, lastOutput: null, spans: [], ...change,
  }
}
const STEP = { id: '1', text: 's', status: 'todo' } as const
const done = (id: string, endedAt: number) => agent(id, { status: 'done', endedAt })

test('effort pips: low 1, medium 2, high 3, xhigh and max 4, unknown null', async () => {
  expect(['low', 'medium', 'high', 'xhigh', 'max'].map(effortPips)).toEqual([1, 2, 3, 4, 4])
  expect(effortPips(null)).toBeNull()
  expect(effortPips('auto')).toBeNull()
})

test('gauges fill by rounding and stay inside their cells', async () => {
  expect(gaugeCells(0, 10)).toBe(0)
  expect(gaugeCells(34, 10)).toBe(3)
  expect(gaugeCells(80, 5)).toBe(4)
  expect(gaugeCells(140, 5)).toBe(5)
})

test('durations and clocks', async () => {
  expect(formatDuration(41_000)).toBe('41s')
  expect(formatDuration(125_000)).toBe('2m 05s')
  expect(formatDuration(3_720_000)).toBe('1h 02m')
  expect(formatClock(65_000)).toBe('1:05')
  expect(formatClock(3_725_000)).toBe('1:02:05')
})

test('the bar goes by steps, else by the estimate capped at 0.95, else nothing', async () => {
  expect(progressFraction({ done: 1, total: 4 }, 0, null)).toBe(0.375)
  expect(progressFraction({ done: 0, total: 0 }, 30_000, 60_000)).toBe(0.5)
  expect(progressFraction({ done: 0, total: 0 }, 90_000, 60_000)).toBe(0.95)
  expect(progressFraction({ done: 0, total: 0 }, 90_000, null)).toBeNull()
})

test('cards: running oldest first, then finished most recent first', async () => {
  const order = cardOrder([done('d1', 10), agent('r2', { startedAt: 5 }), done('d2', 20), agent('r1', { startedAt: 1 })])
  expect(order.map(a => a.id)).toEqual(['r1', 'r2', 'd2', 'd1'])
})

test('card rows: running 7, finished 5', async () => {
  expect(cardRows(agent('a', { steps: [STEP] }))).toBe(7)
  expect(cardRows(agent('a'))).toBe(7)
  expect(cardRows(done('a', 1))).toBe(5)
})

test('fitting: all when they fit, else in order with one row kept for +n more', async () => {
  const cards = [agent('r1'), agent('r2'), done('d1', 2), done('d2', 1)]
  expect(fitCards(cards, 1 + 7 + 7 + 5 + 5)).toEqual({ shown: cards, more: 0 })
  const cut = fitCards(cards, 1 + 7 + 7 + 5 + 1)
  expect(cut.shown.map(a => a.id)).toEqual(['r1', 'r2', 'd1'])
  expect(cut.more).toBe(1)
  expect(fitCards(cards, 5)).toEqual({ shown: [], more: 4 })
})

test('a finished agent stays a card for 20 s, then folds; one without an end time folds at once', async () => {
  const one = agent('d', { status: 'done', startedAt: 0, endedAt: 100_000 })
  expect(agentFolded(one, 100_000 + 19_000)).toBe(false)
  expect(agentFolded(one, 100_000 + 21_000)).toBe(true)
  expect(agentFolded(agent('r'), 1e9)).toBe(false)
  expect(agentFolded(agent('x', { status: 'failed' }), 0)).toBe(true)
  expect(agentSections([one], 119_000, false)).toEqual({ cards: [one], moreRunning: 0, fold: null, foldOnly: false })
  expect(agentSections([one], 121_000, false)).toEqual({ cards: [], moreRunning: 0, fold: { done: 1, failed: 0, ms: 100_000 }, foldOnly: true })
  expect(foldedCount([one, agent('r')], 119_000)).toBe(0)
  expect(foldedCount([one, agent('r')], 121_000)).toBe(1)
})

test('the summary counts done and failed and sums their time; the history open shows the folded cards', async () => {
  const now = 1_000_000
  const ended = (id: string, status: 'done' | 'failed', startedAt: number, endedAt: number) => agent(id, { status, startedAt, endedAt })
  const old = [ended('d1', 'done', 0, 60_000), ended('d2', 'done', 0, 120_000), ended('f1', 'failed', 100_000, 130_000)]
  const fresh = ended('d3', 'done', 900_000, now - 5_000)
  const live = agent('r1', { startedAt: 950_000 })
  const closed = agentSections([...old, fresh, live], now, false)
  expect(closed.fold).toEqual({ done: 2, failed: 1, ms: 60_000 + 120_000 + 30_000 })
  expect(closed.cards.map(a => a.id)).toEqual(['r1', 'd3'])
  expect(closed.foldOnly).toBe(false)
  const open = agentSections([...old, fresh, live], now, true)
  expect(open.cards.map(a => a.id)).toEqual(['r1', 'd3', 'f1', 'd2', 'd1'])
  expect(open.fold).toEqual(closed.fold)
  expect(agentSections(old, now, true).foldOnly).toBe(false)
  expect(agentSections([], now, false)).toEqual({ cards: [], moreRunning: 0, fold: null, foldOnly: false })
})

test('the live list shows 8 running agents at most, the rest counted', async () => {
  const running = Array.from({ length: 11 }, (_, i) => agent(`r${i}`, { startedAt: i }))
  const sections = agentSections([...running, agent('d', { status: 'done', startedAt: 0, endedAt: 99 })], 100, false)
  expect(LIVE_AGENTS_MAX).toBe(8)
  expect(sections.cards.map(a => a.id)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'd'])
  expect(sections.moreRunning).toBe(3)
  expect(agentSections(running.slice(0, 8), 100, false).moreRunning).toBe(0)
})

test('the timeline counts only the lanes it draws: the fold row while the history is closed, +n running, the review lane', async () => {
  const ended = agent('d', { status: 'done', startedAt: 0, endedAt: 100_000 })
  const live = Array.from({ length: 10 }, (_, i) => agent(`r${i}`, { startedAt: i }))
  // 19 s after the end: main + heading, 8 running lanes, +2 running, the finished lane.
  expect(sessionRowsOf(agentSections([...live, ended], 119_000, false), false, false, false)).toBe(2 + 8 + 1 + 1)
  // 21 s: the finished lane is the fold row.
  expect(sessionRowsOf(agentSections([...live, ended], 121_000, false), false, false, false)).toBe(2 + 8 + 1 + 1)
  expect(sessionRowsOf(agentSections([ended], 121_000, false), false, false, false)).toBe(2 + 1)
  // History open: every lane again, no fold row; advanced adds one request row per lane; the review lane.
  expect(sessionRowsOf(agentSections([ended], 121_000, true), true, false, false)).toBe(2 + 1)
  expect(sessionRowsOf(agentSections([ended, agent('r')], 121_000, true), true, true, true)).toBe(2 + 2 + 1 + 2 + 2)
})

test('an action line keeps the end of its path, any other line its start', async () => {
  expect(fitAction('Read /a/b/c/notes.md', 14).startsWith('Read ')).toBe(true)
  expect(fitAction('Read /a/b/c/notes.md', 14).endsWith('notes.md')).toBe(true)
  expect(fitAction('Read /a/b/c/notes.md', 14).length).toBeLessThanOrEqual(14)
  expect(fitAction('Read /a.md', 14)).toBe('Read /a.md')
  expect(fitAction('Bash echo a long command', 10).startsWith('Bash echo')).toBe(true)
})

test('laneCells: dots outside the spans, the model inside, the head on a running span', () => {
  const cells = laneCells([{ model: 'claude-opus-5-5', from: 20, to: 60 }, { model: 'fable', from: 60, to: null }], 0, 100, 10)
  expect(cells.map(cell => cell.model)).toEqual([null, null, 'claude-opus-5-5', 'claude-opus-5-5', 'claude-opus-5-5', 'claude-opus-5-5', 'fable', 'fable', 'fable', 'fable'])
  expect(cells.map(cell => cell.head)).toEqual([false, false, false, false, false, false, false, false, false, true])
})

test('laneCells: a closed span has no head and time after it is dots', () => {
  const cells = laneCells([{ model: 'sonnet', from: 0, to: 30 }], 0, 100, 10)
  expect(cells.filter(cell => cell.model === 'sonnet').length).toBe(3)
  expect(cells.some(cell => cell.head)).toBe(false)
})

test('lane label: one family by name, two as fa→op', () => {
  const spans = [
    { model: 'claude-fable-5-1', from: 0, to: 10 },
    { model: 'claude-opus-5-5', from: 10, to: 20 },
    { model: 'claude-fable-5-1', from: 20, to: null },
  ]
  expect(laneLabel(laneModels(spans)).map(part => part.text).join('')).toBe('fa→op')
  expect(laneLabel(laneModels(spans.slice(0, 1))).map(part => part.text)).toEqual(['fable'])
})

test('tokenBar: the cells split by share in legend order and add up', () => {
  const bar = tokenBar({ haiku: 4_000, opus: 46_000, fable: 21_000, sonnet: 29_000 }, 60)
  expect(bar.map(part => part.family)).toEqual(['fable', 'opus', 'sonnet', 'haiku'])
  expect(bar.map(part => part.cells)).toEqual([13, 28, 17, 2])
  expect(tokenBar({ opus: 1, haiku: 1_000_000 }, 10).map(part => part.cells)).toEqual([1, 9])
  expect(tokenBar({}, 10)).toEqual([])
})

test('tabsFit: watch goes first, then docs, then the gaps shrink; the active tab and settings stay', () => {
  const tabs = [
    { key: 'agents', width: 6, active: true }, { key: 'routing', width: 10 }, { key: 'log', width: 6 },
    { key: 'docs', width: 7 }, { key: 'watch', width: 8 }, { key: 'settings', width: 11 },
  ]
  const all = ['agents', 'routing', 'log', 'docs', 'watch', 'settings']
  expect(tabsFit(66, tabs)).toEqual({ shown: all, gap: 2 })
  expect(tabsFit(58, tabs)).toEqual({ shown: all, gap: 2 })
  expect(tabsFit(57, tabs)).toEqual({ shown: ['agents', 'routing', 'log', 'docs', 'settings'], gap: 2 })
  expect(tabsFit(48, tabs)).toEqual({ shown: ['agents', 'routing', 'log', 'docs', 'settings'], gap: 2 })
  expect(tabsFit(47, tabs)).toEqual({ shown: ['agents', 'routing', 'log', 'settings'], gap: 2 })
  expect(tabsFit(38, tabs)).toEqual({ shown: ['agents', 'routing', 'log', 'settings'], gap: 1 })
  expect(tabsFit(20, tabs)).toEqual({ shown: ['agents', 'routing', 'log', 'settings'], gap: 1 })
  expect(tabsFit(57, tabs.map(tab => ({ ...tab, active: tab.key === 'watch' }))).shown).toContain('watch')
})
