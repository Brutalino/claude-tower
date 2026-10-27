// A hand-written Git repository configuration for oink (Brutalino/oink, the money-tracker checkout), from the facts in
// docs/plans/general-tower.md: the shape a stored `<state dir>/projects/<id>.json` takes. Written as JSON (the test
// runner loads only code files, so it lives in a .ts file) and typed `unknown`, so only validateConfig vouches for it.

export const OINK_CONFIG: unknown = {
  "version": 1,
  "project": { "name": "O!nk", "repo": "Brutalino/oink", "baseBranch": "main", "mainCheckout": "~/Repositories/money-tracker" },
  "tickets": {
    "kind": "github",
    "repo": "Brutalino/oink",
    "labels": { "kinds": { "bug": "fix" }, "defaultKind": "feature" },
    "mineFirst": true,
    "idPattern": { "source": "^(?:fix|feature)/(\\d+)-", "flags": "" },
    "folderPattern": { "source": "^(\\d+)-", "flags": "" }
  },
  "worktree": {
    "pathTemplate": "~/tower-work/oink/{n}-{slug}",
    "followExisting": false,
    "branch": { "kind": "template", "template": "{kind}/{n}-{slug}", "kindFromLabel": true },
    "slugMax": 40,
    "stackOnBlocker": false
  },
  "workflow": {
    "steps": {
      "start": { "skill": "start-ticket", "args": "{n}", "phase": "not started", "session": "ticket" },
      "openPr": { "skill": "open-pr", "args": "", "phase": "implementing", "session": "ticket" },
      "review": { "skill": "review-pr", "args": "{pr}", "phase": "review", "session": "review" },
      "wrapUp": { "skill": "wrap-up", "args": "{pr}", "phase": null, "session": "ticket" },
      "release": { "skill": "release", "args": "", "phase": null, "session": "hub" }
    }
  },
  "phases": {
    "source": "state-file",
    "path": ".work/state.json",
    "values": ["planning", "implementing", "review"],
    "mapping": { "planning": "planning", "implementing": "implementing", "review": "review" },
    "unknownAs": "implementing"
  },
  "review": {
    "skill": "review-pr",
    "args": "{pr}",
    "heading": { "source": "^##\\s+Review\\b(?:\\s+\\(round\\s+(\\d+)\\))?.*$", "flags": "im" },
    "roundPattern": { "source": "\\(round\\s+(\\d+)\\)", "flags": "i" },
    "sections": ["Blockers", "Suggestions", "Earlier rounds"],
    "verdict": {
      "ready": { "source": "^Verdict:\\s*ready to merge\\b", "flags": "im" },
      "fixes": { "source": "^Verdict:\\s*fixes needed\\b", "flags": "im" }
    },
    "blockersSection": null,
    "savePath": ".work/review/pr-{pr}-round-{round}.md"
  },
  "waits": {
    "post": {
      "patterns": [
        { "source": "\\b(?:post|publish)\\b(?!-)", "flags": "i" }, { "source": "\\bpubblic", "flags": "i" },
        { "source": "\\bcomment on the PR\\b", "flags": "i" }, { "source": "gh pr comment", "flags": "i" }
      ],
      "awayAnswer": null
    },
    "merge": { "patterns": [{ "source": "\\bmerge\\b", "flags": "i" }], "awayAnswer": null },
    "issue": { "patterns": [{ "source": "\\b(?:create|open|file)\\b.*\\bissue\\b", "flags": "i" }], "awayAnswer": null },
    "release": { "patterns": [{ "source": "\\brelease\\b", "flags": "i" }], "awayAnswer": null }
  },
  "checks": { "sources": [{ "stateFile": ".work/state.json" }, { "release": "build-{n}" }] },
  "env": { "kind": "simulator", "nameTemplate": "iPhone 16 Pro (Oink {n})" },
  "repoActions": [
    { "key": "n", "label": "new ticket", "skill": "new-ticket", "cwd": "main" },
    { "key": "t", "label": "triage", "skill": "triage", "cwd": "main" },
    { "key": "l", "label": "release", "skill": "release", "cwd": "main" }
  ],
  "routing": "defaults",
  "delivery": "pr",
  "permissions": {
    "allow": ["Bash(xcrun simctl:*)", "Bash(nohup xcrun simctl:*)", "Bash(xcodebuild:*)", "Bash(ffmpeg:*)", "Bash(mkdir:*)", "Bash(cp:*)", "Bash(sleep:*)"]
  }
}
