import { expect, mock, test } from 'claude-code/testing'

// Decision 082: the person says no to the rewritten merge: nothing runs, and the model reads that the command was changed
// to --merge, not that it ran.

const TICKET_ENV = { TOWER_ROLE: 'ticket', TOWER_TICKET: 'TKT-1', TOWER_REPO: '/repo', HOME: '/home/test' }

test('a rewritten merge the person declines: not run, the model told it was changed', async ($, on) => {
  mock.env(on, TICKET_ENV)
  mock.clock(on, { now: 1_000_000 })
  on('fs.write', async () => ({ value: undefined }) as any)
  on('session.id', async () => ({ value: 's1' }))
  on('session.cwd', async () => ({ value: '/repo' }))
  const asked: string[] = []
  const ran: string[] = []
  on('tool.check', async () => ({ decision: 'allow' }) as any)
  on('classic.PermissionRequest', async (_$: unknown, e: any) => {
    asked.push(e.tool_input.command)
    return { decision: { behavior: 'deny', message: 'no' } } as any
  })
  on('tool.call', async (_$: unknown, e: any) => {
    ran.push(e.command)
    return { result: { stdout: 'merged', stderr: '', interrupted: false } } as any
  })
  const result: any = await $.tool.call({ tool: 'Bash', command: 'gh pr merge 7 -s', tool_use_id: 'tu_d' } as any)
  expect(asked).toEqual(['gh pr merge 7 --merge'])
  expect(ran).toEqual([])
  expect(result.isError).toBe(true)
  expect(result.context).toEqual(['Tower changed it to --merge before it was asked or run (pull requests are merged only with --merge).'])
})
