// One derivation of a ticket's state and next step, for the rail, the board, the detail and the status line.

import { stepCommand, stepCommandPattern, ticketValues, type WorkflowConfig } from './config'
import { stepUnderWay } from './deck'
import type { TowerPhase, TowerPullRequest, TowerRailRow } from '../../types/index'

export type StepGroup = 'needs you' | 'working' | 'ready'
export type StepGlyph = 'spinner' | '◆' | '✓' | '○' | '⊘'

export type TicketStep = {
  group: StepGroup
  glyph: StepGlyph
  status: string
  next: string | null
  /** Into `plan → implement → draft PR → review → merge`; 5 = all done. */
  phaseIndex: number
}

export type StepInput = {
  ticket: string
  /** The state file's fields, or null without a state file. */
  work: { phase: TowerPhase; blockers: readonly string[] } | null
  pullRequest: TowerPullRequest | null | undefined
  /** `waiting`: a live session of the ticket waits on a permission or a question. */
  /** `decisions`: the live session's open pinned decisions (decision 036); a real wait comes first, work next (decision 076). */
  session: { working: boolean; agent: { name: string; done: number; total: number } | null; waiting?: 'permission' | 'question' | null; decisions?: number }
  /** reviewVerdict for the pull request's head commit. */
  green: boolean
  /** The open tickets blocking it in Linear (the issue's `blockedBy`). */
  blockedBy?: readonly string[]
}

const BLOCKER_CHARS = 40

function cut(text: string, width: number): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim())
  return chars.length <= width ? chars.join('') : chars.slice(0, width - 1).join('') + '…'
}

/** A blocked ticket's status: `blocked by TKT-1234`, `+n` when more. */
export function blockedText(blockers: readonly string[]): string | null {
  const first = blockers[0]
  if (first === undefined) return null
  return `blocked by ${cut(first, BLOCKER_CHARS)}${blockers.length > 1 ? ` +${blockers.length - 1}` : ''}`
}

function stepIndex(input: StepInput): number {
  const pr = input.pullRequest?.kind === 'pr' ? input.pullRequest : null
  if (pr?.state === 'merged') return 5
  if (pr?.state === 'open') return input.green ? 4 : 3
  if (pr?.state === 'draft') return 2
  // `review` (a state file's own review phase, config phases.mapping; a Linear project's skills may never write it) counts as implementing.
  if (input.work?.phase === 'implementing' || input.work?.phase === 'review') return 1
  return 0
}

/**
 * The commands come from the workflow's steps (config workflow.steps; e.g. `/start-ticket`, `/open-pr`, `/review`,
 * `/wrap-up`); a step the workflow lacks proposes nothing. `say go` is Tower's own: the plan waits for the person.
 */
export function ticketStep(input: StepInput, workflow: WorkflowConfig): TicketStep {
  const { start, openPr, review, wrapUp } = workflow.steps
  const phaseIndex = stepIndex(input)
  const ready = (status: string, next: string | null): TicketStep => ({ group: 'ready', glyph: '✓', status, next, phaseIndex })
  const needsYou = (status: string, next: string | null): TicketStep => ({ group: 'needs you', glyph: '◆', status, next, phaseIndex })
  const blocked = (blockers: readonly string[]): TicketStep => ({ group: 'needs you', glyph: '⊘', status: blockedText(blockers) ?? 'blocked', next: null, phaseIndex })
  // A session stopped on a permission dialog or a question shows as needing you, even mid-turn.
  const waiting = input.session.waiting ?? null
  if (waiting !== null) return needsYou(`needs you · ${waiting}`, null)
  if (input.session.working) {
    const agent = input.session.agent
    const status = agent !== null && agent.total > 0 ? `working · ${agent.name} ${stepUnderWay(agent.done, agent.total)}/${agent.total}` : 'working'
    // Decision 076: an open pinned decision while the session works is a suffix, not `needs you`.
    const pinned = (input.session.decisions ?? 0) > 0 ? ' · decision pinned' : ''
    return { group: 'working', glyph: 'spinner', status: status + pinned, next: null, phaseIndex }
  }
  // An open pinned decision waits on the person too (decision 036), once the session stops working (decision 076).
  if ((input.session.decisions ?? 0) > 0) return needsYou('needs you · decision', null)
  // An open blocker in Linear wins over the state file; free-text blockers wait until planning is done.
  if (input.blockedBy !== undefined && input.blockedBy.length > 0) return blocked(input.blockedBy)
  const work = input.work
  const pr = input.pullRequest?.kind === 'pr' && input.pullRequest.state !== 'closed' ? input.pullRequest : null
  // No state file but a pull request on the branch (work done elsewhere): the pull request tells the step, not `not started`.
  if ((work === null || work.phase === 'not started') && pr === null) {
    return { group: 'ready', glyph: '○', status: start !== undefined ? `not started · /${start.skill}` : 'not started', next: stepCommand(start, ticketValues(input.ticket)), phaseIndex }
  }
  if (work?.phase === 'planning') return needsYou('planning · say go', 'say go')
  if (work !== null && work.blockers.length > 0) return blocked(work.blockers)
  // From here `implementing` and `review` (decision 053) take the same path: the pull request decides.
  const values = { ...ticketValues(input.ticket), pr: pr !== null ? String(pr.number) : '' }
  if (pr === null) return ready(openPr !== undefined ? `ready · /${openPr.skill}` : 'ready', stepCommand(openPr, values))
  if (pr.state === 'draft') return ready('ready · mark PR ready', stepCommand(openPr, values))
  if (pr.state === 'merged') return ready(wrapUp !== undefined ? `merged · /${wrapUp.skill}` : 'merged', stepCommand(wrapUp, values))
  if (!input.green) return ready('ready · review', stepCommand(review, values))
  return ready('ready · merge', stepCommand(wrapUp, values))
}

/** A rail row's step: its live session and state file, with the pull request when one was loaded and its Linear blockers. */
export function rowStep(row: TowerRailRow, pullRequest: TowerPullRequest | null | undefined, blockedBy: readonly string[], workflow: WorkflowConfig): TicketStep {
  const pr = pullRequest?.kind === 'pr' ? pullRequest : null
  return ticketStep({
    ticket: row.key,
    work: row.phase === 'not started' ? null : { phase: row.phase, blockers: row.blockers },
    pullRequest,
    session: { working: row.session === 'working' || row.agents > 0, agent: row.agent ?? null, waiting: row.waiting ?? null, decisions: row.decisions ?? 0 },
    green: pr?.green ?? false,
    blockedBy,
  }, workflow)
}

/** No steps: the group and the glyph alone, which no step's command changes. */
const NO_STEPS: WorkflowConfig = { steps: {} }

/** A rail row's step group and glyph (the list's headings, the rail's glyph): they never depend on the workflow's commands. */
export function rowShape(row: TowerRailRow, pullRequest: TowerPullRequest | null | undefined, blockedBy: readonly string[] = []): Pick<TicketStep, 'group' | 'glyph'> {
  const { group, glyph } = rowStep(row, pullRequest, blockedBy, NO_STEPS)
  return { group, glyph }
}

/** What a ticket session writes into its status file for the status line. */
export function statusFlags(step: TicketStep): { needsYou?: true; ready?: 'review' | 'merge' } {
  if (step.group === 'needs you') return { needsYou: true }
  if (step.status === 'ready · review') return { ready: 'review' }
  if (step.status === 'ready · merge') return { ready: 'merge' }
  return {}
}

/** A rail row's second line in the source's words: the group, then the short step; a blocked ticket's `blocked by …` alone. */
export function railStatus(step: TicketStep): string {
  if (step.glyph === '⊘') return step.status
  if (step.status.startsWith(step.group)) return step.status
  const cut = step.status.indexOf(' · ')
  return cut < 0 ? step.group : `${step.group} · ${step.status.slice(cut + 3)}`
}

/** The pull request a review session would review: the review step (`/review <n>`) as the next step, else an open or draft pull request. */
export function reviewTarget(next: string | null, pullRequest: { kind: string; number?: number; state?: string } | null, workflow: WorkflowConfig): number | null {
  const pattern = stepCommandPattern(workflow.steps.review)
  const asked = next !== null && pattern !== null ? pattern.exec(next) : null
  if (asked?.[1] !== undefined) return Number(asked[1])
  if (pullRequest !== null && pullRequest.kind === 'pr' && (pullRequest.state === 'open' || pullRequest.state === 'draft')) return pullRequest.number ?? null
  return null
}
