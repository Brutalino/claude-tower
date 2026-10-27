import { expect, test } from 'claude-code/testing'

import { BLOCK_RETRY_MS, blockActive, blockChip, blockEnds, blockToast, FALLBACK_MODEL, fableBlocked, parseModelBlock, resolveModel, type ModelBlock } from '../hooks/core/fallback'
import { parseSettings } from '../hooks/core/settings'

const RESET = '2026-10-08T15:00:00Z'

test('fableBlocked: a rate_limit on a Fable request blocks Fable; other errors and models do not', async () => {
  expect(fableBlocked({ error: 'rate_limit', details: null, model: 'claude-fable-5-1' })).toEqual({ until: null })
  expect(fableBlocked({ error: 'rate_limit', details: 'Fable usage limit reached', model: null })).toEqual({ until: null })
  expect(fableBlocked({ error: 'overloaded', details: null, model: 'claude-fable-5-1' })).toBeNull()
  expect(fableBlocked({ error: 'server_error', details: 'fable', model: 'claude-fable-5-1' })).toBeNull()
  expect(fableBlocked({ error: 'rate_limit', details: 'limit reached', model: 'claude-opus-5-5' })).toBeNull()
  expect(fableBlocked({ error: 'rate_limit', details: null, model: null })).toBeNull()
})

test('fableBlocked: the reset time from the text, else a full window, else unknown', async () => {
  expect(fableBlocked({ error: 'rate_limit', details: `Fable limit · resets ${RESET}`, model: null })).toEqual({ until: Date.parse(RESET) })
  const windows = [{ kind: 'five_hour', percentUsed: 40, resetsAt: '2026-10-08T12:00:00Z' }, { kind: 'seven_day', percentUsed: 100, resetsAt: RESET }]
  expect(fableBlocked({ error: 'rate_limit', details: null, model: 'claude-fable-5-1', rateLimits: windows })).toEqual({ until: Date.parse(RESET) })
  expect(fableBlocked({ error: 'rate_limit', details: null, model: 'claude-fable-5-1', rateLimits: [windows[0]!] })).toEqual({ until: null })
})

test('expiry: the reset time when known, else an hour after it was seen', async () => {
  const known: ModelBlock = { family: 'fable', until: 5_000_000, since: 1_000 }
  const unknown: ModelBlock = { family: 'fable', until: null, since: 1_000 }
  expect(blockEnds(known)).toBe(5_000_000)
  expect(blockEnds(unknown)).toBe(1_000 + BLOCK_RETRY_MS)
  expect(blockActive(unknown, 1_000 + BLOCK_RETRY_MS - 1)).toBe(true)
  expect(blockActive(unknown, 1_000 + BLOCK_RETRY_MS)).toBe(false)
  expect(blockActive(null, 0)).toBe(false)
})

test('resolveModel: Fable becomes Opus 5.5 while blocked or off; everything else stays', async () => {
  const block: ModelBlock = { family: 'fable', until: null, since: 0 }
  expect(resolveModel('claude-fable-5-1', block, 10)).toBe(FALLBACK_MODEL)
  expect(resolveModel('fable', block, 10)).toBe(FALLBACK_MODEL)
  expect(resolveModel('claude-fable-5-1', block, BLOCK_RETRY_MS)).toBe('claude-fable-5-1')
  expect(resolveModel('claude-fable-5-1', null, 10)).toBe('claude-fable-5-1')
  expect(resolveModel('opus', block, 10)).toBe('opus')
  expect(resolveModel(null, block, 10)).toBeNull()
  // The manual override: off always uses Opus 5.5.
  expect(resolveModel('claude-fable-5-1', 'off', 10)).toBe(FALLBACK_MODEL)
  expect(resolveModel('sonnet', 'off', 10)).toBe('sonnet')
})

test('the override setting: off or auto, auto by default', async () => {
  expect(parseSettings({}).fable).toBe('auto')
  expect(parseSettings({ fable: 'off' }).fable).toBe('off')
  expect(parseSettings({ fable: 'nope' }).fable).toBe('auto')
})

test('parseModelBlock, the chip and the toast', async () => {
  expect(parseModelBlock({ family: 'fable', until: null, since: 3 })).toEqual({ family: 'fable', until: null, since: 3 })
  expect(parseModelBlock({ family: 'opus', until: null, since: 3 })).toBeNull()
  expect(parseModelBlock({ family: 'fable', until: 'x', since: 3 })).toBeNull()
  expect(parseModelBlock(null)).toBeNull()
  const block: ModelBlock = { family: 'fable', until: 2 * 3_600_000, since: 0 }
  expect(blockChip(block, 0)).toBe('fable ⊘ 2h')
  expect(blockChip(block, 2 * 3_600_000 - 45 * 60_000)).toBe('fable ⊘ 45m')
  expect(blockChip(block, 2 * 3_600_000)).toBeNull()
  expect(blockChip(null, 0)).toBeNull()
  expect(blockToast(block, 0)).toBe('fable limit · resets in 2h — new sessions use Opus 5.5')
})
