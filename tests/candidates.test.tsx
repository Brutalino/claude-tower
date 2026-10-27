import { expect, mock, test } from 'claude-code/testing'

import { LINEAR_ASSIGN_MUTATION } from '../hooks/core/linear'
import { buttonKeys } from '../hooks/core/railRing'
import { textLines } from './repoGit'
import { withStoredLinear } from './linearConfig'

// Decision 071: the candidates as the old launcher had them. `a` on the narrow rail opens them in the list's place (the
// wide board has them in its candidates column): `m` marks the ▶ one (the `▢` is plain text: one ring stop a row), `↵` promotes the marked ones (else the
// ▶ one) one at a time — stories first, then blockers first — each its worktree only (no session, no /start-ticket),
// then a Linear ticket not already the person's is self-assigned: Tower's one Linear write, only after the worktree is
// there. A ticket blocked by an open one outside the batch asks first. Promoted, they leave the candidates and sit on the
// rail as `○ not started`; ↵ on that row then starts them on /start-ticket.

const NOW = Date.parse('2026-10-15T12:00:00Z')
const STATE = '/state/tower'
const state = (name: string, type: string) => ({ name, type })
const TODO = state('Todo', 'unstarted')
const printing = { identifier: 'TKT-100', title: 'Printing sessions', state: state('In Progress', 'started'), children: { nodes: [
  { identifier: 'TKT-101', title: 'Plug state', state: state('In Progress', 'started'), assignee: { isMe: true } },
  { identifier: 'TKT-130', title: 'Cable check', state: TODO, assignee: { isMe: true } },
  { identifier: 'TKT-131', title: 'Cable retry', state: TODO, assignee: { isMe: true } },
  // Only the story knows this one is the person's: the candidates' query did not give it.
  { identifier: 'TKT-150', title: 'Printer reboot', state: state('Backlog', 'backlog'), assignee: { isMe: true } },
] } }
const billing = { identifier: 'TKT-500', title: 'Billing v2', state: TODO }
const blocks = (by: string) => ({ inverseRelations: { nodes: [{ type: 'blocks', issue: { identifier: by, title: by, state: TODO } }] } })
const node = (identifier: string, title: string, parent: unknown, extra: Record<string, unknown> = {}) => ({
  id: `uuid-${identifier.slice(4)}`, identifier, title, state: TODO, assignee: { isMe: true }, priority: 0,
  branchName: `me/${identifier.toLowerCase()}-${title.toLowerCase().replace(/ /g, '-')}`, ...(parent !== null ? { parent } : {}), ...extra,
})
const free = { assignee: null, labels: { nodes: [{ name: 'Bug' }] } }
const CANDIDATES = [
  node('TKT-101', 'Plug state', printing, { state: state('In Progress', 'started') }),
  node('TKT-130', 'Cable check', printing, { priority: 2 }),
  // Urgent, so the old launcher's compare puts it first; its blocker TKT-130 goes before it in a batch all the same.
  node('TKT-131', 'Cable retry', printing, { priority: 1, ...blocks('TKT-130') }),
  node('TKT-300', 'Docs typo', null, { ...free, priority: 1 }),
  node('TKT-400', 'Payment retry', null, { ...free, ...blocks('TKT-399') }),
  node('TKT-500', 'Billing v2', null, { ...free, children: { nodes: [{ identifier: 'TKT-501', title: 'Invoice PDF', state: TODO }] } }),
  node('TKT-501', 'Invoice PDF', billing, free),
  // Started elsewhere and yours, no worktree here: a candidate, `· in progress` (the old launcher's); started and free: none.
  node('TKT-120', 'Started there', null, { state: state('In Progress', 'started') }),
  node('TKT-121', 'Started by someone', null, { ...free, state: state('In Progress', 'started') }),
]
const BY_KEY = [node('TKT-150', 'Printer reboot', printing, { state: state('Backlog', 'backlog') })]

const PORCELAIN = [
  'worktree /repo/shopapp', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
  'worktree /repo/wt/tkt-101', 'HEAD 2222222222222222222222222222222222222222', 'branch refs/heads/me/tkt-101-plug-state', '',
].join('\n')

type World = {
  git: string[][]; tmux: string[][]; asked: any[]; toasts: string[]; events: string[]; notices: string[]
  /** What Linear answers: the candidates, the mutation's success; a branch git refuses to add; branches on origin. */
  candidates: unknown[]; assigns: boolean; failAdd: Set<string>; onOrigin: Set<string>; ui: any
}

function candidatesWorld(on: any): World {
  const world: World = { git: [], tmux: [], asked: [], toasts: [], events: [], notices: [], candidates: CANDIDATES, assigns: true, failAdd: new Set(), onOrigin: new Set(), ui: null }
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
  on('fs.write', async () => ({ value: undefined }))
  on('fs.exists', async (_$: unknown, e: any) => ({ value: e.path === '/repo/wt/tkt-101/.work/state.json' }))
  on('fs.list', async () => ({ value: [] }))
  on('fs.read', withStoredLinear('/repo/shopapp', async (_$: unknown, e: any) => (e.path === '/repo/wt/tkt-101/.work/state.json' ? { value: '{"phase":"planning"}' } : { deny: `ENOENT: ${e.path}` })))
  on('http.fetch', async (_$: unknown, e: any) => {
    const body = JSON.parse(e.init?.body ?? '{}')
    world.asked.push(body)
    const query = String(body.query)
    const answer = (data: unknown) => ({ value: { ok: true, status: 200, headers: {}, text: JSON.stringify({ data }) } })
    if (query.startsWith('query Viewer')) return answer({ viewer: { id: 'viewer-1' } })
    if (query.startsWith('mutation')) {
      world.events.push(`assign ${body.variables?.id}`)
      return answer({ issueUpdate: { success: world.assigns } })
    }
    return answer({ issues: { nodes: query.startsWith('query RailIssues') ? BY_KEY : world.candidates } })
  })
  on('process.run', async (_$: unknown, e: any) => {
    const argv: string[] = [...e.argv]
    const ok = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: exitCode === 0 ? '' : 'fatal: refused' } })
    if (argv[0] === 'tmux') {
      if (!argv.includes('@tower_mode')) world.tmux.push(argv)
      return ok(argv[1] === 'list-panes' ? '%0\t@0\trail\t\t' : argv[1] === 'split-window' ? '%5' : '@0')
    }
    if (argv[0] !== 'git') return ok('')
    world.git.push(argv)
    if (argv.slice(1).join(' ') === 'worktree list --porcelain') return ok(porcelain)
    if (argv[1] === 'ls-remote') return ok(argv.slice(4).filter(name => world.onOrigin.has(name)).map(name => `abc\trefs/heads/${name}`).join('\n'))
    if (argv[1] === 'worktree' && argv[2] === 'add') {
      // The notice line while this one is made: `promoting TKT-X (i/n)…`.
      if (world.ui !== null) world.notices.push(textLines(await world.ui.drawn()).find(line => line.startsWith('promoting ')) ?? '')
      if (world.failAdd.has(argv[4]!)) return ok('', 128)
      world.events.push(`add ${argv[4]} from ${argv[6]}`)
      porcelain += `\n\nworktree ${argv[5]}\nHEAD d000000000000000000000000000000000000000\nbranch refs/heads/${argv[4]}\n`
      return ok('')
    }
    if (argv[1] === 'rev-parse' && argv[2] === '--verify') return ok('', 1)
    return ok('')
  })
  return world
}

/** The narrow rail once Linear's answers are in (TKT-101's row drawn with its story). */
async function mountRail($: any, world: World, columns = 44) {
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: columns, scroll: { bodyRows: 40 } } })
  for (let tries = 0; tries < 100 && !textLines(await ui.drawn()).join('\n').includes('Printing sessions'); tries++) await new Promise(resolve => (globalThis as any).setTimeout(resolve, 10))
  world.ui = ui
  return ui
}
const ring = async ($: any, element: string) => $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element, origin: { kind: 'person' } })
const opened = (world: World) => world.tmux.filter(argv => argv[1] === 'split-window' || argv[1] === 'new-window')
const adds = (world: World) => world.events.filter(event => event.startsWith('add '))
const mutations = (world: World) => world.asked.filter(body => String(body.query).startsWith('mutation'))
const lines = async (ui: any) => textLines(await ui.drawn())
/** `m` on a candidate: the ring on it, then the mark key (`cands:mark` on the narrow rail, `mark` on the board). */
const mark = async ($: any, ui: any, id: string, key = 'cands:mark') => {
  await ring($, `cand:${id}`)
  await ui.press({ key })
}
const marked = async (ui: any, id: string) => (await lines(ui)).some(line => new RegExp(`▣ . ${id}`).test(line))

test('a opens the candidates in the list\'s place: ▢, the priority, the id, ★ when the person\'s, ↳ under a listed story, a blocked one\'s blocker on its second line; a again closes them', async ($: any, on: any) => {
  const world = candidatesWorld(on)
  const ui = await mountRail($, world)
  await ui.press({ key: 'candidates' })
  const shown = await lines(ui)
  const from = shown.indexOf('CANDIDATES')
  // The person's own first (by story, blockers first), then the free ones; a listed story's children under it.
  expect(shown.slice(from, from + 12)).toEqual([
    'CANDIDATES',
    '▶ ▢ · TKT-120★ Started there · in progress',
    '▸ TKT-100 Printing sessions · 0/4 done',
    '  ▢ ▲ TKT-130★ ↳ Cable check',
    '  ▢ ! TKT-131★ ↳ Cable retry',
    '      blocked by TKT-130',
    '  ▢ · TKT-150★ ↳ Printer reboot',
    '  ▢ ! TKT-300 Docs typo',
    '  ▢ · TKT-400 Payment retry',
    '      blocked by TKT-399',
    '  ▢ · TKT-500 Billing v2 · 0/1 done',
    '  ▢ · TKT-501 ↳ Invoice PDF',
  ])
  // The keys at the bottom, the old launcher's: ↑↓ move · ↵ promote · esc back, then m: mark  l: detail  r: reload  a: back.
  expect(shown.slice(-2)).toEqual(['↑↓ move · ↵ promote · esc back', 'mark  detail  reload  back'])
  // The story blocks are not drawn meanwhile; nor `+ new session` (its `m` would clash with mark).
  expect(shown.some(line => line.includes('TKT-101'))).toBe(false)
  expect(shown.some(line => line.includes('TKT-121'))).toBe(false)
  expect(buttonKeys(await ui.drawn())).not.toContain('new-session')
  // One ring stop a row: the id; the mark is no Button.
  expect(buttonKeys(await ui.drawn()).filter(key => key.startsWith('mark:'))).toEqual([])
  await ui.press({ key: 'candidates' })
  const back = await lines(ui)
  expect(back).not.toContain('CANDIDATES')
  expect(back.some(line => /TKT-101$/.test(line))).toBe(true)
  // Linear was only read.
  expect(mutations(world)).toEqual([])
  await ui.unmount()
})

test('m marks the ▶ candidate and again unmarks it, the heading counts them; a reload keeps only the ones still listed', async ($: any, on: any) => {
  const world = candidatesWorld(on)
  const ui = await mountRail($, world)
  await ui.press({ key: 'candidates' })
  await mark($, ui, 'TKT-300')
  await mark($, ui, 'TKT-500')
  expect(await marked(ui, 'TKT-300')).toBe(true)
  expect(await marked(ui, 'TKT-500')).toBe(true)
  expect(await lines(ui)).toContain('CANDIDATES · 2 marked')
  await mark($, ui, 'TKT-500')
  expect(await marked(ui, 'TKT-500')).toBe(false)
  await mark($, ui, 'TKT-400')
  // TKT-300 left the query (assigned to someone else, say): the reload drops its mark, TKT-400's stays.
  world.candidates = CANDIDATES.filter(one => (one as { identifier: string }).identifier !== 'TKT-300')
  await ui.press({ key: 'cands:reload' })
  expect(await ui.find({ key: 'cand:TKT-300' })).toBeUndefined()
  expect(await lines(ui)).toContain('CANDIDATES · 1 marked')
  world.candidates = CANDIDATES
  await ui.press({ key: 'cands:reload' })
  expect(await ui.find({ key: 'cand:TKT-300' })).toBeDefined()
  expect(await marked(ui, 'TKT-300')).toBe(false)
  expect(adds(world)).toEqual([])
  await ui.unmount()
})

test('↵ promotes the marked ones one at a time — stories first, then blockers first — with promoting X (i/n)…; the free ones self-assigned after their worktree; no session opens', async ($: any, on: any) => {
  const world = candidatesWorld(on)
  const ui = await mountRail($, world)
  await ui.press({ key: 'candidates' })
  for (const key of ['TKT-131', 'TKT-501', 'TKT-130', 'TKT-500']) await mark($, ui, key)
  await ring($, 'cand:TKT-300')
  // ↵ on a row not marked still promotes the marked ones.
  await ui.press({ key: 'cand:TKT-300' })
  expect(world.events).toEqual([
    'add me/tkt-500-billing-v2 from origin/staging', 'assign uuid-500',
    'add me/tkt-130-cable-check from origin/staging',
    'add me/tkt-131-cable-retry from origin/staging',
    'add me/tkt-501-invoice-pdf from origin/staging', 'assign uuid-501',
  ])
  expect(world.notices).toEqual(['promoting TKT-500 (1/4)…', 'promoting TKT-130 (2/4)…', 'promoting TKT-131 (3/4)…', 'promoting TKT-501 (4/4)…'])
  // The mutation: issueUpdate with the person as assignee, nothing else.
  expect(mutations(world)).toEqual([
    { query: LINEAR_ASSIGN_MUTATION, variables: { id: 'uuid-500', assigneeId: 'viewer-1' } },
    { query: LINEAR_ASSIGN_MUTATION, variables: { id: 'uuid-501', assigneeId: 'viewer-1' } },
  ])
  expect(world.toasts).toEqual(['promoted TKT-500, TKT-130, TKT-131, TKT-501 — worktrees ready'])
  expect(opened(world)).toEqual([])
  // Promoted, they leave the candidates and the marks.
  expect(await lines(ui)).toContain('CANDIDATES')
  for (const key of ['TKT-500', 'TKT-130', 'TKT-131', 'TKT-501']) expect(await ui.find({ key: `cand:${key}` })).toBeUndefined()
  expect(await ui.find({ key: 'cand:TKT-300' })).toBeDefined()
  expect(await lines(ui)).toContain('CANDIDATES')
  // Back on the rail: each a `○ not started` row in its story block; ↵ on one starts it on /start-ticket.
  await ui.press({ key: 'candidates' })
  const rail = await lines(ui)
  const row = rail.findIndex(line => /^ {4}○ TKT-130$/.test(line))
  expect(rail[row + 1]).toBe('      not started · Todo')
  expect(rail.some(line => /^ {4}○ TKT-131$/.test(line))).toBe(true)
  expect(rail.some(line => /○ TKT-500$/.test(line))).toBe(true)
  await ui.press({ key: 'row:TKT-130' })
  expect(opened(world).some(argv => argv.includes('/start-ticket TKT-130'))).toBe(true)
  await ui.unmount()
})

test('a ticket blocked by an open one outside the batch asks first: n promotes nothing, y promotes it', async ($: any, on: any) => {
  const world = candidatesWorld(on)
  const ui = await mountRail($, world)
  await ui.press({ key: 'candidates' })
  await ring($, 'cand:TKT-400')
  await ui.press({ key: 'cand:TKT-400' })
  expect((await lines(ui)).join(' ')).toContain('⚠ TKT-400 blocked by TKT-399 — promote anyway?')
  expect(adds(world)).toEqual([])
  await ui.press({ key: 'close:no' })
  expect((await lines(ui)).join(' ')).not.toContain('promote anyway?')
  expect(adds(world)).toEqual([])
  await ui.press({ key: 'cand:TKT-400' })
  await ui.press({ key: 'close:yes' })
  expect(adds(world)).toEqual(['add me/tkt-400-payment-retry from origin/staging'])
  expect(world.toasts).toEqual(['TKT-400 promoted — worktree ready on origin/staging, assigned to you'])
  // Its blocker in the same batch asks nothing: TKT-131 with TKT-130.
  await mark($, ui, 'TKT-131')
  await mark($, ui, 'TKT-130')
  await ui.press({ key: 'cand:TKT-130' })
  expect((await lines(ui)).join(' ')).not.toContain('promote anyway?')
  expect(adds(world).slice(1)).toEqual(['add me/tkt-130-cable-check from origin/staging', 'add me/tkt-131-cable-retry from origin/staging'])
  await ui.unmount()
})

test('the self-assign only when the ticket is not the person\'s, only after its worktree: a failed worktree assigns nothing, a failed assign keeps the promote and says so', async ($: any, on: any) => {
  const world = candidatesWorld(on)
  const ui = await mountRail($, world)
  await ui.press({ key: 'candidates' })
  // The person's own: no write at all.
  await ui.press({ key: 'cand:TKT-130' })
  expect(world.toasts).toEqual(['TKT-130 promoted — worktree ready on origin/staging'])
  expect(mutations(world)).toEqual([])
  // The worktree refused: nothing assigned.
  world.failAdd.add('me/tkt-300-docs-typo')
  await ui.press({ key: 'cand:TKT-300' })
  expect(mutations(world)).toEqual([])
  expect(world.toasts[1]).toBe('TKT-300: fatal: refused')
  // Linear refuses the assign: the worktree stays, the person assigns by hand.
  world.failAdd.clear()
  world.assigns = false
  await ui.press({ key: 'cand:TKT-300' })
  expect(world.events.slice(-2)).toEqual(['add me/tkt-300-docs-typo from origin/staging', 'assign uuid-300'])
  expect(world.toasts[2]).toBe('TKT-300 promoted — worktree ready on origin/staging (Linear self-assign failed — assign manually)')
  expect(await ui.find({ key: 'cand:TKT-300' })).toBeUndefined()
  await ui.unmount()
})

test('a story\'s child the query did not give is read by identifier first; a branch already on origin is resumed from there', async ($: any, on: any) => {
  const world = candidatesWorld(on)
  world.onOrigin.add('me/tkt-150-printer-reboot')
  const ui = await mountRail($, world)
  await ui.press({ key: 'candidates' })
  await ui.press({ key: 'cand:TKT-150' })
  expect(world.asked.some(body => String(body.query).startsWith('query RailIssues') && JSON.stringify(body.variables).includes('150'))).toBe(true)
  expect(world.git).toContainEqual(['git', 'fetch', 'origin', 'me/tkt-150-printer-reboot'])
  expect(adds(world)).toEqual(['add me/tkt-150-printer-reboot from origin/me/tkt-150-printer-reboot'])
  expect(world.toasts).toEqual(['TKT-150 promoted — worktree resumed from origin/me/tkt-150-printer-reboot'])
  expect(mutations(world)).toEqual([])
  await ui.unmount()
})

test('l shows the ▶ candidate\'s detail in the list\'s place (the old launcher\'s fields); l again goes back to the list', async ($: any, on: any) => {
  const world = candidatesWorld(on)
  const ui = await mountRail($, world)
  await ui.press({ key: 'candidates' })
  await ring($, 'cand:TKT-131')
  await ui.press({ key: 'cands:detail' })
  const shown = await lines(ui)
  const from = shown.indexOf('CANDIDATES')
  expect(shown.slice(from + 1, from + 6)).toEqual([
    'TKT-131 · Cable retry',
    '★ assigned to you on Linear',
    'Todo',
    'parent  TKT-100 — Printing sessions (In Pro…',
    'blocked by  TKT-130 — TKT-130 (Todo)',
  ])
  expect(shown.slice(-2)).toEqual(['esc back to the list', 'list  back'])
  await ui.press({ key: 'cands:detail' })
  expect((await lines(ui)).some(line => line.startsWith('▶ ▢ ! TKT-131★'))).toBe(true)
  expect(adds(world)).toEqual([])
  await ui.unmount()
})

test('the wide board: ↵ on a candidate card promotes it (no session); m marks the focused card, ↵ then takes the marked ones', async ($: any, on: any) => {
  const world = candidatesWorld(on)
  const ui = await mountRail($, world, 160)
  for (let tries = 0; tries < 100 && (await ui.find({ key: 'cand:TKT-120' })) === undefined; tries++) await new Promise(resolve => (globalThis as any).setTimeout(resolve, 10))
  // TKT-120 (started elsewhere, yours) is a candidate here too, first; TKT-121 (started, free) is not.
  expect((await lines(ui)).join('\n')).toContain('▢ · TKT-120★')
  expect((await lines(ui)).join('\n')).not.toContain('TKT-121')
  await ring($, 'cand:TKT-300')
  expect((await lines(ui)).join('\n')).toContain('▢ ! TKT-300')
  await ui.press({ key: 'mark' })
  expect((await lines(ui)).join('\n')).toContain('▣ ! TKT-300')
  await mark($, ui, 'TKT-130', 'mark')
  expect((await lines(ui)).join('\n')).toContain('candidates 8 · 2 marked')
  await ui.press({ key: 'cand:TKT-300' })
  expect(adds(world)).toEqual(['add me/tkt-130-cable-check from origin/staging', 'add me/tkt-300-docs-typo from origin/staging'])
  expect(mutations(world).map(body => body.variables.id)).toEqual(['uuid-300'])
  expect(opened(world)).toEqual([])
  expect(await ui.find({ key: 'cand:TKT-300' })).toBeUndefined()
  expect(await ui.find({ key: 'row:TKT-300' })).toBeDefined()
  await ui.unmount()
})
