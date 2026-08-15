# OMO Subagents Refining Research

## Local snapshot

- Local OMO runtime cache currently contains `oh-my-openagent@4.9.2` at `~/.cache/opencode/packages/oh-my-openagent@latest/package.json`.
- npm latest checked on 2026-06-21: `oh-my-openagent@4.12.1` / `oh-my-opencode@4.12.1`.
- Local `~/.config/opencode/oh-my-openagent.json` sets:
  - `agents.librarian.model = "openai/gpt-5.4-mini-fast"`
  - fallback `openai/gpt-5.4-nano`
- Therefore the main latency problem is probably not model choice. The stronger cause is Librarian's prompt/workflow.

## Librarian prompt behavior

In OMO `4.9.2`, `dist/index.js` contains `packages/omo-opencode/src/agents/librarian.ts` with this behavior:

- Librarian's job is framed as answering OSS/library questions with evidence and GitHub permalinks.
- Request classification:
  - Type A conceptual: `Doc Discovery -> context7 + websearch`
  - Type B implementation: clone/read/blame/source investigation
  - Type C context/history: issues/PRs/git history
  - Type D comprehensive: `Doc Discovery -> ALL tools`
- Phase 0.5 Doc Discovery for Type A/D is sequential:
  1. websearch official documentation
  2. optional version check
  3. sitemap discovery via `webfetch(.../sitemap.xml)` and fallbacks
  4. targeted docs fetch + context7
- Main phase can then add context7, webfetch, grep_app, gh, clone, issues/PRs depending on type.

Checked `oh-my-openagent@4.12.1` tarball without installing it. The same key behavior is still present:

- `Your job: ... EVIDENCE with GitHub permalinks`
- Type A/D still require Doc Discovery.
- sitemap discovery is still in the prompt.
- Therefore updating from `4.9.2` to `4.12.1` alone should not be expected to make Librarian fast by default.

## Upstream references

### `code-yeongyu/oh-my-openagent#2997` - Librarian Agent Timeout on Simple Queries

Relevant because it reports Librarian timing out on a simple web-search query.

- Simple query took ~1m29s and showed `last_tool: bash`.
- Suspected cause: Librarian tried `gh` or other unstable commands instead of prioritizing websearch.
- Suggested fixes included Librarian timeout, websearch priority, and fallback from `gh` to websearch.
- Workaround in issue: explicitly prompt “Use websearch tool ..., do not use gh command”.
- Closed as fixed/verified, but it does not remove the later sitemap-heavy prompt workflow.

### `code-yeongyu/oh-my-openagent#377` - Documentation discovery workflow PR

This PR appears to be the source of the current sequential discovery behavior.

- Adds Phase 0.5 documentation discovery before Type A and Type D.
- Flow: `websearch -> version check -> sitemap -> targeted fetch`.
- PR discussion explicitly frames the speed/precision tradeoff:
  - Before: immediate parallel fire.
  - After: sequential discovery before parallel phase.
  - Expected impact: slightly slower, more precise, less wrong-version docs.
- This confirms the latency is an intentional upstream precision tradeoff, not just a local misconfiguration.

### `code-yeongyu/oh-my-openagent#4191` - Prompt awareness for disabled MCPs

Relevant to using `disabled_mcps` as a speed/availability lever.

- `disabled_mcps` removes MCP tools from registration, but static prompts can still instruct agents to call disabled tools.
- Librarian is called out as the most visible remote-MCP case because it references `context7`, `websearch`, and `grep_app` directly.
- Expected behavior: if `context7`, `websearch`, or `grep_app` is disabled, Librarian should not mention their tools.
- Issue is open and linked to PR `#4392`.
- Local implication: disabling research MCPs can reduce startup/tool surface, but without prompt awareness it may cause failed calls or reasoning loops unless we also add a local prompt override.

### `code-yeongyu/oh-my-openagent#882` - context7/grep_app connection delays

Relevant to startup latency, not just Librarian runtime latency.

- Reported context7 and grep_app taking 2-3 minutes to connect, blocking user messages before MCP connection timeout.
- Disabling context7/grep_app made the issue disappear.
- Upstream analysis: OAuth disabled-state fixed, but connection blocking is mostly OpenCode MCP behavior / network timing.
- Suggested workaround: `disabled_mcps: ["context7", "grep_app"]` if blocking persists.
- Local caveat: see `#4191`; disabled MCPs should be paired with prompt-awareness or a prompt override.

### `code-yeongyu/oh-my-openagent#2189` - skill_mcp hint for builtin MCP names

Relevant to wasted agent loops.

- Builtin MCPs like `context7`, `websearch`, and `grep_app` are native/plugin MCPs, not skill-embedded MCPs.
- Calling `skill_mcp(mcp_name="context7", ...)` produced misleading “load the skill first” guidance.
- This can cause agents to loop on nonexistent skill loading rather than using native tools.

### `code-yeongyu/oh-my-openagent#22` - Librarian suggestion / grep.app

Early community discussion around using grep.app as a faster Librarian starting point.

- User sentiment: Librarian can be slow but accurate.
- Maintainer acknowledged grep.app as a good fast starting point.
- Confirms the long-running theme: Librarian trades speed and precision, and grep_app can help when used as the first stop for code examples.

## Local tuning hypothesis

Use a local `prompt_append` on `agents.librarian` rather than forking OMO or patching cached packages.

Rationale:

- OMO schema supports per-agent `prompt_append`, `reasoningEffort`, `textVerbosity`, `maxTokens`, `tools`, and `permission` overrides.
- Runtime merge logic appends `prompt_append` to the base prompt, so this should survive OMO package updates.
- A prompt override can make “fast targeted research” the default while preserving upstream comprehensive mode when explicitly requested.

Candidate policy:

```text
## Local speed policy override
Default to fast targeted research, not comprehensive research.

Budgets:
- Simple API/docs question: max 2 tool calls total.
- Official docs only: context7 resolve + context7 query. Do not websearch, webfetch sitemap, or fetch docs pages unless context7 fails.
- OSS examples: max 2 grep_app queries, only when explicitly requested or necessary.
- Implementation internals: use grep_app first; clone or gh API only when grep_app cannot answer.
- Do not run sitemap discovery by default.
- Do not combine websearch + context7 + grep_app unless the user explicitly asks for comprehensive/deep research.
- If evidence is insufficient within budget, say what is missing and stop instead of expanding the search.

Classification:
- Treat most requests as targeted unless they contain: comprehensive, deep dive, compare implementations, history, issues, PRs, migration across versions.
- For targeted requests, answer from the smallest authoritative source set.

Output:
- Be concise. Return the answer, sources used, and any uncertainty. No research narration.
```

Possible model knobs:

```jsonc
{
  "agents": {
    "librarian": {
      "model": "openai/gpt-5.4-mini-fast",
      "reasoningEffort": "minimal",
      "textVerbosity": "low",
      "maxTokens": 4096,
      "fallback_models": [{ "model": "openai/gpt-5.4-nano" }],
      "prompt_append": "...speed policy..."
    }
  }
}
```

More aggressive option: restrict Librarian tools or disable some MCPs. Do this only after testing, because:

- disabling `websearch`/`context7`/`grep_app` may create stale prompt/tool references until upstream `#4191` is fixed;
- prompt override is lower risk and reversible;
- comprehensive research remains useful when explicitly requested.

## Current recommendation

After updating OMO, test one simple Librarian query and one docs query. If it still performs sitemap/websearch chains by default, add the `prompt_append` speed policy in `~/.config/opencode/oh-my-openagent.json`.

For this dotfiles repo, modifying OpenCode config requires explicit permission and a same-directory `.bak` first.
