import { expect, test } from 'claude-code/testing'

import { isDesignMode, validateConfig } from '../hooks/core/config'
import { DESIGN_CONFIG } from '../hooks/core/configs/design'
import { newDesignState, parseDesignState } from '../hooks/core/design'
import { designDocuments, designQuestions, documentLines, documentPath, isDesignSession, prototypeFolder, towerSkillPrompt, towerSkillStart } from '../hooks/core/designMode'

// Decision 064: the design Tower's configuration, Tower's own skills as a free session's start, the deck's DOCUMENTS and
// OPEN QUESTIONS, `+ prototype`'s folder.

test('the design configuration validates: no tickets, no workflow, no repository actions, Tower defaults; TOWER_MODE=design', () => {
  expect(validateConfig(DESIGN_CONFIG)).toEqual({ ok: true, config: DESIGN_CONFIG })
  expect(DESIGN_CONFIG.tickets).toEqual({ kind: 'none' })
  expect(DESIGN_CONFIG.workflow.steps).toEqual({})
  expect(DESIGN_CONFIG.repoActions).toEqual([])
  expect(DESIGN_CONFIG.routing).toBe('defaults')
  expect(DESIGN_CONFIG.project.mainCheckout).toBe(null)
  expect(isDesignMode('design')).toBe(true)
  expect(isDesignMode('free')).toBe(false)
  expect(isDesignMode(undefined)).toBe(false)
})

test("Tower's skills as a session's start: the routing's model and effort when the table names the skill, else new session's", () => {
  expect(towerSkillPrompt('tower-setup')).toBe('/tower:tower-setup')
  const fallback = { model: 'claude-sonnet-4-6', effort: 'high' }
  expect(towerSkillStart('tower-setup', [], {}, fallback)).toEqual({ prompt: '/tower:tower-setup', model: 'claude-sonnet-4-6', effort: 'high' })
  const skills = [{ name: 'tower:tower-design', what: 'design', where: 'hub' as const, model: 'opus', effort: 'xhigh' }]
  expect(towerSkillStart('tower-design', skills, { opus: 'claude-opus-5-5' }, fallback)).toEqual({ prompt: '/tower:tower-design', model: 'claude-opus-5-5', effort: 'xhigh' })
  expect(towerSkillStart('tower-setup', [{ name: 'tower-setup', what: '', where: 'hub' as const, model: null, effort: null }], {}, fallback)).toEqual({ prompt: '/tower:tower-setup', model: null, effort: null })
  expect(isDesignSession('design-0000000a')).toBe(true)
  expect(isDesignSession('free-0000000a')).toBe(false)
})

test('DOCUMENTS: each stage document in order, none for a skipped stage or setup, the canvas by its name; packed lines', () => {
  const state = newDesignState()
  state.stages[0]!.status = 'done'
  state.stages[1]!.status = 'active'
  state.stages[5]!.doc = 'https://claude.ai/design/abc'
  const docs = designDocuments(state)
  expect(docs.map(doc => doc.name)).toEqual(['IDEA.md', 'RESEARCH.md', 'PRODUCT.md', 'DECISIONS.md', 'ARCHITECTURE.md', 'design canvas', 'ROADMAP.md'])
  expect(documentPath('/p/app/', docs[0]!)).toBe('/p/app/docs/IDEA.md')
  expect(documentPath('/p/app', docs[5]!)).toBe(null)
  state.stages[5]!.status = 'skipped'
  expect(designDocuments(state).map(doc => doc.n)).toEqual([1, 2, 3, 4, 5, 7])
  const lines = documentLines(designDocuments(state), { 1: true, 2: false }, 40)
  expect(lines.map(line => line.map(entry => `${entry.mark} ${entry.name}`).join('  '))).toEqual([
    '✓ IDEA.md  ○ RESEARCH.md  ○ PRODUCT.md',
    '○ DECISIONS.md  ○ ARCHITECTURE.md',
    '○ ROADMAP.md',
  ])
  expect(lines.every(line => line.map(entry => `${entry.mark} ${entry.name}`).join('  ').length <= 40)).toBe(true)
})

test('OPEN QUESTIONS: the active stage and its open questions; none when no stage is active', () => {
  const state = parseDesignState(JSON.stringify({ version: 1, current: 2, stages: [
    { n: 1, status: 'done' },
    { n: 2, status: 'active', openQuestions: [{ id: 'q1', text: 'Who pays?' }, { id: 'q2', text: 'iOS only?' }], resolvedQuestions: [{ id: 'q0', text: 'Name?', answer: 'Oink' }] },
  ] }))!
  expect(designQuestions(state)).toEqual({ stage: { n: 2, label: 'Research' }, questions: [{ id: 'q1', text: 'Who pays?' }, { id: 'q2', text: 'iOS only?' }] })
  state.stages[1]!.status = 'done'
  expect(designQuestions(state)).toEqual({ stage: null, questions: [] })
})

test("+ prototype's folder: spikes/<nn>-<slug>, the next number, the name as a slug", () => {
  expect(prototypeFolder('SwiftData holds 10k rows?', [])).toBe('01-swiftdata-holds-10k-rows')
  expect(prototypeFolder('Città più veloce', ['01-a', '07-b', 'notes.md', '3x'])).toBe('08-citta-piu-veloce')
  expect(prototypeFolder('  ', [])).toBe(null)
  expect(prototypeFolder('?!', [])).toBe(null)
  expect(prototypeFolder('a'.repeat(50), ['99-x'])).toBe(`100-${'a'.repeat(32)}`)
})
