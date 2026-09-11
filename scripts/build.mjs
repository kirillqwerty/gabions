import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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
for(const file of await walk(out)) if(/\.(html|xml|txt)$/.test(file)) {
  const text=await readFile(file,'utf8');
  let output=text.replaceAll('https://gabions.by',origin + basePrefix);
  if(basePrefix) output=output.replace(/\b(href|src)="\/(?!\/)([^"]*)"/g,(_,attribute,value)=>`${attribute}="${basePrefix}/${value}"`);
  await writeFile(file,output);
}
await writeFile(path.join(out, 'assets/js/config.js'), `/* Public endpoint only. No SMTP secrets. */\nwindow.GABIONS_CONFIG = Object.freeze(${JSON.stringify({ requestEndpoint: endpoint })});\n`);
console.log(`Built explicit static files into dist. Origin: ${origin}. Base path: ${basePrefix || '/'}`);
