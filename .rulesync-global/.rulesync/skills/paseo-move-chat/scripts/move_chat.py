#!/usr/bin/env python3
"""Move a Paseo agent into another workspace. Idempotent.

usage: move_chat.py <agent-id-prefix> <workspace-id|name> [--apply] [--force]
                    [--host <daemon-host>] [--help]

--host targets a non-default daemon. It only mutates; agent, workspace and
transcript state are still read locally, so it requires PASEO_HOME to point at
that daemon's state (this is how the eval stand drives a sandbox daemon).

REHOME (same cwd):  archiveAgent + importAgent(workspaceId) -> same agent id.
CLONE  (diff cwd):  cwd cannot change; clone the claude transcript under a
                    deterministic new sessionId and import that. Original kept.

Honours PASEO_HOME and CLAUDE_CONFIG_DIR, so it can be pointed at a sandbox.
"""
import glob, json, os, re, shutil, struct, subprocess, sys, tempfile, time, unicodedata, uuid

PASEO_HOME = os.environ.get("PASEO_HOME") or os.path.expanduser("~/.paseo")
PASEO_AGENTS = os.path.join(PASEO_HOME, "agents")
CLAUDE_CFG = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")
CLAUDE_PROJ = os.path.join(CLAUDE_CFG, "projects")
_BAK = None
TESTED = ("0.7", "0.8")
HOST = None
PROJECT_DIR_LENGTH_CAP = 200


def bak():
    """0700 dir with an unguessable name, created only when we are about to mutate.
    A fixed /tmp path is a symlink-swap invitation."""
    global _BAK
    if _BAK is None:
        _BAK = tempfile.mkdtemp(prefix="paseo-move-")
    return _BAK


def die(msg, code=1):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(code)


_CLIENT_JS = None


def _client_under(start):
    """Walk up from a `paseo` executable to its @getpaseo/cli root."""
    d = os.path.dirname(os.path.realpath(start))
    for _ in range(4):
        pkg = os.path.join(d, "package.json")
        if os.path.exists(pkg):
            try:
                name = json.load(open(pkg)).get("name")
            except Exception:
                name = None
            if name == "@getpaseo/cli":
                cand = os.path.join(d, "dist", "utils", "client.js")
                return cand if os.path.exists(cand) else None
        d = os.path.dirname(d)
    return None


def path_bins():
    """Every `paseo` on PATH, in PATH order."""
    out = []
    for p in os.environ.get("PATH", "").split(os.pathsep):
        f = os.path.join(p, "paseo")
        if p and os.path.isfile(f) and f not in out:
            out.append(f)
    return out


def extra_bins(seen):
    """Fallback roots, consulted only when nothing on PATH ships a client. The
    Desktop build keeps its CLI inside app.asar, where nothing is importable, so a
    PATH that puts /Applications/Paseo.app first must not hide a real npm install.
    `npm root -g` costs ~300ms and npm may be absent, so it runs only here."""
    roots = []
    if shutil.which("npm"):
        r = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.strip():
            roots.append(r.stdout.strip())
    roots += ["/opt/homebrew/lib/node_modules", "/usr/local/lib/node_modules",
              os.path.expanduser("~/.npm-global/lib/node_modules")]
    out = []
    for root in roots:
        f = os.path.join(root, "@getpaseo", "cli", "bin", "paseo")
        if os.path.isfile(f) and f not in seen and f not in out:
            out.append(f)
    return out


def client_js():
    """Locate the shipped daemon client. Install layout varies (brew/npm/nvm/bun/
    Desktop), so never hardcode it."""
    global _CLIENT_JS
    if _CLIENT_JS:
        return _CLIENT_JS
    override = os.environ.get("PASEO_CLIENT_JS")
    if override:
        if not os.path.exists(override):
            die(f"PASEO_CLIENT_JS={override} does not exist")
        _CLIENT_JS = override
        return override
    bins = path_bins()
    if not bins:
        die("paseo not on PATH")
    tried = []
    for group in (bins, None):
        for b in (group if group is not None else extra_bins(tried)):
            tried.append(b)
            cand = _client_under(b)
            if cand:
                if b != bins[0]:
                    print(f"warn: {bins[0]} ships no importable client (Desktop "
                          f"build?); using {b}", file=sys.stderr)
                _CLIENT_JS = cand
                return cand
    die("could not locate the @getpaseo/cli package. Tried:\n  "
        + "\n  ".join(tried) +
        "\n  The Paseo Desktop build keeps its CLI inside app.asar, which cannot be\n"
        "  imported. Install the npm CLI (`npm i -g @getpaseo/cli`) or point\n"
        "  PASEO_CLIENT_JS at a dist/utils/client.js.")


def paseo(*argv):
    cmd = ["paseo", *argv] + (["--host", HOST] if HOST else [])
    return subprocess.run(cmd, capture_output=True, text=True)


def paseo_version():
    """The DAEMON's version, not the CLI's. They differ routinely — a Desktop-managed
    0.8.0 daemon next to a brew 0.7.0 CLI is the normal setup — and the gate is about
    the process we are about to mutate. `paseo --version` reports the CLI and ignores
    --host entirely, so it cannot answer this. `daemon status` is local-only and takes
    --home, which is exactly why --host demands a matching PASEO_HOME."""
    home = os.environ.get("PASEO_HOME") or os.path.expanduser("~/.paseo")
    r = subprocess.run(["paseo", "daemon", "status", "--json", "--home", home],
                       capture_output=True, text=True)
    try:
        v = json.loads(r.stdout).get("daemonVersion")
        if v:
            return v
    except Exception:
        pass
    r = subprocess.run(["paseo", "--version"], capture_output=True, text=True)
    lines = (r.stdout or r.stderr or "").strip().splitlines()
    return f"{lines[0]}?cli" if r.returncode == 0 and lines else "?"


_RP_CACHE = {}


def rp(p):
    """Canonicalise the way the daemon does. `claudeProjectDirSync` uses
    fs.realpathSync.native, which also corrects path CASE on darwin;
    os.path.realpath does not. A workspace cwd stored with the wrong case would
    otherwise put the clone in a directory the daemon never reads — and the final
    check, computed from the same wrong path, would still report verified."""
    # NOT os.path.realpath first: canonicalizeSync's catch returns the RAW input,
    # so for a cwd that no longer exists (deleted worktree, stale record) a POSIX
    # pre-resolve would hand encode() a different string than the daemon uses.
    p = os.path.expanduser(p)
    if p in _RP_CACHE:
        return _RP_CACHE[p]
    r = subprocess.run(
        ["node", "--input-type=module", "-e",
         "import{realpathSync} from 'node:fs';"
         "process.stdout.write(realpathSync.native(process.env.PASEO_MOVE_RP))"],
        capture_output=True, text=True, env={**os.environ, "PASEO_MOVE_RP": p})
    _RP_CACHE[p] = r.stdout if r.returncode == 0 and r.stdout else p
    return _RP_CACHE[p]


def _hash_suffix(s):
    """Port of the SDK's djb2-ish hash: ((h << 5) - h + utf16unit) | 0, abs, base36."""
    h = 0
    units = struct.unpack(f"<{len(s.encode('utf-16-le')) // 2}H", s.encode("utf-16-le"))
    for cu in units:
        h = (h * 31 + cu) & 0xFFFFFFFF
        if h >= 0x80000000:                      # emulate `| 0` (signed 32-bit)
            h -= 0x100000000
    h = abs(h)
    if h == 0:
        return "0"
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while h:
        h, rem = divmod(h, 36)
        out = digits[rem] + out
    return out


def claude_slug(path):
    """Verbatim port of claudeProjectDirSync's encode() — see the daemon's
    providers/claude/project-dir.js. The 200-char cap and its hash suffix matter:
    deep worktree paths land in a different directory than the naive rule gives."""
    canonical = unicodedata.normalize("NFC", path) if sys.platform == "darwin" else path
    # JS strings are UTF-16: a non-BMP char is TWO units and becomes TWO dashes,
    # and both .length and .slice() count units. Operate on units, not code points.
    units = struct.unpack(f"<{len(canonical.encode('utf-16-le')) // 2}H",
                          canonical.encode("utf-16-le"))
    replaced = "".join(chr(cu) if chr(cu).isascii() and chr(cu).isalnum() else "-"
                       for cu in units)
    if len(replaced) <= PROJECT_DIR_LENGTH_CAP:
        return replaced
    return f"{replaced[:PROJECT_DIR_LENGTH_CAP]}-{_hash_suffix(canonical)}"


def project_dir(cwd):
    return f"{CLAUDE_PROJ}/{claude_slug(cwd)}"


def node(call):
    """Only channel for mutations: the shipped daemon client. Never touch state files."""
    opts = json.dumps({"host": HOST} if HOST else {})
    src = (
        f"import('{client_js()}').then(async (m) => {{\n"
        f"  const client = await m.connectToDaemon({opts});\n"
        f"  try {{ const r = await ({call}); console.log(JSON.stringify(r ?? {{}})); }}\n"
        "  finally { await client.close(); }\n"
        "}).catch(e => { console.error('ERR:' + e.message); process.exit(1); });"
    )
    r = subprocess.run(["node", "--input-type=module", "-e", src],
                       capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr.strip())
    try:
        return json.loads(r.stdout.strip() or "{}")
    except ValueError as e:
        # exit 0 but unreadable stdout (a dependency logging through console.log).
        # Must be a RuntimeError or it flies past the rollback handlers — and REHOME
        # has already archived the agent by then.
        raise RuntimeError(f"unreadable client output ({e}): {r.stdout.strip()[:200]}")


def load_agent(prefix):
    hits = glob.glob(f"{PASEO_AGENTS}/*/{prefix}*.json")
    if len(hits) != 1:
        die(f"agent {prefix!r}: {len(hits)} matches")
    return hits[0], json.load(open(hits[0]))


def agent_by_session(sid):
    for f in glob.glob(f"{PASEO_AGENTS}/*/*.json"):
        try:
            d = json.load(open(f))
        except Exception:
            continue
        if (d.get("persistence") or {}).get("sessionId") == sid and not d.get("archivedAt"):
            return d
    return None


def wait_until_gone(sid, tries=12):
    """True once no live agent holds `sid`. Same asynchronous-state grace as
    wait_for_session, asked the other way round."""
    for _ in range(tries):
        if not agent_by_session(sid):
            return True
        time.sleep(0.25)
    return False


def wait_for_session(sid, tries=12):
    """A client-side error does not prove the import did not land: the daemon writes
    agent state asynchronously, so give it the same grace the final check gets.
    Returns the live (non-archived) agent holding `sid`, or None."""
    for _ in range(tries):
        a = agent_by_session(sid)
        if a:
            return a
        time.sleep(0.25)
    return None


def load_workspace(ref):
    r = paseo("workspace", "ls", "--json")
    if r.returncode or not r.stdout.strip():
        die(f"`paseo workspace ls --json` failed: {(r.stderr or '').strip()[:200]}")
    ws = json.loads(r.stdout)
    low = ref.lower()
    tok = re.compile(rf"(?<!\w){re.escape(low)}(?!\w)")   # "GE" must not match "chanGEs"
    hits = ([w for w in ws if w["workspaceId"] == ref]
            or [w for w in ws if (w.get("name") or "").lower() == low]
            or [w for w in ws if tok.search((w.get("name") or "").lower())]
            or [w for w in ws if low in (w.get("name") or "").lower()])
    if len(hits) != 1:
        die(f"workspace {ref!r}: {len(hits)} matches" +
            ("\n  " + "\n  ".join(f'{w["workspaceId"]}  {w.get("name")}' for w in hits)
             if hits else ""))
    return hits[0]


def newest_transcript(sid):
    # copies of one session can sit in several project dirs; take the longest/freshest
    c = sorted(glob.glob(f"{CLAUDE_PROJ}/*/{sid}.jsonl"),
               key=lambda f: (sum(1 for _ in open(f, errors="replace")), os.path.getmtime(f)))
    if not c:
        die(f"no transcript for session {sid}")
    return c[-1]


def main():
    global HOST
    argv = sys.argv[1:]
    if "-h" in argv or "--help" in argv:
        print(__doc__)
        return
    if "--host" in argv:
        i = argv.index("--host")
        if i + 1 >= len(argv):
            die("--host needs a value", 2)
        HOST = argv[i + 1]
        del argv[i:i + 2]
        stale = [n for n, d in (("PASEO_HOME", "~/.paseo"),
                                ("CLAUDE_CONFIG_DIR", "~/.claude"))
                 if rp(os.environ.get(n) or d) == rp(d)]
        if stale:
            die(f"--host sends the mutations to another daemon, but "
                f"{' and '.join(stale)}\n"
                f"  still {'point' if len(stale) > 1 else 'points'} at THIS machine, so the agent record, the workspace list and\n"
                "  the transcript would be read from local state. A prefix that matches\n"
                "  here may name a different agent there. Point both at that daemon's\n"
                "  state first — the defaults do not count — or drop --host.", 2)
    apply = "--apply" in argv
    force = "--force" in argv
    rest = [x for x in argv if x not in ("--apply", "--force")]
    unknown = [x for x in rest if x.startswith("-")]
    if unknown:
        die(f"unknown option(s): {' '.join(unknown)}", 2)
    if len(rest) != 2:
        die(__doc__, 2)
    agent_ref, ws_ref = rest

    state_path, a = load_agent(agent_ref)
    ws = load_workspace(ws_ref)
    provider = a["provider"]
    sid = (a.get("persistence") or {}).get("sessionId")   # NOT runtimeInfo.sessionId
    if not sid:
        die("persistence.sessionId missing")
    src_cwd, dst_cwd = rp(a["cwd"]), rp(ws["cwd"])
    labels = a.get("labels") or {}

    if (a.get("workspaceId") == ws["workspaceId"] and src_cwd == dst_cwd
            and not a.get("archivedAt")):
        print(f"nothing to do: {a['id']} already in {ws['name']}")
        return

    mode = "REHOME" if src_cwd == dst_cwd else "CLONE"
    if mode == "CLONE" and provider != "claude":
        die(f"CLONE supports claude only (provider={provider}). "
            "opencode: move-session first; codex: no recipe.")
    status = a.get("lastStatus")
    if status not in (None, "idle", "archived") and not force:
        die(f"agent is {status}; archiving a live agent is untested. "
            "Stop it first, or pass --force.")

    client = client_js()          # preflight: fail here, not half-way through
    ver = paseo_version()
    if not ver.startswith(TESTED):
        print(f"warn: daemon {ver} is outside the tested range {TESTED}; "
              "re-check the two cwd gates and ImportAgentInput before --apply",
              file=sys.stderr)
    print(f"daemon {ver}  client={client}\nmode={mode} agent={a['id']} provider={provider}\n"
          f"  from {a.get('workspaceId')} {src_cwd}\n"
          f"  to   {ws['workspaceId']} ({ws['name']}) {dst_cwd}")
    if not apply:
        print("dry-run; pass --apply")
        return

    B = bak()
    shutil.copy2(state_path, f"{B}/{a['id']}.json.bak")
    # re-import rewrites labels from the request; echo them back or every label is
    # wiped, including paseo.parent-agent-id (the subagent loses its parent silently)
    lbl = {"labels": labels} if labels else {}

    if mode == "REHOME":
        orig_ws, orig_cwd = a.get("workspaceId"), a["cwd"]
        if not a.get("archivedAt"):
            try:
                node(f"client.archiveAgent({json.dumps(a['id'])})")   # irreversible half
            except RuntimeError as e:
                # The archive may have landed and only the client leg (close, stdout)
                # failed. Letting this propagate would skip the import AND its rollback,
                # leaving the agent archived and invisible — the one outcome this whole
                # script exists to avoid.
                if not wait_until_gone(sid):
                    die(f"archive failed ({e}); agent untouched, nothing to undo. "
                        f"Backup: {B}")
                print(f"archive reported an error ({e}) but the agent did leave the "
                      "active set, so it landed; continuing to the import",
                      file=sys.stderr)
        try:
            r = node("client.importAgent(%s)" % json.dumps(
                {"provider": provider, "sessionId": sid,
                 "cwd": a["cwd"], "workspaceId": ws["workspaceId"], **lbl}))
        except RuntimeError as e:
            landed = wait_for_session(sid)
            if landed:
                die(f"the client reported an error ({e}) but agent {landed['id']} is live "
                    f"in {landed.get('workspaceId')} — the import landed. Nothing rolled "
                    f"back; check `paseo agent ls`. Backup: {B}")
            print(f"import failed ({e}); restoring original placement", file=sys.stderr)
            try:
                node("client.importAgent(%s)" % json.dumps(
                    {"provider": provider, "sessionId": sid,
                     "cwd": orig_cwd, "workspaceId": orig_ws, **lbl}))
            except RuntimeError as e2:
                die(f"ROLLBACK ALSO FAILED: {e2}\n"
                    f"  Agent {a['id']} is archived and invisible in the UI.\n"
                    f"  Recover by re-running against its original workspace:\n"
                    f"    {sys.argv[0]} {a['id'][:8]} {orig_ws} --apply\n"
                    f"  State backup: {B}")
            die("rolled back, agent left where it was")
    else:
        new_sid = str(uuid.uuid5(uuid.NAMESPACE_URL,
                                 f"paseo-move:{sid}:{ws['workspaceId']}"))
        done = agent_by_session(new_sid)
        if done:
            if (done.get("workspaceId") == ws["workspaceId"]
                    and rp(done["cwd"]) == dst_cwd):
                print(f"clone already imported: {done['id']} ws={done.get('workspaceId')}")
                return
            die(f"clone {done['id']} already exists but sits in "
                f"{done.get('workspaceId')} {done.get('cwd')}, not the requested target. "
                "Move or archive that one first.")
        dst_dir = project_dir(dst_cwd)
        dst_file = f"{dst_dir}/{new_sid}.jsonl"
        made_dir = not os.path.isdir(dst_dir)
        os.makedirs(dst_dir, exist_ok=True)
        wrote_clone = not os.path.exists(dst_file)

        if wrote_clone:
            # read from the backup copy: the source may itself live in dst_dir and
            # is evicted below, so resolving it afterwards could pick a shorter copy
            shutil.copy2(newest_transcript(sid), f"{B}/{sid}.jsonl.bak")
            src_file = f"{B}/{sid}.jsonl.bak"
            branch = subprocess.run(
                ["git", "-C", dst_cwd, "rev-parse", "--abbrev-ref", "HEAD"],
                capture_output=True, text=True).stdout.strip()
            n = 0
            with open(dst_file + ".tmp", "w") as out:
                for ln in open(src_file, errors="replace"):
                    if not ln.strip():
                        continue
                    d = json.loads(ln)
                    # structural top-level fields only; message text is history
                    if d.get("sessionId"):
                        d["sessionId"] = new_sid
                    if d.get("cwd") and rp(d["cwd"]) == src_cwd:
                        d["cwd"] = dst_cwd
                    if branch and d.get("gitBranch"):
                        d["gitBranch"] = branch
                    out.write(json.dumps(d, ensure_ascii=False) + "\n")
                    n += 1
            os.replace(dst_file + ".tmp", dst_file)
            print(f"clone: {n} lines -> {dst_file}")

        evicted = []
        for stale in glob.glob(f"{dst_dir}/{sid}.jsonl"):   # one session in two dirs
            shutil.move(stale, f"{B}/stale-{sid}.jsonl.bak")
            evicted.append(stale)

        try:
            r = node("client.importAgent(%s)" % json.dumps(
                {"provider": "claude", "sessionId": new_sid,
                 "cwd": dst_cwd, "workspaceId": ws["workspaceId"], **lbl}))
        except RuntimeError as e:
            landed = wait_for_session(new_sid)
            if landed:
                die(f"the client reported an error ({e}) but agent {landed['id']} now holds "
                    f"the cloned session in {landed.get('workspaceId')} — the import landed. "
                    f"Nothing rolled back; check `paseo agent ls`. Backups: {B}")
            # CLONE has no archive to undo, but it did move files: put them back so a
            # failed run leaves no orphan clone and no missing original.
            undone = []
            for stale in evicted:
                try:
                    shutil.move(f"{B}/stale-{sid}.jsonl.bak", stale)
                    undone.append(stale)
                except OSError as e2:
                    print(f"warn: could not restore {stale}: {e2}", file=sys.stderr)
            if wrote_clone:
                try:
                    os.remove(dst_file)
                    if made_dir and not os.listdir(dst_dir):
                        os.rmdir(dst_dir)          # we created it; leave no empty shell
                except OSError as e2:
                    print(f"warn: could not remove {dst_file}: {e2}", file=sys.stderr)
            die(f"clone import failed ({e}); rolled back "
                f"({len(undone)}/{len(evicted)} transcripts restored"
                f"{', clone removed' if wrote_clone else ''}). Backups: {B}")

    fresh = None
    for _ in range(12):                       # the daemon writes state asynchronously
        time.sleep(0.25)
        hits = glob.glob(f"{PASEO_AGENTS}/*/{r['id']}.json")
        if hits:
            fresh = json.load(open(hits[0]))
            if fresh.get("workspaceId") == ws["workspaceId"]:
                break
    if fresh is None:
        die(f"imported {r['id']} but no state file appeared under {PASEO_AGENTS}; "
            f"check `paseo agent ls`. Backups: {B}")
    ok = (fresh.get("workspaceId") == ws["workspaceId"] and rp(fresh["cwd"]) == dst_cwd
          and not fresh.get("archivedAt"))
    print(json.dumps({"agent": fresh["id"], "title": fresh.get("title"),
                      "cwd": fresh["cwd"], "workspaceId": fresh.get("workspaceId"),
                      "archived": bool(fresh.get("archivedAt")),
                      "labels": fresh.get("labels"),
                      "verified": ok, "backups": B}, ensure_ascii=False, indent=2))
    if mode == "CLONE":
        print("reminder: tell the agent its cwd changed; original kept as backup")
    sys.exit(0 if ok else 1)


main()
