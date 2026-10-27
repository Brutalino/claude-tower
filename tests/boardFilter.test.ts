import { expect, test } from 'claude-code/testing'

import { filterRows, parseRailInput as parseWith, strayEdit } from '../hooks/core/boardFilter'
import { ticketInput } from '../hooks/core/config'
import { LINEAR_CONFIG } from './linearConfig'

const parseRailInput = (text: string) => parseWith(text, ticketInput(LINEAR_CONFIG.tickets))

test('a ticket id, with or without tkt-, any case, is a ticket', () => {
  expect(parseRailInput('TKT-2426')).toEqual({ kind: 'ticket', id: 'TKT-2426' })
  expect(parseRailInput('tkt-2426')).toEqual({ kind: 'ticket', id: 'TKT-2426' })
  expect(parseRailInput(' 2426 ')).toEqual({ kind: 'ticket', id: 'TKT-2426' })
})

test('a slash command passes through; an empty prompt clears; other text filters', () => {
  expect(parseRailInput('/tower')).toEqual({ kind: 'passthrough' })
  expect(parseRailInput('  /clear')).toEqual({ kind: 'passthrough' })
  expect(parseRailInput('')).toEqual({ kind: 'clear' })
  expect(parseRailInput('   ')).toEqual({ kind: 'clear' })
  expect(parseRailInput(' Tariff ')).toEqual({ kind: 'filter', text: 'Tariff' })
  expect(parseRailInput('TKT-12a')).toEqual({ kind: 'filter', text: 'TKT-12a' })
})

test('the filter keeps the rows whose id or title contains the text, case-insensitive', () => {
  const rows = [
    { id: 'TKT-9003', title: 'CSV export misses the tariff column' },
    { id: 'TKT-9007', title: 'Tariff editor' },
    { id: 'TKT-9004', title: 'Login page' },
  ]
  const fields = (row: { id: string; title: string }) => [row.id, row.title]
  expect(filterRows(rows, 'TARIFF', fields).map(row => row.id)).toEqual(['TKT-9003', 'TKT-9007'])
  expect(filterRows(rows, 'tkt-9004', fields).map(row => row.id)).toEqual(['TKT-9004'])
  expect(filterRows(rows, '', fields)).toHaveLength(3)
  expect(filterRows(rows, 'nothing', fields)).toEqual([])
})

test('a key into the empty box while the cards hold the keys is stray; after Escape, or into text, it is typing', () => {
  expect(strayEdit(true, '', 'z')).toBe(true)
  expect(strayEdit(true, '', 'tar')).toBe(true)
  expect(strayEdit(false, '', 'z')).toBe(false)
  expect(strayEdit(true, 'ta', 'tar')).toBe(false)
  expect(strayEdit(true, '', '')).toBe(false)
})
