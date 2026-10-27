// The person's tower settings: how much the deck shows, which blocks, which theme. One value in the plugin store, shared by every session.

import { THEME_NAMES, type ThemeName } from './theme'

export const VIEW_LEVELS = ['simple', 'medium', 'advanced'] as const

export type ViewLevel = (typeof VIEW_LEVELS)[number]

export const MODULE_NAMES = ['timeline', 'routing', 'log', 'gate', 'documents', 'devEnv', 'stalls', 'loops', 'prstate', 'popups', 'sound', 'ciAlerts'] as const

/** The modules the settings view shows on the `attention` row, not on `modules`. */
export const ATTENTION_MODULES: readonly ModuleName[] = ['popups', 'sound', 'ciAlerts']

export type ModuleName = (typeof MODULE_NAMES)[number]

export type Settings = {
  view: ViewLevel
  modules: Record<ModuleName, boolean>
  /** Null: follow the launch (`TOWER_THEME`) or the plugin option. */
  theme: ThemeName | null
  /** `off`: Opus 5.5 always runs in place of Fable (decision 032); `auto`: only while Fable's limit is reached. */
  fable: FableChoice
  /** `on`: with `fable` on `auto`, Fable is blocked ahead of a limit forecast to run out within 20 minutes (decision 034). */
  fableEarly: FableEarlyChoice
  /** `auto`: tower posts the saved review as soon as it is shown; `key`: the REVIEW box waits for its key (decision 025). */
  reviewPost: ReviewPostChoice
  /** Decision 036: `session`, the aside forks the session's own transcript on its model (cache reused); `sonnet`, a Sonnet call over its last part as text. */
  asideModel: AsideModelChoice
  /** Decision 036: `on`, a reply ending on an unpinned question is sent back once to pin it. */
  pinNudge: PinNudgeChoice
  /** Decision 037: `on`, risky commands are blocked or asked, credential files refused, secrets masked in tool output. */
  safety: SafetyChoice
}

export const ASIDE_MODEL_CHOICES = ['session', 'sonnet'] as const

export type AsideModelChoice = (typeof ASIDE_MODEL_CHOICES)[number]

export const PIN_NUDGE_CHOICES = ['off', 'on'] as const

export type PinNudgeChoice = (typeof PIN_NUDGE_CHOICES)[number]

export const SAFETY_CHOICES = ['on', 'off'] as const

export type SafetyChoice = (typeof SAFETY_CHOICES)[number]

export const FABLE_CHOICES = ['auto', 'off'] as const

export type FableChoice = (typeof FABLE_CHOICES)[number]

export const FABLE_EARLY_CHOICES = ['on', 'off'] as const

export type FableEarlyChoice = (typeof FABLE_EARLY_CHOICES)[number]

export const REVIEW_POST_CHOICES = ['auto', 'key'] as const

export type ReviewPostChoice = (typeof REVIEW_POST_CHOICES)[number]

/** The `$.store` key: one value for the person. */
export const SETTINGS_KEY = 'settings'

export const DEFAULT_SETTINGS: Settings = {
  view: 'medium',
  modules: { timeline: true, routing: true, log: true, gate: true, documents: true, devEnv: true, stalls: true, loops: true, prstate: true, popups: true, sound: true, ciAlerts: true },
  theme: null,
  fable: 'auto',
  fableEarly: 'on',
  reviewPost: 'auto',
  asideModel: 'session',
  pinNudge: 'off',
  safety: 'on',
}

/** The word a module shows in the settings view. */
export const MODULE_LABELS: Record<ModuleName, string> = {
  timeline: 'timeline', routing: 'routing', log: 'log', gate: 'gate', documents: 'documents', devEnv: 'dev-env', stalls: 'stalls', loops: 'loops', prstate: 'pr state', popups: 'popups', sound: 'sound', ciAlerts: 'ci alerts',
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whatever the store holds as settings: an unknown or missing field takes its default. */
export function parseSettings(value: unknown): Settings {
  if (!isObject(value)) return { ...DEFAULT_SETTINGS, modules: { ...DEFAULT_SETTINGS.modules } }
  const view = (VIEW_LEVELS as readonly unknown[]).includes(value.view) ? (value.view as ViewLevel) : DEFAULT_SETTINGS.view
  const modulesValue = isObject(value.modules) ? value.modules : {}
  // `popups` was `toasts` before the popups replaced the toasts: the old choice carries over.
  const stored = modulesValue.popups === undefined && typeof modulesValue.toasts === 'boolean' ? { ...modulesValue, popups: modulesValue.toasts } : modulesValue
  const modules = Object.fromEntries(
    MODULE_NAMES.map(name => [name, typeof stored[name] === 'boolean' ? stored[name] : DEFAULT_SETTINGS.modules[name]]),
  ) as Record<ModuleName, boolean>
  const theme = (THEME_NAMES as readonly unknown[]).includes(value.theme) ? (value.theme as ThemeName) : null
  const fable = value.fable === 'off' ? 'off' : 'auto'
  const fableEarly = value.fableEarly === 'off' ? 'off' : 'on'
  const reviewPost = value.reviewPost === 'key' ? 'key' : 'auto'
  const asideModel = value.asideModel === 'sonnet' ? 'sonnet' : 'session'
  const pinNudge = value.pinNudge === 'on' ? 'on' : 'off'
  const safety = value.safety === 'off' ? 'off' : 'on'
  return { view, modules, theme, fable, fableEarly, reviewPost, asideModel, pinNudge, safety }
}

export function toggleModule(settings: Settings, name: ModuleName): Settings {
  return { ...settings, modules: { ...settings.modules, [name]: !settings.modules[name] } }
}

/** simple → medium → advanced → simple. */
export function cycleView(settings: Settings): Settings {
  return { ...settings, view: VIEW_LEVELS[(VIEW_LEVELS.indexOf(settings.view) + 1) % VIEW_LEVELS.length]! }
}

/** null (follow) → ghostty → claude → terminal → matrix → null. */
export function cycleTheme(settings: Settings): Settings {
  const at = settings.theme === null ? -1 : THEME_NAMES.indexOf(settings.theme)
  return { ...settings, theme: at + 1 < THEME_NAMES.length ? THEME_NAMES[at + 1]! : null }
}

/** Whether two settings values say the same. */
export function sameSettings(a: Settings, b: Settings): boolean {
  return JSON.stringify(parseSettings(a)) === JSON.stringify(parseSettings(b))
}
