// A pull request's merge-readiness (decision 035): one verdict with the checklist behind it, the check flips the rail
// announces, the wait colour of a card, and the prompt `f: fix CI` puts in the prompt box.

import type { AttentionEvent } from './attention'
import { ATTENTION_ASSETS } from './attention'
import { formatAge } from './detail'

/** One check of the head commit, as `parseChecks` reads it from statusCheckRollup. */
export type PrCheck = { name: string; state: 'passing' | 'failing' | 'running'; detailsUrl: string | null; startedAt: string | null }

/** The pull request facts the verdict needs; every field but `number` and `state` may be missing (an older read). */
export type PrFacts = {
  number: number
  state: 'draft' | 'open' | 'merged' | 'closed'
  checks: 'passing' | 'failing' | 'running' | 'none'
  green: boolean
  rounds?: number
  checkList?: PrCheck[]
  mergeable?: string | null
  reviewDecision?: string | null
  baseRefName?: string | null
  /** Blockers listed by the newest self-review: 0 for `_(none)_`, null without a review. */
  reviewBlockers?: number | null
  headRefOid?: string | null
  /** Decision 055: the state file's checks when they are the configuration's (no GitHub CI); null: none recorded. */
  recorded?: RecordedChecks | null
  /** Decision 055: the last release tag when the configuration has a release source. */
  release?: ReleaseInfo
  /** Decision 055: the review row's word (`review` for oink); absent: the default `self-review`. */
  reviewLabel?: string
}

/** `info`: a note that never blocks, drawn dim whatever its mark (the release row). */
export type ChecklistItem = { mark: '✓' | '✗' | '◷' | '·'; text: string; info?: true }

// ── Checks without GitHub CI (decision 055) ──────────────────────────────

/** The state file's `checks` (config checks source `stateFile`): the commit they ran on, when, and what ran. */
export type RecordedChecks = { sha: string; at: string | null; ran: string[] }

/**
 * The last release tag (config checks source `release`): the tags' pattern (`build-*`), the newest one (null: none
 * yet), when it was made (ms) and the base's commits since it.
 */
export type ReleaseInfo = { pattern: string; tag: string | null; at: number | null; since: number | null }

/** `checks` of a state file's text: `{ sha, at, ran[] }`; null when the file, the field or its sha is missing. */
export function parseRecordedChecks(stateText: string | undefined): RecordedChecks | null {
  if (stateText === undefined) return null
  let raw: unknown
  try {
    raw = JSON.parse(stateText)
  } catch {
    return null
  }
  const checks = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).checks : undefined
  if (typeof checks !== 'object' || checks === null) return null
  const fields = checks as Record<string, unknown>
  if (typeof fields.sha !== 'string' || fields.sha.trim() === '') return null
  const ran = Array.isArray(fields.ran) ? fields.ran.filter((name): name is string => typeof name === 'string' && name !== '') : []
  return { sha: fields.sha.trim(), at: typeof fields.at === 'string' && fields.at !== '' ? fields.at : null, ran }
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

/** The recorded checks ran on the PR's head commit (a short sha in the file matches its start). */
export function recordedFresh(recorded: RecordedChecks | null | undefined, head: string | null | undefined): boolean {
  if (recorded == null || !head) return false
  const sha = recorded.sha.toLowerCase()
  const full = head.toLowerCase()
  return sha.length >= 7 ? full.startsWith(sha) : sha === full
}

/** The checklist row of the recorded checks: on the head, stale, or none. */
export function recordedItem(recorded: RecordedChecks | null, head: string | null): ChecklistItem {
  if (recorded === null) return { mark: '✗', text: 'no checks recorded' }
  if (recordedFresh(recorded, head)) return { mark: '✓', text: `${recorded.ran.length > 0 ? recorded.ran.join(', ') : 'checks'} on ${shortSha(recorded.sha)} (head)` }
  return { mark: '✗', text: `checks stale (${shortSha(recorded.sha)} ≠ head ${head ? shortSha(head) : '?'})` }
}

/** The release tags' glob from the source's template: `build-{n}` → `build-*`. */
export function releaseGlob(template: string): string {
  return template.replace(/\{n\}/g, '*')
}

/** `git tag --list <glob> --sort=-creatordate --format=%(refname:short)%09%(creatordate:unix)`: the newest tag and its date (ms). */
export function parseReleaseTags(stdout: string): { tag: string; at: number | null } | null {
  const line = stdout.split('\n').map(one => one.trim()).find(one => one !== '')
  if (line === undefined) return null
  const [tag = '', seconds = ''] = line.split('\t')
  const at = Number.parseInt(seconds, 10)
  return tag === '' ? null : { tag, at: Number.isFinite(at) && at > 0 ? at * 1000 : null }
}

/** `3d ago`, `5h ago`, `12m ago`, `just now`: the release row's age, compact. */
export function compactAgo(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ago`
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ago`
  return minutes === 0 ? 'just now' : `${minutes}m ago`
}

/**
 * The release row, dim and never a blocker, short enough for a 60-column deck (decision 055):
 * `◷ suite in release · build-14 · 3d ago · 6 commits since`.
 */
export function releaseItem(release: ReleaseInfo, now: number): ChecklistItem {
  if (release.tag === null) return { mark: '◷', text: `suite in release · no ${release.pattern} tag yet`, info: true }
  const parts = ['suite in release', release.tag]
  if (release.at !== null) parts.push(compactAgo(now - release.at))
  if (release.since !== null) parts.push(`${release.since} commit${release.since === 1 ? '' : 's'} since`)
  return { mark: '◷', text: parts.join(' · '), info: true }
}

export type PrVerdict = {
  kind: 'READY' | 'BLOCKED' | 'WAITING ON CHECKS' | 'DRAFT' | 'CONFLICTS'
  /** `BLOCKED 2`, `READY`. */
  label: string
  tone: 'ready' | 'blocked' | 'waiting' | 'draft'
  /** Failures first, then what runs, then what is fine. */
  items: ChecklistItem[]
}

const MARK_ORDER: Record<ChecklistItem['mark'], number> = { '✗': 0, '◷': 1, '·': 2, '✓': 3 }

/** `ci / unit-tests` → `unit-tests`: a card's short name for a check. */
export function shortCheck(name: string): string {
  const cut = name.lastIndexOf(' / ')
  return cut < 0 ? name : name.slice(cut + 3)
}

/**
 * The verdict of an open or draft pull request, null for a merged or closed one. READY: open, not draft, checks
 * green (GitHub's, or decision 055's recorded checks on the head), no conflict, a green review on the head (`green`). BLOCKED n: failing checks + review blockers
 * (the self-review's, a change request, a missing self-review) + a conflict; CONFLICTS when the conflict is all.
 */
export function prVerdict(pr: PrFacts, now: number): PrVerdict | null {
  if (pr.state !== 'open' && pr.state !== 'draft') return null
  const items: ChecklistItem[] = []
  const list = pr.checkList ?? []
  const failing = list.filter(check => check.state === 'failing')
  const running = list.filter(check => check.state === 'running')
  // Decision 055: a configuration without GitHub CI reads its checks from the state file, against the head commit.
  const own = pr.recorded !== undefined
  const fresh = own && recordedFresh(pr.recorded, pr.headRefOid)
  let failingCount = 0
  let isRunning = false
  if (own) {
    items.push(recordedItem(pr.recorded ?? null, pr.headRefOid ?? null))
    failingCount = fresh ? 0 : 1
  } else {
    for (const check of failing) items.push({ mark: '✗', text: check.name })
    for (const check of running) {
      const since = check.startedAt ? Date.parse(check.startedAt) : Number.NaN
      items.push({ mark: '◷', text: `${check.name} running${Number.isNaN(since) ? '' : ` ${formatAge(now - since)}`}` })
    }
    const passing = list.length - failing.length - running.length
    if (list.length > 0 && passing === list.length) items.push({ mark: '✓', text: `checks ${passing}/${list.length}` })
    else if (list.length > 0) items.push({ mark: '·', text: `checks ${passing}/${list.length} passed` })
    // No checks at all: a blocker on an open PR (nothing green to merge on), a note on a draft.
    const noChecks = list.length === 0 && pr.checks === 'none'
    if (list.length === 0) items.push({ mark: noChecks && pr.state === 'open' ? '✗' : '·', text: 'no checks reported' })
    // A list-less read (an older one) still counts by the summary.
    failingCount = (list.length > 0 ? failing.length : pr.checks === 'failing' ? 1 : 0) + (noChecks ? 1 : 0)
    isRunning = list.length > 0 ? running.length > 0 : pr.checks === 'running'
  }

  let reviewBlockers = 0
  const word = pr.reviewLabel ?? 'self-review'
  const rounds = pr.rounds ?? 0
  const listed = pr.reviewBlockers ?? null
  if (rounds === 0 || listed === null) {
    items.push({ mark: '✗', text: `no ${word} yet` })
    reviewBlockers++
  } else if (listed > 0) {
    items.push({ mark: '✗', text: `${word} round ${rounds}: ${listed} blocker${listed === 1 ? '' : 's'}` })
    reviewBlockers += listed
  } else items.push({ mark: '✓', text: `${word} round ${rounds}` })
  if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    items.push({ mark: '✗', text: 'changes requested' })
    reviewBlockers++
  } else if (pr.reviewDecision === 'APPROVED') items.push({ mark: '✓', text: 'approved' })

  const base = pr.baseRefName || 'the base'
  const conflict = pr.mergeable === 'CONFLICTING'
  if (conflict) items.push({ mark: '✗', text: `merge conflict with ${base}` })
  else if (pr.mergeable === 'MERGEABLE') items.push({ mark: '✓', text: `no conflict with ${base}` })

  // The release row (decision 055) is a note: last, whatever its mark.
  if (pr.release !== undefined) items.push(releaseItem(pr.release, now))
  items.sort((a, b) => (a.info ? 4 : MARK_ORDER[a.mark]) - (b.info ? 4 : MARK_ORDER[b.mark]))
  if (pr.state === 'draft') return { kind: 'DRAFT', label: 'DRAFT', tone: 'draft', items }
  const blockers = failingCount + reviewBlockers + (conflict ? 1 : 0)
  if (conflict && blockers === 1) return { kind: 'CONFLICTS', label: 'CONFLICTS', tone: 'blocked', items }
  // Checks still running decide before a review that waits on them; a failing check or a conflict does not wait.
  if (isRunning && failingCount === 0 && !conflict) return { kind: 'WAITING ON CHECKS', label: 'WAITING ON CHECKS', tone: 'waiting', items }
  if (blockers > 0) return { kind: 'BLOCKED', label: `BLOCKED ${blockers}`, tone: 'blocked', items }
  if ((own ? fresh : pr.checks === 'passing') && pr.green) return { kind: 'READY', label: 'READY', tone: 'ready', items }
  // Clean otherwise but not green on the head (no head sha read): one blocker.
  return { kind: 'BLOCKED', label: 'BLOCKED 1', tone: 'blocked', items }
}

/** A card's PR row: `PR #2408 · BLOCKED 1 · ✗ unit-tests` (the first failing or running item, a check by its short name). */
export function prCardLine(pr: { number: number; checkList?: PrCheck[] }, verdict: PrVerdict): string {
  const first = verdict.items.find(item => !item.info && (item.mark === '✗' || item.mark === '◷'))
  const names = new Set((pr.checkList ?? []).map(check => check.name))
  const text = first === undefined ? null : names.has(first.text) ? shortCheck(first.text) : first.text.replace(/^(.+?) running/, (_, name: string) => `${shortCheck(name)} running`)
  return `PR #${pr.number} · ${verdict.label}${text === null ? '' : ` · ${first!.mark} ${text}`}`
}

/** The inspector's checklist: up to `max` items, then `+n more`. */
export function checklistLines(items: readonly ChecklistItem[], max = 5): { items: ChecklistItem[]; more: number } {
  return { items: items.slice(0, max), more: Math.max(0, items.length - max) }
}

export const WAIT_YELLOW_DAYS = 3
export const WAIT_RED_DAYS = 14
const DAY_MS = 86_400_000

/** A ticket that waits on the person: yellow after 3 days, red after 14, from when its state began (`since`, ms). */
export function waitTone(since: number | null, now: number): { days: number; tone: 'yellow' | 'red' | null } | null {
  if (since === null || !Number.isFinite(since)) return null
  const days = Math.max(0, Math.floor((now - since) / DAY_MS))
  return { days, tone: days >= WAIT_RED_DAYS ? 'red' : days >= WAIT_YELLOW_DAYS ? 'yellow' : null }
}

/** The ticket waits on the person: its column is `needs you`, or it is ready for review or merge. */
export function waitsOnPerson(group: string, status: string): boolean {
  return group === 'needs you' || status === 'ready · review' || status === 'ready · merge'
}

/** What `f: fix CI` puts in the prompt box (never sends). */
export function fixCiPrompt(check: { name: string; detailsUrl: string | null }, pr: number): string {
  return `CI check "${check.name}" failed on PR #${pr}${check.detailsUrl ? `: ${check.detailsUrl}` : ''}. Read the failing log with gh run view --log-failed and fix it.`
}

// ── The deck's PR box (decision 044) ─────────────────────────────────────

/** A theme role the deck maps to its colour; `dim` is dim text, `panel` the panel border. */
export type PrTone = 'done' | 'error' | 'needsYou' | 'dim'

/** The checklist rows the box shows (failures first), then `+n more`. */
export const PR_BOX_ITEMS = 5

/** Rows the box always takes in the deck, border included: line 1, the checklist rows, the footer (`+n more`, `f: fix CI`). */
export const PR_BOX_ROWS = 2 + 1 + PR_BOX_ITEMS + 1

export type PrBox = {
  number: number
  /** The verdict's label (`BLOCKED 2`) and its colour. */
  label: string
  tone: PrTone
  border: 'done' | 'error' | 'needsYou' | 'panel'
  /** Right of line 1: `waiting 4d` in the wait colour while the ticket waits on the person, else `updated 2h ago`. */
  right: { text: string; tone: PrTone }
  rows: { mark: ChecklistItem['mark']; text: string; tone: PrTone }[]
  more: number
  /** The first failing check, for `f: fix CI`; null when none failed. */
  failed: PrCheck | null
}

const MARK_TONE: Record<ChecklistItem['mark'], PrTone> = { '✗': 'error', '◷': 'needsYou', '✓': 'done', '·': 'dim' }

/**
 * The flightdeck's PR box for the ticket's own pull request, null for a merged or closed one. `waits`: the ticket
 * waits on the person (`needs you`, ready for review or merge); `ago` writes the time since the PR's last update.
 */
export function prBox(pr: PrFacts & { updatedAt?: string | null }, now: number, waits: boolean, ago: (ms: number) => string): PrBox | null {
  const verdict = prVerdict(pr, now)
  if (verdict === null) return null
  const tone: PrTone = verdict.tone === 'ready' ? 'done' : verdict.tone === 'blocked' ? 'error' : verdict.tone === 'waiting' ? 'needsYou' : 'dim'
  const border = verdict.kind === 'CONFLICTS' || verdict.tone === 'waiting' ? 'needsYou' : verdict.tone === 'blocked' ? 'error' : verdict.tone === 'ready' ? 'done' : 'panel'
  const since = pr.updatedAt ? Date.parse(pr.updatedAt) : Number.NaN
  const wait = waits ? waitTone(Number.isNaN(since) ? null : since, now) : null
  const right: PrBox['right'] = wait !== null ? { text: `waiting ${wait.days}d`, tone: wait.tone === 'red' ? 'error' : wait.tone === 'yellow' ? 'needsYou' : 'dim' }
    : Number.isNaN(since) ? { text: '', tone: 'dim' } : { text: `updated ${ago(now - since)}`, tone: 'dim' }
  const list = checklistLines(verdict.items, PR_BOX_ITEMS)
  return {
    number: pr.number, label: verdict.label, tone, border, right,
    rows: list.items.map(item => ({ mark: item.mark, text: item.text, tone: item.info ? 'dim' : MARK_TONE[item.mark] })),
    more: list.more,
    failed: (pr.checkList ?? []).find(check => check.state === 'failing') ?? null,
  }
}

// ── Check flips (the rail's) ─────────────────────────────────────────────

/** One ticket's PR as the rail last read it. */
export type CheckRead = { head: string | null; checks: 'passing' | 'failing' | 'running' | 'none'; failing: string[] }

export type CheckSeen = { reads: Record<string, CheckRead>; announced: string[] }

/**
 * A check of a ticket's PR that turned failing since the previous read: one `needs you` event `ci failed · <check>`,
 * once per ticket + check + head sha. A PR whose checks ran and all turned green: one `ready` event `checks green`,
 * once per ticket + head sha. Null `seen` (the first read) records and raises nothing; a ticket read for the first
 * time raises nothing either. The centre's chimes only.
 */
export function checkEvents(
  seen: CheckSeen | null,
  rows: readonly { key: string; pr: { number: number; headRefOid: string | null; checks: CheckRead['checks']; checkList?: PrCheck[] } | null }[],
  centreTicket: string | null,
): { events: AttentionEvent[]; seen: CheckSeen } {
  const reads: Record<string, CheckRead> = {}
  const announced = [...(seen?.announced ?? [])]
  const events: AttentionEvent[] = []
  for (const row of rows) {
    if (row.pr === null) continue
    const failing = (row.pr.checkList ?? []).filter(check => check.state === 'failing').map(check => check.name)
    const now: CheckRead = { head: row.pr.headRefOid, checks: row.pr.checks, failing }
    reads[row.key] = now
    const was = seen?.reads[row.key]
    if (was === undefined) continue
    const centre = row.key === centreTicket ? { centre: true as const } : {}
    for (const name of failing) {
      const id = `${row.key}:${name}:${now.head ?? ''}`
      if ((was.head === now.head && was.failing.includes(name)) || announced.includes(id)) continue
      announced.push(id)
      const hint = `ci failed · ${name}`
      events.push({ key: row.key, kind: 'needs you', text: `◆ ${row.key} ${hint}`, hint, asset: ATTENTION_ASSETS['needs you'], ...centre })
    }
    const greenId = `${row.key}:green:${now.head ?? ''}`
    if (was.checks === 'running' && now.checks === 'passing' && !announced.includes(greenId) && row.key !== centreTicket) {
      announced.push(greenId)
      events.push({ key: row.key, kind: 'ready', text: `✓ ${row.key} checks green`, hint: 'checks green', asset: ATTENTION_ASSETS.ready })
    }
  }
  return { events, seen: { reads, announced: announced.slice(-200) } }
}
