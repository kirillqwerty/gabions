import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { createRequestHandler, validateRequest } from '../server/request.mjs';
import { mailConfig, smtpMailer } from '../server/mail.mjs';

const origin = 'https://gabions.by';
const valid = { subject: 'Габион под ключ', name: 'Тест', phone: '+375 (29) 000-00-00', city: 'Беларусь', message: 'Тестовая заявка', consent: true, website: '' };
async function api(t, options = {}) {
  const sent = [];
  const server = http.createServer(createRequestHandler({ allowedOrigins: [origin], sendMail: async (data, id) => { sent.push({ data, id }); }, logger: { error() {} }, ...options }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/request`;
  const post = (data = valid, id = randomUUID(), headers = {}) => fetch(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': id, ...headers }, body: JSON.stringify(data) });
  return { url, sent, post };
}

test('SMTP configuration fails closed and enforces encrypted certificate-verified connections', () => {
  assert.throws(() => mailConfig({}), /SMTP_HOST/);
  const env = { SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@example.test', SMTP_PASS: 'test', MAIL_FROM: 'a@example.test', MAIL_TO: 'b@example.test', SMTP_PORT: '587', SMTP_SECURE: 'false' };
  const config = mailConfig(env);
  assert.equal(config.transport.requireTLS, true);
  assert.equal(config.transport.tls.rejectUnauthorized, true);
  assert.throws(() => mailConfig({ ...env, MAIL_TO: 'a@example.test,b@example.test' }), /MAIL_TO/);
});

test('server rejects missing consent, invalid phone, bots, invalid types and excessive field lengths', () => {
  for (const data of [null, [], { ...valid, consent: false }, { ...valid, phone: 'abc1234567' }, { ...valid, message: 'a'.repeat(2001) }, { ...valid, website: 'spam' }, { ...valid, name: {} }, { ...valid, subject: 'unknown' }]) assert.throws(() => validateRequest(data), error => error.status === 400);
  assert.equal(validateRequest(valid).phone, valid.phone);
});

test('accepted requests deduplicate retries and reject reusing the same ID for changed content', async t => {
  const { post, sent } = await api(t);
  const id = randomUUID();
  assert.equal((await post(valid, id)).status, 200);
  assert.equal((await post(valid, id)).status, 200);
  assert.equal((await post({ ...valid, message: 'changed' }, id)).status, 409);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].data.phone, valid.phone);
});

test('origin allowlist, JSON-only requests and preflight work without wildcard CORS', async t => {
  const { url, post, sent } = await api(t);
  assert.equal((await post(valid, randomUUID(), { Origin: 'https://other.test' })).status, 403);
  assert.equal((await post(valid, randomUUID(), { Origin: '' })).status, 403);
  assert.equal((await post(valid, randomUUID(), { 'Content-Type': 'text/plain' })).status, 415);
  const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal(sent.length, 0);
});

test('request body size limit and JSON parsing return errors without sending email', async t => {
  const { url, post, sent } = await api(t);
  const malformed = await fetch(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(malformed.status, 400);
  assert.equal((await post({ ...valid, message: 'x'.repeat(17000) })).status, 413);
  assert.equal(sent.length, 0);
});

test('rate limiting ignores forged X-Forwarded-For by default', async t => {
  const { post, sent } = await api(t);
  for (let i = 0; i < 5; i++) assert.equal((await post(valid, randomUUID(), { 'X-Forwarded-For': `1.1.1.${i}` })).status, 200);
  const limited = await post(valid, randomUUID(), { 'X-Forwarded-For': '8.8.8.8' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '900');
  assert.equal(sent.length, 5);
});

test('SMTP errors never become success or expose secrets, and a failed request can retry', async t => {
  let count = 0;
  const { post } = await api(t, { sendMail: async () => { if (!count++) throw new Error('secret-password'); } });
  const id = randomUUID();
  const failed = await post(valid, id);
  assert.equal(failed.status, 502);
  assert.doesNotMatch(await failed.text(), /secret-password/);
  assert.equal((await post(valid, id)).status, 200);
});

test('unconfigured SMTP returns 503 and keeps success false', async t => {
  const { post } = await api(t, { sendMail: undefined });
  const response = await post();
  assert.equal(response.status, 503);
  assert.notEqual((await response.json()).ok, true);
});

test('concurrent duplicate submissions send one email', async t => {
  let finish;
  const { post } = await api(t, { sendMail: () => new Promise(resolve => { finish = resolve; }) });
  const id = randomUUID();
  const pending = post(valid, id);
  while (!finish) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await post(valid, id)).status, 409);
  finish();
  assert.equal((await pending).status, 200);
  assert.equal((await post(valid, id)).status, 200);
});

test('real Nodemailer sends a request to a local SMTP receiver with fixed recipient and literal text', async t => {
  const messages = [], recipients = [];
  const smtp = net.createServer(socket => {
    socket.setEncoding('utf8');
    socket.write('220 localhost test SMTP\r\n');
    let buffer = '', inData = false, lines = [];
    socket.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === '.') { messages.push(lines.join('\r\n')); lines = []; inData = false; socket.write('250 accepted\r\n'); }
          else lines.push(line);
        } else if (/^EHLO|^HELO/i.test(line)) socket.write('250-localhost\r\n250 8BITMIME\r\n');
        else if (/^RCPT TO:/i.test(line)) { recipients.push(line); socket.write('250 OK\r\n'); }
        else if (/^DATA/i.test(line)) { inData = true; socket.write('354 Send message\r\n'); }
        else if (/^QUIT/i.test(line)) socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => smtp.close(resolve)));
  const mailer = smtpMailer({ from: 'sender@example.test', to: 'receiver@example.test', transport: { host: '127.0.0.1', port: smtp.address().port, secure: false, ignoreTLS: true } });
  const { post } = await api(t, { sendMail: mailer.send });
  const response = await post({ ...valid, message: '<script>alert(1)</script>', to: 'attacker@example.test' });
  assert.equal(response.status, 200);
  assert.equal(messages.length, 1);
  assert.deepEqual(recipients, ['RCPT TO:<receiver@example.test>']);
  assert.match(messages[0], /Content-Type: text\/plain/);
  assert.doesNotMatch(messages[0], /attacker@example.test/);
  assert.match(messages[0], /Message-ID:/i);
});
