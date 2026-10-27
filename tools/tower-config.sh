#!/usr/bin/env bash
# Tower's configuration from the command line (decision 061), for the tower-setup skill and by hand:
#
#   tower-config.sh validate <file>                     the file against Tower's own validateConfig; errors as path: what
#   tower-config.sh save <file> <checkout> [--replace]  validate, then write it to
#                                                       ${TOWER_STATE_DIR:-~/.claude/tower}/projects/<projectId>.json
#                                                       (projectId: the main checkout's path, non-alphanumerics -);
#                                                       an existing different file is kept and the diff shown, unless --replace
#   tower-config.sh path <checkout>                     where save would write
#   validate <file> --skills <checkout|folder>           also: every skill the configuration runs is there
#   tower-config.sh render <values.json> <out> [skill…] the flow templates (skills/tower-setup/flow) filled, as
#                                                       <out>/<skill>/SKILL.md (decision 065)
#   tower-config.sh deliver <repo> <rendered> commit|pr <base> [skill…]
#                                                       the rendered skills into <repo>/.claude/skills, one commit:
#                                                       commit on <base> (the main checkout must be on it), or pr on a
#                                                       new branch tower/setup-flow from origin/<base> (else <base>),
#                                                       made in a temporary worktree; never a push, never a PR
#
# Exit 0 ok, 1 invalid or failed, 2 usage, 3 an existing file differs (nothing written).
# Needs node 22.18+ or 23.6+ (it strips TypeScript's types itself); no package is installed.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v node >/dev/null 2>&1 || { echo "tower-config: node is needed (22.18+ or 23.6+)" >&2; exit 1; }
node -e 'process.exit(require("node:module").registerHooks && process.features.typescript ? 0 : 1)' 2>/dev/null \
  || { echo "tower-config: node $(node --version) cannot run TypeScript; 22.18+ or 23.6+ is needed" >&2; exit 1; }
exec node --no-warnings "$here/tower-cli.mjs" "$@"
