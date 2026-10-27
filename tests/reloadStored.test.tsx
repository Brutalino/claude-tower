import { expect, test } from 'claude-code/testing'

import { REPO, repoGitRail, textLines } from './repoGit'

// Decision 063: a hot reload starts the module over (its variables at ShopApp) while host state stays. The kept
// `sessionConfig` key brings an oink rail (a stored configuration) back before any session.start of the new module.
// One test per file: a file's tests share one module instance, and this one must be fresh.

test('after a reload, an oink rail keeps its stored configuration: no session start, no Linear, oink\'s header and ids', async ($: any, on: any) => {
  const calls = repoGitRail(on)
  let fetches = 0
  on('http.fetch', async () => {
    fetches += 1
    return { deny: 'no network in tests' } as any
  })
  on('session.id', async () => ({ value: 'rail-1' }))
  // The host state the previous module wrote at its session.start.
  on('state.get', async (_$: unknown, e: any, next: any) => (e.plugin === 'tower' && e.key === 'sessionConfig'
    ? { value: { value: { mode: 'stored', mainCheckout: REPO }, version: 1 } }
    : next(e)))
  // A prompt hook first: oink's ids are `#n`, so `#26` moves the board (ShopApp would filter on it).
  const submitted = await $.prompt.submit({ text: '#26', wait: false, origin: { kind: 'composer' } } as any)
  expect(JSON.stringify(submitted)).toContain('tower board → #26')
  const rail = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 40, scroll: { bodyRows: 30 } } } as any)
  await rail.press({ key: 'refresh' })
  const text = textLines(await rail.drawn()).join('\n')
  expect(text).toContain('fixture/oink · main')
  expect(text).not.toMatch(/TKT-|Linear/)
  expect(fetches).toBe(0)
  expect(calls.argv).toContainEqual(['gh', 'issue', 'list', '--repo', 'fixture/oink', '--state', 'open', '--limit', '100', '--json', 'number,title,labels,assignees,updatedAt,body,url'])
  // Taken from the key: the folder was not resolved again (no origin asked).
  expect(calls.argv.some(argv => argv.join(' ') === 'git remote get-url origin')).toBe(false)
  await rail.unmount()
})
