#!/bin/bash
# Walks tools/tower-design-state.sh through a whole New project path (decision 062) in a throwaway folder: init, the
# questions of research, every go up to stage 8 with the design stage skipped, and the refusals (a second active
# stage, a skip without a reason, an unknown stage, a broken file never written over). With node (type stripping),
# it prints the rail's rows from hooks/core/design.ts at stage 2 and at stage 8, read from the file the script wrote.
# Usage: tools/check-tower-design-state.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
work=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$work"' EXIT
state() { "$ROOT/tools/tower-design-state.sh" -C "$work" "$@"; }
bad=0
check() { # check NAME WANT GOT
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: want '$2', got '$3'"; bad=$((bad + 1)); fi
}
refuses() { # refuses NAME COMMAND...: the command fails and the file is unchanged
  local name=$1 before after
  shift
  before=$(cat "$work/.tower/design.json")
  if state "$@" >/dev/null 2>&1; then echo "FAIL $name: accepted"; bad=$((bad + 1)); return; fi
  after=$(cat "$work/.tower/design.json")
  check "$name (file unchanged)" "$before" "$after"
}
field() { /usr/bin/python3 -I -c 'import json, sys; s = json.load(open(sys.argv[1])); v = eval(sys.argv[2]); print(" ".join(map(str, v)) if isinstance(v, tuple) else v)' "$work/.tower/design.json" "$1"; }
rows() { # the rail's rows for the file as it is now
  if ! command -v node >/dev/null; then echo "(node not found: rows not printed)"; return; fi
  node --experimental-strip-types --no-warnings -e '
    const [module, file] = process.argv.slice(1)
    import(module).then(m => {
      const state = m.parseDesignState(require("fs").readFileSync(file, "utf8"))
      console.log(" " + m.designTitle("/home/ana/Repositories/budget-app", "/home/ana"))
      for (const line of m.designPathLines(m.designPath(state))) console.log(" " + line)
    })' "$ROOT/hooks/core/design.ts" "$work/.tower/design.json"
}

state init >/dev/null
check "init: stage 1 active" "1 active" "$(field 's["current"], s["stages"][0]["status"]')"
check "init again keeps the file" "resuming" "$(state init | head -1 | grep -o resuming)"
state add-question idea "Who is it for?" >/dev/null
state advance >/dev/null
check "go: 1 done, 2 active, current 2" "2 done active" "$(field 's["current"], s["stages"][0]["status"], s["stages"][1]["status"]')"
check "add-question numbers on" "q2" "$(state add-question research 'Is a bank connection (PSD2) in scope?')"
state add-question 2 "One person or a household?" >/dev/null
state add-question research "Which countries first?" >/dev/null
state resolve-question q1 "one person, in euros" >/dev/null
check "resolve-question moves it with its answer" "[] one person, in euros" "$(field 's["stages"][0]["openQuestions"], s["stages"][0]["resolvedQuestions"][0]["answer"]')"
refuses "a second active stage" set-stage 3 active
refuses "skipped without a reason" set-stage design skipped
refuses "an unknown stage" set-stage 9 done
refuses "an unknown status" set-stage 3 finished
refuses "resolving a question that is not open" resolve-question q1
state validate >/dev/null
echo "--- rows at stage 2"
rows
echo "---"

state resolve-question q2 "out of scope for the first version" >/dev/null
state resolve-question q3 >/dev/null
state resolve-question q4 "Italy" >/dev/null
state advance >/dev/null # 2 → 3
state advance >/dev/null # 3 → 4
state advance >/dev/null # 4 → 5
state set-stage design skipped "a command-line tool: no screens" >/dev/null
check "advance passes over a skipped stage" "5 Architecture done; 7 Plan active" "$(state advance)"
state add-question plan "Which slice first?" >/dev/null
state resolve-question q5 "import first" >/dev/null
check "go on the plan: 8 Setup active" "7 Plan done; 8 Setup active" "$(state advance)"
check "current 8" "8" "$(field 's["current"]')"
state validate >/dev/null
echo "--- rows at stage 8"
rows
echo "---"

check "set-doc on the design stage" "6 Design doc design/" "$(state set-doc 6 design/)"
printf '{"version": 1, "current": 2' >"$work/.tower/design.json"
refuses "a broken file is never written over" advance
check "show on a broken file fails" "1" "$(state show >/dev/null 2>&1; echo $?)"

if [ "$bad" -eq 0 ]; then echo "all passed"; else echo "$bad failed"; exit 1; fi
