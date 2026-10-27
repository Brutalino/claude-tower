import { expect, mock, test } from 'claude-code/testing'
import { withStoredLinear } from './linearConfig'

// The launcher's filter takes every letter, so `b` never left it. Escape (which an Input never sees: it gives the
// keys to the prompt) closes the launcher at the next keys check; the Button reads `esc back`, for the mouse.
const PORCELAIN = [
  'worktree /repo/shopapp', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
  'worktree /repo/wt/tkt-11', 'HEAD 2222222222222222222222222222222222222222', 'branch refs/heads/me/tkt-11-skills', '',
].join('\n')
const RAIL_ENV = { TOWER_ROLE: 'rail', TOWER_REPO: '/repo/shopapp', TOWER_PLUGIN_DIR: '/plugins/tower', HOME: '/home/test', TMUX_PANE: '%0' }

test('Escape in the launcher closes it and the list comes back', async ($: any, on: any) => {
  mock.env(on, RAIL_ENV)
  mock.store(on)
  const clock = mock.clock(on, { now: 1_000_000 })
  const keys = { paneHasThem: true }
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.id', async () => ({ value: 'rail-1' }))
  on('session.cwd', async () => ({ value: '/repo/shopapp' }))
  on('command.register', async () => ({ value: undefined }))
  on('command.list', async () => ({ value: [{ name: 'echo-test', description: 'Test skill.', source: 'user' }] }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.focus', async () => ({}))
  on('ui.panes', async () => ({ value: [{ id: 'tower', isFocused: keys.paneHasThem, isPlaced: true }] }))
  on('prompt.read', async () => ({ value: { text: '' } }))
  on('fs.write', async () => ({ value: undefined }))
  on('fs.exists', async () => ({ value: false }))
  on('fs.list', async () => ({ value: [] }))
  on('fs.read', withStoredLinear('/repo/shopapp', async (_$: unknown, e: any) => ({ deny: `ENOENT: ${e.path}` })))
  on('http.fetch', async () => ({ deny: 'no network in tests' }))
  on('process.run', async (_$: unknown, e: any) => {
    if (e.argv[0] !== 'tmux') return { value: { exitCode: 0, stdout: e.argv[0] === 'git' ? PORCELAIN : '', stderr: '' } }
    // The rail's tmux pane is the active one: Escape there is the person's.
    const out = e.argv[1] === 'display-message' ? (e.argv.at(-1) === '#{pane_active}#{window_active}' ? '11' : '@0') : e.argv[1] === 'list-panes' ? '%0\t@0\trail\t\t' : ''
    return { value: { exitCode: 0, stdout: out, stderr: '' } }
  })
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  const rail = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 40 } })
  await rail.press({ key: 'skills' })
  expect((await rail.find({ key: 'back' }))?.text).toContain('esc back')
  await clock.advance(1_000)
  // Still holding the keys: the launcher stays.
  expect(await rail.find({ key: 'filter' })).toBeDefined()
  keys.paneHasThem = false
  await clock.advance(1_000)
  expect(await rail.find({ key: 'filter' })).toBeUndefined()
  expect(await rail.find({ key: 'row:TKT-11' })).toBeDefined()
  await rail.unmount()
})
