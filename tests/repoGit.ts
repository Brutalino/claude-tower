// A Git repository rail for the tests (decision 054): an oink-like repository with a stored `github` configuration, its
// open issues from a fake `gh issue list`, one issue in progress (worktree, state file `review` with its checks on the
// head, PR #30 with a review round asking for fixes), a legacy branch worktree and a release tag build-14 (decision
// 055). Mirrors tools/fixture-github.sh.

import { mock } from 'claude-code/testing'

import { OINK_CONFIG } from '../hooks/core/configs/examples/oink'

export const REPO = '/r/oink'
export const HOME = '/home/test'
export const STATE = '/state/tower'
export const STORED = `${STATE}/projects/-r-oink.json`
export const IN_PROGRESS = `${HOME}/tower-work/oink/26-start-day-duplicates`
export const LEGACY = '/r/oink-crash-restore'
export const BRANCH = 'fix/26-start-day-duplicates'

/** The stored configuration: oink's, its main checkout here, worktrees under `~/tower-work/{repo}`. */
export function storedConfig(): any {
  const config = JSON.parse(JSON.stringify(OINK_CONFIG))
  config.project = { ...config.project, repo: 'fixture/oink', mainCheckout: REPO }
  config.tickets.repo = 'fixture/oink'
  config.worktree.pathTemplate = '~/tower-work/{repo}/{n}-{slug}'
  return config
}

const issue = (number: number, title: string, labels: string[], assignees: string[], body: string) =>
  ({ number, title, labels: labels.map(name => ({ name })), assignees: assignees.map(login => ({ login })), updatedAt: '2026-10-12T09:00:00Z', body, url: `https://github.com/fixture/oink/issues/${number}` })

export const ISSUES = [
  issue(35, 'Totals wrong after midnight', ['bug'], ['fixture-dev'], 'The day total keeps yesterday\'s expenses after midnight.'),
  issue(34, 'Export to CSV', ['enhancement'], [], 'Export the month\'s expenses as a CSV file.'),
  issue(33, 'Crash on restore', ['bug', 'testflight'], [], '**Steps.** Restore a backup on TestFlight build 41.\n\n**Expected.** The app opens.'),
  issue(26, 'Start day duplicates', ['bug'], ['fixture-dev'], 'Starting a day twice duplicates its entries.'),
]

const REVIEW = '## Review (round 1)\n\nThe duplicate check misses the second tap.\n\nVerdict: fixes needed'

/** #26's head commit, the PR's headRefOid. */
export const HEAD_26 = 'b260000000000000000000000000000000000000'

/** #26's state file: `review`, with its checks recorded on the head (decision 055); `stale`: on an earlier commit. */
export function stateFile26(checks: 'fresh' | 'stale' | 'none' = 'fresh'): string {
  const recorded = checks === 'none' ? {} : { checks: { sha: checks === 'fresh' ? HEAD_26 : 'a110000000000000000000000000000000000000', at: '2026-10-12T09:30:00Z', ran: ['unit', 'ui-smoke'] } }
  return JSON.stringify({ phase: 'review', next: 'fix the review round 1', ...recorded })
}

/** The last release tag (decision 055): build-14, three days before the tests' now, 6 commits on main since. */
export const RELEASE_TAG = `build-14\t${Date.parse('2026-10-09T12:00:00Z') / 1000}\n`

export const PULL_REQUEST = {
  number: 30, state: 'OPEN', isDraft: false, reviewDecision: '', url: 'https://github.com/fixture/oink/pull/30', headRefOid: HEAD_26,
  comments: [{ body: REVIEW, createdAt: '2026-10-12T10:00:00Z' }], mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviews: [],
  updatedAt: '2026-10-12T10:00:00Z', createdAt: '2026-10-11T10:00:00Z', baseRefName: 'main',
}

export const PORCELAIN = [
  `worktree ${REPO}`, 'HEAD a000000000000000000000000000000000000000', 'branch refs/heads/main', '',
  `worktree ${IN_PROGRESS}`, 'HEAD b260000000000000000000000000000000000000', `branch refs/heads/${BRANCH}`, '',
  `worktree ${LEGACY}`, 'HEAD c000000000000000000000000000000000000000', 'branch refs/heads/fix/crash-restore', '',
].join('\n')

/** `gh api graphql`'s answer (decision 077): each issue number with its blockers `[number, state, nameWithOwner]`. */
export function blockedAnswer(issues: Record<number, [number, string, string][]>): unknown {
  return { data: { repository: { issues: { nodes: Object.entries(issues).map(([number, blockers]) => ({
    number: Number(number), blockedBy: { nodes: blockers.map(([n, state, repo]) => ({ number: n, state, repository: { nameWithOwner: repo } })) },
  })) } } } }
}

export type Calls = { argv: string[][]; tmux: string[][] }

/** The rail session's engine for the repository: env, files, git, gh and tmux faked; every process call recorded. */
export function repoGitRail(on: any, extra: {
  files?: Record<string, string>; centre?: string; /** Status file names in `<state>/sessions`. */ sessions?: string[]
  /** The worktree listing and the open issues, instead of the defaults. */
  porcelain?: string; issues?: unknown[]
  /** `gh api graphql`'s answer for the issues' blockers (decision 077); without it gh answers nothing (no blockers). */
  blocked?: unknown
  /** More environment (TOWER_TMUX_SOCKET, …). */
  env?: Record<string, string>
} = {}): Calls {
  mock.env(on, { TOWER_ROLE: 'rail', TOWER_REPO: REPO, TOWER_PLUGIN_DIR: '/plugins/tower', HOME, TMUX_PANE: '%0', TOWER_STATE_DIR: STATE, ...extra.env })
  mock.clock(on, { now: Date.parse('2026-10-12T12:00:00Z') })
  mock.store(on)
  const files: Record<string, string> = {
    [STORED]: JSON.stringify(storedConfig()),
    [`${IN_PROGRESS}/.work/state.json`]: stateFile26(),
    [`${REPO}/.claude/skills/start-ticket/SKILL.md`]: '---\nname: start-ticket\ndescription: Plan an issue in its worktree\n---\n',
    [`${REPO}/.claude/skills/review-pr/SKILL.md`]: '---\nname: review-pr\ndescription: Review a pull request\n---\n',
    ...extra.files,
  }
  const calls: Calls = { argv: [], tmux: [] }
  // `git worktree add -b <branch> <path> <base>` adds the worktree to the listing.
  let porcelain = extra.porcelain ?? PORCELAIN
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.cwd' as any, async () => ({ value: REPO }) as any)
  on('command.register' as any, async () => ({ value: undefined }) as any)
  on('command.list', async () => ({ value: [] }) as any)
  on('fs.write', async () => ({ value: undefined }) as any)
  on('fs.exists', async (_$: unknown, e: any) => ({ value: e.path in files || porcelain.includes(`worktree ${e.path}\n`) }) as any)
  on('fs.list', async (_$: unknown, e: any) => ({ value: e.path === `${REPO}/.claude/skills` ? [{ name: 'start-ticket', kind: 'directory' }, { name: 'review-pr', kind: 'directory' }]
    : e.path === `${STATE}/sessions` ? (extra.sessions ?? []).map(name => ({ name, kind: 'file' })) : [] }) as any)
  on('fs.read', async (_$: unknown, e: any) => (files[e.path] !== undefined ? { value: files[e.path] } : { deny: `ENOENT: ${e.path}` }) as any)
  on('process.run', async (_$: unknown, e: any) => {
    const argv: string[] = [...e.argv]
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as any
    if (argv[0] === 'tmux') {
      calls.tmux.push(argv)
      return ok(argv[1] === 'display-message' ? '@0' : argv[1] === 'list-panes' ? `%0\t@0\trail\t\t${extra.centre ?? ''}` : argv[1] === 'split-window' ? '%5' : '')
    }
    calls.argv.push(argv)
    const line = argv.join(' ')
    if (line === 'git worktree list --porcelain') return ok(porcelain)
    if (argv[0] === 'git' && argv[1] === 'worktree' && argv[2] === 'add') {
      porcelain += `\n\nworktree ${argv[5]}\nHEAD d000000000000000000000000000000000000000\nbranch refs/heads/${argv[4]}\n`
      return ok('')
    }
    if (argv[0] === 'git' && argv[1] === 'rev-parse' && argv[2] === '--verify') return { value: { exitCode: 1, stdout: '', stderr: '' } } as any
    if (line === 'git remote get-url origin') return ok('https://github.com/fixture/oink.git\n')
    if (line === 'gh api user') return ok(JSON.stringify({ login: 'fixture-dev', id: 1 }))
    if (argv[0] === 'gh' && argv[1] === 'issue' && argv[2] === 'list') return ok(JSON.stringify(extra.issues ?? ISSUES))
    if (argv[0] === 'gh' && argv[1] === 'api' && argv[2] === 'graphql' && extra.blocked !== undefined) return ok(JSON.stringify(extra.blocked))
    if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'list') return ok(JSON.stringify(argv[4] === BRANCH ? [PULL_REQUEST] : []))
    if (argv[0] === 'git' && argv[1] === 'tag' && argv[2] === '--list' && argv[3] === 'build-*') return ok(RELEASE_TAG)
    if (line === 'git rev-list --count build-14..origin/main') return ok('6\n')
    if (argv[0] === 'git' && argv[1] === 'rev-list') return ok('0\n')
    return ok('')
  })
  return calls
}

/**
 * A drawn tree as plain text lines, roughly as a terminal shows it: a column Box stacks its children, a row Box puts
 * them side by side (each padded to its `width` or widest line), a Text and a Button's label as they read.
 */
export function textLines(node: unknown): string[] {
  if (typeof node === 'string' || typeof node === 'number') return String(node).split('\n')
  if (node === null || typeof node !== 'object') return []
  const element = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  const props = element.props ?? {}
  const children = (element.children ?? (props.children as unknown[] | undefined) ?? []) as unknown[]
  const list = Array.isArray(children) ? children : [children]
  // A Button with children draws them in its label's place (strings and Text), as the engine does.
  if (element.type === 'Button') return list.length > 0 ? [list.map(child => textLines(child).join('\n')).join('')] : [String(props.label ?? '')]
  if (element.type === 'Text') return [list.map(child => textLines(child).join('\n')).join('')].join('').split('\n')
  if (element.type === 'Box' && props.position === 'absolute') return []
  const parts = list.map(textLines).filter(lines => lines.length > 0)
  if (element.type === 'Box' && props.flexDirection === 'row') {
    const widths = parts.map((lines, index) => (typeof (list.filter(child => textLines(child).length > 0)[index] as { props?: { width?: unknown } })?.props?.width === 'number'
      ? (list.filter(child => textLines(child).length > 0)[index] as { props: { width: number } }).props.width
      : Math.max(0, ...lines.map(line => Array.from(line).length))))
    const rows = Math.max(0, ...parts.map(lines => lines.length))
    return Array.from({ length: rows }, (_, row) => parts.map((lines, index) => {
      const text = lines[row] ?? ''
      return index === parts.length - 1 ? text : text + ' '.repeat(Math.max(0, (widths[index] ?? 0) - Array.from(text).length))
    }).join('').replace(/\s+$/, ''))
  }
  return parts.flat()
}
