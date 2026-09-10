import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.env.CHECK_DIST ? 'dist' : 'site');
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
  assert((text.match(/<h1[ >]/g)||[]).length===1,prefix+'one H1');
  const ids=[...text.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
  assert(new Set(ids).size===ids.length,prefix+'unique IDs');
  for(const match of text.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)){
    try{const data=JSON.parse(match[1]);assert(data['@context']==='https://schema.org',prefix+'schema context');assert(data['@graph']?.length>0,prefix+'schema graph');schemas++;}catch{failures.push(prefix+'invalid JSON-LD');}
  }
  const noindex=/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/.test(text);
  assert(noindex!==sitemap.includes(`<loc>${canonical[0]}</loc>`),prefix+'sitemap/index consistency');
  for(const match of text.matchAll(/<(?:a|link|script|img)\b[^>]*\b(?:href|src)="([^"]+)"[^>]*>/g)){
    const href=match[1];
    if(!href.startsWith('/')&&!href.startsWith('#'))continue;
    const url=new URL(href,'https://example.test/'+rel.replace(/index\.html$/,''));
    const target=path.join(root,decodeURIComponent(url.pathname),url.pathname.endsWith('/')?'index.html':'');
    assert(files.includes(target),prefix+'missing local target '+href);internalLinks++;
    if(url.hash&&texts.has(target))assert(texts.get(target).includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),prefix+'missing anchor '+href);
  }
  for(const match of text.matchAll(/<img\b[^>]*>/g)){
    images++;assert(/alt="[^"]*"/.test(match[0])&&/width="\d+"/.test(match[0])&&/height="\d+"/.test(match[0]),prefix+'image dimensions/alt');
  }
  if(/data-request-form/.test(text))assert(/<form[^>]*data-request-form[^>]*hidden/.test(text),prefix+'contact builder must stay hidden without JS to avoid GET submission');
  assert(!/\b(?:TODO|PLACEHOLDER|Lorem ipsum)\b/.test(text),prefix+'placeholder');
}
const js=await readFile(path.join(root,'assets/js/main.js'),'utf8').catch(async()=>{const p=files.find(p=>/main\.[a-f\d]+\.js$/.test(p));return p?readFile(p,'utf8'):'';});
assert(!/innerHTML|document\.write|createElement|fetch\(/.test(js),'No client-side page rendering or unconfigured form transmission');
console.log(JSON.stringify({pages:pages.length,internalLinks,images,schemas,failures},null,2));
if(failures.length)process.exitCode=1;
