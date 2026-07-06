# LLM Anti-Slop Stack Research

## Recommended stack

1. `llm-slop-detector` - first-pass inline detection in Cursor/VS Code.
2. `PublishReady MCP` - deterministic prose audit with `audit_ai_sounding_prose`.
3. One skill layer for review/fix:
   - `The AntiSlop` for tiered find+fix workflows.
   - `bmad-editorial-review-prose` for strict prose review.
   - `editorial-skills` for long-form editorial pipelines.

## Tool matrix

| Tool | Type | Why keep it |
| --- | --- | --- |
| `llm-slop-detector` | Cursor / VS Code extension | Best inline triage. Local highlighting of large regex pattern sets, including model-specific clusters. |
| `PublishReady MCP` | MCP server | Best deterministic prose audit. Local-first, no API calls, explicit `audit_ai_sounding_prose` tool. |
| `The AntiSlop` | skill | Strong find+fix candidate with tiered pattern severity and editor mode. |
| `bmad-editorial-review-prose` | `SKILL.md` | Best direct prose-review skill for clarity/comprehension issues without overrewriting. |
| `editorial-skills` | skill suite | Best full editorial workflow for nonfiction: structural, developmental, line, copy, and proof stages. |
| `slopless` | lint / skill loop | Good deterministic anti-slop gate before publish. |
| `slop-cop` | skill / review loop | Good self-review loop: draft → lint → revise → rerun. |
| `academic-writing-skills` | skill | Keep for academic prose when claim/evidence and overclaim audits matter more than pure tone cleanup. |

## Supporting pattern sources

| Source | Why keep it |
| --- | --- |
| `Bloomberry AI Sentence DNA` | Large pattern corpus: vocabulary, phrase clichés, cadence, structure, hooks, replacements, plus model splits. |
| `Wikipedia: Signs of AI-generated writing` | Fast public checklist and historical map of common AI-writing tells. |
| `rand/cc-polymath anti-slop reference` | Structured markdown reference by phrase, sentence, paragraph, and document level; good base for custom skill rules. |

## Working taxonomy

- **Tier 1 - remove immediately:** obvious AI clichés like `delve`, `game-changer`, `unlock potential`, `it's worth noting`, `in today's digital landscape`, `cutting-edge`.
- **Tier 2 - suspicious in clusters:** paired adjectives, template openings, canned spoken transitions, repetitive rhetorical frames.
- **Structural markers:** uniform sentence length, paragraph-open transition spam, `This isn't X. It's Y.`, em-dash overuse, staccato fragment runs.
- **Document markers:** meta-intro, listicle middle, canned conclusion, and the `horoscope test` where prose is smooth but generic enough to fit any topic.

## Best-first installation order

1. Install `llm-slop-detector` for immediate editor feedback.
2. Add `PublishReady MCP` for deterministic audits in chat.
3. Add one skill based on workflow:
   - rewrite-heavy → `The AntiSlop`
   - editorial review → `bmad-editorial-review-prose`
   - long-form nonfiction pipeline → `editorial-skills`
