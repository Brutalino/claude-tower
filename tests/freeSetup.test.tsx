import { expect, mock, test } from 'claude-code/testing'

import { textLines } from './repoGit'

// Decision 064: a free Tower in a git folder without a configuration offers tower-setup on the rail (`s`), the start menu's
// Git repository starts its first session on /tower:tower-setup (TOWER_FREE_START=setup), and once tower-setup stores the
// configuration the rail says, within the 2 s check, how to open the project.

const HOME = '/home/test'
const STATE = '/state/tower'
const SOCKET = 'tower-free-k3x9a1'
const NOW = Date.parse('2026-10-13T12:00:00Z')
const FOLDER = '/r/notes'
const LISTING = `worktree ${FOLDER}\nHEAD a000\nbranch refs/heads/main\n`
const STORED = `${STATE}/projects/-r-notes.json`

type Calls = { argv: string[][]; tmux: string[][]; stored: boolean }

function freeGitRail(on: any, folder: string, git: boolean, env: Record<string, string> = {}): Calls {
  mock.env(on, { TOWER_ROLE: 'rail', TOWER_MODE: 'free', TOWER_REPO: folder, TOWER_PLUGIN_DIR: '/plugins/tower', HOME, TMUX_PANE: '%0',
    TOWER_STATE_DIR: STATE, TOWER_TMUX_SOCKET: SOCKET, ...env })
  mock.store(on)
  const calls: Calls = { argv: [], tmux: [], stored: false }
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.id', async () => ({ value: 'rail-1' }))
  on('session.cwd' as any, async () => ({ value: folder }) as any)
  on('command.register' as any, async () => ({ value: undefined }) as any)
  on('command.list', async () => ({ value: [] }) as any)
  on('ui.focus', async () => ({}))
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.exists', async (_$: unknown, e: any) => ({ value: (git && e.path === `${folder}/.git`) || (calls.stored && e.path === STORED) }) as any)
  on('fs.list', async () => ({ value: [] }) as any)
  on('fs.read', async (_$: unknown, e: any) => (calls.stored && e.path === STORED ? { value: '{"version": 1}' } : { deny: `ENOENT: ${e.path}` }) as any)
  on('http.fetch', async () => ({ deny: 'no network in tests' }) as any)
  on('process.run', async (_$: unknown, e: any) => {
    const argv: string[] = [...e.argv]
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as any
    if (argv[0] === 'tmux') {
      calls.tmux.push(argv)
      const command = argv[3]
      return ok(command === 'display-message' ? '@0' : command === 'list-panes' ? '%0\t@0\trail\t\t' : command === 'split-window' || command === 'new-window' ? '%5' : '')
    }
    calls.argv.push(argv)
    if (git && argv.join(' ') === 'git worktree list --porcelain') return ok(LISTING)
    return { value: { exitCode: 1, stdout: '', stderr: 'not here' } } as any
  })
  return calls
}

async function startRail($: any, folder: string) {
  await $.session.start({ cwd: folder, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 } } })
  await ui.press({ key: 'refresh' })
  return ui
}

function opens(calls: Calls): string[][] {
  return calls.tmux.filter(argv => argv.includes('TOWER_ROLE=free'))
}

test('a free Tower in a git folder without a configuration: `s` set up this repository opens a free session on /tower:tower-setup', async ($: any, on: any) => {
  const clock = mock.clock(on, { now: NOW })
  const calls = freeGitRail(on, FOLDER, true)
  const ui = await startRail($, FOLDER)
  const text = textLines(await ui.drawn()).join('\n')
  expect(text).toContain('notes · free · main')
  expect(text).toContain('set up this repository')
  expect(text).not.toContain('Tower is set up')
  // The launch's own session is a plain one (no TOWER_FREE_START).
  expect(opens(calls).length).toBe(1)
  expect(opens(calls)[0]!.at(-1)).not.toBe('/tower:tower-setup')
  await ui.press({ key: 'setup' })
  const setup = opens(calls)
  expect(setup.length).toBe(2)
  expect(setup[1]!.at(-1)).toBe('/tower:tower-setup')
  expect(setup[1]![setup[1]!.indexOf('-c') + 1]).toBe(FOLDER)
  expect(setup[1]).toContain('TOWER_MODE=free')
  // tower-setup stores the configuration: the 2 s check sees it and the row says how to open the project.
  calls.stored = true
  await clock.advance(2_000)
  const after = textLines(await ui.drawn()).join('\n')
  expect(after).toContain('✓ Tower is set up for this repository')
  expect(after).toMatch(/quit \(q y\) and run tower again here to open[\s\S]*the project/)
  expect(after).not.toContain('set up this repository')
  expect(await ui.find({ key: 'setup' })).toBeUndefined()
  // Nothing closed by itself.
  expect(calls.tmux.some(argv => argv.includes('kill-server'))).toBe(false)
  await ui.unmount()
})

test("the start menu's Git repository: TOWER_FREE_START=setup starts the launch's session on /tower:tower-setup", async ($: any, on: any) => {
  mock.clock(on, { now: NOW })
  const calls = freeGitRail(on, FOLDER, true, { TOWER_FREE_START: 'setup' })
  const ui = await startRail($, FOLDER)
  expect(opens(calls).length).toBe(1)
  expect(opens(calls)[0]!.at(-1)).toBe('/tower:tower-setup')
  // The rail keeps the variable to itself: its sessions do not get it.
  expect(opens(calls)[0]!.some(arg => arg.startsWith('TOWER_FREE_START'))).toBe(false)
  await ui.unmount()
})

test('a free Tower outside git offers no set up', async ($: any, on: any) => {
  mock.clock(on, { now: NOW })
  freeGitRail(on, `${HOME}/Downloads`, false)
  const ui = await startRail($, `${HOME}/Downloads`)
  expect(textLines(await ui.drawn()).join('\n')).not.toMatch(/set up/)
  expect(await ui.find({ key: 'setup' })).toBeUndefined()
  await ui.unmount()
})
