#!/usr/bin/env python3
"""Hermetic eval for move_chat.py: own daemon, own PASEO_HOME, own CLAUDE_CONFIG_DIR.

Runs zero provider calls — transcripts are synthesized on disk, so this costs no
tokens and never touches the real daemon. Exits non-zero if any case fails or if
the production state was modified.

usage: eval_run.py [--keep] [--port N]

The daemon and the opencode fixture bind OS-assigned free ports by default;
--port only exists to pin one for debugging.

Cases that need a provider CLI that is not installed are reported as SKIP, not
FAIL: green means "nothing that ran is broken".
"""
import glob, json, os, shutil, signal, socket, subprocess, sys, tempfile, time, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "scripts", "move_chat.py")
def pick_port():
    """Ask the OS for a free port. 6798 is not reserved for the stand — a real Paseo
    daemon can be sitting on it, and then every run dies before the first case."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


PORT = (int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv
        else pick_port())
HOST = f"127.0.0.1:{PORT}"
KEEP = "--keep" in sys.argv
SKIP = object()          # sentinel: recorded, but not a failure
CLIENT = None
ENV = {}
RESULTS = []
FIXTURE_IDS = []         # every provider session this stand creates, for the leak check

_src = open(SCRIPT).read().replace("\nmain()\n", "\n")
_ns = {}
exec(compile(_src, "move_chat", "exec"), _ns)
slug = _ns["claude_slug"]
# 0700 and unguessable: a fixed /tmp root is a symlink-swap target, and two
# concurrent runs would stomp each other.
T = tempfile.mkdtemp(prefix="paseo-eval-")
T_SLUG = slug(os.path.realpath(T))      # marks any project dir this stand produced


class Skip(Exception):
    """A case that cannot run here. Not a failure — see case()."""


def sh(*cmd, env=None, **kw):
    return subprocess.run(cmd, capture_output=True, text=True,
                          env={**os.environ, **ENV, **(env or {})}, **kw)


def node(call, client=None, host=HOST):
    src = (f"import('{client or CLIENT}').then(async (m) => {{\n"
           f"  const client = await m.connectToDaemon({json.dumps({'host': host})});\n"
           f"  try {{ const r = await ({call}); console.log(JSON.stringify(r ?? {{}})); }}\n"
           "  finally { await client.close(); }\n"
           "}).catch(e => { console.error('ERR:' + e.message); process.exit(1); });")
    r = sh("node", "--input-type=module", "-e", src)
    if r.returncode:
        raise RuntimeError(r.stderr.strip())
    return json.loads(r.stdout.strip() or "{}")


def find_client():
    # same locator as the script under test, so the stand cannot pass on a client
    # the real run would never find (and vice versa)
    return _ns["client_js"]()


def free_port(p):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", p)) != 0


# ---------------------------------------------------------------- fixtures
def transcript(cwd, branch, title, lines=6):
    sid = str(uuid.uuid4())
    d = f"{T}/claude/projects/{slug(os.path.realpath(cwd))}"
    os.makedirs(d, exist_ok=True)
    with open(f"{d}/{sid}.jsonl", "w") as f:
        for i in range(lines):
            f.write(json.dumps({
                "type": "user" if i % 2 == 0 else "assistant",
                "sessionId": sid, "cwd": cwd, "gitBranch": branch,
                "isSidechain": False, "userType": "external",
                "uuid": str(uuid.uuid4()), "parentUuid": None,
                "timestamp": f"2026-09-14T10:0{i}:00.000Z", "version": "2.0.0",
                "message": {"role": "user" if i % 2 == 0 else "assistant",
                            "content": [{"type": "text",
                                         "text": f"{title} line {i} ref {cwd}/f.txt"}]},
            }, ensure_ascii=False) + "\n")
    FIXTURE_IDS.append(sid)
    return sid


def codex_fixture(cwd, title, lines=4):
    """A synthetic codex rollout. thread/list reads $CODEX_HOME/sessions/<y>/<m>/<d>/."""
    tid = str(uuid.uuid4())
    d = f"{T}/codex/sessions/2026/09/14"
    os.makedirs(d, exist_ok=True)
    rows = [{"timestamp": "2026-09-14T10:00:00.000Z", "type": "session_meta",
             "payload": {"id": tid, "timestamp": "2026-09-14T10:00:00.000Z", "cwd": cwd,
                         "originator": "paseo-eval", "cli_version": "0.154.0",
                         "source": "cli", "model_provider": "openai"}}]
    for i in range(lines):
        rows.append({"timestamp": f"2026-09-14T10:0{i + 1}:00.000Z", "type": "response_item",
                     "payload": {"type": "message",
                                 "role": "user" if i % 2 == 0 else "assistant",
                                 "content": [{"type": "input_text",
                                              "text": f"{title} line {i}"}]}})
    with open(f"{d}/rollout-2026-09-14T10-00-00-{tid}.jsonl", "w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    FIXTURE_IDS.append(tid)
    return tid


def opencode_fixture(cwd, title, port=None):
    """Create an empty opencode session through its own HTTP API. No model call."""
    port = port or pick_port()   # never a fixed port: a real `opencode serve` may hold it
    proc = subprocess.Popen(["opencode", "serve", "--port", str(port),
                             "--hostname", "127.0.0.1"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            env={**os.environ, **ENV}, cwd=cwd)
    try:
        for _ in range(60):
            time.sleep(0.5)
            r = sh("curl", "-sf", f"http://127.0.0.1:{port}/session?directory={cwd}")
            if r.returncode == 0:
                break
        else:
            raise RuntimeError("opencode serve did not come up")
        r = sh("curl", "-sf", "-X", "POST",
               f"http://127.0.0.1:{port}/session?directory={cwd}",
               "-H", "content-type: application/json",
               "-d", json.dumps({"title": title}))
        if r.returncode:
            raise RuntimeError(f"session create failed: {r.stderr}")
        oc_sid = json.loads(r.stdout)["id"]
        FIXTURE_IDS.append(oc_sid)
        return oc_sid
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


def import_provider(provider, sid, cwd, ws, labels=None):
    inp = {"provider": provider, "sessionId": sid, "cwd": cwd, "workspaceId": ws}
    if labels:
        inp["labels"] = labels
    return node(f"client.importAgent({json.dumps(inp)})")["id"]


def agent(cwd, branch, title, ws, labels=None, lines=6):
    sid = transcript(cwd, branch, title, lines)
    inp = {"provider": "claude", "sessionId": sid, "cwd": cwd, "workspaceId": ws}
    if labels:
        inp["labels"] = labels
    a = node(f"client.importAgent({json.dumps(inp)})")
    return a["id"], sid


def state(agent_id):
    hits = glob.glob(f"{T}/paseo/agents/*/{agent_id}*.json")
    return json.load(open(hits[0])) if hits else None


def agents_with_session(sid):
    out = []
    for f in glob.glob(f"{T}/paseo/agents/*/*.json"):
        d = json.load(open(f))
        if (d.get("persistence") or {}).get("sessionId") == sid:
            out.append(d)
    return out


def move(*args):
    return sh(sys.executable, SCRIPT, *args, "--host", HOST)


# ---------------------------------------------------------------- harness
def case(name, fn):
    try:
        fn()
        RESULTS.append((name, None))
        print(f"  PASS  {name}")
    except Skip as e:
        RESULTS.append((name, SKIP))
        print(f"  SKIP  {name}: {e}")
    except AssertionError as e:
        RESULTS.append((name, str(e)))
        print(f"  FAIL  {name}: {e}")
    except Exception as e:
        RESULTS.append((name, f"{type(e).__name__}: {e}"))
        print(f"  ERROR {name}: {type(e).__name__}: {e}")


def setup():
    global CLIENT, ENV
    CLIENT = find_client()
    if not free_port(PORT):
        raise SystemExit(f"port {PORT} busy — omit --port to let the OS pick one")
    for d in ("paseo", "claude/projects", "repo"):
        os.makedirs(f"{T}/{d}", exist_ok=True)
    ENV = {"PASEO_HOME": f"{T}/paseo", "CLAUDE_CONFIG_DIR": f"{T}/claude",
           "PASEO_LISTEN": HOST, "PASEO_RELAY_ENABLED": "false",
           "PASEO_WEB_UI_ENABLED": "false",
           # codex reads CODEX_HOME; opencode reads XDG_DATA_HOME/OPENCODE_CONFIG_DIR.
           # The daemon spawns both, so they inherit these and stay off the real stores.
           "CODEX_HOME": f"{T}/codex", "XDG_DATA_HOME": f"{T}/xdg",
           "OPENCODE_CONFIG_DIR": f"{T}/oc-config"}
    g = ["git", "-c", "user.email=t@t", "-c", "user.name=t",
         "-c", "commit.gpgsign=false", "-C", f"{T}/repo"]
    sh("git", "init", "-q", "-b", "main", f"{T}/repo")
    open(f"{T}/repo/a.txt", "w").write("hi\n")
    sh(*g, "add", "-A")
    sh(*g, "commit", "-qm", "init", "--no-verify")
    sh(*g, "worktree", "add", "-q", f"{T}/wt", "-b", "wtbranch")
    # long enough to trip claude's 200-char cap, short enough that paseo's own
    # agents dir name (path with "/"->"-") stays under NAME_MAX = 255.
    # Size the LEAF, not the depth: the stand root lives under $TMPDIR and its
    # length varies per platform, so stepping in fixed 41-char chunks can step
    # straight over the window.
    rt, deep = len(os.path.realpath(T)), None
    for n in range(12):
        leaf = 215 - (rt + n * 41) - 1
        if 4 <= leaf <= 150:
            deep = T + "".join("/" + "x" * 40 for _ in range(n)) + "/" + "l" * leaf
            break
    assert deep, f"could not size the deep fixture path (root is {rt} chars)"
    assert 205 < len(os.path.realpath(deep)) < 245, len(os.path.realpath(deep))
    sh(*g, "worktree", "add", "-q", deep, "-b", "deepbranch")
    print(f"daemon on {HOST} ...")
    sh("paseo", "daemon", "start", "--home", f"{T}/paseo")
    for _ in range(40):
        time.sleep(0.25)
        if sh("paseo", "daemon", "status", "--home", f"{T}/paseo").returncode == 0:
            break
    ws = {}
    for name, path in (("WS-A", f"{T}/repo"), ("WS-B", f"{T}/repo"),
                       ("WS-C", f"{T}/wt"), ("DUP", f"{T}/repo"), ("DUP", f"{T}/repo"),
                       ("WS-DEEP", deep)):
        r = sh("paseo", "workspace", "create", "--host", HOST, "--isolation", "local",
               "--path", path, "--title", name, "--json")
        ws.setdefault(name, []).append(json.loads(r.stdout)["workspaceId"])
    return ws, deep


def teardown():
    try:
        pid = json.load(open(f"{T}/paseo/paseo.pid"))["pid"]
    except Exception:
        pid = None
    if pid:
        try:
            os.kill(pid, signal.SIGTERM)
            for _ in range(40):
                time.sleep(0.25)
                os.kill(pid, 0)
            cmd = subprocess.run(["ps", "-o", "command=", "-p", str(pid)],
                                 capture_output=True, text=True).stdout.lower()
            if "paseo" in cmd:       # 10s of SIGTERM ignored — but pids get recycled
                os.kill(pid, signal.SIGKILL)
            else:
                print(f"warn: pid {pid} is no longer a paseo process; not killing")
        except ProcessLookupError:
            pass
    if KEEP:
        print(f"stand kept at {T}")
    else:
        shutil.rmtree(T, ignore_errors=True)


def real_daemon_identity():
    """Restarting the real daemon leaves agent state identical, so the snapshot below
    cannot see it. Pin the daemon's own identity too."""
    r = subprocess.run(["paseo", "daemon", "status", "--json"], capture_output=True,
                       text=True, env={k: v for k, v in os.environ.items()
                                       if k not in ("PASEO_HOME", "PASEO_LISTEN")})
    try:
        d = json.loads(r.stdout)
        return (d.get("serverId"), d.get("pid"), d.get("startedAt"))
    except Exception:
        return ("unreadable",)


def prod_snapshot():
    out = {"__daemon__": real_daemon_identity()}
    for p in glob.glob(os.path.expanduser("~/.paseo/agents/*/*.json")):
        try:
            d = json.load(open(p))
        except Exception:
            continue
        out[p] = (d.get("workspaceId"), bool(d.get("archivedAt")),
                  (d.get("persistence") or {}).get("sessionId"), d.get("cwd"),
                  json.dumps(d.get("labels"), sort_keys=True))
    # Per FILE, not per directory: a stray clone lands as a new .jsonl inside a
    # project dir that already exists, which a directory listing would not notice.
    # Deliberately names only — size/mtime would compare live sessions against
    # themselves, and every real agent on the machine writes while this runs.
    out["__projects__"] = sorted(
        glob.glob(os.path.expanduser("~/.claude/projects/*")) +
        glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")))
    # the stand also spawns codex and opencode; prove their real stores stayed put
    # Top level only. Counting entries inside these stores is unwinnable: any real
    # codex/opencode agent on the machine writes to them while we run. Whether the
    # stand itself leaked is answered precisely by fixture_leaks() instead.
    out["__codex__"] = sorted(glob.glob(os.path.expanduser("~/.codex/*")))
    out["__opencode__"] = sorted(glob.glob(os.path.expanduser("~/.local/share/opencode/*")))
    return out


def fixture_leaks():
    """Did any session the stand created land in a REAL provider store? Immune to
    whatever unrelated agents are doing, because it matches on our own ids."""
    roots = [os.path.expanduser("~/.codex"),
             os.path.expanduser("~/.local/share/opencode"),
             os.path.expanduser("~/.claude/projects")]
    hits = []
    for i in FIXTURE_IDS:
        for root in roots:
            found = glob.glob(f"{root}/**/*{i}*", recursive=True)
            if found:
                hits.append(found[0])
    return hits


def run_cases():
    ws, deep = setup()
    A, B, C, DEEP = ws["WS-A"][0], ws["WS-B"][0], ws["WS-C"][0], ws["WS-DEEP"][0]
    print(f"WS-A={A} WS-B={B} WS-C={C} WS-DEEP={DEEP}\n")

    # 1 REHOME
    def c1():
        aid, _ = agent(f"{T}/repo", "main", "rehome", A)
        r = move(aid[:8], B, "--apply")
        assert r.returncode == 0, r.stderr or r.stdout
        s = state(aid)
        assert s["workspaceId"] == B, f"ws={s['workspaceId']}"
        assert not s.get("archivedAt"), "left archived"
        assert s["id"] == aid, "agent id changed"
    case("REHOME keeps id, moves workspace", c1)

    # 2 labels survive
    def c2():
        lbl = {"paseo.parent-agent-id": "11111111-2222-3333-4444-555555555555", "x": "y"}
        aid, _ = agent(f"{T}/repo", "main", "labels", A, labels=lbl)
        r = move(aid[:8], B, "--apply")
        assert r.returncode == 0, r.stderr
        assert state(aid).get("labels") == lbl, f"labels={state(aid).get('labels')}"
    case("REHOME preserves labels (subagent link)", c2)

    # 3 rerun is a no-op
    def c3():
        aid, _ = agent(f"{T}/repo", "main", "idem", A)
        assert move(aid[:8], B, "--apply").returncode == 0
        r = move(aid[:8], B, "--apply")
        assert r.returncode == 0 and "nothing to do" in r.stdout, r.stdout
    case("REHOME idempotent on rerun", c3)

    # 4 already in target
    def c4():
        aid, _ = agent(f"{T}/repo", "main", "noop", A)
        r = move(aid[:8], A, "--apply")
        assert "nothing to do" in r.stdout, r.stdout
        assert not state(aid).get("archivedAt")
    case("no-op when already in target", c4)

    # 5 CLONE into a different cwd
    def c5():
        aid, sid = agent(f"{T}/repo", "main", "clone", A, lines=8)
        r = move(aid[:8], C, "--apply")
        assert r.returncode == 0, r.stderr or r.stdout
        out = json.loads(r.stdout[r.stdout.index("{"):r.stdout.rindex("}") + 1])
        new = out["agent"]
        assert new != aid, "clone reused the original agent id"
        assert state(aid) is not None, "original disappeared"
        ns = state(new)
        assert ns["workspaceId"] == C and os.path.realpath(ns["cwd"]) == os.path.realpath(f"{T}/wt")
        nsid = ns["persistence"]["sessionId"]
        src = glob.glob(f"{T}/claude/projects/*/{sid}.jsonl")[0]
        dst = f"{T}/claude/projects/{slug(os.path.realpath(f'{T}/wt'))}/{nsid}.jsonl"
        assert os.path.exists(dst), f"clone transcript missing: {dst}"
        a_lines = [json.loads(l) for l in open(src)]
        b_lines = [json.loads(l) for l in open(dst)]
        assert len(a_lines) == len(b_lines), f"{len(a_lines)} vs {len(b_lines)}"
        assert all(x["sessionId"] == nsid for x in b_lines), "sessionId not rewritten"
        assert all(os.path.realpath(x["cwd"]) == os.path.realpath(f"{T}/wt") for x in b_lines)
        assert all(x["gitBranch"] == "wtbranch" for x in b_lines), "gitBranch not rewritten"
        old_refs = sum(f"{T}/repo/f.txt" in json.dumps(x["message"]) for x in b_lines)
        assert old_refs == len(b_lines), f"history text was rewritten ({old_refs})"
    case("CLONE writes a new session, keeps history text", c5)

    # 6 CLONE idempotency
    def c6():
        aid, _ = agent(f"{T}/repo", "main", "cloneidem", A)
        assert move(aid[:8], C, "--apply").returncode == 0
        n1 = len(glob.glob(f"{T}/paseo/agents/*/*.json"))
        r = move(aid[:8], C, "--apply")
        assert "already imported" in r.stdout, r.stdout
        assert len(glob.glob(f"{T}/paseo/agents/*/*.json")) == n1, "duplicate created"
    case("CLONE idempotent on rerun", c6)

    # 7 rollback when import fails after archive
    def c7():
        aid, _ = agent(f"{T}/repo", "main", "rollback", A)
        shim = f"{T}/shim.mjs"
        open(shim, "w").write(f"""
import {{ connectToDaemon as real }} from '{CLIENT}';
import {{ existsSync, writeFileSync }} from 'node:fs';
export async function connectToDaemon(o) {{
  const c = await real(o);
  const orig = c.importAgent.bind(c);
  c.importAgent = async (i) => {{
    if (!existsSync('{T}/tripped')) {{ writeFileSync('{T}/tripped', '1');
      throw new Error('injected import failure'); }}
    return orig(i);
  }};
  return c;
}}
""")
        r = sh(sys.executable, SCRIPT, aid[:8], B, "--apply", "--host", HOST,
               env={"PASEO_CLIENT_JS": shim})
        os.path.exists(f"{T}/tripped") and os.remove(f"{T}/tripped")
        assert r.returncode != 0, "should report failure"
        assert "rolled back" in (r.stderr + r.stdout), r.stderr + r.stdout
        s = state(aid)
        assert s["workspaceId"] == A, f"not restored: ws={s['workspaceId']}"
        assert not s.get("archivedAt"), "left archived after rollback"
    case("rollback restores placement when import fails", c7)

    # 8 abort before any mutation
    def c8():
        aid, _ = agent(f"{T}/repo", "main", "abort", A)
        r = sh(sys.executable, SCRIPT, aid[:8], B, "--apply", "--host", HOST,
               env={"PASEO_CLIENT_JS": "/nope"})
        assert r.returncode != 0
        s = state(aid)
        assert s["workspaceId"] == A and not s.get("archivedAt"), "mutated on a broken install"
    case("broken client aborts before archiving", c8)

    # 9 ambiguous workspace name
    def c9():
        aid, _ = agent(f"{T}/repo", "main", "ambig", A)
        r = move(aid[:8], "DUP", "--apply")
        assert r.returncode != 0 and "2 matches" in r.stderr, r.stderr
        assert state(aid)["workspaceId"] == A, "mutated despite ambiguity"
    case("ambiguous workspace name refuses, mutates nothing", c9)

    # 10 >200-char cwd: the SDK's truncate+hash rule
    def c10():
        aid, _ = agent(f"{T}/repo", "main", "deep", A)
        r = move(aid[:8], DEEP, "--apply")
        assert r.returncode == 0, r.stderr or r.stdout
        out = json.loads(r.stdout[r.stdout.index("{"):r.stdout.rindex("}") + 1])
        nsid = state(out["agent"])["persistence"]["sessionId"]
        want = f"{T}/claude/projects/{slug(os.path.realpath(deep))}/{nsid}.jsonl"
        naive = __import__("re").sub(r"[^a-zA-Z0-9]", "-", os.path.realpath(deep))
        assert len(naive) > 200, "fixture path not long enough"
        assert slug(os.path.realpath(deep)) != naive, "case is vacuous: slug == naive rule"
        assert os.path.exists(want), f"clone landed outside the hashed dir: {want}"
    case("CLONE into a >200-char path uses the hashed dir", c10)

    # 11 unknown flag is rejected, not silently ignored
    def c11():
        aid, _ = agent(f"{T}/repo", "main", "typo", A)
        r = move(aid[:8], B, "--aply")
        assert r.returncode == 2 and "unknown option" in r.stderr, r.stderr
        assert state(aid)["workspaceId"] == A
    case("typo'd flag is rejected", c11)

    # 12 running agent is refused without --force
    def c12():
        aid, _ = agent(f"{T}/repo", "main", "running", A)
        p = glob.glob(f"{T}/paseo/agents/*/{aid}.json")[0]
        d = json.load(open(p)); d["lastStatus"] = "running"; json.dump(d, open(p, "w"))
        r = move(aid[:8], B, "--apply")
        assert r.returncode != 0 and "--force" in r.stderr, r.stderr
    case("running agent refused without --force", c12)

    # 14 codex REHOME
    def c14():
        if not shutil.which("codex"):
            raise Skip("codex not installed")
        tid = codex_fixture(f"{T}/repo", "codex-rehome")
        aid = import_provider("codex", tid, f"{T}/repo", A,
                              {"paseo.parent-agent-id": "dead0000-0000-4000-8000-000000000000"})
        r = move(aid[:8], B, "--apply")
        assert r.returncode == 0, r.stderr or r.stdout
        s_ = state(aid)
        assert s_["workspaceId"] == B and not s_.get("archivedAt"), s_
        assert s_["id"] == aid and s_["provider"] == "codex"
        assert s_.get("labels", {}).get("paseo.parent-agent-id"), "labels lost"
    case("REHOME works for codex", c14)

    # 15 opencode REHOME
    def c15():
        if not shutil.which("opencode"):
            raise Skip("opencode not installed")
        sid = opencode_fixture(os.path.realpath(f"{T}/repo"), "oc-rehome")
        aid = import_provider("opencode", sid, f"{T}/repo", A,
                              {"paseo.parent-agent-id": "dead0000-0000-4000-8000-000000000001"})
        r = move(aid[:8], B, "--apply")
        assert r.returncode == 0, r.stderr or r.stdout
        s_ = state(aid)
        assert s_["workspaceId"] == B and not s_.get("archivedAt"), s_
        assert s_["id"] == aid and s_["provider"] == "opencode"
        assert s_.get("labels", {}).get("paseo.parent-agent-id"), "labels lost"
    case("REHOME works for opencode", c15)

    # 16 rp() vs the daemon. Every other case builds lowercase, existing paths and
    # computes its own expectation with os.path.realpath — i.e. with the very
    # resolver rp() exists to diverge from. Without this case the fix is untested.
    def c16():
        rp = _ns["rp"]

        def daemon_canon(path):
            # verbatim canonicalizeSync: native realpath, and on failure the RAW input
            r = sh("node", "--input-type=module", "-e",
                   "import{realpathSync} from 'node:fs';"
                   "let p=process.env.P;try{p=realpathSync.native(p)}catch{};"
                   "process.stdout.write(process.platform==='darwin'?p.normalize('NFC'):p)",
                   env={"P": path})
            assert r.returncode == 0, r.stderr
            return r.stdout

        real = f"{T}/rpcase/real"
        link = f"{T}/rpcase/link"
        os.makedirs(real, exist_ok=True)
        if not os.path.islink(link):
            os.symlink(real, link)
        probes = [real,                                     # exists, plain
                  f"{link}/vanished",                       # symlinked AND absent
                  os.path.join(os.path.dirname(T), os.path.basename(T).upper())]
        for probe in probes:
            got, want = rp(probe), daemon_canon(probe)
            assert got == want, f"{probe}: rp={got!r} daemon={want!r}"
            assert slug(got) == slug(want), "project dir would differ"
    case("rp() matches the daemon's canonicalizeSync", c16)

    # 17 CLONE rollback. Case 7 only covers REHOME, whose rollback is a re-import;
    # CLONE's rollback moves FILES, and an untested file-mover is how you lose a
    # transcript.
    def c17():
        aid, sid = agent(f"{T}/repo", "main", "clonefail", A, lines=6)
        shim = f"{T}/shim-clone.mjs"
        open(shim, "w").write(f"""
import {{ connectToDaemon as real }} from '{CLIENT}';
export async function connectToDaemon(o) {{
  const c = await real(o);
  c.importAgent = async () => {{ throw new Error('injected clone import failure'); }};
  return c;
}}
""")
        wt = os.path.realpath(f"{T}/wt")
        before_src = glob.glob(f"{T}/claude/projects/*/{sid}.jsonl")
        assert before_src, "fixture transcript missing"
        dst_dir = f"{T}/claude/projects/{slug(wt)}"
        before_dst = set(glob.glob(f"{dst_dir}/*.jsonl"))

        r = sh(sys.executable, SCRIPT, aid[:8], C, "--apply", "--host", HOST,
               env={"PASEO_CLIENT_JS": shim})
        assert r.returncode != 0, "should report failure"
        assert "rolled back" in (r.stderr + r.stdout), r.stderr + r.stdout
        assert set(glob.glob(f"{dst_dir}/*.jsonl")) == before_dst, "orphan clone left behind"
        assert glob.glob(f"{T}/claude/projects/*/{sid}.jsonl") == before_src, \
            "original transcript not restored"
        s_ = state(aid)
        assert s_ and not s_.get("archivedAt"), "CLONE must never archive the original"
        assert s_["workspaceId"] == A, f"original moved: {s_['workspaceId']}"
    case("CLONE rollback restores the transcript, leaves no orphan", c17)


def main():
    before = prod_snapshot()
    try:
        run_cases()
    except (Exception, SystemExit) as e:
        # recorded, not re-raised: teardown still runs AND the summary below still
        # prints, so a harness crash cannot masquerade as "nothing to report"
        RESULTS.append(("HARNESS", f"{type(e).__name__}: {e}"))
        print(f"  ERROR harness: {type(e).__name__}: {e}")
    finally:
        teardown()
    after = prod_snapshot()
    # A transcript APPEARING is only our problem if this stand produced it: any live
    # Claude session on the machine legitimately adds files while we run. A transcript
    # DISAPPEARING is always our problem.
    bp, ap = set(before.pop("__projects__")), set(after.pop("__projects__"))
    projects = sorted(bp - ap) + sorted(a for a in ap - bp if T_SLUG in a)
    diff = [k for k in set(before) | set(after) if before.get(k) != after.get(k)]
    bad_prod = diff + projects + fixture_leaks()
    if bad_prod:
        RESULTS.append(("PRODUCTION UNTOUCHED", f"changed: {bad_prod[:5]}"))
        print(f"  FAIL  PRODUCTION UNTOUCHED: {bad_prod[:5]}")
    else:
        RESULTS.append(("PRODUCTION UNTOUCHED", None))
        print("  PASS  production state untouched")

    bad = [n for n, e in RESULTS if e is not None and e is not SKIP]
    skipped = [n for n, e in RESULTS if e is SKIP]
    ran = len(RESULTS) - len(skipped)
    print(f"\n{ran - len(bad)}/{ran} passed" +
          (f", {len(skipped)} skipped ({', '.join(skipped)})" if skipped else ""))
    sys.exit(1 if bad else 0)


main()
