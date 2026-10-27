// The free Tower's configuration (decision 060, plan general-tower.md "Free session mode"): a folder with no
// project. No tickets (no Linear, no GitHub issues, no candidates), no workflow, no phases, checks or dev env, no
// repository actions; Tower's own roles on the session's model (`routing: 'defaults'`, no skills). bin/CCtower starts
// it with TOWER_MODE=free and the rail hands the mode on, so a session never re-derives it from its folder.
// `project.repo` and `review` are placeholders the schema asks for: free mode opens no review and calls no GitHub.

import type { TowerConfig } from '../config'

export const FREE_CONFIG: TowerConfig = {
  version: 1,
  project: { name: 'free', repo: 'tower/free', baseBranch: 'main', mainCheckout: null },
  tickets: { kind: 'none' },
  worktree: {
    pathTemplate: '{repoParent}/{repo}-{slug}',
    followExisting: false,
    branch: { kind: 'template', template: '{slug}', kindFromLabel: false },
    slugMax: 40,
    stackOnBlocker: false,
  },
  workflow: { steps: {} },
  phases: { source: 'none' },
  review: {
    skill: 'review',
    args: '{pr}',
    heading: { source: '^##\\s+Review\\b.*$', flags: 'im' },
    roundPattern: { source: '\\(round\\s+(\\d+)\\)', flags: 'i' },
    sections: [],
    verdict: { ready: { source: '^Verdict:\\s*ready\\b', flags: 'im' }, fixes: { source: '^Verdict:\\s*fixes\\b', flags: 'im' } },
    blockersSection: null,
    savePath: '.work/review/pr-{pr}-round-{round}.md',
  },
  waits: {},
  checks: { sources: [] },
  env: { kind: 'none' },
  repoActions: [],
  routing: 'defaults',
  delivery: 'commit',
}
