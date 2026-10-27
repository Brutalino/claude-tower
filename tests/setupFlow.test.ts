import { expect, test } from 'claude-code/testing'

import { LINEAR_CONFIG } from './linearConfig'
import { OINK_CONFIG } from '../hooks/core/configs/examples/oink'
import { validateConfig, type TowerConfig } from '../hooks/core/config'
import { draftFlowValues, firstTickets, FLOW_SKILLS, flowPlaceholders, missingFlowSkills, missingSkills, renderFlowSkill, validateFlowValues, type FlowValues } from '../hooks/core/setupFlow'
import { scanRepo, textsToRead, referencedDocs, type ScanInput } from '../hooks/core/setupScan'

// Decision 065: the guided flow's pure part. The real templates (skills/tower-setup/flow) are rendered, delivered and
// scanned again on throwaway repositories by tools/check-tower-setup.sh.

const skill = (name: string, description: string, body: string) => `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`

function repo(files: Record<string, string>, git: Partial<ScanInput> = {}): ScanInput {
  const paths = Object.keys(files)
  const texts: Record<string, string> = {}
  for (const path of textsToRead(paths)) texts[path] = files[path] as string
  for (const path of referencedDocs(texts, paths)) texts[path] = files[path] as string
  return { root: '/home/me/code/tiny', home: '/home/me', originUrl: null, originHead: null, listing: null, branches: ['main'], tags: [], paths, texts, ...git }
}

const VALUES: FlowValues = {
  project: 'Tiny', baseBranch: 'main', tickets: 'github', ticketsRepo: 'me/tiny', idPrefix: null, talkLanguage: 'Italian', publishLanguage: 'English',
  build: 'npm run build', test: 'npm test', fullSuite: null, ci: false, releaseHow: 'npm publish', releaseTagPrefix: 'release-',
  feedbackSource: 'the support inbox', rules: ['main is production (CLAUDE.md:3)'], worktreeRoot: '~/tower-work/tiny',
}

const clone = (value: unknown): any => JSON.parse(JSON.stringify(value))

test('flow values: the draft from a scan holds together once the tickets\' repository is known; every error at once', async () => {
  const facts = scanRepo(repo({ 'README.md': '# Tiny\n', 'package.json': '{ "scripts": { "build": "tsc", "test": "vitest run" } }' }, { originUrl: 'https://github.com/me/tiny.git' }))
  const draft = draftFlowValues(facts)
  expect(draft).toMatchObject({ project: 'Tiny', baseBranch: 'main', tickets: 'github', ticketsRepo: 'me/tiny', build: 'npm run build', test: 'npm run test', ci: false, worktreeRoot: '~/tower-work/tiny' })
  expect(validateFlowValues(draft).ok).toBe(true)
  expect(validateFlowValues(VALUES)).toEqual({ ok: true, values: VALUES })
  const bad = { ...VALUES, tickets: 'none', ticketsRepo: 'tiny', releaseTagPrefix: 'v', extra: 1, test: '' }
  expect(validateFlowValues(bad)).toEqual({ ok: false, errors: [
    'extra: unknown field',
    'test: expected a non-empty string',
    "tickets: expected 'github' or 'linear' (a flow needs tickets)",
    'releaseTagPrefix: letters and a separator (release-), so Tower reads the tags',
  ] })
  expect(validateFlowValues({ ...VALUES, tickets: 'linear', idPrefix: 'abc' }).ok ? [] : (validateFlowValues({ ...VALUES, tickets: 'linear', idPrefix: 'abc' }) as { errors: string[] }).errors)
    .toEqual(['idPrefix: Linear ids need their prefix in capitals (ABC for ABC-12)'])
})

test('placeholders: GitHub and Linear wording, the convention\'s worktree and branch; an unknown one is reported and kept', async () => {
  const github = flowPlaceholders(VALUES)
  expect(github.TICKET_READ).toBe('`gh issue view <n> --repo me/tiny --comments`')
  expect(github.WORKTREE_PATH).toBe('~/tower-work/tiny/<n>-<slug>')
  expect(github.RELEASE_TAG).toBe('release-<n>')
  expect(github.BLOCKER_RULE).toBe('')
  expect(github.RULES).toBe('- main is production (CLAUDE.md:3)')
  const linear = flowPlaceholders({ ...VALUES, tickets: 'linear', ticketsRepo: null, idPrefix: 'ABC' })
  expect(linear.TICKET_EXAMPLE).toBe('ABC-123')
  expect(linear.WORKTREE_PATH).toBe('~/tower-work/tiny/ABC-<n>-<slug>')
  expect(linear.BLOCKER_RULE).toContain('blocker ticket already has a branch')
  expect(renderFlowSkill('Base {{BASE_BRANCH}}, {{NOPE}} and {{TEST}}', VALUES)).toEqual({ text: 'Base main, {{NOPE}} and npm test', missing: ['NOPE'] })
})

test('missing skills: everything for a repository without a flow, only the missing stages for a partial one', async () => {
  const none = scanRepo(repo({ 'README.md': '# Tiny\n' }))
  expect(missingFlowSkills(none)).toEqual({ skills: FLOW_SKILLS.map(name => expect.objectContaining({ skill: name })), notes: [] })
  // A start skill without a state file, a pull request skill, a review without a verdict: plan and review only noted.
  const partial = scanRepo(repo({
    '.claude/skills/start-ticket/SKILL.md': skill('start-ticket', 'Starts a GitHub issue.', 'gh issue view <n>, then a plan.'),
    '.claude/skills/open-pr/SKILL.md': skill('open-pr', 'Opens the PR.', 'gh pr create'),
    '.claude/skills/review/SKILL.md': skill('review', 'Reviews a PR.', 'Write what you think.'),
  }, { originUrl: 'https://github.com/me/tiny.git' }))
  const found = missingFlowSkills(partial)
  expect(found.skills.map(one => one.skill)).toEqual(['new-ticket', 'triage', 'wrap-up', 'release'])
  expect(found.notes.map(one => one.stage)).toEqual(['plan', 'verification', 'review'])
  // A skill of the same name is never proposed again.
  expect(found.skills.some(one => one.skill === 'review-pr')).toBe(false)
})

test('first tickets: tests and CI when missing, nothing when both are there or the checks are recorded', async () => {
  expect(firstTickets(scanRepo(repo({ 'README.md': '# Tiny\n' }))).map(one => one.title)).toEqual(['Add a first test suite', 'Run the tests on every pull request (CI)'])
  const covered = scanRepo(repo({ 'src/a.test.ts': '', '.github/workflows/ci.yml': 'on:\n  pull_request:\n' }))
  expect(covered.tests).toEqual({ value: true, evidence: ['src/a.test.ts'] })
  expect(firstTickets(covered)).toEqual([])
  // No CI, but checks recorded against the head commit (oink): no CI ticket.
  const recorded = scanRepo(repo({ 'src/a.test.ts': '', '.claude/skills/open-pr/SKILL.md': skill('open-pr', 'Opens the PR.', 'Record `checks.sha` in `.work/state.json`.') }))
  expect(firstTickets(recorded)).toEqual([])
})

test('the skills a configuration runs, against those a repository has; Claude Code\'s own aside', async () => {
  const oink = validateConfig(clone(OINK_CONFIG))
  if (!oink.ok) throw new Error(oink.errors.join('\n'))
  expect(missingSkills(oink.config, ['start-ticket', 'open-pr', 'review-pr', 'wrap-up', 'release', 'new-ticket', 'triage'])).toEqual([])
  expect(missingSkills(oink.config, ['start-ticket'])).toEqual(['new-ticket', 'open-pr', 'release', 'review-pr', 'triage', 'wrap-up'])
  expect(missingSkills(LINEAR_CONFIG, [])).toEqual(['dev-env', 'new-ticket', 'open-pr', 'review', 'shape', 'start-ticket', 'triage', 'wrap-up'])
  const plain: TowerConfig = { ...clone(oink.config), repoActions: [], workflow: { steps: { start: { skill: 'start-ticket', args: '{n}', phase: 'not started', session: 'ticket' }, review: { skill: 'code-review', args: '{pr}', phase: null, session: 'review' } } } }
  plain.review = { ...plain.review, skill: 'code-review' }
  expect(missingSkills(plain, ['start-ticket'])).toEqual([])
})
