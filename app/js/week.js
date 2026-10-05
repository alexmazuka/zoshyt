/* Розклад тижня: уроки за календарем I семестру — рекомендований темп. Уроки кожного предмета все одно відкриваються по черзі. */
(async function () {
  const root = document.getElementById("app");
  let st;
  try { st = await Z.boot(); } catch (e) { root.innerHTML = `<div class="card">Не вдалося завантажити дані: ${Z.esc(e.message)}</div>`; return; }
  if (!st) return;
  document.getElementById("hdr").innerHTML = Z.header("week");
  document.getElementById("ftr").innerHTML = Z.footer();
  Z.wireHeader(() => ({ page: "Розклад" }));
  const weeks = Z.state.cal.weeks;
  let w = Number(Z.qs("w")) || Z.currentWeek(); if (!weeks.find(x => x.week === w)) w = weeks[0].week;

  function render() {
    const wi = Z.weekInfo(w); const todayIso = Z.isoDate(Z.today()); const q = Z.quarterOf(w); const cur = Z.currentWeek();
    const first = Z.dateOf(w, wi.days[0]), last = Z.dateOf(w, wi.days[wi.days.length - 1]);
    const S = Z.summary(l => l.week === w);
    const nav = weeks.map(x => { const s = Z.summary(l => l.week === x.week); return `<button type="button" class="wk ${x.week === w ? "on" : ""} ${s.total && s.done === s.total ? "full" : ""}" data-w="${x.week}" title="Тиждень ${x.week}: виконано ${s.done} з ${s.total}">${x.week}</button>`; }).join("");
    const days = wi.days.map(d => {
      const date = Z.dateOf(w, d); const iso = Z.isoDate(date); const ls = Z.lessonsOn(w, d); const done = ls.filter(l => Z.statusOf(l.id) === "done").length;
      return `<div class="card day ${iso === todayIso ? "today" : ""}"><h3>${Z.DAYS[d]} <small class="muted">${Z.fmt(date, { day: "numeric", month: "short" })}</small>${iso === todayIso ? ' <span class="chip">сьогодні</span>' : ""}</h3>
        <small class="muted">${ls.length ? `виконано ${done} з ${ls.length}` : "уроків немає"}</small>${ls.map(l => Z.lessonRow(l)).join("")}</div>`;
    }).join("");
    const nextW = weeks.find(x => x.week === w + 1);
    const holiday = nextW && Z.state.cal.holidays.find(h => h.from > Z.isoDate(last) && h.from < nextW.monday);
    root.innerHTML = `<div class="card"><div class="wk-head"><div><p class="eyebrow">${Z.esc(q.name || "")}</p><h1 style="margin:0">Тиждень ${w}</h1><small class="muted">${Z.fmt(first)} – ${Z.fmt(last)}${wi.note ? " · " + Z.esc(wi.note) : ""}</small></div>
        <div class="wk-sum"><b>${S.done} з ${S.total}</b><small class="muted">уроків тижня виконано</small></div></div>
        <div class="wk-nav" role="group" aria-label="Тиждень">${nav}</div>
        <p class="row-btns">${w > weeks[0].week ? `<button class="btn sm ghost" data-w="${w - 1}" type="button">◀ Тиждень ${w - 1}</button>` : ""}${w !== cur ? `<button class="btn sm sec" data-w="${cur}" type="button">Поточний тиждень</button>` : ""}${nextW ? `<button class="btn sm ghost" data-w="${w + 1}" type="button">Тиждень ${w + 1} ▶</button>` : ""}</p>
        ${holiday ? `<p class="notice">🍁 Після цього тижня — ${Z.esc(holiday.name.toLowerCase())}: ${Z.fmt(Z.parseDate(holiday.from))} – ${Z.fmt(Z.parseDate(holiday.to))}.</p>` : ""}
        <p class="muted small">Розклад показує рекомендований темп за календарем. Уроки кожного предмета відкриваються по черзі: ✓ виконано · ▶ можна проходити · 🔒 відкриється після попереднього · ⏳ урок готується.</p></div>
      <div class="grid days">${days}</div>`;
    root.querySelectorAll("button[data-w]").forEach(b => b.onclick = () => { w = Number(b.dataset.w); history.replaceState(null, "", Z.link("week.html", { w })); render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  }
  window.addEventListener("z-remote-update", render);
  render();
})();
