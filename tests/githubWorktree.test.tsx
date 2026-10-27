import { expect, test } from 'claude-code/testing'

import { TOWER_RAIL_KEYS, validateConfig, type TowerConfig } from '../hooks/core/config'
import { OINK_CONFIG } from '../hooks/core/configs/examples/oink'
import { LINEAR_CONFIG } from './linearConfig'
import { issueKind } from '../hooks/core/github'
import { newWorktree } from '../hooks/core/worktrees'
import { HOME, REPO, repoGitRail, storedConfig } from './repoGit'

// Decision 054: a GitHub issue's worktree and branch by the convention, `{kind}` from its labels.

function valid(raw: unknown): TowerConfig {
  const result = validateConfig(raw)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result.config
}

test('the convention: ~/tower-work/{repo}/{n}-{slug} and {kind}/{n}-{slug}, from origin/<base>', async () => {
  const config = valid(storedConfig())
  if (config.tickets.kind !== 'github') throw new Error('github tickets')
  const plan = (ticket: string, title: string, labels: string[]) => newWorktree({
    repo: REPO, ticket, issue: { title, branchName: '' }, existing: [], blockerBranch: null, originBranches: ['main'], baseBranch: 'main',
    kind: issueKind(labels, (config.tickets as { labels: { kinds: Record<string, string>; defaultKind: string } }).labels),
  }, config.worktree, HOME)
  expect(plan('#33', 'Crash on restore', ['bug', 'testflight'])).toEqual({ path: `${HOME}/tower-work/oink/33-crash-on-restore`, branch: 'fix/33-crash-on-restore', base: 'origin/main' })
  expect(plan('#34', 'Export to CSV', ['enhancement'])).toEqual({ path: `${HOME}/tower-work/oink/34-export-to-csv`, branch: 'feature/34-export-to-csv', base: 'origin/main' })
  // oink itself: its checkout is money-tracker, its worktrees go under ~/tower-work/oink.
  const oink = valid(JSON.parse(JSON.stringify(OINK_CONFIG)))
  const real = newWorktree({ repo: '/home/me/Repositories/money-tracker', ticket: '#27', issue: { title: 'UI testing wipes prefs', branchName: '' }, existing: [], blockerBranch: null, originBranches: ['main'], baseBranch: 'main', kind: 'fix' }, oink.worktree, '/home/me')
  expect(real).toEqual({ path: '/home/me/tower-work/oink/27-ui-testing-wipes-prefs', branch: 'fix/27-ui-testing-wipes-prefs', base: 'origin/main' })
})

test('Enter on an open issue promotes it: the worktree and branch from origin/main, no session; Enter on its row then opens its session with /start-ticket <n> on the session\'s own model', async ($, on) => {
  const calls = repoGitRail(on)
  await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as any)
  const board = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 160 } } as any)
  await board.press({ key: 'refresh' })
  await board.press({ key: 'cand:#33' })
  const path = `${HOME}/tower-work/oink/33-crash-on-restore`
  expect(calls.argv).toContainEqual(['git', 'fetch', 'origin', 'main'])
  expect(calls.argv).toContainEqual(['git', 'worktree', 'add', '-b', 'fix/33-crash-on-restore', path, 'origin/main'])
  // Decision 071: the promote opens nothing; its row under IN PROGRESS does.
  expect(calls.tmux.filter(argv => argv[1] === 'split-window' || argv[1] === 'new-window')).toEqual([])
  expect(await board.find({ key: 'cand:#33' })).toBeUndefined()
  await board.press({ key: 'row:#33' })
  const split = calls.tmux.find(argv => argv[1] === 'split-window') ?? []
  expect(split).toContain(path)
  expect(split).toContain('TOWER_TICKET=#33')
  expect(split.at(-1)).toBe('/start-ticket 33')
  // Decision 080: the stored configuration's allowed rules ride in the session's --settings.
  expect(JSON.parse(split[split.indexOf('--settings') + 1] ?? '{}').permissions).toEqual((OINK_CONFIG as { permissions: unknown }).permissions)
  expect(split).not.toContain('--model')
  expect(split).not.toContain('--effort')
  // Nothing written to GitHub (decision 077's blockers are a GraphQL query).
  expect(calls.argv.filter(argv => argv[0] === 'gh').every(argv => ['list', 'user', 'graphql'].includes(argv[2] ?? ''))).toBe(true)
  await board.unmount()
})

test('a repository action\'s key is one the engine can bind: a digit or a lowercase letter (oink releases on l, not R)', async () => {
  const raw = storedConfig()
  raw.repoActions[2].key = 'R'
  const result = validateConfig(raw)
  expect(result.ok ? [] : result.errors).toEqual(['repoActions[2].key: expected a digit or a lowercase letter, got "R"'])
  expect(valid(JSON.parse(JSON.stringify(OINK_CONFIG))).repoActions.map(action => action.key)).toEqual(['n', 't', 'l'])
})

test('a repository action may not take Tower\'s own keys on the board and the rail; ShopApp\'s s n t and oink\'s n t l stay valid', () => {
  for (const key of ['k', 'r', 'a', 'q', 'p', 'b', 'c', 'y', 'g', 'x', 'i', 'o', 'm', 'w']) {
    const raw = storedConfig()
    raw.repoActions[2].key = key
    const result = validateConfig(raw)
    expect(result.ok ? [] : result.errors).toEqual([`repoActions[2].key: '${key}' is Tower's own key on the board and the rail (${TOWER_RAIL_KEYS[key]}); choose another`])
  }
  const raw = storedConfig()
  raw.repoActions[2].key = 'o'
  expect(validateConfig(raw).ok ? '' : (validateConfig(raw) as { errors: string[] }).errors[0]).toBe("repoActions[2].key: 'o' is Tower's own key on the board and the rail (new session); choose another")
  // ShopApp's own actions (s n t) and oink's (n t l) are actions, not Tower's keys.
  expect(validateConfig(JSON.parse(JSON.stringify(LINEAR_CONFIG))).ok).toBe(true)
  expect(LINEAR_CONFIG.repoActions.map(action => action.key)).toEqual(['s', 'n', 't'])
  expect(validateConfig(JSON.parse(JSON.stringify(OINK_CONFIG))).ok).toBe(true)
  const shape = storedConfig()
  shape.repoActions[2].key = 's'
  expect(validateConfig(shape).ok).toBe(true)
})
