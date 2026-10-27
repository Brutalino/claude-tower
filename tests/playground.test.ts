import { expect, test } from 'claude-code/testing'

import { playgroundScene, playgroundSlots, walkerPosition, type PlaygroundAgent, type PlaygroundLine } from '../hooks/core/playground'

const agent = (id: string, status: PlaygroundAgent['status'] = 'running'): PlaygroundAgent => ({ id, name: id, status, colour: '#123456' })
const text = (line: PlaygroundLine) => line.map(run => run.text).join('')
const scene = (agents: PlaygroundAgent[], tick: number, width = 60, rows = 6) => playgroundScene(agents, true, tick, width, rows)
/** The left cell of the figure (`▗█▖`) on a line, -1 when none. */
const figureAt = (line: PlaygroundLine, from = 6) => text(line).indexOf('▗█▖', from)

test('every line is exactly the box width, and there are exactly the box rows', async () => {
  const agents = [agent('executor'), agent('verifier'), agent('scout', 'done'), agent('a4'), agent('a5', 'failed')]
  for (const [width, rows] of [[60, 6], [40, 4], [12, 6], [200, 6]] as const) {
    for (let tick = 0; tick < 400; tick += 7) {
      const lines = scene(agents, tick, width, rows)
      expect(lines.length).toBe(rows)
      for (const line of lines) expect([...text(line)].length).toBe(width)
    }
  }
})

test('a walker stays inside its lane over a long walk', async () => {
  for (const seed of [0, 1, 7, 12345, 4294967295]) {
    for (let step = 0; step < 3000; step += 13) {
      const x = walkerPosition(seed, step, 14)
      expect(x >= 0 && x <= 14).toBe(true)
    }
  }
})

test('a running agent moves between ticks, a done agent does not', async () => {
  const running = [agent('executor')]
  const positions = new Set([0, 2, 4, 6, 8, 10].map(tick => figureAt(scene(running, tick)[0]!)))
  expect(positions.size > 1).toBe(true)
  const done = [agent('scout', 'done')]
  // From column 6 on: the main figure at the left edge bobs.
  const still = new Set([0, 2, 4, 6, 8, 10, 99].map(tick => scene(done, tick).map(line => text(line).slice(6)).join('\n')))
  expect(still.size).toBe(1)
  expect(text(scene(done, 5)[0]!).includes('▗█▖✓')).toBe(true)
  expect(text(scene([agent('x', 'failed')], 5)[0]!).includes('▗█▖✗')).toBe(true)
})

test('two ticks differ for a running agent (it walks or swaps its legs)', async () => {
  const a = scene([agent('executor')], 0).map(text).join('\n')
  const b = scene([agent('executor')], 4).map(text).join('\n')
  expect(a === b).toBe(false)
})

test('the same input gives the same scene', async () => {
  const agents = [agent('executor'), agent('verifier'), agent('scout', 'done')]
  expect(JSON.stringify(scene(agents, 37))).toBe(JSON.stringify(scene(agents, 37)))
})

test('the main figure bobs while working and stands still when idle', async () => {
  const at = (working: boolean, tick: number) => playgroundScene([], working, tick, 40, 6).findIndex(line => text(line).startsWith('▗██▖'))
  expect(at(true, 0) === at(true, 6)).toBe(false)
  expect(at(false, 0)).toBe(at(false, 6))
  expect(text(playgroundScene([], false, 0, 40, 6)[4]!).startsWith('main')).toBe(true)
})

test('three figures per row, newest on the lower rows, the overflow as +n on the last row', async () => {
  expect(playgroundSlots(6)).toBe(6)
  expect(playgroundSlots(4)).toBe(3)
  const many = Array.from({ length: 8 }, (_, index) => agent(`a${index}`, 'done'))
  const lines = scene(many, 0, 80, 6)
  expect(text(lines[3]!).trimEnd().endsWith('+3')).toBe(true)
  expect(text(lines[2]!).includes('a3')).toBe(true)
  expect(text(lines[5]!).includes('a7')).toBe(true)
  expect(text(lines[2]!).includes('a0')).toBe(false)
})
