# Рынок деслопификации EN + RU, ноябрь 2026

Срез на 2026-11-10. Поверх [[2026-07-06-llm-antislop-stack-research]]: тот был только про EN и только про dev-инструменты.

Метод: четыре параллельных веб-трека (EN OSS, RU, коммерция, model-level), затем выборочная сверка оркестратором. Звёзды и даты push проверены через `gh api` 2026-11-10. arXiv 2510.15061, HF 2605.25358, NBER w34223 и BetaKit открыты напрямую. Остальное — отчёты агентов. Пометка UNVERIFIED значит «нашли только в выдаче или пересказе».

## Главные выводы

1. **Для качества нужна схема «детерминированный линтер как гейт + LLM-скилл как редактор».** Детекторы и humanizer-сервисы решают другую задачу: проверку авторства и обход детекторов.
2. **Для русского за 2026 год появился собственный слой.** Это открытые скиллы с паттернами под русский язык (канцелярит, «не просто X, а Y», «стоит отметить»). Лидер — `ilyautov/humanizer-ru`.
3. **Измеренного русского slop-словаря нет.** Все RU-списки — перевод Wikipedia-гайда или авторское чутьё. Единственная корпусная работа с русским — Juzek (34 языка): «подчёркивать», «важность», «инновационный».
4. **Коммерческие RU-детекторы никто независимо не проверял.** Цифры «98%» — вендорские, малые тесты на vc.ru и TenChat им противоречат.
5. **Model-level методы (Antislop/FTPO, backtracking-бан) работают только для своих локальных моделей.** Результаты по ним есть только для EN. Через API без logprobs остаётся второй проход.

## EN: открытые инструменты

| Инструмент | URL | Звёзды / push (gh api) | Тип | Метод |
|---|---|---|---|---|
| blader/humanizer | https://github.com/blader/humanizer | 67.3k / 2026-11-10 | skill | LLM-правка, около 30 паттернов из Wikipedia; де-факто стандарт |
| hardikpandya/stop-slop | https://github.com/hardikpandya/stop-slop | 18.8k / 2026-03-17 | skill | промпт со списками; stale, но массовый |
| berelevant-ai/slopless | https://github.com/berelevant-ai/slopless | 339 / 2026-11-04 | textlint + CLI | детерминированный, 50+ правил, только EN Markdown |
| yasyf/slop-cop | https://github.com/yasyf/slop-cop | 14 / 2026-11-09 | CLI + плагин CC/Cursor | 178 детерминированных + 48 LLM-правил (опционально) |
| tbhb/vale-ai-tells | https://github.com/tbhb/vale-ai-tells | 129 / 2026-11-03 | Vale-пакет | 25 YAML-правил, детерминированный |
| yanstd888/humanizer-lint | https://github.com/yanstd888/humanizer-lint | 102 / 2026-11-07 | линтер без зависимостей | лексика + ритм; 8 языков (en, id, es, ms, fr, de, pt, zh), **русского нет** |
| Aboudjem/humanizer-skill | https://github.com/Aboudjem/humanizer-skill | 305 / 2026-09 | skill | 55 паттернов, балл 0–100, цель — качество |
| MohamedAbdallah-14/unslop | https://github.com/MohamedAbdallah-14/unslop | 184 / 2026-11 | плагин | sycophancy, stock vocabulary, em-dash |
| DanRWilloughby/snifftest | https://github.com/DanRWilloughby/snifftest | 36 / 2026-10 | плагин CC, pre-commit, Action | regex + LLM-судья |
| Nanako0129/sepia | https://github.com/Nanako0129/sepia | 3.8k / 2026-11 | skill | структура прозы и художки (StoryScope) |
| gabelul/slopbuster | https://github.com/gabelul/slopbuster | 47 / 2026-07 | skill | 152 паттерна, два прохода |
| prose-rich-mcp, slop-chop | github.com/justinritchie/prose-rich-mcp, github.com/dcadolph/slop-chop | единицы звёзд | MCP | детерминированные локальные |

Июльский список на сегодня:

- `llm-slop-detector` и `PublishReady MCP` живы, но крошечные: по 2 звезды.
- `The AntiSlop` жив, 37 звёзд.
- `bmad-editorial-review-prose` объявлен deprecated: это shim к `bmad-review`, общий copy-edit, а не поиск AI-tells.
- `editorial-skills` — не по теме: скиллы для product-страниц SelectHub.
- `slop-cop`: есть два проекта с этим именем. `yasyf` живой, `awnist` (161 звезда) — stale браузерный редактор.
- `academic-writing-skills` распространяется под лицензией PolyForm Noncommercial.
- `Bloomberry AI Sentence DNA` не найден как продукт. `rand/cc-polymath`: файл с anti-slop правилами не найден (UNVERIFIED).

Из классических линтеров `proselint` жив, `write-good` мёртв (последний push в 2025-03).

## RU: открытые инструменты

| Инструмент | URL | Звёзды / push (gh api) | Что | Метод |
|---|---|---|---|---|
| **ilyautov/humanizer-ru** | https://github.com/ilyautov/humanizer-ru | 545 / 2026-11-06, v3.32 | 67 паттернов в 16 категориях, 21 жёсткий запрет с жанровыми исключениями. Локальная правка вместо переписывания, «факт-замок» сверяет смысл с исходником | Python-сканер (`markers.py`, `scan_gate.py`) + skill + CLI + MCP + Chrome-расширение + веб-демо humanizer-ru.aifrontier.tech. Плагины для CC, Codex и Cursor, npm/PyPI. Есть eval из 195 слепых оценок (сентябрь 2026, малая выборка, оценивали агенты) |
| talkstream/ru-text | https://github.com/talkstream/ru-text | 294 / 2026-10-25 | Нейрослоп, типографика, инфостиль (Ильяхов, Горбунов, Розенталь), оценка 0–10 | LLM по справочникам, без автономного CLI |
| smixs/humanizer-ru | https://github.com/smixs/humanizer-ru | 204 / 2026-09-23 | 37 признаков | `scripts/lint.py`: regex без зависимостей, exit 0/1, вердикт clean/review/rewrite — готовый CI-гейт |
| thevseprod/humanizer-ru | https://github.com/thevseprod/humanizer-ru | 45 / 2026-10-19 | правила RU+EN, команды `/humanize` и `/audit` | только промпт |
| ksanyok/TextHumanize | https://github.com/ksanyok/TextHumanize | 96 / 2026-11-09 | 25 языков, включая RU; CLI и REST | правила + статистика. Лицензия NOASSERTION (dual). Эффективность измерена собственным детектором автора — оценка круговая |
| letya999/prose-polish-ru | https://github.com/letya999/prose-polish-ru | 2 | редакторский конвейер | skill + `lint_text.py` |

Классические RU-редакторы ловят воду и канцелярит, но не знают LLM-специфику:

- **Главред** — платный API, документация в Notion, условия с 2020 года.
- **Тургенев** (Ашманов) — на странице «временно не работает».
- **Яндекс Спеллер** — только орфография.
- **LanguageTool ru** — грамматика, стилевых anti-AI правил нет.

Vale- и LanguageTool-правил против русского AI-слопа не нашли.

## Коммерция: детекторы и humanizer-сервисы

| Детектор | RU | API | Доказательства |
|---|---|---|---|
| Pangram | да (вендор: 98–99% на RU Wiki/BBC, 2024) | да, $0.05/100 слов | NBER w34223 (Jabarian & Imas, сентябрь 2025): лучший из Pangram, Originality, GPTZero, устойчив к humanizer-инструментам. **Проверено** |
| GPTZero | да, 20+ языков | да | С 2026-06 принадлежит Superhuman, бывшему Grammarly. **Проверено** (BetaKit). Цифры точности вендорские |
| Copyleaks | да, `ru` в списке 30 языков | да | в тесте на vc.ru пометил человеческий текст как ИИ |
| Originality.ai | 30 языков по заявлению вендора; RU-трек не подтвердил | только Enterprise | — |
| Turnitin | нет | нет | — |
| GigaCheck (Сбер) | да | публичного API нет, только демо и TG-бот | заявлено 94.7% при FPR 1%; тест TenChat: 3 ошибки из 10. В статье ACL Findings 2026 оценка только на EN |
| Text.ru, Антиплагиат | да | API детектора не найден | Text.ru на vc.ru совпал с ZeroGPT. Антиплагиат заявляет «98%», тест Т—Ж: нашёл ИИ в 7 из 12 |

Humanizer-сервисы (Undetectable, StealthGPT, WriteHuman, Phrasly, HIX):

- Оптимизируют обход детектора, а не прозу. Независимых данных об улучшении качества нет.
- Grammarly и QuillBot Humanizer не поддерживают RU.
- RU-сервис ReText.AI: заявленные «60%» — данные самого вендора.

Водяные знаки: SynthID Text у Google, у OpenAI в продакшене нет (UNVERIFIED). Любая переписка ломает водяной знак, поэтому deslop и обход по этому побочному эффекту неразличимы.

## Model-level и исследования

- **Antislop** (Paech et al., arXiv 2510.15061, октябрь 2025). Backtracking-сэмплер давит 8000+ паттернов. Токенный бан становится непригодным примерно после 2000. FTPO-дообучение даёт около 90% снижения slop без потерь на GSM8K и MMLU; DPO хуже. Данные только по EN. Код: `sam-paech/auto-antislop` (нужна CUDA) и `antislop-vllm`. Статус «ICLR 2026» — UNVERIFIED, на arXiv не указан.
- **Phrase ban в локальном инференсе.** KoboldCpp `banned_strings` (до 48 строк), exllamav2. В mainline llama.cpp строкового бана не нашли (UNVERIFIED). Для русского каждую словоформу придётся перечислять.
- **Slop Score** (EQ-Bench, `sam-paech/slop-score`) работает только для EN. Согласие EQ-Bench с экспертами оспаривает Surge, но Surge — заинтересованная сторона.
- **Корпусные метрики.** Kobak et al. (PubMed excess vocabulary, arXiv 2406.07016) — EN. **Juzek, 34 языка, включая RU** (HF 2605.25358, примерно май 2026): рост AI-слов в новостях в 26 из 34 языков. **Проверено**.
- **RU-детекция в исследованиях.** RuATD 2022: лучший результат 0.83, люди 0.66. AINL-Eval 2025: лучший 0.86, бейзлайн TF-IDF 0.81. LLMTrace: F1 около 98% на собственном корпусе. На своих корпусах цифры высокие, на реальных текстах не переносятся.
- **Негативные списки в промпте.** Есть слабые данные, что они дают обратный эффект: preprint Semantic Gravity Wells (arXiv 2601.08070) и ReboundBench. Позитивное описание стиля надёжнее, но прямого A/B-сравнения на многих моделях нет.
- **Русские anti-slop DPO-датасеты и бенчмарки slop для творческого письма** не найдены. POLLUX оценивает общее качество русского текста, но не slop.

## Рекомендация для EN + RU пайплайна

1. **RU:** `ilyautov/humanizer-ru` как основной вариант: в одном пакете сканер-гейт, skill и MCP. Если нужен только минимальный детерминированный CI-гейт — `smixs/humanizer-ru` `lint.py`.
2. **EN:** `slopless` или `tbhb/vale-ai-tells` как детерминированный гейт, `blader/humanizer` как редактор.
3. Детекторы в контур качества не включать. Если нужен грубый индикатор — Pangram, проверенный на своих текстах.
4. Свой RU-словарь строить по методу Kobak, Juzek и slop-forensics: частоты лемм в LLM-выводе против человеческого корпуса. Это единственный способ получить измеренный, а не переведённый список.
5. Morphology-aware regex важнее токенных банов: склонения ломают точные строки.

Не проверялось: качество работы ни одного инструмента на реальных текстах пользователя. Ничего не устанавливалось.
