/* «Знайти тему»: учень не зрозумів тему в школі — шукає її в «Зошиті» серед уроків свого класу і молодших класів.
   Знайдений урок можна розібрати одразу (теорія і практика в режимі «розбір», lesson.html?mode=review) — без
   зарахування в маршрут, тож послідовне відкриття уроків не ламається. Якщо уроку ще немає — Поясняйко пояснює
   тему за програмою, а учень може попросити написати урок (запит потрапляє в адмін-панель, «Потрібні уроки»). */
window.Topics = (function () {
  const TOPIC_KIND = "Потрібен урок (пошук теми)";
  const MAX_OWN = 8, MAX_LOWER = 5;
  let grades = null;            // [{ g, own, plan, subjMap }]
  let loading = null;
  let lastQ = "";

  /* план свого класу вже завантажено; молодші класи — лише коли учень почав шукати */
  function load() {
    if (loading) return loading;
    const own = { g: Z.state.grade, own: true, plan: Z.state.plan, subjMap: Z.state.subjMap };
    const n = Number(String(Z.state.grade).replace("g", ""));
    const lower = Array.from({ length: n - 1 }, (_, i) => "g" + String(n - 1 - i).padStart(2, "0"));
    loading = Promise.all(lower.map(g => Promise.all([Z.loadJSON("../data/" + g + "/plan.json"), Z.loadJSON("../data/" + g + "/subjects.json")])
      .then(([p, s]) => ({ g, own: false, plan: p.lessons, subjMap: Object.fromEntries(s.subjects.map(x => [x.id, x])) }), () => null)))
      .then(list => { grades = [own].concat(list.filter(Boolean)); return grades; });
    grades = [own];
    return loading;
  }

  /* пошук без морфології: слово запиту (без кількох останніх літер) — початок слова в назві, розділі чи змісті уроку */
  function norm(s) { return String(s || "").toLowerCase().replace(/[’ʼ`']/g, "'").replace(/ё/g, "е"); }
  function words(s) { return norm(s).split(/[^a-zа-яіїєґ'0-9]+/i).filter(Boolean); }
  function stem(w) { return w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 2)); }
  function score(l, G, qs) {
    const sub = G.subjMap[l.subject] || {};
    const fields = [[words(l.title), 4], [words(l.section), 2], [words(l.brief), 1.5], [words(sub.name), 1]];
    let total = 0;
    for (const q of qs) {
      let best = 0;
      for (const [ws, wt] of fields) if (ws.some(w => w.startsWith(q))) best = Math.max(best, wt);
      if (!best) return 0;
      total += best;
    }
    return total + (l.exists ? 0.5 : 0);
  }
  function find(q) {
    const qs = words(q).filter(w => w.length >= 2).map(stem); if (!qs.length) return { own: [], lower: [] };
    const hits = [];
    (grades || []).forEach(G => G.plan.forEach(l => { const s = score(l, G, qs); if (s) hits.push({ l, G, s }); }));
    hits.sort((a, b) => b.s - a.s || Number(b.G.g.slice(1)) - Number(a.G.g.slice(1)) || a.l.n - b.l.n);
    return { own: hits.filter(h => h.G.own).slice(0, MAX_OWN), lower: hits.filter(h => !h.G.own).slice(0, MAX_LOWER) };
  }

  function lessonLink(h, step) {
    const extra = { id: h.l.id };
    if (!h.G.own) Object.assign(extra, { g: h.G.g, mode: "review" });
    else if (Z.avail(h.l) === "locked") extra.mode = "review";
    if (step) extra.step = step;
    return Z.link("lesson.html", extra);
  }
  function row(h, i) {
    const l = h.l, sub = h.G.subjMap[l.subject] || { name: l.subject, color: "#64748B" };
    const a = h.G.own ? Z.avail(l) : null;
    const state = !h.G.own ? `<span class="chip">${Z.gradeLabel(h.G.g)}</span>`
      : a === "done" ? '<span class="chip">✓ уже пройдено</span>'
      : a === "open" ? '<span class="chip">▶ твій наступний урок</span>'
      : a === "locked" ? '<span class="chip">🔜 ще попереду в маршруті</span>'
      : '<span class="chip">⏳ урок готується</span>';
    let acts;
    if (!l.exists) acts = `<button class="btn sm" type="button" data-t-ai="${i}">🦉 Пояснити тему</button><button class="btn sm ghost" type="button" data-t-req="${i}">🙋 Потрібен цей урок</button>`;
    else if (h.G.own && (a === "open" || a === "done")) acts = `<a class="btn sm" href="${lessonLink(h)}" data-t-go="${i}">📖 Відкрити урок</a><button class="btn sm ghost" type="button" data-t-ai="${i}">🦉 Запитати Поясняйка</button>`;
    else acts = `<a class="btn sm" href="${lessonLink(h, "theory")}" data-t-go="${i}">📖 Теорія</a><a class="btn sm sec" href="${lessonLink(h, "practice")}" data-t-go="${i}">✏️ Практика</a><button class="btn sm ghost" type="button" data-t-ai="${i}">🦉 Запитати Поясняйка</button>`;
    return `<div class="topic-hit"><div class="topic-t"><span class="subj-tag" style="--c:${sub.color}">${Z.esc(sub.short || sub.name)}</span> <b>${Z.esc(l.title)}</b> ${state}</div>
      <small class="muted">${Z.esc(l.section || "")}${l.section ? " · " : ""}урок ${l.n}${l.brief ? " · " + Z.esc(l.brief) : ""}</small><div class="row-btns">${acts}</div></div>`;
  }

  function mount(el) {
    el.innerHTML = `<div class="card topic-card" id="poshuk"><h2 style="margin-top:0">🔍 Не зрозумів тему в школі?</h2>
      <p class="muted">Знайди її тут: можна одразу прочитати теорію, потренуватися або запитати Поясняйка. Такий розбір не збиває твій маршрут.</p>
      <div class="field"><label for="tq" class="sr-only">Тема</label><input id="tq" type="search" autocomplete="off" placeholder="Наприклад: дроби, Київська Русь, Present Simple, фотосинтез"></div>
      <div id="tres" aria-live="polite"></div></div>`;
    const inp = el.querySelector("#tq"), out = el.querySelector("#tres");
    let hits = [], timer = null;
    const run = async () => {
      const q = inp.value.trim(); lastQ = q;
      if (q.length < 3) { out.innerHTML = q ? '<p class="muted small">Напиши хоча б 3 літери.</p>' : ""; return; }
      if (!grades || grades.length === 1) { out.innerHTML = '<p class="muted small">Шукаю…</p>'; await load(); if (lastQ !== q) return; }
      const r = find(q); hits = r.own.concat(r.lower);
      if (!hits.length) { out.innerHTML = `<p class="muted">Нічого не знайшлося. Спробуй інше слово — наприклад, назву розділу з підручника. Або <a href="#" id="tAskAny">запитай Поясняйка</a> про «${Z.esc(q)}».</p>`; out.querySelector("#tAskAny").onclick = e => { e.preventDefault(); askAI(null, q); }; return; }
      out.innerHTML = (r.own.length ? `<h3>У твоєму класі</h3>${r.own.map((h, i) => row(h, i)).join("")}` : "")
        + (r.lower.length ? `<h3>З молодших класів — щоб повторити основу</h3>${r.lower.map((h, i) => row(h, r.own.length + i)).join("")}` : "");
      out.querySelectorAll("[data-t-go]").forEach(b => b.addEventListener("click", () => logPick(hits[Number(b.dataset.tGo)], q, "lesson")));
      out.querySelectorAll("[data-t-ai]").forEach(b => b.onclick = () => { const h = hits[Number(b.dataset.tAi)]; logPick(h, q, "ai"); askAI(h, q); });
      out.querySelectorAll("[data-t-req]").forEach(b => b.onclick = () => request(hits[Number(b.dataset.tReq)], q, b));
    };
    inp.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 250); });
    inp.addEventListener("focus", () => load(), { once: true });
    if (location.hash === "#poshuk") setTimeout(() => inp.focus(), 50);
  }

  function logPick(h, q, act) { Z.progress.log({ type: "topic_pick", id: h.l.id, g: h.G.g, title: h.l.title, q, act }); }

  /* Поясняйко на сторінці пошуку: контекст — назва і короткий зміст теми з програми */
  function askAI(h, q) {
    if (!window.AiHelp) return;
    const sub = h ? (h.G.subjMap[h.l.subject] || {}).name || h.l.subject : "";
    AiHelp.open({
      id: h ? h.l.id : "", subject: sub, title: h ? h.l.title : q, step: "topic", grade: Z.state.grade,
      theory: h ? `Тема з програми ${Z.gradeLabel(h.G.g)}${h.G.own ? "" : " (учень повторює основу з молодшого класу)"}. Розділ: ${h.l.section || "—"}. Зміст за програмою: ${h.l.brief || "—"}.` : `Учень шукав тему «${q}», але такого уроку в «Зошиті» немає.`,
      questions: [],
    });
  }

  async function request(h, q, btn) {
    const key = "ztopic." + h.G.g + "." + h.l.id;
    if (localStorage.getItem(key)) { Z.toast("Ти вже просив цей урок — команда знає 🙂", "ok"); return; }
    btn.disabled = true;
    const st = Z.state; const sub = (h.G.subjMap[h.l.subject] || {}).name || h.l.subject;
    try {
      await Z.DB.add("reports", {
        uid: st.user ? st.user.uid : "", email: st.user ? st.user.email : "", childName: st.child ? st.child.name : "", grade: h.G.g,
        subject: h.l.subject, lessonId: h.l.id, title: h.l.title, step: "", exercise: null, kind: TOPIC_KIND,
        text: `Учень ${Z.gradeLabel(st.grade)} шукав «${q}» і просить урок: ${Z.gradeLabel(h.G.g)}, ${sub}, урок ${h.l.n} «${h.l.title}».`,
        url: location.href, ua: navigator.userAgent.slice(0, 200), status: "new", createdAt: Z.DB.now(),
      });
      localStorage.setItem(key, "1"); Z.progress.log({ type: "topic_request", id: h.l.id, g: h.G.g, title: h.l.title, q });
      btn.textContent = "✓ Запит надіслано"; Z.toast("Дякуємо! Команда напише цей урок якнайшвидше.", "ok");
    } catch (e) { btn.disabled = false; Z.toast("Не вдалося надіслати: " + (e.message || e), "bad"); }
  }

  return { mount, TOPIC_KIND };
})();
