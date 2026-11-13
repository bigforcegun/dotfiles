# Anti-slop trial, 2026-11-10

Practical check of the RU candidates from [[2026-11-10-llm-antislop-stack-market]] on real texts.

Setup: sandbox `/tmp/deslop-test` (redirected HOME; ephemeral). Installed `ru-humanizer` 3.32 (PyPI) and `slopless` (npm). `trafilatura` fetches URLs; a `bin/deslop-check` wrapper picks RU or EN by the share of Cyrillic. The skill files of `ilyautov/humanizer-ru` and `talkstream/ru-text` were run in audit mode by sonnet subagents, each without a hypothesis.

Test texts: two internal Confluence pages (work Atlassian). One is a hybrid migration spec: a human draft with an LLM code-summary block. The other is a hub page that is fully templated. The user confirmed that both contain neuroslop.

## Result

| Tool | Synthetic cliché text | Real texts (structural slop) |
|---|---|---|
| `ru-humanizer` scanner | caught all 8 planted hard bans | blind. Its score is driven by false positives: markdown `##`/bold read as "chat wrapper" (−10…−20), lists read as "listicle", the em-dash ban is wrong for Russian grammar (`X — Y`). It misses hyphen-as-dash. It labels both texts «AI-генерация с высокой вероятностью», which contradicts its own README. |
| `humanizer-ru` catalog (agent audit) | — | mostly copy-edit findings (term drift, repeats, nominalisation). A few hits on the hub page: vague totality claims, a signpost lead-in, an internal contradiction. It does not capture the templated feel. |
| `ru-text` (ru-check/ru-score, AD-1…AD-18) | — | **0 neuroslop findings on both texts**; scores 6.4 and 7.7 come from typos, hyphens and NBSP. Its own corpus admits "no separate rule for distant lexical repetition" (addenda AD-15.6). |
| `slopless` (EN) | 7/9: missed "it's worth noting" and the "not just X. It's Y" reframe | not tested on real EN text |

## What nobody catches

The real slop is document-level and structural. No tool in the market note has rules for it:

- a canned section skeleton (problem → components → where to start → where we're heading → questions);
- a closing pitch line in a paragraph; totality claims ("everything visible", "any skill");
- parallel triads at several scales; a bold signpost lead-in followed by a recap of the list above;
- an intent table ("I want | Where to go");
- a block of bold field labels with an arrow chain (code-summary format);
- a count mismatch ("two facts" introducing three items); one idea restated in several sections.

## Conclusion

Lexical scanners and phrase catalogs are good filters for clichés but are not detectors of templated LLM structure. Next candidate: our own small skill, an LLM judge with a structural rubric (the list above), plus the `ru-humanizer` scanner limited to hard bans and lexical markers. Its structural penalties and the em-dash ban would be off.
