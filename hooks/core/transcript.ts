// The dressed conversation (decision 031): the one-line texts Tower draws in place of the engine's transcript rows.
import { actionLine } from './deck'

type Input = Record<string, unknown>

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)
const firstLine = (value: string): string => value.split('\n').find(line => line.trim() !== '')?.trim() ?? ''

/** The tool and its main argument: actionLine's shape, with a telling field for the tools it leaves bare. */
export function toolLine(tool: string, input: Input): string {
  const action = actionLine(tool, input)
  if (action !== tool) return action
  for (const key of ['pattern', 'url', 'query', 'skill', 'description', 'prompt', 'subject']) {
    const value = text(input[key])
    if (value !== null) return `${tool} ${firstLine(value)}`
  }
  return tool
}

/** An Agent (or Task) tool use: the agent's short name and its task's first line. */
export function agentCall(tool: string, input: Input): { agent: string; task: string; model: string | null } | null {
  if (tool !== 'Agent' && tool !== 'Task') return null
  const type = text(input.subagent_type) ?? 'agent'
  const agent = type.includes(':') ? type.slice(type.lastIndexOf(':') + 1) : type
  const task = firstLine(text(input.description) ?? text(input.prompt) ?? '')
  return { agent, task, model: text(input.model) }
}

const NOUNS: Record<string, [string, string]> = {
  Read: ['file', 'files'],
  Edit: ['file', 'files'],
  Write: ['file', 'files'],
  Bash: ['command', 'commands'],
  Grep: ['search', 'searches'],
  Glob: ['search', 'searches'],
}

/** A folded run of calls, counted per tool in the order they came: `Read 3 files · Bash 2 commands`. */
export function groupLine(calls: ReadonlyArray<{ tool: string }>): string {
  const counts = new Map<string, number>()
  for (const call of calls) counts.set(call.tool, (counts.get(call.tool) ?? 0) + 1)
  return [...counts].map(([tool, count]) => {
    const [one, many] = NOUNS[tool] ?? ['call', 'calls']
    return `${tool} ${count} ${count === 1 ? one : many}`
  }).join(' · ')
}

/** Milliseconds as m:ss. */
export function clockTime(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** The turn's closing line: `✓ Brewed · 1:05`. */
export function turnLine(word: string, durationMs: number): string {
  return `✓ ${word.trim()} · ${clockTime(durationMs)}`
}

/** A background task's notification: `↩ <name> finished · <m:ss>`. */
export function notificationLine(task: { id?: string; type?: string; durationMs?: number } | undefined, summary: string): string {
  const quoted = /"([^"]+)"/.exec(summary)?.[1] ?? null
  const name = quoted ?? text(task?.type) ?? text(task?.id) ?? 'task'
  return `↩ ${name} finished${task?.durationMs !== undefined ? ` · ${clockTime(task.durationMs)}` : ''}`
}

/** A peer's message: `← <name>: <first line>`. */
export function peerLine(name: string, body: string): string {
  return `← ${name}: ${firstLine(body)}`
}

/** A tool result's first line of text, whatever shape the output has (a string, content blocks, an object). */
export function outputFirstLine(output: unknown): string {
  if (typeof output === 'string') return firstLine(output)
  if (Array.isArray(output)) {
    for (const block of output) {
      const line = outputFirstLine(block)
      if (line !== '') return line
    }
    return ''
  }
  if (output !== null && typeof output === 'object') {
    const record = output as Input
    for (const key of ['text', 'error', 'stderr', 'content', 'stdout', 'message']) {
      const line = outputFirstLine(record[key])
      if (line !== '') return line
    }
  }
  return ''
}

// ── Timings and edit cards (decision 038; ideas from skins and autotel, MIT, own code) ──

/** A finished call's duration: `0.4s`, `12.4s` under a minute, else m:ss. */
export function durationText(ms: number): string {
  if (ms < 60_000) return `${(Math.max(0, ms) / 1000).toFixed(1)}s`
  return clockTime(ms)
}

/** The finished calls' durations by tool_use_id, the newest `DURATIONS_KEPT`: a row redrawn later still finds its time. */
export const DURATIONS_KEPT = 500

export function rememberDuration(map: Map<string, number>, id: string, ms: number): Map<string, number> {
  map.delete(id)
  map.set(id, ms)
  while (map.size > DURATIONS_KEPT) map.delete(map.keys().next().value!)
  return map
}

const lineCount = (value: unknown): number => (typeof value === 'string' && value !== '' ? value.replace(/\n$/, '').split('\n').length : 0)

/** Lines added and removed by one old → new replacement, the lines both share at the start and the end left out. */
function changedLines(oldText: string, newText: string): { added: number; removed: number } {
  const before = oldText === '' ? [] : oldText.split('\n')
  const after = newText === '' ? [] : newText.split('\n')
  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) head++
  let tail = 0
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++
  return { added: after.length - head - tail, removed: before.length - head - tail }
}

/** An edit card's counts: `+12 −3` for Edit and MultiEdit, `+N lines` for Write; null for any other tool. */
export function editCounts(tool: string, input: Input): { added: number; removed: number } | { lines: number } | null {
  if (tool === 'Write') return { lines: lineCount(input.content) }
  const edits = tool === 'Edit' ? [input] : tool === 'MultiEdit' && Array.isArray(input.edits) ? (input.edits as Input[]) : null
  if (edits === null) return null
  let added = 0
  let removed = 0
  for (const edit of edits) {
    const change = changedLines(typeof edit.old_string === 'string' ? edit.old_string : '', typeof edit.new_string === 'string' ? edit.new_string : '')
    added += change.added
    removed += change.removed
  }
  return { added, removed }
}

/** A finished group's time: its calls' durations summed; null while one runs or one is unknown. */
export function groupDuration(calls: ReadonlyArray<{ tool_use_id?: string; isRunning: boolean }>, durations: ReadonlyMap<string, number>): number | null {
  let total = 0
  for (const call of calls) {
    const ms = call.tool_use_id !== undefined && !call.isRunning ? durations.get(call.tool_use_id) : undefined
    if (ms === undefined) return null
    total += ms
  }
  return total
}
