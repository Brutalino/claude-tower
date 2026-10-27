import { expect, mock, test } from 'claude-code/testing'

const RAIL_ENV = { TOWER_ROLE: 'rail', TOWER_REPO: '/repo/shopapp', HOME: '/home/test', TMUX_PANE: '%0' }
const EDIT = { origin: { kind: 'composer' }, cursor: 0, start: 0, end: 0 } as const

/** The rail session, its pane holding the keys or not, drawn as the home (wide). */
function rail(on: any, cardsHoldKeys: boolean) {
  mock.env(on, RAIL_ENV)
  mock.clock(on, { now: 1_000_000 })
  on('process.run', async () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }) as any)
  // Core's editor: the splice applied, the cursor after what went in.
  on('prompt.edit', async (_$: unknown, e: any) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }) as any)
  on('ui.panes' as any, async () => ({ value: [{ id: 'tower', isFocused: cardsHoldKeys, isPlaced: true }] }) as any)
}

test('a key the board does not take, into the empty box while the cards hold the keys, is consumed with a notice', async ($, on) => {
  rail(on, true)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 140 } } as any)
  expect(await ($.prompt as any).edit({ ...EDIT, text: '', inputText: 'z' } as any)).toEqual({ text: '', cursor: 0 })
  expect(await ui.find({ type: 'Text', text: /"z" is not a key here · esc to type a filter or an id/ })).toBeDefined()
})

test('after Escape (the box holds the keys) a key is typing; so is a key into text already there', async ($, on) => {
  rail(on, false)
  expect((await ($.prompt as any).edit({ ...EDIT, text: '', inputText: 't' } as any)).text).toBe('t')
  expect((await ($.prompt as any).edit({ ...EDIT, text: 'ta', cursor: 2, start: 2, end: 2, inputText: 'r' } as any)).text).toBe('tar')
})
