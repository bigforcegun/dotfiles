# MCP Stack — план 2: mcpproxy-go + профили

Рантайм-слой на **[mcpproxy-go](https://github.com/smart-mcp-proxy/mcpproxy-go)** с **профилями на контекст**. Один Go-бинарь, один конфиг в git, агенту отдаётся `retrieve_tools` (подгрузка тулов по запросу) вместо всех схем сразу.

Зачем: corpdev-флот (kibana/grafana/figma/miro/redash/trino) — любой может понадобиться в ресёрче, пред-резать нельзя, а грузить все схемы = пиздец по контексту. tool-search решает это рантаймом.

---

## Как устроено

- **один инстанс** `mcpproxy-go --config ~/.config/mcpproxy/config.json` на `:9090`;
- весь флот описан в `mcpServers[]` (stdio + HTTP);
- **профили** (`profiles[]`, Spec 057) — именованные view над подмножеством флота, каждый адресуется `/mcp/p/<name>`;
- агент коннектится к `/mcp/p/<ctx>`, видит `retrieve_tools`, ищет и подтягивает нужное по запросу;
- работает для любого агента (OpenCode/Cursor/Codex/Kilo) — паттерн model-driven, клиенту ничего уметь не надо.

**Дата-пас:** `агент → /mcp/p/<ctx> (retrieve_tools) → mcpproxy-go → stdio/HTTP-сервер`.

---

## config.json (скелет)

```jsonc
{
  "listen": ":9090",
  "quarantine_enabled": false,     // файловые серверы — trusted, без ручного approve
  "read_only_mode": false,
  "allow_server_add": false,       // UI/AI не мутируют конфиг → файл = источник правды
  "allow_server_remove": false,

  "mcpServers": [
    // corpdev (HTTP, shared)
    { "name": "grafana", "protocol": "http", "url": "https://grafana.corp/mcp",
      "headers": { "Authorization": "Bearer ${GRAFANA_TOKEN}" },
      "shared": true, "enabled": true, "quarantined": false,
      "disabled_tools": ["delete_dashboard"] },
    { "name": "kibana",  "protocol": "http", "url": "https://kibana.corp/mcp",  "shared": true, "enabled": true, "quarantined": false },
    { "name": "redash",  "protocol": "http", "url": "https://redash.corp/mcp",  "shared": true, "enabled": true, "quarantined": false },
    { "name": "trino",   "protocol": "http", "url": "https://trino.corp/mcp",   "shared": true, "enabled": true, "quarantined": false },
    { "name": "figma",   "protocol": "http", "url": "https://...", "enabled": true, "quarantined": false },
    { "name": "miro",    "protocol": "http", "url": "https://...", "enabled": true, "quarantined": false },

    // personal/dev
    { "name": "github",  "protocol": "stdio", "command": "...", "enabled": true, "quarantined": false },
    { "name": "context7","protocol": "stdio", "command": "...", "enabled": true, "quarantined": false }
    // ... lsp/filesystem/godot/websearch/fetch/grep_app
  ],

  "profiles": [
    { "name": "corpdev",  "servers": ["kibana","grafana","figma","miro","redash","trino","context7"] },
    { "name": "research", "servers": ["websearch","fetch","grep_app","context7"] },
    { "name": "dev",      "servers": ["github","lsp","filesystem","context7"] },
    { "name": "gamedev",  "servers": ["github","lsp","filesystem","context7","godot"] }
  ]
}
```

Ключевые поля (проверено по исходникам):
- `quarantine_enabled:false` + per-server `quarantined:false` — файловые серверы исполняются сразу, без ручного approve (авто-карантин бьёт только по серверам, добавленным через тул `upstream_servers`/REST, не из файла);
- `allow_server_add/remove:false` (+ `read_only_mode`) — UI/AI не правят состояние, **config.json авторитетен**;
- `enabled_tools`/`disabled_tools` per-server — точечный tool-фильтр (== старый `toolFilter`);
- `shared:true` — server-edition «shared» (для corpdev HTTP);
- креды — `${ENV}` из env-файла вне репы.

---

## Раскладка в dotfiles (1-1 в `.config`, как в PLAN)

```
~/.dotfiles/
  .config/mcpproxy/
    config.json          → ~/.config/mcpproxy/config.json   [linked]   (флот + profiles + ${ENV})
    env.example          (committed, НЕ linked)
  Library/LaunchAgents/
    com.bigforcegun.mcpproxy.plist   [linked]   (sources env + --config, KeepAlive)
```

- линкуем `config.json` пофайлово (не директорию) — `env` и data-dir не утекают симлинком в репу;
- runtime-state mcpproxy (`~/.mcpproxy/`) — вне git, авторитет — `config.json`;
- rulesync направляет каждый проект на свой `/mcp/p/<ctx>` (+ rules/skills/subagents как раньше); project-local мосты остаются direct, мимо гейтвея.

---

## Запуск / пилот

1. `go install github.com/smart-mcp-proxy/mcpproxy-go@latest` (+ в `setup_packages_mac`).
2. Залить `config.json` с профилем `corpdev` (HTTP shared) + env с токенами.
3. Поднять демон (`:9090`), проверить `/mcp/p/corpdev`.
4. rulesync → corpdev-контекст на `/mcp/p/corpdev`.
5. Ресёрч-сценарий: в окне только `retrieve_tools`, нужные тулы подтягиваются по запросу.

Проверить на пилоте:
- **#2** OpenCode реально водит search→call (не галлюцинирует имена тулов);
- **#5** `retrieve_tools` на `/mcp/p/corpdev` индексит **только** серверы профиля, а не весь флот;
- токены/UX vs статическая загрузка всех 6 серверов.

Зайдёт — добавить профили research/dev/gamedev в тот же инстанс и заменить TBXark. corpdev опционально вынести в отдельный инстанс, если корп-креды нужны в отдельном secret/failure-домене.

---

## Почему гейтвей, а не per-agent плагин/натив

Альтернатива гейтвею — решать bloat в каждом агенте отдельно. Не подходит, потому что corpdev-флот живёт во **всех четырёх** агентах, а нативного tool-search у них нет поровну:

| Агент | Нативный tool-search | Вывод |
|---|---|---|
| Claude Code | ✅ встроен, авто | сам справится |
| OpenCode | ❌ ядро; есть плагин [#12520](https://github.com/anomalyco/opencode/pull/12520) | плагин, но OpenCode-only |
| Cursor | ❌ нет | **нужен гейтвей** |
| Codex | ⚠️ модель умеет, CLI-MCP сырой ([#14507](https://github.com/openai/codex/issues/14507), [#19486](https://github.com/openai/codex/issues/19486)) | **гейтвей / ждать CLI** |

- плагин `opencode-mcp-tool-search` — OpenCode-only, в Cursor/Codex не ставится → одним плагином не обойтись;
- гибрид (CC+OpenCode на нативе, Cursor+Codex на гейтвее) = **тот же флот описан в двух местах**, двойная бухгалтерия → хуже;
- гейтвей на всех = один конфиг, единообразно, Cursor+Codex закрыты. Claude Code за гейтвеем видит `retrieve_tools` (его натив-search становится не нужен, но не мешает).

**Запасной выход:** если из corpdev уйдут Cursor+Codex — гейтвей можно снять и вернуться на натив (CC) + плагин (OpenCode), вернув C2.

---

## Размен против PLAN

Берём: подгрузку по запросу (главное), tool-search для всех агентов, остаёмся в Go + файловом конфиге. F2 (профили), F5 (`enabled/disabled_tools`), F6 — на месте.

Отдаём ровно одно: **C2** — агент видит `/mcp/p/<ctx>`, а не per-server native-записи. Эндпоинт честный (не скрытый враппер), но per-server видимость в агентском конфиге уходит.
