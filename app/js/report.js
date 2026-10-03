/* «Повідомити про помилку»: коротка форма, повідомлення одразу потрапляє в адмін-панель команди */
window.Report = (function () {
  const KINDS = ["Помилка в завданні або відповіді", "Помилка в тексті чи правописі", "Незрозуміле пояснення", "Не працює кнопка чи сторінка", "Інше"];
  function open(ctx) {
    ctx = ctx || {};
    const st = Z.state; const where = [ctx.title ? `урок «${ctx.title}»` : ctx.page || "", ctx.exercise ? `завдання ${ctx.exercise}` : ""].filter(Boolean).join(", ");
    const m = Z.modal(`<h2>Повідомити про помилку</h2>${where ? `<p class="muted">${Z.esc(where)}</p>` : ""}
      <form id="rf"><div class="field"><label for="rk">Що сталося?</label><select id="rk">${KINDS.map(k => `<option>${k}</option>`).join("")}</select></div>
      <div class="field"><label for="rt">Опишіть коротко</label><textarea id="rt" rows="4" maxlength="2000" placeholder="Наприклад: у завданні 3 правильна відповідь 601, а зошит каже, що неправильно" required></textarea></div>
      <p class="err" id="rerr" role="alert"></p><p class="row-btns"><button class="btn ghost" type="button" data-x>Скасувати</button><button class="btn" type="submit">Надіслати</button></p></form>`);
    m.querySelector("[data-x]").onclick = () => m.remove();
    m.querySelector("#rt").focus();
    m.querySelector("#rf").onsubmit = async e => {
      e.preventDefault();
      const text = m.querySelector("#rt").value.trim(); if (text.length < 5) { m.querySelector("#rerr").textContent = "Напишіть хоча б кілька слів."; return; }
      const btn = m.querySelector("button[type=submit]"); btn.disabled = true;
      try {
        await Z.DB.add("reports", {
          uid: st.user ? st.user.uid : "", email: st.user ? st.user.email : "", childName: st.child ? st.child.name : "", grade: st.grade || "",
          subject: ctx.subject || "", lessonId: ctx.lessonId || "", title: ctx.title || "", step: ctx.step || "", exercise: ctx.exercise || null,
          kind: m.querySelector("#rk").value, text, url: location.href, ua: navigator.userAgent.slice(0, 200), status: "new", createdAt: Z.DB.now(),
        });
        m.remove(); Z.toast("Дякуємо! Повідомлення отримали — виправимо.", "ok");
      } catch (ex) { m.querySelector("#rerr").textContent = "Не вдалося надіслати: " + (ex.message || ex); btn.disabled = false; }
    };
  }
  return { open };
})();
