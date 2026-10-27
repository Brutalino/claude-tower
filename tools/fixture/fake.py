"""Helper behind the fixture's fake skills. Usage: fake.sh <verb> [args]. Runs from the session's cwd."""
import datetime, json, os, re, signal, socket, subprocess, sys, tempfile, time, urllib.request

ARGS = sys.argv[1:]


def die(msg):
    sys.stderr.write("fake.sh: " + msg + "\n")
    sys.exit(1)


def git(*a, check=True, cwd=None):
    r = subprocess.run(["git"] + list(a), capture_output=True, text=True, cwd=cwd)
    if check and r.returncode != 0:
        die("git %s failed: %s" % (a[0], (r.stderr or r.stdout).strip().splitlines()[-1:]))
    return r.stdout.strip()


def now():
    return datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


r = subprocess.run(["git", "rev-parse", "--show-toplevel", "--git-common-dir"], capture_output=True, text=True)
if r.returncode != 0:
    die("not inside the fixture repository")
TOP, COMMON = r.stdout.strip().splitlines()
MAIN = os.path.dirname(os.path.realpath(os.path.join(TOP, COMMON)))
TARGET = os.path.dirname(MAIN)
GH = os.path.join(TARGET, "bin", "gh")
if not os.path.exists(GH):
    die("fake gh not found at %s (not a fixture repository?)" % GH)
STATE = os.path.join(TOP, ".work", "state.json")
PIDFILE = os.path.join(TOP, ".work", "fake-dev-env.pid")
IN_MAIN = os.path.realpath(TOP) == os.path.realpath(MAIN)
BRANCH = git("rev-parse", "--abbrev-ref", "HEAD")


def gh(*a, check=True):
    r = subprocess.run([GH] + list(a), capture_output=True, text=True)
    if check and r.returncode != 0:
        die("gh %s: %s" % (" ".join(a[:2]), r.stderr.strip()))
    return r


def issues():
    try:
        with open(os.path.join(TARGET, "linear.json")) as fh:
            return {n["identifier"]: n for n in json.load(fh)["data"]["issues"]["nodes"]}
    except (OSError, ValueError, KeyError):
        return {}


def ticket_from_branch(b):
    m = re.match(r"^[^/]+/([a-z]+-\d+)", b)
    return m.group(1).upper() if m else None


def load_state(required=True):
    if not os.path.exists(STATE):
        if required:
            die("no .work/state.json here — run /start-ticket first")
        return None
    with open(STATE) as fh:
        return json.load(fh)


def save_state(s):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    tmp = STATE + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(s, fh, indent=2)
        fh.write("\n")
    os.replace(tmp, STATE)


def need_worktree():
    if IN_MAIN:
        die("run this from the ticket worktree, not the main checkout")


def pr_of(n):
    return json.loads(gh("pr", "view", str(n), "--json",
                         "number,state,isDraft,headRefName,baseRefName,statusCheckRollup,comments,url,title").stdout)


def current_pr():
    r = gh("pr", "view", "--json", "number,state,isDraft,url", check=False)
    return json.loads(r.stdout) if r.returncode == 0 else None


def plan(t=None):
    need_worktree()
    t = (t or ticket_from_branch(BRANCH) or "").upper()
    if not re.match(r"^[A-Z]+-\d+$", t):
        die("usage: fake.sh plan <TICKET>")
    s = load_state(False)
    if s:
        print("plan already exists for %s (phase %s)" % (s["ticket"], s["phase"]))
        return
    i = issues().get(t, {})
    title = i.get("title", t)
    s = {"ticket": t, "story": (i.get("parent") or {}).get("identifier"), "base": "origin/staging",
         "phase": "planning",
         "plan": "## Diagnosis\n%s: %s. The fixture stands in for the real cause.\n\n"
                 "## Plan\n1. Append the fix line to NOTES.md.\n2. Count the lines of NOTES.md.\n"
                 "3. Open the pull request.\n\n## Open questions\n- None.\n" % (t, title),
         "checks": None, "env": None, "evidence": [], "blockers": [],
         "next": "approve the plan, then implement"}
    save_state(s)
    print("plan saved to .work/state.json")


def go():
    need_worktree()
    s = load_state()
    if s["phase"] == "planning":
        s["phase"], s["next"] = "implementing", "implementing step 1 of 3"
        save_state(s)
    print("phase implementing — %s — title: %s" % (s["next"], issues().get(s["ticket"], {}).get("title", s["ticket"])))


def implemented():
    need_worktree()
    s = load_state()
    if s["phase"] != "implementing":
        die("phase is %s — say go first" % s["phase"])
    s["next"] = "run /open-pr"
    save_state(s)
    print("implemented — run /open-pr")


def open_pr():
    need_worktree()
    s = load_state()
    if s["phase"] == "planning":
        die("phase is planning — the plan is not approved yet; say go and implement first")
    pr = current_pr()
    if pr and pr["state"] == "OPEN":
        print("PR #%d already open: %s" % (pr["number"], pr["url"]))
        return
    title = issues().get(s["ticket"], {}).get("title", s["ticket"])
    if git("status", "--porcelain"):
        git("add", "-A")
        git("commit", "-q", "-m", "fix(%s): %s" % (s["ticket"].lower(), title[0].lower() + title[1:]))
    if git("rev-list", "--count", "origin/staging..HEAD") == "0":
        die("nothing to open: no commits ahead of origin/staging")
    git("push", "-q", "-u", "origin", BRANCH)
    s["checks"] = {"sha": git("rev-parse", "HEAD"), "at": now()}
    url = gh("pr", "create", "--draft", "--base", "staging", "--title", "%s %s" % (s["ticket"], title),
             "--body", "Fixes %s.\n\n%s" % (s["ticket"], s["plan"])).stdout.strip()
    n = int(url.rsplit("/", 1)[1])
    s["next"] = "mark the PR ready, then /review %d" % n
    save_state(s)
    print("draft PR #%d opened: %s" % (n, url))


def ready(n=None):
    if n is None:
        pr = current_pr()
        if not pr:
            die('no pull request for branch "%s"' % BRANCH)
        n = pr["number"]
    pr = pr_of(n)
    if pr["state"] != "OPEN":
        die("PR #%s is %s" % (n, pr["state"]))
    if pr["isDraft"]:
        gh("pr", "ready", str(n))
    s = load_state(False)
    if s and not IN_MAIN:
        s["next"] = "/review %s" % n
        save_state(s)
    print("PR #%s is ready — run /review %s" % (n, n))


def review_body(round_no):
    return ("## Self-review (round %d)\n\n### Scope check\nThe change is limited to the ticket's scope.\n\n"
            "### Quality check\nTests cover the change.\n\n### Blockers\n_(none)_\n\n"
            "### Suggestions\n_(none)_\n\n### Good stuff\nSmall, focused diff." % round_no)


def review(n):
    pr = pr_of(n)
    stat = subprocess.run(["git", "apply", "--stat"], input=gh("pr", "diff", str(n)).stdout,
                          capture_output=True, text=True).stdout
    sys.stdout.write(stat)
    # The review, then the reply options, and no file saved: the shape of a real round 3, so tower takes the
    # review from the answer itself and posts only the review (decision 025).
    round_no = sum(1 for c in pr["comments"] if c["body"].startswith("## Self-review")) + 1
    body = review_body(round_no)
    print("%s\n\nReply with one of these:\n  - post: I post this as round %d on PR #%s\n"
          "  - post + ready: I post it and mark the PR ready for review" % (body, round_no, n))


def review_post(n):
    pr = pr_of(n)
    rounds = sum(1 for c in pr["comments"] if c["body"].startswith("## Self-review"))
    gh("pr", "comment", str(n), "--body", review_body(rounds + 1))
    p = os.path.join(TARGET, "gh-state", "%s.json" % pr["number"])
    with open(p) as fh:
        d = json.load(fh)
    d["reviewDecision"] = "APPROVED"
    with open(p, "w") as fh:
        json.dump(d, fh, indent=2)
        fh.write("\n")
    print("review posted — run /wrap-up %s" % n)


def check(n):
    pr = pr_of(n)
    t = ticket_from_branch(pr["headRefName"]) or pr["headRefName"]
    if pr["state"] != "OPEN":
        die("PR #%s is %s, not open" % (n, pr["state"]))
    if pr["isDraft"]:
        die("PR #%s is still a draft — mark it ready first" % n)
    rollup = pr["statusCheckRollup"]
    if not rollup or any(c.get("conclusion") != "SUCCESS" for c in rollup):
        die("PR #%s: CI is not green" % n)
    if not any(c["body"].startswith("## Self-review") for c in pr["comments"]):
        die("PR #%s has no self-review — run /review %s first" % (n, n))
    return pr, t


def wrap_up_check(n):
    pr, t = check(n)
    print("ok: PR #%s (%s) is open, ready, green and self-reviewed" % (n, t))


def worktree_of(b):
    path = None
    for line in git("-C", MAIN, "worktree", "list", "--porcelain").splitlines():
        if line.startswith("worktree "):
            path = line[9:]
        elif line == "branch refs/heads/" + b:
            return path
    return None


def wrap_up(n):
    pr = pr_of(n)
    b = pr["headRefName"]
    if pr["state"] != "MERGED":
        check(n)
        gh("pr", "merge", str(n), "--merge")
    wt = worktree_of(b)
    if wt and os.path.realpath(wt) != os.path.realpath(MAIN):
        stop_dev_env(wt)
        git("-C", MAIN, "worktree", "remove", wt)
    git("-C", MAIN, "worktree", "prune")
    git("-C", MAIN, "fetch", "-q", "origin")
    if git("-C", MAIN, "rev-parse", "--verify", "-q", "refs/heads/" + b, check=False):
        git("-C", MAIN, "branch", "-q", "-d", b)
    if git("-C", MAIN, "rev-parse", "--abbrev-ref", "HEAD") == "staging":
        git("-C", MAIN, "merge", "-q", "--ff-only", "origin/staging", check=False)
    print("merged — worktree removed")


def alive(pid):
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    cmd = subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True).stdout
    return "http.server" in cmd


def read_pid(top):
    try:
        with open(os.path.join(top, ".work", "fake-dev-env.pid")) as fh:
            return int(fh.readline())
    except (OSError, ValueError):
        return None


def stop_dev_env(top):
    pid = read_pid(top)
    if pid and alive(pid):
        os.kill(pid, signal.SIGTERM)
        for _ in range(50):
            if not alive(pid):
                break
            time.sleep(0.1)
    if pid:
        os.remove(os.path.join(top, ".work", "fake-dev-env.pid"))
    sp = os.path.join(top, ".work", "state.json")
    if os.path.exists(sp):
        with open(sp) as fh:
            s = json.load(fh)
        if s.get("env"):
            s["env"]["status"] = "down"
            with open(sp, "w") as fh:
                json.dump(s, fh, indent=2)
                fh.write("\n")


def port_free(p):
    with socket.socket() as so:
        try:
            so.bind(("127.0.0.1", p))
            return True
        except OSError:
            return False


def dev_env(verb="status"):
    need_worktree()
    s = load_state()
    pid = read_pid(TOP)
    if verb == "up":
        if pid and alive(pid) and s.get("env") and s["env"]["status"] == "up":
            print("stack is up on %s" % s["env"]["frontendUrl"])
            return
        slot = next((k for k in range(1, 8) if port_free(5172 + k)), None)
        if slot is None:
            die("no free frontend port in 5173-5179")
        fe = 5172 + slot
        os.makedirs(os.path.join(TARGET, ".dev-env"), exist_ok=True)
        root = tempfile.mkdtemp(prefix=s["ticket"] + "-", dir=os.path.join(TARGET, ".dev-env"))
        proc = subprocess.Popen([sys.executable, "-m", "http.server", str(fe), "--bind", "127.0.0.1"],
                                cwd=root, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, start_new_session=True)
        with open(PIDFILE, "w") as fh:
            fh.write("%d\n" % proc.pid)
        with open(os.path.join(TARGET, ".dev-env", "pids"), "a") as fh:
            fh.write("%d\n" % proc.pid)
        url = "http://localhost:%d" % fe
        for _ in range(50):
            try:
                urllib.request.urlopen("http://127.0.0.1:%d/" % fe, timeout=1)
                break
            except OSError:
                time.sleep(0.1)
        else:
            proc.kill()
            die("fake dev server did not answer on port %d" % fe)
        s["env"] = {"project": "app-" + s["ticket"].lower(), "frontendUrl": url,
                    "ports": {"frontend": fe, "backend": 3000 + slot - 1, "postgres": 5433 + slot - 1},
                    "status": "up", "loginVerified": True, "startedAt": now()}
        save_state(s)
        print("stack is up on %s" % url)
    elif verb == "down":
        stop_dev_env(TOP)
        print("stack is down")
    elif verb == "status":
        e = s.get("env")
        if not e:
            print("no stack for %s" % s["ticket"])
        else:
            up = e["status"] == "up" and pid and alive(pid)
            print("%s: %s on %s" % (e["project"], "up" if up else "down", e["frontendUrl"]))
    else:
        die("usage: fake.sh dev-env up|down|status")


def need_n(a):
    if len(a) != 1 or not a[0].lstrip("#").isdigit():
        die("this verb needs a PR number")
    return a[0].lstrip("#")


def main():
    if not ARGS:
        die("usage: fake.sh <verb> [args]")
    v, a = ARGS[0], ARGS[1:]
    if v == "plan":
        plan(*a[:1])
    elif v == "go":
        go()
    elif v == "implemented":
        implemented()
    elif v == "open-pr":
        open_pr()
    elif v == "ready":
        ready(need_n(a) if a else None)
    elif v == "review":
        review(need_n(a))
    elif v == "review-post":
        review_post(need_n(a))
    elif v == "wrap-up-check":
        wrap_up_check(need_n(a))
    elif v == "wrap-up":
        wrap_up(need_n(a))
    elif v == "dev-env":
        dev_env(*a[:1])
    elif v == "triage":
        p = (sorted(issues()) or ["TKT-0"])[0].split("-")[0]
        print("triage: 3 free Bug candidates (%s-9008, %s-9009, %s-9010)\ntriage: %s-9009 is blocked by %s-9008" % ((p,) * 5))
    elif v == "new-ticket":
        print("new-ticket: drafted a ticket (not created — this is the fixture)\nnew-ticket: nothing was written")
    else:
        die("unknown verb: %s" % v)


main()
