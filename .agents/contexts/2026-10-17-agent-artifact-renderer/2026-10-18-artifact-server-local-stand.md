# artifact-server: локальный стенд

2026-10-17…18. Практическая проверка к [[2026-10-18-artifact-server-publication]]: та заметка — чтение кода, эта — запуск. Клон `~/Sources/artifact-server` (`5af28ac`, v0.1.2), Node 26.11, pnpm 10.34.3. Стенд погашен, данные оставлены.

## Как поднять заново

```sh
cd ~/Sources/artifact-server
pnpm install --frozen-lockfile   # ~32 s; pnpm пропускает build-скрипты node-pty/workerd/protobufjs — локальному режиму не мешает
pnpm dev                         # http://127.0.0.1:8787, данные в ./.artifact-server
pnpm -s artifactserver publish <file|dir> --name "…" --tag stand
```

Из Claude Code `pnpm dev` запускать фоном с `timeout: 7200000` — дефолтный лимит фоновой задачи 30 мин убил сервер посреди проверки.

Скрипты стенда — `.agents/artifacts/artifact-server-stand/` (`node_modules` — симлинк на canvas-stand, Chrome через `channel: "chrome"`):

- `review-shot.mjs <review-url> <png>` — рендер review в Chrome, кадры, текст, ошибки консоли;
- `ui-comment.mjs <review-url> <text> <png>` — комментарий человеком через панель Comments;
- `mcp-probe.mjs <checkout> '<[[tool,args],…]>'` — сырой MCP JSON-RPC к `artifactserver mcp --data <checkout>/.artifact-server`.

## Результаты

| Проверка | Итог |
|---|---|
| publish файла VE (`ve-integration/report.html`) | ок; три ссылки, по умолчанию `account_required` |
| рендер в review (Chrome) | ок, VE целиком; в консоли только favicon 404 и 401 на пробу сессии |
| хост версии `*.localhost` без сессии | 401 — изоляция работает |
| MCP stdio | 33 инструмента |
| комментарий агент → UI | ок (`principalKind: service`) |
| комментарий UI → агент | ок (`principalKind: human`) |
| v2 с `--expected-version` | ок; повтор со старой версией → 409 `PUBLISH_CONFLICT` |
| `artifact_diff` | работает, но построчно |
| mailbox-цикл (Send → `dispatch_inbox` claim → delivered → `comment_reply` → `comment_resolve`) | ок; dispatch сам стал `addressed` после resolve последнего треда |
| Claude Code Channels | **не проверено** — см. ниже |
| превью в Paseo | **не проверено** — см. ниже |

## Подводные камни

- **Два каталога данных.** `artifactserver mcp` по умолчанию смотрит в `~/.artifact-server`, `pnpm dev` пишет в `./.artifact-server`. Без `--data` мост не находит сервер и **молча поднимает свой managed-сервер** (`start --port 0 --managed`), который переживает мост. Так на стенде лишний сервер прожил до ручной остановки стенда.
- **Mailbox — не push.** `dispatch_inbox list` регистрирует агента (`kind: mcp-mailbox`), но `connected` держится 90 с после последнего обращения; Send только кладёт в очередь, агент сам делает `claim`. Нужен периодический опрос или «проверь ящик».
- `idempotencyKey` в `comment_create`/`comment_reply` — минимум 16 символов; видно только по ошибке валидации.
- Diff на VE бесполезен: VE пишет HTML несколькими гигантскими строками.
- Комментарий без якоря (на всю версию) UI помечает красным «Location unavailable in this version».

## Что осталось

**Channels** (`integrations/claude-channel`): одноразовый проект `/tmp/as-channel/.mcp.json` готов. Запуск `claude --dangerously-load-development-channels server:artifact-server` из агента заблокировал классификатор авто-режима — запускать руками:

```sh
cd /tmp/as-channel
export ARTIFACT_SERVER_ORIGIN=http://127.0.0.1:8787
export ARTIFACT_SERVER_AGENT_TOKEN="$(<~/Sources/artifact-server/.artifact-server/local-api-token)"
export ARTIFACT_SERVER_AGENT_NAME=channel-stand
claude --model sonnet --dangerously-load-development-channels server:artifact-server
```

**Paseo**: встроенный браузер есть ([docs](https://paseo.sh/docs/browser.md)) — вкладки в workspace, агентам через `browser_*` MCP. Browser tools по умолчанию выключены (Settings → host → Agents; в `~/.paseo/config.json` ключа нет). Проверить: открыть review-ссылку во вкладке руками, либо включить Browser tools. Ожидание — `*.localhost` в Chromium-webview резолвится на loopback, но не проверено.

## Вывод

Как self-hosted слой публикации поверх visual-explainer — годится: публикация, рендер, комментарии в обе стороны, версии с защитой от гонки и mailbox-возврат работают на v0.1.2. Живой push в сессию (Channels) и вид в Paseo — открыты.
