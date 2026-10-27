// Commands one tower session sends another over `$.session.send`: a prefix and JSON, nothing else.

export type BusCommand = { command: string; args?: string }

const PREFIX = 'TOWER1 '
const COMMAND_NAME = /^[A-Za-z0-9_:-]{1,64}$/
const MAX_ARGS = 500
const ENVELOPE = /^<cross-session-message[^>]*>\s*([\s\S]*?)\s*<\/cross-session-message>$/

export function encodeCommand(command: BusCommand): string {
  return PREFIX + JSON.stringify(command.args === undefined ? { command: command.command } : command)
}

/** The command in a delivered text, with or without its peer envelope; null for anything else. */
export function decodeCommand(text: string): BusCommand | null {
  const trimmed = text.trim()
  const body = ENVELOPE.exec(trimmed)?.[1] ?? trimmed
  if (!body.startsWith(PREFIX)) return null
  let value: unknown
  try {
    value = JSON.parse(body.slice(PREFIX.length))
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { command, args } = value as Record<string, unknown>
  if (typeof command !== 'string' || !COMMAND_NAME.test(command)) return null
  if (args === undefined) return { command }
  if (typeof args !== 'string' || args.length > MAX_ARGS || /[\r\n]/.test(args)) return null
  return { command, args }
}

export function isAllowed(command: string, knownCommands: readonly string[]): boolean {
  return knownCommands.includes(command)
}
