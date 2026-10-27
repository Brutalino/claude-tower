import { expect, test } from 'claude-code/testing'

import type { TowerPullRequest } from '../types/index'
import { asksToPost, awayNext, awayStarts } from '../hooks/core/away'
import { ghostText } from '../hooks/core/explain'
import { parseRailInput } from '../hooks/core/boardFilter'
import { CONFIG_VERSION, configInputFrom, mainCheckoutFromListing, projectId, storedConfigPath, mainCheckoutOf, profileOf, renderTemplate, resolveConfig, slugFromRemote, stepCommand, stepCommandPattern, ticketIdPattern, ticketInput, ticketValues, toRegExp, validateConfig, type TowerConfig, type WorkflowConfig } from '../hooks/core/config'
import { OINK_CONFIG } from '../hooks/core/configs/examples/oink'
import { LINEAR_CONFIG } from './linearConfig'
import { parsePullRequest, prViewFields, reviewBlockerCount, SELF_REVIEW_HEADING } from '../hooks/core/detail'
import { envBoxRows, envPorts, envSkill, envSlot } from '../hooks/core/devEnv'
import { LINEAR_QUERY } from '../hooks/core/linear'
import { reviewTarget, rowShape, ticketStep } from '../hooks/core/nextStep'
import { resumesConversation, ticketOpenStart } from '../hooks/core/panes'
import { ticketStart } from '../hooks/core/launcher'
import { AWAY_QUESTIONS, PROFILE } from './linearConfig'
import { railRow } from '../hooks/core/rail'
import { extractReviewBody, reviewBodyPath, reviewBox, reviewPosted, reviewRound, reviewShown } from '../hooks/core/reviewBox'
import { parseWorkState } from '../hooks/core/workState'
import { newWorktree as planWith, otherWorktrees, parseWorktreePorcelain, slug, ticketIdFromBranch, ticketWorktrees } from '../hooks/core/worktrees'

type Json = any

const clone = (value: unknown): Json => JSON.parse(JSON.stringify(value))

function errorsOf(mutate: (raw: Json) => void, base: unknown = LINEAR_CONFIG): string[] {
  const raw = clone(base)
  mutate(raw)
  const result = validateConfig(raw)
  return result.ok ? [] : result.errors
}

function linear(config: TowerConfig) {
  if (config.tickets.kind !== 'linear') throw new Error('ShopApp reads Linear')
  return config.tickets
}

test('ShopApp: the configuration validates, as it is and through JSON, at the current version', async () => {
  expect(validateConfig(LINEAR_CONFIG)).toEqual({ ok: true, config: LINEAR_CONFIG })
  expect(validateConfig(clone(LINEAR_CONFIG))).toEqual({ ok: true, config: clone(LINEAR_CONFIG) })
  expect(LINEAR_CONFIG.version).toBe(CONFIG_VERSION)
})

test('oink: the hand-written GitHub configuration validates', async () => {
  const result = validateConfig(OINK_CONFIG)
  expect(result.ok ? [] : result.errors).toEqual([])
  expect(validateConfig(clone(OINK_CONFIG)).ok).toBe(true)
  if (!result.ok) return
  expect(result.config.tickets).toMatchObject({ kind: 'github', repo: 'Brutalino/oink' })
  expect(renderTemplate(result.config.worktree.pathTemplate, { n: '27', slug: 'uitesting-wipes-prefs' }, '/home/me'))
    .toBe('/home/me/tower-work/oink/27-uitesting-wipes-prefs')
  const branch = result.config.worktree.branch
  expect(branch.kind === 'template' ? renderTemplate(branch.template, { kind: 'fix', n: '27', slug: 'uitesting-wipes-prefs' }) : null)
    .toBe('fix/27-uitesting-wipes-prefs')
  expect(toRegExp(result.config.review.verdict!.ready).test('Looks fine.\nVerdict: ready to merge')).toBe(true)
  expect(toRegExp(result.config.review.verdict!.fixes).test('Verdict: fixes needed — two blockers')).toBe(true)
  expect(toRegExp(result.config.review.heading).exec('## Review (round 2)\n\nVerdict: fixes needed')?.[1]).toBe('2')
  expect(result.config.env.kind === 'simulator' ? renderTemplate(result.config.env.nameTemplate, { n: '27' }) : null).toBe('iPhone 16 Pro (Oink 27)')
  expect(profileOf(result.config)).toBeNull()
})

test('PROFILE is what the ShopApp configuration makes, through JSON too', async () => {
  expect(profileOf(LINEAR_CONFIG)).toEqual(PROFILE)
  const stored = validateConfig(clone(LINEAR_CONFIG))
  expect(stored.ok ? profileOf(stored.config) : null).toEqual(clone(PROFILE))
  expect(LINEAR_CONFIG.project.baseBranch).toBe('staging')
})

test('ShopApp tickets: the id from a branch, the rail prompt and the Linear query read as the code does', async () => {
  const tickets = linear(LINEAR_CONFIG)
  const idPattern = toRegExp(tickets.idPattern)
  for (const branch of ['feature/tkt-1650-wrong-invite-path', 'TKT-7-locked', 'me/tkt-2349-org-admin', 'spike/cache-warmup', 'shelf-12']) {
    expect(idPattern.exec(branch)?.[1]?.toUpperCase() ?? null).toBe(ticketIdFromBranch(branch, tickets.idPattern))
  }
  const input = toRegExp(tickets.inputPattern)
  for (const text of ['2426', 'tkt-2426', 'TKT-2426', 'tkt2426', 'printer', 'x-12']) {
    const n = input.exec(text)?.[1]
    const parsed = parseRailInput(text, tickets)
    expect(n === undefined ? null : renderTemplate(tickets.idTemplate, { n })).toBe(parsed.kind === 'ticket' ? parsed.id : null)
  }
  expect(LINEAR_QUERY).toContain(`issues(first: ${tickets.query.first} `)
  expect(LINEAR_QUERY).toContain(`{ state: { type: { in: [${tickets.query.candidateStates.map(state => `"${state}"`).join(', ')}] } } } { assignee: { null: true } } { labels: { name: { containsIgnoreCase: "${tickets.query.candidateLabel}" } } }`)
  expect(LINEAR_QUERY).toContain(`{ state: { type: { in: [${tickets.query.mineStates.map(state => `"${state}"`).join(', ')}] } } } { assignee: { isMe: { eq: true } } }`)
})

test('ShopApp worktree: the path, the branch and the base newWorktree gives', async () => {
  const worktree = LINEAR_CONFIG.worktree
  const newWorktree = (input: Parameters<typeof planWith>[0]) => planWith(input, worktree, '/h')
  const base = { repo: '/x/shopapp', ticket: 'TKT-12', existing: [], blockerBranch: null, originBranches: ['staging'], baseBranch: LINEAR_CONFIG.project.baseBranch }
  const title = 'Printer offline alert repeats after a reconnect, every single time'
  const plain = newWorktree({ ...base, issue: { title, branchName: '' } })
  expect(plain.path).toBe(renderTemplate(worktree.pathTemplate, { repoParent: '/x', repo: 'shopapp', key: 'TKT-12' }))
  expect(worktree.branch.kind).toBe('linear-branch-name')
  const fallback = worktree.branch.kind === 'linear-branch-name' ? worktree.branch.fallback : ''
  expect(plain.branch).toBe(renderTemplate(fallback, { keyLower: 'tkt-12', slug: slug(title, worktree.slugMax) }))
  expect(newWorktree({ ...base, issue: null }).branch).toBe(renderTemplate(fallback, { keyLower: 'tkt-12', slug: '' }))
  expect(newWorktree({ ...base, issue: { title, branchName: 'me/tkt-12-from-linear' } }).branch).toBe('me/tkt-12-from-linear')
  expect(plain.base).toBe(`origin/${LINEAR_CONFIG.project.baseBranch}`)
  // followExisting: beside the existing ones, named like them.
  expect(worktree.followExisting).toBe(true)
  expect(newWorktree({ ...base, issue: null, existing: [{ path: '/h/legacy-work/TKT-3', ticket: 'TKT-3' }] }).path).toBe('/h/legacy-work/TKT-12')
  // stackOnBlocker: the blocker's branch on origin is the base.
  expect(worktree.stackOnBlocker).toBe(true)
  expect(newWorktree({ ...base, issue: null, blockerBranch: 'me/tkt-3-x', originBranches: ['staging', 'me/tkt-3-x'] }).base).toBe('origin/me/tkt-3-x')
})

test('ShopApp workflow: each step is the command ticketStep proposes', async () => {
  const steps = LINEAR_CONFIG.workflow.steps
  const command = (key: string, values: Record<string, string>) => {
    const step = steps[key]!
    return `/${step.skill}${step.args === '' ? '' : ` ${renderTemplate(step.args, values)}`}`
  }
  const idle = { working: false, agent: null }
  const pr = (state: 'draft' | 'open' | 'merged'): TowerPullRequest => ({ kind: 'pr', number: 42, state, checks: 'passing', headRefOid: 'abc', green: false })
  const at = (work: 'implementing' | null, pullRequest: TowerPullRequest | null, green = false) =>
    ticketStep({ ticket: 'TKT-1', work: work === null ? null : { phase: work, blockers: [] }, pullRequest, session: idle, green }, LINEAR_CONFIG.workflow).next
  expect(at(null, null)).toBe(command('start', { key: 'TKT-1' }))
  expect(at('implementing', null)).toBe(command('openPr', {}))
  expect(at('implementing', pr('draft'))).toBe(command('openPr', {}))
  expect(at('implementing', pr('open'))).toBe(command('review', { pr: '42' }))
  expect(at('implementing', pr('open'), true)).toBe(command('wrapUp', { pr: '42' }))
  expect(at('implementing', pr('merged'))).toBe(command('wrapUp', { pr: '42' }))
  for (const step of Object.values(steps)) expect(PROFILE.skills.some(skill => skill.name === step.skill)).toBe(true)
  expect(steps.review!.skill).toBe(LINEAR_CONFIG.review.skill)
})

test('ShopApp phases: the state file words map as parseWorkState reads them', async () => {
  const phases = LINEAR_CONFIG.phases
  if (phases.source !== 'state-file') throw new Error('ShopApp reads a state file')
  expect(phases.path).toBe('.work/state.json')
  for (const word of phases.values) expect(parseWorkState(JSON.stringify({ phase: word }), LINEAR_CONFIG.phases).phase).toBe(phases.mapping[word]!)
  for (const text of ['{"phase":"review"}', '{"phase":""}', '{ nope']) expect(parseWorkState(text, LINEAR_CONFIG.phases).phase).toBe(phases.unknownAs)
})

test('ShopApp review: heading, round, sections and blockers as detail.ts and reviewBox.ts read them', async () => {
  const review = LINEAR_CONFIG.review
  expect(toRegExp(review.heading)).toEqual(SELF_REVIEW_HEADING)
  const answer = '## Self-review (round 3) — head `507cf535b`\n\n### Scope check\nfine\n\n### Blockers\n_(none)_\n'
  const heading = toRegExp(review.heading).exec(answer)?.[0] ?? ''
  expect(Number(toRegExp(review.roundPattern).exec(heading)?.[1])).toBe(reviewRound(answer, LINEAR_CONFIG.review))
  const [first, second] = review.sections
  expect(reviewShown(`### ${first}\nx\n\n### ${second}\ny`, LINEAR_CONFIG.review)).toBe(true)
  const section = review.blockersSection!
  const comment = (blockers: string) => [{ body: `## Self-review\n\n### ${section.heading}\n${blockers}\n`, createdAt: '2026-10-12T10:00:00Z' }]
  expect(reviewBlockerCount(comment(section.none), LINEAR_CONFIG.review)).toBe(0)
  expect(reviewBlockerCount(comment('- one\n- two'), LINEAR_CONFIG.review)).toBe(2)
  expect(review.verdict).toBeNull()
})

test('ShopApp waits and env: the away questions and the dev-env slots', async () => {
  const waits = LINEAR_CONFIG.waits
  expect(waits.openPr!.patterns.map(toRegExp)).toEqual([...AWAY_QUESTIONS.openPr])
  expect(waits.post!.patterns.map(toRegExp)).toEqual([...AWAY_QUESTIONS.review])
  expect([waits.openPr!.awayAnswer, waits.post!.awayAnswer]).toEqual(['yes', null])
  expect(asksToPost('Saved the review.\n\nShall I post it to the PR?', LINEAR_CONFIG.waits)).toBe(true)
  const env = LINEAR_CONFIG.env
  if (env.kind !== 'skill' || env.ports === null) throw new Error('ShopApp has a dev-env skill with ports')
  const at = (port: number) => envSlot({ frontendUrl: '', frontendPort: port, status: 'up', loginVerified: false, startedAt: null }, env.ports)
  expect([at(env.ports.first - 1), at(env.ports.first), at(env.ports.first + env.ports.slots - 1), at(env.ports.first + env.ports.slots)]).toEqual([null, 1, env.ports.slots, null])
  for (const action of LINEAR_CONFIG.repoActions) expect(PROFILE.skills.find(skill => skill.name === action.skill)?.where).toBe('hub')
})

test('validateConfig: broken configurations, every error at once with its path', async () => {
  expect(validateConfig(null)).toEqual({ ok: false, errors: ['config: expected an object, got null'] })
  expect(validateConfig([])).toEqual({ ok: false, errors: ['config: expected an object, got []'] })
  expect(errorsOf(raw => { delete raw.review })).toEqual(['config: missing review'])
  expect(errorsOf(raw => { raw.version = 2 })).toEqual(['version: expected 1, got 2'])
  expect(errorsOf(raw => { raw.tickets = {}; raw.env = { kind: 'skill', ports: null } })).toEqual(['tickets: missing kind', 'env: missing name'])
  expect(errorsOf(raw => { raw.tickets.kind = 'jira' })).toEqual([`tickets.kind: expected 'linear' | 'github' | 'none', got "jira"`])
  expect(errorsOf(raw => { raw.tickets.idPattern.source = '(tkt-' })[0]).toMatch(/^tickets\.idPattern: not a regular expression/)
  expect(errorsOf(raw => { raw.worktree.pathTemplat = raw.worktree.pathTemplate; delete raw.worktree.pathTemplate }))
    .toEqual(['worktree: missing pathTemplate', 'worktree.pathTemplat: unknown field'])
  expect(errorsOf(raw => { raw.worktree.branch.fallback = '{key}-{title}' }))
    .toEqual(['worktree.branch.fallback: unknown placeholder {title} (known: {key}, {keyLower}, {n}, {slug})'])
  expect(errorsOf(raw => { raw.worktree.branch = { kind: 'template', template: '{kind}/{n}-{slug}', kindFromLabel: true } }))
    .toEqual([`worktree.branch.kindFromLabel: needs tickets.kind 'github' (labels), got 'linear'`])
  expect(errorsOf(raw => { raw.worktree.branch = { kind: 'template', template: '{kind}/{n}', kindFromLabel: false } }))
    .toEqual(['worktree.branch.template: {kind} needs kindFromLabel: true'])
  expect(errorsOf(raw => { raw.tickets = { kind: 'none' } }))
    .toEqual([`worktree.branch.kind: 'linear-branch-name' needs tickets.kind 'linear', got 'none'`])
  expect(errorsOf(raw => { raw.phases.mapping.implementing = 'merged'; raw.phases.values.push('done') })).toEqual([
    `phases.mapping.implementing: expected 'planning' | 'implementing' | 'review', got "merged"`,
    'phases.mapping: missing done (in phases.values)',
  ])
  expect(errorsOf(raw => { raw.review.blockersSection = null })).toEqual(['review: needs a verdict or a blockersSection: nothing would tell a review ready'])
  expect(errorsOf(raw => { raw.workflow.steps.review.skill = 'review-pr' })).toEqual([
    `workflow.steps.review.skill: 'review-pr' differs from review.skill 'review'`,
    `workflow.steps.review.skill: skill 'review-pr' is not in routing.skills`,
  ])
  expect(errorsOf(raw => { raw.workflow.steps.start.session = 'main' }))
    .toEqual([`workflow.steps.start.session: expected 'ticket' | 'review' | 'hub', got "main"`])
  expect(errorsOf(raw => { raw.repoActions.push({ key: 's', label: 'deploy', skill: 'deploy', cwd: 'main' }) })).toEqual([
    `repoActions[3].key: 's' is used twice`,
    `repoActions[3].skill: skill 'deploy' is not in routing.skills`,
  ])
  expect(errorsOf(raw => { raw.routing.skills[0].model = 'gpt'; raw.routing.builtinRoutes.Explore = { role: 'reader' } })).toEqual([
    `routing.skills[0].model: model 'gpt' is not in routing.modelIds`,
    `routing.builtinRoutes.Explore.role: 'reader' is not one of routing.roles`,
  ])
  expect(errorsOf(raw => { raw.checks.sources.push({ jenkins: 'x' }); raw.checks.sources.push({ release: 'build-{tag}' }) })).toEqual([
    `checks.sources[1]: expected 'github-ci', {stateFile}, {local, command, when} or {release}, got {"jenkins":"x"}`,
    'checks.sources[2].release: unknown placeholder {tag} (known: {n})',
  ])
  expect(errorsOf(raw => { raw.delivery = 'push'; raw.project.repo = 'shopapp'; raw.env.ports.slots = 0 })).toEqual([
    `project.repo: expected owner/name, got "shopapp"`,
    'env.ports.slots: expected a whole number above 0, got 0',
    `delivery: expected 'pr' | 'commit', got "push"`,
  ])
  expect(errorsOf(raw => { raw.tickets.labels.kinds.bug = 7 }, OINK_CONFIG)).toEqual(['tickets.labels.kinds.bug: expected a string, got 7'])
})

test('permissions (decision 080): the allowed rules as written; a bad rule or shape is dropped, never an error; none without the key', async () => {
  const OINK_ALLOW = ['Bash(xcrun simctl:*)', 'Bash(nohup xcrun simctl:*)', 'Bash(xcodebuild:*)', 'Bash(ffmpeg:*)', 'Bash(mkdir:*)', 'Bash(cp:*)', 'Bash(sleep:*)']
  const valid = (mutate: (raw: Json) => void, base: unknown = OINK_CONFIG): TowerConfig => {
    const raw = clone(base)
    mutate(raw)
    const result = validateConfig(raw)
    if (!result.ok) throw new Error(result.errors.join('\n'))
    return result.config
  }
  expect(valid(() => {}).permissions).toEqual({ allow: OINK_ALLOW })
  expect(valid(raw => { raw.permissions.allow = ['Bash(xcodebuild:*)', '', '  ', 7, null, { rule: 'x' }, 'Bash(ffmpeg:*)'] }).permissions).toEqual({ allow: ['Bash(xcodebuild:*)', 'Bash(ffmpeg:*)'] })
  expect(valid(raw => { raw.permissions = { allow: 'Bash(cp:*)', deny: ['Bash(rm:*)'] } }).permissions).toEqual({ allow: [] })
  expect(valid(raw => { raw.permissions = ['Bash(cp:*)'] }).permissions).toEqual({ allow: [] })
  expect(valid(raw => { raw.permissions = { allow: ['Bash(cp:*)'], deny: ['Bash(rm:*)'] } }).permissions).toEqual({ allow: ['Bash(cp:*)'] })
  expect(valid(raw => { delete raw.permissions }).permissions).toBeUndefined()
  expect('permissions' in valid(() => {}, LINEAR_CONFIG)).toBe(false)
  expect(errorsOf(raw => { raw.permissions = { allow: [7] } })).toEqual([])
  expect(errorsOf(raw => { raw.permission = { allow: [] } })).toEqual(['config.permission: unknown field'])
})

test('resolveConfig (decision 083): an edition\'s project by its origin or TOWER_REPO, else a stored configuration that validates, else null; without an edition only the stored one', async () => {
  // ShopApp stands for an edition's built-in project, handed in as resolveConfig's second argument.
  const shopapp = { config: LINEAR_CONFIG, source: 'edition' }
  expect(resolveConfig({ repoRoot: '/r/shopapp', remoteSlug: 'acmeco/shopapp', stored: null }, LINEAR_CONFIG)).toEqual(shopapp)
  expect(resolveConfig({ repoRoot: '/h/legacy-work/TKT-1', remoteSlug: 'acmeco/ShopApp', stored: null }, LINEAR_CONFIG)).toEqual(shopapp)
  // The fixture: a local origin, TOWER_REPO names it.
  expect(resolveConfig({ repoRoot: '/t/repo', remoteSlug: null, towerRepo: '/t/repo/', stored: null }, LINEAR_CONFIG)).toEqual(shopapp)
  // The edition's project wins over anything stored.
  expect(resolveConfig({ repoRoot: '/r/shopapp', remoteSlug: 'acmeco/shopapp', stored: OINK_CONFIG }, LINEAR_CONFIG)).toEqual(shopapp)
  const oink = resolveConfig({ repoRoot: '/r/money-tracker', remoteSlug: 'Brutalino/oink', towerRepo: '/r/shopapp', stored: clone(OINK_CONFIG) }, LINEAR_CONFIG)
  expect(oink?.source).toBe('stored')
  expect(oink?.config.project.repo).toBe('Brutalino/oink')
  expect(resolveConfig({ repoRoot: '/r/money-tracker', remoteSlug: 'Brutalino/oink', stored: { ...clone(OINK_CONFIG), version: 0 } }, LINEAR_CONFIG)).toBeNull()
  // bin/CCtower and the rail hand TOWER_REPO to every session: naming a checkout with a stored configuration, it is that one.
  expect(resolveConfig({ repoRoot: '/r/money-tracker', remoteSlug: 'Brutalino/oink', towerRepo: '/r/money-tracker', stored: clone(OINK_CONFIG) }, LINEAR_CONFIG)?.source).toBe('stored')
  expect(resolveConfig({ repoRoot: '/t/repo', remoteSlug: null, towerRepo: '/t/repo', stored: { version: 1 } }, LINEAR_CONFIG)).toEqual(shopapp)
  expect(resolveConfig({ repoRoot: '/r/other', remoteSlug: 'someone/other', stored: undefined }, LINEAR_CONFIG)).toBeNull()
  expect(resolveConfig({ repoRoot: '/r/other', remoteSlug: null, towerRepo: null, stored: null }, LINEAR_CONFIG)).toBeNull()
  // No edition: neither its origin nor TOWER_REPO resolves; a stored configuration still does.
  expect(resolveConfig({ repoRoot: '/r/shopapp', remoteSlug: 'acmeco/shopapp', stored: null }, null)).toBeNull()
  expect(resolveConfig({ repoRoot: '/t/repo', remoteSlug: null, towerRepo: '/t/repo', stored: null }, null)).toBeNull()
  expect(resolveConfig({ repoRoot: '/t/repo', remoteSlug: null, towerRepo: '/t/repo', stored: clone(LINEAR_CONFIG) }, null)).toEqual({ config: clone(LINEAR_CONFIG), source: 'stored' })
})

test('slugFromRemote and renderTemplate', async () => {
  expect(slugFromRemote('https://github.com/acmeco/shopapp.git')).toBe('acmeco/shopapp')
  expect(slugFromRemote('https://token@github.com/acmeco/shopapp')).toBe('acmeco/shopapp')
  expect(slugFromRemote('git@github.com:Brutalino/oink.git')).toBe('Brutalino/oink')
  expect(slugFromRemote('ssh://git@github.com/Brutalino/oink.git')).toBe('Brutalino/oink')
  expect(slugFromRemote('/tmp/fixture/origin.git')).toBeNull()
  expect(slugFromRemote('https://gitlab.com/a/b.git')).toBeNull()
  expect(slugFromRemote(null)).toBeNull()
  expect(renderTemplate('{keyLower}-{slug}', { keyLower: 'tkt-1', slug: '' })).toBe('tkt-1')
  expect(renderTemplate('{kind}/{n}-{slug}', { kind: 'feature', n: '3', slug: 'plan' })).toBe('feature/3-plan')
  expect(renderTemplate('~/tower-work/{repo}/{key}', { repo: 'oink', key: '3' }, '/home/me/')).toBe('/home/me/tower-work/oink/3')
  expect(renderTemplate('~/x', {})).toBe('~/x')
})

test('project: the main checkout is TOWER_REPO for ShopApp (null), else the configuration\'s with ~ as the home folder', async () => {
  expect(mainCheckoutOf(LINEAR_CONFIG.project, '/r/shopapp', '/home/me')).toBe('/r/shopapp')
  expect(mainCheckoutOf(LINEAR_CONFIG.project, null, '/home/me')).toBeNull()
  const own = { ...LINEAR_CONFIG.project, mainCheckout: '~/Repositories/oink' }
  expect(mainCheckoutOf(own, '/r/shopapp', '/home/me/')).toBe('/home/me/Repositories/oink')
  expect(mainCheckoutOf(own, '/r/shopapp', null)).toBe('~/Repositories/oink')
  expect(mainCheckoutOf({ ...own, mainCheckout: '/abs/oink' }, null, '/home/me')).toBe('/abs/oink')
})

test('tickets: another id pattern flows through the branch id, the worktree lists, the rail row and the rail prompt', async () => {
  const raw = clone(LINEAR_CONFIG)
  raw.tickets.idPattern = { source: '^(?:[a-z]+\\/)?(\\d+)-', flags: '' }
  raw.tickets.inputPattern = { source: '^#?(\\d+)$', flags: '' }
  raw.tickets.idTemplate = '#{n}'
  const result = validateConfig(raw)
  expect(result.ok ? [] : result.errors).toEqual([])
  if (!result.ok) return
  const id = ticketIdPattern(result.config.tickets)
  expect(ticketIdFromBranch('feature/12-login-loop', id)).toBe('12')
  expect(ticketIdFromBranch('feature/tkt-1650-wrong-invite-path', id)).toBeNull()
  expect(ticketIdFromBranch('12-login-loop', ticketIdPattern(LINEAR_CONFIG.tickets))).toBeNull()
  const porcelain = 'worktree /r/main\nHEAD a\nbranch refs/heads/main\n\nworktree /r/12\nHEAD b\nbranch refs/heads/feature/12-login-loop\n\nworktree /r/TKT-3\nHEAD c\nbranch refs/heads/tkt-3-x\n'
  const entries = parseWorktreePorcelain(porcelain)
  expect(ticketWorktrees(entries, id).map(entry => entry.path)).toEqual(['/r/12'])
  expect(otherWorktrees(entries, id).map(entry => entry.path)).toEqual(['/r/TKT-3'])
  expect(railRow(entries[1]!, parseWorkState(undefined, LINEAR_CONFIG.phases), null, id).key).toBe('12')
  const input = ticketInput(result.config.tickets)
  expect(parseRailInput('#12', input)).toEqual({ kind: 'ticket', id: '#12' })
  expect(parseRailInput('12', input)).toEqual({ kind: 'ticket', id: '#12' })
  expect(parseRailInput('TKT-12', input)).toEqual({ kind: 'filter', text: 'TKT-12' })
  expect(parseRailInput('#12', null)).toEqual({ kind: 'filter', text: '#12' })
  expect(ticketIdPattern({ kind: 'none' })).toBeNull()
  expect(ticketWorktrees(entries, null)).toEqual([])
})

test('TKT-2587 through the configuration: a state file with an unknown phase and an earlier conversation continues it, never the start step (decision 051)', async () => {
  const phases = LINEAR_CONFIG.phases
  const startSkill = LINEAR_CONFIG.workflow.steps.start?.skill ?? null
  expect(startSkill).toBe('start-ticket')
  const text = '{"ticket":"TKT-2587","phase":"review","next":"fix round 2"}'
  const work = parseWorkState(text, phases)
  expect(work).toEqual({ phase: 'implementing', next: 'fix round 2', hasPlan: false, blockers: [], rawPhase: 'review' })
  // The state file exists: the session opens plain and continues its earlier conversation.
  expect(ticketStart('TKT-2587', work.phase, LINEAR_CONFIG.workflow.steps.start, PROFILE.skills, PROFILE.modelIds, true)).toBeNull()
  const start = ticketStart('TKT-2587', 'not started', LINEAR_CONFIG.workflow.steps.start, PROFILE.skills, PROFILE.modelIds, false)
  expect(start?.prompt).toBe('/start-ticket TKT-2587')
  expect(ticketOpenStart(start, true, true, startSkill)).toBeNull()
  expect(resumesConversation('ticket', ticketOpenStart(start, true, true, startSkill), true, true, startSkill)).toBe(true)
  expect(resumesConversation('ticket', start, true, true, startSkill)).toBe(true)
  // No state file: the start step in a new conversation.
  expect(parseWorkState(undefined, phases).phase).toBe('not started')
  expect(ticketOpenStart(start, true, false, startSkill)).toBe(start)
  expect(resumesConversation('ticket', start, true, false, startSkill)).toBe(false)
})

test('phases and the start step from another configuration', async () => {
  const phases = { source: 'state-file' as const, path: '.tower/state.json', values: ['plan', 'build', 'pr-review'], mapping: { plan: 'planning' as const, build: 'implementing' as const, 'pr-review': 'review' as const }, unknownAs: 'planning' as const }
  expect(parseWorkState('{"phase":"pr-review"}', phases)).toEqual({ phase: 'review', next: null, hasPlan: false, blockers: [], rawPhase: 'pr-review' })
  expect(parseWorkState('{"phase":"build"}', phases).phase).toBe('implementing')
  expect(parseWorkState('{"phase":"implementing"}', phases)).toEqual({ phase: 'planning', next: null, hasPlan: false, blockers: [], rawPhase: 'implementing' })
  expect(parseWorkState('{ nope', phases).phase).toBe('planning')
  expect(parseWorkState('{"phase":"constructor"}', LINEAR_CONFIG.phases)).toEqual({ phase: 'implementing', next: null, hasPlan: false, blockers: [], rawPhase: 'constructor' })
  expect(parseWorkState('{"phase":"planning"}', { source: 'none' }).phase).toBe('not started')
  const begin = { prompt: '/begin TKT-1' }
  expect(ticketOpenStart(begin, true, true, 'begin')).toBeNull()
  expect(resumesConversation('ticket', begin, true, false, 'begin')).toBe(false)
  expect(resumesConversation('ticket', { prompt: '/start-ticket TKT-1' }, true, false, 'begin')).toBe(true)
  expect(ticketOpenStart(begin, true, true, null)).toBe(begin)
})

test('workflow: phase review takes the implementing path, step for step (ShopApp never writes it)', async () => {
  const idle = { working: false, agent: null }
  const pr = (state: 'draft' | 'open' | 'merged'): TowerPullRequest => ({ kind: 'pr', number: 42, state, checks: 'passing', headRefOid: 'abc', green: false })
  const at = (phase: 'implementing' | 'review', pullRequest: TowerPullRequest | null, green = false, blockers: string[] = []) =>
    ticketStep({ ticket: 'TKT-1', work: { phase, blockers }, pullRequest, session: idle, green }, LINEAR_CONFIG.workflow)
  for (const [pullRequest, green] of [[null, false], [pr('draft'), false], [pr('open'), false], [pr('open'), true], [pr('merged'), false]] as const) {
    expect(at('review', pullRequest, green)).toEqual(at('implementing', pullRequest, green))
  }
  expect(at('review', null, false, ['waits on API'])).toEqual(at('implementing', null, false, ['waits on API']))
  expect(at('review', null)).toEqual({ group: 'ready', glyph: '✓', status: 'ready · /open-pr', next: '/open-pr', phaseIndex: 1 })
})

test('workflow: another configuration\'s steps are the commands ticketStep, ticketStart, away and the ghost text use', async () => {
  const workflow: WorkflowConfig = {
    steps: {
      start: { skill: 'begin', args: '{n}', phase: 'not started', session: 'ticket' },
      openPr: { skill: 'ship-pr', args: '', phase: 'implementing', session: 'ticket' },
      review: { skill: 'review-pr', args: '{pr}', phase: 'review', session: 'review' },
      wrapUp: { skill: 'land', args: '{pr}', phase: null, session: 'ticket' },
    },
  }
  const idle = { working: false, agent: null }
  const pr = (state: 'draft' | 'open' | 'merged'): TowerPullRequest => ({ kind: 'pr', number: 7, state, checks: 'passing', headRefOid: 'abc', green: false })
  const step = (work: 'implementing' | 'review' | null, pullRequest: TowerPullRequest | null, green = false) =>
    ticketStep({ ticket: 'OINK-27', work: work === null ? null : { phase: work, blockers: [] }, pullRequest, session: idle, green }, workflow)
  expect(ticketValues('OINK-27')).toEqual({ key: 'OINK-27', n: '27' })
  expect(step(null, null)).toMatchObject({ status: 'not started · /begin', next: '/begin 27' })
  expect(step('implementing', null)).toMatchObject({ status: 'ready · /ship-pr', next: '/ship-pr' })
  expect(step('review', pr('draft')).next).toBe('/ship-pr')
  expect(step('review', pr('open'))).toMatchObject({ status: 'ready · review', next: '/review-pr 7' })
  expect(step('review', pr('open'), true)).toMatchObject({ status: 'ready · merge', next: '/land 7' })
  expect(step('implementing', pr('merged'))).toMatchObject({ status: 'merged · /land', next: '/land 7' })
  // A workflow without the step proposes nothing; the group and the glyph stay.
  const bare = ticketStep({ ticket: 'OINK-27', work: { phase: 'implementing', blockers: [] }, pullRequest: null, session: idle, green: false }, { steps: {} })
  expect(bare).toMatchObject({ group: 'ready', glyph: '✓', status: 'ready', next: null })
  expect(rowShape({ key: 'OINK-27', path: '/w', branch: 'b', phase: 'implementing', next: null, hasPlan: false, blockers: [], session: null, agents: 0 } as never, null)).toEqual({ group: 'ready', glyph: '✓' })
  // The review step read back; ShopApp's own command is not this workflow's.
  expect(reviewTarget('/review-pr 7', null, workflow)).toBe(7)
  expect(reviewTarget('/review 7', null, workflow)).toBeNull()
  expect(stepCommandPattern(workflow.steps.review)!.source).toBe('^\\/review-pr (\\d+)$')
  expect(stepCommandPattern({ skill: 'a.b', args: '({key})', phase: null, session: 'ticket' })!.test('/a.b (TKT-1)')).toBe(true)
  expect(stepCommandPattern({ skill: 'a.b', args: '({key})', phase: null, session: 'ticket' })!.test('/axb (TKT-1)')).toBe(false)
  expect(stepCommand(undefined, {})).toBeNull()
  // Away moves the openPr and review steps of this workflow, and runs the openPr skill.
  expect(awayNext('/ship-pr', '', workflow, LINEAR_CONFIG.waits)).toEqual({ kind: 'run', command: 'ship-pr' })
  expect(awayNext('/review-pr 7', '', workflow, LINEAR_CONFIG.waits)).toEqual({ kind: 'review', pr: 7 })
  expect(awayNext('/open-pr', '', workflow, LINEAR_CONFIG.waits)).toBeNull()
  expect(awayStarts('/land 7', workflow)).toBe(false)
  // The ghost text never proposes the review step (it runs in its own session).
  expect(ghostText({ next: '/review-pr 7' }, '', workflow)).toBeNull()
  expect(ghostText({ next: '/land 7' }, '', workflow)).toBe('/land 7')
  // The first prompt of a ticket not started, on the start skill's model.
  const skills = [{ name: 'begin', what: 'start', where: 'ticket' as const, model: 'opus', effort: 'high' }]
  expect(ticketStart('OINK-27', 'not started', workflow.steps.start, skills, { opus: 'claude-opus-x' })).toEqual({ prompt: '/begin 27', model: 'claude-opus-x', effort: 'high' })
  expect(ticketStart('OINK-27', 'not started', undefined, skills, {})).toBeNull()
})

test('review through the oink configuration: rounds, green, blockers, posted, the round and the saved file read `## Review (round N)` and its Verdict line', async () => {
  const result = validateConfig(OINK_CONFIG)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  const review = result.config.review
  const comment = (body: string, createdAt: string) => ({ body, createdAt })
  const read = (comments: { body: string; createdAt: string }[], checks = 'SUCCESS') => parsePullRequest({ exitCode: 0, stderr: '', stdout: JSON.stringify({
    number: 7, state: 'OPEN', isDraft: false, headRefOid: 'abc123', comments, statusCheckRollup: [{ name: 'build', status: 'COMPLETED', conclusion: checks }],
  }) }, review)
  const fixes = comment('## Review (round 1)\n\nTwo things to fix.\n\nVerdict: fixes needed', '2026-10-12T10:00:00Z')
  const ready = comment('## Review (round 2) — head abc123\n\nAll fixed.\n\nVerdict: ready to merge', '2026-10-12T11:00:00Z')
  // ShopApp's heading is no review here, and a plain comment neither.
  const others = [comment('## Self-review (round 9)\n\n### Blockers\n_(none)_', '2026-10-12T12:00:00Z'), comment('LGTM, review later', '2026-10-12T12:30:00Z')]
  expect(read([fixes, ...others])).toMatchObject({ kind: 'pr', rounds: 1, green: false, reviewBlockers: 1, lastReviewAt: '2026-10-12T10:00:00Z' })
  expect(read([fixes, ready, ...others])).toMatchObject({ kind: 'pr', rounds: 2, green: true, reviewBlockers: 0, lastReviewAt: '2026-10-12T11:00:00Z' })
  // Green needs the checks too; a comment under the heading with no verdict line is no round at all (decision 081).
  expect(read([fixes, ready], 'FAILURE')).toMatchObject({ green: false, reviewBlockers: 0 })
  expect(read([comment('## Review\n\nStill reading.', '2026-10-12T10:00:00Z')])).toMatchObject({ rounds: 0, green: false, reviewBlockers: null, lastReviewAt: null })
  // ShopApp reads none of these as its reviews.
  const shopapp = parsePullRequest({ exitCode: 0, stderr: '', stdout: JSON.stringify({ number: 7, state: 'OPEN', headRefOid: 'abc123', comments: [fixes, ready], statusCheckRollup: [] }) }, LINEAR_CONFIG.review)
  expect(shopapp).toMatchObject({ rounds: 0, green: false, reviewBlockers: null })
  // Posted: more review comments on the PR than at the round's start.
  const pullRequest = read([fixes, ready])
  if (pullRequest.kind !== 'pr') throw new Error('a pull request')
  const run = { pr: 7, round: 2, startedAt: 1, baseRounds: 1, postedAt: null }
  expect(reviewPosted(run, pullRequest.rounds ?? 0)).toBe(true)
  expect(reviewPosted(run, 1)).toBe(false)
  expect(reviewBox(pullRequest, null, null)).toMatchObject({ kind: 'posted', pr: 7, round: 2 })
  // The answer shows the review by its heading (oink lists no sections); its round from the heading.
  expect(reviewShown('Done.\n\n## Review (round 3)\n\nVerdict: ready to merge', review)).toBe(true)
  expect(reviewShown('### Scope check\nok\n\n### Blockers\n_(none)_', review)).toBe(false)
  expect(reviewShown('## Self-review (round 3)', review)).toBe(false)
  expect(reviewRound('## Review (round 3)\n\nVerdict: fixes needed', review)).toBe(3)
  expect(reviewRound('## Review\n\nVerdict: fixes needed', review)).toBe(1)
  // The saved rounds under the save path's folder.
  expect(reviewBodyPath('Post it?', { cwd: '/repo', worktree: '/wt/oink-27' }, 7, ['pr-7-round-1.md', 'pr-7-round-2.md'], review.savePath)).toBe('/wt/oink-27/.work/review/pr-7-round-2.md')
  expect(reviewBodyPath('Post it?', { cwd: '/repo' }, 7, ['r-7-1.md'], 'reviews/r-{pr}-{round}.md')).toBe('/repo/reviews/r-7-1.md')
  // The body taken from the answer starts at the configuration's heading, as reviewShown and selfReviews read it (any case).
  const body = '## Review (round 2)\n\n### Found\nnothing\n\n### Checked\nall\n\nVerdict: ready to merge'
  expect(extractReviewBody(`Here it is.\n\n${body}\n\nShall I post it?`, review)).toBe(body)
  expect(extractReviewBody(`Here it is.\n\n${body}`, LINEAR_CONFIG.review)).toBeNull()
  const lower = '## self-review (round 1)\n\n### Blockers\n_(none)_\n\n### Good stuff\ntests'
  expect(extractReviewBody(lower, LINEAR_CONFIG.review)).toBe(lower)
  // The round from roundPattern when the heading captures nothing.
  expect(reviewRound('## Review — round two (round 2)', { ...review, heading: { source: '^##\\s+Review\\b.*$', flags: 'im' } })).toBe(2)
})

test('waits from another configuration: the openPr questions and away\'s answer, the post question', async () => {
  const workflow = LINEAR_CONFIG.workflow
  const asking = 'Committed.\n\nShall I mark the PR ready for review?'
  const rule = (awayAnswer: string | null) => ({ openPr: { patterns: [{ source: 'ready for review', flags: 'i' }], awayAnswer } })
  // ShopApp: its own questions answered `yes`.
  expect(awayNext('/open-pr', asking, workflow, LINEAR_CONFIG.waits)).toEqual({ kind: 'answer', text: 'yes' })
  expect(awayNext('/open-pr', asking, workflow, rule('y'))).toEqual({ kind: 'answer', text: 'y' })
  // A question away may not answer: it waits for the person, it never runs the command again.
  expect(awayNext('/open-pr', asking, workflow, rule(null))).toBeNull()
  // No openPr rule: no question is away's, the command runs.
  expect(awayNext('/open-pr', asking, workflow, {})).toEqual({ kind: 'run', command: 'open-pr' })
  expect(awayNext('/open-pr', 'Anything else?', workflow, rule('y'))).toEqual({ kind: 'run', command: 'open-pr' })
  // The post question by waits.post: oink's patterns (Tower's four since decision 061, Italian included), none without the rule.
  const result = validateConfig(OINK_CONFIG)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  expect(asksToPost('Saved the review.\n\nShall I post it?', result.config.waits)).toBe(true)
  expect(asksToPost('Saved the review.\n\nVuoi che lo pubblichi?', result.config.waits)).toBe(true)
  // Decision 079: Tower's post verbs (`pubblic…`) join the configuration's, so the English rule alone recognises it too.
  expect(asksToPost('Saved the review.\n\nVuoi che lo pubblichi?', { post: { patterns: [{ source: '\\b(?:post|publish)\\b(?!-)', flags: 'i' }], awayAnswer: null } })).toBe(true)
  expect(asksToPost('Saved the review.\n\nVuoi che lo pubblichi?', LINEAR_CONFIG.waits)).toBe(true)
  expect(asksToPost('Saved the review.\n\nShall I post it?', {})).toBe(false)
})

test('checks and env: ShopApp reads GitHub CI and keeps its dev-env box; env none hides the box, no github-ci reads no checks', async () => {
  // ShopApp: the same `gh pr view` fields as before, GitHub's checks among them.
  expect(prViewFields(LINEAR_CONFIG.checks)).toBe('number,state,isDraft,reviewDecision,statusCheckRollup,url,headRefOid,comments,mergeable,mergeStateStatus,reviews,updatedAt,createdAt,baseRefName')
  const result = validateConfig(OINK_CONFIG)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  // Checks from elsewhere (not supported yet): GitHub's are not read, so the pull request has none and is never green.
  expect(prViewFields(result.config.checks)).toBe('number,state,isDraft,reviewDecision,url,headRefOid,comments,mergeable,mergeStateStatus,reviews,updatedAt,createdAt,baseRefName')
  const ready = { body: '## Review (round 1)\n\nVerdict: ready to merge', createdAt: '2026-10-12T10:00:00Z' }
  const noRollup = parsePullRequest({ exitCode: 0, stderr: '', stdout: JSON.stringify({ number: 7, state: 'OPEN', headRefOid: 'abc', comments: [ready] }) }, result.config.review)
  expect(noRollup).toMatchObject({ kind: 'pr', checks: 'none', checkList: [], green: false, rounds: 1 })
  // ShopApp: the dev-env skill, its slots, its box (5 rows; 3 when the repository lacks the skill; none with the module off).
  expect(envSkill(LINEAR_CONFIG.env)).toBe('dev-env')
  expect(envPorts(LINEAR_CONFIG.env)).toEqual({ first: 5173, slots: 7 })
  expect([envBoxRows(LINEAR_CONFIG.env, true, true), envBoxRows(LINEAR_CONFIG.env, true, false), envBoxRows(LINEAR_CONFIG.env, false, true)]).toEqual([5, 3, 0])
  // `env: none` hides the box, starts no skill, reads no slot.
  const none = { kind: 'none' as const }
  expect([envBoxRows(none, true, true), envBoxRows(none, true, false)]).toEqual([0, 0])
  expect(envSkill(none)).toBeNull()
  expect(envSlot({ frontendUrl: 'http://localhost:5174', frontendPort: 5174, status: 'up', loginVerified: false, startedAt: null }, envPorts(none))).toBeNull()
  // A simulator (not supported yet) shows no dev-env box either.
  expect(envBoxRows(result.config.env, true, true)).toBe(0)
  // Other ports: slot N of their own count.
  expect(envSlot({ frontendUrl: '', frontendPort: 3001, status: 'up', loginVerified: false, startedAt: null }, { first: 3000, slots: 3 })).toBe(2)
})

test('ShopApp repoActions and routing: the board keys and the profile register.tsx reads through the configuration', async () => {
  // register.tsx's former BOARD_SKILLS, in its key order (the hint row `s n t k r a q`).
  expect(LINEAR_CONFIG.repoActions.map(action => [action.key, action.skill])).toEqual([['s', 'shape'], ['n', 'new-ticket'], ['t', 'triage']])
  const profile = profileOf(LINEAR_CONFIG)
  expect(profile).toEqual(PROFILE)
  expect(profile?.roles).toEqual(PROFILE.roles)
  expect(profile?.skills).toEqual(PROFILE.skills)
  expect(profile?.modelIds).toEqual(PROFILE.modelIds)
  expect(profile?.builtinRoutes).toEqual(PROFILE.builtinRoutes)
  expect([profile?.mainGuidance, profile?.reviewGuidance, profile?.forkAdvice]).toEqual([PROFILE.mainGuidance, PROFILE.reviewGuidance, PROFILE.forkAdvice])
})

test('the session\'s configuration from its folder: an edition\'s project by origin or TOWER_REPO, a stored configuration, else none', async () => {
  const listing = (main: string, ...linked: string[]) => [main, ...linked].map(path => `worktree ${path}\nHEAD abc\nbranch refs/heads/x\n`).join('\n')
  const resolve = (facts: Parameters<typeof configInputFrom>[0]) => {
    const input = configInputFrom(facts)
    return input === null ? null : resolveConfig(input, LINEAR_CONFIG)
  }
  const shopapp = { config: LINEAR_CONFIG, source: 'edition' }
  expect(mainCheckoutFromListing(listing('/r/shopapp', '/h/legacy-work/TKT-1'))).toBe('/r/shopapp')
  expect(mainCheckoutFromListing(null)).toBeNull()
  expect(mainCheckoutFromListing('')).toBeNull()
  // The edition's project: its origin (from a worktree too), or the fixture's main checkout named by TOWER_REPO.
  expect(resolve({ listing: listing('/r/shopapp', '/h/legacy-work/TKT-1'), originUrl: 'git@github.com:acmeco/shopapp.git\n', towerRepo: null, storedText: undefined })).toEqual(shopapp)
  expect(resolve({ listing: listing('/t/repo', '/t/repo-TKT-9001'), originUrl: '/t/origin.git', towerRepo: '/t/repo', storedText: undefined })).toEqual(shopapp)
  // Another repository: its stored configuration when it validates, else none (bin/CCtower stops there).
  const oink = resolve({ listing: listing('/r/money-tracker'), originUrl: 'https://github.com/Brutalino/oink.git', towerRepo: '/r/shopapp', storedText: JSON.stringify(OINK_CONFIG) })
  expect(oink?.source).toBe('stored')
  expect(oink?.config.project.repo).toBe('Brutalino/oink')
  expect(resolve({ listing: listing('/r/money-tracker'), originUrl: 'https://github.com/Brutalino/oink.git', towerRepo: null, storedText: undefined })).toBeNull()
  expect(resolve({ listing: listing('/r/money-tracker'), originUrl: null, towerRepo: null, storedText: '{ not json' })).toBeNull()
  expect(resolve({ listing: listing('/r/money-tracker'), originUrl: null, towerRepo: null, storedText: '{"version":1}' })).toBeNull()
  // Not a git folder.
  expect(configInputFrom({ listing: null, originUrl: null, towerRepo: '/r/shopapp', storedText: undefined })).toBeNull()
  // The stored file's place, the same id bin/CCtower's tower_config_for computes.
  expect(projectId('/home/me/Repositories/money-tracker')).toBe('-home-me-Repositories-money-tracker')
  expect(storedConfigPath('/s/tower/', '/home/me/Repositories/money-tracker')).toBe('/s/tower/projects/-home-me-Repositories-money-tracker.json')
})
