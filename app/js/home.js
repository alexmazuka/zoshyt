/* Вхід і сторінка сім'ї: діти, перший вхід (додати дитину, створити PIN), вихід */
(async function () {
  const root = document.getElementById("app");
  const GRADES = Array.from({ length: 11 }, (_, i) => "g" + String(i + 1).padStart(2, "0"));
  function shell(inner) { root.innerHTML = `<main class="wrap"><div class="auth-wrap">${inner}</div></main>`; }
  try { await Z.DB.init(); } catch (e) { shell(`<div class="card auth">Не вдалося підключитися: ${Z.esc(e.message)}</div>`); return; }
  render();

  async function render() {
    const u = Z.DB.user();
    if (!u) return loginView();
    let profile;
    try { profile = await Z.DB.get("users", u.uid); }
    catch (e) { if (Z.DB.denied(e)) return notAllowedView(u); shell(`<div class="card auth">Помилка: ${Z.esc(e.message)}</div>`); return; }
    if (!profile) {
      profile = { email: u.email, children: [], createdAt: Z.DB.now() };
      try { await Z.DB.set("users", u.uid, profile, true); }
      catch (e) { if (Z.DB.denied(e)) return notAllowedView(u); throw e; }
    }
    Z.state.user = u; Z.state.profile = profile;
    if (!profile.children || !profile.children.length) return Z.DB.isAdmin() ? familyView(profile) : childView(true);
    if (!profile.parentPinHash) return pinView();
    familyView(profile);
  }


  function loginView() {
    shell(`<div class="card auth">
      <p class="eyebrow">NextEducationAI</p><h1>Вхід у «Зошит»</h1>
      <p class="muted">Логін і пароль надсилає команда пілоту. Один вхід — для всієї сім'ї: і для дитини, і для батьків.</p>
      ${Z.DB.mock ? '<p class="notice">Тестовий режим: увійдіть з будь-яким email і паролем. Дані зберігаються лише в цьому браузері.</p>' : ""}
      <form id="lf" novalidate>
        <div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="username" required></div>
        <div class="field"><label for="pw">Пароль</label><input id="pw" type="password" autocomplete="current-password" required></div>
        <p class="err" id="err" role="alert"></p>
        <p class="row-btns"><button class="btn" id="go" type="submit">Увійти</button><button class="btn ghost" type="button" id="forgot">Забули пароль?</button></p>
      </form>
      <p class="muted small">Ще немає доступу? <a href="../#zapys">Запишіться на пілот</a>.</p></div>`);
    const err = document.getElementById("err");
    document.getElementById("lf").onsubmit = async e => {
      e.preventDefault(); err.textContent = ""; const btn = document.getElementById("go"); btn.disabled = true;
      try { await Z.DB.signIn(document.getElementById("em").value, document.getElementById("pw").value); render(); }
      catch (ex) { err.textContent = authError(ex); }
      finally { btn.disabled = false; }
    };
    document.getElementById("forgot").onclick = async () => {
      const em = document.getElementById("em").value.trim();
      if (!em) { err.textContent = "Введіть email, і ми надішлемо лист для зміни пароля."; document.getElementById("em").focus(); return; }
      try { await Z.DB.resetPassword(em); Z.toast("Лист для зміни пароля надіслано на " + em, "ok"); }
      catch (ex) { err.textContent = authError(ex); }
    };
  }
  function authError(e) {
    const c = e && e.code || "";
    if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return "Невірний email або пароль.";
    if (/too-many-requests/.test(c)) return "Забагато спроб. Спробуйте через кілька хвилин.";
    if (/network/.test(c)) return "Немає зв'язку з сервером. Перевірте інтернет.";
    return "Не вдалося увійти: " + (e && e.message || "невідома помилка");
  }

  function notAllowedView(u) {
    shell(`<div class="card auth"><h1>Доступ ще не активовано</h1><p>Ви увійшли як <b>${Z.esc(u.email)}</b>, але цей акаунт ще не додано до пілоту.</p><p class="muted">Напишіть нам: <a href="mailto:info@nexteducationai.org">info@nexteducationai.org</a>.</p><p><button class="btn ghost" id="out">Вийти</button></p></div>`);
    document.getElementById("out").onclick = async () => { await Z.DB.signOut(); render(); };
  }

  async function childView(first) {
    const avail = await Promise.all(GRADES.map(g => Z.gradeAvailable(g)));
    shell(`<div class="card auth"><p class="eyebrow">${first ? "Крок 1 з 2" : "Нова дитина"}</p><h1>${first ? "Хто вчитиметься?" : "Додати дитину"}</h1>
      <p class="muted">Ім'я бачитимуть лише ваша сім'я і команда пілоту. Можна скорочене.</p>
      <form id="cf"><div class="field"><label for="nm">Ім'я дитини</label><input id="nm" maxlength="30" required></div>
      <div class="field"><label for="gr">Клас</label><select id="gr" required><option value="">Оберіть клас</option>${GRADES.map((g, i) => `<option value="${g}" ${avail[i] ? "" : "disabled"}>${Z.gradeLabel(g)}${avail[i] ? "" : " — готуємо"}</option>`).join("")}</select></div>
      <p class="row-btns">${first ? "" : '<button type="button" class="btn ghost" id="back">Назад</button>'}<button class="btn" type="submit">Далі</button></p></form></div>`);
    const back = document.getElementById("back"); if (back) back.onclick = render;
    document.getElementById("cf").onsubmit = async e => {
      e.preventDefault();
      const name = document.getElementById("nm").value.trim(), grade = document.getElementById("gr").value;
      if (!name || !grade) { Z.toast("Вкажіть ім'я і клас", "bad"); return; }
      const children = (Z.state.profile.children || []).concat([{ id: "c" + Date.now().toString(36), name, grade }]);
      await Z.DB.set("users", Z.state.user.uid, { children }, true);
      Z.state.profile.children = children; render();
    };
  }

  function pinView() {
    shell(`<div class="card auth"><p class="eyebrow">Крок 2 з 2</p><h1>PIN для кабінету батьків</h1>
      <p class="muted">У кабінеті батьків ви перевіряєте домашні завдання і бачите відповіді. PIN потрібен, щоб дитина туди не заходила. Запам'ятайте його: дитині не показуйте.</p>
      <form id="pf"><div class="field"><label for="p1">PIN (4–8 цифр)</label><input id="p1" type="password" inputmode="numeric" autocomplete="new-password" required></div>
      <div class="field"><label for="p2">Повторіть PIN</label><input id="p2" type="password" inputmode="numeric" autocomplete="new-password" required></div>
      <p class="err" id="err" role="alert"></p><p><button class="btn" type="submit">Зберегти і почати</button></p></form></div>`);
    document.getElementById("pf").onsubmit = async e => {
      e.preventDefault(); const p1 = document.getElementById("p1").value.trim(), p2 = document.getElementById("p2").value.trim(); const err = document.getElementById("err");
      if (!/^\d{4,8}$/.test(p1)) { err.textContent = "PIN — від 4 до 8 цифр."; return; }
      if (p1 !== p2) { err.textContent = "PIN і повторення не збігаються."; return; }
      await Z.setPin(p1); render();
    };
  }

  function familyView(profile) {
    const kids = profile.children || [];
    root.innerHTML = `<header class="top"><a class="brand" href="index.html"><span class="logo-word">Зошит</span><small>${Z.esc(profile.email || Z.state.user.email)}</small></a><nav></nav><div class="me">${Z.DB.isAdmin() ? '<a class="chip" href="admin.html">Адмін-панель</a>' : ""}<button class="chip btn-link" id="out" type="button">Вийти</button></div></header>
      <main class="wrap"><h1 class="hi">Хто зараз вчиться?</h1>
      <div class="kids">${kids.map(c => `<div class="kid card"><div class="kid-ava" aria-hidden="true">${Z.esc((c.name || "?").slice(0, 1).toUpperCase())}</div><h2>${Z.esc(c.name)}</h2><p class="muted">${Z.gradeLabel(c.grade)}</p>
        <p class="row-btns"><a class="btn" href="klas.html?c=${encodeURIComponent(c.id)}">Відкрити зошит</a><a class="btn ghost sm" href="parent.html?c=${encodeURIComponent(c.id)}">Кабінет батьків</a></p></div>`).join("")}
        <button class="kid card add" id="add" type="button"><span class="kid-ava">+</span><b>Додати дитину</b></button></div>
      <p class="muted small">Помітили помилку в уроці? У кожному уроці є кнопка «⚑ Помилка?» — повідомлення одразу бачить команда.</p></main>`;
    document.getElementById("out").onclick = async () => { await Z.DB.signOut(); render(); };
    document.getElementById("add").onclick = () => childView(false);
  }
})();
