---
updated: 2026-10-17
status: active
next: выбрать сервер из Rust-шортлиста и проверить его на реальном vault
---
# Поиск standalone MCP для Obsidian

[[DOTFILES]]

## Purpose

Найти MCP-сервер для Obsidian vault. Требования:

1. Работает с файлами хранилища на диске: без запущенного Obsidian, Local REST API и плагинов.
2. Не read-only, есть инструменты записи.
3. Ищет по разобранному YAML frontmatter, а не подстрокой по тексту.
4. Написан на компилируемом языке с нативным бинарником (Go, Rust, Swift, C# AOT…).

## Status (2026-09-26)

Отбраковано: `nsega/mcp-obsidian` (Go). Поиска по свойствам нет, `list_tags` только перечисляет теги. Поиск без учёта регистра идёт по подстроке через `regexp.QuoteMeta`, хотя README обещает regex (`internal/handler/handler.go:90,337`).

Шортлист Rust (собирал субагент по исходникам, ничего не запускалось):

| Репо | Поиск по свойствам | Бинарники |
|---|---|---|
| epistates/turbovault | `query_metadata`: `key: "v"`, `contains()`, `>`/`<`; SQL только с `--features sql` | да |
| lstpsche/obsidian-mcp | `search_metadata`: eq/contains/exists, только ключи верхнего уровня, одно условие | да |
| ptdgrp/obsidian-vault-mcp | `query_frontmatter`: exists/equals/regex; атомарная запись | да |
| MrRefactoring/obsidian-mcp-rs | `search-vault` с `frontmatter: {k: v}`, AND, только равенство | да |
| rusenbb/vaultdb | богатый DSL (regex, сравнения, OR); запись за `--dangerously-allow-*` | нет, cargo |
| kronberger-droid/notal | наличие ключа или равенство, без массивов; только `write_note` | ? |
| aw-bii / aryamanw mcp-obsidian | только равенство строк, массивы склеиваются | ? |

По Go, C#, Swift и Zig подходящих нет: только поиск подстрокой, только теги или работа через REST API.

Риски, выведенные из кода и не проверенные: в lstpsche запись не атомарная, а `frontmatter` set/remove пересобирает YAML без `preserve_order` (ключи сортируются, комментарии теряются).

Не проверено: pkg.go.dev напрямую, сборки Deno/Bun `compile`, есть ли `sql` в релизах turbovault, есть ли бинарники у notal и aryamanw. Клоны лежали в `/tmp/omcp/` и `/tmp/omcp2/` (временные).

## Related

[[2026-06-21-mcp-stack]] — общий план MCP-стека, куда войдёт выбранный сервер.
