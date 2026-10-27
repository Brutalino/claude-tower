// Where Tower keeps the files every session shares (sessions, keys, settings, attention, Fable block, away).
// TOWER_STATE_DIR moves them (test launches: <plugin root>/.smoke/state), so a test never reads or writes ~/.claude/tower.

/** TOWER_STATE_DIR when set (trailing slashes dropped), else `<home>/.claude/tower`; null with neither. */
export function stateDir(home: string | null | undefined, override: string | null | undefined): string | null {
  if (override) return override.replace(/(.)\/+$/, '$1')
  return home ? `${home}/.claude/tower` : null
}

/** TOWER_MUTE=1: the mod plays no sound (test launches). */
export function isMuted(value: string | null | undefined): boolean {
  return value === '1'
}
