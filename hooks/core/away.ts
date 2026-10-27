// Away mode (decision 023): while the person is away, a ticket moves only through `/open-pr`, its own
// questions, then the review in a new session, which tower posts itself (decision 025). Never `go`, never `/wrap-up`, never a merge.
// The commands are the workflow's openPr and review steps (config workflow.steps; e.g. `/open-pr`, `/review <n>`),
// the questions and away's answer the waits' (config waits.openPr, waits.post; e.g. profile.ts AWAY_QUESTIONS).

import { stepCommandPattern, toRegExp, type Pattern, type WaitsConfig, type WorkflowConfig } from './config'

export type AwayMove = { ticket: string; step: string; at: number }

export type Away = { on: boolean; since: number | null; moved: AwayMove[] }

/** The `$.store` key: one value for the person. */
export const AWAY_KEY = 'away'

/** At most this many tickets move at a time. */
export const AWAY_MAX_TICKETS = 2

/** The pause before away mode runs a command, so whoever is there sees it coming. */
export const AWAY_DELAY_MS = 3_000

export const AWAY_OFF: Away = { on: false, since: null, moved: [] }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whatever the store holds as away: anything malformed reads as off. */
export function parseAway(value: unknown): Away {
  if (!isObject(value)) return { ...AWAY_OFF, moved: [] }
  const on = value.on === true
  const since = typeof value.since === 'number' ? value.since : null
  const moved = Array.isArray(value.moved)
    ? value.moved.filter((move): move is AwayMove => isObject(move) && typeof move.ticket === 'string' && typeof move.step === 'string' && typeof move.at === 'number')
    : []
  return { on, since: on ? since : null, moved }
}

export function awayOn(away: Away, now: number): Away {
  return away.on ? away : { on: true, since: now, moved: away.moved }
}

/** Off; the moves stay until the board has shown them. */
export function awayOff(away: Away): Away {
  return { on: false, since: null, moved: away.moved }
}

export function awayMoved(away: Away, move: AwayMove): Away {
  return { ...away, moved: [...away.moved, move] }
}

/** The board notice at return: one entry per move, the last five. Null when nothing moved. */
export function awayNotice(away: Away): string | null {
  if (away.moved.length === 0) return null
  return `away: ${away.moved.slice(-5).map(move => `${move.ticket} ${move.step}`).join(', ')}`
}

/** `◆ AWAY · since 12m · 3 moved`. */
export function awayBadge(away: Away, now: number): string {
  const minutes = away.since === null ? 0 : Math.max(0, Math.floor((now - away.since) / 60_000))
  return `◆ AWAY · since ${minutes}m · ${away.moved.length} moved`
}

export type AwayAction =
  | { kind: 'run'; command: string }
  | { kind: 'answer'; text: string }
  | { kind: 'review'; pr: number }

/** A line of the answer that asks (ends its sentence with `?`) one of the known questions. */
function asks(answer: string, questions: readonly Pattern[]): boolean {
  const patterns = questions.map(toRegExp)
  return answer.split('\n').some(line => line.includes('?') && patterns.some(question => question.test(line)))
}

/** A sentence that asks: a `?`, or English and Italian ways to ask for agreement without one. */
const ASKING = /\?|\b(?:shall i|should i|want me to|do you want|would you like|ok to|okay to|let me know|say the word|reply with|vuoi che|procedo|confermi|posso|dimmi se|fammi sapere)\b/i

/**
 * Tower's own post verbs, always taken with the configuration's waits.post (decision 079): Italian `pubblicare`
 * (`Lo pubblico come commento sulla PR #105?`), a comment on the PR, `gh pr comment`.
 */
const POST_VERBS: readonly RegExp[] = [/\bpubblic/i, /\bcomment on the PR\b/i, /\bgh pr comment\b/]

/**
 * The review session's last answer asks the post question (config waits.post with Tower's POST_VERBS; decision 025:
 * tower posts the saved review, nobody answers it). Only the last asking sentence of the last paragraph counts (a
 * finding in the review body may end with `?` and name a post); a last paragraph that asks nothing falls back to the
 * answer's last line with `?`. The asking phrases are Tower's (English, Italian); without a post rule only Tower's
 * post verbs make the post question.
 */
export function asksToPost(answer: string, waits: WaitsConfig): boolean {
  const patterns = [...(waits.post?.patterns ?? []).map(toRegExp), ...POST_VERBS]
  const posts = (text: string) => patterns.some(pattern => pattern.test(text))
  const paragraph = answer.split(/\n\s*\n/).map(part => part.trim()).filter(part => part !== '').at(-1) ?? ''
  const sentence = paragraph.replace(/\s*\n\s*/g, ' ').split(/(?<=[.?!])\s+/).filter(part => ASKING.test(part)).at(-1)
  if (sentence !== undefined) return posts(sentence)
  const question = answer.split('\n').filter(line => line.includes('?')).at(-1)
  return question !== undefined && posts(question)
}

/**
 * What away mode does now in a ticket session, from its next step (`ticketStep().next`) and its last answer: an
 * openPr question (waits.openPr) is answered with its `awayAnswer` (e.g. `yes`), never when that is null.
 * Null for everything outside the rule: `say go`, `/wrap-up`, any other question, no step.
 */
export function awayNext(step: string | null, lastAnswer: string, workflow: WorkflowConfig, waits: WaitsConfig): AwayAction | null {
  if (step === null) return null
  const openPr = workflow.steps.openPr
  const review = stepCommandPattern(workflow.steps.review)?.exec(step) ?? null
  if (openPr !== undefined && stepCommandPattern(openPr)!.test(step)) {
    const rule = waits.openPr
    if (rule === undefined || !asks(lastAnswer, rule.patterns)) return { kind: 'run', command: openPr.skill }
    return rule.awayAnswer !== null ? { kind: 'answer', text: rule.awayAnswer } : null
  }
  if (review?.[1] !== undefined) return { kind: 'review', pr: Number(review[1]) }
  return null
}

/** Whether a step is one away mode starts a ticket's session for. */
export function awayStarts(step: string | null, workflow: WorkflowConfig): boolean {
  if (step === null) return false
  return (stepCommandPattern(workflow.steps.openPr)?.test(step) ?? false) || (stepCommandPattern(workflow.steps.review)?.test(step) ?? false)
}

/** The tickets the rail starts now: those without a live session whose step away moves, oldest first, within the limit. */
export function awayToStart(rows: { key: string; step: string | null; live: boolean; since: number }[], driving: string[], workflow: WorkflowConfig): string[] {
  const room = AWAY_MAX_TICKETS - driving.length
  if (room <= 0) return []
  return rows.filter(row => !row.live && !driving.includes(row.key) && awayStarts(row.step, workflow))
    .sort((a, b) => a.since - b.since)
    .slice(0, room)
    .map(row => row.key)
}
