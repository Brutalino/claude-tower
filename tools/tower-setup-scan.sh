#!/usr/bin/env bash
# tower-setup's scan (decision 061): the facts of a repository (remote, base branch, skills, workflows, tags, state
# file, review format, worktrees, …, each with its file:line) and the configuration they map to, as JSON:
#
#   tower-setup-scan.sh <repository>            { facts, proposal: { config, items, notSupported, questions, errors } }
#   tower-setup-scan.sh <repository> --config   the proposed configuration alone
#   … --with-skills <rendered folder>            as if those skills were in the repository (before a PR is merged)
#
# The JSON also holds `flow`: the reference-flow skills to propose (`skills`, each with its reason), the stages covered
# in part (`notes`), the first tickets for large missing work, and the draft values for the templates (decision 065).
#
# Read only: git worktree list, remote get-url, symbolic-ref, for-each-ref, tag, ls-files, and the files they name.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ $# -ge 1 ] || { echo "usage: tower-setup-scan.sh <repository> [--config]" >&2; exit 2; }
repo="$1"
shift
exec "$here/tower-config.sh" scan "$repo" "$@"
