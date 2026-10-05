/* Перевірка домашнього Поясняйком — режим «Дитина вчиться сама».
   Завдання з автоперевіркою вже мають бал; письмові відповіді оцінює ШІ через той самий проксі, що й чат Поясняйка.
   Прийнято → наступний урок предмета відкривається. Ні → домашнє повертається з підказкою (відповіді лишаються, дитина виправляє).
   Якщо ШІ недоступний, домашнє зараховується за автоперевіркою з позначкою для батьків «варто переглянути». */
window.Check = (function () {
  const PROXY = "https://zoshyt-4klas-ai.alex-f53.workers.dev/";
  const MAX_RETURNS = 2; // після двох повернень ШІ більше не повертає, а позначає урок для батьків
  const cache = {};
  async function lessonData(meta) { if (!cache[meta.id]) cache[meta.id] = await Z.loadJSON("../" + meta.file); return cache[meta.id]; }
  function pending(rec) { return !!(rec && rec.homework && rec.homework.submitted && !rec.homework.review); }

  async function askAI(L, meta, items) {
    const grade = Number(String(Z.state.grade).replace("g", ""));
    const subj = (Z.state.subjMap[meta.subject] || {}).name || "";
    const system = [
      `Ти — Поясняйко, доброзичливий учитель, який перевіряє письмові відповіді учня ${grade} класу з предмета «${subj}».`,
      "Оціни кожну відповідь: чи вона відповідає на запитання, чи по суті, чи достатньо повна для цього віку. Не вимагай досконалості й не знижуй за дрібні описки: зараховуй, якщо відповідь загалом правильна і по темі.",
      "ok=false лише тоді, коли хоч одна відповідь не по темі, порожня по суті або містить грубу фактичну помилку.",
      "У коментарі не наводь готову відповідь і не цитуй зразок — лише похвали, що вийшло, і підкажи, у якому напрямку доробити.",
      'Відповідай ЛИШЕ JSON, без жодного іншого тексту: {"ok": true або false, "comment": "1–3 речення для дитини українською"}',
    ].join("\n");
    const user = `Урок: «${L.title}».\n\n` + items.map((x, k) => `Завдання ${k + 1}: ${x.ex.q}\nЗразок відповіді (лише для тебе): ${x.ex.sample || "—"}\nВідповідь учня: ${x.a || "(порожньо)"}`).join("\n\n");
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(PROXY, { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system, messages: [{ role: "user", content: user }] }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.text) throw new Error(data.error || "HTTP " + res.status);
      const m = String(data.text).match(/\{[\s\S]*\}/); if (!m) throw new Error("no json");
      const v = JSON.parse(m[0]); if (typeof v.ok !== "boolean") throw new Error("bad json");
      return { ok: v.ok, comment: String(v.comment || "").trim().slice(0, 600) };
    } finally { clearTimeout(to); }
  }

  /* перевірити домашнє одного уроку; повертає нову review або null, якщо перевіряти нічого */
  async function run(meta, rec) {
    if (!pending(rec)) return null;
    const L = await lessonData(meta);
    const sc = rec.homework.score; const autoOk = sc == null || sc >= Z.PASS;
    const items = (L.homework || []).map((ex, i) => ({ ex, a: String((rec.homework.answers || {})[i] || "").trim() })).filter(x => x.ex.type === "text");
    let ok = autoOk, by = "auto", flag = false; const notes = [];
    if (!autoOk) notes.push(`Завдання з автоперевіркою виконано на ${sc}% — переглянь помилки і спробуй ще раз.`);
    if (items.length) {
      try { const v = await askAI(L, meta, items); ok = ok && v.ok; by = "ai"; if (v.comment) notes.push(v.comment); }
      catch (e) { flag = true; notes.push("Письмові відповіді Поясняйко зараз перевірити не зміг — їх перегляне хтось із дорослих."); }
    }
    if (!ok && (rec.aiReturns || 0) >= MAX_RETURNS) { ok = true; flag = true; notes.push("Зараховано після кількох спроб — батьки переглянуть це домашнє."); }
    const comment = notes.join(" ") || (by === "ai" ? "Молодець! Домашнє зараховано." : "Зараховано за автоперевіркою.");
    if (ok) {
      rec.aiReturns = 0;
      rec.homework.review = { status: "ok", comment, at: Date.now(), by, flag };
    } else {
      rec.aiReturns = (rec.aiReturns || 0) + 1;
      rec.homework.review = { status: "redo", comment, at: Date.now(), by, parts: ["homework"] };
      rec.homework.submitted = null; rec.homework.results = {}; // відповіді лишаються — дитина виправляє помилки
    }
    Z.progress.set(meta.id, rec);
    Z.progress.log({ type: "ai_review", id: meta.id, status: rec.homework.review.status, by, comment });
    return rec.homework.review;
  }

  /* перевірити все, що чекає перевірки (наприклад, якщо дитина закрила сторінку до кінця перевірки) */
  async function runPending(limit) {
    let n = 0;
    for (const l of Z.state.plan) {
      if (n >= (limit || 3)) break;
      const rec = Z.progress.get(l.id);
      if (pending(rec)) { try { if (await run(l, rec)) n++; } catch (e) { console.warn("check", l.id, e); } }
    }
    return n;
  }
  return { run, runPending, pending };
})();
