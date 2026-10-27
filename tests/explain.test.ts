import { expect, test } from 'claude-code/testing'

import { chipsFit, explainKey, explainMode, explainSection, ghostText as ghostTextWith, nextMode } from '../hooks/core/explain'
import { LINEAR_CONFIG } from './linearConfig'

const ghostText = (step: { next: string | null } | null, lastAnswer: string) => ghostTextWith(step, lastAnswer, LINEAR_CONFIG.workflow)

test('Off adds no section; each other mode adds its own text', () => {
  expect(explainSection('off')).toBe(null)
  expect(explainSection('ste')).toMatch(/^Write every explanation in Simplified Technical English: short sentences \(20 words at most\)/)
  expect(explainSection('diagram')).toMatch(/include one diagram drawn with box-drawing characters or a Mermaid code block/)
  expect(explainSection('html')).toMatch(/one self-contained HTML file \(inline CSS, no external resources\) in `\.work\/explain\/<short-slug>\.html`/)
  expect(explainSection('video')).toMatch(/sequence of timed steps \(inline CSS and JavaScript, no external resources, with play\/pause and a step counter\)/)
})

test('the modes cycle in the chips order and wrap to Off', () => {
  expect(nextMode('off')).toBe('ste')
  expect(nextMode('ste')).toBe('diagram')
  expect(nextMode('diagram')).toBe('html')
  expect(nextMode('html')).toBe('video')
  expect(nextMode('video')).toBe('off')
})

test('the mode is kept per worktree, and an unknown or missing stored value reads STE (the default)', () => {
  expect(explainKey('/r/repo-TKT-9001')).toBe('explain:/r/repo-TKT-9001')
  expect(explainMode('html')).toBe('html')
  expect(explainMode(undefined)).toBe('ste')
  expect(explainMode('loud')).toBe('ste')
  expect(explainMode('off')).toBe('off')
})

test('a narrow row drops `explain as` first, then shortens the chips', () => {
  expect(chipsFit(120, '/open-pr')).toEqual({ label: true, short: false, next: true })
  expect(chipsFit(55, '/open-pr')).toEqual({ label: false, short: false, next: true })
  expect(chipsFit(30, '/open-pr')).toEqual({ label: false, short: true, next: true })
  expect(chipsFit(12, '/open-pr')).toEqual({ label: false, short: true, next: false })
  expect(chipsFit(55, null)).toEqual({ label: true, short: false, next: false })
})

test('the ghost is what the person would type', () => {
  expect(ghostText({ next: 'say go' }, '')).toBe('go')
  expect(ghostText({ next: '/open-pr' }, 'Done.')).toBe('/open-pr')
  expect(ghostText({ next: '/review 101' }, '')).toBeNull()
  expect(ghostText({ next: '/wrap-up 102' }, '')).toBe('/wrap-up 102')
  expect(ghostText({ next: '/start-ticket TKT-9005' }, '')).toBe('/start-ticket TKT-9005')
  expect(ghostText({ next: '/open-pr' }, 'Mark the PR ready for review?\n')).toBe('yes')
  expect(ghostText({ next: null }, '')).toBe(null)
  expect(ghostText(null, '')).toBe(null)
})
