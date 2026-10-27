"""Fake `gh` for the tower test fixtures. Pull requests live in <target>/gh-state/<n>.json; the GitHub fixture's
issues in <target>/gh-issues.json (tools/fixture-github.sh). Read-only for issues: no issue command writes."""
import json, os, subprocess, sys, datetime

TARGET = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
STATE = os.path.join(TARGET, "gh-state")
ORIGIN = os.path.join(TARGET, "origin.git")
MERGE = os.path.join(TARGET, ".merge")
ISSUES = os.path.join(TARGET, "gh-issues.json")
LOGIN = "fixture-dev"
GREEN = [{"name": "ci / lint", "status": "COMPLETED", "conclusion": "SUCCESS"},
         {"name": "ci / test", "status": "COMPLETED", "conclusion": "SUCCESS"}]
ARGS = sys.argv[1:]


def die(msg, code=1):
    sys.stderr.write(msg + "\n")
    sys.exit(code)


def unsupported():
    die("fake gh: unsupported: " + " ".join(ARGS))


def now():
    return datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def git(*a, **kw):
    return subprocess.run(["git"] + list(a), capture_output=True, text=True, **kw)


def load_all():
    prs = []
    if os.path.isdir(STATE):
        for f in os.listdir(STATE):
            if f.endswith(".json"):
                with open(os.path.join(STATE, f)) as fh:
                    prs.append(json.load(fh))
    return sorted(prs, key=lambda p: p["number"])


def load(n):
    try:
        n = int(str(n).lstrip("#"))
    except ValueError:
        die("fake gh: not a pull request number: %s" % n)
    p = os.path.join(STATE, "%d.json" % n)
    if not os.path.exists(p):
        die("GraphQL: Could not resolve to a PullRequest with the number of %d. (repository.pullRequest)" % n)
    with open(p) as fh:
        return json.load(fh)


def save(pr):
    pr["updatedAt"] = now()
    os.makedirs(STATE, exist_ok=True)
    with open(os.path.join(STATE, "%d.json" % pr["number"]), "w") as fh:
        json.dump(pr, fh, indent=2)
        fh.write("\n")


def branch():
    r = git("rev-parse", "--abbrev-ref", "HEAD")
    if r.returncode != 0:
        die("fatal: not a git repository (or any of the parent directories): .git")
    return r.stdout.strip()


def origin_sha(ref):
    r = git("--git-dir", ORIGIN, "rev-parse", "--verify", "-q", "refs/heads/" + ref)
    return r.stdout.strip() if r.returncode == 0 else None


def opt(name, rest, default=None):
    if name in rest:
        i = rest.index(name)
        if i + 1 >= len(rest):
            unsupported()
        v = rest[i + 1]
        del rest[i:i + 2]
        return v
    return default


def flag(name, rest):
    if name in rest:
        rest.remove(name)
        return True
    return False


def pick(pr, fields):
    return {f: pr.get(f) for f in fields.split(",") if f}


def pr_view(rest):
    fields = opt("--json", rest)
    if len(rest) > 1:
        unsupported()
    if rest:
        pr = load(rest[0])
    else:
        b = branch()
        match = [p for p in load_all() if p["headRefName"] == b]
        open_ = [p for p in match if p["state"] == "OPEN"]
        if not match:
            die('no pull requests found for branch "%s"' % b)
        pr = (open_ or match)[-1]
    if fields:
        print(json.dumps(pick(pr, fields), indent=2))
    else:
        print("%s #%d\n%s%s\n%s" % (pr["title"], pr["number"], pr["state"],
                                    " (draft)" if pr["isDraft"] else "", pr["url"]))


def pr_list(rest):
    fields = opt("--json", rest)
    state = opt("--state", rest, "open").upper()
    head = opt("--head", rest)
    opt("--repo", rest)
    if rest or not fields or state not in ("OPEN", "CLOSED", "MERGED", "ALL"):
        unsupported()
    prs = [p for p in load_all() if (state == "ALL" or p["state"] == state) and (head is None or p["headRefName"] == head)]
    print(json.dumps([pick(p, fields) for p in reversed(prs)], indent=2))


def issue_list(rest):
    repo = opt("--repo", rest)
    fields = opt("--json", rest)
    state = opt("--state", rest, "open").upper()
    limit = int(opt("--limit", rest, "30"))
    if rest or not repo or not fields or state not in ("OPEN", "CLOSED", "ALL"):
        unsupported()
    issues = []
    if os.path.exists(ISSUES):
        with open(ISSUES) as fh:
            issues = json.load(fh)
    shown = [i for i in issues if state == "ALL" or i.get("state", "OPEN") == state][:limit]
    print(json.dumps([pick(i, fields) for i in shown], indent=2))


def pr_create(rest):
    draft = flag("--draft", rest)
    base = opt("--base", rest)
    title = opt("--title", rest)
    body = opt("--body", rest)
    if rest or not draft or not base or title is None or body is None:
        unsupported()
    b = branch()
    for p in load_all():
        if p["headRefName"] == b and p["state"] == "OPEN":
            die('a pull request for branch "%s" into branch "%s" already exists:\n%s' % (b, p["baseRefName"], p["url"]))
    sha = origin_sha(b)
    if not sha:
        die("aborted: you must first push the current branch to a remote, or use the --head flag")
    if not origin_sha(base):
        die("pull request create failed: GraphQL: Base ref must be a branch (createPullRequest)")
    n = max([100] + [p["number"] for p in load_all()]) + 1
    pr = {"number": n, "headRefName": b, "baseRefName": base, "title": title, "body": body,
          "state": "OPEN", "isDraft": True, "reviewDecision": "REVIEW_REQUIRED",
          "statusCheckRollup": [], "url": "https://example.invalid/pr/%d" % n,
          "headRefOid": sha, "mergedAt": None, "comments": [],
          "mergeable": "MERGEABLE", "mergeStateStatus": "CLEAN", "reviews": [], "createdAt": now(), "updatedAt": now()}
    save(pr)
    print(pr["url"])


def pr_ready(rest):
    undo = flag("--undo", rest)
    if len(rest) != 1:
        unsupported()
    pr = load(rest[0])
    if pr["state"] != "OPEN":
        die("Pull request #%d is closed. Only draft pull requests can be marked as \"ready for review\"" % pr["number"])
    pr["isDraft"] = undo
    if not undo:
        pr["statusCheckRollup"] = GREEN
        print("✓ Pull request #%d is marked as \"ready for review\"" % pr["number"])
    else:
        print("✓ Pull request #%d is converted to \"draft\"" % pr["number"])
    save(pr)


def pr_comment(rest):
    body = opt("--body", rest)
    body_file = opt("--body-file", rest)
    if body is None and body_file is not None:
        with open(body_file) as fh:
            body = fh.read()
    if len(rest) != 1 or body is None:
        unsupported()
    pr = load(rest[0])
    pr["comments"].append({"author": {"login": "fixture-dev"}, "body": body, "createdAt": now()})
    save(pr)
    print("%s#issuecomment-%d" % (pr["url"], len(pr["comments"])))


def pr_diff(rest):
    if len(rest) != 1:
        unsupported()
    pr = load(rest[0])
    head = origin_sha(pr["headRefName"]) or pr["headRefOid"]
    r = git("--git-dir", ORIGIN, "diff", "refs/heads/%s...%s" % (pr["baseRefName"], head))
    if r.returncode != 0:
        die(r.stderr.strip())
    sys.stdout.write(r.stdout)


def pr_merge(rest):
    if "--squash" in rest or "--rebase" in rest:
        die("merge method not allowed")
    if not flag("--merge", rest) or len(rest) != 1:
        unsupported()
    pr = load(rest[0])
    n = pr["number"]
    if pr["state"] != "OPEN":
        die("Pull request #%d was already merged or closed" % n)
    if pr["isDraft"]:
        die("Pull request #%d is still a draft" % n)
    if not os.path.isdir(MERGE):
        r = git("clone", "-q", ORIGIN, MERGE)
        if r.returncode != 0:
            die(r.stderr.strip())
        for k, v in (("user.name", "Fixture Dev"), ("user.email", "fixture@example.invalid"),
                     ("commit.gpgsign", "false"), ("core.hooksPath", "/dev/null")):
            git("-C", MERGE, "config", k, v)
    base, head = pr["baseRefName"], pr["headRefName"]
    for cmd in (("fetch", "-q", "origin"), ("checkout", "-q", "-B", base, "origin/" + base),
                ("merge", "-q", "--no-ff", "origin/" + head, "-m",
                 "Merge pull request #%d from %s\n\n%s" % (n, head, pr["title"])),
                ("push", "-q", "origin", base)):
        r = git("-C", MERGE, *cmd)
        if r.returncode != 0:
            git("-C", MERGE, "merge", "--abort")
            die("fake gh: merge failed: " + (r.stderr.strip() or r.stdout.strip()))
    pr["state"], pr["mergedAt"] = "MERGED", now()
    save(pr)
    print("✓ Merged pull request #%d (%s)" % (n, pr["title"]))


def pr_close(rest):
    delete = flag("--delete-branch", rest)
    if len(rest) != 1:
        unsupported()
    pr = load(rest[0])
    if pr["state"] != "OPEN":
        die("Pull request #%d is already %s" % (pr["number"], pr["state"].lower()))
    pr["state"] = "CLOSED"
    save(pr)
    print("✓ Closed pull request #%d (%s)" % (pr["number"], pr["title"]))
    if delete:
        git("--git-dir", ORIGIN, "branch", "-D", pr["headRefName"])
        print("✓ Deleted branch %s" % pr["headRefName"])


def main():
    if ARGS[:2] == ["auth", "status"] and len(ARGS) == 2:
        print("example.invalid\n  ✓ Logged in to example.invalid account fixture-dev (fake gh)")
        return
    if ARGS == ["api", "user"]:
        print(json.dumps({"login": LOGIN, "id": 1, "name": "Fixture Dev"}, indent=2))
        return
    if ARGS[:2] == ["issue", "list"]:
        issue_list(list(ARGS[2:]))
        return
    if len(ARGS) < 2 or ARGS[0] != "pr":
        unsupported()
    fn = {"view": pr_view, "list": pr_list, "create": pr_create, "ready": pr_ready,
          "comment": pr_comment, "diff": pr_diff, "merge": pr_merge, "close": pr_close}.get(ARGS[1])
    if not fn:
        unsupported()
    fn(list(ARGS[2:]))


main()
