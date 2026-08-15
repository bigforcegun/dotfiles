# MCP Stack — план 2: mcpproxy-go + профили

Рантайм-слой на **[mcpproxy-go](https://github.com/smart-mcp-proxy/mcpproxy-go)** с **профилями на контекст**. Один Go-бинарь, один конфиг в git, агенту отдаётся `retrieve_tools` (подгрузка тулов по запросу) вместо всех схем сразу.

Зачем: corpdev-флот (kibana/grafana/figma/miro/redash/trino) — любой может понадобиться в ресёрче, пред-резать нельзя, а грузить все схемы = пиздец по контексту. tool-search решает это рантаймом.

---

## Как устроено

- **один инстанс** `mcpproxy-go` на `127.0.0.1:9091`, под launchd label `com.bigforcegun.mcpproxy`;
- live-конфиг: `~/.mcpproxy/mcp_config.json`, данные/перезаписываемое состояние: `~/.mcpproxy-data`;
- весь флот описан в `mcpServers[]` (stdio + HTTP);
- **профили** (`profiles[]`, Spec 057) — именованные view над подмножеством флота, каждый адресуется `/mcp/p/<name>`;
- агент коннектится к `/mcp/p/<ctx>`, видит `retrieve_tools`, ищет и подтягивает нужное по запросу;
- работает для любого агента (OpenCode/Cursor/Codex/Kilo) — паттерн model-driven, клиенту ничего уметь не надо.

**Дата-пас:** `агент → /mcp/p/<ctx> (retrieve_tools) → mcpproxy-go → stdio/HTTP-сервер`.

---

## mcp_config.json (скелет)

```jsonc
{
  "listen": "127.0.0.1:9091",
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
    { "name": "salotech", "servers": ["playwright","salotech-slack","salotech-atlassian","salotech-freshdesk","salotech-mongodb-sisa","semble","context7"] },
    { "name": "dev",      "servers": ["context7","grep-app","semble"] },
    { "name": "gamedev",  "servers": ["krita","godot","semble","context7"] }
  ]
}
```

Ключевые поля (проверено по исходникам):
- `quarantine_enabled:false` + per-server `quarantined:false` — файловые серверы исполняются сразу, без ручного approve (авто-карантин бьёт только по серверам, добавленным через тул `upstream_servers`/REST, не из файла);
- `allow_server_add/remove:false` (+ `read_only_mode`) — UI/AI не правят состояние, **mcp_config.json авторитетен**;
- `enabled_tools`/`disabled_tools` per-server — точечный tool-фильтр (== старый `toolFilter`);
- `shared:true` — server-edition «shared» (для corpdev HTTP);
- креды — **типизированные секрет-рефы** `${env:VAR}` (из env-файла вне репы) или `${keyring:VAR}` (OS keyring). **Голый `${VAR}` НЕ раскрывается** — резолвер требует `${type:name}` (регекс `\$\{type:name\}`).

---

## Раскладка в dotfiles (текущая)

```
~/.dotfiles/
  .mcpproxy/                         → ~/.mcpproxy          [linked: вся ПАПКА]
    mcp_config.json    (флот + profiles; демон ПЕРЕЗАПИСЫВАЕТ его — см. write-back)
    env                (живой, реальные токены — локальный файл, сейчас не tracked)
  .config/rulesync/
    README.md
    contexts/                         → ~/.config/rulesync/contexts [linked: вся ПАПКА]
      dev/.rulesync/mcp.json          → http://localhost:9091/mcp/p/dev
      gamedev/.rulesync/mcp.json      → http://localhost:9091/mcp/p/gamedev
      salotech/.rulesync/mcp.json     → http://localhost:9091/mcp/p/salotech
  Library/LaunchAgents/
    com.bigforcegun.mcpproxy.plist   [linked]   (sources ~/.mcpproxy/env, KeepAlive)
  bin/
    mcpd                             (daemon dispatcher)
    mcpctx                           (rulesync dispatcher)
```

- **линкуем папку `.mcpproxy` целиком**, НЕ пофайлово — иначе `rename`-write демона заменяет файл-симлинк реальным файлом, и live отъезжает от репы;
- `data_dir` сейчас `/Users/bigforcegun/.mcpproxy-data`; `mcpd ps` читает его copy config, если он есть;
- rulesync направляет каждый проект на один профильный endpoint `/mcp/p/<ctx>` (+ rules/skills/subagents как раньше); project-local мосты остаются direct, мимо гейтвея.

---

## CLI-управление демоном и дебаг (единый диспетчер)

Демон под launchd, но рулим из терминала **одной командой с глаголом** — как `systemctl --user <verb>`, а не россыпью `mcp-proxy-restart`/`-stop`/`-log`. Враппер `mcpd <verb>` поверх `launchctl` (macOS) под label `com.bigforcegun.mcpproxy`:

```bash
mcpd status      # launchctl print gui/$UID/<label> | grep -E 'state|pid'   — состояние job'ы
mcpd start       # launchctl bootstrap gui/$UID <plist>
mcpd stop        # launchctl bootout   gui/$UID/<label>
mcpd restart     # launchctl kickstart -k gui/$UID/<label>
mcpd reload      # bootout + bootstrap — подхватить правки plist
mcpd logs [-f]   # tail [-f] /tmp/com.bigforcegun.mcpproxy.{out,err}.log
mcpd health      # mcpproxy status   (нативный self-check демона: API key, Web UI URL)
mcpd doctor      # mcpproxy doctor    (нативные health-checks)
mcpd profiles    # профили и серверы из ~/.mcpproxy/mcp_config.json
mcpd ps          # RSS/CPU дерева mcpproxy и stdio upstream-процессов
mcpd run         # foreground-дебаг мимо launchd (см. ниже)
```

- **`mcpd run`** = `mcpproxy serve --log-level debug` в форграунде с дефолтным config discovery (`~/.mcpproxy/mcp_config.json`) — чтобы ловить старт-ошибки и индексацию `retrieve_tools` глазами, а не по логам демона;
- глаголы — `systemctl`-стиль: `status/start/stop/restart/reload/logs`, плюс нативные `mcpproxy status|doctor` под `health/doctor`;
- диспетчер живёт в `bin/mcpd`; список глаголов отдаёт `mcpd complete-verbs`;
- **После правок `mcpproxy` binary/config или OAuth-настроек перезапускать только через `mcpd restart`**. Не запускать отдельный `mcpproxy serve`, чтобы не получить второй инстанс/старый binary в launchd;
- на время пилота TBXark-демон рулится своим (старый `mcp-proxy-*`), `mcpd` — только новый инстанс; старое снести на раскатке.

---

## Запуск / пилот

1. `go install github.com/smart-mcp-proxy/mcpproxy-go/cmd/mcpproxy@v0.39.0-rc.9` (бинарь = `cmd/mcpproxy`, корень модуля `main` не содержит; профили только в pre-release `v0.39.0-rc.x`, `@latest=v0.38.1` их НЕ содержит). Реестр — `packages/mac/go.txt`, не `setup_packages_mac`.
2. Live-конфиг: `.mcpproxy/mcp_config.json`; env сорсится из `~/.mcpproxy/env`.
3. Активный демон слушает `127.0.0.1:9091`; health: `mcpd health`, профили: `mcpd profiles`, процессы: `mcpd ps`.
4. rulesync-контексты `dev`, `gamedev`, `salotech` указывают на `/mcp/p/<ctx>`.
5. Ресёрч-сценарий: в окне только `retrieve_tools`, нужные тулы подтягиваются по запросу.

Проверить/держать под наблюдением на пилоте:
- OpenCode реально водит search→call (не галлюцинирует имена тулов);
- `retrieve_tools` на `/mcp/p/<ctx>` индексит **только** серверы профиля, а не весь флот;
- токены/UX vs статическая загрузка серверов;
- достаточно ли профиля `salotech`, или нужен отдельный corp/secret/failure-домен.

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

---

## Статус реализации (факты пилота, v0.39.0-rc.9)

Что фактически собрано и где скелет выше расходится с реальностью.

**Сделано:**
- `mcpproxy` rc.9 в `packages/mac/go.txt`; конфиг+профили в `.mcpproxy/mcp_config.json`; плист `com.bigforcegun.mcpproxy.plist`; диспетчеры `bin/mcpd` и `bin/mcpctx`; rulesync (3 контекста) → `/mcp/p/<ctx>`.
- **Флот — фактический, не аспирационный.** Скелет рисует corpdev (grafana/kibana/redash/trino/figma/miro) как замысел; реально заведён текущий флот: `semble, playwright, context7, grep-app, websearch-exa, krita, godot, salotech-{slack,atlassian,freshdesk,mongodb-sisa}`.
- **Профили:** `salotech`, `dev`, `gamedev`.
- **rulesync-контексты:** `dev`, `gamedev`, `salotech`; каждый генерит один HTTP MCP `mcpproxy-<ctx>` на `http://localhost:9091/mcp/p/<ctx>`.

**Раскладка по портам (текущая, не как в скелете):**
- **:9091** — mcpproxy-go под launchd = **активная система**;
- **:9090** — старый TBXark `mcp-proxy` = бэкап, `bootout`+`disable` (выключен, не стартует при логине).

**Реальные MCP-эндпоинты** (захардкожены, глобально на инстанс): `/mcp` (дефолт), `/mcp/call` (focused: `retrieve_tools`+`call_tool_*`), `/mcp/all` (direct, `server__tool`), `/mcp/code` (JS), **`/mcp/p/<slug>`** (профиль). Зарезервированные слаги: `all/call/code/livez/readyz/...`.

**⚠️ Write-back — открытый вопрос (отложено).** `mcpproxy serve` **перезаписывает `--config` на каждом старте**: инжектит сгенерённый `api_key`, `created/updated`-таймстампы на все серверы, нормализует дефолты (`docker_isolation`/`registries`/…), плюс может плодить backup-файлы рядом с live-конфигом. `read_only_mode` это **не** глушит (проверено: даже с заданным `MCPPROXY_API_KEY` файл меняется каждый старт). Апстрим-issue на это нет.
- **Следствие:** пофайловый симлинк git→live **отваливается** — `rename`-write демона заменяет файл-симлинк реальным файлом, live отъезжает от репы.
- **Выбрано (текущее):** **директорный симлинк** `~/.mcpproxy → репо/.mcpproxy` — записи демона приклеиваются в репу (см. «Раскладку»). Размен: в коммит могут уйти `api_key`, таймстампы, `.bak` и живой `env`, если не держать их в ignore/вне stage. Занесено в `setup_user_mac` + `packages/mac/go.txt`.
- **Альтернатива (вариант A, если надоест мусор):** git = шаблон, live = копия в `~/.mcpproxy/mcp_config.json`, демон владеет копией, правка → `mcpd reload` (copy+restart).
