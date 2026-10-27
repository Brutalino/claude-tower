// The deck's REVIEW box (decision 025): one key starts the review in a hidden session; tower posts the saved review itself.

import type { TowerReviewPost } from '../../types/index'
import type { Pattern, ReviewConfig } from './config'

// Written out here rather than imported from config.ts: config.ts imports the edition's configuration (hooks/<edition>/config.ts, decision 083), which imports this file.
const toRegExp = (pattern: Pattern): RegExp => new RegExp(pattern.source, pattern.flags)

/**
 * A review this ticket session started: the round it runs, when, and the PR's self-review count at the start.
 * `body`: the saved review, ready to post; `posting`: `gh pr comment` runs now; `failed`: its first error line;
 * `by`: `tower` once tower posted it; `verifying`: since when the review session says it posted the round, until a
 * fresh read of the PR shows the comment (decision 046).
 */
export type ReviewRun = {
  pr: number; round: number; startedAt: number; baseRounds: number; postedAt: number | null
  body?: string; posting?: true; failed?: string; by?: 'tower'; verifying?: number
}

/**
 * What the review session's status file says about its last turn; `waiting`: the permission or question it waits on now (absent: none).
 * `shown`: the last answer showed the review; `body`: the file that holds it, as it is to be posted; `posted`: the last
 * answer reports the round posted (decision 046), for the ticket session to verify on the PR.
 */
export type ReviewPeer = { state: string; since: number; action: string; asks: string | null; waiting?: string | null; shown?: boolean; body?: string | null; posted?: boolean }

export type ReviewBox =
  | { kind: 'none'; pr: number }
  | { kind: 'reviewing'; pr: number; round: number; startedAt: number; action: string }
  | { kind: 'asks'; pr: number; round: number; startedAt: number; question: string; waiting?: true }
  | { kind: 'ready'; pr: number; round: number; startedAt: number; posting: boolean }
  | { kind: 'failed'; pr: number; round: number; startedAt: number; error: string }
  | { kind: 'verifying'; pr: number; round: number; startedAt: number }
  | { kind: 'idle'; pr: number; round: number; startedAt: number }
  | { kind: 'posted'; pr: number; round: number; at: number | null; by?: 'tower' }

/** The box, or null without an open or draft pull request. */
export function reviewBox(
  pullRequest: { kind: string; number?: number; state?: string; rounds?: number; lastReviewAt?: string | null } | null,
  run: ReviewRun | null,
  peer: ReviewPeer | null,
): ReviewBox | null {
  if (pullRequest === null || pullRequest.kind !== 'pr' || (pullRequest.state !== 'open' && pullRequest.state !== 'draft')) return null
  const pr = pullRequest.number ?? 0
  const rounds = pullRequest.rounds ?? 0
  const lastAt = pullRequest.lastReviewAt ? Date.parse(pullRequest.lastReviewAt) : Number.NaN
  if (run !== null && run.pr === pr && run.postedAt === null) {
    // Only what the review session said after this round started counts.
    // A permission dialog or a question it waits on now: live in the status file, so always fresh.
    const waiting = peer?.waiting ?? null
    if (waiting !== null) return { kind: 'asks', pr, round: run.round, startedAt: run.startedAt, question: waiting, waiting: true }
    if (run.failed !== undefined) return { kind: 'failed', pr, round: run.round, startedAt: run.startedAt, error: run.failed }
    if (run.body !== undefined) return { kind: 'ready', pr, round: run.round, startedAt: run.startedAt, posting: run.posting === true }
    const fresh = peer !== null && peer.state !== 'working' && peer.since >= run.startedAt
    // The review session says it posted: `✓ posted round N · verifying` until a fresh read of the PR shows it (decision 046).
    if (run.verifying !== undefined || (fresh && peer.posted === true)) return { kind: 'verifying', pr, round: run.round, startedAt: run.startedAt }
    if (fresh && peer.asks !== null) return { kind: 'asks', pr, round: run.round, startedAt: run.startedAt, question: peer.asks }
    // Its turn ended with no question, no post and no refusal: it waits for the person, it is not reviewing (decision 046).
    if (fresh) return { kind: 'idle', pr, round: run.round, startedAt: run.startedAt }
    return { kind: 'reviewing', pr, round: run.round, startedAt: run.startedAt, action: peer?.action ?? '' }
  }
  if (run !== null && run.pr === pr && run.postedAt !== null) return { kind: 'posted', pr, round: Math.max(run.round, rounds), at: run.postedAt, ...(run.by !== undefined ? { by: run.by } : {}) }
  if (rounds > 0) return { kind: 'posted', pr, round: rounds, at: Number.isNaN(lastAt) ? null : lastAt }
  return { kind: 'none', pr }
}

/**
 * The box's keys: `v` to start (or a new round once posted, or while the review session waits idle), `post` for a review ready and not posting,
 * `l` to look at the review session in every state that has one.
 */
export function reviewKeys(box: ReviewBox): ('v' | 'post' | 'l')[] {
  if (box.kind === 'none') return ['v']
  if (box.kind === 'posted' || box.kind === 'idle') return ['v', 'l']
  if (box.kind === 'ready' && !box.posting) return ['post', 'l']
  return ['l']
}

/**
 * True once the running round is posted outside tower's own `gh pr comment` (by hand, or by the review session):
 * `rounds`, the `## Self-review` comments a fresh `gh pr view` counts, is more than at the round's start. Nothing
 * the review session says or runs counts (decision 025).
 */
export function reviewPosted(run: ReviewRun, rounds: number): boolean {
  return run.postedAt === null && rounds > run.baseRounds
}

/** How much earlier than the round's start a post on the PR may read and still count: GitHub's clock and this one (decision 074). */
export const REVIEW_POST_SKEW_MS = 60_000

/**
 * Decision 074: the round posted in a way the `## Self-review` count misses, on a fresh read of the PR: a comment (any
 * author) that is no review comment (isReviewComment, decision 081) but holds two of the review's sections, a GitHub
 * review by the viewer (`gh api user`) with a body, or any GitHub review that holds two of the sections; each made
 * after the round's start, REVIEW_POST_SKEW_MS earlier at most. `viewer` null: the viewer's own reviews are not
 * recognised.
 */
export function postedOutsideCount(startedAt: number, posts: readonly TowerReviewPost[], viewer: string | null): boolean {
  const me = viewer === null ? null : viewer.toLowerCase()
  return posts.some(post => {
    const at = Date.parse(post.at)
    if (Number.isNaN(at) || at < startedAt - REVIEW_POST_SKEW_MS) return false
    // A review comment (isReviewComment) is the count's: an earlier round's, posted just before this one started, is no post of this round.
    if (post.kind === 'comment') return !post.heading && post.sections >= 2
    if (post.sections >= 2) return true
    return me !== null && post.author !== null && post.author.toLowerCase() === me && !post.empty
  })
}

/** The running round posted, on a fresh read of the PR: more `## Self-review` comments than at its start, or posted otherwise (decision 074). */
export function roundPosted(run: ReviewRun, pullRequest: { rounds?: number; posts?: readonly TowerReviewPost[] }, viewer: string | null): boolean {
  if (run.postedAt !== null) return false
  return reviewPosted(run, pullRequest.rounds ?? 0) || postedOutsideCount(run.startedAt, pullRequest.posts ?? [], viewer)
}

/** How long the PR is read again for a post the review session reported before the box says it was not found. */
export const REVIEW_VERIFY_MS = 120_000

/** A reported post still not on the PR REVIEW_VERIFY_MS after the report (decision 046). */
export function reviewVerifyExpired(run: ReviewRun, now: number): boolean {
  return run.postedAt === null && run.verifying !== undefined && now - run.verifying >= REVIEW_VERIFY_MS
}

/** The `## Self-review` review's own headings (a Linear project's `/review` skill writes them). */
export const REVIEW_SECTIONS = ['Scope check', 'Quality check', 'Blockers', 'Suggestions', 'Good stuff']

/**
 * The answer shows the review: its heading (config review.heading; e.g. `## Self-review`, with or without
 * `(round N)`), or two of its section headings (config review.sections).
 */
export function reviewShown(answer: string, review: ReviewConfig): boolean {
  if (toRegExp(review.heading).test(answer)) return true
  return reviewSectionCount(answer, review) >= 2
}

/**
 * A PR comment is a review round (decision 081): its first line is the heading (config review.heading; e.g.
 * `## Self-review`) and, when the configuration has verdict lines (config review.verdict), its body holds one, ready
 * or fixes. oink's `## Review round 2: changes`, the ticket session's reply listing its fixes, has the heading and no
 * verdict: no round. Without verdict patterns (a `## Self-review` configuration) the heading alone, as before. Never for the review session's
 * answer or saved file (reviewShown).
 */
export function isReviewComment(body: string, review: ReviewConfig): boolean {
  if (!toRegExp(review.heading).test(body.trimStart().split('\n')[0] ?? '')) return false
  return review.verdict === null || toRegExp(review.verdict.ready).test(body) || toRegExp(review.verdict.fixes).test(body)
}

/** How many of the review's section headings (config review.sections, as `### <section>`) the text holds. */
export function reviewSectionCount(text: string, review: ReviewConfig): number {
  return review.sections.filter(section => new RegExp(`^###\\s+${section}\\b`, 'im').test(text)).length
}

/** A refusal that only waits for agreement (`not posting until you agree`): the skill's own wait, not a refusal. */
const UNTIL_AGREED = String.raw`(?![^.?!\n]*\b(?:until|unless|without|before|finché|senza|prima)\b)`

const NOT_POSTING = new RegExp(
  String.raw`\b(?:(?:cannot|can['’]t|can not|won['’]t|will not) post|not posting|non (?:pubblico|posso pubblicare))\b${UNTIL_AGREED}|\bCI is red\b|\bred CI\b`,
  'i',
)

/** The answer says the review is not to be posted: red CI, a missing PR body section, a wrong base. */
export function cannotPost(answer: string): boolean {
  return NOT_POSTING.test(answer)
}

/** `review post` in the settings: `auto` posts the saved review at once, `key` waits for the box's key. */
export type ReviewPost = 'auto' | 'key'

/**
 * Whether tower posts the review now, shows it ready for the key, or does nothing (decision 025): only a review
 * shown with a non-empty body file (`bodyLength`: null without one), never for a round already posted (a new
 * self-review comment on the PR since the round started, or `postedElsewhere`: the round posted as roundPosted reads
 * it, decision 074). Away mode posts as `auto` does.
 */
export function reviewPostDecision(input: {
  setting: ReviewPost; away: boolean; shown: boolean; bodyLength: number | null; rounds: number; baseRounds: number; postedElsewhere?: boolean
}): 'post' | 'ready' | 'none' {
  if (input.rounds > input.baseRounds || input.postedElsewhere === true) return 'none'
  if (!input.shown || input.bodyLength === null || input.bodyLength === 0) return 'none'
  return input.setting === 'auto' || input.away ? 'post' : 'ready'
}

/**
 * Where the review session works and saves: `cwd` its working directory, `worktree` the ticket's worktree
 * (TOWER_WORKTREE, where tower asks it to save), `scratchpad` its own Claude scratchpad directory.
 */
export type ReviewPlaces = { cwd: string; worktree?: string | null; scratchpad?: string | null }

/** The folder and the file name of `review.savePath` (e.g. `.work/review`, `pr-{pr}-round-{round}.md`). */
export function reviewSaveParts(savePath: string): { folder: string; name: string } {
  const cut = savePath.lastIndexOf('/')
  return cut < 0 ? { folder: '', name: savePath } : { folder: savePath.slice(0, cut), name: savePath.slice(cut + 1) }
}

/** `<base>/<folder>`, or `<base>` when the save path has no folder. */
export function reviewSaveFolder(base: string, savePath: string): string {
  const { folder } = reviewSaveParts(savePath)
  const root = base.replace(/\/+$/, '')
  return folder === '' ? root : `${root}/${folder}`
}

/**
 * The file that holds the review as it is to be posted: the `--body-file <path>` the answer names in its last
 * paragraph, else the last absolute or `scratchpad/…` `.md` path the answer names, else the newest round's file
 * among `saved` (the names in the save path's folder under `<worktree>`, under `<cwd>` without a worktree; config
 * review.savePath, e.g. `.work/review/pr-<n>-round-<N>.md`), else null. A relative `scratchpad/…` is taken
 * from the scratchpad directory, any other relative path from `cwd`. The caller reads the file before it trusts it.
 */
export function reviewBodyPath(answer: string, places: ReviewPlaces, pr: number, saved: readonly string[], savePath: string): string | null {
  const named = reviewNamedPath(answer, places)
  if (named !== null) return named
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const name = reviewSaveParts(savePath).name.split(/(\{\w+\})/).map(part => (part === '{pr}' ? String(pr) : part === '{round}' ? '(\\d+)' : escape(part))).join('')
  const rounds = saved.map(entry => new RegExp(`^${name}$`).exec(entry)).filter(match => match !== null)
  const newest = rounds.sort((a, b) => Number(b[1]) - Number(a[1]))[0]
  const folder = reviewSaveFolder(places.worktree ? places.worktree : places.cwd, savePath)
  return newest === undefined ? null : `${folder}/${newest[0]}`
}

/**
 * The file the answer itself names for the review (reviewBodyPath's first two places): the `--body-file <path>` of
 * its last paragraph, else the last absolute or `scratchpad/…` `.md` path it mentions; null when it names none. Never
 * a file the answer does not name (decision 079: no guess at the newest round in the folder).
 */
export function reviewNamedPath(answer: string, places: ReviewPlaces): string | null {
  const paragraph = answer.split(/\n\s*\n/).map(part => part.trim()).filter(part => part !== '').at(-1) ?? ''
  // A sentence's end after the path (`review.md.`, `r.md?`) is no part of it.
  const named = [...paragraph.matchAll(/--body-file[=\s]+(["'`]?)([^\s"'`]+)\1/g)].at(-1)?.[2]?.replace(/[.,;:?!)]+$/, '')
  const base = places.cwd.replace(/\/+$/, '')
  const scratchpad = places.scratchpad ? places.scratchpad.replace(/\/+$/, '') : null
  const resolve = (path: string): string | null => {
    if (path.startsWith('/')) return path
    const relative = path.replace(/^\.\//, '')
    if (relative.startsWith('scratchpad/')) return scratchpad === null ? null : `${scratchpad}/${relative.slice('scratchpad/'.length)}`
    return `${base}/${relative}`
  }
  if (named !== undefined) {
    const path = resolve(named)
    if (path !== null) return path
  }
  // `Saved to /private/tmp/…/scratchpad/pr2408/review.md.`, `scratchpad/pr2408/review.md`: a path outside the working directory.
  const mentioned = [...answer.matchAll(/(?:^|[\s(`'"])((?:\/|scratchpad\/)[^\s`'"()]*\.md)\b/g)].map(match => match[1] as string)
  for (const path of mentioned.reverse()) {
    const resolved = resolve(path)
    if (resolved !== null) return resolved
  }
  return null
}

/**
 * The round the review names in its heading (e.g. `## Self-review (round N)`); 1 for a bare one. A heading
 * pattern that captures the round itself (group 1, as `## Self-review (round N)`'s does) says it; one that captures nothing leaves it
 * to `review.roundPattern` in the heading line.
 */
export function reviewRound(answer: string, review: ReviewConfig): number {
  const heading = toRegExp(review.heading).exec(answer)
  if (heading === null) return 1
  const round = heading.length > 1 ? heading[1] : toRegExp(review.roundPattern).exec(heading[0])?.[1]
  return round === undefined ? 1 : Number(round)
}

/**
 * Whether the review session's answer shows the review, and the round it shows (decision 079): the answer itself
 * (reviewShown, its round from its heading), else the saved review the answer names (`fileText`: the text of
 * reviewNamedPath's file, null without one) when that text reads as the review, its round from the file's heading.
 * A review shown to the person in another language (oink: Italian prose, no heading) is recognised by the file.
 */
export function reviewSeen(answer: string, fileText: string | null, review: ReviewConfig): { shown: boolean; round: number; source: 'answer' | 'file' } {
  if (reviewShown(answer, review)) return { shown: true, round: reviewRound(answer, review), source: 'answer' }
  if (fileText !== null && reviewShown(fileText, review)) return { shown: true, round: reviewRound(fileText, review), source: 'file' }
  return { shown: false, round: reviewRound(answer, review), source: 'answer' }
}

/** A trailing paragraph that asks the person what to do with the review: never part of what is posted. */
const ASKS_PERSON = /^(?:Reply with|Shall I|Want me|Should I|Post |Vuoi|Dimmi|Posso)/

/**
 * The review as it is to be posted, taken from the answer itself when no file holds it: from the first line that is
 * the review's heading (config review.heading, case as the pattern says; e.g. `## Self-review…`) to the line before the first trailing paragraph that asks the person (`Reply with…`,
 * `Shall I…`, …) or a horizontal rule after the last `###` section. Null without the heading or without two `###`
 * sections in it.
 */
export function extractReviewBody(answer: string, review: ReviewConfig): string | null {
  const lines = answer.split('\n')
  const heading = toRegExp(review.heading)
  const start = lines.findIndex(line => heading.test(line.trim()))
  if (start === -1) return null
  const sections = lines.map((line, index) => (index > start && /^###\s/.test(line.trim()) ? index : -1)).filter(index => index !== -1)
  if (sections.length < 2) return null
  const last = sections.at(-1) as number
  let end = lines.length
  for (let index = last + 1; index < lines.length; index += 1) {
    const line = (lines[index] as string).trim()
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) { end = index; break }
    const opensParagraph = (lines[index - 1] as string).trim() === ''
    if (opensParagraph && ASKS_PERSON.test(line)) { end = index; break }
  }
  const body = lines.slice(start, end).join('\n').trim()
  return body === '' ? null : body
}

/** The answer reports the round posted: `posted` with the comment's `issuecomment-` link, or `posted the round`. */
export function reportsPost(answer: string): boolean {
  return (/\bposted\b/i.test(answer) && /issuecomment-\d+/.test(answer)) || /\bposted the round\b/i.test(answer)
}

/**
 * The review session's last answer (its first 40 characters shown): an answer that says it cannot post shows its
 * last line; one that reports the post asks nothing and is `posted` (the ticket session verifies it on the PR,
 * decision 046); the post question asks nothing; else its last question (a line ending `?`), or nothing.
 */
export function reviewAnswer(answer: string, postQuestion: (answer: string) => boolean): { asks: string | null; posted: boolean } {
  const lines = answer.split('\n').map(line => line.trim()).filter(line => line !== '')
  // Not posting (red CI, …): the person reads why, from the last line.
  if (cannotPost(answer)) return { asks: lines.at(-1)?.slice(0, 40) ?? null, posted: false }
  if (reportsPost(answer)) return { asks: null, posted: true }
  if (postQuestion(answer)) return { asks: null, posted: false }
  const question = lines.filter(line => line.endsWith('?')).at(-1) ?? null
  return { asks: question === null ? null : question.slice(0, 40), posted: false }
}

/** `1:12` for a running round. */
export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** `2m ago`, `just now`, `3h ago`. */
export function ago(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

/** Rows the box takes in the deck, border included. */
export const REVIEW_BOX_ROWS = 4
