# MCP Stack — план

Своя система хранения и раздачи MCP-конфигов (+ rules/skills) по агентам и проектам.
Источник правды — файлы в dotfiles, мапятся 1-1 в `~/.config`. Без скрытых прослоек, без резидентного Node.

---

## Цель

Единая система, в которой:

- **весь общий MCP-флот живёт в одном месте** (mcp-proxy), один процесс на сервер, без утечек;
- агенты (Claude Code, Cursor, Codex, OpenCode, Kilo) получают **native-конфиги** per-project из одного источника;
- включение/исключение серверов по проекту — быстро, без ручного редактирования N агентских файлов;
- всё в git, всё видимое (никаких враппер-роутеров, прячущих прокси).

---

## Предпосылки (контекст и боли)

- **Мультиагентность.** Реально используются Claude Code, Cursor, Codex, OpenCode, Kilo. У каждого свой формат и место проектного MCP-конфига.
- **Боль 1 — include.** Чтобы добавить MCP в проект, приходится руками вписывать в каждый агентский файл.
- **Боль 2 — exclude.** Убрать MCP из проекта — ещё хуже, выковыривать из нескольких файлов.
- **Боль 3 — утечка процессов.** stdio MCP-серверы спавнятся как дети каждого агента; агенты не убивают их за собой → копятся висящие процессы (`N агентов × M серверов`).
- **Боль 4 — скрытые прослойки.** Менеджеры вроде mcpm выглядят как «менеджер конфигов», а на деле вписывают враппер `mcpm run` и поднимают свой прокси-процесс. Это вскрылось только при чтении исходников.
- **Нелюбовь к Node-резиденту.** Node прожорлив; держать постоянный Node-демон не хочется. Go-демон или CLI-по-запросу — ок.
- **Природа проектов.** Много **project-local** MCP (HTTP-мосты, поднимаемые самим проектом, напр. `controolloop-mcp-bridge` на `:8400`, `debugmcp` на `:3001`) — их централизовать нельзя/незачем.
- **Конвенция dotfiles.** Конфиги лежат в репе и мапятся 1-1 в `~/.config` через `link` в `setup_user_mac`; launchd-плисты — в `Library/LaunchAgents/` + `launchctl load -w`; brew-пакеты — списком в `packages/mac/*.txt`.

---

## Требования

### Функциональные
- **F1.** Мультиагент: Claude Code, Cursor, Codex, OpenCode, Kilo (+ задел).
- **F2.** Per-project: включать/исключать серверы по проекту. **Жёсткое.**
- **F3.** Project-local MCP (HTTP-мосты, lifecycle проекта) остаются **direct/native**, не через гейтвей.
- **F4.** Переиспользуемый флот определяется один раз, переиспользуется в проектах.
- **F5.** Tool-level фильтр — резать отдельные тулзы внутри сервера (напр. `delete_repo`).
- **F6.** Процессы: один общий инстанс на сервер, без утечек/сирот.
- **F7.** Заодно унифицировать rules / skills / instructions между агентами.
- **F12.** Сидинг контекста в репу — **без `cp`** (source остаётся в dotfiles, через `--input-root`).
- **F13.** corpdev — курируется напрямую как отдельный список (без механизма override).

### Ограничения
- **C1.** IaC: источник правды — файлы в git (dotfiles + per-repo).
- **C2.** Native/видимые конфиги: никаких скрытых прокси-врапперов.
- **C3.** Без Node-резидента: рантайм лёгкий (Go). Node-CLI по запросу — ок.
- **C4.** Unix-way: однозадачные тулы, плоский текстовый конфиг, композиция.
- **C5.** Минимум ручной правки N агентских файлов.
- **C6.** Дисциплина: агента не запускаем в необъявленной папке; у каждого контекста — свой `.rulesync/`.

### Принятые размены
- **T1.** Смена членства = правка источника + `mcpctx <ctx>` (локально, **не** central-live, как у 1mcp-пресетов). Цена за C2 + C3.
- **T2.** Reuse флота между проектами — через `--input-root` (source в dotfiles), не нативные пресеты.

### Похоронено (сознательно отвергнуто)
Системный/global агент-MCP-слой; mcpm-роутер; mcpstack-композер с каскадом `extends`/override; 1mcp-пресеты; cp-сидинг; плоские шаблоны через копирование.

---

## Архитектура (locked)

Три однозадачные части:

1. **mcp-proxy** (Go-демон, launchd `KeepAlive`) — рантайм **всего общего флота**. Один процесс на сервер (без утечки), `toolFilter`, отдаёт каждый сервер по своему URL `http://localhost:9090/<name>/{sse|mcp}`. `--expand-env` подставляет секреты из env.
2. **rulesync** (Node-CLI, по запросу) — генерит **native** per-project конфиги во все агенты из единого `.rulesync/` источника. `--input-root` читает source из dotfiles, `--output-roots` пишет в репу. Не затирает неуправляемые записи (project-local мосты переживают регенерацию).
3. **Контексты** — несколько плоских `.rulesync/` в dotfiles, каждый самодостаточный. Серверы внутри ссылаются на proxy-URL'ы. Наследования между контекстами нет (плоско и явно).

**Дата-пас:** `агент → http://localhost:9090/<name> → mcp-proxy → stdio-сервер`. mcpm/1mcp в пути нет.

> Машинно-глобального агент-видимого MCP **нет**. «Системный» уровень растворился в инфре (proxy + библиотека скиллов), это плумбинг, а не скоуп.

---

## Раскладка в dotfiles (всё 1-1 в `.config`)

```
~/.dotfiles/
  .config/
    mcp-proxy/
      config.json            → ~/.config/mcp-proxy/config.json   (флот + toolFilter + ${ENV})  [linked]
      env.example            (шаблон секретов; committed, НЕ linked)
    rulesync/
      contexts/
        research/.rulesync/  → ~/.config/rulesync/contexts/research/.rulesync/   [linked, вся contexts/]
        dev/.rulesync/
        gamedev/.rulesync/
        corpdev/.rulesync/
  Library/LaunchAgents/
    com.bigforcegun.mcp-proxy.plist  → ~/Library/LaunchAgents/...  [linked]
  .zsh/
    mcp.zsh                  (функция mcpctx; .zsh уже linked)
```

**Важно:** линкуем `config.json` отдельным файлом (как `opencode.json`), а **не** всю `.config/mcp-proxy/` — иначе `env` стал бы симлинком в репу. Реальный `~/.config/mcp-proxy/env` живёт вне git.

---

## Env / секреты

mcp-proxy нативного config-дома не имеет: только `--config <path|url>` (дефолт `./config.json` в cwd) и `--expand-env` (по умолчанию on, раскрывает `${VAR}`).

Подход — **файлом**:
- `~/.config/mcp-proxy/env` — реальный файл, вне репы:
  ```
  GITHUB_TOKEN=ghp_xxx
  OPENAI_API_KEY=sk-xxx
  ```
- `config.json` (в репе) ссылается на `${GITHUB_TOKEN}` и т.д.
- launchd-плист сорсит env и запускает прокси:
  ```
  ProgramArguments:
    /bin/zsh
    -lc
    set -a; . ~/.config/mcp-proxy/env; exec mcp-proxy --config ~/.config/mcp-proxy/config.json
  ```
- Перезапуск после правки: `launchctl kickstart -k gui/$(id -u)/com.bigforcegun.mcp-proxy`.

IaC ✓ (config в git), секреты не в репе ✓.

---

## Зависимости (brew + хвост)

- `nodejs`, `npm` — уже в `packages/mac/dev.txt`.
- **+`go`** в `packages/mac/dev.txt` (сборка прокси).
- В `setup_packages_mac` хвостом:
  ```bash
  ## MCP Stack tools
  go install github.com/TBXark/mcp-proxy@latest
  npm i -g rulesync
  ```
  (если найдётся brew-tap для mcp-proxy — переключим; в core его нет.)

---

## Методология (дисциплина «что когда»)

- **Правило входа:** агента запускаешь только в объявленном контексте (воркспейс или засеянная репа).
- **На входе / после правок:** `mcpctx <ctx>` (можно пачкой: `mcpctx dev repoA,repoB`).
- **Новый общий сервер:** добавил в `~/.config/mcp-proxy/config.json` → перезапуск демона → сослался URL'ом из контекстов.
- **Repo-local сервер:** один раз руками в `.mcp.json` репы (preserved при регенерации).
- **Сменить набор тулов контекста:** правишь `contexts/<ctx>/.rulesync/` в dotfiles → `mcpctx` в нужных репах.
- **Выбор proxy-слоя:** см. матрицу `docs/mcp-stack/OMO.md`. В OMO-проектах built-in MCP (`websearch`, `context7`, `grep_app`, `lsp`, `ast_grep`) остаются OMO-native; для non-OMO клиентов `context7` идёт как canonical proxy endpoint, а `websearch`/`grep_app` заведены отдельно как `shared-*`.

Алиас (`~/.dotfiles/.zsh/mcp.zsh`):
```bash
mcpctx() { rulesync generate --input-root ~/.config/rulesync/contexts/"$1" --output-roots "${2:-.}" --targets "*" --features "*"; }
```

---

## Контексты и корневые папки

Стартовые контексты:
- **research** — web/fetch + code-search + readonly-fs (общий ресёрч).
- **dev** — git/github/lsp/filesystem + `context7`.
- **gamedev** — dev + godot.
- **corpdev** — урезанный безопасный набор, курируется напрямую.
- **non-omo-research** — shared research MCP через `mcp-proxy` для клиентов без OMO-плагина; в OMO-проекты не применять, чтобы не плодить функциональные дубли.

Корневые папки общих агентов (засеваются раз):
```
~/work/research → mcpctx research
~/work/scratch  → mcpctx dev
```
Заходишь в папку — агент уже с нужным срезом флота из прокси.

---

## Порядок сборки

**Файлы:**
1. `.config/mcp-proxy/config.json` (флот + toolFilter + `${ENV}`).
2. `.config/mcp-proxy/env.example`.
3. `Library/LaunchAgents/com.bigforcegun.mcp-proxy.plist` (sources env + `--config`).
4. `.config/rulesync/contexts/gamedev/.rulesync/` (ссылки на прокси) — первым, для пилота.
5. `.zsh/mcp.zsh` (mcpctx).

**Скрипты:**
6. `packages/mac/dev.txt`: +`go`.
7. `setup_packages_mac`: +`go install mcp-proxy`, +`npm i -g rulesync`.
8. `setup_user_mac`: секция MCP — `link` config.json / contexts / плист + `launchctl load -w`.

**Разовый шаг:**
9. `cp .config/mcp-proxy/env.example ~/.config/mcp-proxy/env` + заполнить токены.

**Запуск / пилот:**
10. `setup_packages_mac` → `setup_user_mac` → демон up, проверить `:9090/<name>/sse`.
11. Пилот: `controolloop` → `mcpctx gamedev` (godot через прокси, мосты direct), diff с текущими `.mcp.json`/`.cursor/mcp.json`/`kilo.json`.

---

## Отложено / открытые вопросы

- **Granularity per-project:** пока «сервер вкл/выкл». Если понадобится «у сервера в проекте только read-тулзы» — поднять в proxy два варианта сервера (full / ro с `toolFilter`).
- **Codex + remote HTTP:** проверить, что версия Codex принимает remote-URL в `mcp_servers` (иначе для него — stdio/локально, через `targets` в rulesync исключить из remote).
- **Repo-local merge:** подтверждено — rulesync не затирает неуправляемые записи (мост дописывается руками один раз).
- **Live-обновление членства:** сознательно отдано (T1). Если когда-нибудь критично — это путь к 1mcp-пресетам (ценой Node-демона).
