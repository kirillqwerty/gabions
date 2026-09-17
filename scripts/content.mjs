import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { additions, newPages } from './seo-content.mjs';

const root = path.resolve('site');
const origin = 'https://gabions.by';
const escape = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const filepath = url => path.join(root, url === '/' ? 'index.html' : `${url.slice(1)}index.html`);
const template = await readFile(filepath('/gabiony/'), 'utf8');
const head = template.slice(0, template.indexOf('<main id="main">'));
const foot = template.slice(template.indexOf('</main>') + '</main>'.length);
const contact = template.match(/<section class="contact-band">[\s\S]*?<\/section>/)[0];
const labels = { '/': 'Габионы в Беларуси', '/gabiony/': 'Габионы и материалы', '/setka-dlya-gabionov/': 'Сетка для габионов', '/kamen-dlya-gabionov/': 'Камень для габионов', '/zabor-iz-gabionov/': 'Заборы из габионов', '/podpornye-steny/': 'Подпорные стены', '/montazh-gabionov/': 'Монтаж габионов', '/ceny/': 'Цены и расчёт', '/nashi-raboty/': 'Фото и примеры', '/polezno/': 'Полезное о габионах', '/polezno/kak-sdelat-gabion/': 'Сборка своими руками', '/polezno/skolko-stoit-zabor/': 'Смета забора', '/dostavka-i-oplata/': 'Доставка по Беларуси' };
newPages.forEach(page => { labels[page.url] = page.label; });
const related = urls => `<nav class="guide-related" aria-label="Материалы по теме">${urls.map(url => `<a href="${url}">${escape(labels[url])} <span aria-hidden="true">↗</span></a>`).join('')}</nav>`;
for (const page of newPages) {
  const article = page.kind === 'article';
  const middle = `<main id="main"><section class="page-hero compact-hero"><div class="container">
<nav class="breadcrumbs" aria-label="Хлебные крошки"><ol><li><a href="/">Главная</a></li>${article ? '<li><a href="/polezno/">Полезное</a></li>' : ''}<li><span aria-current="page">${escape(page.label)}</span></li></ol></nav>
<div class="eyebrow">${article ? 'Практика / Руководство' : 'Габионы / Решения и материалы'}</div><h1>${page.h1}</h1><p class="page-lead">${page.intro}</p></div></section>
<section class="section"><div class="container content-grid"><article class="prose guide-article">
${article ? '<p class="article-meta">Редакция Gabions · Обновлено <time datetime="2026-09-17">17 сентября 2026</time></p>' : ''}
<nav class="toc" aria-label="На этой странице"><h2>В этом разделе</h2><ol>${page.sections.map(([id, title]) => `<li><a href="#${id}">${escape(title)}</a></li>`).join('')}</ol></nav>
${page.sections.map(([id, title, body]) => `<section id="${id}"><h2>${escape(title)}</h2>${body}</section>`).join('\n')}
${related(page.links)}</article><aside class="side-panel"><div class="eyebrow">Ваш проект</div><h2>Обсудим детали</h2><p>Пришлите размеры и фотографии участка. Согласуем решение, комплектацию и индивидуальную стоимость.</p><a class="btn" href="/kontakty/#raschet">Запросить расчёт ↗</a><a class="phone" href="tel:+375298690231">+375 (29) 869-02-31</a></aside></div></section>${contact}</main>`;
  await mkdir(path.dirname(filepath(page.url)), { recursive: true });
  await writeFile(filepath(page.url), head + middle + foot);
}
for (const [url, data] of Object.entries(additions)) {
  let html = await readFile(filepath(url), 'utf8');
  html = html.replace(/\s*<!-- guide:start -->[\s\S]*?<!-- guide:end -->/g, '');
  const block = `\n<!-- guide:start --><section class="section section-soft guide-section"><div class="container"><div class="eyebrow">Детали вашего проекта</div><div class="prose guide-copy"><h2>${data.heading}</h2>${data.body}</div></div></section><!-- guide:end -->\n`;
  html = html.replace(/<section class="contact-band">/, block + '<section class="contact-band">');
  if (data.h1) html = html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/, `<h1>${data.h1}</h1>`);
  await writeFile(filepath(url), html);
}
// New pages are reachable from the useful-guides hub and every footer.
let hub = await readFile(filepath('/polezno/'), 'utf8');
hub = hub.replace(/\s*<!-- guides-hub:start -->[\s\S]*?<!-- guides-hub:end -->/g, '');
hub = hub.replace('<section class="contact-band">', `<!-- guides-hub:start --><section class="section section-soft"><div class="container"><div class="section-heading"><h2>Ещё о выборе и устройстве габионов</h2></div><div class="guide-cards">${newPages.map(page => `<a href="${page.url}"><h3>${escape(page.label)}</h3><p>${page.intro}</p></a>`).join('')}</div></div></section><!-- guides-hub:end --><section class="contact-band">`);
await writeFile(filepath('/polezno/'), hub);

async function walk(dir) { const files = []; for (const entry of await readdir(dir, { withFileTypes: true })) { const p = path.join(dir, entry.name); files.push(...(entry.isDirectory() ? await walk(p) : [p])); } return files; }
const files = (await walk(root)).filter(file => file.endsWith('.html')).sort();
const pages = [];
for (const file of files) {
  let html = await readFile(file, 'utf8');
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const url = '/' + relative.replace(/index\.html$/, '');
  const data = additions[url] || newPages.find(page => page.url === url);
  const title = data?.title || html.match(/<title>([^<]+)<\/title>/)[1];
  const description = data?.description || html.match(/<meta\s+[^>]*name="description"[^>]*content="([^"]+)"/)[1];
  const canonical = origin + url;
  const noindex = /<meta[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html);
  const article = url.startsWith('/polezno/') && url !== '/polezno/';
  const name = plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]);
  html = html.replace(/<title>[^<]+<\/title>/, `<title>${escape(title)}</title>`)
    .replace(/<meta\s+[^>]*name="description"[^>]*content="[^"]+"\s*\/?\s*>/, `<meta name="description" content="${escape(description)}" />`)
    .replace(/<link\s+[^>]*rel="canonical"[^>]*href="[^"]+"\s*\/?\s*>/, `<link rel="canonical" href="${canonical}" />`)
    .replace(/<meta\s+[^>]*property="og:title"[^>]*content="[^"]+"\s*\/?\s*>/, `<meta property="og:title" content="${escape(title)}" />`)
    .replace(/<meta\s+[^>]*property="og:description"[^>]*content="[^"]+"\s*\/?\s*>/, `<meta property="og:description" content="${escape(description)}" />`)
    .replace(/<meta\s+[^>]*property="og:url"[^>]*content="[^"]+"\s*\/?\s*>/, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta property="og:type" content="[^"]+"\s*\/?\s*>/, `<meta property="og:type" content="${article ? 'article' : 'website'}" />`);
  const graph = [
    { '@type': 'Organization', '@id': origin + '/#organization', name: 'Gabions', url: origin + '/', telephone: ['+375298690231', '+375333790909'], logo: origin + '/assets/img/gabions-logo.png', email: 'gabions.by@gmail.com', areaServed: { '@type': 'Country', name: 'Беларусь' }, contactPoint: { '@type': 'ContactPoint', telephone: '+375298690231', contactType: 'customer service', availableLanguage: 'Russian' } },
    { '@type': 'WebSite', '@id': origin + '/#website', url: origin + '/', name: 'Gabions', publisher: { '@id': origin + '/#organization' }, inLanguage: 'ru' },
    { '@type': 'WebPage', '@id': canonical + '#webpage', url: canonical, name, description, inLanguage: 'ru', isPartOf: { '@id': origin + '/#website' }, ...(url !== '/' ? { breadcrumb: { '@id': canonical + '#breadcrumb' } } : {}) }
  ];
  if (url !== '/') {
    const crumbs = [{ '@type': 'ListItem', position: 1, name: 'Главная', item: origin + '/' }];
    if (article) crumbs.push({ '@type': 'ListItem', position: 2, name: 'Полезное о габионах', item: origin + '/polezno/' });
    crumbs.push({ '@type': 'ListItem', position: crumbs.length + 1, name: labels[url] || name, item: canonical });
    graph.push({ '@type': 'BreadcrumbList', '@id': canonical + '#breadcrumb', itemListElement: crumbs });
  }
  if (article) graph.push({ '@type': 'Article', '@id': canonical + '#article', headline: name, description, inLanguage: 'ru', mainEntityOfPage: { '@id': canonical + '#webpage' }, author: { '@id': origin + '/#organization' }, publisher: { '@id': origin + '/#organization' }, ...(data ? { dateModified: '2026-09-17' } : {}) });
  const services = { '/montazh-gabionov/': 'Монтаж габионов', '/zabor-iz-gabionov/': 'Забор из габионов под ключ', '/gabiony-so-steklom/': 'Габионы с эрклезом и подсветкой' };
  if (services[url]) graph.push({ '@type': 'Service', '@id': canonical + '#service', name: services[url], url: canonical, description, provider: { '@id': origin + '/#organization' }, areaServed: { '@type': 'Country', name: 'Беларусь' } });
  html = html.replace(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)}</script>`);
  html = html.replace(/\s*<!-- social:start -->[\s\S]*?<!-- social:end -->/g, '');
  html = html.replace('</head>', `<!-- social:start --><meta property="og:image" content="${origin}/assets/img/hero-gabion-fence.webp" /><meta property="og:image:alt" content="Габионное ограждение с каменным наполнением" /><meta property="og:site_name" content="Gabions" /><meta name="twitter:card" content="summary_large_image" /><!-- social:end -->\n</head>`);
  if (!html.includes('/assets/css/guides.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/assets/css/guides.css" />\n</head>');
  html = html.replace(/\s*<!-- guide-footer:start -->[\s\S]*?<!-- guide-footer:end -->/g, '');
  html = html.replace('<div class="footer-bottom">', `<!-- guide-footer:start --><nav class="footer-guides" aria-label="Решения и руководства">${newPages.slice(0, 3).map(page => `<a href="${page.url}">${escape(page.label)}</a>`).join('')}<a href="/polezno/">Инструкции и советы</a></nav><!-- guide-footer:end --><div class="footer-bottom">`);
  // Do not keep the template's current navigation item on newly authored pages.
  if (newPages.some(page => page.url === url)) html = html.replace(/(<a href="\/gabiony\/"[^>]*?) aria-current="page"/g, '$1');
  await writeFile(file, html.replace(/[\t ]+\r?$/gm, ''));
  pages.push({ url, title, index: !noindex, file: relative });
}
await writeFile('docs/pages.json', JSON.stringify(pages, null, 2) + '\n');
await writeFile(path.join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.filter(page => page.index).map(page => `<url><loc>${origin}${page.url}</loc></url>`).join('\n')}\n</urlset>\n`);
console.log(`Updated ${pages.length} static pages; ${pages.filter(page => page.index).length} indexable URLs.`);
