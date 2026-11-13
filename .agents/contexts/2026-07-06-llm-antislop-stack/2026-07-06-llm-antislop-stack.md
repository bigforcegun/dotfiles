---
updated: 2026-11-10
status: active
next: "decide: build own structural-rubric LLM-judge skill (+ ru-humanizer hard bans only) — see trial note; sandbox /tmp/deslop-test is ephemeral"
---

# LLM Anti-Slop Stack

[[DOTFILES]]

## Purpose

Capture the current shortlist (English and Russian) of ready-made tools, skills, MCP servers, and pattern references for detecting and cleaning AI-sounding prose.

This context is for practical stack selection: what to install first, what catches slop inline, what audits prose deterministically, and what provides deeper editorial review or rewrite loops.

## Files

- [[2026-11-10-llm-antislop-stack-market]] - **current** (2026-11-10) EN+RU market map: OSS linters/skills, Russian-specific skills, commercial detectors/humanizers, model-level research; supersedes the July shortlist where they disagree.
- [[2026-11-10-llm-antislop-stack-trial]] - hands-on trial of `humanizer-ru` and `ru-text` on real texts: both are blind to structural/templated slop; findings and the gap list.
- [[2026-07-06-llm-antislop-stack-research]] - July 2026 EN-only shortlist and working taxonomy (several entries now stale/deprecated, see the November note).

## Load policy

Read [[2026-11-10-llm-antislop-stack-market]] first (and [[2026-07-06-llm-antislop-stack-research]] for the taxonomy) before choosing or wiring any anti-slop editor extension, MCP server, prose-review skill, or anti-AI-writing ruleset.
