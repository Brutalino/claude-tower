import { expect, mock, test } from 'claude-code/testing'

import { newDesignState } from '../hooks/core/design'
import { textLines } from './repoGit'

// Decision 064 with decision 063: after a hot reload a design Tower's rail stays a design Tower (the kept `sessionConfig`
// key `design`), with no session.start of the new module: its path, + prototype, no Linear, no git. One test per file: a
// file's tests share one module instance, and this one must be fresh.

const HOME = '/home/test'
const STATE = '/state/tower'
const FOLDER = `${HOME}/Repositories/budget-app`

test('after a reload, a design rail stays design: no session start, no Linear, no git, its path and + prototype', async ($: any, on: any) => {
  mock.env(on, { TOWER_ROLE: 'rail', TOWER_MODE: 'design', TOWER_REPO: FOLDER, TOWER_PLUGIN_DIR: '/plugins/tower', HOME, TMUX_PANE: '%0',
    TOWER_STATE_DIR: STATE, TOWER_TMUX_SOCKET: 'tower-budget-app', LINEAR_API_KEY: 'lin_never_used' })
  mock.clock(on, { now: Date.parse('2026-10-13T12:00:00Z') })
  mock.store(on)
  const argv: string[][] = []
  const reads: string[] = []
  let fetches = 0
  const kept = newDesignState()
  kept.stages[0]!.status = 'done'
  kept.stages[1]!.status = 'active'
  kept.current = 2
  on('session.id', async () => ({ value: 'rail-1' }))
  on('session.cwd' as any, async () => ({ value: FOLDER }) as any)
  on('command.list', async () => ({ value: [] }) as any)
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.exists', async () => ({ value: false }) as any)
  on('fs.list', async () => ({ value: [] }) as any)
  on('fs.read', async (_$: unknown, e: any) => {
    reads.push(e.path)
    return { deny: `ENOENT: ${e.path}` } as any
  })
  on('http.fetch', async () => {
    fetches += 1
    return { deny: 'no network in tests' } as any
  })
  on('process.run', async (_$: unknown, e: any) => {
    argv.push([...e.argv])
    return { value: { exitCode: e.argv[0] === 'tmux' ? 0 : 1, stdout: '', stderr: '' } } as any
  })
  // What the previous module left in host state: the key, and the design state as the 2 s check last read it.
  on('state.get', async (_$: unknown, e: any, next: any) => (e.plugin === 'tower' && e.key === 'sessionConfig'
    ? { value: { value: { mode: 'design', mainCheckout: FOLDER }, version: 1 } }
    : e.plugin === 'tower' && e.key === 'design' ? { value: { value: { state: kept, docs: {} }, version: 1 } } : next(e)))
  const rail = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 } } } as any)
  await rail.press({ key: 'refresh' })
  const lines = textLines(await rail.drawn())
  const text = lines.join('\n')
  expect(text).toContain('new project · ~/Repositories/budget-app')
  expect(lines.some(line => /▶ ◆ 2 Research/.test(line))).toBe(true)
  expect(text).toContain('+ prototype')
  expect(text).not.toMatch(/ · free|IN PROGRESS|OPEN ISSUES|TKT-|Linear|board/)
  expect(fetches).toBe(0)
  expect(argv.filter(line => line[0] === 'git' || line[0] === 'gh')).toEqual([])
  // The free routing file, never a project's.
  expect(reads).toContain(`${STATE}/routing/free.json`)
  expect(reads.filter(path => path.includes('/routing/') && path !== `${STATE}/routing/free.json`)).toEqual([])
  await rail.unmount()
})
