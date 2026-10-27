import { expect, mock, test } from 'claude-code/testing'

import { PROFILE, withLinearGit, withStoredLinear } from './linearConfig'
import { textLines } from './repoGit'

const TICKET_ENV = { TOWER_ROLE: 'ticket', TOWER_TICKET: 'TKT-1', TOWER_REPO: '/repo', HOME: '/home/test' }
const ENGINE = { plugin: 'engine', tier: 'core' }
const SONNET = 'claude-sonnet-4-6'
const SURFACES = ['terminal', 'desktop'] as const

function spawnOf(subagentType: string, extra: Record<string, unknown> = {}) {
  return { prompt: 'Find the notes.', description: 'Find notes', subagentType, provider: ENGINE, fork: false, background: false, ...extra }
}

/** A ticket session whose engine records every spawn that reaches it. */
function ticketSession(on: any, env: Record<string, string> = TICKET_ENV) {
  mock.env(on, env)
  mock.clock(on, { now: 1_000_000 })
  // The ticket's project: LINEAR_CONFIG stored for /repo, with or without an edition.
  on('process.run', withLinearGit('/repo'))
  on('fs.read', withStoredLinear('/repo'))
  on('session.cwd', async () => ({ value: '/wt/tkt-1' }))
  on('fs.write', async () => ({ value: undefined }) as any)
  const reached: { subagentType: string; model?: string }[] = []
  on('agent.spawn', async (_$: unknown, e: any) => {
    reached.push({ subagentType: e.subagentType, model: e.model })
    return { model: e.model === 'sonnet' || e.subagentType === 'tower:scout' ? SONNET : 'claude-haiku-4-5', agentId: `a${reached.length}` }
  })
  return reached
}

const mountDeck = ($: any, surface: string) =>
  $.ui.mount({ plugin: 'tower', surface, component: 'Pane', requestId: 'deck', props: { bodyColumns: 66 } } as any)

test('enforce: Explore reaches the engine as tower:scout', async ($: any, on: any) => {
  const reached = ticketSession(on)
  await $.agent.spawn(spawnOf('Explore'))
  expect(reached).toEqual([{ subagentType: 'tower:scout', model: undefined }])
})

test('enforce: general-purpose reaches the engine with model sonnet', async ($: any, on: any) => {
  const reached = ticketSession(on)
  await $.agent.spawn(spawnOf('general-purpose'))
  expect(reached).toEqual([{ subagentType: 'general-purpose', model: 'sonnet' }])
})

test('enforce: a fork is denied with the advice and never reaches the engine', async ($: any, on: any) => {
  const reached = ticketSession(on)
  const result = await $.agent.spawn(spawnOf('fork', { fork: true }))
  expect(result).toEqual({ deny: PROFILE.forkAdvice })
  expect(reached).toEqual([])
})

test("enforce: a user's own agent type passes untouched", async ($: any, on: any) => {
  const reached = ticketSession(on)
  await $.agent.spawn(spawnOf('Explore', { provider: { plugin: 'userSettings', tier: 'user' } }))
  await $.agent.spawn(spawnOf('my-reviewer', { provider: { plugin: 'userSettings', tier: 'user' } }))
  expect(reached).toEqual([{ subagentType: 'Explore', model: undefined }, { subagentType: 'my-reviewer', model: undefined }])
})

test('outside an tower session nothing is routed', async ($: any, on: any) => {
  const reached = ticketSession(on, { HOME: '/home/test' })
  await $.agent.spawn(spawnOf('Explore'))
  expect(reached).toEqual([{ subagentType: 'Explore', model: undefined }])
})

test('observe: nothing changes, the decisions are recorded', { options: { routing: 'observe' } }, async ($: any, on: any) => {
  const reached = ticketSession(on)
  await $.agent.spawn(spawnOf('Explore'))
  await $.agent.spawn(spawnOf('general-purpose'))
  const fork = await $.agent.spawn(spawnOf('fork', { fork: true }))
  expect(reached).toEqual([
    { subagentType: 'Explore', model: undefined },
    { subagentType: 'general-purpose', model: undefined },
    { subagentType: 'fork', model: undefined },
  ])
  expect((fork as { deny?: string }).deny).toBeUndefined()
  const ui = await mountDeck($, 'terminal')
  await ui.press({ key: 'view:routing' })
  expect(await ui.find({ type: 'Text', text: /^ROUTING · rules observed$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^2 rerouted$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\d\d:\d\d:\d\d  fork → denied$/ })).toBeDefined()
  await ui.unmount()
})

test('off: nothing is routed and the deck has no routing panel', { options: { routing: 'off' } }, async ($: any, on: any) => {
  const reached = ticketSession(on)
  await $.agent.spawn(spawnOf('Explore'))
  expect(reached).toEqual([{ subagentType: 'Explore', model: undefined }])
  const ui = await mountDeck($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /^routing$/ })).toBeUndefined()
  await ui.unmount()
})

for (const surface of SURFACES) {
  test(`the deck's routing panel draws the counts, the roles and the last decision (${surface})`, async ($: any, on: any) => {
    ticketSession(on)
    let ui = await mountDeck($, surface)
    await ui.press({ key: 'view:routing' })
    expect(await ui.find({ type: 'Text', text: /^ROUTING · rules on$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^0 rerouted$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^no decision yet$/ })).toBeDefined()
    // Decision 056: SESSIONS, SKILLS and SUBAGENTS, one Button per row.
    expect(await ui.find({ type: 'Text', text: /^SUBAGENTS$/ })).toBeDefined()
    expect((await ui.find({ key: 'route:role:scout' }))?.text).toBe('scout')
    expect((await ui.find({ key: 'route:skill:start-ticket' }))?.text).toBe('/start-ticket')
    expect(await ui.find({ key: 'agent:a1' })).toBeUndefined()
    await ui.unmount()

    await $.agent.spawn(spawnOf('Explore'))
    await $.agent.spawn(spawnOf('fork', { fork: true }))
    await $.agent.spawn(spawnOf('general-purpose'))
    ui = await mountDeck($, surface)
    expect(await ui.find({ type: 'Text', text: /^2 rerouted$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /  general-purpose → sonnet-4\.6$/ })).toBeDefined()
    await ui.press({ key: 'view:agents' })
    expect((await ui.find({ key: 'agent:a1' }))?.text).toContain('scout')
    await ui.unmount()
  })

  test(`the agents view has no routing panel; the log view shows the session log and the gate (${surface})`, async ($: any, on: any) => {
    ticketSession(on)
    await $.agent.spawn(spawnOf('Explore'))
    const ui = await $.ui.mount({ plugin: 'tower', surface, component: 'Pane', requestId: 'deck', props: { bodyColumns: 66, scroll: { bodyRows: 30 } } } as any)
    expect(await ui.find({ type: 'Text', text: /^ROUTING/ })).toBeUndefined()
    expect(await ui.find({ key: 'agent:a1' })).toBeDefined()
    await ui.press({ key: 'view:log' })
    expect(await ui.find({ type: 'Text', text: /^session log$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^GATE · permissions$/ })).toBeDefined()
    expect(await ui.find({ key: 'agent:a1' })).toBeUndefined()
    await ui.unmount()
  })
}

const COMPOSE = { model: 'claude-haiku-4-5', promptModel: 'claude-haiku-4-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] }
const BASE = [{ id: 'intro', text: 'intro', scope: 'shared' }, { id: 'env', text: 'env', scope: 'session' }]

function composer(on: any, env: Record<string, string>) {
  mock.env(on, env)
  on('process.run', withLinearGit('/repo'))
  on('fs.read', withStoredLinear('/repo'))
  on('session.cwd', async () => ({ value: '/wt/tkt-1' }))
  on('prompt.compose', async () => ({ sections: BASE }))
}

test('prompt.compose: a ticket session gets the delegation section, then the pins paragraph (decision 036)', async ($: any, on: any) => {
  composer(on, TICKET_ENV)
  const result = await $.prompt.compose(COMPOSE as any)
  expect(result.sections.map((section: any) => section.id)).toEqual(['intro', 'env', 'tower:routing', 'tower:pins'])
  expect(result.sections[2]).toEqual({ id: 'tower:routing', text: PROFILE.mainGuidance, scope: 'session' })
})

test('prompt.compose: the review session gets the review delegation section, not the generic one', async ($: any, on: any) => {
  composer(on, { ...TICKET_ENV, TOWER_ROLE: 'review', TOWER_WORKTREE: '/wt/TKT-1/' })
  const result = await $.prompt.compose(COMPOSE as any)
  const routing = result.sections.filter((section: any) => section.id === 'tower:routing')
  expect(routing).toEqual([{ id: 'tower:routing', text: PROFILE.reviewGuidance.replaceAll('<worktree>', '/wt/TKT-1'), scope: 'session' }])
  // The file's absolute path in the ticket's worktree, not the review session's own folders.
  expect(routing[0].text).toContain('`/wt/TKT-1/.work/review/pr-<n>-round-<N>.md`')
  expect(routing[0].text).not.toBe(PROFILE.mainGuidance)
  expect(routing[0].text).toContain('# Delegation for a review')
})

test('prompt.compose: a session without a role is left as it is', async ($: any, on: any) => {
  composer(on, { HOME: '/home/test' })
  const result = await $.prompt.compose(COMPOSE as any)
  expect(result.sections).toEqual(BASE)
})

test('prompt.compose: routing off adds no routing section; the pins paragraph stays', { options: { routing: 'off' } }, async ($: any, on: any) => {
  composer(on, TICKET_ENV)
  const result = await $.prompt.compose(COMPOSE as any)
  expect(result.sections.filter((section: any) => section.id !== 'tower:pins')).toEqual(BASE)
})

test('the routing view (decision 056): a row is chosen, j cycles its model, e its effort, d resets it; the file is written only then', async ($: any, on: any) => {
  const STATE = '/state/tower'
  const FILE = `${STATE}/routing/-repo.json`
  mock.env(on, { ...TICKET_ENV, TOWER_STATE_DIR: STATE })
  mock.clock(on, { now: 1_000_000 })
  const files: Record<string, string> = {}
  const writes: string[] = []
  on('fs.write', async (_$: unknown, e: any) => {
    writes.push(String(e.path))
    files[String(e.path)] = String(e.text ?? e.content ?? '')
    return { value: undefined } as any
  })
  on('session.cwd', async () => ({ value: '/wt/tkt-1' }))
  on('fs.read', withStoredLinear('/repo', async (_$: unknown, e: any) => (e.path in files ? { value: files[e.path] } : { deny: `ENOENT: ${e.path}` }) as any))
  on('process.run', withLinearGit('/repo', async (_$: unknown, e: any) => {
    // The temporary file moved over the real one.
    if (e.argv[0] === 'mv') {
      files[e.argv[3]] = files[e.argv[2]]!
      delete files[e.argv[2]]
    }
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as any
  }))
  on('ui.focus', async () => ({}) as any)
  on('session.id' as any, async () => ({ value: 'sid-1' }) as any)
  const ui = await mountDeck($, 'terminal')
  await ui.press({ key: 'view:routing' })
  for (const group of ['SESSIONS', 'SKILLS', 'SUBAGENTS']) expect(await ui.find({ type: 'Text', text: new RegExp(`^${group}$`) })).toBeDefined()
  expect((await ui.find({ key: 'route:free' }))?.text).toBe('new session')
  expect((await ui.find({ key: 'routekey:model' }))?.props.hotkey).toBe('j')
  expect((await ui.find({ key: 'routekey:effort' }))?.props.hotkey).toBe('e')
  expect((await ui.find({ key: 'routekey:reset' }))?.props.hotkey).toBe('d')
  expect(await ui.find({ type: 'Text', text: /^ · applies to sessions started from now$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: / ●$/ })).toBeUndefined()
  expect(writes).toEqual([])

  // runner: haiku, no effort on the table.
  await ui.press({ key: 'route:role:runner' })
  await ui.press({ key: 'routekey:model' })
  expect(JSON.parse(files[FILE]!)).toEqual({ skills: {}, roles: { runner: { model: null } }, free: {} })
  expect(await ui.find({ type: 'Text', text: /^ \(Haiku 5\.5\)$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ ●$/ })).toBeDefined()
  expect(textLines(await ui.drawn()).join('\n')).toContain('▸ \nrunner\ndefault\n ●\n (Haiku 5.5)\ndefault')
  await ui.press({ key: 'routekey:effort' })
  expect(JSON.parse(files[FILE]!)).toEqual({ skills: {}, roles: { runner: { model: null, effort: 'low' } }, free: {} })
  await ui.press({ key: 'routekey:reset' })
  expect(JSON.parse(files[FILE]!)).toEqual({ skills: {}, roles: {}, free: {} })
  expect(await ui.find({ type: 'Text', text: / ●$/ })).toBeUndefined()
  // Only the file and its temporary twin, written once per key.
  expect(writes).toEqual([`${FILE}.sid-1.tmp`, `${FILE}.sid-1.tmp`, `${FILE}.sid-1.tmp`])
  await ui.unmount()
})
