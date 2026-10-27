import { expect, test } from 'claude-code/testing'

import { docEntries, docTitle, liveLines, recentLines } from '../hooks/core/docs'

test('a document title is the file name without its extension', async () => {
  expect(docTitle('.work/review.md')).toBe('review')
  expect(docTitle('repro/notes.html')).toBe('notes')
})

test('the documents: plan, pull request, then the files sorted, once each', async () => {
  const docs = docEntries({
    plan: '# Plan',
    prBody: 'Fixes it',
    files: [
      { path: './repro/b.html', text: '<p>b</p>' },
      { path: '.work/a.md', text: '# a' },
      { path: '.work/a.md', text: '# a' },
      { path: '.work/state.json', text: '{}' },
    ],
  })
  expect(docs.map(doc => doc.title)).toEqual(['plan', 'pull request', 'a', 'b'])
  expect(docs[3]).toEqual({ title: 'b', path: 'repro/b.html', text: '<p>b</p>', html: true })
})

test('no plan and an empty pull request text are left out', async () => {
  expect(docEntries({ plan: null, prBody: '  ', files: [] })).toEqual([])
})

test('live lines: the agent text plain, tool uses dim, the newest kept', async () => {
  const lines = liveLines(
    [
      { role: 'user', text: 'do it', toolUses: [] },
      { role: 'assistant', text: 'Reading.\n\nNow editing.', toolUses: [{ tool: 'Read', input: { file_path: 'src/a.ts' } }] },
    ],
    2,
  )
  expect(lines).toEqual([
    { text: 'Now editing.', dim: false },
    { text: '· Read src/a.ts', dim: true },
  ])
  expect(recentLines(['Edit a', 'Bash ls'], 1)).toEqual([{ text: '· Bash ls', dim: true }])
})
