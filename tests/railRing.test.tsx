import { expect, mock, test } from 'claude-code/testing'

import { buttonKeys, ringRests, ringRowOf } from '../hooks/core/railRing'
import { REPO, repoGitRail, STATE, textLines } from './repoGit'
import { withStoredLinear } from './linearConfig'

// The rail's focus ring walks every Button with ↑/↓; the keys check (ensureKeys, every 0.7 s) put it back on the ▶ row
// whenever it stood elsewhere, so ↑ from the first row snapped back. Reported live on oink with no open issues: stuck
// in OTHER BRANCHES. Now the ring stays on any Button drawn (`+ new session`, a SESSIONS row, a header or action key)
// and goes back only when it is lost. The kit has no focus act of a plugin's own, so the test reads the drawn tree:
// the ring's order and what the keys check decides on it.

const NOW = Date.parse('2026-10-12T12:00:00Z')
const FOLDER = REPO.slice(REPO.lastIndexOf('/') + 1)

/** oink's main checkout and five worktrees whose branch has no issue number: OTHER BRANCHES only. */
const BRANCHES = ['fix/block-controls-glass', 'fix/crash-restore', 'fix/icon-launch', 'feature/plan', 'trial/maestro']
const PORCELAIN = [
  `worktree ${REPO}`, 'HEAD a000000000000000000000000000000000000000', 'branch refs/heads/main', '',
  ...BRANCHES.flatMap((branch, at) => [`worktree ${REPO}-${branch.replace('/', '-')}`, `HEAD c00000000000000000000000000000000000000${at}`, `branch refs/heads/${branch}`, '']),
].join('\n')
const branchRow = (branch: string) => `row:other:${FOLDER}-${branch.replace('/', '-')}`

const FREE = { v: 1, id: 'sid-free-0000000a', role: 'free', ticket: 'free-0000000a', cwd: REPO, pane: null, state: 'idle', since: NOW - 12 * 60_000, updatedAt: NOW - 1_000, title: 'SwiftData vs GRDB' }

test('oink with no issues: ↑ from the first other branch reaches SESSIONS, + new session and the header, and the ring stays there', async ($: any, on: any) => {
  repoGitRail(on, { porcelain: PORCELAIN, issues: [], files: { [`${STATE}/sessions/${FREE.id}.json`]: JSON.stringify(FREE) }, sessions: [`${FREE.id}.json`] })
  on('session.id', async () => ({ value: 'rail-1' }))
  on('ui.focus', async () => ({}))
  await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 } } })
  await ui.press({ key: 'refresh' })
  const tree = await ui.drawn()
  const text = textLines(tree).join('\n')
  expect(text).toContain('+ new session')
  expect(text).toContain('SESSIONS')
  expect(text).toContain('OTHER BRANCHES')
  expect(text).not.toMatch(/IN PROGRESS|OPEN ISSUES/)
  // The ring's order, top to bottom: the header's keys, `+ new session`, the session, the five branches, the actions.
  const keys = buttonKeys(tree)
  expect(keys.slice(0, 11)).toEqual(['skills', 'refresh', 'board', 'quit', 'new-session', 'free:free-0000000a', ...BRANCHES.map(branchRow)])
  expect(keys.slice(11)).toEqual(['board-skill:n', 'board-skill:t', 'board-skill:l'])
  // The ▶ on the first branch: ↑ from it, one Button at a time, and the keys check leaves the ring there.
  const drawn = new Set(keys)
  const marked = branchRow(BRANCHES[0]!)
  for (const ring of ['free:free-0000000a', 'new-session', 'quit', 'board', 'refresh', 'skills', 'board-skill:n', marked]) expect(ringRests(ring, marked, drawn)).toBe(true)
  // Lost, it goes back to the ▶ row: none, one no longer drawn (the folder `+ new session` offered, once answered), a row the ▶ left.
  for (const ring of [null, 'new-session:m', branchRow(BRANCHES[1]!), 'more:repo:down']) expect(ringRests(ring, marked, drawn)).toBe(false)
  // A person's ↑ onto `+ new session` lands; the ▶ stays on the branch.
  await $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element: 'new-session', origin: { kind: 'person' } })
  expect(textLines(await ui.drawn()).find(line => line.includes(BRANCHES[0]!))).toMatch(/^▶ /)
  await ui.unmount()
})

test('ShopApp\'s rail: ↑ from the first ticket reaches + new session and the header, and the ring stays there', async ($: any, on: any) => {
  const porcelain = [
    'worktree /repo/shopapp', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
    'worktree /repo/wt/tkt-11', 'HEAD 2222222222222222222222222222222222222222', 'branch refs/heads/me/tkt-11-skills', '',
  ].join('\n')
  mock.env(on, { TOWER_ROLE: 'rail', TOWER_REPO: '/repo/shopapp', TOWER_PLUGIN_DIR: '/plugins/tower', HOME: '/home/test', TMUX_PANE: '%0' })
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.id', async () => ({ value: 'rail-1' }))
  on('session.cwd', async () => ({ value: '/repo/shopapp' }))
  on('command.register', async () => ({ value: undefined }))
  on('command.list', async () => ({ value: [] }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.focus', async () => ({}))
  on('fs.write', async () => ({ value: undefined }))
  on('fs.exists', async () => ({ value: false }))
  on('fs.list', async () => ({ value: [] }))
  on('fs.read', withStoredLinear('/repo/shopapp', async (_$: unknown, e: any) => ({ deny: `ENOENT: ${e.path}` })))
  on('http.fetch', async () => ({ deny: 'no network in tests' }))
  on('process.run', async (_$: unknown, e: any) => {
    if (e.argv[0] !== 'tmux') return { value: { exitCode: 0, stdout: e.argv[0] === 'git' ? porcelain : '', stderr: '' } }
    return { value: { exitCode: 0, stdout: e.argv[1] === 'list-panes' ? '%0\t@0\trail\t\t' : '@0', stderr: '' } }
  })
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 } } })
  await $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element: 'row:TKT-11', origin: { kind: 'person' } })
  const keys = buttonKeys(await ui.drawn())
  // Decision 069: TKT-11 is not started (no state file, no session): `x: remove` for the ring's row, in the header since
  // decision 072 (first, beside skills board quit); decision 071: `a: candidates` under the list.
  expect(keys).toEqual(['close:row:TKT-11', 'skills', 'board', 'quit', 'new-session', 'row:TKT-11', 'candidates'])
  const drawn = new Set(keys)
  for (const ring of ['new-session', 'quit', 'board', 'skills', 'row:TKT-11', 'close:row:TKT-11', 'candidates']) expect(ringRests(ring, 'row:TKT-11', drawn)).toBe(true)
  expect(ringRests('free:gone', 'row:TKT-11', drawn)).toBe(false)
  await ui.unmount()
})

/** The Texts drawn inverse, in order: none in a narrow rail, whose bar is the engine's focus inverse on the row's Button. */
function inverseTexts(node: unknown): string[] {
  if (node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(inverseTexts)
  const element = node as { type?: unknown; props?: Record<string, unknown>; children?: unknown }
  const props = element.props ?? {}
  if (element.type === 'Text' && props.inverse === true) return [textLines(element).join('\n')]
  return inverseTexts(element.children ?? props.children ?? [])
}

/** ShopApp's rail with TKT-11 (and `more` worktrees) and the session records `records`, under the state folder. */
function shopappRail(on: any, records: Record<string, unknown>[], more = '') {
  const porcelain = [
    'worktree /repo/shopapp', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
    'worktree /repo/wt/tkt-11', 'HEAD 2222222222222222222222222222222222222222', 'branch refs/heads/me/tkt-11-skills', '',
  ].join('\n') + more
  mock.env(on, { TOWER_ROLE: 'rail', TOWER_REPO: '/repo/shopapp', TOWER_PLUGIN_DIR: '/plugins/tower', HOME: '/home/test', TMUX_PANE: '%0', TOWER_STATE_DIR: STATE })
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.id', async () => ({ value: 'rail-1' }))
  on('session.cwd', async () => ({ value: '/repo/shopapp' }))
  on('command.register', async () => ({ value: undefined }))
  on('command.list', async () => ({ value: [] }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.focus', async () => ({}))
  on('fs.write', async () => ({ value: undefined }))
  on('fs.exists', async () => ({ value: false }))
  on('fs.list', async (_$: unknown, e: any) => ({ value: e.path === `${STATE}/sessions` ? records.map(one => ({ name: `${one.id}.json`, kind: 'file' })) : [] }))
  on('fs.read', withStoredLinear('/repo/shopapp', async (_$: unknown, e: any) => {
    const record = records.find(one => e.path === `${STATE}/sessions/${one.id}.json`)
    return record !== undefined ? { value: JSON.stringify(record) } : { deny: `ENOENT: ${e.path}` }
  }))
  on('http.fetch', async () => ({ deny: 'no network in tests' }))
  on('process.run', async (_$: unknown, e: any) => {
    if (e.argv[0] !== 'tmux') return { value: { exitCode: 0, stdout: e.argv[0] === 'git' ? porcelain : '', stderr: '' } }
    return { value: { exitCode: 0, stdout: e.argv[1] === 'list-panes' ? '%0\t@0\trail\t\t' : '@0', stderr: '' } }
  })
}

test('the narrow rail\'s ▶ and bar follow the ring onto a session and + new session, and back to the ticket off the rows', async ($: any, on: any) => {
  shopappRail(on, [{ ...FREE, cwd: '/repo/shopapp' }])
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  // The pane holds the keys.
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 }, isFocused: true } })
  const ring = async (element: string) => $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element, origin: { kind: 'person' } })
  const line = async (text: string) => textLines(await ui.drawn()).find(one => one.includes(text)) ?? ''
  const shown = async (key: string) => (await ui.find({ key }))?.text ?? ''
  // On the ticket: ▶ and the glyph before its Button, which holds the id and the padding across the 44 columns: the
  // bar is the engine's focus inverse on it, Tower draws none of its own (before, the id and its sides were two layers).
  await ring('row:TKT-11')
  expect(await line('TKT-11')).toMatch(/^▶ ○ TKT-11$/)
  expect(await line('SwiftData vs GRDB')).toMatch(/^ {2}○ /)
  expect(await shown('row:TKT-11')).toMatch(/^TKT-11 +$/)
  expect(Array.from('▶ ○ ').length + Array.from(await shown('row:TKT-11')).length).toBe(44)
  expect(inverseTexts(await ui.drawn())).toEqual([])
  // ↑ onto the session: the ▶ moves with the ring; its Button holds the name and the detail across the row.
  await ring('free:free-0000000a')
  expect(await line('SwiftData vs GRDB')).toMatch(/^▶ ○ SwiftData vs GRDB +main · 12m$/)
  expect(await line('TKT-11')).toMatch(/^ {2}○ TKT-11$/)
  expect(await shown('free:free-0000000a')).toMatch(/^SwiftData vs GRDB +main · 12m$/)
  expect(Array.from('▶ ○ ').length + Array.from(await shown('free:free-0000000a')).length).toBe(44)
  expect(inverseTexts(await ui.drawn())).toEqual([])
  // ↑ onto `+ new session` (drawn `o: + new session`, 16 cells): ▶ before it, the Button holds the padding; no other row marked.
  await ring('new-session')
  expect(await line('+ new session')).toBe('▶ + new session')
  expect(await shown('new-session')).toBe('+ new session' + ' '.repeat(44 - 2 - 16))
  expect(inverseTexts(await ui.drawn())).toEqual([])
  expect(textLines(await ui.drawn()).filter(one => one.startsWith('▶ '))).toEqual(['▶ + new session'])
  // Off the rows (a header key, the header's `x` for the session): the ▶ back on TKT-11, the bar on the key the ring is on.
  for (const element of ['board', 'close:free:free-0000000a']) {
    await ring(element)
    expect(textLines(await ui.drawn()).filter(one => one.startsWith('▶ '))).toEqual(['▶ ○ TKT-11'])
    expect(inverseTexts(await ui.drawn())).toEqual([])
  }
  await ui.unmount()
})

test('the narrow rail: a working ticket keeps its spinner with the ring on it (the glyph is outside the Button, never inverse)', async ($: any, on: any) => {
  const working = { v: 1, id: 'sid-tkt-12', role: 'ticket', ticket: 'TKT-12', cwd: '/repo/wt/tkt-12', pane: null, state: 'working', since: NOW - 60_000, updatedAt: NOW - 1_000 }
  shopappRail(on, [working], '\nworktree /repo/wt/tkt-12\nHEAD 3333333333333333333333333333333333333333\nbranch refs/heads/me/tkt-12-spin\n')
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 }, isFocused: true } })
  await $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element: 'row:TKT-12', origin: { kind: 'person' } })
  // Before, a ringed row drew a still `◐` inverse in the spinner's place.
  expect((await ui.findAll({ type: 'Client' })).map((one: any) => one.key)).toEqual(['spin:TKT-12'])
  expect(textLines(await ui.drawn()).filter(one => one.startsWith('▶ '))).toEqual([expect.stringMatching(/^▶ +TKT-12$/)])
  const shown = (await ui.find({ key: 'row:TKT-12' }))?.text ?? ''
  expect(shown).toMatch(/^TKT-12 +$/)
  expect(4 + Array.from(shown).length).toBe(44)
  expect(inverseTexts(await ui.drawn())).toEqual([])
  await ui.unmount()
})

test('ringRowOf: the ring\'s element while the pane holds the keys and it is a row drawn; else null (the ▶ row keeps the highlight)', () => {
  const rows = ['new-session', 'free:a', 'row:TKT-1', 'hub:new-ticket', 'stage:2']
  for (const ring of rows) expect(ringRowOf(ring, true, rows)).toBe(ring)
  // A header or action key, a close Button, a row no longer drawn, no ring, or the keys elsewhere.
  for (const ring of ['skills', 'quit', 'close:free:a', 'free:gone', 'row:TKT-2', null]) expect(ringRowOf(ring, true, rows)).toBe(null)
  expect(ringRowOf('free:a', false, rows)).toBe(null)
})

test('the Git repository\'s narrow rail: the ▶ follows the ring onto a session and + new session, and back to the branch off the rows', async ($: any, on: any) => {
  repoGitRail(on, { porcelain: PORCELAIN, issues: [], files: { [`${STATE}/sessions/${FREE.id}.json`]: JSON.stringify(FREE) }, sessions: [`${FREE.id}.json`] })
  on('session.id', async () => ({ value: 'rail-1' }))
  on('ui.focus', async () => ({}))
  await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 }, isFocused: true } })
  await ui.press({ key: 'refresh' })
  const ring = async (element: string) => $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element, origin: { kind: 'person' } })
  const marked = async () => textLines(await ui.drawn()).filter(one => one.startsWith('▶ '))
  const cells = (texts: string[]) => texts.reduce((sum, one) => sum + Array.from(one).length, 0)
  await ring(branchRow(BRANCHES[1]!))
  // The ▶ in the accent, never inverse (before, it was the one inverse cell beside the engine's on the branch).
  expect(await marked()).toEqual([expect.stringContaining(BRANCHES[1]!)])
  expect(inverseTexts(await ui.drawn())).toEqual([])
  // ↑ onto the session: its Button holds the name and the detail across the 44 columns, no branch line marked.
  await ring('free:free-0000000a')
  expect(await marked()).toEqual([expect.stringMatching(/^▶ ○ SwiftData vs GRDB /)])
  expect(Array.from('▶ ○ ').length + cells([(await ui.find({ key: 'free:free-0000000a' }))?.text ?? ''])).toBe(44)
  expect(inverseTexts(await ui.drawn())).toEqual([])
  // ↑ onto `+ new session`: ▶ before it, the Button holds the padding.
  await ring('new-session')
  expect(await marked()).toEqual(['▶ + new session'])
  expect((await ui.find({ key: 'new-session' }))?.text).toBe('+ new session' + ' '.repeat(44 - 2 - 16))
  expect(inverseTexts(await ui.drawn())).toEqual([])
  // Off the rows (a header key): back on the branch.
  await ring('quit')
  expect(await marked()).toEqual([expect.stringContaining(BRANCHES[1]!)])
  expect(inverseTexts(await ui.drawn())).toEqual([])
  await ui.unmount()
})
