// `routing: 'defaults'` (decision 054): Tower's own routing for a repository that brings none.
// The delegation roles, their models, the built-in routes and the main guidance are Tower's (decision 003, written in
// profile.ts TOWER_ROUTING); the skills are the repository's own, read from `.claude/skills/*/SKILL.md`, and
// run on the model and effort every session starts with (TOWER_SESSION_MODEL, else Claude Code's own): no `--model`.

import { renderTemplate, type TowerConfig } from './config'
import { TOWER_ROUTING, type Profile, type Skill } from './profile'

/** A skill of the repository: its `SKILL.md` frontmatter's `name` (else its folder) and `description`. */
export type RepoSkill = { name: string; description: string }

function unquote(value: string): string {
  const text = value.trim()
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) return text.slice(1, -1)
  return text
}

/**
 * The frontmatter of a `SKILL.md` (between the leading `---` lines): `name` and `description`, a folded or literal
 * block (`>`, `|`) read as its indented lines joined. Null without a frontmatter.
 */
export function parseSkillFile(text: string, folder: string): RepoSkill | null {
  const lines = text.replace(/^﻿/, '').split('\n')
  if (lines[0]?.trim() !== '---') return null
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end < 0) return null
  const fields: Record<string, string> = {}
  for (let at = 1; at < end; at++) {
    const match = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[at] ?? '')
    if (match === null) continue
    const key = match[1] as string
    let value = match[2] ?? ''
    if (/^[>|][+-]?$/.test(value.trim())) {
      const block: string[] = []
      while (at + 1 < end && (/^\s+\S/.test(lines[at + 1] ?? '') || (lines[at + 1] ?? '').trim() === '')) block.push((lines[++at] ?? '').trim())
      value = block.filter(line => line !== '').join(' ')
    }
    fields[key] = unquote(value)
  }
  const name = fields.name?.trim() || folder
  return name === '' ? null : { name, description: (fields.description ?? '').replace(/\s+/g, ' ').trim() }
}

/** The skills a configuration runs as hub sessions in the main checkout: its repository actions and its `hub` steps. */
function hubSkills(config: TowerConfig): Set<string> {
  return new Set([
    ...config.repoActions.map(action => action.skill),
    ...Object.values(config.workflow.steps).filter(step => step.session === 'hub').map(step => step.skill),
  ])
}

/** The review session's guidance in general words: the issue, whatever tracks it; the configuration's save path. */
function reviewGuidance(config: TowerConfig): string {
  const savePath = renderTemplate(config.review.savePath, { pr: '<n>', round: '<N>' })
  return [
    '# Delegation for a review',
    'Reading the diff and judging it is your work: read the pull request\'s diff yourself and write the review yourself.',
    'Everything mechanical goes to agents: `tower:runner` runs the `gh` commands (pr view, pr diff, pr comments, checks, posting the comment) and returns their output; `tower:scout` reads the repository\'s review criteria, the issue, the earlier review rounds, and the code around the changed lines, and returns a short brief; `tower:verifier` runs tests or type checks when the review needs a fact.',
    'Do not use forks.',
    'Announce each of your steps with one line `[step 2/5] what this step does` before the step\'s tool calls.',
    `Before you ask whether to post, save the final review, exactly as it would be posted, to the absolute path \`<worktree>/${savePath}\` (\`<n>\` the pull request, \`<N>\` the round).`,
  ].join('\n')
}

/**
 * The profile `routing: 'defaults'` makes: Tower's roles and routes, the repository's own skills (by name; hub when a
 * repository action or a `hub` step runs them, else the ticket's) on the session's own model and effort (`model` and
 * `effort` null), and no skill of another configuration.
 */
export function defaultsProfile(config: TowerConfig, repoSkills: readonly RepoSkill[]): Profile {
  const hubs = hubSkills(config)
  const seen = new Set<string>()
  const skills: Skill[] = []
  for (const skill of [...repoSkills].sort((a, b) => a.name.localeCompare(b.name))) {
    if (seen.has(skill.name)) continue
    seen.add(skill.name)
    skills.push({ name: skill.name, what: skill.description, where: hubs.has(skill.name) ? 'hub' : 'ticket', model: null, effort: null })
  }
  return {
    baseBranch: config.project.baseBranch,
    roles: TOWER_ROUTING.roles,
    skills,
    modelIds: TOWER_ROUTING.modelIds,
    builtinRoutes: TOWER_ROUTING.builtinRoutes,
    forkAdvice: TOWER_ROUTING.forkAdvice,
    mainGuidance: TOWER_ROUTING.mainGuidance,
    reviewGuidance: reviewGuidance(config),
  }
}
