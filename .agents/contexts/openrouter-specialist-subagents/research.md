# OpenRouter specialist subagents research

## Short conclusion

OpenRouter is most useful here not as a replacement for the main workhorse model, but as a source of specialized lanes.

The ecosystem around OpenRouter, OpenCode, and OMO all points in the same direction:

- keep one reliable default model for the main agent loop;
- route specific subagents/categories to specialist models;
- use specialized server tools such as `web_search`, `advisor`, `fusion`, or `apply_patch` where being wrong is expensive or where the task is tool-shaped.

For this dotfiles setup, the most promising OpenRouter lanes are:

- patch/apply specialist;
- cheap fan-out scout/summarizer workers;
- long-context synthesis;
- search/research specialist;
- visual/multimodal reader.

## What the docs/code imply

### OpenCode

OpenCode already expects specialization:

- there is one global `model`, but agents can override it;
- if an agent does not override, primary agents use the global model;
- subagents inherit from the invoking primary agent unless explicitly routed otherwise;
- built-ins are already split by role (`build`, `plan`, `general`, `explore`, `scout`).

Implication: specialization is not a hack; it matches the agent architecture.

### OMO / Oh My OpenAgent

OMO pushes specialization even harder:

- categories are explicit routing presets;
- `task(category=...)` is a separate routing layer, not just parent inheritance;
- category model resolution is explicit override > category default > system default;
- docs and code both expect dedicated models/fallback chains per category.

Implication: OpenRouter is a natural fit for category-specific specialist lanes.

### OpenRouter

OpenRouter is not only a multi-model endpoint. It also exposes specialized server tools and workflows:

- `subagent`
- `advisor`
- `fusion`
- `apply_patch`
- `web_search`

OpenRouter cookbooks already show patterns like:

- cheap executor + stronger reviewer;
- long-horizon self-review loops;
- research/search separated from synthesis.

Implication: OpenRouter can be useful even when the base workhorse stays on OpenAI.

## Local inventory snapshot

As of 2026-07-06, `opencode models openrouter` in this environment shows several relevant specialist model families already routable through OpenCode.

Examples from the local inventory:

- patch/code specialists:
  - `openrouter/openai/gpt-5-codex`
  - `openrouter/openai/gpt-5.1-codex`
  - `openrouter/openai/gpt-5.2-codex`
  - `openrouter/openai/gpt-5.3-codex`
  - `openrouter/qwen/qwen3-coder-flash`
  - `openrouter/qwen/qwen3-coder-next`
  - `openrouter/qwen/qwen3-coder-plus`
  - `openrouter/moonshotai/kimi-k2.7-code`
  - `openrouter/mistralai/codestral-2508`

- cheap/fast scouts:
  - `openrouter/google/gemini-2.5-flash-lite`
  - `openrouter/google/gemini-3.1-flash-lite`
  - `openrouter/deepseek/deepseek-v4-flash`
  - `openrouter/qwen/qwen3.6-flash`
  - `openrouter/z-ai/glm-4.7-flash`

- research/search lanes:
  - `openrouter/perplexity/sonar-deep-research`
  - `openrouter/perplexity/sonar-pro-search`
  - `openrouter/perplexity/sonar-reasoning-pro`
  - `openrouter/openai/gpt-4o-search-preview`

- visual/multimodal lanes:
  - `openrouter/google/gemini-2.5-flash-image`
  - `openrouter/google/gemini-3.1-flash-image`
  - `openrouter/google/gemini-3-pro-image`
  - `openrouter/minimax/minimax-m3`
  - `openrouter/z-ai/glm-4.6v`
  - `openrouter/z-ai/glm-5v-turbo`
  - `openrouter/qwen/qwen3-vl-*`

## Task-family recommendations

### 1. Patch / apply specialist

Best candidates:

- `openrouter/openai/gpt-5.3-codex`
- `openrouter/qwen/qwen3-coder-next`
- `openrouter/anthropic/claude-sonnet-4.6`

Why:

- Codex lane is explicitly agentic-coding-oriented.
- Qwen coder lane is attractive as a cheaper or alternate apply worker.
- Claude Sonnet is a good “careful editor” fallback when bounded edits matter more than raw speed.

Practical use:

- dedicated patch worker;
- small to medium bounded edits;
- diff emission or apply-only tasks.

Risk:

- patch quality still depends heavily on prompt discipline;
- code-apply workers should not become the final reviewer.

### 2. Cheap fan-out workers

Best candidates:

- `openrouter/openai/gpt-4.1-nano`
- `openrouter/deepseek/deepseek-v4-flash`
- `openrouter/qwen/qwen3-32b`
- `openrouter/deepseek/deepseek-chat-v3.1`

Why:

- these are better for many parallel narrow tasks than spending a strong frontier model on every branch;
- ideal for extraction, classification, small-file scans, and compact summaries.

Practical use:

- `explore`-style scouts;
- “read 20 files and label the patterns”;
- compare/contrast many small artifacts;
- budget-friendly subagent swarms.

Risk:

- brittle on nuanced planning or ambiguous synthesis;
- outputs should be schema-locked where possible.

### 3. Long-context synthesis

Best candidates:

- `openrouter/google/gemini-2.5-pro`
- `openrouter/moonshotai/kimi-k2.6`
- `openrouter/qwen/qwen3-next-80b-a3b-instruct`

Why:

- these are strong when a task is mostly “absorb a huge context and compress it well”;
- useful for large repos, long documents, or multi-source synthesis.

Practical use:

- digest a big repo before planning;
- summarize long logs or many documents;
- long-horizon context folding before handing to the main agent.

Risk:

- can become expensive or slow if used as the first stop;
- better after a cheap scout phase has reduced the context surface.

### 4. Search / research specialist

Best candidates:

- `openrouter/perplexity/sonar-deep-research`
- `openrouter/perplexity/sonar-reasoning-pro`
- `openrouter/openai/gpt-4o-search-preview`

Why:

- these models are explicitly search-shaped rather than generic chat-shaped;
- good for fresh web information and citation-heavy research flows.

Practical use:

- separate research lane from coding lane;
- upstream/product/web research;
- source gathering before synthesis.

Risk:

- source quality still needs judgment;
- costs can drift if searches are unconstrained.

### 5. Visual / multimodal specialist

Best candidates:

- `openrouter/google/gemini-3.1-pro-preview`
- `openrouter/google/gemini-2.5-flash`
- `openrouter/minimax/minimax-m3`
- `openrouter/z-ai/glm-4.6v`

Why:

- these are better suited than a generic code model for screenshots, PDFs, diagrams, and UI surfaces.

Practical use:

- screenshot reading;
- PDF extraction with interpretation;
- multimodal review lane;
- visual QA and design analysis.

Risk:

- precise visual QA still needs screenshots and diff-based validation;
- some tiny UI details can still be missed.

### 6. Judge / review lane

Best candidates:

- `openrouter/anthropic/claude-sonnet-4.6`
- `openrouter/anthropic/claude-opus-*`
- `openrouter/google/gemini-2.5-pro`
- OpenRouter `fusion` / `advisor` server-tool patterns

Why:

- review/judge tasks benefit from a second-opinion or panel pattern more than from raw speed;
- OpenRouter explicitly supports those workflows.

Practical use:

- second-pass code review;
- “being wrong is expensive” decisions;
- synthesize multiple opinions into one verdict.

Risk:

- can get expensive or verbose;
- better as selective escalation, not the default path.

## Most promising additions for this setup

If adding only a few specialized OpenRouter lanes to a main `openai/gpt-5.4-fast` base, the highest-ROI experiments look like this:

1. **Patch specialist**
   - `openrouter/openai/gpt-5.3-codex`

2. **Cheap scout / fan-out specialist**
   - `openrouter/deepseek/deepseek-v4-flash`

3. **Research specialist**
   - `openrouter/perplexity/sonar-deep-research`

4. **Long-context synthesizer**
   - `openrouter/moonshotai/kimi-k2.6`

5. **Visual specialist**
   - `openrouter/google/gemini-3.1-pro-preview`

## What not to do

- Do not replace the main workhorse model with a zoo of exotic models all at once.
- Do not use cheap scout models as final judges.
- Do not route ambiguous multi-step implementation work straight into tiny utility models.
- Do not put too many fallback chains on every lane before testing the primary lane first.

## Suggested rollout order

1. Keep the current main worker setup.
2. Add one specialist lane at a time.
3. Start with either:
   - patch specialist (`gpt-5.3-codex`), or
   - cheap scout (`deepseek-v4-flash`), or
   - research lane (`sonar-deep-research`).
4. Compare actual time-to-solution, not just first-token speed.
5. Only after one lane proves useful, add the next specialist.

## Sources to revisit

- OpenRouter server tools overview:
  - `https://openrouter.ai/docs/guides/features/server-tools/overview.mdx`
- OpenRouter `fusion` docs:
  - `https://openrouter.ai/docs/guides/features/server-tools/fusion`
- OpenRouter `advisor` docs:
  - `https://openrouter.ai/docs/guides/features/server-tools/advisor`
- OpenRouter automatic code review cookbook:
  - `https://openrouter.ai/docs/cookbook/coding-agents/automatic-code-review`
- OpenRouter long-horizon agents cookbook:
  - `https://openrouter.ai/docs/cookbook/building-agents/long-horizon-agents`
- OpenCode model and agent docs:
  - `https://github.com/anomalyco/opencode/blob/0df44c4e91bfd0e76aa914bbe2e4e6b503eb7caf/packages/web/src/content/docs/models.mdx`
  - `https://github.com/anomalyco/opencode/blob/0df44c4e91bfd0e76aa914bbe2e4e6b503eb7caf/packages/web/src/content/docs/agents.mdx`
- OMO orchestration and category routing:
  - `https://github.com/code-yeongyu/oh-my-openagent/blob/b2ceab68af79c9a832a33c27bc87d2370b6f9693/docs/guide/orchestration.md`
  - `https://github.com/code-yeongyu/oh-my-openagent/blob/b2ceab68af79c9a832a33c27bc87d2370b6f9693/packages/omo-opencode/src/tools/delegate-task/categories.ts`
  - `https://github.com/code-yeongyu/oh-my-openagent/blob/b2ceab68af79c9a832a33c27bc87d2370b6f9693/packages/model-core/src/category-model-requirements.ts`

## Local recommendation

For this dotfiles repo, treat OpenRouter as a specialist-layer provider:

- main workhorse stays on the proven default;
- OpenRouter adds narrow, high-ROI lanes;
- test one lane at a time and keep reversibility high.
