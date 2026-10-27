import { expect, test } from 'claude-code/testing'

import { envState, mergeEnv, parseComposePs, parseEnv } from '../hooks/core/devEnv'
import type { ComposeStack, DevEnv } from '../hooks/core/devEnv'

// Decision 073: the compose stack docker runs for the worktree, merged with the state file's env.

const SLOTS = { first: 5173, slots: 7 }
const WT = '/home/me/legacy-work/TKT-2603'
const PS = [
  `shopapp-tkt-2603|${WT}|frontend|0.0.0.0:5174->5173/tcp, [::]:5174->5173/tcp`,
  `shopapp-tkt-2603|${WT}|backend|0.0.0.0:3001->3000/tcp, [::]:3001->3000/tcp`,
  `shopapp-tkt-2603|${WT}|postgres|127.0.0.1:5434->5432/tcp`,
  `shopapp-tkt-2603|${WT}|redpanda|8081-8082/tcp, 9092/tcp, 9644/tcp, 127.0.0.1:19093->19092/tcp`,
  `shopapp-tkt-2637|/home/me/legacy-work/TKT-2637|frontend|0.0.0.0:5175->5173/tcp, [::]:5175->5173/tcp`,
  '',
].join('\n')

const fileEnv = (env: Record<string, unknown>): DevEnv | null => parseEnv(JSON.stringify({ env }))
const stack = (frontendPort: number | null, project = 'shopapp-tkt-2603'): ComposeStack => ({ project, services: ['frontend'], frontendPort })

test('parseComposePs: the frontend service host port, IPv4 and IPv6 alike', () => {
  expect(parseComposePs(PS, WT, SLOTS)).toEqual({ project: 'shopapp-tkt-2603', services: ['frontend', 'backend', 'postgres', 'redpanda'], frontendPort: 5174 })
  expect(parseComposePs(`p|${WT}|frontend|[::]:5176->5173/tcp`, WT, SLOTS)?.frontendPort).toBe(5176)
  // A trailing slash on either side is the same folder.
  expect(parseComposePs(PS, `${WT}/`, SLOTS)?.project).toBe('shopapp-tkt-2603')
  expect(parseComposePs(PS.replaceAll(`|${WT}|`, `|${WT}/|`), WT, SLOTS)?.frontendPort).toBe(5174)
})

test('parseComposePs: without a frontend service, the first published port in the slots; none: null', () => {
  const web = `p|${WT}|backend|0.0.0.0:3001->3000/tcp\np|${WT}|web|0.0.0.0:5177->5173/tcp, [::]:5177->5173/tcp`
  expect(parseComposePs(web, WT, SLOTS)?.frontendPort).toBe(5177)
  expect(parseComposePs(web, WT, null)?.frontendPort).toBe(null)
  expect(parseComposePs(`p|${WT}|postgres|127.0.0.1:5434->5432/tcp`, WT, SLOTS)).toEqual({ project: 'p', services: ['postgres'], frontendPort: null })
})

test('parseComposePs: another worktree, a prefix of it or nothing is no stack', () => {
  expect(parseComposePs(PS, '/home/me/legacy-work/TKT-9999', SLOTS)).toBe(null)
  expect(parseComposePs(PS, '/home/me/legacy-work', SLOTS)).toBe(null)
  expect(parseComposePs(PS, '/home/me/legacy-work/TKT-26', SLOTS)).toBe(null)
  expect(parseComposePs(PS, '/home/me/legacy-work/TKT-2637', SLOTS)?.frontendPort).toBe(5175)
  expect(parseComposePs('', WT, SLOTS)).toBe(null)
  expect(parseComposePs('\n', WT, SLOTS)).toBe(null)
})

test('parseEnv keeps the skill\'s failed and the project', () => {
  expect(fileEnv({ status: 'failed', frontendUrl: 'http://localhost:5174' })?.status).toBe('failed')
  expect(fileEnv({ status: 'weird' })?.status).toBe('down')
  expect(fileEnv({ project: 'shopapp-tkt-2603', status: 'up' })?.project).toBe('shopapp-tkt-2603')
  expect(fileEnv({ status: 'up' })?.project).toBe(null)
})

test('mergeEnv: docker unknown is the file alone, as before', () => {
  const up = fileEnv({ frontendUrl: 'http://localhost:5174', status: 'up' })
  const failed = fileEnv({ frontendUrl: 'http://localhost:5174', status: 'failed' })
  expect(mergeEnv(up, 'unknown')).toBe(up)
  expect(mergeEnv(failed, 'unknown')).toBe(failed)
  expect(mergeEnv(null, 'unknown')).toBe(null)
  expect(envState(mergeEnv(up, 'unknown'), true, null, 0)).toBe('up')
  expect(envState(mergeEnv(failed, 'unknown'), false, null, 0)).toBe('stopped')
})

test('mergeEnv: TKT-2603, the file says failed and the stack runs on 5174: up, the failure kept', () => {
  const file = fileEnv({ project: 'shopapp-tkt-2603', frontendUrl: 'http://localhost:5174', ports: { frontend: 5174 }, status: 'failed', startedAt: '2026-10-16T06:41:43Z' })
  const env = mergeEnv(file, parseComposePs(PS, WT, SLOTS))
  expect(env).toEqual({
    frontendUrl: 'http://localhost:5174', frontendPort: 5174, status: 'up', loginVerified: false, startedAt: Date.parse('2026-10-16T06:41:43Z'),
    project: 'shopapp-tkt-2603', source: 'file', fileStatus: 'failed',
  })
  expect(envState(env, true, null, 0)).toBe('up')
  expect(envState(env, false, null, 0)).toBe('starting')
})

test('mergeEnv: a running stack the file does not describe is up from docker, without login or start time', () => {
  const none = mergeEnv(null, stack(5174))
  expect(none).toEqual({ frontendUrl: 'http://localhost:5174', frontendPort: 5174, status: 'up', loginVerified: false, startedAt: null, project: 'shopapp-tkt-2603', source: 'docker' })
  // A file of another project on another port: its URL, login and start time are not this stack's.
  const other = fileEnv({ project: 'shopapp-old', frontendUrl: 'http://localhost:5178', status: 'up', loginVerified: true, startedAt: 1000 })
  expect(mergeEnv(other, stack(5174))).toEqual({
    frontendUrl: 'http://localhost:5174', frontendPort: 5174, status: 'up', loginVerified: false, startedAt: null,
    project: 'shopapp-tkt-2603', source: 'docker', fileStatus: 'up',
  })
})

test('mergeEnv: the same project on a new port keeps the login and start time, the URL is the stack\'s', () => {
  const file = fileEnv({ project: 'shopapp-tkt-2603', frontendUrl: 'http://localhost:5178', status: 'up', loginVerified: true, startedAt: 1000 })
  const env = mergeEnv(file, stack(5174))
  expect(env?.frontendUrl).toBe('http://localhost:5174')
  expect(env?.loginVerified).toBe(true)
  expect(env?.startedAt).toBe(1000)
  expect(env?.source).toBe('file')
  // The same port with no project in the file is the same stack too.
  const byPort = mergeEnv(fileEnv({ frontendUrl: 'http://127.0.0.1:5174', status: 'down', loginVerified: true, startedAt: 2000 }), stack(5174))
  expect(byPort).toMatchObject({ frontendUrl: 'http://127.0.0.1:5174', status: 'up', loginVerified: true, startedAt: 2000, source: 'file', fileStatus: 'down' })
})

test('mergeEnv: a running stack with no frontend port is up with no URL, which the box shows as starting', () => {
  const env = mergeEnv(null, stack(null))
  expect(env).toMatchObject({ frontendUrl: '', frontendPort: null, status: 'up', project: 'shopapp-tkt-2603', source: 'docker' })
  expect(envState(env, false, null, 0)).toBe('starting')
})

test('mergeEnv: docker answered with no stack: a file still up is stale, anything else as the file says', () => {
  const up = fileEnv({ frontendUrl: 'http://localhost:5174', status: 'up', loginVerified: true })
  const stale = mergeEnv(up, null)
  expect(stale).toMatchObject({ status: 'down', fileStatus: 'up', frontendUrl: 'http://localhost:5174' })
  expect(envState(stale, true, null, 0)).toBe('stopped')
  const failed = fileEnv({ frontendUrl: 'http://localhost:5174', status: 'failed' })
  expect(mergeEnv(failed, null)).toBe(failed)
  expect(envState(mergeEnv(failed, null), false, null, 0)).toBe('stopped')
  const down = fileEnv({ status: 'down' })
  expect(mergeEnv(down, null)).toBe(down)
  expect(mergeEnv(null, null)).toBe(null)
  expect(envState(mergeEnv(null, null), false, null, 0)).toBe('none')
})
