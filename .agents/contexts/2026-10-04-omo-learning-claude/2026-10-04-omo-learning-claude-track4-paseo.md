---
updated: 2026-10-04
---

# Трек 4: Оркестрация OMO через Paseo

## 1. Загружается ли OMO, когда Paseo запускает OpenCode-агента

**Ответ: да, OMO загружается, и его агенты видны Paseo как выбираемые режимы.**

Доказательства:

- `paseo provider ls` (команда реально запускалась) показывает провайдера `opencode` со списком режимов:
  ```
  opencode   OpenCode   available   Enabled   default   Atlas - Plan Executor, Hephaestus - Deep Agent, Prometheus - Plan Builder, Sisyphus - ultraworker
  ```
  Это точные имена агентов OMO (Atlas/Hephaestus/Prometheus/Sisyphus) — то есть Paseo не просто запускает голый `opencode`, а видит режимы, которые регистрирует именно OMO.
- `daemon.log` (`~/.paseo/daemon.log`, пример строки с `"module":"provider-snapshot-manager"`) содержит записи `"msg":"OpenCode server generation started"` / `"...exited"` с `pid`, `port`, `url` вида `http://127.0.0.1:<port>`. Это значит Paseo поднимает полноценный HTTP-сервер `opencode` (а не одноразовый дочерний процесс на промпт) и обращается к нему по API. Сервер поднимается в рабочей директории агента — то есть с тем же `opencode.json` проекта, что и при обычном интерактивном запуске.
- Пример `opencode.json` пользователя (`~/.dotfiles/.config/opencode/opencode.json`) содержит:
  ```json
  "plugin": ["oh-my-openagent@5.1.13", "@slkiser/opencode-quota@4.10.7", ...]
  ```
  Загрузка плагинов OpenCode (включая OMO) идёт через стандартный механизм `opencode.json → plugin[]`, который не зависит от того, кто запустил `opencode` — интерактивный пользователь или Paseo. Раз Paseo запускает настоящий `opencode`-сервер в директории проекта, тот же `opencode.json` подхватывается, и OMO регистрирует свои режимы/агентов как обычно.
- Независимое веб-исследование (см. ниже, источник `docs/providers.md` в репозитории Paseo) подтверждает: Paseo для OpenCode v2 внедряет собственный MCP/tool-bridge через `OPENCODE_CONFIG_CONTENT`, но это касается *добавочного* моста инструментов Paseo, а не замены пользовательского `opencode.json`. Прямого документального подтверждения «plugin[] гарантированно не трогается» не нашлось — степень доверия: наблюдение (провайдер-лист показывает режимы OMO) сильнее, чем документация (которая не специфична).

**Какие агенты OMO выбираемы как «mode» при запуске через Paseo:** Atlas (Plan Executor), Hephaestus (Deep Agent), Prometheus (Plan Builder), Sisyphus (ultraworker) — это ровно те `modeId`, которые Paseo подставит в `settings.modeId` при `create_agent`/`paseo run --provider opencode --mode <id>`.

**Точный механизм регистрации (уточнено делегированным суб-агентом, по его прямым цитатам из `dist/`):**

- `dist/index.d.ts`: `import type { PluginModule } from "@opencode-ai/plugin"; export declare const omoPlugin: ...Plugin; export default pluginModule;` — OMO экспортирует ровно то, что ожидает контракт плагина OpenCode (`@opencode-ai/plugin`).
- `dist/index.js:186919` — `function createPluginModule(overrides = {}) {...}`, строящая `serverPlugin`-функцию с сигнатурой `(input, options) => {...}` — это стандартный OpenCode plugin-hook.
- `dist/index.js:187088-187092` (конец бандла, из `packages/omo-opencode/src/index.ts`):
  ```js
  var pluginModule = createPluginModule();
  var omoPlugin = pluginModule.server;
  var src_default = pluginModule;
  export { src_default as default, omoPlugin };
  ```
- Сами 4 режима и их описания — `dist/tui.js:4992-4995` (отображаемые имена: `sisyphus: "Sisyphus - ultraworker"`, `hephaestus: "Hephaestus - Deep Agent"`, `prometheus: "Prometheus - Plan Builder"`, `atlas: "Atlas - Plan Executor"`) плюс схемы `BuiltinAgentNameSchema`/`OverridableAgentNameSchema` (~`dist/tui.js:71872-71911`) — формально зарегистрированные, переопределяемые пользователем имена агентов. Prometheus явно задаёт `mode: "primary"` (замена Plan-режима OpenCode) — `dist/index.js:165223`.
- Это же подтверждается headless CLI: `dist/cli/index.js:110528-110555` — `oh-my-opencode run --agent <name>`, где help-текст перечисляет «Available core agents: Sisyphus, Hephaestus, Prometheus, Atlas», с fallback на Sisyphus.

Степень доверия: цитаты файл:строка получены не мной напрямую, а делегированным суб-агентом (`general-purpose`, который сам использовал вложенный суб-агент для части цитат по ultrawork/teammode — отмечено в его отчёте как «subagent-verified, not independently re-checked line-by-line»). Независимо мной проверено: `paseo provider ls` (совпадающие названия режимов) и README.ru.md:71-75 (ultrawork/mass ulw). Расхождений между источниками не найдено.

## 2. Разделение ролей: кто оркестрирует что

Модель, которая следует из устройства обоих инструментов:

| Уровень | Инструмент | Что держит | Доказательство |
|---|---|---|---|
| Внешний (между агентами/провайдерами/машинами) | **Paseo** | воркспейсы/worktree-изоляция, параллельность между независимыми агентами, межпровайдерная маршрутизация (`claude`, `codex`, `opencode`, `kimi`...), heartbeats, schedules, права/permission-промпты, бюджет и наблюдение за живыми агентами | `paseo --help`: команды `workspace`, `agent`, `provider`, `heartbeat`, `schedule`, `permit`; `paseo provider ls` показывает 8 разных провайдеров одновременно |
| Внутренний (внутри одной сессии) | **OMO/Sisyphus** | декомпозиция одной задачи на подагентов внутри одного `opencode`-процесса, `ultrawork`/`mass ulw` (параллельный граф агентов), фоновые задачи («child sessions»), team-режим | README.ru.md:71,75 («ultrawork»/«mass ulw» → «граф агентов»); `packages/omo-codex/plugin/components/teammode/skills/teammode/SKILL.md` — «a named team of cooperating Codex workers under one leader, with durable state on disk» (`.omo/teams/{session_id}/team.json`), транспорт — «MultiAgentV2 (flat spawn_agent with task_name)» или «Codex App threads» |

**Уточнение по tmux (важная поправка):** tmux в OMO — это **не** транспорт координации, а только визуальный layout-бэкенд для отображения панелей параллельных агентов (`dist/shared/tmux/types.d.ts`, `dist/features/team-mode/team-layout-tmux/layout.d.ts`, реэкспорты из `@oh-my-opencode/tmux-core`/`@oh-my-opencode/team-core`). Реальная координация team-режима идёт через `MultiAgentV2`/Codex App threads, а не через tmux-сессии. Источник: отчёт делегированного суб-агента, независимо не перепроверено построчно.

Веб-источник (paseo.sh/docs/orchestration, см. ниже) прямо формулирует позиционирование: Paseo — «not a hosted agent... runs the CLIs you already use and stays out of the way», источник истины для «agents, workspaces, parentage, and lifecycle». Это подтверждает модель «Paseo снаружи как инфраструктура, провайдер (включая OMO внутри) сам решает, как считать».

### Когда двойная оркестрация — это хорошо

- Paseo-воркспейс = изоляция (отдельный git worktree/ветка) + межмашинность + уведомления о завершении; OMO/Sisyphus внутри = экономия токенов за счёт параллельных подагентов на разных моделях внутри одной задачи. Комбинация оправдана, когда задача (а) достаточно велика для внутренней декомпозиции и (б) должна жить в изолированной ветке/воркспейсе, не блокируя основную сессию.
- Пример из реального конфига пользователя: `~/.paseo/schedules/7c6a7678.json` — schedule `"omo-beta-status"` с промптом «Проверь ещё раз статус OMO 5 beta...». Это Paseo-уровень (внешний cron), который запускает агента; что он будет делать внутри (вызывать ли ultrawork) — решение уже самого агента/OMO.

### Когда двойная оркестрация вредит

- **Дублирование фоновых агентов.** `mass ulw` внутри OMO уже порождает параллельный граф подагентов на уровне одного `opencode`-процесса. Если тот же процесс запущен Paseo-heartbeat'ом, который сам пере-промптит «продолжай» каждые N минут, получается петля в петле: heartbeat может застать OMO в разгаре собственного параллельного графа и отправить дублирующий/конфликтующий промпт поверх уже идущей работы — агент получит два независимых источника «давления продолжать».
- **Стоимость.** `mass ulw` = N параллельных моделей; Paseo heartbeat, который раз в 10 минут толкает агента продолжать (`wf-keep-an-agent-working-with-a-heartbeat.md`: «every 10 minutes... two hours» по умолчанию) — если агент внутри уже в ultrawork-режиме, каждый heartbeat-пинг может спровоцировать повторный полный проход графа подагентов, а не маленький шаг.
- **Коллизии worktree.** Paseo гарантирует, что *разные* Paseo-воркспейсы = разные директории/ветки (`paseo-committee`/`paseo-handoff` skill, раздел workspace create). Но *внутри одного* Paseo-воркспейса все OMO-подагенты `mass ulw` работают в одной и той же рабочей директории — изоляции между ними Paseo не даёт и не обязан: это зона ответственности OMO. Если пользователь ожидает, что Paseo изолирует и внутренних OMO-подагентов, это ложная надежда.

**Рекомендуемая модель:** Paseo = граница сессии (worktree, провайдер, heartbeat/schedule, permission). OMO/ultrawork = всё, что происходит *внутри* одной границы. Не ставить heartbeat на агента, который сам уже управляет своим темпом через `ultrawork` (см. антипаттерны, раздел 4) — для «довести задачу» внутри OMO-сессии достаточно самого ultrawork; heartbeat нужен в первую очередь для провайдеров/режимов без встроенного самоуправления темпом.

## 3. Конкретные паттерны

Все команды ниже — **из help, не запускались** (кроме отмеченных как реально выполненных), т.к. задача read-only и запрещает создавать агентов.

### (а) Запустить OMO-агента в отдельном воркспейсе с задачей

```bash
paseo run --provider opencode --mode "Sisyphus - ultraworker" \
  --new-workspace worktree --worktree-mode branch-off \
  --new-branch my-feature --base origin/main \
  "ultrawork: <задача>"
```
Источники: `paseo run --help` (реально выполнено — опции `--provider`, `--mode`, `--new-workspace`, `--worktree-mode`, `--new-branch`, `--base` подтверждены буквально); режим `"Sisyphus - ultraworker"` — буквальная строка из `paseo provider ls`. Префикс `ultrawork`/`ulw` в промпте — README.ru.md:71.

### (б) Fan-out ресёрча на несколько агентов, включая OMO

Официальный workflow `wf-fan-out-research` (`~/.claude/commands/paseo/wf-fan-out-research.md`, реально прочитан):
> «Split this into independent research angles, one per worker... Create one Paseo subagent in this workspace per angle... Do not edit files. Synthesize their findings when all of them report back.»

Чтобы включить OMO как одного из воркеров — явно указать провайдера при создании одного из агентов:
```bash
paseo run --provider opencode --mode "Prometheus - Plan Builder" "<угол исследования>"
paseo run --provider claude --mode plan "<другой угол>"
```
(из help, не запускалось)

### (в) Implement-then-review: OMO реализует, Claude ревьюит

Официальный workflow `wf-implement-then-review` (реально прочитан):
> «Create a workspace with worktree isolation and launch an implementation worker there... When it finishes, launch an independent reviewer in that workspace.»

```bash
paseo workspace create --isolation worktree --mode branch-off --new-branch feature-x --base origin/main
paseo run --provider opencode --mode "Hephaestus - Deep Agent" --workspace <workspace-id> "реализуй: <задача>"
paseo run --provider claude --mode plan --workspace <workspace-id> "ревью диффа на корректность, тесты, лишнюю сложность"
```
(из help, не запускалось; структура подтверждена текстом workflow-команды)

### (г) Heartbeat, чтобы OMO-агент доводил задачу

Официальный workflow `wf-keep-an-agent-working-with-a-heartbeat` (реально прочитан):
> «Default to every 10 minutes, expiring after two hours... Continue the task in small steps, run the focused checks after each step, and delete the heartbeat when the work is complete.»

```bash
paseo heartbeat create --cron "*/10 * * * *" "продолжай задачу маленькими шагами, прогоняй проверки"
```
(`paseo heartbeat --help`, реально выполнено, подтверждает команды `create`/`update`/`delete`)

**Важно (см. антипаттерны):** не комбинировать с `ultrawork` в том же промпте — см. раздел 4.

### (д) Отправка промпта существующему агенту и чтение результата

Официальный workflow `wf-send-a-prompt-to-another-agent` (реально прочитан):
> «From the CLI this is `paseo send <id> "<prompt>"`.»

```bash
paseo send <agent-id> "<follow-up>"
paseo logs <agent-id>
paseo inspect <agent-id>
```
`send`, `logs`, `inspect` — подтверждены буквально в `paseo --help` (реально выполнено).

### (е) Handoff из Claude в OMO

Skill `paseo-handoff` (`~/.claude/skills/paseo-handoff/SKILL.md`, реально прочитан) предписывает собрать самодостаточный бриф (Task/Context/Relevant files/Current state/What was tried/Decisions/Acceptance criteria/Constraints) и создать агента:

```bash
paseo run --provider opencode --mode "Sisyphus - ultraworker" \
  --new-workspace worktree --worktree-mode branch-off --new-branch handoff-x \
  "## Task
...
## Context
...
## Acceptance criteria
- [ ] ...
"
```
(из help/skill, не запускалось)

## 3а. Альтернативный путь интеграции: headless CLI `oh-my-opencode run` (не через Paseo-провайдер `opencode`)

Помимо режима «Paseo запускает `opencode`-сервер, который сам загружает OMO как плагин» (раздел 1), у OMO есть собственный headless-CLI, который можно было бы запускать как произвольный внешний процесс через `paseo run --provider <generic>`/скрипт — но это **отдельный, более прямой путь**, минующий провайдерную интеграцию `opencode` в Paseo:

- `dist/cli/index.js:110528` — команда `oh-my-opencode run <message>` (bin из package.json: `oh-my-opencode`, `oh-my-openagent`, `omo-agent-toolkit`, `lazycodex`, `lazycodex-ai`; бинарника `omo` нет — проверено оркестратором): `-a/--agent <name>` (default Sisyphus), `--json`, `--session-id <id>`, `--attach <url>`.
- Описание (цитата суб-агента): «Unlike 'opencode run', this command waits until: all todos are completed or cancelled; all child sessions (background tasks) are idle» — то есть встроенное ожидание завершения фоновых подзадач, а не просто одного ответа модели.
- Пример из help: `bunx oh-my-opencode run --json "Fix the bug" | jq .sessionId`.

**Важное уточнение:** прямой полнотекстовый поиск `grep -ril "paseo"` по всему дереву пакета (README, docs, packages, dist) дал **ноль совпадений** — OMO не знает о существовании Paseo и не содержит специального кода для работы «под» внешним оркестратором. `oh-my-opencode run` — это точка, которую *мог бы* использовать внешний оркестратор (включая Paseo через generic-shell-провайдера или custom provider), но это не документированная и не тестированная самим OMO интеграция.

## 4. Антипаттерны и подводные камни

- **Ultrawork внутри Paseo-heartbeat (петля в петле).** `ultrawork`/`mass ulw` — это уже *внутренний* цикл «план → шаг → проверка → следующий шаг» (README.ru.md:73). Heartbeat Paseo — это *внешний* цикл «раз в N минут повторно скажи продолжать». Если промпт heartbeat'а звучит как «продолжай» и агент уже в ultrawork, каждый heartbeat рискует перезапускать/перебивать уже идущий внутренний план, а не просто подталкивать застрявшего агента. Рекомендация: heartbeat-промпт должен быть диагностическим («проверь, не застрял ли ты, и если да — опиши, на чём»), а не императивным «продолжай», когда внутри уже работает ultrawork.
- **Коллизии правок в одном worktree.** Paseo изолирует *между* воркспейсами (`wf-parallelize-edits-without-collisions`: «Create a separate workspace with worktree isolation... for each item»), но не внутри одного. `mass ulw` порождает много подагентов OMO в одной и той же рабочей директории — ответственность за отсутствие коллизий лежит целиком на OMO/team-core, Paseo об этом не знает.
- **Permission-промпты.** Skill `paseo-plugin` (реально прочитан) явно описывает, что плагины — «trusted, unsandboxed code» и что включение плагинов требует явного разрешения пользователя; аналогично `paseo run --mode` может требовать режим с подтверждением правок (`Always Ask`, `Auto-review` и т.п. — видно в `paseo provider ls`: у `claude` режим `Always Ask`, у `codex` — `Auto-review`). Агент, запущенный Paseo в фоне без присмотра, может зависнуть на permission-промпте и выглядеть как «не отвечает», хотя на самом деле ждёт approve/deny через `paseo permit`.
- **Как понять, что агент завис.** `paseo inspect <id>` и `paseo logs <id>` (подтверждено `paseo --help`) — это read-only способы проверить статус без того, чтобы прерывать работу; `paseo-help`-skill прямо предупреждает не перезапускать daemon для диагностики («A daemon restart can interrupt the agent doing the diagnosis»).
- **Стоимость.** Прямого документального предупреждения о стоимости двойной оркестрации (Paseo heartbeat × OMO `mass ulw`) не найдено ни в Paseo docs, ни в OMO README — **НЕ ПОДТВЕРЖДЕНО**, выведено логически из механики («каждый heartbeat-тик может спровоцировать полный проход параллельного графа подагентов, а не маленький шаг»). Искал: `paseo.sh/docs/troubleshooting` (по сообщению веб-ресёрч-субагента — страница ограничена PATH/environment-проблемами), `paseo.sh/docs/orchestration-workflows` (описывает heartbeat, но не предупреждает о стоимости).

## 5. Чек-лист «правильной оркестрации»

1. Решить **на каком уровне** нужна декомпозиция: между независимыми git-ветками/провайдерами → Paseo-воркспейс; внутри одной задачи на одном дереве файлов → OMO/ultrawork.
2. Если задача требует и то, и другое — сначала создать Paseo-воркспейс с изоляцией (`worktree`), затем внутри него запускать OMO с `ultrawork`/`mass ulw`, а не наоборот.
3. Перед heartbeat на OMO-агента — проверить, не передан ли в промпте `ultrawork`/`ulw`/`mass ulw`. Если да — сделать heartbeat диагностическим, не императивным, и/или не ставить heartbeat вовсе (у ultrawork свой внутренний цикл доведения до конца, README.ru.md:73: «остановится, когда всё готово»).
4. Для параллельных независимых правок — отдельный Paseo-воркспейс на каждую, не надеяться, что внутренние подагенты OMO дадут ту же изоляцию.
5. Перед выбором режима `--provider opencode --mode ...` — свериться с `paseo provider ls`, а не угадывать имя режима (режимы это конкретные строки `"Atlas - Plan Executor"` и т.п., не произвольный `modeId`).
6. Следить за permission-режимом провайдера (`Always Ask`/`Auto-review`/`Bypass` и т.п. из `paseo provider ls`) — фоновый агент в режиме с подтверждениями зависнет на `paseo permit`, а не на самой работе.
7. Для диагностики зависшего агента — `paseo inspect`/`paseo logs`, никогда не перезапускать daemon.
8. Не удалять/не создавать heartbeat/schedule без явного разрешения пользователя (деструктивное/внешнее действие по правилам сессии).

## Источники

- `paseo --help`, `paseo run --help`, `paseo workspace --help`, `paseo heartbeat --help`, `paseo schedule --help`, `paseo provider --help`, `paseo plugin --help`, `paseo script --help`, `paseo project --help` — реально выполнены в этой сессии.
- `paseo provider ls` / `paseo provider ls --json` — реально выполнено; показывает режимы OMO под провайдером `opencode`.
- `~/.paseo/daemon.log` — строки `"module":"provider-snapshot-manager"`, `"msg":"OpenCode server generation started/exited"`.
- `~/.paseo/config.json` — структура ключей (`agents.providers`, `plugins`, `pluginsEnabled`), без секретов.
- `~/.paseo/schedules/7c6a7678.json`, `~/.paseo/schedules/27dd05bf.json` — реальный пример schedule пользователя для задач про OMO.
- `~/.dotfiles/.config/opencode/opencode.json` — `"plugin": ["oh-my-openagent@5.1.13", ...]`.
- `~/.cache/opencode/packages/oh-my-openagent@5.1.13/node_modules/oh-my-openagent/README.ru.md` (строки 71, 75, 93, 108, 126) — ultrawork, mass ulw, манифест.
- `~/.cache/opencode/packages/oh-my-openagent@5.1.13/node_modules/oh-my-openagent/package.json` — `bin` (алиасы `oh-my-opencode`/`oh-my-openagent`/`omo`), `workspaces` (включая `packages/tmux-core`, `packages/team-core`).
- `~/.cache/opencode/packages/oh-my-openagent@5.1.13/node_modules/oh-my-openagent/bin/AGENTS.md` — описание launcher-shim.
- `~/.claude/skills/paseo/SKILL.md`, `paseo-advisor/SKILL.md`, `paseo-committee/SKILL.md`, `paseo-handoff/SKILL.md`, `paseo-plugin/SKILL.md`, `paseo-help/SKILL.md`, `paseo-move-chat/SKILL.md` — реально прочитаны.
- `~/.claude/commands/paseo/wf-fan-out-research.md`, `wf-implement-then-review.md`, `wf-keep-an-agent-working-with-a-heartbeat.md`, `wf-send-a-prompt-to-another-agent.md`, `wf-send-work-to-a-different-model.md`, `wf-parallelize-edits-without-collisions.md`, `wf-check-redirect-or-continue-work.md`, `wf-work-on-another-machine.md` — реально прочитаны.
- Веб-источники (через делегированный суб-агент, WebSearch/WebFetch): `https://paseo.sh/docs/why`, `https://paseo.sh/docs/orchestration`, `https://paseo.sh/docs/orchestration-workflows`, `https://paseo.sh/docs/worktrees`, `https://paseo.sh/docs/providers`, `https://paseo.sh/docs/troubleshooting`, `https://github.com/getpaseo/paseo/blob/main/docs/providers.md`, `https://github.com/getpaseo/paseo/blob/main/public-docs/skills.md` — не проверялись напрямую этой сессией, переданы суб-агентом; помечено как таковое везде, где использовано.
- Внутренности OMO (через делегированный суб-агент, `general-purpose`): `dist/index.d.ts`, `dist/index.js:186919, :187088-187092, :165223, :155513, :162943, :27377`, `dist/tui.js:4992-4995, ~71872-71911`, `dist/cli/index.js:110528-110555`, `dist/shared/tmux/types.d.ts`, `dist/features/team-mode/team-layout-tmux/layout.d.ts`, `packages/omo-codex/plugin/components/teammode/skills/teammode/SKILL.md`, `packages/prompts-core/prompts/ultrawork/codex.md`, `bin/AGENTS.md`, полнотекстовый `grep -ril "paseo"` по дереву пакета (ноль совпадений). Часть цитат (ultrawork-промпт, teammode SKILL.md) суб-агент сам получил от вложенного суб-агента и пометил как «subagent-verified, not independently re-checked line-by-line» — передаю эту оговорку без потери.
- **НЕ ПОДТВЕРЖДЕНО / искал, не нашёл:** точный код регистрации режимов OMO в API `opencode` (минифицированный `dist/index.js`); официальное предупреждение Paseo или OMO о стоимости/рисках двойной оркестрации (искал в `paseo.sh/docs/troubleshooting`, `orchestration-workflows`, README OMO — не нашёл явного текста, вывод сделан логически).
