#!/bin/bash
# The stage state file of New project mode (decision 062): `.tower/design.json` in the project folder, written by the
# tower-design skill only through this script, read by the rail through hooks/core/design.ts (parseDesignState).
# Every write is checked against the schema below and replaces the file atomically; a file that fails the check is
# never written over (run `validate` to see why).
#
# Usage: tools/tower-design-state.sh [-C <project folder>] <command> [arguments]
#   init                              create the file (stage 1 active) when there is none; else say where it stands
#   show                              the stages, their state and the open questions, as text
#   json                              the file as it is
#   validate                          check the file against the schema; exit 1 with every error
#   advance                           the go: the active stage done, the next stage still to do active
#   set-stage <n|key> <status> [note] status done|active|todo|skipped; skipped needs the reason as note;
#                                     active only when no other stage is active
#   set-doc <n|key> <path or link>    the stage's document (the design stage: the canvas link or design/)
#   add-question <n|key> <text>       an open question on the stage; prints its id (q1, q2, …)
#   resolve-question <id> [answer]    the question moves to the stage's resolved list, with the answer
#
# Stage keys: idea research product decisions architecture design plan setup (1–8).
set -euo pipefail
dir=.
if [ "${1:-}" = "-C" ]; then
  [ $# -ge 2 ] || { echo "tower-design-state: -C needs a folder" >&2; exit 2; }
  dir=$2
  shift 2
fi
[ $# -ge 1 ] || { sed -n '6,19p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
[ -d "$dir" ] || { echo "tower-design-state: no folder $dir" >&2; exit 2; }
exec python3 -I - "$dir/.tower/design.json" "$@" <<'PY'
import json, os, sys, tempfile

path, command, args = sys.argv[1], sys.argv[2], sys.argv[3:]
STAGES = [
    (1, 'idea', 'Idea', 'docs/IDEA.md'),
    (2, 'research', 'Research', 'docs/RESEARCH.md'),
    (3, 'product', 'Product', 'docs/PRODUCT.md'),
    (4, 'decisions', 'Decisions', 'docs/DECISIONS.md'),
    (5, 'architecture', 'Architecture', 'docs/ARCHITECTURE.md'),
    (6, 'design', 'Design', None),
    (7, 'plan', 'Plan', 'docs/ROADMAP.md'),
    (8, 'setup', 'Setup', None),
]
STATUSES = ('done', 'active', 'todo', 'skipped')


def fail(message, code=1):
    print(f'tower-design-state: {message}', file=sys.stderr)
    sys.exit(code)


def fresh():
    return {
        'version': 1,
        'current': 1,
        'stages': [
            {'n': n, 'key': key, 'status': 'active' if n == 1 else 'todo', 'doc': doc,
             'openQuestions': [], 'resolvedQuestions': [], 'note': None}
            for n, key, _, doc in STAGES
        ],
    }


def errors_of(state):
    errors = []
    if not isinstance(state, dict):
        return ['the file is not a JSON object']
    if state.get('version') != 1:
        errors.append(f"version: {state.get('version')!r}, expected 1")
    current = state.get('current')
    if not isinstance(current, int) or isinstance(current, bool) or not 1 <= current <= 8:
        errors.append(f'current: {current!r}, expected a stage number 1-8')
    stages = state.get('stages')
    if not isinstance(stages, list) or len(stages) != 8:
        return errors + ['stages: expected the eight stages in order']
    ids = set()
    actives = []
    for (n, key, _, _), stage in zip(STAGES, stages):
        where = f'stages[{n - 1}]'
        if not isinstance(stage, dict):
            errors.append(f'{where}: not an object')
            continue
        if stage.get('n') != n or stage.get('key') != key:
            errors.append(f"{where}: expected n {n} key {key}, found n {stage.get('n')!r} key {stage.get('key')!r}")
        status = stage.get('status')
        if status not in STATUSES:
            errors.append(f'{where}.status: {status!r}, expected one of {", ".join(STATUSES)}')
        if status == 'active':
            actives.append(n)
        if status == 'skipped' and not (isinstance(stage.get('note'), str) and stage['note'].strip()):
            errors.append(f'{where}: skipped without a reason in note')
        if stage.get('doc') is not None and not isinstance(stage.get('doc'), str):
            errors.append(f'{where}.doc: expected a string or null')
        if stage.get('note') is not None and not isinstance(stage.get('note'), str):
            errors.append(f'{where}.note: expected a string or null')
        for field in ('openQuestions', 'resolvedQuestions'):
            entries = stage.get(field)
            if not isinstance(entries, list):
                errors.append(f'{where}.{field}: expected a list')
                continue
            for i, entry in enumerate(entries):
                if not isinstance(entry, dict) or not isinstance(entry.get('id'), str) or not isinstance(entry.get('text'), str) or not entry['text'].strip():
                    errors.append(f'{where}.{field}[{i}]: expected {{"id", "text"}}')
                elif entry['id'] in ids:
                    errors.append(f"{where}.{field}[{i}]: id {entry['id']} used twice")
                else:
                    ids.add(entry['id'])
    if len(actives) > 1:
        errors.append(f'stages {", ".join(map(str, actives))} are all active; at most one may be')
    if len(actives) == 1 and current != actives[0]:
        errors.append(f'current is {current} but stage {actives[0]} is the active one')
    return errors


def load():
    if not os.path.exists(path):
        fail(f'no {path}: run init first')
    try:
        with open(path, encoding='utf-8') as f:
            state = json.load(f)
    except ValueError as e:
        fail(f'{path} does not parse: {e}')
    errors = errors_of(state)
    if errors:
        fail(f'{path} does not match the schema, not written:\n  ' + '\n  '.join(errors))
    return state


def save(state):
    errors = errors_of(state)
    if errors:
        fail('the change would break the schema, not written:\n  ' + '\n  '.join(errors))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix='.design.', suffix='.json')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
        f.write('\n')
    os.replace(tmp, path)


def stage_of(state, ref):
    for n, key, _, _ in STAGES:
        if ref == str(n) or ref == key:
            return state['stages'][n - 1]
    fail(f'no stage {ref!r}: use 1-8 or ' + ' '.join(key for _, key, _, _ in STAGES), 2)


def label(stage):
    return STAGES[stage['n'] - 1][2]


def need(count, usage):
    if len(args) < count:
        fail(f'usage: {usage}', 2)


def show(state):
    marks = {'done': '✓', 'active': '◆', 'todo': '○', 'skipped': '–'}
    print(f"current: {state['current']} {label(state['stages'][state['current'] - 1])}")
    for stage in state['stages']:
        line = f"{marks[stage['status']]} {stage['n']} {label(stage):<12} {stage['status']:<7} {stage['doc'] or ''}".rstrip()
        if stage['status'] == 'skipped':
            line += f"  (skipped: {stage['note']})"
        print(line)
        for q in stage['openQuestions']:
            print(f"    ? {q['id']} {q['text']}")


if command == 'init':
    if os.path.exists(path):
        state = load()
        print(f'{path} exists; resuming')
        show(state)
    else:
        save(fresh())
        print(f'created {path}')
        show(fresh())
elif command == 'show':
    show(load())
elif command == 'json':
    load()
    with open(path, encoding='utf-8') as f:
        sys.stdout.write(f.read())
elif command == 'validate':
    load()
    print(f'{path}: valid')
elif command == 'advance':
    state = load()
    stages = state['stages']
    active = [s for s in stages if s['status'] == 'active']
    if not active:
        fail('no stage is active: set-stage <n> active first')
    stage = active[0]
    stage['status'] = 'done'
    following = [s for s in stages if s['n'] > stage['n'] and s['status'] == 'todo']
    if following:
        following[0]['status'] = 'active'
        state['current'] = following[0]['n']
    save(state)
    if following:
        print(f"{stage['n']} {label(stage)} done; {following[0]['n']} {label(following[0])} active")
    else:
        print(f"{stage['n']} {label(stage)} done; no stage left to do")
elif command == 'set-stage':
    need(2, 'set-stage <n|key> <done|active|todo|skipped> [note]')
    state = load()
    stage = stage_of(state, args[0])
    status = args[1]
    if status not in STATUSES:
        fail(f'status {status!r}: use one of {", ".join(STATUSES)}', 2)
    if status == 'active':
        others = [s for s in state['stages'] if s['status'] == 'active' and s is not stage]
        if others:
            fail(f"stage {others[0]['n']} {label(others[0])} is active: close it first (set-stage {others[0]['n']} done, or todo)")
        state['current'] = stage['n']
    if status == 'skipped':
        if len(args) < 3 or not args[2].strip():
            fail('a skipped stage needs its reason: set-stage <n|key> skipped "<reason>"', 2)
    if len(args) >= 3:
        stage['note'] = args[2].strip() or None
    elif status != 'skipped' and stage['status'] == 'skipped':
        stage['note'] = None
    stage['status'] = status
    save(state)
    print(f"{stage['n']} {label(stage)} {status}")
elif command == 'set-doc':
    need(2, 'set-doc <n|key> <path or link>')
    state = load()
    stage = stage_of(state, args[0])
    stage['doc'] = args[1].strip() or None
    save(state)
    print(f"{stage['n']} {label(stage)} doc {stage['doc']}")
elif command == 'add-question':
    need(2, 'add-question <n|key> <text>')
    state = load()
    stage = stage_of(state, args[0])
    body = ' '.join(args[1:]).strip()
    if not body:
        fail('the question is empty', 2)
    used = [q['id'] for s in state['stages'] for q in s['openQuestions'] + s['resolvedQuestions']]
    numbers = [int(i[1:]) for i in used if i.startswith('q') and i[1:].isdigit()]
    qid = f'q{max(numbers, default=0) + 1}'
    stage['openQuestions'].append({'id': qid, 'text': body})
    save(state)
    print(qid)
elif command == 'resolve-question':
    need(1, 'resolve-question <id> [answer]')
    state = load()
    for stage in state['stages']:
        found = [q for q in stage['openQuestions'] if q['id'] == args[0]]
        if found:
            stage['openQuestions'].remove(found[0])
            answer = ' '.join(args[1:]).strip() or None
            stage['resolvedQuestions'].append({**found[0], 'answer': answer})
            save(state)
            print(f"{args[0]} resolved ({stage['n']} {label(stage)})")
            break
    else:
        fail(f'no open question {args[0]}')
else:
    fail(f'unknown command {command!r}: init show json validate advance set-stage set-doc add-question resolve-question', 2)
PY
