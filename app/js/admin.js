/* Адмін-панель команди: що нового, які уроки дописати, повідомлення про помилки, прогрес учнів, доступи тестувальників */
(async function () {
  const root = document.getElementById("app");
  const GRADES = Array.from({ length: 11 }, (_, i) => "g" + String(i + 1).padStart(2, "0"));
  const REPORT_ST = { new: "нове", work: "в роботі", fixed: "виправлено", rejected: "відхилено" };
  try { await Z.DB.init(); } catch (e) { root.innerHTML = `<div class="card">Не вдалося підключитися: ${Z.esc(e.message)}</div>`; return; }
  const u = Z.DB.user();
  if (!u) { location.href = "index.html"; return; }
  if (!Z.DB.isAdmin()) { root.innerHTML = `<div class="card auth"><h1>Немає доступу</h1><p class="muted">Адмін-панель доступна лише команді.</p><p><a class="btn" href="index.html">На головну</a></p></div>`; return; }
  Z.state.user = u;
  const SEEN_KEY = "zadmin.seen"; const seenBefore = Number(localStorage.getItem(SEEN_KEY) || 0);
  const APP_URL = location.origin + location.pathname.replace(/[^/]*$/, "");

  document.getElementById("hdr").innerHTML = `<header class="top"><a class="brand" href="index.html"><span class="logo-word">Зошит</span><small>адмін-панель · ${Z.esc(u.email)}</small></a><nav></nav><div class="me"><a class="chip" href="index.html">До сім'ї</a><button class="chip btn-link" id="out" type="button">Вийти</button></div></header>`;
  document.getElementById("ftr").innerHTML = Z.footer();
  document.getElementById("out").onclick = async () => { await Z.DB.signOut(); location.href = "index.html"; };

  /* ---------- дані ---------- */
  const grades = {}; // g → {subjects, subjMap, plan, byId, bySubject}
  async function grade(g) {
    if (g in grades) return grades[g];
    try {
      const [subj, plan] = await Promise.all([Z.loadJSON("../data/" + g + "/subjects.json"), Z.loadJSON("../data/" + g + "/plan.json")]);
      const G = { g, subjects: subj.subjects, subjMap: Object.fromEntries(subj.subjects.map(s => [s.id, s])), plan: plan.lessons, byId: {}, bySubject: {} };
      plan.lessons.forEach(l => { G.byId[l.id] = l; (G.bySubject[l.subject] ||= []).push(l); });
      Object.values(G.bySubject).forEach(list => list.sort((a, b) => a.n - b.n));
      grades[g] = G;
    } catch (e) { grades[g] = null; }
    return grades[g];
  }
  let D = null;
  async function loadAll() {
    const safe = p => p.catch(e => { console.warn(e); return []; });
    const [demand, reports, progress, allow] = await Promise.all([safe(Z.DB.list("demand")), safe(Z.DB.list("reports")), safe(Z.DB.list("progress")), safe(Z.DB.list("allowlist"))]);
    await Promise.all(GRADES.map(grade));
    reports.sort((a, b) => Z.DB.tsToMs(b.createdAt) - Z.DB.tsToMs(a.createdAt));
    progress.sort((a, b) => ((b.summary || {}).last || 0) - ((a.summary || {}).last || 0));
    allow.sort((a, b) => Z.DB.tsToMs(b.createdAt) - Z.DB.tsToMs(a.createdAt));
    D = { demand: demand.map(needOf).filter(Boolean), reports, progress, allow };
  }
  /* що саме треба дописати за сигналом demand: уроки з номером ≤ maxN, файлів яких ще немає */
  function needOf(d) {
    const G = grades[d.grade]; if (!G) return null;
    const list = G.bySubject[d.subject] || []; const missing = list.filter(l => l.n <= (d.maxN || 0) && !l.exists);
    return Object.assign({}, d, { G, subjName: G.subjMap[d.subject] ? G.subjMap[d.subject].name : d.subject, missing, written: list.filter(l => l.exists).length, total: list.length });
  }
  const isNew = ts => Z.DB.tsToMs(ts) > seenBefore;
  const ago = ts => { const ms = Z.DB.tsToMs(ts); return ms ? Z.fmtDT(ms) : "—"; };
  const lessonTitle = (g, id) => { const G = grades[g]; const l = G && G.byId[id]; return l ? l.title : id; };

  function taskText(items) {
    const lines = ["Допиши уроки «Зошита» (репо alexmazuka/zoshyt) за правилами AUTHORING.md — лише ці файли:"];
    items.forEach(d => { lines.push("", `${Z.gradeLabel(d.grade)} · ${d.subjName} (${d.grade}/${d.subject}):`); d.missing.forEach(l => lines.push(`  ${l.id} — ${l.title}`)); });
    lines.push("", "Після запису: python3 tools/validate.py gXX → python3 tools/build_plan.py gXX → коміт і пуш.");
    return lines.join("\n");
  }
  function copy(text) { navigator.clipboard.writeText(text).then(() => Z.toast("Скопійовано", "ok"), () => Z.toast("Не вдалося скопіювати", "bad")); }

  /* ---------- вкладки ---------- */
  const TABS = [["news", "Що нового"], ["demand", "Потрібні уроки"], ["reports", "Помилки"], ["students", "Учні"], ["access", "Доступи"]];
  let tab = Z.qs("tab") || "news"; let repFilter = "open"; let openStudent = null; let lastCreated = [];

  function news() {
    const newReports = D.reports.filter(r => isNew(r.createdAt));
    const newDemand = D.demand.filter(d => d.missing.length && isNew(d.updatedAt));
    const active = D.progress.filter(p => (p.summary || {}).last > seenBefore);
    const week = Date.now() - 7 * 864e5;
    const tiles = [
      [D.progress.filter(p => (p.summary || {}).last > week).length, "учнів активні за 7 днів"],
      [D.progress.length, "дітей у пілоті"],
      [D.reports.filter(r => r.status === "new").length, "нових повідомлень про помилки"],
      [D.demand.reduce((s, d) => s + d.missing.length, 0), "уроків чекають на написання"],
      [D.allow.length, "доступів видано"],
    ];
    const prog = active.slice(0, 30).map(p => { const S = p.summary || {}; return `<li><b>${Z.esc(p.childName || "—")}</b> (${Z.gradeLabel(p.grade || "g00")}) — виконано ${S.done || 0} з ${S.total || 0}${S.avg != null ? ", сер. бал " + S.avg + "%" : ""} · ${Z.fmtDT(S.last)}</li>`; }).join("");
    return `<div class="grid c4">${tiles.map(t => `<div class="card mini"><div class="num-big">${t[0]}</div><small class="muted">${t[1]}</small></div>`).join("")}</div>
      <div class="card"><h2 style="margin-top:0">З вашого останнього візиту ${seenBefore ? `<small class="muted">(${Z.fmtDT(seenBefore)})</small>` : ""}</h2>
        ${!newReports.length && !newDemand.length && !active.length ? '<p class="muted">Нічого нового.</p>' : ""}
        ${newDemand.length ? `<h3>⏳ Учні дійшли до уроків, яких ще немає</h3><ul>${newDemand.map(d => `<li>${Z.gradeLabel(d.grade)} · <b>${Z.esc(d.subjName)}</b>: потрібно ${d.missing.length} (${d.missing.map(l => "урок " + l.n).join(", ")})</li>`).join("")}</ul><p><button class="btn sm" id="copyNewDemand">Скопіювати завдання на написання</button></p>` : ""}
        ${newReports.length ? `<h3>⚑ Нові повідомлення про помилки: ${newReports.length}</h3><ul>${newReports.slice(0, 15).map(r => `<li>${Z.esc(r.kind)} — ${Z.esc(r.title || r.page || "")} <small class="muted">${Z.esc((r.text || "").slice(0, 120))}</small></li>`).join("")}</ul>` : ""}
        ${active.length ? `<h3>📈 Хто займався</h3><ul>${prog}</ul>` : ""}
        <p class="row-btns"><button class="btn ghost sm" id="markSeen">Позначити все переглянутим</button></p></div>`;
  }

  function demandTab() {
    const open = D.demand.filter(d => d.missing.length).sort((a, b) => b.missing.length - a.missing.length || Z.DB.tsToMs(b.updatedAt) - Z.DB.tsToMs(a.updatedAt));
    const closed = D.demand.filter(d => !d.missing.length);
    const cov = GRADES.map(g => grades[g]).filter(Boolean).map(G => { const w = G.plan.filter(l => l.exists).length; return `<tr><td>${Z.gradeLabel(G.g)}</td><td>${G.plan.length}</td><td>${w}</td><td><div class="bar"><i style="width:${Math.round(100 * w / G.plan.length)}%"></i></div></td><td>${G.subjects.map(s => { const list = G.bySubject[s.id] || []; return `<span class="subj-tag sm" style="--c:${s.color}" title="${Z.esc(s.name)}">${Z.esc(s.short || s.name)} ${list.filter(l => l.exists).length}/${list.length}</span>`; }).join(" ")}</td></tr>`; }).join("");
    return `<div class="card"><h2 style="margin-top:0">Чекають на написання</h2>
        <p class="muted">Кожен предмет відкривається по черзі. Коли дитина підходить до уроку, файлу якого ще немає (з запасом ${Z.BUFFER} уроки наперед), з'являється рядок нижче. Скопіюйте завдання і вставте його в сесію Claude — він допише саме ці уроки.</p>
        ${open.length ? `<div class="table-wrap"><table><thead><tr><th>Клас</th><th>Предмет</th><th>Потрібно до уроку</th><th>Немає файлів</th><th>Сигнал</th><th></th></tr></thead><tbody>${open.map((d, i) => `<tr><td>${Z.gradeLabel(d.grade)}</td><td><b>${Z.esc(d.subjName)}</b><br><small class="muted">написано ${d.written} з ${d.total}</small></td><td>${d.maxN}</td><td>${d.missing.map(l => `<div><small>${l.n}. ${Z.esc(l.title)}</small></div>`).join("")}</td><td>${ago(d.updatedAt)}${isNew(d.updatedAt) ? ' <span class="pill-warn">нове</span>' : ""}</td><td><button class="btn sm sec" data-copy-demand="${i}">Завдання</button></td></tr>`).join("")}</tbody></table></div>
          <p class="row-btns"><button class="btn" id="copyAllDemand">Скопіювати все одним завданням (${open.reduce((s, d) => s + d.missing.length, 0)} уроків)</button></p>` : '<p class="pill-ok">Усі потрібні уроки написано.</p>'}
        ${closed.length ? `<p class="muted small">Закриті сигнали: ${closed.map(d => `${d.grade}/${d.subject} до ${d.maxN}`).join(", ")}</p>` : ""}</div>
      <div class="card"><h2 style="margin-top:0">Покриття плану файлами уроків</h2><div class="table-wrap"><table><thead><tr><th>Клас</th><th>Уроків у плані</th><th>Написано</th><th style="min-width:120px"></th><th>За предметами</th></tr></thead><tbody>${cov}</tbody></table></div></div>`;
  }

  function reportsTab() {
    const list = D.reports.filter(r => repFilter === "all" ? true : repFilter === "open" ? (r.status === "new" || r.status === "work") : r.status === repFilter);
    const cnt = k => D.reports.filter(r => k === "open" ? (r.status === "new" || r.status === "work") : r.status === k).length;
    const filters = [["open", "Відкриті"], ["new", "Нові"], ["work", "В роботі"], ["fixed", "Виправлені"], ["rejected", "Відхилені"], ["all", "Усі"]];
    const card = r => {
      const G = grades[r.grade]; const l = G && r.lessonId ? G.byId[r.lessonId] : null;
      const where = [r.grade ? Z.gradeLabel(r.grade) : "", G && r.subject && G.subjMap[r.subject] ? G.subjMap[r.subject].name : r.subject, l ? `урок ${l.n} «${l.title}»` : r.title || r.page || "", r.step ? { theory: "теорія", practice: "практика", homework: "домашнє", summary: "підсумок" }[r.step] || r.step : "", r.exercise ? "завдання " + r.exercise : ""].filter(Boolean).join(" · ");
      return `<div class="card report st-${r.status}"><div class="row-btns" style="justify-content:space-between"><b>${Z.esc(r.kind)}</b><span class="chip">${REPORT_ST[r.status] || r.status}</span></div>
        <p class="muted small">${Z.esc(where)}</p><p class="rep-text">${Z.esc(r.text)}</p>
        <p class="muted small">${Z.esc(r.childName || "")} · ${Z.esc(r.email || "")} · ${ago(r.createdAt)}${l ? ` · <a href="../${Z.esc(l.file)}" target="_blank" rel="noopener">файл уроку</a>` : ""}${r.url ? ` · <a href="${Z.esc(r.url)}" target="_blank" rel="noopener">сторінка</a>` : ""}</p>
        <p class="row-btns">${Object.keys(REPORT_ST).filter(k => k !== r.status && k !== "new").map(k => `<button class="btn sm ${k === "fixed" ? "ok" : k === "rejected" ? "ghost" : "sec"}" data-rep="${r.id}" data-st="${k}">${{ work: "Взяти в роботу", fixed: "Виправлено", rejected: "Відхилити" }[k]}</button>`).join("")}<button class="btn sm ghost" data-rep-copy="${r.id}">Завдання для Claude</button></p></div>`;
    };
    return `<div class="tabs sub">${filters.map(([k, n]) => `<button data-rf="${k}" class="${repFilter === k ? "on" : ""}">${n} <small>${cnt(k)}</small></button>`).join("")}</div>
      ${list.map(card).join("") || '<div class="card muted">Повідомлень немає.</div>'}`;
  }
  function reportTask(r) {
    const G = grades[r.grade]; const l = G && r.lessonId ? G.byId[r.lessonId] : null;
    return [`Перевір і виправ повідомлення про помилку в «Зошиті» (репо alexmazuka/zoshyt):`, l ? `Файл: ${l.file} (урок ${l.n} «${l.title}»)` : `Сторінка: ${r.url || r.page || ""}`, r.step ? `Крок: ${r.step}${r.exercise ? ", завдання " + r.exercise : ""}` : "", `Тип: ${r.kind}`, `Текст повідомлення: ${r.text}`, "", "Якщо помилка підтверджується — виправ файл, запусти python3 tools/validate.py, закоміть і запуш. Якщо ні — поясни чому."].filter(Boolean).join("\n");
  }

  function studentsTab() {
    if (!D.progress.length) return '<div class="card muted">Ще ніхто не почав навчання.</div>';
    const rows = D.progress.map(p => { const S = p.summary || {}; return `<tr class="${openStudent === p.id ? "sel" : ""}"><td><b>${Z.esc(p.childName || "—")}</b><br><small class="muted">${Z.esc(p.email || "")}</small></td><td>${p.grade ? Z.gradeLabel(p.grade) : "—"}</td><td>${S.done || 0} / ${S.total || 0}</td><td>${S.avg != null ? S.avg + "%" : "—"}</td><td>${Z.fmtDT(S.last)}</td><td><button class="btn sm sec" data-stu="${p.id}">Деталі</button></td></tr>`; }).join("");
    return `<div class="card"><h2 style="margin-top:0">Учні</h2><div class="table-wrap"><table><thead><tr><th>Дитина</th><th>Клас</th><th>Уроків виконано</th><th>Сер. бал</th><th>Остання активність</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div><div id="stu"></div>`;
  }
  function studentDetail(id) {
    const p = D.progress.find(x => x.id === id); const box = document.getElementById("stu"); if (!p || !box) return;
    let P = {}; try { const o = JSON.parse(p.progressJson || "{}"); P = o.progress || o; } catch (e) { P = {}; }
    const lessons = P.lessons || {}; const log = P.log || []; const G = grades[p.grade];
    const done = id2 => { const r = lessons[id2]; return r && r.practice && r.practice.done && r.homework && r.homework.submitted; };
    const subj = G ? G.subjects.map(s => { const list = G.bySubject[s.id] || []; const d = list.filter(l => done(l.id)).length; const fr = list.find(l => !done(l.id)); return `<tr><td>${Z.esc(s.name)}</td><td>${d} / ${list.length}</td><td>${fr ? `урок ${fr.n}. ${Z.esc(fr.title)}${fr.exists ? "" : ' <span class="soon">⏳ немає файлу</span>'}` : '<span class="pill-ok">усе</span>'}</td></tr>`; }).join("") : "";
    const evName = t => ({ open: "відкрив урок", practice: "завершив практику", homework: "здав домашнє", retry: "повторює практику", review: "перевірка батьків", ai_open: "відкрив Поясняйка", ai_ask: "запитав Поясняйка" }[t] || t);
    const ev = log.slice(-40).reverse().map(e => `<tr><td>${Z.fmtDT(e.t)}</td><td>${evName(e.type)}</td><td>${e.id ? Z.esc(lessonTitle(p.grade, e.id)) : ""}</td><td>${e.score != null ? e.score + "%" : ""}</td></tr>`).join("");
    box.innerHTML = `<div class="card detail"><h2 style="margin-top:0">${Z.esc(p.childName || "")} · ${p.grade ? Z.gradeLabel(p.grade) : ""}</h2>
      <h3>За предметами</h3><div class="table-wrap"><table><thead><tr><th>Предмет</th><th>Виконано</th><th>Зараз на уроці</th></tr></thead><tbody>${subj}</tbody></table></div>
      <h3>Останні події</h3><div class="table-wrap"><table><thead><tr><th>Коли</th><th>Подія</th><th>Урок</th><th>Бал</th></tr></thead><tbody>${ev || '<tr><td colspan="4" class="muted">Подій немає</td></tr>'}</tbody></table></div></div>`;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function accessTab() {
    const created = lastCreated.length ? `<div class="card soft"><h2 style="margin-top:0">Готові повідомлення для надсилання</h2><p class="muted">Паролі показано лише зараз — у базі вони не зберігаються. Скопіюйте повідомлення і надішліть кожному.</p>
      ${lastCreated.map((c, i) => `<div class="cred"><b>${Z.esc(c.email)}</b> — ${c.error ? `<span class="pill-bad">не вдалося: ${Z.esc(c.error)}</span>` : c.exists ? '<span class="pill-warn">акаунт уже існував: пароль не змінено, доступ відкрито (за потреби надішліть лист для зміни пароля)</span>' : '<span class="pill-ok">акаунт створено</span>'}${c.msg ? `<textarea class="mono-area" rows="7" readonly>${Z.esc(c.msg)}</textarea><button class="btn sm" data-cc="${i}">Скопіювати</button>` : ""}</div>`).join("")}
      ${lastCreated.some(c => c.msg) ? `<p class="row-btns"><button class="btn sec" id="copyAllCreds">Скопіювати всі (${lastCreated.filter(c => c.msg).length})</button></p>` : ""}</div>` : "";
    return `<div class="card"><h2 style="margin-top:0">Видати доступ</h2>
      <p class="muted">Вставте email тих, хто записався на тестування (по одному в рядку). Для кожного буде створено акаунт із випадковим паролем і відкрито доступ до всіх класів. Адреси з форми запису на лендингу — у Formspree.</p>
      <form id="af"><div class="field"><label for="emails">Email</label><textarea id="emails" rows="5" placeholder="mama@example.com&#10;tato@example.com"></textarea></div>
      <div class="field"><label for="note">Примітка (необов'язково)</label><input id="note" maxlength="120" placeholder="Наприклад: школа А+, 10-Б"></div>
      <p class="err" id="aerr" role="alert"></p><button class="btn" type="submit" id="agrant">Створити акаунти і відкрити доступ</button></form></div>
      ${created}
      <div class="card"><h2 style="margin-top:0">Мають доступ <small class="muted">${D.allow.length}</small></h2>
      <div class="table-wrap"><table><thead><tr><th>Email</th><th>Примітка</th><th>Видано</th><th></th></tr></thead><tbody>${D.allow.map(a => `<tr><td>${Z.esc(a.id)}</td><td>${Z.esc(a.note || "")}</td><td>${ago(a.createdAt)}</td><td class="row-btns"><button class="btn sm ghost" data-reset="${Z.esc(a.id)}">Лист для зміни пароля</button><button class="btn sm ghost danger-t" data-revoke="${Z.esc(a.id)}">Закрити доступ</button></td></tr>`).join("") || '<tr><td colspan="4" class="muted">Нікого</td></tr>'}</tbody></table></div></div>`;
  }
  function genPass() { const A = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = new Uint32Array(10); crypto.getRandomValues(b); return [...b].map(x => A[x % A.length]).join(""); }
  function credMsg(email, pass) { return `Вітаємо! Доступ до «Зошита» (пілот NextEducationAI) відкрито.\n\nВхід: ${APP_URL}\nЛогін: ${email}\nПароль: ${pass}\n\nПісля входу додайте дитину, оберіть клас і створіть PIN для кабінету батьків. Пароль можна змінити кнопкою «Забули пароль?» на сторінці входу. Помітили помилку — кнопка «⚑ Помилка?» є на кожній сторінці.`; }
  async function grant(e) {
    e.preventDefault(); const err = document.getElementById("aerr"); err.textContent = "";
    const emails = [...new Set(document.getElementById("emails").value.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean))];
    const bad = emails.filter(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (!emails.length) { err.textContent = "Вставте хоча б один email."; return; }
    if (bad.length) { err.textContent = "Перевірте адреси: " + bad.join(", "); return; }
    const note = document.getElementById("note").value.trim(); const btn = document.getElementById("agrant"); btn.disabled = true; btn.textContent = "Створюю…";
    const out = [];
    for (const email of emails) {
      try {
        const pass = genPass(); const r = await Z.DB.createAccount(email, pass);
        await Z.DB.set("allowlist", email, { note, createdAt: Z.DB.now(), by: u.email }, true);
        out.push({ email, exists: !r.created, msg: r.created ? credMsg(email, pass) : "" });
      } catch (ex) { out.push({ email, error: ex.code || ex.message || "помилка", msg: "" }); }
    }
    lastCreated = out; await loadAll(); render();
  }

  /* ---------- рендер ---------- */
  function render() {
    const nNew = D.reports.filter(r => r.status === "new").length; const nNeed = D.demand.reduce((s, d) => s + d.missing.length, 0);
    const badge = k => k === "reports" && nNew ? ` <span class="cnt">${nNew}</span>` : k === "demand" && nNeed ? ` <span class="cnt">${nNeed}</span>` : "";
    root.innerHTML = `<h1 class="page-h">Адмін-панель</h1><div class="tabs">${TABS.map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? "on" : ""}">${n}${badge(k)}</button>`).join("")}<button class="btn sm ghost" id="reload" style="margin-left:auto">↻ Оновити</button></div>`
      + (tab === "news" ? news() : tab === "demand" ? demandTab() : tab === "reports" ? reportsTab() : tab === "students" ? studentsTab() : accessTab());
    root.querySelectorAll("button[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; history.replaceState(null, "", "?tab=" + tab); render(); });
    document.getElementById("reload").onclick = async () => { await loadAll(); render(); Z.toast("Оновлено", "ok"); };
    const ms = document.getElementById("markSeen"); if (ms) ms.onclick = () => { localStorage.setItem(SEEN_KEY, String(Date.now())); location.reload(); };
    const cnd = document.getElementById("copyNewDemand"); if (cnd) cnd.onclick = () => copy(taskText(D.demand.filter(d => d.missing.length && isNew(d.updatedAt))));
    const openD = D.demand.filter(d => d.missing.length).sort((a, b) => b.missing.length - a.missing.length || Z.DB.tsToMs(b.updatedAt) - Z.DB.tsToMs(a.updatedAt));
    root.querySelectorAll("button[data-copy-demand]").forEach(b => b.onclick = () => copy(taskText([openD[Number(b.dataset.copyDemand)]])));
    const cad = document.getElementById("copyAllDemand"); if (cad) cad.onclick = () => copy(taskText(openD));
    root.querySelectorAll("button[data-rf]").forEach(b => b.onclick = () => { repFilter = b.dataset.rf; render(); });
    root.querySelectorAll("button[data-rep]").forEach(b => b.onclick = async () => {
      try { await Z.DB.set("reports", b.dataset.rep, { status: b.dataset.st, statusAt: Z.DB.now() }, true); const r = D.reports.find(x => x.id === b.dataset.rep); if (r) r.status = b.dataset.st; render(); }
      catch (e) { Z.toast("Не вдалося: " + e.message, "bad"); }
    });
    root.querySelectorAll("button[data-rep-copy]").forEach(b => b.onclick = () => copy(reportTask(D.reports.find(x => x.id === b.dataset.repCopy))));
    root.querySelectorAll("button[data-stu]").forEach(b => b.onclick = () => { openStudent = b.dataset.stu; render(); studentDetail(openStudent); });
    if (tab === "students" && openStudent) studentDetail(openStudent);
    const af = document.getElementById("af"); if (af) af.onsubmit = grant;
    root.querySelectorAll("button[data-cc]").forEach(b => b.onclick = () => copy(lastCreated[Number(b.dataset.cc)].msg));
    const cac = document.getElementById("copyAllCreds"); if (cac) cac.onclick = () => copy(lastCreated.filter(c => c.msg).map(c => c.msg).join("\n\n———\n\n"));
    root.querySelectorAll("button[data-reset]").forEach(b => b.onclick = async () => { try { await Z.DB.resetPassword(b.dataset.reset); Z.toast("Лист надіслано на " + b.dataset.reset, "ok"); } catch (e) { Z.toast(e.code || e.message, "bad"); } });
    root.querySelectorAll("button[data-revoke]").forEach(b => b.onclick = () => {
      const m = Z.modal(`<h2>Закрити доступ?</h2><p><b>${Z.esc(b.dataset.revoke)}</b> більше не зможе відкривати уроки. Прогрес дитини збережеться — доступ можна повернути.</p><p class="row-btns"><button class="btn ghost" data-x>Скасувати</button><button class="btn danger" data-y>Закрити доступ</button></p>`);
      m.querySelector("[data-x]").onclick = () => m.remove();
      m.querySelector("[data-y]").onclick = async () => { m.remove(); try { await Z.DB.remove("allowlist", b.dataset.revoke); await loadAll(); render(); Z.toast("Доступ закрито", "ok"); } catch (e) { Z.toast(e.message, "bad"); } };
    });
  }
  root.innerHTML = '<div class="card muted">Завантажую дані…</div>';
  await loadAll();
  render();
})();
