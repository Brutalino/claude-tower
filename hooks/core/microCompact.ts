// `/compact micro` (decision 034): old Read results and the thinking blocks leave the context, with no model call.
// A `session.compact` hook answers `{ messages }` of its own in place of core's summary; a message it hands back with
// the engine's `handle` stands as the engine has it, one without is built from its role, text and tool blocks.

/** The `/compact` text that asks for it: `/compact micro`, and what `/compact-micro` passes. */
export const MICRO_INSTRUCTIONS = 'micro'

/** How many of the newest Read results stay whole. */
export const MICRO_KEEP_READS = 3

/** What an old Read result reads as afterwards. */
export const READ_PLACEHOLDER = '[tower: old Read result dropped by /compact micro — read the file again if needed]'

/** The parts of an engine `SessionMessage` this reads and builds. */
export type MicroMessage = {
  role: 'user' | 'assistant'
  text: string
  toolUses: readonly { tool_use_id: string; tool: string; input: Record<string, unknown>; result?: unknown; text?: string; isError?: true; [key: string]: unknown }[]
  toolResults?: readonly { tool_use_id: string; text: string; isError: boolean; result?: unknown }[]
  handle?: string
}

export function isMicro(instructions: string | undefined): boolean {
  return (instructions ?? '').trim().toLowerCase() === MICRO_INSTRUCTIONS
}

/**
 * The conversation with every Read result but the newest `keep` replaced by the placeholder (in the tool_result and in
 * the call's own outcome), and every assistant message rebuilt from its text and tool calls, which leaves its thinking
 * behind. `reads`: results newly dropped; `replies`: assistant messages rebuilt. Running it again drops nothing more.
 */
export function microCompact<M extends MicroMessage>(messages: readonly M[], keep = MICRO_KEEP_READS): { messages: M[]; reads: number; replies: number } {
  const readIds = messages.flatMap(message => (message.role === 'assistant' ? message.toolUses.filter(use => use.tool === 'Read').map(use => use.tool_use_id) : []))
  const old = new Set(readIds.slice(0, Math.max(0, readIds.length - keep)))
  let reads = 0
  let replies = 0
  const out = messages.map(message => {
    if (message.role === 'assistant') {
      replies += 1
      const { handle: _handle, ...rest } = message
      const toolUses = message.toolUses.map(use => {
        if (!old.has(use.tool_use_id) || use.text === READ_PLACEHOLDER) return use
        const { result: _result, ...kept } = use
        return { ...kept, text: READ_PLACEHOLDER }
      })
      return { ...rest, toolUses } as unknown as M
    }
    const results = message.toolResults ?? []
    if (!results.some(result => old.has(result.tool_use_id) && result.text !== READ_PLACEHOLDER)) return message
    const { handle: _handle, ...rest } = message
    const toolResults = results.map(result => {
      if (!old.has(result.tool_use_id) || result.text === READ_PLACEHOLDER) return result
      reads += 1
      return { tool_use_id: result.tool_use_id, text: READ_PLACEHOLDER, isError: result.isError }
    })
    return { ...rest, toolResults } as unknown as M
  })
  return { messages: out, reads, replies }
}
