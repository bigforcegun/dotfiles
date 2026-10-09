---
name: paseo-maintenance
description: >-
  Maintenance runbook for Paseo Desktop in this dotfiles workspace: the app,
  its daemon and bundled CLI, installed and in-development plugins, vendored
  Paseo skills and wf-* commands, and agent hook wiring. Use whenever the user
  wants to assess, update, validate, or repair Paseo or anything built on it,
  even without naming this skill. Do not use for operating agents or
  workspaces (paseo skill) or product questions (paseo-help).
targets:
  - '*'
---
# Paseo Maintenance

Будь кратким: пользователю нужно решение, что сломается или изменится в его Paseo-обвязке и стоит ли обновляться, а не пересказ релизов.

## Что обслуживается

- **Paseo Desktop** — приложение, демон (desktop-managed) и CLI из бандла (`~/.local/bin/paseo` → `Paseo.app/Contents/Resources/bin/paseo`). Обновляется только самим приложением.
- **Плагины** — `paseo plugin ls --json`. Два сорта:
  - `managed`: npm/git-установки под `~/.paseo/plugins/`, обновляются через `paseo plugin update`;
  - `dev`: `source: directory`, указывают на рабочую копию плагина (репо dotfiles или worktree, где идёт разработка). Путь — это осознанный выбор пользователя: обновление Paseo может прийти посреди разработки плагина. Проверяй плагин там, где он лежит; не переноси и не переписывай путь.
- **Скилы и команды** — три независимых трека, см. ниже.
- **Хуки агентов**: `.rulesync-global/.rulesync/hooks.json` (вызовы `paseo hooks <agent> <event>`) и `.config/opencode/plugins/paseo-terminal-activity.js`.

Доставка всего из `.rulesync-global` в `$HOME` — `make install-agents-global-configs`.

## Треки скилов и команд

Каждая проверка проходит все три трека, и в ответе у каждого своя строка. Трек, который не проверен, называется непроверенным, а не пропускается.

1. **Вендорные скилы** — `.rulesync-global/.rulesync/skills/<name>` для каждого скила из upstream `skills/`. Тело совпадает с upstream на теге демона, локальный только rulesync-frontmatter (`targets`). Хелпер: `vendor-skills`.
2. **Вендорные workflow-команды** — `.rulesync-global/.rulesync/commands/paseo/wf-*.md`, адаптации разделов `public-docs/orchestration-workflows.md` под `$ARGUMENTS`, а не копии. Каждой команде нужен раздел на теге демона; изменённый или новый раздел upstream — повод перечитать команду и перенести смысл. Хелпер: `vendor-commands`.
3. **Собственные скилы** — `paseo*`-скилы этого репо, которых нет в upstream (`paseo-move-chat`, сам `paseo-maintenance`, …). Работают поверх API Paseo и ломаются от новой версии молча. Хелпер: `own-skills` — список и их eval-точки.
   - **Всегда спрашивай пользователя, запускать ли eval каждого собственного скила на текущей версии демона**, и называй команду. Без запуска трек в ответе — «не проверен на <версия>». Не запускай без согласия и не опускай вопрос, даже если остальное зелёное.
   - Стенд (`eval_run*`) гоняй по его собственному docstring; до и после сверяй идентичность боевого демона (`paseo daemon status --json`: `serverId`, `pid`, `startedAt`) — совпадение обязательно.
   - Agent-evals (`evals/evals.json`) прогоняются через skill-creator и стоят токенов — назови число кейсов.

## Жёсткие границы

- Не ставь npm `@getpaseo/cli` и не распаковывай `app.asar`. Upstream-исходники читай через `gh` (`getpaseo/paseo` на теге `v<version>`).
- Не останавливай и не перезапускай демон без явного разрешения: рестарт убивает все живые сессии, включая текущую. Никогда не `paseo daemon stop --home <path>` для изолированного стенда — останавливай стенд по его pid.
- Не правь стейт в `~/.paseo` руками. `config.json` — только через `paseo daemon config` / `paseo plugin …`, и с `.bak` перед любой ручной правкой.
- Не пиши в SKILL.md разовые находки и историю поломок: причину устраняй в коде, правило — в хелпере.

## Хелпер

`scripts/paseo-maintenance` — read-only, ненулевой exit = найдена проблема, `WARN:` = повод посмотреть.

- `status` — версии app/CLI/daemon и их расхождение, дубли `paseo` в PATH.
- `update-check [--pre] [--from <ver>]` — установленная версия против latest; `applied=` — релизы, уже приехавшие с предыдущей версии (берётся из лога автоапдейтера, иначе `--from`), `newer=` — ещё впереди. `--pre` — с бетами.
- `plugins [<ver>…]` — статус, origin (`managed`/`dev`), допускает ли `requirements.paseo` демон, latest stable и каждую `<ver>` по правилу самого демона (пустое поле = `<0.8.0`); то же для релиза, который поставит `paseo plugin update` (строки `update …`, манифест читается одним файлом: npm — jsDelivr, git — GitHub API); пины `@getpaseo/*` у dev-плагинов против минора демона.
- `changes <from> <to>` — изменённые файлы под `packages/{plugin,client,protocol}/`, `skills/`, `public-docs/` между тегами.
- `vendor-skills` — тела вендорных скилов против upstream на теге демона.
- `vendor-commands [<from>]` — `wf-*` против workflow-разделов на теге демона; раздел, изменённый или добавленный после `<from>` (по умолчанию — предыдущая версия), — `WARN`.
- `own-skills` — собственные `paseo*`-скилы и их eval-точки; сам ничего не запускает.
- `hooks` — подкоманда `paseo hooks` жива, какие события подписаны.
- `logs` — stderr плагинов из `paseo plugin logs` (там ошибки загрузки) и ошибки из `main.log`.
- `all` — всё, кроме `changes`.

Не подменяй его ad-hoc инспекцией; чего не хватает — добавь в хелпер.

## Анализ обновления

1. `git status --short`; чужую работу не трогай.
2. `paseo-maintenance status` и `update-check` (про беты спросили — `--pre`). Desktop обновляется сам, поэтому `applied=` разбирай так же, как `newer=`: для каждого релиза читай `gh release view <tag> -R getpaseo/paseo`, затем `paseo-maintenance changes <old> <new>` — нотсы про SDK обычно молчат.
3. Сопоставь изменения с тем, что реально стоит: `paseo-maintenance plugins <целевые версии>`, три трека (`vendor-skills`, `vendor-commands`, `own-skills`), `hooks`, `logs`.
   - `blocked` на целевой версии — плагин перестанет грузиться; на версии демона — уже не грузится. Строки `update <ver>: ok` у managed-плагина — совместимый релиз есть, лечится `paseo plugin update <id>` по согласию; `update … blocked` или нет строк `update` — совместимого релиза нет, это блокер.
   - Для dev-плагинов изменения SDK (`@getpaseo/plugin`, `client`, `protocol`) проверяй по коду плагина; рантайм-семантика (подписки, события, трансформеры) типами не ловится.
4. Спроси про eval-прогон каждого собственного скила (см. трек 3).
5. Ответ — в формате ниже.

## Формат ответа после проверки

```markdown
**Бриф**
<2-5 пунктов о сути изменений>

**Влияние на мою обвязку**
- Плагины: <по каждому затронутому: managed/dev, что сломается, что делать>
- Вендорные скилы: ...
- Workflow-команды: ...
- Собственные скилы: <по каждому: eval пройден на <версия> / не проверен — ждёт решения>
- Хуки: ...

**Ремонт сейчас**
<что сломано уже приехавшим обновлением и чем чинить; раздел опусти, если ничего>

**Вердикт**
<одна строка из списка> — <короткая причина>
```

Вердикт ровно один и относится к следующему, ещё не установленному релизу: `обновление не требуется` / `обновление можно отложить` / `обновление можно провести` / `обновление необходимо`. «Можно провести» требует, чтобы ни один включённый плагин не блокировал новую версию, либо чтобы блокер был назван с планом. Поломки от уже установленной версии — в «Ремонт сейчас», а не в вердикт.

## Обновление (только по явной просьбе)

1. Baseline: `paseo-maintenance all >| /tmp/paseo-maint-before.txt`.
2. Само приложение обновляет пользователь (автообновление Desktop или установка релиза); перезапуск демона — его решение.
3. После перезапуска: `paseo-maintenance all >| /tmp/paseo-maint-after.txt`, `diff -u` с baseline.
4. Managed-плагины: `paseo plugin update --all --check`, затем `paseo plugin update <id>` по согласию; после — `paseo-maintenance plugins` и `logs`.
5. Dev-плагины, затронутые изменениями SDK: в рабочей копии плагина поднять `@getpaseo/*` до версии демона, `npm install`, typecheck и тесты из его `package.json`, затем `paseo plugin reload <id>` и `paseo-maintenance logs`. Зелёный tsc без reload и логов — не доказательство.
6. Вендорные скилы при `vendor-skills` ≠ in-sync: перенести тело из upstream-тега, сохранив локальный frontmatter.
7. Workflow-команды с `WARN` от `vendor-commands`: перечитать раздел upstream и перенести изменившийся смысл в команду, сохранив `$ARGUMENTS` и frontmatter. Новый раздел — предложить новую команду.
8. После 6–7 — `make install-agents-global-configs`.
9. Собственные скилы — eval каждого по согласию (трек 3); упавший eval чинится в самом скиле до закрытия задачи.
10. UI-изменения плагинов видит только пользователь: попроси подтвердить глазами, не закрывай задачу без этого.

## Отчёт

Версии до/после, что обновлено и где, чем проверено (команда и результат), что осталось на пользователе. Коротко.
