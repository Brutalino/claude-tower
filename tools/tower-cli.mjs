// tower-setup's command line (decisions 061, 065): runs Tower's own TypeScript (hooks/core/config.ts, setupScan.ts,
// setupFlow.ts) under node, which strips the types itself (node 22.18+, 23.6+); a resolve hook adds the `.ts` the
// imports leave out. Read only, but `save` (one file in Tower's state folder), `render` (the folder it is given) and
// `deliver` (the skills into the repository, one commit; never a push). Called by tools/tower-config.sh and
// tools/tower-setup-scan.sh; usage in those scripts.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

registerHooks({
  resolve(specifier, context, next) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
      const url = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(fileURLToPath(url))) return next(url.href, context)
    }
    return next(specifier, context)
  },
})

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { mainCheckoutFromListing, storedConfigPath, validateConfig } = await import(join(PLUGIN, 'hooks/core/config.ts'))
const { proposeConfig, referencedDocs, scanRepo, textsToRead } = await import(join(PLUGIN, 'hooks/core/setupScan.ts'))
const { draftFlowValues, firstTickets, FLOW_SKILLS, missingFlowSkills, missingSkills, renderFlowSkill, validateFlowValues } = await import(join(PLUGIN, 'hooks/core/setupFlow.ts'))
const { parseSkillFile } = await import(join(PLUGIN, 'hooks/core/routingDefaults.ts'))
const TEMPLATES = join(PLUGIN, 'skills/tower-setup/flow')
const FLOW_BRANCH = 'tower/setup-flow'

const MAX_TEXT = 200_000

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

/** A read-only git command in `cwd`; null when it fails. */
function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).replace(/\n$/, '')
  } catch {
    return null
  }
}

function lines(text) {
  return text === null || text === '' ? [] : text.split('\n')
}

/** The main checkout of a folder inside a git repository (a worktree's included); null outside one. */
function mainCheckout(folder) {
  return mainCheckoutFromListing(git(folder, ['worktree', 'list', '--porcelain']))
}

function home() {
  return process.env.HOME ?? null
}

function expandHome(path) {
  const base = home()
  return base !== null && (path === '~' || path.startsWith('~/')) ? `${base.replace(/\/+$/, '')}${path.slice(1)}` : path
}

function real(path) {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function readJson(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    fail(`${file}: cannot read (${err.code ?? err.message})`)
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    fail(`${file}: not JSON (${err.message})`)
  }
}

function validated(file) {
  const result = validateConfig(readJson(file))
  if (!result.ok) fail(`${file}: not a valid Tower configuration\n${result.errors.map(error => `  ${error}`).join('\n')}`)
  return result.config
}

function stateDir() {
  const state = process.env.TOWER_STATE_DIR
  if (state) return state
  if (!home()) fail('no HOME and no TOWER_STATE_DIR: nowhere to save')
  return `${home().replace(/\/+$/, '')}/.claude/tower`
}

/** The `<name>/SKILL.md` folders of a folder of skills: their names and texts. */
function skillFolders(dir) {
  const out = []
  let entries = []
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const folder of entries.sort()) {
    const file = join(dir, folder, 'SKILL.md')
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    out.push({ folder, name: parseSkillFile(text, folder)?.name ?? folder, text })
  }
  return out
}

/** A checkout's skills folder, or a folder of skills itself. */
function skillsDirOf(dir) {
  return existsSync(join(dir, '.claude/skills')) ? join(dir, '.claude/skills') : dir
}

function scan(repo, withSkills) {
  const root = mainCheckout(repo)
  if (root === null) fail(`${repo}: not a git repository`)
  const listed = lines(git(root, ['ls-files', '--cached', '--others', '--exclude-standard']))
  // The skills from the disk too: `.claude/skills` may be a symbolic link (to `.agents/skills`, say), which git
  // lists as one file; Tower's sessions read them from the disk the same way (routingDefaults).
  const skills = []
  try {
    for (const folder of readdirSync(join(root, '.claude/skills'))) {
      if (existsSync(join(root, '.claude/skills', folder, 'SKILL.md'))) skills.push(`.claude/skills/${folder}/SKILL.md`)
    }
  } catch {
    // No skills folder.
  }
  const paths = [...new Set([...listed, ...skills])]
  const texts = {}
  const read = list => {
    for (const path of list) {
      try {
        const text = readFileSync(join(root, path), 'utf8')
        texts[path] = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text
      } catch {
        // A path git lists but the disk lacks (deleted, not staged): skipped.
      }
    }
  }
  read(textsToRead(paths))
  // Skills rendered but not delivered yet: the proposal as it will be once they are in the repository.
  if (withSkills !== null) {
    for (const skill of skillFolders(withSkills)) {
      const path = `.claude/skills/${skill.folder}/SKILL.md`
      if (!paths.includes(path)) paths.push(path)
      texts[path] = skill.text
    }
  }
  read(referencedDocs(texts, paths))
  const facts = scanRepo({
    root,
    home: home(),
    originUrl: git(root, ['remote', 'get-url', 'origin']),
    originHead: git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
    listing: git(root, ['worktree', 'list', '--porcelain']),
    branches: lines(git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])),
    tags: lines(git(root, ['tag', '--sort=-creatordate'])).slice(0, 200),
    paths,
    texts,
  })
  return { facts, proposal: proposeConfig(facts), flow: { ...missingFlowSkills(facts), firstTickets: firstTickets(facts), values: draftFlowValues(facts) } }
}

function render(valuesFile, out, names) {
  const result = validateFlowValues(readJson(valuesFile))
  if (!result.ok) fail(`${valuesFile}: not valid flow values\n${result.errors.map(error => `  ${error}`).join('\n')}`)
  const chosen = names.length > 0 ? names : [...FLOW_SKILLS]
  const unknown = chosen.filter(name => !FLOW_SKILLS.includes(name))
  if (unknown.length > 0) fail(`no template for ${unknown.join(', ')} (templates: ${FLOW_SKILLS.join(', ')})`)
  const rendered = chosen.map(name => ({ name, ...renderFlowSkill(readFileSync(join(TEMPLATES, `${name}.md`), 'utf8'), result.values) }))
  const missing = rendered.filter(one => one.missing.length > 0)
  if (missing.length > 0) fail(missing.map(one => `${one.name}: no value for ${one.missing.map(name => `{{${name}}}`).join(', ')}`).join('\n'))
  for (const one of rendered) {
    mkdirSync(join(out, one.name), { recursive: true })
    writeFileSync(join(out, one.name, 'SKILL.md'), one.text)
    process.stdout.write(`rendered ${join(out, one.name, 'SKILL.md')}\n`)
  }
}

/** Writes the skills into a checkout's skills folder and commits only them; the paths git sees (through a link too). */
function commitSkills(checkout, skills, message) {
  const linkDir = join(checkout, '.claude/skills')
  mkdirSync(existsSync(linkDir) ? realpathSync(linkDir) : linkDir, { recursive: true })
  const dir = realpathSync(linkDir)
  const paths = []
  for (const skill of skills) {
    mkdirSync(join(dir, skill.folder), { recursive: true })
    writeFileSync(join(dir, skill.folder, 'SKILL.md'), skill.text)
    paths.push(relative(realpathSync(checkout), join(dir, skill.folder, 'SKILL.md')))
  }
  const run = args => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  run(['add', '--', ...paths])
  run(['commit', '-q', '-m', message, '--', ...paths])
  return run(['rev-parse', '--short', 'HEAD']).trim()
}

function deliver(repo, rendered, how, base, names) {
  const main = mainCheckout(repo) ?? fail(`${repo}: not a git repository`)
  const all = skillFolders(rendered)
  const skills = names.length > 0 ? all.filter(skill => names.includes(skill.folder)) : all
  const absent = names.filter(name => !all.some(skill => skill.folder === name))
  if (absent.length > 0) fail(`${rendered}: no ${absent.join(', ')}/SKILL.md`)
  if (skills.length === 0) fail(`${rendered}: no skill to deliver`)
  const taken = skills.filter(skill => existsSync(join(main, '.claude/skills', skill.folder)))
  if (taken.length > 0) fail(`${main}: .claude/skills already has ${taken.map(skill => skill.folder).join(', ')}; nothing delivered`)
  const message = `Add Tower's flow skills: ${skills.map(skill => skill.folder).join(', ')}`
  if (how === 'commit') {
    const branch = git(main, ['symbolic-ref', '--short', 'HEAD'])
    if (branch !== base) fail(`${main} is on ${branch ?? 'a detached HEAD'}, not ${base}: deliver by pr, or switch the main checkout to ${base} first`)
    const sha = commitSkills(main, skills, message)
    process.stdout.write(`committed ${sha} on ${base}: ${skills.map(skill => skill.folder).join(', ')}\n`)
    return
  }
  if (git(main, ['rev-parse', '--verify', '--quiet', `refs/heads/${FLOW_BRANCH}`]) !== null) fail(`${main}: the branch ${FLOW_BRANCH} exists already; nothing delivered`)
  const start = git(main, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${base}`]) !== null ? `origin/${base}` : base
  const temp = mkdtempSync(join(tmpdir(), 'tower-setup-flow-'))
  const worktree = join(temp, 'worktree')
  try {
    execFileSync('git', ['-C', main, 'worktree', 'add', '-q', '--no-track', '-b', FLOW_BRANCH, worktree, start], { stdio: ['ignore', 'pipe', 'pipe'] })
    const sha = commitSkills(worktree, skills, message)
    process.stdout.write(`committed ${sha} on ${FLOW_BRANCH} (from ${start}): ${skills.map(skill => skill.folder).join(', ')}\n`)
    process.stdout.write(`next, after the person's yes: git -C ${main} push -u origin ${FLOW_BRANCH}; gh pr create --base ${base} --head ${FLOW_BRANCH}\n`)
  } finally {
    if (existsSync(worktree)) execFileSync('git', ['-C', main, 'worktree', 'remove', '--force', worktree], { stdio: 'ignore' })
    rmSync(temp, { recursive: true, force: true })
  }
}

function save(file, checkout, replace) {
  const config = validated(file)
  const main = mainCheckout(checkout) ?? fail(`${checkout}: not a git repository`)
  if (config.project.mainCheckout !== null && real(expandHome(config.project.mainCheckout)) !== real(main)) {
    fail(`${file}: project.mainCheckout is ${config.project.mainCheckout}, but ${checkout} belongs to ${main}`)
  }
  const target = storedConfigPath(stateDir(), main)
  const text = `${JSON.stringify(config, null, 2)}\n`
  const exists = existsSync(target)
  if (exists && readFileSync(target, 'utf8') === text) {
    process.stdout.write(`unchanged ${target}\n`)
    return
  }
  mkdirSync(dirname(target), { recursive: true })
  const temp = `${target}.tmp-${process.pid}`
  writeFileSync(temp, text)
  if (exists && !replace) {
    const diff = spawnSync('diff', ['-u', '--label', `${target} (stored)`, '--label', `${file} (new)`, target, temp], { encoding: 'utf8' })
    unlinkSync(temp)
    process.stdout.write(diff.stdout)
    fail(`${target} exists and differs (the diff above); nothing written. Run again with --replace to overwrite it.`, 3)
  }
  renameSync(temp, target)
  process.stdout.write(`${exists ? 'replaced' : 'saved'} ${target}\n`)
}

const [command, ...args] = process.argv.slice(2)
const flags = []
const options = {}
const plain = []
for (let at = 0; at < args.length; at++) {
  const arg = args[at]
  if (arg === '--with-skills' || arg === '--skills') options[arg] = args[++at] ?? fail(`${arg} needs a folder`, 2)
  else if (arg.startsWith('--')) flags.push(arg)
  else plain.push(arg)
}
const unknown = flags.filter(flag => !['--replace', '--config'].includes(flag))
if (unknown.length > 0) fail(`unknown option ${unknown.join(' ')}`, 2)

if (command === 'validate' && plain.length === 1) {
  const config = validated(plain[0])
  if (options['--skills'] !== undefined) {
    const available = skillFolders(skillsDirOf(options['--skills'])).map(skill => skill.name)
    const missing = missingSkills(config, available)
    if (missing.length > 0) fail(`${plain[0]}: runs skills ${options['--skills']} does not have: ${missing.join(', ')}`)
  }
  process.stdout.write(`ok ${config.project.name} (${config.project.repo})\n`)
} else if (command === 'save' && plain.length === 2) {
  save(plain[0], plain[1], flags.includes('--replace'))
} else if (command === 'path' && plain.length === 1) {
  const main = mainCheckout(plain[0]) ?? fail(`${plain[0]}: not a git repository`)
  process.stdout.write(`${storedConfigPath(stateDir(), main)}\n`)
} else if (command === 'render' && plain.length >= 2) {
  render(plain[0], plain[1], plain.slice(2))
} else if (command === 'deliver' && plain.length >= 4 && ['commit', 'pr'].includes(plain[2])) {
  deliver(plain[0], plain[1], plain[2], plain[3], plain.slice(4))
} else if (command === 'scan' && plain.length === 1) {
  const result = scan(plain[0], options['--with-skills'] ?? null)
  process.stdout.write(`${JSON.stringify(flags.includes('--config') ? result.proposal.config : result, null, 2)}\n`)
} else {
  fail([
    'usage: tower-config.sh validate <file> [--skills <checkout or skills folder>]',
    '       tower-config.sh save <file> <main checkout or worktree> [--replace]',
    '       tower-config.sh path <main checkout or worktree>',
    '       tower-config.sh render <values.json> <out folder> [skill …]',
    '       tower-config.sh deliver <repository> <rendered folder> commit|pr <base branch> [skill …]',
    '       tower-setup-scan.sh <repository> [--config] [--with-skills <rendered folder>]',
  ].join('\n'), 2)
}
