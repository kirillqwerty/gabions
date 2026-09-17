import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.env.CHECK_DIST ? 'dist' : 'site');
const basePrefix = process.env.CHECK_DIST && process.env.SITE_BASE_PATH ? '/' + process.env.SITE_BASE_PATH.replace(/^\/+|\/+$/g,'') : '';
const expectedOrigin = process.env.CHECK_DIST ? (process.env.SITE_ORIGIN || 'https://gabions.by').replace(/\/$/,'') : 'https://gabions.by';
const failures=[];
const assert=(test,message)=>{if(!test)failures.push(message);};
async function walk(dir){let a=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);a.push(...(e.isDirectory()?await walk(p):[p]));}return a;}
const files=await walk(root), pages=files.filter(p=>p.endsWith('.html'));
const texts=new Map(await Promise.all(pages.map(async file=>[file,await readFile(file,'utf8')])));
const titles=new Set(),descriptions=new Set(),canonicals=new Set();
const sitemap=await readFile(path.join(root,'sitemap.xml'),'utf8');
let internalLinks=0,images=0,schemas=0;
for(const [file,text] of texts){
  const rel=path.relative(root,file);
  const prefix=rel+': ';
  assert(/<html\s+lang="ru"/.test(text),prefix+'lang');
  const title=text.match(/<title>([^<]+)<\/title>/)?.[1];
  assert(title&&!titles.has(title),prefix+'unique title');titles.add(title);
  const desc=text.match(/<meta\s+[^>]*name="description"[^>]*content="([^"]+)"/)?.[1];
  assert(desc&&!descriptions.has(desc),prefix+'unique description');descriptions.add(desc);
  const canonical=[...text.matchAll(/<link\s+[^>]*rel="canonical"[^>]*href="([^"]+)"/g)].map(m=>m[1]);
  assert(canonical.length===1&&!canonicals.has(canonical[0]),prefix+'unique canonical');canonicals.add(canonical[0]);
  const route = '/' + rel.replaceAll('\\','/').replace(/index\.html$/,'');
  assert(canonical[0]===expectedOrigin+basePrefix+route,prefix+'canonical matches deployment URL');
  assert(text.includes(`property="og:url" content="${canonical[0]}"`),prefix+'Open Graph URL matches canonical');
  assert(/property="og:image"/.test(text),prefix+'social preview image');
  assert((text.match(/<h1[ >]/g)||[]).length===1,prefix+'one H1');
  const ids=[...text.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
  assert(new Set(ids).size===ids.length,prefix+'unique IDs');
  for(const match of text.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)){
    try{const data=JSON.parse(match[1]);assert(data['@context']==='https://schema.org',prefix+'schema context');assert(data['@graph']?.length>0,prefix+'schema graph');assert(data['@graph']?.some(node=>node['@type']==='WebPage'&&node.url===canonical[0]),prefix+'schema page matches canonical');schemas++;}catch{failures.push(prefix+'invalid JSON-LD');}
  }
  const noindex=/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/.test(text);
  assert(noindex!==sitemap.includes(`<loc>${canonical[0]}</loc>`),prefix+'sitemap/index consistency');
  for(const match of text.matchAll(/<(?:a|link|script|img)\b[^>]*\b(?:href|src)="([^"]+)"[^>]*>/g)){
    const href=match[1];
    if(!href.startsWith('/')&&!href.startsWith('#'))continue;
    const url=new URL(href,'https://example.test'+basePrefix+'/'+rel.replaceAll('\\','/').replace(/index\.html$/,''));
    assert(!basePrefix || url.pathname.startsWith(basePrefix+'/'),prefix+'link escapes deployment base path '+href);
    const target=path.join(root,decodeURIComponent(url.pathname.slice(basePrefix.length)),url.pathname.endsWith('/')?'index.html':'');
    assert(files.includes(target),prefix+'missing local target '+href);internalLinks++;
    if(url.hash&&texts.has(target))assert(texts.get(target).includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),prefix+'missing anchor '+href);
  }
  for(const match of text.matchAll(/<img\b[^>]*>/g)){
    images++;assert(/alt="[^"]*"/.test(match[0])&&/width="\d+"/.test(match[0])&&/height="\d+"/.test(match[0]),prefix+'image dimensions/alt');
  }
  if(/data-request-form/.test(text))assert(/<form[^>]*data-request-form[^>]*hidden/.test(text),prefix+'contact builder must stay hidden without JS to avoid GET submission');
  assert(!/\b(?:TODO|PLACEHOLDER|Lorem ipsum)\b/.test(text),prefix+'placeholder');
}
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]);
assert(new Set(sitemapUrls).size===sitemapUrls.length,'Sitemap URLs unique');
for(const url of sitemapUrls) assert(canonicals.has(url),'Sitemap target exists: '+url);
const manifest=JSON.parse(await readFile('docs/pages.json','utf8'));
assert(manifest.length===pages.length,'Page manifest matches authored HTML count');
for(const page of manifest) assert(texts.has(path.join(root,page.file)),'Manifest target exists: '+page.file);
const js=await readFile(path.join(root,'assets/js/main.js'),'utf8').catch(async()=>{const p=files.find(p=>/main\.[a-f\d]+\.js$/.test(p));return p?readFile(p,'utf8'):'';});
assert(!/innerHTML|document\.write/.test(js),'No client-side page rendering');
assert(/GABIONS_CONFIG/.test(js) && /credentials: 'omit'/.test(js),'Form uses a configured endpoint without cookies');
if(process.env.CHECK_DIST) for(const [file,text] of texts) assert(/assets\/js\/main\.js\?v=[a-f\d]{12}"/.test(text),path.relative(root,file)+': versioned main script');
console.log(JSON.stringify({pages:pages.length,internalLinks,images,schemas,failures},null,2));
if(failures.length)process.exitCode=1;
