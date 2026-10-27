import { expect, test } from 'claude-code/testing'

import type { TowerRailRow } from '../types/index'
import { agentsSuffix, rowGlyph, rowMarker } from '../hooks/core/rail'
import { theme } from '../hooks/core/theme'

const THEME = theme('terminal')

function row(key: string, session: TowerRailRow['session']): TowerRailRow {
  return { key, branch: key, path: `/wt/${key}`, phase: 'not started', next: null, hasPlan: false, blockers: [], session, agents: 0 }
}

test('the marker follows the centre, then the ticket being opened', async () => {
  expect(rowMarker(row('TKT-1', 'idle'), 'TKT-1', null, THEME).text).toBe('▶')
  expect(rowMarker(row('TKT-2', null), 'TKT-1', 'TKT-2', THEME).text).toBe('▶')
  expect(rowMarker(row('TKT-2', 'working'), 'TKT-1', null, THEME).text).toBe(' ')
})

test('a ticket with no session shows a dim dot and keeps the idle glyph', async () => {
  expect(rowMarker(row('TKT-3', null), 'TKT-1', null, THEME)).toEqual({ text: '·', color: undefined, dim: true })
  expect(rowGlyph(row('TKT-3', null), THEME).glyph).toBe('○')
})

test('a ticket with running agents names their count after its phase', async () => {
  expect(agentsSuffix(0)).toBe('')
  expect(agentsSuffix(1)).toBe(' · 1 agent')
  expect(agentsSuffix(3)).toBe(' · 3 agents')
})
