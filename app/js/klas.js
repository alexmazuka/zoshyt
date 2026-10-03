/* «Мій шлях»: наступний урок з кожного предмета, прогрес, нагороди */
(async function () {
  const root = document.getElementById("app");
  let st;
  try { st = await Z.boot(); } catch (e) { root.innerHTML = `<div class="card">Не вдалося завантажити дані: ${Z.esc(e.message)}</div>`; return; }
  if (!st) return;
  document.getElementById("hdr").innerHTML = Z.header("home");
  document.getElementById("ftr").innerHTML = Z.footer();
  Z.wireHeader(() => ({ page: "Мій шлях" }));
  Z.state.subjects.forEach(s => Z.ensureDemand(s.id));

  function render() {
    const ch = Z.state.child; const A = Z.summary(); const x = Z.xp();
    const hour = new Date().getHours(); const greet = hour < 12 ? "Доброго ранку" : hour < 18 ? "Добрий день" : "Добрий вечір";
    const cards = Z.state.subjects.map(sub => {
      const list = Z.state.bySubject[sub.id] || []; const S = Z.summary(l => l.subject === sub.id); const fr = Z.frontier(sub.id);
      let action;
      if (!fr) action = `<span class="pill-ok">✓ Усі уроки семестру виконано</span>`;
      else {
        const a = Z.avail(fr); const started = Z.progress.get(fr.id);
        action = a === "open" ? `<a class="btn sm" href="${Z.link("lesson.html", { id: fr.id })}">${started ? "Продовжити" : "Почати"} ▶</a>` : `<span class="soon">⏳ Урок готується</span>`;
      }
      return `<div class="card next" style="--c:${sub.color}"><div class="next-head"><span class="dot"></span><b>${Z.esc(sub.name)}</b><small class="muted">${S.done} з ${list.length}</small></div>
        ${fr ? `<p class="next-t">Урок ${fr.n}. ${Z.esc(fr.title)}</p>` : ""}<div class="bar"><i style="width:${S.pct}%;background:${sub.color}"></i></div><div class="next-act">${action}<a class="muted small" href="${Z.link("subject.html", { s: sub.id })}">усі уроки</a></div></div>`;
    }).join("");
    const redo = Z.state.plan.filter(l => Z.hwStatus(Z.progress.get(l.id)) === "redo");
    const redoHTML = redo.length ? `<div class="card warn-card"><h2 style="margin-top:0">↩️ Батьки повернули на доопрацювання</h2>${redo.map(l => Z.lessonRow(l)).join("")}</div>` : "";
    const bd = Z.badges(); const earned = bd.filter(b => b.earned);
    root.innerHTML = `<div class="card hello"><div><p class="eyebrow">${Z.gradeLabel(ch.grade)}</p><h1>${greet}, ${Z.esc(ch.name)}!</h1><p class="muted">Обери предмет і продовжуй з того місця, де зупинився. Кожен наступний урок відкривається, коли виконаєш попередній.</p></div>
        <div class="stats"><div><b>${A.done}</b><small>уроків виконано</small></div><div><b>${x}</b><small>XP · рівень ${Z.level(x)}</small></div><div><b>${Z.streak()}</b><small>днів поспіль</small></div><div><b>${A.stars}</b><small>зірок</small></div></div></div>
      ${redoHTML}
      <h2>Продовжити навчання</h2><div class="grid c3">${cards}</div>
      <h2>Нагороди <small class="muted">${earned.length} з ${bd.length}</small></h2>
      <div class="grid c4">${bd.map(b => `<div class="badge ${b.earned ? "earned" : ""}"><span class="ic">${b.icon}</span><div><b>${b.name}</b><br><small class="muted">${b.desc}</small></div></div>`).join("")}</div>`;
  }
  window.addEventListener("z-remote-update", render);
  render();
})();
