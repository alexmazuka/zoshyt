# ШІ-проксі «Зошита» (Cloudflare Worker `zoshyt-4klas-ai`)

Один Worker і один ключ Anthropic обслуговують усе: Поясняйка на платформі 1–11 класів (zoshyt.online/app/), Поясняйка в зошиті 4 класу, Кліо в зошиті історії 10 класу і ШІ-перевірку домашніх (`kind: "review"`). Адреса `https://zoshyt-4klas-ai.alex-f53.workers.dev/` не змінюється, у клієнтах нічого міняти не треба.

- Модель: `claude-haiku-5-5` (найдешевша, $0.10 вхід / $0.50 вихід за 1 млн токенів), змінюється змінною `MODEL` у `wrangler.toml`.
- Ліміти токенів: відповідь чату ≤ 350 токенів, перевірка домашнього ≤ 220; на вхід — системний промпт ≤ 6000 символів, остання репліка ≤ 4000, решта ≤ 1200, не більше 6 останніх реплік. Клієнти додатково обрізають теорію до 1800 символів і шлють 3 останні обміни.
- Мислення вимкнене, `effort: low`. Якщо модель відхилить ці поля (400), Worker повторить запит без них.
- Захист: приймає лише запити з zoshyt.online, alexmazuka.github.io і localhost; до 20 запитів/хв з однієї IP (м'яко, на ізолят); справжній обмежувач — ліміт витрат у консолі Anthropic.
- У логи пишуться лише лічильники токенів, без текстів дітей.
- Орієнтир вартості: питання в чаті ≈ 1500 токенів входу + 150 виходу ≈ $0.0002. 1000 питань ≈ $0.2.

## Розгортання (один раз)
```bash
cd zoshyt/worker
npx wrangler login                       # відкриє браузер, акаунт Cloudflare alex@matsuka.online
npx wrangler secret put ANTHROPIC_API_KEY   # вставити ключ у запит терміналу (в чат не писати)
npx wrangler deploy
```
Після деплою: старі секрети `OPENROUTER_API_KEY` / `GEMINI_API_KEY` більше не використовуються, їх можна видалити в Cloudflare (Settings → Variables and secrets).

## Перевірка
У браузері на https://zoshyt.online/app/ відкрити урок → 🦉 → поставити питання. Або `curl -i -X OPTIONS -H 'Origin: https://zoshyt.online' https://zoshyt-4klas-ai.alex-f53.workers.dev/` має віддати `204` і `access-control-allow-origin: https://zoshyt.online`.
