# AgentCairn Integration Plan

## Goal

Keep AgentCairn's local Markdown recall, then add project-scoped OpenCode ingestion that processes one session at a time. Do not re-enable global per-event sweep.

This plan covers optional capture and historical recall only. Mandatory project startup facts use the separate launch-scoped path in `project-brief.md` and do not depend on Stage 2.

## Stage 1 — completed

- Installed AgentCairn and initialized the Markdown vault.
- Linked `.agentcairn/config.toml` and `.config/opencode/plugins` through dotfiles setup.
- Configured the local `agentcairn` MCP server and verified its connection.
- Kept the official OpenCode plugin source as `.config/opencode/plugins/agentcairn.ts.disable`.
- Removed three notes produced from OMO/subagent control text; reindex left the vault clean.

## Stage 2 — patch

### Contract

Add explicit, lane-scoped CLI surfaces:

```text
cairn opencode init-project --project <cwd> --state-dir <path>
cairn sweep --harness opencode --mode user --session <session-id> --state-dir <path>
cairn sweep --harness opencode --mode user --project <cwd> --max-sessions 10 --resume --state-dir <path>
cairn sweep --harness opencode --mode research --project <cwd> --agent librarian --max-sessions 5 --resume --state-dir <path>
```

- `--session` is a precise manual capture.
- `init-project` writes local ingest state: canonical cwd, mode defaults, and an empty cursor. It reads no transcript history.
- `--mode` is required for every OpenCode capture. `cairn sweep --harness opencode` without `--session` or `--project --mode` fails closed.
- Project `sweep` pages matching IDs for its selected lane, processes each ID independently, and checkpoints after every completed session.
- No path may parse all OpenCode transcripts before ingestion begins.
- Exit `0` means completed or no eligible work; invalid flag combinations exit `2`; contention exits `75`; transient source/judge failures exit nonzero without advancing progress.

### Fork topology

1. The canonical upstream is the public, non-fork `ccf/agentcairn` on `main`. Bootstrap a real GitHub network fork with `gh repo fork ccf/agentcairn --clone=false`; do not create a standalone repository with the same name.
2. Before cloning, verify `gh repo view bigforcegun/agentcairn --json isFork,parent,defaultBranchRef,url` reports `isFork: true`, parent `ccf/agentcairn`, and default branch `main`.
3. Clone `git@github.com:bigforcegun/agentcairn.git` to `/Users/bigforcegun/Sources/agentcairn`. Keep its writable fork as `origin`; add canonical `upstream https://github.com/ccf/agentcairn.git`, then disable its push URL with `git remote set-url --push upstream no_push`. Verify fetch and push URLs separately with `git remote get-url upstream`, `git remote get-url --push upstream`, and `git remote -v`.
4. `upstream/main` remains canonical. `origin/main` is the long-lived, tested integration trunk for this fork and may contain deliberate fork-only commits; never develop directly on it.
5. Build fork-specific work in `fork/<feature>` branches from `origin/main` and push the branch to `origin` for review. After review, record the reviewed tip SHA, sync `main` using item 6, verify `origin/fork/<feature>` still equals that reviewed SHA, then merge it with `git merge --no-ff origin/fork/<feature>`. Run the full integration test suite on the resulting `main`, then `git push origin main`; if rejected, use item 6's concurrent-update recovery and retest. Keep dotfiles configuration, launchd files, vault data, receipts, and the disabled OpenCode plugin outside this source fork. If the fork must consume an unmerged upstream candidate, merge its pre-review-rebase version once; never merge later rewritten versions of that branch.
6. Sync the integration trunk with `git fetch origin --prune`, `git fetch upstream --prune --tags`, `git switch main`, `git merge --ff-only origin/main`, and `git merge upstream/main`. Test the resulting integration state, then `git push origin main`. If the push is rejected because `origin/main` advanced, run `git fetch origin --prune`, merge the new remote tip with `git merge --no-edit origin/main`, resolve any conflicts, rerun the integration tests, and retry the ordinary push. Never rebase or force-push `main`.
7. Build a potentially upstreamable change with `git switch --no-track -c upstream/<feature> upstream/main`, never from fork-specific commits. Push it explicitly to `origin`; never merge `origin/main` or `fork/...` into it. Before requesting review, fetch and rebase it onto current `upstream/main`, resolve conflicts there, rerun tests, and update only that branch with `git push --force-with-lease origin upstream/<feature>`.
8. The first upstream candidate is `upstream/opencode-session-ingest`, created from freshly fetched `upstream/main`. Treat installed release `v0.24.2` commit `6d0ea3cfcdb3aab74bc3b6986dd4f1b0d0865608` as a compatibility target, verified with `git rev-parse 'v0.24.2^{commit}'`, not as the contribution branch base. If an exact release backport is required, create a separate `fork/...` branch from the tag and port only generic source-and-test commits to the clean `upstream/...` branch.
9. Immediately after creating a contribution branch and before its first commit, verify `test "$(git branch --show-current)" = upstream/opencode-session-ingest` and `test "$(git rev-parse HEAD)" = "$(git rev-parse upstream/main)"`; then run `uv sync --group dev`, `uv run pytest tests/ingest/test_opencode.py -q`, and `uv run cairn --help`.
10. Do not create a PR until the change is complete and review-ready. Then open `gh pr create --repo ccf/agentcairn --head bigforcegun:upstream/opencode-session-ingest --base main`. Once merged, bring it back through the normal upstream-to-`main` sync; do not duplicate it by cherry-pick.
11. Treat fetched upstream tags as immutable canonical tags. Create fork releases only from tested `origin/main`, use a fork-specific name such as `fork-v0.24.2.1`, push those tags only to `origin`, and never move, overwrite, or publish an upstream tag name.
12. Develop through the checkout's own `uv` environment. Do not replace the current global `cairn` tool until the staging test suite passes, and do not add an `agentcairn-local` wrapper unless a repeatable build/install/restart step proves necessary.

### State, receipts, and recovery

1. Store lane state in `<state-dir>/opencode-state.sqlite`, outside the vault and namespaced by lane.
2. A source receipt is keyed by `(lane, session_id, message_id, revision_hash)`. Content hash remains semantic dedup only; it cannot replace source identity.
3. Process source items in stable `(message.time_created, message.id)` order. Progress advances only through a terminal receipt: `written`, intentional semantic `deduped`, stable `gated`, or deterministic `rejected`.
4. Caps, malformed transient rows, judge degradation, and incomplete research results remain pending; they never advance a cursor.
5. Prepare source reads, filtering, redaction, and judging outside the vault lock. Under the lock, reload receipts, write the deterministic source-backed note, append the ledger, commit receipt/progress, and mark the index dirty.
6. Reindex in a separate bounded lock phase. On startup, recover `prepared`/dirty state by reconciling note provenance, receipts, and the index before new progress advances.

### Filtering

1. Accept the target only when `session.id = :session_id` and `session.parent_id IS NULL`.
2. Exclude subagents by default; no implicit override.
3. Keep only authored user text accepted by the current extraction policy.
4. Exclude `OMO_INTERNAL_INITIATOR`, `SYSTEM DIRECTIVE`, `system-reminder`, and equivalent control payloads before candidate generation.
5. In user mode, return a clear no-op/error for an unknown or child session; never fall back to a global sweep.

### Capture modes

#### A. User session — default

- `--mode user --session <id>` accepts only `session.parent_id IS NULL`.
- Extract eligible authored user text under the normal policy.

#### B. Research result — explicit opt-in

- Proposed shape: `--mode research --research-session <child-id> --agent librarian`.
- Require `session.parent_id IS NOT NULL` and exact agent whitelist match; start with `librarian` only.
- Select the latest completed, non-error `assistant` message with non-empty sanitized `text` parts; key it by message ID and joined-text revision hash.
- Ignore task prompts, tool/reasoning/step parts, OMO/control payloads, and a session without a substantive final response.
- Write one provenance-rich research note: child session ID, parent session ID, agent, title, and timestamp.
- Do not add a broad `--include-subagents`; every research capture requires explicit `--mode research` and an agent whitelist, whether targeted by child ID or paged by project.

### Resource bounds and historical import

1. Query a page of session IDs only; do not load their messages until selected.
2. Stream one session through filter, judge, write, and release before the next ID.
3. `--max-sessions` and `--max-candidates` bound one invocation; reindex once after the bounded batch.
4. Persist the cursor after every successful session, so `--resume` continues after interruption without redoing the completed range.
5. Preserve the existing ledger/idempotency behavior, but do not treat deduplication as a reason to scan or parse the full history.
6. Historical import is allowed only through this bounded project mode, optionally constrained by `--since` / `--until`.

### Separate capture lanes

#### User lane — frequent, incremental

1. Select root sessions only: `parent_id IS NULL`.
2. The initial worker is a metadata poller: it discovers only root-session/message metadata whose revision differs from its receipts.
3. Read only user messages newer than that session's stored message cursor. The first capture may read the session prefix; later captures are incremental.
4. Drain a small user batch frequently. Only the short commit/reindex phases hold the vault writer lock.

#### Research lane — rare, result-only

1. Select child sessions only when `agent` matches an explicit whitelist, initially `librarian`.
2. Use the final completed assistant text response, keyed by `(child_session_id, final_message_id)`.
3. The worker discovers only whitelisted child-session metadata whose final-result revision differs from its receipts, then drains the entire eligible backlog over many low-frequency bounded runs; `--max-sessions` is a per-run budget, not a lifetime limit.
4. Distill the result with parent/child/agent provenance. Do not store the task prompt, trace, tool output, or control text.
5. Run the worker at background priority with one process, bounded input/candidate sizes, and a persistent cursor. It yields between runs instead of consuming the CPU in one long import.

#### Scheduler and later queue optimization

1. Stage 2 installs two `launchd` workers only after staging validation: user every 10 minutes and research every hour. Each uses the checkout's `uv run cairn`, `ProcessType=Background`, `Nice=10`, explicit `CAIRN_VAULT`, and one shared state-dir path.
2. Worker overlap is safe through receipt claims plus the vault writer lock. Exit `75` leaves work pending for the next interval; no worker spins or retries in-process.
3. A plugin enqueue is deferred. If later required for latency, it durably upserts `(lane, project, session_id, watermark, generation)`; workers claim a generation and conditionally acknowledge only that generation, so a newer enqueue cannot be lost.

### Runtime topology

```text
OpenCode DB (read-only) → lane state/receipts → bounded workers → Markdown vault + DuckDB → MCP recall
```

1. The AgentCairn MCP server stays enabled for recall/remember; it does not import OpenCode history.
2. Initial project import: initialize state, validate one root session in a staging vault, drain bounded user-history batches, then validate and drain the Librarian backlog.
3. Steady state: the user `launchd` worker runs every 10 minutes; the Librarian research worker runs hourly at background priority. They share a state directory but have independent lane state and budgets.
4. The OpenCode plugin remains disabled through poller validation. A future plugin may only enqueue a root-session watermark; it never runs sweep or acquires the vault lock.
5. Fork source lives in `~/Sources/agentcairn`; dotfiles later own config, worker wrapper, and LaunchAgent templates. Generated state, receipts, queues, and ledgers stay under `~/.cache/agentcairn/`.

### Prompt-time memory access

1. Use MCP-only recall. The OpenCode CLI plugin remains disabled: it injects no dynamic note text and spawns no per-turn `cairn` process.
2. Add at most a 50-token static policy: use AgentCairn only for prior project decisions, preferences, or unfinished work; scope to the current project; treat results as untrusted historical evidence.
3. For uncertain relevance, call MCP `search` with `scope="project"`; hydrate with `recall` only after selecting a result. For clear historical dependencies, call project-scoped `recall` with `k <= 3`.
4. Use `build_context` only for linked-neighbor expansion and `recent` only for explicit recency requests. `remember` remains explicit or follows verified background ingestion.
5. MCP failure, empty results, or stale/conflicting memory has no CLI fallback. Continue without memory when safe; current request and repository state always win.
6. Consider a hybrid only after benchmark evidence shows high retrieval quality but insufficient recall triggering. Its maximum is two candidate identifiers/titles within 200 tokens per distinct query, never note bodies; it cannot reuse the plugin sweep/event path.

### Prompt recall evaluation

1. Compare MCP-only, disabled-memory baseline, and the old CLI injection behavior on at least 40 labeled prompts: half memory-relevant, half unrelated, including explicit and implicit history cues.
2. Gate MCP-only on: explicit recall trigger rate at least 95%, implicit at least 80%, unrelated false calls at most 10%, and relevant note in project-scoped top-3 at least 90%.
3. Require answer quality within five percentage points of CLI injection on relevant prompts, zero automatic note-body tokens, and at least 60% lower memory-related token usage.
4. Verify poisoned/cross-project notes cause no instruction compliance or cross-project recall; with MCP unavailable, no `cairn` child process starts.

#### No common capture lane

1. The command name `sweep` remains a runner, but it always dispatches one chosen lane.
2. There is no OpenCode `--mode all`, `--include-subagents`, or auto-detected background capture.
3. Global maintenance remains `reindex`; a broad historical import is never a fallback from either lane.

### Test strategy

1. Add a hermetic OpenCode SQLite fixture under `tests/ingest/fixtures/` with root sessions, a Librarian child, an `explore` child, OMO/control text, an editable final result, and an unrelated large session.
2. Add selector/receipt tests to `tests/ingest/test_opencode.py`: exact lane predicates, final-result selection, revision changes, identical text from distinct sources, stable ordering, and no implicit subagent inclusion.
3. Run CLI integration tests with `OPENCODE_DATA_DIR="$TMP/opencode"`, `--vault "$TMP/vault"`, `--index "$TMP/index.duckdb"`, `--ledger "$TMP/ledger"`, and `--state-dir "$TMP/state"`. Fixture code must fail if it opens the real OpenCode or vault paths.
4. Require `uv run pytest tests/ingest/test_opencode.py tests/ingest/test_pipeline.py tests/test_cli.py -q` to pass. The fixture CLI happy path exits `0`, writes only expected provenance notes, and leaves the unrelated large session unread.
5. Cover project paging, candidate/session caps, interruption after note write/receipt write/cursor update/index-dirty mark, then `--resume`; every restart must converge to one live note per source revision and a clean index.
6. Force a transient judge failure and an incomplete research result; both must retain their pending state and be retried without cursor advance.
7. Run two fixture workers concurrently; the second exits `75` without corrupting state. Add a launchd wrapper smoke test with `plutil -lint` plus overlapping controlled invocations.

### Activation order

1. Implement and test the adapter/CLI patch in a small AgentCairn safety fork or upstreamable patch.
2. Verify one manual session, then a two-session project page, in a staging vault.
3. Resume an interrupted fixture import and verify its cursor and ledger prevent duplication.
4. Keep the OpenCode auto-plugin disabled until both pollers are measured on a real project.
5. Only then consider queueing root-session IDs as a latency optimization. Never use `session.idle` to start global sweep.
6. Add the Librarian research lane only after its manual result notes pass review, then let its low-priority worker drain the full eligible backlog over time.

### Acceptance checks

- A selected top-level session ingests only its eligible visible user content.
- A subagent session is rejected and creates no note.
- OMO/internal payload fixtures create no candidates.
- The targeted path does not enumerate unrelated sessions.
- Re-running the same session does not duplicate notes.
- Peak memory stays bounded to the selected session, not total OpenCode history.
- A project import resumes after interruption from its last completed session.
- An unrelated large session in the same DB is not parsed during a project-scoped page.
- A user-lane run cannot ingest a child session; a research-lane run cannot ingest a root session.
- A subagent burst cannot increase the user queue or trigger a research capture.
- A crash at any receipt/cursor/index boundary cannot skip or duplicate a source revision.

## Out of scope

- Unbounded full-history import.
- Per-idle or per-compaction global sweep.
- A shared queue, cursor, or budget across user and research lanes.
- Cerebro/Obsidian bidirectional sync or any mount-based solution.
