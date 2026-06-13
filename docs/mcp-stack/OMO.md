# Интеграция OMO / oh-my-openagent

## Что уже «поженено» с OMO

Текущий пользовательский OpenCode-конфиг уже грузит OMO:

```json
"plugin": ["oh-my-openagent@latest"]
```

Когда плагин включён, OMO сам инжектит свои built-in MCP в runtime:

- `websearch` → remote Exa MCP (`https://mcp.exa.ai/mcp?tools=web_search_exa`), опционально `EXA_API_KEY`.
- `context7` → remote Context7 MCP (`https://mcp.context7.com/mcp`), опционально `CONTEXT7_API_KEY`.
- `grep_app` → remote Grep.app MCP (`https://mcp.grep.app`).
- `lsp` → OMO-packaged LSP MCP/daemon, путь резолвится из установленного OMO-пакета.
- `ast_grep` → OMO-packaged ast-grep MCP, путь резолвится из установленного OMO-пакета.

Это OMO-native слой. Для OMO/OpenCode не надо дублировать эти серверы под теми же именами через rulesync: одинаковые имена могут переопределить built-in серверы. `context7` здесь намеренное исключение: в `mcp-proxy` это каноническое имя и адрес (`http://localhost:9090/context7/mcp`), а в OMO его следует переопределять только осознанно через OpenCode `mcp.context7`. Для такого переопределения `disabled_mcps` не нужен. `websearch` и `grep_app` по-прежнему живут как `shared-*` для non-OMO контекстов.

## Что класть в `mcp-proxy`

`mcp-proxy` — для standalone/shared MCP, которые должны быть доступны разным harness/project через стабильные URL:

- уже есть: `semble`, `godot`, `salotech-*`, `context7`, `shared-grep-app`, `shared-websearch-exa`;
- хорошие будущие кандидаты: `obsidian` и другие не-OMO серверы, когда явно известны их `command`/`env`;
- не класть в глобальный proxy: OMO `lsp` и `ast_grep` как shared-серверы. Они workspace-sensitive: им нужен per-project cwd/config, а `mcp-proxy` держит общий процесс. Для non-OMO клиентов их лучше раздавать как client-local MCP в проектный конфиг, не через общий proxy.

Если сервер добавлен в `mcp-proxy`, в проект он попадает через rulesync-контекст ссылкой на proxy URL, например:

```json
"semble": {
  "type": "http",
  "url": "http://localhost:9090/semble/mcp",
  "env": {}
}
```

## Какой proxy/слой нужен в каком сценарии

| Сценарий | Слой | Почему | Пример |
|---|---|---|---|
| OMO/OpenCode проект | OMO-native + project context через rulesync | OMO уже инжектит research/LSP/AST tools; rulesync добавляет только недостающий shared/project флот | `mcpctx gamedev repo` → `godot`, `semble`; OMO даёт `context7`, `websearch`, `ast_grep` |
| Non-OMO клиенту нужны docs/web/code-search | `mcp-proxy` shared remote + `non-omo-research` | remote MCP можно переиспользовать через один стабильный localhost endpoint | `context7`, `shared-grep-app`, `shared-websearch-exa` |
| Shared stdio сервер дорогой/секретный/общий | `mcp-proxy` stdio | один процесс, env в `~/.config/mcp-proxy/env`, toolFilter на уровне proxy | `salotech-mongodb-sisa`, `salotech-freshdesk`, `semble` |
| Workspace-sensitive tools | client-local MCP, не общий proxy | нужны cwd, project config, LSP workspace; общий процесс даёт неправильный scope | `lsp`, `ast_grep`, filesystem/search tools |
| Project-local HTTP bridge | native project config, без proxy | lifecycle принадлежит проекту; proxy добавляет лишний hop/failure-domain | `controolloop-mcp-bridge :8400`, `debugmcp :3001` |
| Нужен разный набор tools у одного backend | несколько proxy entries с `toolFilter` | membership остаётся простым, фильтр виден в IaC | `db-ro` / `db-full` |
| Нужны live-пресеты без `mcpctx` regeneration | 1mcp, пока не этот стек | это осознанный tradeoff: live membership ценой Node gateway | только если T1 станет важнее C2/C3 |

Правило по умолчанию: **не проксировать то, чей scope определяется текущей директорией проекта**. Проксировать то, что является общим сервисом, remote endpoint или дорогим stdio-процессом.

## Как использовать вместе с OMO/OpenCode

1. Оставить OMO включённым в `~/.config/opencode/opencode.json`.
2. Оставить OMO built-in MCP включёнными, если нет намерения отключить конкретный сервер через `disabled_mcps` в `oh-my-openagent.json`.
3. После правки `.config/mcp-proxy/config.json` или env перезапустить общий proxy:

   ```bash
   mcp-proxy-restart
   ```

4. Засеять проект контекстом:

   ```bash
   mcpctx gamedev /path/to/project
   ```

5. Запустить OMO/OpenCode внутри этого проекта.

Итоговый tool surface аддитивный:

- OMO plugin даёт OMO-native tools/MCP (`ast_grep`, `context7`, `grep_app`, `lsp`, `websearch`).
- rulesync даёт project-native MCP-конфиг со ссылками на `mcp-proxy` URL (`semble`, `godot`, etc.).
- project-local MCP-мосты можно дописывать руками; они должны переживать rulesync regeneration.

Для OMO-проектов не применяй `non-omo-research`, если не хочешь переопределять OMO по имени: он добавит proxy-версию `context7`, и в зависимости от merge-пути это либо переопределит OMO-native `context7`, либо создаст дублирующую запись с тем же именем. Используй его только для клиентов без OMO-плагина.

## Как использовать вне OMO

Для клиента/проекта без OMO-плагина можно засеять shared research контекст:

```bash
mcpctx non-omo-research /path/to/project
```

Он подключит:

- `context7` → `http://localhost:9090/context7/mcp`
- `shared-grep-app` → `http://localhost:9090/shared-grep-app/mcp`
- `shared-websearch-exa` → `http://localhost:9090/shared-websearch-exa/mcp`
- `semble` → `http://localhost:9090/semble/mcp`

Для `shared-websearch-exa` заполни `EXA_API_KEY` в `~/.config/mcp-proxy/env` и перезапусти proxy.

## Правило имён

Не используй имена OMO built-in серверов `websearch`, `grep_app`, `lsp`, `ast_grep` в rulesync или `mcp-proxy`, если нет явного намерения переопределить OMO. `context7` — исключение: это каноническое имя proxy-эндпоинта и одновременно имя для сознательного OMO override через `mcp.context7`. Shared-варианты остаются только у `shared-grep-app` и `shared-websearch-exa`.
