import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const source = path.resolve('site');
const out = path.resolve('dist');
await mkdir(out,{recursive:true});
await cp(source,out,{recursive:true});
const origin = (process.env.SITE_ORIGIN || 'https://gabions.by').replace(/\/$/,'');
if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin)) throw new Error('SITE_ORIGIN must be an HTTPS origin');
const basePath = (process.env.SITE_BASE_PATH || '').trim().replace(/^\/+|\/+$/g,'');
const basePrefix = basePath ? `/${basePath}` : '';
if (basePath && !/^[a-z0-9_-]+$/i.test(basePath)) throw new Error('SITE_BASE_PATH must be a repository name');
const endpoint = process.env.REQUEST_ENDPOINT || '/api/request';
if (endpoint !== '/api/request') {
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.protocol !== 'https:' || endpointUrl.username || endpointUrl.password || endpointUrl.search || endpointUrl.hash) throw new Error('REQUEST_ENDPOINT must be a public HTTPS URL without credentials, query or fragment');
}
async function walk(dir){let a=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);a.push(...(e.isDirectory()?await walk(p):[p]));}return a;}
const publicConfig = `/* Public endpoint only. No SMTP secrets. */\nwindow.GABIONS_CONFIG = Object.freeze(${JSON.stringify({ requestEndpoint: endpoint })});\n`;
await writeFile(path.join(out, 'assets/js/config.js'), publicConfig);
const assetVersions = new Map();
for (const file of await walk(path.join(out, 'assets'))) {
  if (/\.(js|css)$/.test(file)) assetVersions.set(path.relative(out, file).replaceAll('\\', '/'), createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 12));
}
const verificationTags = [['GOOGLE_SITE_VERIFICATION', 'google-site-verification'], ['YANDEX_SITE_VERIFICATION', 'yandex-verification']].map(([key, name]) => {
  const value = process.env[key]?.trim();
  if (!value) return '';
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error(`${key} must be the content token only`);
  return `<meta name="${name}" content="${value}" />`;
}).join('\n');
for(const file of await walk(out)) if(/\.(html|xml|txt)$/.test(file)) {
  const text=await readFile(file,'utf8');
  let output=text.replaceAll('https://gabions.by',origin + basePrefix);
  if(basePrefix) output=output.replace(/\b(href|src)="\/(?!\/)([^"]*)"/g,(_,attribute,value)=>`${attribute}="${basePrefix}/${value}"`);
  if (file.endsWith('.html')) {
    output=output.replace(/(assets\/(?:js|css)\/[^"?]+\.(?:js|css))(?:\?v=[a-f\d]+)?"/g, (_, asset) => `${asset}?v=${assetVersions.get(asset)}"`);
    if (verificationTags) output=output.replace('</head>', verificationTags + '\n</head>');
  }
  await writeFile(file,output);
}
await writeFile(path.join(out, '.nojekyll'), '');
console.log(`Built explicit static files into dist. Origin: ${origin}. Base path: ${basePrefix || '/'}`);
