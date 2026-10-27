import { expect, mock, test } from 'claude-code/testing'

// Decision 082 with the `safety` setting off: no rule applies, so a squash merge runs as the model wrote it.

const HOME = '/home/test'
const TICKET_ENV = { TOWER_ROLE: 'ticket', TOWER_TICKET: 'TKT-1', TOWER_REPO: '/repo', HOME }

test('safety off: a squash merge is neither rewritten nor blocked', async ($, on) => {
  mock.env(on, TICKET_ENV)
  mock.clock(on, { now: 1_000_000 })
  on('fs.read', async (_$: unknown, e: any) => (e.path === `${HOME}/.claude/tower/settings.json` ? { value: JSON.stringify({ safety: 'off' }) } : { deny: `ENOENT: ${e.path}` }) as any)
  on('fs.write', async () => ({ value: undefined }) as any)
  on('session.id', async () => ({ value: 's1' }))
  on('session.cwd', async () => ({ value: '/repo' }))
  const commands: string[] = []
  on('tool.call', async (_$: unknown, e: any) => {
    commands.push(e.command)
    return { result: { stdout: 'merged', stderr: '', interrupted: false } } as any
  })
  const result: any = await $.tool.call({ tool: 'Bash', command: 'gh pr merge 105 --squash --delete-branch', tool_use_id: 'tu_off' } as any)
  expect(commands).toEqual(['gh pr merge 105 --squash --delete-branch'])
  expect(result.deny).toBeUndefined()
  expect(result.context).toBeUndefined()
})
