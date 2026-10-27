import { expect, mock, test } from 'claude-code/testing'

import { textLines } from './repoGit'

// Decision 066: `/tower` in a plain session places Tower in it, a free session in place: the deck, the band, the safety
// rules and the free routing, no tmux and no status file; `/tower off` takes it out. One test: a file's tests share one
// module instance, and this one walks on, then off.

const HOME = '/home/test'
const STATE = `${HOME}/.claude/tower`
const ENGINE = { plugin: 'engine', tier: 'core' }

test('/tower places Tower in a plain session, /tower off takes it out', async ($: any, on: any) => {
  mock.env(on, { HOME, TMUX_PANE: '%9' })
  mock.clock(on, { now: Date.parse('2026-10-13T12:00:00Z') })
  mock.store(on)
  const writes: string[] = []
  const argv: string[][] = []
  const registered: string[] = []
  const agents: string[] = []
  const opened: string[] = []
  const closed: string[] = []
  const reached: string[] = []
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.id', async () => ({ value: 'plain-1' }))
  on('session.cwd' as any, async () => ({ value: `${HOME}/notes` }) as any)
  on('fs.read', async (_$: unknown, e: any) => ({ deny: `ENOENT: ${e.path}` }) as any)
  on('fs.exists', async () => ({ value: false }) as any)
  on('fs.list', async () => ({ value: [] }) as any)
  on('fs.write', async (_$: unknown, e: any) => {
    writes.push(e.path)
    return { value: undefined } as any
  })
  on('process.run', async (_$: unknown, e: any) => {
    argv.push([...e.argv])
    return { value: { exitCode: 1, stdout: '', stderr: '' } } as any
  })
  on('command.register' as any, async (_$: unknown, e: any) => {
    registered.push(e.name)
    return { value: { command: e.name } } as any
  })
  on('command.list', async () => ({ value: [] }) as any)
  on('agent.register' as any, async (_$: unknown, e: any) => {
    agents.push(e.name)
    return { value: { agent: e.name } } as any
  })
  on('agent.list' as any, async () => ({ value: [] }) as any)
  on('tool.register' as any, async (_$: unknown, e: any) => ({ value: { tool: e.name } }) as any)
  on('ui.open' as any, async (_$: unknown, e: any) => {
    opened.push(e.id)
    return { value: {} } as any
  })
  on('ui.close' as any, async (_$: unknown, e: any) => {
    closed.push(e.id)
    return { value: undefined } as any
  })
  on('agent.spawn', async (_$: unknown, e: any) => {
    reached.push(e.subagentType)
    return { model: 'claude-haiku-4-5', agentId: `a${reached.length}` }
  })
  on('tool.check', async () => ({ decision: 'allow' }) as any)
  on('prompt.compose', async () => ({ sections: [] }) as any)
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'engine', ref: 0 }) as any)
  const spawn = (subagentType: string) => $.agent.spawn({ prompt: 'Find the notes.', description: 'Find notes', subagentType, provider: ENGINE, fork: false, background: false })

  await $.session.start({ cwd: `${HOME}/notes`, surface: 'terminal', isInteractive: true })
  expect(registered).toEqual(['tower'])

  // ── /tower: on
  const placed = await $.command.run({ command: 'tower', args: '' } as any)
  expect(placed.text).toContain('Tower is on in this session')
  expect(registered).toEqual(expect.arrayContaining(['deck', 'compact-micro']))
  expect(agents).toEqual(expect.arrayContaining(['executor', 'scout', 'verifier', 'runner']))
  expect(opened).toContain('deck')
  await spawn('Explore')
  expect(reached).toEqual(['tower:scout'])
  const composed = await $.prompt.compose({ model: 'claude-haiku-4-5', promptModel: 'claude-haiku-4-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as any)
  expect(composed.sections.map((section: { id: string }) => section.id)).toContain('tower:routing')
  const risky = await $.tool.check({ tool: 'Bash', input: { command: 'git push --force origin main' } } as any)
  expect(risky.decision).not.toBe('allow')
  // The flightdeck of a free session, its routing view saying this session keeps its model.
  const deck = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'deck', props: { bodyColumns: 66 } } as any)
  expect(textLines(await deck.drawn()).join('\n')).toMatch(/session · /)
  await deck.press({ key: 'view:routing' })
  const routing = textLines(await deck.drawn()).join('\n')
  expect(routing).toContain('new session')
  expect(routing).toContain('in place (/tower): this session keeps its own model and effort')
  await deck.unmount()
  // The band above the prompt.
  const band = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { bodyRows: 19 } } } as any)
  expect(await band.find({ type: 'Button', label: 'explain as' })).toBeDefined()
  await band.unmount()
  // Again: already on.
  expect((await $.command.run({ command: 'tower', args: 'on' } as any)).text).toContain('already on')
  // No Tower around it: no tmux call, no status file, no keys file.
  expect(argv.filter(line => line[0] === 'tmux')).toEqual([])
  expect(writes.filter(path => path.startsWith(`${STATE}/sessions/`) || path.startsWith(`${STATE}/keys/`))).toEqual([])

  // ── /tower off
  const off = await $.command.run({ command: 'tower', args: 'off' } as any)
  expect(off.text).toContain('Tower is off in this session')
  expect(closed).toContain('deck')
  await spawn('Explore')
  expect(reached).toEqual(['tower:scout', 'Explore'])
  const plain = await $.prompt.compose({ model: 'claude-haiku-4-5', promptModel: 'claude-haiku-4-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as any)
  expect(plain.sections).toEqual([])
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'git push --force origin main' } } as any)).decision).toBe('allow')
  expect((await $.command.run({ command: 'tower', args: 'off' } as any)).text).toContain('not on')
  expect((await $.command.run({ command: 'tower', args: 'what' } as any)).text).toContain('usage: /tower')
})
