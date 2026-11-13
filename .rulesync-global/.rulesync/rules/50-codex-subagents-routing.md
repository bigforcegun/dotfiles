---
root: true
targets:
  - 'codexcli'
globs:
  - '**/*'
---

# Маршрутизация сабагентов (Codex)

Codex не запускает сабагентов по их `description` — нужен явный приказ. Это он.

## artificer

Когда пользователь явно заказывает визуализацию — HTML-отчёт, схему, диаграмму, график, слайды, «визуализируй», «нарисуй», «покажи красиво» — spawn the `artificer` sub-agent (delegate to it); this is an explicit instruction to use a sub-agent. Do not render it yourself and do not load the visual-explainer skill in the main thread. Pass the facts in full and the output path if the user gave one; return its reply (the file path) to the user.

Обычный отчёт, итог, сводка или раздел «Отчёт» из брифа — это текст: пиши его сам в ответе или в markdown. Само слово «отчёт» без заказа визуализации — не повод вызывать artificer.
