// The design Tower's configuration (decision 064, plan general-tower.md "New project mode"): a folder with a stage state file
// `.tower/design.json` whose stage 8 is not done. As the free one (decision 060): no tickets, no Linear, no workflow,
// phases, checks, dev env or repository actions, no git required; Tower's own roles on the session's model. bin/CCtower
// starts it with TOWER_MODE=design on `tower-<slug>` and the rail hands the mode on. `project.repo` and `review` are
// placeholders the schema asks for.

import type { TowerConfig } from '../config'
import { FREE_CONFIG } from './free'

export const DESIGN_CONFIG: TowerConfig = {
  ...FREE_CONFIG,
  project: { name: 'design', repo: 'tower/design', baseBranch: 'main', mainCheckout: null },
}
