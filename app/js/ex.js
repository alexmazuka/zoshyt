/* Рендер, збір відповідей і перевірка вправ (схема v2: figure/image над умовою, кнопка «помилка» у кожній вправі) */
window.EX = (function () {
  const AUTO = new Set(['choice', 'multi', 'truefalse', 'fill', 'number', 'input', 'match', 'order', 'sort']);
  const esc = s => Z.esc(s), md = s => Z.md(s);
  const norm = s => String(s ?? '').toLowerCase().replace(/[’ʼ`´‘]/g, "'").replace(/\s+/g, ' ').replace(/[.,!?;:]+$/, '').trim();
  const normNum = s => String(s ?? '').replace(/\s+/g, '').replace(',', '.');
  const isNumLike = s => /^-?\d[\d\s]*([.,]\d+)?$/.test(String(s ?? '').trim());
  const sameNum = (a, b) => isNumLike(a) && isNumLike(b) && Math.abs(Number(normNum(a)) - Number(normNum(b))) < 1e-9;
  const isAuto = t => AUTO.has(t);
  const isManual = t => !AUTO.has(t);

  function fillParts(text) {
    const parts = []; const re = /\{([^{}]*)\}/g; let last = 0, m;
    while ((m = re.exec(text))) { if (m.index > last) parts.push({ t: 's', v: text.slice(last, m.index) }); parts.push({ t: 'b', v: m[1].split('|').map(x => x.trim()).filter(Boolean) }); last = re.lastIndex; }
    if (last < text.length) parts.push({ t: 's', v: text.slice(last) });
    return parts;
  }
  const answerList = ex => Array.isArray(ex.answer) ? ex.answer : [ex.answer];

  /* ---- перевірка: {score 0..1, complete, detail, manual} ---- */
  function grade(ex, ans) {
    switch (ex.type) {
      case 'choice': return { score: ans === ex.answer ? 1 : 0, complete: ans != null };
      case 'multi': { const a = new Set(ans || []), c = new Set(ex.answer); let hit = 0, wrong = 0; a.forEach(i => c.has(i) ? hit++ : wrong++); const exact = hit === c.size && wrong === 0; return { score: exact ? 1 : Math.max(0, (hit - wrong) / c.size), complete: a.size > 0 }; }
      case 'truefalse': { let ok = 0, n = 0; const det = []; ex.items.forEach((it, i) => { const v = (ans || {})[i]; if (v != null) n++; const g = v === it.answer; if (g) ok++; det.push(g); }); return { score: ok / ex.items.length, complete: n === ex.items.length, detail: det }; }
      case 'fill': { const bl = fillParts(ex.text).filter(p => p.t === 'b'); let ok = 0; const det = []; bl.forEach((p, i) => { const v = norm((ans || {})[i]); const g = p.v.some(x => norm(x) === v || sameNum(x, v)); if (g) ok++; det.push(g); }); return { score: bl.length ? ok / bl.length : 0, complete: bl.every((p, i) => norm((ans || {})[i]) !== ''), detail: det }; }
      case 'number': { const v = normNum(ans), a = normNum(ex.answer); const g = v !== '' && !isNaN(Number(v)) && Math.abs(Number(v) - Number(a)) < 1e-9; return { score: g ? 1 : 0, complete: v !== '' }; }
      case 'input': { const v = norm(ans); return { score: answerList(ex).some(x => norm(x) === v || sameNum(x, v)) ? 1 : 0, complete: v !== '' }; }
      case 'match': { let ok = 0; const det = []; ex.pairs.forEach((p, i) => { const g = (ans || {})[i] === String(p[1]); if (g) ok++; det.push(g); }); return { score: ok / ex.pairs.length, complete: ex.pairs.every((p, i) => (ans || {})[i]), detail: det }; }
      case 'order': { const cur = ans || []; let ok = 0; const det = []; ex.items.forEach((it, i) => { const g = cur[i] === it; if (g) ok++; det.push(g); }); return { score: ok === ex.items.length ? 1 : ok / ex.items.length, complete: cur.length === ex.items.length, detail: det }; }
      case 'sort': { const all = []; Object.entries(ex.groups).forEach(([g, items]) => items.forEach(it => all.push([String(it), g]))); let ok = 0; const det = {}; all.forEach(([it, g]) => { const good = (ans || {})[it] === g; if (good) ok++; det[it] = good; }); return { score: all.length ? ok / all.length : 0, complete: all.every(([it]) => (ans || {})[it]), detail: det }; }
      case 'text': { const v = String(ans || '').trim(); return { score: 1, complete: v.length >= (ex.min || 20), manual: true, need: ex.min || 20, have: v.length }; }
      case 'checklist': { const a = ans || {}; return { score: 1, complete: ex.items.every((_, i) => a[i]), manual: true }; }
      case 'speak': return { score: 1, complete: !!ans, manual: true };
    }
    return { score: 0, complete: false };
  }

  /* правильна відповідь текстом */
  function answerText(ex) {
    switch (ex.type) {
      case 'choice': return String(ex.options[ex.answer]);
      case 'multi': return ex.answer.map(i => ex.options[i]).join('; ');
      case 'truefalse': return ex.items.map(it => (it.answer ? 'Так' : 'Ні') + ' — ' + it.text).join('\n');
      case 'fill': return fillParts(ex.text).map(p => p.t === 's' ? p.v : '[' + p.v[0] + ']').join('');
      case 'number': return String(ex.answer);
      case 'input': return answerList(ex).join(' / ');
      case 'match': return ex.pairs.map(p => p[0] + ' → ' + p[1]).join('\n');
      case 'order': return ex.items.map((it, i) => (i + 1) + '. ' + it).join('\n');
      case 'sort': return Object.entries(ex.groups).map(([g, items]) => g + ': ' + items.join(', ')).join('\n');
      case 'text': return ex.sample || '';
      default: return '';
    }
  }
  /* відповідь учня текстом (для батьків) */
  function userAnswerText(ex, ans) {
    if (ans == null) return '—';
    switch (ex.type) {
      case 'choice': return ex.options[ans] != null ? String(ex.options[ans]) : '—';
      case 'multi': return (ans || []).map(i => ex.options[i]).join('; ') || '—';
      case 'truefalse': return ex.items.map((it, i) => (ans[i] == null ? '?' : ans[i] ? 'Так' : 'Ні') + ' — ' + it.text).join('\n');
      case 'fill': { let k = 0; return fillParts(ex.text).map(p => p.t === 's' ? p.v : '[' + (ans[k++] || '_') + ']').join(''); }
      case 'match': return ex.pairs.map((p, i) => p[0] + ' → ' + (ans[i] || '?')).join('\n');
      case 'order': return (ans || []).map((it, i) => (i + 1) + '. ' + it).join('\n');
      case 'sort': return Object.entries(ans || {}).map(([it, g]) => it + ' → ' + g).join('\n') || '—';
      case 'checklist': return ex.items.map((it, i) => ((ans || {})[i] ? '☑ ' : '☐ ') + it).join('\n');
      case 'speak': return ans ? 'прочитано вголос ✓' : '—';
      default: return String(ans);
    }
  }

  /* SVG з уроку: прибираємо все, що може виконати код (валідатор це вже перевіряє, тут — страховка) */
  function svgSafe(svg) {
    try {
      const doc = new DOMParser().parseFromString(String(svg), 'image/svg+xml');
      const root = doc.documentElement; if (!root || root.nodeName.toLowerCase() !== 'svg') return '';
      root.querySelectorAll('script,foreignObject,iframe,image').forEach(n => n.remove());
      root.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => { if (/^on/i.test(a.name) || /javascript:/i.test(a.value) || (/href$/i.test(a.name) && /^https?:/i.test(a.value))) n.removeAttribute(a.name); }));
      root.removeAttribute('width'); root.removeAttribute('height'); root.setAttribute('role', 'img');
      return new XMLSerializer().serializeToString(root);
    } catch (e) { return ''; }
  }

  /* ---- рендер ---- */
  function speakBtn(text, lang) { return `<button type="button" class="speak-btn" data-speak="${esc(text)}" data-lang="${lang || 'uk'}" title="Прослухати">🔊</button>`; }
  function render(ex, idx, ans, seed, readonly) {
    const dis = readonly ? 'disabled' : '';
    let body = '';
    switch (ex.type) {
      case 'choice':
        body = `<div class="opts">${ex.options.map((o, i) => `<label data-i="${i}"><input type="radio" name="ex${idx}" value="${i}" ${ans === i ? 'checked' : ''} ${dis}><span>${md(String(o))}</span></label>`).join('')}</div>`; break;
      case 'multi':
        body = `<div class="opts">${ex.options.map((o, i) => `<label data-i="${i}"><input type="checkbox" name="ex${idx}" value="${i}" ${(ans || []).includes(i) ? 'checked' : ''} ${dis}><span>${md(String(o))}</span></label>`).join('')}</div><small class="muted">Може бути кілька правильних відповідей.</small>`; break;
      case 'truefalse':
        body = `<div class="tf">${ex.items.map((it, i) => `<div class="row" data-i="${i}"><span>${md(it.text)}</span><label><input type="radio" name="ex${idx}_${i}" value="1" ${(ans || {})[i] === true ? 'checked' : ''} ${dis}><span>Так</span></label><label><input type="radio" name="ex${idx}_${i}" value="0" ${(ans || {})[i] === false ? 'checked' : ''} ${dis}><span>Ні</span></label></div>`).join('')}</div>`; break;
      case 'fill': {
        let k = 0; body = `<div class="fill">${fillParts(ex.text).map(p => { if (p.t === 's') return md(p.v); const i = k++; const w = Math.max(4, Math.min(20, (p.v[0] || '').length + 2)); return `<input type="text" data-b="${i}" value="${esc((ans || {})[i] || '')}" style="width:${w}ch" autocomplete="off" autocapitalize="off" spellcheck="false" ${dis}>`; }).join('')}</div>`; break;
      }
      case 'number':
        body = `<input type="text" inputmode="decimal" class="numinp" value="${esc(ans ?? '')}" placeholder="відповідь" autocomplete="off" ${dis} style="width:14ch">`; break;
      case 'input':
        body = `<input type="text" class="txtinp" value="${esc(ans ?? '')}" placeholder="відповідь" autocomplete="off" autocapitalize="off" ${dis} style="width:min(100%,32ch)">`; break;
      case 'match': {
        const rights = Z.shuffle(ex.pairs.map(p => String(p[1])), seed);
        body = `<div class="match">${ex.pairs.map((p, i) => `<div class="row" data-i="${i}"><span>${md(String(p[0]))}</span><span class="muted">→</span><select data-i="${i}" ${dis}><option value="">— обери —</option>${rights.map(r => `<option value="${esc(r)}" ${(ans || {})[i] === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>`).join('')}</div>`; break;
      }
      case 'order': {
        let cur = Array.isArray(ans) && ans.length === ex.items.length ? ans : null;
        if (!cur) { cur = Z.shuffle(ex.items, seed); if (cur.every((v, i) => v === ex.items[i])) cur.push(cur.shift()); }
        body = `<div class="order"><ol>${cur.map(it => `<li data-v="${esc(it)}"><span>${md(it)}</span>${readonly ? '' : '<button type="button" data-mv="-1" title="Вище">▲</button><button type="button" data-mv="1" title="Нижче">▼</button>'}</li>`).join('')}</ol><small class="muted">Пересувай рядки стрілками, щоб розставити по порядку.</small></div>`; break;
      }
      case 'sort': {
        const groups = Object.keys(ex.groups); const items = Z.shuffle([].concat(...Object.values(ex.groups)).map(String), seed);
        body = `<div class="sort">${items.map(it => `<div class="row" data-it="${esc(it)}"><span>${md(it)}</span><span class="muted">→</span><select data-it="${esc(it)}" ${dis}><option value="">— група —</option>${groups.map(g => `<option value="${esc(g)}" ${(ans || {})[it] === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>`).join('')}</div>`; break;
      }
      case 'text':
        body = `<textarea placeholder="Напиши відповідь тут…" ${dis}>${esc(ans || '')}</textarea><small class="muted">Мінімум ${ex.min || 20} символів. Цю роботу перевірять батьки.</small>`; break;
      case 'checklist':
        body = `<div class="checklist">${ex.items.map((it, i) => `<label><input type="checkbox" data-i="${i}" ${(ans || {})[i] ? 'checked' : ''} ${dis}><span>${md(it)}</span></label>`).join('')}</div>`; break;
      case 'speak':
        body = `<div class="theory"><div class="reading" style="font-size:1.15rem">${md(ex.text)} ${speakBtn(ex.text, ex.lang || (ex.text.match(/[а-яіїєґ]/i) ? 'uk' : 'en'))}</div></div><label class="checklist" style="display:flex;gap:8px;margin-top:8px"><input type="checkbox" class="spk" ${ans ? 'checked' : ''} ${dis}><span>Я прочитав уголос</span></label>`; break;
    }
    const manual = isManual(ex.type);
    const media = (ex.figure ? `<figure class="ex-media">${svgSafe(ex.figure)}</figure>` : '') + (ex.image && ex.image.src ? `<figure class="ex-media"><img src="${esc(ex.image.src)}" alt="${esc(ex.image.alt || '')}" loading="lazy">${ex.image.caption ? `<figcaption>${md(ex.image.caption)}</figcaption>` : ''}</figure>` : '');
    return `<div class="ex ${manual ? 'manual' : ''}" data-idx="${idx}" data-type="${ex.type}"><button type="button" class="ex-flag" data-flag="${idx}" title="Повідомити про помилку в цьому завданні">⚑</button><div class="q"><span class="num">${idx + 1}</span>${md(ex.q || (ex.type === 'truefalse' ? 'Так чи ні?' : ''))}${manual ? `<span class="tag">${ex.type === 'text' ? 'перевіряють батьки' : 'самоперевірка'}</span>` : ''}</div>${media}${body}<div class="check"></div><div class="fbwrap"></div></div>`;
  }

  /* ---- зібрати відповідь з DOM ---- */
  function collect(ex, el) {
    switch (ex.type) {
      case 'choice': { const c = el.querySelector('input[type=radio]:checked'); return c ? Number(c.value) : null; }
      case 'multi': return [...el.querySelectorAll('input[type=checkbox]:checked')].map(i => Number(i.value));
      case 'truefalse': { const a = {}; ex.items.forEach((_, i) => { const c = el.querySelector(`input[name$="_${i}"]:checked`); if (c) a[i] = c.value === '1'; }); return a; }
      case 'fill': { const a = {}; el.querySelectorAll('input[data-b]').forEach(i => a[i.dataset.b] = i.value); return a; }
      case 'number': return el.querySelector('.numinp').value;
      case 'input': return el.querySelector('.txtinp').value;
      case 'match': { const a = {}; el.querySelectorAll('select[data-i]').forEach(s => { if (s.value) a[s.dataset.i] = s.value; }); return a; }
      case 'order': return [...el.querySelectorAll('.order li')].map(li => li.dataset.v);
      case 'sort': { const a = {}; el.querySelectorAll('select[data-it]').forEach(s => { if (s.value) a[s.dataset.it] = s.value; }); return a; }
      case 'text': return el.querySelector('textarea').value;
      case 'checklist': { const a = {}; el.querySelectorAll('input[data-i]').forEach(i => { if (i.checked) a[i.dataset.i] = true; }); return a; }
      case 'speak': return el.querySelector('.spk').checked;
    }
  }

  /* ---- підсвітити результат ---- */
  function mark(ex, el, res, reveal) {
    el.querySelectorAll('.ok,.bad,.reveal').forEach(n => n.classList.remove('ok', 'bad', 'reveal'));
    switch (ex.type) {
      case 'choice': el.querySelectorAll('.opts label').forEach(l => { const i = Number(l.dataset.i); if (l.querySelector('input').checked) l.classList.add(i === ex.answer ? 'ok' : 'bad'); if (reveal && i === ex.answer) l.classList.add('reveal'); }); break;
      case 'multi': el.querySelectorAll('.opts label').forEach(l => { const i = Number(l.dataset.i); const ch = l.querySelector('input').checked; if (ch) l.classList.add(ex.answer.includes(i) ? 'ok' : 'bad'); if (reveal && ex.answer.includes(i)) l.classList.add('reveal'); }); break;
      case 'truefalse': el.querySelectorAll('.tf .row').forEach((r, i) => { if (res.detail && res.detail[i] != null && r.querySelector('input:checked')) r.classList.add(res.detail[i] ? 'ok' : 'bad'); }); break;
      case 'fill': el.querySelectorAll('input[data-b]').forEach((inp, i) => inp.classList.add(res.detail[i] ? 'ok' : 'bad')); break;
      case 'number': el.querySelector('.numinp').classList.add(res.score === 1 ? 'ok' : 'bad'); break;
      case 'input': el.querySelector('.txtinp').classList.add(res.score === 1 ? 'ok' : 'bad'); break;
      case 'match': el.querySelectorAll('select[data-i]').forEach((s, i) => s.classList.add(res.detail[i] ? 'ok' : 'bad')); break;
      case 'order': el.querySelectorAll('.order li').forEach((li, i) => li.classList.add(res.detail[i] ? 'ok' : 'bad')); break;
      case 'sort': el.querySelectorAll('select[data-it]').forEach(s => s.classList.add(res.detail[s.dataset.it] ? 'ok' : 'bad')); break;
    }
  }
  function setReadonly(el, ro) { el.querySelectorAll('input,select,textarea,.order button').forEach(n => n.disabled = ro); }
  function feedback(el, cls, html) { el.querySelector('.fbwrap').innerHTML = `<div class="fb ${cls}">${html}</div>`; }

  /* делеговані обробники: порядок і озвучення */
  document.addEventListener('click', e => {
    const mv = e.target.closest('button[data-mv]');
    if (mv) { const li = mv.closest('li'); const ol = li.parentElement; const d = Number(mv.dataset.mv); if (d < 0 && li.previousElementSibling) ol.insertBefore(li, li.previousElementSibling); if (d > 0 && li.nextElementSibling) ol.insertBefore(li.nextElementSibling, li); li.closest('.ex').dispatchEvent(new Event('change', { bubbles: true })); return; }
    const sp = e.target.closest('button[data-speak]');
    if (sp) { Z.speak(sp.dataset.speak, sp.dataset.lang); }
  });

  return { AUTO, isAuto, isManual, grade, render, collect, mark, setReadonly, feedback, answerText, userAnswerText, fillParts, speakBtn, svgSafe };
})();
