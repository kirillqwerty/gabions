import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
let child;
const base='http://127.0.0.1:4174';
before(async()=>{
  child=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'4174'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error('Server exited '+code)));});
});
after(()=>child?.kill());
test('All 28 authored HTML documents are served without any client JavaScript',async()=>{
  const pages=JSON.parse(await readFile('docs/pages.json','utf8'));
  assert.equal(pages.length,28);
  for(const page of pages){
    const res=await fetch(base+page.url);
    assert.equal(res.status,200,page.url);
    const text=await res.text();
    assert.match(text,/<h1[ >]/,page.url);assert.match(text,/<nav/);assert.match(text,/<link[^>]*rel="canonical"/);
  }
});
test('Unknown paths return a real 404, not a homepage with 200',async()=>{
  const res=await fetch(base+'/does-not-exist-acceptance/');assert.equal(res.status,404);assert.match(await res.text(),/Здесь пока только камни/);
});
test('Canonical directory redirects preserve attribution query',async()=>{
  const res=await fetch(base+'/gabiony?utm_source=test',{redirect:'manual'});assert.equal(res.status,301);assert.equal(res.headers.get('location'),'/gabiony/?utm_source=test');
  const index=await fetch(base+'/gabiony/index.html',{redirect:'manual'});assert.equal(index.status,301);assert.equal(index.headers.get('location'),'/gabiony/');
});
test('Contact helper cannot submit personal data through a default GET when JavaScript is disabled',async()=>{
  const html=await (await fetch(base+'/kontakty/')).text();
  assert.match(html,/<form[^>]*data-request-form[^>]*hidden/);assert.match(html,/<noscript>[\s\S]*tel:\+375333790909/);
  const js=await (await fetch(base+'/assets/js/main.js')).text();
  assert.match(js,/event\.preventDefault\(\)/);assert.doesNotMatch(js,/localStorage|sessionStorage|generate_lead/);
});
test('Robots and sitemap are served with appropriate content types',async()=>{
  const robots=await fetch(base+'/robots.txt');assert.equal(robots.status,200);assert.match(robots.headers.get('content-type'),/text\/plain/);
  const map=await fetch(base+'/sitemap.xml');assert.equal(map.status,200);assert.match(map.headers.get('content-type'),/application\/xml/);
});
