import { expect, test } from 'claude-code/testing'

import type { TowerPullRequest, TowerRailRow } from '../types/index'
import { validateConfig } from '../hooks/core/config'
import { parseGithubIssues } from '../hooks/core/github'
import { ticketStep } from '../hooks/core/nextStep'
import { prLine, progressStatus, repoSections, rowFit, titleOfBranch } from '../hooks/core/repoBoard'
import { theme } from '../hooks/core/theme'
import { buttonKeys, ringRests } from '../hooks/core/railRing'
import { blockedAnswer, BRANCH, IN_PROGRESS, ISSUES, LEGACY, PORCELAIN, REPO, repoGitRail, STATE, storedConfig, textLines } from './repoGit'

// Decision 054: the board and the rail of a repository with GitHub issues (plan general-tower.md "Left column").

function config() {
  const result = validateConfig(storedConfig())
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result.config
}

const pr = (extra: Partial<Extract<TowerPullRequest, { kind: 'pr' }>>): TowerPullRequest => ({ kind: 'pr', number: 30, state: 'open', checks: 'none', headRefOid: 'b', green: false, rounds: 1, reviewBlockers: 1, ...extra })
const ROW: TowerRailRow = { key: '#26', branch: BRANCH, path: IN_PROGRESS, phase: 'review', next: null, hasPlan: false, blockers: [], session: null, agents: 0 }

test('the PR line: number, state, review rounds and the last verdict', async () => {
  expect(prLine(pr({}))).toBe('PR #30 · round 1 · fixes needed')
  expect(prLine(pr({ rounds: 2, reviewBlockers: 0 }))).toBe('PR #30 · round 2 · ready to merge')
  expect(prLine(pr({ rounds: 0, reviewBlockers: null, state: 'draft' }))).toBe('PR #30 · draft · no review yet')
  expect(prLine(pr({ state: 'merged' }))).toBe('PR #30 · merged')
  expect(prLine({ kind: 'none' })).toBeNull()
  expect(prLine(undefined)).toBeNull()
  expect(titleOfBranch('fix/26-start-day-duplicates')).toBe('start day duplicates')
  expect(titleOfBranch('fix/crash-restore')).toBe('crash restore')
})

test('an issue in progress: the step while it waits or works, else its phase with the PR line', async () => {
  const workflow = config().workflow
  const step = (row: TowerRailRow, pullRequest: TowerPullRequest | null) => ticketStep({ ticket: row.key, work: row.phase === 'not started' ? null : { phase: row.phase, blockers: [] }, pullRequest, session: { working: false, agent: null }, green: false }, workflow)
  expect(progressStatus(ROW, step(ROW, pr({})), prLine(pr({})))).toBe('review · PR #30 · round 1 · fixes needed')
  const planning = { ...ROW, phase: 'planning' as const }
  expect(progressStatus(planning, step(planning, null), null)).toBe('planning · say go')
  const implementing = { ...ROW, phase: 'implementing' as const }
  expect(progressStatus(implementing, step(implementing, null), null)).toBe('ready · /open-pr')
  const fresh = { ...ROW, phase: 'not started' as const }
  expect(progressStatus(fresh, step(fresh, null), null)).toBe('not started · /start-ticket')
  expect(step(ROW, pr({})).next).toBe('/review-pr 30')
})

test('the sections: header, in progress by step, open issues without a worktree (the person\'s first), other branches', async () => {
  const parsed = parseGithubIssues({ exitCode: 0, stdout: JSON.stringify(ISSUES), stderr: '' }, 'fixture-dev', config().tickets as any)
  if ('error' in parsed) throw new Error(parsed.error)
  const planning: TowerRailRow = { ...ROW, key: '#40', branch: 'feature/40-csv', phase: 'planning' }
  const sections = repoSections({
    project: config().project, rows: [ROW, planning], issues: parsed.issues, others: [{ name: 'oink-crash-restore', branch: 'fix/crash-restore', path: LEGACY }],
    pullRequests: { '#26': pr({}) }, workflow: config().workflow,
  })
  expect(sections.header).toBe('fixture/oink · main')
  // `planning` needs the person: above the ready one. #40 is not an open issue: its title from the branch.
  expect(sections.inProgress.map(one => [one.row.key, one.title, one.labels, one.status])).toEqual([
    ['#40', 'csv', [], 'planning · say go'],
    ['#26', 'Start day duplicates', ['bug'], 'review · PR #30 · round 1 · fixes needed'],
  ])
  expect(sections.openIssues.map(issue => issue.id)).toEqual(['#35', '#34', '#33'])
  expect(sections.otherBranches.map(other => other.branch)).toEqual(['fix/crash-restore'])
  expect(rowFit(30, '#33', 'Crash on restore', 'bug testflight')).toEqual({ title: 'Crash on r…', gap: 1 })
  expect(rowFit(40, '#34', 'Export to CSV', 'enhancement')).toEqual({ title: 'Export to CSV', gap: 12 })
})

for (const columns of [44, 140]) {
  test(`the ${columns === 44 ? 'rail' : 'board'} of the oink-like repository: its sections, labels in their colours, ShopApp's columns gone`, async ($, on) => {
    repoGitRail(on)
    await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as any)
    const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: columns, scroll: { bodyRows: 30 } } } as any)
    await ui.press({ key: 'refresh' })
    const lines = textLines(await ui.drawn())
    const at = (text: string) => lines.findIndex(line => line.includes(text))
    expect(lines[0]).toContain('fixture/oink · main')
    expect(at('IN PROGRESS')).toBeLessThan(at('#26 Start day duplicates'))
    expect(at('#26 Start day duplicates')).toBeLessThan(at('OPEN ISSUES'))
    expect(lines[at('#26 Start day duplicates') + 1]).toContain('review · PR #30 · round 1 · fixes needed')
    expect(at('OPEN ISSUES')).toBeLessThan(at('#35 Totals wrong after midnight'))
    expect(at('#35 Totals wrong after midnight')).toBeLessThan(at('#34 Export to CSV'))
    expect(at('#34 Export to CSV')).toBeLessThan(at('#33 Crash on restore'))
    expect(at('#33 Crash on restore')).toBeLessThan(at('OTHER BRANCHES'))
    expect(lines[at('OTHER BRANCHES') + 1]).toContain('fix/crash-restore')
    expect(lines[at('#35 Totals')]).toMatch(/mine bug(│|$)/)
    expect(lines[at('#33 Crash')]).toMatch(/bug testflight(│|$)/)
    // The rows are Buttons: an issue in progress opens its session, an open issue starts, another branch opens a plain session.
    expect(await ui.find({ key: 'row:#26' })).toBeDefined()
    expect(await ui.find({ key: 'cand:#33' })).toBeDefined()
    expect((await ui.find({ key: 'row:other:oink-crash-restore' }))?.text).toBe('fix/crash-restore')
    // An issue's Button holds its whole row after the ▶ and the glyph (id, title, labels): the engine's focus inverse is its bar.
    expect((await ui.find({ key: 'cand:#33' }))?.text).toMatch(/^#33 Crash on restore +bug testflight$/)
    if (columns === 44) expect(4 + Array.from((await ui.find({ key: 'cand:#33' }))?.text ?? '').length).toBe(44)
    // Labels by the theme's roles: bug the error colour, enhancement the accent, testflight a cool one, mine the accent.
    const claude = theme('claude')
    expect((await ui.find({ type: 'Text', text: ' testflight' }))?.props.color).toBe(claude.models.sonnet)
    expect((await ui.find({ type: 'Text', text: 'enhancement' }))?.props.color).toBe(claude.accent)
    expect((await ui.find({ type: 'Text', text: 'mine' }))?.props.color).toBe(claude.accent)
    expect((await ui.findAll({ type: 'Text', text: /^ ?bug$/ })).every(one => one.props.color === claude.error)).toBe(true)
    // The repository's actions on its keys; none of ShopApp's columns or Linear words.
    expect(await ui.find({ key: 'board-skill:n' })).toBeDefined()
    expect(await ui.find({ key: 'board-skill:l' })).toBeDefined()
    expect(lines.join('\n')).not.toMatch(/candidates|needs you \d|linear/i)
    await ui.unmount()
  })
}

test('the board\'s detail follows the focused row: the issue in progress, an open issue\'s worktree to be, another branch', async ($, on) => {
  repoGitRail(on)
  // Beneath the plugin, as the engine: every move of the focus ring lands.
  on('ui.focus', async () => ({}) as any)
  const focus = (element: string) => $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element, origin: { kind: 'person' } } as any)
  await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as any)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 140, scroll: { bodyRows: 30 } } } as any)
  await ui.press({ key: 'refresh' })
  let text = textLines(await ui.drawn()).join('\n')
  expect(text).toContain('review · fix/26-start-day-duplicates')
  expect(text).toContain('/review-pr 30')
  expect(text).toContain('Starting a day twice duplicates its entries.')
  expect(text).toContain('↵ opens the session of this issue')
  await focus('cand:#33')
  text = textLines(await ui.drawn()).join('\n')
  expect(text).toContain('open · unassigned')
  expect(text).toContain('worktree ~/tower-work/oink/33-crash-on-restore · branch fix/33-crash-on-restore')
  // Decision 071: ↵ promotes (the worktree only); the session and /start-ticket come with ↵ on its row under IN PROGRESS.
  expect(text).toContain("↵ creates its worktree (the marked issues' too, m marks); ↵ on it under IN PROGRESS then opens its session and runs /start-ticket 33")
  expect(text).toMatch(/Steps\. Restore a backup on TestFlight build 41\./)
  await focus('row:other:oink-crash-restore')
  text = textLines(await ui.drawn()).join('\n')
  expect(text).toContain(`no issue · ${LEGACY}`)
  expect(text).toContain('↵ opens a plain session in this worktree')
  await ui.unmount()
})

// Decision 077: GitHub's issue dependencies. #33 is blocked by #38 and #39, #26 (in progress) by #41; #12 is closed.
const BLOCKED = blockedAnswer({ 33: [[38, 'OPEN', 'fixture/oink'], [12, 'CLOSED', 'fixture/oink'], [39, 'OPEN', 'fixture/oink']], 26: [[41, 'OPEN', 'fixture/oink']] })
const NOW = Date.parse('2026-10-12T12:00:00Z')

for (const columns of [44, 140]) {
  test(`the ${columns === 44 ? 'rail' : 'board'}: a blocked issue reads ⊘ blocked by #38 +1 in red, in its place, its order kept`, async ($, on) => {
    repoGitRail(on, { blocked: BLOCKED })
    await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as any)
    const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: columns, scroll: { bodyRows: 30 } } } as any)
    await ui.press({ key: 'refresh' })
    const lines = textLines(await ui.drawn())
    const at = (text: string) => lines.findIndex(line => line.includes(text))
    const red = theme('claude').error
    // The open issue: its mark stays, the second line `⊘ blocked by #38 +1` in red; the order as before.
    expect(lines[at('#33 Crash on restore') + 1]).toMatch(/^ {4}⊘ blocked by #38 \+1 *(│|$)/)
    expect((await ui.find({ type: 'Text', text: /⊘ blocked by #38 \+1/ }))?.props.color).toBe(red)
    expect(lines[at('#33 Crash on restore')]).toMatch(/^ {2}▢ #33/)
    expect(at('#35 Totals wrong after midnight')).toBeLessThan(at('#34 Export to CSV'))
    expect(at('#34 Export to CSV')).toBeLessThan(at('#33 Crash on restore'))
    expect(lines[at('#34 Export to CSV') + 1]).not.toContain('blocked by')
    // The issue in progress, no session: the glyph ⊘ and `blocked by #41` in red, as ShopApp's rail.
    expect(lines[at('#26 Start day duplicates')]).toMatch(/⊘ #26/)
    expect(lines[at('#26 Start day duplicates') + 1]).toMatch(/^ {4}blocked by #41 *(│|$)/)
    expect((await ui.find({ type: 'Text', text: /blocked by #41/ }))?.props.color).toBe(red)
    await ui.unmount()
  })
}

test('an issue in progress with open blockers and a working session reads working (the session first, as ticketStep)', async ($, on) => {
  const working = { v: 1, id: 'sid-26', role: 'ticket', ticket: '#26', cwd: IN_PROGRESS, pane: null, state: 'working', since: NOW - 60_000, updatedAt: NOW - 1_000 }
  repoGitRail(on, { blocked: BLOCKED, files: { [`${STATE}/sessions/${working.id}.json`]: JSON.stringify(working) }, sessions: [`${working.id}.json`] })
  await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as any)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 44, scroll: { bodyRows: 30 } } } as any)
  await ui.press({ key: 'refresh' })
  const lines = textLines(await ui.drawn())
  const at = (text: string) => lines.findIndex(line => line.includes(text))
  expect(lines[at('#26 Start day duplicates') + 1]).toMatch(/^ {4}working *(│|$)/)
  expect(lines[at('#26 Start day duplicates')]).not.toContain('⊘')
  // The open issue keeps its blockers.
  expect(lines[at('#33 Crash on restore') + 1]).toContain('⊘ blocked by #38 +1')
  await ui.unmount()
})

test('the board\'s detail of a blocked issue: the meta line ends with · blocked by #38 +1 in red', async ($, on) => {
  repoGitRail(on, { blocked: BLOCKED })
  on('ui.focus', async () => ({}) as any)
  await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as any)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: 140, scroll: { bodyRows: 30 } } } as any)
  await ui.press({ key: 'refresh' })
  await $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element: 'cand:#33', origin: { kind: 'person' } } as any)
  const text = textLines(await ui.drawn()).join('\n')
  expect(text).toContain('open · unassigned · blocked by #38 +1')
  expect((await ui.findAll({ type: 'Text', text: /blocked by #38/ })).find((one: any) => one.text === ' · blocked by #38 +1')?.props.color).toBe(theme('claude').error)
  // Not prevented: ↵ still creates its worktree.
  expect(text).toContain('worktree ~/tower-work/oink/33-crash-on-restore · branch fix/33-crash-on-restore')
  await ui.unmount()
})

test('the sections: an issue\'s open blockers make its step blocked but never move it', async () => {
  const parsed = parseGithubIssues({ exitCode: 0, stdout: JSON.stringify(ISSUES), stderr: '' }, 'fixture-dev', config().tickets as any, new Map([[26, ['#41']]]))
  if ('error' in parsed) throw new Error(parsed.error)
  const planning: TowerRailRow = { ...ROW, key: '#40', branch: 'feature/40-csv', phase: 'planning' }
  const ready: TowerRailRow = { ...ROW, phase: 'implementing' }
  const sections = repoSections({ project: config().project, rows: [ready, planning], issues: parsed.issues, others: [], pullRequests: {}, workflow: config().workflow })
  // #26 (ready, blocked) stays under #40 (planning, needs you).
  expect(sections.inProgress.map(one => [one.row.key, one.step.glyph, one.status])).toEqual([['#40', '◆', 'planning · say go'], ['#26', '⊘', 'blocked by #41']])
})

// Decision 078: IN PROGRESS and the open issues scroll apart. #26 and #40 in progress; twelve more open issues.
const worktree = (n: number, slug: string) => [`worktree ${REPO}-${n}`, `HEAD e0000000000000000000000000000000000000${n}`, `branch refs/heads/feature/${n}-${slug}`, ''].join('\n')
const MANY_ISSUES = [...ISSUES, ...Array.from({ length: 12 }, (_, at) => ({ ...ISSUES[1]!, number: 101 + at, title: `Issue number ${101 + at}`, labels: [] }))]
const TWO_IN_PROGRESS = `${PORCELAIN}\n${worktree(40, 'csv')}`
const EIGHT_IN_PROGRESS = [PORCELAIN, ...[40, 41, 42, 43, 44, 45, 46].map(n => worktree(n, `part-${n}`))].join('\n')

/** The rail (44) or the board (140) of the repository at 18 rows, `porcelain` its worktrees, the open issues MANY_ISSUES. */
async function splitRail($: any, on: any, porcelain: string, columns: number) {
  repoGitRail(on, { porcelain, issues: MANY_ISSUES })
  on('ui.focus', async () => ({}) as any)
  await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as any)
  const ui = await $.ui.mount({ plugin: 'tower', surface: 'terminal', component: 'Pane', requestId: 'tower', props: { bodyColumns: columns, scroll: { bodyRows: 18 } } } as any)
  await ui.press({ key: 'refresh' })
  const focus = (element: string) => $.ui.focus({ component: 'Pane', requestId: 'tower', plugin: 'tower', element, origin: { kind: 'person' } } as any)
  const keys = async () => buttonKeys(await ui.drawn())
  const lines = async () => textLines(await ui.drawn())
  return { ui, focus, keys, lines }
}

for (const columns of [44, 140]) {
  test(`the ${columns === 44 ? 'rail' : 'board'}: an open issue far down scrolls the open issues alone, IN PROGRESS and its sessions stay`, async ($, on) => {
    const { ui, focus, keys, lines } = await splitRail($, on, TWO_IN_PROGRESS, columns)
    // The ring's order: the sessions' rows, then the open issues; ↓ from the last session lands on the first open issue.
    let order = await keys()
    const lastSession = order.findLastIndex(key => key === 'row:#26' || key === 'row:#40')
    expect(order[lastSession + 1]).toBe('cand:#35')
    await focus('cand:#111')
    const drawn = await lines()
    const at = (text: string) => drawn.findIndex(line => line.includes(text))
    expect(at('IN PROGRESS')).toBeGreaterThan(0)
    expect(at('IN PROGRESS')).toBeLessThan(at('#26 Start day duplicates'))
    expect(drawn[at('#26 Start day duplicates') + 1]).toContain('review · PR #30 · round 1 · fixes needed')
    expect(drawn[at('#40 csv') + 1]).toContain('not started · /start-ticket')
    expect(at('#40 csv')).toBeLessThan(at('OPEN ISSUES'))
    // The open issues scrolled under their heading: `↑ n more` right under OPEN ISSUES, none in IN PROGRESS.
    expect(drawn[at('OPEN ISSUES') + 1]).toMatch(/^↑ \d+ more/)
    expect(drawn.filter(line => /^↑ \d+ more/.test(line))).toHaveLength(1)
    expect(drawn.join('\n')).toContain('#111 Issue number 111')
    expect(drawn.join('\n')).not.toContain('#35 Totals wrong after midnight')
    order = await keys()
    expect(order).toContain('more:repo:up')
    expect(order.filter(key => key.startsWith('more:repo-top:'))).toEqual([])
    await ui.unmount()
  })
}

for (const columns of [44, 140]) {
  test(`the ${columns === 44 ? 'rail' : 'board'}: eight issues in progress scroll in their own window, the open issues keep theirs`, async ($, on) => {
    const { ui, focus, keys, lines } = await splitRail($, on, EIGHT_IN_PROGRESS, columns)
    let order = await keys()
    const sessions = order.filter(key => /^row:#\d+$/.test(key))
    expect(sessions.length).toBeGreaterThan(0)
    expect(sessions.length).toBeLessThan(8)
    expect(order).toContain('more:repo-top:down')
    expect(order).not.toContain('more:repo-top:up')
    // The top window's `↓ n more` before the open issues' rows.
    expect(order.indexOf('more:repo-top:down')).toBeLessThan(order.indexOf('cand:#35'))
    let drawn = await lines()
    const at = (text: string) => drawn.findIndex(line => line.includes(text))
    expect(at('IN PROGRESS')).toBeLessThan(at('OPEN ISSUES'))
    expect(drawn[at('OPEN ISSUES') + 1]).toContain('#35 Totals wrong after midnight')
    // The ring on `↓ n more` of IN PROGRESS: the ▶ to the next session, the window down by one; the open issues unmoved.
    const issuesBefore = order.filter(key => key.startsWith('cand:'))
    await focus(sessions[sessions.length - 1]!)
    await focus('more:repo-top:down')
    order = await keys()
    const next = order.filter(key => /^row:#\d+$/.test(key))
    expect(next).not.toEqual(sessions)
    expect(next).toContain(sessions[sessions.length - 1]!)
    expect(order).toContain('more:repo-top:up')
    expect(order.filter(key => key.startsWith('cand:'))).toEqual(issuesBefore)
    drawn = await lines()
    expect(drawn.join('\n')).toContain('OPEN ISSUES')
    // The keys check gives a `more` line back to the ▶ row.
    expect(ringRests('more:repo-top:down', next[next.length - 1]!, new Set(order))).toBe(false)
    await ui.unmount()
  })
}

test('the rail: moving the focus through the open issues never changes the sessions drawn; ↑ n more from a session goes one past the edge', async ($, on) => {
  const { ui, focus, keys, lines } = await splitRail($, on, EIGHT_IN_PROGRESS, 44)
  const sessionKeys = async () => (await keys()).filter(key => /^row:#\d+$/.test(key))
  // A session far down: the top window scrolls to it.
  const all = (await sessionKeys())
  await focus(all[all.length - 1]!)
  await focus('more:repo-top:down')
  await focus('more:repo-top:down')
  const sessions = await sessionKeys()
  expect(sessions).not.toEqual(all)
  for (const id of ['#35', '#34', '#33', ...Array.from({ length: 12 }, (_, at) => `#${101 + at}`)]) {
    await focus(`cand:${id}`)
    expect(await sessionKeys()).toEqual(sessions)
    expect((await lines()).find(line => line.startsWith('▶ '))).toContain(`${id} `)
  }
  // The open issues at their end; the ▶ back on a session, then the ring on the open issues' `↑ n more`: the ▶ on the
  // issue just above their window (before, the last row of the whole list).
  await focus(sessions[0]!)
  const issues = (await keys()).filter(key => key.startsWith('cand:'))
  expect(issues[issues.length - 1]).toBe('cand:#112')
  const above = MANY_ISSUES.map(issue => `cand:#${issue.number}`).filter(key => key !== 'cand:#26')
  await focus('more:repo:up')
  const marked = (await lines()).find(line => line.startsWith('▶ ')) ?? ''
  expect(marked).toContain(`${above[above.indexOf(issues[0]!) - 1]!.slice('cand:'.length)} `)
  expect(await sessionKeys()).toEqual(sessions)
  await ui.unmount()
})
