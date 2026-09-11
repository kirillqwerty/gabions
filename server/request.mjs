import { isIP } from 'node:net';

const subjects = new Set(['Габион под ключ', 'Габионные конструкции', 'Сетка для габионов', 'Камень для габионов', 'Габион-шар', 'Забор из габионов', 'Подпорная стена', 'Облицовка фасада', 'Монтаж габионов', 'Другой вопрос']);
const fail = (status, message) => Object.assign(new Error(message), { status });
export function validateRequest(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail(400, 'Некорректные данные заявки.');
  const fields = { subject: 80, name: 80, phone: 30, city: 120, message: 2000, website: 200 };
  const clean = {};
  for (const [key, max] of Object.entries(fields)) {
    if (typeof (data[key] ?? '') !== 'string') throw fail(400, 'Проверьте поля формы.');
    clean[key] = (data[key] || '').trim();
    if (clean[key].length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(clean[key])) throw fail(400, 'Проверьте длину и содержимое полей.');
  }
  if (clean.website) throw fail(400, 'Не удалось отправить форму. Позвоните нам.');
  if (!subjects.has(clean.subject)) throw fail(400, 'Выберите тему заявки.');
  if (!/^[+\d\s().-]+$/.test(clean.phone) || !/^\d{7,15}$/.test(clean.phone.replace(/\D/g, ''))) throw fail(400, 'Проверьте номер телефона.');
  if (data.consent !== true) throw fail(400, 'Подтвердите согласие на обработку данных.');
  return clean;
}

export function createRequestHandler({ sendMail, allowedOrigins, trustProxy = false, now = Date.now, logger = console }) {
  const attempts = new Map(), requests = new Map();
  let globalWindow = now(), globalCount = 0;
  return async (req, res) => {
    const origin = req.headers.origin;
    const reply = (status, data, extra = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin', ...(allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}), ...extra });
      res.end(JSON.stringify(data));
    };
    if (!origin || !allowedOrigins.includes(origin)) return reply(403, { error: 'Этот адрес сайта не разрешён для отправки заявок.' });
    if (req.method === 'OPTIONS') return reply(204, null, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key', 'Access-Control-Max-Age': '600' });
    if (req.method !== 'POST') return reply(405, { error: 'Используйте форму заявки.' }, { Allow: 'POST, OPTIONS' });
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(415, { error: 'Ожидаются данные JSON.' });
    const time = now();
    for (const [key, value] of attempts) if (value.until <= time) attempts.delete(key);
    for (const [key, value] of requests) if (value.until <= time && value.done) requests.delete(key);
    if (time - globalWindow >= 3600000) { globalWindow = time; globalCount = 0; }
    let ip = req.socket.remoteAddress || 'unknown';
    if (trustProxy) {
      const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').at(-1).trim();
      if (isIP(forwarded)) ip = forwarded;
    }
    const bucket = attempts.get(ip) || { count: 0, until: time + 900000 };
    if (bucket.count >= 5 || globalCount >= 60 || attempts.size >= 10000 || requests.size >= 10000) return reply(429, { error: 'Слишком много попыток. Попробуйте позже или позвоните нам.' }, { 'Retry-After': '900' });
    bucket.count++; attempts.set(ip, bucket); globalCount++;
    let id, ownRequest = false;
    try {
      let size = 0, chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) throw fail(413, 'Заявка слишком большая.');
        chunks.push(chunk);
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400, 'Некорректные данные заявки.'); }
      const clean = validateRequest(data);
      id = req.headers['idempotency-key'];
      if (typeof id !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id)) throw fail(400, 'Обновите страницу и попробуйте ещё раз.');
      const fingerprint = JSON.stringify(clean);
      const existing = requests.get(id);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw fail(409, 'Данные заявки изменились. Повторите отправку.');
        if (!existing.done) throw fail(409, 'Заявка ещё отправляется. Подождите немного.');
        return reply(200, { ok: true, requestId: id });
      }
      if (!sendMail) throw fail(503, 'Отправка временно недоступна. Позвоните +375 (29) 869-02-31 или напишите gabions.by@gmail.com.');
      requests.set(id, { fingerprint, until: time + 86400000, done: false });
      ownRequest = true;
      await sendMail(clean, id);
      requests.get(id).done = true;
      return reply(200, { ok: true, requestId: id });
    } catch (error) {
      if (ownRequest) requests.delete(id);
      if (!error.status) logger.error('Mail delivery failed', { code: error.code || 'SMTP_ERROR' });
      return reply(error.status || 502, { error: error.status ? error.message : 'Не удалось подтвердить отправку. Попробуйте позже или свяжитесь с нами по телефону.' });
    }
  };
}
