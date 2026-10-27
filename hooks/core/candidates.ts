// Decision 071: the candidates as the old launcher listed them — the issues without a worktree here, the person's own first
// — the marks (`m`) and the order a batch is promoted in (stories first, then blockers before the tickets they block).

import type { TowerIssue } from '../../types/index'

const CLOSED = new Set(['completed', 'canceled'])
const NOT_STARTED_YET = (stateType: string | undefined) => stateType !== undefined && stateType !== '' && stateType !== 'started' && !CLOSED.has(stateType)
const PRIORITY_RANK: Record<TowerIssue['priority'], number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }

/** the old launcher's compare: assigned to the person first, then in progress, then priority (none last), then identifier. */
export function compareCandidates(a: TowerIssue, b: TowerIssue): number {
  const mine = Number(b.assignedToMe) - Number(a.assignedToMe)
  if (mine !== 0) return mine
  const started = Number(b.stateType === 'started') - Number(a.stateType === 'started')
  if (started !== 0) return started
  const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (rank !== 0) return rank
  return a.id.localeCompare(b.id, undefined, { numeric: true })
}

/** Siblings with their blockers first (compareCandidates breaks ties); a cycle keeps the rest in compare order. */
export function topoSort(issues: readonly TowerIssue[]): TowerIssue[] {
  const left = [...issues].sort(compareCandidates)
  const ids = new Set(left.map(issue => issue.id))
  const placed = new Set<string>()
  const out: TowerIssue[] = []
  while (left.length > 0) {
    const at = left.findIndex(issue => issue.blockedBy.every(blocker => !ids.has(blocker) || placed.has(blocker)))
    if (at === -1) {
      out.push(...left)
      break
    }
    const [next] = left.splice(at, 1) as [TowerIssue]
    out.push(next)
    placed.add(next.id)
  }
  return out
}

/**
 * The candidates: every issue without a worktree here (`onRail`, the hidden ones too) that is not closed — the
 * person's own (started ones too, as the old launcher's `· in progress`: begun elsewhere, no worktree here) and the free ones
 * the query gives, a free one only when not started — and a story's children assigned to the person that the
 * query did not give (`fromStory`: read by identifier before their worktree is made). In the old launcher's order: the top level
 * by compareCandidates, each story's children right after it, blockers first.
 */
export function candidateIssues(issues: readonly TowerIssue[], onRail: ReadonlySet<string>): TowerIssue[] {
  const seen = new Set<string>()
  const list: TowerIssue[] = []
  const add = (issue: TowerIssue) => {
    const key = issue.id.toUpperCase()
    if (seen.has(key) || onRail.has(key)) return
    seen.add(key)
    list.push(issue)
  }
  // The board's rule (boardLists): closed is no candidate; started only when it is the person's (the old launcher's in progress).
  for (const issue of issues) if (!CLOSED.has(issue.stateType) && (issue.stateType !== 'started' || issue.assignedToMe)) add(issue)
  for (const issue of issues) {
    const story = issue.story
    if (story === null) continue
    for (const child of story.children ?? []) {
      if (child.assignedToMe !== true || !NOT_STARTED_YET(child.stateType)) continue
      add({
        id: child.id, title: child.title, description: '', priority: 'none', branchName: '', url: '', stateName: child.stateName, stateType: child.stateType,
        labels: [], assignedToMe: true, story: { id: story.id, title: story.title }, blockedBy: child.blockedBy ?? [], children: [], fromStory: true,
      })
    }
  }
  return orderCandidates(list)
}

/** the old launcher's orderCandidates: the issues whose story is not listed by compareCandidates, each listed story's children under it. */
export function orderCandidates(list: readonly TowerIssue[]): TowerIssue[] {
  const ids = new Set(list.map(issue => issue.id))
  const top = list.filter(issue => issue.story === null || !ids.has(issue.story.id)).sort(compareCandidates)
  return top.flatMap(issue => [issue, ...topoSort(list.filter(child => child.story?.id === issue.id))])
}

/** A story: it has sub-tickets, or a `story` label. */
export function isStory(issue: TowerIssue): boolean {
  return issue.children.length > 0 || issue.labels.some(label => label.toLowerCase() === 'story')
}

/** The order a batch is promoted in: the stories first (their branch is their children's base), then blockers first. */
export function promoteOrder(targets: readonly TowerIssue[]): TowerIssue[] {
  return [...targets.filter(isStory), ...topoSort(targets.filter(issue => !isStory(issue)))]
}

/** The batch's tickets blocked by an open ticket that is not in the batch: `TKT-2 blocked by TKT-1`, one each. */
export function blockedOutside(targets: readonly TowerIssue[]): string[] {
  const ids = new Set(targets.map(issue => issue.id))
  return targets.flatMap(issue => issue.blockedBy.filter(blocker => !ids.has(blocker)).map(blocker => `${issue.id} blocked by ${blocker}`))
}

/** `m`: the mark on `id` toggled. */
export function toggleMark(marks: readonly string[], id: string): string[] {
  return marks.includes(id) ? marks.filter(one => one !== id) : [...marks, id]
}

/** The marks on the candidates still listed (a reload, a promote). */
export function pruneMarks(marks: readonly string[], listed: readonly string[]): string[] {
  const keep = new Set(listed)
  return marks.filter(id => keep.has(id))
}

/** What `↵` promotes: the marked candidates in the list's order, else the focused one. */
export function promoteTargets(list: readonly TowerIssue[], marks: readonly string[], focused: string | null): TowerIssue[] {
  const marked = list.filter(issue => marks.includes(issue.id))
  if (marked.length > 0) return marked
  const one = list.find(issue => issue.id === focused)
  return one === undefined ? [] : [one]
}

/** the old launcher's priority glyphs: `!` urgent, `▲` high, `■` medium, `▼` low, `·` none; the tone names a theme colour. */
export function priorityGlyph(priority: TowerIssue['priority']): { glyph: string; tone: 'error' | 'needsYou' | 'accent' | 'dim'; bold: boolean } {
  if (priority === 'urgent') return { glyph: '!', tone: 'error', bold: true }
  if (priority === 'high') return { glyph: '▲', tone: 'needsYou', bold: false }
  if (priority === 'medium') return { glyph: '■', tone: 'accent', bold: false }
  return { glyph: priority === 'low' ? '▼' : '·', tone: 'dim', bold: false }
}
