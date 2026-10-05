/* Сторінка уроку: теорія → практика → домашнє → підсумок. Уроки предмета відкриваються по черзі. */
(async function () {
  const root = document.getElementById("app");
  let st;
  try { st = await Z.boot(); } catch (e) { root.innerHTML = `<div class="card">Не вдалося завантажити дані: ${Z.esc(e.message)}</div>`; return; }
  if (!st) return;
  const id = Z.qs("id"); const meta = Z.state.byId[id];
  document.getElementById("hdr").innerHTML = Z.header("");
  document.getElementById("ftr").innerHTML = Z.footer();
  if (!meta) { root.innerHTML = `<div class="card"><h1>Урок не знайдено</h1><a class="btn" href="${Z.link("klas.html")}">До мого шляху</a></div>`; return; }
  const S = Z.state.subjMap[meta.subject];
  const subjList = Z.state.bySubject[meta.subject];
  const reportCtx = (extra) => Object.assign({ lessonId: id, subject: meta.subject, title: meta.title }, extra || {});
  Z.wireHeader(() => reportCtx({ step }));

  const av = Z.avail(meta);
  if (av === "locked") {
    const prev = Z.prevInSubject(meta);
    root.innerHTML = `<div class="card lock-card"><div class="big">🔒</div><h1>${Z.esc(meta.title)}</h1><p>${Z.subjTag(meta.subject)} Урок ${meta.n} з ${subjList.length}</p><p>Цей урок відкриється, коли ти виконаєш попередній: <b>«${Z.esc(prev.title)}»</b> — практику і домашнє завдання.</p><p><a class="btn" href="${Z.link("lesson.html", { id: prev.id })}">До попереднього уроку</a> <a class="btn ghost" href="${Z.link("subject.html", { s: meta.subject })}">Усі уроки предмета</a></p></div>`;
    return;
  }
  if (av === "soon") {
    Z.ensureDemand(meta.subject);
    root.innerHTML = `<div class="card lock-card"><div class="big">⏳</div><h1>${Z.esc(meta.title)}</h1><p>${Z.subjTag(meta.subject)} Урок ${meta.n} з ${subjList.length}</p><p>Ти дійшов до уроку, який ми саме готуємо. Команда вже отримала сигнал — урок з'явиться найближчим часом. А поки можна позайматися іншими предметами.</p><p><a class="btn" href="${Z.link("klas.html")}">До мого шляху</a></p></div>`;
    return;
  }

  let L;
  try { L = await Z.loadJSON("../" + meta.file); }
  catch (e) { root.innerHTML = `<div class="card"><h1>${Z.esc(meta.title)}</h1><div class="notice">Не вдалося відкрити урок. Перевірте інтернет і оновіть сторінку.</div></div>`; return; }
  document.title = L.title + " — " + S.name;
  const terms = L.terms || {};
  const MD = s => Z.abbrify(Z.md(s), terms);
  if (window.AiHelp) window.AiHelp.mount();
  const rec = Z.progress.ensure(id); Z.progress.save();
  /* батьки повернули урок з іншого пристрою, поки він відкритий, — перезавантажити, щоб почати з потрібного кроку */
  window.addEventListener("z-remote-update", () => { const cur = Z.progress.get(id); if (cur && cur !== rec && JSON.stringify(cur.homework.review || null) !== JSON.stringify(rec.homework.review || null)) location.reload(); });
  const seed = Z.hash(id);
  if (!rec.theory && !rec.practice.done) Z.progress.log({ type: "open", id });

  let tick = 0;
  setInterval(() => { if (document.visibilityState === "visible") { rec.time = (rec.time || 0) + 1; if (++tick % 15 === 0) Z.progress.set(id, rec); } }, 1000);
  document.addEventListener("visibilitychange", () => Z.progress.set(id, rec));
  window.addEventListener("beforeunload", () => Z.progress.set(id, rec));

  const pos = subjList.indexOf(meta); const nextL = subjList[pos + 1] || null; const prevL = subjList[pos - 1] || null;
  const STEPS = [["theory", "1. Теорія"], ["practice", "2. Практика"], ["homework", "3. Домашнє"], ["summary", "4. Підсумок"]];
  let step = !rec.theory ? "theory" : !rec.practice.done ? "practice" : !rec.homework.submitted ? "homework" : "summary";
  if (Z.qs("step")) step = Z.qs("step");

  function stepState(s) { if (s === "theory") return rec.theory ? "done" : ""; if (s === "practice") return rec.practice.done ? "done" : ""; if (s === "homework") return rec.homework.submitted ? "done" : ""; return ""; }
  /* повернутий урок: що саме треба переробити і чи вже зроблено */
  const PART_TODO = { theory: "прочитати теорію", practice: "виконати практику", homework: "зробити домашнє" };
  function partDone(p) { return p === "theory" ? !!rec.theory : p === "practice" ? !!rec.practice.done : !!rec.homework.submitted; }
  function redoNotice() {
    const parts = Z.redoParts(rec); if (!parts.length) return ""; const rv = rec.homework.review;
    return `<div class="notice">↩️ <b>Батьки повернули урок на доопрацювання.</b> Треба ще раз: ${parts.map(p => PART_TODO[p] + (partDone(p) ? " ✓" : "")).join(", ")}.${rv.comment ? `<br>Коментар: ${Z.esc(rv.comment)}` : ""}</div>`;
  }
  function finishRedo() { const parts = Z.redoParts(rec); if (parts.length && parts.every(partDone)) { rec.homework.review = null; Z.progress.log({ type: "redo_done", id }); } }
  function head() {
    return `<div class="card"><div class="lesson-head"><div style="flex:1;min-width:240px">${Z.subjTag(meta.subject)} <span class="chip">Урок ${meta.n} з ${subjList.length}</span> <span class="chip">⏱ ~${L.minutes} хв</span>
      <h1>${Z.esc(L.title)}</h1><small class="muted">${Z.esc(meta.section)}</small><div class="goal">🎯 ${MD(L.goal)}</div>${redoNotice()}</div></div>
      <div class="steps">${STEPS.map(([k, n]) => `<button data-step="${k}" class="${step === k ? "on" : ""} ${stepState(k)}">${stepState(k) === "done" ? "✓ " : ""}${n}</button>`).join("")}</div></div>`;
  }

  /* ---------- теорія ---------- */
  function theoryBlock(b) {
    const ttl = b.title ? `<b class="ttl">${MD(b.title)}</b>` : "";
    switch (b.type) {
      case "p": return `<p class="blk">${MD(b.text)}</p>`;
      case "rule": return `<div class="blk rule">${ttl || "<b class=\"ttl\">Запам'ятай</b>"}${MD(b.text)}</div>`;
      case "example": return `<div class="blk example">${ttl || "<b class=\"ttl\">Приклад</b>"}<div class="${/\n/.test(b.text) && /[\d+\-·:=|_]{3,}/.test(b.text) ? "mono" : ""}">${MD(b.text)}</div></div>`;
      case "tip": return `<div class="blk tip"><b class="ttl">💡 Підказка</b>${MD(b.text)}</div>`;
      case "list": return `<div class="blk">${ttl}<ul>${b.items.map(i => `<li>${MD(i)}</li>`).join("")}</ul></div>`;
      case "steps": return `<div class="blk">${ttl}<ol>${b.items.map(i => `<li>${MD(i)}</li>`).join("")}</ol></div>`;
      case "table": return `<div class="blk table-wrap">${ttl}<table><thead><tr>${b.head.map(h => `<th>${MD(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${MD(String(c))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      case "reading": { const lang = /[a-z]{3}/i.test(b.text) && !/[а-яіїєґ]/i.test(b.text) ? "en" : "uk"; return `<div class="blk reading"><h3>${Z.esc(b.title)} ${EX.speakBtn(b.text.replace(/\n+/g, " "), lang)}</h3>${b.author ? `<span class="author">${Z.esc(b.author)}${b.genre ? " · " + Z.esc(b.genre) : ""}</span>` : (b.genre ? `<span class="author">${Z.esc(b.genre)}</span>` : "")}${b.text.split(/\n\n+/).map(p => `<p>${MD(p)}</p>`).join("")}</div>`; }
      case "vocab": return `<div class="blk">${ttl || "<b class=\"ttl\">📒 Словник</b>"}<div class="vocab">${b.items.map(i => `<div>${EX.speakBtn(i.en, "en")}<b>${Z.esc(i.en)}</b> — ${Z.esc(i.uk)}${i.ex ? `<small class="muted" style="flex-basis:100%">${Z.esc(i.ex)}</small>` : ""}</div>`).join("")}</div></div>`;
      case "dialogue": { const lang = b.lang || "en"; return `<div class="blk dialogue">${ttl}${EX.speakBtn(b.lines.map(l => l.text).join(" "), lang)}${b.lines.map(l => `<p><span class="who">${Z.esc(l.who)}:</span> ${MD(l.text)}</p>`).join("")}</div>`; }
      case "image":
        if (b.src) return `<figure class="blk photo"><img src="${Z.esc(b.src)}" alt="${Z.esc(b.alt || b.caption || "")}" loading="lazy"><figcaption>${MD(b.caption || "")}<small>${Z.esc(b.credit || "")}${b.license ? " · " + Z.esc(b.license) : ""}${b.page ? ` · <a href="${Z.esc(b.page)}" target="_blank" rel="noopener">джерело</a>` : ""}</small></figcaption></figure>`;
        return `<div class="blk image">${Z.esc(b.emoji)}<small>${MD(b.caption)}</small></div>`;
      case "figure": return `<figure class="blk fig"><div class="svgbox">${EX.svgSafe(b.svg)}</div><figcaption>${MD(b.caption || "")}</figcaption></figure>`;
      default: return "";
    }
  }
  function termsBox() {
    const keys = Object.keys(terms); if (!keys.length) return "";
    return `<div class="blk terms"><b class="ttl">Скорочення</b><dl>${keys.map(k => `<dt>${Z.esc(k)}</dt><dd>${Z.esc(terms[k])}</dd>`).join("")}</dl></div>`;
  }
  function theoryView() {
    return `<div class="card theory"><h2 style="margin-top:0">📖 Теорія</h2>${L.theory.map(theoryBlock).join("")}${termsBox()}${extraBox()}
      <p style="margin-top:20px"><button class="btn" id="theoryDone">${rec.theory ? "До вправ ▶" : "Я прочитав — до вправ ▶"}</button></p></div>`;
  }
  function extraBox() {
    if (!Array.isArray(L.extra) || !L.extra.length) return "";
    return `<div class="blk extra"><b class="ttl">Для допитливих</b><ul>${L.extra.map(x => `<li><a href="${Z.esc(x.url)}" target="_blank" rel="noopener">${Z.esc(x.title)}</a>${x.note ? ` — <small class="muted">${Z.esc(x.note)}</small>` : ""}</li>`).join("")}</ul></div>`;
  }

  /* ---------- вправи ---------- */
  function exSet(kind) { return kind === "practice" ? L.exercises : L.homework; }
  function bucket(kind) { return kind === "practice" ? rec.practice : rec.homework; }
  function locked(kind) { return kind === "practice" ? !!rec.practice.done : !!rec.homework.submitted; }
  function exercisesView(kind) {
    const list = exSet(kind), B = bucket(kind), ro = locked(kind);
    const intro = kind === "practice"
      ? `<h2 style="margin-top:0">✏️ Практика</h2><p class="muted">Виконай усі вправи і натисни «Перевірити» під кожною. Є дві спроби: після першої помилки з'явиться підказка.</p>`
      : `<h2 style="margin-top:0">🏠 Домашнє завдання</h2><p class="muted">Виконай завдання самостійно. Письмові роботи перевірять батьки — пиши повними реченнями.</p>`;
    let review = "";
    if (kind === "homework" && rec.homework.review) { const rv = rec.homework.review; review = `<div class="notice ${rv.status === "ok" ? "okn" : ""}"><b>${rv.status === "ok" ? "✅ Батьки перевірили домашнє завдання." : "↩️ Батьки повернули завдання на доопрацювання."}</b>${rv.comment ? `<br>Коментар: ${Z.esc(rv.comment)}` : ""}<br><small class="muted">${Z.fmtDT(rv.at)}</small></div>`; }
    const cards = list.map((ex, i) => EX.render(ex, i, B.answers[i], seed + i * 7, ro)).join("");
    let foot;
    if (kind === "practice") foot = rec.practice.done ? resultBanner() : `<p style="margin-top:18px"><button class="btn ok" id="finish" disabled>Завершити практику</button> <small class="muted" id="finishHint">Спочатку перевір усі вправи.</small></p>`;
    else foot = rec.homework.submitted
      ? `<div class="result-banner"><div class="big">📬</div><b>Домашнє завдання здано ${Z.fmtDT(rec.homework.submitted)}</b>${rec.homework.score != null ? `<p>Завдання з автоперевіркою: <b>${rec.homework.score}%</b> ${Z.starsHTML(rec.homework.score)}</p>` : ""}<p class="muted">${Z.hwStatus(rec) === "ok" ? "Батьки вже перевірили. Молодець!" : "Батьки побачать твої відповіді у своєму кабінеті."}</p><p><button class="btn" data-go="summary">До підсумку ▶</button></p></div>`
      : `<p style="margin-top:18px"><button class="btn ok" id="submitHW" disabled>Здати домашнє завдання</button> <small class="muted" id="finishHint">Спочатку перевір усі завдання.</small></p>`;
    return `<div class="card" id="exwrap" data-kind="${kind}">${intro}${review}${cards}${foot}</div>`;
  }
  function resultBanner() {
    const sc = rec.practice.score, best = rec.practice.best; const stars = Z.starsOf(sc);
    const msg = sc >= 90 ? "Чудово! Ти впорався блискуче." : sc >= Z.PASS ? "Добре! Тему засвоєно." : sc >= 50 ? "Непогано, але варто повторити теорію і спробувати ще раз." : "Ця тема поки складна. Перечитай теорію і виконай практику знову.";
    return `<div class="result-banner"><div class="big">${["😕", "🙂", "😃", "🤩"][stars]}</div><h2 style="margin:4px 0">Результат: ${sc}% ${Z.starsHTML(sc)}</h2><p>${msg}${rec.practice.attempts > 1 ? ` <small class="muted">Спроба ${rec.practice.attempts}, найкращий результат ${best}%.</small>` : ""}</p>
      <p><button class="btn ghost" id="retry">↻ Повторити практику</button> <button class="btn" data-go="homework">Далі: домашнє завдання ▶</button></p></div>`;
  }
  function afterRender(kind) {
    const wrap = document.getElementById("exwrap"); if (!wrap) return;
    const list = exSet(kind), B = bucket(kind), ro = locked(kind);
    list.forEach((ex, i) => {
      const el = wrap.querySelector(`.ex[data-idx="${i}"]`); const R = B.results[i];
      if (R && R.final) showFinal(ex, el, R, kind);
      else if (!ro) { el.querySelector(".check").innerHTML = `<button class="btn sm" data-check="${i}">${EX.isManual(ex.type) ? "Готово ✓" : "Перевірити"}</button>${R && R.tries ? '<span class="chip warn">друга спроба</span>' : ""}`; }
      el.addEventListener("change", () => { if (locked(kind)) return; B.answers[i] = EX.collect(ex, el); Z.progress.set(id, rec); });
      el.addEventListener("input", () => { if (locked(kind)) return; B.answers[i] = EX.collect(ex, el); if (++tick % 5 === 0) Z.progress.set(id, rec); });
    });
    wrap.querySelectorAll("button[data-check]").forEach(b => b.onclick = () => check(kind, Number(b.dataset.check)));
    wrap.querySelectorAll("button[data-flag]").forEach(b => b.onclick = () => window.Report && window.Report.open(reportCtx({ step: kind, exercise: Number(b.dataset.flag) + 1 })));
    updateFinish(kind);
    const fin = document.getElementById("finish"); if (fin) fin.onclick = finishPractice;
    const sub = document.getElementById("submitHW"); if (sub) sub.onclick = submitHomework;
    const rt = document.getElementById("retry");
    if (rt) rt.onclick = () => {
      const m = Z.modal(`<h2>Почати практику знову?</h2><p>Попередні відповіді очистяться, найкращий результат збережеться.</p><p class="row-btns"><button class="btn ghost" data-x>Скасувати</button><button class="btn" data-y>Почати знову</button></p>`);
      m.querySelector("[data-x]").onclick = () => m.remove();
      m.querySelector("[data-y]").onclick = () => { m.remove(); rec.practice.answers = {}; rec.practice.results = {}; rec.practice.done = null; rec.practice.score = null; Z.progress.set(id, rec); Z.progress.log({ type: "retry", id }); go("practice"); };
    };
  }
  function showFinal(ex, el, R, kind) {
    el.classList.add("final", R.score === 1 ? "good" : R.score > 0 ? "part" : "bad"); EX.setReadonly(el, true); el.querySelector(".check").innerHTML = "";
    if (EX.isManual(ex.type)) { EX.feedback(el, "info", ex.type === "text" ? `📨 Відповідь збережено — її перевірять батьки.${ex.sample ? `<span class="ans">Зразок відповіді: <i>${MD(ex.sample)}</i></span>` : ""}` : "✅ Виконано"); return; }
    const lastCorrect = R.res && R.res.score === 1;
    EX.mark(ex, el, R.res || EX.grade(ex, bucket(kind).answers[el.dataset.idx]), !lastCorrect && R.score < 1);
    const pts = Math.round(R.score * 100);
    let html = R.score === 1 ? "✅ Правильно!" : lastCorrect ? `✅ Правильно — з другої спроби (зараховано ${pts}%).` : R.score > 0 ? `🟡 Частково правильно (${pts}%).` : "❌ Неправильно.";
    if (!lastCorrect && R.score < 1) html += `<span class="ans">Правильна відповідь: ${MD(EX.answerText(ex))}</span>`;
    if (ex.explain) html += `<div class="explain">${MD(ex.explain)}</div>`;
    EX.feedback(el, R.score === 1 ? "good" : R.score > 0 ? "part" : "bad", html);
  }
  function check(kind, i) {
    const ex = exSet(kind)[i], B = bucket(kind); const el = document.querySelector(`#exwrap .ex[data-idx="${i}"]`);
    const ans = EX.collect(ex, el); B.answers[i] = ans; const res = EX.grade(ex, ans);
    if (!res.complete) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); EX.feedback(el, "info", ex.type === "text" ? `Напиши трохи більше: ${res.have} з ${res.need} символів.` : ex.type === "checklist" ? "Відміть усі пункти, коли виконаєш." : ex.type === "speak" ? "Прочитай уголос і постав позначку." : "Спочатку дай відповідь на всі частини завдання."); return; }
    if (ex.type === "text" && looksLikeGibberish(ans)) { EX.feedback(el, "part", "Схоже, тут випадкові літери. Напиши справжню відповідь своїми словами — її прочитають батьки."); return; }
    const R = B.results[i] || { tries: 0, first: null, score: 0, final: false }; R.tries++;
    if (R.tries === 1) R.first = res.score;
    if (res.manual) { R.score = 1; R.final = true; }
    else if (res.score === 1) { R.score = R.tries === 1 ? 1 : Math.max(R.first, 0.75); R.final = true; }
    else if (R.tries >= 2) { R.score = Math.max(R.first || 0, Math.max(0, res.score - 0.25)); R.final = true; }
    else {
      EX.mark(ex, el, res, false);
      EX.feedback(el, "part", `🤔 Не зовсім. Спробуй ще раз — залишилась одна спроба.${ex.hint ? `<span class="ans">Підказка: ${MD(ex.hint)}</span>` : ""}`);
      el.querySelector(".check").innerHTML = `<button class="btn sm" data-check="${i}">Перевірити ще раз</button><span class="chip warn">друга спроба</span>`;
      el.querySelector("button[data-check]").onclick = () => check(kind, i);
      B.results[i] = R; Z.progress.set(id, rec); return;
    }
    R.res = { score: res.score, detail: res.detail }; B.results[i] = R; Z.progress.set(id, rec); showFinal(ex, el, R, kind); updateFinish(kind);
  }
  /* набір випадкових літер замість відповіді: мало голосних або довгі повтори без пробілів */
  function looksLikeGibberish(t) {
    const s = String(t || "").toLowerCase(); const words = s.split(/\s+/).filter(Boolean);
    const long = words.filter(w => w.length >= 14 && !/[-–]/.test(w));
    const letters = s.replace(/[^a-zа-яіїєґ']/g, ""); const vowels = letters.replace(/[^aeiouyаеєиіїоуюя]/g, "");
    return long.length >= 2 || (letters.length > 30 && vowels.length / letters.length < 0.22) || /(.{2,4})\1{4,}/.test(s.replace(/\s+/g, ""));
  }
  function updateFinish(kind) {
    const list = exSet(kind), B = bucket(kind); const allFinal = list.every((_, i) => B.results[i] && B.results[i].final);
    const btn = document.getElementById(kind === "practice" ? "finish" : "submitHW"); const hint = document.getElementById("finishHint");
    if (btn) { btn.disabled = !allFinal; if (hint) hint.textContent = allFinal ? "" : `Перевірено ${list.filter((_, i) => B.results[i] && B.results[i].final).length} з ${list.length}.`; }
  }
  function scoreOf(kind) { const list = exSet(kind), B = bucket(kind); const auto = list.map((ex, i) => [ex, B.results[i]]).filter(([ex]) => EX.isAuto(ex.type)); if (!auto.length) return 100; return Math.round(100 * auto.reduce((s, [, R]) => s + (R ? R.score : 0), 0) / auto.length); }
  function finishPractice() {
    const sc = scoreOf("practice"); rec.practice.score = sc; rec.practice.done = Date.now(); rec.practice.attempts = (rec.practice.attempts || 0) + 1; rec.practice.best = Math.max(rec.practice.best ?? 0, sc);
    finishRedo(); Z.progress.set(id, rec); Z.progress.log({ type: "practice", id, score: sc, attempt: rec.practice.attempts, time: rec.time }); celebrate(sc); go("practice");
  }
  function submitHomework() {
    const list = L.homework, B = rec.homework; const hasAuto = list.some(ex => EX.isAuto(ex.type));
    rec.homework.score = hasAuto ? scoreOf("homework") : null; rec.homework.submitted = Date.now(); finishRedo();
    const texts = list.map((ex, i) => ex.type === "text" ? { q: ex.q, a: B.answers[i] } : null).filter(Boolean);
    Z.progress.set(id, rec); Z.progress.log({ type: "homework", id, score: rec.homework.score, texts, time: rec.time });
    Z.ensureDemand(meta.subject);
    Z.toast("Домашнє завдання здано! 📬", "ok"); go("summary");
  }
  function celebrate(sc) {
    if (sc < Z.PASS || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const n = sc >= 90 ? 50 : 25;
    for (let i = 0; i < n; i++) { const s = document.createElement("span"); s.textContent = ["🎉", "⭐", "✨", "🎊"][i % 4]; s.style.cssText = `position:fixed;left:${Math.random() * 100}vw;top:-30px;font-size:${16 + Math.random() * 18}px;z-index:99;pointer-events:none;transition:transform ${1.6 + Math.random()}s ease-in,opacity 2s`; document.body.appendChild(s); requestAnimationFrame(() => { s.style.transform = `translateY(${window.innerHeight + 60}px) rotate(${Math.random() * 360}deg)`; s.style.opacity = "0"; }); setTimeout(() => s.remove(), 2600); }
  }

  /* ---------- підсумок ---------- */
  function summaryView() {
    const done = Z.statusOf(id) === "done"; const sc = rec.practice.best;
    const refl = L.reflection && L.reflection.length ? `<h3>🪞 Подумай</h3>${L.reflection.map((q, i) => `<div class="field"><label>${MD(q)}</label><textarea data-refl="${i}" rows="2">${Z.esc((rec.reflection || {})[i] || "")}</textarea></div>`).join("")}` : "";
    let nextHTML = "";
    if (nextL) {
      const a = Z.avail(nextL);
      nextHTML = a === "open" ? `<a class="btn" href="${Z.link("lesson.html", { id: nextL.id })}">Наступний урок: ${Z.esc(nextL.title)} ▶</a>`
        : a === "soon" ? `<span class="notice">⏳ Наступний урок «${Z.esc(nextL.title)}» готується — ми вже отримали сигнал, що ти до нього дійшов.</span>`
        : `<span class="muted">Наступний урок відкриється, коли цей буде виконано повністю.</span>`;
    }
    return `<div class="card"><h2 style="margin-top:0">🏁 Підсумок уроку</h2>
      <div class="grid c3"><div class="card mini"><small class="muted">Практика</small><div class="num-big">${sc != null ? sc + "%" : "—"}</div>${Z.starsHTML(sc)}${rec.practice.attempts > 1 ? `<small class="muted">спроб: ${rec.practice.attempts}</small>` : ""}</div>
      <div class="card mini"><small class="muted">Домашнє завдання</small><div class="num-mid">${Z.hwStatusName(Z.hwStatus(rec))}</div>${rec.homework.score != null ? `<small>автоперевірка: ${rec.homework.score}%</small>` : ""}</div>
      <div class="card mini"><small class="muted">Час на уроці</small><div class="num-mid">${Z.fmtTime(rec.time)}</div><small class="muted">рекомендовано ~${L.minutes} хв</small></div></div>
      ${done ? '<p class="notice okn">✅ Урок виконано повністю. Так тримати!</p>' : '<p class="notice">Щоб урок зарахувався, потрібно завершити практику і здати домашнє завдання.</p>'}
      ${refl}
      <p class="row-btns">${prevL ? `<a class="btn ghost" href="${Z.link("lesson.html", { id: prevL.id })}">◀ Попередній</a>` : ""}<a class="btn sec" href="${Z.link("subject.html", { s: meta.subject })}">Усі уроки: ${Z.esc(S.name)}</a>${done ? nextHTML : ""}</p></div>`;
  }

  /* ---------- контекст для Поясняйка ---------- */
  function theoryPlain() {
    return (L.theory || []).map(b => {
      switch (b.type) {
        case "p": case "rule": case "tip": case "example": return (b.title ? b.title + ": " : "") + b.text;
        case "list": case "steps": return (b.title ? b.title + ": " : "") + (b.items || []).join("; ");
        case "table": return (b.title ? b.title + ": " : "") + (b.head || []).join(" | ") + "\n" + (b.rows || []).map(r => r.join(" | ")).join("\n");
        case "reading": return (b.title || "") + "\n" + b.text;
        case "vocab": return (b.items || []).map(i => `${i.en} — ${i.uk}`).join("; ");
        case "dialogue": return (b.lines || []).map(l => `${l.who}: ${l.text}`).join("\n");
        case "image": case "figure": return b.caption || "";
        default: return "";
      }
    }).filter(Boolean).join("\n").slice(0, 4000) + (Object.keys(terms).length ? "\nСкорочення: " + Object.entries(terms).map(([k, v]) => `${k} — ${v}`).join("; ") : "");
  }
  function exQuestions(list) { return (list || []).map(ex => ex.q || (ex.type === "truefalse" ? (ex.items || []).map(it => it.text).join("; ") : "")).filter(Boolean); }
  function aiContext() { return { id, subject: S.name, title: L.title, step, grade: Z.state.grade, theory: (step === "theory" || step === "summary") ? theoryPlain() : "", questions: step === "practice" ? exQuestions(L.exercises) : step === "homework" ? exQuestions(L.homework) : [] }; }

  function go(s) { step = s; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function render() {
    const body = step === "theory" ? theoryView() : step === "practice" ? exercisesView("practice") : step === "homework" ? exercisesView("homework") : summaryView();
    root.innerHTML = head() + body;
    if (window.AiHelp) window.AiHelp.setContext(aiContext());
    root.querySelectorAll("button[data-step]").forEach(b => b.onclick = () => go(b.dataset.step));
    root.querySelectorAll("button[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
    const td = document.getElementById("theoryDone"); if (td) td.onclick = () => { if (!rec.theory) { rec.theory = Date.now(); finishRedo(); Z.progress.set(id, rec); } go("practice"); };
    if (step === "practice" || step === "homework") afterRender(step);
    root.querySelectorAll("textarea[data-refl]").forEach(t => t.addEventListener("input", () => { rec.reflection ||= {}; rec.reflection[t.dataset.refl] = t.value; Z.progress.set(id, rec); }));
  }
  render();
})();
