// The board and the rail of a repository with GitHub issues (decision 054, plan general-tower.md "Left column"):
// `<slug> · <base>`, IN PROGRESS (the issues' worktrees), OPEN ISSUES (no worktree; the person's first), OTHER
// BRANCHES (worktrees with no issue number). Linear tickets keep their columns (home.ts); this is only the GitHub layout.

import type { TowerIssue, TowerOtherWorktree, TowerPullRequest, TowerRailRow } from '../../types/index'
import type { WorkflowConfig } from './config'
import { rowStep, type TicketStep } from './nextStep'

export type RepoProgress = { row: TowerRailRow; issue: TowerIssue | null; title: string; labels: string[]; step: TicketStep; status: string; prLine: string | null }

export type RepoSections = { header: string; inProgress: RepoProgress[]; openIssues: TowerIssue[]; otherBranches: TowerOtherWorktree[] }

/** `PR #30 · round 1 · fixes needed`: the number, a state other than open, the review rounds and the last verdict; null without a PR. */
export function prLine(pullRequest: TowerPullRequest | null | undefined): string | null {
  if (pullRequest?.kind !== 'pr') return null
  const parts = [`PR #${pullRequest.number}`]
  if (pullRequest.state !== 'open') parts.push(pullRequest.state)
  if (pullRequest.state === 'merged' || pullRequest.state === 'closed') return parts.join(' · ')
  if ((pullRequest.rounds ?? 0) === 0) return [...parts, 'no review yet'].join(' · ')
  parts.push(`round ${pullRequest.rounds}`)
  const blockers = pullRequest.reviewBlockers ?? null
  if (blockers !== null) parts.push(blockers > 0 ? 'fixes needed' : 'ready to merge')
  return parts.join(' · ')
}

/** `fix/26-start-day-duplicates` → `start day duplicates`: the branch's last part without its number. */
export function titleOfBranch(branch: string): string {
  const name = branch.slice(branch.lastIndexOf('/') + 1).replace(/^\d+-/, '')
  return name.replace(/-+/g, ' ').trim() || branch
}

/**
 * An issue in progress, its second line: what the step says while it waits on the person or works (`planning · say go`,
 * `working`), else the state file's phase with the PR line (`review · PR #30 · round 1 · fixes needed`), else the
 * step (`ready · /open-pr`, `not started · /start-ticket`).
 */
export function progressStatus(row: TowerRailRow, step: TicketStep, line: string | null): string {
  if (step.group !== 'ready' || line === null) return step.status
  return row.phase === 'not started' ? line : `${row.phase} · ${line}`
}

const GROUP_ORDER = { 'needs you': 0, working: 1, ready: 2 } as const

/**
 * The sections: the issues in progress by their step (needs you, working, ready), each with its issue when it is open;
 * the open issues without a worktree in the order given (the person's first); the other worktrees as they are. An issue's
 * open blockers (decision 077) make its step `⊘ blocked by #38` after a wait or work, as for Linear tickets, but never move it:
 * the order is its step's without them.
 */
export function repoSections(input: {
  project: { repo: string; baseBranch: string }
  rows: readonly TowerRailRow[]
  issues: readonly TowerIssue[]
  others: readonly TowerOtherWorktree[]
  pullRequests: Readonly<Record<string, TowerPullRequest | undefined>>
  workflow: WorkflowConfig
}): RepoSections {
  const byId = new Map(input.issues.map(issue => [issue.id, issue]))
  const inProgress = input.rows
    .map(row => {
      const issue = byId.get(row.key) ?? null
      const pullRequest = input.pullRequests[row.key]
      const blockedBy = issue?.blockedBy ?? []
      const step = rowStep(row, pullRequest, blockedBy, input.workflow)
      const group = blockedBy.length > 0 ? rowStep(row, pullRequest, [], input.workflow).group : step.group
      const line = prLine(pullRequest)
      return { group, one: { row, issue, title: issue?.title || titleOfBranch(row.branch), labels: issue?.labels ?? [], step, status: progressStatus(row, step, line), prLine: line } }
    })
    .sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group])
    .map(({ one }) => one)
  const started = new Set(input.rows.map(row => row.key))
  return {
    header: `${input.project.repo} · ${input.project.baseBranch}`,
    inProgress,
    openIssues: input.issues.filter(issue => !started.has(issue.id)),
    otherBranches: [...input.others],
  }
}

/** A one-line row after its marker and glyph: the id, the title cut with `…`, then `tail` (labels, `mine`) right-aligned. */
export function rowFit(width: number, id: string, title: string, tail: string): { title: string; gap: number } {
  const used = Array.from(id).length + 1 + (tail === '' ? 0 : Array.from(tail).length + 1)
  const room = Math.max(1, width - used)
  const chars = Array.from(title)
  const cut = chars.length <= room ? title : chars.slice(0, Math.max(0, room - 1)).join('') + '…'
  return { title: cut, gap: Math.max(tail === '' ? 0 : 1, width - used - Array.from(cut).length + (tail === '' ? 0 : 1)) }
}
