// A demo deck (TOWER_DEMO=1): a working ticket session with three agents, drawn without a model call.
import type { TowerAgent, TowerAlert, TowerDeck, TowerGate, TowerLogEntry, TowerRequest, TowerStep, TowerVerdict } from '../../types/index'
import type { DevEnv } from './devEnv'
import { initialDeck } from './deck'
import { type DurationHistory, recordDuration } from './estimate'
import { initialRouting, routeRecorded } from './routing'
import { modelLabel } from './theme'

const SECOND = 1000
const MINUTE = 60 * SECOND

function steps(texts: string[], done: number): TowerStep[] {
  return texts.map((text, i) => ({ id: String(i + 1), text, status: i < done ? 'done' : i === done ? 'doing' : 'todo' }))
}

function agent(fields: Partial<TowerAgent> & Pick<TowerAgent, 'id' | 'name' | 'type' | 'task' | 'startedAt'>): TowerAgent {
  return {
    model: null, effort: null, status: 'running', endedAt: null, actions: 0, lastAction: null,
    recent: [], steps: [], stepsCreated: 0, tokens: { input: 0, output: 0 }, lastOutput: null,
    spans: [{ model: fields.model ?? 'other', from: fields.startedAt, to: fields.endedAt ?? null }],
    ...fields,
  }
}

export function demoDeck(now: number): TowerDeck {
  const deck = initialDeck()
  const executorSteps = steps([
    'Read the alert service',
    'Add the dedupe window',
    'Reset the window on a confirmed recovery',
    'Cover the window with tests',
    'Update the alert docs',
  ], 2)
  let routing = initialRouting()
  routing = routeRecorded(routing, { at: now - 2 * MINUTE - 45 * SECOND, text: `general-purpose → executor · ${modelLabel('claude-opus-5-5')}`, kind: 'role' })
  routing = routeRecorded(routing, { at: now - 40 * SECOND, text: `Explore → verifier · ${modelLabel('claude-sonnet-5-5')}`, kind: 'role' })
  return {
    main: {
      ...deck.main,
      model: 'claude-fable-5-1', effort: 'high', state: 'working', requests: 12,
      turnStartedAt: now - 4 * MINUTE - 12 * SECOND, workStartedAt: now - 4 * MINUTE - 12 * SECOND,
      lastAction: 'Reviewing the executor diff',
      steps: steps(['Read the ticket and the alert service', 'Find why the alert repeats', 'Write the plan', 'Review the executor diff', 'Open the PR'], 3),
      spans: [
        { model: 'claude-fable-5-1', from: now - 252 * SECOND, to: now - 146 * SECOND },
        { model: 'claude-opus-5-5', from: now - 146 * SECOND, to: now - 106 * SECOND },
        { model: 'claude-fable-5-1', from: now - 106 * SECOND, to: null },
      ],
    },
    usage: {
      cost: 1.84,
      contextPercent: 38,
      limits: {
        // Decision 034: ahead of pace, out in ~45m, before the reset.
        fiveHour: { percent: 84, resetsAt: now + 64 * MINUTE + 30 * SECOND },
        sevenDay: { percent: 58, resetsAt: now + 52 * 60 * MINUTE + 30 * SECOND },
        spend: null,
      },
    },
    // Decision 034: the main loop's cache, cold for 2 minutes.
    cache: { lastRequestAt: now - 7 * MINUTE, cachedTokens: 62_000, sessionTokens: 1_150_000 },
    agents: [
      agent({
        id: 'demo-executor', name: 'executor', type: 'executor', model: 'claude-opus-5-5', effort: 'medium',
        startedAt: now - 2 * MINUTE - 45 * SECOND, task: 'Implement the dedupe window in the alert service',
        steps: executorSteps, stepsCreated: 5, actions: 14, lastAction: 'Edit src/alerts/dedupe-window.ts',
        recent: [
          'Read src/alerts/service.ts', 'Grep dedupe', 'Read src/alerts/dedupe-window.ts',
          'Bash pnpm tsc --noEmit', 'Bash pnpm tsc --noEmit', 'Bash pnpm tsc --noEmit',
        ],
        // Decision 033: the same check three times in a row, going in circles.
        lastEventAt: now - 6 * SECOND, stepSince: now - 70 * SECOND, stepText: 'Reset the window on a confirmed recovery',
        calls: [
          { tool: 'Read', arg: 'src/alerts/dedupe-window.ts', failed: false, at: now - 50 * SECOND },
          { tool: 'Bash', arg: 'pnpm tsc --noEmit', failed: true, at: now - 30 * SECOND },
          { tool: 'Bash', arg: 'pnpm tsc --noEmit', failed: true, at: now - 18 * SECOND },
          { tool: 'Bash', arg: 'pnpm tsc --noEmit', failed: true, at: now - 6 * SECOND },
        ],
      }),
      agent({
        id: 'demo-verifier', name: 'verifier', type: 'verifier', model: 'claude-sonnet-5-5', effort: 'medium',
        startedAt: now - 100 * SECOND, task: 'Run the alert tests and report failures',
        steps: steps(['Run the alert tests', 'Read the failures', 'Report them'], 0), stepsCreated: 3,
        actions: 2, lastAction: 'Bash pnpm test alerts', recent: ['Bash pnpm test alerts'],
        // Decision 033: the test run in flight for 1m12s, its line amber past 30 s.
        lastEventAt: now - 72 * SECOND, inFlight: [{ id: 'demo-1', line: 'Bash pnpm test alerts', since: now - 72 * SECOND }],
      }),
      agent({
        id: 'demo-scout', name: 'scout', type: 'Explore', model: 'claude-sonnet-5-5', effort: 'low', status: 'done',
        startedAt: now - 3 * MINUTE - 91 * SECOND, endedAt: now - 3 * MINUTE, task: 'Find where offline alerts are sent',
        actions: 6, lastAction: 'Read src/alerts/notify.ts', lastOutput: 'Alerts are sent from src/alerts/notify.ts:88',
      }),
      agent({
        id: 'demo-fixer', name: 'fixer', type: 'general-purpose', model: 'claude-haiku-4-5', effort: 'low',
        startedAt: now - 5 * MINUTE - 10 * SECOND, task: 'Fix the flaky recovery test',
        actions: 4, lastAction: 'Read tests/alerts/recovery.test.ts', recent: ['Read tests/alerts/recovery.test.ts'],
        // Decision 033: nothing heard for 2m 40s and no tool in flight, stalled.
        lastEventAt: now - 2 * MINUTE - 40 * SECOND,
      }),
    ],
    routing,
    tokens: { fable: 21_000, opus: 46_000, sonnet: 29_000, haiku: 4_000 },
    log: demoLog(now),
    gate: demoGate(),
    period: { edits: 3, errors: 0, costAtStart: 1.32 },
    requests: demoRequests(now),
  }
}

const FABLE = 'claude-fable-5-1'
const OPUS = 'claude-opus-5-5'
const SONNET = 'claude-sonnet-5-5'

/** Twelve model requests across the main loop and the three agents: seconds ago, who, model, effort, tokens in/out, cost, duration. */
const DEMO_REQUESTS: [number, string, string, string, number, number, number, number][] = [
  [248, 'main', FABLE, 'high', 18_400, 1_200, 0.11, 9_400],
  [226, 'scout', SONNET, 'low', 6_200, 600, 0.02, 3_100],
  [214, 'scout', SONNET, 'low', 9_800, 900, 0.03, 4_200],
  [200, 'main', FABLE, 'high', 21_300, 2_100, 0.14, 11_800],
  [140, 'main', OPUS, 'medium', 24_000, 1_800, 0.07, 8_600],
  [158, 'executor', OPUS, 'medium', 14_600, 2_900, 0.05, 12_300],
  [121, 'executor', OPUS, 'medium', 17_900, 3_400, 0.06, 14_100],
  [96, 'main', FABLE, 'high', 26_700, 1_500, 0.16, 10_200],
  [74, 'executor', OPUS, 'medium', 19_200, 4_100, 0.07, 15_600],
  [33, 'verifier', SONNET, 'medium', 8_400, 700, 0.02, 3_800],
  [22, 'executor', OPUS, 'medium', 21_000, 2_600, 0.07, 11_900],
  [9, 'main', FABLE, 'high', 28_900, 900, 0.17, 7_300],
]

function demoRequests(now: number): TowerRequest[] {
  return DEMO_REQUESTS
    .map(([ago, who, model, effort, tokensIn, tokensOut, costUsd, durationMs]) => ({ at: now - ago * SECOND, who, model, effort, tokensIn, tokensOut, costUsd, durationMs }))
    .sort((a, b) => a.at - b.at)
}

/** The demo board's working card: its stalled agent (decision 033). */
export function demoAlert(): TowerAlert {
  return { kind: 'stalled', text: 'stalled · fixer', id: 'demo:stalled' }
}

/** Durations as if three executors took 6 min and three verifiers 80 s: the cards then show `≈ … left`. */
export function demoDurations(): DurationHistory {
  let history: DurationHistory = {}
  for (let i = 0; i < 3; i++) {
    history = recordDuration(history, 'executor', 6 * MINUTE)
    history = recordDuration(history, 'verifier', 80 * SECOND)
  }
  return history
}

const DEMO_LOG: readonly [number, string, string][] = [
  [400, 'main', 'prompt · Plan approved, go ahead with step 2'],
  [395, 'main', 'Read .work/plan.md'],
  [390, 'runner', 'Bash git status'],
  [386, 'runner', 'Bash git log --oneline -5'],
  [380, 'routing', 'general-purpose → executor · opus'],
  [379, 'main', '→ executor · opus'],
  [370, 'executor', 'Read src/sync/reconnect-handler.ts'],
  [340, 'executor', 'Edit src/alerts/dedupe-window.ts'],
  [300, 'gate', 'asked Bash rm -rf dist/alerts'],
  [280, 'routing', 'Explore → scout · sonnet'],
  [279, 'main', '→ scout · sonnet'],
  [260, 'scout', 'Grep offlineAlert'],
  [230, 'scout', 'Read src/alerts/offline-notifier.ts'],
  [200, 'main', 'scout done · 1:20'],
  [170, 'executor', 'Edit src/alerts/offline-notifier.ts'],
  [150, 'gate', 'denied Bash git push --force'],
  [120, 'review', 'Read notes/dedupe-window.md'],
  [100, 'main', '→ verifier · sonnet'],
  [80, 'verifier', 'Bash npm test -- alerts'],
  [40, 'executor', 'Write src/alerts/dedupe-window.test.ts'],
  [20, 'main', 'turn done · 6m20s'],
]

function demoLog(now: number): TowerLogEntry[] {
  return DEMO_LOG.map(([ago, who, text]) => ({ at: now - ago * SECOND, who, text }))
}

function demoGate(): TowerGate {
  const recent: TowerVerdict[] = Array.from({ length: 34 }, (_, index) => (index === 7 || index === 19 ? 'ask' : index === 24 ? 'deny' : 'allow'))
  return { allowed: 31, asked: 2, denied: 1, recent }
}

/** The dev-env of the demo: up on slot 2, for 42 minutes, login verified. */
export function demoDevEnv(now: number): { env: DevEnv; answers: boolean; startPressedAt: null; hasSkill: boolean; restartPending: boolean } {
  return {
    env: { frontendUrl: 'http://localhost:5174', frontendPort: 5174, status: 'up', loginVerified: true, startedAt: now - 42 * MINUTE },
    answers: true, startPressedAt: null, hasSkill: true, restartPending: false,
  }
}
