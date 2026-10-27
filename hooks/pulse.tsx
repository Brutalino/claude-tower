// The deck's pulse rail: a `●` with a dim `•` behind it runs along a `─` rail, one cell per 120 ms,
// on the surface, so the deck pane need not redraw. Drawn only while the session works.
import type { ClientModule } from 'claude-code'

type Props = { width: number; accent: string; panel: string }
type Ref = { at: number }
type State = { ref: Ref }

const PULSE_MS = 120

const Pulse: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const ref = surface.state?.ref ?? { at: 0 }
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(PULSE_MS, () => {
      ref.at += 1
      surface.setState({ ref })
    })
  }
  const width = Math.max(2, props.width)
  const head = ref.at % width
  const tail = (head - 1 + width) % width
  const cell = (index: number) => (
    index === head ? <Text key={`m${index}`} color={props.accent}>●</Text>
    : index === tail ? <Text key={`m${index}`} dimColor>•</Text>
    : null
  )
  // Runs of plain rail between the two marks, so the row is a handful of Texts, not one per cell.
  const marks = [tail, head].sort((a, b) => a - b)
  const parts = []
  let from = 0
  for (const mark of marks) {
    if (mark > from) parts.push(<Text key={`r${from}`} color={props.panel}>{'─'.repeat(mark - from)}</Text>)
    parts.push(cell(mark))
    from = mark + 1
  }
  if (from < width) parts.push(<Text key={`r${from}`} color={props.panel}>{'─'.repeat(width - from)}</Text>)
  return <Box>{parts}</Box>
}

export default Pulse
