import { expect, test } from 'claude-code/testing'

import { LINEAR_ASSIGN_MUTATION, LINEAR_QUERY, LINEAR_VIEWER_QUERY, linearAuth, orderIssues, parseAssigned, parseLinear, parseViewerId } from '../hooks/core/linear'

const state = (type: string, name = type) => ({ name, type })

const SAMPLE = JSON.stringify({
  data: {
    issues: {
      nodes: [
        {
          id: 'u1', identifier: 'TKT-30', title: 'Free bug', description: 'It breaks', priority: 2, branchName: 'me/tkt-30-free-bug',
          url: 'https://linear.app/x/TKT-30', state: state('backlog', 'Backlog'), labels: { nodes: [{ name: 'Bug' }] }, assignee: null,
          parent: null, children: { nodes: [] }, relations: { nodes: [] }, inverseRelations: { nodes: [] },
        },
        {
          id: 'u2', identifier: 'TKT-12', title: 'Mine, started', priority: 4, state: state('started', 'In Progress'),
          assignee: { isMe: true },
          parent: { identifier: 'TKT-10', title: 'The story', state: state('started', 'In Progress'), children: { nodes: [
            { identifier: 'TKT-12', title: 'Mine, started', state: state('started', 'In Progress') }, { title: 'nameless' }, 7,
          ] } },
          children: { nodes: [{ identifier: 'TKT-13', title: 'Child', state: state('unstarted'), inverseRelations: { nodes: [
            { type: 'blocks', issue: { identifier: 'TKT-14' } }, { type: 'related', issue: { identifier: 'TKT-15' } },
          ] } }] },
          relations: { nodes: [
            { type: 'blocks', relatedIssue: { identifier: 'TKT-40', title: 'Waits on me', state: state('backlog', 'Backlog') } },
            { type: 'related', relatedIssue: { identifier: 'TKT-41', title: 'Related', state: state('backlog') } },
            { type: 'blocks', relatedIssue: null },
          ] },
          inverseRelations: { nodes: [
            { type: 'blocks', issue: { identifier: 'TKT-5', title: 'Open blocker', state: state('started') } },
            { type: 'blocks', issue: { identifier: 'TKT-6', title: 'Done blocker', state: state('completed') } },
            { type: 'related', issue: { identifier: 'TKT-7', title: 'Related', state: state('started') } },
          ] },
        },
        { id: 'u3', identifier: 'TKT-11', title: 'Mine, urgent', priority: 1, state: state('unstarted'), assignee: { isMe: true } },
        { id: 'u4', identifier: 'TKT-9', title: 'Canceled', priority: 1, state: state('canceled'), assignee: { isMe: true } },
        { id: 'u5', title: 'No identifier' },
      ],
    },
  },
})

test('the auth header: Bearer kept, OAuth prefixed, a personal key bare', async () => {
  expect(linearAuth(' Bearer abc ')).toBe('Bearer abc')
  expect(linearAuth('lin_oauth_xyz')).toBe('Bearer lin_oauth_xyz')
  expect(linearAuth('lin_api_123\n')).toBe('lin_api_123')
})

test('the query asks for the candidate issues', async () => {
  expect(LINEAR_QUERY.startsWith('query CandidateIssues {')).toBe(true)
  expect(LINEAR_QUERY).toContain('inverseRelations(first: 25)')
  expect(LINEAR_QUERY).toContain('parent { identifier title state { name type } children(first: 25)')
})

test('a sample answer: closed and nameless dropped, fields read, mine and started first', async () => {
  const parsed = parseLinear(SAMPLE)
  if (!('issues' in parsed)) throw new Error('expected issues')
  expect(parsed.issues.map(issue => issue.id)).toEqual(['TKT-12', 'TKT-11', 'TKT-30'])
  const [started, , free] = parsed.issues
  expect(started).toEqual({
    id: 'TKT-12', linearId: 'u2', title: 'Mine, started', description: '', priority: 'low', branchName: '', url: '',
    stateName: 'In Progress', stateType: 'started', labels: [], assignedToMe: true,
    story: { id: 'TKT-10', title: 'The story', stateName: 'In Progress', stateType: 'started', children: [
      { id: 'TKT-12', title: 'Mine, started', stateName: 'In Progress', stateType: 'started' },
    ] },
    blockedBy: ['TKT-5'],
    blockers: [
      { id: 'TKT-5', title: 'Open blocker', stateName: 'started', stateType: 'started' },
      { id: 'TKT-6', title: 'Done blocker', stateName: 'completed', stateType: 'completed' },
    ],
    blocks: [{ id: 'TKT-40', title: 'Waits on me', stateName: 'Backlog', stateType: 'backlog' }],
    children: [{ id: 'TKT-13', title: 'Child', stateName: 'unstarted', stateType: 'unstarted', blockedBy: ['TKT-14'] }],
  })
  expect(free?.labels).toEqual(['Bug'])
  expect(free?.priority).toBe('high')
  expect(free?.assignedToMe).toBe(false)
  expect(free?.story).toBe(null)
})

test('the assignee: mine, someone else by their short name, or nobody', async () => {
  expect(LINEAR_QUERY).toContain('assignee { isMe displayName }')
  const node = (identifier: string, assignee: unknown) => ({ id: identifier, identifier, title: identifier, state: { name: 'Todo', type: 'unstarted' }, assignee })
  const parsed = parseLinear(JSON.stringify({ data: { issues: { nodes: [
    node('TKT-1', { isMe: true, displayName: 'me' }), node('TKT-2', { isMe: false, displayName: 'giulia' }), node('TKT-3', null),
  ] } } }))
  if (!('issues' in parsed)) throw new Error('expected issues')
  expect(parsed.issues.map(issue => [issue.id, issue.assignedToMe, issue.assigneeName])).toEqual([['TKT-1', true, undefined], ['TKT-2', false, 'giulia'], ['TKT-3', false, undefined]])
})

test('an errors answer and garbage give an error, never a throw', async () => {
  expect(parseLinear('{"errors":[{"message":"Authentication required"}]}')).toEqual({ error: 'Linear: Authentication required' })
  expect('error' in parseLinear('<html>')).toBe(true)
  expect('error' in parseLinear('null')).toBe(true)
  expect('error' in parseLinear('{"data":{"issues":null}}')).toBe(true)
  expect(parseLinear('{"data":{"issues":{"nodes":[7,null,"x"]}}}')).toEqual({ issues: [] })
})

test('order: assigned to me, started, priority with none last, identifier', async () => {
  const issue = (id: string, assignedToMe: boolean, stateType: string, priority: 'none' | 'urgent' | 'low') => ({
    id, title: id, description: '', priority, branchName: '', url: '', stateName: '', stateType, labels: [], assignedToMe,
    story: null, blockedBy: [], children: [],
  })
  const ordered = orderIssues([
    issue('TKT-100', false, 'backlog', 'urgent'),
    issue('TKT-3', true, 'unstarted', 'none'),
    issue('TKT-20', true, 'unstarted', 'low'),
    issue('TKT-4', true, 'started', 'none'),
    issue('TKT-9', false, 'backlog', 'urgent'),
  ])
  expect(ordered.map(one => one.id)).toEqual(['TKT-4', 'TKT-20', 'TKT-3', 'TKT-9', 'TKT-100'])
})

test('decision 071: the self-assign is one issueUpdate with the person as assignee, nothing else; its answers read without a throw', () => {
  expect(LINEAR_VIEWER_QUERY).toBe('query Viewer { viewer { id } }')
  expect(LINEAR_ASSIGN_MUTATION).toBe('mutation AssignToMe($id: String!, $assigneeId: String!) { issueUpdate(id: $id, input: { assigneeId: $assigneeId }) { success } }')
  expect(parseViewerId('{"data":{"viewer":{"id":"user-1"}}}')).toBe('user-1')
  for (const answer of ['{"errors":[{"message":"no"}]}', '{"data":{"viewer":null}}', '<html>']) expect(parseViewerId(answer)).toBeNull()
  expect(parseAssigned('{"data":{"issueUpdate":{"success":true}}}')).toBe(true)
  for (const answer of ['{"data":{"issueUpdate":{"success":false}}}', '{"errors":[{"message":"forbidden"}],"data":null}', 'null', '']) expect(parseAssigned(answer)).toBe(false)
})
