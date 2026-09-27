# Jev: что это и что реально гарантировано

[[2026-09-23-jev-decision-model]]

Состояние знаний на 2026-09-23. Jev вышел 2026-09-15, то есть всему ниже около недели —
цифры вендора независимо не подтверждены, экосистема сырая.

## Что это

Проприетарная модель TypeSafe AI (Diogo Almeida — экс-OpenAI, Erik Gafni, Sasha Sheng),
$40M seed от DCVC. Своя категория: **System One model**. На вход — неструктурированное
состояние программы, на выход — типизированное вероятностное решение. Текст не
генерирует вообще.

Обучение: RLCD (reinforcement learning for calibrated decisions), только синтетические
данные. Архитектура не опубликована. Raschka предполагает encoder-style + RL и считает,
что прорыв в качестве данных, а не в алгоритме.

## Механика

Один stateless POST, без стриминга и сессий.

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <key>
```

```json
{
  "model": "jev-latest",
  "state": "Help! My payouts have been failing for 3 days.",
  "questions": {
    "is_urgent":   { "type": "noul",   "instructions": "The message conveys urgency" },
    "queue":       { "type": "choice", "instructions": "Which team handles this",
                     "criteria": { "billing": "...", "technical": "...", "other": "..." } },
    "frustration": { "type": "score",  "instructions": "How upset is the sender",
                     "criteria": ["Calm", "Frustrated", "Very angry"] }
  }
}
```

`state` — строка, объект, массив, лог чата, состояние приложения. `questions` — мапа
с собственными ключами.

**Все вопросы считаются параллельно в одном проходе по одному state.** Добавление
вопросов почти не меняет latency, а state токенизируется один раз — платишь за него
один раз, а не N раз. В этом вся экономика.

### Ответ

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "is_urgent":  { "type": "noul", "noul": 0.95 },
    "queue":      { "type": "choice", "choice": "billing",
                    "probabilities": { "billing": 0.88, "technical": 0.12 },
                    "confidence": 0.81 },
    "frustration":{ "type": "score", "score": 1.05,
                    "legend": { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
                    "probabilities": { "0": 0.0, "1": 0.95, "2": 0.05 },
                    "confidence": 0.92 }
  },
  "usage": { "input_tokens": 296, "output_tokens": 20 }
}
```

Проверено арифметикой: `score` — это матожидание по распределению уровней,
`0*0.0 + 1*0.95 + 2*0.05 = 1.05`. Дробный score не «размытость шкалы», а честная
средняя, восстановимая из `probabilities`.

Отдельно: **`confidence` не равен максимальной вероятности.** В choice max=0.88 при
confidence=0.81; в score max=0.95 при confidence=0.92. Это отдельный сигнал; как он
считается — не опубликовано.

### Три примитива

| Тип | Запрос | Ответ | Лимит |
|---|---|---|---|
| `noul` | `criteria: {true, false}` | одно число 0..1, **без** отдельного `confidence` | — |
| `choice` | `criteria: {opt: описание}` | `choice` (argmax) + `probabilities` + `confidence` | ≤255 опций |
| `score` | `criteria: [уровни]` | `score` (матожидание) + `legend` + `probabilities` + `confidence` | 2..10 уровней |

Ошибки: 401 ключ, 422 схема вопроса, 429 rate limit, 529 перегруз. Лимиты
1200 req/min, 250k токенов/сек.

## Что гарантировано, а что нет

Гарантия касается **области значений, а не отображения**. Выход — распределение по
заранее перечисленному конечному множеству, которое задал ты.

**Гарантировано по построению:** валидный JSON всегда; ключи ответов = ключи твоих
вопросов; `choice` ∈ твой `criteria`; `noul` ∈ [0,1]; `score` ∈ [0, n-1]; никаких
обрывов и ```json-обёрток.

Практическая ценность: **выбрасывается весь слой retry/parse/repair.** Обычно он
занимает больше строк, чем сама бизнес-логика.

**Не гарантировано:** что выбранное значение правильное. Тип — это `Department`,
не `CorrectDepartment`.

Важно: схема-валидность сама по себе не изобретение Jev — constrained decoding у
фронтирных LLM даёт то же. Реально отличают калиброванная вероятность, 70–500 мс
и цена. Гарантия типа — побочный эффект, вынесенный в заголовок, потому что звучит
абсолютно.

## Почему confidence не закрывает дыру

**Калибровка — статистическое свойство ансамбля, а не отдельного ответа.**
«Откалибровано» значит: среди всех случаев с p=0.9 примерно 90% верны. Про твой
конкретный ответ это не говорит ничего — он может быть из тех 10%. Уверенность 0.95
на неверном ответе не противоречит идеальной калибровке, она её составная часть.

Отсюда: порог и серая зона — не перестраховка, а единственный работающий механизм.
Ошибки не устраняются, назначается их допустимая доля и цена.

## Зафиксированные отказы

- **Тип-валидно, но неверно.** `department=billing` с приличным confidence там, где
  верно `technical`.
- **Принятая выдумка.** В legal-RAG подтвердил несуществующую норму права; локальный
  DistilBERT её отклонил.
- **Вопрос не тот, что ты думал.** С HN: вход «позвоните мне завтра в 5», вопрос
  «хочет ли пользователь живого оператора?» → `yes`. Формально верно, но временная
  оговорка потеряна целиком, и роутер дёрнет оператора немедленно. Дефект в
  формулировке; схема от него не защищает.
- **Field accuracy 59.6% против 83% заявленных** в одном воспроизведённом workflow.
- **Классический ML выигрывает** на большинстве размеченных датасетов; Jev вырвался
  в основном на IMDb. При наличии разметки логрегрессия на эмбеддингах может быть
  и точнее, и дешевле.
- **Математика проседает существенно.**
- **Через OpenRouter p50 = 380 мс**, а не обещанные «до 200». Касается нас напрямую.
- Торговый бот: −3.15% за 731 симулированную сделку.
- CEO на HN: модель **не оптимизирована под текст**, генерация требует mode dropping.
  То есть «не генерирует текст» — не только дизайнерский выбор, но и ограничение.

Общая формулировка с HN, лучшая из всех: *«type safety is not factual correctness»*.

## Ссылки

- [Jev (AI model) — Wikipedia](https://en.wikipedia.org/wiki/Jev_(AI_model))
- [API reference — TypeSafe](https://docs.typesafe.ai/api)
- [Simon Willison: новая форма LLM](https://simonwillison.net/2026/Sep/21/jev/)
- [Raschka: это не «просто классификатор»](https://sebastianraschka.com/blog/2026/jev-classification-generalization.html)
- [HN: Introducing System One Models and Jev](https://news.ycombinator.com/item?id=49717558)
- [Where Jev actually fails — explainx.ai](https://www.explainx.ai/blog/where-jev-actually-fails-2026)
- [jev-in-the-wild: 217 кейсов и провалы](https://github.com/Jessie-QingYu/jev-in-the-wild)
