/* Кабінет батьків: огляд, уроки з відповідями і перевіркою домашніх, журнал, звіт, налаштування */
(async function () {
  const root = document.getElementById("app");
  let st;
  try { st = await Z.boot(); } catch (e) { root.innerHTML = `<div class="card">Не вдалося завантажити дані: ${Z.esc(e.message)}</div>`; return; }
  if (!st) return;
  document.getElementById("hdr").innerHTML = Z.header("parent");
  document.getElementById("ftr").innerHTML = Z.footer();
  Z.wireHeader(() => ({ page: "Кабінет батьків" }));
  const KEY = "zparent." + Z.state.user.uid;
  const cache = {};
  async function lessonFile(id) { if (!(id in cache)) { try { cache[id] = await Z.loadJSON("../" + Z.state.byId[id].file); } catch (e) { cache[id] = null; } } return cache[id]; }

  if (sessionStorage.getItem(KEY) !== "1") {
    root.innerHTML = `<div class="card auth"><h1>Кабінет батьків</h1><p class="muted">Тут ви бачите відповіді дитини і перевіряєте домашні завдання. Введіть PIN, який ви створили під час першого входу.</p>
      <form id="pf"><div class="field"><label for="pin">PIN</label><input id="pin" type="password" inputmode="numeric" autocomplete="off" required></div><p class="err" id="err" role="alert"></p><p><button class="btn" type="submit">Увійти</button></p></form>
      <p class="muted small">Забули PIN? Напишіть на info@nexteducationai.org — допоможемо скинути.</p></div>`;
    document.getElementById("pin").focus();
    document.getElementById("pf").onsubmit = async e => {
      e.preventDefault();
      if (await Z.checkPin(document.getElementById("pin").value.trim())) { sessionStorage.setItem(KEY, "1"); location.reload(); }
      else { document.getElementById("err").textContent = "Невірний PIN."; document.getElementById("pin").value = ""; }
    };
    return;
  }

  const TABS = [["overview", "Огляд"], ["lessons", "Уроки і домашні"], ["journal", "Журнал"], ["report", "Звіт"], ["settings", "Налаштування"]];
  let tab = Z.qs("tab") || "overview"; let subjFilter = ""; let onlyHW = false; let onlyFlag = false; let openId = Z.qs("id") || null; let flash = null;
  const ch = Z.state.child;

  function overview() {
    const A = Z.summary(); const log = Z.progress.load().log; const last = log.length ? log[log.length - 1] : null;
    const waiting = Z.state.plan.filter(l => Z.hwStatus(Z.progress.get(l.id)) === "submitted");
    const mode = Z.checkMode(); const flagged = Z.state.plan.filter(l => { const r = Z.progress.get(l.id); return r && r.homework.review && r.homework.review.status === "ok" && r.homework.review.flag; });
    const tiles = [[`${A.done}`, "уроків виконано"], [A.avg != null ? A.avg + "%" : "—", "середній бал за практику"], [waiting.length, "домашніх чекають перевірки"], [Z.fmtTime(A.time), "часу за уроками"], [Z.streak() + " дн.", "днів поспіль"], [last ? Z.fmtDT(last.t) : "—", "остання активність"]];
    const rows = Z.state.subjects.map(sub => {
      const S = Z.summary(l => l.subject === sub.id); const fr = Z.frontier(sub.id); const a = fr ? Z.avail(fr) : null;
      return `<tr><td><span class="dot" style="--c:${sub.color}"></span> ${Z.esc(sub.name)}</td><td>${S.done}/${S.total}</td><td>${fr ? `Урок ${fr.n}. ${Z.esc(fr.title)}${a === "soon" ? ' <span class="soon">⏳ готується</span>' : a === "locked" ? ` <span class="soon">${Z.esc(Z.lockText(Z.lockInfo(fr)))}</span>` : ""}` : '<span class="pill-ok">усе виконано</span>'}</td><td>${S.avg != null ? S.avg + "%" : "—"}</td><td>${S.hwOk}/${S.hwOk + S.hwWait}</td><td>${Z.fmtTime(S.time)}</td></tr>`;
    }).join("");
    return `<div class="grid c3">${tiles.map(t => `<div class="card mini"><div class="num-big">${t[0]}</div><small class="muted">${t[1]}</small></div>`).join("")}</div>
      <div class="notice ${mode === "parent" ? "" : "okn"}">Режим: <b>${Z.CHECK_MODES[mode]}</b> — ${mode === "parent" ? "наступний урок відкривається після вашої перевірки домашнього." : "домашнє перевіряє Поясняйко і сам відкриває наступні уроки; ви бачите все тут і можете повернути будь-який урок."} <a href="#" id="toMode">Змінити</a></div>
      ${waiting.length ? `<div class="notice">📬 Домашніх на перевірку: <b>${waiting.length}</b>.${mode === "parent" ? " Поки ви не перевірите, наступні уроки цих предметів закриті." : ""} <a href="#" id="toHW">Перевірити →</a></div>` : ""}
      ${flagged.length ? `<div class="notice">⚑ Поясняйко позначив для вас: <b>${flagged.length}</b> — варто переглянути. <a href="#" id="toFlag">Показати →</a></div>` : ""}
      <div class="card"><h2 style="margin-top:0">За предметами</h2><div class="table-wrap"><table><thead><tr><th>Предмет</th><th>Уроки</th><th>Зараз на уроці</th><th>Сер. бал</th><th>ДЗ перевірено</th><th>Час</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function lessonsTab() {
    let ls = Z.state.plan.filter(l => Z.progress.get(l.id));
    if (subjFilter) ls = ls.filter(l => l.subject === subjFilter);
    if (onlyHW) ls = ls.filter(l => Z.hwStatus(Z.progress.get(l.id)) === "submitted");
    if (onlyFlag) ls = ls.filter(l => { const rv = Z.progress.get(l.id).homework.review; return rv && rv.status === "ok" && rv.flag; });
    ls.sort((a, b) => (Z.progress.get(b.id).last || 0) - (Z.progress.get(a.id).last || 0));
    const rows = ls.map(l => {
      const r = Z.progress.get(l.id); const h = Z.hwStatus(r); const hwCls = h === "ok" ? "pill-ok" : h === "submitted" ? "pill-warn" : h === "redo" ? "pill-bad" : "muted";
      return `<tr class="${openId === l.id ? "sel" : ""}"><td>${Z.subjTag(l.subject)}</td><td><b>${Z.esc(l.title)}</b><br><small class="muted">урок ${l.n} · ${Z.statusName(Z.statusOf(l.id))}</small></td><td>${r.practice.best != null ? `<b>${r.practice.best}%</b> ${Z.starsHTML(r.practice.best)}` : "—"}</td><td class="${hwCls}">${hwCell(r)}</td><td>${Z.fmtTime(r.time)}<br><small class="muted">${Z.fmtDT(r.last)}</small></td><td><button class="btn sm sec" data-open="${l.id}">Деталі</button></td></tr>`;
    }).join("");
    return `<div class="card"><div class="toolbar"><label>Предмет <select id="sf"><option value="">усі</option>${Z.state.subjects.map(s => `<option value="${s.id}" ${s.id === subjFilter ? "selected" : ""}>${Z.esc(s.name)}</option>`).join("")}</select></label><label><input type="checkbox" id="oh" ${onlyHW ? "checked" : ""}> лише домашні на перевірку</label></div>
      <div class="table-wrap"><table><thead><tr><th>Предмет</th><th>Урок</th><th>Практика</th><th>Домашнє</th><th>Час</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">Ще немає уроків, які дитина відкривала.</td></tr>'}</tbody></table></div></div><div id="detail"></div>`;
  }

  /* повернення на доопрацювання: що саме повернути; попередня спроба зберігається для батьків */
  const PARTS = [["theory", "📖 Теорію — прочитати ще раз"], ["practice", "✏️ Практику — виконати заново"], ["homework", "🏠 Домашнє — зробити заново"]];
  const PART_SHORT = { theory: "теорія", practice: "практика", homework: "домашнє" };
  function partsHTML(rv) { const redo = rv && rv.status === "redo"; const cur = redo ? (rv.parts || ["homework"]) : null; return `<div class="field rv-parts" ${redo ? "" : "hidden"}><b>Що повернути:</b>${PARTS.map(([k, n]) => `<label><input type="checkbox" name="rvp" value="${k}" ${!cur || cur.includes(k) ? "checked" : ""}> ${n}</label>`).join("")}</div>`; }
  function returnLesson(r, parts, comment) {
    const snap = { at: Date.now(), comment, parts };
    if (parts.includes("practice")) snap.practice = { answers: r.practice.answers, results: r.practice.results, score: r.practice.score };
    if (parts.includes("homework")) snap.homework = { answers: r.homework.answers, results: r.homework.results, score: r.homework.score, submitted: r.homework.submitted };
    r.returned = (r.returned || []).concat([snap]).slice(-5);
    if (parts.includes("theory")) r.theory = null;
    if (parts.includes("practice")) Object.assign(r.practice, { answers: {}, results: {}, score: null, done: null });
    if (parts.includes("homework")) Object.assign(r.homework, { answers: {}, results: {}, score: null, submitted: null });
  }
  function whoChecked(rv) { return !rv ? "" : rv.by === "ai" ? "Поясняйко" : rv.by === "auto" ? "автоперевірка" : "ви"; }
  function hwCell(r) {
    const h = Z.hwStatus(r); const rv = r.homework.review;
    if (h === "ok") return `перевірено ✓ <small class="muted">(${whoChecked(rv)})</small>${rv.flag ? '<br><span class="pill-warn">⚑ варто переглянути</span>' : ""}`;
    if (h === "redo") return `${Z.hwStatusName(h)}${rv && rv.by !== "parent" ? ' <small class="muted">(Поясняйко)</small>' : ""}`;
    return Z.hwStatusName(h);
  }
  async function detail(id) {
    const box = document.getElementById("detail"); const meta = Z.state.byId[id]; const r = Z.progress.get(id); const L = await lessonFile(id);
    if (!L) { box.innerHTML = '<div class="card">Файл уроку недоступний.</div>'; return; }
    const block = (list, B) => list.map((ex, i) => {
      const R = (B.results || {})[i]; const ua = EX.userAnswerText(ex, (B.answers || {})[i]); const manual = EX.isManual(ex.type);
      const verdict = !R || !R.final ? '<span class="muted">не виконано</span>' : manual ? '<span class="pill-warn">на перевірку</span>' : R.score === 1 ? `<span class="pill-ok">✓ правильно${R.tries > 1 ? " (2-га спроба)" : ""}</span>` : R.score > 0 ? `<span class="pill-warn">частково ${Math.round(R.score * 100)}%</span>` : '<span class="pill-bad">✗ неправильно</span>';
      return `<div class="ans-row"><div class="q">${i + 1}. ${Z.md(ex.q || "Так чи ні?")} — ${verdict}</div><div class="child">${Z.esc(ua)}</div>${(!R || R.score < 1 || manual) && ex.type !== "checklist" && ex.type !== "speak" ? `<small class="muted">${manual ? "Зразок" : "Правильно"}: ${Z.esc(EX.answerText(ex))}</small>` : ""}</div>`;
    }).join("");
    const rv = r && r.homework.review;
    const log = Z.progress.load().log || [];
    const asks = log.filter(e => e.type === "ai_ask" && e.id === id); const opens = log.filter(e => e.type === "ai_open" && e.id === id).length;
    const ai = asks.length || opens ? `<div class="card soft"><h3 style="margin-top:0">🦉 Поясняйко</h3><p class="muted">Відкривав чат: ${opens} · запитань: ${asks.length}</p>${asks.map(e => `<div class="ans-row"><div class="q">🧒 ${Z.md(e.q)}</div><div class="child">🦉 ${Z.md(e.a)}</div><small class="muted">${Z.fmtDT(e.t)}</small></div>`).join("")}</div>` : "";
    box.innerHTML = `<div class="card detail"><div class="row-btns" style="justify-content:space-between"><h2 style="margin:0">${Z.subjTag(meta.subject)} ${Z.esc(L.title)}</h2><a class="btn sm ghost" href="${Z.link("lesson.html", { id })}" target="_blank">Відкрити урок ↗</a></div>
      ${!r ? '<p class="muted">Дитина ще не відкривала цей урок.</p>' : `<p class="muted">Відкрито: ${Z.fmtDT(r.opened)} · теорію прочитано: ${r.theory ? Z.fmtDT(r.theory) : "ні"} · час: ${Z.fmtTime(r.time)}</p>
      <h3>Практика ${r.practice.done ? `— ${r.practice.score}% (найкращий ${r.practice.best}%, спроб ${r.practice.attempts})` : "— не завершено"}</h3>${block(L.exercises, r.practice)}
      <h3>Домашнє завдання — ${Z.hwStatusName(Z.hwStatus(r))}${r.homework.submitted ? ", здано " + Z.fmtDT(r.homework.submitted) : ""}</h3>${block(L.homework, r.homework)}
      ${r.homework.submitted || rv ? `<div class="card soft"><h3 style="margin-top:0">Ваша перевірка</h3>${rv ? `<p class="muted">Зараз: <b>${rv.status === "ok" ? "прийнято" : "повернуто"}</b> (перевірив${rv.by === "parent" || !rv.by ? "и ви" : ": " + whoChecked(rv)}) ${Z.fmtDT(rv.at)}${rv.comment ? " — " + Z.esc(rv.comment) : ""}</p>` : ""}
        <div class="field"><label><input type="radio" name="rv" value="ok" ${!rv || rv.status === "ok" ? "checked" : ""}> ✅ Прийнято</label><label><input type="radio" name="rv" value="redo" ${rv && rv.status === "redo" ? "checked" : ""}> ↩️ Повернути на доопрацювання</label></div>${partsHTML(rv)}
        <div class="field"><label for="rvc">Коментар для дитини</label><textarea id="rvc" rows="3">${Z.esc(rv ? rv.comment || "" : "")}</textarea></div><button class="btn ok" id="saveRv">Зберегти перевірку</button></div>` : ""}
      ${(r && r.returned || []).length ? `<details class="prev"><summary>Попередні спроби (${r.returned.length})</summary>${r.returned.slice().reverse().map(s => `<div class="prev-item"><p class="muted">Повернуто ${Z.fmtDT(s.at)}: ${(s.parts || ["homework"]).map(p => PART_SHORT[p]).join(", ")}${s.comment ? " — «" + Z.esc(s.comment) + "»" : ""}</p>${s.practice ? `<h4>Практика${s.practice.score != null ? " — " + s.practice.score + "%" : ""}</h4>${block(L.exercises, s.practice)}` : ""}${s.homework ? `<h4>Домашнє</h4>${block(L.homework, s.homework)}` : ""}</div>`).join("")}</details>` : ""}
      ${ai}`}</div>`;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    box.querySelectorAll("input[name=rv]").forEach(i => i.onchange = () => { const p = box.querySelector(".rv-parts"); if (p) p.hidden = box.querySelector("input[name=rv]:checked").value !== "redo"; });
    const sv = document.getElementById("saveRv");
    if (sv) sv.onclick = () => {
      const status = box.querySelector("input[name=rv]:checked").value; const comment = document.getElementById("rvc").value.trim();
      const parts = status === "redo" ? [...box.querySelectorAll("input[name=rvp]:checked")].map(i => i.value) : [];
      if (status === "redo" && !parts.length) { Z.toast("Позначте, що саме повернути: теорію, практику чи домашнє", "bad"); return; }
      if (status === "redo") returnLesson(r, parts, comment);
      r.homework.review = status === "redo" ? { status, comment, at: Date.now(), parts, by: "parent" } : { status, comment, at: Date.now(), by: "parent" };
     
      Z.progress.set(id, r); Z.progress.log({ type: "review", id, status, comment, parts }); openId = null; const u = new URL(location.href); if (u.searchParams.has("id")) { u.searchParams.delete("id"); history.replaceState(null, "", u.pathname + u.search); }
      flash = status === "redo" ? { cls: "", html: `↩️ <b>«${Z.esc(L.title)}»</b>: повернуто дитині на доопрацювання — ${parts.map(p => PART_SHORT[p]).join(", ")}.${comment ? " Ваш коментар буде видно в уроці." : ""}` } : { cls: "okn", html: `✅ <b>«${Z.esc(L.title)}»</b>: домашнє прийнято.` };
      render(); window.scrollTo({ top: 0, behavior: "smooth" });
    };
  }

  function journal() {
    const log = Z.progress.load().log.slice().reverse().slice(0, 300);
    const name = t => ({ open: "відкрив урок", practice: "завершив практику", homework: "здав домашнє", retry: "повторює практику", review: "перевірка батьків", ai_open: "відкрив Поясняйка", ai_ask: "запитав Поясняйка" }[t] || t);
    return `<div class="card"><h2 style="margin-top:0">Журнал подій</h2><div class="table-wrap"><table><thead><tr><th>Коли</th><th>Подія</th><th>Урок</th><th>Результат</th></tr></thead><tbody>${log.map(e => { const l = e.id ? Z.state.byId[e.id] : null; return `<tr><td>${Z.fmtDT(e.t)}</td><td>${name(e.type)}</td><td>${l ? Z.subjTag(l.subject) + " " + Z.esc(l.title) : ""}</td><td>${e.score != null ? e.score + "%" : ""}${e.status ? (e.status === "ok" ? "прийнято" : "повернуто") + (e.comment ? ": " + Z.esc(e.comment) : "") : ""}</td></tr>`; }).join("") || '<tr><td colspan="4" class="muted">Подій ще немає</td></tr>'}</tbody></table></div></div>`;
  }

  function reportText() {
    const since = Date.now() - 7 * 864e5; const log = Z.progress.load().log.filter(e => e.t >= since);
    const doneIds = new Set(log.filter(e => e.type === "homework").map(e => e.id)); const scores = log.filter(e => e.type === "practice").map(e => e.score);
    const lines = [`📘 «Зошит» — ${ch.name}, ${Z.gradeLabel(ch.grade)}`, `Останні 7 днів`, "", `Уроків завершено: ${doneIds.size}`, `Середній бал практики: ${scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) + "%" : "—"}`, "", "За предметами:"];
    Z.state.subjects.forEach(s => { const n = [...doneIds].filter(id => Z.state.byId[id] && Z.state.byId[id].subject === s.id).length; if (n) lines.push(`• ${s.name}: ${n}`); });
    const A = Z.summary(); lines.push("", `Разом за семестр: ${A.done} уроків, ${A.stars} зірок, серія ${Z.streak()} дн.`);
    return lines.join("\n");
  }
  function report() {
    return `<div class="card"><h2 style="margin-top:0">Звіт за тиждень</h2><textarea id="rep" rows="12" class="mono-area">${Z.esc(reportText())}</textarea>
      <p class="row-btns"><button class="btn" id="copy">Копіювати</button><a class="btn sec" id="tg" target="_blank" rel="noopener" href="#">Надіслати в Telegram</a></p></div>`;
  }

  function settingsTab() {
    const mode = Z.checkMode();
    return `<div class="card" id="modeCard"><h2 style="margin-top:0">Як перевіряти домашні</h2>
      <label class="mode-opt"><input type="radio" name="cm" value="parent" ${mode === "parent" ? "checked" : ""}><span><b>👨‍👩‍👧 Перевіряю я</b><br><small class="muted">Після кожного домашнього урок чекає вашої перевірки. Наступний урок предмета відкривається, коли ви приймете домашнє.</small></span></label>
      <label class="mode-opt"><input type="radio" name="cm" value="ai" ${mode === "ai" ? "checked" : ""}><span><b>🦉 Дитина вчиться сама</b><br><small class="muted">Домашнє одразу перевіряє Поясняйко: зараховує і відкриває наступний урок або повертає з підказкою, що доробити. Ви бачите всі перевірки тут і можете повернути будь-який урок.</small></span></label>
      <button class="btn" id="saveMode">Зберегти режим</button></div>
      <div class="card"><h2 style="margin-top:0">Дитина</h2><div class="field"><label for="nm">Ім'я</label><input id="nm" value="${Z.esc(ch.name)}" maxlength="30"></div><button class="btn" id="saveName">Зберегти ім'я</button></div>
      <div class="card"><h2 style="margin-top:0">PIN кабінету батьків</h2><div class="field"><label for="p1">Новий PIN (4–8 цифр)</label><input id="p1" type="password" inputmode="numeric" autocomplete="new-password"></div><div class="field"><label for="p2">Повторіть</label><input id="p2" type="password" inputmode="numeric" autocomplete="new-password"></div><button class="btn" id="savePin">Змінити PIN</button></div>`;
  }

  /* одноразова плашка з результатом дії (напр. після перевірки домашнього) */
  function flashHTML() { if (!flash) return ""; const f = flash; flash = null; return `<div class="notice ${f.cls}" role="status">${f.html}</div>`; }
  function render() {
    root.innerHTML = `<h1 class="page-h">Кабінет батьків · ${Z.esc(ch.name)}</h1><div class="tabs">${TABS.map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? "on" : ""}">${n}</button>`).join("")}<button class="btn sm ghost" id="exit" style="margin-left:auto">Вийти з кабінету</button></div>`
      + flashHTML() + (tab === "overview" ? overview() : tab === "lessons" ? lessonsTab() : tab === "journal" ? journal() : tab === "report" ? report() : settingsTab());
    root.querySelectorAll("button[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; openId = null; onlyFlag = false; render(); });
    document.getElementById("exit").onclick = () => { sessionStorage.removeItem(KEY); location.href = Z.link("klas.html"); };
    const tm = document.getElementById("toMode"); if (tm) tm.onclick = e => { e.preventDefault(); tab = "settings"; render(); };
    const tf = document.getElementById("toFlag"); if (tf) tf.onclick = e => { e.preventDefault(); tab = "lessons"; onlyHW = false; onlyFlag = true; render(); };
    const th = document.getElementById("toHW"); if (th) th.onclick = e => { e.preventDefault(); tab = "lessons"; onlyHW = true; render(); };
    root.querySelectorAll("button[data-open]").forEach(b => b.onclick = () => { openId = b.dataset.open; render(); detail(openId); });
    const sf = document.getElementById("sf"); if (sf) sf.onchange = () => { subjFilter = sf.value; render(); };
    const oh = document.getElementById("oh"); if (oh) oh.onchange = () => { onlyHW = oh.checked; onlyFlag = false; render(); };
    if (tab === "lessons" && openId) detail(openId);
    if (tab === "report") {
      const txt = () => document.getElementById("rep").value;
      document.getElementById("copy").onclick = () => navigator.clipboard.writeText(txt()).then(() => Z.toast("Скопійовано", "ok"));
      const upd = () => { document.getElementById("tg").href = "https://t.me/share/url?url=" + encodeURIComponent(location.origin) + "&text=" + encodeURIComponent(txt()); };
      upd(); document.getElementById("rep").oninput = upd;
    }
    if (tab === "settings") {
      document.getElementById("saveMode").onclick = async () => {
        const m = root.querySelector("input[name=cm]:checked").value;
        const kids = Z.state.profile.children.map(c => c.id === ch.id ? Object.assign({}, c, { checkMode: m }) : c);
        await Z.DB.set("users", Z.state.user.uid, { children: kids }, true); Z.state.profile.children = kids; ch.checkMode = m;
        flash = { cls: "okn", html: `Режим змінено: <b>${Z.CHECK_MODES[m]}</b>.` }; tab = "overview"; render(); window.scrollTo({ top: 0, behavior: "smooth" });
      };
      document.getElementById("saveName").onclick = async () => {
        const nm = document.getElementById("nm").value.trim(); if (!nm) return;
        const kids = Z.state.profile.children.map(c => c.id === ch.id ? Object.assign({}, c, { name: nm }) : c);
        await Z.DB.set("users", Z.state.user.uid, { children: kids }, true); ch.name = nm; Z.toast("Збережено", "ok"); document.getElementById("hdr").innerHTML = Z.header("parent"); Z.wireHeader(() => ({ page: "Кабінет батьків" })); render();
      };
      document.getElementById("savePin").onclick = async () => {
        const p1 = document.getElementById("p1").value.trim(), p2 = document.getElementById("p2").value.trim();
        if (!/^\d{4,8}$/.test(p1)) { Z.toast("PIN — від 4 до 8 цифр", "bad"); return; }
        if (p1 !== p2) { Z.toast("PIN і повторення не збігаються", "bad"); return; }
        await Z.setPin(p1); Z.toast("PIN змінено", "ok"); render();
      };
    }
  }
  window.addEventListener("z-remote-update", () => { if (tab !== "lessons") render(); });
  render();
})();
