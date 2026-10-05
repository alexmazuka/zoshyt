/* «Зошит» 1–11: ядро застосунку — вхід, профіль сім'ї, дані класу, прогрес дитини, синхронізація, утиліти.
   Уроки кожного предмета відкриваються по черзі. Якщо наступного уроку ще немає, застосунок записує запит
   у demand/{клас}__{предмет}: команда бачить, які уроки потрібні, і дописує їх. */
window.Z = (function () {
  const FB_VER = "12.18.0";
  const FB_CONFIG = {
    apiKey: "AIzaSyAi08s4KnoWQuQtcKkkd1ODF7ErxTrxOBw",
    authDomain: "zoshyt-4klas.firebaseapp.com",
    projectId: "zoshyt-4klas",
    storageBucket: "zoshyt-4klas.firebasestorage.app",
    messagingSenderId: "182774037902",
    appId: "1:182774037902:web:b5d3a9b33b0743317a38df",
  };
  const ADMIN_EMAILS = ["alex.mazuka@gmail.com"];
  const BUFFER = 2; // скільки уроків наперед має бути готово для кожної дитини
  const DATA = "../data/";
  const DAYS = ["", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота", "Неділя"];
  const DAYS_SHORT = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

  const params = new URLSearchParams(location.search);
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (LOCAL && params.has("mock")) sessionStorage.setItem("zmock", params.get("mock") || "1");
  const MOCK = LOCAL && !!sessionStorage.getItem("zmock");

  const state = { user: null, profile: null, child: null, grade: null, cal: null, subjects: [], subjMap: {}, program: "", plan: [], byId: {}, bySubject: {}, byWeek: {} };

  /* ---------------- доступ до бази: Firebase або тестовий режим ---------------- */
  const DB = (function () {
    let fb = null, user = null, ready = null;
    const authCbs = [];
    const denied = e => e && (e.code === "permission-denied" || /permission/i.test(e.message || ""));

    async function loadFB() {
      const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
      const [app, auth, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
      const a = app.initializeApp(FB_CONFIG);
      fb = { app, authM: auth, fs, a, auth: auth.getAuth(a), db: fs.getFirestore(a) };
    }

    /* тестовий режим (лише localhost?mock=1): усе в localStorage, вхід з будь-яким паролем */
    const M = {
      load() { try { return JSON.parse(localStorage.getItem("zmock.db")) || {}; } catch (e) { return {}; } },
      save(d) { localStorage.setItem("zmock.db", JSON.stringify(d)); },
      col(name) { const d = this.load(); d[name] ||= {}; return d; },
    };

    function init() {
      if (ready) return ready;
      ready = (async () => {
        if (MOCK) {
          try { user = JSON.parse(sessionStorage.getItem("zmock.user")); } catch (e) { user = null; }
          return;
        }
        await loadFB();
        await new Promise(res => {
          let first = true;
          fb.authM.onAuthStateChanged(fb.auth, u => {
            user = u ? { uid: u.uid, email: (u.email || "").toLowerCase() } : null;
            authCbs.forEach(cb => cb(user));
            if (first) { first = false; res(); }
          });
        });
      })();
      return ready;
    }

    return {
      denied,
      mock: MOCK,
      init,
      user: () => user,
      isAdmin: () => !!user && (ADMIN_EMAILS.includes(user.email) || (MOCK && sessionStorage.getItem("zmock") === "admin")),
      onAuth(cb) { authCbs.push(cb); },
      now() { return MOCK || !fb ? Date.now() : fb.fs.serverTimestamp(); },
      async signIn(email, pass) {
        email = String(email || "").trim().toLowerCase();
        if (MOCK) {
          if (!email || !pass) throw Object.assign(new Error("Введіть email і пароль"), { code: "auth/invalid-credential" });
          user = { uid: "mock-" + hash(email), email }; sessionStorage.setItem("zmock.user", JSON.stringify(user));
          const d = M.col("allowlist"); d.allowlist[email] = d.allowlist[email] || { createdAt: Date.now() }; M.save(d);
          return user;
        }
        const c = await fb.authM.signInWithEmailAndPassword(fb.auth, email, pass);
        user = { uid: c.user.uid, email: (c.user.email || "").toLowerCase() };
        return user;
      },
      async signOut() { if (MOCK) { sessionStorage.removeItem("zmock.user"); user = null; return; } await fb.authM.signOut(fb.auth); user = null; },
      async resetPassword(email) {
        if (MOCK) return;
        await fb.authM.sendPasswordResetEmail(fb.auth, String(email || "").trim(), { url: location.origin + location.pathname.replace(/[^/]*$/, "index.html") });
      },
      async get(col, id) {
        if (MOCK) { const d = M.col(col); const v = d[col][id]; return v ? JSON.parse(JSON.stringify(v)) : null; }
        const snap = await fb.fs.getDoc(fb.fs.doc(fb.db, col, id));
        return snap.exists() ? snap.data() : null;
      },
      async set(col, id, data, merge) {
        if (MOCK) { const d = M.col(col); d[col][id] = merge ? Object.assign(d[col][id] || {}, data) : data; M.save(d); return; }
        await fb.fs.setDoc(fb.fs.doc(fb.db, col, id), data, merge ? { merge: true } : undefined);
      },
      async add(col, data) {
        if (MOCK) { const d = M.col(col); const id = "m" + Date.now().toString(36) + Math.floor(Math.random() * 1e4); d[col][id] = data; M.save(d); return id; }
        const r = await fb.fs.addDoc(fb.fs.collection(fb.db, col), data);
        return r.id;
      },
      async remove(col, id) {
        if (MOCK) { const d = M.col(col); delete d[col][id]; M.save(d); return; }
        await fb.fs.deleteDoc(fb.fs.doc(fb.db, col, id));
      },
      async list(col) {
        if (MOCK) { const d = M.col(col); return Object.entries(d[col]).map(([id, v]) => Object.assign({ id }, v)); }
        const snap = await fb.fs.getDocs(fb.fs.collection(fb.db, col));
        return snap.docs.map(x => Object.assign({ id: x.id }, x.data()));
      },
      watch(col, id, cb, onErr) {
        if (MOCK) { return () => {}; }
        return fb.fs.onSnapshot(fb.fs.doc(fb.db, col, id), snap => cb(snap.exists() ? snap.data() : null), onErr || (e => console.warn("watch", e)));
      },
      /* адміністратор створює акаунт тестувальника: окремий екземпляр Firebase, щоб не вийти з власного акаунта */
      async createAccount(email, pass) {
        email = String(email || "").trim().toLowerCase();
        if (MOCK) return { created: true };
        const second = fb.app.initializeApp(FB_CONFIG, "create-" + Date.now());
        const a2 = fb.authM.getAuth(second);
        try {
          await fb.authM.createUserWithEmailAndPassword(a2, email, pass);
          await fb.authM.signOut(a2);
          return { created: true };
        } catch (e) {
          if (e.code === "auth/email-already-in-use") return { created: false, exists: true };
          throw e;
        }
      },
      tsToMs(t) { if (!t) return 0; if (typeof t === "number") return t; if (t.toMillis) return t.toMillis(); if (t.seconds) return t.seconds * 1000; return 0; },
    };
  })();

  /* ---------------- дані класу ---------------- */
  async function loadJSON(p) { const r = await fetch(p, { cache: "no-cache" }); if (!r.ok) throw new Error(p + " → " + r.status); return r.json(); }
  async function loadGrade(g) {
    const [cal, subj, plan] = await Promise.all([loadJSON(DATA + "calendar.json"), loadJSON(DATA + g + "/subjects.json"), loadJSON(DATA + g + "/plan.json")]);
    state.cal = cal; state.subjects = subj.subjects; state.program = subj.program || ""; state.timetableNote = subj.timetableNote || "";
    state.subjMap = Object.fromEntries(subj.subjects.map(s => [s.id, s]));
    state.plan = plan.lessons; state.byId = {}; state.bySubject = {}; state.byWeek = {};
    plan.lessons.forEach(l => { state.byId[l.id] = l; (state.bySubject[l.subject] ||= []).push(l); (state.byWeek[l.week] ||= []).push(l); });
    Object.values(state.bySubject).forEach(list => list.sort((a, b) => a.n - b.n));
    return state;
  }
  async function gradeAvailable(g) { try { const r = await fetch(DATA + g + "/plan.json", { method: "HEAD", cache: "no-cache" }); return r.ok; } catch (e) { return false; } }
  function gradeLabel(g) { return Number(String(g).replace("g", "")) + " клас"; }
  function band(g) { const n = Number(String(g).replace("g", "")); return n <= 2 ? "1–2" : n <= 4 ? "3–4" : n <= 6 ? "5–6" : n <= 9 ? "7–9" : "10–11"; }

  /* ---------------- календар ---------------- */
  function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function isoDate(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function fmt(d, opts) { return d.toLocaleDateString("uk-UA", opts || { day: "numeric", month: "long" }); }
  function weekInfo(week) { return state.cal.weeks.find(w => w.week === week); }
  function dateOf(week, day) { const w = weekInfo(week); const d = parseDate(w.monday); d.setDate(d.getDate() + day - 1); return d; }
  function today() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
  function schoolDays() { const out = []; state.cal.weeks.forEach(w => w.days.forEach(day => out.push({ week: w.week, day, iso: isoDate(dateOf(w.week, day)) }))); return out; }

  /* ---------------- прогрес дитини ---------------- */
  const progress = {
    _d: null, _key: null, _docId: null, _timer: null, _unsub: null,
    load() {
      if (!this._d) { try { this._d = JSON.parse(localStorage.getItem(this._key)) || {}; } catch (e) { this._d = {}; } }
      this._d.lessons ||= {}; this._d.log ||= []; return this._d;
    },
    save() { if (this._key) localStorage.setItem(this._key, JSON.stringify(this.load())); this.pushSoon(); },
    get(id) { return this.load().lessons[id] || null; },
    ensure(id) {
      const d = this.load();
      if (!d.lessons[id]) d.lessons[id] = { opened: Date.now(), theory: null, practice: { answers: {}, results: {}, score: null, done: null, attempts: 0, best: null }, homework: { answers: {}, results: {}, score: null, submitted: null, review: null }, time: 0, last: Date.now() };
      return d.lessons[id];
    },
    set(id, rec) { rec.last = Date.now(); this.load().lessons[id] = rec; this.save(); },
    remove(id) { delete this.load().lessons[id]; this.save(); },
    log(ev) { const d = this.load(); ev.t = Date.now(); d.log.push(ev); if (d.log.length > 2000) d.log.splice(0, d.log.length - 2000); this.save(); },
    json() { return JSON.stringify({ version: 2, progress: this.load() }); },
    merge(json) {
      const o = typeof json === "string" ? JSON.parse(json) : json; const src = o.progress || o; const d = this.load(); let n = 0;
      Object.entries(src.lessons || {}).forEach(([id, rec]) => { const cur = d.lessons[id]; if (!cur || (rec.last || 0) > (cur.last || 0)) { d.lessons[id] = rec; n++; } });
      const seen = new Set(d.log.map(e => e.t + e.type + (e.id || "")));
      (src.log || []).forEach(e => { const k = e.t + e.type + (e.id || ""); if (!seen.has(k)) { d.log.push(e); seen.add(k); } });
      d.log.sort((a, b) => a.t - b.t);
      if (this._key) localStorage.setItem(this._key, JSON.stringify(d));
      return n;
    },
    async attach(docId) {
      this._docId = docId; this._key = "zp." + docId; this._d = null; this.load();
      try { const remote = await DB.get("progress", docId); if (remote && remote.progressJson) this.merge(remote.progressJson); } catch (e) { console.warn("progress pull", e); }
      if (this._unsub) this._unsub();
      this._unsub = DB.watch("progress", docId, data => {
        if (data && data.progressJson) { const n = this.merge(data.progressJson); if (n) window.dispatchEvent(new CustomEvent("z-remote-update", { detail: { n } })); }
      });
    },
    pushSoon() { if (!this._docId) return; clearTimeout(this._timer); this._timer = setTimeout(() => this.push(), 1500); },
    async push() {
      if (!this._docId) return;
      const S = summary();
      const last = this.load().log.slice(-1)[0];
      try {
        await DB.set("progress", this._docId, {
          progressJson: this.json(), grade: state.grade, childName: state.child ? state.child.name : "", email: state.user ? state.user.email : "",
          summary: { done: S.done, total: S.total, avg: S.avg, last: last ? last.t : null }, updatedAt: DB.now(),
        }, false);
      } catch (e) { console.warn("progress push", e); }
    },
  };

  const PASS = 70;
  function statusOf(id) { const r = progress.get(id); if (!r) return "new"; if (isRedo(r)) return "started"; if (r.practice.done && r.homework.submitted) return "done"; if (r.practice.done) return "practice"; return "started"; }
  function statusName(st) { return { new: "не розпочато", started: "розпочато", practice: "практику виконано, домашнє не здано", done: "виконано" }[st]; }
  function starsOf(score) { if (score == null) return 0; if (score >= 90) return 3; if (score >= 70) return 2; if (score >= 50) return 1; return 0; }
  function starsHTML(score) { const n = starsOf(score); return `<span class="stars" title="${score == null ? "" : score + "%"}">${"★".repeat(n)}${"☆".repeat(3 - n)}</span>`; }
  function hwStatus(r) { if (!r) return "none"; if (isRedo(r)) return "redo"; if (!r.homework.submitted) return "none"; if (r.homework.review && r.homework.review.status === "ok") return "ok"; return "submitted"; }
  /* повернення на доопрацювання: батьки позначають, що саме переробити (теорію, практику, домашнє) */
  function isRedo(r) { return !!(r && r.homework && r.homework.review && r.homework.review.status === "redo"); }
  function redoParts(r) { return isRedo(r) ? (r.homework.review.parts || ["homework"]) : []; }
  function hwStatusName(s) { return { none: "не здано", submitted: "здано, чекає перевірки", ok: "перевірено ✓", redo: "повернуто на доопрацювання" }[s]; }

  /* послідовне відкриття: урок доступний, коли попередній урок предмета виконано І його домашнє прийнято.
     Хто приймає — залежить від режиму, який обрали батьки для дитини:
     "parent" — «Перевіряю я»: наступний урок відкривається після перевірки батьків;
     "ai" — «Дитина вчиться сама»: домашнє одразу перевіряє Поясняйко (check.js) і сам відкриває наступний урок. */
  const CHECK_MODES = { parent: "👨‍👩‍👧 Перевіряю я", ai: "🦉 Дитина вчиться сама" };
  function checkMode(child) { const c = child || state.child; return c && c.checkMode === "parent" ? "parent" : "ai"; }
  function prevInSubject(l) { const list = state.bySubject[l.subject] || []; const i = list.indexOf(l); return i > 0 ? list[i - 1] : null; }
  function passed(l) { return statusOf(l.id) === "done" && hwStatus(progress.get(l.id)) === "ok"; }
  function lockInfo(l) {
    const prev = prevInSubject(l); if (!prev || passed(prev)) return null;
    if (statusOf(prev.id) !== "done") return { why: isRedo(progress.get(prev.id)) ? "redo" : "prev", prev };
    return { why: checkMode(), prev };
  }
  function lockText(info) {
    if (!info) return "";
    const t = "«" + info.prev.title + "»";
    return info.why === "parent" ? "Відкриється, коли батьки перевірять домашнє уроку " + t + "."
      : info.why === "ai" ? "Відкриється, коли Поясняйко перевірить домашнє уроку " + t + "."
      : info.why === "redo" ? "Спершу треба доробити повернутий урок " + t + "."
      : "Відкриється після уроку " + t + ": практика і домашнє завдання.";
  }
  function avail(l) {
    if (statusOf(l.id) === "done") return "done";
    if (lockInfo(l)) return "locked";
    return l.exists ? "open" : "soon";
  }
  function availIcon(a) { return { done: "✓", open: "▶", locked: "🔒", soon: "⏳" }[a]; }
  function availName(a) { return { done: "виконано", open: "можна проходити", locked: "відкриється після попереднього уроку", soon: "урок готується" }[a]; }
  function frontier(subject) { return (state.bySubject[subject] || []).find(l => statusOf(l.id) !== "done") || null; }

  /* запит на нові уроки: якщо в межах BUFFER уроків від поточного немає файлів */
  async function ensureDemand(subject) {
    const list = state.bySubject[subject] || []; const fr = frontier(subject); if (!fr) return;
    const i = list.indexOf(fr); const need = Math.min(list.length, i + 1 + BUFFER);
    if (!list.slice(i, need).some(l => !l.exists)) return;
    const key = state.grade + "__" + subject; const mark = "zdem." + key;
    if (Number(localStorage.getItem(mark) || 0) >= need) return;
    try {
      const cur = await DB.get("demand", key);
      if (!cur || (cur.maxN || 0) < need) await DB.set("demand", key, { grade: state.grade, subject, maxN: need, updatedAt: DB.now() }, true);
      localStorage.setItem(mark, String(need));
    } catch (e) { console.warn("demand", e); }
  }

  function summary(filter) {
    const ls = state.plan.filter(filter || (() => true));
    let done = 0, sumScore = 0, nScore = 0, time = 0, stars = 0, hwOk = 0, hwWait = 0;
    ls.forEach(l => {
      if (statusOf(l.id) === "done") done++;
      const r = progress.get(l.id);
      if (r) { time += r.time || 0; if (r.practice.best != null) { sumScore += r.practice.best; nScore++; stars += starsOf(r.practice.best); } const h = hwStatus(r); if (h === "ok") hwOk++; if (h === "submitted") hwWait++; }
    });
    return { total: ls.length, done, avg: nScore ? Math.round(sumScore / nScore) : null, time, stars, hwOk, hwWait, pct: ls.length ? Math.round(100 * done / ls.length) : 0 };
  }
  function xp() { let x = 0; Object.values(progress.load().lessons).forEach(r => { if (r.practice.done) { x += 10 + Math.round((r.practice.best || 0) / 10); if ((r.practice.best || 0) >= 90) x += 5; } if (r.homework.submitted) x += 10; if (r.homework.review && r.homework.review.status === "ok") x += 5; }); return x; }
  function level(x) { return Math.floor(x / 100) + 1; }
  function streak() {
    const days = new Set(); progress.load().log.forEach(e => { if (e.type === "practice" || e.type === "homework") days.add(isoDate(new Date(e.t))); });
    let n = 0; const d = today(); if (!days.has(isoDate(d))) d.setDate(d.getDate() - 1);
    while (days.has(isoDate(d))) { n++; d.setDate(d.getDate() - 1); if (d.getDay() === 0) d.setDate(d.getDate() - 2); }
    return n;
  }
  const BADGES = [
    { icon: "🚀", name: "Перший крок", desc: "Виконано перший урок", test: (S) => S.done >= 1 },
    { icon: "🔟", name: "Десятка", desc: "10 уроків виконано", test: (S) => S.done >= 10 },
    { icon: "⭐", name: "Півсотні", desc: "50 уроків виконано", test: (S) => S.done >= 50 },
    { icon: "💯", name: "Сотня", desc: "100 уроків виконано", test: (S) => S.done >= 100 },
    { icon: "🔥", name: "Серія 5", desc: "5 днів навчання поспіль", test: (S, c) => c.streak >= 5 },
    { icon: "🌋", name: "Серія 15", desc: "15 днів навчання поспіль", test: (S, c) => c.streak >= 15 },
    { icon: "🌟", name: "Відмінник", desc: "10 уроків на три зірки", test: (S, c) => c.three >= 10 },
    { icon: "✨", name: "Зоряний", desc: "50 уроків на три зірки", test: (S, c) => c.three >= 50 },
    { icon: "🧭", name: "Різнобічний", desc: "Виконано урок з кожного предмета", test: (S, c) => c.allSubj },
    { icon: "📝", name: "Домашка — клас", desc: "10 домашніх завдань прийнято батьками", test: (S, c) => c.reviewed >= 10 },
    { icon: "⏱️", name: "Марафонець", desc: "10 годин навчання", test: (S) => S.time >= 10 * 3600 },
  ];
  function badges() {
    const S = summary(); let three = 0, reviewed = 0; const subjDone = new Set();
    state.plan.forEach(l => { const r = progress.get(l.id); if (r && r.practice.best >= 90) three++; if (r && r.homework.review && r.homework.review.status === "ok") reviewed++; if (statusOf(l.id) === "done") subjDone.add(l.subject); });
    const c = { three, reviewed, streak: streak(), allSubj: state.subjects.length > 0 && state.subjects.every(s => subjDone.has(s.id)) };
    return BADGES.map(b => ({ icon: b.icon, name: b.name, desc: b.desc, earned: !!b.test(S, c) }));
  }

  /* ---------------- PIN кабінету батьків (лише SHA-256 хеш у профілі сім'ї) ---------------- */
  async function sha256Hex(s) { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))); return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
  async function checkPin(pin) { return !!state.profile && !!state.profile.parentPinHash && (await sha256Hex(pin)) === state.profile.parentPinHash; }
  async function setPin(pin) { const h = await sha256Hex(pin); state.profile.parentPinHash = h; await DB.set("users", state.user.uid, { parentPinHash: h }, true); }

  /* ---------------- старт сторінки дитини ---------------- */
  async function boot() {
    await DB.init();
    const u = DB.user();
    if (!u) { location.href = "index.html"; return null; }
    let profile;
    try { profile = await DB.get("users", u.uid); }
    catch (e) { if (DB.denied(e)) { location.href = "index.html"; return null; } throw e; }
    if (!profile || !profile.children || !profile.children.length) { location.href = "index.html"; return null; }
    const cid = qs("c") || localStorage.getItem("zchild." + u.uid);
    const child = profile.children.find(c => c.id === cid) || profile.children[0];
    localStorage.setItem("zchild." + u.uid, child.id);
    Object.assign(state, { user: u, profile, child, grade: child.grade });
    await loadGrade(child.grade);
    await progress.attach(u.uid + "__" + child.id);
    document.body.dataset.band = band(child.grade);
    return state;
  }
  function link(page, extra) { const p = new URLSearchParams(Object.assign({ c: state.child ? state.child.id : "" }, extra || {})); return page + "?" + p.toString(); }

  /* ---------------- утиліти ---------------- */
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+?)\*/g, "$1<i>$2</i>").replace(/\n/g, "<br>"); }
  function abbrify(html, terms) {
    const keys = Object.keys(terms || {}).sort((a, b) => b.length - a.length);
    if (!keys.length) return html;
    const re = new RegExp("(?<![\\p{L}'’])(" + keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![\\p{L}'’])", "gu");
    return html.split(/(<[^>]+>)/).map(part => part.startsWith("<") ? part : part.replace(re, m => `<abbr title="${esc(terms[m])}">${m}</abbr>`)).join("");
  }
  function hash(str) { let h = 7; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h || 1; }
  function shuffle(arr, seed) { const a = arr.slice(); let s = (seed || 1) >>> 0; const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return (s >>> 8) / 16777216; }; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function fmtTime(sec) { sec = sec || 0; const m = Math.round(sec / 60); if (m < 1) return "< 1 хв"; if (m < 60) return m + " хв"; return Math.floor(m / 60) + " год " + (m % 60) + " хв"; }
  function fmtDT(ts) { if (!ts) return "—"; const d = new Date(ts); return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }); }
  function qs(k) { return new URLSearchParams(location.search).get(k); }
  function subjTag(sid) { const s = state.subjMap[sid] || { color: "#64748B", short: sid, name: sid }; return `<span class="subj-tag" style="--c:${s.color}">${esc(s.short || s.name)}</span>`; }
  function speak(text, lang) {
    if (!("speechSynthesis" in window)) { toast("Озвучення недоступне в цьому браузері", "bad"); return; }
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = lang === "en" ? "en-GB" : "uk-UA"; u.rate = lang === "en" ? 0.88 : 0.95;
    const pick = () => { const vs = speechSynthesis.getVoices(); const pref = lang === "en" ? ["en-GB", "en-US", "en"] : ["uk-UA", "uk"]; for (const p of pref) { const v = vs.find(v => v.lang.replace("_", "-").toLowerCase().startsWith(p.toLowerCase())); if (v) { u.voice = v; break; } } speechSynthesis.speak(u); };
    if (speechSynthesis.getVoices().length) pick(); else speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; pick(); };
  }
  /* «Незавершені уроки»: що вже зроблено в кожному розпочатому уроці і що лишилося; повернуті батьками — першими */
  function unfinishedCard(limit) {
    const all = state.plan.map(l => ({ l, r: progress.get(l.id) })).filter(x => x.r && statusOf(x.l.id) !== "done");
    if (!all.length) return "";
    all.sort((a, b) => (isRedo(b.r) - isRedo(a.r)) || ((b.r.last || 0) - (a.r.last || 0)));
    const list = all.slice(0, limit || 8);
    const stg = (ok, label, extra) => `<span class="stg ${ok ? "ok" : ""}">${ok ? "✓" : "○"} ${label}${extra || ""}</span>`;
    const rows = list.map(({ l, r }) => {
      const redo = isRedo(r); const rv = r.homework.review; const next = !r.theory ? "теорія" : !r.practice.done ? "практика" : "домашнє";
      return `<div class="unf${redo ? " redo" : ""}"><div class="unf-t">${subjTag(l.subject)} <b>${esc(l.title)}</b>${redo ? ' <span class="chip warn">↩️ повернули батьки</span>' : ""}</div>
        <div class="stgs">${stg(!!r.theory, "Теорія")}${stg(!!r.practice.done, "Практика", r.practice.done && r.practice.score != null ? " · " + r.practice.score + "%" : "")}${stg(!!r.homework.submitted, "Домашнє")}</div>
        ${redo && rv.comment ? `<small class="muted">Коментар батьків: ${esc(rv.comment)}</small><br>` : ""}<a class="btn sm" href="${link("lesson.html", { id: l.id })}">Продовжити: ${next} ▶</a></div>`;
    }).join("");
    return `<div class="card unf-card"><h2 style="margin-top:0">🧩 Незавершені уроки: ${all.length}</h2><p class="muted">Уроки, які ти почав, але ще не пройшов до кінця. ✓ — етап зроблено, ○ — ще треба.</p>${rows}${all.length > list.length ? `<p class="muted">…і ще ${all.length - list.length}.</p>` : ""}</div>`;
  }
  function lessonRow(l) {
    const a = avail(l); const r = progress.get(l.id);
    const inner = `<span class="av av-${a}" title="${esc(a === "locked" ? lockText(lockInfo(l)) : availName(a))}">${availIcon(a)}</span><span class="t"><b>${esc(l.title)}</b><small>${esc(state.subjMap[l.subject] ? state.subjMap[l.subject].name : "")} · урок ${l.n}</small></span>${r && r.practice.best != null ? starsHTML(r.practice.best) : ""}`;
    return a === "open" || a === "done" ? `<a class="lesson-row ${a}" href="${link("lesson.html", { id: l.id })}">${inner}</a>` : `<div class="lesson-row ${a}">${inner}</div>`;
  }
  function header(active) {
    const x = xp(); const ch = state.child;
    const nav = [["klas.html", "Мій шлях", "home"], ["subject.html", "Предмети", "subject"], ["parent.html", "Батькам", "parent"]];
    return `<header class="top"><a class="brand" href="index.html"><span class="logo-word">Зошит</span><small>${ch ? esc(ch.name) + " · " + gradeLabel(ch.grade) : ""}</small></a>
      <nav>${nav.map(n => `<a href="${link(n[0])}" class="${active === n[2] ? "on" : ""}">${n[1]}</a>`).join("")}</nav>
      <div class="me"><span class="chip" title="Очки досвіду">⚡ ${x} XP · рів. ${level(x)}</span><span class="chip" title="Днів навчання поспіль">🔥 ${streak()}</span><button class="chip btn-link" id="hdr-report" type="button">⚑ Помилка?</button></div></header>`;
  }
  function wireHeader(ctx) { const b = document.getElementById("hdr-report"); if (b) b.onclick = () => window.Report && window.Report.open(ctx ? ctx() : {}); }
  function footer() { return `<footer>«Зошит» — бета-версія для пілоту. Помітили помилку — натисніть «⚑ Помилка?». · <a href="../">Про «Зошит»</a> · NextEducationAI</footer>`; }
  function toast(msg, cls) { const t = document.createElement("div"); t.className = "toast " + (cls || ""); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2800); }
  function modal(html) { const bg = document.createElement("div"); bg.className = "modal-bg"; bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`; document.body.appendChild(bg); bg.addEventListener("click", e => { if (e.target === bg) bg.remove(); }); return bg; }

  return {
    DB, state, DAYS, DAYS_SHORT, PASS, BUFFER, ADMIN_EMAILS,
    loadJSON, loadGrade, gradeAvailable, gradeLabel, band,
    parseDate, isoDate, fmt, weekInfo, dateOf, today, schoolDays,
    progress, statusOf, statusName, starsOf, starsHTML, hwStatus, hwStatusName, isRedo, redoParts,
    avail, availIcon, availName, prevInSubject, frontier, ensureDemand, CHECK_MODES, checkMode, passed, lockInfo, lockText,
    summary, xp, level, streak, badges, sha256Hex, checkPin, setPin, boot, link,
    esc, md, abbrify, hash, shuffle, fmtTime, fmtDT, qs, subjTag, speak, lessonRow, unfinishedCard, header, wireHeader, footer, toast, modal,
  };
})();
