// Every colour tower draws with, by meaning. No colour value or theme key is written anywhere else.

export const THEME_NAMES = ['ghostty', 'claude', 'terminal', 'matrix'] as const

export type ThemeName = (typeof THEME_NAMES)[number]

export type ModelFamily = 'fable' | 'opus' | 'sonnet' | 'haiku' | 'other'

export type Theme = {
  /** One line for the docs and the option. */
  description: string
  working: string
  needsYou: string
  done: string
  error: string
  /** Focus and markers. */
  accent: string
  /** The border of a neutral panel. */
  panel: string
  /** Undefined: the terminal's default text colour. */
  text: string | undefined
  models: Record<ModelFamily, string>
  /** The Claude Code theme each session selects (`themes/<name>.json`), or null for the terminal's own. */
  claudeTheme: string | null
  /** tmux colours, mirrored in the table of `bin/CCtower`: pane borders and the hint row's keys and words. */
  border: string
  borderActive: string
  hintKey: string
  hintWord: string
}

const TERMINAL: Theme = {
  description: 'Your own Claude Code theme; the mod draws with its theme keys.',
  working: 'claude',
  needsYou: 'warning',
  done: 'success',
  error: 'error',
  accent: 'suggestion',
  panel: 'inactive',
  text: undefined,
  models: { fable: 'claude', opus: 'merged', sonnet: 'ide', haiku: 'autoAccept', other: 'inactive' },
  claudeTheme: null,
  border: 'colour240',
  borderActive: 'colour208',
  hintKey: 'default',
  hintWord: 'colour245',
}

const CLAUDE: Theme = {
  description: 'The design canvas: dark grey, Claude orange, one colour per model.',
  working: '#D97757',
  needsYou: '#E0B341',
  done: '#4EBA65',
  error: '#F2777A',
  accent: '#D97757',
  panel: '#6B6B6B',
  text: undefined,
  models: { fable: '#D97757', opus: '#B48EF7', sonnet: '#7FB4F5', haiku: '#5ED1C0', other: '#9A9A9A' },
  // themes/tower.json: the claude palette on the terminal's background, written by bin/CCtower at launch.
  claudeTheme: 'custom:tower:tower',
  border: '#5A5A5A',
  borderActive: '#D97757',
  hintKey: '#E8E8E8',
  hintWord: '#9A9A9A',
}

const MATRIX: Theme = {
  description: 'Green on black: phosphor green accents, greens and teal per model.',
  working: '#00FF41',
  needsYou: '#D7FF5A',
  done: '#00FF41',
  error: '#FF5C5C',
  accent: '#00FF41',
  panel: '#1F4A26',
  text: '#B8F5C0',
  models: { fable: '#00FF41', opus: '#39D98A', sonnet: '#2EC4B6', haiku: '#8AFF80', other: '#3F8F4A' },
  claudeTheme: 'custom:tower:matrix',
  border: '#1F4A26',
  borderActive: '#00FF41',
  hintKey: '#B8F5C0',
  hintWord: '#3F8F4A',
}

/** The ghostty theme with no palette: the claude values. Its real values come from `palette.json` (decision 039). */
const GHOSTTY: Theme = {
  ...CLAUDE,
  description: "Your Ghostty colours: its background, foreground, cursor and palette, read at launch.",
}

export const THEMES: Record<ThemeName, Theme> = { ghostty: GHOSTTY, claude: CLAUDE, terminal: TERMINAL, matrix: MATRIX }

/** `palette.json` in Tower's folder: the Ghostty colours by meaning, written by bin/CCtower at launch. */
export const PALETTE_FILE = 'palette.json'

function hexOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : fallback
}

/** The ghostty theme from the launcher's palette (surface, text, dim, faint, accent, needsYou, done, error, models); a missing or broken value keeps the claude one. */
export function themeFromPalette(palette: unknown): Theme {
  if (typeof palette !== 'object' || palette === null || Array.isArray(palette)) return GHOSTTY
  const p = palette as Record<string, unknown>
  const models = typeof p.models === 'object' && p.models !== null ? (p.models as Record<string, unknown>) : {}
  const accent = hexOr(p.accent, CLAUDE.accent)
  const text = typeof p.text === 'string' && /^#[0-9A-Fa-f]{6}$/.test(p.text) ? p.text.toUpperCase() : undefined
  return {
    ...GHOSTTY,
    working: accent,
    needsYou: hexOr(p.needsYou, CLAUDE.needsYou),
    done: hexOr(p.done, CLAUDE.done),
    error: hexOr(p.error, CLAUDE.error),
    accent,
    panel: hexOr(p.faint, CLAUDE.panel),
    text,
    models: {
      fable: accent,
      opus: hexOr(models.opus, CLAUDE.models.opus),
      sonnet: hexOr(models.sonnet, CLAUDE.models.sonnet),
      haiku: hexOr(models.haiku, CLAUDE.models.haiku),
      other: hexOr(models.other, CLAUDE.models.other),
    },
    border: hexOr(p.faint, CLAUDE.border),
    borderActive: accent,
    hintKey: text ?? CLAUDE.hintKey,
    hintWord: hexOr(p.dim, CLAUDE.hintWord),
  }
}

let paletteText: string | undefined
let ghostty: Theme = GHOSTTY

/** Takes the palette read from `palette.json` (undefined when missing or broken); true when the ghostty theme changed. */
export function usePalette(palette: unknown): boolean {
  const text = JSON.stringify(palette)
  if (text === paletteText) return false
  paletteText = text
  ghostty = themeFromPalette(palette)
  return true
}

export function theme(name: ThemeName): Theme {
  return name === 'ghostty' ? ghostty : THEMES[name]
}

function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && (THEME_NAMES as readonly string[]).includes(value)
}

/** The option's value as a theme name: anything unknown is `claude`. */
export function themeName(value: unknown): ThemeName {
  return isThemeName(value) ? value : 'claude'
}

/** TOWER_THEME (set by the launcher from `--theme` or the environment), when it names a theme, wins over the settings' theme, which wins over the option. */
export function themeChoice(env: string | null | undefined, option: unknown, settingsTheme: unknown = null): ThemeName {
  return isThemeName(env) ? env : isThemeName(settingsTheme) ? settingsTheme : themeName(option)
}

const FAMILIES: readonly Exclude<ModelFamily, 'other'>[] = ['fable', 'opus', 'sonnet', 'haiku']

export function modelFamily(modelId: string): ModelFamily {
  const id = modelId.toLowerCase()
  return FAMILIES.find(family => id.includes(family)) ?? 'other'
}

/** `claude-haiku-4-5-20251001` → `haiku-4.5`; an alias such as `sonnet` stays as it is. */
export function modelLabel(modelId: string): string {
  const bare = modelId.toLowerCase().replace(/^claude-/, '').replace(/\[.*\]$/, '').replace(/-\d{8}$/, '')
  return bare.replace(/-(\d+)-(\d+)$/, '-$1.$2')
}

/** `claude-fable-5-1` → `Fable 5.1`, `claude-haiku-4-5-20251001` → `Haiku 4.5`; anything else as `modelLabel`. */
export function modelName(modelId: string): string {
  const family = modelFamily(modelId)
  const version = modelLabel(modelId).match(/-(\d+\.\d+)$/)
  if (family === 'other' || version === null) return modelLabel(modelId)
  return `${family[0]!.toUpperCase()}${family.slice(1)} ${version[1]}`
}
