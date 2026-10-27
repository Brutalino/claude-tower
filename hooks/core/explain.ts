// Explain-as: the mode a ticket keeps, the chips that show it, the system-prompt section it adds, and the ghost suggestion.

import type { WorkflowConfig } from './config'

export type ExplainMode = 'off' | 'ste' | 'diagram' | 'html' | 'video'

export const EXPLAIN_MODES: readonly ExplainMode[] = ['off', 'ste', 'diagram', 'html', 'video']

export const EXPLAIN_SECTION = 'tower:explain'

export const EXPLAIN_CHIPS: Record<ExplainMode, { glyph: string; word: string }> = {
  off: { glyph: '○', word: 'Off' },
  ste: { glyph: '¶', word: 'STE' },
  diagram: { glyph: '◇', word: 'Diagram' },
  html: { glyph: '◱', word: 'HTML' },
  video: { glyph: '▶', word: 'Video' },
}

const WHEN = 'When you explain how something works or what you changed,'

const INSTRUCTIONS: Record<Exclude<ExplainMode, 'off'>, string> = {
  ste: 'Write every explanation in Simplified Technical English: short sentences (20 words at most), one instruction per sentence, active voice, present tense, the same word for the same thing, no idioms.',
  diagram: `${WHEN} include one diagram drawn with box-drawing characters or a Mermaid code block, and keep the text around it short.`,
  html: `${WHEN} write the explanation as one self-contained HTML file (inline CSS, no external resources) in \`.work/explain/<short-slug>.html\`, then give its path in one line instead of a long answer.`,
  video: `${WHEN} write one self-contained HTML file in \`.work/explain/<short-slug>.html\` that plays the explanation as a sequence of timed steps (inline CSS and JavaScript, no external resources, with play/pause and a step counter), then give its path in one line.`,
}

/** The section's text, or null when the mode adds none. */
export function explainSection(mode: ExplainMode): string | null {
  return mode === 'off' ? null : INSTRUCTIONS[mode]
}

export function nextMode(mode: ExplainMode): ExplainMode {
  return EXPLAIN_MODES[(EXPLAIN_MODES.indexOf(mode) + 1) % EXPLAIN_MODES.length]!
}

/** A stored value as a mode: anything unknown is Off. */
export function explainMode(value: unknown): ExplainMode {
  return EXPLAIN_MODES.includes(value as ExplainMode) ? (value as ExplainMode) : 'ste'
}

/** The `$.store` key of a ticket's mode: its worktree path. */
export function explainKey(worktree: string): string {
  return `explain:${worktree}`
}

export const CHIP_GAP = 2
// The hotkey's `e: ` is drawn before the label.
const LABEL = 'e: explain as'
const NEXT = 'next '

export type ChipsFit = { label: boolean; short: boolean; next: boolean }

function chipsWidth(short: boolean): number {
  const chips = EXPLAIN_MODES.map(mode => (short ? 1 : EXPLAIN_CHIPS[mode].glyph.length + 1 + EXPLAIN_CHIPS[mode].word.length))
  return chips.reduce((sum, width) => sum + width, 0) + CHIP_GAP * (chips.length - 1)
}

/** What the row keeps in `columns`: `explain as` goes first, then the chips shrink to their glyphs, then `next`. */
export function chipsFit(columns: number, next: string | null): ChipsFit {
  const right = next === null ? 0 : CHIP_GAP + NEXT.length + next.length
  const fits = (label: boolean, short: boolean, withNext: boolean) =>
    (label ? LABEL.length + CHIP_GAP : 0) + chipsWidth(short) + (withNext ? right : 0) <= columns
  const hasNext = next !== null
  if (fits(true, false, hasNext)) return { label: true, short: false, next: hasNext }
  if (fits(false, false, hasNext)) return { label: false, short: false, next: hasNext }
  if (fits(false, true, hasNext)) return { label: false, short: true, next: hasNext }
  return { label: false, short: true, next: false }
}

/** What the person would type next, for the prompt's dim suggestion; a question in the last answer is answered `yes`. */
export function ghostText(step: { next: string | null } | null, lastAnswer: string, workflow: WorkflowConfig): string | null {
  if (lastAnswer.trimEnd().endsWith('?')) return 'yes'
  const next = step?.next ?? null
  if (next === null || next === '') return null
  if (next === 'say go') return 'go'
  // A review runs in its own session (`v`), never in the ticket's context: a step whose session is `review` (e.g. /review).
  if (Object.values(workflow.steps).some(one => one.session === 'review' && next.startsWith(`/${one.skill} `))) return null
  return next.startsWith('/') ? next : null
}
