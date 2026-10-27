import { expect, mock, test } from 'claude-code/testing'
import { sessionSettings } from '../hooks/core/panes'
import { withStoredLinear } from './linearConfig'

const PORCELAIN = [
  'worktree /repo/shopapp', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
  'worktree /repo/wt/tkt-1650', 'HEAD 2222222222222222222222222222222222222222',
  'branch refs/heads/feature/tkt-1650-wrong-invite-path', '',
  'worktree /repo/wt/spike', 'HEAD 3333333333333333333333333333333333333333',
  'branch refs/heads/spike/cache-warmup', '',
].join('\n')

const STATE_FILES: Record<string, string> = {
  '/repo/wt/tkt-1650/.work/state.json': '{"phase":"planning","plan":"plan.md","next":"approve the plan"}',
}

const PANE = { component: 'Pane', requestId: 'tower', props: { bodyColumns: 40 } } as const

const RAIL_ENV = {
  TOWER_ROLE: 'rail',
  TOWER_REPO: '/repo/shopapp',
  TOWER_PLUGIN_DIR: '/plugins/tower',
  HOME: '/home/test',
  TMUX_PANE: '%0',
}

const LISTING_FORMAT = '#{pane_id}\t#{window_id}\t#{@tower_role}\t#{@tower_ticket}\t#{@tower_tag}'

/** The TOWER_TAG the open gave the new ticket session. */
const modeCalls: string[][] = []

function tagOfSplit(tmuxCalls: string[][]): string {
  const split = tmuxCalls.find(argv => argv[1] === 'split-window') ?? []
  return split.find(arg => arg.startsWith('TOWER_TAG='))?.slice('TOWER_TAG='.length) ?? ''
}

/** A tmux with the rail alone in window @0 until split-window creates %5. */
function fakeTmux(argv: readonly string[], state: { split: boolean }): string {
  if (argv[1] === 'display-message') return '@0\n'
  if (argv[1] === 'list-panes') return state.split ? '%0\t@0\trail\t\n%5\t@0\tticket\tTKT-1650\n' : '%0\t@0\trail\t\n'
  if (argv[1] === 'split-window') {
    state.split = true
    return '%5\n'
  }
  return ''
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`rail lists ticket worktrees and opens the pressed one beside it (${surface})`, async ($, on) => {
    mock.env(on, RAIL_ENV)
    on('session.cwd', async () => ({ value: '/repo/shopapp' }))
    mock.clock(on, { now: 1_000_000 })
    const tmuxCalls: string[][] = []
    const tmuxState = { split: false }
    on('process.run', async (_$, e) => {
      if (e.argv[0] !== 'tmux') return { value: { exitCode: 0, stdout: PORCELAIN, stderr: '' } } as any
      if (e.argv.includes('@tower_mode')) modeCalls.push([...e.argv])
      else tmuxCalls.push([...e.argv])
      return { value: { exitCode: 0, stdout: fakeTmux(e.argv, tmuxState), stderr: '' } } as any
    })
    on('fs.list', async (_$, e) =>
      e.path === '/home/test/.claude/projects/-repo-wt-tkt-1650'
        ? ({ value: [{ name: 'earlier.jsonl' }] } as any)
        : { value: [] },
    )
    on('fs.read', withStoredLinear('/repo/shopapp', async (_$, e) => {
      const text = STATE_FILES[e.path]
      return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
    }))

    const ui = await $.ui.mount({ plugin: 'tower', surface, ...PANE } as any)
    await ui.press({ key: 'refresh' })

    expect((await ui.find({ key: 'row:TKT-1650' }))?.text).toContain('TKT-1650')
    expect(await ui.find({ type: 'Text', text: /needs you/ })).toBeDefined()
    // A branch without a ticket id is not a ticket: the rail leaves it out (the board lists it under other worktrees).
    expect(await ui.find({ key: 'row:spike/cache-warmup' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /needs you · say go/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /◆/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▶/ })).toBeUndefined()
    expect(await ui.find({ key: 'board' })).toBeDefined()

    tmuxCalls.length = 0
    await ui.press({ key: 'row:TKT-1650' })
    const tag = tagOfSplit(tmuxCalls)
    expect(tag).toMatch(/^ticket-[0-9a-f]{8}$/)
    expect(tmuxCalls).toEqual([
      ['tmux', 'display-message', '-p', '-t', '%0', '#{window_id}'],
      ['tmux', 'list-panes', '-a', '-F', LISTING_FORMAT],
      [
        'tmux', 'split-window', '-h', '-t', '%0', '-P', '-F', '#{pane_id}',
        '-c', '/repo/wt/tkt-1650',
        '-e', 'TOWER_ROLE=ticket', '-e', 'TOWER_TICKET=TKT-1650',
        '-e', 'TOWER_REPO=/repo/shopapp', '-e', 'TOWER_PLUGIN_DIR=/plugins/tower',
        '-e', `TOWER_TAG=${tag}`,
        '-e', 'CLAUDE_CODE_TMUX_TRUECOLOR=1', '-e', 'COLORTERM=truecolor',
        'claude', '--plugin-dir', '/plugins/tower', '--continue',
        '--settings', sessionSettings({ role: 'ticket', pluginDir: '/plugins/tower', theme: 'claude' }),
      ],
      ['tmux', 'set-option', '-p', '-t', '%5', '@tower_role', 'ticket'],
      ['tmux', 'set-option', '-p', '-t', '%5', '@tower_title', 'TKT-1650 · ticket session · /repo/wt/tkt-1650'],
      ['tmux', 'set-option', '-p', '-t', '%5', '@tower_ticket', 'TKT-1650'],
      ['tmux', 'set-option', '-p', '-t', '%5', '@tower_tag', tag],
      ['tmux', 'resize-pane', '-t', '%0', '-x', '44'],
      ['tmux', 'select-pane', '-t', '%5'],
      // The list refresh: records of sessions whose pane is gone are dropped.
      ['tmux', 'list-panes', '-a', '-F', LISTING_FORMAT],
      ['tmux', 'display-message', '-p', '-t', '%0', '#{window_id}'],
      ['tmux', 'list-panes', '-a', '-F', LISTING_FORMAT],
    ])
    expect(tmuxCalls.flat()).not.toContain('-L')
    expect(await ui.find({ type: 'Text', text: /▶/ })).toBeDefined()
    await ui.unmount()
  })
}

test('a failing tmux command stops the open and shows its cause', async ($, on) => {
  mock.env(on, RAIL_ENV)
  on('session.cwd', async () => ({ value: '/repo/shopapp' }))
  on('fs.read', withStoredLinear('/repo/shopapp'))
  mock.clock(on)
  const tmuxCalls: string[][] = []
  on('process.run', async (_$, e) => {
    if (e.argv[0] !== 'tmux') return { value: { exitCode: 0, stdout: PORCELAIN, stderr: '' } } as any
    if (e.argv.includes('@tower_mode')) modeCalls.push([...e.argv])
    else tmuxCalls.push([...e.argv])
    if (e.argv[1] === 'split-window') return { value: { exitCode: 1, stdout: '', stderr: 'no space for new pane\n' } } as any
    return { value: { exitCode: 0, stdout: fakeTmux(e.argv, { split: false }), stderr: '' } } as any
  })
  on('fs.list', async () => ({ value: [] }))

  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', ...PANE } as any)
  await ui.press({ key: 'refresh' })
  await ui.press({ key: 'row:TKT-1650' })
  expect(tmuxCalls.map(argv => argv[1])).not.toContain('set-option')
  expect(modeCalls).toContainEqual(['tmux', 'set-option', '-p', '-t', '%0', '@tower_mode', 'board'])
  expect(await ui.find({ type: 'Text', text: /^no space for new pane$/ })).toBeDefined()
  await ui.unmount()
})

test('rail shows the empty line when there are no ticket worktrees', async ($, on) => {
  mock.env(on, { TOWER_ROLE: 'rail', TOWER_REPO: '/repo/shopapp', HOME: '/home/test' })
  on('session.cwd', async () => ({ value: '/repo/shopapp' }))
  on('fs.read', withStoredLinear('/repo/shopapp'))
  mock.clock(on)
  on('process.run', async () => ({ value: { exitCode: 0, stdout: PORCELAIN.split('\n\n')[0] ?? '', stderr: '' } }) as any)
  on('fs.list', async () => ({ value: [] }))

  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', ...PANE } as any)
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Text', text: /no ticket worktrees in shopapp/ })).toBeDefined()
  await ui.unmount()
})

test('without TMUX_PANE the rail finds its pane by its tag and opens the ticket beside it', async ($, on) => {
  const { TMUX_PANE: _, ...env } = RAIL_ENV
  mock.env(on, { ...env, TOWER_TAG: 'rail-0a1b2c3d' })
  on('session.cwd', async () => ({ value: '/repo/shopapp' }))
  on('fs.read', withStoredLinear('/repo/shopapp'))
  mock.clock(on, { now: 1_000_000 })
  const tmuxCalls: string[][] = []
  const state = { split: false }
  on('process.run', async (_$, e) => {
    if (e.argv[0] !== 'tmux') return { value: { exitCode: 0, stdout: PORCELAIN, stderr: '' } } as any
    tmuxCalls.push([...e.argv])
    if (e.argv[1] === 'list-panes') {
      const listing = '%2\t@0\trail\t\trail-0a1b2c3d\n%4\t@9\trail\t\trail-ffffffff\n'
      return { value: { exitCode: 0, stdout: listing + (state.split ? '%5\t@0\tticket\tTKT-1650\tticket-x\n' : ''), stderr: '' } } as any
    }
    return { value: { exitCode: 0, stdout: fakeTmux(e.argv, state), stderr: '' } } as any
  })
  on('fs.list', async () => ({ value: [] }))

  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', ...PANE } as any)
  await ui.press({ key: 'refresh' })
  await ui.press({ key: 'row:TKT-1650' })
  expect(await ui.find({ type: 'Text', text: /not running in a tmux pane/ })).toBeUndefined()
  expect(tmuxCalls).toContainEqual(['tmux', 'display-message', '-p', '-t', '%2', '#{window_id}'])
  const split = tmuxCalls.find(argv => argv[1] === 'split-window')
  expect(split?.slice(0, 5)).toEqual(['tmux', 'split-window', '-h', '-t', '%2'])
  expect(tmuxCalls).toContainEqual(['tmux', 'resize-pane', '-t', '%2', '-x', '44'])
  expect(tmuxCalls).toContainEqual(['tmux', 'set-option', '-p', '-t', '%5', '@tower_tag', tagOfSplit(tmuxCalls)])
  expect(await ui.find({ type: 'Text', text: /▶/ })).toBeDefined()
  await ui.unmount()
})

test('with TOWER_TMUX_SOCKET every tmux call names that server, and the ticket session gets the same socket', async ($, on) => {
  mock.env(on, { ...RAIL_ENV, TOWER_TMUX_SOCKET: 'towerSmoke' })
  on('session.cwd', async () => ({ value: '/repo/shopapp' }))
  on('fs.read', withStoredLinear('/repo/shopapp'))
  mock.clock(on, { now: 1_000_000 })
  const tmuxCalls: string[][] = []
  const state = { split: false }
  on('process.run', async (_$, e) => {
    if (e.argv[0] !== 'tmux') return { value: { exitCode: 0, stdout: PORCELAIN, stderr: '' } } as any
    tmuxCalls.push([...e.argv])
    return { value: { exitCode: 0, stdout: fakeTmux(['tmux', ...e.argv.slice(3)], state), stderr: '' } } as any
  })
  on('fs.list', async () => ({ value: [] }))

  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', ...PANE } as any)
  await ui.press({ key: 'refresh' })
  await ui.press({ key: 'row:TKT-1650' })
  expect(tmuxCalls.length).toBeGreaterThan(0)
  for (const argv of tmuxCalls) expect(argv.slice(0, 3)).toEqual(['tmux', '-L', 'towerSmoke'])
  const split = tmuxCalls.find(argv => argv[3] === 'split-window') ?? []
  expect(split).toContain('TOWER_TMUX_SOCKET=towerSmoke')
  await ui.unmount()
})
