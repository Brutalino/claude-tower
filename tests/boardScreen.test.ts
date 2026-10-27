import { expect, test } from 'claude-code/testing'

import type { TowerIssue } from '../types/index'
import { boardColumns, candidateMark, candidateStatus, descriptionLines, idWidth, issueMeta, linearLines, listWindow, modelsLine, rowCells, wrapWords } from '../hooks/core/board'

const ISSUE: TowerIssue = {
  id: 'TKT-9', title: 'T', description: '', priority: 'high', branchName: '', url: 'https://linear.app/x/TKT-9', stateName: 'Next',
  stateType: 'unstarted', labels: ['bug'], assignedToMe: false, story: null, blockedBy: ['TKT-8'], children: [],
} as TowerIssue

test('the list column scales between 44 and 60 and the side takes 42 when it fits', async () => {
  expect(boardColumns(220)).toEqual({ list: 59, main: 110, side: 42 })
  expect(boardColumns(160).list).toBe(44)
  expect(boardColumns(120).side).toBe(0)
})

test('a row line keeps the id in its column with a space, cuts the title and right-aligns the figure in 6', async () => {
  const cells = rowCells(30, 'TKT-9001', 'A rather long title', '2m')
  expect(cells).toEqual({ id: 'TKT-9001  ', title: 'A rather …', figure: '    2m' })
})

test('the id column fits the longest id (9..14) plus a space; a longer id is cut with …', async () => {
  expect(idWidth(['TKT-1', 'TKT-9001'])).toBe(10)
  expect(idWidth(['TKT-1', 'BRAG-DEMO'])).toBe(10)
  expect(idWidth(['SHAPE-autocharge'])).toBe(15)
  expect(rowCells(40, 'BRAG-DEMO', 'detached', '', 10).id).toBe('BRAG-DEMO ')
  expect(rowCells(40, 'SHAPE-autocharge', 'feature/autocharge', '', 15).id).toBe('SHAPE-autocha… ')
})

const used = (window: { items: { kind: 'heading' | 'ticket' }[]; moreAbove: number; moreBelow: number }) =>
  window.items.reduce((sum, item) => sum + (item.kind === 'heading' ? 1 : 2), 0) + (window.moreAbove > 0 ? 1 : 0) + (window.moreBelow > 0 ? 1 : 0)

test('the list window: 42 candidates in a 44-row box scroll so every one is reachable', async () => {
  const items = [{ kind: 'heading' as const, id: 'h' }, ...Array.from({ length: 42 }, (_, index) => ({ kind: 'ticket' as const, id: `t${index}` }))]
  const top = listWindow(items, 1, 44)
  expect(top.start).toBe(0)
  expect(top.items.length).toBe(22)
  expect(top.moreAbove).toBe(0)
  expect(top.moreBelow).toBe(21)
  expect(used(top)).toBe(44)
  let start = 0
  for (let focus = 1; focus < items.length; focus++) {
    const window = listWindow(items, focus, 44, start)
    expect(window.items.includes(items[focus] as (typeof items)[number])).toBe(true)
    expect(used(window)).toBeLessThanOrEqual(44)
    start = window.start
  }
  const bottom = listWindow(items, 42, 44, start)
  expect(bottom.moreBelow).toBe(0)
  expect(bottom.moreAbove + bottom.items.length).toBe(42)
  // Up from the bottom moves the window only once the focus passes its top edge.
  expect(listWindow(items, 30, 44, bottom.start).start).toBe(bottom.start)
  const up = listWindow(items, bottom.start - 1, 44, bottom.start)
  expect(up.start).toBe(bottom.start - 1)
  expect(listWindow(items, 1, 44, up.start).start).toBe(0)
})

test('a short list shows whole with no more lines', async () => {
  const items = [{ kind: 'heading' as const }, { kind: 'ticket' as const }, { kind: 'ticket' as const }]
  expect(listWindow(items, 2, 10)).toEqual({ items, start: 0, moreAbove: 0, moreBelow: 0 })
})

test('the description wraps items keeping every continuation, links as their text, long words cut', async () => {
  const text = [
    '1. Optionally set `AutoChargeIdSource` and the printer fallback so the driver can start printing without a card',
    '- [ ] the printer starts a session from the vehicle id when it has no card at all',
    'See [the runbook](<https://example.com/a/very/long/path/that/never/fits/in/the/column/at/all>) for more.',
    'https://example.com/a/very/long/path/that/never/fits/in/the/column/at/all',
  ].join('\n')
  const lines = descriptionLines(text, 30, 40)
  const texts = lines.map(line => ('label' in line ? `${line.label} ${line.text}` : line.text))
  for (const one of texts) expect(Array.from(one).length).toBeLessThanOrEqual(30)
  expect(texts.slice(0, 4)).toEqual(['1. Optionally set', '   `AutoChargeIdSource` and', '   the printer fallback so the', '   driver can start printing'])
  expect(texts[4]).toBe('   without a card')
  expect(lines[5]).toEqual({ kind: 'check', text: 'the printer starts a session' })
  expect(texts.slice(6, 9)).toEqual(['  from the vehicle id when it', '  has no card at all', 'See the runbook for more.'])
  expect(texts[9]).toBe('https://example.com/a/very/lo…')
  expect(texts.length).toBe(10)
  expect(wrapWords('a b', 30)).toEqual(['a b'])
})

test('the description keeps its leads and checks and cuts with a count', async () => {
  const text = '**Problem.** It breaks.\n\n**Expected.** It works.\n\n**Done when**\n- [ ] one\n- [ ] two\n- [ ] three'
  expect(descriptionLines(text, 40, 10).map(line => line.kind)).toEqual(['lead', 'lead', 'heading', 'check', 'check', 'check'])
  const cut = descriptionLines(text, 40, 4)
  expect(cut[cut.length - 1]).toEqual({ kind: 'more', text: '… 3 more lines' })
})

test('models line orders by tokens and skips empty families', async () => {
  expect(modelsLine({ fable: 9000, sonnet: 21400, haiku: 0 })).toEqual([['sonnet', '21k'], ['fable', '9k']])
  expect(modelsLine(null)).toEqual([])
})

test('a candidate reads state, priority, labels, and the linear panel lists blockers', async () => {
  expect(candidateStatus(ISSUE)).toBe('Next · High · bug · unassigned')
  expect(issueMeta(ISSUE)).toBe('Next · High · no story · unassigned')
  expect(linearLines(ISSUE)).toContain('blocked by TKT-8')
})

test("a candidate's mark: mine in the accent, someone else's short name dim, none when free", async () => {
  expect(candidateMark({ ...ISSUE, assignedToMe: true })).toEqual({ text: 'mine', tone: 'accent' })
  expect(candidateMark({ ...ISSUE, assigneeName: 'giulia' })).toEqual({ text: 'giulia', tone: 'dim' })
  expect(candidateMark(ISSUE)).toBeNull()
  // Someone else's ticket is not `unassigned`; the person's own never was.
  expect(candidateStatus({ ...ISSUE, assigneeName: 'giulia' })).toBe('Next · High · bug')
  expect(issueMeta({ ...ISSUE, assigneeName: 'giulia' })).toBe('Next · High · no story')
  expect(candidateStatus({ ...ISSUE, assignedToMe: true })).toBe('Next · High · bug')
})
