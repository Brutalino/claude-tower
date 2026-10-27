import { expect, test } from 'claude-code/testing'

import { isMicro, microCompact, READ_PLACEHOLDER, type MicroMessage } from '../hooks/core/microCompact'

function conversation(reads: number): MicroMessage[] {
  const out: MicroMessage[] = [{ role: 'user', text: 'fix the alert', toolUses: [], handle: 'h:0' }]
  for (let index = 1; index <= reads; index++) {
    out.push({ role: 'assistant', text: '', toolUses: [{ tool_use_id: `r${index}`, tool: 'Read', input: { file_path: `f${index}.ts` }, text: `body ${index}`, result: { file: index } }], handle: `h:a${index}` })
    out.push({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: `r${index}`, text: `body ${index}`, isError: false, result: { file: index } }], handle: `h:u${index}` })
  }
  out.push({ role: 'assistant', text: 'done', toolUses: [{ tool_use_id: 'b1', tool: 'Bash', input: { command: 'pnpm test' }, text: 'ok' }], handle: 'h:last' })
  return out
}

test('microCompact: all but the newest 3 Read results become the placeholder; other messages keep their handle', async () => {
  const out = microCompact(conversation(5))
  expect(out.reads).toBe(2)
  const results = out.messages.flatMap(message => message.toolResults ?? [])
  expect(results.map(result => result.text)).toEqual([READ_PLACEHOLDER, READ_PLACEHOLDER, 'body 3', 'body 4', 'body 5'])
  expect(results[0]).toEqual({ tool_use_id: 'r1', text: READ_PLACEHOLDER, isError: false })
  // The call's own outcome follows, its input stays.
  const uses = out.messages.flatMap(message => message.toolUses)
  expect(uses[0]!).toEqual({ tool_use_id: 'r1', tool: 'Read', input: { file_path: 'f1.ts' }, text: READ_PLACEHOLDER })
  expect(uses[2]!.text).toBe('body 3')
  // The first prompt and the untouched results stand as the engine has them.
  expect(out.messages[0]!.handle).toBe('h:0')
  expect(out.messages[6]!.handle).toBe('h:u3')
  expect(out.messages[2]!.handle).toBe(undefined)
})

test('microCompact: every assistant message is rebuilt (its thinking left behind), text and tool calls kept', async () => {
  const out = microCompact(conversation(1))
  expect(out.reads).toBe(0)
  expect(out.replies).toBe(2)
  const last = out.messages[out.messages.length - 1]
  expect(last).toEqual({ role: 'assistant', text: 'done', toolUses: [{ tool_use_id: 'b1', tool: 'Bash', input: { command: 'pnpm test' }, text: 'ok' }] })
})

test('microCompact: idempotent — a second run drops nothing more', async () => {
  const once = microCompact(conversation(6))
  const twice = microCompact(once.messages)
  expect(once.reads).toBe(3)
  expect(twice.reads).toBe(0)
  expect(twice.messages).toEqual(once.messages)
})

test('isMicro: `/compact micro` and the command, nothing else', async () => {
  expect(isMicro('micro')).toBe(true)
  expect(isMicro(' Micro ')).toBe(true)
  expect(isMicro('keep the plan')).toBe(false)
  expect(isMicro(undefined)).toBe(false)
})
