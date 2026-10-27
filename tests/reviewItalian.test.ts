import { expect, test } from 'claude-code/testing'

import { asksToPost } from '../hooks/core/away'
import { toRegExp, validateConfig } from '../hooks/core/config'
import { OINK_CONFIG } from '../hooks/core/configs/examples/oink'
import { LINEAR_CONFIG } from './linearConfig'
import { parsePullRequest } from '../hooks/core/detail'
import { cannotPost, reviewAnswer, reviewNamedPath, reviewPostDecision, reviewSeen } from '../hooks/core/reviewBox'

// Decision 079: a review shown to the person in another language (oink's review-pr: Italian prose, no heading) is
// recognised by the saved review the answer names, and its Italian post question is the post question.

const result = validateConfig(OINK_CONFIG)
if (!result.ok) throw new Error(result.errors.join('\n'))
// oink's live configuration: no sections, the English post rule alone.
const REVIEW = { ...result.config.review, sections: [] }
const ENGLISH_ONLY = { post: { patterns: [{ source: '\\b(?:post|publish)\\b(?!-)', flags: 'i' }], awayAnswer: null } }

const WORKTREE = '/home/me/tower-work/oink/36-restore-a-backup-through-one-function-th'
const SAVED = `${WORKTREE}/.work/review/pr-105-round-1.md`
const FILE = '## Review (round 1)\n\nThe PR does what #36 asks and nothing else.\n\n**Suggestions**\n1. Give the start day an identifier.\n\nVerdict: ready to merge\n'

// The real answer of 2026-10-26, shortened in the middle.
const ITALIAN = [
  'Ho finito di rivedere la PR #105 e non trovo nulla che blocchi il merge. Il verdetto è **pronta per il merge**, con tre suggerimenti. Non ho pubblicato niente su GitHub: aspetto il tuo sì.',
  '**Cosa ho verificato**\n- **Ambito:** la PR fa quello che chiede il ticket #36 e nient\'altro.\n- **Test:** ho controllato che ogni test diventi rosso se si rompe la correzione.',
  '**Suggerimenti**\n1. **Il test UI di Impostazioni cerca il giorno come testo nudo, "1" e "10".** Un identificatore lo renderebbe solido.',
  'Non c\'erano revisioni precedenti, quindi questo è il primo giro. Il commento in inglese, esattamente come verrebbe pubblicato, è qui:',
  `\`${SAVED}\``,
  'Lo pubblico come commento sulla PR #105?',
].join('\n\n')

const PLACES = { cwd: WORKTREE, worktree: WORKTREE }

test('an Italian answer naming the saved review: shown by the file, the file\'s round and verdict; tower posts it', async () => {
  expect(reviewNamedPath(ITALIAN, PLACES)).toBe(SAVED)
  expect(reviewSeen(ITALIAN, FILE, REVIEW)).toEqual({ shown: true, round: 1, source: 'file' })
  // The round is the file's, whatever the answer says: no heading in the answer to read one from.
  expect(reviewSeen(ITALIAN, FILE.replace('(round 1)', '(round 3)'), REVIEW)).toEqual({ shown: true, round: 3, source: 'file' })
  // The verdict comes from the file, as it lands on the PR: a ready round, no blockers.
  expect(toRegExp(REVIEW.verdict!.ready).test(FILE)).toBe(true)
  const pullRequest = parsePullRequest({ exitCode: 0, stderr: '', stdout: JSON.stringify({
    number: 105, state: 'OPEN', isDraft: false, headRefOid: 'abc', comments: [{ body: FILE, createdAt: '2026-10-26T14:40:00Z' }], statusCheckRollup: [],
  }) }, REVIEW)
  expect(pullRequest).toMatchObject({ kind: 'pr', rounds: 1, reviewBlockers: 0 })
  // The answer waits for a yes; it refuses nothing.
  expect(cannotPost(ITALIAN)).toBe(false)
  expect(reviewPostDecision({ setting: 'auto', away: false, shown: true, bodyLength: FILE.trim().length, rounds: 0, baseRounds: 0 })).toBe('post')
  expect(reviewPostDecision({ setting: 'key', away: false, shown: true, bodyLength: FILE.trim().length, rounds: 0, baseRounds: 0 })).toBe('ready')
  // Its question is the post question: no `◆ asks:` in the box.
  expect(reviewAnswer(ITALIAN, text => asksToPost(text, ENGLISH_ONLY))).toEqual({ asks: null, posted: false })
})

test('an Italian answer with no path, or naming a file that is no review, shows nothing (as before)', async () => {
  const bare = ITALIAN.replace(`\`${SAVED}\``, 'Il file è nella cartella del ticket.')
  expect(reviewNamedPath(bare, PLACES)).toBeNull()
  expect(reviewSeen(bare, null, REVIEW)).toMatchObject({ shown: false, source: 'answer' })
  expect(reviewSeen(ITALIAN, 'Note di lavoro.\n\nNiente da segnalare.', REVIEW)).toMatchObject({ shown: false, source: 'answer' })
  // ShopApp's heading is no oink review.
  expect(reviewSeen(ITALIAN, '## Self-review (round 1)\n\n### Blockers\n_(none)_', REVIEW)).toMatchObject({ shown: false })
  // Never the newest round in the folder: only a path the answer names.
  expect(reviewNamedPath('Lo pubblico come commento sulla PR #105?', PLACES)).toBeNull()
})

test('an answer that shows the review itself is read as before: its own round, never the file', async () => {
  const shown = 'Done.\n\n## Review (round 2)\n\nVerdict: ready to merge\n\nShall I post it?'
  expect(reviewSeen(shown, FILE, REVIEW)).toEqual({ shown: true, round: 2, source: 'answer' })
  const shopapp = '## Self-review (round 3)\n\n### Scope check\nok\n\n### Blockers\n_(none)_\n\nPost this review to the PR?'
  expect(reviewSeen(shopapp, null, LINEAR_CONFIG.review)).toEqual({ shown: true, round: 3, source: 'answer' })
})

test('asksToPost: Tower\'s post verbs with the configuration\'s, Italian included; an Italian answer that asks nothing else', async () => {
  expect(asksToPost('Il commento è salvato.\n\nLo pubblico come commento sulla PR #105?', ENGLISH_ONLY)).toBe(true)
  expect(asksToPost(ITALIAN, ENGLISH_ONLY)).toBe(true)
  expect(asksToPost('Saved.\n\nShall I run `gh pr comment 105` with it?', {})).toBe(true)
  expect(asksToPost('Saved.\n\nWant me to leave it as a comment on the PR?', {})).toBe(true)
  // Not a post question.
  expect(asksToPost('Ho finito il primo giro.\n\nConfronto con staging o con main?', ENGLISH_ONLY)).toBe(false)
  expect(asksToPost('Ho pubblicato il commento sulla PR.', ENGLISH_ONLY)).toBe(false)
  expect(asksToPost('Saved the review.\n\nShall I post it?', {})).toBe(false)
})

test('cannotPost: waiting for a yes is no refusal; an Italian refusal still is', async () => {
  expect(cannotPost('Non ho pubblicato niente su GitHub: aspetto il tuo sì.')).toBe(false)
  expect(cannotPost('Non posso pubblicare: la CI è rossa.')).toBe(true)
  expect(cannotPost('Non pubblico: la CI è rossa.')).toBe(true)
})
