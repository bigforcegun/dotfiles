# Global Agent Instructions Research Report

**Scope.** This report evaluates global instructions for Claude Code Opus 5, Opus 5.5, Sonnet 5, Codex GPT-5.x, and OpenCode with OMO, as of 2026-09-23. The local corpus is `/Users/bigforcegun/.dotfiles/.rulesync-global/.rulesync/rules/`. Local files were read directly. Remote claims below are evidence, not promises about any installed version or runtime.

## TL;DR Recommendation

Keep one rulesync source corpus and its three generated destinations, using target selectors for the existing hybrid layout. Do not replace rulesync with separate hand-maintained instruction trees. Reduce the shared layer to facts, boundaries, evidence discipline, and a compact optional voice. Keep harness mechanics in target-specific files.

The strongest cross-harness policy is: act on unblocked work, stop for approval at destructive or external boundaries, distinguish observations from assumptions, verify the requested result, and do not claim checks that did not run. Do not make every response carry a label or ironic turn. Preserve HK-47 as an optional concise style, while allowing each harness and machine-facing output to use its native format.

For Claude, retain a short run-mode policy for unattended execution, continuation, and acceptance criteria. Remove generic rechecks and forced verification theater, but retain real tests and explicit acceptance criteria. For Codex, rely on native `AGENTS.md` precedence and avoid copying a native prompt into the global corpus. For OpenCode, let OMO own orchestration, delegation, planning, and continuation. Keep only user-owned boundaries and environment facts globally.

## Findings

1. **Instruction files are context, not enforcement.** Claude documents a global `~/.claude/CLAUDE.md`, recommends concise, concrete, consistent instructions, and suggests under 200 lines as guidance. Imports expand into context, and skills or path-scoped rules fit conditional procedures better. Permissions and hooks, not prose, enforce hard blocks. [Claude memory](https://code.claude.com/docs/en/memory) [official]

2. **Model guidance conflicts by harness and model family.** Opus 5 guidance says to remove generic final verification, subagent verification, and rechecks that cause oververification, while preserving real tests and acceptance criteria. It recommends delegation only for sizable independent work. [Opus 5 prompting](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5) [official] Opus 5.5 guidance adds a checklist, continuation through open unblocked work, waiting for background work, and a two or three continuation limit for unattended runs. It also says risky actions still need confirmation. Its progress-update advice concerns API thinking blocks and `display:updates`, not proven Claude Code UI behavior. [Opus 5.5 prompting](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5) [official]

3. **Sonnet 5 favors literal, lighter scaffolding.** Its guidance says to remove forced status scaffolding when regular updates suffice and tune effort before adding reasoning incantations. The official catalog confirms Opus 5.5, Opus 5, and Sonnet 5 as named model families. [Sonnet 5 prompting](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5) [official] [model catalog](https://platform.claude.com/docs/en/models/overview) [official]

4. **Codex has its own discovery and prompt split.** `AGENTS.override.md` wins over `AGENTS.md`; discovery proceeds from global toward the current directory, with closer guidance overriding earlier guidance, and a default combined discovery cap of 32 KiB. [Codex AGENTS](https://developers.openai.com/codex/agent-configuration/agents-md) [official] The Codex API harness guide distinguishes older pre-5.3 behavior from 5.3+ promptable updates, recommends persistence, verification, and avoiding repetitive loops, and recommends avoiding headings, status labels, and log voice in progress updates, not banning Russian or final-answer labels. [Codex prompting](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide) [official]

5. **OpenCode behavior is version-sensitive, and OMO already supplies orchestration.** OpenCode’s legacy rules document describes global `~/.config/opencode/AGENTS.md` and a `CLAUDE.md` fallback. The v2 instructions document says AGENTS-only, with no CLAUDE fallback, combines instructions without conflict resolution, and loads initial global instructions followed by workspace instructions nearest-first. The installed branch and version were not audited. [rules](https://opencode.ai/docs/rules/) [official] [v2 instructions](https://opencode.ai/v2/docs/instructions) [official] OMO’s maintainer source shows model-family-selected Sisyphus prompt builders and a continuation hook that injects work for incomplete todos while skipping cancelled, stopped, background, and permission-blocked states. This is pinned source evidence, not an audit of the active hook configuration. [Sisyphus factory](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/agents/sisyphus-agent-factory.ts) [community] [continuation hook](https://github.com/code-yeongyu/oh-my-openagent/blob/b072d279110bdda2c6ac2525d0d24dc54d16148a/packages/omo-opencode/src/hooks/todo-continuation-enforcer/continuation-injection.ts) [community]

6. **Research supports pruning, but not a universal deletion rule.** One study found repository context files did not generally improve success and increased average inference cost by over 20 percent, but it studied repo contexts, not personal global personas or these current models. [Gloaguen et al.](https://arxiv.org/abs/2602.11988v2) [study] Counterevidence reports median runtime down 28.64 percent and output tokens down 16.58 percent across 10 repositories and 124 PRs, without independently establishing semantic correctness. [Lulla](https://arxiv.org/abs/2601.20404v2) [study] Instruction-following work finds performance can fall as simultaneous instruction count rises, but it measures instruction count, not a universal line cap for agents. [ManyIFEval and StyleMBPP](https://aclanthology.org/2025.findings-emnlp.896/) [study] Persona research finds expertise roles positive or insignificant, while irrelevant attributes can hurt. It does not measure HK-47 or Russian voice on these agents. [Principled Personas](https://aclanthology.org/2025.emnlp-main.1364/) [study]

7. **Do not universalize prompt strength.** Generic [GPT-5 guidance](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide) [official] encourages persistence and preambles; older Codex guidance warns against prompted preambles. Anthropic's [best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) [official] warn that aggressive `CRITICAL/MUST` tool triggers can overtrigger Opus 4.5/4.6. This is model-scoped evidence, not a ban on mandatory safety rules.

## Conflicts by Harness

| Harness | Keep | Conflict to resolve |
|---|---|---|
| Claude Code, Opus 5 | Real tests, acceptance criteria, evidence, approval boundaries | Generic rechecks and mandatory verifier passes can create oververification. |
| Claude Code, Opus 5.5 | Checklist, continuation through open work, background completion, risky-action confirmation | Unattended continuation needs a bounded two or three cycle rule; human-in-loop runs should not inherit it blindly. |
| Claude Code, Sonnet 5 | Literal instructions and regular concise updates | Forced every-three-tool-call status scaffolding is unnecessary when normal updates exist. |
| Codex GPT-5.x | Persistence, action bias, verification, bounded non-looping work | Progress guidance favors no headings or status labels; older and newer Codex versions differ on progress prompting. |
| OpenCode plus OMO | User-owned permissions, provider neutrality, environment facts | OMO already owns identity, delegation, planning, and continuation. A second global orchestrator would compete with it. |

## Concrete Critique of the Current Corpus

Base directory: `/Users/bigforcegun/.dotfiles/.rulesync-global/.rulesync/rules/`.

- `00-overview.md:frontmatter`: scaffolding only. Keep it empty rather than adding another behavioral layer.
- `00-SOUL-HK-47-RU.md:Двигатель иронии / Ритм`: mandatory labels, including subagent reports, and ironic turns are too rigid across progress events and machine-facing output. Retain factual discipline, sensitive-context restraint, concise dry tone, and optional irony. Style must yield to exact-output contracts. The cited studies do not establish a causal accuracy penalty from HK-47 or Russian.
- `10-{claude,codex,oc}-agent-identity.md:Agent Identity`: preserve target-specific provenance trailers. Change “sign git comments” to “add this commit-message trailer when a commit is explicitly requested.” Provenance does not replace native Claude, Codex, or Sisyphus identity.
- `20-CLAUDE.md:@RTK.md`: correct Claude-native import, but context inclusion is not proof that a hook filters CLI calls. The imported file exists; hook execution was not tested.
- `20-OC.md:OpenCode Config Rules / Debug and Smoke Runs`: provider neutrality, backups, explicit permission, and isolated smoke database are useful. Move maintenance procedure into scoped skills; retain the permission boundary. The hardcoded field list risks untested version drift.
- `30-git.md:Git Rules`: keep the common policy. Clarify that approval and backup apply to both config and hooks; prose alone cannot enforce permissions.
- `31-interactive-shell.md:Bash-сессия`: useful host-specific knowledge, but shell options were not tested across harnesses. Scripts follow their interpreter and shebang, not necessarily zsh. Narrow unconditional `>|`, since it can clobber files.
- `40-claude-run-policy.md:Автономность / Доказательства / Итог длинного прогона`: same-message status plus next action fits unattended Opus 5.5. Add a run-mode condition. Replace blanket parallelization with “parallelize independent work when useful.” Preserve evidence and approval boundaries without mandatory extra verifier passes. Make the three-part ending conditional.

## Proposed Layout

1. **Shared core:** factual scope, stop and approval boundaries, evidence versus assumption, completion criteria, and a compact optional voice. No global model prompt, mandatory label, universal status cadence, or competing continuation loop.
2. **Target identity:** retain the three selector-based identity files and their trailers. Keep native harness identity distinct from personal style.
3. **Environment layer:** retain shell facts, the Claude RTK import, and OpenCode permission rules, but state their scope and version assumptions. Keep maintenance procedures in scoped skills or files.
4. **Claude-only run policy:** a short file with Claude run modes, acceptance criteria, bounded unattended continuation, background-work waiting, and risky-action confirmation. Do not copy it into Codex or OpenCode.
5. **Codex:** add no extra global loop. Let native AGENTS precedence and model-family behavior govern. Use project files for project-specific commands and tests.
6. **OpenCode plus OMO:** preserve user boundaries and environment facts, while leaving orchestration to OMO. Do not duplicate Sisyphus delegation or todo continuation.

The next step should be a separately authorized paired A/B evaluation of concise shared rules versus the proposed layout, across representative tasks and all three harnesses. No such evaluation was executed here, and no claim about installed versions, active hooks, runtime behavior, or accuracy change should be inferred.
