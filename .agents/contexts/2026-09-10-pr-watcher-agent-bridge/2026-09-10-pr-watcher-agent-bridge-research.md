---
updated: 2026-09-10
---
# PR Watcher → Agent Bridge — research

Ресерч-сессия 2026-09-10. Код не писался. Факты, помеченные «проверено»,
получены выполнением команд на машине; остальное — документация и блоги.

## Постановка

Три шага, сформулированные пользователем:

1. Внешний процесс дописывает сообщение в живой агентский чат.
2. Агент подписывается на события GitHub-хуков по конкретному PR.
3. Агент иногда оставляет комментарии — и это «пахнет ботом», что нежелательно.

Цель конструкции: ревью-агент, который держит контекст по PR, получает
апдейты и по просьбе оставляет комментарии.

## Проверено локально

### Paseo как транспорт

- CLI `/opt/homebrew/bin/paseo`, пакет `@getpaseo/cli` в
  `/opt/homebrew/lib/node_modules`.
- Текущий чат = агент `9ba7875`. Доставка снаружи:
  `paseo send <agent-id> "текст" --no-wait`.
- Транспорт — WebSocket к демону (`127.0.0.1:6767` или юникс-сокет),
  `--host ssh://user@host` работает удалённо.
- `paseo heartbeat create --cron "..."` — рекуррентный промпт **в этот же**
  агент. `paseo schedule create` — по расписанию поднимает нового.
- `paseo hub status` → `not_connected`.

Вывод: шаг 1 из постановки работает без дополнительной инфраструктуры.

### Права на GitHub — главный блокер

```
KosyanMedia/delta        permissions: {admin:false, maintain:false, push:true}
gtu-internal-it/aviakit  permissions: {admin:false, maintain:false, push:true}
gh token scopes          gist, read:org, repo, user
```

Нет `admin`, нет `admin:repo_hook` / `admin:org_hook`. Следствия:

- репо-вебхук не создать;
- `gh webhook forward` (extension `cli/gh-webhook`) не пройдёт — он создаёт
  тот же репо-вебхук;
- GitHub App (а Paseo Hub connection — это именно App) в организацию не
  поставить без владельца;
- self-hosted Actions runner не зарегистрировать;
- Actions-workflow с `curl` наружу требует публичного эндпоинта, которого нет.

Все входящие пути закрыты одной строчкой ACL. Остаётся исходящий поллинг.

### Поллинг дешевле, чем кажется

Notifications API:

```
GET /notifications → X-Poll-Interval: 60, ETag присутствует
3 условных запроса (If-None-Match) подряд → 304, 304, 304
X-Ratelimit-Used:                            6,   6,   6   ← не сдвинулся
```

Условный запрос с 304 не тратит лимит. Поллинг раз в 60с бесплатен.

GraphQL по конкретному PR (одним запросом `updatedAt`, `headRefOid`,
`reviewDecision`, comments, reviews, `statusCheckRollup`):

```
rateLimit: {cost: 1, limit: 5000}
```

Опрос раз в 30с = 120 запросов/час = 2.4% часового бюджета на один PR.

### Примитива «дописать в живую сессию» есть во всех рантаймах

```
paseo send <agent-id> "..." --no-wait
codex queue --thread <uuid|name> --message "..."
opencode serve --port N                     # headless HTTP
claude --from-pr <number|url>               # сессия, привязанная к PR
```

`claude --from-pr` — сессия автоматически линкуется к PR при `gh pr create`.
То есть связь «разговор ↔ pull request» уже существует как first-class
сущность с резолвом по номеру PR.

## Paseo Hub — что умеет и где ломается

Модель: GitHub connection → trigger → workflow → step на своём демоне.
Конфиг в репе `.paseo/workflows/*.yml`, деплой `paseo hub deploy`,
выгрузка активных триггеров `paseo hub export`.

События: `github.pull_request_created`, `github.pull_request_comment_created`,
`github.issue_comment_created`, `github.pull_request_label_added`; legacy —
`github.pull_request_review`, `github.pull_request_review_comment`,
`github.push`. Фильтры: `repo`, `contains`, `pattern`, `labels` и
**обязательный** `from_users`.

Авторизация к GitHub: Hub минтит installation-token GitHub App на время шага,
агент получает `GH_TOKEN`, коммиты идут от `<app>[bot]`. `hub.reply` для
GitHub не существует — только `gh`.

Public API: `/api/v1/projects`, `/configurations/validate`,
`/configurations/install`, `/manual-runs`, `/daemons/enrollment-tokens`.
Прямого «послать сообщение агенту» в публичном API нет.

**Ограничение:** persistent-сессий нет — «Each workflow run creates discrete
step executions». Подписка живого агента не встроена.

**Обход (гипотеза, не проверена):** step воркфлоу поднимает дешёвый
эфемерный агент-курьер без github-authority, который делает
`paseo send <живой-агент>`. Состояние живёт в долгом агенте.

**Практический вывод:** для корпоративных реп путь мёртв по правам, не по
сети. Для личных реп, где есть admin, — рабочий вариант второй стадии.

## Claude Code Routines — альтернатива и её потолок

Research preview. Триггеры: schedule / API (`POST .../fire` с bearer) /
GitHub. GitHub-события только `pull_request.*` и `release.*`, зато богатые
фильтры (author, base/head branch, labels, is_draft, is_merged, regex).

Требует установки Claude GitHub App на репозиторий — тот же блокер по правам.

Идентичность: «Anything a routine does appears as **you**» — коммиты и PR
идут от твоего GitHub-аккаунта, в отличие от Hub с его bot-логином.

Тот же потолок: «Claude Code doesn't reuse sessions across events: two PR
updates produce two independent sessions».

## Локальный вотчер — целевая конструкция

Три уровня по возрастанию автономности:

- **L0** — инструмент `Monitor` внутри сессии, `persistent: true`. Ноль
  инфраструктуры, умирает вместе с сессией. Для проверки сквозного пути.
- **L1** — `paseo heartbeat create --cron`. Агент сам просыпается и смотрит.
  Состояние в истории чата. Минус: каждый тик стоит токенов вхолостую.
- **L2** — launchd-демон `pr-watcher`. Автономен, переживает перезагрузку,
  тратит токены только когда есть что сказать.

### Дизайн L2

```
launchd (KeepAlive)
  └─ pr-watcher: цикл 30–60с
       ├─ watchlist: ~/.config/pr-watcher/watch.jsonl   ← {repo, pr, agent_id}
       ├─ GraphQL cost=1 на каждую строку watchlist
       ├─ state:     ~/.local/state/pr-watcher/<repo>#<n>.json
       ├─ дельта? → фильтр значимости
       └─ paseo send <agent_id> "<событие>" --no-wait
```

Решения, от которых зависит, взлетит оно или будет раздражать:

- **Дедуп по id, не по таймстемпам.** Редактирование комментария двигает
  `updatedAt`, но новым событием не является. Хранить множество id комментов
  и ревью плюс `headRefOid`.
- **Фильтр значимости на стороне вотчера.** Будить агента только на: новый
  `headRefOid`; коммент или ревью от не-тебя; переход `statusCheckRollup` в
  FAILURE; смена `reviewDecision`. Остальное — молча в state.
- **Watchlist-файл и есть механизм подписки.** «Подписаться» = агент
  дописывает строку в `watch.jsonl`. Никакого API не нужно.
- **Тела комментов из PR — недоверенный ввод.** Оборачивать делимитерами,
  вотчеру не давать write-прав к GitHub. Тот же принцип, что Paseo Hub
  формулирует как «keep authority on the worker».
- **Токен не хранить** — вызывать `gh api`, он достаёт из keyring.
- **Backoff** на 5xx и 403 rate limit, `|| true` на каждом вызове.

### Ловушка notifications API

`/notifications` возвращает только **непрочитанное**. Открыл PR в браузере
или тапнул пуш на телефоне — уведомление помечено прочитанным, вотчер
события не увидит. Гонка с самим собой. Поэтому: notifications — широкая
сеть, watchlist-GraphQL — детерминированный источник для ведомых PR.

## Вопрос идентичности комментариев

| Путь | Чем подписан коммент |
|---|---|
| Hub `github:` authority | installation-token App → `<AppName>[bot]` |
| Claude Routines | твой GitHub-аккаунт |
| Локально `gh pr comment` (то же, что `/code-review --post`) | твой аккаунт |

Проблема не в идентичности, а в семантике: коммент от бота читается как шум,
коммент от тебя — как твоё утверждение под твою ответственность. Публиковать
агентское мнение под своим лицом без вычитки — перекладывание репутационного
риска на себя.

Решение — human-in-the-loop: агент кладёт находки в чат, человек визирует,
`gh pr comment` идёт от человека.

## Ландшафт

### Ambient agents — каркас для этой постановки

LangChain формализовал: агент слушает поток событий, а не промптов. Три
паттерна взаимодействия с человеком: **notify** (флажок, действовать нельзя),
**question** (агент застрял, спрашивает вместо галлюцинации), **review**
(агент подготовил действие, человек визирует). Годится как контракт вотчера.

Деталь: LangGraph Platform имеет встроенный cron, потому что «многие ambient
agents работают по расписанию и проверяют новые события». Даже платформа,
продающая событийность, внутри поллит.

### Agent inbox как продукт

- **Omnara** — демон на машине, зеркалит Claude Code и Codex в телефон, веб,
  Slack; параллельные worktree, двусторонний голос.
- **Pushary, Forge Remote, Onepilot** — approve/deny с телефона.
- **HumanLayer** — начинали как API human-in-the-loop с маршрутизацией в
  Slack/Email, классический approvals SDK **задеприкейтили**, продукт уехал
  в IDE для оркестрации сессий.

Урок из последнего: тонкий слой «спроси человека» не выживает отдельно от
рантайма. Инбокс строить не нужно — инбокс это чат с агентом. Строить нужно
только провод.

### Народная практика 2026: hooks + ntfy

Массовый рецепт: хуки `Notification` / `Stop` / `PermissionRequest` → ntfy.sh
→ пуш на телефон с Allow/Deny. Кто параноит — ntfy за Tailscale. Это обратная
дуга петли (агент → человеку), комплементарная вотчеру (событие → агенту).

Полная петля без единого входящего порта:

```
GitHub ──poll──► вотчер ──paseo send──► агент ──hook──► ntfy ──► телефон
   ▲                                                              │
   └──────────────── gh pr comment ◄──── виза ◄───────────────────┘
```

### Чего не делает никто

Индустриальные background-агенты (Devin, Cursor, Codex cloud) живут по
циклу: тикет → облачная песочница → автономная правка → PR → человек
ревьюит. Каждое событие — новая сессия. Devin поднимает полную VM, Cursor —
эфемерную машину, Codex — управляемую песочницу.

Ни один не держит долгую сессию с памятью на конкретном PR: они оптимизируют
под масштаб и изоляцию, где память между запусками — утечка и риск. Ниша
«один разработчик, один PR, память = продукт» пустая.

Существующие вотчеры (gh-dash, meiji163/gh-notify, Gitify, Octobox) поллят те
же эндпоинты, но рисуют состояние человеку. Последнего хопа в агентскую
сессию нет ни у кого — до `paseo send` его некуда было делать.

## Что своровать

1. Адресация через `claude --from-pr` — номер PR уже адрес, свой реестр
   агентов не нужен.
2. Три паттерна notify/question/review как контракт вотчера.
3. `paseo send` / `codex queue` как готовый транспорт.
4. Хуки + ntfy для обратной дуги — готовый рецепт, полчаса.
5. Не строить инбокс.

## Открытые вопросы

- Есть ли репозиторий, где пользователь admin? Там имеет смысл один раз
  сравнить push-путь (`gh webhook forward`) с поллингом и понять, стоит ли
  выпрашивать GitHub App у владельцев KosyanMedia.
- Вотчер шлёт в один долгоживущий агент-ревьюер или поднимает свежего на
  каждый PR? Первое даёт память и дешевле, второе изолирует контексты.
  Склонность — к первому, память здесь и есть ценность.
- Гипотеза «hub-step вызывает `paseo send`» не проверена: Hub не подключен.

## Источники

- Paseo Hub: `/docs/hub/quickstart`, `/concepts`, `/workflows`, `/triggers/github`,
  `/github`, `/api` на paseo.sh
- Claude Code Routines: code.claude.com/docs/en/routines
- `claude --from-pr`: docs.bswen.com/blog/2026-03-22-claude-code-pr-resume/
- GitHub REST notifications + условные запросы: docs.github.com/en/rest/activity/notifications,
  github.com/orgs/community/discussions/156480
- `gh webhook forward`: github.com/cli/gh-webhook
- Ambient agents: langchain.com/blog/introducing-ambient-agents,
  github.com/langchain-ai/ambient-agent-101
- Omnara: omnara.com; HumanLayer: everydev.ai/tools/humanlayer
- hooks + ntfy: github.com/nickknissen/claude-ntfy-hook,
  felipeelias.github.io/2026/02/25/claude-code-notifications.html
- Background agents 2026: builder.io/blog/best-ai-background-agents-for-developers-2026
