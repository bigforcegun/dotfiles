# artifact-server: публикация артефактов и self-host на CapRover

2026-10-17…18. Отдельный трек публикации из [[2026-10-17-agent-artifact-renderer]]: visual-explainer делает HTML, artifact-server его хранит, версионирует, даёт ссылку и комментарии. Ничего не устанавливалось и не запускалось — всё ниже из чтения кода и документации. Локальный запуск — отдельно, в [[2026-10-18-artifact-server-local-stand]].

Клоны: `~/Sources/artifact-server` (`5af28ac`, v0.1.2), `~/Sources/caprover` (`212ea19`, shallow).

## Что это

[plannotator/artifact-server](https://github.com/plannotator/artifact-server) — self-hosted аналог Claude artifacts. MIT/Apache-2.0, 216★, создан 2026-08-24. TypeScript ~50k строк + ~50k тестов; Effect 4 rc, Hono, MCP SDK 2.0. Порты/адаптеры: SQLite+диск, Postgres+S3, Cloudflare D1/R2.

- **CLI** `artifactserver publish <file|dir>` → три ссылки: `review` (полноэкранно с комментариями — отдавать её), `artifact` (текущая версия), `version` (неизменяемая).
- **MCP** `POST /mcp`, ~25 инструментов (проекты, артефакты, staged upload, теги, видимость, комментарии, diff). Новая версия — только с `expectedCurrentVersionId`.
- **Skill** `npx skills add plannotator/artifact-server`; `artifactserver connect claude|codex|cursor|vscode` (OpenCode нет).
- **Комментарии → агент**: протокол `docs/agent-bridge-protocol.md`. Pi — полноценно; Claude Code — через Channels (research preview); OpenCode — не квалифицирован.

Слабые места: готового CLI-бинаря нет (issue #68), review ломает якоря внутри HTML (#80), Markdown-превью нет (#78), rate limiting в приложении отсутствует намеренно (`project/performance/FINDINGS.md`).

## Альтернативы (поиск 2026-10-17, по README)

Ниша вся моложе 5 месяцев. По совокупности artifact-server не побит.

| Проект | ★ | Чем отличается |
|---|---|---|
| [razorpay/slashdocs](https://github.com/razorpay/slashdocs) | 382 | ближе всех по функциям (remote MCP+OAuth, версии, якорные комментарии), но Postgres+S3+OIDC — командный |
| [hyperlogue/r3](https://github.com/hyperlogue/r3) | 45 | чисто локальный, `npx`-skill, «Send to agent»; удалённо — руками через Tailscale |
| [plivo-labs/glance](https://github.com/plivo-labs/glance) | 49 | только Cloudflare, голосовые комментарии, без MCP |
| [lexmount/artifact-site](https://github.com/lexmount/artifact-site) | 20 | похож по задумке, молодой |

Если понадобится только локальный цикл — сравнить с r3 на стенде.

## Self-host на CapRover (один пользователь)

**Приложение**: образ `ghcr.io/plannotator/artifact-server@sha256:e832267831dddd905d158aeeb6b331ef314c7d4737c8769d7bd335b91bd43055` (из `image-reference.txt` релиза v0.1.2, amd64+arm64). Instance count = 1 (SQLite), persistent dir `/var/lib/artifact-server`, порт 8787, ~512 MB.

`ENTRYPOINT node dist/cli/main.js`, `CMD --help` — аргументы задать через Service Update Override:

```yaml
TaskTemplate:
  ContainerSpec:
    Args: ["start-compact","--data","/var/lib/artifact-server/data","--host","0.0.0.0","--port","8787"]
```

Перед первым запуском — разово `init --admin-email … --data /var/lib/artifact-server/data` (временным override или `docker run` по SSH). Нужен ли `init` строго — не проверено.

Env:

```
ARTIFACT_SERVER_ORIGIN=https://artifacts.bigforcegun.com
ARTIFACT_SERVER_CONTENT_DOMAIN=a.bfg.dev
```

Hardening из их compose (`read_only`, `cap_drop`, `no-new-privileges`) CapRover сам не ставит. Бэкап: instance 0 → tar тома → instance 1 (`compact-backup.sh` рассчитан на compose).

## Домены и wildcard — жёсткие требования

- **Разные регистрируемые домены** для приложения и контента: `tldts.getDomain` сверяет eTLD+1, при совпадении — отказ старта (`src/lifecycle/runtime-configuration.ts:866`). Причина: same-site → cookie tossing и обход SameSite из недоверенного HTML. Выбрано: приложение `artifacts.bigforcegun.com`, контент `a.bfg.dev`. Остаточный риск: прочие сервисы с логином на `*.bfg.dev` для артефактов same-site.
- **Wildcard обязателен, режима «по пути» нет**: каждая версия и каждый preview-lease получают случайный хост `<token>.<CONTENT_DOMAIN>` (`src/http/artifact-http-links.ts:33`, `create-http-app.ts:3989`).

CapRover (проверено по коду):

- custom domain с `*` отклоняется — `^[a-z0-9\-\.]+$` (`src/utils/Utils.ts:145`);
- встроенный LE — только `certbot --webroot` (HTTP-01), wildcard нельзя (`CertbotManager.ts:72`);
- `/captain/data/nginx-shared` смонтирован в nginx как `/nginx-shared` (`CaptainConstants.ts:135,187`);
- `customNginxConfig` — EJS, рендерится **на каждый домен app** (`LoadBalancerManager.ts:314-367`) — свой server-блок оборачивать в `<% if (s.publicDomain === 'artifacts.bigforcegun.com') { %> … <% } %>`;
- прокси шлёт `Host` и `X-Forwarded-Proto` (`template/server-block-conf.ejs:97-100`) — то, что требует сервер (`create-http-app.ts:2631`).

Cloudflare (по документации): Universal SSL — только корень и первый уровень, `*.a.bfg.dev` требует ACM (~$10/мес) или свой сертификат; cloudflared ingress поддерживает `*.example.com`. Не подтверждено: wildcard DNS-запись на туннель на бесплатном плане.

**Варианты:**

- **A** — `a.bfg.dev`: acme.sh DNS-01 на хосте → сертификат в `/captain/data/nginx-shared/` + cron продления; server-блок `*.a.bfg.dev` в UI с EJS-условием. Один заход по SSH. Проверено по коду, не запускалось.
- **B** — отдельный дешёвый домен под контент (корень зоны) + cloudflared как app CapRover; без сертификатов и nginx. Заодно убирает риск для `bfg.dev`. Требует проверить wildcard-запись на туннель.

## Авторизация

- Люди: только через **один** провайдер — OIDC или WorkOS; без него серверный режим не стартует (`src/cli/lifecycle-commands.ts:505`). Локальный режим за прокси не обмануть: отклоняет запросы с `X-Forwarded-*` (`create-http-app.ts:2693`). Регистрации нет, администратор из `init`, остальных допускает он.
- Агенты: OAuth для `/mcp` (провайдер обязан выдать `aud = https://artifacts.bigforcegun.com/mcp`; Entra не умеет) или API-ключи из настроек UI.
- OIDC redirect URI: `https://artifacts.bigforcegun.com/auth/callback`.
- Приватный контент — сессии на версию; публичность per-artifact, по умолчанию выключена.

## Открыто

- A или B по wildcard.
- Провайдер входа: WorkOS (SaaS, минимум кликов) или свой OIDC на CapRover.
