import { expect, test } from 'claude-code/testing'

import { decodeCommand, encodeCommand, isAllowed } from '../hooks/core/bus'

const envelope = (body: string) =>
  `<cross-session-message from="abc" from-name="rail" from-mode="default">\n${body}\n</cross-session-message>`

test('encode writes the prefix and JSON', () => {
  expect(encodeCommand({ command: 'echo-test' })).toBe('TOWER1 {"command":"echo-test"}')
  expect(encodeCommand({ command: 'repro', args: 'TKT-2' })).toBe('TOWER1 {"command":"repro","args":"TKT-2"}')
})

test('decode reads a command with and without the peer envelope', () => {
  const text = encodeCommand({ command: 'open-pr', args: 'draft' })
  expect(decodeCommand(text)).toEqual({ command: 'open-pr', args: 'draft' })
  expect(decodeCommand(envelope(text))).toEqual({ command: 'open-pr', args: 'draft' })
  expect(decodeCommand(`  \n${envelope(`  ${encodeCommand({ command: 'plugin:x_y' })}  `)}\n `)).toEqual({ command: 'plugin:x_y' })
})

test('decode refuses anything else', () => {
  for (const text of [
    'hello',
    envelope('please run /open-pr'),
    'TOWER1 not json',
    'TOWER1 ["open-pr"]',
    'TOWER1 {"args":"x"}',
    'TOWER1 {"command":""}',
    'TOWER1 {"command":"rm -rf"}',
    `TOWER1 {"command":"${'a'.repeat(65)}"}`,
    'TOWER1 {"command":"x","args":3}',
    'TOWER1 {"command":"x","args":"two\\nlines"}',
    `TOWER1 {"command":"x","args":"${'a'.repeat(501)}"}`,
    'TOWER2 {"command":"x"}',
    'tower1 {"command":"x"}',
  ]) {
    expect(decodeCommand(text)).toBeNull()
  }
  expect(decodeCommand(`TOWER1 {"command":"x","args":"${'a'.repeat(500)}"}`)).toEqual({ command: 'x', args: 'a'.repeat(500) })
})

test('only known command names are allowed', () => {
  expect(isAllowed('echo-test', ['shape', 'echo-test'])).toBe(true)
  expect(isAllowed('echo', ['shape', 'echo-test'])).toBe(false)
  expect(isAllowed('shape', [])).toBe(false)
})
