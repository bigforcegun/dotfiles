# rulesync: инициализация проекта

Источник контекстов лежит тут:

```text
~/.config/rulesync/contexts/<context>/.rulesync/
```

## Быстрый старт

Из директории проекта:

```bash
mcpctx list
mcpctx dev .
```

`mcpctx <context> .` запускает `rulesync generate` и кладёт native-конфиги MCP/rules для поддерживаемых агентов в текущий проект.

## Примеры

```bash
mcpctx dev .                # dev
```

MCP в контекстах идёт через `mcpproxy-go` profile endpoint:

```text
http://localhost:9091/mcp/p/<context>
```

После правок в `~/.config/rulesync/contexts/<context>/.rulesync/` повтори `mcpctx <context> .` в проекте.
