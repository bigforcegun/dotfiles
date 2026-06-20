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
- креды — **типизированные секрет-рефы** `${env:VAR}` (из env-файла вне репы) или `${keyring:VAR}` (OS keyring). **Голый `${VAR}` НЕ раскрывается** — резолвер требует `${type:name}` (регекс `\$\{type:name\}`).

---

## Раскладка в dotfiles (1-1 в `.config`, как в PLAN)

```
~/.dotfiles/
  .config/mcpproxy/                  → ~/.config/mcpproxy   [linked: вся ПАПКА]
    config.json        (флот + profiles; демон ПЕРЕЗАПИСЫВАЕТ его — см. write-back)
    config.json.bak    (бэкап от демона)
    env                (живой, реальные токены — ДОЛЖЕН быть в .gitignore)
    env.example        (шаблон)
  Library/LaunchAgents/
    com.bigforcegun.mcpproxy.plist   [linked]   (sources env + --config, KeepAlive)
```

- **линкуем папку целиком** (`ln -sfn .config/mcpproxy ~/.config/mcpproxy`), НЕ пофайлово — иначе `rename`-write демона заменяет файл-симлинк реальным файлом, и live отъезжает от репы; директорный линк делает так, что записи демона **приклеиваются в репо** (config.json+api_key, .bak, env). Это осознанный размен: «всё в гит» ценой `api_key`/таймстампов в коммите;
- runtime-state mcpproxy (`~/.mcpproxy/`, `data_dir`) — вне git;
- rulesync направляет каждый проект на свой `/mcp/p/<ctx>` (+ rules/skills/subagents как раньше); project-local мосты остаются direct, мимо гейтвея.

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
mcpd profiles    # curl -s localhost:9090/... — профили и серверы в каждом (endpoint — на пилоте)
mcpd run         # foreground-дебаг мимо launchd (см. ниже)
```

- **`mcpd run`** = `mcpproxy serve --config ~/.config/mcpproxy/config.json --log-level debug` в форграунде — чтобы ловить старт-ошибки и индексацию `retrieve_tools` глазами, а не по логам демона (флаги `serve` сверены: `-c/--config`, `-l/--listen`, `--log-level`);
- глаголы — `systemctl`-стиль: `status/start/stop/restart/reload/logs`, плюс нативные `mcpproxy status|doctor` под `health/doctor`;
- одна функция-диспетчер в `.zsh/mcp.zsh` рядом с `mcpctx`, label/plist/порт — переменными сверху; zsh-комплишен на список глаголов;
- **После правок `mcpproxy` binary/config или OAuth-настроек перезапускать только через `mcpd restart`**; в non-interactive shell: `source ~/.zsh/mcp.zsh && mcpd restart`. Не запускать отдельный `mcpproxy serve`, чтобы не получить второй инстанс/старый binary в launchd;
- на время пилота TBXark-демон рулится своим (старый `mcp-proxy-*`), `mcpd` — только новый инстанс; старое снести на раскатке.

---

## Запуск / пилот

1. `go install github.com/smart-mcp-proxy/mcpproxy-go/cmd/mcpproxy@v0.39.0-rc.9` (бинарь = `cmd/mcpproxy`, корень модуля `main` не содержит; профили только в pre-release `v0.39.0-rc.x`, `@latest=v0.38.1` их НЕ содержит). Реестр — `packages/mac/go.txt`, не `setup_packages_mac`.
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

---

## Статус реализации (факты пилота, v0.39.0-rc.9)

Что фактически собрано и где скелет выше расходится с реальностью.

**Сделано:**
- `mcpproxy` rc.9 в `packages/mac/go.txt`; конфиг+профили в `.config/mcpproxy/{config.json,env.example}`; плист `com.bigforcegun.mcpproxy.plist`; диспетчер `mcpd` в `.zsh/mcp.zsh`; rulesync (4 контекста) → `/mcp/p/<ctx>`.
- **Флот — фактический, не аспирационный.** Скелет рисует corpdev (grafana/kibana/redash/trino/figma/miro) как замысел; реально завели текущий флот: `semble, playwright, context7, grep-app, websearch-exa, salotech-{slack,atlassian,freshdesk,mongodb-sisa}, godot`.
- **Профили:** `corpodev`, `code-research`, `dev`, `gamedev` (имена как в rulesync-контекстах, не `corpdev/research`).

**Раскладка по портам (текущая, не как в скелете):**
- **:9091** — mcpproxy-go под launchd = **активная система**;
- **:9090** — старый TBXark `mcp-proxy` = бэкап, `bootout`+`disable` (выключен, не стартует при логине).

**Реальные MCP-эндпоинты** (захардкожены, глобально на инстанс): `/mcp` (дефолт), `/mcp/call` (focused: `retrieve_tools`+`call_tool_*`), `/mcp/all` (direct, `server__tool`), `/mcp/code` (JS), **`/mcp/p/<slug>`** (профиль). Зарезервированные слаги: `all/call/code/livez/readyz/...`.

**⚠️ Write-back — открытый вопрос (отложено).** `mcpproxy serve` **перезаписывает `--config` на каждом старте**: инжектит сгенерённый `api_key`, `created/updated`-таймстампы на все серверы, нормализует дефолты (`docker_isolation`/`registries`/…), плюс плодит `config.json.bak`. `read_only_mode` это **не** глушит (проверено: даже с заданным `MCPPROXY_API_KEY` файл меняется каждый старт). Апстрим-issue на это нет.
- **Следствие:** пофайловый симлинк git→live **отваливается** — `rename`-write демона заменяет файл-симлинк реальным файлом, live отъезжает от репы.
- **Выбрано (текущее):** **директорный симлинк** `~/.config/mcpproxy → репо` — записи демона приклеиваются в репу (см. «Раскладку»). Размен: в коммит уходят `api_key`, таймстампы, `.bak`. Минимум — `.gitignore` на `.config/mcpproxy/env` (живые токены). Занесено в `setup_user_mac` + `packages/mac/go.txt`.
- **Альтернатива (вариант A, если надоест мусор):** git = шаблон, live = копия в `~/.mcpproxy/mcp_config.json`, демон владеет копией, правка → `mcpd reload` (copy+restart).
