// The rail's focus ring: ↑/↓ walk every Button the pane drew, in order (the header's keys, `+ new session`, SESSIONS,
// the sections' rows, the action keys). The keys check (ensureKeys) puts the ring back on the ▶ row only when it is
// lost: no element, one a redraw took away, a row other than the ▶ one, or a `more` line (which moves the ▶).

/** Every Button's key in a drawn tree, in document order: where the pane's ring may stand. */
export function buttonKeys(node: unknown): string[] {
  if (node === null || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(buttonKeys)
  const element = node as { type?: unknown; props?: Record<string, unknown>; children?: unknown }
  const props = element.props ?? {}
  if (element.type === 'Button') return typeof props.key === 'string' ? [props.key] : []
  return buttonKeys(element.children ?? props.children ?? [])
}

/** The ring stays where it is: on the ▶ row (`marked`), or on any other Button drawn last but a row or a `more` line. */
export function ringRests(ring: string | null, marked: string | null, drawn: ReadonlySet<string>): boolean {
  if (ring === null) return false
  if (ring === marked) return true
  return drawn.has(ring) && !/^(row|cand|hub|more):/.test(ring)
}

/**
 * The row the ▶ follows (decision 058, addendum; the bar is the engine's own ring inverse): the ring's element while the pane holds the keys and
 * it is one of the rows drawn (`rows`: a ticket, an issue or branch, a hub, a stage, a session, `+ new session`); else
 * null, and they stay on the ▶ row.
 */
export function ringRowOf(ring: string | null, hasKeys: boolean, rows: Iterable<string>): string | null {
  if (!hasKeys || ring === null) return null
  for (const row of rows) if (row === ring) return ring
  return null
}
