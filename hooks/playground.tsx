// The simple view's playground: the main figure and one small Claude figure per agent, walking while they work.
// The tick runs on the surface, one per 120 ms, so the deck pane need not redraw; the scene is the pure
// `core/playground.ts`.
import type { ClientModule } from 'claude-code'

import { PLAYGROUND_TICK_MS, playgroundScene, type PlaygroundAgent, type PlaygroundRun } from './core/playground'

type Props = { agents: PlaygroundAgent[]; mainWorking: boolean; width: number; rows: number; accent: string; done: string; error: string }
type Ref = { tick: number }
type State = { ref: Ref }

const Playground: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const ref = surface.state?.ref ?? { tick: 0 }
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(PLAYGROUND_TICK_MS, () => {
      ref.tick += 1
      surface.setState({ ref })
    })
  }
  const colourOf = (run: PlaygroundRun) =>
    run.tone === 'agent' ? run.colour : run.tone === 'accent' ? props.accent : run.tone === 'done' ? props.done : run.tone === 'error' ? props.error : undefined
  const lines = playgroundScene(props.agents, props.mainWorking, ref.tick, props.width, props.rows)
  return (
    <Box flexDirection="column">
      {lines.map((line, row) => (
        <Text key={`row${row}`}>{line.map((run, index) => (
          run.tone === 'dim' ? <Text key={`r${index}`} dimColor>{run.text}</Text>
          : run.tone === 'plain' ? <Text key={`r${index}`}>{run.text}</Text>
          : <Text key={`r${index}`} color={colourOf(run)}>{run.text}</Text>
        ))}</Text>
      ))}
    </Box>
  )
}

export default Playground
