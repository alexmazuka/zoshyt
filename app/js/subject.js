/* Предмети: перелік і всі уроки предмета зі станом відкриття */
(async function () {
  const root = document.getElementById("app");
  let st;
  try { st = await Z.boot(); } catch (e) { root.innerHTML = `<div class="card">Не вдалося завантажити дані: ${Z.esc(e.message)}</div>`; return; }
  if (!st) return;
  document.getElementById("hdr").innerHTML = Z.header("subject");
  document.getElementById("ftr").innerHTML = Z.footer();
  const sid = Z.qs("s");
  Z.wireHeader(() => ({ subject: sid || "", page: "Предмети" }));

  if (!sid || !Z.state.subjMap[sid]) {
    root.innerHTML = `<div class="card"><h1>Предмети</h1><p class="muted">${Z.esc(Z.state.program)}</p></div>
      <div class="grid c2">${Z.state.subjects.map(sub => { const S = Z.summary(l => l.subject === sub.id); return `<a class="card subj-card" href="${Z.link("subject.html", { s: sub.id })}" style="--c:${sub.color}"><div class="next-head"><span class="dot"></span><b>${Z.esc(sub.name)}</b><span class="chip">${sub.hours} год/тиж</span></div><div class="bar"><i style="width:${S.pct}%;background:${sub.color}"></i></div><small class="muted">${S.done} з ${S.total} уроків${S.avg != null ? " · середній бал " + S.avg + "%" : ""}${sub.textbook ? " · " + Z.esc(sub.textbook) : ""}</small></a>`; }).join("")}</div>`;
    return;
  }
  Z.ensureDemand(sid);
  const sub = Z.state.subjMap[sid]; const ls = Z.state.bySubject[sid]; const S = Z.summary(l => l.subject === sid);
  document.title = sub.name + " — Зошит";
  const sections = []; ls.forEach(l => { let s = sections[sections.length - 1]; if (!s || s.name !== l.section) { s = { name: l.section, items: [] }; sections.push(s); } s.items.push(l); });
  root.innerHTML = `<div class="card subj-hero" style="--c:${sub.color}"><h1><span class="dot"></span>${Z.esc(sub.name)}</h1><small class="muted">${ls.length} уроків у семестрі · виконано ${S.done}${S.avg != null ? " · середній бал " + S.avg + "%" : ""}</small><div class="bar"><i style="width:${S.pct}%;background:${sub.color}"></i></div>
      <p class="legend small"><span>✓ виконано</span><span>▶ можна проходити</span><span>🔒 відкриється після попереднього</span><span>⏳ готується</span></p></div>
    ${sections.map(sec => `<div class="card"><h2 style="margin-top:0">${Z.esc(sec.name)} <small class="muted">${sec.items.filter(l => Z.statusOf(l.id) === "done").length}/${sec.items.length}</small></h2>${sec.items.map(l => Z.lessonRow(l)).join("")}</div>`).join("")}`;
})();
