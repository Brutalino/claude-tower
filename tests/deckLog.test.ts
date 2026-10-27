import { expect, test } from 'claude-code/testing'

import {
  agentSpawned,
  gateChecked,
  initialDeck,
  LOG_SIZE,
  logged,
  logWho,
  promptLogged,
  promptSubmitted,
  toolCounted,
  toolErrored,
  toolLogged,
  turnCompleted,
  turnStarted,
  usageRead,
  workReceipt,
} from '../hooks/core/deck'
import { deckRowsFit, logWindow } from '../hooks/core/deckView'
import { envActions, envPorts, envSlot as envSlotWith, envState, parseEnv, START_WAIT_MS } from '../hooks/core/devEnv'
import { demoDeck, demoDevEnv } from '../hooks/core/demo'
import { LINEAR_CONFIG } from './linearConfig'

const envSlot = (env: Parameters<typeof envSlotWith>[0]) => envSlotWith(env, envPorts(LINEAR_CONFIG.env))

test('the log keeps the last 200 entries, oldest first', () => {
  let deck = initialDeck()
  for (let i = 0; i < LOG_SIZE + 5; i++) deck = logged(deck, { at: i, who: 'main', text: `e${i}` })
  expect(deck.log?.length).toBe(LOG_SIZE)
  expect(deck.log?.[0]?.text).toBe('e5')
  expect(deck.log?.[LOG_SIZE - 1]?.text).toBe(`e${LOG_SIZE + 4}`)
})

test('a prompt is logged by main with its first 40 characters', () => {
  const deck = promptLogged(initialDeck(), 'Fix the offline alert\n  so that it is sent once per outage only', 7)
  expect(deck.log).toEqual([{ at: 7, who: 'main', text: 'prompt · Fix the offline alert so that it is sent' }])
})

test('a tool call is logged as the action line, by main or the agent', () => {
  const spawned = agentSpawned(initialDeck(), { agentId: 'a1', model: 'claude-opus-5-5', subagentType: 'executor', description: 'x', prompt: 'x' }, 0)
  const deck = toolLogged(toolLogged(spawned, undefined, 'Read', { file_path: 'a.ts' }, 1), 'a1', 'Edit', { file_path: 'src/b.ts' }, 2)
  expect(deck.log?.map(entry => `${entry.who} ${entry.text}`)).toEqual(['main Read a.ts', 'executor Edit src/b.ts'])
  expect(logWho(deck, 'gone')).toBe('gone')
})

test('edits and errors count in the work period; a new period resets them and keeps the cost at its start', () => {
  let deck = usageRead(initialDeck(), { context: {}, rateLimits: [], cost: 1.2 } as never)
  deck = { ...deck, usage: { ...deck.usage, cost: 1.2 } }
  deck = turnStarted(deck, 0)
  deck = toolCounted(deck, 'Edit', { result: 'ok' })
  deck = toolCounted(deck, 'Write', { result: 'ok' })
  deck = toolCounted(deck, 'Bash', { result: 'x', isError: true })
  deck = toolCounted(deck, 'Edit', { deny: 'no' })
  deck = toolCounted(deck, 'Read', { result: 'ok' })
  deck = { ...deck, usage: { ...deck.usage, cost: 1.72 } }
  deck = turnCompleted(deck, undefined, 1000, 1000)
  const receipt = workReceipt(deck)
  expect(receipt?.edits).toBe(2)
  expect(receipt?.errors).toBe(2)
  expect(receipt?.cost?.toFixed(2)).toBe('0.52')
  expect(turnStarted(promptSubmitted(deck, true), 2000).period).toEqual({ edits: 0, errors: 0, costAtStart: 1.72 })
  expect(toolErrored({ result: 'fine' })).toBe(false)
})

test('the gate counts every verdict and logs only asks and denies', () => {
  let deck = gateChecked(initialDeck(), 'allow', 'Read a.ts', 1)
  deck = gateChecked(deck, 'ask', 'Bash rm -rf dist', 2)
  deck = gateChecked(deck, 'deny', 'Bash git push --force', 3)
  expect(deck.gate).toEqual({ allowed: 1, asked: 1, denied: 1, recent: ['allow', 'ask', 'deny'] })
  expect(deck.log?.map(entry => `${entry.who} ${entry.text}`)).toEqual(['gate asked Bash rm -rf dist', 'gate denied Bash git push --force'])
})

test('parseEnv reads the dev-env contract and tolerates anything else', () => {
  const text = JSON.stringify({ env: { project: 'p', frontendUrl: 'http://localhost:5174', ports: { frontend: 5174, backend: 8001, postgres: 5433 }, status: 'up', loginVerified: true, startedAt: '2026-10-06T10:00:00Z' } })
  const env = parseEnv(text)
  expect(env?.status).toBe('up')
  expect(env?.loginVerified).toBe(true)
  expect(env !== null && envSlot(env)).toBe(2)
  expect(parseEnv(JSON.stringify({ env: null }))).toBe(null)
  expect(parseEnv('not json')).toBe(null)
  expect(parseEnv(undefined)).toBe(null)
  expect(parseEnv(JSON.stringify({ env: { frontendUrl: 'http://localhost:9999', status: 'down' } }))?.status).toBe('down')
})

test('envState: up only when the URL answers; a pressed start waits at most five minutes', () => {
  const up = parseEnv(JSON.stringify({ env: { frontendUrl: 'http://localhost:5173', status: 'up' } }))
  const down = parseEnv(JSON.stringify({ env: { frontendUrl: 'http://localhost:5173', status: 'down' } }))
  expect(envState(up, true, null, 0)).toBe('up')
  expect(envState(up, false, null, 0)).toBe('starting')
  expect(envState(down, false, null, 0)).toBe('stopped')
  expect(envState(null, false, null, 0)).toBe('none')
  expect(envState(null, false, 0, START_WAIT_MS - 1)).toBe('starting')
  expect(envState(null, false, 0, START_WAIT_MS)).toBe('none')
  expect(envActions('up')).toEqual(['o', 'r', 's'])
  expect(envActions('stopped')).toEqual(['u'])
  expect(envActions('none')).toEqual(['u'])
  expect(envActions('starting')).toEqual([])
})

test('the row budget: cards give way first, then the sessions lanes', () => {
  expect(deckRowsFit(60, 20, 6)).toEqual({ sessions: true, cardRows: 34 })
  expect(deckRowsFit(30, 20, 6)).toEqual({ sessions: false, cardRows: 10 })
  expect(deckRowsFit(30, 20, 0)).toEqual({ sessions: false, cardRows: 10 })
  expect(logWindow([1, 2, 3, 4], 2)).toEqual([3, 4])
  expect(logWindow([1, 2], 0)).toEqual([])
})

test('the demo has a log covering every who, gate counts and an up dev-env', () => {
  const deck = demoDeck(1_000_000)
  const whos = new Set(deck.log?.map(entry => entry.who))
  for (const who of ['main', 'gate', 'routing', 'review', 'executor', 'verifier', 'scout', 'runner']) expect(whos.has(who)).toBe(true)
  expect(deck.gate?.allowed).toBe(31)
  const env = demoDevEnv(1_000_000)
  expect(envState(env.env, env.answers, null, 0)).toBe('up')
  expect(envSlot(env.env)).toBe(2)
})

