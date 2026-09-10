import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.env.SERVE_DIST ? 'dist' : 'site');
const port = Number(process.env.PORT || 4173);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon','.woff2':'font/woff2'};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
  const candidate = path.resolve(root, '.' + pathname);
  if (!candidate.startsWith(root + path.sep) && candidate !== root) {res.writeHead(403);res.end();return;}
  try {
    if (/\/index\.html$/.test(pathname)) {res.writeHead(301,{Location:pathname.replace(/index\.html$/,'')+url.search});res.end();return;}
    let file = candidate;
    if ((await stat(file)).isDirectory()) {
      if (!pathname.endsWith('/')) {res.writeHead(301,{Location:pathname+'/'+url.search});res.end();return;}
      file = path.join(file, 'index.html');
    }
    const body = await readFile(file);
    res.writeHead(200, {'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, {'Content-Type':'text/html; charset=utf-8'});
    res.end(req.method==='HEAD'?undefined:await readFile(path.join(root,'404.html')).catch(()=>Buffer.from('Not found')));
  }
});
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://localhost:${port}/`));
