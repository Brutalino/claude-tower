import { expect, test } from 'claude-code/testing'

import { fitCards } from '../hooks/core/deckView'
import { gateChecked, initialDeck } from '../hooks/core/deck'
import { cycleTheme, cycleView, DEFAULT_SETTINGS, MODULE_NAMES, parseSettings, sameSettings, toggleModule } from '../hooks/core/settings'
import { themeChoice } from '../hooks/core/theme'

test('the defaults: medium, every module on, the theme follows the launch or the option', async () => {
  expect(DEFAULT_SETTINGS.view).toBe('medium')
  for (const name of MODULE_NAMES) expect(DEFAULT_SETTINGS.modules[name]).toBe(true)
  expect(DEFAULT_SETTINGS.theme).toBeNull()
})

test('parseSettings is tolerant: nothing stored, junk, or a partial value', async () => {
  expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  expect(parseSettings('medium')).toEqual(DEFAULT_SETTINGS)
  expect(parseSettings([1, 2])).toEqual(DEFAULT_SETTINGS)
  expect(parseSettings({ view: 'huge', theme: 'neon', modules: { log: 'no' } })).toEqual(DEFAULT_SETTINGS)
  const partial = parseSettings({ view: 'simple', modules: { devEnv: false }, theme: 'matrix' })
  expect(partial.view).toBe('simple')
  expect(partial.modules.devEnv).toBe(false)
  expect(partial.modules.timeline).toBe(true)
  // A module no longer offered (a value stored by an older version) is dropped; the rest still loads.
  const old = parseSettings({ modules: { retired: false, gate: false } })
  expect(Object.keys(old.modules)).toEqual([...MODULE_NAMES])
  expect(old.modules.gate).toBe(false)
  expect(partial.theme).toBe('matrix')
})

test('a stored value reads back as it was written', async () => {
  const changed = toggleModule(cycleView(DEFAULT_SETTINGS), 'gate')
  expect(parseSettings(JSON.parse(JSON.stringify(changed)))).toEqual(changed)
  expect(sameSettings(changed, DEFAULT_SETTINGS)).toBe(false)
  expect(sameSettings(DEFAULT_SETTINGS, parseSettings(undefined))).toBe(true)
})

test('toggleModule flips one module and keeps the input', async () => {
  const off = toggleModule(DEFAULT_SETTINGS, 'routing')
  expect(off.modules.routing).toBe(false)
  expect(off.modules.log).toBe(true)
  expect(DEFAULT_SETTINGS.modules.routing).toBe(true)
  expect(toggleModule(off, 'routing').modules.routing).toBe(true)
})

test('cycleView and cycleTheme go round', async () => {
  expect(cycleView(DEFAULT_SETTINGS).view).toBe('advanced')
  expect(cycleView(cycleView(DEFAULT_SETTINGS)).view).toBe('simple')
  const themes = [cycleTheme(DEFAULT_SETTINGS)]
  for (let i = 0; i < 4; i++) themes.push(cycleTheme(themes[themes.length - 1]!))
  expect(themes.map(s => s.theme)).toEqual(['ghostty', 'claude', 'terminal', 'matrix', null])
})

test('theme precedence: launch env, then settings, then option', async () => {
  expect(themeChoice('terminal', 'claude', 'matrix')).toBe('terminal')
  expect(themeChoice(null, 'claude', 'matrix')).toBe('matrix')
  expect(themeChoice(undefined, 'terminal', null)).toBe('terminal')
  expect(themeChoice('', 'terminal', 'neon')).toBe('terminal')
  expect(themeChoice('neon', 'claude', 'terminal')).toBe('terminal')
})

test('advanced cards take more rows: fewer fit', async () => {
  const agent = { status: 'done' } as Parameters<typeof fitCards>[0][number]
  const four = [agent, agent, agent, agent]
  expect(fitCards(four, 21).shown.length).toBe(4)
  expect(fitCards(four, 21, 4).more).toBeGreaterThan(0)
})

test('plain allows are logged only when asked to', async () => {
  const deck = initialDeck()
  expect((gateChecked(deck, 'allow', 'Read a.ts', 1).log ?? []).length).toBe(0)
  expect((gateChecked(deck, 'allow', 'Read a.ts', 1, true).log ?? []).map(entry => entry.text)).toEqual(['allowed Read a.ts'])
})

test('the old toasts choice carries over to popups', async () => {
  expect(parseSettings({ modules: { toasts: false } }).modules.popups).toBe(false)
  expect(parseSettings({ modules: { toasts: false, popups: true } }).modules.popups).toBe(true)
  expect(parseSettings({}).modules.popups).toBe(true)
})
