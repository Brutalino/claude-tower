// tower-setup's guided flow (decision 065, plan docs/plans/general-tower.md "tower-setup" 2 and 4): which of Tower's
// reference-flow skills a repository lacks, the values the skill templates (skills/tower-setup/flow/*.md) are filled
// with, the rendering, and the first tickets for large missing work. Pure: tools/tower-cli.mjs reads the templates and
// writes the skills; nothing here touches a file, a process or the network.

import type { TowerConfig } from './config'
import type { FlowStage, ScanFacts } from './setupScan'

/** The templates, one per skill, in the reference flow's order. */
export const FLOW_SKILLS = ['new-ticket', 'triage', 'start-ticket', 'repro', 'open-pr', 'review-pr', 'wrap-up', 'release'] as const
export type FlowSkill = (typeof FLOW_SKILLS)[number]

/** The stage each template serves. */
export const FLOW_SKILL_STAGE: Record<FlowSkill, FlowStage> = {
  'new-ticket': 'capture', triage: 'capture', 'start-ticket': 'plan', repro: 'plan', 'open-pr': 'pr', 'review-pr': 'review', 'wrap-up': 'merge', release: 'release',
}

/** Skills Tower may run that are Claude Code's own, never in a repository. */
export const BUILTIN_SKILLS: readonly string[] = ['code-review']

/** What the person and the brief give; everything a template says about the repository comes from here. */
export type FlowValues = {
  project: string
  baseBranch: string
  tickets: 'github' | 'linear'
  /** `owner/name` whose issues are the tickets (github). */
  ticketsRepo: string | null
  /** The Linear ids' prefix, `ABC` for `ABC-12` (linear). */
  idPrefix: string | null
  talkLanguage: string
  publishLanguage: string
  /** The build command; null when there is nothing to build. */
  build: string | null
  /** The command for a ticket's checks. */
  test: string
  /** The whole suite when it differs from `test` (run in release); null: the same. */
  fullSuite: string | null
  /** CI runs on pull requests. */
  ci: boolean
  /** How a release ships, in words or a command (`npm publish`, `a GitHub release`). */
  releaseHow: string
  /** The release tag's prefix: `release-` gives `release-<n>`. */
  releaseTagPrefix: string
  /** Where testers' or users' feedback comes from, for triage. */
  feedbackSource: string
  /** The repository's own rules, each with its source (`main is production (CLAUDE.md:12)`). */
  rules: string[]
  /** Where ticket worktrees go: `~/tower-work/<repo>`. */
  worktreeRoot: string
}

export type FlowValuesResult = { ok: true; values: FlowValues } | { ok: false; errors: string[] }

const STRING_FIELDS = ['project', 'baseBranch', 'talkLanguage', 'publishLanguage', 'test', 'releaseHow', 'releaseTagPrefix', 'feedbackSource', 'worktreeRoot'] as const
const NULLABLE_FIELDS = ['ticketsRepo', 'idPrefix', 'build', 'fullSuite'] as const
const ALL_FIELDS: readonly string[] = [...STRING_FIELDS, ...NULLABLE_FIELDS, 'tickets', 'ci', 'rules']

/** The values when they hold together, else every error as `field: what is wrong`. */
export function validateFlowValues(raw: unknown): FlowValuesResult {
  const errors: string[] = []
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, errors: ['values: expected an object'] }
  const value = raw as Record<string, unknown>
  for (const key of Object.keys(value)) if (!ALL_FIELDS.includes(key)) errors.push(`${key}: unknown field`)
  for (const key of STRING_FIELDS) if (typeof value[key] !== 'string' || (value[key] as string).trim() === '') errors.push(`${key}: expected a non-empty string`)
  for (const key of NULLABLE_FIELDS) if (value[key] !== null && (typeof value[key] !== 'string' || (value[key] as string).trim() === '')) errors.push(`${key}: expected a non-empty string or null`)
  if (value.tickets !== 'github' && value.tickets !== 'linear') errors.push(`tickets: expected 'github' or 'linear' (a flow needs tickets)`)
  if (typeof value.ci !== 'boolean') errors.push('ci: expected true or false')
  if (!Array.isArray(value.rules) || value.rules.some(rule => typeof rule !== 'string')) errors.push('rules: expected a list of strings')
  if (value.tickets === 'github' && (typeof value.ticketsRepo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(value.ticketsRepo))) errors.push('ticketsRepo: GitHub issues need owner/name')
  if (value.tickets === 'linear' && (typeof value.idPrefix !== 'string' || !/^[A-Z][A-Z0-9]{0,9}$/.test(value.idPrefix))) errors.push('idPrefix: Linear ids need their prefix in capitals (ABC for ABC-12)')
  if (typeof value.baseBranch === 'string' && !/^[\w./-]+$/.test(value.baseBranch)) errors.push('baseBranch: not a branch name')
  if (typeof value.releaseTagPrefix === 'string' && !/^[A-Za-z]+[-_]$/.test(value.releaseTagPrefix)) errors.push('releaseTagPrefix: letters and a separator (release-), so Tower reads the tags')
  return errors.length > 0 ? { ok: false, errors } : { ok: true, values: value as unknown as FlowValues }
}

/** Every `{{NAME}}` a template may use, from the values. */
export function flowPlaceholders(values: FlowValues): Record<string, string> {
  const github = values.tickets === 'github'
  const repoFlag = github ? ` --repo ${values.ticketsRepo}` : ''
  const id = github ? '#<n>' : `${values.idPrefix}-<n>`
  return {
    PROJECT: values.project,
    BASE_BRANCH: values.baseBranch,
    TALK_LANGUAGE: values.talkLanguage,
    PUBLISH_LANGUAGE: values.publishLanguage,
    BUILD: values.build ?? 'nothing to build',
    TEST: values.test,
    FULL_SUITE: values.fullSuite ?? values.test,
    RELEASE_HOW: values.releaseHow,
    RELEASE_TAG: `${values.releaseTagPrefix}<n>`,
    RELEASE_TAG_PREFIX: values.releaseTagPrefix,
    FEEDBACK_SOURCE: values.feedbackSource,
    RULES: values.rules.length > 0 ? values.rules.map(rule => `- ${rule}`).join('\n') : '- (none written yet)',
    TICKET: github ? 'GitHub issue' : 'Linear issue',
    TICKET_ID: id,
    TICKET_ARG: github ? '<issue number>' : `<ticket id, ${values.idPrefix}-123>`,
    TICKET_EXAMPLE: github ? '#12' : `${values.idPrefix}-123`,
    TICKET_READ: github ? `\`gh issue view <n>${repoFlag} --comments\`` : `the Linear MCP \`get_issue\` on \`${values.idPrefix}-<n>\` (the body, the labels, the comments, the parent, \`blockedBy\`)`,
    TICKET_CREATE: github ? `\`gh issue create${repoFlag} --title "<title>" --body-file <file> --label <label>\`` : 'the Linear MCP `save_issue`, in the team the person names',
    TICKET_COMMENT: github ? `\`gh issue comment <n>${repoFlag} --body-file <file>\`` : 'the Linear MCP `save_comment`',
    TICKET_CLOSE: github ? `\`Closes #<n>\` in the pull request's body closes the issue with the merge; check it with \`gh issue view <n>${repoFlag} --json state\`` : `move the Linear issue to Done with the Linear MCP \`save_issue\``,
    TICKET_LABELS: github ? '`bug` for a defect, `enhancement` for a new behaviour' : 'the label `bug` for a defect, `feature` for a new behaviour',
    PR_LINKS: github ? 'Closes #<n>' : `${values.idPrefix}-<n>`,
    BRANCH_RULE: github
      ? '`fix/<n>-<slug>` for an issue labelled `bug`, else `feature/<n>-<slug>`; the slug is the title\'s first words, lower case, `-` between them'
      : `the branch name Linear suggests for the issue (\`gitBranchName\`); without one, \`${values.idPrefix?.toLowerCase()}-<n>-<slug>\``,
    WORKTREE_PATH: `${values.worktreeRoot}/${github ? '<n>' : `${values.idPrefix}-<n>`}-<slug>`,
    BLOCKER_RULE: github ? '' : '- When an open blocker ticket already has a branch on origin, cut the worktree from that branch instead of the base branch, and record it as `base` in the state file.\n',
    CHECKS_READ: values.ci
      ? 'CI runs on the pull request: its result on the head commit (`headRefOid`) is the check. A run on an older commit, or none, is not a pass.'
      : '`checks.sha` in the worktree\'s `.work/state.json` must equal the head commit (`headRefOid`); when it does not, the checks are stale.',
  }
}

const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g

/** A template filled; `missing`: placeholders the values do not give (the text keeps them). */
export function renderFlowSkill(template: string, values: FlowValues): { text: string; missing: string[] } {
  const known = flowPlaceholders(values)
  const missing = new Set<string>()
  const text = template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = known[name]
    if (value === undefined) {
      missing.add(name)
      return whole
    }
    return value
  })
  return { text, missing: [...missing] }
}

/** A skill to propose: the template, the stage it covers, and why. */
export type MissingSkill = { skill: FlowSkill; stage: FlowStage; reason: string }

/** A stage covered only in part: what is missing, listed, no template. */
export type StageNote = { stage: FlowStage; note: string }

/**
 * Only what is missing (plan, tower-setup 2): a template for each stage the repository does not cover, none whose name
 * the repository already uses; for a stage covered in part a note instead.
 */
export function missingFlowSkills(facts: ScanFacts): { skills: MissingSkill[]; notes: StageNote[] } {
  const have = new Set(facts.skills.map(skill => skill.name))
  const coverage = Object.fromEntries(facts.flow.map(row => [row.stage, row.coverage])) as Record<FlowStage, string>
  const skills: MissingSkill[] = []
  const notes: StageNote[] = []
  const add = (skill: FlowSkill, reason: string) => {
    if (!have.has(skill)) skills.push({ skill, stage: FLOW_SKILL_STAGE[skill], reason })
  }
  if (coverage.capture === 'no') {
    add('new-ticket', 'no skill turns a request into a ticket, after a yes')
    add('triage', 'no skill turns one piece of feedback into a ticket')
  }
  if (coverage.plan === 'no') {
    add('start-ticket', 'no skill makes the worktree and writes a plan to approve before any code; Tower reads the phase from its state file')
    add('repro', 'no skill proves a bug before its plan')
  } else if (coverage.plan === 'partial') {
    notes.push({ stage: 'plan', note: 'the start skill writes no state file: Tower reads the phase from git; a `.work/state.json` with `phase` planning / implementing would show "say go"' })
  }
  if (coverage.pr === 'no') add('open-pr', 'no skill publishes the branch and opens the pull request, with the checks recorded on the head')
  if (coverage.verification === 'no' && coverage.pr !== 'no') notes.push({ stage: 'verification', note: 'the pull request skill records no checks and no CI runs on pull requests: record `checks: { sha, at, ran }` in the state file, or add CI' })
  if (coverage.review === 'no') add('review-pr', 'no skill writes a review comment Tower can read (`## Review (round N)` and a verdict line)')
  else if (coverage.review === 'partial') notes.push({ stage: 'review', note: 'the review skill has no `## <Heading> (round N)` with a verdict line or a blockers section: Tower cannot tell a ready review' })
  if (coverage.merge === 'no') add('wrap-up', 'no skill merges after an explicit yes and removes the worktree')
  if (coverage.release === 'no' || coverage.release === 'partial') add('release', coverage.release === 'partial' ? 'releases are only CI on pushes or tags: a release skill shows what ships, asks, and tags it' : 'no skill ships what is merged')
  return { skills, notes }
}

/** A large piece of missing work, proposed as one of the first tickets of the new flow (created only after a yes). */
export type FirstTicket = { title: string; body: string; label: 'bug' | 'enhancement' }

export function firstTickets(facts: ScanFacts): FirstTicket[] {
  const out: FirstTicket[] = []
  if (!facts.tests.value) {
    out.push({ title: 'Add a first test suite', label: 'enhancement', body: 'The repository has no tests. Add a test runner, one passing test for the main behaviour, and a `test` command; start-ticket and open-pr run it for every ticket.' })
  }
  // Checks the skills record on the head commit cover the verification stage (oink's choice: the suite at release).
  if (!facts.ci.value && !(facts.stateFile?.checks.value ?? false)) {
    out.push({ title: 'Run the tests on every pull request (CI)', label: 'enhancement', body: 'No workflow runs on pull requests. Add one that runs the test command on each pull request; until then the checks are the ones open-pr records in the state file.' })
  }
  return out
}

/** The skills a configuration runs that are neither in `available` nor Claude Code's own (steps, review, env, actions). */
export function missingSkills(config: TowerConfig, available: readonly string[]): string[] {
  const used = [
    ...Object.values(config.workflow.steps).map(step => step.skill),
    config.review.skill,
    ...(config.env.kind === 'skill' ? [config.env.name] : []),
    ...config.repoActions.map(action => action.skill),
  ]
  return [...new Set(used)].filter(skill => !available.includes(skill) && !BUILTIN_SKILLS.includes(skill)).sort()
}

/** The values the scan can fill; the skill completes them from the brief and the person's answers. */
export function draftFlowValues(facts: ScanFacts): FlowValues {
  const script = (re: RegExp) => facts.scripts.map(one => one.value).find(value => re.test(value))?.replace(/^(npm run [\w:-]+):.*$/, '$1') ?? null
  const ticketsRepo = facts.tickets.repo ?? facts.remote?.slug ?? null
  const repo = (facts.remote?.slug?.split('/')[1] ?? facts.root.split('/').pop() ?? 'repo').toLowerCase()
  return {
    project: facts.name.value,
    baseBranch: facts.baseBranch.value,
    tickets: facts.tickets.value === 'linear' ? 'linear' : 'github',
    ticketsRepo: facts.tickets.value === 'linear' ? null : ticketsRepo,
    idPrefix: facts.tickets.value === 'linear' ? facts.tickets.prefix : null,
    talkLanguage: facts.rules.language?.value ?? 'English',
    publishLanguage: 'English',
    build: script(/^npm run build:/),
    test: script(/^npm run test:/) ?? 'npm test',
    fullSuite: null,
    ci: facts.ci.value,
    releaseHow: 'a tag on the base branch',
    releaseTagPrefix: 'release-',
    feedbackSource: 'a message, a bug report or a user\'s feedback the person points to',
    rules: facts.rules.noDirectToMain !== null ? [`${facts.rules.noDirectToMain.value} (${facts.rules.noDirectToMain.evidence.join(', ')})`] : [],
    worktreeRoot: `~/tower-work/${repo}`,
  }
}
