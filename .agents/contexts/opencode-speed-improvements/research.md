# OpenCode speed improvements research

## Short conclusion

The slowdown is usually not just the model being slow. Current public reports point to a combination of:

- OpenCode using an OpenAI/ChatGPT Codex HTTP streaming path that can stall for minutes in some regions.
- Longer OpenCode sessions sending larger request payloads as tool calls, file reads, and outputs accumulate.
- Differences between OpenCode and Codex CLI in session state, prompt caching, and transport behavior.
- High reasoning variants such as `high` or `xhigh` adding latency.
- Network routing issues, especially when streaming over SSE/HTTP.

## Key findings

### 1. SSE/HTTP streaming can stall

OpenCode reports show requests to `https://chatgpt.com/backend-api/codex` sometimes receiving no response until a long timeout. One investigation captured requests completing upload quickly, then hanging for about ten minutes before retry.

Codex CLI often feels faster, but users reproduced similar delays when forcing Codex CLI onto the HTTP/SSE Responses path instead of its faster/default path. This suggests at least part of the issue is OpenAI endpoint/transport behavior rather than only OpenCode agent logic.

Relevant issues:

- `https://github.com/anomalyco/opencode/issues/29079`
- `https://github.com/openai/codex/issues/24428`

### 2. Session growth increases latency

There are reports that OpenCode gets progressively slower as a session grows. The likely driver is larger payloads: more conversation history, tool-call records, large file reads, and long outputs.

One comparison found OpenCode request sizes and output payloads much larger than Codex CLI for some tasks. Higher tool-call counts and large max outputs correlated with slower OpenCode runs.

Relevant issue:

- `https://github.com/anomalyco/opencode/issues/9045`

### 3. Session state handling differs from Codex CLI

Public comparisons mention differences around:

- `session_id` header
- `prompt_cache_key`
- `previous_response_id`
- `store`

The practical effect: Codex CLI may get better server-side reuse/caching or send a smaller effective continuation payload, while OpenCode may resend more context or miss some session affinity behavior.

### 4. Reasoning effort matters

OpenCode exposes OpenAI variants roughly like:

- `none`
- `minimal`
- `low`
- `medium`
- `high`
- `xhigh`

For interactive coding, `high` and especially `xhigh` can add visible latency. Use `minimal` or `low` when diagnosing speed, then raise effort only for hard tasks.

### 5. Network route can dominate

Multiple reports mention provider slowness changing with VPN/WARP/TUN mode or by time of day. For SEA/Oceania users, hangs before first token may be a routing/streaming problem rather than a local config issue.

## Diagnostic checklist

Before changing config, compare these cases:

1. New empty OpenCode session vs long existing OpenCode session.
2. Same prompt in OpenCode and Codex CLI.
3. Same prompt with OpenCode reasoning variant set to `minimal` or `low`.
4. Same prompt with MCP/tools disabled if possible.
5. Same prompt through another network route, such as WARP/TUN/VPN.
6. Logs for stream stalls, empty stream errors, or timeouts around 5-10 minutes.

Useful signs:

- Slow only after many turns: suspect context/payload growth.
- Slow before first token, even for trivial prompts: suspect streaming endpoint or network route.
- Slow only on `high`/`xhigh`: suspect reasoning effort.
- Fast in a new session but slow in old one: compact/reset session or reduce tool output.

## Candidate improvement paths

### Local usage changes

- Start fresh sessions for unrelated work.
- Prefer lower reasoning variants by default.
- Avoid dumping large files into context unless needed.
- Prefer targeted searches/reads over full-file or whole-repo output.
- Try WARP/TUN/VPN if streaming hangs before first token.
- Keep OpenCode updated; several OpenAI provider slowness issues were discussed as active/fixed upstream.

### Upstream/code changes to watch

- Better token-based truncation of tool output.
- Earlier compaction before context overflow.
- More Codex-like session handling, especially session affinity/state headers.
- Use of `previous_response_id` where supported.
- WebSocket transport support for OpenAI Responses where stable.
- Reduced tool-call explosion for simple shell/search tasks.

## Sources

- OpenCode GPT latency issue: `https://github.com/anomalyco/opencode/issues/29079`
- OpenCode session growth latency issue: `https://github.com/anomalyco/opencode/issues/9045`
- OpenCode OpenAI provider slow issue: `https://github.com/anomalyco/opencode/issues/29312`
- OpenAI Codex slow/SSE issue: `https://github.com/openai/codex/issues/24428`
- OpenCode docs note that provider-specific model options, including OpenAI reasoning effort, pass through agent configuration.
