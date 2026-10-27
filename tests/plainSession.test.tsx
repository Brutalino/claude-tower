import { expect, mock, test } from 'claude-code/testing'

// Decision 066: installed from the marketplace, Tower loads in every Claude Code session. A plain one (no TOWER_ROLE, not
// launched by bin/CCtower, no `/tower`) gets `/tower` and nothing else: no routing, no safety rules, no band, no deck, no
// Fable swap, no timers, no file written, no process run, no network.

const HOME = '/home/test'
const STATE = `${HOME}/.claude/tower`
const FABLE = 'claude-fable-5-1'
const ENGINE = { plugin: 'engine', tier: 'core' }

type Seen = { reads: string[]; writes: string[]; argv: string[][]; fetches: number; registered: string[]; agents: string[]; tools: string[]; opened: string[] }

/** A plain session whose Tower settings (another Tower's) turn Fable off: what reaches the engine is recorded. */
function plainSession(on: any): Seen {
  mock.env(on, { HOME })
  mock.clock(on, { now: Date.parse('2026-10-13T12:00:00Z') })
  mock.store(on)
  const seen: Seen = { reads: [], writes: [], argv: [], fetches: 0, registered: [], agents: [], tools: [], opened: [] }
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.id', async () => ({ value: 'plain-1' }))
  on('session.cwd' as any, async () => ({ value: `${HOME}/notes` }) as any)
  on('fs.read', async (_$: unknown, e: any) => (seen.reads.push(e.path), e.path === `${STATE}/settings.json` ? { value: JSON.stringify({ fable: 'off', safety: 'on' }) } : { deny: `ENOENT: ${e.path}` }) as any)
  on('fs.exists', async () => ({ value: false }) as any)
  on('fs.list', async () => ({ value: [] }) as any)
  on('fs.write', async (_$: unknown, e: any) => {
    seen.writes.push(e.path)
    return { value: undefined } as any
  })
  on('process.run', async (_$: unknown, e: any) => {
    seen.argv.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as any
  })
  on('http.fetch', async () => {
    seen.fetches += 1
    return { deny: 'no network in tests' } as any
  })
  on('command.register' as any, async (_$: unknown, e: any) => {
    seen.registered.push(e.name)
    return { value: { command: e.name } } as any
  })
  on('agent.register' as any, async (_$: unknown, e: any) => {
    seen.agents.push(e.name)
    return { value: { agent: e.name } } as any
  })
  on('tool.register' as any, async (_$: unknown, e: any) => {
    seen.tools.push(e.name)
    return { value: { tool: e.name } } as any
  })
  on('ui.open' as any, async (_$: unknown, e: any) => {
    seen.opened.push(e.id)
    return { value: {} } as any
  })
  return seen
}

test('a plain session: session.start registers /tower and does nothing else', async ($: any, on: any) => {
  const seen = plainSession(on)
  on('prompt.submit', async (_$: unknown, e: any) => ({ text: e.text }) as any)
  await $.session.start({ cwd: `${HOME}/notes`, surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } } as any)
  expect(seen.registered).toEqual(['tower'])
  expect(seen.agents).toEqual([])
  expect(seen.tools).toEqual([])
  expect(seen.opened).toEqual([])
  expect(seen.writes).toEqual([])
  expect(seen.argv).toEqual([])
  expect(seen.fetches).toBe(0)
  expect(seen.reads).toEqual([])
})

test('a plain session: Fable requests and spawns pass as they are, whatever Tower settings say', async ($: any, on: any) => {
  const seen = plainSession(on)
  const steps: string[] = []
  const spawns: (string | undefined)[] = []
  on('turn.step', async function* (_$: unknown, e: any) {
    steps.push(e.model)
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: null } as any
  })
  on('agent.spawn', async (_$: unknown, e: any) => {
    spawns.push(e.model)
    return { model: e.model ?? FABLE, agentId: 'a1' }
  })
  await $.session.start({ cwd: `${HOME}/notes`, surface: 'terminal', isInteractive: true })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: FABLE, messageCount: 1 } as any)) {
    // The step passes through.
  }
  await $.agent.spawn({ prompt: 'Look.', description: 'Look', subagentType: 'Explore', model: FABLE, provider: ENGINE, fork: false, background: false })
  expect(steps).toEqual([FABLE])
  expect(spawns).toEqual([FABLE])
  expect(seen.writes).toEqual([])
})

test('a plain session: no routing, no guidance, no safety rules', async ($: any, on: any) => {
  plainSession(on)
  const reached: string[] = []
  on('agent.spawn', async (_$: unknown, e: any) => {
    reached.push(e.subagentType)
    return { model: 'claude-haiku-4-5', agentId: `a${reached.length}` }
  })
  on('prompt.compose', async () => ({ sections: [{ id: 'core', text: 'core', scope: 'session' }] }) as any)
  on('tool.check', async () => ({ decision: 'allow' }) as any)
  await $.session.start({ cwd: `${HOME}/notes`, surface: 'terminal', isInteractive: true })
  const fork = await $.agent.spawn({ prompt: 'Fork it.', description: 'Fork', subagentType: 'fork', provider: ENGINE, fork: true, background: false })
  await $.agent.spawn({ prompt: 'Find.', description: 'Find', subagentType: 'Explore', provider: ENGINE, fork: false, background: false })
  expect((fork as { deny?: string }).deny).toBeUndefined()
  expect(reached).toEqual(['fork', 'Explore'])
  const composed = await $.prompt.compose({ model: 'claude-haiku-4-5', promptModel: 'claude-haiku-4-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as any)
  expect(composed.sections.map((section: { id: string }) => section.id)).toEqual(['core'])
  const risky = await $.tool.check({ tool: 'Bash', input: { command: 'git push --force origin main' } } as any)
  expect(risky.decision).toBe('allow')
})

test('a plain session: a Fable limit blocks nothing for Tower, `/compact micro` is core\'s, the band is core\'s', async ($: any, on: any) => {
  const seen = plainSession(on)
  let compacted = 0
  on('session.compact', async (_$: unknown, e: any) => {
    compacted += 1
    return { messages: e.messages } as any
  })
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'engine', ref: 0 }) as any)
  on('classic.StopFailure', async () => ({}) as any)
  on('turn.step', async function* (_$: unknown, e: any) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: null } as any
  })
  await $.session.start({ cwd: `${HOME}/notes`, surface: 'terminal', isInteractive: true })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: FABLE, messageCount: 1 } as any)) {
    // The main loop's model, as a Tower session would remember it.
  }
  await $.classic.StopFailure({ hook_event_name: 'StopFailure', error: 'rate_limit', error_details: `${FABLE} rate limit until 2026-10-13T15:00:00Z`, session_id: 'plain-1', transcript_path: '', cwd: `${HOME}/notes` } as any)
  expect(seen.writes.filter(path => path.endsWith('model-block.json'))).toEqual([])
  await $.session.compact({ trigger: 'manual', instructions: 'micro', messages: [{ role: 'user', text: 'hello', toolUses: [], handle: 'h:0' }] } as any)
  expect(compacted).toBe(1)
  // Tower draws no band: the engine draws its own.
  const band = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { bodyRows: 19 } } } as any)
  expect(await band.drawn()).toMatchObject({ type: 'engine' })
  expect(await band.find({ type: 'Button', label: 'explain as' })).toBeUndefined()
  await band.unmount()
})
