import { expect, mock, test } from 'claude-code/testing'

import { newDesignState } from '../hooks/core/design'
import { textLines } from './repoGit'

// Decision 064: a design Tower (TOWER_MODE=design, socket tower-<slug>): the rail draws the path of `.tower/design.json`,
// `+ new session · + prototype` and SESSIONS; its design session opens at launch on /tower:tower-design and ↵ on a stage
// brings it back; `+ prototype` opens a free session in spikes/<nn>-<slug>/; the deck adds DOCUMENTS and OPEN QUESTIONS.

const HOME = '/home/test'
const STATE = '/state/tower'
const SOCKET = 'tower-budget-app'
const FOLDER = `${HOME}/Repositories/budget-app`
const DESIGN_FILE = `${FOLDER}/.tower/design.json`
const NOW = Date.parse('2026-10-13T12:00:00Z')

/** Stage 1 done, stage 2 (research) active with its open questions. */
function atResearch(questions: string[]): string {
  const state = newDesignState()
  state.current = 2
  state.stages[0]!.status = 'done'
  state.stages[1]!.status = 'active'
  state.stages[1]!.openQuestions = questions.map((text, i) => ({ id: `q${i + 1}`, text }))
  return JSON.stringify(state)
}

type World = { design: string | null; mtime: number; statuses: object[]; panes: string; exists: Set<string>; spikes: string[] }
type Calls = { argv: string[][]; tmux: string[][]; reads: string[]; fetches: number }

function designWorld(on: any, env: Record<string, string>, world: World): Calls {
  mock.env(on, { TOWER_MODE: 'design', TOWER_REPO: FOLDER, TOWER_PLUGIN_DIR: '/plugins/tower', HOME, TMUX_PANE: '%0', TOWER_STATE_DIR: STATE,
    TOWER_TMUX_SOCKET: SOCKET, LINEAR_API_KEY: 'lin_never_used', ...env })
  mock.store(on)
  const calls: Calls = { argv: [], tmux: [], reads: [], fetches: 0 }
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.id', async () => ({ value: 'sid-1' }))
  on('session.cwd' as any, async () => ({ value: FOLDER }) as any)
  on('command.register' as any, async () => ({ value: undefined }) as any)
  on('command.list', async () => ({ value: [] }) as any)
  on('ui.focus', async () => ({}))
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.exists', async (_$: unknown, e: any) => ({ value: world.exists.has(e.path) }) as any)
  on('fs.stat' as any, async (_$: unknown, e: any) => (e.path === DESIGN_FILE && world.design !== null
    ? { value: { kind: 'file', size: world.design.length, mtimeMs: world.mtime, isLink: false } }
    : { deny: `ENOENT: ${e.path}` }) as any)
  on('fs.list', async (_$: unknown, e: any) => {
    const file = (name: string) => ({ name, kind: 'file', size: 1, mtimeMs: NOW, isLink: false })
    if (e.path === `${STATE}/sessions`) return { value: world.statuses.map((_, i) => file(`s${i}.json`)) } as any
    if (e.path === `${FOLDER}/spikes`) return { value: world.spikes.map(name => ({ ...file(name), kind: 'dir' })) } as any
    return { value: [] } as any
  })
  on('fs.read', async (_$: unknown, e: any) => {
    calls.reads.push(e.path)
    if (e.path === DESIGN_FILE && world.design !== null) return { value: world.design } as any
    const status = /\/sessions\/s(\d+)\.json$/.exec(e.path)
    if (status !== null && world.statuses[Number(status[1])] !== undefined) return { value: JSON.stringify(world.statuses[Number(status[1])]) } as any
    return { deny: `ENOENT: ${e.path}` } as any
  })
  on('http.fetch', async () => {
    calls.fetches += 1
    return { deny: 'no network in tests' } as any
  })
  on('process.run', async (_$: unknown, e: any) => {
    const argv: string[] = [...e.argv]
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as any
    if (argv[0] === 'tmux') {
      calls.tmux.push(argv)
      const command = argv[3]
      return ok(command === 'display-message' ? '@0' : command === 'list-panes' ? world.panes : command === 'split-window' || command === 'new-window' ? '%5' : '')
    }
    calls.argv.push(argv)
    if (argv[0] === 'mkdir') return ok('')
    return { value: { exitCode: 1, stdout: '', stderr: 'not here' } } as any
  })
  return calls
}

async function startRail($: any) {
  await $.session.start({ cwd: FOLDER, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 } } })
  await ui.press({ key: 'refresh' })
  return ui
}

function opens(calls: Calls): string[][] {
  return calls.tmux.filter(argv => argv.includes('TOWER_ROLE=free'))
}

test('a design Tower: the path, + new session · + prototype; its design session opened at launch on /tower:tower-design; no git, gh or Linear', async ($: any, on: any) => {
  mock.clock(on, { now: NOW })
  const calls = designWorld(on, { TOWER_ROLE: 'rail' }, { design: atResearch(['Who pays?', 'iOS only?', 'Offline first?']), mtime: NOW, statuses: [], panes: '%0\t@0\trail\t\t', exists: new Set(), spikes: [] })
  const ui = await startRail($)
  const lines = textLines(await ui.drawn())
  const text = lines.join('\n')
  expect(text).toContain('new project · ~/Repositories/budget-app')
  expect(lines.some(line => /✓ 1 Idea\s+docs\/IDEA\.md/.test(line))).toBe(true)
  expect(lines.some(line => /▶ ◆ 2 Research\s+3 open questions/.test(line))).toBe(true)
  expect(lines.some(line => /○ 5 Architecture\s+docs\/ARCHITECTURE\.md/.test(line))).toBe(true)
  expect(lines.some(line => /○ 6 Design\s+design canvas/.test(line))).toBe(true)
  expect(lines.some(line => /○ 8 Setup/.test(line))).toBe(true)
  expect(text).toContain('+ new session')
  expect(text).toContain('+ prototype')
  expect(text).not.toMatch(/ · free|IN PROGRESS|OPEN ISSUES|skills|board/)
  expect(calls.argv.filter(argv => argv[0] === 'git' || argv[0] === 'gh')).toEqual([])
  expect(calls.fetches).toBe(0)
  // The design session: a free session in the folder, in design mode, its key design-<hex>, its first prompt the skill.
  const opened = opens(calls)
  expect(opened.length).toBe(1)
  expect(opened[0]).toContain('TOWER_MODE=design')
  expect(opened[0]).toContain(`TOWER_TMUX_SOCKET=${SOCKET}`)
  expect(opened[0]!.find(arg => arg.startsWith('TOWER_TICKET='))).toMatch(/^TOWER_TICKET=design-[0-9a-f]{8}$/)
  expect(opened[0]![opened[0]!.indexOf('-c') + 1]).toBe(FOLDER)
  expect(opened[0]!.at(-1)).toBe('/tower:tower-design')
  // Every free Tower's routing file, never a project's.
  expect(calls.reads.filter(path => path.includes('/routing/'))).toEqual(calls.reads.filter(path => path === `${STATE}/routing/free.json`))
  await ui.unmount()
})

test('↵ on a stage brings the running design session to the centre; none running, a new one; the file re-read only when its time changes', async ($: any, on: any) => {
  const clock = mock.clock(on, { now: NOW })
  const design = { v: 1, id: 'sid-design', role: 'free', ticket: 'design-0000000a', cwd: FOLDER, pane: null, state: 'idle', since: NOW - 60_000, updatedAt: NOW - 1_000, socket: SOCKET }
  const world: World = { design: atResearch(['Who pays?']), mtime: NOW - 5_000, statuses: [design], panes: '%0\t@0\trail\t\t\n%3\t@1\tfree\tdesign-0000000a\t', exists: new Set(), spikes: [] }
  const calls = designWorld(on, { TOWER_ROLE: 'rail' }, world)
  const ui = await startRail($)
  // A design session runs: none opened at launch, it is listed under SESSIONS.
  expect(opens(calls)).toEqual([])
  expect(textLines(await ui.drawn()).join('\n')).toContain('SESSIONS')
  await ui.press({ key: 'stage:4' })
  expect(calls.tmux.some(argv => argv.includes('join-pane') && argv.includes('%3'))).toBe(true)
  expect(opens(calls)).toEqual([])
  // The 2 s check stats the file and reads it only after it changed.
  const reads = () => calls.reads.filter(path => path === DESIGN_FILE).length
  const before = reads()
  await clock.advance(2_000)
  expect(reads()).toBe(before)
  world.design = atResearch([])
  world.mtime = NOW + 1_000
  await clock.advance(2_000)
  expect(reads()).toBe(before + 1)
  const lines = textLines(await ui.drawn())
  expect(lines.some(line => /◆ 2 Research\s+docs\/RESEARCH\.md/.test(line))).toBe(true)
  // The design session gone: ↵ opens a new one on the skill.
  world.statuses = []
  world.panes = '%0\t@0\trail\t\t'
  await ui.press({ key: 'refresh' })
  await ui.press({ key: 'stage:2' })
  expect(opens(calls).length).toBe(1)
  expect(opens(calls)[0]!.at(-1)).toBe('/tower:tower-design')
  await ui.unmount()
})

test('+ prototype asks a short name, makes spikes/<nn>-<slug>/ and opens a free session there', async ($: any, on: any) => {
  mock.clock(on, { now: NOW })
  const design = { v: 1, id: 'sid-design', role: 'free', ticket: 'design-0000000a', cwd: FOLDER, pane: null, state: 'idle', since: NOW - 60_000, updatedAt: NOW - 1_000, socket: SOCKET }
  const calls = designWorld(on, { TOWER_ROLE: 'rail' }, { design: atResearch([]), mtime: NOW, statuses: [design], panes: '%0\t@0\trail\t\t\n%3\t@0\tfree\tdesign-0000000a\t', exists: new Set(), spikes: ['01-sqlite', 'notes.md'] })
  const ui = await startRail($)
  await ui.press({ key: 'prototype' })
  expect(await ui.find({ key: 'prototype:input' })).toBeDefined()
  await ui.input({ key: 'prototype:input', text: 'SwiftData 10k rows', kind: 'change' })
  await ui.input({ key: 'prototype:input', text: 'SwiftData 10k rows', kind: 'submit' })
  const folder = `${FOLDER}/spikes/02-swiftdata-10k-rows`
  expect(calls.argv).toContainEqual(['mkdir', '-p', folder])
  const opened = opens(calls)
  expect(opened.length).toBe(1)
  expect(opened[0]![opened[0]!.indexOf('-c') + 1]).toBe(folder)
  expect(opened[0]!.find(arg => arg.startsWith('TOWER_TICKET='))).toMatch(/^TOWER_TICKET=free-/)
  expect(opened[0]).toContain('TOWER_MODE=design')
  expect(await ui.find({ key: 'prototype:input' })).toBeUndefined()
  await ui.unmount()
})

test("a design session's deck: DOCUMENTS (✓ there, ○ missing) and the active stage's OPEN QUESTIONS", async ($: any, on: any) => {
  mock.clock(on, { now: NOW })
  designWorld(on, { TOWER_ROLE: 'free', TOWER_TICKET: 'design-0000000a' }, {
    design: atResearch(['Who pays for it, the household or each person?', 'iOS only?']), mtime: NOW + 7, statuses: [], panes: '', exists: new Set([`${FOLDER}/docs/IDEA.md`]), spikes: [],
  })
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: FOLDER, surface: 'terminal', isInteractive: true })
  const deck = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'deck', props: { bodyColumns: 66, scroll: { bodyRows: 50 } } } as any)
  const text = textLines(await deck.drawn()).join('\n')
  expect(text).toMatch(/DOCUMENTS\s+1 of 6/)
  expect(text).toContain('✓ IDEA.md  ○ RESEARCH.md  ○ PRODUCT.md  ○ DECISIONS.md')
  expect(text).toContain('○ ARCHITECTURE.md  ○ ROADMAP.md')
  expect(text).toMatch(/OPEN QUESTIONS\s+2 Research/)
  expect(text).toContain('◆ Who pays for it, the household or each person?')
  expect(text).toContain('◆ iOS only?')
  expect(text).not.toMatch(/DEV-ENV|REVIEW|PR #/)
  await deck.unmount()
})

test('the design rail: the ▶ and the bar follow the ring onto a stage and + new session, and back to the current stage off the rows', async ($: any, on: any) => {
  mock.clock(on, { now: NOW })
  designWorld(on, { TOWER_ROLE: 'rail' }, { design: atResearch(['Who pays?']), mtime: NOW, statuses: [], panes: '%0\t@0\trail\t\t', exists: new Set(), spikes: [] })
  await $.session.start({ cwd: FOLDER, surface: 'terminal', isInteractive: true })
  // The pane holds the keys.
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 }, isFocused: true } })
  await ui.press({ key: 'refresh' })
  const ring = async (element: string) => $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element, origin: { kind: 'person' } })
  const marked = async () => textLines(await ui.drawn()).filter(one => one.startsWith('▶ '))
  const inverse = (node: unknown): string[] => {
    if (node === null || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(inverse)
    const element = node as { type?: unknown; props?: Record<string, unknown>; children?: unknown }
    if (element.type === 'Text' && element.props?.inverse === true) return [textLines(element).join('')]
    return inverse(element.children ?? element.props?.children ?? [])
  }
  const shown = async (key: string) => (await ui.find({ key }))?.text ?? ''
  expect(await marked()).toEqual([expect.stringMatching(/^▶ ◆ 2 Research/)])
  // The ring on stage 4: the ▶ and the mark before its Button, which holds the name, the tail and the padding across the
  // 44 columns (the engine's inverse the bar, Tower's none); Research keeps its ◆ without the ▶.
  await ring('stage:4')
  expect(await marked()).toEqual([expect.stringMatching(/^▶ ○ 4 /)])
  expect(await shown('stage:4')).toMatch(/^4 \S+/)
  expect(Array.from('▶ ○ ').length + Array.from(await shown('stage:4')).length).toBe(44)
  expect(inverse(await ui.drawn())).toEqual([])
  // On `+ new session`: ▶ before the row; the bar is the engine's on `o: + new session` alone (`t: + prototype` follows).
  await ring('new-session')
  expect(await marked()).toEqual(['▶ + new session · + prototype'])
  expect(await shown('new-session')).toBe('+ new session')
  expect(inverse(await ui.drawn())).toEqual([])
  // Off the rows (`+ prototype`, `quit`): back on the current stage, as before.
  for (const element of ['prototype', 'quit']) {
    await ring(element)
    expect(await marked()).toEqual([expect.stringMatching(/^▶ ◆ 2 Research/)])
    expect(inverse(await ui.drawn())).toEqual([])
  }
  await ui.unmount()
})
