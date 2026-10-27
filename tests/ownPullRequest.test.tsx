import { expect, mock, test } from 'claude-code/testing'
import { withLinearGit, withStoredLinear } from './linearConfig'

// TKT-2428: a ticket session whose first `gh pr view` failed (a timeout, or a load a hot reload cut short) never read
// its pull request again, so its deck had no REVIEW box and its status file no step. It now tries again a minute later.
const CWD = '/wt/tkt-2428'
const STATE = '/state/tower'
const TICKET_ENV = { TOWER_ROLE: 'ticket', TOWER_TICKET: 'TKT-2428', TOWER_REPO: '/repo', HOME: '/home/test', TOWER_STATE_DIR: STATE }
const pr = (isDraft: boolean) => JSON.stringify({ number: 2408, state: 'OPEN', isDraft, reviewDecision: '', statusCheckRollup: [], url: 'u', headRefOid: 'abc', comments: [] })

/** A ticket session in its worktree (phase implementing); gh throws until `answer` is set. */
function ticketSession(on: any) {
  mock.env(on, TICKET_ENV)
  const clock = mock.clock(on, { now: 1_000_000 })
  const world = { answer: null as string | null, gh: 0, written: {} as Record<string, string> }
  mock.store(on)
  on('session.start', async (_$: unknown, e: any) => e)
  on('command.register' as any, async () => ({ value: undefined }) as any)
  on('session.cwd' as any, async () => ({ value: CWD }) as any)
  on('session.id' as any, async () => ({ value: 's1' }) as any)
  on('fs.read', withStoredLinear('/repo', async (_$: unknown, e: any) => (e.path === `${CWD}/.work/state.json` ? { value: JSON.stringify({ phase: 'implementing' }) } : { deny: `ENOENT: ${e.path}` }) as any))
  on('fs.write', async (_$: unknown, e: any) => {
    world.written[e.path] = e.text
    return { value: undefined } as any
  })
  on('process.run', withLinearGit('/repo', async (_$: unknown, e: any) => {
    // Only the pull request read counts (`gh pr view --json number,…`); the deck's other gh reads answer empty.
    if (e.argv[0] !== 'gh' || !String(e.argv[4] ?? '').startsWith('number,')) return { value: { exitCode: 0, stdout: '', stderr: '' } } as any
    world.gh += 1
    if (world.answer === null) return { deny: 'timed out after 15000 ms' } as any
    return { value: { exitCode: 0, stdout: world.answer, stderr: '' } } as any
  }))
  return { clock, world }
}

const statusOf = (world: { written: Record<string, string> }) => JSON.parse(world.written[`${STATE}/sessions/s1.json`] ?? 'null')

for (const [draft, next] of [[false, '/review 2408'], [true, '/open-pr']] as const) {
  test(`a failed gh read is tried again: REVIEW box and next step for a ${draft ? 'draft' : 'open'} PR`, async ($, on) => {
    const { clock, world } = ticketSession(on)
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as any)
    expect(world.gh).toBe(1)
    expect(statusOf(world)?.ticket).toBe('TKT-2428')
    world.answer = pr(draft)
    await clock.advance(65_000)
    expect(world.gh).toBe(2)
    const status = statusOf(world)
    expect(status.next).toBe(next)
    expect(status.ready).toBe(draft ? undefined : 'review')
    const deck = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'deck', props: { bodyColumns: 66 } } as any)
    expect(await deck.find({ type: 'Text', text: /^REVIEW$/ })).toBeDefined()
    await deck.unmount()
  })
}
