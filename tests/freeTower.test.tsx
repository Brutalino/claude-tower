import { expect, mock, test } from 'claude-code/testing'

import { validateConfig } from '../hooks/core/config'
import { FREE_CONFIG } from '../hooks/core/configs/free'
import { freeHeader, newSessionChoices } from '../hooks/core/freeSessions'
import { defaultsProfile } from '../hooks/core/routingDefaults'
import { freeOverridesPath, routingRows } from '../hooks/core/routingOverrides'
import { branchOfFolder, parseWorktreePorcelain } from '../hooks/core/worktrees'
import { textLines } from './repoGit'

// Decision 060: a folder with no project opens a free Tower (TOWER_MODE=free, socket tower-free-<id>): no tickets, no
// Linear, no workflow; the rail is `+ new session`, SESSIONS and, in git, OTHER BRANCHES; one free session opens at launch.

const HOME = '/home/test'
const STATE = '/state/tower'
const SOCKET = 'tower-free-k3x9a1'
const NOW = Date.parse('2026-10-13T12:00:00Z')

type Calls = { argv: string[][]; tmux: string[][]; reads: string[]; fetches: number }

/** A free Tower's rail in `folder`; `git`: the folder's worktree listing when it is in a git work tree, else none. */
function freeRail(on: any, folder: string, git: string | null): Calls {
  mock.env(on, { TOWER_ROLE: 'rail', TOWER_MODE: 'free', TOWER_REPO: folder, TOWER_PLUGIN_DIR: '/plugins/tower', HOME, TMUX_PANE: '%0',
    TOWER_STATE_DIR: STATE, TOWER_TMUX_SOCKET: SOCKET, LINEAR_API_KEY: 'lin_never_used' })
  mock.clock(on, { now: NOW })
  mock.store(on)
  const calls: Calls = { argv: [], tmux: [], reads: [], fetches: 0 }
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.id', async () => ({ value: 'rail-1' }))
  on('session.cwd' as any, async () => ({ value: folder }) as any)
  on('command.register' as any, async () => ({ value: undefined }) as any)
  on('command.list', async () => ({ value: [] }) as any)
  on('ui.focus', async () => ({}))
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.exists', async (_$: unknown, e: any) => ({ value: git !== null && e.path === `${folder}/.git` }) as any)
  on('fs.list', async () => ({ value: [] }) as any)
  on('fs.read', async (_$: unknown, e: any) => {
    calls.reads.push(e.path)
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
      return ok(command === 'display-message' ? '@0' : command === 'list-panes' ? '%0\t@0\trail\t\t' : command === 'split-window' || command === 'new-window' ? '%5' : '')
    }
    calls.argv.push(argv)
    if (git !== null && argv.join(' ') === 'git worktree list --porcelain') return ok(git)
    return { value: { exitCode: 1, stdout: '', stderr: 'not here' } } as any
  })
  return calls
}

async function startRail($: any, folder: string) {
  await $.session.start({ cwd: folder, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 } } })
  await ui.press({ key: 'refresh' })
  return ui
}

/** The tmux command that opened a free session: its role, mode and folder. */
function freeOpen(calls: Calls): string[] | undefined {
  return calls.tmux.find(argv => argv.includes('TOWER_ROLE=free'))
}

test('the free configuration validates: no tickets, no workflow, no repository actions, Tower defaults', async () => {
  expect(validateConfig(FREE_CONFIG)).toEqual({ ok: true, config: FREE_CONFIG })
  expect(FREE_CONFIG.tickets).toEqual({ kind: 'none' })
  expect(FREE_CONFIG.workflow.steps).toEqual({})
  expect(FREE_CONFIG.repoActions).toEqual([])
  expect(FREE_CONFIG.routing).toBe('defaults')
})

test('a configuration with tickets still needs a start step', async () => {
  const result = validateConfig({ ...FREE_CONFIG, tickets: { kind: 'github', repo: 'o/r', labels: { kinds: {}, defaultKind: 'feature' }, mineFirst: false,
    idPattern: { source: '(\\d+)', flags: '' }, folderPattern: { source: '(\\d+)', flags: '' } } })
  expect(result.ok ? [] : result.errors).toContain('workflow.steps: missing start')
})

test('the header, the folder choice, the branch of a folder, the shared overrides file', async () => {
  expect(freeHeader('/home/test/Downloads', null)).toBe('Downloads · free')
  expect(freeHeader('/r/notes', 'main')).toBe('notes · free · main')
  expect(newSessionChoices('/home/test/Downloads', null, 'this folder')).toEqual([{ key: 'm', label: 'this folder', path: '/home/test/Downloads' }])
  const entries = parseWorktreePorcelain('worktree /r/app\nHEAD a\nbranch refs/heads/main\n\nworktree /r/app-x\nHEAD b\nbranch refs/heads/feature/x\n')
  expect(branchOfFolder(entries, '/r/app/src')).toBe('main')
  expect(branchOfFolder(entries, '/r/app-x')).toBe('feature/x')
  expect(branchOfFolder(entries, '/elsewhere')).toBe(null)
  expect(freeOverridesPath('/state/tower/')).toBe('/state/tower/routing/free.json')
})

test('the routing view of a free Tower: new session and the subagents, no skills', async () => {
  expect([...new Set(routingRows(defaultsProfile(FREE_CONFIG, [])).map(row => row.group))]).toEqual(['SESSIONS', 'SUBAGENTS'])
})

test('a free Tower outside git: no git, no gh, no Linear; + new session; one free session opened in the folder', async ($: any, on: any) => {
  const folder = `${HOME}/Downloads`
  const calls = freeRail(on, folder, null)
  const ui = await startRail($, folder)
  const text = textLines(await ui.drawn()).join('\n')
  expect(text).toContain('Downloads · free')
  expect(text).toContain('+ new session')
  expect(text).not.toMatch(/IN PROGRESS|OPEN ISSUES|OTHER BRANCHES|no open issues|git failed|skills|board/)
  expect(calls.argv.filter(argv => argv[0] === 'git' || argv[0] === 'gh')).toEqual([])
  expect(calls.fetches).toBe(0)
  // The launch's own free session: in the folder, free, on this Tower's socket.
  const opened = freeOpen(calls)
  expect(opened).toBeDefined()
  expect(opened!.slice(0, 3)).toEqual(['tmux', '-L', SOCKET])
  expect(opened).toContain('TOWER_MODE=free')
  expect(opened).toContain(`TOWER_TMUX_SOCKET=${SOCKET}`)
  expect(opened![opened!.indexOf('-c') + 1]).toBe(folder)
  expect(calls.tmux.filter(argv => argv.includes('TOWER_ROLE=free')).length).toBe(1)
  // Its model: every free Tower's routing file, never a project's.
  expect(calls.reads.filter(path => path.includes('/routing/'))).toEqual(calls.reads.filter(path => path === `${STATE}/routing/free.json`))
  expect(calls.reads).toContain(`${STATE}/routing/free.json`)
})

test('a free Tower in a git folder: its branch in the header, OTHER BRANCHES open free sessions; no gh, no Linear', async ($: any, on: any) => {
  const folder = '/r/notes'
  const listing = `worktree ${folder}\nHEAD a000\nbranch refs/heads/main\n\nworktree /r/notes-spike\nHEAD b000\nbranch refs/heads/spike/idea\n`
  const calls = freeRail(on, folder, listing)
  const ui = await startRail($, folder)
  const text = textLines(await ui.drawn()).join('\n')
  expect(text).toContain('notes · free · main')
  expect(text).toContain('OTHER BRANCHES')
  expect(text).toContain('spike/idea')
  expect(text).not.toMatch(/IN PROGRESS|OPEN ISSUES/)
  expect(calls.argv.filter(argv => argv[0] === 'gh')).toEqual([])
  expect(calls.argv.filter(argv => argv[0] === 'git').map(argv => argv.join(' ')).every(line => line === 'git worktree list --porcelain')).toBe(true)
  expect(calls.fetches).toBe(0)
  const before = calls.tmux.filter(argv => argv.includes('TOWER_ROLE=free')).length
  await ui.press({ key: 'row:other:notes-spike' })
  const spike = calls.tmux.filter(argv => argv.includes('TOWER_ROLE=free'))
  expect(spike.length).toBe(before + 1)
  const last = spike[spike.length - 1]!
  expect(last[last.indexOf('-c') + 1]).toBe('/r/notes-spike')
  expect(calls.tmux.some(argv => argv.includes('TOWER_ROLE=ticket'))).toBe(false)
})
