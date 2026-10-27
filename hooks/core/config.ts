// A repository's configuration (decision 053, plan docs/plans/general-tower.md): the fixed modules Tower has, each
// with its variants, and the values one repository chooses. Pure data, JSON as stored; nothing here reads a file.
// An edition may bring a built-in configuration of its own (decision 083): `EDITION`, the one import of its folder.

import { EDITION } from '../edition/index'
import { EFFORTS, type BuiltinRoute, type Profile, type Role, type Skill } from './profile'

export const CONFIG_VERSION = 1

/** A regular expression as data: `new RegExp(source, flags)`. */
export type Pattern = { source: string; flags: string }

/** The phases Tower draws; a state file's own words map onto them. */
export type PhaseName = 'planning' | 'implementing' | 'review'

export type ProjectConfig = {
  name: string
  /** `owner/name` on GitHub. */
  repo: string
  /** The branch new ticket worktrees start from (on origin), and pull requests target. */
  baseBranch: string
  /** The main checkout; null: the one Tower was opened in (TOWER_REPO today). `~` is the home folder. */
  mainCheckout: string | null
}

export type LinearTickets = {
  kind: 'linear'
  /** Null: every team the key sees (today). */
  team: string | null
  /** The candidates: the free bugs in `candidateStates`, and mine in `mineStates`, the first `first`. */
  query: { first: number; candidateLabel: string; candidateStates: string[]; mineStates: string[] }
  /** A ticket id in a branch name, the id in group 1 (upper-cased); a worktree without one is not a ticket. */
  idPattern: Pattern
  /** What typed in the rail's prompt is a ticket; the number in group 1. */
  inputPattern: Pattern
  /** The ticket id from that number: `TKT-{n}`. */
  idTemplate: string
}

export type GithubTickets = {
  kind: 'github'
  /** `owner/name` whose issues are the tickets. */
  repo: string
  /** A ticket's kind from its labels: the first label in `kinds`, else `defaultKind` (`bug` → `fix`, else `feature`). */
  labels: { kinds: Record<string, string>; defaultKind: string }
  /** Issues assigned to the person first, marked `mine`. */
  mineFirst: boolean
  /** An issue's number in a worktree's branch name, group 1 (`fix/27-…` → `#27`); a worktree without one is not a ticket. */
  idPattern: Pattern
  /** The same in the worktree's folder name, for a branch that does not carry it (`27-…` → `#27`). */
  folderPattern: Pattern
}

export type TicketsConfig = LinearTickets | GithubTickets | { kind: 'none' }

export type BranchConfig =
  /** The branch name Linear suggests (Linear links the branch and the PR by it); `fallback` when it gives none. */
  | { kind: 'linear-branch-name'; fallback: string }
  /** `{kind}/{n}-{slug}`; `kindFromLabel`: `{kind}` from the ticket's labels (tickets.labels). */
  | { kind: 'template'; template: string; kindFromLabel: boolean }

export type WorktreeConfig = {
  /** Where a new ticket worktree goes: `{repoParent}`, `{repo}`, `{key}`, `{n}`, `{slug}`, `~`. */
  pathTemplate: string
  /** Beside most existing ticket worktrees and named like them (`<key>` or `<repo>-<key>`); `pathTemplate` only when there are none. */
  followExisting: boolean
  branch: BranchConfig
  /** The title's slug is cut at this many characters. */
  slugMax: number
  /** A ticket blocked by another starts from the blocker's branch when that is on origin, else from the base branch. */
  stackOnBlocker: boolean
}

export type WorkflowStep = {
  skill: string
  /** The slash command's arguments: `{key}`, `{n}`, `{pr}`. */
  args: string
  /** The phase this step is the next one of (`not started` before any); null when the pull request decides. */
  phase: 'not started' | PhaseName | null
  /** Where it runs: the ticket's session, a review session of its own, or a hub session in the main checkout. */
  session: 'ticket' | 'review' | 'hub'
}

/** `start`, `openPr`, `review`, `wrapUp` are the steps Tower knows; others (`release`, …) are listed as they are. */
export type WorkflowConfig = { steps: Record<string, WorkflowStep> }

export type PhasesConfig =
  | {
    source: 'state-file'
    /** Under the worktree. A missing file is `not started`; one that exists means started (decision 051). */
    path: string
    /** The file's phase words Tower knows. */
    values: string[]
    mapping: Record<string, PhaseName>
    /** What any other word, an empty phase or a file that does not parse reads as. */
    unknownAs: PhaseName
  }
  | { source: 'git' }
  | { source: 'none' }

export type ReviewConfig = {
  skill: string
  /** `{pr}`. */
  args: string
  /** A review comment's heading line. */
  heading: Pattern
  /** The round in the heading line, group 1; none: round 1. */
  roundPattern: Pattern
  /** The review's own `###` sections: two of them shown mean the review is shown. */
  sections: string[]
  /** A verdict line, when the review writes one; null: the verdict is `blockersSection` and the checks. */
  verdict: { ready: Pattern; fixes: Pattern } | null
  /** The section listing the blockers and its text for none; null when the review has none. */
  blockersSection: { heading: string; none: string } | null
  /** Where the review is saved before it is posted, under the worktree: `{pr}`, `{round}`. */
  savePath: string
}

/** A kind of question a session waits on: how to recognise it, and what away mode answers (null: never). */
export type WaitRule = { patterns: Pattern[]; awayAnswer: string | null }

/** By kind: `openPr` (its own questions), `post` (the review's post question), `merge`, `issue`, `release`, … */
export type WaitsConfig = Record<string, WaitRule>

export type CheckSource =
  | 'github-ci'
  /** The state file's `checks`, read against the head commit. */
  | { stateFile: string }
  | { local: string; command: string; when: string }
  /** The last release tag, `build-{n}`. */
  | { release: string }

export type ChecksConfig = { sources: CheckSource[] }

export type EnvConfig =
  /** A skill that starts the ticket's stack and writes `env` in the state file; the frontend's ports in slots. */
  | { kind: 'skill'; name: string; ports: { first: number; slots: number } | null }
  | { kind: 'simulator'; nameTemplate: string }
  | { kind: 'none' }

/** A key on the board that runs a repository skill in the main checkout (a hub session). */
export type RepoAction = { key: string; label: string; skill: string; cwd: 'main' }

/**
 * Claude Code's `permissions.allow` rules (its own syntax, `Bash(xcodebuild:*)`) for every session Tower starts for the
 * project (decision 080): merged into the session's `--settings`, so its worktrees ask for none of them.
 */
export type PermissionsConfig = { allow: string[] }

/** What profile.ts holds, but the base branch (project.baseBranch); `defaults`: Tower's own. */
export type RoutingConfig = Omit<Profile, 'baseBranch'>

export type TowerConfig = {
  version: number
  project: ProjectConfig
  tickets: TicketsConfig
  worktree: WorktreeConfig
  workflow: WorkflowConfig
  phases: PhasesConfig
  review: ReviewConfig
  waits: WaitsConfig
  checks: ChecksConfig
  env: EnvConfig
  repoActions: RepoAction[]
  routing: RoutingConfig | 'defaults'
  /** How Tower's skill changes reach the repository (setup, later): a pull request or a direct commit. */
  delivery: 'pr' | 'commit'
  /** Optional; none: the sessions get no rules of Tower's. */
  permissions?: PermissionsConfig
}

// ── Patterns and templates ────────────────────────────────────────────────

export function patternOf(re: RegExp): Pattern {
  return { source: re.source, flags: re.flags }
}

export function toRegExp(pattern: Pattern): RegExp {
  return new RegExp(pattern.source, pattern.flags)
}

/**
 * `{name}` replaced by its value; `~` at the start by `home` when given. A value that is empty takes the one
 * separator (`-`, `_`, `/`, `.`) before it along (`{keyLower}-{slug}` with no slug is `tkt-1`, as worktrees.ts does).
 */
export function renderTemplate(template: string, values: Readonly<Record<string, string>>, home: string | null = null): string {
  const text = template.replace(/([-_/.]?)\{(\w+)\}/g, (_whole, separator: string, name: string) => {
    const value = values[name] ?? ''
    return value === '' ? '' : `${separator}${value}`
  })
  return home !== null && text.startsWith('~') ? `${home.replace(/\/+$/, '')}${text.slice(1)}` : text
}

/** A GitHub issue's ticket id: `#27` (GitHub's own notation, Tower's for every `github` configuration). */
export const GITHUB_ID_TEMPLATE = '#{n}'

/**
 * How a worktree's ticket id is read: `source`/`flags` match the branch name, group 1 the id (upper-cased) or, with
 * `template`, the number the id is rendered from; `folder` the same in the folder's name, for a branch without it.
 */
export type TicketIdPattern = Pattern & { template?: string; folder?: Pattern }

/** The ticket id in a branch name (Linear: group 1, upper-cased; github: `#<group 1>`, or from the folder); null without tickets. */
export function ticketIdPattern(tickets: TicketsConfig): TicketIdPattern | null {
  if (tickets.kind === 'linear') return tickets.idPattern
  if (tickets.kind === 'github') return { ...tickets.idPattern, template: GITHUB_ID_TEMPLATE, folder: tickets.folderPattern }
  return null
}

/** What the rail's prompt reads as a ticket id (github: `#27` or `27`); null when the tickets give none. */
export function ticketInput(tickets: TicketsConfig): Pick<LinearTickets, 'inputPattern' | 'idTemplate'> | null {
  if (tickets.kind === 'linear') return { inputPattern: tickets.inputPattern, idTemplate: tickets.idTemplate }
  if (tickets.kind === 'github') return { inputPattern: { source: '^#?(\\d+)$', flags: '' }, idTemplate: GITHUB_ID_TEMPLATE }
  return null
}

/** The main checkout: the configuration's (`~` the home folder), else the one Tower was opened in (TOWER_REPO). */
export function mainCheckoutOf(project: ProjectConfig, towerRepo: string | null, home: string | null): string | null {
  const path = project.mainCheckout
  if (path === null) return towerRepo
  return home !== null && (path === '~' || path.startsWith('~/')) ? `${home.replace(/\/+$/, '')}${path.slice(1)}` : path
}

/** A ticket's values for a step's arguments: `{key}` the ticket id, `{n}` its trailing number. */
export function ticketValues(key: string): Record<string, string> {
  return { key, n: /(\d+)$/.exec(key)?.[1] ?? '' }
}

/** A step's slash command: `/<skill>` and its arguments rendered (`/start-ticket TKT-1`, `/open-pr`); null without the step. */
export function stepCommand(step: WorkflowStep | undefined, values: Readonly<Record<string, string>>): string | null {
  if (step === undefined) return null
  const args = renderTemplate(step.args, values)
  return args === '' ? `/${step.skill}` : `/${step.skill} ${args}`
}

/** What `stepCommand` writes, read back: the whole command, `{pr}` captured as group 1 (`/review 101` → 101). */
export function stepCommandPattern(step: WorkflowStep | undefined): RegExp | null {
  if (step === undefined) return null
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  const args = step.args.split(/(\{\w+\})/).map(part => (part === '{pr}' ? '(\\d+)' : /^\{\w+\}$/.test(part) ? '\\S+' : escape(part))).join('')
  return new RegExp(`^${escape(`/${step.skill}`)}${args === '' ? '' : ` ${args}`}$`)
}

/** The profile a configuration's routing makes (profile.ts's shape); null for `defaults`. */
export function profileOf(config: TowerConfig): Profile | null {
  return config.routing === 'defaults' ? null : { baseBranch: config.project.baseBranch, ...config.routing }
}

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map(match => match[1] as string)
}

// ── Validation ────────────────────────────────────────────────────────────

export type ConfigResult = { ok: true; config: TowerConfig } | { ok: false; errors: string[] }

type Raw = Record<string, unknown>

const PHASE_NAMES: readonly string[] = ['planning', 'implementing', 'review']
const ROLE_NAMES: readonly string[] = ['executor', 'scout', 'verifier', 'runner']
const WORKTREE_PLACES = ['repoParent', 'repo', 'key', 'n', 'slug']
const BRANCH_PLACES = ['key', 'keyLower', 'n', 'slug', 'kind']
const STEP_PLACES = ['key', 'n', 'pr']

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function show(value: unknown): string {
  if (value === undefined) return 'nothing'
  const text = JSON.stringify(value)
  return text.length > 40 ? `${text.slice(0, 37)}…` : text
}

/** Collects `path: what is wrong` lines; every check returns whether it passed. */
class Checker {
  readonly errors: string[] = []
  /** Values found missing without a line of their own: their object reports them; counted so none passes unseen. */
  missing = 0

  fail(path: string, message: string): false {
    this.errors.push(`${path}: ${message}`)
    return false
  }

  /** `expected <what>, got <value>`; nothing for a value that is not there, which its object reports as missing. */
  expected(value: unknown, path: string, what: string): false {
    if (value !== undefined) return this.fail(path, `expected ${what}, got ${show(value)}`)
    this.missing += 1
    return false
  }

  record(value: unknown, path: string, keys: readonly string[], optional: readonly string[] = []): value is Raw {
    if (!isRecord(value)) return this.expected(value, path, `an object`)
    for (const key of keys) if (value[key] === undefined) this.fail(path, `missing ${key}`)
    for (const key of Object.keys(value)) if (!keys.includes(key) && !optional.includes(key)) this.fail(`${path}.${key}`, 'unknown field')
    return true
  }

  string(value: unknown, path: string, nonEmpty = true): value is string {
    if (typeof value !== 'string') return this.expected(value, path, `a string`)
    if (nonEmpty && value.trim() === '') return this.fail(path, 'expected a non-empty string')
    return true
  }

  nullableString(value: unknown, path: string): value is string | null {
    return value === null || this.string(value, path)
  }

  boolean(value: unknown, path: string): value is boolean {
    return typeof value === 'boolean' || this.expected(value, path, `true or false`)
  }

  count(value: unknown, path: string): value is number {
    return (typeof value === 'number' && Number.isInteger(value) && value > 0) || this.expected(value, path, `a whole number above 0`)
  }

  /** A variant's `kind` (or `source`): reported missing here, as no record lists it. */
  variant<T extends string>(value: Raw, key: string, path: string, options: readonly T[]): boolean {
    if (value[key] === undefined) return this.fail(path, `missing ${key}`)
    return this.oneOf(value[key], `${path}.${key}`, options)
  }

  oneOf<T extends string>(value: unknown, path: string, options: readonly T[]): value is T {
    return (typeof value === 'string' && (options as readonly string[]).includes(value))
      || this.expected(value, path, options.map(option => `'${option}'`).join(' | '))
  }

  strings(value: unknown, path: string): value is string[] {
    if (!Array.isArray(value)) return this.expected(value, path, `a list of strings`)
    return value.map((one, index) => this.string(one, `${path}[${index}]`)).every(Boolean)
  }

  stringMap(value: unknown, path: string): value is Record<string, string> {
    if (!isRecord(value)) return this.expected(value, path, `an object of strings`)
    return Object.entries(value).map(([key, one]) => this.string(one, `${path}.${key}`)).every(Boolean)
  }

  pattern(value: unknown, path: string): value is Pattern {
    if (!this.record(value, path, ['source', 'flags'])) return false
    if (!this.string(value.source, `${path}.source`) || !this.string(value.flags, `${path}.flags`, false)) return false
    try {
      new RegExp(value.source, value.flags)
      return true
    } catch (err) {
      return this.fail(path, `not a regular expression: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  patterns(value: unknown, path: string): value is Pattern[] {
    if (!Array.isArray(value)) return this.expected(value, path, `a list of patterns`)
    return value.map((one, index) => this.pattern(one, `${path}[${index}]`)).every(Boolean)
  }

  template(value: unknown, path: string, allowed: readonly string[]): value is string {
    if (!this.string(value, path, false)) return false
    const unknown = placeholders(value).filter(name => !allowed.includes(name))
    return unknown.length === 0 || this.fail(path, `unknown placeholder ${unknown.map(name => `{${name}}`).join(', ')} (known: ${allowed.map(name => `{${name}}`).join(', ')})`)
  }
}

function checkProject(c: Checker, value: unknown) {
  if (!c.record(value, 'project', ['name', 'repo', 'baseBranch', 'mainCheckout'])) return
  c.string(value.name, 'project.name')
  if (c.string(value.repo, 'project.repo') && !/^[\w.-]+\/[\w.-]+$/.test(value.repo)) c.expected(value.repo, 'project.repo', `owner/name`)
  c.string(value.baseBranch, 'project.baseBranch')
  c.nullableString(value.mainCheckout, 'project.mainCheckout')
}

function checkTickets(c: Checker, value: unknown): string | null {
  if (!isRecord(value)) {
    c.expected(value, 'tickets', `an object`)
    return null
  }
  if (!c.variant(value, 'kind', 'tickets', ['linear', 'github', 'none'] as const)) return null
  if (value.kind === 'linear') {
    if (!c.record(value, 'tickets', ['kind', 'team', 'query', 'idPattern', 'inputPattern', 'idTemplate'])) return 'linear'
    c.nullableString(value.team, 'tickets.team')
    if (c.record(value.query, 'tickets.query', ['first', 'candidateLabel', 'candidateStates', 'mineStates'])) {
      c.count(value.query.first, 'tickets.query.first')
      c.string(value.query.candidateLabel, 'tickets.query.candidateLabel')
      c.strings(value.query.candidateStates, 'tickets.query.candidateStates')
      c.strings(value.query.mineStates, 'tickets.query.mineStates')
    }
    c.pattern(value.idPattern, 'tickets.idPattern')
    c.pattern(value.inputPattern, 'tickets.inputPattern')
    if (c.template(value.idTemplate, 'tickets.idTemplate', ['n']) && !value.idTemplate.includes('{n}')) c.fail('tickets.idTemplate', 'must hold {n}')
  } else if (value.kind === 'github') {
    if (!c.record(value, 'tickets', ['kind', 'repo', 'labels', 'mineFirst', 'idPattern', 'folderPattern'])) return 'github'
    if (c.string(value.repo, 'tickets.repo') && !/^[\w.-]+\/[\w.-]+$/.test(value.repo)) c.expected(value.repo, 'tickets.repo', `owner/name`)
    if (c.record(value.labels, 'tickets.labels', ['kinds', 'defaultKind'])) {
      c.stringMap(value.labels.kinds, 'tickets.labels.kinds')
      c.string(value.labels.defaultKind, 'tickets.labels.defaultKind')
    }
    c.boolean(value.mineFirst, 'tickets.mineFirst')
    c.pattern(value.idPattern, 'tickets.idPattern')
    c.pattern(value.folderPattern, 'tickets.folderPattern')
  } else {
    c.record(value, 'tickets', ['kind'])
  }
  return value.kind as string
}

function checkWorktree(c: Checker, value: unknown, tickets: string | null) {
  if (!c.record(value, 'worktree', ['pathTemplate', 'followExisting', 'branch', 'slugMax', 'stackOnBlocker'])) return
  c.template(value.pathTemplate, 'worktree.pathTemplate', WORKTREE_PLACES)
  c.boolean(value.followExisting, 'worktree.followExisting')
  c.count(value.slugMax, 'worktree.slugMax')
  c.boolean(value.stackOnBlocker, 'worktree.stackOnBlocker')
  const branch = value.branch
  if (!isRecord(branch)) {
    c.expected(branch, 'worktree.branch', `an object`)
    return
  }
  if (!c.variant(branch, 'kind', 'worktree.branch', ['linear-branch-name', 'template'] as const)) return
  if (branch.kind === 'linear-branch-name') {
    if (!c.record(branch, 'worktree.branch', ['kind', 'fallback'])) return
    c.template(branch.fallback, 'worktree.branch.fallback', BRANCH_PLACES.filter(name => name !== 'kind'))
    if (tickets !== null && tickets !== 'linear') c.fail('worktree.branch.kind', `'linear-branch-name' needs tickets.kind 'linear', got '${tickets}'`)
    return
  }
  if (!c.record(branch, 'worktree.branch', ['kind', 'template', 'kindFromLabel'])) return
  const template = c.template(branch.template, 'worktree.branch.template', BRANCH_PLACES)
  if (!c.boolean(branch.kindFromLabel, 'worktree.branch.kindFromLabel')) return
  if (branch.kindFromLabel && tickets !== null && tickets !== 'github') c.fail('worktree.branch.kindFromLabel', `needs tickets.kind 'github' (labels), got '${tickets}'`)
  if (template && !branch.kindFromLabel && placeholders(branch.template as string).includes('kind')) c.fail('worktree.branch.template', '{kind} needs kindFromLabel: true')
}

function checkStep(c: Checker, value: unknown, path: string): value is WorkflowStep {
  if (!c.record(value, path, ['skill', 'args', 'phase', 'session'])) return false
  const ok = [
    c.string(value.skill, `${path}.skill`),
    c.template(value.args, `${path}.args`, STEP_PLACES),
    value.phase === null || c.oneOf(value.phase, `${path}.phase`, ['not started', 'planning', 'implementing', 'review'] as const),
    c.oneOf(value.session, `${path}.session`, ['ticket', 'review', 'hub'] as const),
  ]
  return ok.every(Boolean)
}

function checkWorkflow(c: Checker, value: unknown, tickets: string | null): Record<string, WorkflowStep> {
  if (!c.record(value, 'workflow', ['steps']) || !isRecord(value.steps)) {
    if (isRecord(value)) c.expected(value.steps, 'workflow.steps', `an object of steps`)
    return {}
  }
  const steps: Record<string, WorkflowStep> = {}
  for (const [key, step] of Object.entries(value.steps)) if (checkStep(c, step, `workflow.steps.${key}`)) steps[key] = step
  // Without tickets (the free Tower, decision 060) nothing starts a ticket.
  if (!('start' in value.steps) && tickets !== 'none') c.fail('workflow.steps', 'missing start')
  return steps
}

function checkPhases(c: Checker, value: unknown) {
  if (!isRecord(value)) {
    c.expected(value, 'phases', `an object`)
    return
  }
  if (!c.variant(value, 'source', 'phases', ['state-file', 'git', 'none'] as const)) return
  if (value.source !== 'state-file') {
    c.record(value, 'phases', ['source'])
    return
  }
  if (!c.record(value, 'phases', ['source', 'path', 'values', 'mapping', 'unknownAs'])) return
  c.string(value.path, 'phases.path')
  const values = c.strings(value.values, 'phases.values') ? value.values : null
  if (!isRecord(value.mapping)) {
    c.expected(value.mapping, 'phases.mapping', `an object of phase words`)
  } else {
    for (const [word, phase] of Object.entries(value.mapping)) {
      c.oneOf(phase, `phases.mapping.${word}`, PHASE_NAMES)
      if (values !== null && !values.includes(word)) c.fail(`phases.mapping.${word}`, `not one of phases.values (${values.join(', ')})`)
    }
    if (values !== null) for (const word of values) if (!(word in value.mapping)) c.fail('phases.mapping', `missing ${word} (in phases.values)`)
  }
  c.oneOf(value.unknownAs, 'phases.unknownAs', PHASE_NAMES)
}

function checkReview(c: Checker, value: unknown): string | null {
  if (!c.record(value, 'review', ['skill', 'args', 'heading', 'roundPattern', 'sections', 'verdict', 'blockersSection', 'savePath'])) return null
  c.string(value.skill, 'review.skill')
  c.template(value.args, 'review.args', ['pr'])
  c.pattern(value.heading, 'review.heading')
  c.pattern(value.roundPattern, 'review.roundPattern')
  c.strings(value.sections, 'review.sections')
  if (value.verdict !== null && c.record(value.verdict, 'review.verdict', ['ready', 'fixes'])) {
    c.pattern(value.verdict.ready, 'review.verdict.ready')
    c.pattern(value.verdict.fixes, 'review.verdict.fixes')
  }
  if (value.blockersSection !== null && c.record(value.blockersSection, 'review.blockersSection', ['heading', 'none'])) {
    c.string(value.blockersSection.heading, 'review.blockersSection.heading')
    c.string(value.blockersSection.none, 'review.blockersSection.none')
  }
  if (value.verdict === null && value.blockersSection === null) c.fail('review', 'needs a verdict or a blockersSection: nothing would tell a review ready')
  c.template(value.savePath, 'review.savePath', ['pr', 'round'])
  return typeof value.skill === 'string' ? value.skill : null
}

function checkWaits(c: Checker, value: unknown) {
  if (!isRecord(value)) {
    c.expected(value, 'waits', `an object of wait kinds`)
    return
  }
  for (const [kind, rule] of Object.entries(value)) {
    if (!c.record(rule, `waits.${kind}`, ['patterns', 'awayAnswer'])) continue
    c.patterns(rule.patterns, `waits.${kind}.patterns`)
    c.nullableString(rule.awayAnswer, `waits.${kind}.awayAnswer`)
  }
}

function checkChecks(c: Checker, value: unknown) {
  if (!c.record(value, 'checks', ['sources'])) return
  if (!Array.isArray(value.sources)) {
    c.expected(value.sources, 'checks.sources', `a list`)
    return
  }
  value.sources.forEach((source, index) => {
    const path = `checks.sources[${index}]`
    if (source === 'github-ci') return
    if (!isRecord(source)) return c.expected(source, path, `'github-ci', {stateFile}, {local, command, when} or {release}`)
    if ('stateFile' in source) return c.record(source, path, ['stateFile']) && c.string(source.stateFile, `${path}.stateFile`)
    if ('local' in source) {
      if (!c.record(source, path, ['local', 'command', 'when'])) return
      c.string(source.local, `${path}.local`)
      c.string(source.command, `${path}.command`)
      c.string(source.when, `${path}.when`)
      return
    }
    if ('release' in source) return c.record(source, path, ['release']) && c.template(source.release, `${path}.release`, ['n'])
    return c.expected(source, path, `'github-ci', {stateFile}, {local, command, when} or {release}`)
  })
}

function checkEnv(c: Checker, value: unknown): string | null {
  if (!isRecord(value)) {
    c.expected(value, 'env', `an object`)
    return null
  }
  if (!c.variant(value, 'kind', 'env', ['skill', 'simulator', 'none'] as const)) return null
  if (value.kind === 'skill') {
    if (!c.record(value, 'env', ['kind', 'name', 'ports'])) return null
    if (value.ports !== null && c.record(value.ports, 'env.ports', ['first', 'slots'])) {
      c.count(value.ports.first, 'env.ports.first')
      c.count(value.ports.slots, 'env.ports.slots')
    }
    return c.string(value.name, 'env.name') ? value.name : null
  }
  if (value.kind === 'simulator') {
    if (c.record(value, 'env', ['kind', 'nameTemplate'])) c.template(value.nameTemplate, 'env.nameTemplate', ['n', 'key'])
    return null
  }
  c.record(value, 'env', ['kind'])
  return null
}

/**
 * Tower's own keys on the board and the rail (decision 055): a repository action on one would meet them. `s`, `n`, `t`
 * are not among them: they are repository actions themselves (a Linear project's shape, new ticket, triage; oink's n and t).
 */
export const TOWER_RAIL_KEYS: Readonly<Record<string, string>> = {
  k: 'skills', r: 'refresh', a: 'away (the board), candidates (the rail beside a ticket)', q: 'quit', p: 'settings', b: 'board', c: 'the list switch', y: "quit's yes",
  g: "the popup's go to", x: "the popup's dismiss and closing a session", i: "the board's ask", o: 'new session', m: "new session's main checkout, marking a candidate",
  w: "new session's worktree",
}

function checkRepoActions(c: Checker, value: unknown): string[] {
  if (!Array.isArray(value)) {
    c.expected(value, 'repoActions', `a list`)
    return []
  }
  const keys = new Set<string>()
  const skills: string[] = []
  value.forEach((action, index) => {
    const path = `repoActions[${index}]`
    if (!c.record(action, path, ['key', 'label', 'skill', 'cwd'])) return
    if (c.string(action.key, `${path}.key`)) {
      // The engine's hotkeys: one digit or one lowercase letter (an `R` cannot be bound).
      if (Array.from(action.key).length !== 1) c.expected(action.key, `${path}.key`, `one key`)
      else if (!/^[0-9a-z]$/.test(action.key)) c.expected(action.key, `${path}.key`, `a digit or a lowercase letter`)
      else if (TOWER_RAIL_KEYS[action.key] !== undefined) c.fail(`${path}.key`, `'${action.key}' is Tower's own key on the board and the rail (${TOWER_RAIL_KEYS[action.key]}); choose another`)
      if (keys.has(action.key)) c.fail(`${path}.key`, `'${action.key}' is used twice`)
      keys.add(action.key)
    }
    c.string(action.label, `${path}.label`)
    if (c.string(action.skill, `${path}.skill`)) skills.push(action.skill)
    c.oneOf(action.cwd, `${path}.cwd`, ['main'] as const)
  })
  return skills
}

/** An effort: null (the session's own), or one of EFFORTS (decision 056). */
function checkEffort(c: Checker, value: unknown, path: string): boolean {
  if (!c.nullableString(value, path)) return false
  if (value === null || (EFFORTS as readonly string[]).includes(value)) return true
  return c.fail(path, `effort '${value}' is not one of ${EFFORTS.join(', ')} (or null)`)
}

function checkRole(c: Checker, value: unknown, path: string): value is Role {
  if (!c.record(value, path, ['name', 'description', 'model', 'effort', 'disallowedTools', 'work', 'prompt'])) return false
  const ok = [
    c.oneOf(value.name, `${path}.name`, ROLE_NAMES),
    c.string(value.description, `${path}.description`),
    c.string(value.model, `${path}.model`),
    checkEffort(c, value.effort, `${path}.effort`),
    Array.isArray(value.disallowedTools) && value.disallowedTools.length === 0 ? true : c.strings(value.disallowedTools, `${path}.disallowedTools`),
    c.string(value.work, `${path}.work`),
    c.string(value.prompt, `${path}.prompt`),
  ]
  return ok.every(Boolean)
}

function checkSkill(c: Checker, value: unknown, path: string): value is Skill {
  if (!c.record(value, path, ['name', 'what', 'where', 'model', 'effort'])) return false
  const ok = [
    c.string(value.name, `${path}.name`),
    c.string(value.what, `${path}.what`),
    c.oneOf(value.where, `${path}.where`, ['ticket', 'hub'] as const),
    c.nullableString(value.model, `${path}.model`),
    checkEffort(c, value.effort, `${path}.effort`),
  ]
  return ok.every(Boolean)
}

/** The routing's skill names, or null for `defaults`. */
function checkRouting(c: Checker, value: unknown): string[] | null {
  if (value === 'defaults') return null
  if (!c.record(value, 'routing', ['roles', 'skills', 'modelIds', 'builtinRoutes', 'forkAdvice', 'mainGuidance', 'reviewGuidance'])) return []
  const roles = Array.isArray(value.roles) ? value.roles.filter((role, index) => checkRole(c, role, `routing.roles[${index}]`)) : (c.expected(value.roles, 'routing.roles', `a list`), [])
  const skills = Array.isArray(value.skills) ? value.skills.filter((skill, index) => checkSkill(c, skill, `routing.skills[${index}]`)) : (c.expected(value.skills, 'routing.skills', `a list`), [])
  const modelIds = c.stringMap(value.modelIds, 'routing.modelIds') ? value.modelIds : null
  const knownModel = (model: string, path: string) => modelIds === null || model in modelIds || c.fail(path, `model '${model}' is not in routing.modelIds`)
  roles.forEach((role, index) => role.model === null || knownModel(role.model, `routing.roles[${index}].model`))
  skills.forEach((skill, index) => skill.model === null || knownModel(skill.model, `routing.skills[${index}].model`))
  const roleNames = roles.map(role => role.name as string)
  if (isRecord(value.builtinRoutes)) {
    for (const [type, route] of Object.entries(value.builtinRoutes)) {
      const path = `routing.builtinRoutes.${type}`
      if (isRecord(route) && 'role' in route) {
        if (c.record(route, path, ['role']) && c.string(route.role, `${path}.role`) && !roleNames.includes(route.role)) c.fail(`${path}.role`, `'${route.role}' is not one of routing.roles`)
      } else if (isRecord(route) && 'model' in route) {
        if (c.record(route, path, ['model']) && c.string(route.model, `${path}.model`)) knownModel(route.model, `${path}.model`)
      } else {
        c.expected(route, path, `{role} or {model}`)
      }
    }
  } else {
    c.expected(value.builtinRoutes, 'routing.builtinRoutes', `an object`)
  }
  c.string(value.forkAdvice, 'routing.forkAdvice')
  c.string(value.mainGuidance, 'routing.mainGuidance')
  c.string(value.reviewGuidance, 'routing.reviewGuidance')
  return skills.map(skill => skill.name)
}

/**
 * `permissions.allow`'s rules that are non-empty strings (decision 080). Anything else under `permissions` is dropped,
 * never an error: a mistyped rule may not cost the project its configuration (one that does not validate is none).
 */
export function allowRules(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.allow)) return []
  return value.allow.filter((rule): rule is string => typeof rule === 'string' && rule.trim() !== '')
}

/** The configuration when it holds together, else every error as `path: what is wrong`. Never throws. */
export function validateConfig(raw: unknown): ConfigResult {
  const c = new Checker()
  if (!c.record(raw, 'config', ['version', 'project', 'tickets', 'worktree', 'workflow', 'phases', 'review', 'waits', 'checks', 'env', 'repoActions', 'routing', 'delivery'], ['permissions'])) {
    return { ok: false, errors: c.errors }
  }
  if (raw.version !== undefined && raw.version !== CONFIG_VERSION) c.expected(raw.version, 'version', `${CONFIG_VERSION}`)
  // A module already reported missing is not checked again.
  const at = <T>(key: string, check: (value: unknown) => T, missing: T): T => (raw[key] !== undefined ? check(raw[key]) : missing)
  at('project', value => checkProject(c, value), undefined)
  const tickets = at('tickets', value => checkTickets(c, value), null)
  at('worktree', value => checkWorktree(c, value, tickets), undefined)
  const steps = at('workflow', value => checkWorkflow(c, value, tickets), {})
  at('phases', value => checkPhases(c, value), undefined)
  const reviewSkill = at('review', value => checkReview(c, value), null)
  at('waits', value => checkWaits(c, value), undefined)
  at('checks', value => checkChecks(c, value), undefined)
  const envSkill = at('env', value => checkEnv(c, value), null)
  const actionSkills = at('repoActions', value => checkRepoActions(c, value), [])
  const routed = at('routing', value => checkRouting(c, value), null)
  at('delivery', value => c.oneOf(value, 'delivery', ['pr', 'commit'] as const), false)
  // The steps' review is the review module's.
  const reviewStep = steps.review
  if (reviewStep !== undefined && reviewSkill !== null && reviewStep.skill !== reviewSkill) c.fail('workflow.steps.review.skill', `'${reviewStep.skill}' differs from review.skill '${reviewSkill}'`)
  // A routing of its own lists every skill the configuration runs.
  if (routed !== null) {
    const used: [string, string][] = [
      ...Object.entries(steps).map(([key, step]): [string, string] => [`workflow.steps.${key}.skill`, step.skill]),
      ...(reviewSkill !== null ? [['review.skill', reviewSkill] as [string, string]] : []),
      ...(envSkill !== null ? [['env.name', envSkill] as [string, string]] : []),
      ...actionSkills.map((skill, index): [string, string] => [`repoActions[${index}].skill`, skill]),
    ]
    for (const [path, skill] of used) if (!routed.includes(skill)) c.fail(path, `skill '${skill}' is not in routing.skills`)
  }
  if (c.errors.length === 0 && c.missing > 0) c.fail('config', 'a value is missing')
  if (c.errors.length > 0) return { ok: false, errors: c.errors }
  return { ok: true, config: (raw.permissions === undefined ? raw : { ...raw, permissions: { allow: allowRules(raw.permissions) } }) as TowerConfig }
}

// ── Which configuration a folder gets ─────────────────────────────────────

/**
 * TOWER_MODE=free (decision 060): bin/CCtower started a free Tower (a folder with no project); every session of it
 * takes the free configuration, whatever its folder holds.
 */
export function isFreeMode(value: string | null | undefined): boolean {
  return value === 'free'
}

/** TOWER_MODE=design (decision 064): bin/CCtower started a design Tower (a New project folder); every session of it takes the design configuration. */
export function isDesignMode(value: string | null | undefined): boolean {
  return value === 'design'
}

/** `https://github.com/example/app.git`, `git@github.com:example/app.git` → `example/app`; null for another host or a path. */
export function slugFromRemote(url: string | null): string | null {
  const match = url?.trim().match(/^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/)
  return match ? `${match[1]}/${match[2]}` : null
}

export type ConfigInput = {
  /** The main checkout of the folder Tower opens in (for a worktree, the checkout it belongs to). */
  repoRoot: string
  /** Its origin's `owner/name`, when it is on GitHub. */
  remoteSlug: string | null
  /** The checkout named by TOWER_REPO (environment or the plugin's .env): the edition's project there (decision 083). */
  towerRepo?: string | null
  /** The stored configuration (`<state dir>/projects/<id>.json`, parsed), when there is one. */
  stored: unknown
}

/**
 * Decision 083: what an edition brings, `EDITION` of its folder's index.ts (null without one). Its configuration is taken
 * for a checkout whose origin is `config.project.repo`, and for the one TOWER_REPO names when nothing else resolves.
 */
export type Edition = { config: TowerConfig }

/** The edition's configuration (decision 083); null when this tree has none. */
export function editionConfig(): TowerConfig | null {
  return EDITION?.config ?? null
}

export type ResolvedConfig = { config: TowerConfig; source: 'edition' | 'stored' }

/** The main checkout of a folder: the first `worktree` line of its `git worktree list --porcelain`; null without one. */
export function mainCheckoutFromListing(listing: string | null): string | null {
  const path = listing !== null ? /^worktree (.+)$/m.exec(listing)?.[1]?.trim() : undefined
  return path ? path : null
}

/** A project's id: its main checkout's path, every character but letters and digits a `-` (as bin/CCtower's tower_config_for). */
export function projectId(mainCheckout: string): string {
  return mainCheckout.replace(/[^a-zA-Z0-9]/g, '-')
}

/** Where a project's stored configuration lives: `<state dir>/projects/<id>.json`. */
export function storedConfigPath(state: string, mainCheckout: string): string {
  return `${state.replace(/\/+$/, '')}/projects/${projectId(mainCheckout)}.json`
}

/**
 * resolveConfig's input from what a session reads: the folder's worktree listing and origin URL (null when git
 * failed), TOWER_REPO, and the stored file's text (undefined without one; text that is not JSON counts as none).
 * Null when the folder is no git checkout.
 */
export function configInputFrom(facts: { listing: string | null; originUrl: string | null; towerRepo: string | null; storedText: string | undefined }): ConfigInput | null {
  const repoRoot = mainCheckoutFromListing(facts.listing)
  if (repoRoot === null) return null
  let stored: unknown
  try {
    stored = facts.storedText === undefined ? undefined : JSON.parse(facts.storedText)
  } catch {
    stored = undefined
  }
  return { repoRoot, remoteSlug: slugFromRemote(facts.originUrl), towerRepo: facts.towerRepo, stored }
}

function samePath(a: string, b: string): boolean {
  return a.replace(/\/+$/, '') === b.replace(/\/+$/, '')
}

/**
 * The edition's project first (decision 083): a checkout whose origin is its repository (worktrees included). Else a
 * stored configuration that validates. Else the checkout TOWER_REPO names is the edition's (a fixture has no GitHub
 * origin): bin/CCtower and the rail hand TOWER_REPO to every session they start, a stored configuration's included, so
 * it may not win over one. Else null: the start menu. Without an edition (`edition` null) only a stored one resolves.
 */
export function resolveConfig(input: ConfigInput, edition: TowerConfig | null = editionConfig()): ResolvedConfig | null {
  if (edition !== null && input.remoteSlug !== null && input.remoteSlug.toLowerCase() === edition.project.repo.toLowerCase()) return { config: edition, source: 'edition' }
  const result = input.stored === undefined || input.stored === null ? null : validateConfig(input.stored)
  if (result !== null && result.ok) return { config: result.config, source: 'stored' }
  if (edition !== null && input.towerRepo && samePath(input.towerRepo, input.repoRoot)) return { config: edition, source: 'edition' }
  return null
}
