import { expect, mock, test } from 'claude-code/testing'

import { buttonKeys, ringRests } from '../hooks/core/railRing'
import { textLines } from './repoGit'
import { withStoredLinear } from './linearConfig'

// Decision 069: a ticket on the narrow rail and not started (brought in by decision 071's promote: its worktree only, no
// session, no /start-ticket) reads `○ not started · Todo` (or `blocked by …` in the warning colour) in its story block; ↵
// starts it on /start-ticket (a blocked one asks first). Decision 070: `x` on a ticket with no live session takes it off
// the rail after one y/n: removed (worktree and branch) when not started and holding no work, else hidden (the worktree
// stays, its key in `<state dir>/hidden-<project id>.json`, listed under HIDDEN in the candidates). Linear is only read here.

const NOW = Date.parse('2026-10-15T12:00:00Z')
const STATE = '/state/tower'
const state = (name: string, type: string) => ({ name, type })
const TODO = state('Todo', 'unstarted')
const printing = { identifier: 'TKT-100', title: 'Printing sessions', state: state('In Progress', 'started'), children: { nodes: [
  { identifier: 'TKT-101', title: 'Plug state', state: state('In Progress', 'started'), assignee: { isMe: true } },
  { identifier: 'TKT-102', title: 'Retry start', state: TODO, assignee: { isMe: true } },
  { identifier: 'TKT-103', title: 'Meter values', state: TODO, assignee: { isMe: true } },
  { identifier: 'TKT-130', title: 'Cable check', state: TODO, assignee: { isMe: true } },
  { identifier: 'TKT-131', title: 'Cable retry', state: TODO, assignee: { isMe: true } },
  // Only the story knows this one is the person's: the candidates' query did not give it.
  { identifier: 'TKT-150', title: 'Printer reboot', state: state('Backlog', 'backlog'), assignee: { isMe: true } },
  { identifier: 'TKT-160', title: 'Someone else', state: TODO, assignee: { isMe: false } },
  { identifier: 'TKT-109', title: 'Done one', state: state('Done', 'completed'), assignee: { isMe: true } },
] } }
const billing = { identifier: 'TKT-200', title: 'Billing', state: TODO, children: { nodes: [{ identifier: 'TKT-201', title: 'Invoice PDF', state: state('In Progress', 'started') }] } }
const blocks = (by: string) => ({ inverseRelations: { nodes: [{ type: 'blocks', issue: { identifier: by, title: by, state: TODO } }] } })
const node = (identifier: string, title: string, parent: unknown, extra: Record<string, unknown> = {}) =>
  ({ identifier, title, state: TODO, assignee: { isMe: true }, branchName: `me/${identifier.toLowerCase()}-${title.toLowerCase().replace(/ /g, '-')}`, ...(parent !== null ? { parent } : {}), ...extra })
const CANDIDATES = [
  node('TKT-101', 'Plug state', printing, { state: state('In Progress', 'started') }),
  node('TKT-102', 'Retry start', printing, blocks('TKT-101')),
  node('TKT-103', 'Meter values', printing),
  node('TKT-130', 'Cable check', printing),
  node('TKT-131', 'Cable retry', printing, blocks('TKT-130')),
  node('TKT-201', 'Invoice PDF', billing, { state: state('In Progress', 'started') }),
  node('TKT-7', 'Loose end', null, { state: state('In Progress', 'started') }),
  node('TKT-300', 'Docs typo', null),
]
const BY_KEY = [node('TKT-150', 'Printer reboot', printing, { state: state('Backlog', 'backlog') })]

const worktree = (key: string, slug: string) => [`worktree /repo/wt/${key.toLowerCase()}`, 'HEAD 2222222222222222222222222222222222222222', `branch refs/heads/me/${key.toLowerCase()}-${slug}`, '']
const PORCELAIN = [
  'worktree /repo/shopapp', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
  ...worktree('TKT-101', 'plug-state'), ...worktree('TKT-102', 'retry-start'), ...worktree('TKT-103', 'meter-values'),
  ...worktree('TKT-201', 'invoice-pdf'), ...worktree('TKT-7', 'loose-end'),
].join('\n')
const FILES: Record<string, string> = {
  '/repo/wt/tkt-101/.work/state.json': '{"phase":"planning"}',
  '/repo/wt/tkt-201/.work/state.json': '{"phase":"implementing"}',
  '/repo/wt/tkt-7/.work/state.json': '{"phase":"implementing"}',
}
const record = (id: string, role: string, ticket: string, extra: Record<string, unknown> = {}) =>
  ({ v: 1, id, role, ticket, cwd: '/repo/shopapp', pane: null, state: 'idle', since: NOW - 12 * 60_000, updatedAt: NOW - 1_000, ...extra })
const RECORDS = [record('sid-free-a', 'free', 'free-0000000a', { title: 'SwiftData vs GRDB' }), record('sid-hub', 'hub', 'new-ticket')]

type World = { git: string[][]; tmux: string[][]; asked: any[]; dirty: Set<string>; files: Record<string, string>; toasts: string[]; earlier: Set<string>; onlyHere: Record<string, string> }

function addWorld(on: any): World {
  const world: World = { git: [], tmux: [], asked: [], dirty: new Set(), files: {}, toasts: [], earlier: new Set(), onlyHere: {} }
  let porcelain = PORCELAIN
  mock.env(on, { TOWER_ROLE: 'rail', TOWER_REPO: '/repo/shopapp', TOWER_PLUGIN_DIR: '/plugins/tower', HOME: '/home/test', TMUX_PANE: '%0', TOWER_STATE_DIR: STATE, LINEAR_API_KEY: 'lin_api_test' })
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.id', async () => ({ value: 'rail-1' }))
  on('session.cwd', async () => ({ value: '/repo/shopapp' }))
  on('command.register', async () => ({ value: undefined }))
  on('command.list', async () => ({ value: [] }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.focus', async () => ({}))
  on('ui.toast', async (_$: unknown, e: any) => { world.toasts.push(e.text); return { value: undefined } })
  on('fs.write', async (_$: unknown, e: any) => { if (String(e.path).startsWith(`${STATE}/hidden-`)) world.files[e.path] = e.text; return { value: undefined } })
  on('fs.exists', async (_$: unknown, e: any) => ({ value: e.path in FILES }))
  // An earlier conversation in a worktree: its folder under ~/.claude/projects holds a transcript.
  on('fs.list', async (_$: unknown, e: any) => ({ value: e.path === `${STATE}/sessions` ? RECORDS.map(one => ({ name: `${one.id}.json`, kind: 'file' }))
    : world.earlier.has(e.path) ? [{ name: 'c0ffee.jsonl', kind: 'file' }] : [] }))
  on('fs.read', withStoredLinear('/repo/shopapp', async (_$: unknown, e: any) => {
    const status = RECORDS.find(one => e.path === `${STATE}/sessions/${one.id}.json`)
    if (status !== undefined) return { value: JSON.stringify(status) }
    if (e.path in world.files) return { value: world.files[e.path] }
    return e.path in FILES ? { value: FILES[e.path] } : { deny: `ENOENT: ${e.path}` }
  }))
  on('http.fetch', async (_$: unknown, e: any) => {
    const body = JSON.parse(e.init?.body ?? '{}')
    world.asked.push(body)
    const nodes = String(body.query).startsWith('query RailIssues') ? BY_KEY : CANDIDATES
    return { value: { ok: true, status: 200, headers: {}, text: JSON.stringify({ data: { issues: { nodes } } }) } }
  })
  on('process.run', async (_$: unknown, e: any) => {
    const argv: string[] = [...e.argv]
    const ok = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: exitCode === 0 ? '' : 'fatal: no' } })
    // The hidden list goes through a temporary file and `mv`.
    if (argv[0] === 'mv') {
      world.files[argv[3]!] = world.files[argv[2]!] ?? ''
      delete world.files[argv[2]!]
      return ok('')
    }
    if (argv[0] === 'tmux') {
      if (!argv.includes('@tower_mode')) world.tmux.push(argv)
      return ok(argv[1] === 'list-panes' ? '%0\t@0\trail\t\t' : argv[1] === 'split-window' ? '%5' : '@0')
    }
    if (argv[0] !== 'git') return ok('')
    world.git.push(argv)
    const verb = argv.slice(1).join(' ')
    if (verb === 'worktree list --porcelain') return ok(porcelain)
    if (argv[1] === 'worktree' && argv[2] === 'add') {
      porcelain += `\n\nworktree ${argv[5]}\nHEAD d000000000000000000000000000000000000000\nbranch refs/heads/${argv[4]}\n`
      return ok('')
    }
    if (argv[1] === 'worktree' && argv[2] === 'remove') {
      porcelain = porcelain.split('\n\n').filter(block => !block.startsWith(`worktree ${argv[3]}\n`)).join('\n\n')
      return ok('')
    }
    if (argv[1] === 'rev-parse' && argv[2] === '--verify') return ok('', 1)
    if (argv[1] === 'status') return ok(world.dirty.has(e.init?.cwd ?? '') ? ' M src/printer.ts\n' : '')
    if (argv[1] === 'rev-list' && argv[2] === '--count') return ok(`${world.onlyHere[`${e.init?.cwd ?? ''} ${argv[3]}`] ?? '0'}\n`)
    return ok('')
  })
  return world
}

/** The rail once Linear's answers are in (TKT-102's blocker drawn): the session start reads them in the background. */
async function mountRail($: any, rows = 60) {
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: rows } } })
  for (let tries = 0; tries < 100 && !textLines(await ui.drawn()).includes('      blocked by TKT-101'); tries++) await new Promise(resolve => (globalThis as any).setTimeout(resolve, 10))
  return ui
}
const ring = async ($: any, element: string) => $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element, origin: { kind: 'person' } })
const opened = (world: World) => world.tmux.filter(argv => argv[1] === 'split-window' || argv[1] === 'new-window')
const started = (world: World, key: string) => opened(world).some(argv => argv.some(word => word === `/start-ticket ${key}`))

test('the rail: a ticket brought in and not started reads `○ not started · Todo`, a blocked one `blocked by …`, last in its story', async ($: any, on: any) => {
  addWorld(on)
  const ui = await mountRail($)
  const lines = textLines(await ui.drawn())
  const at = (text: string) => lines.findIndex(one => one.includes(text))
  expect(lines.slice(at('▾ TKT-100'), at('▾ TKT-100') + 8)).toEqual([
    '▾ TKT-100 Printing sessions · 1/8 done',
    '    ◆ TKT-101',
    '      needs you · say go',
    '    ○ TKT-102',
    '      blocked by TKT-101',
    '    ○ TKT-103',
    '      not started · Todo',
    // Decision 071: no `+ n more of yours` under a story any more (the candidates list them): the blank before the next story.
    ' ',
  ])
  // `a: candidates` under the tickets, above the other sessions.
  expect(lines.indexOf('candidates')).toBe(lines.indexOf('other sessions') - 1)
  await ui.unmount()
})

test('↵ on a ticket not started starts it on /start-ticket at once; a blocked one asks first and never starts without y', async ($: any, on: any) => {
  const world = addWorld(on)
  const ui = await mountRail($)
  const asked = async () => textLines(await ui.drawn()).join(' ').includes('TKT-102 is blocked by TKT-101 — start anyway?')
  await ui.press({ key: 'row:TKT-102' })
  expect(await asked()).toBe(true)
  expect(opened(world)).toEqual([])
  await ui.press({ key: 'close:no' })
  expect(await asked()).toBe(false)
  expect(opened(world)).toEqual([])
  await ui.press({ key: 'row:TKT-102' })
  await ui.press({ key: 'close:yes' })
  expect(started(world, 'TKT-102')).toBe(true)
  await ui.unmount()
})

test('↵ on a ticket not started and not blocked opens its session on /start-ticket, no question', async ($: any, on: any) => {
  const world = addWorld(on)
  const ui = await mountRail($)
  await ui.press({ key: 'row:TKT-103' })
  expect(started(world, 'TKT-103')).toBe(true)
  await ui.unmount()
})

const HIDDEN_FILE = `${STATE}/hidden--repo-shopapp.json`
const changesOf = (world: World) => world.git.filter(argv => (argv[1] === 'worktree' && argv[2] === 'remove') || argv[1] === 'branch')
const joined = async (ui: any) => textLines(await ui.drawn()).join('\n')

test('x on a ticket not started with an earlier conversation and no work: asked, then removed, git branch -D only after a zero count', async ($: any, on: any) => {
  const world = addWorld(on)
  // TKT-103 had a session once: no refusal for it any more.
  world.earlier.add('/home/test/.claude/projects/-repo-wt-tkt-103')
  const ui = await mountRail($)
  await ring($, 'row:TKT-103')
  expect(buttonKeys(await ui.drawn())).toContain('close:row:TKT-103')
  // Decision 072: `x: remove` in the header, beside skills board quit; the row's own second line is only its status.
  expect(textLines(await ui.drawn())[0]).toBe('remove  skills  board  quit')
  expect(textLines(await ui.drawn())).toContain('      not started · Todo')
  await ui.press({ key: 'close:row:TKT-103' })
  const asked = textLines(await ui.drawn())
  // The question under the header, in the warning colour; the note beside y/n.
  expect(asked.slice(asked.indexOf('remove TKT-103?'), asked.indexOf('remove TKT-103?') + 3)).toEqual(['remove TKT-103?', 'deletes its worktree and branch', 'yes   no'])
  expect(asked.indexOf('remove TKT-103?')).toBeLessThan(asked.findIndex(one => one.includes('TKT-100')))
  expect(changesOf(world)).toEqual([])
  expect(world.toasts).toEqual([])
  await ui.press({ key: 'close:yes' })
  expect(changesOf(world)).toEqual([['git', 'worktree', 'remove', '/repo/wt/tkt-103'], ['git', 'branch', '-D', 'me/tkt-103-meter-values']])
  // The branch's commits counted again right before -D, the worktree gone: none only there.
  const at = world.git.findIndex(argv => argv[1] === 'branch')
  expect(world.git[at - 1]).toEqual(['git', 'rev-list', '--count', 'refs/heads/me/tkt-103-meter-values', '--not', '--exclude=me/tkt-103-meter-values', '--branches', '--remotes'])
  expect(world.git.flat().some(word => word === '--force' || word === '-f' || word === '-d')).toBe(false)
  const lines = textLines(await ui.drawn())
  expect(lines.some(one => /TKT-103$/.test(one))).toBe(false)
  expect(lines.join('\n')).toContain('TKT-103 removed: worktree and branch deleted')
  expect(world.toasts).toEqual(['TKT-103 removed: worktree and branch deleted'])
  expect(world.files).toEqual({})
  await ui.unmount()
})

test('x then y: a branch with a commit only there at the re-check keeps its branch (no -D); the toast says so', async ($: any, on: any) => {
  const world = addWorld(on)
  world.onlyHere['/repo/shopapp refs/heads/me/tkt-103-meter-values'] = '1'
  const ui = await mountRail($)
  await ring($, 'row:TKT-103')
  await ui.press({ key: 'close:row:TKT-103' })
  await ui.press({ key: 'close:yes' })
  expect(changesOf(world)).toEqual([['git', 'worktree', 'remove', '/repo/wt/tkt-103']])
  expect(world.toasts).toEqual(['TKT-103 removed: worktree deleted, its branch stays (1 commit only there)'])
  await ui.unmount()
})

test('x on a ticket not started with work: asked to hide it; y hides it (the hidden list written, the row gone); the candidates list it under HIDDEN and ↵ brings it back', async ($: any, on: any) => {
  const world = addWorld(on)
  world.dirty.add('/repo/wt/tkt-103')
  world.onlyHere['/repo/wt/tkt-103 HEAD'] = '2'
  const ui = await mountRail($)
  await ring($, 'row:TKT-103')
  await ui.press({ key: 'close:row:TKT-103' })
  const question = 'TKT-103 has work (1 changed file, 2 commits only here): hide it from the rail?'
  expect((await joined(ui)).replace(/\n/g, ' ')).toContain(question)
  expect(await joined(ui)).toContain('the worktree stays')
  await ui.press({ key: 'close:yes' })
  expect(changesOf(world)).toEqual([])
  expect(JSON.parse(world.files[HIDDEN_FILE] ?? 'null')).toEqual({ version: 1, keys: ['TKT-103'] })
  expect(Object.keys(world.files)).toEqual([HIDDEN_FILE])
  let lines = textLines(await ui.drawn())
  expect(lines.some(one => /TKT-103$/.test(one))).toBe(false)
  expect(lines.join('\n')).toContain('TKT-103 hidden: worktree kept')
  expect(world.toasts).toEqual(['TKT-103 hidden: worktree kept'])
  // Hidden, it is never a candidate (its worktree is there): under HIDDEN instead.
  await ui.press({ key: 'candidates' })
  lines = textLines(await ui.drawn())
  expect(lines.slice(lines.indexOf('HIDDEN'), lines.indexOf('HIDDEN') + 2)).toEqual(['HIDDEN', '  + TKT-103 Meter values'])
  expect(lines.filter(one => /^ .*TKT-103/.test(one))).toEqual(['  + TKT-103 Meter values'])
  await ui.press({ key: 'unhide:TKT-103' })
  expect(JSON.parse(world.files[HIDDEN_FILE] ?? 'null')).toEqual({ version: 1, keys: [] })
  expect(world.git.some(argv => argv[1] === 'worktree' && argv[2] === 'add')).toBe(false)
  expect(world.toasts).toEqual(['TKT-103 hidden: worktree kept', 'TKT-103 is back on the rail'])
  await ui.press({ key: 'candidates' })
  lines = textLines(await ui.drawn())
  expect(lines).not.toContain('HIDDEN')
  expect(lines.some(one => /^(▶ | {2}) {2}○ TKT-103$/.test(one))).toBe(true)
  await ui.unmount()
})

test('x on a started ticket with no live session: hide, never remove; y hides it and the worktree stays', async ($: any, on: any) => {
  const world = addWorld(on)
  const ui = await mountRail($)
  await ring($, 'row:TKT-201')
  expect(buttonKeys(await ui.drawn())).toContain('close:row:TKT-201')
  const row = textLines(await ui.drawn()).findIndex(one => /TKT-201$/.test(one))
  expect(textLines(await ui.drawn())[row + 1]).not.toMatch(/hide$/)
  expect(textLines(await ui.drawn())[0]).toBe('hide  skills  board  quit')
  await ui.press({ key: 'close:row:TKT-201' })
  expect(textLines(await ui.drawn())).toContain('hide TKT-201 from the rail?')
  // A started ticket's work is not asked of git: it is only hidden.
  expect(world.git.some(argv => argv[1] === 'status')).toBe(false)
  await ui.press({ key: 'close:yes' })
  expect(changesOf(world)).toEqual([])
  expect(JSON.parse(world.files[HIDDEN_FILE] ?? 'null')).toEqual({ version: 1, keys: ['TKT-201'] })
  expect(textLines(await ui.drawn()).some(one => /TKT-201$/.test(one))).toBe(false)
  expect(world.toasts).toEqual(['TKT-201 hidden: worktree kept'])
  await ui.unmount()
})

test('a hidden ticket stays off the rail on every load: the hidden list is read with the worktrees', async ($: any, on: any) => {
  const world = addWorld(on)
  world.files[HIDDEN_FILE] = JSON.stringify({ version: 1, keys: ['tkt-7'] })
  const ui = await mountRail($)
  expect(textLines(await ui.drawn()).some(one => /TKT-7$/.test(one))).toBe(false)
  expect(textLines(await ui.drawn()).some(one => /TKT-201$/.test(one))).toBe(true)
  await ui.unmount()
})

test('n leaves the question and the row; the ring put back by Tower itself never takes the question away', async ($: any, on: any) => {
  const world = addWorld(on)
  const ui = await mountRail($)
  await ring($, 'row:TKT-103')
  await ui.press({ key: 'close:row:TKT-103' })
  await $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element: 'row:TKT-103', origin: { kind: 'plugin', name: 'tower' } })
  expect(textLines(await ui.drawn())).toContain('remove TKT-103?')
  await ui.press({ key: 'close:no' })
  expect(textLines(await ui.drawn())).not.toContain('remove TKT-103?')
  expect(textLines(await ui.drawn()).some(one => /TKT-103$/.test(one))).toBe(true)
  expect(changesOf(world)).toEqual([])
  expect(world.toasts).toEqual([])
  await ui.unmount()
})

/** Every Button's hotkey in a drawn tree, in order. */
function hotkeys(node: any): string[] {
  if (node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(hotkeys)
  if (node.type === 'Button') return typeof node.props?.hotkey === 'string' ? [node.props.hotkey] : []
  return hotkeys(node.children ?? node.props?.children ?? [])
}

test('decision 072: one x in the header, for the ring\'s row: remove, hide; the ring on x itself or off the rows keeps the ▶ row; none in the candidates', async ($: any, on: any) => {
  addWorld(on)
  const ui = await mountRail($)
  const closes = async () => buttonKeys(await ui.drawn()).filter(key => key.startsWith('close:'))
  await ring($, 'row:TKT-103')
  // The first Button of the pane, before skills board quit; no row carries one of its own; `x` is its hotkey, once.
  expect(buttonKeys(await ui.drawn()).slice(0, 4)).toEqual(['close:row:TKT-103', 'skills', 'board', 'quit'])
  expect(await closes()).toEqual(['close:row:TKT-103'])
  expect((await ui.find({ key: 'close:row:TKT-103' }))?.text).toBe('remove')
  expect(hotkeys(await ui.drawn()).filter(key => key === 'x')).toEqual(['x'])
  // The label follows the ring's row.
  await ring($, 'row:TKT-201')
  expect(await closes()).toEqual(['close:row:TKT-201'])
  expect((await ui.find({ key: 'close:row:TKT-201' }))?.text).toBe('hide')
  // The ring on the header's x: still TKT-201's (a click there acts on the row, not on itself).
  await ring($, 'close:row:TKT-201')
  expect(await closes()).toEqual(['close:row:TKT-201'])
  // The ring off the rows (on skills): the ▶ row's.
  await ring($, 'skills')
  expect(await closes()).toEqual(['close:row:TKT-201'])
  await ui.press({ key: 'close:row:TKT-201' })
  expect(textLines(await ui.drawn())).toContain('hide TKT-201 from the rail?')
  await ui.press({ key: 'close:no' })
  // The candidates take the list's place: no x there.
  await ui.press({ key: 'candidates' })
  expect(await closes()).toEqual([])
  await ui.unmount()
})

/** The Texts drawn inverse, in order: none in the narrow rail, whose bar is the engine's focus inverse on the row's Button. */
function inverseTexts(node: unknown): string[] {
  if (node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(inverseTexts)
  const element = node as { type?: unknown; props?: Record<string, unknown>; children?: unknown }
  if (element.type === 'Text' && element.props?.inverse === true) return [textLines(element).join('')]
  return inverseTexts(element.children ?? element.props?.children ?? [])
}

test('decision 058: the ▶ and the bar follow the ring onto a: candidates, across a chosen candidate and onto a HIDDEN row', async ($: any, on: any) => {
  const world = addWorld(on)
  world.files[HIDDEN_FILE] = JSON.stringify({ version: 1, keys: ['tkt-7'] })
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  // The pane holds the keys.
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 60 }, isFocused: true } })
  for (let tries = 0; tries < 100 && !textLines(await ui.drawn()).includes('      blocked by TKT-101'); tries++) await new Promise(resolve => (globalThis as any).setTimeout(resolve, 10))
  const marked = async () => textLines(await ui.drawn()).filter(one => one.startsWith('▶ '))
  const dump = async () => ({ marked: await marked(), inverse: inverseTexts(await ui.drawn()) })
  const shown = async (key: string) => (await ui.find({ key }))?.text ?? ''
  // `a: candidates` under the tickets (drawn `a: candidates`, 13 cells): ▶ before it, the Button holds the padding (the
  // engine's focus inverse the bar, Tower's none), no ticket marked.
  await ring($, 'row:TKT-102')
  await ring($, 'candidates')
  expect(await dump()).toEqual({ marked: ['▶ candidates'], inverse: [] })
  expect(await shown('candidates')).toBe('candidates' + ' '.repeat(44 - 2 - 13))
  // Off the rows (a header key): back on the ticket.
  await ring($, 'board')
  expect(await marked()).toEqual([expect.stringMatching(/^▶ {3}○ TKT-102$/)])
  await ui.press({ key: 'candidates' })
  await ring($, 'cand:TKT-131')
  // The chosen candidate: its Button holds the row after the ▶ across the 44 columns (the engine's inverse on it), in
  // its colours: the ★ keeps the needs-you colour (before, Tower's inverse dropped them).
  expect(await marked()).toEqual(['▶ ▢ · TKT-131★ ↳ Cable retry'])
  expect(inverseTexts(await ui.drawn())).toEqual([])
  expect(await shown('cand:TKT-131')).toMatch(/^▢ · TKT-131★ ↳ Cable retry +$/)
  expect(2 + Array.from(await shown('cand:TKT-131')).length).toBe(44)
  const star = ((await ui.find({ key: 'cand:TKT-131' }))?.children ?? []).find((one: any) => one?.type === 'Text' && one.children?.[0] === '★') as any
  expect(star?.props.color).toBeDefined()
  await ring($, 'unhide:TKT-7')
  // A HIDDEN row: ▶ on it, its Button the label and the padding, no candidate marked meanwhile.
  expect(await dump()).toEqual({ marked: ['▶ + TKT-7 Loose end'], inverse: [] })
  expect(await shown('unhide:TKT-7')).toBe('+ TKT-7 Loose end' + ' '.repeat(44 - 2 - '+ TKT-7 Loose end'.length))
  // Off the rows (the footer's `back`, a header key): the ▶ is back on the chosen candidate.
  for (const element of ['candidates', 'board']) {
    await ring($, element)
    expect(await marked()).toEqual(['▶ ▢ · TKT-131★ ↳ Cable retry'])
    expect(inverseTexts(await ui.drawn())).toEqual([])
  }
  await ui.unmount()
})

test('the candidates\' footer keys (cands:mark, cands:detail, cands:reload) are no rows: the ring on mark keeps the ▶ candidate, and mark marks it', async ($: any, on: any) => {
  addWorld(on)
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 60 }, isFocused: true } })
  for (let tries = 0; tries < 100 && !textLines(await ui.drawn()).includes('      blocked by TKT-101'); tries++) await new Promise(resolve => (globalThis as any).setTimeout(resolve, 10))
  await ui.press({ key: 'candidates' })
  await ring($, 'cand:TKT-131')
  const marked = async () => textLines(await ui.drawn()).filter(one => one.startsWith('▶ '))
  // Before, `cand:mark` read as a candidate: the ▶ jumped to the first one (TKT-130), and mark (clicked) marked that one.
  await ring($, 'cands:mark')
  expect(await marked()).toEqual(['▶ ▢ · TKT-131★ ↳ Cable retry'])
  expect(inverseTexts(await ui.drawn())).toEqual([])
  // The keys check leaves the ring on the footer's keys: drawn Buttons that are no rows.
  const drawn = new Set(buttonKeys(await ui.drawn()))
  for (const key of ['cands:mark', 'cands:detail', 'cands:reload']) expect(ringRests(key, 'cand:TKT-131', drawn)).toBe(true)
  await ui.press({ key: 'cands:mark' })
  const lines = textLines(await ui.drawn())
  expect(lines.find(one => one.includes('TKT-131'))).toMatch(/^▶ ▣ /)
  expect(lines.find(one => one.includes('TKT-130'))).toMatch(/^ {2}▢ /)
  await ui.unmount()
})
