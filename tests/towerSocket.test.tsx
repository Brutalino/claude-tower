import { expect, test } from 'claude-code/testing'

import { REPO, repoGitRail, STATE, textLines } from './repoGit'

// Decision 059: every Tower runs on its own tmux socket (ShopApp `tower`, a project `tower-<slug>`), all of them
// writing to one state dir. The rail's `q` `y` closes its own server only, and its SESSIONS list shows its own sessions.

const NOW = Date.parse('2026-10-12T12:00:00Z')
const SOCKET = 'tower-money-tracker'
const free = (id: string, title: string, socket?: string) => ({
  v: 1, id: `sid-${id}`, role: 'free', ticket: id, cwd: REPO, pane: null, state: 'idle', since: NOW - 60_000, updatedAt: NOW - 1_000, title,
  ...(socket !== undefined ? { socket } : {}),
})

test('q then y kills only this Tower server, by its own socket', async ($: any, on: any) => {
  const calls = repoGitRail(on, { env: { TOWER_TMUX_SOCKET: SOCKET } })
  on('session.id', async () => ({ value: 'rail-1' }))
  on('ui.focus', async () => ({}))
  await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 } } })
  await ui.press({ key: 'quit' })
  expect(textLines(await ui.drawn()).join('\n')).toContain('close everything? yes')
  await ui.press({ key: 'quit:yes' })
  const kills = calls.tmux.filter(argv => argv.includes('kill-server'))
  expect(kills).toEqual([['tmux', '-L', SOCKET, 'kill-server']])
  // Every tmux call of this rail goes to its own socket.
  expect(calls.tmux.every(argv => argv[1] === '-L' && argv[2] === SOCKET)).toBe(true)
})

test('the SESSIONS list shows this Tower sessions and older records, never another Tower', async ($: any, on: any) => {
  const own = free('free-0000000a', 'own notes', SOCKET)
  const old = free('free-0000000b', 'older record')
  const other = free('free-0000000c', 'shopapp notes', 'tower')
  const files = Object.fromEntries([own, old, other].map(record => [`${STATE}/sessions/${record.id}.json`, JSON.stringify(record)]))
  repoGitRail(on, { env: { TOWER_TMUX_SOCKET: SOCKET }, issues: [], files, sessions: [own, old, other].map(record => `${record.id}.json`) })
  on('session.id', async () => ({ value: 'rail-1' }))
  on('ui.focus', async () => ({}))
  await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 } } })
  await ui.press({ key: 'refresh' })
  const text = textLines(await ui.drawn()).join('\n')
  expect(text).toContain('own notes')
  expect(text).toContain('older record')
  expect(text).not.toContain('shopapp notes')
})
