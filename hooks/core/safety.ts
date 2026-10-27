// Decision 037: risky commands, credential files and secret masking. Ideas from the MIT mods launch-codes, tessera,
// blast-radius, secret-redactor and honmoon; the code is Tower's own.

/** `block`: always denied; `confirm`: the person answers a dialog; `ok`: the session's own rules decide. */
export type RiskLevel = 'block' | 'confirm' | 'ok'
export type Risk = { level: RiskLevel; reason: string }

/**
 * Where the command runs: its cwd, the ticket's worktree, the main checkout, the branch checked out there, `$HOME`;
 * `baseBranch` (config project.baseBranch) is protected besides Tower's own.
 */
export type RiskContext = { cwd: string | null; worktree: string | null; main: string | null; branch: string | null; home: string | null; baseBranch: string }

const OK: Risk = { level: 'ok', reason: '' }
/** Never force-pushed to: Tower's own and the repository's base branch. */
const PROTECTED = ['main', 'master', 'production']
const BUILD_DIRS = new Set(['build', 'dist', 'node_modules', '.next', 'coverage'])
const WRAPPERS = new Set(['sudo', 'env', 'command', 'time', 'nohup', 'exec'])
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash'])
const READERS = new Set(['cat', 'less', 'more', 'head', 'tail', 'bat'])
/** Commands whose text may name a statement without running it (`grep "DROP TABLE"`, a commit message). */
const TEXT_ONLY = new Set(['echo', 'printf', 'grep', 'rg', 'git', 'cat', 'less', 'head', 'tail'])

// ── Shell words ─────────────────────────────────────────────────────────────

type Stage = string[]
/** One pipeline and the operator that joined it to the previous one. */
type Pipeline = { stages: Stage[] }

/** Splits a command line into pipelines of word lists: quotes removed, operators (`&&`, `||`, `;`, `&`, `|`, newline) honoured. */
export function shellWords(command: string): Pipeline[] {
  const pipelines: Pipeline[] = []
  let stages: Stage[] = []
  let words: string[] = []
  let word = ''
  let inWord = false
  const endWord = () => { if (inWord) words.push(word); word = ''; inWord = false }
  const endStage = () => { endWord(); if (words.length > 0) stages.push(words); words = [] }
  const endPipeline = () => { endStage(); if (stages.length > 0) pipelines.push({ stages }); stages = [] }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (c === "'") {
      const end = command.indexOf("'", i + 1)
      const stop = end < 0 ? command.length : end
      word += command.slice(i + 1, stop); inWord = true; i = stop
    } else if (c === '"') {
      let j = i + 1
      while (j < command.length && command[j] !== '"') { if (command[j] === '\\' && j + 1 < command.length) j++; word += command[j]; j++ }
      inWord = true; i = j
    } else if (c === '\\' && i + 1 < command.length) {
      word += command[i + 1]; inWord = true; i++
    } else if (c === '|' && command[i + 1] === '|') { endPipeline(); i++ }
    else if (c === '&' && command[i + 1] === '&') { endPipeline(); i++ }
    else if (c === '|') endStage()
    else if (c === ';' || c === '\n' || c === '&') endPipeline()
    else if (c === ' ' || c === '\t') endWord()
    else { word += c; inWord = true }
  }
  endPipeline()
  return pipelines
}

/** The words after `sudo`, `env`, `VAR=value` and the like: the command that actually runs. */
function bare(stage: Stage): Stage {
  let i = 0
  const word = (at: number) => stage[at] ?? ''
  while (i < stage.length && (WRAPPERS.has(word(i)) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(word(i)) || (i > 0 && WRAPPERS.has(word(i - 1)) && word(i).startsWith('-')))) i++
  return stage.slice(i)
}

// ── Paths ───────────────────────────────────────────────────────────────────

function normalise(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return '/' + parts.join('/')
}

/** An absolute path, or null when it names a variable other than `$HOME` (nothing to resolve it with). */
function resolvePath(raw: string, cwd: string | null, home: string | null): string | null {
  let path = raw
  if (/^(~|\$HOME|\$\{HOME\})(\/|$)/.test(path)) {
    if (home === null) return null
    path = home + path.replace(/^(~|\$HOME|\$\{HOME\})/, '')
  }
  if (path.includes('$') || path.startsWith('~')) return null
  if (!path.startsWith('/')) {
    if (cwd === null) return null
    path = `${cwd}/${path}`
  }
  return normalise(path)
}

function inside(path: string, root: string): boolean {
  const base = normalise(root)
  return path === base || path.startsWith(base === '/' ? '/' : base + '/')
}

// ── The classifier ──────────────────────────────────────────────────────────

const block = (reason: string): Risk => ({ level: 'block', reason })
const confirm = (reason: string): Risk => ({ level: 'confirm', reason })

function worst(risks: readonly Risk[]): Risk {
  return risks.find(risk => risk.level === 'block') ?? risks.find(risk => risk.level === 'confirm') ?? OK
}

/** Classifies a Bash command line: the worst of its parts, `cd` followed through `&&` and `;`. */
export function riskOf(command: string, ctx: RiskContext): Risk {
  const risks: Risk[] = []
  // `curl … | sh`, `sh <(curl …)`, `bash -c "$(curl …)"`: a script from the network runs unread.
  if (/\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(sh|bash|zsh|dash)\b/.test(command) || /\b(sh|bash|zsh|dash)\s+(-c\s+)?["']?(<\(|\$\()\s*(curl|wget)\b/.test(command)) {
    risks.push(block('a script piped from the network into a shell'))
  }
  let cwd = ctx.cwd
  for (const pipeline of shellWords(command)) {
    for (const raw of pipeline.stages) {
      const stage = bare(raw)
      if (stage.length === 0) continue
      if (stage[0] === 'cd' && pipeline.stages.length === 1) {
        cwd = stage[1] === undefined ? ctx.home : resolvePath(stage[1], cwd, ctx.home)
        continue
      }
      risks.push(stageRisk(stage, { ...ctx, cwd }))
    }
  }
  return worst(risks)
}

function stageRisk(stage: Stage, ctx: RiskContext): Risk {
  const name = stage[0] ?? ''
  const args = stage.slice(1)
  // `bash -c "…"`: the quoted command is classified as a command of its own.
  if (SHELLS.has(name) && args[0] === '-c' && args[1] !== undefined) return riskOf(args[1], ctx)
  if (name === 'eval') return riskOf(args.join(' '), ctx)
  if (!TEXT_ONLY.has(name) && /\bdrop\s+(database|table)\b/i.test(args.join(' '))) return block('DROP DATABASE / DROP TABLE')
  if (name === 'git') return gitRisk(args, ctx)
  if (name === 'rm') return rmRisk(args, ctx)
  if (name === 'gh' && args[0] === 'pr' && args[1] === 'merge') {
    // Also combined short flags holding one (`-sd`) and a method with a value (`--squash=true`).
    if (args.some(arg => arg === '--squash' || arg === '-s' || arg === '--rebase' || arg === '-r' || /^--(squash|rebase)=/.test(arg) || (/^-[a-zA-Z]{2,}$/.test(arg) && /[sr]/.test(arg)))) return block('pull requests are merged only with --merge')
    if (args.includes('--admin')) return block('gh pr merge --admin skips the branch protection')
    return confirm('merging a pull request')
  }
  if (name === 'vercel' && args.includes('--prod')) return confirm('a production deploy (vercel --prod)')
  if ((name === 'npm' || name === 'pnpm' || name === 'yarn') && args[0] === 'publish') return confirm(`publishing a package (${name} publish)`)
  if (name === 'terraform' && (args[0] === 'apply' || args[0] === 'destroy')) return confirm(`terraform ${args[0]}`)
  if (name === 'kubectl' && (args[0] === 'apply' || args[0] === 'delete')) return confirm(`kubectl ${args[0]}`)
  if (name === 'docker' && args[0] === 'system' && args[1] === 'prune') return confirm('docker system prune')
  return OK
}

function gitRisk(args: string[], ctx: RiskContext): Risk {
  // Global options before the subcommand; `-C <path>` moves where it runs.
  let cwd = ctx.cwd
  let i = 0
  while (i < args.length && (args[i] ?? '').startsWith('-')) {
    if (args[i] === '-C' || args[i] === '-c') {
      const path = args[i + 1]
      if (args[i] === '-C' && path !== undefined) cwd = resolvePath(path, cwd, ctx.home)
      i += 2
    } else i++
  }
  const sub = args[i]
  const rest = args.slice(i + 1)
  if (sub === undefined) return OK
  if (sub === 'stash') return block('git stash is not used here (Tower rule): commit on the ticket branch instead')
  if (rest.includes('--no-verify') || (sub === 'commit' && rest.some(arg => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(arg) && !arg.startsWith('--')))) {
    return block('--no-verify skips the hooks (Tower rule)')
  }
  const inMain = cwd !== null && ctx.main !== null && normalise(cwd) === normalise(ctx.main)
  if (inMain) {
    if (sub === 'reset' && rest.includes('--hard')) return block('git reset --hard in the main checkout')
    if (sub === 'checkout' && rest.includes('--') && rest.includes('.')) return block('git checkout -- . in the main checkout')
    if (sub === 'clean') {
      const flags = rest.filter(arg => /^-[a-zA-Z]+$/.test(arg)).join('')
      if ((flags.includes('f') || rest.includes('--force')) && flags.includes('d')) return block('git clean -fd in the main checkout')
    }
  }
  if (sub === 'push') return pushRisk(rest, ctx)
  return OK
}

function pushRisk(rest: string[], ctx: RiskContext): Risk {
  const lease = rest.some(arg => arg.startsWith('--force-with-lease'))
  const plainForce = rest.some(arg => arg === '--force' || arg === '-f' || (/^-[a-zA-Z]+$/.test(arg) && arg.includes('f')))
  const positional = rest.filter(arg => !arg.startsWith('-'))
  const refspecs = positional.slice(1)
  const plusRef = refspecs.some(ref => ref.startsWith('+'))
  if (!lease && !plainForce && !plusRef) return OK
  const targets = refspecs.length > 0
    ? refspecs.map(ref => ref.replace(/^\+/, '').split(':').pop()!.replace(/^refs\/heads\//, ''))
    : ctx.branch !== null ? [ctx.branch] : []
  const shown = lease && !plainForce ? 'git push --force-with-lease' : 'git push --force'
  const hit = targets.find(target => protectedBranches(ctx.baseBranch).includes(target))
  if (hit !== undefined) return block(`${shown} to ${hit}`)
  return confirm(`${shown}${targets.length > 0 ? ` to ${targets.join(', ')}` : ''}`)
}

/** `main`, `master`, `production` and the base branch (e.g. `staging`). */
export function protectedBranches(baseBranch: string): string[] {
  return PROTECTED.includes(baseBranch) ? [...PROTECTED] : [...PROTECTED, baseBranch]
}

function rmRisk(args: string[], ctx: RiskContext): Risk {
  const flags = args.filter(arg => arg.startsWith('-') && arg !== '--')
  const recursive = flags.some(flag => flag === '--recursive' || (/^-[a-zA-Z]+$/.test(flag) && /[rR]/.test(flag)))
  if (!recursive) return OK
  const targets = args.filter(arg => !arg.startsWith('-'))
  const root = ctx.worktree ?? ctx.main
  const risks = targets.map((raw): Risk => {
    if (/^(\/|\/\*|~\/?|\$HOME\/?|\$\{HOME\}\/?)$/.test(raw)) return block(`rm -rf ${raw}`)
    const path = resolvePath(raw.replace(/\/\*$/, ''), ctx.cwd, ctx.home)
    if (path === null) return confirm(`rm -rf ${raw}`)
    if (path === '/' || (ctx.home !== null && path === normalise(ctx.home))) return block(`rm -rf ${raw}`)
    if ((ctx.main !== null && path === normalise(ctx.main)) || (root !== null && path === normalise(root))) return block(`rm -rf of the repository root (${raw})`)
    if (root === null) return confirm(`rm -rf ${raw}`)
    if (!inside(path, root)) return block(`rm -rf outside the worktree (${raw})`)
    if (path.slice(normalise(root).length).split('/').some(part => BUILD_DIRS.has(part))) return OK
    return confirm(`rm -rf ${raw}`)
  })
  return worst(risks)
}

// ── Merge method ────────────────────────────────────────────────────────────

/** A word of a command line where it stands: `plain` when it is written as is (no quote, escape or expansion). */
type SpanWord = { text: string; start: number; end: number; plain: boolean }

const MERGE_METHODS = new Set(['--squash', '-s', '--rebase', '-r'])
const MERGE_FLAGS = new Set(['--merge', '-m'])
/** A word that reads as a merge method, `--merge`, `--admin` or short flags holding one of them. */
const FLAG_LIKE = /^-(-(squash|rebase|merge|admin)|[a-zA-Z]*[srm][a-zA-Z]*)(=|$)/
/** `gh pr merge`'s options that take a value: the next word is that value, never a flag. */
const MERGE_VALUES = new Set(['--subject', '-t', '--body', '-b', '--body-file', '-F', '--author-email', '-A', '--match-head-commit', '--repo', '-R'])

/**
 * The stages of a command line as words with their source positions; null when it cannot be read with certainty (an
 * unclosed quote, `$(`, backtick or heredoc). Quotes, escapes, `$(…)`, backticks and heredoc bodies stay inside their word
 * or are skipped; `(`, `)` and the operators end a stage; a `#` comment is skipped.
 */
function spanStages(command: string): SpanWord[][] | null {
  const n = command.length
  const stages: SpanWord[][] = []
  let words: SpanWord[] = []
  let start = -1
  let plain = true
  const endWord = (at: number) => { if (start >= 0) words.push({ text: command.slice(start, at), start, end: at, plain }); start = -1; plain = true }
  const endStage = (at: number) => { endWord(at); if (words.length > 0) stages.push(words); words = [] }
  const opaque = (at: number) => { if (start < 0) start = at; plain = false }
  // `<<` that opens a heredoc (not `<<<`).
  const heredocAt = (i: number) => command[i] === '<' && command[i + 1] === '<' && command[i + 2] !== '<' && command[i - 1] !== '<'
  // `<<-'EOF'`: the tag unquoted, whether tabs are stripped, and the index after it; null without a tag.
  const readTag = (from: number): { tag: string; strip: boolean; end: number } | null => {
    let i = from
    const strip = command[i] === '-'
    if (strip) i++
    while (command[i] === ' ' || command[i] === '\t') i++
    let tag = ''
    while (i < n && !/[\s;&|<>()]/.test(command[i]!)) {
      const c = command[i]!
      if (c === "'" || c === '"') {
        const end = command.indexOf(c, i + 1)
        if (end < 0) return null
        tag += command.slice(i + 1, end); i = end + 1
      } else if (c === '\\') { tag += command[i + 1] ?? ''; i += 2 }
      else { tag += c; i++ }
    }
    return tag === '' ? null : { tag, strip, end: i }
  }
  // After the newline at `from - 1`: the index past the bodies of the pending heredocs, each ended by its tag's line; -1
  // when a tag never comes.
  const skipBodies = (from: number, pending: readonly { tag: string; strip: boolean }[]): number => {
    let i = from
    for (const doc of pending) {
      for (;;) {
        const lineEnd = command.indexOf('\n', i)
        const line = command.slice(i, lineEnd < 0 ? n : lineEnd)
        if ((doc.strip ? line.replace(/^\t+/, '') : line) === doc.tag) { i = lineEnd < 0 ? n : lineEnd + 1; break }
        if (lineEnd < 0) return -1
        i = lineEnd + 1
      }
    }
    return i
  }
  const closeBacktick = (from: number): number => {
    for (let i = from; i < n; i++) {
      if (command[i] === '\\') i++
      else if (command[i] === '`') return i + 1
    }
    return -1
  }
  // The index after the `"` that closes a string opened before `from`; -1 when unclosed.
  const closeDouble = (from: number): number => {
    let i = from
    while (i < n) {
      const c = command[i]
      if (c === '"') return i + 1
      if (c === '\\') i += 2
      else if (c === '`') { i = closeBacktick(i + 1); if (i < 0) return -1 }
      else if (c === '$' && command[i + 1] === '(') { i = closeParen(i + 2); if (i < 0) return -1 }
      else i++
    }
    return -1
  }
  // The index after the `)` that closes a `$(` opened before `from`: quotes, nested parentheses and heredoc bodies
  // skipped; -1 when unclosed.
  const closeParen = (from: number): number => {
    let depth = 1
    let pending: { tag: string; strip: boolean }[] = []
    let i = from
    while (i < n) {
      const c = command[i]
      if (c === "'") { const end = command.indexOf("'", i + 1); if (end < 0) return -1; i = end + 1 }
      else if (c === '"') { i = closeDouble(i + 1); if (i < 0) return -1 }
      else if (c === '`') { i = closeBacktick(i + 1); if (i < 0) return -1 }
      else if (c === '\\') i += 2
      else if (heredocAt(i)) { const head = readTag(i + 2); if (head === null) return -1; pending.push(head); i = head.end }
      else if (c === '\n' && pending.length > 0) { i = skipBodies(i + 1, pending); pending = []; if (i < 0) return -1 }
      else if (c === '(') { depth++; i++ }
      else if (c === ')') { if (--depth === 0) return i + 1; i++ }
      else i++
    }
    return -1
  }
  let pending: { tag: string; strip: boolean }[] = []
  for (let i = 0; i < n; i++) {
    const c = command[i]!
    const next = command[i + 1]
    if (c === "'") {
      const end = command.indexOf("'", i + 1)
      if (end < 0) return null
      opaque(i); i = end
    } else if (c === '"') {
      const end = closeDouble(i + 1)
      if (end < 0) return null
      opaque(i); i = end - 1
    } else if (c === '`') {
      const end = closeBacktick(i + 1)
      if (end < 0) return null
      opaque(i); i = end - 1
    } else if (c === '$' && next === '(') {
      const end = closeParen(i + 2)
      if (end < 0) return null
      opaque(i); i = end - 1
    } else if (c === '$') opaque(i)
    else if (c === '\\' && next === '\n') { endWord(i); i++ }
    else if (c === '\\') { opaque(i); i++ }
    else if (c === '#' && start < 0) {
      // A comment, to the end of its line.
      const end = command.indexOf('\n', i)
      i = (end < 0 ? n : end) - 1
    } else if (heredocAt(i)) {
      const head = readTag(i + 2)
      if (head === null) return null
      endWord(i)
      words.push({ text: command.slice(i, head.end), start: i, end: head.end, plain: false })
      pending.push(head)
      i = head.end - 1
    } else if (c === '\n') {
      endStage(i)
      if (pending.length > 0) {
        const end = skipBodies(i + 1, pending)
        if (end < 0) return null
        pending = []
        i = end - 1
      }
    } else if (c === '&' && (next === '>' || (start >= 0 && (command[i - 1] === '>' || command[i - 1] === '<')))) opaque(i)
    else if (c === '|' || c === '&' || c === ';' || c === '(' || c === ')') endStage(i)
    else if (c === ' ' || c === '\t') endWord(i)
    else if (start < 0) start = i
  }
  if (pending.length > 0) return null
  endStage(n)
  return stages
}

/** A word as the shell would read it, quotes and escapes removed: enough to recognise a flag written in quotes. */
function looseText(word: SpanWord): string {
  return word.plain ? word.text : word.text.replace(/\\(.)/g, '$1').replace(/['"]/g, '')
}

/**
 * Decision 082: the command line with every `gh pr merge` stage's `--squash`, `-s`, `--rebase`, `-r` made `--merge` (one
 * `--merge`, none added when `--merge`/`-m` is there); null when there is nothing to rewrite or a stage cannot be
 * rewritten with certainty (a method in quotes or an expansion, combined short flags like `-sd`, `--squash=…`, `--admin`):
 * the block stays. Only the stage's own words change: quotes, heredocs, `$(…)` and other stages keep their text.
 */
export function mergeOnly(command: string): string | null {
  const stages = spanStages(command)
  if (stages === null) return null
  const edits: { start: number; end: number; text: string }[] = []
  for (const stage of stages) {
    let i = 0
    const loose = (at: number) => (stage[at] === undefined ? '' : looseText(stage[at]!))
    while (i < stage.length && (WRAPPERS.has(loose(i)) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(loose(i)) || (i > 0 && WRAPPERS.has(loose(i - 1)) && loose(i).startsWith('-')))) i++
    if (loose(i) !== 'gh' || loose(i + 1) !== 'pr' || loose(i + 2) !== 'merge') continue
    const methods: SpanWord[] = []
    let hasMerge = false
    let options = true
    for (let k = i + 3; k < stage.length; k++) {
      const word = stage[k]!
      const text = looseText(word)
      // A method or `--admin` in quotes, in an expansion or after `--` is not rewritten with certainty.
      if (!word.plain || !options) {
        if (FLAG_LIKE.test(text)) return null
        if (MERGE_VALUES.has(text)) k++
        continue
      }
      if (text === '--') options = false
      else if (text === '--admin' || /^--(squash|rebase|merge)=/.test(text)) return null
      else if (MERGE_METHODS.has(text)) methods.push(word)
      else if (MERGE_FLAGS.has(text)) hasMerge = true
      // `-sd`: combined short flags.
      else if (/^-[a-zA-Z]{2,}$/.test(text) && /[srm]/.test(text)) return null
      // An option's value is never a flag; one that reads as a method is ambiguous.
      else if (MERGE_VALUES.has(text)) {
        const value = stage[k + 1]
        if (value !== undefined && FLAG_LIKE.test(looseText(value))) return null
        k++
      }
    }
    methods.forEach((word, index) => {
      if (index === 0 && !hasMerge) edits.push({ start: word.start, end: word.end, text: '--merge' })
      else {
        // Removed with the blanks before it, so no double space is left.
        let from = word.start
        while (from > 0 && (command[from - 1] === ' ' || command[from - 1] === '\t')) from--
        edits.push({ start: from, end: word.end, text: '' })
      }
    })
  }
  if (edits.length === 0) return null
  let rewritten = command
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) rewritten = rewritten.slice(0, edit.start) + edit.text + rewritten.slice(edit.end)
  return rewritten
}

// ── Credential files ────────────────────────────────────────────────────────

/** `.env*` (not `.env.example`/`.env.sample`), `*.pem`, `*.key`, `id_rsa*` (not `.pub`), `*.p12`, `credentials*.json`. */
export function isCredentialFile(path: string): boolean {
  const name = path.split('/').pop() ?? ''
  if (/^\.env(\..*)?$/.test(name)) return !/^\.env\.(example|sample)$/.test(name)
  if (/^id_rsa/.test(name)) return !name.endsWith('.pub')
  return /\.(pem|key|p12)$/.test(name) || /^credentials.*\.json$/.test(name)
}

const CREDENTIAL_REASON = 'credential files are not read by the model; the person can open it themselves'

/** A `Read` of a credential file, or a Bash `cat|less|head|tail` of one: the reason to refuse it, else null. */
export function credentialRead(tool: string, input: Record<string, unknown>): string | null {
  if (tool === 'Read' && typeof input.file_path === 'string') return isCredentialFile(input.file_path) ? `${input.file_path}: ${CREDENTIAL_REASON}` : null
  if (tool !== 'Bash' || typeof input.command !== 'string') return null
  for (const pipeline of shellWords(input.command)) {
    for (const raw of pipeline.stages) {
      const [name, ...args] = bare(raw)
      if (name === undefined || !READERS.has(name)) continue
      const hit = args.find(arg => !arg.startsWith('-') && isCredentialFile(arg))
      if (hit !== undefined) return `${hit}: ${CREDENTIAL_REASON}`
    }
  }
  return null
}

// ── Secret masking ──────────────────────────────────────────────────────────

/** The session's secrets and their placeholders: in memory only, never in a file. */
export type SecretMap = { bySecret: Map<string, string>; byHolder: Map<string, string> }

export function newSecretMap(): SecretMap {
  return { bySecret: new Map(), byHolder: new Map() }
}

const TOKEN_SHAPES: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\blin_api_[A-Za-z0-9]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{36,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bxox[abp]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
]

const ANY_TOKEN = new RegExp(TOKEN_SHAPES.map(shape => shape.source).join('|'), 'g')

/** An env-like line `KEY=value` / `KEY: value` whose key names a password, secret, token or key, and a literal value. */
const ASSIGNMENT = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*(?:password|passwd|secret|token|api_?key)[A-Za-z0-9_.-]*\s*[=:]\s*["']?)([^\s"'()«»]{8,})(["']?\s*)$/gim

function holderFor(map: SecretMap, secret: string): string {
  const known = map.bySecret.get(secret)
  if (known !== undefined) return known
  const holder = `«secret-${map.bySecret.size + 1}»`
  map.bySecret.set(secret, holder)
  map.byHolder.set(holder, secret)
  return holder
}

/** The text with every known token shape replaced by its stable placeholder (`«secret-1»`, …), the map updated. */
export function maskSecrets(text: string, map: SecretMap): string {
  let masked = text
  // One pass over all shapes: placeholders are numbered in the order the secrets appear.
  masked = masked.replace(ANY_TOKEN, secret => holderFor(map, secret))
  return masked.replace(ASSIGNMENT, (_line, head: string, value: string, tail: string) => `${head}${holderFor(map, value)}${tail}`)
}

/** The text with this session's placeholders put back: what the model writes reaches the tool as the real value. */
export function restoreSecrets(text: string, map: SecretMap): string {
  if (map.byHolder.size === 0 || !text.includes('«secret-')) return text
  return text.replace(/«secret-\d+»/g, holder => map.byHolder.get(holder) ?? holder)
}

/** Any value with its strings masked (a tool's typed result); the same object when nothing changed. */
export function maskValue<T>(value: T, map: SecretMap): T {
  if (typeof value === 'string') return maskSecrets(value, map) as T
  if (Array.isArray(value)) {
    const items = value.map(item => maskValue(item, map))
    return items.every((item, index) => item === value[index]) ? value : (items as T)
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).map(([key, item]) => [key, maskValue(item, map)] as const)
    return entries.every(([key, item]) => item === (value as Record<string, unknown>)[key]) ? value : (Object.fromEntries(entries) as T)
  }
  return value
}

/** The input fields a placeholder is put back in: Bash's command, Edit's strings, Write's content. */
export function restoreInput(tool: string, input: Record<string, unknown>, map: SecretMap): Record<string, unknown> | null {
  const fields = tool === 'Bash' ? ['command'] : tool === 'Edit' ? ['old_string', 'new_string'] : tool === 'Write' ? ['content'] : []
  let changed: Record<string, unknown> | null = null
  for (const field of fields) {
    const value = input[field]
    if (typeof value !== 'string') continue
    const restored = restoreSecrets(value, map)
    if (restored !== value) changed = { ...(changed ?? input), [field]: restored }
  }
  return changed
}

/** `risky · git push --force-with-lease`: the waiting text a risky ask carries to the board, cut to 60 characters. */
export function riskyText(command: string): string {
  const line = command.replace(/\s+/g, ' ').trim()
  const chars = Array.from(line)
  return `risky · ${chars.length <= 52 ? line : chars.slice(0, 51).join('') + '…'}`
}
