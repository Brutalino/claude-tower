import { expect, test } from 'claude-code/testing'

import { modelFamily, modelLabel, modelName, theme, themeChoice, themeFromPalette, themeName, THEME_NAMES, THEMES, usePalette } from '../hooks/core/theme'

test('the terminal theme uses theme keys, the claude theme hex colours', async () => {
  expect(theme('terminal').working).toBe('claude')
  expect(theme('terminal').needsYou).toBe('warning')
  expect(theme('terminal').done).toBe('success')
  expect(theme('terminal').models.fable).toBe('claude')
  expect(theme('claude').needsYou).toBe('#E0B341')
  expect(theme('claude').models.opus).toBe('#B48EF7')
  expect(theme('claude').text).toBeUndefined()
})

test('every theme has every key, a colour for each model, and its own Claude Code theme or none', async () => {
  expect(Object.keys(THEMES).sort()).toEqual([...THEME_NAMES].sort())
  const keys = Object.keys(THEMES.claude).sort()
  for (const name of THEME_NAMES) {
    const t = theme(name)
    expect(Object.keys(t).sort()).toEqual(keys)
    expect(Object.keys(t.models).sort()).toEqual(['fable', 'haiku', 'opus', 'other', 'sonnet'])
    for (const colour of [t.working, t.needsYou, t.done, t.error, t.accent, t.panel, t.border, t.borderActive, t.hintKey, t.hintWord, ...Object.values(t.models)]) {
      expect(colour.length).toBeGreaterThan(0)
    }
    expect(t.description.length).toBeGreaterThan(0)
    expect(t.claudeTheme).toBe(name === 'terminal' ? null : name === 'claude' || name === 'ghostty' ? 'custom:tower:tower' : `custom:tower:${name}`)
  }
})

test('the matrix theme: green on black, working and done follow the accent, needs you the warning', async () => {
  const matrix = theme('matrix')
  expect(matrix.accent).toBe('#00FF41')
  expect(matrix.working).toBe(matrix.accent)
  expect(matrix.done).toBe('#00FF41')
  expect(matrix.needsYou).toBe('#D7FF5A')
  expect(matrix.error).toBe('#FF5C5C')
  expect(matrix.panel).toBe('#1F4A26')
  expect(matrix.models).toEqual({ fable: '#00FF41', opus: '#39D98A', sonnet: '#2EC4B6', haiku: '#8AFF80', other: '#3F8F4A' })
  expect([matrix.border, matrix.borderActive, matrix.hintKey, matrix.hintWord]).toEqual(['#1F4A26', '#00FF41', '#B8F5C0', '#3F8F4A'])
  expect([theme('terminal').border, theme('terminal').borderActive]).toEqual(['colour240', 'colour208'])
})

test('an unknown theme option falls back to claude', async () => {
  expect(themeName('terminal')).toBe('terminal')
  expect(themeName('matrix')).toBe('matrix')
  expect(themeName('neon')).toBe('claude')
  expect(themeName(undefined)).toBe('claude')
})

test('TOWER_THEME overrides the option when it names a theme', async () => {
  expect(themeChoice('terminal', 'claude')).toBe('terminal')
  expect(themeChoice('claude', 'terminal')).toBe('claude')
  expect(themeChoice(undefined, 'terminal')).toBe('terminal')
  expect(themeChoice('neon', 'terminal')).toBe('terminal')
  expect(themeChoice('matrix', 'claude')).toBe('matrix')
  expect(themeChoice(null, 'matrix')).toBe('matrix')
  expect(themeChoice('terminal', 'matrix')).toBe('terminal')
  expect(themeChoice('', 'neon')).toBe('claude')
  expect(theme('terminal').panel).toBe('inactive')
})

test('model ids and aliases map to a family and a short label', async () => {
  expect(modelFamily('claude-haiku-4-5-20251001')).toBe('haiku')
  expect(modelFamily('Claude-Opus-5-5')).toBe('opus')
  expect(modelFamily('sonnet')).toBe('sonnet')
  expect(modelFamily('claude-fable-5-1')).toBe('fable')
  expect(modelFamily('gpt-x')).toBe('other')
  expect(modelLabel('claude-haiku-4-5-20251001')).toBe('haiku-4.5')
  expect(modelLabel('claude-opus-5-5')).toBe('opus-5.5')
  expect(modelLabel('claude-sonnet-5-5[1m]')).toBe('sonnet-5.5')
  expect(modelLabel('claude-fable-5-1')).toBe('fable-5.1')
  expect(modelLabel('haiku')).toBe('haiku')
})

test('modelName: the names the deck shows', async () => {
  expect(modelName('claude-fable-5-1')).toBe('Fable 5.1')
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelName('haiku')).toBe('haiku')
})

const SALVIA = {
  surface: '#080B08', text: '#A9CDB2', brightText: '#D4ECD9', dim: '#4A6152', faint: '#1B452D', accent: '#81B991',
  needsYou: '#D6C27A', done: '#589C6F', error: '#EC5D5D',
  models: { opus: '#B293C4', sonnet: '#5F9BB8', haiku: '#6FB8A8', other: '#4A6152' },
}

test('the ghostty theme from the launcher palette: accent for working and fable, faint for panels and borders', async () => {
  const t = themeFromPalette(SALVIA)
  expect([t.working, t.accent, t.models.fable, t.borderActive]).toEqual(['#81B991', '#81B991', '#81B991', '#81B991'])
  expect([t.panel, t.border]).toEqual(['#1B452D', '#1B452D'])
  expect([t.needsYou, t.done, t.error]).toEqual(['#D6C27A', '#589C6F', '#EC5D5D'])
  expect([t.text, t.hintKey, t.hintWord]).toEqual(['#A9CDB2', '#A9CDB2', '#4A6152'])
  expect(t.models).toEqual({ fable: '#81B991', opus: '#B293C4', sonnet: '#5F9BB8', haiku: '#6FB8A8', other: '#4A6152' })
  expect(t.claudeTheme).toBe('custom:tower:tower')
  expect(Object.keys(t).sort()).toEqual(Object.keys(THEMES.claude).sort())
})

test('the ghostty theme falls back to the claude colours: no palette, a broken one, a bad value', async () => {
  const claude = theme('claude')
  for (const broken of [undefined, null, 'x', [1], {}]) {
    const t = themeFromPalette(broken)
    expect([t.working, t.needsYou, t.done, t.error, t.panel, t.border, t.hintKey, t.hintWord]).toEqual([claude.working, claude.needsYou, claude.done, claude.error, claude.panel, claude.border, claude.hintKey, claude.hintWord])
    expect(t.text).toBeUndefined()
    expect(t.models).toEqual(claude.models)
  }
  const partial = themeFromPalette({ ...SALVIA, accent: 'green', models: { opus: '#123' } })
  expect(partial.accent).toBe(claude.accent)
  expect(partial.models.opus).toBe(claude.models.opus)
  expect(partial.done).toBe('#589C6F')
})

test('theme(ghostty) follows the palette the session read', async () => {
  expect(usePalette(SALVIA)).toBe(true)
  expect(usePalette({ ...SALVIA })).toBe(false)
  expect(theme('ghostty').accent).toBe('#81B991')
  expect(usePalette(undefined)).toBe(true)
  expect(theme('ghostty').accent).toBe(theme('claude').accent)
})
