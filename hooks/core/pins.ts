// Decision 036: pinned decisions and the aside. Ideas from the MIT mods `pinboard` and `aside`, own code.
// The pins: open decisions that need the person, todos and links, kept by the model through its own tool;
// the aside: a read-only side question about the session, answered off the main conversation.

import type { TowerPin } from '../../types/index'

export type { TowerPin }
export type PinKind = TowerPin['kind']

export const PIN_TOOL = 'pin'

export const PIN_TOOL_DESCRIPTION =
  'Pins an open decision that needs the person, a todo, or a link you created (a pull request, a pushed branch) to the ticket deck, ' +
  'so it does not scroll away. `add` pins items; `done` closes pinned items by id. Returns the open pins with their ids.'

export const PIN_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    add: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, kind: { type: 'string', enum: ['decision', 'todo', 'link'] } },
        required: ['text', 'kind'],
      },
    },
    done: { type: 'array', items: { type: 'string' } },
  },
} as const

export const PIN_SECTION_ID = 'tower:pins'

/** A tool result's text: its `text`, else its result as text (a Bash result's stdout and stderr). */
export function toolOutputText(result: unknown): string {
  if (typeof result !== 'object' || result === null) return typeof result === 'string' ? result : ''
  const value = result as { text?: unknown; result?: unknown }
  if (typeof value.text === 'string') return value.text
  const inner = value.result as { stdout?: unknown; stderr?: unknown } | string | undefined
  if (typeof inner === 'string') return inner
  if (typeof inner === 'object' && inner !== null) return [inner.stdout, inner.stderr].filter(part => typeof part === 'string').join('\n')
  return ''
}

/** The main session's prompt section: one neutral paragraph. */
export const PIN_SECTION =
  'This session has a `pin` tool (mcp__tower__pin). When a decision is open that needs the person, pin it as a `decision` ' +
  'so it stays visible on the ticket deck until they settle it; pin a link you created (a pull request, a pushed branch) as a `link`. ' +
  'Close a pin with `done` once it is settled.'

/** The one line a nudge sends the model back with (decision 036). */
export const PIN_NUDGE = 'Your reply ends with a question for the person: pin it as a decision with the pin tool (kind `decision`), then stop.'

const MAX_TEXT = 300
const MAX_PINS = 40

export type PinInput = { add?: { text: string; kind: PinKind }[]; done?: string[] }

/** The tool's input as the model sent it; null when it is not the tool's shape. */
export function parsePinInput(raw: unknown): PinInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  const add = value.add === undefined ? [] : Array.isArray(value.add) ? value.add : null
  const done = value.done === undefined ? [] : Array.isArray(value.done) ? value.done : null
  if (add === null || done === null) return null
  const items: { text: string; kind: PinKind }[] = []
  for (const item of add) {
    const one = item as Record<string, unknown> | null
    if (typeof one !== 'object' || one === null || typeof one.text !== 'string' || one.text.trim() === '') return null
    if (one.kind !== 'decision' && one.kind !== 'todo' && one.kind !== 'link') return null
    items.push({ text: one.text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT), kind: one.kind })
  }
  if (!done.every(id => typeof id === 'string' || typeof id === 'number')) return null
  return { add: items, done: done.map(String) }
}

function nextId(pins: readonly TowerPin[]): string {
  const top = pins.reduce((most, pin) => Math.max(most, Number(pin.id.replace(/^p/, '')) || 0), 0)
  return `p${top + 1}`
}

/** Pins added and closed: a text already open is not pinned twice; the oldest closed pins go past MAX_PINS. */
export function applyPins(pins: readonly TowerPin[], input: PinInput, now: number, by: TowerPin['by'] = 'model'): { pins: TowerPin[]; added: string[]; closed: string[] } {
  let out = [...pins]
  const added: string[] = []
  for (const item of input.add ?? []) {
    if (out.some(pin => !pin.done && pin.kind === item.kind && pin.text === item.text)) continue
    const id = nextId(out)
    out.push({ id, text: item.text, kind: item.kind, at: now, done: false, by })
    added.push(id)
  }
  const closed: string[] = []
  for (const id of input.done ?? []) {
    if (!out.some(pin => pin.id === id && !pin.done)) continue
    out = out.map(pin => (pin.id === id ? { ...pin, done: true } : pin))
    closed.push(id)
  }
  while (out.length > MAX_PINS) {
    const oldest = out.findIndex(pin => pin.done)
    if (oldest < 0) break
    out.splice(oldest, 1)
  }
  return { pins: out, added, closed }
}

/** The tool's answer to the model: what changed and the open pins with their ids. */
export function pinReply(pins: readonly TowerPin[], added: readonly string[], closed: readonly string[]): string {
  const open = shownPins(pins)
  const head = [added.length > 0 ? `pinned ${added.join(', ')}` : null, closed.length > 0 ? `closed ${closed.join(', ')}` : null].filter(Boolean).join('; ') || 'nothing changed'
  return [head, ...(open.length === 0 ? ['no open pins'] : open.map(pin => `${pin.id} [${pin.kind}] ${pin.text}`))].join('\n')
}

const KIND_ORDER: Record<PinKind, number> = { decision: 0, todo: 1, link: 2 }

/** The open pins as the PINNED box lists them: decisions first, then todos, then links; oldest first in each. */
export function shownPins(pins: readonly TowerPin[]): TowerPin[] {
  return pins.filter(pin => !pin.done).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.at - b.at)
}

export function openDecisions(pins: readonly TowerPin[] | undefined): number {
  return (pins ?? []).filter(pin => !pin.done && pin.kind === 'decision').length
}

const URL_RE = /https:\/\/[^\s'"<>)\]]+/g

/**
 * The links a Bash call created, from its output: a `gh pr create` prints the pull request's URL;
 * a `git push` prints the remote's `Create a pull request … https://…/pull/new/<branch>` and its own URLs.
 */
export function createdLinks(command: string, output: string): string[] {
  const creates = /\bgh\s+pr\s+create\b/.test(command)
  const pushes = /\bgit\s+push\b/.test(command)
  if (!creates && !pushes) return []
  const urls = [...output.matchAll(URL_RE)].map(match => match[0].replace(/[.,;:]+$/, ''))
  const kept = creates ? urls.filter(url => /\/pull\/\d+/.test(url)) : urls.filter(url => /\/pull\/new\/|\/merge_requests\/new|\/pull\/\d+/.test(url))
  return [...new Set(kept)]
}

/** A reply that ends on a question to the person: its last non-empty line, markdown stripped, ends with `?`. */
export function endsWithQuestion(answer: string): boolean {
  const lines = answer.split('\n').map(line => line.replace(/[*_`>#\s]+$/g, '').replace(/^[\s>*_#-]+/, '')).filter(line => line !== '')
  const last = lines[lines.length - 1]
  return last !== undefined && /[?？]$/.test(last)
}

/**
 * The nudge sends the model back once: setting on, the reply ends on a question, no decision pinned in the turn,
 * and not already a nudged stop (the classic Stop's `stop_hook_active`).
 */
export function shouldNudge(input: { setting: 'on' | 'off'; answer: string; pinnedThisTurn: boolean; nudgedAlready: boolean }): boolean {
  return input.setting === 'on' && !input.nudgedAlready && !input.pinnedThisTurn && endsWithQuestion(input.answer)
}

// ── The aside ───────────────────────────────────────────────────────────────

export type AsideModel = 'session' | 'sonnet'

export type AsideUsage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

const ASIDE_FRAME =
  'A side question from the person, asked aside: your answer is shown to them apart and is not added to the conversation, ' +
  'and no tool can run. Answer briefly from what this conversation already holds, in the language of the question. ' +
  'Do not continue the task.'

/** The fork's one user message: appended to the session's own transcript, whose prefix the prompt cache serves. */
export function asideForkPrompt(question: string): string {
  return `${ASIDE_FRAME}\n\nQuestion: ${question.trim()}`
}

export type TranscriptMessage = { role: 'user' | 'assistant'; text: string; toolUses?: readonly { name?: string; tool?: string }[] }

/**
 * A plain-text excerpt of the conversation for a model that is not the session's (no cache to reuse):
 * the last messages that fit in `maxChars`, newest kept, tool calls as one line each.
 */
export function transcriptExcerpt(messages: readonly TranscriptMessage[], maxChars = 24_000): string {
  const lines: string[] = []
  let used = 0
  for (let at = messages.length - 1; at >= 0; at--) {
    const message = messages[at]!
    const tools = (message.toolUses ?? []).map(use => use.name ?? use.tool ?? 'tool').filter(Boolean)
    const body = [message.text.trim(), tools.length > 0 ? `(tools: ${tools.join(', ')})` : ''].filter(text => text !== '').join(' ')
    if (body === '') continue
    const line = `${message.role === 'user' ? 'PERSON' : 'CLAUDE'}: ${body}`
    if (used + line.length > maxChars) {
      if (lines.length === 0) lines.unshift(`${line.slice(0, maxChars)}…`)
      break
    }
    lines.unshift(line)
    used += line.length + 1
  }
  return lines.join('\n')
}

/** The request of a `$.model.complete` aside: the excerpt and the question in the one user message. */
export function asideCompleteRequest(question: string, messages: readonly TranscriptMessage[], model = 'sonnet'): { model: string; system: string; prompt: string; maxTokens: number } {
  return {
    model,
    system: ASIDE_FRAME,
    prompt: `The conversation so far (its last part, as text):\n\n${transcriptExcerpt(messages)}\n\nQuestion: ${question.trim()}`,
    maxTokens: 1024,
  }
}

/** The aside's token line: latency, then the engine's counts, cache read apart from new input. */
export function asideUsageLine(usage: AsideUsage, ms: number, model: AsideModel): string {
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
  const seconds = `${(ms / 1000).toFixed(1)}s`
  const cache = model === 'session' ? `${k(usage.cache_read_input_tokens)} cache read` : 'cache not reused'
  return `${seconds} · ${cache} · ${k(usage.input_tokens + usage.cache_creation_input_tokens)} new input · ${k(usage.output_tokens)} out`
}

/** The bus command that asks a ticket session's aside from the board: the question on one line, within the bus's 500. */
export const ASIDE_COMMAND = 'tower-aside'

export function asideArgs(question: string): string {
  return question.replace(/\s+/g, ' ').trim().slice(0, 400)
}

/** An aside's answer as a file the board reads: the ticket session writes it, the rail's inspector shows it. */
export type AsideRecord = { question: string; status: 'asking' | 'done' | 'failed'; text: string; line: string; at: number }

export function parseAsideRecord(text: string | null): AsideRecord | null {
  if (text === null) return null
  try {
    const value = JSON.parse(text) as Partial<AsideRecord>
    if (typeof value.question !== 'string' || typeof value.text !== 'string' || typeof value.at !== 'number') return null
    if (value.status !== 'asking' && value.status !== 'done' && value.status !== 'failed') return null
    return { question: value.question, status: value.status, text: value.text, line: typeof value.line === 'string' ? value.line : '', at: value.at }
  } catch {
    return null
  }
}

/** An answer cut to `rows` lines of `width` cells for the board's inspector; `…` on the last when cut. */
export function answerRows(text: string, width: number, rows: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.replace(/[*_`#>]/g, '').split(/\s+/).filter(Boolean)) {
      if (line !== '' && line.length + 1 + word.length > width) {
        out.push(line)
        line = word.slice(0, width)
      } else line = line === '' ? word.slice(0, width) : `${line} ${word}`
    }
    if (line !== '') out.push(line)
  }
  if (out.length <= rows) return out
  const kept = out.slice(0, rows)
  kept[rows - 1] = `${kept[rows - 1]!.slice(0, Math.max(0, width - 1))}…`
  return kept
}
