// A reply's blocks (decision 038): GitHub alerts, task lists, strikethrough and simple mermaid diagrams drawn in
// the terminal; everything else stays the engine's Markdown. Ideas from gfm-render and claude-mermaid (MIT), own code.

export type AlertKind = 'note' | 'tip' | 'important' | 'warning' | 'caution'

export type ReplyBlock =
  | { kind: 'markdown'; text: string }
  | { kind: 'alert'; alert: AlertKind; label: string; text: string }
  | { kind: 'tasks'; items: Array<{ done: boolean; text: string; indent: number }> }
  | { kind: 'diagram'; lines: string[] }

/** The widest diagram drawn; a wider one stays a code block. */
export const DIAGRAM_WIDTH = 72

const ALERT = /^\s*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i
const TASK = /^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/
const FENCE = /^\s*(```+|~~~+)\s*([\w-]*)/

/** `~~gone~~` drawn struck through (U+0336 on each character), outside inline code. */
export function strikethrough(text: string): string {
  return text.split(/(`[^`\n]*`)/).map(part => (part.startsWith('`') ? part : part.replace(/~~(?=\S)([^~\n]+?)~~/g, (_m, inner: string) => [...inner].map(ch => `${ch}̶`).join('')))).join('')
}

/** The reply split into the blocks Tower draws; the text between them is markdown, unchanged but for `~~`. */
export function replyBlocks(text: string, width = DIAGRAM_WIDTH): ReplyBlock[] {
  const lines = text.split('\n')
  const blocks: ReplyBlock[] = []
  let plain: string[] = []
  const flush = () => {
    if (plain.length > 0 && plain.some(line => line.trim() !== '')) blocks.push({ kind: 'markdown', text: plain.join('\n') })
    plain = []
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const fence = FENCE.exec(line)
    if (fence !== null) {
      // A fence runs to its closing marker; only a mermaid one is ever drawn, and only when mermaidArt can.
      let end = i + 1
      while (end < lines.length && !lines[end]!.trim().startsWith(fence[1]!)) end++
      const body = lines.slice(i + 1, end)
      const art = fence[2]!.toLowerCase() === 'mermaid' ? mermaidArt(body.join('\n'), width) : null
      if (art !== null) {
        flush()
        blocks.push({ kind: 'diagram', lines: art })
      } else plain.push(...lines.slice(i, end + 1))
      i = end + 1
      continue
    }
    const alert = ALERT.exec(line)
    if (alert !== null) {
      flush()
      const body = alert[2]!.trim() !== '' ? [alert[2]!] : []
      i++
      while (i < lines.length && /^\s*>/.test(lines[i]!)) body.push(lines[i++]!.replace(/^\s*>\s?/, ''))
      const kind = alert[1]!.toLowerCase() as AlertKind
      blocks.push({ kind: 'alert', alert: kind, label: kind[0]!.toUpperCase() + kind.slice(1), text: strikethrough(body.join('\n')) })
      continue
    }
    if (TASK.test(line)) {
      flush()
      const items: Array<{ done: boolean; text: string; indent: number }> = []
      while (i < lines.length) {
        const task = TASK.exec(lines[i]!)
        if (task === null) break
        items.push({ done: task[2] !== ' ', text: strikethrough(task[3]!), indent: task[1]!.length })
        i++
      }
      blocks.push({ kind: 'tasks', items })
      continue
    }
    plain.push(strikethrough(line))
    i++
  }
  flush()
  return blocks
}

/** A task line: `☐ text`, `☑ text`. */
export function taskLine(item: { done: boolean; text: string; indent: number }): string {
  return `${' '.repeat(item.indent)}${item.done ? '☑' : '☐'} ${item.text}`
}

// ── Mermaid as box art ──────────────────────────────────────────────────────

const U = 1, D = 2, L = 4, R = 8
const JOIN: Record<number, string> = {
  [U]: '│', [D]: '│', [U | D]: '│', [L]: '─', [R]: '─', [L | R]: '─',
  [D | R]: '┌', [D | L]: '┐', [U | R]: '└', [U | L]: '┘',
  [U | D | R]: '├', [U | D | L]: '┤', [D | L | R]: '┬', [U | L | R]: '┴', [U | D | L | R]: '┼',
}

class Canvas {
  cells: string[][] = []
  masks: number[][] = []
  put(x: number, y: number, ch: string) {
    while (this.cells.length <= y) { this.cells.push([]); this.masks.push([]) }
    const row = this.cells[y]!
    while (row.length <= x) row.push(' ')
    row[x] = ch
  }
  text(x: number, y: number, s: string) {
    ;[...s].forEach((ch, k) => this.put(x + k, y, ch))
  }
  join(x: number, y: number, bits: number) {
    this.put(x, y, ' ')
    const masks = this.masks[y]!
    masks[x] = (masks[x] ?? 0) | bits
    this.cells[y]![x] = JOIN[masks[x]!] ?? '┼'
  }
  box(x: number, y: number, label: string) {
    const w = [...label].length + 2
    this.text(x, y, `┌${'─'.repeat(w)}┐`)
    this.text(x, y + 1, `│ ${label} │`)
    this.text(x, y + 2, `└${'─'.repeat(w)}┘`)
  }
  lines(): string[] {
    return this.cells.map(row => row.join('').replace(/\s+$/, ''))
  }
}

type Graph = { direction: 'TD' | 'LR'; labels: Map<string, string>; order: string[]; edges: Array<[string, string]> }

const NODE = /^([A-Za-z_][\w-]*)(?:\[([^\[\]]+)\])?$/

function parseFlowchart(source: string): Graph | null {
  const lines = source.split('\n').map(line => line.trim().replace(/;$/, '')).filter(line => line !== '' && !line.startsWith('%%'))
  const head = /^(?:flowchart|graph)\s+(TD|TB|LR)$/i.exec(lines[0] ?? '')
  if (head === null) return null
  const graph: Graph = { direction: head[1]!.toUpperCase() === 'LR' ? 'LR' : 'TD', labels: new Map(), order: [], edges: [] }
  const node = (token: string): string | null => {
    const match = NODE.exec(token.trim())
    if (match === null) return null
    const id = match[1]!
    if (!graph.labels.has(id)) graph.order.push(id)
    if (match[2] !== undefined || !graph.labels.has(id)) graph.labels.set(id, match[2]?.trim() ?? graph.labels.get(id) ?? id)
    return id
  }
  for (const line of lines.slice(1)) {
    const parts = line.split('-->')
    const ids = parts.map(node)
    if (ids.some(id => id === null)) return null
    for (let k = 0; k + 1 < ids.length; k++) graph.edges.push([ids[k]!, ids[k + 1]!])
  }
  return graph.order.length > 0 ? graph : null
}

/** Each node's layer: the longest path from a root; null on a cycle or an edge that skips a layer. */
function layers(graph: Graph): string[][] | null {
  const depth = new Map<string, number>(graph.order.map(id => [id, 0]))
  for (let round = 0; round <= graph.order.length; round++) {
    let moved = false
    for (const [from, to] of graph.edges) {
      if (depth.get(to)! < depth.get(from)! + 1) { depth.set(to, depth.get(from)! + 1); moved = true }
    }
    if (!moved) break
    if (round === graph.order.length) return null
  }
  if (graph.edges.some(([from, to]) => depth.get(to)! !== depth.get(from)! + 1)) return null
  const out: string[][] = []
  for (const id of graph.order) (out[depth.get(id)!] ??= []).push(id)
  return out
}

function drawFlowchart(graph: Graph): string[] | null {
  const rows = layers(graph)
  if (rows === null) return null
  const width = (id: string) => [...graph.labels.get(id)!].length + 4
  const canvas = new Canvas()
  const at = new Map<string, { x: number; y: number; w: number }>()
  if (graph.direction === 'TD') {
    const total = (row: string[]) => row.reduce((sum, id) => sum + width(id), 0) + 3 * (row.length - 1)
    const span = Math.max(...rows.map(total))
    rows.forEach((row, r) => {
      // Centred on one column, so a lone box's middle sits on it whatever its width.
      let x = Math.floor(span / 2) - Math.floor(total(row) / 2)
      for (const id of row) { at.set(id, { x, y: r * 6, w: width(id) }); x += width(id) + 3 }
    })
    for (const [id, p] of at) canvas.box(p.x, p.y, graph.labels.get(id)!)
    const mid = (id: string) => at.get(id)!.x + Math.floor(at.get(id)!.w / 2)
    for (const [from, to] of graph.edges) {
      const px = mid(from), cx = mid(to), y = at.get(from)!.y + 3
      canvas.join(px, y, U | D)
      if (px === cx) canvas.join(px, y + 1, U | D)
      else {
        canvas.join(px, y + 1, U | (cx > px ? R : L))
        for (let x = Math.min(px, cx) + 1; x < Math.max(px, cx); x++) canvas.join(x, y + 1, L | R)
        canvas.join(cx, y + 1, D | (cx > px ? L : R))
      }
      canvas.put(cx, y + 2, '▼')
    }
  } else {
    const colWidth = rows.map(row => Math.max(...row.map(width)))
    const height = (row: string[]) => row.length * 4 - 1
    const span = Math.max(...rows.map(height))
    let x = 0
    rows.forEach((row, c) => {
      let y = Math.floor((span - height(row)) / 2)
      for (const id of row) { at.set(id, { x, y, w: width(id) }); y += 4 }
      x += colWidth[c]! + 6
    })
    for (const [id, p] of at) canvas.box(p.x, p.y, graph.labels.get(id)!)
    for (const [from, to] of graph.edges) {
      const fromPos = at.get(from)!, toPos = at.get(to)!
      const py = fromPos.y + 1, cy = toPos.y + 1
      const gx = toPos.x - 6
      for (let k = fromPos.x + fromPos.w; k < gx + 2; k++) canvas.join(k, py, L | R)
      const jx = gx + 2
      if (py === cy) canvas.join(jx, py, L | R)
      else {
        canvas.join(jx, py, L | (cy > py ? D : U))
        for (let y = Math.min(py, cy) + 1; y < Math.max(py, cy); y++) canvas.join(jx, y, U | D)
        canvas.join(jx, cy, R | (cy > py ? U : D))
      }
      canvas.join(jx + 1, cy, L | R)
      canvas.join(jx + 2, cy, L | R)
      canvas.put(jx + 3, cy, '▶')
    }
  }
  return canvas.lines()
}

function drawSequence(source: string): string[] | null {
  const lines = source.split('\n').map(line => line.trim()).filter(line => line !== '' && !line.startsWith('%%'))
  if (!/^sequenceDiagram$/i.test(lines[0] ?? '')) return null
  const names: string[] = []
  const labels = new Map<string, string>()
  const add = (id: string, label?: string) => {
    if (!labels.has(id)) names.push(id)
    if (label !== undefined || !labels.has(id)) labels.set(id, label ?? labels.get(id) ?? id)
  }
  const messages: Array<{ from: number; to: number; text: string; dashed: boolean }> = []
  for (const line of lines.slice(1)) {
    const who = /^(?:participant|actor)\s+(\w+)(?:\s+as\s+(.+))?$/.exec(line)
    if (who !== null) { add(who[1]!, who[2]?.trim()); continue }
    const msg = /^(\w+)\s*(-->>|->>|-->|->)\s*(\w+)\s*:\s*(.*)$/.exec(line)
    if (msg === null) return null
    add(msg[1]!); add(msg[3]!)
    messages.push({ from: names.indexOf(msg[1]!), to: names.indexOf(msg[3]!), text: msg[4]!.trim(), dashed: msg[2]!.startsWith('--') })
  }
  if (names.length < 2 || messages.some(m => m.from === m.to)) return null
  const half = names.map(id => Math.ceil(([...labels.get(id)!].length + 4) / 2))
  const centre = [half[0]!]
  for (let k = 1; k < names.length; k++) centre.push(centre[k - 1]! + half[k - 1]! + half[k]! + 2)
  for (const m of messages) {
    const lo = Math.min(m.from, m.to), hi = Math.max(m.from, m.to)
    const need = [...m.text].length + 4 - (centre[hi]! - centre[lo]!)
    if (need > 0) for (let k = hi; k < names.length; k++) centre[k]! += need
  }
  const canvas = new Canvas()
  names.forEach((id, k) => canvas.box(centre[k]! - half[k]!, 0, labels.get(id)!))
  const bottom = 3 + messages.length * 2
  for (let y = 3; y <= bottom; y++) centre.forEach(x => canvas.put(x, y, '│'))
  messages.forEach((m, k) => {
    const y = 4 + k * 2
    const a = centre[m.from]!, b = centre[m.to]!
    const lo = Math.min(a, b), hi = Math.max(a, b)
    canvas.text(lo + 2, y - 1, m.text)
    for (let x = lo + 1; x < hi; x++) canvas.put(x, y, m.dashed ? '╌' : '─')
    if (b > a) canvas.put(hi - 1, y, '▶')
    else canvas.put(lo + 1, y, '◀')
  })
  return canvas.lines()
}

/** A mermaid source drawn as box art: simple flowcharts (TD/LR) and sequence diagrams; null for anything else or too wide. */
export function mermaidArt(source: string, width = DIAGRAM_WIDTH): string[] | null {
  const first = source.trim().split('\n')[0]?.trim() ?? ''
  const art = /^sequenceDiagram$/i.test(first) ? drawSequence(source.trim()) : (() => {
    const graph = parseFlowchart(source.trim())
    return graph === null ? null : drawFlowchart(graph)
  })()
  if (art === null || art.some(line => [...line].length > width)) return null
  return art
}
