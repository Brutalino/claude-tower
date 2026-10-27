// A working session's figure in the home header: `▟█▙` / `▜█▛`, one step every 480 ms, on the surface.
import type { ClientModule } from 'claude-code'

type Props = { colour: string }
type Ref = { at: number }
type State = { ref: Ref }

const FRAMES = ['▟█▙', '▜█▛']

const Figure: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  const ref = surface.state?.ref ?? { at: 0 }
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(480, () => {
      ref.at += 1
      surface.setState({ ref })
    })
  }
  return <Text color={props.colour}>{FRAMES[ref.at % FRAMES.length]}</Text>
}

export default Figure
