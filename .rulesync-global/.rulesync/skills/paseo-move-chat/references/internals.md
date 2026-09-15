# paseo-move-chat internals

Read this when the script fails in a way its own error message does not explain, when Paseo
has been upgraded past the tested range, or before changing `move_chat.py`. None of it is
needed for a normal move — the script already encodes every rule below.

## Why there is no move operation

`update_agent_request` carries `name` and `labels` only. Every `moveAgent` hit in the bundle
is a substring of `removeAgent`. Verified by reading the 0.7.0 install and the 0.8.0 npm
tarball. The rehome trick is the daemon's own archive/unarchive path, used sideways.

## The two cwd gates

These are why `cwd` cannot change and why the REHOME/CLONE split exists:

```js
// agent/import-sessions.js — compares against the ARCHIVED RECORD's cwd, not the jsonl
if (!createRealpathAwarePathMatcher(cwd)(archivedRecord.cwd))
  throw new Error(`Provider session cwd does not match import cwd: ${providerHandleId}`);

// session/workspace-provisioning/workspace-provisioning-service.js
if (!createRealpathAwarePathMatcher(workspace.cwd)(input.cwd)) throw ...
```

Both present and byte-identical in 0.7.0 and 0.8.0.

## What REHOME actually does

For an archived record, `importProviderSessionNow` calls
`unarchiveAgentState(storage, manager, archivedRecord.id, {workspaceId, labels})` — the same
agent id is reused, the archive flag is cleared, and title/model/thinking/fast_mode survive.
That is the whole mechanism. If `ensureAgentLoaded` then fails, the daemon calls
`rollbackArchivedImport` and re-archives, which is why a failed import leaves the chat
invisible rather than half-moved.

## Why labels must be echoed back

```js
const requestedParentAgentId = getParentAgentIdFromLabels(input.request.labels);
const labelPatch = { ...input.request.labels };
if (Object.hasOwn(archivedRecord.labels, PARENT_AGENT_ID_LABEL) ||
    Object.hasOwn(input.request.labels ?? {}, PARENT_AGENT_ID_LABEL)) {
  labelPatch[PARENT_AGENT_ID_LABEL] = requestedParentAgentId;
}
```

If the stored record has `paseo.parent-agent-id` and the request omits labels, the patch sets
that label to `undefined` — a subagent silently loses its parent link. `ImportAgentInput.labels`
is `Record<string, string>`; the client drops it entirely when empty, so passing the agent's
own labels back is always safe.

## sessionId

Take `persistence.sessionId` from `~/.paseo/agents/<cwd-slug>/<agent-id>.json`, never
`runtimeInfo.sessionId` — for codex the latter is a fresh fork rollout. Agent id always equals
the state file's basename (checked across every local agent).

## CLONE details

- New id is `uuid5(NAMESPACE_URL, "paseo-move:<old-sid>:<target-ws>")`. Deterministic on
  purpose: a rerun lands on the same file and the same agent instead of spawning a duplicate.
- Only top-level `sessionId` / `cwd` / `gitBranch` are rewritten. Paths inside `message` and
  `toolUseResult` are conversation history and stay as they were — which is why the moved
  agent must be told its cwd changed.
- Claude's project dir is **not** a naive `[^a-zA-Z0-9] -> '-'` substitution. `claude_slug()`
  is a verbatim port of the daemon's `claudeProjectDirSync` encode (`providers/claude/project-dir.js`):
  NFC normalisation on darwin, iteration over **UTF-16 code units** (a non-BMP char is two
  units and becomes two dashes), and — the part that actually bites — a 200-character cap
  after which a base36 djb2-ish hash of the canonical path is appended. Deep worktree paths
  exceed that cap, so the naive rule silently writes the clone into a directory the daemon
  never reads. Covered by the `>200-char path` eval.
- `canonicalizeSync` uses `fs.realpathSync.native`, which on darwin also corrects path
  **case**; `os.path.realpath` does not. `rp()` therefore shells out to node for the same
  answer. Skipping that is a silent-success bug: a mis-cased workspace cwd puts the clone in
  a directory the daemon never reads, and the final check — computed from the same wrong
  path — still reports `verified: true`.
- Copies of one session can exist in several project dirs. Resolve the source (longest, then
  newest) *before* evicting same-sid copies from the target dir, or the eviction may take the
  copy you were about to clone.

## Locating the daemon client

`client_js()` walks up from a `paseo` executable to the `@getpaseo/cli` package root and takes
`dist/utils/client.js`. There is usually more than one `paseo` on a machine: the npm/brew CLI,
and `/Applications/Paseo.app/Contents/Resources/bin/paseo` (commonly symlinked into
`~/.local/bin`). **The Desktop build keeps its code inside `app.asar`, so it ships no importable
client** — whichever comes first on `PATH` wins, and when that is the Desktop one the locator
has to keep looking. It therefore tries every `paseo` on `PATH`, then `npm root -g` and the
usual Homebrew prefixes, and only then fails, printing what it tried. `PASEO_CLIENT_JS`
overrides all of it.

## `--host`

`--host` redirects **mutations only**: the agent record, the workspace list and the transcript
are still read from the local `PASEO_HOME` / `CLAUDE_CONFIG_DIR`. An id prefix that is unique
here can name a different agent there, so the script refuses `--host` unless **both** variables
are set away from their defaults — `PASEO_HOME` alone would still send CLONE to read the
production `~/.claude` transcripts. The eval stand is the intended user: it points
`PASEO_HOME`, `CLAUDE_CONFIG_DIR` and `--host` at the same sandbox.

## The version gate reads the DAEMON

`paseo --version` reports the CLI and ignores `--host`. On this machine that is 0.7.0 while
`paseo daemon status --json` reports `daemonVersion: 0.8.0` — a Desktop-managed daemon beside
a brew CLI is the normal setup, so the two routinely disagree. The gate is about the process
being mutated, so `paseo_version()` reads `daemonVersion` from `daemon status --json --home
$PASEO_HOME`, falling back to the CLI version tagged `?cli`. `daemon status` is local-only and
takes `--home`, not `--host` — another reason `--host` insists on a matching `PASEO_HOME`.

## Upstream quirks

- **Forked claude chats are missing from the import list.** The descriptor parser does
  `if (!acc.sessionId) acc.sessionId = entry.sessionId`, and a fork carries the parent's id
  for hundreds of lines, so the fork is reported under the parent's id. Still present in
  0.8.0. Workaround: call `importAgent` with the real id taken from the filename.
- **Sessions already bound to an agent are filtered out of that list.** Not a bug — but
  combined with the above it is why a fork looks like it does not exist.

## 0.7.0 → 0.8.0

Unchanged: both cwd gates, `ImportAgentInput`, `paseo agent import` (still `--cwd`/`--label`,
still no `--workspace`), `workspace create --isolation`, the fork parser.

Changed:
- `createWorkspaceForDirectory` → `findOrCreateWorkspaceForDirectory`: an import without
  `workspaceId` no longer creates an orphan workspace, it silently reuses the **oldest active**
  workspace on that cwd. Quieter, not safer — passing `workspaceId` is still mandatory.
- `rollbackFailedImportWorkspace` now fires only if that import created the workspace.
- Import-session listing gained `query`, `scanLimit: 500`, `providerErrors`.
- Session titles: `custom-title` → `ai-title` → first prompt, instead of first match.
- New `paseo workspace setup <id>`.

## Re-checking after an upgrade

Unpack the new tarballs somewhere and diff these four against the installed copy — they are
the entire contract this skill depends on:

```
@getpaseo/server  dist/server/server/agent/import-sessions.js
@getpaseo/server  dist/server/server/session/workspace-provisioning/workspace-provisioning-service.js
@getpaseo/client  dist/daemon-client.d.ts          # ImportAgentInput, importAgent
@getpaseo/cli     dist/commands/agent/import.js    # did --workspace finally appear?
```

Do not upgrade Paseo from inside a Paseo agent: it restarts the daemon and kills every live
session, including yours.

## The eval stand

`references/eval_run.py` — hermetic: its own daemon (`PASEO_HOME` + `PASEO_LISTEN`, relay off),
its own `CLAUDE_CONFIG_DIR`, a throwaway git repo and worktrees. Transcripts are synthesized, so
it makes **zero provider calls and costs no tokens**, and it asserts the real `~/.paseo` state is
unchanged when it finishes.

```bash
python3 references/eval_run.py      # ~1 min;  --keep leaves the stand up,  --port N if 6798 is busy
```

The stand root is a private `tempfile.mkdtemp()` (0700) and the opencode fixture binds an
ephemeral port, so it cannot collide with a real `opencode serve` or with a second run. The
deep-path fixture sizes its *leaf* rather than its depth — the root lives under `$TMPDIR`,
whose length is platform-specific, and fixed-size steps can jump clean over the 205–245
window. `setup()`/`teardown()` are paired in a `try/finally`: a crash during setup still stops
the sandbox daemon, otherwise every later run dies on "port busy" and the production-state
check never executes.

Cases needing a provider CLI that is not installed report **SKIP**, not FAIL, and the exit code
ignores them — "green" means nothing that ran is broken. The summary always names what it
skipped, so a skip cannot quietly pass for coverage.

17 cases: REHOME (id kept, workspace moved), label preservation, REHOME idempotency, no-op when
already in target, CLONE (new session, history intact), CLONE idempotency, rollback after a failed
import, broken client aborts before archiving, ambiguous name mutates nothing, CLONE into a
>200-char path uses the hashed dir, typo'd flag rejected, running agent refused without `--force`,
REHOME for codex, REHOME for opencode, `rp()` matches the daemon's
`canonicalizeSync` (mis-cased path, symlinked-and-absent path), CLONE rollback restores the
transcript and leaves no orphan, production state untouched.

Run it after any edit to `scripts/move_chat.py`. Green is the only acceptable state — the two
bugs it pins (labels wiped on re-import, transcripts landing outside the hashed directory for
paths over 200 chars) were both silent in normal use.
