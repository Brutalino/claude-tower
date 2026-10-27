import { expect, mock, test } from 'claude-code/testing'

// Decision 066: `/tower install` runs bin/tower-install (tested on its own by tools/check-tower-install.sh): the report,
// then install, asking the person when a `tower` that is not ours is there or its folder is not on PATH; `/tower
// uninstall` hands over to the script. Here the script is a stand-in answering by its arguments.

const HOME = '/home/test'
const REPORT = 'Tower · requirements\n  ✓ tmux 3.5a'

type Script = (args: string[]) => { exitCode: number; stdout: string }

/** A plain session whose bin/tower-install answers through `script`; `answers` are the person's, in order. */
function session(on: any, script: Script, answers: string[]) {
  mock.env(on, { HOME })
  mock.clock(on, { now: Date.parse('2026-10-13T12:00:00Z') })
  mock.store(on)
  const runs: string[][] = []
  const asked: { question: string; options: string[] }[] = []
  on('session.start', async (_$: unknown, e: any) => e)
  on('session.id', async () => ({ value: 'plain-1' }))
  on('session.cwd' as any, async () => ({ value: HOME }) as any)
  on('fs.read', async (_$: unknown, e: any) => ({ deny: `ENOENT: ${e.path}` }) as any)
  on('fs.write', async () => ({ value: undefined }) as any)
  on('command.register' as any, async (_$: unknown, e: any) => ({ value: { command: e.name } }) as any)
  on('process.run', async (_$: unknown, e: any) => {
    const argv: string[] = [...e.argv]
    if (!argv[0]!.endsWith('/bin/tower-install')) return { value: { exitCode: 1, stdout: '', stderr: '' } } as any
    runs.push(argv.slice(1))
    return { value: { ...script(argv.slice(1)), stderr: '' } } as any
  })
  on('tool.call', async (_$: unknown, e: any) => {
    if (e.tool !== 'AskUserQuestion') return { result: '' } as any
    // The tool's input comes on the event itself.
    const questions = e.questions ?? e.input?.questions
    const question = questions[0]
    asked.push({ question: question.question, options: question.options.map((option: { label: string }) => option.label) })
    return { result: { questions, answers: { [question.question]: answers.shift() ?? '' } } } as any
  })
  return { runs, asked }
}

test('/tower install: the report, then the wrapper written; nothing asked when nothing is in the way', async ($: any, on: any) => {
  const { runs, asked } = session(on, args => (args[0] === 'check' ? { exitCode: 0, stdout: REPORT }
    : { exitCode: 0, stdout: '✓ tower installed: /home/test/.local/bin/tower\nNext: cd <a repository or a folder> && tower' }), [])
  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })
  const out = await $.command.run({ command: 'tower', args: 'install' } as any)
  expect(runs).toEqual([['check'], ['install']])
  expect(asked).toEqual([])
  expect(out.text).toContain('✓ tmux 3.5a')
  expect(out.text).toContain('Next: cd <a repository or a folder> && tower')
})

test('/tower install: ~/.local/bin off PATH asks where, a folder on PATH taken', async ($: any, on: any) => {
  const { runs, asked } = session(on, args => {
    if (args[0] === 'check') return { exitCode: 0, stdout: REPORT }
    if (args[0] === 'dirs') return { exitCode: 0, stdout: '/home/test/bin\n' }
    if (args.includes('--dir')) return { exitCode: 0, stdout: '✓ tower installed: /home/test/bin/tower' }
    return { exitCode: 4, stdout: 'off-path\t/home/test/.local/bin' }
  }, ['/home/test/bin'])
  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })
  const out = await $.command.run({ command: 'tower', args: 'install' } as any)
  expect(asked).toEqual([{ question: '/home/test/.local/bin is not on your PATH. Where should the tower command go?', options: ['/home/test/.local/bin (I will add it to PATH)', '/home/test/bin', 'Cancel'] }])
  expect(runs).toEqual([['check'], ['install'], ['dirs'], ['install', '--dir', '/home/test/bin']])
  expect(out.text).toContain('✓ tower installed: /home/test/bin/tower')
})

test('/tower install: a tower that is not ours is shown and kept unless the person says replace', async ($: any, on: any) => {
  const { runs, asked } = session(on, args => (args[0] === 'check' ? { exitCode: 0, stdout: REPORT }
    : { exitCode: 3, stdout: 'exists\t/home/test/.local/bin/tower\n  exec ~/Repositories/ClaudeTower-general/bin/CCtower "$@"' }), ['Keep it'])
  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })
  const out = await $.command.run({ command: 'tower', args: 'install' } as any)
  expect(asked[0]!.question).toContain('/home/test/.local/bin/tower is a tower command Tower did not write (exec ~/Repositories/ClaudeTower-general/bin/CCtower "$@")')
  expect(asked[0]!.options).toEqual(['Replace it', 'Keep it'])
  expect(runs).toEqual([['check'], ['install']])
  expect(out.text).toContain('Not installed: /home/test/.local/bin/tower kept as it is.')
})

test('/tower install: replace, when the person says so', async ($: any, on: any) => {
  const { runs } = session(on, args => (args[0] === 'check' ? { exitCode: 0, stdout: REPORT }
    : args.includes('--replace') ? { exitCode: 0, stdout: '✓ tower installed: /home/test/.local/bin/tower\n  The tower that was there is kept as /home/test/.local/bin/tower.before-tower.' }
    : { exitCode: 3, stdout: 'exists\t/home/test/.local/bin/tower\n  a link to /somewhere/else' }), ['Replace it'])
  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })
  const out = await $.command.run({ command: 'tower', args: 'install' } as any)
  expect(runs).toEqual([['check'], ['install'], ['install', '--replace']])
  expect(out.text).toContain('tower.before-tower')
})

test('/tower uninstall hands over to the script', async ($: any, on: any) => {
  const { runs } = session(on, () => ({ exitCode: 0, stdout: '✓ removed /home/test/.local/bin/tower' }), [])
  await $.session.start({ cwd: HOME, surface: 'terminal', isInteractive: true })
  const out = await $.command.run({ command: 'tower', args: 'uninstall' } as any)
  expect(runs).toEqual([['uninstall']])
  expect(out.text).toBe('✓ removed /home/test/.local/bin/tower')
})
