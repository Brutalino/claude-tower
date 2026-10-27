import { expect, test } from 'claude-code/testing'

import { validateConfig, type TowerConfig } from '../hooks/core/config'
import { OINK_CONFIG } from '../hooks/core/configs/examples/oink'
import { LINEAR_CONFIG } from './linearConfig'
import { LINEAR_QUERY } from '../hooks/core/linear'
import { AWAY_QUESTIONS } from './linearConfig'
import { LINEAR_DEFAULT_QUERY, proposeConfig, referencedDocs, scanRepo, textsToRead, WAIT_LIBRARY, type ScanInput } from '../hooks/core/setupScan'

// Decision 061: tower-setup's mechanical part on repositories written in memory (the files a scan reads, git's
// answers); tools/check-tower-setup.sh runs the same on real repositories built in a temporary folder.

type Json = any

const clone = (value: unknown): Json => JSON.parse(JSON.stringify(value))

const skill = (name: string, description: string, body: string) => `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`

const porcelain = (root: string, worktrees: [string, string | null][]) => [
  `worktree ${root}`, 'HEAD a000000000000000000000000000000000000000', 'branch refs/heads/main', '',
  ...worktrees.flatMap(([path, branch]) => [`worktree ${path}`, 'HEAD b000000000000000000000000000000000000000', branch === null ? 'detached' : `branch refs/heads/${branch}`, '']),
].join('\n')

/** A repository from its files: `paths` are the files' names, `texts` only those the scan reads. */
function repo(root: string, files: Record<string, string>, git: Partial<ScanInput> = {}): ScanInput {
  const paths = Object.keys(files)
  const texts: Record<string, string> = {}
  for (const path of textsToRead(paths)) texts[path] = files[path] as string
  for (const path of referencedDocs(texts, paths)) texts[path] = files[path] as string
  return { root, home: '/home/me', originUrl: null, originHead: 'origin/main', listing: porcelain(root, []), branches: ['main'], tags: [], paths, texts, ...git }
}

// ── An oink-like repository: GitHub issues, a state file with a review phase, recorded checks, build tags ──

const OINK_FILES: Record<string, string> = {
  'CLAUDE.md': [
    '# Money Tracker — project context',
    '',
    'Everything published is in English; conversation with the user is in Italian.',
    '- **Bugs and features reach `main` through a pull request** (owner rule): nothing merges without his yes.',
    '- A feature merges only after the owner approved the visual (every state shown).',
    '- The steps are the project skills; `docs/WORKFLOW.md` is what they share.',
  ].join('\n'),
  'README.md': '# 💰 Money Tracker\n\nA personal finance app.\n',
  'package.json': '{ "name": "money-tracker", "scripts": { "build": "tsc -b && vite build", "test": "vitest run", "dev": "vite" } }',
  'ios/project.yml': 'name: MoneyTracker\n',
  'MoneyCore/Package.swift': '// swift-tools-version:6.0\n',
  'docs/WORKFLOW.md': [
    '# Workflow',
    '- `.work/state.json` in the worktree is the ticket\'s memory.',
    '- `phase` is `planning` until the owner says "go", then `implementing`, then',
    '  `review` once the pull request is open.',
    '- A simulator made for a ticket is named `iPhone 16 Pro (Oink <issue>)`.',
  ].join('\n'),
  'docs/PRODUCT.md': '# Product\n',
  '.claude/skills/start-ticket/SKILL.md': skill('start-ticket', 'First step on a ticket of O!nk. Reads the GitHub issue and writes a plan into .work/state.json.', [
    'Read `docs/WORKFLOW.md` first. Talk to the owner in Italian.',
    '```bash',
    'git fetch origin',
    'git worktree add ~/Repositories/Oink/<issue>-<slug> -b <fix|feature>/<issue>-<slug> origin/main',
    'gh issue view <issue> --repo Brutalino/oink --comments',
    '```',
    'Write `.work/state.json`, `phase` `planning`. After "go": set `phase` to `implementing`.',
  ].join('\n')),
  '.claude/skills/open-pr/SKILL.md': skill('open-pr', 'Publishes a ticket of O!nk: rebase, checks, the pull request.', [
    'Read `.work/state.json`. Record `checks.sha` as the head commit.',
    'Set `phase` to `review`.',
  ].join('\n')),
  '.claude/skills/review-pr/SKILL.md': skill('review-pr', 'Reviews a pull request of Brutalino/oink.', [
    'Show the review to the owner in Italian first. Post it only after a yes, in English:',
    '',
    '```markdown',
    '## Review (round N)',
    'Verdict: ready to merge | fixes needed',
    '',
    '### Blockers',
    '- <file:line — what and why>',
    '',
    '### Suggestions',
    '- <file:line>',
    '',
    '### Earlier rounds',
    '- <point> — closed in <sha> | still open',
    '```',
  ].join('\n')),
  '.claude/skills/wrap-up/SKILL.md': skill('wrap-up', 'Closes a finished ticket of O!nk after an explicit yes.', 'Wait for a yes. Never merge on an assumed answer.'),
  '.claude/skills/new-ticket/SKILL.md': skill('new-ticket', 'Creates one GitHub issue after an explicit yes.', 'Show the title and wait for an explicit yes.'),
  '.claude/skills/triage/SKILL.md': skill('triage', 'Turns one TestFlight feedback into a GitHub issue.', 'Show the body and wait for an explicit yes.'),
  '.claude/skills/release/SKILL.md': skill('release', 'Ships main to TestFlight and tags `build-<n>`.', 'Show what ships. Wait for a yes.'),
  '.claude/skills/repro/SKILL.md': skill('repro', 'Reproduces a bug.', 'Score the confidence.'),
}

const OINK_ROOT = '/home/me/Repositories/money-tracker'

function oinkInput(): ScanInput {
  return repo(OINK_ROOT, OINK_FILES, {
    originUrl: 'https://github.com/Brutalino/oink.git',
    listing: porcelain(OINK_ROOT, [['/home/me/Repositories/money-tracker-crash-restore', 'fix/crash-restore'], ['/home/me/Repositories/Oink/maestro-trial', 'trial/maestro']]),
    tags: ['build-14', 'build-13', 'build-12'],
    branches: ['main', 'fix/crash-restore', 'feature/plan', 'fix/icon-launch', 'trial/maestro'],
  })
}

test('the files a scan reads: instructions at any depth up to four, the README, skills, workflows; then the documents they name', async () => {
  const paths = ['CLAUDE.md', 'ios/CLAUDE.md', 'a/b/c/d/CLAUDE.md', 'node_modules/x/CLAUDE.md', 'README.md', 'AGENTS.md', 'package.json', 'src/index.ts',
    '.claude/skills/start-ticket/SKILL.md', '.claude/skills/start-ticket/notes.md', '.github/workflows/ci.yml', 'docs/WORKFLOW.md', 'docs/OTHER.md']
  expect(textsToRead(paths)).toEqual(['CLAUDE.md', 'ios/CLAUDE.md', 'README.md', 'AGENTS.md', 'package.json', '.claude/skills/start-ticket/SKILL.md', '.github/workflows/ci.yml'])
  // Named by a skill or the instructions, and present; a README's mention does not count, nor a missing file.
  const texts = { 'CLAUDE.md': 'Read `docs/WORKFLOW.md` and docs/GONE.md.', 'README.md': 'See docs/OTHER.md', '.claude/skills/start-ticket/SKILL.md': 'Read `docs/WORKFLOW.md`.' }
  expect(referencedDocs(texts, paths)).toEqual(['docs/WORKFLOW.md'])
})

test('oink-like: every fact with its source, the flow complete', async () => {
  const facts = scanRepo(oinkInput())
  expect(facts.mainCheckout).toBe('~/Repositories/money-tracker')
  expect(facts.projectId).toBe('-home-me-Repositories-money-tracker')
  expect(facts.remote).toEqual({ url: 'https://github.com/Brutalino/oink.git', slug: 'Brutalino/oink' })
  expect(facts.name).toEqual({ value: 'O!nk', evidence: ['.claude/skills/open-pr/SKILL.md:3', '.claude/skills/start-ticket/SKILL.md:3'] })
  expect(facts.baseBranch).toEqual({ value: 'main', evidence: ['.claude/skills/start-ticket/SKILL.md:9'] })
  expect(facts.stack.map(one => one.value)).toEqual(['Node (package.json)', 'Swift package (Package.swift)', 'XcodeGen (project.yml)'])
  expect(facts.scripts.map(one => one.value)).toEqual(['npm run build: tsc -b && vite build', 'npm run test: vitest run'])
  expect(facts.tickets).toMatchObject({ value: 'github', repo: 'Brutalino/oink' })
  expect(facts.stateFile?.value).toBe('.work/state.json')
  expect(facts.stateFile?.phases.value).toEqual(['planning', 'implementing', 'review'])
  expect(facts.stateFile?.checks).toEqual({ value: true, evidence: ['.claude/skills/open-pr/SKILL.md:6'] })
  expect(facts.review).toEqual({
    skill: 'review-pr',
    heading: { value: 'Review', evidence: ['.claude/skills/review-pr/SKILL.md:9'] },
    sections: { value: ['Blockers', 'Suggestions', 'Earlier rounds'], evidence: ['.claude/skills/review-pr/SKILL.md:9'] },
    verdict: { value: { ready: 'ready to merge', fixes: 'fixes needed' }, evidence: ['.claude/skills/review-pr/SKILL.md:10'] },
    blockers: null,
  })
  expect(facts.ci.value).toBe(false)
  expect(facts.releaseTags).toEqual({ value: 'build-{n}', evidence: ['git tag: build-14, build-13, build-12 (3)'] })
  expect(facts.env).toEqual({ value: { kind: 'simulator', nameTemplate: 'iPhone 16 Pro (Oink {n})' }, evidence: ['docs/WORKFLOW.md:5'] })
  expect(facts.waits.map(one => one.value)).toEqual(['post', 'merge', 'issue', 'release'])
  expect(facts.rules.noDirectToMain?.evidence).toEqual(['CLAUDE.md:4'])
  expect(facts.rules.language?.value).toBe('Italian')
  // The legacy worktrees carry no issue number: none is a ticket's.
  expect(facts.worktrees).toEqual([
    { path: '~/Repositories/money-tracker-crash-restore', branch: 'fix/crash-restore', ticket: null },
    { path: '~/Repositories/Oink/maestro-trial', branch: 'trial/maestro', ticket: null },
  ])
  expect(facts.branchPrefixes).toEqual([{ prefix: 'fix/', count: 2 }, { prefix: '(none)', count: 1 }, { prefix: 'feature/', count: 1 }, { prefix: 'trial/', count: 1 }])
  expect(facts.notSupported.map(one => one.value)).toEqual([
    'the visual approval of a feature before its merge',
    'repro\'s confidence and evidence (the REPRO box is planned, not built)',
    'the ticket\'s simulator (env `simulator` is stored, no box draws it yet)',
  ])
  expect(facts.flow.map(row => `${row.stage}:${row.coverage}`)).toEqual(['capture:yes', 'plan:yes', 'verification:yes', 'pr:yes', 'review:yes', 'merge:yes', 'release:yes'])
  expect(facts.outcome).toBe('complete')
})

test('oink-like: the proposal is oink\'s configuration', async () => {
  const proposal = proposeConfig(scanRepo(oinkInput()))
  expect(proposal.errors).toEqual([])
  // oink's configuration took the review's own sections and Tower's full post wait (Italian included) from the dry run.
  // The allowed rules (decision 080) are the person's choice, never scanned: everything else is the proposal.
  const { permissions: _permissions, ...scanned } = clone(OINK_CONFIG)
  expect(clone(proposal.config)).toEqual(scanned)
  expect(clone(OINK_CONFIG).waits.post).toEqual(clone(WAIT_LIBRARY.post))
  // Only the delivery is asked, with the repository's rule as the suggestion.
  expect(proposal.questions).toEqual(['Tower\'s skill changes: by pull request (suggested: CLAUDE.md:4) or by a direct commit on main?'])
  const byPath = Object.fromEntries(proposal.items.map(one => [one.path, one]))
  expect(byPath['delivery']).toMatchObject({ value: 'pr', confidence: '?', evidence: ['CLAUDE.md:4'] })
  expect(byPath['worktree.followExisting']).toMatchObject({ value: false, confidence: '✓', note: 'new ticket worktrees go to ~/tower-work at once' })
  expect(byPath['checks.sources[stateFile]']).toMatchObject({ value: { stateFile: '.work/state.json' }, confidence: '✓' })
  expect(byPath['env']?.evidence).toEqual(['docs/WORKFLOW.md:5'])
  for (const one of proposal.items) expect(['✓', '?', '✗']).toContain(one.confidence)
})

// ── A ShopApp-like repository: Linear, staging, CI on pull requests, a criteria file, a Docker stack ──

const FLEET_ROOT = '/home/me/Repositories/shopapp'

const FLEET_FILES: Record<string, string> = {
  'CLAUDE.md': '# CLAUDE.md\n\nWrite all external text in English: Linear, PRs, commits.\n',
  'AGENTS.md': '# Agents\n\n- Never push directly to `main`\n',
  'README.md': '# ShopApp — Depot Printing Reliability Platform\n',
  'package.json': '{ "name": "shopapp", "scripts": { "test:local": "vitest" } }',
  'Dockerfile': 'FROM node:22\n',
  'docker-compose.yml': 'services: {}\n',
  'changelog.d/20260101T000000-x.md': 'x\n',
  '.github/workflows/ci.yml': 'name: CI\non:\n  pull_request:\n    types: [opened, ready_for_review]\n  push:\n    branches: [main]\n',
  '.github/workflows/deploy.yml': 'name: Deploy\non:\n  push:\n    branches: [staging]\n',
  'docs/03-workflow/pr-review-criteria.md': [
    '# Review criteria', '', 'Empty sections are written as `_(none)_`.', '', '```markdown', '## Self-review', '',
    '### Scope check', '<…>', '### Quality check', '<…>', '### Blockers', '<Numbered list. If none: write `_(none)_`.>',
    '### Suggestions', '<…>', '### Good stuff', '<…>', '```',
  ].join('\n'),
  '.claude/skills/start-ticket/SKILL.md': skill('start-ticket', 'First step on a ShopApp ticket. Creates the ticket worktree from staging and writes a plan into .work/state.json.', [
    '```sh', 'git fetch origin staging', 'git worktree add -b <user>/<ticket-slug> ../shopapp-<TICKET> origin/staging', '```',
    '- If an open blocker ticket already has a branch, create the worktree from that branch, not from `origin/staging`.',
    '- Use the Linear MCP `get_issue` on `TKT-1234`.',
    '```json', '{ "ticket": "TKT-1234", "phase": "planning", "checks": { "sha": null, "at": null } }', '```',
    'Write `phase` as `planning`. When the user says "go", set `phase` to `implementing`.',
  ].join('\n')),
  '.claude/skills/open-pr/SKILL.md': skill('open-pr', 'Final step before review on a ShopApp ticket.', [
    '- Ask the user before you commit. Never commit without an answer.',
    '> Mark the PR ready for review? This starts the CI pipeline.',
  ].join('\n')),
  '.claude/skills/review/SKILL.md': skill('review', 'Reviews a GitHub PR against the ShopApp review criteria.', [
    '`docs/03-workflow/pr-review-criteria.md` holds the criteria and the posting format.',
    '- Prefix the new comment `## Self-review (round N)`, as the criteria file says.',
    'Show the review to the user and wait. Post only after they agree.',
  ].join('\n')),
  '.claude/skills/wrap-up/SKILL.md': skill('wrap-up', 'Closes a finished ShopApp ticket.', 'Show the facts, then wait for a yes. Never merge on an assumed answer.'),
  '.claude/skills/dev-env/SKILL.md': skill('dev-env', 'Starts an isolated Docker stack for one ticket worktree.', '- The Auth0 dev tenant allows the frontend ports **5173 to 5179**. Write `env` into `.work/state.json`.'),
  '.claude/skills/shape/SKILL.md': skill('shape', 'Shapes a request into a story.', 'Challenge it.'),
  '.claude/skills/new-ticket/SKILL.md': skill('new-ticket', 'Creates one ShopApp Linear issue after an explicit yes.', 'Never create an issue without an explicit yes from the user.'),
  '.claude/skills/triage/SKILL.md': skill('triage', 'Triages Sentry issues into Linear.', 'Wait for explicit confirmation.'),
}

function fleetInput(): ScanInput {
  return repo(FLEET_ROOT, FLEET_FILES, {
    originUrl: 'git@github.com:acmeco/shopapp.git',
    listing: porcelain(FLEET_ROOT, [
      ['/home/me/legacy-work/TKT-1464', 'me/tkt-1464-return-id-token'],
      ['/home/me/legacy-work/TKT-2220', 'me/tkt-2220-research-autocharge'],
      ['/home/me/legacy-work/SHAPE-autocharge', 'feature/autocharge'],
      ['/home/me/legacy-work/BRAG-DEMO', null],
    ]),
    tags: ['prod-20261012-043343-c4a386fe8', 'prod-20261008-172737-9e6f22a22'],
  })
}

test('ShopApp-like: the proposal is ShopApp\'s configuration, but the conventions and Tower\'s routing', async () => {
  const facts = scanRepo(fleetInput())
  expect(facts.name.value).toBe('ShopApp')
  expect(facts.tickets).toMatchObject({ value: 'linear', prefix: 'TKT' })
  expect(facts.baseBranch).toEqual({ value: 'staging', evidence: ['.claude/skills/start-ticket/SKILL.md:8'] })
  expect(facts.stackOnBlocker.value).toBe(true)
  expect(facts.ci).toEqual({ value: true, evidence: ['.github/workflows/ci.yml'] })
  expect(facts.review?.blockers?.value).toEqual({ heading: 'Blockers', none: '_(none)_' })
  expect(facts.worktrees.filter(one => one.ticket !== null).map(one => one.ticket)).toEqual(['TKT-1464', 'TKT-2220'])
  expect(facts.notSupported.map(one => one.value)).toEqual(['changelog fragments (`changelog.d/`): checked by the skills, not shown by Tower'])
  // No release skill: the release stage is only the deploy workflow.
  expect(facts.flow.find(row => row.stage === 'release')?.coverage).toBe('partial')
  expect(facts.outcome).toBe('partial')

  const proposal = proposeConfig(facts)
  expect(proposal.errors).toEqual([])
  const expected = clone(LINEAR_CONFIG)
  // A stored configuration names its checkout; new worktrees under ~/tower-work at once, the open ones stay.
  expected.project.mainCheckout = '~/Repositories/shopapp'
  expected.worktree.pathTemplate = '~/tower-work/shopapp/{key}-{slug}'
  expected.worktree.followExisting = false
  // Setup never invents per-skill models: Tower's defaults, the person's overrides from the routing view.
  expected.routing = 'defaults'
  // The two capture skills' and the merge's questions are waits too (never answered by away mode).
  expected.waits.merge = clone(WAIT_LIBRARY.merge)
  expected.waits.issue = clone(WAIT_LIBRARY.issue)
  expect(clone(proposal.config)).toEqual(expected)
  const followNote = proposal.items.find(one => one.path === 'worktree.followExisting')?.note
  expect(followNote).toBe('new ticket worktrees go to ~/tower-work at once; the 2 open ones (~/legacy-work/TKT-1464 TKT-1464, ~/legacy-work/TKT-2220 TKT-2220) stay where they are until their ticket closes; Tower still finds them through git worktree list')
  expect(proposal.questions).toEqual([
    'How do you release?',
    'Tower\'s skill changes: by pull request (suggested: AGENTS.md:3) or by a direct commit on staging?',
    'Which language to talk in, and which to publish in (issues, PRs, commits)?',
  ])
})

test('Tower\'s defaults the proposal uses agree with the code they come from', async () => {
  // linear.ts's candidate query and ShopApp's configuration of it.
  expect(LINEAR_DEFAULT_QUERY).toEqual(clone(LINEAR_CONFIG.tickets.kind === 'linear' ? LINEAR_CONFIG.tickets.query : null))
  expect(LINEAR_QUERY).toContain(`first: ${LINEAR_DEFAULT_QUERY.first}`)
  // The away questions of profile.ts.
  expect(WAIT_LIBRARY.openPr?.patterns).toEqual(AWAY_QUESTIONS.openPr.map(re => ({ source: re.source, flags: re.flags })))
  expect(WAIT_LIBRARY.post?.patterns).toEqual(AWAY_QUESTIONS.review.map(re => ({ source: re.source, flags: re.flags })))
})

// ── Repositories with less ─────────────────────────────────────────────

test('no flow: a repository with a README alone asks where the tickets live, how tests run, how it releases, the delivery and the language', async () => {
  const facts = scanRepo(repo('/home/me/code/plain', { 'README.md': '# Plain\n', 'src/main.go': 'package main\n', 'go.mod': 'module plain\n' }, { originUrl: 'https://github.com/me/plain' }))
  expect(facts.outcome).toBe('none')
  expect(facts.flow.every(row => row.coverage === 'no')).toBe(true)
  expect(facts.stack.map(one => one.value)).toEqual(['Go (go.mod)'])
  const proposal = proposeConfig(facts)
  expect(proposal.questions).toEqual([
    'Where do the tickets live (GitHub issues of this repository, Linear, none)?',
    'No CI runs on pull requests and no skill records its checks: how and when do you run the tests?',
    'How do you release?',
    'Tower\'s skill changes: by pull request or by a direct commit on main?',
    'Which language to talk in, and which to publish in (issues, PRs, commits)?',
  ])
  const config = proposal.config as TowerConfig
  expect(config.tickets).toEqual({ kind: 'none' })
  expect(config.phases).toEqual({ source: 'git' })
  expect(config.worktree.pathTemplate).toBe('~/tower-work/plain/{key}-{slug}')
  expect(config.workflow.steps.review?.skill).toBe('code-review')
  expect(config.review.verdict).not.toBeNull()
  expect(config.repoActions).toEqual([])
  const byPath = Object.fromEntries(proposal.items.map(one => [one.path, one]))
  expect(byPath['workflow.steps.start']?.confidence).toBe('✗')
  expect(byPath['tickets']?.confidence).toBe('?')
  expect(proposal.errors).toEqual([])
})

test('partial: GitHub issues with a start and a pull request skill, no review or merge skill', async () => {
  const files = {
    'README.md': '# Tool\n',
    '.claude/skills/start-ticket/SKILL.md': skill('start-ticket', 'Starts a GitHub issue of the tool.', 'gh issue view <n>, then a plan.'),
    '.claude/skills/open-pr/SKILL.md': skill('open-pr', 'Opens the pull request.', 'gh pr create'),
    '.github/workflows/test.yml': 'on: [push, pull_request]\n',
  }
  const facts = scanRepo(repo('/home/me/code/tool', files, { originUrl: 'https://github.com/me/tool.git' }))
  expect(facts.outcome).toBe('partial')
  expect(Object.fromEntries(facts.flow.map(row => [row.stage, row.coverage]))).toEqual({ capture: 'no', plan: 'partial', verification: 'yes', pr: 'yes', review: 'no', merge: 'no', release: 'no' })
  const proposal = proposeConfig(facts)
  expect(proposal.errors).toEqual([])
  expect(proposal.config.tickets).toMatchObject({ kind: 'github', repo: 'me/tool' })
  expect(proposal.config.checks.sources).toEqual(['github-ci'])
  expect(Object.keys(proposal.config.workflow.steps)).toEqual(['start', 'openPr', 'review'])
})

test('release tags: only `<word><sep><n>` tags with a release skill; others reported as not supported', async () => {
  const withRelease = (tags: string[]) => scanRepo(repo('/r', { '.claude/skills/release/SKILL.md': skill('release', 'Ships.', 'Tag it.') }, { tags }))
  expect(withRelease(['v1.2.3', 'v1.2.2']).releaseTags).toBeNull()
  expect(withRelease(['build-7', 'build-6', 'v1.0.0']).releaseTags?.value).toBe('build-{n}')
  expect(withRelease(['build-7']).releaseTags).toBeNull()
  expect(withRelease(['v1.2.3']).notSupported.map(one => one.value)).toEqual(['release tags like `v1.2.3` (only `<prefix><n>` tags are read)'])
  // Without a release skill tags are not the flow's.
  expect(scanRepo(repo('/r', {}, { tags: ['build-7', 'build-6'] })).releaseTags).toBeNull()
})

test('the proposal through JSON validates as Tower would read it stored', async () => {
  for (const input of [oinkInput(), fleetInput()]) {
    const result = validateConfig(clone(proposeConfig(scanRepo(input)).config))
    expect(result.ok ? [] : result.errors).toEqual([])
  }
})
