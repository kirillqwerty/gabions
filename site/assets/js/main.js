/* Progressive enhancement only. All pages, navigation and content are plain HTML. */
document.documentElement.classList.add('js');
const themeButton = document.querySelector('[data-theme-toggle]');
function applyTheme(theme, animate = false) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (themeButton) {
    themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
    themeButton.setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
    themeButton.querySelector('[data-theme-label]').textContent = theme === 'dark' ? 'Светлая' : 'Тёмная';
  }
  if (animate) {
    root.classList.remove('stones-switching');
    void root.offsetWidth;
    root.classList.add('stones-switching');
    setTimeout(() => root.classList.remove('stones-switching'), 1200);
  }
}
applyTheme(document.documentElement.dataset.theme || 'light');
themeButton?.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme, true);
  try { localStorage.setItem('gabions-theme', theme); } catch {}
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
  let saved;
  try { saved = localStorage.getItem('gabions-theme'); } catch {}
  if (!['dark', 'light'].includes(saved)) applyTheme(event.matches ? 'dark' : 'light');
});
const menuButton = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');
menuButton?.addEventListener('click', () => {
  const expanded = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(expanded));
  menuButton.setAttribute('aria-label', expanded ? 'Закрыть меню' : 'Открыть меню');
  menu?.classList.toggle('is-open', expanded);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') {
    menuButton.click(); menuButton.focus();
  }
});
function track(name, properties) {
  window.dispatchEvent(new CustomEvent('gabions:analytics', {detail: {name, properties}}));
  if (typeof window.gtag === 'function') window.gtag('event', name, properties);
}
document.querySelectorAll('a[href^="tel:"]').forEach(link => link.addEventListener('click', () => track('phone_click', {page: location.pathname, placement: link.closest('header') ? 'header' : link.closest('footer') ? 'footer' : 'content'})));
document.querySelectorAll('[data-messenger]').forEach(link => link.addEventListener('click', () => track('messenger_click', {page:location.pathname,service:link.dataset.messenger})));
const filters = document.querySelectorAll('[data-filter]');
filters.forEach(button => button.addEventListener('click', () => {
  filters.forEach(other => other.setAttribute('aria-pressed', String(other===button)));
  let count=0;
  document.querySelectorAll('[data-category]').forEach(item => {
    item.hidden = button.dataset.filter !== 'all' && item.dataset.category !== button.dataset.filter;
    if (!item.hidden) count++;
  });
  const status=document.querySelector('[data-filter-status]');
  if(status) status.textContent = `Показано примеров: ${count}`;
}));
const calc = document.querySelector('[data-calculator]');
calc?.querySelector('[data-calc-submit]')?.removeAttribute('hidden');
calc?.addEventListener('submit', event => {
  event.preventDefault();
  const result=calc.querySelector('[data-result]');
  const values=['length','height','depth'].map(name=>Number(calc.elements[name].value.trim().replace(',','.')));
  if (values.some(n=>!Number.isFinite(n)||n<=0||n>1000)) {result.textContent='Укажите размеры больше нуля в метрах. Например: 10; 1,5; 0,3.';return;}
  const volume=values.reduce((a,b)=>a*b,1);
  result.textContent=`Геометрический объём: ${new Intl.NumberFormat('ru-BY',{maximumFractionDigits:3}).format(volume)} м³. Это объём конструкции, а не масса камня или расчёт устойчивости.`;
  track('calculator_complete',{page:location.pathname,type:'volume'});
});
const requestForm=document.querySelector('[data-request-form]');
if(requestForm){
  let started=false;
  requestForm.addEventListener('input',()=>{if(!started){started=true;track('form_start',{page:location.pathname,form:'request'});}});
  const requested=new URLSearchParams(location.search).get('tema');
  const select=requestForm.elements.subject;
  if(requested && [...select.options].some(option=>option.value===requested)) select.value=requested;
  let pending = false, requestId, lastPayload;
  requestForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(pending || !requestForm.reportValidity()) return;
    const phone=requestForm.elements.phone.value.trim();
    const status=requestForm.querySelector('[data-form-status]');
    if(phone.replace(/\D/g,'').length<7 || phone.replace(/\D/g,'').length>15){
      status.textContent='Проверьте номер телефона: укажите код страны и номер.';
      status.classList.add('error');requestForm.elements.phone.focus();
      track('form_error',{page:location.pathname,form:'request',code:'phone_invalid'});return;
    }
    const payload = Object.fromEntries(['subject', 'name', 'phone', 'city', 'message', 'website'].map(key => [key, requestForm.elements[key].value.trim()]));
    payload.consent = requestForm.elements.consent.checked;
    const serialized = JSON.stringify(payload);
    if (!requestId || lastPayload !== serialized) requestId = crypto.randomUUID();
    lastPayload = serialized;
    const submit = requestForm.querySelector('[type="submit"]');
    pending = true;
    submit.disabled = true;
    submit.textContent = 'Отправляем…';
    requestForm.setAttribute('aria-busy', 'true');
    status.classList.remove('error');
    status.textContent = 'Отправляем вашу заявку…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const endpoint = new URL(window.GABIONS_CONFIG?.requestEndpoint || '/api/request', location.origin);
      if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) throw new Error('Отправка временно недоступна. Свяжитесь с нами по телефону или почте.');
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId }, body: serialized, signal: controller.signal, credentials: 'omit' });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) throw new Error(result?.error || 'Не удалось отправить заявку. Позвоните +375 (29) 869-02-31 или напишите gabions.by@gmail.com.');
      status.textContent = 'Спасибо! Ваша заявка принята. Мы свяжемся с вами по указанному телефону.';
      requestForm.reset();
      requestId = undefined; lastPayload = undefined; started = false;
      track('request_sent', { page: location.pathname, form: 'request' });
    } catch(error) {
      status.classList.add('error');
      status.textContent = error.name === 'AbortError' ? 'Не получили подтверждение отправки. Проверьте соединение и повторите попытку или позвоните нам.' : error instanceof TypeError ? 'Нет связи с сервисом отправки. Попробуйте позже или напишите gabions.by@gmail.com.' : error.message;
      track('form_error', { page: location.pathname, form: 'request', code: 'delivery_failed' });
    } finally {
      clearTimeout(timeout);
      pending = false; submit.disabled = false;
      submit.textContent = 'Отправить заявку ↗';
      requestForm.removeAttribute('aria-busy');
      status.focus();
    }
  });
  requestForm.hidden=false;
}
