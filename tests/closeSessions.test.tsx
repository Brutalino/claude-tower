import { expect, mock, test } from 'claude-code/testing'

import { buttonKeys, ringRests } from '../hooks/core/railRing'
import { textLines } from './repoGit'
import { withStoredLinear } from './linearConfig'

// Decision 068: `x` on a session's row asks `close <name>?`; `y` kills that session's panes on this Tower's own socket,
// marks its status records ended and takes its row away at once; `n` or a move of the ring leaves it. A ticket's `x`
// closes only its session (its review with it): the worktree, the branch and the state file stay, and so does its row.

const NOW = Date.parse('2026-10-15T12:00:00Z')
const STATE = '/state/tower'
const SOCKET = 'tower'
const PORCELAIN = [
  'worktree /repo/shopapp', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
  'worktree /repo/wt/tkt-101', 'HEAD 2222222222222222222222222222222222222222', 'branch refs/heads/me/tkt-101-plug-state', '',
].join('\n')

const status = (id: string, role: string, ticket: string, tag: string, extra: Record<string, unknown> = {}) =>
  ({ v: 1, id, role, ticket, cwd: '/repo/shopapp', pane: null, state: 'idle', since: NOW - 60_000, updatedAt: NOW - 1_000, tag, socket: SOCKET, ...extra })
const RECORDS = [
  status('sid-free-a', 'free', 'free-0000000a', 'free-tag-a', { title: 'SwiftData vs GRDB' }),
  status('sid-hub', 'hub', 'new-ticket', 'hub-tag'),
  status('sid-ticket', 'ticket', 'TKT-101', 'ticket-tag', { cwd: '/repo/wt/tkt-101', state: 'working' }),
  status('sid-review', 'review', 'TKT-101', 'review-tag', { cwd: '/repo/wt/tkt-101' }),
  // Another Tower's session with the same key: never touched.
  status('sid-other', 'free', 'free-0000000a', 'free-tag-a', { socket: 'tower-oink' }),
]
/** The rail (%0) with TKT-101's ticket session in the centre and its review under it, a free session and a hub parked. */
const PANES = [
  ['%0', '@0', 'rail', '', ''], ['%5', '@0', 'ticket', 'TKT-101', 'ticket-tag'], ['%6', '@0', 'review', 'TKT-101', 'review-tag'],
  ['%7', '@2', 'free', 'free-0000000a', 'free-tag-a'], ['%8', '@3', 'hub', 'new-ticket', 'hub-tag'],
]

type World = { tmux: string[][]; writes: Record<string, string>; git: string[][] }

function closeWorld(on: any): World {
  const world: World = { tmux: [], writes: {}, git: [] }
  let panes = PANES.map(pane => [...pane])
  mock.env(on, { TOWER_ROLE: 'rail', TOWER_REPO: '/repo/shopapp', TOWER_PLUGIN_DIR: '/plugins/tower', HOME: '/home/test', TMUX_PANE: '%0', TOWER_STATE_DIR: STATE, TOWER_TMUX_SOCKET: SOCKET })
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.id', async () => ({ value: 'rail-1' }))
  on('session.cwd', async () => ({ value: '/repo/shopapp' }))
  on('command.register', async () => ({ value: undefined }))
  on('command.list', async () => ({ value: [] }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.focus', async () => ({}))
  on('http.fetch', async () => ({ deny: 'no network in tests' }))
  on('fs.exists', async () => ({ value: false }))
  on('fs.list', async (_$: unknown, e: any) => ({ value: e.path === `${STATE}/sessions` ? RECORDS.map(one => ({ name: `${one.id}.json`, kind: 'file' })) : [] }))
  on('fs.read', withStoredLinear('/repo/shopapp', async (_$: unknown, e: any) => {
    if (e.path in world.writes) return { value: world.writes[e.path] }
    // TKT-101 is under way: its state file says implementing.
    if (e.path === '/repo/wt/tkt-101/.work/state.json') return { value: '{"phase":"implementing"}' }
    const record = RECORDS.find(one => e.path === `${STATE}/sessions/${one.id}.json`)
    return record !== undefined ? { value: JSON.stringify(record) } : { deny: `ENOENT: ${e.path}` }
  }))
  on('fs.write', async (_$: unknown, e: any) => {
    world.writes[e.path] = e.content ?? e.text ?? e.data
    return { value: undefined }
  })
  on('process.run', async (_$: unknown, e: any) => {
    const argv: string[] = [...e.argv]
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } })
    if (argv[0] !== 'tmux') {
      world.git.push(argv)
      return ok(argv[1] === 'worktree' && argv[2] === 'list' ? PORCELAIN : '')
    }
    if (!argv.includes('@tower_mode')) world.tmux.push(argv)
    const verb = argv[3]
    if (verb === 'kill-pane') panes = panes.filter(pane => pane[0] !== argv[5])
    if (verb === 'list-panes') return ok(panes.map(pane => pane.join('\t')).join('\n'))
    if (verb === 'display-message') return ok('@0')
    return ok('')
  })
  return world
}

async function mountRail($: any) {
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  return $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 40 } } })
}
const ring = async ($: any, element: string) => $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element, origin: { kind: 'person' } })
const kills = (world: World) => world.tmux.filter(argv => argv[3] === 'kill-pane').map(argv => argv[5])

test('x on a free session asks; y kills its pane on this Tower\'s socket, marks it ended and takes its row away at once', async ($: any, on: any) => {
  const world = closeWorld(on)
  const ui = await mountRail($)
  expect(textLines(await ui.drawn()).join('\n')).toContain('SwiftData vs GRDB')
  // Decision 072: one `x: close` in the header, for the ▶ row (TKT-101's live session) until the ring is on another row.
  expect(buttonKeys(await ui.drawn()).filter(key => key.startsWith('close:'))).toEqual(['close:row:TKT-101'])
  await ring($, 'free:free-0000000a')
  const keys = buttonKeys(await ui.drawn())
  expect(keys.filter(key => key.startsWith('close:'))).toEqual(['close:free:free-0000000a'])
  expect(keys[0]).toBe('close:free:free-0000000a')
  expect(textLines(await ui.drawn())[0]).toBe('close  skills  board  quit')
  expect(textLines(await ui.drawn()).find(line => line.includes('SwiftData vs GRDB'))).not.toMatch(/ close$/)
  // The ring may rest on the close Button and on the question's Buttons (decision 058).
  expect(ringRests('close:free:free-0000000a', 'row:TKT-101', new Set(keys))).toBe(true)
  await ui.press({ key: 'close:free:free-0000000a' })
  expect(textLines(await ui.drawn())).toContain('close SwiftData vs GRDB?')
  expect(kills(world)).toEqual([])
  await ui.press({ key: 'close:yes' })
  expect(kills(world)).toEqual(['%7'])
  // Every tmux call goes to this Tower's socket.
  expect(world.tmux.every(argv => argv[1] === '-L' && argv[2] === SOCKET)).toBe(true)
  expect(JSON.parse(world.writes[`${STATE}/sessions/sid-free-a.json`] ?? '{}')).toMatchObject({ state: 'ended', ticket: 'free-0000000a' })
  expect(world.writes[`${STATE}/sessions/sid-other.json`]).toBeUndefined()
  const text = textLines(await ui.drawn()).join('\n')
  expect(text).not.toContain('○ SwiftData vs GRDB')
  expect(text).not.toContain('SESSIONS')
  expect(text).not.toContain('close SwiftData')
  expect(text).toContain('SwiftData vs GRDB closed')
  await ui.unmount()
})

test('n, or the ring moving on, leaves the question and kills nothing', async ($: any, on: any) => {
  const world = closeWorld(on)
  const ui = await mountRail($)
  await ring($, 'free:free-0000000a')
  await ui.press({ key: 'close:free:free-0000000a' })
  expect(textLines(await ui.drawn())).toContain('close SwiftData vs GRDB?')
  await ui.press({ key: 'close:no' })
  expect(textLines(await ui.drawn())).not.toContain('close SwiftData vs GRDB?')
  await ui.press({ key: 'close:free:free-0000000a' })
  await ring($, 'row:TKT-101')
  expect(textLines(await ui.drawn())).not.toContain('close SwiftData vs GRDB?')
  expect(kills(world)).toEqual([])
  // Only the rail's own record was written.
  expect(Object.keys(world.writes).filter(path => path.includes('/sessions/'))).toEqual([`${STATE}/sessions/rail-1.json`])
  expect(textLines(await ui.drawn()).join('\n')).toContain('SwiftData vs GRDB')
  await ui.unmount()
})

test('x on a ticket closes only its session: the panes of its group (never the rail), its records ended; worktree and row stay', async ($: any, on: any) => {
  const world = closeWorld(on)
  const ui = await mountRail($)
  await ring($, 'row:TKT-101')
  await ui.press({ key: 'close:row:TKT-101' })
  const asked = textLines(await ui.drawn())
  expect(asked).toContain('close the session of TKT-101?')
  expect(asked.some(line => /^the worktree stays {3}yes {3}no$/.test(line))).toBe(true)
  await ui.press({ key: 'close:yes' })
  expect(kills(world).sort()).toEqual(['%5', '%6'])
  expect(kills(world)).not.toContain('%0')
  for (const id of ['sid-ticket', 'sid-review']) expect(JSON.parse(world.writes[`${STATE}/sessions/${id}.json`] ?? '{}').state).toBe('ended')
  // Nothing removed: no worktree or branch changed.
  expect(world.git.filter(argv => argv[0] === 'git' && (argv[1] === 'branch' || (argv[1] === 'worktree' && argv[2] !== 'list')))).toEqual([])
  const after = await ui.drawn()
  expect(buttonKeys(after)).toContain('row:TKT-101')
  // Without a live session the row has no `close` any more: a second `x` offers to hide it (decision 070).
  expect(buttonKeys(after).filter(key => key.startsWith('close:'))).toEqual(['close:row:TKT-101'])
  expect((await ui.find({ key: 'close:row:TKT-101' }))?.text).toBe('hide')
  await ui.unmount()
})

test('x on a hub session closes it; its row and the `other sessions` heading go', async ($: any, on: any) => {
  const world = closeWorld(on)
  const ui = await mountRail($)
  expect(textLines(await ui.drawn()).join('\n')).toContain('/new-ticket')
  await ring($, 'hub:new-ticket')
  // Decision 072: the header's `x: close`, for the hub's row.
  expect(buttonKeys(await ui.drawn()).filter(key => key.startsWith('close:'))).toEqual(['close:hub:new-ticket'])
  expect(textLines(await ui.drawn())[0]).toBe('close  skills  board  quit')
  await ui.press({ key: 'close:hub:new-ticket' })
  expect(textLines(await ui.drawn())).toContain('close /new-ticket?')
  await ui.press({ key: 'close:yes' })
  expect(kills(world)).toEqual(['%8'])
  expect(JSON.parse(world.writes[`${STATE}/sessions/sid-hub.json`] ?? '{}').state).toBe('ended')
  const text = textLines(await ui.drawn()).join('\n')
  expect(text).not.toContain('○ /new-ticket')
  expect(text).not.toContain('other sessions')
  expect(text).toContain('/new-ticket closed')
  await ui.unmount()
})

test('on the wide board the free session the ring is on has `x: close` too, in the header (decision 072), and its question sits over the notice line', async ($: any, on: any) => {
  const world = closeWorld(on)
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 160, scroll: { bodyRows: 50 } } })
  await ring($, 'free:free-0000000a')
  expect(buttonKeys(await ui.drawn())).toContain('close:free:free-0000000a')
  expect(textLines(await ui.drawn())[0]).toMatch(/ close$/)
  expect(textLines(await ui.drawn()).find(line => line.includes('SwiftData vs GRDB'))).not.toMatch(/close$/)
  await ui.press({ key: 'close:free:free-0000000a' })
  expect(textLines(await ui.drawn()).some(line => line.includes('close SwiftData vs GRDB?'))).toBe(true)
  await ui.press({ key: 'close:yes' })
  expect(kills(world)).toEqual(['%7'])
  await ui.unmount()
})
