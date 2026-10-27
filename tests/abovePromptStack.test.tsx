import { expect, mock, test } from 'claude-code/testing'

// Decision 052: a plugin beneath Tower (cc-arcade's board) still draws above the prompt; Tower's band is last.
const TICKET_ENV = { TOWER_ROLE: 'ticket', TOWER_TICKET: 'TKT-1', TOWER_REPO: '/repo', HOME: '/home/test' }
const REVIEW_ENV = { TOWER_ROLE: 'review', TOWER_TICKET: 'TKT-1', TOWER_PR: '42', TOWER_REPO: '/repo', HOME: '/home/test' }
const SURFACES = ['terminal', 'desktop'] as const
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { bodyRows: 19 } } } as const

function session(on: any, env: Record<string, string>) {
  mock.env(on, env)
  mock.clock(on, { now: 1_000_000 })
  on('fs.write', async () => ({ value: undefined }) as any)
}

/** Core beneath every plugin: with no survey it answers its own drawing, `{ type: 'engine' }`. */
function core(on: any) {
  on('ui.render', { component: 'AbovePrompt' }, async () => ({ type: 'engine', ref: 0 }) as any)
}

/** A plugin beneath Tower that draws its own band, as cc-arcade does. */
function otherBand(on: any) {
  on('ui.render', { component: 'AbovePrompt' }, async ($: any, e: any) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text>arcade board</Text>
      </Box>
    )
  })
}

for (const surface of SURFACES) {
  const mount = ($: any) => $.ui.mount({ plugin: 'tower', surface, ...BAND } as any)

  test(`ticket: the band beneath draws above Tower's chips (${surface})`, async ($, on) => {
    session(on, TICKET_ENV)
    otherBand(on)
    const ui = await mount($)
    const drawn: any = await ui.drawn()
    expect(drawn).toMatchObject({ type: 'Box', props: { flexDirection: 'column' } })
    expect(drawn.children.map((child: any) => child.props.key)).toEqual(['others', 'tower'])
    expect(drawn.children[1].children[0]).toMatchObject({ type: 'Box', props: { width: 100, justifyContent: 'space-between' } })
    expect(await ui.find({ type: 'Text', text: /^arcade board$/ })).toBeDefined()
    expect(await ui.find({ key: 'explain' })).toBeDefined()
    await ui.unmount()
  })

  test(`ticket: with nothing beneath, Tower's chips draw alone (${surface})`, async ($, on) => {
    session(on, TICKET_ENV)
    core(on)
    const ui = await mount($)
    const drawn: any = await ui.drawn()
    expect(drawn).toMatchObject({ type: 'Box', props: { width: 100, justifyContent: 'space-between' } })
    expect(await ui.find({ key: 'explain' })).toBeDefined()
    expect(await ui.find({ key: 'others' })).toBeUndefined()
    await ui.unmount()
  })

  test(`review: the band beneath draws above the review line (${surface})`, async ($, on) => {
    session(on, REVIEW_ENV)
    otherBand(on)
    const ui = await mount($)
    const drawn: any = await ui.drawn()
    expect(drawn.children.map((child: any) => child.props.key)).toEqual(['others', 'tower'])
    const order = (await ui.findAll({ type: 'Text' })).map((found: any) => found.text)
    expect(order.indexOf('arcade board')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('arcade board')).toBeLessThan(order.indexOf('review · PR #42'))
    expect(await ui.find({ key: 'close' })).toBeDefined()
    await ui.unmount()
  })

  test(`review: with nothing beneath, the review line draws alone (${surface})`, async ($, on) => {
    session(on, REVIEW_ENV)
    core(on)
    const ui = await mount($)
    expect(await ui.drawn()).toMatchObject({ type: 'Box', props: { width: 100, justifyContent: 'space-between' } })
    await ui.unmount()
  })
}
