import { expect, test } from 'claude-code/testing'
import { isMuted, stateDir } from '../hooks/core/stateDir'

test('stateDir: ~/.claude/tower by default, TOWER_STATE_DIR when set (trailing slash dropped), null with neither', async () => {
  expect(stateDir('/home/me', undefined)).toBe('/home/me/.claude/tower')
  expect(stateDir('/home/me', '')).toBe('/home/me/.claude/tower')
  expect(stateDir('/home/me', '/repo/.smoke/state')).toBe('/repo/.smoke/state')
  expect(stateDir('/home/me', '/repo/.smoke/state//')).toBe('/repo/.smoke/state')
  expect(stateDir(null, '/repo/.smoke/state')).toBe('/repo/.smoke/state')
  expect(stateDir(undefined, undefined)).toBeNull()
  expect(stateDir('/home/me', '/')).toBe('/')
})

test('isMuted: only TOWER_MUTE=1', async () => {
  expect(isMuted('1')).toBe(true)
  expect(isMuted(undefined)).toBe(false)
  expect(isMuted('')).toBe(false)
  expect(isMuted('0')).toBe(false)
})
