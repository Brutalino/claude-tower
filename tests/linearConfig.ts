// A Linear project for the tests (decision 083): ShopApp, `acmeco/shopapp`, tickets `TKT-<n>`, a state file, the
// `## Self-review` review, a dev-env skill in 7 slots from 5173, the board's shape, new ticket and triage, and a routing
// of its own. Synthetic data: the tests run the same with or without an edition, whose own tests check that its
// configuration is this one but for its names.

import { patternOf, profileOf, storedConfigPath, type TowerConfig } from '../hooks/core/config'
import { SELF_REVIEW_HEADING } from '../hooks/core/detail'
import { TOWER_ROUTING, type Profile, type Skill, type SkillWhere } from '../hooks/core/profile'
import { REVIEW_SECTIONS } from '../hooks/core/reviewBox'

/** A ticket id in a branch name (`feature/tkt-1650-…` → `tkt-1650`, group 1). */
export const TICKET_ID = /(?:^|[^a-z0-9])(tkt-\d+)/i

/** The dev-env slots: 7 from port 5173. */
export const SLOTS = 7
export const FIRST_PORT = 5173

/** The questions away mode answers (`openPr`) or only recognises (`review`), as a ticket workflow's skills ask them. */
export const AWAY_QUESTIONS = {
  openPr: [/mark the pr ready/i, /commit/i],
  review: [/\b(?:post|publish)\b(?!-)/i, /\bpubblic/i, /\bcomment on the PR\b/i, /gh pr comment/i],
} as const

function skill(name: string, what: string, where: SkillWhere, model: string, effort: string | null): Skill {
  return { name, what, where, model, effort }
}

const SKILLS: readonly Skill[] = [
  skill('shape', 'Shape an idea into an agreed scope', 'hub', 'fable', 'xhigh'),
  skill('new-ticket', 'Create one Linear issue from an agreed scope', 'hub', 'fable', 'high'),
  skill('triage', 'Triage the new tickets in Backlog', 'hub', 'fable', 'high'),
  skill('repro', 'Prove a thin bug before anyone fixes it', 'ticket', 'opus', 'medium'),
  skill('start-ticket', 'Create the worktree and write the plan', 'ticket', 'fable', 'xhigh'),
  skill('dev-env', 'Start, check or stop the local stack of the ticket', 'ticket', 'haiku', null),
  skill('open-pr', 'Commit, rebase, verify and open the draft PR', 'ticket', 'opus', 'medium'),
  skill('review', 'Review the PR against the review criteria', 'ticket', 'fable', 'high'),
  skill('wrap-up', 'Merge after your yes and clean up', 'ticket', 'sonnet', 'low'),
  skill('handover', 'Move a live ticket to another person', 'ticket', 'sonnet', 'low'),
  skill('autonomousloop', 'Drive marked tickets to a reviewable state', 'hub', 'fable', 'high'),
  skill('story-review', 'Check that a story is really done', 'hub', 'fable', 'high'),
  skill('linear-promote-children', 'Promote child tickets one workflow step', 'hub', 'haiku', null),
  skill('release', 'Bump the version and promote staging to main', 'hub', 'fable', 'high'),
  skill('housekeeping', 'Sweep Linear, docs and changelog for drift', 'hub', 'sonnet', 'medium'),
  skill('scope-check', 'Weekly scope and milestone alignment check', 'hub', 'fable', 'medium'),
  skill('progress-report', 'Generate the progress report', 'hub', 'opus', 'medium'),
  skill('audit', 'Deep systemic audit of one area of the code', 'hub', 'fable', 'xhigh'),
  skill('new-widget', 'Design and build a Home dashboard widget', 'ticket', 'fable', 'high'),
  skill('dev-sim', 'Run simulated devices against a local backend', 'ticket', 'haiku', null),
]

const REVIEW_GUIDANCE = [
  '# Delegation for a review',
  'Reading the diff and judging it is your work: read the pull request\'s diff yourself and write the review yourself.',
  'Everything mechanical goes to agents: `tower:runner` runs the `gh` commands (pr view, pr diff, pr comments, CI state, `gh pr ready --undo`/`gh pr ready`, posting the comment) and returns their output; `tower:scout` reads the criteria and decisions documents, the Linear issue, the earlier review rounds, and the code around the changed lines, and returns a short brief; `tower:verifier` runs tests or type checks when the review needs a fact.',
  'Do not use forks.',
  'Announce each of your steps with one line `[step 2/5] what this step does` before the step\'s tool calls.',
  'Before you ask whether to post, save the final review, exactly as it would be posted, to the absolute path `<worktree>/.work/review/pr-<n>-round-<N>.md` (`<n>` the pull request, `<N>` the round).',
].join('\n')

export const LINEAR_CONFIG: TowerConfig = {
  version: 1,
  project: { name: 'ShopApp', repo: 'acmeco/shopapp', baseBranch: 'staging', mainCheckout: null },
  tickets: {
    kind: 'linear',
    team: null,
    query: { first: 50, candidateLabel: 'bug', candidateStates: ['backlog', 'unstarted'], mineStates: ['backlog', 'unstarted', 'started'] },
    idPattern: patternOf(TICKET_ID),
    inputPattern: { source: '^(?:tkt-)?(\\d+)$', flags: 'i' },
    idTemplate: 'TKT-{n}',
  },
  worktree: {
    pathTemplate: '{repoParent}/{repo}-{key}',
    followExisting: true,
    branch: { kind: 'linear-branch-name', fallback: '{keyLower}-{slug}' },
    slugMax: 40,
    stackOnBlocker: true,
  },
  workflow: {
    steps: {
      start: { skill: 'start-ticket', args: '{key}', phase: 'not started', session: 'ticket' },
      openPr: { skill: 'open-pr', args: '', phase: 'implementing', session: 'ticket' },
      review: { skill: 'review', args: '{pr}', phase: null, session: 'review' },
      wrapUp: { skill: 'wrap-up', args: '{pr}', phase: null, session: 'ticket' },
    },
  },
  phases: {
    source: 'state-file',
    path: '.work/state.json',
    values: ['planning', 'implementing'],
    mapping: { planning: 'planning', implementing: 'implementing' },
    unknownAs: 'implementing',
  },
  review: {
    skill: 'review',
    args: '{pr}',
    heading: patternOf(SELF_REVIEW_HEADING),
    roundPattern: { source: '\\(round\\s+(\\d+)\\)', flags: 'i' },
    sections: [...REVIEW_SECTIONS],
    verdict: null,
    blockersSection: { heading: 'Blockers', none: '_(none)_' },
    savePath: '.work/review/pr-{pr}-round-{round}.md',
  },
  waits: {
    openPr: { patterns: AWAY_QUESTIONS.openPr.map(patternOf), awayAnswer: 'yes' },
    post: { patterns: AWAY_QUESTIONS.review.map(patternOf), awayAnswer: null },
  },
  checks: { sources: ['github-ci'] },
  env: { kind: 'skill', name: 'dev-env', ports: { first: FIRST_PORT, slots: SLOTS } },
  repoActions: [
    { key: 's', label: 'shape', skill: 'shape', cwd: 'main' },
    { key: 'n', label: 'new ticket', skill: 'new-ticket', cwd: 'main' },
    { key: 't', label: 'triage', skill: 'triage', cwd: 'main' },
  ],
  routing: {
    roles: TOWER_ROUTING.roles,
    skills: SKILLS,
    modelIds: TOWER_ROUTING.modelIds,
    builtinRoutes: TOWER_ROUTING.builtinRoutes,
    forkAdvice: TOWER_ROUTING.forkAdvice,
    mainGuidance: TOWER_ROUTING.mainGuidance,
    reviewGuidance: REVIEW_GUIDANCE,
  },
  delivery: 'pr',
}

/** The profile LINEAR_CONFIG makes (profile.ts's shape). */
export const PROFILE: Profile = profileOf(LINEAR_CONFIG) as Profile

/**
 * LINEAR_CONFIG stored for a main checkout, as `<state>/projects/<id>.json` holds it: the path and the text. A rail or
 * ticket session in that checkout resolves it (decision 053), with or without an edition; its main checkout stays
 * TOWER_REPO (`mainCheckout` null).
 */
export function storedLinear(state: string, main: string): { path: string; text: string } {
  return { path: storedConfigPath(state, main), text: JSON.stringify(LINEAR_CONFIG) }
}

type ReadHandler = (engine: any, event: any) => Promise<any>

/**
 * An `fs.read` handler that answers LINEAR_CONFIG as the stored configuration of `main` (`<any state dir>/projects/<id>.json`),
 * and everything else as `read` does (by default: not found). A mocked rail or ticket session in `main` then takes it.
 */
export function withStoredLinear(main: string, read: ReadHandler = async (_$, e) => ({ deny: `ENOENT: ${e.path}` })): ReadHandler {
  const file = storedLinear('', main).path
  return async ($, e) => (typeof e?.path === 'string' && e.path.endsWith(file) ? { value: JSON.stringify(LINEAR_CONFIG) } : read($, e))
}

type RunHandler = (engine: any, event: any) => Promise<any>

/**
 * A `process.run` handler that answers `git worktree list --porcelain` with `main` alone, and everything else as `run`
 * does (by default: success, no output): with withStoredLinear, a mocked session whose git lists nothing finds `main`'s
 * stored configuration.
 */
export function withLinearGit(main: string, run: RunHandler = async () => ({ value: { exitCode: 0, stdout: '', stderr: '' } })): RunHandler {
  return async ($, e) => {
    const argv: string[] = e?.argv ?? []
    if (argv[0] === 'git' && argv[1] === 'worktree' && argv[2] === 'list') {
      return { value: { exitCode: 0, stdout: `worktree ${main}\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/main\n`, stderr: '' } }
    }
    return run($, e)
  }
}
