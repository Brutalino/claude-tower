// A running agent's glyph: `◐◓◑◒`, one step every 240 ms, on the surface, so the deck pane need not redraw.
import type { ClientModule } from 'claude-code'

type Props = { colour: string }
type Ref = { at: number }
type State = { ref: Ref }

const FRAMES = '◐◓◑◒'

const Spinner: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  const ref = surface.state?.ref ?? { at: 0 }
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(240, () => {
      ref.at += 1
      surface.setState({ ref })
    })
  }
  return <Text color={props.colour}>{FRAMES[ref.at % FRAMES.length]}</Text>
}

export default Spinner
