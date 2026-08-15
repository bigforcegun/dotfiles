---
updated: 2026-08-15
status: active
next: раздать скилл через rulesync из .rulesync-global/ и закоммитить миграцию
---
# Agents Context v2

[[DOTFILES]]

## Purpose

Держать вторую редакцию системы контекстов .agents: доктрина реалма, плоские ссылки, датированные имена, обвязка dot-agents-ctl и скилл, который ей управляет.

## Files

- [[2026-08-15-agents-context-v2-decisions]] — принятые решения с причинами, по которым отпали предыдущие варианты, и дефект массового переименования.

## Load policy

Load before changing anything under `.agents/`, `bin/dot-agents-ctl`, or the
`dot-agents-context` skill. Before a mass rename inside a corpus, read `MIGRATION.md`
in the skill first — the order of steps there is not decorative.

Do not reintroduce a generated index, a global always-on rule, or frontmatter fields
that repeat the folder name. Each was tried and removed for a reason recorded in
[[2026-08-15-agents-context-v2-decisions]].

## Related

- [[2026-06-21-agent-context-system]] — первая редакция той же системы; эта её заменяет, а не дополняет
- [[2026-06-21-agents-session-dumper]] — тоже пишет markdown с вики-ссылками, целевой формат общий
- [[2026-07-19-agentcairn-memory-integration]] — граница между долговременной памятью и рабочим контекстом
