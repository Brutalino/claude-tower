import { expect, mock, test } from 'claude-code/testing'

import { textLines } from './repoGit'
import { withStoredLinear } from './linearConfig'

// Decision 067: ShopApp's narrow rail (beside a ticket session) draws its tickets in story blocks: the story's header,
// its rows two cells in, a blank line; the tickets of no story (or whose issue Linear did not give) under NO STORY.

const NOW = Date.parse('2026-10-15T12:00:00Z')
const worktree = (key: string, slug: string, at: number) => [
  `worktree /repo/wt/${key.toLowerCase()}`, `HEAD ${String(at).repeat(40)}`, `branch refs/heads/me/${key.toLowerCase()}-${slug}`, '',
]
const PORCELAIN = [
  'worktree /repo/shopapp', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
  ...worktree('TKT-7', 'loose-end', 2), ...worktree('TKT-101', 'plug-state', 3), ...worktree('TKT-201', 'invoice-pdf', 4),
  ...worktree('TKT-102', 'retry-start', 5), ...worktree('TKT-9', 'not-in-linear', 6),
].join('\n')

const state = (name: string, type: string) => ({ name, type })
const printing = { identifier: 'TKT-100', title: 'Printing sessions', state: state('In Progress', 'started'), children: { nodes: [
  { identifier: 'TKT-101', title: 'Plug state', state: state('In Progress', 'started') },
  { identifier: 'TKT-102', title: 'Retry start', state: state('Todo', 'unstarted') },
  { identifier: 'TKT-103', title: 'Done one', state: state('Done', 'completed') },
] } }
const billing = { identifier: 'TKT-200', title: 'Billing', state: state('Todo', 'unstarted'), children: { nodes: [
  { identifier: 'TKT-201', title: 'Invoice PDF', state: state('Todo', 'unstarted') },
] } }
const node = (identifier: string, title: string, parent: unknown, extra: Record<string, unknown> = {}) =>
  ({ identifier, title, state: state('Todo', 'unstarted'), assignee: { isMe: true }, ...(parent !== null ? { parent } : {}), ...extra })

/** The candidates' query gives TKT-101, TKT-7 and TKT-201; TKT-102 (someone else's) only the rail's query by identifier; TKT-9 neither. */
export const CANDIDATES = [
  node('TKT-101', 'Plug state', printing, { state: state('In Progress', 'started') }),
  node('TKT-7', 'Loose end', null),
  node('TKT-201', 'Invoice PDF', billing),
]
export const BY_KEY = [node('TKT-102', 'Retry start', printing, { assignee: { isMe: false, displayName: 'ana' } })]

const FILES: Record<string, string> = {
  // TKT-101 is planning (needs you), the others have no state file (ready to start).
  '/repo/wt/tkt-101/.work/state.json': '{"phase":"planning"}',
}

/** Linear's answers, by query: what the rail asked (each body) is kept in `asked`. */
export function narrowWorld(on: any, files: Record<string, string> = FILES, asked: any[] = [], candidates: unknown[] = CANDIDATES, byKey: unknown[] = BY_KEY) {
  mock.env(on, { TOWER_ROLE: 'rail', TOWER_REPO: '/repo/shopapp', TOWER_PLUGIN_DIR: '/plugins/tower', HOME: '/home/test', TMUX_PANE: '%0', LINEAR_API_KEY: 'lin_api_test' })
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
  on('fs.exists', async (_$: unknown, e: any) => ({ value: e.path in files }))
  on('fs.list', async () => ({ value: [] }))
  on('fs.read', withStoredLinear('/repo/shopapp', async (_$: unknown, e: any) => (e.path in files ? { value: files[e.path] } : { deny: `ENOENT: ${e.path}` })))
  on('http.fetch', async (_$: unknown, e: any) => {
    const body = JSON.parse(e.init?.body ?? '{}')
    asked.push(body)
    const nodes = String(body.query).startsWith('query RailIssues') ? byKey : candidates
    return { value: { ok: true, status: 200, headers: {}, text: JSON.stringify({ data: { issues: { nodes } } }) } }
  })
  on('process.run', async (_$: unknown, e: any) => {
    if (e.argv[0] !== 'tmux') return { value: { exitCode: 0, stdout: e.argv[0] === 'git' && e.argv[1] === 'worktree' ? PORCELAIN : '', stderr: '' } }
    return { value: { exitCode: 0, stdout: e.argv[1] === 'list-panes' ? '%0\t@0\trail\t\t' : '@0', stderr: '' } }
  })
}

test('the narrow rail draws one block per story, its rows indented, and NO STORY last', async ($: any, on: any) => {
  const asked: any[] = []
  narrowWorld(on, FILES, asked)
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 40 } } })
  // Linear's answers come in the background after the session start: wait until TKT-102's story is known.
  for (let tries = 0; tries < 100 && !textLines(await ui.drawn()).some(one => /^ {4}○ TKT-102$/.test(one)); tries++) await new Promise(resolve => (globalThis as any).setTimeout(resolve, 10))
  const lines = textLines(await ui.drawn())
  const at = (text: string) => lines.findIndex(one => one.includes(text))
  // Printing has the `needs you` row (TKT-101, planning): first. TKT-102 is known only by the query by identifier.
  expect(lines[at('▾ TKT-100')]).toBe('▾ TKT-100 Printing sessions · 1/3 done')
  expect(lines[at('TKT-101')]).toMatch(/^ {4}◆ TKT-101$/)
  expect(lines[at('TKT-101') + 1]).toBe('      needs you · say go')
  expect(lines[at('TKT-102')]).toMatch(/^ {4}○ TKT-102$/)
  expect(lines[at('TKT-102') + 2]?.trim()).toBe('')
  expect(lines[at('TKT-102') + 3]).toBe('▾ TKT-200 Billing · 0/1 done')
  expect(lines[at('TKT-201')]).toMatch(/^ {4}○ TKT-201$/)
  // TKT-7 has no story, TKT-9 is not in Linear's answers at all: both under NO STORY, not indented, never under Billing.
  expect(lines[at('TKT-201') + 2]?.trim()).toBe('')
  expect(lines[at('TKT-201') + 3]).toBe('NO STORY')
  expect(lines.slice(at('NO STORY') + 1).filter(one => /TKT-/.test(one))).toEqual(['  ○ TKT-7', '  ○ TKT-9'])
  // The rail asked Linear by identifier for the worktrees the candidates' query did not give; only queries, never a mutation.
  expect(asked.find(body => String(body.query).startsWith('query RailIssues'))?.variables).toEqual({ filter: { or: [{ team: { key: { eq: 'TKT' } }, number: { in: [102, 9] } }] } })
  expect(asked.every(body => /^query /.test(String(body.query)))).toBe(true)
  expect([at('▾ TKT-100'), at('TKT-101'), at('TKT-102'), at('▾ TKT-200'), at('TKT-201'), at('NO STORY'), at('TKT-7'), at('TKT-9')])
    .toEqual([...[at('▾ TKT-100'), at('TKT-101'), at('TKT-102'), at('▾ TKT-200'), at('TKT-201'), at('NO STORY'), at('TKT-7'), at('TKT-9')]].sort((a, b) => a - b))
  await ui.unmount()
})

test('a short rail cuts whole blocks: no header without its first row, `+n more` counts the tickets', async ($: any, on: any) => {
  narrowWorld(on)
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 13 } } })
  // Linear's answers come in the background after the session start: wait until TKT-102's story is known.
  for (let tries = 0; tries < 100 && !textLines(await ui.drawn()).some(one => /^ {4}○ TKT-102$/.test(one)); tries++) await new Promise(resolve => (globalThis as any).setTimeout(resolve, 10))
  const lines = textLines(await ui.drawn())
  const header = lines.findIndex(one => one.startsWith('▾ TKT-200'))
  expect(header).toBeGreaterThan(0)
  expect(lines[header + 1]).toMatch(/TKT-201/)
  expect(lines.some(one => one === 'NO STORY')).toBe(false)
  const more = lines.find(one => /^ {4}\+\d+ more$/.test(one))
  const drawnTickets = lines.filter(one => /^ *[◆○◐✓⊘] TKT-/.test(one)).length
  expect(Number(/\+(\d+)/.exec(more ?? '')?.[1])).toBe(5 - drawnTickets)
  await ui.unmount()
})
