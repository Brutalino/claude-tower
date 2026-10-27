import { expect, mock, test } from 'claude-code/testing'
import { withLinearGit, withStoredLinear } from './linearConfig'

// Decision 044: the flightdeck's PR box, right above REVIEW, for the ticket's own open or draft pull request.
const CWD = '/wt/tkt-2428'
const STATE = '/state/tower'
const TICKET_ENV = { TOWER_ROLE: 'ticket', TOWER_TICKET: 'TKT-2428', TOWER_REPO: '/repo', HOME: '/home/test', TOWER_STATE_DIR: STATE }
const ROLLUP = [
  { name: 'ci / lint', status: 'COMPLETED', conclusion: 'SUCCESS' },
  { name: 'ci / unit-tests', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://x/run/1' },
]
const pr = (isDraft: boolean) => JSON.stringify({ number: 2408, state: 'OPEN', isDraft, reviewDecision: '', statusCheckRollup: ROLLUP, url: 'u', headRefOid: 'abc', comments: [], mergeable: 'MERGEABLE', baseRefName: 'staging' })

function ticketSession(on: any, answer: string) {
  mock.env(on, TICKET_ENV)
  mock.clock(on, { now: Date.parse('2026-10-09T12:00:00Z') })
  mock.store(on)
  const filled: string[] = []
  on('session.start', async (_$: unknown, e: any) => e)
  on('command.register' as any, async () => ({ value: undefined }) as any)
  on('session.cwd' as any, async () => ({ value: CWD }) as any)
  on('session.id' as any, async () => ({ value: 's1' }) as any)
  on('fs.read', withStoredLinear('/repo', async (_$: unknown, e: any) => (e.path === `${CWD}/.work/state.json` ? { value: JSON.stringify({ phase: 'implementing' }) } : { deny: `ENOENT: ${e.path}` }) as any))
  on('fs.write', async () => ({ value: undefined }) as any)
  on('prompt.fill' as any, async (_$: unknown, e: any) => {
    filled.push(e.text)
    return { isFilled: true } as any
  })
  on('process.run', withLinearGit('/repo', async (_$: unknown, e: any) => {
    if (e.argv[0] !== 'gh' || !String(e.argv[4] ?? '').startsWith('number,')) return { value: { exitCode: 0, stdout: '', stderr: '' } } as any
    return { value: { exitCode: 0, stdout: answer, stderr: '' } } as any
  }))
  return { filled }
}

test('the PR box: verdict, checklist failures first, fix CI; REVIEW line 1 without the verdict', async ($, on) => {
  const { filled } = ticketSession(on, pr(false))
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as any)
  const deck = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'deck', props: { bodyColumns: 66 } } as any)
  const box = await deck.find({ key: 'pr' })
  expect(box).toBeDefined()
  expect(await deck.find({ type: 'Text', text: /^PR #2408$/ })).toBeDefined()
  expect(await deck.find({ type: 'Text', text: /^BLOCKED 2$/ })).toBeDefined()
  const text = box!.text
  // Failures first: the failing check, the missing self-review, then what is fine.
  expect(text.indexOf('✗ ci / unit-tests')).toBeGreaterThan(-1)
  expect(text.indexOf('✗ ci / unit-tests')).toBeLessThan(text.indexOf('✗ no self-review yet'))
  expect(text.indexOf('✗ no self-review yet')).toBeLessThan(text.indexOf('· checks 1/2 passed'))
  expect(text).toContain('✓ no conflict with staging')
  // REVIEW keeps its own state; the verdict lives in the PR box only.
  const review = await deck.find({ key: 'review' })
  expect(review?.text).toContain('no review yet')
  expect(review?.text).not.toContain('BLOCKED')
  expect(await deck.find({ key: 'review:f' })).toBeUndefined()
  await deck.press({ key: 'pr:f' })
  expect(filled[0]).toContain('CI check "ci / unit-tests" failed on PR #2408: https://x/run/1.')
  await deck.unmount()
})

test('a draft PR: DRAFT dim, the box still drawn above REVIEW', async ($, on) => {
  ticketSession(on, pr(true))
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as any)
  const deck = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'deck', props: { bodyColumns: 66 } } as any)
  expect(await deck.find({ type: 'Text', text: /^DRAFT$/ })).toBeDefined()
  expect(await deck.find({ type: 'Text', text: /^REVIEW$/ })).toBeDefined()
  await deck.unmount()
})
