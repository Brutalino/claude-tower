import { expect, test } from 'claude-code/testing'

import { mermaidArt, replyBlocks, strikethrough, taskLine } from '../hooks/core/replyBlocks'
import { DURATIONS_KEPT, durationText, editCounts, groupDuration, rememberDuration } from '../hooks/core/transcript'

test('a reply splits into markdown, an alert, a task list and markdown again', () => {
  const blocks = replyBlocks('Plan:\n> [!WARNING]\n> Careful **now**\n> twice\n- [ ] one\n- [x] two\n  - [ ] nested\ntail')
  expect(blocks).toEqual([
    { kind: 'markdown', text: 'Plan:' },
    { kind: 'alert', alert: 'warning', label: 'Warning', text: 'Careful **now**\ntwice' },
    { kind: 'tasks', items: [{ done: false, text: 'one', indent: 0 }, { done: true, text: 'two', indent: 0 }, { done: false, text: 'nested', indent: 2 }] },
    { kind: 'markdown', text: 'tail' },
  ])
  expect(blocks[2]!.kind === 'tasks' && blocks[2]!.items.map(taskLine)).toEqual(['☐ one', '☑ two', '  ☐ nested'])
})

test('each alert kind has its label; text on the marker line is kept', () => {
  for (const kind of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) {
    const [block] = replyBlocks(`> [!${kind}] inline`)
    expect(block).toEqual({ kind: 'alert', alert: kind.toLowerCase(), label: kind[0] + kind.slice(1).toLowerCase(), text: 'inline' })
  }
  // A plain quote stays markdown.
  expect(replyBlocks('> just a quote')).toEqual([{ kind: 'markdown', text: '> just a quote' }])
})

test('strikethrough is drawn outside inline code; fenced code is left alone', () => {
  expect(strikethrough('a ~~old~~ `~~k~~`')).toBe('a o̶l̶d̶ `~~k~~`')
  const text = '```md\n> [!NOTE]\n- [ ] x\n~~y~~\n```'
  expect(replyBlocks(text)).toEqual([{ kind: 'markdown', text }])
})

test('a mermaid fence is drawn; one it cannot draw stays the code block', () => {
  const drawn = replyBlocks('see\n```mermaid\nflowchart TD\n  A[Go] --> B[Stop]\n```\nend')
  expect(drawn.map(block => block.kind)).toEqual(['markdown', 'diagram', 'markdown'])
  const odd = '```mermaid\npie title Pets\n  "Dogs" : 3\n```'
  expect(replyBlocks(odd)).toEqual([{ kind: 'markdown', text: odd }])
})

test('mermaid: a linear chain, top down', () => {
  expect(mermaidArt('flowchart TD\n  A[Start] --> B[Build]\n  B --> C[Ship]')).toEqual([
    '┌───────┐', '│ Start │', '└───────┘', '    │', '    │', '    ▼',
    '┌───────┐', '│ Build │', '└───────┘', '    │', '    │', '    ▼',
    '┌──────┐', '│ Ship │', '└──────┘',
  ])
})

test('mermaid: a branch that joins again', () => {
  expect(mermaidArt('graph TD\n  A[Plan] --> B[Code]\n  A --> C[Docs]\n  B --> D[Ship]\n  C --> D')).toEqual([
    '     ┌──────┐', '     │ Plan │', '     └──────┘', '         │', '    ┌────┴─────┐', '    ▼          ▼',
    '┌──────┐   ┌──────┐', '│ Code │   │ Docs │', '└──────┘   └──────┘', '    │          │', '    └────┬─────┘', '         ▼',
    '     ┌──────┐', '     │ Ship │', '     └──────┘',
  ])
})

test('mermaid: left to right', () => {
  expect(mermaidArt('flowchart LR\n  A[Plan] --> B[Code]\n  A --> C[Docs]\n  B --> D[Ship]')).toEqual([
    '              ┌──────┐',
    '          ┌──▶│ Code │──┐',
    '┌──────┐  │   └──────┘  │   ┌──────┐',
    '│ Plan │──┤             └──▶│ Ship │',
    '└──────┘  │   ┌──────┐      └──────┘',
    '          └──▶│ Docs │',
    '              └──────┘',
  ])
})

test('mermaid: a sequence diagram', () => {
  expect(mermaidArt('sequenceDiagram\n  participant U as User\n  U->>S: login\n  S-->>U: token')).toEqual([
    '┌──────┐  ┌───┐', '│ User │  │ S │', '└──────┘  └───┘',
    '    │ login  │', '    │───────▶│', '    │ token  │', '    │◀╌╌╌╌╌╌╌│', '    │        │',
  ])
})

test('mermaid: unsupported syntax, cycles, skipped layers and too wide are null', () => {
  expect(mermaidArt('flowchart TD\n  A{x} --> B')).toBeNull()
  expect(mermaidArt('flowchart TD\n  A --> B\n  subgraph one')).toBeNull()
  expect(mermaidArt('flowchart TD\n  A --> B\n  B --> A')).toBeNull()
  expect(mermaidArt('flowchart TD\n  A --> B\n  B --> C\n  A --> C')).toBeNull()
  expect(mermaidArt('sequenceDiagram\n  A->>B: hi\n  loop every minute')).toBeNull()
  expect(mermaidArt('sequenceDiagram\n  A->>A: self')).toBeNull()
  expect(mermaidArt(`flowchart LR\n  A[${'x'.repeat(40)}] --> B[${'y'.repeat(40)}]`)).toBeNull()
  expect(mermaidArt('classDiagram\n  A <|-- B')).toBeNull()
})

test('durations: tenths under a minute, m:ss after', () => {
  expect(durationText(12_400)).toBe('12.4s')
  expect(durationText(430)).toBe('0.4s')
  expect(durationText(65_000)).toBe('1:05')
})

test('durations are kept by id, the newest DURATIONS_KEPT', () => {
  const map = new Map<string, number>()
  for (let i = 0; i < DURATIONS_KEPT + 3; i++) rememberDuration(map, `t${i}`, i)
  expect(map.size).toBe(DURATIONS_KEPT)
  expect(map.has('t0')).toBe(false)
  expect(map.get(`t${DURATIONS_KEPT + 2}`)).toBe(DURATIONS_KEPT + 2)
})

test('edit counts: shared lines left out; MultiEdit sums; Write counts lines', () => {
  expect(editCounts('Edit', { old_string: 'a\nb\nc', new_string: 'a\nB\nB2\nc' })).toEqual({ added: 2, removed: 1 })
  expect(editCounts('Edit', { old_string: '', new_string: 'x' })).toEqual({ added: 1, removed: 0 })
  expect(editCounts('MultiEdit', { edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c\nd', new_string: '' }] })).toEqual({ added: 1, removed: 3 })
  expect(editCounts('Write', { content: 'one\ntwo\n' })).toEqual({ lines: 2 })
  expect(editCounts('Bash', { command: 'ls' })).toBeNull()
})

test('a group\'s time: the calls summed, null while one runs or is unknown', () => {
  const durations = new Map([['a', 2_100], ['b', 300]])
  expect(groupDuration([{ tool_use_id: 'a', isRunning: false }, { tool_use_id: 'b', isRunning: false }], durations)).toBe(2_400)
  expect(groupDuration([{ tool_use_id: 'a', isRunning: false }, { tool_use_id: 'b', isRunning: true }], durations)).toBeNull()
  expect(groupDuration([{ tool_use_id: 'c', isRunning: false }], durations)).toBeNull()
})
