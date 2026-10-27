import { expect, mock, test } from 'claude-code/testing'

import { textLines } from './repoGit'

// Decision 066: after a hot reload, a plain session Tower was placed in (`inPlace` and the free `sessionConfig` kept in
// host state) is placed again before the new module's session.start: its spawns are routed by the free routing and its
// deck draws the free session. One test per file: the module instance must be fresh.

const HOME = '/home/test'
const ENGINE = { plugin: 'engine', tier: 'core' }

test('after a reload, a session placed by /tower stays placed: routed spawns, the free deck', async ($: any, on: any) => {
  mock.env(on, { HOME })
  mock.clock(on, { now: Date.parse('2026-10-13T12:00:00Z') })
  mock.store(on)
  const reads: string[] = []
  const reached: string[] = []
  on('session.id', async () => ({ value: 'plain-1' }))
  on('session.cwd' as any, async () => ({ value: `${HOME}/notes` }) as any)
  on('fs.read', async (_$: unknown, e: any) => {
    reads.push(e.path)
    return { deny: `ENOENT: ${e.path}` } as any
  })
  on('fs.exists', async () => ({ value: false }) as any)
  on('fs.write', async () => ({ value: undefined }) as any)
  on('process.run', async () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as any)
  on('agent.spawn', async (_$: unknown, e: any) => {
    reached.push(e.subagentType)
    return { model: 'claude-haiku-4-5', agentId: `a${reached.length}` }
  })
  on('state.get', async (_$: unknown, e: any, next: any) => (e.plugin === 'tower' && e.key === 'inPlace'
    ? { value: { value: true, version: 1 } }
    : e.plugin === 'tower' && e.key === 'sessionConfig'
      ? { value: { value: { mode: 'free', mainCheckout: null }, version: 1 } }
      : next(e)))
  await $.agent.spawn({ prompt: 'Find the notes.', description: 'Find notes', subagentType: 'Explore', provider: ENGINE, fork: false, background: false })
  expect(reached).toEqual(['tower:scout'])
  // Every free Tower's routing file.
  expect(reads).toContain(`${HOME}/.claude/tower/routing/free.json`)
  const deck = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'deck', props: { bodyColumns: 66 } } as any)
  expect(textLines(await deck.drawn()).join('\n')).toMatch(/session · /)
  await deck.unmount()
})
