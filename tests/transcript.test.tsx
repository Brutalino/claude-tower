import { expect, mock, test } from 'claude-code/testing'

const TICKET_ENV = { TOWER_ROLE: 'ticket', TOWER_TICKET: 'TKT-1', TOWER_REPO: '/repo', HOME: '/home/test' }
const RAIL_ENV = { TOWER_ROLE: 'rail', HOME: '/home/test' }
const SURFACES = ['terminal', 'desktop'] as const
const COMPOSER = { kind: 'composer' }

/** The engine's own row beneath the plugin: one Text `engine`. */
function engineRow(on: any) {
  on('ui.render', async ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

for (const surface of SURFACES) {
  const mount = ($: any, component: string, props: Record<string, unknown>) => $.ui.mount({ plugin: 'tower', surface, component, props } as any)

  test(`user row: a bar and the prompt in bold (${surface})`, async ($, on) => {
    mock.env(on, TICKET_ENV)
    const ui = await mount($, 'UserMessage', { text: 'go', origin: COMPOSER, isExpanded: false })
    expect(await ui.find({ type: 'Text', text: /^▎ $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^go$/ })).toBeDefined()
  })

  test(`user row: a task notification is one dim line (${surface})`, async ($, on) => {
    mock.env(on, TICKET_ENV)
    const ui = await mount($, 'UserMessage', { text: 'Agent "Count lines" completed', origin: { kind: 'task-notification' }, isExpanded: false, task: { id: 'a1', status: 'completed', durationMs: 65_000 } })
    expect(await ui.find({ type: 'Text', text: /^↩ Count lines finished · 1:05$/ })).toBeDefined()
  })

  test(`user row: a peer's message names the sender (${surface})`, async ($, on) => {
    mock.env(on, TICKET_ENV)
    const ui = await mount($, 'UserMessage', { text: 'done\nmore', origin: { kind: 'peer' }, isExpanded: false, from: { name: 'runner' } })
    expect(await ui.find({ type: 'Text', text: /^← runner: done$/ })).toBeDefined()
  })

  test(`user row: the rail keeps the engine's (${surface})`, async ($, on) => {
    mock.env(on, RAIL_ENV)
    engineRow(on)
    const ui = await mount($, 'UserMessage', { text: 'go', origin: COMPOSER, isExpanded: false })
    expect(await ui.find({ type: 'Text', text: /^▎ $/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  })

  test(`assistant row: a bar beside the markdown (${surface})`, async ($, on) => {
    mock.env(on, TICKET_ENV)
    const ui = await mount($, 'AssistantMessage', { text: 'NOTES.md has **20** lines.', isFirstOfReply: true })
    expect(await ui.find({ type: 'Text', text: /^▎ $/ })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: /20/ })).toBeDefined()
  })

  test(`assistant row: a summary is dim with ※ (${surface})`, async ($, on) => {
    mock.env(on, TICKET_ENV)
    const ui = await mount($, 'AssistantMessage', { text: 'Counted the lines', isFirstOfReply: false, isSummary: true })
    expect(await ui.find({ type: 'Text', text: /^※ Counted the lines$/ })).toBeDefined()
  })

  test(`tool row: one line with the main argument (${surface})`, async ($, on) => {
    mock.env(on, TICKET_ENV)
    const ui = await mount($, 'ToolUse', { tool: 'Bash', input: { command: 'wc -l NOTES.md\necho' }, isRunning: false, isErrored: false, isInterrupted: false })
    expect(await ui.find({ type: 'Text', text: /^· Bash wc -l NOTES\.md$/ })).toBeDefined()
  })

  test(`tool row: errored ends with ✗, running shows ◐ (${surface})`, async ($, on) => {
    mock.env(on, TICKET_ENV)
    const errored = await mount($, 'ToolUse', { tool: 'Read', input: { file_path: 'src/a.ts' }, isRunning: false, isErrored: true, isInterrupted: false })
    expect(await errored.find({ type: 'Text', text: /^· Read src\/a\.ts ✗$/ })).toBeDefined()
    const running = await mount($, 'ToolUse', { tool: 'Read', input: { file_path: 'src/a.ts' }, isRunning: true, isErrored: false, isInterrupted: false })
    expect(await running.find({ type: 'Text', text: /^◐ Read src\/a\.ts$/ })).toBeDefined()
  })

  test(`tool row: an agent names the agent and its task (${surface})`, async ($, on) => {
    mock.env(on, TICKET_ENV)
    const ui = await mount($, 'ToolUse', { tool: 'Agent', input: { subagent_type: 'tower:runner', description: 'Count NOTES.md lines', prompt: 'x' }, isRunning: false, isErrored: false, isInterrupted: false })
    expect(await ui.find({ type: 'Text', text: /^· → runner · Count NOTES\.md lines$/ })).toBeDefined()
  })

  test(`tool group: counts per tool, the engine's while expanded (${surface})`, async ($, on) => {
    mock.env(on, TICKET_ENV)
    engineRow(on)
    const call = (tool: string) => ({ tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false })
    const calls = [call('Read'), call('Read'), call('Bash'), call('Read')]
    const ui = await mount($, 'ToolGroup', { calls, isActive: false, isExpanded: false })
    expect(await ui.find({ type: 'Text', text: /^· Read 3 files · Bash 1 command$/ })).toBeDefined()
    const expanded = await mount($, 'ToolGroup', { calls, isActive: false, isExpanded: true })
    expect(await expanded.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  })

  test(`tool result: nothing, an error as one line (${surface})`, async ($, on) => {
    mock.env(on, TICKET_ENV)
    const ok = await mount($, 'ToolResult', { tool: 'Bash', output: '20 NOTES.md', isErrored: false })
    expect(await ok.find({ type: 'Text', text: /NOTES/ })).toBeUndefined()
    const failed = await mount($, 'ToolResult', { tool: 'Bash', output: 'no such file\nmore', isErrored: true })
    expect(await failed.find({ type: 'Text', text: /^ {2}✗ no such file$/ })).toBeDefined()
  })

  test(`turn line: ✓ word · m:ss (${surface})`, async ($, on) => {
    mock.env(on, TICKET_ENV)
    const ui = await mount($, 'TurnDuration', { word: 'Brewed for', durationMs: 125_000 })
    expect(await ui.find({ type: 'Text', text: /^✓ Brewed for · 2:05$/ })).toBeDefined()
  })
}

// ── Decision 038: reply blocks, tool timings, edit cards, masked texts ──

test('assistant row: an alert, a task list and a mermaid diagram are drawn; the rest stays Markdown', async ($, on) => {
  mock.env(on, TICKET_ENV)
  const text = 'Intro\n> [!WARNING]\n> Mind the gap\n- [ ] todo\n- [x] done\n```mermaid\nflowchart TD\n  A[Go] --> B[Stop]\n```'
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'AssistantMessage', props: { text, isFirstOfReply: true } } as any)
  expect(await ui.find({ type: 'Markdown', text: /^Intro$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Warning$/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /^Mind the gap$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^☐ todo$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^☑ done$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^│ Stop │$/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /mermaid/ })).toBeUndefined()
})

test('tool row: a finished call ends with its duration, found by tool_use_id', async ($, on) => {
  mock.env(on, TICKET_ENV)
  const clock = mock.clock(on, { now: 1_000_000 })
  on('fs.write', async () => ({ value: undefined }) as any)
  on('tool.call', async () => {
    await clock.advance(12_400)
    return { result: { stdout: 'ok', stderr: '', interrupted: false } } as any
  })
  await $.tool.call({ tool: 'Bash', command: 'pnpm test', tool_use_id: 'tu_1' } as any)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'ToolUse', props: { tool_use_id: 'tu_1', tool: 'Bash', input: { command: 'pnpm test' }, isRunning: false, isErrored: false, isInterrupted: false } } as any)
  expect(await ui.find({ type: 'Text', text: /^· Bash pnpm test$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ · 12\.4s$/ })).toBeDefined()
})

test('tool row: an edit card counts the lines, Write its lines', async ($, on) => {
  mock.env(on, TICKET_ENV)
  const edit = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'ToolUse', props: { tool_use_id: 'e1', tool: 'Edit', input: { file_path: 'src/a.ts', old_string: 'a\nb', new_string: 'a\nc\nd' }, isRunning: false, isErrored: false, isInterrupted: false } } as any)
  expect(await edit.find({ type: 'Text', text: /^· Edit src\/a\.ts$/ })).toBeDefined()
  expect(await edit.find({ type: 'Text', text: /^ {2}\+2$/ })).toBeDefined()
  expect(await edit.find({ type: 'Text', text: /^ −1$/ })).toBeDefined()
  const write = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'ToolUse', props: { tool_use_id: 'w1', tool: 'Write', input: { file_path: 'b.md', content: 'x\ny\nz' }, isRunning: false, isErrored: false, isInterrupted: false } } as any)
  expect(await write.find({ type: 'Text', text: /^ {2}\+3 lines$/ })).toBeDefined()
})

const SECRET = 'ghp_' + 'z'.repeat(36)

function secretSession(on: any, env: Record<string, string>, written: string[]) {
  mock.env(on, env)
  mock.clock(on, { now: 1_000_000 })
  on('fs.write', async (_$: unknown, e: any) => {
    written.push(JSON.stringify(e))
    return { value: undefined } as any
  })
  on('session.id', async () => ({ value: 's1' }))
  on('session.cwd', async () => ({ value: '/repo' }))
  on('prompt.submit', async (_$: unknown, e: any) => ({ text: e.text }) as any)
  on('turn.start', async (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }) as any)
}

test('a secret in a prompt or a command reaches the deck log masked', async ($, on) => {
  const written: string[] = []
  secretSession(on, TICKET_ENV, written)
  await $.prompt.submit({ text: `use ${SECRET} please`, wait: false, origin: { kind: 'composer' } } as any)
  await $.tool.call({ tool: 'Bash', command: `curl -H "Authorization: ${SECRET}" x`, tool_use_id: 'tu_s' } as any)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'deck', props: { bodyColumns: 120, scroll: { bodyRows: 40 } } } as any)
  await ui.press({ key: 'view:log' })
  expect(await ui.find({ type: 'Text', text: /use «secret-1» please/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Authorization: «secret-1»/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: new RegExp(SECRET) })).toBeUndefined()
  await ui.unmount()
})
