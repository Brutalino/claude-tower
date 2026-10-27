import { expect, test } from 'claude-code/testing'
import type { TowerRailRow } from '../types/index'
import { railStatus, rowStep as rowStepWith, ticketStep as ticketStepWith } from '../hooks/core/nextStep'
import { parseSettings } from '../hooks/core/settings'
import { parseStatus } from '../hooks/core/sessionStatus'
import {
  answerRows, applyPins, asideArgs, asideCompleteRequest, asideForkPrompt, asideUsageLine, createdLinks, endsWithQuestion, openDecisions,
  parseAsideRecord, parsePinInput, pinReply, shouldNudge, shownPins, toolOutputText, transcriptExcerpt, type TowerPin,
} from '../hooks/core/pins'
import { LINEAR_CONFIG } from './linearConfig'

type StepInputOf = Parameters<typeof ticketStepWith>[0]
type TowerRailRowOf = Parameters<typeof rowStepWith>[0]

const rowStep = (row: TowerRailRowOf, pullRequest: Parameters<typeof rowStepWith>[1], blockedBy: readonly string[] = []) => rowStepWith(row, pullRequest, blockedBy, LINEAR_CONFIG.workflow)
const ticketStep = (input: StepInputOf) => ticketStepWith(input, LINEAR_CONFIG.workflow)

const NOW = 1_000_000

function row(over: Partial<TowerRailRow> = {}): TowerRailRow {
  return { key: 'TKT-1', branch: 'me/tkt-1', path: '/w/TKT-1', phase: 'implementing', next: null, hasPlan: false, blockers: [], session: 'idle', agents: 0, ...over }
}

test('parsePinInput: add and done in the tool shape, anything else refused', async () => {
  expect(parsePinInput({ add: [{ text: '  5 or 10\nminutes? ', kind: 'decision' }] })).toEqual({ add: [{ text: '5 or 10 minutes?', kind: 'decision' }], done: [] })
  expect(parsePinInput({ done: ['p1', 2] })).toEqual({ add: [], done: ['p1', '2'] })
  expect(parsePinInput({ add: [{ text: 'x', kind: 'idea' }] })).toBe(null)
  expect(parsePinInput({ add: [{ text: '', kind: 'todo' }] })).toBe(null)
  expect(parsePinInput({ add: 'no' })).toBe(null)
  expect(parsePinInput(null)).toBe(null)
})

test('applyPins: ids grow, an open duplicate is not pinned twice, done closes once', async () => {
  const first = applyPins([], { add: [{ text: 'window 5 or 10?', kind: 'decision' }, { text: 'tests', kind: 'todo' }] }, NOW)
  expect(first.added).toEqual(['p1', 'p2'])
  const again = applyPins(first.pins, { add: [{ text: 'window 5 or 10?', kind: 'decision' }] }, NOW + 1)
  expect(again.added).toEqual([])
  const closed = applyPins(again.pins, { done: ['p1', 'p1', 'p9'] }, NOW + 2, 'person')
  expect(closed.closed).toEqual(['p1'])
  expect(openDecisions(closed.pins)).toBe(0)
  expect(applyPins(closed.pins, { add: [{ text: 'next', kind: 'decision' }] }, NOW + 3).added).toEqual(['p3'])
  expect(pinReply(closed.pins, [], ['p1'])).toBe('closed p1\np2 [todo] tests')
})

test('shownPins: open decisions first, then todos, then links, oldest first', async () => {
  const pins: TowerPin[] = [
    { id: 'p1', text: 'https://x/pull/1', kind: 'link', at: 1, done: false, by: 'auto' },
    { id: 'p2', text: 'todo', kind: 'todo', at: 2, done: false, by: 'model' },
    { id: 'p3', text: 'b', kind: 'decision', at: 4, done: false, by: 'model' },
    { id: 'p4', text: 'a', kind: 'decision', at: 3, done: false, by: 'model' },
    { id: 'p5', text: 'closed', kind: 'decision', at: 0, done: true, by: 'model' },
  ]
  expect(shownPins(pins).map(pin => pin.id)).toEqual(['p4', 'p3', 'p2', 'p1'])
  expect(openDecisions(pins)).toBe(2)
  expect(openDecisions(undefined)).toBe(0)
})

test('ticketStep: an open decision is `needs you · decision` once work stops; a real wait comes first', async () => {
  expect(railStatus(rowStep(row({ decisions: 1 }), null))).toBe('needs you · decision')
  // Decision 076: while the session works, the open decision is a suffix of `working`.
  const working = rowStep(row({ decisions: 2, session: 'working' }), null)
  expect(working.group).toBe('working')
  expect(working.glyph).toBe('spinner')
  expect(working.status).toBe('working · decision pinned')
  expect(railStatus(working)).toBe('working · decision pinned')
  expect(railStatus(rowStep(row({ decisions: 1, session: 'idle', agents: 4 }), null))).toBe('working · decision pinned')
  expect(railStatus(rowStep(row({ decisions: 1, session: 'working', agent: { name: 'executor', done: 2, total: 5 } }), null))).toBe('working · executor 3/5 · decision pinned')
  expect(railStatus(rowStep(row({ decisions: 1, session: 'working', waiting: 'permission' }), null))).toBe('needs you · permission')
  expect(railStatus(rowStep(row({ decisions: 1, waiting: 'permission' }), null))).toBe('needs you · permission')
  expect(rowStep(row({ decisions: 0 }), null).status).toBe('ready · /open-pr')
  const base = { ticket: 'TKT-1', work: null, pullRequest: null, green: false }
  expect(ticketStep({ ...base, session: { working: false, agent: null, decisions: 1 } }).status).toBe('needs you · decision')
})

test('the status file keeps its pins', async () => {
  const status = parseStatus(JSON.stringify({ v: 1, id: 's', role: 'ticket', ticket: 'TKT-1', cwd: '/w', pane: null, state: 'idle', since: 1, updatedAt: 1,
    pins: [{ id: 'p1', text: 'a', kind: 'decision', at: 1, done: false, by: 'model' }] }))
  expect(openDecisions(status?.pins)).toBe(1)
})

test('createdLinks: the URL of a gh pr create or a git push, nothing from other commands', async () => {
  expect(createdLinks('gh pr create --fill', 'Creating pull request\nhttps://github.com/acme/app/pull/42\n')).toEqual(['https://github.com/acme/app/pull/42'])
  const push = 'remote: Create a pull request for \'me/x\' on GitHub by visiting:\nremote:      https://github.com/acme/app/pull/new/me/x\nTo github.com:acme/app.git'
  expect(createdLinks('git push -u origin me/x', push)).toEqual(['https://github.com/acme/app/pull/new/me/x'])
  expect(createdLinks('git push', 'Everything up-to-date')).toEqual([])
  expect(createdLinks('curl https://github.com/acme/app/pull/42', 'https://github.com/acme/app/pull/42')).toEqual([])
  expect(toolOutputText({ result: { stdout: 'https://github.com/a/b/pull/1', stderr: '' } })).toBe('https://github.com/a/b/pull/1\n')
  expect(toolOutputText({ text: 'out', result: {} })).toBe('out')
})

test('endsWithQuestion and shouldNudge: once, only with the setting on and nothing pinned', async () => {
  expect(endsWithQuestion('Done the plan.\n\n**Should the window be 5 or 10 minutes?**\n')).toBe(true)
  expect(endsWithQuestion('Is it fine? I went with 5.')).toBe(false)
  expect(endsWithQuestion('')).toBe(false)
  const ask = { setting: 'on' as const, answer: 'Which one?', pinnedThisTurn: false, nudgedAlready: false }
  expect(shouldNudge(ask)).toBe(true)
  expect(shouldNudge({ ...ask, setting: 'off' })).toBe(false)
  expect(shouldNudge({ ...ask, pinnedThisTurn: true })).toBe(false)
  expect(shouldNudge({ ...ask, nudgedAlready: true })).toBe(false)
})

test('the aside: the fork prompt carries the question; the Sonnet request carries the last messages as text', async () => {
  expect(asideForkPrompt('  a che punto sei? ')).toContain('Question: a che punto sei?')
  expect(asideForkPrompt('x')).toContain('not added to the conversation')
  const messages = [
    { role: 'user' as const, text: 'old '.repeat(50) },
    { role: 'assistant' as const, text: 'Reading the plan', toolUses: [{ name: 'Read' }] },
    { role: 'user' as const, text: 'go' },
  ]
  expect(transcriptExcerpt(messages, 60)).toBe('CLAUDE: Reading the plan (tools: Read)\nPERSON: go')
  const request = asideCompleteRequest('cosa manca?', messages)
  expect(request.model).toBe('sonnet')
  expect(request.prompt.endsWith('Question: cosa manca?')).toBe(true)
  expect(request.prompt).toContain('PERSON: go')
  expect(request.system).toContain('not added to the conversation')
})

test('asideUsageLine: latency, cache read apart from new input, or that the cache is not reused', async () => {
  const usage = { input_tokens: 12, output_tokens: 140, cache_read_input_tokens: 31_400, cache_creation_input_tokens: 200 }
  expect(asideUsageLine(usage, 2_340, 'session')).toBe('2.3s · 31.4k cache read · 212 new input · 140 out')
  expect(asideUsageLine(usage, 900, 'sonnet')).toBe('0.9s · cache not reused · 212 new input · 140 out')
})

test('the board aside: bus args on one line, the answer file parsed, the answer cut to the rows', async () => {
  expect(asideArgs('a che\npunto  sei?')).toBe('a che punto sei?')
  expect(asideArgs('x'.repeat(600)).length).toBe(400)
  expect(parseAsideRecord(JSON.stringify({ question: 'q', status: 'done', text: 'a', line: 'l', at: 3 }))).toEqual({ question: 'q', status: 'done', text: 'a', line: 'l', at: 3 })
  expect(parseAsideRecord('{"question":"q","status":"maybe","text":"","at":1}')).toBe(null)
  expect(parseAsideRecord(null)).toBe(null)
  expect(answerRows('**one** two three four', 9, 2)).toEqual(['one two', 'three…'])
  expect(answerRows('a\nb', 10, 5)).toEqual(['a', 'b'])
})

test('settings: aside model defaults to the session, pin nudge to off', async () => {
  expect(parseSettings({}).asideModel).toBe('session')
  expect(parseSettings({}).pinNudge).toBe('off')
  expect(parseSettings({ asideModel: 'sonnet', pinNudge: 'on' })).toMatchObject({ asideModel: 'sonnet', pinNudge: 'on' })
})
