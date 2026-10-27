// tower-setup's mechanical part (decision 061, plan docs/plans/general-tower.md "tower-setup"): the facts a repository's
// files and git say, each with its source, and the configuration they map to. Pure: the caller (tools/tower-cli.mjs)
// reads the files and runs the read-only git commands; nothing here touches a file, a process or the network.
// The skill (skills/tower-setup) reads the rest, asks the person what no document says, and edits the proposal.

import { projectId, slugFromRemote, ticketIdPattern, validateConfig, type CheckSource, type EnvConfig, type Pattern, type PhaseName, type RepoAction, type TicketsConfig, type TowerConfig, type WaitRule, type WorkflowStep } from './config'
import { parseSkillFile, type RepoSkill } from './routingDefaults'
import { parseWorktreePorcelain, worktreeTicketId } from './worktrees'

/** What the caller gathers from the main checkout (every git command read-only). */
export type ScanInput = {
  /** The main checkout: the first `worktree` of `git worktree list --porcelain`. */
  root: string
  home: string | null
  /** `git remote get-url origin`. */
  originUrl: string | null
  /** `git symbolic-ref --short refs/remotes/origin/HEAD` (`origin/main`). */
  originHead: string | null
  /** `git worktree list --porcelain`. */
  listing: string | null
  /** `git for-each-ref --format=%(refname:short) refs/heads`. */
  branches: string[]
  /** `git tag --sort=-creatordate`, newest first. */
  tags: string[]
  /** `git ls-files --cached --others --exclude-standard`, relative to the root. */
  paths: string[]
  /** The text of the files `textsToRead` and `referencedDocs` name, by relative path. */
  texts: Record<string, string>
}

/** Where a fact comes from: `path:line`, or `git: …`. */
export type Evidence = string
export type Fact<T> = { value: T; evidence: Evidence[] }
export type Confidence = '✓' | '?' | '✗'

/** The stages of Tower's reference flow (skills/tower-setup/reference-flow.md). */
export const FLOW_STAGES = ['capture', 'plan', 'verification', 'pr', 'review', 'merge', 'release'] as const
export type FlowStage = (typeof FLOW_STAGES)[number]
export type Coverage = 'yes' | 'partial' | 'no'

export type ScanFacts = {
  root: string
  /** The root with the home folder as `~`. */
  mainCheckout: string
  projectId: string
  remote: { url: string; slug: string | null } | null
  /** origin's HEAD branch. */
  defaultBranch: string | null
  name: Fact<string>
  baseBranch: Fact<string>
  instructions: string[]
  docs: string[]
  stack: Fact<string>[]
  scripts: Fact<string>[]
  /** Tests exist: a test script, or test files and folders. */
  tests: Fact<boolean>
  skills: (RepoSkill & { path: string })[]
  workflows: { path: string; pullRequest: boolean }[]
  /** The workflow's skills by step (`start`, `openPr`, `review`, `wrapUp`, `release`, `repro`) and the capture skills. */
  steps: Record<string, Fact<string>>
  capture: Fact<string>[]
  tickets: Fact<'linear' | 'github' | 'none'> & { prefix: string | null; repo: string | null }
  /** The start skill cuts a blocked ticket's worktree from its blocker's branch. */
  stackOnBlocker: Fact<boolean>
  stateFile: (Fact<string> & { phases: Fact<string[]>; checks: Fact<boolean> }) | null
  review: ReviewFacts | null
  ci: Fact<boolean>
  releaseTags: Fact<string> | null
  env: Fact<EnvConfig>
  waits: Fact<string>[]
  worktrees: { path: string; branch: string | null; ticket: string | null }[]
  /** The local branches by their first part (`fix/`, `feature/`, `me/`; `(none)` without a slash), most first. */
  branchPrefixes: { prefix: string; count: number }[]
  rules: { noDirectToMain: Fact<string> | null; language: Fact<string> | null }
  notSupported: Fact<string>[]
  flow: { stage: FlowStage; coverage: Coverage; skills: string[]; evidence: Evidence[] }[]
  outcome: 'complete' | 'partial' | 'none'
}

export type ReviewFacts = {
  skill: string
  heading: Fact<string> | null
  sections: Fact<string[]>
  verdict: Fact<{ ready: string; fixes: string }> | null
  blockers: Fact<{ heading: string; none: string }> | null
}

export type ProposalItem = { path: string; value: unknown; confidence: Confidence; evidence: Evidence[]; note: string }

export type Proposal = {
  config: TowerConfig
  items: ProposalItem[]
  notSupported: Fact<string>[]
  /** What no document answers, for the skill to ask, one at a time. */
  questions: string[]
  /** validateConfig's errors (none when the proposal holds together). */
  errors: string[]
}

// ── Which files to read ───────────────────────────────────────────────────

const MAX_DEPTH = 4
const MAX_DOCS = 30

function depth(path: string): number {
  return path.split('/').length
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function dirName(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut < 0 ? '' : path.slice(0, cut)
}

const SKILL_FILE = /^\.claude\/skills\/([^/]+)\/SKILL\.md$/
const WORKFLOW_FILE = /^\.github\/workflows\/[^/]+\.ya?ml$/

/** The files read first: every CLAUDE.md and AGENTS.md, the README, the skills, the workflows, the root package.json and Makefile. */
export function textsToRead(paths: readonly string[]): string[] {
  return paths.filter(path => {
    const name = baseName(path)
    if ((name === 'CLAUDE.md' || name === 'AGENTS.md') && depth(path) <= MAX_DEPTH && !path.includes('node_modules/')) return true
    if (/^README(\.md)?$/i.test(path)) return true
    if (path === 'package.json' || path === 'Makefile') return true
    return SKILL_FILE.test(path) || WORKFLOW_FILE.test(path)
  })
}

const DOC_MENTION = /(?:^|[\s`'"(\[])((?:[\w.-]+\/)*[\w.-]+\.md)\b/g

/** The documents the instructions and the skills name (`docs/WORKFLOW.md`, `ios/README.md`), when they exist: read second. */
export function referencedDocs(texts: Readonly<Record<string, string>>, paths: readonly string[]): string[] {
  const known = new Set(paths)
  const found = new Set<string>()
  for (const [path, text] of Object.entries(texts)) {
    if (!(SKILL_FILE.test(path) || ['CLAUDE.md', 'AGENTS.md'].includes(baseName(path)))) continue
    for (const match of text.matchAll(DOC_MENTION)) {
      const mention = (match[1] as string).replace(/^\.\//, '')
      if (known.has(mention) && !(mention in texts)) found.add(mention)
    }
  }
  return [...found].sort().slice(0, MAX_DOCS)
}

// ── Reading helpers ───────────────────────────────────────────────────────

/** `path:line` of each line matching `re` in the text, at most `max`. */
function linesOf(texts: Readonly<Record<string, string>>, path: string, re: RegExp, max = 2): Evidence[] {
  const text = texts[path]
  if (text === undefined) return []
  const out: Evidence[] = []
  text.split('\n').forEach((line, index) => {
    if (out.length < max && re.test(line)) out.push(`${path}:${index + 1}`)
  })
  return out
}

function firstLine(texts: Readonly<Record<string, string>>, paths: readonly string[], re: RegExp): Evidence[] {
  for (const path of paths) {
    const found = linesOf(texts, path, re, 1)
    if (found.length > 0) return found
  }
  return []
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: string | null = null
  for (const [value, count] of counts) if (best === null || count > (counts.get(best) ?? 0)) best = value
  return best
}

function withHome(path: string, home: string | null): string {
  if (home === null) return path
  const base = home.replace(/\/+$/, '')
  return path === base ? '~' : path.startsWith(`${base}/`) ? `~${path.slice(base.length)}` : path
}

// ── Skills and steps ──────────────────────────────────────────────────────

/** A step's skill by name, the first rule that matches any skill. */
const STEP_SKILLS: Record<string, RegExp[]> = {
  start: [/^start-ticket$/, /^start-(?:issue|work)$/, /^start$/],
  openPr: [/^open-pr$/, /^(?:create|make)-pr$/, /^publish-pr$/],
  review: [/^review-pr$/, /^review$/, /^pr-review$/],
  wrapUp: [/^wrap-?up$/, /^(?:merge|land)(?:-pr)?$/],
  release: [/^release$/, /^ship$/],
  repro: [/^repro(?:duce)?$/],
}

/** Capture skills and the repository action each becomes (key, label); in this order on the board. */
const CAPTURE_SKILLS: { re: RegExp; key: string; label: string }[] = [
  { re: /^shape$/, key: 's', label: 'shape' },
  { re: /^new-(?:ticket|issue)$/, key: 'n', label: 'new ticket' },
  { re: /^triage$/, key: 't', label: 'triage' },
]

const RELEASE_ACTION = { key: 'l', label: 'release' }

function skillPath(skills: ScanFacts['skills'], name: string | undefined): string | null {
  return skills.find(skill => skill.name === name)?.path ?? null
}

// ── The scan ──────────────────────────────────────────────────────────────

const STACK_FILES: { re: RegExp; what: string }[] = [
  { re: /^(?:[^/]+\/)?package\.json$/, what: 'Node (package.json)' },
  { re: /^(?:[^/]+\/)?Package\.swift$/, what: 'Swift package (Package.swift)' },
  { re: /^(?:[^/]+\/)?project\.yml$/, what: 'XcodeGen (project.yml)' },
  { re: /^(?:[^/]+\/)?[^/]+\.xcodeproj\/project\.pbxproj$/, what: 'Xcode project' },
  { re: /^(?:[^/]+\/)?Dockerfile$/, what: 'Docker (Dockerfile)' },
  { re: /^(?:[^/]+\/)?docker-compose[^/]*\.ya?ml$/, what: 'Docker Compose' },
  { re: /^Makefile$/, what: 'Make (Makefile)' },
  { re: /^(?:[^/]+\/)?Cargo\.toml$/, what: 'Rust (Cargo.toml)' },
  { re: /^(?:[^/]+\/)?go\.mod$/, what: 'Go (go.mod)' },
  { re: /^(?:[^/]+\/)?(?:pyproject\.toml|requirements\.txt)$/, what: 'Python' },
  { re: /^(?:[^/]+\/)?Gemfile$/, what: 'Ruby (Gemfile)' },
  { re: /^(?:[^/]+\/)?(?:build\.gradle(?:\.kts)?|pom\.xml)$/, what: 'JVM (Gradle/Maven)' },
  { re: /^(?:[^/]+\/)?deno\.json$/, what: 'Deno (deno.json)' },
]

function scanStack(paths: readonly string[]): Fact<string>[] {
  const out: Fact<string>[] = []
  for (const { re, what } of STACK_FILES) {
    const found = paths.filter(path => re.test(path) && !path.includes('node_modules/')).slice(0, 3)
    if (found.length > 0) out.push({ value: what, evidence: found })
  }
  return out
}

function scanScripts(texts: Readonly<Record<string, string>>): Fact<string>[] {
  const text = texts['package.json']
  if (text === undefined) return []
  try {
    const scripts = (JSON.parse(text) as { scripts?: Record<string, string> }).scripts ?? {}
    return Object.entries(scripts)
      .filter(([name]) => /^(?:build|test|lint|check|typecheck|e2e)(?::|$)/.test(name))
      .map(([name, command]) => ({ value: `npm run ${name}: ${command}`, evidence: linesOf(texts, 'package.json', new RegExp(`"${escapeRe(name)}"\\s*:`), 1) }))
  } catch {
    return []
  }
}

const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|spec|[\w-]*Tests)\/|\.(?:test|spec)\.[jt]sx?$|_test\.(?:go|py)$|(?:^|\/)test_[\w-]+\.py$/

function scanTests(paths: readonly string[], texts: Readonly<Record<string, string>>): Fact<boolean> {
  const script = linesOf(texts, 'package.json', /"test[\w:-]*"\s*:/, 1)
  const files = paths.filter(path => TEST_PATH.test(path) && !path.includes('node_modules/')).slice(0, 2)
  const evidence = [...script, ...files]
  return { value: evidence.length > 0, evidence }
}

const NOT_NAMES = new Set(['GitHub', 'Linear', 'Git', 'PR', 'TestFlight', 'Claude', 'The', 'This', 'One', 'A'])

/** The product's name: the most common in the skills' descriptions (`a ticket of O!nk`, `a ShopApp ticket`), else the README's title. */
function scanName(texts: Readonly<Record<string, string>>, skills: ScanFacts['skills'], root: string): Fact<string> {
  const names: { name: string; path: string }[] = []
  for (const skill of skills) {
    for (const match of skill.description.matchAll(/\b(?:ticket|issue|pull request|PR) of ([A-Z][\w!.-]*[\w!])(?=[\s.,;:]|$)|\b(?:a|the) ([A-Z][\w!.-]*[\w!]) (?:ticket|issue|pull request|PR)\b/g)) {
      const name = match[1] ?? match[2]
      if (name !== undefined && !NOT_NAMES.has(name)) names.push({ name, path: skill.path })
    }
  }
  const best = mostCommon(names.map(one => one.name))
  if (best !== null && names.filter(one => one.name === best).length >= 2) {
    const paths = [...new Set(names.filter(one => one.name === best).map(one => one.path))].slice(0, 2)
    return { value: best, evidence: paths.flatMap(path => linesOf(texts, path, new RegExp(escapeRe(best)), 1)) }
  }
  const readme = Object.keys(texts).find(path => /^README(\.md)?$/i.test(path))
  const title = readme !== undefined ? /^#\s+(.+)$/m.exec(texts[readme] as string)?.[1] : undefined
  if (title !== undefined && readme !== undefined) {
    const clean = title.split(/\s+[—–-]\s+/)[0]?.replace(/[^\p{L}\p{N}!.' -]/gu, '').trim() ?? ''
    if (clean !== '') return { value: clean, evidence: linesOf(texts, readme, /^#\s+/, 1) }
  }
  return { value: baseName(root), evidence: ['git: the main checkout\'s folder'] }
}

function scanSteps(skills: ScanFacts['skills']): Record<string, Fact<string>> {
  const steps: Record<string, Fact<string>> = {}
  for (const [step, rules] of Object.entries(STEP_SKILLS)) {
    for (const rule of rules) {
      const skill = skills.find(one => rule.test(one.name))
      if (skill !== undefined) {
        steps[step] = { value: skill.name, evidence: [`${skill.path}:1`] }
        break
      }
    }
  }
  return steps
}

/** Where the process is written: the step skills first (in the flow's order), the other skills, then the documents. */
function processTexts(texts: Readonly<Record<string, string>>, skills: ScanFacts['skills'], steps: Record<string, Fact<string>>): string[] {
  const first = Object.keys(STEP_SKILLS).map(step => skillPath(skills, steps[step]?.value)).filter((path): path is string => path !== null)
  const rest = skills.map(skill => skill.path).filter(path => !first.includes(path))
  const docs = Object.keys(texts).filter(path => !SKILL_FILE.test(path) && !WORKFLOW_FILE.test(path) && path.endsWith('.md'))
  return [...first, ...rest, ...docs]
}

function scanTickets(texts: Readonly<Record<string, string>>, steps: Record<string, Fact<string>>, skills: ScanFacts['skills'], instructions: string[], remoteSlug: string | null): ScanFacts['tickets'] {
  const start = skillPath(skills, steps.start?.value)
  const where = [...(start !== null ? [start] : []), ...instructions]
  const linear = firstLine(texts, where, /\bLinear\b/)
  const github = firstLine(texts, where, /\bgh issue\b|\bGitHub issues?\b/i)
  if (linear.length > 0 && (github.length === 0 || (start !== null && linear[0]?.startsWith(start)))) {
    const ids: string[] = []
    for (const path of where) for (const match of (texts[path] ?? '').matchAll(/\b([A-Z][A-Z0-9]{1,9})-\d{1,6}\b/g)) if (!/^(?:UTF|SHA|ISO|RFC|CVE|HTTP|TLS|ES|ASD|STE)/.test(match[1] as string)) ids.push(match[1] as string)
    const prefix = mostCommon(ids)
    return { value: 'linear', evidence: linear, prefix, repo: null }
  }
  if (github.length > 0) {
    const repoMention = where.map(path => /--repo\s+([\w.-]+\/[\w.-]+)/.exec(texts[path] ?? '')?.[1]).find(Boolean) ?? null
    return { value: 'github', evidence: github, prefix: null, repo: repoMention ?? remoteSlug }
  }
  return { value: 'none', evidence: [], prefix: null, repo: remoteSlug }
}

const PHASE_WORDS: Record<string, PhaseName> = {
  planning: 'planning', implementing: 'implementing', implementation: 'implementing', review: 'review', reviewing: 'review', 'in-review': 'review',
}

function scanStateFile(texts: Readonly<Record<string, string>>, where: readonly string[]): ScanFacts['stateFile'] {
  const mentions: { path: string; file: string }[] = []
  for (const path of where) for (const match of (texts[path] ?? '').matchAll(/(?<![\w/.-])(\.?[\w-]+\/(?:[\w-]+\/)*[\w-]*state\.json)\b/g)) mentions.push({ path, file: match[1] as string })
  const file = mostCommon(mentions.map(one => one.file))
  if (file === null) return null
  const fileRe = new RegExp(escapeRe(file))
  const evidence = where.flatMap(path => linesOf(texts, path, fileRe, 1)).slice(0, 2)
  const words = new Set<string>()
  const phaseEvidence: Evidence[] = []
  for (const path of where) {
    ;(texts[path] ?? '').split('\n').forEach((line, index) => {
      if (!/\bphase\b/i.test(line)) return
      let found = false
      for (const match of line.matchAll(/[`"]([a-z][a-z-]+)[`"]/g)) {
        if (PHASE_WORDS[match[1] as string] !== undefined) {
          words.add(match[1] as string)
          found = true
        }
      }
      if (found && phaseEvidence.length < 3) phaseEvidence.push(`${path}:${index + 1}`)
    })
  }
  const order: PhaseName[] = ['planning', 'implementing', 'review']
  const phases = [...words].sort((a, b) => order.indexOf(PHASE_WORDS[a] as PhaseName) - order.indexOf(PHASE_WORDS[b] as PhaseName))
  const checks = where.flatMap(path => linesOf(texts, path, /checks\.sha|"checks"\s*:\s*\{\s*"sha"/, 1)).slice(0, 2)
  return { value: file, evidence, phases: { value: phases, evidence: phaseEvidence }, checks: { value: checks.length > 0, evidence: checks } }
}

/** The review comment's skeleton: its `## <Heading>` line and what follows up to the code fence or the next `##`. */
function skeletonOf(text: string, heading: string): { at: number; lines: string[] } | null {
  const lines = text.split('\n')
  const re = new RegExp(`^##\\s+${escapeRe(heading)}\\b(?:\\s*\\(round\\s+N\\))?\\s*$`, 'i')
  const at = lines.findIndex(line => re.test(line.trim()))
  if (at < 0) return null
  const body: string[] = []
  for (let index = at + 1; index < lines.length; index++) {
    const line = (lines[index] as string).trim()
    if (/^```/.test(line) || /^##\s/.test(line)) break
    body.push(lines[index] as string)
  }
  return { at, lines: body }
}

function scanReview(texts: Readonly<Record<string, string>>, skill: string | null, skills: ScanFacts['skills'], docs: readonly string[]): ReviewFacts | null {
  if (skill === null) return null
  const own = skillPath(skills, skill)
  const ownText = own !== null ? texts[own] ?? '' : ''
  // The skill first, then the documents it names.
  const named = docs.filter(doc => ownText.includes(doc))
  const where = [...(own !== null ? [own] : []), ...named]
  let heading: Fact<string> | null = null
  for (const path of where) {
    const lines = (texts[path] ?? '').split('\n')
    const index = lines.findIndex(line => /##\s+[A-Z][\w-]*(?: [A-Za-z][\w-]*)?\s*\(round\s+N\)/.test(line))
    if (index >= 0) {
      const word = /##\s+([A-Z][\w-]*(?: [A-Za-z][\w-]*)?)\s*\(round\s+N\)/.exec(lines[index] as string)?.[1] as string
      heading = { value: word, evidence: [`${path}:${index + 1}`] }
      break
    }
  }
  let sections: Fact<string[]> = { value: [], evidence: [] }
  let verdict: ReviewFacts['verdict'] = null
  let blockers: ReviewFacts['blockers'] = null
  if (heading !== null) {
    for (const path of where) {
      const found = skeletonOf(texts[path] ?? '', heading.value)
      if (found === null) continue
      const names: string[] = []
      found.lines.forEach((line, offset) => {
        const section = /^###\s+(.+?)\s*$/.exec(line.trim())?.[1]
        // reviewBox reads a section's name as a regular expression: only plain words.
        if (section !== undefined && /^[\w ,'-]+$/.test(section)) names.push(section)
        const verdictLine = /^Verdict:\s*(.+?)\s*\|\s*(.+?)\s*$/.exec(line.trim())
        if (verdictLine !== null && verdict === null) verdict = { value: { ready: verdictLine[1] as string, fixes: verdictLine[2] as string }, evidence: [`${path}:${found.at + offset + 2}`] }
        if (section !== undefined && /blocker/i.test(section) && blockers === null) {
          const next = found.lines.slice(offset + 1, offset + 3).join(' ')
          const none = /if none[^`]*`([^`]+)`/i.exec(next)?.[1]
          if (none !== undefined) blockers = { value: { heading: section, none }, evidence: [`${path}:${found.at + offset + 2}`] }
        }
      })
      sections = { value: names, evidence: [`${path}:${found.at + 1}`] }
      break
    }
  }
  return { skill, heading, sections, verdict, blockers }
}

function scanEnv(texts: Readonly<Record<string, string>>, skills: ScanFacts['skills'], where: readonly string[], tickets: string): Fact<EnvConfig> {
  const skill = skills.find(one => /^(?:dev-)?env$|^stack$/.test(one.name))
  if (skill !== undefined) {
    const text = texts[skill.path] ?? ''
    const ports = /ports?\s*\**\s*(\d{4,5})\s*\**\s*(?:to|through|–|-)\s*\**\s*(\d{4,5})/i.exec(text)
    const first = ports ? Number(ports[1]) : 0
    const last = ports ? Number(ports[2]) : 0
    return {
      value: { kind: 'skill', name: skill.name, ports: ports && last >= first ? { first, slots: last - first + 1 } : null },
      evidence: [`${skill.path}:1`, ...(ports ? linesOf(texts, skill.path, /ports?\s*\**\s*\d{4,5}\s*\**\s*(?:to|through|–|-)/i, 1) : [])],
    }
  }
  for (const path of where) {
    const lines = (texts[path] ?? '').split('\n')
    for (let index = 0; index < lines.length; index++) {
      const match = /(iPhone[\w ]*?\([^)\n`]*<(?:issue|n|number|ticket|key)>[^)\n`]*\))/.exec(lines[index] as string)
      if (match !== null) {
        const nameTemplate = (match[1] as string).replace(/<(?:issue|n|number|ticket|key)>/, tickets === 'linear' ? '{key}' : '{n}')
        return { value: { kind: 'simulator', nameTemplate }, evidence: [`${path}:${index + 1}`] }
      }
    }
  }
  return { value: { kind: 'none' }, evidence: [] }
}

/** The kinds of question the flow's skills wait on, from their own words. */
function scanWaits(texts: Readonly<Record<string, string>>, steps: Record<string, Fact<string>>, capture: Fact<string>[], skills: ScanFacts['skills']): Fact<string>[] {
  const out: Fact<string>[] = []
  const check = (kind: string, skill: string | undefined, re: RegExp) => {
    const path = skillPath(skills, skill)
    const found = path !== null ? linesOf(texts, path, re, 2) : []
    if (found.length > 0) out.push({ value: kind, evidence: found })
  }
  check('openPr', steps.openPr?.value, /^>\s.*\?|\bask\b[^.]*\bbefore you commit\b/i)
  check('post', steps.review?.value, /\bpost\b[^.]*\bonly after\b|\bonly after\b[^.]*\b(?:yes|agree)/i)
  check('merge', steps.wrapUp?.value, /explicit yes|wait for a yes|never merge without/i)
  for (const one of capture) {
    if (out.some(fact => fact.value === 'issue')) break
    check('issue', one.value, /explicit (?:yes|confirmation)/i)
  }
  check('release', steps.release?.value, /wait for (?:a yes|explicit confirmation)|explicit yes/i)
  return out
}

function scanRules(texts: Readonly<Record<string, string>>, instructions: readonly string[], where: readonly string[]): ScanFacts['rules'] {
  const rule = firstLine(texts, instructions, /reach(?:es)? `?main`? through a pull request|nothing (?:merges|reaches `?main`?) without|never (?:push|commit) (?:directly )?(?:to|on) `?main|no direct (?:push|commit)/i)
  let language: Fact<string> | null = null
  for (const path of [...instructions, ...where]) {
    const lines = (texts[path] ?? '').split('\n')
    const index = lines.findIndex(line => /conversation with the (?:user|owner) is in \w+|talk to the (?:user|owner) in \w+/i.test(line))
    if (index >= 0) {
      const word = /conversation with the (?:user|owner) is in (\w+)|talk to the (?:user|owner) in (\w+)/i.exec(lines[index] as string)
      language = { value: (word?.[1] ?? word?.[2]) as string, evidence: [`${path}:${index + 1}`] }
      break
    }
  }
  return { noDirectToMain: rule.length > 0 ? { value: 'changes reach the base branch through a pull request', evidence: rule } : null, language }
}

function branchPrefixes(branches: readonly string[]): ScanFacts['branchPrefixes'] {
  const counts = new Map<string, number>()
  for (const branch of branches) {
    const cut = branch.indexOf('/')
    const prefix = cut < 0 ? '(none)' : branch.slice(0, cut + 1)
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
  }
  return [...counts].map(([prefix, count]) => ({ prefix, count })).sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix))
}

function scanReleaseTags(tags: readonly string[]): Fact<string> | null {
  const prefixes = tags.map(tag => /^([A-Za-z]+[-_])\d+$/.exec(tag)?.[1]).filter((prefix): prefix is string => prefix !== undefined)
  const best = mostCommon(prefixes)
  if (best === null) return null
  const matching = tags.filter(tag => tag.startsWith(best) && /^\d+$/.test(tag.slice(best.length)))
  if (matching.length < 2) return null
  return { value: `${best}{n}`, evidence: [`git tag: ${matching.slice(0, 3).join(', ')}${matching.length > 3 ? ', …' : ''} (${matching.length})`] }
}

function scanNotSupported(texts: Readonly<Record<string, string>>, paths: readonly string[], where: readonly string[], facts: Pick<ScanFacts, 'steps' | 'env' | 'releaseTags'>, tags: readonly string[]): Fact<string>[] {
  const out: Fact<string>[] = []
  const visual = where.flatMap(path => linesOf(texts, path, /approv\w* the visual|visual (?:approval|approved)|the visual with every state/i, 1)).slice(0, 2)
  if (visual.length > 0) out.push({ value: 'the visual approval of a feature before its merge', evidence: visual })
  if (facts.steps.repro !== undefined) out.push({ value: 'repro\'s confidence and evidence (the REPRO box is planned, not built)', evidence: facts.steps.repro.evidence })
  if (facts.env.value.kind === 'simulator') out.push({ value: 'the ticket\'s simulator (env `simulator` is stored, no box draws it yet)', evidence: facts.env.evidence })
  if (facts.steps.release !== undefined && facts.releaseTags === null && tags.length > 0) out.push({ value: `release tags like \`${tags[0]}\` (only \`<prefix><n>\` tags are read)`, evidence: ['git tag'] })
  if (paths.some(path => path.startsWith('changelog.d/'))) out.push({ value: 'changelog fragments (`changelog.d/`): checked by the skills, not shown by Tower', evidence: ['changelog.d/'] })
  return out
}

function scanFlow(facts: Omit<ScanFacts, 'flow' | 'outcome'>, deployOnPush: boolean): ScanFacts['flow'] {
  const step = (name: string) => facts.steps[name]
  const row = (stage: FlowStage, coverage: Coverage, skills: (Fact<string> | undefined)[], evidence: Evidence[] = []): ScanFacts['flow'][number] => {
    const present = skills.filter((one): one is Fact<string> => one !== undefined)
    return { stage, coverage, skills: present.map(one => one.value), evidence: [...present.flatMap(one => one.evidence), ...evidence] }
  }
  const start = step('start')
  return [
    row('capture', facts.capture.length > 0 ? 'yes' : 'no', facts.capture),
    row('plan', start === undefined ? 'no' : facts.stateFile !== null ? 'yes' : 'partial', [start, step('repro')], facts.stateFile?.evidence ?? []),
    row('verification', facts.ci.value || facts.stateFile?.checks.value ? 'yes' : 'no', [], [...facts.ci.evidence, ...(facts.stateFile?.checks.evidence ?? [])]),
    row('pr', step('openPr') !== undefined ? 'yes' : 'no', [step('openPr')]),
    row('review', step('review') === undefined ? 'no' : facts.review?.heading !== null && (facts.review?.verdict !== null || facts.review?.blockers !== null) ? 'yes' : 'partial', [step('review')], facts.review?.heading?.evidence ?? []),
    row('merge', step('wrapUp') !== undefined ? 'yes' : 'no', [step('wrapUp')]),
    row('release', step('release') !== undefined ? 'yes' : facts.releaseTags !== null || deployOnPush ? 'partial' : 'no', [step('release')], facts.releaseTags?.evidence ?? []),
  ]
}

/** Every fact the files and git give, each with where it comes from. */
export function scanRepo(input: ScanInput): ScanFacts {
  const { texts, paths } = input
  const slug = slugFromRemote(input.originUrl)
  const instructions = Object.keys(texts).filter(path => ['CLAUDE.md', 'AGENTS.md'].includes(baseName(path)) || /^README(\.md)?$/i.test(path)).sort((a, b) => depth(a) - depth(b))
  const skills = Object.keys(texts)
    .map(path => ({ path, folder: SKILL_FILE.exec(path)?.[1] }))
    .filter((one): one is { path: string; folder: string } => one.folder !== undefined)
    .map(one => ({ ...(parseSkillFile(texts[one.path] as string, one.folder) ?? { name: one.folder, description: '' }), path: one.path }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const workflows = Object.keys(texts).filter(path => WORKFLOW_FILE.test(path)).sort().map(path => ({
    path,
    pullRequest: /^\s*pull_request(?:_target)?\s*:|^\s*-\s*pull_request\b|^on:.*\bpull_request\b/m.test(texts[path] as string),
  }))
  const deployOnPush = Object.keys(texts).some(path => WORKFLOW_FILE.test(path) && /deploy|release/i.test(path) && /^\s*push\s*:|^\s*tags\s*:/m.test(texts[path] as string))
  const steps = scanSteps(skills)
  const capture = skills.filter(skill => CAPTURE_SKILLS.some(one => one.re.test(skill.name))).map(skill => ({ value: skill.name, evidence: [`${skill.path}:1`] }))
  const docs = paths.filter(path => /^docs\/.+\.md$/.test(path)).sort().slice(0, 40)
  const where = processTexts(texts, skills, steps)
  const tickets = scanTickets(texts, steps, skills, instructions, slug)
  const start = skillPath(skills, steps.start?.value)
  const bases = start !== null ? [...(texts[start] ?? '').matchAll(/\borigin\/([\w.-]+)\b/g)].map(match => match[1] as string) : []
  const base = mostCommon(bases)
  const defaultBranch = input.originHead?.replace(/^origin\//, '') ?? null
  const baseBranch: Fact<string> = base !== null && start !== null
    ? { value: base, evidence: linesOf(texts, start, new RegExp(`origin/${escapeRe(base)}\\b`), 1) }
    : { value: defaultBranch ?? 'main', evidence: defaultBranch !== null ? [`git: ${input.originHead} (origin's HEAD)`] : [] }
  const blocker = start !== null ? linesOf(texts, start, /blocker[^.]*\bbranch\b|\bbranch\b[^.]*blocker/i, 1) : []
  const stateFile = scanStateFile(texts, where)
  const review = scanReview(texts, steps.review?.value ?? null, skills, Object.keys(texts).filter(path => !SKILL_FILE.test(path)))
  const ci: Fact<boolean> = { value: workflows.some(one => one.pullRequest), evidence: workflows.filter(one => one.pullRequest).map(one => one.path).slice(0, 3) }
  const releaseTags = steps.release !== undefined ? scanReleaseTags(input.tags) : null
  const env = scanEnv(texts, skills, where, tickets.value)
  const entries = input.listing !== null ? parseWorktreePorcelain(input.listing) : []
  const idPattern = ticketIdPattern(ticketsConfig(tickets))
  const worktrees = entries.slice(1).filter(entry => !entry.isBare && !entry.isPrunable).map(entry => ({ path: withHome(entry.path, input.home), branch: entry.branch, ticket: worktreeTicketId(entry, idPattern) }))
  const facts: Omit<ScanFacts, 'flow' | 'outcome'> = {
    root: input.root,
    mainCheckout: withHome(input.root, input.home),
    projectId: projectId(input.root),
    remote: input.originUrl !== null ? { url: input.originUrl, slug } : null,
    defaultBranch,
    name: scanName(texts, skills, input.root),
    baseBranch,
    instructions,
    docs,
    stack: scanStack(paths),
    scripts: scanScripts(texts),
    tests: scanTests(paths, texts),
    skills,
    workflows,
    steps,
    capture,
    tickets,
    stackOnBlocker: { value: blocker.length > 0, evidence: blocker },
    stateFile,
    review,
    ci,
    releaseTags,
    env,
    waits: scanWaits(texts, steps, capture, skills),
    worktrees,
    branchPrefixes: branchPrefixes(input.branches),
    rules: scanRules(texts, instructions, where),
    notSupported: [],
  }
  facts.notSupported = scanNotSupported(texts, paths, where, facts, input.tags)
  const flow = scanFlow(facts, deployOnPush)
  const core = ['start', 'openPr', 'review', 'wrapUp'].filter(name => steps[name] !== undefined).length
  const outcome = flow.every(row => row.coverage === 'yes') ? 'complete' : core === 0 ? 'none' : 'partial'
  return { ...facts, flow, outcome }
}

// ── The proposal ──────────────────────────────────────────────────────────

/** Tower's Linear candidates (linear.ts LINEAR_QUERY): the free bugs, and the person's own. */
export const LINEAR_DEFAULT_QUERY = { first: 50, candidateLabel: 'bug', candidateStates: ['backlog', 'unstarted'], mineStates: ['backlog', 'unstarted', 'started'] }

/** Tower's wait patterns by kind (`openPr` and `post` as profile.ts AWAY_QUESTIONS); away mode answers only `openPr`. */
export const WAIT_LIBRARY: Record<string, WaitRule> = {
  openPr: { patterns: [{ source: 'mark the pr ready', flags: 'i' }, { source: 'commit', flags: 'i' }], awayAnswer: 'yes' },
  post: { patterns: [{ source: '\\b(?:post|publish)\\b(?!-)', flags: 'i' }, { source: '\\bpubblic', flags: 'i' }, { source: '\\bcomment on the PR\\b', flags: 'i' }, { source: 'gh pr comment', flags: 'i' }], awayAnswer: null },
  merge: { patterns: [{ source: '\\bmerge\\b', flags: 'i' }], awayAnswer: null },
  issue: { patterns: [{ source: '\\b(?:create|open|file)\\b.*\\bissue\\b', flags: 'i' }], awayAnswer: null },
  release: { patterns: [{ source: '\\brelease\\b', flags: 'i' }], awayAnswer: null },
}

function ticketsConfig(tickets: ScanFacts['tickets']): TicketsConfig {
  if (tickets.value === 'linear') {
    const prefix = tickets.prefix ?? 'TICKET'
    const lower = escapeRe(prefix.toLowerCase())
    return {
      kind: 'linear',
      team: null,
      query: { ...LINEAR_DEFAULT_QUERY, candidateStates: [...LINEAR_DEFAULT_QUERY.candidateStates], mineStates: [...LINEAR_DEFAULT_QUERY.mineStates] },
      idPattern: { source: `(?:^|[^a-z0-9])(${lower}-\\d+)`, flags: 'i' },
      inputPattern: { source: `^(?:${lower}-)?(\\d+)$`, flags: 'i' },
      idTemplate: `${prefix}-{n}`,
    }
  }
  if (tickets.value === 'github' && tickets.repo !== null) {
    return {
      kind: 'github',
      repo: tickets.repo,
      labels: { kinds: { bug: 'fix' }, defaultKind: 'feature' },
      mineFirst: true,
      idPattern: { source: '^(?:fix|feature)/(\\d+)-', flags: '' },
      folderPattern: { source: '^(\\d+)-', flags: '' },
    }
  }
  return { kind: 'none' }
}

function headingPattern(word: string): Pattern {
  return { source: `^##\\s+${escapeRe(word).replace(/ /g, '\\s+')}\\b(?:\\s+\\(round\\s+(\\d+)\\))?.*$`, flags: 'im' }
}

function verdictPattern(words: string): Pattern {
  return { source: `^Verdict:\\s*${escapeRe(words)}\\b`, flags: 'im' }
}

/**
 * The configuration the facts map to, with Tower's conventions (plan "Conventions"): worktrees under
 * `~/tower-work/<repo>/` at once (`followExisting` false; open worktrees stay where they are), Linear's branch
 * name or `fix|feature/<n>-<slug>`, Tower's routing defaults; `delivery` as suggested, always asked.
 */
export function proposeConfig(facts: ScanFacts): Proposal {
  const items: ProposalItem[] = []
  const item = (path: string, value: unknown, confidence: Confidence, evidence: Evidence[], note = '') => {
    items.push({ path, value, confidence, evidence, note })
    return value
  }
  const questions: string[] = []
  const slug = facts.remote?.slug ?? null

  const tickets = ticketsConfig(facts.tickets)
  const repoSlug = slug ?? (tickets.kind === 'github' ? tickets.repo : null)
  const project = {
    name: item('project.name', facts.name.value, facts.name.evidence.some(one => one.startsWith('.claude/')) ? '✓' : '?', facts.name.evidence, 'shown in the header; the name the documents use') as string,
    repo: item('project.repo', repoSlug ?? 'owner/name', slug !== null ? '✓' : repoSlug !== null ? '?' : '✗', slug !== null ? [`git: origin ${facts.remote?.url}`] : facts.tickets.evidence,
      slug !== null ? '' : repoSlug !== null ? 'no GitHub origin yet: the repository the skills name for the issues' : 'no GitHub origin: Tower reads pull requests and issues through gh') as string,
    baseBranch: item('project.baseBranch', facts.baseBranch.value, facts.baseBranch.evidence.length > 0 ? '✓' : '?', facts.baseBranch.evidence, facts.baseBranch.value !== facts.defaultBranch && facts.defaultBranch !== null ? `the skills cut tickets from ${facts.baseBranch.value}; origin's HEAD is ${facts.defaultBranch}` : '') as string,
    mainCheckout: item('project.mainCheckout', facts.mainCheckout, '✓', [`git: worktree list (first entry ${facts.root})`]) as string,
  }

  const ticketNote = tickets.kind === 'linear' ? `ids ${tickets.idTemplate}; Tower's candidate query (free bugs, then yours)` : tickets.kind === 'github' ? `issues of ${tickets.repo}; bug → fix/, else feature/` : 'no ticket source found'
  item('tickets', tickets, facts.tickets.value === 'none' ? '?' : '✓', facts.tickets.evidence, ticketNote)
  if (facts.tickets.value === 'none') questions.push('Where do the tickets live (GitHub issues of this repository, Linear, none)?')

  const repo = (slug?.split('/')[1] ?? baseName(facts.root)).toLowerCase()
  const keyPart = tickets.kind === 'github' ? '{n}' : '{key}'
  const ticketWorktrees = facts.worktrees.filter(one => one.ticket !== null)
  const branch = tickets.kind === 'linear'
    ? { kind: 'linear-branch-name' as const, fallback: '{keyLower}-{slug}' }
    : tickets.kind === 'github'
      ? { kind: 'template' as const, template: '{kind}/{n}-{slug}', kindFromLabel: true }
      : { kind: 'template' as const, template: 'feature/{slug}', kindFromLabel: false }
  const worktree = {
    pathTemplate: item('worktree.pathTemplate', `~/tower-work/${repo}/${keyPart}-{slug}`, '✓', [], 'Tower\'s convention: every worktree outside the repository') as string,
    // Every repository moves to the convention at once (plan "Moving over"): new tickets use the new place.
    followExisting: item('worktree.followExisting', false, '✓', ['Tower\'s convention (plan "Conventions", "Moving over")'],
      ticketWorktrees.length > 0
        ? `new ticket worktrees go to ~/tower-work at once; the ${ticketWorktrees.length} open ones (${ticketWorktrees.slice(0, 5).map(one => `${one.path} ${one.ticket}`).join(', ')}${ticketWorktrees.length > 5 ? ', …' : ''}) stay where they are until their ticket closes; Tower still finds them through git worktree list`
        : 'new ticket worktrees go to ~/tower-work at once') as boolean,
    branch: item('worktree.branch', branch, '✓', [], tickets.kind === 'linear' ? 'the branch Linear suggests (it links branch and PR)' : 'Tower\'s convention: fix/<n>-<slug> for a bug, else feature/<n>-<slug>') as typeof branch,
    slugMax: 40,
    stackOnBlocker: item('worktree.stackOnBlocker', tickets.kind === 'linear' && facts.stackOnBlocker.value, '✓', facts.stackOnBlocker.evidence,
      tickets.kind !== 'linear' ? 'only Linear gives Tower a ticket\'s blockers' : facts.stackOnBlocker.value ? 'a blocked ticket starts from its blocker\'s branch' : 'the start skill does not stack on blockers') as boolean,
  }

  const phasesWithReview = facts.stateFile?.phases.value.some(word => PHASE_WORDS[word] === 'review') ?? false
  const steps: Record<string, WorkflowStep> = {}
  const stepItem = (key: string, step: WorkflowStep, missingNote: string) => {
    const found = facts.steps[key]
    steps[key] = step
    item(`workflow.steps.${key}`, step, found !== undefined ? '✓' : '✗', found?.evidence ?? [], found !== undefined ? '' : missingNote)
  }
  stepItem('start', { skill: facts.steps.start?.value ?? 'start-ticket', args: tickets.kind === 'github' ? '{n}' : '{key}', phase: 'not started', session: 'ticket' }, 'no start skill: Tower opens a plain session with the ticket (minimal Tower); a start skill is a proposal for later')
  if (facts.steps.openPr !== undefined) stepItem('openPr', { skill: facts.steps.openPr.value, args: '', phase: 'implementing', session: 'ticket' }, '')
  const reviewSkill = facts.steps.review?.value ?? 'code-review'
  stepItem('review', { skill: reviewSkill, args: '{pr}', phase: phasesWithReview ? 'review' : null, session: 'review' }, 'no review skill: Claude Code\'s /code-review')
  if (facts.steps.wrapUp !== undefined) stepItem('wrapUp', { skill: facts.steps.wrapUp.value, args: '{pr}', phase: null, session: 'ticket' }, '')
  if (facts.steps.release !== undefined) stepItem('release', { skill: facts.steps.release.value, args: '', phase: null, session: 'hub' }, '')

  const statePath = facts.stateFile?.value ?? null
  const phases = statePath !== null && facts.stateFile !== null && facts.stateFile.phases.value.length > 0
    ? { source: 'state-file' as const, path: statePath, values: facts.stateFile.phases.value, mapping: Object.fromEntries(facts.stateFile.phases.value.map(word => [word, PHASE_WORDS[word] as PhaseName])), unknownAs: 'implementing' as const }
    : { source: 'git' as const }
  item('phases', phases, phases.source === 'state-file' ? '✓' : '?', [...(facts.stateFile?.evidence ?? []), ...(facts.stateFile?.phases.evidence ?? [])], phases.source === 'state-file' ? 'a missing file is not started, one that exists means started' : 'no state file: phases from git (no commits, commits, open PR, merged)')

  const reviewed = facts.review
  const heading = reviewed?.heading?.value ?? 'Review'
  const verdictFact = reviewed?.verdict ?? null
  const blockersFact = reviewed?.blockers ?? null
  const fallbackVerdict = verdictFact === null && blockersFact === null
  const review = {
    skill: reviewSkill,
    args: '{pr}',
    heading: item('review.heading', headingPattern(heading), reviewed?.heading ? '✓' : '?', reviewed?.heading?.evidence ?? [], `## ${heading} (round N)`) as Pattern,
    roundPattern: { source: '\\(round\\s+(\\d+)\\)', flags: 'i' },
    sections: item('review.sections', reviewed?.sections.value ?? [], reviewed?.sections.value.length ? '✓' : '?', reviewed?.sections.evidence ?? [], 'two of them in an answer mean the review is shown') as string[],
    verdict: item('review.verdict', verdictFact !== null ? { ready: verdictPattern(verdictFact.value.ready), fixes: verdictPattern(verdictFact.value.fixes) } : fallbackVerdict ? { ready: verdictPattern('ready to merge'), fixes: verdictPattern('fixes needed') } : null,
      verdictFact !== null ? '✓' : fallbackVerdict ? '?' : '✓', verdictFact?.evidence ?? [], verdictFact !== null ? `Verdict: ${verdictFact.value.ready} | ${verdictFact.value.fixes}` : fallbackVerdict ? 'no verdict format found: Tower\'s `Verdict: ready to merge | fixes needed`' : 'no verdict line: the blockers section decides') as { ready: Pattern; fixes: Pattern } | null,
    blockersSection: item('review.blockersSection', blockersFact?.value ?? null, '✓', blockersFact?.evidence ?? [], blockersFact !== null ? `### ${blockersFact.value.heading}, ${blockersFact.value.none} when none` : 'no blockers section with a "none" text') as { heading: string; none: string } | null,
    savePath: item('review.savePath', `${statePath !== null && dirName(statePath) !== '' ? dirName(statePath) : '.work'}/review/pr-{pr}-round-{round}.md`, '✓', [], 'Tower\'s own: where the review is saved before it is posted') as string,
  }

  const waits: Record<string, WaitRule> = {}
  for (const fact of facts.waits) {
    const rule = WAIT_LIBRARY[fact.value]
    if (rule === undefined) continue
    waits[fact.value] = rule
    item(`waits.${fact.value}`, rule, '✓', fact.evidence, fact.value === 'openPr' ? 'away mode answers yes' : 'never answered by away mode')
  }

  const sources: CheckSource[] = []
  if (facts.ci.value) sources.push(item('checks.sources[github-ci]', 'github-ci', '✓', facts.ci.evidence, 'workflows that run on pull requests') as CheckSource)
  else if (statePath !== null && facts.stateFile?.checks.value) sources.push(item('checks.sources[stateFile]', { stateFile: statePath }, '✓', facts.stateFile.checks.evidence, 'no CI on pull requests: the checks the skills record against the head commit') as CheckSource)
  if (facts.releaseTags !== null) sources.push(item('checks.sources[release]', { release: facts.releaseTags.value }, '✓', facts.releaseTags.evidence, 'the last release tag and the commits since it') as CheckSource)
  if (!facts.ci.value && !(facts.stateFile?.checks.value ?? false)) questions.push('No CI runs on pull requests and no skill records its checks: how and when do you run the tests?')
  if (facts.steps.release === undefined && facts.releaseTags === null) questions.push('How do you release?')

  const env = item('env', facts.env.value, facts.env.value.kind === 'none' ? '?' : '✓', facts.env.evidence, facts.env.value.kind === 'none' ? 'no environment skill or simulator found' : '') as EnvConfig

  const repoActions: RepoAction[] = []
  for (const rule of CAPTURE_SKILLS) {
    const found = facts.capture.find(one => rule.re.test(one.value))
    if (found !== undefined) repoActions.push(item(`repoActions[${rule.key}]`, { key: rule.key, label: rule.label, skill: found.value, cwd: 'main' }, '✓', found.evidence) as RepoAction)
  }
  if (facts.steps.release !== undefined) repoActions.push(item(`repoActions[${RELEASE_ACTION.key}]`, { ...RELEASE_ACTION, skill: facts.steps.release.value, cwd: 'main' }, '✓', facts.steps.release.evidence) as RepoAction)

  item('routing', 'defaults', '✓', [], 'Tower\'s roles; the repository\'s skills on the session\'s model; per-skill choices from the deck\'s routing view (decision 056)')
  const rule = facts.rules.noDirectToMain
  const delivery = item('delivery', 'pr', '?', rule?.evidence ?? [], rule !== null ? 'suggested: the repository already has a no-direct-to-main rule; asked' : 'asked: a pull request or a direct commit on the base branch') as 'pr' | 'commit'
  questions.push(rule !== null
    ? `Tower's skill changes: by pull request (suggested: ${rule.evidence[0]}) or by a direct commit on ${project.baseBranch}?`
    : `Tower's skill changes: by pull request or by a direct commit on ${project.baseBranch}?`)
  if (facts.rules.language === null) questions.push('Which language to talk in, and which to publish in (issues, PRs, commits)?')

  const config: TowerConfig = {
    version: 1,
    project,
    tickets,
    worktree,
    workflow: { steps },
    phases,
    review,
    waits,
    checks: { sources },
    env,
    repoActions,
    routing: 'defaults',
    delivery,
  }
  const result = validateConfig(JSON.parse(JSON.stringify(config)))
  return { config, items, notSupported: facts.notSupported, questions, errors: result.ok ? [] : result.errors }
}
