import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createRequestHandler } from './request.mjs';
import { mailConfig, smtpMailer } from './mail.mjs';

const root = path.resolve('dist');
const port = Number(process.env.PORT || 3000);
const origins = (process.env.ALLOWED_ORIGINS || 'https://gabions.by,https://www.gabions.by,http://localhost:3000,http://127.0.0.1:3000').split(',').map(s => s.trim()).filter(Boolean);
for (const origin of origins) if (new URL(origin).origin !== origin) throw new Error('ALLOWED_ORIGINS requires exact origins without paths');
let mailer;
try { mailer = smtpMailer(mailConfig()); } catch (error) { console.warn(error.message + '; requests will return 503 until SMTP is configured.'); }
const handler = createRequestHandler({ sendMail: mailer?.send, allowedOrigins: origins, trustProxy: process.env.TRUST_PROXY === 'true' });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400).end(); return; }
  if (url.pathname === '/api/request') return handler(req, res);
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, mailConfigured: !!mailer })); return; }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
  let file = path.resolve(root, '.' + pathname);
  if ((!file.startsWith(root + path.sep) && file !== root) || pathname.split(/[\\/]/).some(part => part.startsWith('.'))) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' + url.search }).end(); return; }
      file = path.join(file, 'index.html');
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(path.join(root, '404.html')).catch(() => 'Not found'));
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Gabions: http://localhost:${port}`));
