// The docs viewer's document list and the agent watch's live lines: pure, tested in tests/docs.test.ts.

import { actionLine } from './deck'

export type TowerDoc = {
  /** The list's label: `plan`, `pull request`, or the file name without its extension. */
  title: string
  /** Where it came from: `.work/state.json`, `gh pr view`, or the path under the worktree. */
  path: string
  /** Markdown, or an HTML file shown as text. */
  text: string
  html: boolean
}

/** `.work/review.md` → `review`; `repro/notes.html` → `notes`. */
export function docTitle(path: string): string {
  const name = path.split('/').pop() ?? path
  return name.replace(/\.(md|html?)$/i, '')
}

/**
 * The ticket's documents in the viewer's order: the plan, the pull request text, then every
 * `*.md` and `*.html` file (paths relative to the worktree, sorted, duplicates once).
 */
export function docEntries(input: { plan: string | null; prBody: string | null; files: { path: string; text: string }[] }): TowerDoc[] {
  const docs: TowerDoc[] = []
  if (input.plan !== null && input.plan.trim() !== '') docs.push({ title: 'plan', path: '.work/state.json', text: input.plan, html: false })
  if (input.prBody !== null && input.prBody.trim() !== '') docs.push({ title: 'pull request', path: 'gh pr view', text: input.prBody, html: false })
  const seen = new Set<string>()
  const files = input.files
    .map(file => ({ ...file, path: file.path.replace(/^\.\//, '') }))
    .filter(file => /\.(md|html?)$/i.test(file.path) && !seen.has(file.path) && (seen.add(file.path), true))
    .sort((a, b) => a.path.localeCompare(b.path))
  for (const file of files) docs.push({ title: docTitle(file.path), path: file.path, text: file.text, html: /\.html?$/i.test(file.path) })
  return docs
}

export type LiveLine = { text: string; dim: boolean }

type LiveMessage = { role: string; text: string; toolUses: { tool: string; input: Record<string, unknown> }[] }

/** An agent's conversation as the watch's `live` panel: the agent's text plain, each tool use as a dim `· Tool arg`; the newest `limit`. */
export function liveLines(messages: readonly LiveMessage[], limit: number): LiveLine[] {
  const lines: LiveLine[] = []
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    for (const line of message.text.split('\n')) if (line.trim() !== '') lines.push({ text: line, dim: false })
    for (const use of message.toolUses) lines.push({ text: `· ${actionLine(use.tool, use.input ?? {})}`, dim: true })
  }
  return lines.slice(-Math.max(0, limit))
}

/** A demo agent's `recent` actions as live lines. */
export function recentLines(recent: readonly string[], limit: number): LiveLine[] {
  return recent.map(line => ({ text: `· ${line}`, dim: true })).slice(-Math.max(0, limit))
}
