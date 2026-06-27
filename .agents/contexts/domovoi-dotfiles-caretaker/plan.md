# Domovoi architecture plan

## Working concept

Domovoi is the repo-local caretaker for `~/.dotfiles`: a meticulous root workflow that classifies maintenance opportunities, decides what would be most valuable to do now, and routes execution to the right skill or subagent.

Recommended shape:

```text
Domovoi = root orchestrator / caretaker persona
  ├─ domovoi-dotfiles skill = classification and audit method
  ├─ specialized skills = security, changelog, lint, migration, release, debugging
  └─ subagents = focused scouts/executors for specific maintenance branches
```

## Why not only a skill

A skill is good for teaching OpenCode a repeatable workflow: how to classify dotfiles maintenance, what evidence to gather, when to route to security/debugging/git/release skills, and how to report findings.

Domovoi needs more than one skill because it should also decide between categories of work, run parallel investigations, and sometimes implement verified fixes.

## Why not only a subagent

A subagent is good as an executor or scout, for example:

- check Homebrew/package freshness;
- inspect npm/pip/rust/go dependencies;
- compare Linux and macOS bootstrap paths;
- lint shell/Lua/YAML/JSON/TOML configs;
- research better alternatives to current package/install approaches.

But a subagent alone is not the best place for the persistent top-level policy. The root agent still needs to know when to call it, how to interpret its output, and how to combine findings with other skills.

## Recommended rollout

### Phase 0: manual protocol

Use an explicit invocation such as:

```text
Домовой, осмотри избу
```

Expected behavior:

1. Inspect the repository shape.
2. Classify current opportunities.
3. Produce a maintenance map.
4. Recommend the top 3 useful actions for now.
5. Distinguish low-risk automatic fixes from risky changes needing approval.

### Phase 1: `domovoi-dotfiles` skill

Create a skill that triggers on dotfiles maintenance requests, especially:

- “домовой”;
- “осмотри дотфайлы”;
- “что бы сейчас улучшить”;
- “проверь свежесть софта”;
- “проверь конфиги”;
- “найди устаревшие подходы”;
- macOS/Linux drift checks.

The skill should define the classification matrix, evidence requirements, routing rules, and report format.

### Phase 2: repo-local root instructions

After the workflow feels right, add repo-local instructions so agents in this repository naturally act like Domovoi even when the word is not used.

This touches OpenCode/project configuration or instruction behavior, so it requires explicit user permission before editing.

### Phase 3: dedicated `domovoi` subagent

Only create a dedicated subagent after the skill stabilizes. Use it when the pattern of checks, outputs, and routing rules is clear enough to harden.

## Classification matrix

### Freshness

Package versions, Brewfile entries, mise/asdf tools, npm/pip/go/rust dependencies, CLI/app releases, lockfiles, and install scripts.

### Security

Known vulnerable versions, risky shell patterns, unsafe curl-pipe-shell usage, token exposure risk, permissions, SSH/GPG config, and security advisories.

### Config health

Syntax and lint checks for shell, Lua, YAML, JSON/JSONC, TOML, Nix, Zsh, editor configs, terminal configs, and deprecated options.

### Platform drift

macOS-only assumptions, Linux-only assumptions, architecture assumptions, package-name differences, paths, bootstrap divergence, and conditional logic.

### Modernization

Better package managers or install strategies, simpler bootstrap flows, less duplicated config, newer recommended APIs, and replacement of obsolete tools.

### Reliability

Idempotency, dry-run support, failure modes, rollback paths, setup script safety, and reproducibility.

### UX/devex

Shell startup latency, editor startup, terminal ergonomics, install ergonomics, and clarity of user-facing commands.

## Scout roles

Domovoi can fan out work to temporary scouts before any implementation:

- **Freshness scout**: versions, releases, changelogs, package manager state.
- **Security scout**: advisories, risky config, secrets exposure patterns.
- **Config lint scout**: validators, formatters, deprecated keys.
- **Platform drift scout**: macOS/Linux compatibility and bootstrap differences.
- **Alternatives scout**: modern replacement approaches and migration candidates.

These scouts can initially be ordinary `explore`, `librarian`, `oracle`, or category tasks. Promote them to permanent subagents only after repeated use proves the shape.

## First useful implementation target

Start with a `domovoi-dotfiles` skill, not a subagent.

Reason: the user wants to “feel out” iterative options. Skills are easier to edit, evaluate, and retune than a permanent subagent. Once the skill consistently produces useful triage and routing, encode the stable behavior into root instructions or a dedicated subagent.
