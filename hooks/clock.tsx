// An elapsed clock that ticks every second on the surface, so the deck pane need not redraw.
// `since` and `now` come from the hooks module's $.clock; between redraws it adds its own ticks.
// Optional (decision 033): `short` draws `1m12s`, `suffix` follows the face, and from `warnAfter` ms on it turns `warnColour`.
import type { ClientModule } from 'claude-code'

type Props = { since: number; now: number; short?: boolean; suffix?: string; warnAfter?: number; warnColour?: string }
type Ref = { base: number; ticks: number; lastNow: number }
type State = { ref: Ref }

function face(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const ss = String(seconds % 60).padStart(2, '0')
  if (minutes < 60) return `${minutes}:${ss}`
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${ss}`
}

function shortFace(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  if (minutes === 0) return `${seconds}s`
  if (minutes < 60) return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
}

const Clock: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  const ref = surface.state?.ref ?? { base: 0, ticks: 0, lastNow: -1 }
  if (props.now !== ref.lastNow) {
    // A fresh reading from the hooks module: count on from it.
    ref.lastNow = props.now
    ref.base = props.now - props.since
    ref.ticks = 0
  }
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(1000, () => {
      ref.ticks += 1
      surface.setState({ ref })
    })
  }
  const elapsed = ref.base + ref.ticks * 1000
  const text = (props.short === true ? shortFace(elapsed) : face(elapsed)) + (props.suffix ?? '')
  const warn = props.warnAfter !== undefined && elapsed >= props.warnAfter
  return warn ? <Text color={props.warnColour}>{text}</Text> : <Text dimColor>{text}</Text>
}

export default Clock
