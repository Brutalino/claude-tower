import { expect, mock, test } from 'claude-code/testing'

// Decision 082: a squash or rebase merge runs as `--merge`: tool.check and the permission dialog see the rewritten
// command (a plain merge confirmation), the model reads a note, the deck logs `safety rewrote`. A file's tests share one
// module instance.

const TICKET_ENV = { TOWER_ROLE: 'ticket', TOWER_TICKET: 'TKT-1', TOWER_REPO: '/repo', HOME: '/home/test' }
const ANSWERED = 'Tower ran it with --merge (pull requests are merged only with --merge).'

/** What reached the engine beneath Tower's hooks: the check, the dialog (a test's PermissionRequest says yes), the tool. */
type Seen = { checked: string[]; asked: string[]; ran: string[] }

function ticketSession(on: any, seen: Seen) {
  mock.env(on, TICKET_ENV)
  mock.clock(on, { now: 1_000_000 })
  on('fs.write', async () => ({ value: undefined }) as any)
  on('session.id', async () => ({ value: 's1' }))
  on('session.cwd', async () => ({ value: '/repo' }))
  on('tool.check', async (_$: unknown, e: any) => {
    seen.checked.push(e.input.command)
    return { decision: 'allow' } as any
  })
  on('classic.PermissionRequest', async (_$: unknown, e: any) => {
    seen.asked.push(e.tool_input.command)
    return { decision: { behavior: 'allow' } } as any
  })
  on('tool.call', async (_$: unknown, e: any) => {
    seen.ran.push(e.command)
    return { result: { stdout: 'merged', stderr: '', interrupted: false } } as any
  })
}

test('a squash merge runs as --merge, asked as a merge, the model told, the deck logs it', async ($, on) => {
  const seen: Seen = { checked: [], asked: [], ran: [] }
  ticketSession(on, seen)
  const rewritten = 'gh pr merge 105 --repo Brutalino/oink --merge --delete-branch'
  const result: any = await $.tool.call({ tool: 'Bash', command: 'gh pr merge 105 --repo Brutalino/oink --squash --delete-branch', tool_use_id: 'tu_m' } as any)
  expect(seen).toEqual({ checked: [rewritten], asked: [rewritten], ran: [rewritten] })
  expect(result.isError).toBeUndefined()
  expect(result.context).toEqual([ANSWERED])
  // The check Tower answers for the rewritten command: the plain merge confirmation.
  expect(await $.tool.check({ tool: 'Bash', input: { command: rewritten } } as any)).toMatchObject({ decision: 'ask', reason: 'Tower safety: merging a pull request' })
  // A chained command: only the merge stage changes.
  await $.tool.call({ tool: 'Bash', command: 'cd /repo && gh pr merge 1 -r --delete-branch; gh pr view 1', tool_use_id: 'tu_c' } as any)
  expect(seen.ran[1]).toBe('cd /repo && gh pr merge 1 --merge --delete-branch; gh pr view 1')
  // The deck's log (calls cut to their width): `safety rewrote <the call as the model wrote it> · ran with --merge`, then
  // the ask of the rewritten one.
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'deck', props: { bodyColumns: 160, scroll: { bodyRows: 40 } } } as any)
  await ui.press({ key: 'view:log' })
  expect(await ui.find({ type: 'Text', text: /^rewrote Bash gh pr merge 105 --repo Brutalino\/oink --squash .* · ran with --merge$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^asked Bash gh pr merge 105 --repo Brutalino\/oink --merge .* · merging a pull request$/ })).toBeDefined()
  await ui.unmount()
})

test('a merge that cannot be rewritten with certainty stays blocked; --admin stays blocked', async ($, on) => {
  const seen: Seen = { checked: [], asked: [], ran: [] }
  ticketSession(on, seen)
  const quoted: any = await $.tool.call({ tool: 'Bash', command: 'gh pr merge 1 "--squash"', tool_use_id: 'tu_q' } as any)
  expect(quoted.deny).toBe('pull requests are merged only with --merge (Tower safety rule)')
  const admin: any = await $.tool.call({ tool: 'Bash', command: 'gh pr merge 1 --squash --admin', tool_use_id: 'tu_a' } as any)
  expect(admin.deny).toContain('(Tower safety rule)')
  expect(seen).toEqual({ checked: [], asked: [], ran: [] })
  // A query still reads a squash merge as blocked.
  expect(await $.tool.check({ tool: 'Bash', input: { command: 'gh pr merge 1 --squash' } } as any)).toMatchObject({ decision: 'deny', reason: 'pull requests are merged only with --merge (Tower safety rule)' })
  // A merge already with --merge passes unchanged, with no note.
  const plain: any = await $.tool.call({ tool: 'Bash', command: 'gh pr merge 2 --merge', tool_use_id: 'tu_p' } as any)
  expect(seen.ran).toEqual(['gh pr merge 2 --merge'])
  expect(plain.context).toBeUndefined()
})
