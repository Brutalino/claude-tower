import { expect, test } from 'claude-code/testing'

import { initialDeck, stepCompleted } from '../hooks/core/deck'
import { demoDeck } from '../hooks/core/demo'
import { blockToast, parseModelBlock } from '../hooks/core/fallback'
import {
  CACHE_TTL_MS, WINDOW_MS, cacheCold, cacheText, cacheWarmth, earlyBlock, forecastOutUntil, formatLeft, paceChip, paceText, windowPace, type EarlyBlockInput,
} from '../hooks/core/limits'
import { parseSettings } from '../hooks/core/settings'

const NOW = 1_800_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE

test('windowPace: elapsed time from the reset and the length, pace, and the run-out at the rate so far', async () => {
  const pace = windowPace({ percent: 42, resetsAt: NOW + 3.5 * HOUR }, WINDOW_MS['5h'], NOW)!
  expect(Math.round(pace.elapsedPercent)).toBe(30)
  expect(Math.round(pace.pace)).toBe(12)
  // 58 points to go at 42 per 90 minutes: ~124 minutes, before the reset in 210.
  expect(Math.round(pace.outInMs! / MINUTE)).toBe(124)
  expect(pace.outBeforeReset).toBe(true)
  expect(paceText(pace)).toBe('30% of time · out in ~2h 04m')
  expect(paceChip('5h', pace)).toBe('5h 42%↗')
})

test('windowPace: behind pace runs out after the reset; no rate, a young window or an unknown reset forecast nothing', async () => {
  const behind = windowPace({ percent: 10, resetsAt: NOW + 1 * HOUR }, WINDOW_MS['5h'], NOW)!
  expect(behind.pace < 0).toBe(true)
  expect(behind.outBeforeReset).toBe(false)
  expect(paceChip('5h', behind)).toBe('5h 10%')
  expect(windowPace({ percent: 0, resetsAt: NOW + HOUR }, WINDOW_MS['5h'], NOW)!.outInMs).toBe(null)
  expect(windowPace({ percent: 3, resetsAt: NOW + 5 * HOUR - 30_000 }, WINDOW_MS['5h'], NOW)!.outInMs).toBe(null)
  expect(paceText(windowPace({ percent: 0, resetsAt: NOW + HOUR }, WINDOW_MS['5h'], NOW)!)).toBe('80% of time')
  expect(windowPace({ percent: 42, resetsAt: null }, WINDOW_MS['5h'], NOW)).toBe(null)
  expect(windowPace(null, WINDOW_MS['5h'], NOW)).toBe(null)
  // A passed reset: the window starts over, its new reset unknown.
  expect(windowPace({ percent: 90, resetsAt: NOW - MINUTE }, WINDOW_MS['5h'], NOW)).toBe(null)
  // Full: out now.
  expect(windowPace({ percent: 100, resetsAt: NOW + HOUR }, WINDOW_MS['5h'], NOW)!.outInMs).toBe(0)
})

test('formatLeft: minutes, hours and minutes, days and hours', async () => {
  expect(formatLeft(110 * MINUTE)).toBe('~1h 50m')
  expect(formatLeft(12 * MINUTE)).toBe('~12m')
  expect(formatLeft(52 * HOUR)).toBe('~2d 4h')
  expect(formatLeft(-5)).toBe('~0m')
})

test('forecastOutUntil: a window out before its reset within 20 minutes gives that reset; the later of two', async () => {
  const soon = { percent: 95, resetsAt: NOW + HOUR }
  expect(forecastOutUntil({ fiveHour: soon, sevenDay: null, spend: null }, NOW)).toBe(NOW + HOUR)
  // 84% with 64.5 minutes to go: out in ~45m, too far to act on.
  expect(forecastOutUntil({ fiveHour: { percent: 84, resetsAt: NOW + 64.5 * MINUTE }, sevenDay: null, spend: null }, NOW)).toBe(null)
  const week = { percent: 99.8, resetsAt: NOW + 24 * HOUR }
  expect(forecastOutUntil({ fiveHour: soon, sevenDay: week, spend: null }, NOW)).toBe(NOW + 24 * HOUR)
  expect(forecastOutUntil({ fiveHour: { percent: 10, resetsAt: NOW + HOUR }, sevenDay: { percent: 99, resetsAt: NOW + 24 * HOUR }, spend: null }, NOW)).toBe(null)
  expect(forecastOutUntil(undefined, NOW)).toBe(null)
})

test('earlyBlock: only on auto, switch early on, the main loop on Fable and no block active', async () => {
  const input: EarlyBlockInput = {
    fable: 'auto', early: 'on', noFableEnv: false, mainModel: 'claude-fable-5-1', block: null,
    limits: { fiveHour: { percent: 95, resetsAt: NOW + HOUR }, sevenDay: null, spend: null }, now: NOW,
  }
  expect(earlyBlock(input)).toEqual({ family: 'fable', until: NOW + HOUR, since: NOW, reason: 'forecast' })
  expect(earlyBlock({ ...input, fable: 'off' })).toBe(null)
  expect(earlyBlock({ ...input, early: 'off' })).toBe(null)
  expect(earlyBlock({ ...input, noFableEnv: true })).toBe(null)
  expect(earlyBlock({ ...input, mainModel: 'claude-opus-5-5' })).toBe(null)
  expect(earlyBlock({ ...input, block: { family: 'fable', until: NOW + 2 * HOUR, since: NOW - MINUTE } })).toBe(null)
  // An expired block does not stand in the way.
  expect(earlyBlock({ ...input, block: { family: 'fable', until: NOW - MINUTE, since: NOW - HOUR } })).not.toBe(null)
  expect(earlyBlock({ ...input, limits: { fiveHour: { percent: 50, resetsAt: NOW + HOUR }, sevenDay: null, spend: null } })).toBe(null)
})

test('the forecast block: kept by the block file, its own toast; the setting defaults on', async () => {
  const block = { family: 'fable' as const, until: NOW + HOUR, since: NOW, reason: 'forecast' as const }
  expect(parseModelBlock(JSON.parse(JSON.stringify(block)))).toEqual(block)
  expect(parseModelBlock({ family: 'fable', until: null, since: NOW, reason: 'other' })).toEqual({ family: 'fable', until: null, since: NOW })
  expect(blockToast(block, NOW)).toBe('fable limit near · switched early, resets in 1h — Opus 5.5 until then')
  expect(parseSettings({}).fableEarly).toBe('on')
  expect(parseSettings({ fableEarly: 'off' }).fableEarly).toBe('off')
  expect(parseSettings({ fableEarly: 'maybe' }).fableEarly).toBe('on')
})

test('cache warmth: warm with minutes left, cold after the TTL, the rebuild priced from the session cost per token', async () => {
  const seen = { lastRequestAt: NOW - 2 * MINUTE, cachedTokens: 62_000, sessionTokens: 1_150_000 }
  expect(cacheText(cacheWarmth(seen, 1.84, NOW)!)).toBe('cache warm · 3m left')
  const cold = cacheWarmth({ ...seen, lastRequestAt: NOW - 7 * MINUTE }, 1.84, NOW)!
  expect(cold.cold).toBe(true)
  expect(cacheText(cold)).toBe('cache cold · ≈ $0.10 to rebuild')
  expect(cacheText(cacheWarmth({ ...seen, lastRequestAt: NOW - 7 * MINUTE }, null, NOW)!)).toBe('cache cold')
  expect(cacheText(cacheWarmth({ ...seen, lastRequestAt: NOW - 7 * MINUTE, cachedTokens: 0 }, 1.84, NOW)!)).toBe('cache cold')
  expect(cacheWarmth(undefined, 1.84, NOW)).toBe(null)
  expect(cacheCold(NOW - CACHE_TTL_MS - 1, NOW)).toBe(true)
  expect(cacheCold(NOW - MINUTE, NOW)).toBe(false)
  expect(cacheCold(null, NOW)).toBe(false)
})

test('stepCompleted: the main request sets the cache clock and its cached tokens; every request counts its tokens', async () => {
  const first = stepCompleted(initialDeck(), { model: 'claude-fable-5-1' }, { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 }, NOW)
  expect(first.cache).toEqual({ lastRequestAt: NOW, cachedTokens: 120, sessionTokens: 135 })
  const second = stepCompleted(first, { model: 'claude-fable-5-1' }, { input_tokens: 1, output_tokens: 1 }, NOW + MINUTE)
  expect(second.cache).toEqual({ lastRequestAt: NOW + MINUTE, cachedTokens: 0, sessionTokens: 137 })
  // Without a time (an older caller) the clock stays.
  expect(stepCompleted(initialDeck(), { model: 'm' }, { input_tokens: 1 }).cache).toBe(undefined)
})

test('the demo deck: ahead of pace and out before the reset; a cold cache', async () => {
  const deck = demoDeck(NOW)
  const pace = windowPace(deck.usage.limits?.fiveHour, WINDOW_MS['5h'], NOW)!
  expect(pace.outBeforeReset).toBe(true)
  expect(paceChip('5h', pace)).toBe('5h 84%↗')
  expect(paceText(pace)).toBe('79% of time · out in ~45m')
  expect(cacheWarmth(deck.cache, deck.usage.cost, NOW)!.cold).toBe(true)
})
