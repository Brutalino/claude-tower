import { expect, mock, test } from 'claude-code/testing'

import { validateConfig, type TowerConfig } from '../hooks/core/config'
import { OINK_CONFIG } from '../hooks/core/configs/examples/oink'
import { ticketStart } from '../hooks/core/launcher'
import { PROFILE } from './linearConfig'
import { defaultsProfile, parseSkillFile } from '../hooks/core/routingDefaults'

// Decision 054: `routing: 'defaults'`, Tower's own routing for a repository that brings none.

function oink(): TowerConfig {
  const result = validateConfig(JSON.parse(JSON.stringify(OINK_CONFIG)))
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result.config
}

const SKILLS = [
  { name: 'triage', description: 'Triage the open issues' },
  { name: 'start-ticket', description: 'Plan an issue in its worktree' },
  { name: 'release', description: 'Cut a TestFlight build' },
  { name: 'review-pr', description: 'Review a pull request' },
]

test('a SKILL.md frontmatter: name and description, quoted or folded; the folder when it names none', async () => {
  expect(parseSkillFile('---\nname: start-ticket\ndescription: Plan an issue in its worktree\n---\n# Start\n', 'x')).toEqual({ name: 'start-ticket', description: 'Plan an issue in its worktree' })
  expect(parseSkillFile('---\ndescription: "Review a PR: the diff, the tests"\n---\n', 'review-pr')).toEqual({ name: 'review-pr', description: 'Review a PR: the diff, the tests' })
  expect(parseSkillFile('---\nname: release\ndescription: >\n  Cut a build,\n  tag it.\nallowed-tools: Bash\n---\n', 'release')).toEqual({ name: 'release', description: 'Cut a build, tag it.' })
  expect(parseSkillFile('# no frontmatter\n', 'x')).toBeNull()
  expect(parseSkillFile('---\nname: open\n', 'x')).toBeNull()
})

test('defaults: Tower\'s roles and routes, the repository\'s own skills on the session\'s model, no ShopApp skill', async () => {
  const config = oink()
  const profile = defaultsProfile(config, SKILLS)
  expect(profile.roles).toEqual(PROFILE.roles)
  expect(profile.builtinRoutes).toEqual(PROFILE.builtinRoutes)
  expect(profile.mainGuidance).toBe(PROFILE.mainGuidance)
  expect(profile.baseBranch).toBe('main')
  // Sorted by name; the repository actions (n t R) and `hub` steps run in the main checkout.
  expect(profile.skills).toEqual([
    { name: 'release', what: 'Cut a TestFlight build', where: 'hub', model: null, effort: null },
    { name: 'review-pr', what: 'Review a pull request', where: 'ticket', model: null, effort: null },
    { name: 'start-ticket', what: 'Plan an issue in its worktree', where: 'ticket', model: null, effort: null },
    { name: 'triage', what: 'Triage the open issues', where: 'hub', model: null, effort: null },
  ])
  for (const shopapp of ['shape', 'dev-env', 'review', 'new-widget', 'linear-promote-children']) expect(profile.skills.some(skill => skill.name === shopapp)).toBe(false)
  // The review guidance names the configuration's save path and no Linear.
  expect(profile.reviewGuidance).toContain('`<worktree>/.work/review/pr-<n>-round-<N>.md`')
  expect(profile.reviewGuidance).not.toContain('Linear')
  // A repository without skills: none listed.
  expect(defaultsProfile(config, []).skills).toEqual([])
  // The start step on the session's own model and effort: no --model, no --effort.
  expect(ticketStart('#27', 'not started', config.workflow.steps.start, profile.skills, profile.modelIds)).toEqual({ prompt: '/start-ticket 27', model: null, effort: null })
  // Without the skill in the repository there is no start step to run.
  expect(ticketStart('#27', 'not started', config.workflow.steps.start, [], profile.modelIds)).toBeNull()
})

test('a configuration of its own may give a skill no model: the session\'s own', async () => {
  const raw = JSON.parse(JSON.stringify(OINK_CONFIG))
  raw.routing = { ...JSON.parse(JSON.stringify({ roles: PROFILE.roles, modelIds: PROFILE.modelIds, builtinRoutes: PROFILE.builtinRoutes, forkAdvice: PROFILE.forkAdvice, mainGuidance: PROFILE.mainGuidance, reviewGuidance: PROFILE.reviewGuidance })),
    skills: ['start-ticket', 'open-pr', 'review-pr', 'wrap-up', 'release', 'new-ticket', 'triage'].map(name => ({ name, what: name, where: 'ticket', model: null, effort: null })) }
  const result = validateConfig(raw)
  expect(result.ok ? [] : result.errors).toEqual([])
  raw.routing.skills[0].model = 'gpt'
  const bad = validateConfig(raw)
  expect(bad.ok ? [] : bad.errors).toEqual(["routing.skills[0].model: model 'gpt' is not in routing.modelIds"])
})

// The rail of a repository with a stored `defaults` configuration: the launcher lists its own skills, not ShopApp's.
const STATE = '/state/tower'
const REPO = '/r/oink'
const STORED = `${STATE}/projects/-r-oink.json`
const SKILL_FILES: Record<string, string> = {
  [`${REPO}/.claude/skills/start-ticket/SKILL.md`]: '---\nname: start-ticket\ndescription: Plan an issue in its worktree\n---\n',
  [`${REPO}/.claude/skills/triage/SKILL.md`]: '---\nname: triage\ndescription: Triage the open issues\n---\n',
}

test('the rail of a defaults configuration lists the repository\'s skills in the launcher, never ShopApp\'s', async ($, on) => {
  const stored = JSON.parse(JSON.stringify(OINK_CONFIG))
  stored.project.mainCheckout = REPO
  mock.env(on, { TOWER_ROLE: 'rail', TOWER_REPO: REPO, TOWER_PLUGIN_DIR: '/plugins/tower', HOME: '/home/test', TMUX_PANE: '%0', TOWER_STATE_DIR: STATE })
  mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.cwd' as any, async () => ({ value: REPO }) as any)
  on('command.register' as any, async () => ({ value: undefined }) as any)
  on('command.list', async () => ({ value: [
    { name: 'start-ticket', description: 'Plan an issue', source: 'user' },
    { name: 'triage', description: 'Triage', source: 'user' },
    { name: 'shape', description: 'A personal skill', source: 'user' },
  ] }) as any)
  on('fs.exists', async (_$: unknown, e: any) => ({ value: e.path in SKILL_FILES }) as any)
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.list', async (_$: unknown, e: any) => ({ value: e.path === `${REPO}/.claude/skills` ? [{ name: 'start-ticket', kind: 'directory' }, { name: 'triage', kind: 'directory' }, { name: '_fake', kind: 'directory' }] : [] }) as any)
  on('fs.read', async (_$: unknown, e: any) => {
    if (e.path === STORED) return { value: JSON.stringify(stored) } as any
    const text = SKILL_FILES[e.path]
    return (text !== undefined ? { value: text } : { deny: `ENOENT: ${e.path}` }) as any
  })
  on('process.run', async (_$: unknown, e: any) => {
    const argv = e.argv.join(' ')
    if (argv === 'git worktree list --porcelain') return { value: { exitCode: 0, stdout: `worktree ${REPO}\nHEAD a\nbranch refs/heads/main\n`, stderr: '' } } as any
    if (argv === 'git remote get-url origin') return { value: { exitCode: 0, stdout: 'https://github.com/Brutalino/oink.git\n', stderr: '' } } as any
    if (e.argv[0] === 'tmux') return { value: { exitCode: 0, stdout: e.argv[1] === 'display-message' ? '@0' : e.argv[1] === 'list-panes' ? '%0\t@0\trail\t\t' : '', stderr: '' } } as any
    return { value: { exitCode: 1, stdout: '', stderr: 'not faked' } } as any
  })
  await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as any)
  const rail = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 40 } } as any)
  await rail.press({ key: 'skills' })
  expect((await rail.find({ key: 'skill:start-ticket' }))?.text).toContain('/start-ticket')
  expect(await rail.find({ key: 'skill:triage' })).toBeDefined()
  // `shape` is ShopApp's (and here a personal skill, not the repository's): not listed.
  expect(await rail.find({ key: 'skill:shape' })).toBeUndefined()
  expect(await rail.find({ type: 'Text', text: /Triage the open issues/ })).toBeDefined()
  await rail.unmount()
})
