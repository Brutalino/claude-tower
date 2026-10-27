import { expect, mock, test } from 'claude-code/testing'
import { withStoredLinear } from './linearConfig'

const PORCELAIN = [
  'worktree /repo/shopapp', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
  'worktree /repo/wt/tkt-1', 'HEAD 2222222222222222222222222222222222222222', 'branch refs/heads/me/tkt-1-first-thing', '',
  'worktree /repo/wt/tkt-2', 'HEAD 3333333333333333333333333333333333333333', 'branch refs/heads/me/tkt-2-second-thing', '',
].join('\n')

const STATE_FILES: Record<string, string> = {
  '/repo/wt/tkt-2/.work/state.json':
    '{"phase":"implementing","base":"staging","next":"finish the parser","plan":"## Plan\\n\\n1. Parse the header"}',
}

const RAIL_ENV = { TOWER_ROLE: 'rail', TOWER_REPO: '/repo/shopapp', HOME: '/home/test', TMUX_PANE: '%0' }

const GH_OPEN_FAILING = JSON.stringify({
  number: 13, state: 'OPEN', isDraft: false, reviewDecision: '', url: 'https://github.com/o/r/pull/13',
  statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }],
})

function pane(bodyColumns: number) {
  return { component: 'Pane', requestId: 'tower', props: { bodyColumns } } as const
}

/** The rail alone in its window; gh answers per worktree, git rev-list counts 1. */
function stubWorld(on: any, gh: Record<string, { exitCode: number; stdout: string; stderr: string }>, runs = { gh: 0 }, landed: string[] = [], env: Record<string, string> = RAIL_ENV) {
  mock.env(on, env)
  on('session.cwd', async () => ({ value: '/repo/shopapp' }))
  mock.clock(on, { now: 1_000_000 })
  on('process.run', async (_$: unknown, e: { argv: readonly string[]; init?: { cwd?: string } }) => {
    const [command, verb] = e.argv
    if (command === 'tmux') {
      return { value: { exitCode: 0, stdout: verb === 'list-panes' ? '%0\t@0\trail\t\n' : '@0\n', stderr: '' } } as any
    }
    if (command === 'gh') runs.gh += 1
    if (command === 'gh') return { value: gh[e.init?.cwd ?? ''] ?? { exitCode: 1, stdout: '', stderr: 'no pull requests found\n' } } as any
    if (verb === 'rev-list') return { value: { exitCode: 0, stdout: '1\n', stderr: '' } } as any
    return { value: { exitCode: 0, stdout: PORCELAIN, stderr: '' } } as any
  })
  on('fs.list', async () => ({ value: [] }))
  // Beneath the plugin, as the engine: every move of the focus ring that reaches here lands.
  on('ui.focus', async (_$: unknown, e: { element?: string }) => {
    landed.push(e.element ?? '')
    return {}
  })
  on('fs.read', withStoredLinear('/repo/shopapp', async (_$: unknown, e: { path: string }) => {
    const text = STATE_FILES[e.path]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  }))
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`wide board draws the home's cards and the first card's inspector, then follows the focus (${surface})`, async ($, on) => {
    const landed: string[] = []
    stubWorld(on, { '/repo/wt/tkt-2': { exitCode: 0, stdout: GH_OPEN_FAILING, stderr: '' } }, { gh: 0 }, landed)
    const ui = await $.ui.mount({ plugin: 'tower', surface, ...pane(140) } as any)
    await ui.press({ key: 'refresh' })

    // The home (decision 030): the cards in their columns, the inspector of the first card.
    expect(await ui.find({ key: 'row:TKT-1' })).toBeDefined()
    expect(await ui.find({ key: 'row:TKT-2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^TOWER$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^first thing$/ })).toBeDefined()
    expect(await ui.find({ key: 'tab:mine' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^ {2}first thing$/ })).toBeDefined()

    // The kit has no focus act: raise ui.focus as the engine does for the person's Down onto card TKT-2.
    const moved = await $.ui.focus({
      component: 'Pane', requestId: 'tower', plugin: 'tower', element: 'row:TKT-2', origin: { kind: 'person' },
    } as any)
    expect(moved?.deny).toBeUndefined()
    expect(landed).toEqual(['row:TKT-2'])
    expect(await ui.find({ type: 'Text', text: /^ {2}second thing$/ })).toBeDefined()
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ type: 'Text', text: /^ {2}second thing$/ })).toBeDefined()
    // Decision 035: the verdict follows the PR line in place of the checks summary.
    expect(await ui.find({ type: 'Text', text: /^pull request #13 open$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^BLOCKED \d+$/ })).toBeDefined()
    await ui.unmount()
  })
}

test('narrow rail draws the list and no detail', async ($, on) => {
  stubWorld(on, {})
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', ...pane(44) } as any)
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ key: 'row:TKT-1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^first thing$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^pull request$/ })).toBeUndefined()
  await ui.unmount()
})

test('gh missing shows gh not available and is not run again within a minute', async ($, on) => {
  const runs = { gh: 0 }
  stubWorld(on, { '/repo/wt/tkt-1': { exitCode: 127, stdout: '', stderr: 'gh: command not found' } }, runs)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', ...pane(140) } as any)
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Text', text: /^gh not available$/ })).toBeDefined()
  await ui.press({ key: 'refresh' })
  expect(runs.gh).toBe(1)
  await ui.unmount()
})

test('a Linear fixture gives the detail its title, and nothing goes to the network', async ($, on) => {
  stubWorld(on, {}, { gh: 0 }, [], { ...RAIL_ENV, TOWER_LINEAR_FIXTURE: '/fixtures/linear.json' })
  STATE_FILES['/fixtures/linear.json'] = JSON.stringify({
    data: { issues: { nodes: [{ identifier: 'TKT-1', title: 'Printer goes offline', state: { name: 'Todo', type: 'unstarted' }, assignee: { isMe: true } }] } },
  })
  let fetches = 0
  on('http.fetch', async () => {
    fetches += 1
    return { deny: 'no network in tests' }
  })
  try {
    const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', ...pane(140) } as any)
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ type: 'Text', text: /^Printer goes offline$/ })).toBeDefined()
    expect(fetches).toBe(0)
    await ui.unmount()
  } finally {
    delete STATE_FILES['/fixtures/linear.json']
  }
})

test('decision 071: a candidate assigned to the person carries ★ after its id on its card, a free one none; each card starts with its ▢ mark', async ($, on) => {
  stubWorld(on, {}, { gh: 0 }, [], { ...RAIL_ENV, TOWER_LINEAR_FIXTURE: '/fixtures/linear.json' })
  const node = (identifier: string, assignee: unknown) => ({ identifier, title: identifier, state: { name: 'Todo', type: 'unstarted' }, assignee })
  STATE_FILES['/fixtures/linear.json'] = JSON.stringify({ data: { issues: { nodes: [node('TKT-7', null), node('TKT-8', { isMe: true, displayName: 'me' })] } } })
  on('http.fetch', async () => ({ deny: 'no network in tests' }))
  try {
    const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', ...pane(140) } as any)
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ key: 'cand:TKT-8' })).toBeDefined()
    expect(await ui.find({ key: 'cand:TKT-7' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ mine$/ })).toBeUndefined()
    expect((await ui.findAll({ type: 'Text', text: /^★$/ })).length).toBe(1)
    // Each card starts with its mark, plain text (no ring stop of its own).
    expect((await ui.findAll({ type: 'Text', text: /^▢ · $/ })).length).toBe(2)
    expect(await ui.find({ key: 'mark:TKT-8' })).toBeUndefined()
    await ui.unmount()
  } finally {
    delete STATE_FILES['/fixtures/linear.json']
  }
})

test('s on the board says so when the repository has no /shape', async ($, on) => {
  stubWorld(on, {})
  on('fs.exists', async () => ({ value: false }))
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', ...pane(140) } as any)
  await ui.press({ key: 'refresh' })
  await ui.press({ key: 'board-skill:s' })
  expect(await ui.find({ type: 'Text', text: /this repository has no \/shape/ })).toBeDefined()
  await ui.unmount()
})
