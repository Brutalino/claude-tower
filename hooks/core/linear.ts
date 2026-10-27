// Reading Linear: the query, the auth header, the answer as plain issues. Decision 071: Tower's one write, the
// self-assign of a ticket promoted from the candidates (`issueUpdate` with the person as assignee; nothing else changes).

import type { TowerIssue, TowerIssueRef } from '../../types/index'

export const LINEAR_URL = 'https://api.linear.app/graphql'

/** One issue as Tower reads it: the candidates' query and the rail's by-identifier query (decision 067) ask the same fields. */
const ISSUE_FIELDS = `id identifier title description priority branchName url
      state { name type } labels { nodes { name } } assignee { isMe displayName }
      parent { identifier title state { name type } children(first: 25) { nodes { identifier title state { name type } assignee { isMe } } } }
      children(first: 25) { nodes { identifier title state { name type } inverseRelations(first: 10) { nodes { type issue { identifier } } } } }
      relations(first: 25) { nodes { type relatedIssue { identifier title state { name type } } } }
      inverseRelations(first: 25) { nodes { type issue { identifier title state { name type } } } }`

export const LINEAR_QUERY = `query CandidateIssues {
  issues(first: 50 filter: { or: [
    { and: [ { state: { type: { in: ["backlog", "unstarted"] } } } { assignee: { null: true } } { labels: { name: { containsIgnoreCase: "bug" } } } ] }
    { and: [ { state: { type: { in: ["backlog", "unstarted", "started"] } } } { assignee: { isMe: { eq: true } } } ] }
  ] }) {
    nodes { ${ISSUE_FIELDS} } } }`

/**
 * Decision 067: the rail's tickets by identifier, whatever their state or assignee (the candidates' query stops at 50
 * and at the person's own open tickets), so each worktree's story is known. Read-only, as every query here.
 */
export const LINEAR_KEYS_QUERY = `query RailIssues($filter: IssueFilter) {
  issues(first: 100 filter: $filter) {
    nodes { ${ISSUE_FIELDS} } } }`

/** `TKT-12`, `TKT-7` → `{ or: [{ team: { key: { eq: "TKT" } }, number: { in: [12, 7] } }] }`; null when no key reads as `TEAM-<n>`. */
export function keysFilter(keys: readonly string[]): { or: { team: { key: { eq: string } }; number: { in: number[] } }[] } | null {
  const byTeam = new Map<string, number[]>()
  for (const key of keys) {
    const match = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(key.trim())
    if (match === null) continue
    const team = (match[1] as string).toUpperCase()
    const numbers = byTeam.get(team) ?? []
    if (!numbers.includes(Number(match[2]))) numbers.push(Number(match[2]))
    byTeam.set(team, numbers)
  }
  if (byTeam.size === 0) return null
  return { or: [...byTeam].map(([team, numbers]) => ({ team: { key: { eq: team } }, number: { in: numbers } })) }
}

const PRIORITIES = ['none', 'urgent', 'high', 'medium', 'low'] as const
const CLOSED = new Set(['completed', 'canceled'])

/** `Bearer …` as is, an OAuth token with `Bearer `, a personal key bare. */
export function linearAuth(key: string): string {
  const trimmed = key.trim()
  if (trimmed.startsWith('Bearer ')) return trimmed
  if (trimmed.startsWith('lin_oauth_')) return `Bearer ${trimmed}`
  return trimmed
}

type Raw = Record<string, unknown>

function record(value: unknown): Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nodes(value: unknown): Raw[] {
  const list = record(value).nodes
  return Array.isArray(list) ? list.map(record) : []
}

function stateType(issue: Raw): string {
  return text(record(issue.state).type)
}

function ref(issue: Raw): TowerIssueRef {
  // Decision 069: a story's children say whether they are the person's (only those ask for the assignee).
  const mine = record(issue.assignee).isMe === true ? { assignedToMe: true } : {}
  return { id: text(issue.identifier), title: text(issue.title), stateName: text(record(issue.state).name), stateType: stateType(issue), ...mine }
}

function toIssue(raw: Raw): TowerIssue | null {
  const id = text(raw.identifier)
  if (id === '') return null
  const parent = record(raw.parent)
  const blockers = nodes(raw.inverseRelations)
    .filter(relation => relation.type === 'blocks')
    .map(relation => record(relation.issue))
    .filter(issue => text(issue.identifier) !== '')
    .map(ref)
  const assignee = record(raw.assignee)
  const priority = typeof raw.priority === 'number' ? PRIORITIES[raw.priority] ?? 'none' : 'none'
  return {
    id,
    ...(text(raw.id) !== '' ? { linearId: text(raw.id) } : {}),
    title: text(raw.title),
    description: text(raw.description),
    priority,
    branchName: text(raw.branchName),
    url: text(raw.url),
    stateName: text(record(raw.state).name),
    stateType: stateType(raw),
    labels: nodes(raw.labels).map(label => text(label.name)).filter(name => name !== ''),
    assignedToMe: assignee.isMe === true,
    ...(assignee.isMe !== true && text(assignee.displayName) !== '' ? { assigneeName: text(assignee.displayName) } : {}),
    story: text(parent.identifier) === '' ? null : {
      id: text(parent.identifier), title: text(parent.title), stateName: text(record(parent.state).name), stateType: stateType(parent),
      children: nodes(parent.children).filter(child => text(child.identifier) !== '').map(ref),
    },
    blockedBy: blockers.filter(issue => !CLOSED.has(issue.stateType)).map(issue => issue.id),
    blockers,
    blocks: nodes(raw.relations)
      .filter(relation => relation.type === 'blocks')
      .map(relation => record(relation.relatedIssue))
      .filter(issue => text(issue.identifier) !== '')
      .map(ref),
    children: nodes(raw.children)
      .filter(child => text(child.identifier) !== '')
      .map(child => ({
        ...ref(child),
        blockedBy: nodes(child.inverseRelations)
          .filter(relation => relation.type === 'blocks')
          .map(relation => text(record(relation.issue).identifier))
          .filter(id => id !== ''),
      })),
  }
}

const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low', 'none']

/** Assigned to me first, then started, then by priority (none last), then by identifier. */
export function orderIssues(issues: readonly TowerIssue[]): TowerIssue[] {
  const rank = (issue: TowerIssue) => [
    issue.assignedToMe ? 0 : 1,
    issue.stateType === 'started' ? 0 : 1,
    PRIORITY_ORDER.indexOf(issue.priority),
  ]
  return [...issues].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)]
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return (ra[i] ?? 0) - (rb[i] ?? 0)
    return a.id.localeCompare(b.id, undefined, { numeric: true })
  })
}

/** The answer's issues without the closed ones, ordered; or the first error. Never throws. */
export function parseLinear(answer: string): { issues: TowerIssue[] } | { error: string } {
  const parsed = parseLinearAll(answer)
  return 'error' in parsed ? parsed : { issues: orderIssues(parsed.issues.filter(issue => !CLOSED.has(issue.stateType))) }
}

/** Decision 067: the answer's issues as they are, closed ones too (the rail's by-identifier query); or the first error. Never throws. */
export function parseLinearAll(answer: string): { issues: TowerIssue[] } | { error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(answer)
  } catch {
    return { error: 'Linear answered something that is not JSON' }
  }
  const body = record(raw)
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const message = text(record(body.errors[0]).message)
    return { error: `Linear: ${message || 'unknown error'}` }
  }
  const list = record(record(body.data).issues).nodes
  if (!Array.isArray(list)) return { error: 'Linear answered without issues' }
  return { issues: list.map(node => toIssue(record(node))).filter((issue): issue is TowerIssue => issue !== null) }
}

/** Decision 071: who the API key is (`viewer { id }`), asked once before the first self-assign. */
export const LINEAR_VIEWER_QUERY = 'query Viewer { viewer { id } }'

/** Decision 071: Tower's only Linear write: the issue assigned to the person (no state, no other field). */
export const LINEAR_ASSIGN_MUTATION = 'mutation AssignToMe($id: String!, $assigneeId: String!) { issueUpdate(id: $id, input: { assigneeId: $assigneeId }) { success } }'

/** The viewer's id from LINEAR_VIEWER_QUERY's answer; null on an error or none. */
export function parseViewerId(answer: string): string | null {
  try {
    const body = record(JSON.parse(answer))
    if (Array.isArray(body.errors) && body.errors.length > 0) return null
    const id = text(record(record(body.data).viewer).id)
    return id === '' ? null : id
  } catch {
    return null
  }
}

/** Whether LINEAR_ASSIGN_MUTATION's answer says it succeeded. */
export function parseAssigned(answer: string): boolean {
  try {
    const body = record(JSON.parse(answer))
    if (Array.isArray(body.errors) && body.errors.length > 0) return false
    return record(record(body.data).issueUpdate).success === true
  } catch {
    return false
  }
}
