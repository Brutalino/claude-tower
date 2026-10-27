import { expect, test } from 'claude-code/testing'

import {
  actionLine,
  shownInput,
  shownPath,
  agentEnded,
  agentName,
  agentSpawned,
  deckBusy,
  initialDeck,
  markedSteps,
  markersRead,
  MAX_AGENTS,
  promptSubmitted,
  runningAgents,
  stepCompleted,
  stepMarkers,
  stepProgress,
  toolFinished,
  toolStarted,
  turnCompleted,
  turnStarted,
  usageRead,
  workReceipt,
  formatReset,
  usageLine,
  windowNow,
} from '../hooks/core/deck'

// Recorded in spikes/agents/out/events.jsonl (runs E1 and F1).
const AGENT = 'aca2acf1b8df57edd'
const HAIKU = 'claude-haiku-4-5-20251001'
const SPAWN_INPUT = {
  prompt: 'List the files in the current folder with Glob, read ROADMAP.md, and report how many lines it has.',
  description: 'List folder files and count ROADMAP.md lines',
  subagentType: 'spike-agents:stepper',
}
const SPAWN_RESULT = { model: HAIKU, agentId: AGENT }
const BASH_CALL = { tool: 'Bash', command: 'ls -la /home/dev/Repositories/ClaudeTower', description: 'List files in the current folder', agentId: AGENT }
const TASK_CREATE = { subject: 'List files in folder', description: 'ls the working directory', tool: 'TaskCreate', agentId: AGENT }
const TASK_CREATE_RESULT = { ref: 1, result: { task: { id: '1', subject: 'List files in folder' } }, text: 'Task #1 created successfully: List files in folder' }
const TASK_UPDATE = { taskId: '1', status: 'in_progress', tool: 'TaskUpdate', agentId: AGENT }
const AGENT_STEP_USAGE = { input_tokens: 10, output_tokens: 783, cache_read_input_tokens: 0, cache_creation_input_tokens: 14940, model: HAIKU }
const LAST_MESSAGE = '**Files in /home/dev/Repositories/ClaudeTower:**\n- .claude (directory)\n- ROADMAP.md (2,847 bytes)\n- spikes (directory)\n\n**ROADMAP.md line count: 64 lines**\n\n'

function spawned() {
  return agentSpawned(initialDeck(), { ...SPAWN_INPUT, ...SPAWN_RESULT }, 100)
}

test('a spawn adds a running agent named after its type, with its description as task', async () => {
  const agent = spawned().agents[0]!
  expect(agent).toMatchObject({ id: AGENT, name: 'stepper', model: HAIKU, status: 'running', startedAt: 100, actions: 0 })
  expect(agent.task).toBe(SPAWN_INPUT.description)
  const noDescription = agentSpawned(initialDeck(), { ...SPAWN_INPUT, description: undefined, prompt: 'x'.repeat(300), agentId: 'b', model: HAIKU }, 0)
  expect(noDescription.agents[0]!.task.length).toBe(200)
  expect(agentSpawned(spawned(), { ...SPAWN_INPUT, ...SPAWN_RESULT }, 200).agents.length).toBe(1)
})

test('names are the last segment of the type, numbered when taken', async () => {
  expect(agentName('tower:executor', [])).toBe('executor')
  expect(agentName('tower:executor', ['executor'])).toBe('executor-2')
  expect(agentName('general-purpose', ['general-purpose', 'general-purpose-2'])).toBe('general-purpose-3')
})

test('the list keeps the 30 most recent agents', async () => {
  let deck = initialDeck()
  for (let i = 0; i < MAX_AGENTS + 2; i++) deck = agentSpawned(deck, { agentId: `a${i}`, model: HAIKU, subagentType: 'x' }, i)
  expect(deck.agents.length).toBe(MAX_AGENTS)
  expect(deck.agents[0]!.id).toBe('a2')
})

test('tool calls count as actions with a short line', async () => {
  const deck = toolStarted(spawned(), AGENT, 'Bash', BASH_CALL)
  expect(deck.agents[0]!.actions).toBe(1)
  expect(deck.agents[0]!.lastAction).toBe('Bash ls -la /home/dev/Repositories/ClaudeTower')
  expect(actionLine('Edit', { file_path: 'src/a.ts', old_string: 'x' })).toBe('Edit src/a.ts')
  expect(actionLine('Bash', { command: 'y'.repeat(100) })).toBe(`Bash ${'y'.repeat(60)}`)
  expect(actionLine('ToolSearch', { query: 'select:Read' })).toBe('ToolSearch')
  expect(toolStarted(spawned(), 'unknown', 'Bash', BASH_CALL)).toEqual(spawned())
})

test('TaskCreate adds a step with the result id, TaskUpdate moves and deletes it', async () => {
  let deck = toolStarted(spawned(), AGENT, 'TaskCreate', TASK_CREATE)
  deck = toolFinished(deck, AGENT, 'TaskCreate', TASK_CREATE, TASK_CREATE_RESULT)
  expect(deck.agents[0]!.steps).toEqual([{ id: '1', text: 'List files in folder', status: 'todo' }])
  deck = toolFinished(deck, AGENT, 'TaskCreate', { subject: 'Count lines' }, { text: 'no id here' })
  expect(deck.agents[0]!.steps[1]!.id).toBe('2')
  deck = toolStarted(deck, AGENT, 'TaskUpdate', TASK_UPDATE)
  expect(stepProgress(deck.agents[0]!)).toEqual({ done: 0, total: 2, current: 'List files in folder' })
  deck = toolStarted(deck, AGENT, 'TaskUpdate', { taskId: '1', status: 'completed' })
  expect(stepProgress(deck.agents[0]!)).toEqual({ done: 1, total: 2, current: 'Count lines' })
  deck = toolStarted(deck, AGENT, 'TaskUpdate', { taskId: '2', status: 'deleted' })
  expect(stepProgress(deck.agents[0]!)).toEqual({ done: 1, total: 1, current: null })
})

test('steps count main requests and sum agent tokens', async () => {
  let deck = stepCompleted(spawned(), { model: HAIKU }, { input_tokens: 10, output_tokens: 259 })
  deck = stepCompleted(deck, { model: 'claude-opus-5-5', effort: 'high' }, null)
  expect(deck.main).toMatchObject({ model: 'claude-opus-5-5', effort: 'high', requests: 2 })
  deck = stepCompleted(deck, { agentId: AGENT, model: HAIKU }, AGENT_STEP_USAGE)
  deck = stepCompleted(deck, { agentId: AGENT, model: HAIKU }, AGENT_STEP_USAGE)
  expect(deck.agents[0]!.tokens).toEqual({ input: 20, output: 1566 })
  expect(deck.main.requests).toBe(2)
})

test('SubagentStop and the agent turn.complete end it once, in either order', async () => {
  const stopFirst = turnCompleted(agentEnded(spawned(), AGENT, LAST_MESSAGE, 500), AGENT, 600)
  expect(stopFirst.agents[0]).toMatchObject({ status: 'done', endedAt: 500, lastOutput: LAST_MESSAGE.trim() })
  const completeFirst = agentEnded(turnCompleted(spawned(), AGENT, 500), AGENT, 'x'.repeat(400), 600)
  expect(completeFirst.agents[0]).toMatchObject({ status: 'done', endedAt: 500 })
  expect(completeFirst.agents[0]!.lastOutput!.length).toBe(300)
  expect(agentEnded(spawned(), 'unknown', null, 1)).toEqual(spawned())
})

test('the main loop works between turn start and complete; agents keep the deck busy', async () => {
  let deck = turnStarted(spawned(), 50)
  expect(deck.main).toMatchObject({ state: 'working', turnStartedAt: 50 })
  deck = turnCompleted(deck, undefined, 60)
  expect(deck.main.state).toBe('idle')
  expect(runningAgents(deck)).toBe(1)
  expect(deckBusy(deck)).toBe(true)
  expect(deckBusy(agentEnded(deck, AGENT, null, 70))).toBe(false)
})

test('usage keeps what the session reports and null for the rest', async () => {
  const deck = usageRead(initialDeck(), { context: { percent: 12 }, rateLimits: [{ kind: 'five_hour', percentUsed: 30 }, { kind: 'seven_day', percentUsed: 5 }], cost: { usd: 0.04 } })
  expect(deck.usage).toEqual({
    contextPercent: 12,
    cost: 0.04,
    limits: { fiveHour: { percent: 30, resetsAt: null }, sevenDay: { percent: 5, resetsAt: null }, spend: null },
  })
  expect(usageRead(initialDeck(), { context: {}, rateLimits: [] }).usage).toEqual({ contextPercent: null, cost: null, limits: { fiveHour: null, sevenDay: null, spend: null } })
})

test('usage keeps each window by its kind, never the highest as the 5-hour one; an unreadable time is null', async () => {
  const limits = [
    { kind: 'seven_day', percentUsed: 76, resetsAt: '2026-10-09T00:00:00Z' },
    { kind: 'five_hour', percentUsed: 12, resetsAt: '2026-10-07T13:04:00Z' },
    { kind: 'spend_limit', percentUsed: 90 },
  ]
  expect(usageRead(initialDeck(), { rateLimits: limits }).usage.limits).toEqual({
    fiveHour: { percent: 12, resetsAt: Date.parse('2026-10-07T13:04:00Z') },
    sevenDay: { percent: 76, resetsAt: Date.parse('2026-10-09T00:00:00Z') },
    spend: { percent: 90, resetsAt: null },
  })
  expect(usageRead(initialDeck(), { rateLimits: [{ kind: 'five_hour', percentUsed: 3, resetsAt: 'soon' }] }).usage.limits?.fiveHour).toEqual({ percent: 3, resetsAt: null })
})

test('a reading without a 5-hour window clears the old one', async () => {
  const before = usageRead(initialDeck(), { rateLimits: [{ kind: 'five_hour', percentUsed: 76, resetsAt: '2026-10-07T13:04:00Z' }] })
  expect(usageRead(before, { rateLimits: [{ kind: 'seven_day', percentUsed: 40 }] }).usage.limits?.fiveHour).toBeNull()
})

test('windowNow: a window past its reset time has reset; one still running is kept', async () => {
  const now = 1_000_000
  expect(windowNow({ percent: 76, resetsAt: now - 60_000 }, now)).toEqual({ percent: 0, resetsAt: null })
  expect(windowNow({ percent: 76, resetsAt: now + 60_000 }, now)).toEqual({ percent: 76, resetsAt: now + 60_000 })
  expect(windowNow({ percent: 76, resetsAt: null }, now)).toEqual({ percent: 76, resetsAt: null })
  expect(windowNow(null, now)).toBeNull()
})

test('formatReset: days and hours, hours and padded minutes, minutes alone, soon under a minute or past', async () => {
  const now = 1_000_000
  expect(formatReset(now, now + (2 * 24 + 4) * 3_600_000 + 30 * 60_000)).toBe('resets in 2d 4h')
  expect(formatReset(now, now + 24 * 3_600_000)).toBe('resets in 1d 0h')
  expect(formatReset(now, now + 64 * 60_000)).toBe('resets in 1h 04m')
  expect(formatReset(now, now + 4 * 3_600_000 + 59 * 60_000 + 30_000)).toBe('resets in 4h 59m')
  expect(formatReset(now, now + 12 * 60_000 + 5_000)).toBe('resets in 12m')
  expect(formatReset(now, now + 59_000)).toBe('resets soon')
  expect(formatReset(now, now - 5 * 60_000)).toBe('resets soon')
})

test('usageLine: cost, the 5-hour window, the 7-day one when it fits; a passed window reads 0%', async () => {
  const now = 1_000_000
  const limits = {
    fiveHour: { percent: 12, resetsAt: now + (3 * 60 + 4) * 60_000 + 30_000 },
    sevenDay: { percent: 76, resetsAt: now + (2 * 24 + 4) * 3_600_000 + 30_000 },
    spend: null,
  }
  const full = '$1.84   5h ▰▱▱▱▱ 12% · resets in 3h 04m   7d ▰▰▰▰▱ 76% · resets in 2d 4h'
  expect(usageLine(1.84, limits, now, 120).text).toBe(full)
  expect(usageLine(1.84, limits, now, full.length - 1).text).toBe('$1.84   5h ▰▱▱▱▱ 12% · resets in 3h 04m')
  expect(usageLine(null, { ...limits, fiveHour: { percent: 76, resetsAt: now - 60_000 }, sevenDay: null }, now, 120).text).toBe('5h ▱▱▱▱▱ 0%')
  expect(usageLine(null, undefined, now, 120)).toEqual({ cost: null, parts: [], text: '' })
})

test("the main loop's own tool calls set its last action and steps, as an agent's", async () => {
  let deck = initialDeck()
  deck = toolStarted(deck, undefined, 'Bash', { command: 'ls' })
  expect(deck.main.lastAction).toBe('Bash ls')
  deck = toolFinished(deck, undefined, 'TaskCreate', { subject: 'Plan' }, { result: { task: { id: '7' } } })
  deck = toolFinished(deck, undefined, 'TaskCreate', { subject: 'Do' }, null)
  deck = toolStarted(deck, undefined, 'TaskUpdate', { taskId: '7', status: 'completed' })
  expect(deck.main.steps).toEqual([{ id: '7', text: 'Plan', status: 'done' }, { id: '2', text: 'Do', status: 'todo' }])
  expect(stepProgress(deck.main)).toEqual({ done: 1, total: 2, current: 'Do' })
})

test('an agent keeps its last 6 action lines, oldest first', async () => {
  let deck = agentSpawned(initialDeck(), { agentId: 'a', model: 'haiku', subagentType: 'x' }, 0)
  for (let i = 1; i <= 7; i++) deck = toolStarted(deck, 'a', 'Bash', { command: `echo ${i}` })
  expect(deck.agents[0]!.recent).toEqual(['echo 2', 'echo 3', 'echo 4', 'echo 5', 'echo 6', 'echo 7'].map(c => `Bash ${c}`))
})

test('a main turn leaves its duration and the agents it started', async () => {
  let deck = agentSpawned(initialDeck(), { agentId: 'old', model: 'haiku', subagentType: 'x' }, 50)
  deck = turnStarted(deck, 100)
  deck = agentSpawned(deck, { agentId: 'new', model: 'haiku', subagentType: 'x' }, 150)
  expect(turnCompleted(deck, undefined, 400, 290).main.lastTurn).toEqual({ durationMs: 290, agents: 1 })
  expect(turnCompleted(deck, undefined, 400).main.lastTurn).toEqual({ durationMs: 300, agents: 1 })
})

test('step markers: every valid `[step n/t] text` line, in order, case-insensitive, leading spaces allowed', async () => {
  const text = 'Let me start.\n[step 1/3] Count the lines\n  [STEP 2/3] Count the words  \nnot [step 3/3] mid-line\n'
  expect(stepMarkers(text)).toEqual([{ index: 1, total: 3, text: 'Count the lines' }, { index: 2, total: 3, text: 'Count the words' }])
  expect(stepMarkers('[step 0/3] a\n[step 4/3] b\n[step 1/0] c\n[step 1/21] d\n[step 20/20] e')).toEqual([{ index: 20, total: 20, text: 'e' }])
  expect(stepMarkers('[step 2/5]no space\nstep 2/5 no brackets')).toEqual([])
})

test('a marker sets done before it, doing at it, todo after; known texts kept, unknown ones `step k`', async () => {
  let steps = markedSteps([], { index: 2, total: 4, text: 'Count words' })
  expect(steps.map(step => [step.text, step.status])).toEqual([['step 1', 'done'], ['Count words', 'doing'], ['step 3', 'todo'], ['step 4', 'todo']])
  steps = markedSteps(steps, { index: 3, total: 4, text: 'Report' })
  expect(steps.map(step => [step.text, step.status])).toEqual([['step 1', 'done'], ['Count words', 'done'], ['Report', 'doing'], ['step 4', 'todo']])
  steps = markedSteps(steps, { index: 3, total: 3, text: 'Report both' })
  expect(steps.map(step => [step.text, step.status])).toEqual([['step 1', 'done'], ['Count words', 'done'], ['Report both', 'doing']])
  expect(stepProgress({ steps })).toEqual({ done: 2, total: 3, current: 'Report both' })
})

test("markers replace an agent's task-tool steps, end done with the agent, and stop later TaskCreate steps", async () => {
  let deck = toolFinished(spawned(), AGENT, 'TaskCreate', { subject: 'Plan' }, { result: { task: { id: '7' } } })
  deck = markersRead(deck, AGENT, 'Now:\n[step 1/2] Count lines')
  expect(deck.agents[0]!.steps).toEqual([{ id: 'marker:1', text: 'Count lines', status: 'doing' }, { id: 'marker:2', text: 'step 2', status: 'todo' }])
  deck = toolFinished(deck, AGENT, 'TaskCreate', { subject: 'More' }, { result: { task: { id: '8' } } })
  expect(deck.agents[0]!.steps).toHaveLength(2)
  expect(markersRead(deck, AGENT, 'no marker here')).toBe(deck)
  deck = agentEnded(deck, AGENT, null, 900)
  expect(deck.agents[0]!.steps.map(step => step.status)).toEqual(['done', 'done'])
  const main = markersRead(initialDeck(), undefined, '[step 1/2] Read the plan\n[step 2/2] Delegate')
  expect(main.main.steps.map(step => [step.text, step.status])).toEqual([['Read the plan', 'done'], ['Delegate', 'doing']])
})

test("a work period opens at the person's prompt and spans the follow-up turns and its agents", async () => {
  let deck = promptSubmitted(initialDeck(), true)
  deck = turnStarted(deck, 1_000)
  deck = agentSpawned(deck, { agentId: 'a', model: 'haiku', subagentType: 'x' }, 1_500)
  deck = turnCompleted(deck, undefined, 2_000)
  expect(deckBusy(deck)).toBe(true)
  deck = agentEnded(deck, 'a', null, 9_000)
  // The task notification's short turn extends the period instead of replacing it.
  deck = promptSubmitted(deck, false)
  deck = turnStarted(deck, 9_100)
  deck = turnCompleted(deck, undefined, 11_000)
  expect(deck.main.workStartedAt).toBe(1_000)
  expect(workReceipt(deck)).toEqual({ durationMs: 10_000, agents: 1, edits: 0, errors: 0, cost: null })
  // An agent still ending after the last turn sets the end.
  deck = agentSpawned(deck, { agentId: 'b', model: 'haiku', subagentType: 'x' }, 10_000)
  expect(workReceipt(agentEnded(deck, 'b', null, 15_000))).toEqual({ durationMs: 14_000, agents: 2, edits: 0, errors: 0, cost: null })
  // The person's next prompt opens a new period.
  deck = turnStarted(promptSubmitted(deck, true), 20_000)
  expect(workReceipt(deck)).toEqual({ durationMs: 0, agents: 0, edits: 0, errors: 0, cost: null })
  expect(workReceipt(initialDeck())).toBeNull()
})

test('spans: main steps extend one span per model, a change of model opens a new one, turn end closes it', () => {
  let deck = turnStarted(initialDeck(), 0)
  deck = stepCompleted(deck, { model: 'claude-fable-5-1' }, { input_tokens: 100, output_tokens: 20 }, 10)
  deck = stepCompleted(deck, { model: 'claude-fable-5-1' }, null, 20)
  deck = stepCompleted(deck, { model: 'claude-opus-5-5' }, { input_tokens: 50 }, 30)
  expect(deck.main.spans).toEqual([
    { model: 'claude-fable-5-1', from: 10, to: 30 },
    { model: 'claude-opus-5-5', from: 30, to: null },
  ])
  deck = turnCompleted(deck, undefined, 40)
  expect(deck.main.spans[1]).toEqual({ model: 'claude-opus-5-5', from: 30, to: 40 })
  expect(deck.tokens).toEqual({ fable: 120, opus: 50 })
})

test('spans: an agent runs one span from spawn to end; its tokens add to its family', () => {
  let deck = agentSpawned(initialDeck(), { agentId: 'a', model: 'claude-sonnet-5-5', subagentType: 'Explore' }, 5)
  deck = stepCompleted(deck, { agentId: 'a', model: 'claude-sonnet-5-5' }, { input_tokens: 7, output_tokens: 3 }, 8)
  expect(deck.agents[0]?.spans).toEqual([{ model: 'claude-sonnet-5-5', from: 5, to: null }])
  deck = agentEnded(deck, 'a', null, 12)
  expect(deck.agents[0]?.spans).toEqual([{ model: 'claude-sonnet-5-5', from: 5, to: 12 }])
  expect(deck.tokens).toEqual({ sonnet: 10 })
})

test('log paths: relative inside the worktree, ~ under home, others as they are', () => {
  expect(shownPath('/home/me/wt/TKT-1/src/a.ts', '/home/me/wt/TKT-1', '/home/me')).toBe('src/a.ts')
  expect(shownPath('/home/me/.claude/x.md', '/home/me/wt/TKT-1', '/home/me')).toBe('~/.claude/x.md')
  expect(shownPath('/etc/hosts', '/home/me/wt/TKT-1', '/home/me')).toBe('/etc/hosts')
  expect(shownPath('/home/me/wt/TKT-10/a', '/home/me/wt/TKT-1', null)).toBe('/home/me/wt/TKT-10/a')
  expect(actionLine('Read', shownInput({ file_path: '/home/me/wt/TKT-1/NOTES.md' }, '/home/me/wt/TKT-1', '/home/me'))).toBe('Read NOTES.md')
})
