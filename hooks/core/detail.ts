// What the board's detail column shows for one ticket: title, phase steps, pull request, ages.

import type { TowerPullRequest, TowerRailRow, TowerReviewPost } from '../../types/index'
import type { ChecksConfig, Pattern, ReviewConfig } from './config'
import type { TicketStep } from './nextStep'
import type { PrCheck, RecordedChecks, ReleaseInfo } from './prState'
import { recordedFresh } from './prState'
import { isReviewComment, reviewSectionCount } from './reviewBox'

// Written out here rather than imported from config.ts: config.ts imports the edition's configuration (hooks/<edition>/config.ts, decision 083), which imports this file.
const toRegExp = (pattern: Pattern): RegExp => new RegExp(pattern.source, pattern.flags)

export const WIDE_FROM_COLUMNS = 100
export const LIST_COLUMNS = 48
export const REMOTE_STALE_MS = 60_000
/** Far below the 100,000 characters one drawing draws, so the rest of the detail is never cut. */
export const PLAN_MAX_CHARS = 20_000

/** The columns to ask `$.ui.open` for: all but the 24 the engine keeps for the transcript (and a margin). */
export function paneColumns(paneWidth: number | null): number | undefined {
  if (paneWidth === null || !Number.isFinite(paneWidth)) return undefined
  return Math.max(23, paneWidth - 26)
}

export function parsePaneWidth(output: string): number | null {
  const width = Number.parseInt(output.trim(), 10)
  return Number.isInteger(width) && width > 0 ? width : null
}

/** The ticket the keyboard is on; else the one in the centre; else the first row. */
export function detailRow(rows: TowerRailRow[], focused: string | null, centre: string | null): TowerRailRow | null {
  return rows.find(row => row.key === focused) ?? rows.find(row => row.key === centre) ?? rows[0] ?? null
}

/** `me/tkt-2-second-thing` → `second thing`: no owner prefix, no ticket id, dashes as spaces. */
export function titleFromBranch(branch: string, key: string): string {
  let name = branch.slice(branch.lastIndexOf('/') + 1)
  const ticketPrefix = `${key.toLowerCase()}-`
  if (name.toLowerCase().startsWith(ticketPrefix)) name = name.slice(ticketPrefix.length)
  else name = name.replace(/^[a-z]+-\d+-/i, '')
  return name.replace(/-+/g, ' ').trim() || branch
}

export const PHASE_STEPS = ['plan', 'implement', 'draft PR', 'review', 'merge'] as const

/** Steps before `done` are done; `current` is the step under way, null when none is. */
export type PhaseProgress = { done: number; current: number | null }

/** From the ticket's step, so the strip and the rail never disagree; nothing under way before a start. */
export function phaseProgress(step: TicketStep): PhaseProgress {
  if (step.phaseIndex >= PHASE_STEPS.length) return { done: PHASE_STEPS.length, current: null }
  if (step.phaseIndex === 0 && step.status.startsWith('not started')) return { done: 0, current: null }
  return { done: step.phaseIndex, current: step.phaseIndex }
}

/** `12s`, `4m`, `2h`. */
export function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h`
}

/** Keeps the end of the text, where a path is most telling. */
export function truncateStart(text: string, width: number): string {
  if (width <= 0) return ''
  const chars = Array.from(text)
  if (chars.length <= width) return text
  return '…' + chars.slice(chars.length - Math.max(0, width - 1)).join('')
}

/** A leading markdown heading or a line reading "plan" only repeats the panel's title. */
function withoutTitle(plan: string): string {
  const [first, ...rest] = plan.split('\n')
  const line = (first ?? '').trim()
  return line.startsWith('#') || line.toLowerCase() === 'plan' ? rest.join('\n').replace(/^\s*\n/, '') : plan
}

export function planExcerpt(full: string): string {
  const plan = withoutTitle(full)
  const chars = Array.from(plan)
  return chars.length <= PLAN_MAX_CHARS ? plan : chars.slice(0, PLAN_MAX_CHARS).join('') + '\n\n…'
}

// ── gh pr view ────────────────────────────────────────────────────────────

const FAILING = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
const RUNNING = new Set(['IN_PROGRESS', 'PENDING', 'QUEUED', 'WAITING', 'REQUESTED', 'EXPECTED'])
const PASSING = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])

type RawCheck = { state?: unknown; status?: unknown; conclusion?: unknown } | null

/** A CheckRun counts by status until COMPLETED, then by conclusion; a StatusContext by state. */
function checkValue(raw: RawCheck): string | undefined {
  if (typeof raw?.state === 'string') return raw.state.toUpperCase()
  if (typeof raw?.status === 'string' && raw.status.toUpperCase() !== 'COMPLETED') return raw.status.toUpperCase()
  if (typeof raw?.conclusion === 'string') return raw.conclusion.toUpperCase()
  return undefined
}

export function checksSummary(rollup: unknown): 'passing' | 'failing' | 'running' | 'none' {
  if (!Array.isArray(rollup)) return 'none'
  const values = (rollup as RawCheck[]).map(checkValue).filter((value): value is string => value !== undefined)
  if (values.some(value => FAILING.has(value))) return 'failing'
  if (values.some(value => RUNNING.has(value))) return 'running'
  if (values.length > 0 && values.every(value => PASSING.has(value))) return 'passing'
  return 'none'
}

/** Each check of the rollup by name (a CheckRun's `name`, a StatusContext's `context`), its link and start (decision 035). */
export function parseChecks(rollup: unknown): PrCheck[] {
  if (!Array.isArray(rollup)) return []
  return rollup.flatMap(item => {
    if (typeof item !== 'object' || item === null) return []
    const raw = item as Record<string, unknown>
    const value = checkValue(raw)
    const name = typeof raw.name === 'string' && raw.name !== '' ? raw.name : typeof raw.context === 'string' ? raw.context : ''
    if (value === undefined || name === '') return []
    const state = FAILING.has(value) ? 'failing' : RUNNING.has(value) ? 'running' : PASSING.has(value) ? 'passing' : null
    if (state === null) return []
    const url = typeof raw.detailsUrl === 'string' && raw.detailsUrl !== '' ? raw.detailsUrl : typeof raw.targetUrl === 'string' && raw.targetUrl !== '' ? raw.targetUrl : null
    return [{ name, state, detailsUrl: url, startedAt: typeof raw.startedAt === 'string' && raw.startedAt !== '' ? raw.startedAt : null }]
  })
}

export type PullRequestComment = { body: string; createdAt: string }

function parseComments(value: unknown): PullRequestComment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const raw = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
    return typeof raw.body === 'string' ? [{ body: raw.body, createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '' }] : []
  })
}

/**
 * Decision 074: the PR's comments (`createdAt`) and GitHub reviews (`submittedAt`) as the hand-post rule reads them:
 * the author's login (null: none), whether it is a review comment (isReviewComment: the heading, config review.heading,
 * and a verdict when the configuration has one, decision 081), how many of its sections (config review.sections) the
 * body holds, whether the body is empty. The bodies are not kept.
 */
export function reviewPosts(comments: unknown, reviews: unknown, review: ReviewConfig): TowerReviewPost[] {
  const read = (kind: TowerReviewPost['kind'], value: unknown, at: 'createdAt' | 'submittedAt'): TowerReviewPost[] => {
    if (!Array.isArray(value)) return []
    return value.flatMap(item => {
      const raw = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
      const body = typeof raw.body === 'string' ? raw.body : ''
      const author = typeof raw.author === 'object' && raw.author !== null ? (raw.author as Record<string, unknown>).login : undefined
      return [{
        kind, author: typeof author === 'string' && author !== '' ? author : null, at: typeof raw[at] === 'string' ? raw[at] as string : '',
        heading: isReviewComment(body, review), sections: reviewSectionCount(body, review), empty: body.trim() === '',
      }]
    })
  }
  return [...read('comment', comments, 'createdAt'), ...read('review', reviews, 'submittedAt')]
}

/** The text under `### <heading>` (config review.blockersSection.heading; e.g. `### Blockers`) up to the next heading. */
function blockersSection(body: string, heading: string): string | null {
  const name = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`^###\\s+${name}\\s*$([\\s\\S]*?)(?=^#{1,3}\\s|(?![\\s\\S]))`, 'm').exec(body)
  return match === null ? null : (match[1] ?? '').trim()
}

/**
 * The blockers the newest self-review lists: 0 for the section's none (`_(none)_`), its list items (at least 1)
 * otherwise, null without one. A review with a verdict line and no blockers section (config review.verdict): 1 when
 * it says fixes are needed, else 0.
 */
export function reviewBlockerCount(comments: readonly PullRequestComment[], review: ReviewConfig): number | null {
  const latest = selfReviews(comments, review).at(-1)
  if (latest === undefined) return null
  if (review.blockersSection === null) return review.verdict !== null && toRegExp(review.verdict.fixes).test(latest.body) ? 1 : 0
  const section = blockersSection(latest.body, review.blockersSection.heading)
  if (section === null || section === review.blockersSection.none || section === '') return 0
  return Math.max(1, section.split('\n').filter(line => /^\s*(?:[-*]|\d+\.)\s+/.test(line)).length)
}

/**
 * A self-review's heading line (decision 046): `## Self-review`, an optional `(round N)` (its number the first group),
 * then any tail (`— head \`507cf535b\``); `## Self-reviewer` is not one.
 */
export const SELF_REVIEW_HEADING = /^##\s+Self-review\b(?:\s+\(round\s+(\d+)\))?.*$/im

/**
 * The review comments (isReviewComment: the heading, config review.heading, e.g. `## Self-review`; and a verdict
 * line when the configuration has one, decision 081), oldest first.
 */
export function selfReviews(comments: readonly PullRequestComment[], review: ReviewConfig): PullRequestComment[] {
  const reviews = comments.filter(comment => isReviewComment(comment.body, review))
  return [...reviews].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Green, as wrap-up decides it: the newest review comment (e.g. `## Self-review` / `## Self-review (round N)`)
 * says ready — its verdict line reads ready (config review.verdict) and its blockers section lists none (config
 * review.blockersSection; e.g. `_(none)_` under `### Blockers`), each when the configuration has it — and the
 * checks GitHub reports on `headRefOid` (statusCheckRollup is the head commit's) all passed. An absent check is not
 * a green one, so commits after the review read not green.
 */
export function reviewVerdict(
  comments: readonly PullRequestComment[],
  headRefOid: string | null,
  checks: 'passing' | 'failing' | 'running' | 'none',
  review: ReviewConfig,
): boolean {
  if (headRefOid === null || headRefOid === '' || checks !== 'passing') return false
  const latest = selfReviews(comments, review).at(-1)
  if (latest === undefined) return false
  const verdictReady = review.verdict === null || toRegExp(review.verdict.ready).test(latest.body)
  const noBlockers = review.blockersSection === null || blockersSection(latest.body, review.blockersSection.heading) === review.blockersSection.none
  return verdictReady && noBlockers
}

/**
 * The fields `gh pr view --json` reads. GitHub's checks (`statusCheckRollup`) only when the configuration's checks
 * come from GitHub CI (config checks.sources `github-ci`); without it the pull request reads no GitHub
 * checks, and the state file's and the release's are read beside gh (decision 055, OwnChecks).
 */
export function prViewFields(checks: ChecksConfig): string {
  const ci = checks.sources.includes('github-ci') ? ['statusCheckRollup'] : []
  return ['number', 'state', 'isDraft', 'reviewDecision', ...ci, 'url', 'headRefOid', 'comments', 'mergeable', 'mergeStateStatus', 'reviews', 'updatedAt', 'createdAt', 'baseRefName'].join(',')
}

/**
 * The checks a configuration without GitHub CI reads itself (decision 055): the state file's `checks` (null: none
 * recorded) and the last release tag; each absent when the configuration has no such source.
 */
export type OwnChecks = { recorded?: RecordedChecks | null; release?: ReleaseInfo }

/**
 * The review's word in the PR box (decision 055), from the heading's pattern: `^##\s+Self-review…` → `self-review`
 * (a Linear project's), `^##\s+Review…` → `review` (oink); `review` when the pattern starts otherwise.
 */
export function reviewLabel(review: ReviewConfig): string {
  const word = /^\^?#+\\s[+*]?([A-Za-z][A-Za-z-]*)/.exec(review.heading.source)?.[1]
  return word ? word.toLowerCase() : 'review'
}

/** The outcome of `gh pr view --json …`; `null` when gh could not be started at all. */
export function parsePullRequest(
  result: { exitCode: number; stdout: string; stderr: string } | null,
  review: ReviewConfig,
  own: OwnChecks = {},
): TowerPullRequest {
  if (result === null) return { kind: 'unavailable' }
  if (result.exitCode !== 0) {
    if (/no pull requests found/i.test(result.stderr)) return { kind: 'none' }
    // Exit 127: gh is not installed. Any other failure (signed out included) keeps its first line for the panel's `gh: …`.
    if (result.exitCode === 127) return { kind: 'unavailable' }
    const cause = result.stderr.trim().split('\n')[0]?.trim()
    return { kind: 'error', message: cause || `gh exited with ${result.exitCode}` }
  }
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    return { kind: 'error', message: 'gh answered something that is not JSON' }
  }
  if (typeof raw !== 'object' || raw === null || typeof raw.number !== 'number') return { kind: 'none' }
  const state = raw.state === 'MERGED' ? 'merged' : raw.state === 'CLOSED' ? 'closed' : raw.isDraft === true ? 'draft' : 'open'
  const checks = checksSummary(raw.statusCheckRollup)
  const headRefOid = typeof raw.headRefOid === 'string' && raw.headRefOid !== '' ? raw.headRefOid : null
  const comments = parseComments(raw.comments)
  // Decision 055: recorded checks on the head stand for GitHub's passing ones.
  const green = reviewVerdict(comments, headRefOid, own.recorded !== undefined ? (recordedFresh(own.recorded, headRefOid) ? 'passing' : 'none') : checks, review)
  const reviews = selfReviews(comments, review)
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)
  const ghReviews = Array.isArray(raw.reviews) ? raw.reviews : []
  return {
    kind: 'pr', number: raw.number, state, checks, headRefOid, green, rounds: reviews.length, lastReviewAt: reviews.at(-1)?.createdAt || null,
    // Decision 035: the facts behind the merge-readiness verdict; each one absent reads null.
    checkList: parseChecks(raw.statusCheckRollup), mergeable: text(raw.mergeable), mergeStateStatus: text(raw.mergeStateStatus),
    // Decision 074: every comment and GitHub review, for a round posted outside the self-review count.
    posts: reviewPosts(raw.comments, raw.reviews, review),
    reviewDecision: text(raw.reviewDecision), reviewStates: ghReviews.flatMap(one => (typeof one === 'object' && one !== null && typeof (one as Record<string, unknown>).state === 'string' ? [(one as Record<string, unknown>).state as string] : [])),
    updatedAt: text(raw.updatedAt), createdAt: text(raw.createdAt), baseRefName: text(raw.baseRefName), reviewBlockers: reviewBlockerCount(comments, review),
    ...(own.recorded !== undefined ? { recorded: own.recorded } : {}), ...(own.release !== undefined ? { release: own.release } : {}),
    // Decision 055: the review row's word when it is not the default `self-review`.
    ...(reviewLabel(review) !== 'self-review' ? { reviewLabel: reviewLabel(review) } : {}),
  }
}

/**
 * The outcome of `gh pr list --head <branch> --state all --json …` (github tickets, decision 054): the branch's open
 * pull request, else its newest, read as `gh pr view` would be; none for an empty list.
 */
export function parsePullRequestList(
  result: { exitCode: number; stdout: string; stderr: string } | null,
  review: ReviewConfig,
  own: OwnChecks = {},
): TowerPullRequest {
  if (result === null || result.exitCode !== 0) return parsePullRequest(result, review, own)
  let list: unknown
  try {
    list = JSON.parse(result.stdout)
  } catch {
    return { kind: 'error', message: 'gh answered something that is not JSON' }
  }
  if (!Array.isArray(list) || list.length === 0) return { kind: 'none' }
  const isOpen = (item: unknown) => typeof item === 'object' && item !== null && (item as Record<string, unknown>).state === 'OPEN'
  return parsePullRequest({ ...result, stdout: JSON.stringify(list.find(isOpen) ?? list[0]) }, review, own)
}

/** The output of `git rev-list --count`, or null. */
export function parseBehind(result: { exitCode: number; stdout: string }): number | null {
  if (result.exitCode !== 0) return null
  const count = Number.parseInt(result.stdout.trim(), 10)
  return Number.isInteger(count) && count >= 0 ? count : null
}

export function isStale(loadedAt: number, now: number): boolean {
  return now - loadedAt >= REMOTE_STALE_MS
}
