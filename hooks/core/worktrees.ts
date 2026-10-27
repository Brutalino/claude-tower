// Parsing of `git worktree list --porcelain` (ported from the older tower app).

import { renderTemplate, toRegExp, type BranchConfig, type TicketIdPattern, type WorktreeConfig } from './config'

export type WorktreeEntry = {
  path: string
  head: string
  /** Null for a detached HEAD. */
  branch: string | null
  isBare: boolean
  isLocked: boolean
  isPrunable: boolean
}

/**
 * Blocks are separated by a blank line: `worktree <path>`, `HEAD <sha>`, then
 * `branch refs/heads/<name>` or `detached`, plus optional `bare`, `locked` and
 * `prunable` lines (with or without a reason).
 */
export function parseWorktreePorcelain(output: string): WorktreeEntry[] {
  const blocks = output
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(block => block.length > 0)

  const entries: WorktreeEntry[] = []
  for (const block of blocks) {
    let path: string | undefined
    let head = ''
    let branch: string | null = null
    let isBare = false
    let isLocked = false
    let isPrunable = false
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length).trim()
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length).trim()
      else if (line.startsWith('branch refs/heads/')) branch = line.slice('branch refs/heads/'.length).trim()
      else if (line === 'bare') isBare = true
      else if (line === 'locked' || line.startsWith('locked ')) isLocked = true
      else if (line === 'prunable' || line.startsWith('prunable ')) isPrunable = true
    }
    if (path !== undefined) entries.push({ path, head, branch, isBare, isLocked, isPrunable })
  }
  return entries
}

/** The linked worktrees with a usable directory: git always prints the main checkout first; bare and prunable entries are skipped. */
function linkedWorktrees(entries: WorktreeEntry[]): WorktreeEntry[] {
  return entries.slice(1).filter(entry => !entry.isBare && !entry.isPrunable)
}

/** The worktrees the rail lists as tickets: their branch (or, with a folder pattern, their folder) carries a ticket id (`idPattern`, config tickets). */
export function ticketWorktrees(entries: WorktreeEntry[], idPattern: TicketIdPattern | null): WorktreeEntry[] {
  return linkedWorktrees(entries).filter(entry => worktreeTicketId(entry, idPattern) !== null)
}

/** The other linked worktrees (detached HEAD, or a branch without a ticket id). */
export function otherWorktrees(entries: WorktreeEntry[], idPattern: TicketIdPattern | null): WorktreeEntry[] {
  return linkedWorktrees(entries).filter(entry => worktreeTicketId(entry, idPattern) === null)
}

/** The id from the pattern's group 1: upper-cased (Linear's `TKT-1650`), or rendered by its template (github: `#27`). */
function idOf(found: string, idPattern: TicketIdPattern): string {
  return idPattern.template !== undefined ? renderTemplate(idPattern.template, { n: found }) : found.toUpperCase()
}

/** `feature/tkt-1650-wrong-invite-path` → `TKT-1650` (a Linear pattern), `fix/27-crash` → `#27` (github); null without a pattern. */
export function ticketIdFromBranch(branch: string, idPattern: TicketIdPattern | null): string | null {
  if (idPattern === null) return null
  const match = branch.match(toRegExp(idPattern))
  return match?.[1] ? idOf(match[1], idPattern) : null
}

/** A worktree's ticket id: from its branch, else (a pattern with `folder`) from its folder's name; null when neither has one. */
export function worktreeTicketId(entry: WorktreeEntry, idPattern: TicketIdPattern | null): string | null {
  const fromBranch = entry.branch === null ? null : ticketIdFromBranch(entry.branch, idPattern)
  if (fromBranch !== null || idPattern?.folder === undefined) return fromBranch
  const match = folderName(entry.path).match(toRegExp(idPattern.folder))
  return match?.[1] ? idOf(match[1], idPattern) : null
}

/** The rail's name for a worktree: its ticket id, else its branch, else its folder name. */
export function worktreeKey(entry: WorktreeEntry, idPattern: TicketIdPattern | null): string {
  return worktreeTicketId(entry, idPattern) ?? entry.branch ?? folderName(entry.path)
}

/** The branch checked out in `folder` (the worktree that holds it, the deepest); null when detached or none holds it. */
export function branchOfFolder(entries: readonly WorktreeEntry[], folder: string): string | null {
  const within = (path: string) => folder === path || folder.startsWith(`${path.replace(/\/+$/, '')}/`)
  const holder = entries.filter(entry => within(entry.path)).sort((a, b) => b.path.length - a.path.length)[0]
  return holder?.branch ?? null
}

export function folderName(path: string): string {
  const parts = path.split('/').filter(part => part.length > 0)
  return parts[parts.length - 1] ?? path
}

export function repoName(repoPath: string): string {
  return folderName(repoPath)
}

export type NewWorktree = { path: string; branch: string; base: string }

export type NewWorktreeInput = {
  /** The main checkout. */
  repo: string
  ticket: string
  issue: { title: string; branchName: string } | null
  /** The existing ticket worktrees: their folder and their ticket id. */
  existing: readonly { path: string; ticket: string }[]
  /** The branch of the first open blocker, when one is known. */
  blockerBranch: string | null
  /** Decision 071: the branch of the ticket's story when the story has a worktree here. */
  storyBranch?: string | null
  /** Branch names on origin, without `origin/`. */
  originBranches: readonly string[]
  baseBranch: string
  /** The ticket's kind for `{kind}` (github: from its labels, `fix` or `feature`); none for Linear. */
  kind?: string
}

function parentDir(path: string): string {
  const cut = path.replace(/\/+$/, '').lastIndexOf('/')
  return cut <= 0 ? '/' : path.slice(0, cut)
}

function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: string | null = null
  for (const [value, count] of counts) if (best === null || count > (counts.get(best) ?? 0)) best = value
  return best
}

/** `Wrong invite path!` → `wrong-invite-path`, at most `max` characters. */
export function slug(text: string, max = 40): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, max).replace(/-+$/, '')
}

/** Beside most existing ticket worktrees and named like them (`<TICKET>` or `<repo>-<TICKET>`); null when there are none. */
function besideExisting(input: NewWorktreeInput, repo: string): string | null {
  const dir = mostCommon(input.existing.map(entry => parentDir(entry.path)))
  if (dir === null) return null
  const patterns = input.existing
    .filter(entry => parentDir(entry.path) === dir)
    .map(entry => {
      const folder = folderName(entry.path).toLowerCase()
      const ticket = entry.ticket.toLowerCase()
      return folder === ticket ? 'bare' : folder === `${repo.toLowerCase()}-${ticket}` ? 'repo' : ''
    })
    .filter(pattern => pattern !== '')
  const name = mostCommon(patterns) === 'bare' ? input.ticket : `${repo}-${input.ticket}`
  return `${dir === '/' ? '' : dir}/${name}`
}

/** Linear's branch name, else its `fallback`; or the branch template (`{kind}` from the GitHub issue's labels). */
function branchName(rule: BranchConfig, issue: NewWorktreeInput['issue'], values: Record<string, string>): string {
  if (rule.kind === 'template') return renderTemplate(rule.template, values)
  const fromLinear = issue?.branchName.trim() ?? ''
  return fromLinear !== '' ? fromLinear : renderTemplate(rule.fallback, values)
}

/**
 * Where a new ticket worktree goes and what it starts from (config `worktree`): with `followExisting`, beside the
 * existing ticket worktrees and named like them, else (or with none) `pathTemplate` (e.g.
 * `<parent of repo>/<repo>-<TICKET>`); the branch by `branch` (e.g. Linear's branch name, else
 * `<ticket>-<slug of the title>`; github: `{kind}/{n}-{slug}`, oink's `fix/27-ui-testing-wipes-prefs`). The base, as
 * the old launcher's promote (decision 071): the ticket's own branch when it is on origin already (work pushed before: resumed);
 * else, with `stackOnBlocker`, the first open blocker's branch, then the story's branch, each when it is on origin;
 * else `origin/<base branch>`.
 */
export function newWorktree(input: NewWorktreeInput, config: WorktreeConfig, home: string | null): NewWorktree {
  const repo = repoName(input.repo)
  const key = input.ticket
  const values = { key, keyLower: key.toLowerCase(), n: /(\d+)$/.exec(key)?.[1] ?? '', slug: slug(input.issue?.title ?? '', config.slugMax), kind: input.kind ?? '' }
  // A repository at the root has `/` as its parent: `{repoParent}/…` must not start with `//`.
  const repoParent = parentDir(input.repo).replace(/\/+$/, '')
  const path = (config.followExisting ? besideExisting(input, repo) : null) ?? renderTemplate(config.pathTemplate, { ...values, repoParent, repo }, home)
  const branch = branchName(config.branch, input.issue, values)
  const onOrigin = (name: string | null | undefined): string | null => (name != null && name !== '' && input.originBranches.includes(name) ? name : null)
  const stacked = config.stackOnBlocker ? onOrigin(input.blockerBranch) ?? onOrigin(input.storyBranch) : null
  return { path, branch, base: `origin/${onOrigin(branch) ?? stacked ?? input.baseBranch}` }
}

/** The line of git's stderr that says what failed (`fatal:`/`error:`), else its first line. */
export function gitError(stderr: string): string {
  const lines = stderr.split('\n').map(line => line.trim()).filter(line => line !== '')
  return lines.find(line => /^(fatal|error):/.test(line)) ?? lines[0] ?? ''
}
