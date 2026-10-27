// When a ticket away from the centre needs the person, or a working one becomes ready: one popup on the board and one soft chime per change.

import type { StepGlyph, StepGroup } from './nextStep'

/** A ticket's step as the rail last saw it; `label`: what the popup calls it when not its key (a free session's name, decision 055). */
export type AttentionRow = { key: string; group: StepGroup; glyph: StepGlyph; status: string; label?: string }

/** `centre`: the ticket in the centre; it gets the chime only, no popup (the person may be on another window). */
export type AttentionEvent = { key: string; kind: 'needs you' | 'ready'; text: string; hint: string; asset: string; centre?: true; label?: string }

export const ATTENTION_ASSETS = { 'needs you': 'assets/needs-you.wav', ready: 'assets/ready.wav' } as const

/** The status's last part (`planning · say go` → `say go`), the popup's second line. */
function hint(status: string): string {
  // Decision 037: `needs you · risky · <command>` keeps `risky · ` (the popup draws it red).
  const risky = status.indexOf('risky · ')
  if (risky >= 0) return status.slice(risky)
  const cut = status.lastIndexOf(' · ')
  return cut < 0 ? status : status.slice(cut + 3)
}

/**
 * The changes worth a popup: a ticket that turned `needs you` (not blocked), or a working ticket that turned ready (`✓`).
 * Null previous rows (the first load) give none. The ticket in the centre gives only its `needs you`, marked `centre`
 * (a chime, no popup); its ready gives none: the person is on it.
 */
export function attentionEvents(previousRows: readonly AttentionRow[] | null, rows: readonly AttentionRow[], centreTicket: string | null): AttentionEvent[] {
  if (previousRows === null) return []
  const before = new Map(previousRows.map(row => [row.key, row]))
  const events: AttentionEvent[] = []
  for (const row of rows) {
    const was = before.get(row.key)
    if (was === undefined) continue
    const centre = row.key === centreTicket ? { centre: true as const } : {}
    const label = row.label !== undefined ? { label: row.label } : {}
    const name = row.label ?? row.key
    if (row.group === 'needs you' && row.glyph !== '⊘' && was.group !== 'needs you') {
      events.push({ key: row.key, kind: 'needs you', text: `◆ ${name} needs you · ${hint(row.status)}`, hint: hint(row.status), asset: ATTENTION_ASSETS['needs you'], ...centre, ...label })
    } else if (row.group === 'ready' && row.glyph === '✓' && was.group === 'working' && row.key !== centreTicket) {
      events.push({ key: row.key, kind: 'ready', text: `✓ ${name} ready · ${hint(row.status)}`, hint: hint(row.status), asset: ATTENTION_ASSETS.ready, ...label })
    }
  }
  return events
}

// ── The shared queue: the rail writes each event to its repository's file (`<Tower's folder>/attention-<repo>.json`, see core/stateDir); the board's popup shows the oldest not yet seen.

/** One event as the store keeps it; `text` is the popup's second line (`say go`, `permission · Bash gh pr view …`); `label` a free session's name. */
export type QueuedEvent = { id: string; ticket: string; kind: 'needs' | 'ready'; text: string; at: number; label?: string }

export const ATTENTION_KEEP = 20
/** An event older than this is never shown: a session that comes back late shows nothing stale. */
export const ATTENTION_FRESH_MS = 120_000
/** A popup nobody answers goes away after this; the next queued event follows. */
export const POPUP_SHOWN_MS = 10_000

export function queuedEvent(event: AttentionEvent, at: number, text = event.hint): QueuedEvent {
  const kind = event.kind === 'needs you' ? 'needs' : 'ready'
  return { id: `${at}:${event.key}:${kind}`, ticket: event.key, kind, text, at, ...(event.label !== undefined ? { label: event.label } : {}) }
}

/** The queue with the event added at its end, the last ATTENTION_KEEP kept. */
export function pushEvent(events: readonly QueuedEvent[], event: QueuedEvent): QueuedEvent[] {
  return [...events.filter(one => one.id !== event.id), event].slice(-ATTENTION_KEEP)
}

/** Whatever the store holds as the queue: anything malformed is dropped. */
export function parseQueue(value: unknown): QueuedEvent[] {
  if (!Array.isArray(value)) return []
  return value.filter((one): one is QueuedEvent => typeof one === 'object' && one !== null
    && typeof one.id === 'string' && typeof one.ticket === 'string' && (one.kind === 'needs' || one.kind === 'ready')
    && typeof one.text === 'string' && typeof one.at === 'number' && (one.label === undefined || typeof one.label === 'string'))
}

/** The oldest event still fresh, not seen by this session and not about its own ticket; null when none. */
export function pendingFor(events: readonly QueuedEvent[], seenIds: readonly string[], now: number, ownTicket: string | null = null): QueuedEvent | null {
  return events.find(event => now - event.at <= ATTENTION_FRESH_MS && !seenIds.includes(event.id) && event.ticket !== ownTicket) ?? null
}

/** The popup's first line: `◆ TKT-2426 needs you` or `✓ TKT-2426 ready`. */
export function popupTitle(event: QueuedEvent): string {
  const name = event.label ?? event.ticket
  return event.kind === 'needs' ? `◆ ${name} needs you` : `✓ ${name} ready`
}

/**
 * Whether a step event plays the chime: a ready, or a `needs you` on a real wait (a permission dialog or a question that
 * blocks the session) or an open pinned decision (decision 036). A plan's `say go` ends an ordinary turn: its popup
 * stays, with no sound. Stall, loop and check-flip events (decisions 033, 035) have their own dedupe and always chime.
 */
export function chimes(event: AttentionEvent): boolean {
  return event.kind === 'ready' || event.hint === 'permission' || event.hint === 'question' || event.hint === 'decision'
}

type AnnouncedOne = { reason: string; at: number }

/** The last event announced per ticket and kind: its reason (the hint). */
export type Announced = Record<string, Partial<Record<AttentionEvent['kind'], AnnouncedOne>>>

/** The `$.store` key of the rail's announced map, beside the queue. */
export function announcedKey(repo: string | null): string {
  return `announced:${repo ?? ''}`
}

/** The stored map; an entry of the old shape (`{ kind, reason, at }`, one per ticket) is read as its kind's. */
export function parseAnnounced(value: unknown): Announced {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const one = (value: unknown): AnnouncedOne | null => {
    if (typeof value !== 'object' || value === null) return null
    const { reason, at } = value as Record<string, unknown>
    return typeof reason === 'string' ? { reason, at: typeof at === 'number' ? at : 0 } : null
  }
  const kept: Announced = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const old = record.kind === 'needs you' || record.kind === 'ready' ? record.kind : null
    const needs = old === 'needs you' ? one(record) : old === null ? one(record['needs you']) : null
    const ready = old === 'ready' ? one(record) : old === null ? one(record.ready) : null
    if (needs === null && ready === null) continue
    kept[key] = { ...(needs !== null ? { 'needs you': needs } : {}), ...(ready !== null ? { ready } : {}) }
  }
  return kept
}

/**
 * Only an event whose reason differs from the last one announced for its ticket and kind passes: a `working ↔ needs you`
 * flip-flop with the same reason (an idle session's away recap) never announces twice, and neither does each turn's
 * end of a ticket that stays `ready · /open-pr`. A ticket that is `ready` forgets its `needs you`, so a later wait
 * after real progress announces again; its ready is kept until the reason changes or the ticket leaves the rows. A key in
 * `cleared` (a free session that no longer waits) forgets its `needs you` too.
 */
export function dedupeEvents(events: readonly AttentionEvent[], announced: Announced, rows: readonly AttentionRow[], now: number, cleared: ReadonlySet<string> = new Set()): { events: AttentionEvent[]; announced: Announced } {
  const groups = new Map(rows.map(row => [row.key, row.group]))
  const next: Announced = {}
  for (const [key, entry] of Object.entries(announced)) {
    if (!groups.has(key)) continue
    const { 'needs you': needs, ready } = entry
    // `cleared` (decision 055): a free session no longer waiting forgets its wait as a ticket that turned ready does.
    const kept = { ...(needs !== undefined && groups.get(key) !== 'ready' && !cleared.has(key) ? { 'needs you': needs } : {}), ...(ready !== undefined ? { ready } : {}) }
    if (Object.keys(kept).length > 0) next[key] = kept
  }
  const passed: AttentionEvent[] = []
  for (const event of events) {
    if (announced[event.key]?.[event.kind]?.reason === event.hint) continue
    passed.push(event)
    next[event.key] = { ...next[event.key], [event.kind]: { reason: event.hint, at: now } }
  }
  return { events: passed, announced: next }
}

// ── Stalls and loops (decision 033) ───────────────────────────────────────

/**
 * One `needs you` event per stall or loop of a ticket: an alert whose id the rail has not seen yet. Null `seen` (the
 * first load) records the alerts and raises none. The centre's alert chimes only, as its `needs you` does.
 */
export function alertEvents(
  seen: Readonly<Record<string, string>> | null,
  rows: readonly { key: string; alert: { text: string; id: string } | null }[],
  centreTicket: string | null,
): { events: AttentionEvent[]; seen: Record<string, string> } {
  const next: Record<string, string> = {}
  const events: AttentionEvent[] = []
  for (const row of rows) {
    if (row.alert === null) continue
    next[row.key] = row.alert.id
    if (seen === null || seen[row.key] === row.alert.id) continue
    const centre = row.key === centreTicket ? { centre: true as const } : {}
    events.push({ key: row.key, kind: 'needs you', text: `◆ ${row.key} ${row.alert.text}`, hint: row.alert.text, asset: ATTENTION_ASSETS['needs you'], ...centre })
  }
  return { events, seen: next }
}
