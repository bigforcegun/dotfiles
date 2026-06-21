# OC Project Discovery Wrapper

## TL;DR
> **Summary**: Replace the current global `oc` auto-attach behavior with project-safe discovery. `oc` will attach only to a local OpenCode backend whose API proves it belongs to the current project; otherwise it starts a new project-scoped `opencode --port 0` from the project root.
> **Deliverables**:
> - Updated `bin/oc` wrapper with discovery, validation, safe fallback, and diagnostics
> - Shell-level test harness at `.omo/evidence/oc-project-discovery-harness.zsh` using fake `opencode`, `pgrep`, `lsof`, `curl`, and API responses
> - Verification evidence under `.omo/evidence/`
> **Effort**: Medium
> **Parallel**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 4 → Final Verification Wave

## Context
### Original Request
User wants one command from any project folder that “magically” connects to an already-running OpenCode for that project when possible, without reusing the first-launched global backend. User is okay with manual server starts, but wants attach-from-folder to be one command.

### Interview Summary
- Current `bin/oc` fixed backend behavior is too global: it starts/reuses `http://127.0.0.1:4096` and attaches with `--dir "$PWD"`.
- Desired direction shifted away from port registry toward discovering already-running project-local OpenCode processes.
- Final behavior decisions:
  - Root rule: canonical Git root via `git rev-parse --show-toplevel`; fallback canonical `$PWD`.
  - Candidate source: local process discovery only.
  - Proof rule: PID/port/lsof never proves safety; OpenCode API must prove same project root via `/project/current` JSON field `worktree`.
  - Multiple proven matches: fail safely with diagnostics, do not auto-pick.
  - No match: default auto-start `opencode --port 0` from project root; `OC_NO_START=1` prints exact start command and exits nonzero.
  - Explicit URL override: validate by API unless `OC_ALLOW_UNVERIFIED_ATTACH=1` is set.

### Metis Review (gaps addressed)
- Added explicit project-root rule and canonicalization.
- Added safe ambiguity behavior.
- Added guardrail against global `4096` reuse without API proof.
- Added test requirements for symlinks, wrong project, missing API, multiple matches, and no-server path.

## Work Objectives
### Core Objective
Make `bin/oc` a project-aware single command that attaches to an already-running local OpenCode backend only when that backend is proven to belong to the current project, otherwise starts or reports a project-local launch command.

### Deliverables
- `bin/oc` rewritten or refactored around project discovery.
- Tests or executable shell harness validating wrapper behavior without real long-running OpenCode.
- Diagnostics that make refusals actionable.

### Definition of Done (verifiable conditions with commands)
- `zsh -n bin/oc` exits 0.
- Test harness exits 0 and covers same-project attach, wrong-project refusal, no-server autostart, no-server `OC_NO_START=1`, missing API rejection, multiple-match fail, and symlink canonicalization.
- Deterministic harness command exists and passes: `zsh .omo/evidence/oc-project-discovery-harness.zsh`.
- Manual smoke command in a temp Git repo shows `oc` starts `opencode --port 0` from the repo root when no matching backend exists.
- No file outside `bin/oc`, test harness files, and `.omo/evidence/` is modified unless explicitly documented by the executor before implementation.

### Must Have
- Attach only after API-confirmed project match using `/project/current` response field `worktree`, canonicalized before comparison.
- Exclude `opencode attach` clients from candidate servers.
- Support normal TUI/server candidates whose port is not visible in argv by using `lsof`; `lsof` PID/CWD/port data is candidate metadata only and must never be treated as project-match proof.
- Use loopback URLs only.
- Provide clear diagnostics for no match, mismatch, multiple match, missing tools, and API failure.
- Validate API using OpenCode auth environment when present: username defaults to `${OPENCODE_SERVER_USERNAME:-opencode}` and password comes from `OPENCODE_SERVER_PASSWORD` or `OPENCODE_ATTACH_PASSWORD`; HTTP 401 must reject candidate with an auth-specific diagnostic.

### Must NOT Have
- Must not edit OpenCode config, MCP config, mcpproxy config, tmux config, or shell startup files.
- Must not kill/restart existing OpenCode processes.
- Must not attach to a backend merely because it listens on `4096`.
- Must not implement an interactive picker/menu.
- Must not support remote hosts in this iteration.
- Must not introduce an undeclared hard dependency on `jq`; if JSON parsing uses `jq`, wrapper must detect it and provide a clear diagnostic or implement a minimal fallback for extracting `/project/current.worktree`.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after via shell harness; no repo test framework is required.
- QA policy: Every task includes agent-executed scenarios.
- Evidence: `.omo/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = acceptable here because this is a focused wrapper change.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1 (test harness) and Task 2 (wrapper helper refactor) can run sequentially or parallel if executor chooses separate branches, but recommended order is Task 1 then Task 2 for behavior lock.
Wave 2: Task 3 (diagnostics/flags) and Task 4 (full verification/smoke) after helper behavior exists.

### Dependency Matrix (full, all tasks)
- Task 1: no dependencies; blocks Task 4.
- Task 2: no dependencies; blocks Task 3 and Task 4.
- Task 3: depends on Task 2; blocks Task 4.
- Task 4: depends on Tasks 1-3.

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 2 tasks → `quick`, `quick`
- Wave 2 → 2 tasks → `quick`, `unspecified-low`

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Add shell test harness for `oc` discovery behavior

  **What to do**: Create the deterministic shell test harness at exactly `.omo/evidence/oc-project-discovery-harness.zsh`. The harness must test `bin/oc` with fake `opencode`, `pgrep`, `lsof`, and `curl` executables placed first in `PATH`. Fake `/project/current` API responses must use the real OpenCode response shape field `worktree`, e.g. `{"worktree":"<canonical-root>"}`. Fake commands must record invocations to temp files. Do not require real OpenCode to run. Cover all acceptance cases listed below. The canonical run command for all later verification is `zsh .omo/evidence/oc-project-discovery-harness.zsh`.
  **Must NOT do**: Do not start real `opencode`. Do not depend on current live processes. Do not write secrets or inspect private data.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: focused shell test scaffolding.
  - Skills: [] - no special skill required.
  - Omitted: [`debugging`] - no runtime bug loop needed unless tests fail unexpectedly.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4] | Blocked By: []

  **References** (executor has NO interview context - be exhaustive):
  - Pattern: `bin/oc:1-131` - current zsh wrapper structure and password handling to replace or adapt.
  - Docs: `https://opencode.ai/docs/cli/#attach` - attach semantics and flags.
  - Docs: `https://opencode.ai/docs/server/#how-it-works` - OpenCode TUI/server architecture.
  - Research: community discovery pattern uses `pgrep -f "opencode.*--port"` plus `lsof` to find ports; adapt safely and include `serve`/`web` candidates.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `zsh -n bin/oc` exits 0 before and after harness creation.
  - [ ] Harness case `same-project` simulates one candidate whose `/project/current` API returns `{"worktree":"<current canonical root>"}`; expects recorded command `opencode attach http://127.0.0.1:<port> --dir <current-or-root-dir>`.
  - [ ] Harness case `wrong-project` simulates candidate `/project/current` API returning `{"worktree":"<different canonical root>"}`; expects no attach and either autostart or `OC_NO_START` diagnostic depending env.
  - [ ] Harness case `no-server-autostart` expects `opencode --port 0` launched from canonical project root.
  - [ ] Harness case `no-server-no-start` with `OC_NO_START=1` expects nonzero exit and exact printed start command.
  - [ ] Harness case `multiple-matches` expects nonzero exit and diagnostic listing both candidate URLs/PIDs.
  - [ ] Harness case `missing-api` expects no attach.
  - [ ] Harness case `missing-tools` removes/fakes missing `pgrep`, `lsof`, `curl`, and `opencode` one at a time; expects nonzero exit and tool-specific diagnostic.
  - [ ] Harness case `attach-client-exclusion` simulates `pgrep` returning an `opencode attach ...` process and a real server process; expects attach client PID ignored and only server PID considered.
  - [ ] Harness case `auth-401` simulates `/project/current` returning HTTP 401; expects no attach and auth-specific diagnostic mentioning `OPENCODE_SERVER_PASSWORD` or `OPENCODE_ATTACH_PASSWORD`.
  - [ ] Harness case `symlink-root` expects canonical real path comparison succeeds.

  **QA Scenarios** (MANDATORY - task incomplete without these):
  ```
  Scenario: Same-project fake backend attaches
    Tool: Bash
    Steps: Run the harness same-project case from a temp Git repo subdir with fake candidate `/project/current` returning `{"worktree":"<realpath Git root>"}`.
    Expected: Exit 0; fake opencode invocation file contains exactly one attach command for the fake URL; no start command recorded.
    Evidence: .omo/evidence/task-1-same-project.txt

  Scenario: Wrong-project fake backend rejected
    Tool: Bash
    Steps: Run the harness wrong-project case with API root `/tmp/other-project`.
    Expected: No attach invocation; diagnostic contains `project mismatch` or equivalent; fallback behavior matches OC_NO_START setting.
    Evidence: .omo/evidence/task-1-wrong-project.txt

  Scenario: Attach clients are excluded deterministically
    Tool: Bash
    Steps: Run the harness attach-client-exclusion case with fake pgrep returning one `opencode attach` PID and one server PID.
    Expected: Attach-client PID is ignored; only server PID reaches port/API validation; final behavior matches server API result.
    Evidence: .omo/evidence/task-1-attach-client-exclusion.txt
  ```

  **Commit**: NO | Message: `fix(oc): add project discovery tests` | Files: [test harness path, `.omo/evidence/task-1-*`]

- [x] 2. Refactor `bin/oc` around project-root and candidate discovery helpers

  **What to do**: Update `bin/oc` so the main flow is: determine canonical project root; discover local OpenCode server candidates; validate each candidate by loopback API; attach if exactly one validated candidate; otherwise branch to safe ambiguity/no-match behavior. Implement helpers in zsh within `bin/oc`: `canonical_path`, `project_root`, `discover_candidates`, `candidate_ports`, `api_project_worktree`, `attach_to`, `start_project_tui`, and `diagnose`. Candidate process discovery must exclude `opencode attach` and include `opencode --port`, `opencode serve`, and `opencode web` candidates. Use `lsof` to find listening TCP ports; never accept a candidate based on `lsof` CWD alone. API calls to `/project/current` must use `curl`; if `OPENCODE_SERVER_PASSWORD` or `OPENCODE_ATTACH_PASSWORD` is set, call curl with basic auth using username `${OPENCODE_SERVER_USERNAME:-opencode}` and that password. HTTP 401 means reject candidate and print auth-specific diagnostic. Keep tmux window rename/restore behavior only if it remains harmless.
  **Must NOT do**: Do not keep fixed default `http://127.0.0.1:4096`. Do not attach to any candidate without API project match. Do not modify `.config/opencode/opencode.json`.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: single shell wrapper refactor.
  - Skills: [] - no special skill required.
  - Omitted: [`git-master`] - no commit requested.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [3, 4] | Blocked By: []

  **References**:
  - Current file: `bin/oc:9-30` - current URL/port/password initialization to remove or move behind explicit override.
  - Current file: `bin/oc:95-128` - current probe/start/attach flow to replace with discovery flow.
  - Official docs: `https://opencode.ai/docs/config/#per-project` - config loads by current dir/Git root.
  - Official docs: `https://opencode.ai/docs/server/#apis` - `/project/current`, `/global/health` endpoints. Use `/project/current` JSON field `worktree` as the project root to canonicalize and compare.

  **Acceptance Criteria**:
  - [ ] `zsh -n bin/oc` exits 0.
  - [ ] If implementation uses `jq`, missing `jq` path is tested and emits a clear diagnostic; otherwise tests prove `worktree` extraction works without `jq`.
  - [ ] Password-protected fake backend case proves API validation sends basic auth when `OPENCODE_SERVER_PASSWORD` or `OPENCODE_ATTACH_PASSWORD` is set.
  - [ ] Fake HTTP 401 case rejects candidate and prints auth-specific diagnostic.
  - [ ] `OC_NO_START=1 PATH=<fake-bin> bin/oc` in test harness no-server case exits nonzero and prints exact `cd <root> && opencode --port 0` command.
  - [ ] Fake same-project API response `{"worktree":"<canonical-root>"}` causes `opencode attach <url> --dir <current PWD>` or `--dir <project root>` consistently; choose one and document in wrapper comment. Decision: use `--dir "$PWD"` so pane-local subdirectory is preserved while backend project root is already verified.
  - [ ] Fake wrong-project API never attaches.
  - [ ] Candidate URLs are always `http://127.0.0.1:<port>` or `http://localhost:<port>`; non-loopback candidates are ignored.

  **QA Scenarios**:
  ```
  Scenario: Current project has one valid backend
    Tool: Bash
    Steps: Run harness with fake pgrep PID 111, fake lsof cwd equal to project root, fake lsof port 45678, fake curl `/project/current` response `{"worktree":"<project root>"}`.
    Expected: Wrapper invokes `opencode attach http://127.0.0.1:45678 --dir <original PWD>` exactly once.
    Evidence: .omo/evidence/task-2-valid-backend.txt

  Scenario: Candidate process exists but API is unavailable
    Tool: Bash
    Steps: Run harness with fake pgrep/lsof candidate but fake curl returns connection failure for `/project/current`.
    Expected: Wrapper refuses candidate and starts `opencode --port 0` from project root or prints start command under `OC_NO_START=1`.
    Evidence: .omo/evidence/task-2-api-unavailable.txt

  Scenario: Password-protected project API validates with env auth
    Tool: Bash
    Steps: Run harness with OPENCODE_SERVER_PASSWORD set and fake curl asserting `-u opencode:<password>` is present before returning `{"worktree":"<project root>"}`.
    Expected: Wrapper validates candidate and attaches; evidence shows curl received expected basic auth.
    Evidence: .omo/evidence/task-2-auth-validation.txt
  ```

  **Commit**: NO | Message: `fix(oc): discover project-local opencode backends` | Files: [`bin/oc`, `.omo/evidence/task-2-*`]

- [x] 3. Add explicit override flags/env and diagnostics

  **What to do**: Add documented environment controls to `bin/oc`: `OC_NO_START=1`, `OC_DEBUG=1`, `OPENCODE_ATTACH_URL`, and `OC_ALLOW_UNVERIFIED_ATTACH=1`. `OPENCODE_ATTACH_URL` must still API-validate same project by default. `OC_ALLOW_UNVERIFIED_ATTACH=1` may bypass project validation only for explicit URL override and must print a warning to stderr. Diagnostics must include project root, candidate count, rejected candidate reason, and exact manual commands.
  **Must NOT do**: Do not add interactive prompts. Do not persist registry/state. Do not store passwords in new files unless existing auth behavior is still required for explicit URL; if password support remains, reuse existing `OPENCODE_SERVER_PASSWORD` semantics only.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: wrapper flags and diagnostics.
  - Skills: [] - no special skill required.
  - Omitted: [`security-research`] - no new credentials or network exposure intended.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [4] | Blocked By: [2]

  **References**:
  - Current file: `bin/oc:55-76` - current loopback URL guard; preserve for explicit URL path.
  - Official docs: `https://opencode.ai/docs/cli/#environment-variables` - `OPENCODE_SERVER_PASSWORD` / username behavior.
  - Metis guardrail: fixed global ports are unsafe unless explicitly selected and API-validated.

  **Acceptance Criteria**:
  - [ ] `OC_DEBUG=1` run emits discovery steps to stderr without changing stdout command behavior.
  - [ ] `OPENCODE_ATTACH_URL=http://127.0.0.1:<fake>` with matching fake API attaches.
  - [ ] `OPENCODE_ATTACH_URL=http://127.0.0.1:<fake>` with mismatched fake API refuses unless `OC_ALLOW_UNVERIFIED_ATTACH=1`.
  - [ ] `OC_ALLOW_UNVERIFIED_ATTACH=1` path prints warning containing `unverified attach`.
  - [ ] Multiple valid candidates produce nonzero exit and list candidate PIDs/URLs/manual attach commands.

  **QA Scenarios**:
  ```
  Scenario: Explicit URL still validates project
    Tool: Bash
    Steps: Run harness with OPENCODE_ATTACH_URL set to fake URL whose API returns current project root.
    Expected: Wrapper attaches to explicit URL; process discovery is skipped or ignored; evidence shows no unsafe global fallback.
    Evidence: .omo/evidence/task-3-explicit-url.txt

  Scenario: Unverified explicit override warns
    Tool: Bash
    Steps: Run harness with OPENCODE_ATTACH_URL set, fake API mismatched, and OC_ALLOW_UNVERIFIED_ATTACH=1.
    Expected: Wrapper attaches; stderr contains warning `unverified attach`; exit 0.
    Evidence: .omo/evidence/task-3-unverified-warning.txt
  ```

  **Commit**: NO | Message: `fix(oc): add safe attach diagnostics` | Files: [`bin/oc`, `.omo/evidence/task-3-*`]

- [x] 4. Run full verification and live-safe smoke tests

  **What to do**: Execute the canonical harness command `zsh .omo/evidence/oc-project-discovery-harness.zsh`, run syntax checks, and perform live-safe smoke tests that do not leave uncontrolled background processes. Use temp Git repos and fake command PATH for deterministic cases. For live smoke, use `OC_NO_START=1` first; if starting a real TUI is not practical in automation, do not start real TUI. Instead verify the printed start command and document why real TUI smoke is skipped.
  **Must NOT do**: Do not kill user’s existing `opencode` processes. Do not attach to live sessions unless API confirms same project and test is explicitly read-only. Do not run a TUI in noninteractive CI if it hangs.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` - Reason: verification across shell behavior and diagnostics.
  - Skills: [] - no special skill required.
  - Omitted: [`visual-qa`] - no UI change.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [] | Blocked By: [1, 2, 3]

  **References**:
  - `bin/oc` - final wrapper under test.
  - `.omo/evidence/oc-project-discovery-harness.zsh` - canonical deterministic harness created by Task 1.
  - `opencode --help` output: top-level TUI supports `--port`; attach supports `--dir`, `--session`, auth flags.
  - `opencode db path` / `opencode session list --format json` can be used read-only for context, but must not be required for wrapper correctness.

  **Acceptance Criteria**:
  - [ ] `zsh -n bin/oc` exits 0.
  - [ ] `zsh .omo/evidence/oc-project-discovery-harness.zsh` exits 0.
  - [ ] `OC_NO_START=1 bin/oc` from a temp Git repo with no fake candidates exits nonzero and prints a start command rooted at the temp Git root.
  - [ ] Deterministic harness case `attach-client-exclusion` proves `opencode attach` clients are ignored; live process state is not required for this assertion.
  - [ ] Deterministic harness case `missing-tools` proves missing `pgrep`, `lsof`, `curl`, and `opencode` diagnostics.
  - [ ] Evidence files summarize commands, outputs, and pass/fail result.

  **QA Scenarios**:
  ```
  Scenario: Full deterministic harness
    Tool: Bash
    Steps: Run `zsh .omo/evidence/oc-project-discovery-harness.zsh` in the repo root.
    Expected: All cases pass; final output includes `PASS` for same-project, wrong-project, no-server, multiple-match, missing-api, explicit-url, symlink-root, missing-tools, auth-401, and attach-client-exclusion.
    Evidence: .omo/evidence/task-4-full-harness.txt

  Scenario: Live-safe no-start smoke
    Tool: Bash
    Steps: Create temp Git repo, run `OC_NO_START=1 /Users/bigforcegun/.dotfiles/bin/oc` from a subdir with normal PATH.
    Expected: No attach unless a real API-proven matching backend exists; otherwise nonzero with exact `cd <temp-root> && opencode --port 0` command; no background process left behind.
    Evidence: .omo/evidence/task-4-live-safe-smoke.txt
  ```

  **Commit**: NO | Message: `test(oc): verify project discovery wrapper` | Files: [`.omo/evidence/task-4-*`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Do not commit unless user explicitly requests.
- If committing later: one focused commit after all verification passes.
- Suggested message: `fix(oc): attach only to project-local opencode backends`
- Include required trailer: `Co-authored-by: bfg-oc-agent1 <agent-oc1@bfg.dev>`

## Success Criteria
- Running `oc` from a project subdirectory never attaches to a backend from another project unless user explicitly sets `OC_ALLOW_UNVERIFIED_ATTACH=1` with `OPENCODE_ATTACH_URL`.
- Existing project-local OpenCode backend is discovered and reused with one command.
- No matching backend path is predictable and safe: auto-start from project root or print exact command with `OC_NO_START=1`.
- The implementation can be verified without relying on real long-running OpenCode processes.
