/* Єдиний ШІ-проксі «Зошита»: Поясняйко (платформа 1–11 кл.), 4 клас, Кліо (історія 10 кл.) і ШІ-перевірка домашніх.
   Один ключ Anthropic (секрет ANTHROPIC_API_KEY), найдешевша модель, жорсткі ліміти токенів.
   Клієнти шлють POST {system, messages, kind?}; відповідь {text, usage}. kind: 'chat' (за замовчуванням) або 'review'. */

const ALLOWED_ORIGINS = [
  'https://zoshyt.online',
  'https://www.zoshyt.online',
  'https://alexmazuka.github.io',
];
const DEFAULT_MODEL = 'claude-haiku-5-5';       // $0.10 / $0.50 за 1 млн токенів (вхід / вихід)
const MAX_OUT = { chat: 350, review: 220 };     // ліміт вихідних токенів на відповідь
const MAX_SYSTEM = 6000;                        // символів у системному промпті
const MAX_MSG = 1200;                           // символів у старих репліках розмови
const MAX_LAST = 4000;                          // символів в останньому повідомленні (для review там відповіді учня)
const MAX_MESSAGES = 6;                         // скільки останніх реплік пересилаємо моделі
const RATE_PER_MIN = 20;                        // запитів на хвилину з однієї IP (на ізолят Worker'а, «м'який» захист)

const hits = new Map();

function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...(origin ? cors(origin) : {}) } });
}
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) for (const k of hits.keys()) { if (!(hits.get(k) || []).some(t => now - t < 60000)) hits.delete(k); }
  return arr.length > RATE_PER_MIN;
}
function clean(messages) {
  let m = (Array.isArray(messages) ? messages : [])
    .filter(x => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string' && x.content.trim())
    .slice(-MAX_MESSAGES);
  while (m.length && m[0].role !== 'user') m.shift();
  return m.map((x, i) => ({ role: x.role, content: x.content.slice(0, i === m.length - 1 ? MAX_LAST : MAX_MSG) }));
}

async function callClaude(env, body) {
  const headers = { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' };
  let res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
  if (res.status === 400) {
    // раптом модель не приймає «thinking: disabled» / effort — повторюємо без них
    const { thinking, output_config, ...plain } = body;
    res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(plain) });
  } else if (res.status === 529 || res.status >= 500) {
    res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
  }
  return res;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return originAllowed(origin) ? new Response(null, { status: 204, headers: cors(origin) }) : new Response(null, { status: 403 });
    if (request.method !== 'POST') return json({ error: 'method' }, 405, originAllowed(origin) ? origin : '');
    if (!originAllowed(origin)) return json({ error: 'origin' }, 403, '');
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'not-configured' }, 503, origin);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (limited(ip)) return json({ error: 'rate' }, 429, origin);

    let data;
    try { data = await request.json(); } catch (e) { return json({ error: 'bad-json' }, 400, origin); }
    const messages = clean(data.messages);
    if (!messages.length) return json({ error: 'no-messages' }, 400, origin);
    const kind = data.kind === 'review' ? 'review' : 'chat';
    const system = String(data.system || '').slice(0, MAX_SYSTEM);

    const body = {
      model: env.MODEL || DEFAULT_MODEL,
      max_tokens: MAX_OUT[kind],
      messages,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
    };
    if (system) body.system = system;

    let res;
    try { res = await callClaude(env, body); } catch (e) { return json({ error: 'upstream' }, 502, origin); }
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.log('anthropic_error', res.status, out && out.error && out.error.type);
      return json({ error: 'upstream-' + res.status }, res.status === 429 ? 429 : 502, origin);
    }
    if (out.stop_reason === 'refusal') return json({ error: 'refusal' }, 422, origin);
    const text = (out.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!text) return json({ error: 'empty' }, 502, origin);
    const u = out.usage || {};
    console.log('ok', kind, u.input_tokens, u.output_tokens);   // лише лічильники, без вмісту (діти)
    return json({ text, usage: { in: u.input_tokens, out: u.output_tokens } }, 200, origin);
  },
};
