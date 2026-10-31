# OMP: откуда хайп и какие IDE-инструменты

Собрано 2026-10-18 по [omp.sh](https://omp.sh), [документации](https://omp.sh/docs/tools) и исходникам `can1357/oh-my-pi` (shallow-клон `main`). Сам omp не запускался.

## Откуда хайп

- Пост Can Bölük «I Improved 15 LLMs at Coding in One Afternoon» ([stencil.so/blog/the-harness-problem](https://stencil.so/blog/the-harness-problem)), 832 очка на HN (по вторичным источникам; сам тред не найден). Тезис: формат правок влияет на результат сильнее, чем принято думать.
- Цифра 6.7% → 68.3% (Grok Code Fast 1) — это **patch → hashline**, не replace → hashline. Hashline бьёт patch у 14/16 моделей; против replace разница скромнее.
- Идея — антитеза Pi: Pi даёт 4 инструмента, OMP — 31+.

## Критика

- [edit-bench (nwyin)](https://dev.to/nwyin/hashline-vs-replace-does-the-edit-format-matter-15n2): replace ≈79% против hashline ≈76% в среднем; на Python hashline проигрывает. Выборка 20 задач на язык.
- [Composio Pi vs OMP](https://composio.dev/content/pi-vs-omp): 17/30 у OMP против 20/30 у Pi, $0.103 против $0.028 за успех, медиана 272 с против 132 с. Задачи tool-use через MCP, не чистый кодинг.

## `lsp` — 14 операций

`packages/coding-agent/src/lsp/types.ts:10`: `diagnostics`, `definition`, `references`, `hover`, `symbols`, `rename`, `rename_file`, `code_actions`, `type_definition`, `implementation`, `status`, `reload`, `capabilities`, `request`.

Диагностика после записи (`lsp.diagnosticsOnWrite`, по умолчанию вкл.); сервер выбирается по маркеру проекта в каталоге запуска и бинарю в PATH; конфиг `.omp/lsp.json`.

## `debug` — 28 операций DAP

`packages/coding-agent/src/tools/debug.ts:69`: `launch`, `attach`, `set_breakpoint`, `remove_breakpoint`, `set_instruction_breakpoint`, `remove_instruction_breakpoint`, `data_breakpoint_info`, `set_data_breakpoint`, `remove_data_breakpoint`, `continue`, `step_over`, `step_in`, `step_out`, `pause`, `evaluate`, `stack_trace`, `threads`, `scopes`, `variables`, `disassemble`, `read_memory`, `write_memory`, `modules`, `loaded_sources`, `custom_request`, `output`, `terminate`, `sessions`.

Адаптеры: gdb, lldb-dap, codelldb, debugpy, dlv, rdbg, js-debug-adapter, netcoredbg, kotlin, php, bash, dart/flutter, elixir-ls. Конфиг `.omp/dap.json`.

## Формат hashline (текущий)

`packages/coding-agent/src/edit/hashline-compact.md`. Не хэш на строку, как пишут блоги, а 4-hex тег снапшота файла плюс номера строк:

```text
*** Begin Patch
[src/main.ts#a3f9]
PUT 3.=5:
+новые строки
*** End Patch
```

Операции: `PUT N.=M` (диапазон), `PUT N*` (синтаксический блок), `PUT <N` / `>N` / `>$` (вставки), `CUT … @name` и `PUT … @name` (регистры для переноса), `REM`, `MV`.

## Прочее

`ast_edit` (preview → accept, перезапуск на текущих файлах), `ast_grep` (по умолчанию выкл.), `conflict://N` для merge-конфликтов, `read` (файлы, архивы, SQLite, PDF, ноутбуки, URL, `ssh://`), `eval` (постоянные Python/JS-ячейки), `browser`, `computer`, `security_scan`.

Назад: [[2026-10-19-omo-vs-omp-research]]
