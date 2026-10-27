import { expect, test } from 'claude-code/testing'

import { FALLBACK_MODEL, resolveModel } from '../hooks/core/fallback'
import {
  CACHE_MAX_AGE_MS, cacheStale, catalogueOf, catalogueSource, clampEffort, defaultLabel, effortFor, FALLBACK_CATALOGUE, findModel, modelAvailable,
  modelIdOf, modelLabelOf, modelsPath, parseCatalogue, parseInitialize, parseModelCache, parseVersion, PROBE_ARGV, PROBE_INPUT, sameModel,
} from '../hooks/core/models'
import { PROFILE } from './linearConfig'
import { STDOUT } from './modelsFixture'

const real = () => parseCatalogue(parseInitialize(STDOUT)!.models)!

test('the probe: print mode reading one initialize request on stdin, no plugin dir, no prompt', async () => {
  expect([...PROBE_ARGV]).toEqual(['claude', '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'])
  expect(PROBE_ARGV).not.toContain('--plugin-dir')
  expect(JSON.parse(PROBE_INPUT)).toEqual({ type: 'control_request', request_id: 'tower-models', request: { subtype: 'initialize' } })
  expect(PROBE_INPUT.endsWith('\n')).toBe(true)
  expect(modelsPath('/state/tower/')).toBe('/state/tower/models.json')
  expect(parseVersion('2.1.296 (Claude Code)\n')).toBe('2.1.296')
  expect(parseVersion('')).toBeNull()
})

test('parseInitialize: the control_response line among others; none, or one without models, is null', async () => {
  const answer = parseInitialize(STDOUT)!
  expect(answer.version).toBe('2.1.296')
  expect(answer.models.length).toBe(13)
  expect(parseInitialize('')).toBeNull()
  expect(parseInitialize('{"type":"control_response","response":{"subtype":"error","error":"nope"}}\nnot json')).toBeNull()
})

test('parseCatalogue: the real list without default, in Claude Code order, deduped by full id, efforts as given', async () => {
  const catalogue = real()
  expect(catalogue.models.map(model => [model.id, model.alias, model.label])).toEqual([
    ['claude-opus-5-5', 'opus', 'Opus 5.5'],
    ['claude-fable-5-1', 'fable', 'Fable 5.1'],
    ['claude-sonnet-5-5', 'sonnet', 'Sonnet 5.5'],
    ['claude-haiku-5-5', 'haiku', 'Haiku 5.5'],
    ['claude-haiku-4-5-20251001', 'claude-haiku-4-5-20251001', 'Haiku 4.5'],
    ['claude-sonnet-5', 'claude-sonnet-5', 'Sonnet 5'],
    ['claude-opus-5', 'claude-opus-5', 'Opus 5'],
    ['claude-fable-5', 'claude-fable-5', 'Fable 5'],
    ['claude-opus-4-8', 'claude-opus-4-8', 'Opus 4.8'],
    ['claude-opus-4-7', 'claude-opus-4-7', 'Opus 4.7'],
    ['claude-opus-4-6', 'claude-opus-4-6', 'Opus 4.6'],
    ['claude-sonnet-4-6', 'claude-sonnet-4-6', 'Sonnet 4.6'],
  ])
  expect(catalogue.defaultId).toBe('claude-fable-5-1')
  expect(catalogue.defaultDescription).toBe('Fable 5.1')
  expect(defaultLabel(catalogue)).toBe('default · Fable 5.1')
  expect(findModel(catalogue, 'opus')?.description).toBe('For complex work and everyday tasks')
  expect(findModel(catalogue, 'claude-haiku-4-5-20251001')?.efforts).toEqual([])
  expect(findModel(catalogue, 'claude-opus-4-6')?.efforts).toEqual(['low', 'medium', 'high', 'max'])
  expect(findModel(catalogue, 'claude-opus-4-8')?.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
})

test('parseCatalogue: dedupe keeps the first entry of an id; junk entries are skipped; nothing readable is null', async () => {
  const catalogue = parseCatalogue([
    { value: 'x', resolvedModel: 'claude-x-1', displayName: 'X 1' },
    { value: 'claude-x-1', resolvedModel: 'claude-x-1', displayName: 'X one again' },
    7, { value: '' }, { resolvedModel: 'claude-y' },
    { value: 'claude-opus-4-1', supportsEffort: true, supportedEffortLevels: ['max', 'low', 'turbo'] },
  ])!
  expect(catalogue.models).toEqual([
    { id: 'claude-x-1', alias: 'x', label: 'X 1', description: '', efforts: [] },
    { id: 'claude-opus-4-1', alias: 'claude-opus-4-1', label: 'Opus 4.1', description: '', efforts: ['low', 'max'] },
  ])
  expect(catalogue.defaultId).toBeNull()
  expect(defaultLabel(catalogue)).toBe('default')
  expect(parseCatalogue([{ value: 'default', resolvedModel: 'claude-fable-5-1' }])).toBeNull()
  expect(parseCatalogue('nope')).toBeNull()
})

test('the built-in list: Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5, every effort; used without a readable cache', async () => {
  expect(FALLBACK_CATALOGUE.models.map(model => `${model.label} ${model.id}`)).toEqual([
    'Fable 5.1 claude-fable-5-1', 'Opus 5.5 claude-opus-5-5', 'Sonnet 5.5 claude-sonnet-5-5', 'Haiku 5.5 claude-haiku-5-5',
  ])
  for (const model of FALLBACK_CATALOGUE.models) expect(model.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  expect(catalogueOf(null)).toBe(FALLBACK_CATALOGUE)
  expect(parseModelCache({ fetchedAt: 1, models: [] })).toBeNull()
  expect(parseModelCache({ models: parseInitialize(STDOUT)!.models })).toBeNull()
  const cache = parseModelCache({ claudeCodeVersion: '2.1.296', fetchedAt: 5, models: parseInitialize(STDOUT)!.models })!
  expect(catalogueOf(cache).models.length).toBe(12)
})

test('cacheStale: missing, older than 24 h, or written by another Claude Code version', async () => {
  const cache = parseModelCache({ claudeCodeVersion: '2.1.296', fetchedAt: 1_000, models: parseInitialize(STDOUT)!.models })
  expect(cacheStale(null, 1_000, null)).toBe(true)
  expect(cacheStale(cache, 1_000 + CACHE_MAX_AGE_MS, null)).toBe(false)
  expect(cacheStale(cache, 1_000 + CACHE_MAX_AGE_MS + 1, null)).toBe(true)
  expect(cacheStale(cache, 2_000, '2.1.296')).toBe(false)
  expect(cacheStale(cache, 2_000, '2.1.297')).toBe(true)
  expect(cacheStale({ ...cache!, claudeCodeVersion: null }, 2_000, '2.1.296')).toBe(true)
})

test('catalogueSource: one dim line only when the list is not fresh', async () => {
  const cache = parseModelCache({ claudeCodeVersion: '2.1.296', fetchedAt: 0, models: parseInitialize(STDOUT)!.models })
  expect(catalogueSource(cache, 60_000, false)).toBeNull()
  expect(catalogueSource(cache, 3 * 24 * 3_600_000 + 5, false)).toBe('models: from cache 3 d ago')
  expect(catalogueSource(cache, 30 * 3_600_000, true)).toBe('models: from cache 1 d ago')
  expect(catalogueSource(null, 0, false)).toBe('models: built-in list (could not ask Claude Code)')
  expect(catalogueSource(null, 0, true)).toBe('models: built-in list (asking Claude Code…)')
})

test('ids and names: a key of modelIds and an alias resolve to the full id; the label from the catalogue', async () => {
  const catalogue = real()
  expect(modelIdOf('opus', PROFILE.modelIds, catalogue)).toBe('claude-opus-5-5')
  expect(modelIdOf('fable', PROFILE.modelIds, catalogue)).toBe('claude-fable-5-1')
  expect(modelIdOf('claude-opus-4-6', PROFILE.modelIds, catalogue)).toBe('claude-opus-4-6')
  expect(modelIdOf('claude-opus-4-1', PROFILE.modelIds, catalogue)).toBe('claude-opus-4-1')
  expect(sameModel('opus', 'claude-opus-5-5', PROFILE.modelIds, catalogue)).toBe(true)
  expect(sameModel('opus', null, PROFILE.modelIds, catalogue)).toBe(false)
  expect(modelLabelOf('opus', PROFILE.modelIds, catalogue)).toBe('Opus 5.5')
  expect(modelLabelOf('claude-sonnet-4-6', PROFILE.modelIds, catalogue)).toBe('Sonnet 4.6')
  expect(modelLabelOf('claude-opus-4-1', PROFILE.modelIds, catalogue)).toBe('Opus 4.1')
  expect(modelAvailable('claude-opus-4-6', PROFILE.modelIds, catalogue)).toBe(true)
  expect(modelAvailable('haiku', PROFILE.modelIds, FALLBACK_CATALOGUE)).toBe(true)
  expect(modelAvailable('claude-opus-4-1', PROFILE.modelIds, catalogue)).toBe(false)
})

test('the effort clamp: the nearest lower level the model takes, else its lowest; none for a model without effort', async () => {
  const catalogue = real()
  expect(effortFor('claude-opus-4-6', 'xhigh', catalogue)).toBe('high')
  expect(effortFor('claude-opus-4-6', 'max', catalogue)).toBe('max')
  expect(effortFor('claude-sonnet-4-6', 'xhigh', catalogue)).toBe('high')
  expect(effortFor('claude-haiku-4-5-20251001', 'high', catalogue)).toBeNull()
  expect(effortFor('claude-opus-5-5', 'xhigh', catalogue)).toBe('xhigh')
  expect(effortFor(null, 'xhigh', catalogue)).toBe('xhigh')
  expect(effortFor('claude-unknown', 'xhigh', catalogue)).toBe('xhigh')
  expect(effortFor('claude-opus-4-6', null, catalogue)).toBeNull()
  expect(clampEffort('low', ['high', 'max'])).toBe('high')
  expect(clampEffort('xhigh', ['low', 'max'])).toBe('low')
})

test('resolveModel: Fable falls back to the catalogue\'s opus when given, Opus 5.5 otherwise', async () => {
  const block = { family: 'fable' as const, until: null, since: 0 }
  expect(resolveModel('claude-fable-5-1', block, 10, 'claude-opus-6')).toBe('claude-opus-6')
  expect(resolveModel('claude-fable-5-1', block, 10)).toBe(FALLBACK_MODEL)
  expect(resolveModel('claude-opus-4-6', block, 10, 'claude-opus-6')).toBe('claude-opus-4-6')
})
