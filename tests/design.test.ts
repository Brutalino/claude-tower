import { expect, test } from 'claude-code/testing'

import { DESIGN_STAGES, designPath, designPathLines, designTitle, newDesignState, parseDesignState } from '../hooks/core/design'

// What tools/tower-design-state.sh writes after init, advance (1 done, 2 active) and three add-question on research.
const AT_RESEARCH = JSON.stringify({
  version: 1,
  current: 2,
  stages: [
    { n: 1, key: 'idea', status: 'done', doc: 'docs/IDEA.md', openQuestions: [], resolvedQuestions: [], note: null },
    {
      n: 2,
      key: 'research',
      status: 'active',
      doc: 'docs/RESEARCH.md',
      openQuestions: [
        { id: 'q1', text: 'Is a bank connection (PSD2) in scope?' },
        { id: 'q2', text: 'One person or a household?' },
        { id: 'q3', text: 'Which countries first?' },
      ],
      resolvedQuestions: [],
      note: null,
    },
    { n: 3, key: 'product', status: 'todo', doc: 'docs/PRODUCT.md', openQuestions: [], resolvedQuestions: [], note: null },
    { n: 4, key: 'decisions', status: 'todo', doc: 'docs/DECISIONS.md', openQuestions: [], resolvedQuestions: [], note: null },
    { n: 5, key: 'architecture', status: 'todo', doc: 'docs/ARCHITECTURE.md', openQuestions: [], resolvedQuestions: [], note: null },
    { n: 6, key: 'design', status: 'todo', doc: null, openQuestions: [], resolvedQuestions: [], note: null },
    { n: 7, key: 'plan', status: 'todo', doc: 'docs/ROADMAP.md', openQuestions: [], resolvedQuestions: [], note: null },
    { n: 8, key: 'setup', status: 'todo', doc: null, openQuestions: [], resolvedQuestions: [], note: null },
  ],
})

test('a missing, broken or non-object file reads as no state', async () => {
  expect(parseDesignState(undefined)).toBe(null)
  expect(parseDesignState('{"version": 1, "cur')).toBe(null)
  expect(parseDesignState('[]')).toBe(null)
  expect(parseDesignState('"text"')).toBe(null)
})

test('the file the state script writes reads back whole', async () => {
  const state = parseDesignState(AT_RESEARCH)!
  expect(state.current).toBe(2)
  expect(state.stages.map(s => s.status)).toEqual(['done', 'active', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo'])
  expect(state.stages[1]!.openQuestions.map(q => q.id)).toEqual(['q1', 'q2', 'q3'])
  expect(parseDesignState(JSON.stringify(newDesignState()))).toEqual(newDesignState())
})

test('tolerant: stages by n or key, unknown statuses to do, default documents, string questions, current derived', async () => {
  const state = parseDesignState(
    JSON.stringify({
      stages: [
        { key: 'idea', status: 'done' },
        { n: 2, status: 'active', openQuestions: ['Who pays?', { text: 'Offline?' }, { id: 'x' }, 7] },
        { n: 3, status: 'finished' },
        { key: 'design', status: 'skipped', note: 'a command-line tool, no screens' },
        { n: 9, status: 'done' },
        'junk',
      ],
      extra: true,
    }),
  )!
  expect(state.version).toBe(1)
  expect(state.current).toBe(2)
  expect(state.stages.map(s => s.status)).toEqual(['done', 'active', 'todo', 'todo', 'todo', 'skipped', 'todo', 'todo'])
  expect(state.stages[1]!.openQuestions).toEqual([
    { id: 'research-1', text: 'Who pays?' },
    { id: 'research-2', text: 'Offline?' },
  ])
  expect(state.stages[0]!.doc).toBe('docs/IDEA.md')
  expect(state.stages[5]!.note).toBe('a command-line tool, no screens')
  // No active stage and no usable current: the first stage still to do.
  expect(parseDesignState('{"current": 0, "stages": [{"n": 1, "status": "done"}]}')!.current).toBe(2)
  expect(parseDesignState(JSON.stringify({ stages: DESIGN_STAGES.map(s => ({ n: s.n, status: 'done' })) }))!.current).toBe(8)
})

test('resolved questions keep their answer', async () => {
  const state = parseDesignState(
    JSON.stringify({ current: 3, stages: [{ n: 2, status: 'done', resolvedQuestions: [{ id: 'q1', text: 'Who pays?', answer: 'nobody, free' }, { id: 'q2', text: 'Offline?' }] }] }),
  )!
  expect(state.stages[1]!.resolvedQuestions).toEqual([
    { id: 'q1', text: 'Who pays?', answer: 'nobody, free' },
    { id: 'q2', text: 'Offline?', answer: null },
  ])
  expect(state.stages[1]!.openQuestions).toEqual([])
})

test('the path at stage 2: the rows of the plan', async () => {
  const rows = designPath(parseDesignState(AT_RESEARCH)!)
  expect(rows.map(r => r.mark)).toEqual(['✓', '◆', '○', '○', '○', '○', '○', '○'])
  expect(rows[1]).toEqual({
    n: 2,
    key: 'research',
    label: 'Research',
    mark: '◆',
    status: 'active',
    summary: 'the topic, what exists, users, constraints',
    doc: 'docs/RESEARCH.md',
    note: '3 open questions',
    current: true,
  })
  expect(rows.filter(r => r.current).map(r => r.n)).toEqual([2])
  expect(rows[5]!.doc).toBe('design canvas')
  expect(rows[7]!.doc).toBe('')
  expect(designPathLines(rows)).toEqual([
    "✓ 1 Idea          the raw idea, in the user's words           docs/IDEA.md",
    '◆ 2 Research      the topic, what exists, users, constraints  docs/RESEARCH.md      3 open questions',
    '○ 3 Product       what, for whom, why, what not               docs/PRODUCT.md',
    '○ 4 Decisions     platform, stack, data                       docs/DECISIONS.md',
    '○ 5 Architecture  modules, data, main flows                   docs/ARCHITECTURE.md',
    '○ 6 Design        screens and style (when there is a UI)      design canvas',
    '○ 7 Plan          milestones and first slices                 docs/ROADMAP.md',
    '○ 8 Setup         tower-setup builds the infrastructure',
  ])
})

test('one open question, a skipped design with its reason, a canvas link', async () => {
  const state = newDesignState()
  state.current = 8
  for (const stage of state.stages) stage.status = 'done'
  state.stages[7]!.status = 'active'
  state.stages[5]!.status = 'skipped'
  state.stages[5]!.note = 'no UI: a command-line tool'
  state.stages[6]!.openQuestions = [{ id: 'q9', text: 'Which slice first?' }]
  const rows = designPath(state)
  expect(rows[5]!.mark).toBe('–')
  expect(rows[5]!.note).toBe('skipped: no UI: a command-line tool')
  expect(rows[5]!.doc).toBe('')
  expect(rows[6]!.note).toBe('1 open question')
  expect(rows[7]!.mark).toBe('◆')
  state.stages[5]!.status = 'done'
  state.stages[5]!.doc = 'https://claude.ai/artifact/abc'
  expect(designPath(state)[5]!.doc).toBe('https://claude.ai/artifact/abc')
})

test('the title shows the home folder as ~', async () => {
  expect(designTitle('/home/ana/Repositories/budget-app', '/home/ana')).toBe('new project · ~/Repositories/budget-app')
  expect(designTitle('/home/anabel/x', '/home/ana')).toBe('new project · /home/anabel/x')
  expect(designTitle('/srv/x', '')).toBe('new project · /srv/x')
})
