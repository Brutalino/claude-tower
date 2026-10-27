import { expect, mock, test } from 'claude-code/testing'

import { attentionEvents, chimes, dedupeEvents, popupTitle, queuedEvent } from '../hooks/core/attention'
import { freeAttentionRows, freeDetail, freeLineParts, freeSessionRows, newSessionChoices, sessionTitle } from '../hooks/core/freeSessions'
import { sessionSettings } from '../hooks/core/panes'
import { parseStatus } from '../hooks/core/sessionStatus'
import { IN_PROGRESS, REPO, repoGitRail, STATE as REPO_STATE, textLines } from './repoGit'
import { withStoredLinear } from './linearConfig'

// Decision 055: `+ new session` and SESSIONS, in ShopApp's rail and board and in a GitHub repository's: a plain Claude
// session (role `free`, no ticket, no start prompt) in the centre like a ticket's, listed from the shared status files.

const NOW = Date.parse('2026-10-12T12:00:00Z')
const STATE = '/state/tower'
const LISTING_FORMAT = '#{pane_id}\t#{window_id}\t#{@tower_role}\t#{@tower_ticket}\t#{@tower_tag}'
const PORCELAIN = [
  'worktree /repo/shopapp', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
  'worktree /repo/wt/tkt-1650', 'HEAD 2222222222222222222222222222222222222222', 'branch refs/heads/feature/tkt-1650-wrong-invite-path', '',
].join('\n')

/** A free session's status record, alive (written a second ago). */
function freeStatus(key: string, cwd: string, state: 'idle' | 'working', sinceAgoMs: number, title?: string) {
  return { v: 1, id: `sid-${key}`, role: 'free', ticket: key, cwd, pane: null, state, since: NOW - sinceAgoMs, updatedAt: NOW - 1_000, ...(title !== undefined ? { title } : {}) }
}

const SESSIONS = [
  freeStatus('free-0000000a', '/repo/shopapp', 'idle', 12 * 60_000, 'SwiftData vs GRDB'),
  freeStatus('free-0000000b', '/repo/wt/tkt-1650', 'working', 3 * 60_000),
]

test('a free session\'s name, its rows from the status files, the folders + new session offers', () => {
  expect(sessionTitle('  \nSwiftData vs GRDB for 10k rows, which one?\nmore')).toBe('SwiftData vs GRDB for 10k')
  expect(sessionTitle('Compare-the-two-persistence-layers-we-could-use-here please')).toBe('Compare-the-two-persistence-lay…')
  expect(sessionTitle('   ')).toBeNull()
  expect(parseStatus(JSON.stringify(SESSIONS[0]))?.role).toBe('free')
  const worktrees = [{ path: '/repo/shopapp', branch: 'main' }, { path: '/repo/wt/tkt-1650', branch: 'feature/tkt-1650-wrong-invite-path' }]
  const waiting = { ...freeStatus('free-0000000c', '/tmp/notes', 'idle', 60_000), waiting: { kind: 'question', text: 'Which one?', since: NOW - 30_000 } }
  const dead = { ...freeStatus('free-00000001', '/repo/shopapp', 'idle', 0), updatedAt: NOW - 60_000 }
  const rows = freeSessionRows([SESSIONS[1], waiting, dead, SESSIONS[0], { ...SESSIONS[0], role: 'hub' }] as any, NOW, worktrees)
  expect(rows.map(row => [row.key, row.name, row.place, row.state])).toEqual([
    ['free-0000000a', 'SwiftData vs GRDB', 'main', 'idle'],
    ['free-0000000b', 'tkt-1650', 'feature/tkt-1650-wrong-invite-path', 'working'],
    ['free-0000000c', 'notes', 'notes', 'waiting'],
  ])
  expect(freeDetail(rows[0]!, NOW)).toBe('main · 12m')
  // In 40 cells: the name whole, the place cut, the age kept.
  expect(freeLineParts(rows[1]!, NOW, 40)).toEqual({ name: 'tkt-1650', detail: 'feature/tkt-1650-wrong-in… · 3m' })
  expect(freeLineParts({ ...rows[0]!, name: 'A very long first prompt that goes on and on' }, NOW, 30)).toEqual({ name: 'A very long first …', detail: 'main · 12m' })
  expect(newSessionChoices('/repo/shopapp', { label: 'TKT-1650 worktree', path: '/repo/wt/tkt-1650' })).toEqual([
    { key: 'm', label: 'main checkout', path: '/repo/shopapp' },
    { key: 'w', label: 'TKT-1650 worktree', path: '/repo/wt/tkt-1650' },
  ])
  expect(newSessionChoices('/repo/shopapp', { label: 'main', path: '/repo/shopapp' })).toEqual([{ key: 'm', label: 'main checkout', path: '/repo/shopapp' }])
  expect(newSessionChoices('/repo/shopapp', null)).toHaveLength(1)
})

/** ShopApp's rail (or board, wide): one ticket worktree, two live free sessions, a tmux with the rail alone until a split. */
function shopappRail(on: any, parked: string[] = [], sessions: any[] = SESSIONS, written: (path: string, text: string) => void = () => {}, files: Record<string, string> = {}) {
  mock.env(on, { TOWER_ROLE: 'rail', TOWER_REPO: '/repo/shopapp', TOWER_PLUGIN_DIR: '/plugins/tower', HOME: '/home/test', TMUX_PANE: '%0', TOWER_STATE_DIR: STATE })
  on('session.cwd', async () => ({ value: '/repo/shopapp' }))
  mock.clock(on, { now: NOW })
  const tmuxCalls: string[][] = []
  const state = { split: false }
  on('process.run', async (_$: unknown, e: any) => {
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as any
    if (e.argv[0] !== 'tmux') return ok(PORCELAIN)
    if (!e.argv.includes('@tower_mode')) tmuxCalls.push([...e.argv])
    if (e.argv[1] === 'display-message') return ok('@0\n')
    if (e.argv[1] === 'list-panes') return ok(['%0\t@0\trail\t\t', ...parked, ...(state.split ? ['%5\t@0\tfree\tx\tx'] : [])].join('\n') + '\n')
    if (e.argv[1] === 'split-window') {
      state.split = true
      return ok('%5\n')
    }
    return ok('')
  })
  on('fs.list', async (_$: unknown, e: any) => ({ value: e.path === `${STATE}/sessions` ? sessions.map(one => ({ name: `${one.id}.json`, kind: 'file' })) : [] }) as any)
  on('fs.read', withStoredLinear('/repo/shopapp', async (_$: unknown, e: any) => {
    const one = sessions.find(status => e.path === `${STATE}/sessions/${status.id}.json`)
    if (one === undefined && e.path in files) return { value: files[e.path] }
    return one !== undefined ? { value: JSON.stringify(one) } : { deny: `ENOENT: ${e.path}` }
  }))
  on('fs.write', async (_$: unknown, e: any) => {
    written(String(e.path), String(e.text ?? e.content ?? ''))
    return { value: undefined } as any
  })
  return tmuxCalls
}

test('ShopApp\'s rail: + new session at the top, SESSIONS with the live free sessions, then TICKETS', async ($, on) => {
  shopappRail(on)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 } } } as any)
  await ui.press({ key: 'refresh' })
  const lines = textLines(await ui.drawn())
  const at = (text: string) => lines.findIndex(line => line.includes(text))
  expect(at('skills')).toBe(0)
  expect(at('+ new session')).toBe(1)
  expect(at('SESSIONS')).toBe(2)
  expect(lines[3]).toMatch(/^ {2}○ SwiftData vs GRDB +main · 12m$/)
  expect(lines[4]).toMatch(/^ {2}◐ tkt-1650 +feature\/tkt-1650-wrong-in… · 3m$/)
  expect(at('TICKETS')).toBe(5)
  expect(at('TKT-1650')).toBeGreaterThan(5)
  expect((await ui.find({ key: 'new-session' }))?.props.hotkey).toBe('o')
  // The Button names the session and holds its row, name and detail (the engine's focus inverse is the bar).
  expect((await ui.find({ key: 'free:free-0000000a' }))?.props.label).toBe('SwiftData vs GRDB')
  expect((await ui.find({ key: 'free:free-0000000a' }))?.text).toMatch(/^SwiftData vs GRDB +main · 12m$/)
  await ui.unmount()
})

test('ShopApp\'s rail: a new session starts on the routing view\'s `new session` row (decision 056)', async ($, on) => {
  const routing = { [`${STATE}/routing/-repo-shopapp.json`]: JSON.stringify({ free: { model: 'opus', effort: 'high' } }) }
  const tmuxCalls = shopappRail(on, [], SESSIONS, () => {}, routing)
  on('ui.focus', async () => ({}) as any)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 } } } as any)
  await ui.press({ key: 'refresh' })
  await ui.press({ key: 'new-session' })
  tmuxCalls.length = 0
  await ui.press({ key: 'new-session:m' })
  const split = tmuxCalls.find(argv => argv[1] === 'split-window')!
  // An old short key (decision 056) launches as its full id (decision 057).
  expect(split).toContain('TOWER_MAIN_MODEL=claude-opus-5-5')
  expect(split).toContain('TOWER_MAIN_EFFORT=high')
  expect(split.slice(split.indexOf('claude'))).toEqual([
    'claude', '--plugin-dir', '/plugins/tower', '--model', 'claude-opus-5-5', '--effort', 'high', '--settings', sessionSettings({ role: 'free', pluginDir: '/plugins/tower', theme: 'claude' }),
  ])
  await ui.unmount()
})

test('ShopApp\'s rail: o asks the folder (the main checkout first, then the focused worktree); m opens a plain session in the centre', async ($, on) => {
  const tmuxCalls = shopappRail(on)
  on('ui.focus', async () => ({}) as any)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 } } } as any)
  await ui.press({ key: 'refresh' })
  await $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element: 'row:TKT-1650', origin: { kind: 'person' } } as any)
  await ui.press({ key: 'new-session' })
  let lines = textLines(await ui.drawn())
  expect(lines[1]).toMatch(/^new session in +cancel$/)
  expect((await ui.find({ key: 'new-session:m' }))?.text).toBe('main checkout')
  expect((await ui.find({ key: 'new-session:m' }))?.props.hotkey).toBe('m')
  expect((await ui.find({ key: 'new-session:w' }))?.text).toBe('TKT-1650 worktree')
  // o again: the question goes.
  await ui.press({ key: 'new-session' })
  expect(await ui.find({ key: 'new-session:m' })).toBeUndefined()
  await ui.press({ key: 'new-session' })
  tmuxCalls.length = 0
  await ui.press({ key: 'new-session:m' })
  const split = tmuxCalls.find(argv => argv[1] === 'split-window')!
  const key = split.find(arg => arg.startsWith('TOWER_TICKET='))!.slice('TOWER_TICKET='.length)
  expect(key).toMatch(/^free-[0-9a-f]{8}$/)
  const tag = split.find(arg => arg.startsWith('TOWER_TAG='))!.slice('TOWER_TAG='.length)
  // A plain claude: no --continue, no model, no prompt.
  expect(split.slice(8)).toEqual([
    '-c', '/repo/shopapp', '-e', 'TOWER_ROLE=free', '-e', `TOWER_TICKET=${key}`, '-e', 'TOWER_REPO=/repo/shopapp', '-e', 'TOWER_PLUGIN_DIR=/plugins/tower',
    '-e', `TOWER_TAG=${tag}`, '-e', `TOWER_STATE_DIR=${STATE}`, '-e', 'CLAUDE_CODE_TMUX_TRUECOLOR=1', '-e', 'COLORTERM=truecolor',
    'claude', '--plugin-dir', '/plugins/tower', '--settings', sessionSettings({ role: 'free', pluginDir: '/plugins/tower', theme: 'claude' }),
  ])
  expect(tmuxCalls).toContainEqual(['tmux', 'set-option', '-p', '-t', '%5', '@tower_role', 'free'])
  expect(tmuxCalls).toContainEqual(['tmux', 'set-option', '-p', '-t', '%5', '@tower_title', 'session · /repo/shopapp'])
  expect(tmuxCalls).toContainEqual(['tmux', 'set-option', '-p', '-t', '%5', '@tower_ticket', key])
  // The question is gone once the session opened.
  lines = textLines(await ui.drawn())
  expect(lines[1]).toContain('+ new session')
  await ui.unmount()
})

test('ShopApp\'s rail: ↵ on a free session brings its parked pane to the centre', async ($, on) => {
  const tmuxCalls = shopappRail(on, ['%7\t@3\tfree\tfree-0000000a\tfree-77777777'])
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 } } } as any)
  await ui.press({ key: 'refresh' })
  tmuxCalls.length = 0
  await ui.press({ key: 'free:free-0000000a' })
  expect(tmuxCalls).toContainEqual(['tmux', 'join-pane', '-h', '-s', '%7', '-t', '%0'])
  expect(tmuxCalls.some(argv => argv[1] === 'split-window')).toBe(false)
  await ui.unmount()
})

test('ShopApp\'s board: + new session and SESSIONS on the row under the header', async ($, on) => {
  shopappRail(on)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 140, scroll: { bodyRows: 40 } } } as any)
  await ui.press({ key: 'refresh' })
  const lines = textLines(await ui.drawn())
  expect(lines[0]).toContain('TOWER')
  expect(lines[2]).toMatch(/^\+ new session {3}SESSIONS {2}○ SwiftData vs GRDB · main · 12m {3}◐ tkt-1650 · feature\/tkt-1650-wrong-invite-path · 3m$/)
  expect(await ui.find({ key: 'free:free-0000000b' })).toBeDefined()
  // The four columns are still there.
  expect(lines.join('\n')).toMatch(/needs you \d/)
  await ui.unmount()
})

for (const columns of [44, 140]) {
  test(`the oink-like ${columns === 44 ? 'rail' : 'board'}: + new session and SESSIONS above IN PROGRESS; the folder asked offers #26's worktree`, async ($, on) => {
    const status = freeStatus('free-0000000a', REPO, 'idle', 12 * 60_000, 'SwiftData vs GRDB')
    const calls = repoGitRail(on, { files: { [`${REPO_STATE}/sessions/${status.id}.json`]: JSON.stringify(status) }, sessions: [`${status.id}.json`] })
    await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as any)
    const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: columns, scroll: { bodyRows: 30 } } } as any)
    await ui.press({ key: 'refresh' })
    let lines = textLines(await ui.drawn())
    const at = (text: string) => lines.findIndex(line => line.includes(text))
    expect(lines[0]).toContain('fixture/oink · main')
    expect(at('+ new session')).toBeGreaterThan(0)
    expect(at('+ new session')).toBeLessThan(at('SESSIONS'))
    expect(lines[at('SESSIONS') + 1]).toMatch(/○ SwiftData vs GRDB +main · 12m *(│|$)/)
    expect(at('SESSIONS')).toBeLessThan(at('IN PROGRESS'))
    await ui.press({ key: 'new-session' })
    expect((await ui.find({ key: 'new-session:m' }))?.text).toBe('main checkout')
    expect((await ui.find({ key: 'new-session:w' }))?.text).toBe('#26 worktree')
    calls.tmux.length = 0
    await ui.press({ key: 'new-session:w' })
    const split = calls.tmux.find(argv => argv[1] === 'split-window')!
    expect(split.slice(8, 12)).toEqual(['-c', IN_PROGRESS, '-e', 'TOWER_ROLE=free'])
    lines = textLines(await ui.drawn())
    expect(lines.join('\n')).not.toContain('new session in')
    await ui.unmount()
  })
}

test('a free session: the flightdeck without ticket boxes, no PR read, its name from the first prompt in its status file', async ($, on) => {
  mock.env(on, { TOWER_ROLE: 'free', TOWER_TICKET: 'free-0000000a', TOWER_REPO: '/repo/shopapp', HOME: '/home/test', TOWER_STATE_DIR: STATE })
  mock.clock(on, { now: NOW })
  mock.store(on)
  const written: { path: string; text: string }[] = []
  const argv: string[][] = []
  on('session.cwd' as any, async () => ({ value: '/repo/shopapp' }) as any)
  on('session.id' as any, async () => ({ value: 'sid-free' }) as any)
  on('fs.write', async (_$: unknown, e: any) => {
    written.push({ path: e.path, text: e.text ?? e.content ?? '' })
    return { value: undefined } as any
  })
  on('fs.read', withStoredLinear('/repo/shopapp', async (_$: unknown, e: any) => ({ deny: `ENOENT: ${e.path}` }) as any))
  on('process.run', async (_$: unknown, e: any) => {
    argv.push([...e.argv])
    return { value: { exitCode: 0, stdout: e.argv[0] === 'git' && e.argv[1] === 'worktree' ? PORCELAIN : '', stderr: '' } } as any
  })
  on('prompt.submit', async (_$: unknown, e: any) => ({ text: e.text }) as any)
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('session.start', async (_$: unknown, e: any) => e)
  on('command.register' as any, async () => ({ value: undefined }) as any)
  await $.session.start({ cwd: '/repo/shopapp', surface: 'terminal', isInteractive: true } as any)
  await $.prompt.submit({ text: 'SwiftData vs GRDB for 10k rows, which one?', wait: false, origin: { kind: 'composer' } } as any)
  await $.turn.start({ text: 'SwiftData vs GRDB for 10k rows, which one?', turnId: 't1' })
  const statuses = written.filter(one => one.path === `${STATE}/sessions/sid-free.json`).map(one => JSON.parse(one.text))
  expect(statuses.length).toBeGreaterThan(0)
  expect(statuses[0]).toMatchObject({ role: 'free', ticket: 'free-0000000a', cwd: '/repo/shopapp' })
  expect(statuses[0].title).toBeUndefined()
  expect(statuses.at(-1).title).toBe('SwiftData vs GRDB for 10k')
  // No ticket step and no ticket documents: no pull request asked, no .work/ searched.
  expect(argv.some(one => one[0] === 'gh' || one[0] === 'find')).toBe(false)
  const deck = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'deck', props: { bodyColumns: 66, scroll: { bodyRows: 40 } } } as any)
  const text = textLines(await deck.drawn()).join('\n')
  expect(text).toContain('no agent has started in this session')
  expect(text).not.toMatch(/DEV-ENV|REVIEW|PR #/)
  await deck.unmount()
})

test('a free session\'s wait as the rail\'s attention: needs you · question by its name, chimes, once per wait', () => {
  const worktrees = [{ path: '/repo/shopapp', branch: 'main' }]
  const waiting = (since: number) => ({ ...freeStatus('free-0000000a', '/repo/shopapp', 'idle', 60_000, 'SwiftData vs GRDB'), waiting: { kind: 'question', text: 'Which one?', since } })
  const idle = freeAttentionRows(freeSessionRows([SESSIONS[0]] as any, NOW, worktrees))
  const asks = freeAttentionRows(freeSessionRows([waiting(NOW - 30_000)] as any, NOW, worktrees))
  expect(idle.cleared.has('free-0000000a')).toBe(true)
  expect(asks.rows).toEqual([{ key: 'free-0000000a', label: 'SwiftData vs GRDB', group: 'needs you', glyph: '◆', status: 'needs you · question' }])
  // A wait shorter than a real one (auto mode answers most) is no wait.
  expect(freeAttentionRows(freeSessionRows([waiting(NOW - 2_000)] as any, NOW, worktrees)).rows[0]?.group).toBe('working')
  const events = attentionEvents(idle.rows, asks.rows, null)
  expect(events).toEqual([{ key: 'free-0000000a', kind: 'needs you', text: '◆ SwiftData vs GRDB needs you · question', hint: 'question', asset: 'assets/needs-you.wav', label: 'SwiftData vs GRDB' }])
  expect(chimes(events[0]!)).toBe(true)
  const queued = queuedEvent(events[0]!, NOW, 'question · Which one?')
  expect(popupTitle(queued)).toBe('◆ SwiftData vs GRDB needs you')
  // Once per reason while it waits; the wait over (cleared), the next question announces again.
  const first = dedupeEvents(events, {}, asks.rows, NOW, asks.cleared)
  expect(first.events).toHaveLength(1)
  expect(dedupeEvents(events, first.announced, asks.rows, NOW, asks.cleared).events).toHaveLength(0)
  const after = dedupeEvents([], first.announced, idle.rows, NOW, idle.cleared)
  expect(dedupeEvents(events, after.announced, asks.rows, NOW, asks.cleared).events).toHaveLength(1)
  // In the centre: the chime only.
  expect(attentionEvents(idle.rows, asks.rows, 'free-0000000a')[0]?.centre).toBe(true)
})

test('the rail announces a free session\'s wait: one popup in the queue with its name and wait, one chime; again only after the wait ended', async ($, on) => {
  const sessions: any[] = [freeStatus('free-000000ff', '/repo/shopapp', 'working', 60_000, 'Plan the migration')]
  const queues: any[] = []
  shopappRail(on, [], sessions, (path, text) => { if (path.startsWith(`${STATE}/attention-`)) queues.push(JSON.parse(text)) })
  mock.store(on)
  const plays: string[] = []
  on('audio.play', async (_$: unknown, e: any) => {
    plays.push(e.clip?.asset ?? e.asset)
    return { value: undefined } as any
  })
  // The board (its `r: refresh` stays drawn) reloads the rail and announces on each press.
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 140, scroll: { bodyRows: 40 } } } as any)
  await ui.press({ key: 'refresh' })
  const wait = (since: number) => { sessions[0] = { ...sessions[0], state: 'idle', waiting: { kind: 'permission', text: 'Bash rm -rf build', since } } }
  wait(NOW - 30_000)
  await ui.press({ key: 'refresh' })
  expect(plays).toEqual(['assets/needs-you.wav'])
  expect(queues.at(-1)?.at(-1)).toMatchObject({ ticket: 'free-000000ff', kind: 'needs', label: 'Plan the migration', text: 'permission · Bash rm -rf build' })
  // Still waiting: nothing more.
  await ui.press({ key: 'refresh' })
  expect(plays).toHaveLength(1)
  // The wait answered, then another one: announced again.
  sessions[0] = { ...sessions[0], state: 'working', waiting: undefined }
  await ui.press({ key: 'refresh' })
  wait(NOW - 15_000)
  await ui.press({ key: 'refresh' })
  expect(plays).toHaveLength(2)
  await ui.unmount()
})
