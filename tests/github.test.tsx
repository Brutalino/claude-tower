import { expect, test } from 'claude-code/testing'

import { parseRailInput } from '../hooks/core/boardFilter'
import { ticketIdPattern, ticketInput, validateConfig, type GithubTickets, type TowerConfig } from '../hooks/core/config'
import { parsePullRequestList } from '../hooks/core/detail'
import { GH_BLOCKED_QUERY, ghError, githubBlockedArgs, githubIssueArgs, issueKind, labelColour, labelTone, parseGhLogin, parseGithubBlocked, parseGithubIssues } from '../hooks/core/github'
import { railRow } from '../hooks/core/rail'
import { theme } from '../hooks/core/theme'
import { parseWorkState } from '../hooks/core/workState'
import { otherWorktrees, parseWorktreePorcelain, ticketIdFromBranch, ticketWorktrees, worktreeKey, worktreeTicketId } from '../hooks/core/worktrees'
import { blockedAnswer, BRANCH, ISSUES, PORCELAIN, PULL_REQUEST, REPO, repoGitRail, storedConfig } from './repoGit'

// Decision 054: GitHub issues as tickets.

function config(): TowerConfig {
  const result = validateConfig(storedConfig())
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result.config
}

function tickets(): GithubTickets {
  const own = config().tickets
  if (own.kind !== 'github') throw new Error('github tickets')
  return own
}

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '' })

test('gh issue list: the open issues as tickets #n, the person\'s first, body as description, no story or relations', async () => {
  expect(githubIssueArgs(tickets())).toEqual(['issue', 'list', '--repo', 'fixture/oink', '--state', 'open', '--limit', '100', '--json', 'number,title,labels,assignees,updatedAt,body,url'])
  const parsed = parseGithubIssues(ok(JSON.stringify(ISSUES)), 'Fixture-Dev', tickets())
  if ('error' in parsed) throw new Error(parsed.error)
  expect(parsed.issues.map(issue => [issue.id, issue.assignedToMe])).toEqual([['#35', true], ['#26', true], ['#34', false], ['#33', false]])
  const crash = parsed.issues.find(issue => issue.id === '#33')
  expect(crash).toEqual({
    id: '#33', title: 'Crash on restore', description: ISSUES[2]!.body, priority: 'none', branchName: '', url: 'https://github.com/fixture/oink/issues/33',
    stateName: 'open', stateType: 'open', labels: ['bug', 'testflight'], assignedToMe: false, story: null, blockedBy: [], children: [],
  })
  // Someone else's issue carries their login; without a login nothing is mine, and gh's order stays.
  const theirs = parseGithubIssues(ok(JSON.stringify([{ number: 9, title: 't', labels: [], assignees: [{ login: 'ana' }], body: '', url: '' }])), 'fixture-dev', tickets())
  expect('issues' in theirs ? theirs.issues[0]?.assigneeName : null).toBe('ana')
  const anonymous = parseGithubIssues(ok(JSON.stringify(ISSUES)), null, { ...tickets(), mineFirst: false })
  expect('issues' in anonymous ? anonymous.issues.map(issue => issue.id) : []).toEqual(['#35', '#34', '#33', '#26'])
  // Failures: gh's first error line; not JSON; not a list.
  expect(parseGithubIssues({ exitCode: 1, stdout: '', stderr: '\nHTTP 404: Not Found\nmore' }, null, tickets())).toEqual({ error: 'gh: HTTP 404: Not Found' })
  expect(parseGithubIssues(ok('nope'), null, tickets())).toEqual({ error: 'gh answered something that is not JSON' })
  expect(parseGithubIssues(ok('{}'), null, tickets())).toEqual({ error: 'gh answered without issues' })
  expect(ghError({ exitCode: 4, stderr: '' })).toBe('gh: exited with 4')
  expect(parseGhLogin('{"login":"fixture-dev","id":1}')).toBe('fixture-dev')
  expect(parseGhLogin('{}')).toBeNull()
  expect(parseGhLogin('<html>')).toBeNull()
})

test('gh api graphql: each open issue\'s open blockers (decision 077), #n here, owner/repo#n elsewhere; any failure none', async () => {
  expect(githubBlockedArgs(tickets())).toEqual(['api', 'graphql', '-f', `query=${GH_BLOCKED_QUERY}`, '-f', 'owner=fixture', '-f', 'name=oink'])
  expect(GH_BLOCKED_QUERY).toContain('repository(owner: $owner, name: $name)')
  expect(GH_BLOCKED_QUERY).toContain('issues(states: OPEN, first: 100, orderBy: { field: UPDATED_AT, direction: DESC })')
  expect(GH_BLOCKED_QUERY).toContain('blockedBy(first: 50) { nodes { number state repository { nameWithOwner } } }')
  // Open blockers only; the repository's name case aside; another repository's with its name; an issue without one absent.
  const answer = blockedAnswer({
    33: [[38, 'OPEN', 'fixture/oink'], [12, 'CLOSED', 'fixture/oink'], [40, 'OPEN', 'Fixture/Oink'], [7, 'OPEN', 'fixture/other']],
    34: [[11, 'CLOSED', 'fixture/oink']],
    35: [],
  })
  const blocked = parseGithubBlocked(ok(JSON.stringify(answer)), tickets())
  expect([...blocked]).toEqual([[33, ['#38', '#40', 'fixture/other#7']]])
  // Failures: gh's exit, not JSON, GraphQL's errors (with partial data too), no issues.
  expect(parseGithubBlocked({ exitCode: 1, stdout: JSON.stringify(answer) }, tickets()).size).toBe(0)
  expect(parseGithubBlocked(ok('nope'), tickets()).size).toBe(0)
  expect(parseGithubBlocked(ok(JSON.stringify({ ...(answer as object), errors: [{ message: 'Field \'blockedBy\' doesn\'t exist' }] })), tickets()).size).toBe(0)
  expect(parseGithubBlocked(ok(JSON.stringify({ errors: [{ message: 'Could not resolve to a Repository' }], data: { repository: null } })), tickets()).size).toBe(0)
  expect(parseGithubBlocked(ok('{}'), tickets()).size).toBe(0)
  expect(parseGithubBlocked(ok('[]'), tickets()).size).toBe(0)
  // gh issue list's issues take them by number; the others none.
  const parsed = parseGithubIssues(ok(JSON.stringify(ISSUES)), 'fixture-dev', tickets(), blocked)
  if ('error' in parsed) throw new Error(parsed.error)
  expect(parsed.issues.map(issue => [issue.id, issue.blockedBy])).toEqual([['#35', []], ['#26', []], ['#34', []], ['#33', ['#38', '#40', 'fixture/other#7']]])
})

test('a ticket\'s kind from its labels, and its label chips by the theme\'s roles', async () => {
  const rule = tickets().labels
  expect(issueKind(['testflight', 'Bug'], rule)).toBe('fix')
  expect(issueKind(['enhancement'], rule)).toBe('feature')
  expect(issueKind([], rule)).toBe('feature')
  expect(['bug', 'enhancement', 'testflight', 'question'].map(labelTone)).toEqual(['error', 'accent', 'cool', 'dim'])
  const claude = theme('claude')
  expect(labelColour('error', claude)).toBe(claude.error)
  expect(labelColour('accent', claude)).toBe(claude.accent)
  expect(labelColour('cool', claude)).toBe(claude.models.sonnet)
  expect(labelColour('dim', claude)).toBeUndefined()
  // The terminal theme: its own theme keys.
  expect(labelColour('cool', theme('terminal'))).toBe('ide')
})

test('ticket identity: #n from the branch (fix/ or feature/), else from the folder; the rail prompt reads 27 and #27', async () => {
  const id = ticketIdPattern(tickets())
  expect(ticketIdFromBranch(BRANCH, id)).toBe('#26')
  expect(ticketIdFromBranch('feature/40-csv-export', id)).toBe('#40')
  expect(ticketIdFromBranch('fix/crash-restore', id)).toBeNull()
  expect(ticketIdFromBranch('trial/27-maestro', id)).toBeNull()
  const entries = parseWorktreePorcelain(PORCELAIN)
  expect(ticketWorktrees(entries, id).map(entry => worktreeKey(entry, id))).toEqual(['#26'])
  expect(otherWorktrees(entries, id).map(entry => [worktreeKey(entry, id), entry.branch])).toEqual([['fix/crash-restore', 'fix/crash-restore']])
  // A folder named for its issue on a branch that does not say it.
  const byFolder = parseWorktreePorcelain('worktree /r/oink\nHEAD a\nbranch refs/heads/main\n\nworktree /w/27-ui-testing\nHEAD b\nbranch refs/heads/trial/maestro\n')
  expect(worktreeTicketId(byFolder[1]!, id)).toBe('#27')
  expect(railRow(entries[1]!, parseWorkState('{"phase":"review"}', config().phases), null, id)).toMatchObject({ key: '#26', branch: BRANCH, phase: 'review' })
  const input = ticketInput(tickets())
  expect(parseRailInput('27', input)).toEqual({ kind: 'ticket', id: '#27' })
  expect(parseRailInput('#27', input)).toEqual({ kind: 'ticket', id: '#27' })
  expect(parseRailInput('crash', input)).toEqual({ kind: 'filter', text: 'crash' })
  // A github configuration names both patterns.
  const raw = storedConfig()
  delete raw.tickets.folderPattern
  raw.tickets.idPattern = { source: '(', flags: '' }
  const bad = validateConfig(raw)
  expect(bad.ok ? [] : bad.errors.map(error => error.split(':')[0])).toEqual(['tickets', 'tickets.idPattern'])
})

test('gh pr list --head: the branch\'s open pull request read as gh pr view would be; none for an empty list', async () => {
  const review = config().review
  const pr = parsePullRequestList(ok(JSON.stringify([{ ...PULL_REQUEST, number: 12, state: 'CLOSED' }, PULL_REQUEST])), review)
  expect(pr).toMatchObject({ kind: 'pr', number: 30, state: 'open', rounds: 1, reviewBlockers: 1, green: false })
  expect(parsePullRequestList(ok(JSON.stringify([{ ...PULL_REQUEST, state: 'MERGED' }])), review)).toMatchObject({ kind: 'pr', state: 'merged' })
  expect(parsePullRequestList(ok('[]'), review)).toEqual({ kind: 'none' })
  expect(parsePullRequestList(ok('nope'), review)).toEqual({ kind: 'error', message: 'gh answered something that is not JSON' })
  expect(parsePullRequestList({ exitCode: 1, stdout: '', stderr: 'HTTP 401' }, review)).toEqual({ kind: 'error', message: 'HTTP 401' })
  expect(parsePullRequestList(null, review)).toEqual({ kind: 'unavailable' })
})

test('the rail of a github configuration reads gh issue list and gh api user, and each worktree\'s PR by its branch', async ($, on) => {
  const calls = repoGitRail(on)
  await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as any)
  const rail = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 40 } } as any)
  await rail.press({ key: 'refresh' })
  const gh = calls.argv.filter(argv => argv[0] === 'gh')
  expect(gh).toContainEqual(['gh', 'api', 'user'])
  expect(gh).toContainEqual(['gh', 'issue', 'list', '--repo', 'fixture/oink', '--state', 'open', '--limit', '100', '--json', 'number,title,labels,assignees,updatedAt,body,url'])
  expect(gh.find(argv => argv[1] === 'pr')?.slice(0, 7)).toEqual(['gh', 'pr', 'list', '--head', BRANCH, '--state', 'all'])
  // Never gh pr view, and nothing that writes to GitHub.
  expect(gh.some(argv => argv[2] === 'view')).toBe(false)
  // Decision 077: the blockers' read is a GraphQL query (no mutation).
  expect(gh).toContainEqual(['gh', ...githubBlockedArgs(tickets())])
  expect(gh.every(argv => ['list', 'user', 'graphql'].includes(argv[2] ?? ''))).toBe(true)
  expect(gh.filter(argv => argv[2] === 'graphql').every(argv => argv.some(arg => arg.startsWith('query=query(')) && !argv.some(arg => /mutation/.test(arg)))).toBe(true)
  expect((await rail.find({ key: 'row:#26' }))?.text).toContain('#26')
  await rail.unmount()
})
