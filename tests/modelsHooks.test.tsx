import { expect, mock, test } from 'claude-code/testing'

import { PROBE_ARGV, PROBE_INPUT } from '../hooks/core/models'
import { STDOUT } from './modelsFixture'
import { textLines } from './repoGit'
import { withStoredLinear } from './linearConfig'

// Decision 057: the rail asks Claude Code for `/model`'s list in the background when the cache is stale, writes it
// through a temporary file and `mv`; the routing view names the models from it and says when it is not fresh.

const PORCELAIN = ['worktree /repo/shopapp', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', ''].join('\n')
const RAIL_ENV = { TOWER_ROLE: 'rail', TOWER_REPO: '/repo/shopapp', TOWER_PLUGIN_DIR: '/plugins/tower', HOME: '/home/test', TMUX_PANE: '%0' }
const TICKET_ENV = { TOWER_ROLE: 'ticket', TOWER_TICKET: 'TKT-1', TOWER_REPO: '/repo', HOME: '/home/test' }
const STATE = '/home/test/.claude/tower'
const CACHE = `${STATE}/models.json`
const NOW = 10 * 24 * 3_600_000
const DAY = 24 * 3_600_000

type Run = { argv: string[]; cwd?: string; stdin?: string; env?: Record<string, string> }

/** A rail whose host answers `claude --version` with `version` and the probe with `probe` (null: it fails). */
function rail(on: any, files: Record<string, string>, version: string, probe: string | null, env: Record<string, string> = RAIL_ENV) {
  mock.env(on, env)
  mock.store(on)
  const clock = mock.clock(on, { now: NOW })
  const runs: Run[] = []
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.id', async () => ({ value: 'rail-1' }))
  on('session.cwd', async () => ({ value: '/repo/shopapp' }))
  on('command.register', async () => ({ value: undefined }))
  on('command.list', async () => ({ value: [] }))
  on('agent.register', async () => ({ value: undefined }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.focus', async () => ({}))
  on('ui.panes', async () => ({ value: [{ id: 'tower', isFocused: true, isPlaced: true }] }))
  on('prompt.read', async () => ({ value: { text: '' } }))
  on('fs.write', async (_$: unknown, e: any) => {
    files[String(e.path)] = String(e.text ?? e.content ?? '')
    return { value: undefined }
  })
  on('fs.exists', async (_$: unknown, e: any) => ({ value: e.path in files }))
  on('fs.list', async () => ({ value: [] }))
  on('fs.read', withStoredLinear('/repo/shopapp', async (_$: unknown, e: any) => (e.path in files ? { value: files[e.path] } : { deny: `ENOENT: ${e.path}` })))
  on('http.fetch', async () => ({ deny: 'no network in tests' }))
  on('process.run', async (_$: unknown, e: any) => {
    const argv = e.argv as string[]
    if (argv[0] === 'claude') {
      runs.push({ argv, cwd: e.init?.cwd, stdin: e.init?.stdin, env: e.init?.env })
      if (argv[1] === '--version') return { value: { exitCode: 0, stdout: `${version} (Claude Code)\n`, stderr: '' } }
      return { value: { exitCode: probe === null ? 1 : 0, stdout: probe ?? '', stderr: '' } }
    }
    if (argv[0] === 'mv') {
      files[argv[3]!] = files[argv[2]!]!
      delete files[argv[2]!]
      return { value: { exitCode: 0, stdout: '', stderr: '' } }
    }
    if (argv[0] !== 'tmux') return { value: { exitCode: 0, stdout: argv[0] === 'git' ? PORCELAIN : '', stderr: '' } }
    const out = argv[1] === 'display-message' ? '@0' : argv[1] === 'list-panes' ? '%0\t@0\trail\t\t' : ''
    return { value: { exitCode: 0, stdout: out, stderr: '' } }
  })
  return { clock, runs }
}

const cacheText = (claudeCodeVersion: string, fetchedAt: number) => {
  const models = JSON.parse(STDOUT.split('\n')[1]!).response.response.models
  return JSON.stringify({ claudeCodeVersion, fetchedAt, models })
}

test('the rail with no cache asks Claude Code once, in the state dir, and writes models.json through its temporary twin', async ($: any, on: any) => {
  const files: Record<string, string> = {}
  const { clock, runs } = rail(on, files, '2.1.296', STDOUT)
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const probes = runs.filter(run => run.argv[1] === '-p')
  expect(probes).toEqual([{ argv: [...PROBE_ARGV], cwd: STATE, stdin: PROBE_INPUT, env: { TOWER_ROLE: '' } }])
  expect(probes[0]!.argv).not.toContain('--plugin-dir')
  const written = JSON.parse(files[CACHE]!)
  expect(written.claudeCodeVersion).toBe('2.1.296')
  expect(written.fetchedAt).toBe(NOW)
  expect(written.models.length).toBe(13)
  expect(Object.keys(files).filter(path => path.endsWith('.tmp'))).toEqual([])
})

test('a fresh cache of the installed version is not asked again', async ($: any, on: any) => {
  const files: Record<string, string> = { [CACHE]: cacheText('2.1.296', NOW - 3_600_000) }
  const { clock, runs } = rail(on, files, '2.1.296', STDOUT)
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(runs.map(run => run.argv[1])).toEqual(['--version'])
  expect(JSON.parse(files[CACHE]!).fetchedAt).toBe(NOW - 3_600_000)
})

test('a cache from another Claude Code version is asked again at session start', async ($: any, on: any) => {
  const files: Record<string, string> = { [CACHE]: cacheText('2.1.200', NOW - 3_600_000) }
  const { clock, runs } = rail(on, files, '2.1.296', STDOUT)
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(runs.map(run => run.argv[1])).toEqual(['--version', '-p'])
  expect(JSON.parse(files[CACHE]!)).toEqual({ ...JSON.parse(cacheText('2.1.296', NOW)) })
})

test('a failed probe keeps the old cache; the routing view names the models from it and says how old it is', async ($: any, on: any) => {
  const old = cacheText('2.1.296', NOW - 3 * DAY)
  const files: Record<string, string> = { [CACHE]: old }
  const { runs } = rail(on, files, '2.1.296', null, TICKET_ENV)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'deck', props: { bodyColumns: 66 } })
  await ui.press({ key: 'view:routing' })
  expect(runs.map(run => run.argv[1])).toEqual(['-p'])
  expect(files[CACHE]).toBe(old)
  expect(await ui.find({ type: 'Text', text: /^models: from cache 3 d ago$/ })).toBeDefined()
  const drawn = textLines(await ui.drawn()).join('\n')
  expect(drawn).toContain('default · Fable 5.1')
  expect(drawn).toContain('Opus 5.5')
  expect(drawn).toContain('Haiku 5.5')
  await ui.unmount()
})

test('the routing view: j walks the real list (Opus 4.6 stored as its id), e on Haiku 4.5 does nothing, a clamped effort reads xhigh→high', async ($: any, on: any) => {
  const files: Record<string, string> = { [CACHE]: cacheText('2.1.296', NOW - 3_600_000) }
  const file = `${STATE}/routing/-repo.json`
  files[file] = JSON.stringify({ skills: { 'start-ticket': { model: 'claude-opus-4-6' } }, roles: { runner: { model: 'claude-haiku-4-5-20251001' } }, free: {} })
  const { runs } = rail(on, files, '2.1.296', STDOUT, TICKET_ENV)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'deck', props: { bodyColumns: 66 } })
  await ui.press({ key: 'view:routing' })
  // A fresh cache: no probe, no line about it.
  expect(runs).toEqual([])
  expect(await ui.find({ type: 'Text', text: /^models: / })).toBeUndefined()
  const drawn = textLines(await ui.drawn()).join('\n')
  expect(drawn).toContain('Opus 4.6')
  expect(drawn).toContain('xhigh→high')
  expect(drawn).toContain('Haiku 4.5')
  expect(drawn).toContain('—')
  const before = files[file]
  await ui.press({ key: 'route:role:runner' })
  await ui.press({ key: 'routekey:effort' })
  expect(files[file]).toBe(before)
  // j from Haiku 4.5 goes to the next model of /model's list: Sonnet 5, as its full id.
  await ui.press({ key: 'routekey:model' })
  expect(JSON.parse(files[file]!).roles.runner).toEqual({ model: 'claude-sonnet-5' })
  await ui.unmount()
})
