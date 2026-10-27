// The simple view's playground: the main session and one small Claude figure per agent, drawn as text lines.
// Pure and deterministic: the same agents, tick and size give the same scene (no randomness in a render).
// No imports, so the surface module `hooks/playground.tsx` can use it as it is.

export type PlaygroundStatus = 'running' | 'done' | 'failed'
export type PlaygroundAgent = { id: string; name: string; status: PlaygroundStatus; colour: string }
/** How a run of cells is drawn: in the agent's colour, the accent, dim, or the success / error colour. */
export type PlaygroundTone = 'plain' | 'agent' | 'accent' | 'dim' | 'done' | 'error'
export type PlaygroundRun = { text: string; tone: PlaygroundTone; colour?: string }
export type PlaygroundLine = PlaygroundRun[]

/** One scene tick, in milliseconds: the mock-up's motion. */
export const PLAYGROUND_TICK_MS = 120
const STEP_TICKS = 2 // a figure moves one cell every 240 ms
const LEGS_TICKS = 4 // its legs swap every 480 ms
const BOB_TICKS = 6 // the main figure bobs every 720 ms
const BLOCK_STEPS = 8 // a walker keeps its direction this many steps, then the seed picks again
const PER_ROW = 3
const MAIN_COLUMNS = 6 // the main figure (4 cells) and a gap
const NAME_CELLS = 10

type Cell = { ch: string; tone: PlaygroundTone; colour?: string }

/** A small string hash (FNV-1a), the seed of an agent's path. */
export function seedOf(id: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function mix(seed: number, n: number): number {
  let x = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return (x ^ (x >>> 16)) >>> 0
}

/** Folds a free walk into 0..span, so a walker bounces at the edges. */
function bounce(x: number, span: number): number {
  if (span <= 0) return 0
  const period = 2 * span
  const p = ((x % period) + period) % period
  return p > span ? period - p : p
}

/** The left cell of a figure in its lane after `step` steps: a seeded start, then blocks of steps one way or the other. */
export function walkerPosition(seed: number, step: number, span: number): number {
  let x = seed % (span + 1)
  const blocks = Math.floor(step / BLOCK_STEPS)
  for (let block = 0; block < blocks; block++) x += (mix(seed, block) & 1 ? 1 : -1) * BLOCK_STEPS
  x += (mix(seed, blocks) & 1 ? 1 : -1) * (step - blocks * BLOCK_STEPS)
  return bounce(x, span)
}

/** How many agent rows fit: a figure takes two rows and its name one. */
export function playgroundSlots(rows: number): number {
  return Math.floor(Math.max(0, rows) / 3) * PER_ROW
}

/**
 * The scene as `rows` lines of exactly `width` cells. The main figure stands at the left edge; the agents
 * (oldest first) fill up to three per row, newest on the lower rows; more than fit end the last row with `+n`.
 */
export function playgroundScene(agents: readonly PlaygroundAgent[], mainWorking: boolean, tick: number, width: number, rows: number): PlaygroundLine[] {
  const w = Math.max(1, width)
  const h = Math.max(1, rows)
  const grid: Cell[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ ch: ' ', tone: 'plain' as PlaygroundTone })))
  const put = (x: number, y: number, text: string, tone: PlaygroundTone, colour?: string) => {
    if (y < 0 || y >= h) return
    ;[...text].forEach((ch, index) => {
      const at = x + index
      if (at >= 0 && at < w) grid[y]![at] = colour !== undefined ? { ch, tone, colour } : { ch, tone }
    })
  }

  // The main session: three rows and its label; it bobs one row while working when there is room.
  const bob = mainWorking && h >= 5 && Math.floor(tick / BOB_TICKS) % 2 === 1 ? 1 : 0
  const top = h >= 5 ? 1 - bob : 0
  put(0, top, '▗██▖', 'accent')
  put(0, top + 1, '▐██▌', 'accent')
  put(0, top + 2, '▝▀▀▘', 'accent')
  put(0, Math.min(h - 1, top + 3 + bob), 'main', 'dim')

  const slots = playgroundSlots(h)
  const hidden = Math.max(0, agents.length - slots)
  const more = hidden > 0 ? `+${hidden + (slots > 0 ? 1 : 0)}` : ''
  // With an overflow the last slot gives way to the `+n`, so the count covers it too.
  const shown = hidden > 0 ? agents.slice(agents.length - Math.max(0, slots - 1)) : agents.slice()
  const area = Math.max(0, w - MAIN_COLUMNS)
  const lane = Math.floor(area / PER_ROW)
  const step = Math.floor(tick / STEP_TICKS)
  const legs = Math.floor(tick / LEGS_TICKS) % 2 === 0 ? '▝▀▘' : '▘▀▝'

  shown.forEach((agent, index) => {
    const row = Math.floor(index / PER_ROW)
    const y = row * 3
    const left = MAIN_COLUMNS + (index % PER_ROW) * lane
    const span = Math.max(0, lane - 5) // a figure (3), its mark or trail (1) and a gap (1)
    const seed = seedOf(agent.id)
    const running = agent.status === 'running'
    const x = left + (running ? walkerPosition(seed, step, span) : seed % (span + 1))
    put(x, y, '▗█▖', 'agent', agent.colour)
    put(x, y + 1, running ? legs : '▀▀▀', 'agent', agent.colour)
    if (agent.status === 'done') put(x + 3, y, '✓', 'done')
    if (agent.status === 'failed') put(x + 3, y, '✗', 'error')
    if (running && step > 0 && tick % STEP_TICKS === 0) {
      const before = left + walkerPosition(seed, step - 1, span)
      if (before < x) put(before, y + 1, '·', 'dim')
      if (before > x) put(before + 2, y + 1, '·', 'dim')
    }
    const name = [...agent.name].slice(0, Math.min(NAME_CELLS, Math.max(1, lane - 1))).join('')
    put(Math.max(left, Math.min(x, left + lane - 1 - [...name].length)), y + 2, name, 'dim')
  })
  if (more !== '') put(w - [...more].length, Math.max(0, (Math.ceil(shown.length / PER_ROW) || 1) * 3 - 3), more, 'dim')

  return grid.map(cells => {
    const line: PlaygroundLine = []
    for (const cell of cells) {
      const last = line[line.length - 1]
      if (last !== undefined && last.tone === cell.tone && last.colour === cell.colour) last.text += cell.ch
      else line.push(cell.colour !== undefined ? { text: cell.ch, tone: cell.tone, colour: cell.colour } : { text: cell.ch, tone: cell.tone })
    }
    return line
  })
}
