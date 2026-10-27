import { expect, mock, test } from 'claude-code/testing'

const TICKET_ENV = { TOWER_ROLE: 'ticket', TOWER_TICKET: 'TKT-1', TOWER_REPO: '/repo', HOME: '/home/test' }
const HAIKU = 'claude-haiku-4-5-20251001'
const SPAWN = { prompt: 'Read NOTES.md and count its lines.', description: 'Count NOTES.md lines', subagentType: 'general-purpose', parentModel: HAIKU, background: false, fork: false, provider: { plugin: 'engine', tier: 'core' } }
const SURFACES = ['terminal', 'desktop'] as const

function deckProps(bodyRows?: number) {
  return { component: 'Pane', requestId: 'deck', props: { bodyColumns: 66, ...(bodyRows !== undefined ? { scroll: { bodyRows } } : {}) } } as const
}

/** A ticket session whose spawns get the ids a1, a2, … in turn. */
function ticketSession(on: any, now = 1_000_000) {
  mock.env(on, TICKET_ENV)
  const clock = mock.clock(on, { now })
  on('fs.write', async () => ({ value: undefined }) as any)
  let spawned = 0
  on('agent.spawn', async () => ({ model: HAIKU, agentId: `a${++spawned}` }))
  on('classic.SubagentStop', async () => ({}) as any)
  on('tool.call', async (_$: unknown, e: any) => (e.tool === 'TaskCreate' ? { result: { task: { id: e.subject } } } : { result: 'ok' }) as any)
  return clock
}

async function spawn($: any) {
  await $.agent.spawn(SPAWN as any)
}

async function stop($: any, id: string) {
  await $.classic.SubagentStop({ agent_id: id, agent_type: 'general-purpose', agent_transcript_path: '/t', stop_hook_active: false, last_assistant_message: '20' } as any)
}

for (const surface of SURFACES) {
  const mount = ($: any, bodyRows?: number) => $.ui.mount({ plugin: 'tower', surface, ...deckProps(bodyRows) } as any)

  test(`no agent: header, main panel and one dim line (${surface})`, async ($, on) => {
    ticketSession(on)
    const ui = await mount($)
    expect(await ui.find({ type: 'Text', text: /^no agent has started in this session$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^IDLE$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^○ idle$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^effort —$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /agents ·/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`a running agent with steps: step count, bar, step in progress, last action (${surface})`, async ($, on) => {
    ticketSession(on)
    await spawn($)
    await $.tool.call({ tool: 'TaskCreate', subject: 'Read', agentId: 'a1' } as any)
    await $.tool.call({ tool: 'TaskCreate', subject: 'Count', agentId: 'a1' } as any)
    await $.tool.call({ tool: 'TaskUpdate', taskId: 'Read', status: 'completed', agentId: 'a1' } as any)
    await $.tool.call({ tool: 'TaskUpdate', taskId: 'Count', status: 'in_progress', agentId: 'a1' } as any)
    await $.tool.call({ tool: 'Bash', command: 'wc -l NOTES.md', agentId: 'a1' } as any)
    const ui = await mount($)
    expect(await ui.find({ type: 'Text', text: /^agents · 1 running · 1 total$/ })).toBeDefined()
    expect((await ui.find({ key: 'agent:a1' }))?.text).toContain('general-purpose')
    expect(await ui.find({ type: 'Text', text: /^step 2 of 2$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Count NOTES\.md lines$/ })).toBeDefined()
    // (1 + 0.5) / 2 of 55 cells
    expect(await ui.find({ type: 'Text', text: /^▰{41}$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Count$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^· Bash wc -l NOTES\.md$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^WORKING · 1 RUNNING$/ })).toBeDefined()
    await ui.unmount()
  })

  test(`a running agent without steps or estimate: actions and no estimate yet (${surface})`, async ($, on) => {
    ticketSession(on)
    await spawn($)
    await $.tool.call({ tool: 'Read', file_path: '/repo/NOTES.md', agentId: 'a1' } as any)
    const ui = await mount($)
    expect(await ui.find({ type: 'Text', text: /^1 actions$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^no estimate yet\s*$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Read \/repo\/NOTES\.md$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^▰/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`a finished agent: done with its duration and its last output; Enter opens the watch, x closes it (${surface})`, async ($, on) => {
    ticketSession(on)
    await spawn($)
    await $.tool.call({ tool: 'TaskCreate', subject: 'Count', agentId: 'a1' } as any)
    await $.tool.call({ tool: 'Bash', command: 'wc -l NOTES.md', agentId: 'a1' } as any)
    await stop($, 'a1')
    const ui = await mount($)
    expect(await ui.find({ type: 'Text', text: /^done · 0:00$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^» 20$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^recent$/ })).toBeUndefined()
    // Enter on the card opens the agent watch: task, steps, live, and no message box for a finished agent.
    await ui.press({ key: 'agent:a1' })
    const watch = ui
    expect(await watch.find({ type: 'Text', text: /^steps$/ })).toBeDefined()
    expect(await watch.find({ type: 'Text', text: /^○ Count$/ })).toBeDefined()
    expect(await watch.find({ type: 'Text', text: /^live$/ })).toBeDefined()
    expect(await watch.find({ type: 'Text', text: /^· Bash wc -l NOTES\.md$/ })).toBeDefined()
    expect(await watch.find({ type: 'Text', text: /^agent finished$/ })).toBeDefined()
    expect(await watch.find({ key: 'close' })).toBeDefined()
    await ui.press({ key: 'close' })
    expect(await ui.find({ type: 'Text', text: /^agent finished$/ })).toBeUndefined()
    expect(await ui.find({ key: 'agent:a1' })).toBeDefined()
    await ui.unmount()
  })

  test(`more agents than fit: +n more, and a shorter pane draws fewer cards (${surface})`, async ($, on) => {
    ticketSession(on)
    for (let i = 0; i < 6; i++) await spawn($)
    // header 1 + legend 1 + tabs 1 + main panel 5 + pulse 1 + sessions (heading, main, six agents) 8 + block header 1 + three cards of 7 + the +n more line + the dev-env box 5
    const ui = await mount($, 1 + 1 + 1 + 5 + 1 + 8 + 1 + 21 + 1 + 5)
    expect(await ui.find({ key: 'agent:a3' })).toBeDefined()
    expect(await ui.find({ key: 'agent:a4' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^\+3 more$/ })).toBeDefined()
    await ui.unmount()

    const short = await mount($, 1 + 1 + 1 + 5 + 1 + 8 + 1 + 7 + 1 + 5)
    expect(await short.find({ key: 'agent:a1' })).toBeDefined()
    expect(await short.find({ key: 'agent:a2' })).toBeUndefined()
    expect(await short.find({ type: 'Text', text: /^\+5 more$/ })).toBeDefined()
    await short.unmount()
  })
}

test('finished agents fold into one row after 20 s; h opens and closes the history; nothing running leaves that row alone', async ($, on) => {
  const clock = ticketSession(on)
  for (let i = 0; i < 3; i++) await spawn($)
  await stop($, 'a1')
  await stop($, 'a2')
  const mount = () => $.ui.mount({ plugin: 'tower', surface: 'terminal', ...deckProps() } as any)
  await clock.advance(19_000)
  let ui = await mount()
  expect(await ui.find({ key: 'agent:a1' })).toBeDefined()
  expect(await ui.find({ key: 'agents:fold' })).toBeUndefined()
  expect(await ui.find({ key: 'lane:a1' })).toBeDefined()
  expect(await ui.find({ key: 'lane:fold' })).toBeUndefined()
  await ui.unmount()

  await clock.advance(2_000)
  ui = await mount()
  expect(await ui.find({ key: 'agent:a3' })).toBeDefined()
  expect(await ui.find({ key: 'agent:a1' })).toBeUndefined()
  expect(await ui.find({ key: 'agent:a2' })).toBeUndefined()
  expect((await ui.find({ key: 'agents:fold' }))?.text).toContain('✓ 2 done')
  expect((await ui.find({ key: 'agents:fold' }))?.text).not.toContain('failed')
  // The timeline folds the same lanes: main and the running agent stay, the finished ones are one `✓ 2 done` row.
  expect(await ui.find({ key: 'lane:main' })).toBeDefined()
  expect(await ui.find({ key: 'lane:a3' })).toBeDefined()
  expect(await ui.find({ key: 'lane:a1' })).toBeUndefined()
  expect((await ui.find({ key: 'lane:fold' }))?.text).toBe('✓2 done')
  await ui.press({ key: 'agents:history' })
  expect(await ui.find({ key: 'agent:a1' })).toBeDefined()
  expect(await ui.find({ key: 'agent:a2' })).toBeDefined()
  expect(await ui.find({ key: 'lane:a1' })).toBeDefined()
  expect(await ui.find({ key: 'lane:fold' })).toBeUndefined()
  await ui.press({ key: 'agents:history' })
  expect(await ui.find({ key: 'agent:a1' })).toBeUndefined()
  expect(await ui.find({ key: 'lane:a1' })).toBeUndefined()
  await ui.unmount()

  await stop($, 'a3')
  await clock.advance(21_000)
  ui = await mount()
  expect(await ui.find({ type: 'Text', text: /^agents ·/ })).toBeUndefined()
  expect((await ui.find({ key: 'agents:fold' }))?.text).toContain('✓ 3 done')
  await ui.unmount()
})

test('more than 8 running agents: 8 cards and +n running', async ($, on) => {
  ticketSession(on)
  for (let i = 0; i < 10; i++) await spawn($)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', ...deckProps() } as any)
  expect(await ui.find({ key: 'agent:a8' })).toBeDefined()
  expect(await ui.find({ key: 'agent:a9' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^\+2 running$/ })).toBeDefined()
  expect(await ui.find({ key: 'lane:a8' })).toBeDefined()
  expect(await ui.find({ key: 'lane:a9' })).toBeUndefined()
  expect((await ui.find({ key: 'lane:more-running' }))?.text).toBe('+2 running')
  await ui.unmount()
})

test('a `[step n/t]` line in an agent response moves its card; the receipt counts from the person\'s prompt', async ($, on) => {
  ticketSession(on)
  on('prompt.submit', async (_$: unknown, e: any) => ({ text: e.text }) as any)
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_$: unknown, e: any) {
    return { turnId: e.turnId, index: e.index, answer: 'Counting now.\n[step 2/3] Count the words', toolUses: [], stopReason: 'tool_use', usage: null } as any
  })
  await $.prompt.submit({ text: 'count', wait: false, origin: { kind: 'composer' } } as any)
  await $.turn.start({ text: 'count', turnId: 't1' })
  await spawn($)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: HAIKU, agentId: 'a1', messageCount: 1 } as any)) {
    // The step's stream passes through unchanged.
  }
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', ...deckProps() } as any)
  expect(await ui.find({ type: 'Text', text: /^step 2 of 3$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Count the words$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ turn $/ })).toBeDefined()
  await ui.unmount()
})

test('a session without TOWER_ROLE collects nothing and draws no deck', async ($, on) => {
  mock.env(on, { HOME: '/home/test' })
  on('agent.spawn', async () => ({ model: HAIKU, agentId: 'a1' }))
  await $.agent.spawn(SPAWN as any)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', ...deckProps() } as any)
  expect(await ui.find({ type: 'Text' })).toBeUndefined()
  await ui.unmount()
})
