import { expect, mock, test } from 'claude-code/testing'
import { sessionSettings } from '../hooks/core/panes'
import { withStoredLinear } from './linearConfig'

const NOW = 1_000_000
const PORCELAIN = [
  'worktree /repo/shopapp', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
  'worktree /repo/wt/tkt-11', 'HEAD 2222222222222222222222222222222222222222', 'branch refs/heads/me/tkt-11-skills', '',
].join('\n')
const SESSIONS = '/home/test/.claude/tower/sessions'
const TKT_11_PROJECT = '/home/test/.claude/projects/-repo-wt-tkt-11'
const RAIL_ENV = { TOWER_ROLE: 'rail', TOWER_REPO: '/repo/shopapp', TOWER_PLUGIN_DIR: '/plugins/tower', HOME: '/home/test', TMUX_PANE: '%0' }
const COMMANDS = [
  { name: 'shape', description: 'Test stand-in for the shape skill.', source: 'user' },
  { name: 'echo-test', description: 'Test skill. Replies with a fixed word.', source: 'user' },
  { name: 'mine', description: 'A personal skill.', source: 'user' },
  { name: 'compact', description: 'Built in', source: 'builtin' },
  { name: 'deck', description: 'The deck', source: 'plugin', plugin: 'tower' },
]
const status = (id: string, role: string, ticket: string, state = 'idle') =>
  JSON.stringify({ v: 1, id, role, ticket, cwd: '/x', pane: null, state, since: NOW - 5_000, updatedAt: NOW - 1_000 })

/** A session's engine: commands listed and run, receives passed through, files and tmux faked. */
function engine(on: any, env: Record<string, string>, files: Record<string, string> = {}, centre = '', earlier: string[] = [], other: Record<string, string> = {}) {
  mock.env(on, env)
  if (env.TOWER_ROLE === 'rail') on('session.cwd', async () => ({ value: '/repo/shopapp' }))
  mock.clock(on, { now: NOW })
  const seen = { runs: [] as any[], passed: [] as string[], sends: [] as any[], tmux: [] as string[][] }
  on('command.list', async () => ({ value: COMMANDS }))
  on('command.run', async (_$: unknown, e: any) => {
    seen.runs.push({ command: e.command, args: e.args })
    return { value: {} }
  })
  on('session.receive', async (_$: unknown, e: any) => {
    seen.passed.push(e.text)
    return { text: e.text }
  })
  on('session.send', async (_$: unknown, e: any) => {
    seen.sends.push({ to: e.to, text: e.text })
    return { isDelivered: true }
  })
  on('fs.write', async () => ({ value: undefined }))
  // Only echo-test belongs to the repository; `mine` is a personal skill.
  on('fs.exists', async (_$: unknown, e: any) => ({ value: e.path.endsWith('/.claude/skills/echo-test/SKILL.md') }))
  on('fs.list', async (_$: unknown, e: any) => {
    if (e.path === SESSIONS) return { value: Object.keys(files).map(name => ({ name, kind: 'file' })) }
    if (e.path === TKT_11_PROJECT) return { value: earlier.map(name => ({ name, kind: 'file' })) }
    return { value: [] }
  })
  on('fs.read', withStoredLinear('/repo/shopapp', async (_$: unknown, e: any) => {
    const name = e.path.startsWith(`${SESSIONS}/`) ? e.path.slice(SESSIONS.length + 1) : null
    if (name === null && other[e.path] !== undefined) return { value: other[e.path] }
    return name !== null && files[name] !== undefined ? { value: files[name] } : { deny: `ENOENT: ${e.path}` }
  }))
  on('process.run', async (_$: unknown, e: any) => {
    if (e.argv[0] !== 'tmux') return { value: { exitCode: 0, stdout: PORCELAIN, stderr: '' } }
    seen.tmux.push([...e.argv])
    const out = e.argv[1] === 'display-message' ? '@0' : e.argv[1] === 'list-panes' ? `%0\t@0\trail\t\t${centre}` : e.argv[1] === 'split-window' ? '%5' : ''
    return { value: { exitCode: 0, stdout: out, stderr: '' } }
  })
  return seen
}

const TICKET_ENV = { TOWER_ROLE: 'ticket', TOWER_TICKET: 'TKT-11', HOME: '/home/test' }
const peer = (text: string) => ({ origin: { kind: 'peer', plugin: 'tower' }, text: `<cross-session-message from="r">\n${text}\n</cross-session-message>` })

test('a ticket session runs a known command it receives and consumes it', async ($: any, on: any) => {
  const seen = engine(on, TICKET_ENV)
  const result = await $.session.receive(peer('TOWER1 {"command":"echo-test","args":"hi"}'))
  expect(result).toEqual({ consumed: 'tower' })
  expect(seen.runs).toEqual([{ command: 'echo-test', args: 'hi' }])
  expect(seen.passed).toEqual([])
})

test('an unknown command is consumed and not run; other text passes untouched', async ($: any, on: any) => {
  const seen = engine(on, TICKET_ENV)
  expect(await $.session.receive(peer('TOWER1 {"command":"nope"}'))).toEqual({ consumed: 'tower' })
  expect(seen.runs).toEqual([])
  const plain = peer('please look at the logs')
  expect(await $.session.receive(plain)).toEqual({ text: plain.text })
  expect(seen.passed).toEqual([plain.text])
})

test('an tower command is consumed even when the hook fails; other text passes', async ($: any, on: any) => {
  const seen = { runs: [] as any[] }
  on('env.get', async () => ({ deny: 'env unavailable' }))
  on('command.run', async (_$: unknown, e: any) => {
    seen.runs.push(e.command)
    return { value: {} }
  })
  on('session.receive', async (_$: unknown, e: any) => ({ text: e.text }))
  expect(await $.session.receive(peer('TOWER1 {"command":"echo-test"}'))).toEqual({ consumed: 'tower' })
  const plain = peer('please look at the logs')
  expect(await $.session.receive(plain)).toEqual({ text: plain.text })
  expect(seen.runs).toEqual([])
})

/** The rail pane, switched to the launcher with its `skills` Button. */
async function railWithLauncher($: any, on: any, files: Record<string, string> = {}, centre = '', earlier: string[] = [], props: any = { bodyColumns: 40 }) {
  const seen = engine(on, RAIL_ENV, files, centre, earlier)
  const rail = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props })
  await rail.press({ key: 'refresh' })
  await rail.press({ key: 'skills' })
  return { seen, rail, skills: rail }
}

test('the skills Button turns the rail into the launcher, and back returns to the list with the filter cleared', async ($: any, on: any) => {
  const { rail } = await railWithLauncher($, on)
  expect(await rail.find({ key: 'filter' })).toBeDefined()
  expect(await rail.find({ key: 'row:TKT-11' })).toBeUndefined()
  expect(await rail.find({ key: 'skills' })).toBeUndefined()
  await rail.input({ key: 'filter', text: 'ECHO', kind: 'change' })
  await rail.press({ key: 'back' })
  expect(await rail.find({ key: 'row:TKT-11' })).toBeDefined()
  expect(await rail.find({ key: 'filter' })).toBeUndefined()
  await rail.press({ key: 'skills' })
  expect(await rail.find({ key: 'skill:shape' })).toBeDefined()
})

test('in the wide layout the launcher takes the list column and the detail stays', async ($: any, on: any) => {
  const { rail } = await railWithLauncher($, on, {}, '\n%1\t@0\tticket\tTKT-11\t', [], { bodyColumns: 120 })
  expect(await rail.find({ key: 'filter' })).toBeDefined()
  expect(await rail.find({ type: 'Text', text: /^phase$/ })).toBeDefined()
})

test('in a short narrow pane the launcher draws only the rows that fit', async ($: any, on: any) => {
  const { rail } = await railWithLauncher($, on, {}, '', [], { bodyColumns: 40, scroll: { bodyRows: 7 } })
  expect(await rail.find({ key: 'skill:shape' })).toBeDefined()
  expect(await rail.find({ key: 'skill:echo-test' })).toBeUndefined()
  expect(await rail.find({ key: 'back' })).toBeDefined()
})

test('the launcher lists the profile skills here, then the other ones, and filters', async ($: any, on: any) => {
  const { skills } = await railWithLauncher($, on)
  expect(await skills.find({ type: 'Text', text: /^for no ticket$/ })).toBeDefined()
  expect((await skills.find({ key: 'skill:shape' }))?.text).toContain('/shape')
  expect(await skills.find({ key: 'skill:echo-test' })).toBeDefined()
  expect(await skills.find({ type: 'Text', text: /other skills here/ })).toBeDefined()
  expect(await skills.find({ key: 'skill:open-pr' })).toBeUndefined()
  expect(await skills.find({ key: 'skill:mine' })).toBeUndefined()
  expect(await skills.find({ key: 'skill:compact' })).toBeUndefined()
  expect(await skills.find({ key: 'skill:deck' })).toBeUndefined()
  await skills.input({ key: 'filter', text: 'ECHO', kind: 'change' })
  expect(await skills.find({ key: 'skill:shape' })).toBeUndefined()
  expect(await skills.find({ key: 'skill:echo-test' })).toBeDefined()
})

test('launching a hub skill starts its session in the main checkout', async ($: any, on: any) => {
  const { seen, skills } = await railWithLauncher($, on)
  seen.tmux.length = 0
  await skills.press({ key: 'skill:shape' })
  const split = seen.tmux.find(argv => argv[1] === 'split-window') ?? []
  const tag = split.find(arg => arg.startsWith('TOWER_TAG='))?.slice('TOWER_TAG='.length) ?? ''
  expect(tag).toMatch(/^hub-[0-9a-f]{8}$/)
  expect(split).toEqual([
    'tmux', 'split-window', '-h', '-t', '%0', '-P', '-F', '#{pane_id}',
    '-c', '/repo/shopapp',
    '-e', 'TOWER_ROLE=hub', '-e', 'TOWER_TICKET=shape',
    '-e', 'TOWER_REPO=/repo/shopapp', '-e', 'TOWER_PLUGIN_DIR=/plugins/tower', '-e', `TOWER_TAG=${tag}`,
    '-e', 'TOWER_MAIN_MODEL=claude-fable-5-1', '-e', 'TOWER_MAIN_EFFORT=xhigh',
    '-e', 'CLAUDE_CODE_TMUX_TRUECOLOR=1', '-e', 'COLORTERM=truecolor',
    'claude', '--plugin-dir', '/plugins/tower', '--model', 'claude-fable-5-1', '--effort', 'xhigh',
    '--settings', sessionSettings({ role: 'hub', pluginDir: '/plugins/tower', theme: 'claude' }), '/shape',
  ])
  expect(seen.tmux).toContainEqual(['tmux', 'set-option', '-p', '-t', '%5', '@tower_role', 'hub'])
  expect(seen.tmux).toContainEqual(['tmux', 'set-option', '-p', '-t', '%5', '@tower_ticket', 'shape'])
  expect(await skills.find({ key: 'row:TKT-11' })).toBeDefined()
  expect(await skills.find({ key: 'filter' })).toBeUndefined()
})

test('a hub skill starts on the routing file as it is at launch, written after the launcher opened (decision 056)', async ($: any, on: any) => {
  const other: Record<string, string> = {}
  const seen = engine(on, RAIL_ENV, {}, '', [], other)
  const rail = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 40 } })
  await rail.press({ key: 'refresh' })
  await rail.press({ key: 'skills' })
  // Another session's deck changes /shape (fable · xhigh on the table) while this launcher is open.
  other['/home/test/.claude/tower/routing/-repo-shopapp.json'] = JSON.stringify({ skills: { shape: { model: 'sonnet', effort: null } } })
  seen.tmux.length = 0
  await rail.press({ key: 'skill:shape' })
  const split = seen.tmux.find(argv => argv[1] === 'split-window') ?? []
  expect(split).not.toContain('TOWER_MAIN_EFFORT=xhigh')
  expect(split).toContain('TOWER_MAIN_MODEL=claude-sonnet-5-5')
  expect(split.slice(split.indexOf('claude'))).toEqual([
    'claude', '--plugin-dir', '/plugins/tower', '--model', 'claude-sonnet-5-5',
    '--settings', sessionSettings({ role: 'hub', pluginDir: '/plugins/tower', theme: 'claude' }), '/shape',
  ])
})

test('a skill started for a ticket without a live session resumes its earlier conversation', async ($: any, on: any) => {
  const seen = engine(on, RAIL_ENV, {}, '', ['abc.jsonl'])
  on('ui.focus', async () => ({}))
  const rail = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 40 } })
  await rail.press({ key: 'refresh' })
  // The kit has no focus act: raise ui.focus as the engine does for the person's Down onto row TKT-11.
  await $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element: 'row:TKT-11', origin: { kind: 'person' } } as any)
  await rail.press({ key: 'skills' })
  expect(await rail.find({ type: 'Text', text: /^for TKT-11$/ })).toBeDefined()
  seen.tmux.length = 0
  await rail.press({ key: 'skill:echo-test' })
  const argv = seen.tmux.find(args => args.includes('claude')) ?? []
  expect(argv.slice(argv.indexOf('claude'))).toEqual(['claude', '--plugin-dir', '/plugins/tower', '--continue', '--settings', sessionSettings({ role: 'ticket', pluginDir: '/plugins/tower', theme: 'claude' }), '/echo-test'])
})

test('launching a skill for a ticket with a live session sends it over the bus', async ($: any, on: any) => {
  // TKT-11 in the centre makes it the launcher's ticket.
  const { seen, skills } = await railWithLauncher($, on, { 's-11.json': status('sess-11', 'ticket', 'TKT-11') }, '\n%1\t@0\tticket\tTKT-11\t')
  expect(await skills.find({ type: 'Text', text: /^for TKT-11$/ })).toBeDefined()
  await skills.press({ key: 'skill:echo-test' })
  // The hook sees the `to: { sessionId }` of the call as the bare id.
  expect(seen.sends).toEqual([{ to: 'sess-11', text: 'TOWER1 {"command":"echo-test"}' }])
})

test('the rail lists a live hub session under other sessions', async ($: any, on: any) => {
  const { rail } = await railWithLauncher($, on, { 'h.json': status('sess-h', 'hub', 'shape', 'working') })
  await rail.press({ key: 'back' })
  expect(await rail.find({ type: 'Text', text: /^other sessions$/ })).toBeDefined()
  expect((await rail.find({ key: 'hub:shape' }))?.text).toContain('/shape')
  expect(await rail.find({ type: 'Text', text: /main checkout/ })).toBeDefined()
})

test('a test launch hands its state folder and its silence on to the sessions it starts', async ($: any, on: any) => {
  const seen = engine(on, { ...RAIL_ENV, TOWER_STATE_DIR: '/plugin/.smoke/state', TOWER_MUTE: '1' })
  const rail = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 40 } })
  await rail.press({ key: 'refresh' })
  await rail.press({ key: 'skills' })
  seen.tmux.length = 0
  await rail.press({ key: 'skill:shape' })
  const split = seen.tmux.find(argv => argv[1] === 'split-window') ?? []
  expect(split.join(' ')).toContain('-e TOWER_STATE_DIR=/plugin/.smoke/state -e TOWER_MUTE=1')
})
