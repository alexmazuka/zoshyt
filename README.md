# Зошит — сторінка пілоту

Лендинг із записом на безкоштовний пілот цифрового робочого зошита для 4 класу від NextEducationAI.

- Сторінка: https://alexmazuka.github.io/zoshyt/ (надалі — https://zoshyt.nexteducationai.org)
- Заявки збирає Formspree, форма `mykqewaj`: https://formspree.io/forms/mykqewaj/submissions
- Щоб бачити, звідки прийшла заявка, додавайте до посилання `?from=назва-каналу`, наприклад `?from=fb-simeyna-forma`. Значення потрапить у поле «Звідки».

## Субдомен zoshyt.nexteducationai.org

1. У DNS домену (NS: pid1.srv53.net / pid2.srv53.org) додати запис `zoshyt  CNAME  alexmazuka.github.io.`
2. Коли запис почне резолвитися: Settings → Pages → Custom domain = `zoshyt.nexteducationai.org`, увімкнути Enforce HTTPS.
3. Замінити в `index.html` адресу `og:image` на `https://zoshyt.nexteducationai.org/og.png`.

## Структура

`index.html` — уся сторінка (CSS і JS всередині) · `fonts/` — локальні шрифти, без Google Fonts і сторонніх запитів · `og.png` — картинка для прев'ю посилання · `favicon.svg`.
