// GitHub issues as tickets (config tickets `github`, decision 054), read only: `gh issue list` and `gh api user`, the
// answers as the same issues the board draws for Linear. A GitHub issue has no priority or story; its open blockers come
// from GitHub's issue dependencies (`gh api graphql`, decision 077).

import type { TowerIssue } from '../../types/index'
import type { GithubTickets } from './config'
import type { Theme } from './theme'

/** The fields `gh issue list --json` reads. */
export const GH_ISSUE_FIELDS = 'number,title,labels,assignees,updatedAt,body,url'

/** At most this many open issues are read; gh's own default is 30 (decision 055). */
export const GH_ISSUE_LIMIT = 100

/** `gh issue list --repo <slug> --state open --limit 100 --json …`: the repository's open issues, in gh's own order. */
export function githubIssueArgs(tickets: GithubTickets): string[] {
  return ['issue', 'list', '--repo', tickets.repo, '--state', 'open', '--limit', String(GH_ISSUE_LIMIT), '--json', GH_ISSUE_FIELDS]
}

/** The open issues' blockers (GitHub's issue dependencies, decision 077): the same open issues, the newest updated first. */
export const GH_BLOCKED_QUERY = 'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { '
  + `issues(states: OPEN, first: ${GH_ISSUE_LIMIT}, orderBy: { field: UPDATED_AT, direction: DESC }) { `
  + 'nodes { number blockedBy(first: 50) { nodes { number state repository { nameWithOwner } } } } } } }'

/** `gh api graphql -f query=… -f owner=<owner> -f name=<name>`: the open issues' blockers, read only. */
export function githubBlockedArgs(tickets: GithubTickets): string[] {
  const at = tickets.repo.indexOf('/')
  const owner = at < 0 ? tickets.repo : tickets.repo.slice(0, at)
  const name = at < 0 ? '' : tickets.repo.slice(at + 1)
  return ['api', 'graphql', '-f', `query=${GH_BLOCKED_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`]
}

/** `gh api user`: the person signed in, whose issues are `mine`. */
export const GH_USER_ARGS = ['api', 'user'] as const

type Raw = Record<string, unknown>

function record(value: unknown): Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** The `login` of `gh api user`'s answer; null when it has none. */
export function parseGhLogin(answer: string): string | null {
  try {
    const login = text(record(JSON.parse(answer)).login).trim()
    return login === '' ? null : login
  } catch {
    return null
  }
}

/** `gh: <its first error line>`, the way the board tells a failed read. */
export function ghError(result: { exitCode: number; stderr: string }): string {
  const line = result.stderr.split('\n').map(one => one.trim()).find(one => one !== '')
  return `gh: ${line ?? `exited with ${result.exitCode}`}`
}

/**
 * Each open issue's open blockers by its number: `#38` in the same repository (its name case aside), `owner/repo#38` in
 * another; an issue without one is not in the map. Any failure (gh's, not JSON, GraphQL's `errors`, no issues) is an empty
 * map: the issues still show, without blockers. Never throws.
 */
export function parseGithubBlocked(result: { exitCode: number; stdout: string }, tickets: GithubTickets): Map<number, string[]> {
  const blocked = new Map<number, string[]>()
  if (result.exitCode !== 0) return blocked
  let raw: Raw
  try {
    raw = record(JSON.parse(result.stdout))
  } catch {
    return blocked
  }
  if (raw.errors !== undefined && raw.errors !== null) return blocked
  const nodes = record(record(record(raw.data).repository).issues).nodes
  if (!Array.isArray(nodes)) return blocked
  const own = tickets.repo.toLowerCase()
  for (const issue of nodes.map(record)) {
    if (typeof issue.number !== 'number') continue
    const blockers = record(issue.blockedBy).nodes
    const ids = (Array.isArray(blockers) ? blockers : []).map(record).flatMap(blocker => {
      if (typeof blocker.number !== 'number' || blocker.state !== 'OPEN') return []
      const repo = text(record(blocker.repository).nameWithOwner)
      return [repo === '' || repo.toLowerCase() === own ? `#${blocker.number}` : `${repo}#${blocker.number}`]
    })
    if (ids.length > 0) blocked.set(issue.number, ids)
  }
  return blocked
}

/**
 * The open issues as tickets (`#27`), the person's (`login` among the assignees) first when `mineFirst`, else in gh's
 * order, each with its open blockers from `blocked` (parseGithubBlocked; none without it); or the first error. Never throws.
 */
export function parseGithubIssues(result: { exitCode: number; stdout: string; stderr: string }, login: string | null, tickets: GithubTickets, blocked?: Map<number, string[]>): { issues: TowerIssue[] } | { error: string } {
  if (result.exitCode !== 0) return { error: ghError(result) }
  let raw: unknown
  try {
    raw = JSON.parse(result.stdout)
  } catch {
    return { error: 'gh answered something that is not JSON' }
  }
  if (!Array.isArray(raw)) return { error: 'gh answered without issues' }
  const me = login?.toLowerCase() ?? null
  const issues = raw.map(record).flatMap((issue): TowerIssue[] => {
    if (typeof issue.number !== 'number') return []
    const assignees = (Array.isArray(issue.assignees) ? issue.assignees : []).map(one => text(record(one).login)).filter(name => name !== '')
    const mine = me !== null && assignees.some(name => name.toLowerCase() === me)
    const other = assignees.find(name => name.toLowerCase() !== me)
    return [{
      id: `#${issue.number}`,
      title: text(issue.title),
      description: text(issue.body),
      priority: 'none',
      branchName: '',
      url: text(issue.url),
      stateName: 'open',
      stateType: 'open',
      labels: (Array.isArray(issue.labels) ? issue.labels : []).map(one => text(record(one).name)).filter(name => name !== ''),
      assignedToMe: mine,
      ...(!mine && other !== undefined ? { assigneeName: other } : {}),
      story: null,
      blockedBy: blocked?.get(issue.number) ?? [],
      children: [],
    }]
  })
  return { issues: tickets.mineFirst ? [...issues.filter(issue => issue.assignedToMe), ...issues.filter(issue => !issue.assignedToMe)] : issues }
}

/** A ticket's kind for its branch: its first label `kinds` names (`bug` → `fix`), case aside; else `defaultKind` (`feature`). */
export function issueKind(labels: readonly string[], rule: GithubTickets['labels']): string {
  const kinds = new Map(Object.entries(rule.kinds).map(([label, kind]) => [label.toLowerCase(), kind]))
  for (const label of labels) {
    const kind = kinds.get(label.toLowerCase())
    if (kind !== undefined) return kind
  }
  return rule.defaultKind
}

export type LabelTone = 'error' | 'accent' | 'cool' | 'dim'

/** A label chip's tone: `bug` the error colour, `enhancement` the accent, `testflight` a cool colour, any other dim. */
export function labelTone(label: string): LabelTone {
  const name = label.toLowerCase()
  if (name === 'bug') return 'error'
  if (name === 'enhancement') return 'accent'
  if (name === 'testflight') return 'cool'
  return 'dim'
}

/** The chip's colour by its tone, from the theme: the cool one is Sonnet's (blue, teal), else the accent; dim has none. */
export function labelColour(tone: LabelTone, colours: Theme): string | undefined {
  if (tone === 'error') return colours.error
  if (tone === 'accent') return colours.accent
  if (tone === 'cool') return colours.models.sonnet || colours.accent
  return undefined
}
