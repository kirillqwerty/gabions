/* Progressive enhancement only. All pages, navigation and content are plain HTML. */
document.documentElement.classList.add('js');
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
  requestForm.addEventListener('submit',event=>{
    event.preventDefault();
    const phone=requestForm.elements.phone.value.trim();
    const status=requestForm.querySelector('[data-form-status]');
    if(phone.replace(/\D/g,'').length<7 || phone.replace(/\D/g,'').length>15){
      status.textContent='Проверьте номер телефона: укажите код страны и номер.';
      status.classList.add('error');requestForm.elements.phone.focus();
      track('form_error',{page:location.pathname,form:'request',code:'phone_invalid'});return;
    }
    const text=[`Здравствуйте! Интересует: ${select.value}.`,requestForm.elements.name.value.trim() ? `Имя: ${requestForm.elements.name.value.trim()}`:'',`Телефон: ${phone}`,requestForm.elements.city.value.trim()?`Населённый пункт: ${requestForm.elements.city.value.trim()}`:'',requestForm.elements.message.value.trim()].filter(Boolean).join('\n');
    const link=requestForm.querySelector('[data-message-link]');
    link.href='https://api.whatsapp.com/send?phone=375298690231&text='+encodeURIComponent(text);
    link.hidden=false;
    status.classList.remove('error');
    status.textContent='Сообщение подготовлено. Откройте WhatsApp и отправьте его менеджеру. Сайт ещё не отправил заявку.';
    link.focus();
    track('message_prepared',{page:location.pathname,form:'request'});
  });
  requestForm.hidden=false;
}
