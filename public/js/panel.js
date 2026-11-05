import { $, h, toast, storage, store, copy, fill } from './common.js';
import { t, lang, translatePage, langSwitch } from './i18n.js';

translatePage();
$('#lang-slot').replaceWith(langSwitch());

const api = async (path, options = {}) => {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Lang': lang, ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || t('Ceva n-a mers. Încearcă din nou.')), { status: res.status });
  return data;
};

const show = (id) => ['#not-configured', '#login', '#app'].forEach((s) => $(s).classList.toggle('hidden', s !== id));

async function start() {
  const s = await api('/api/panel/session');
  if (!s.configured) return show('#not-configured');
  if (!s.authed) {
    show('#login');
    $('#password').focus();
    return;
  }
  $('#logout').classList.remove('hidden');
  show('#app');
  await load();
}

$('#login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/panel/login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) });
    $('#password').value = '';
    start();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/panel/logout', { method: 'POST' });
  location.reload();
});

$('#open-creation').addEventListener('change', async (e) => {
  try {
    await api('/api/panel/settings', { method: 'POST', body: JSON.stringify({ openCreation: e.target.checked }) });
    toast(t('Salvat.'));
  } catch (err) { toast(err.message, true); }
});

$('#create').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const name = $('#event-name').value;
    const data = await api('/api/events', { method: 'POST', body: JSON.stringify({ name }) });
    const mine = storage('quizy:events', []);
    mine.unshift({ code: data.code, key: data.adminKey, name: name.trim(), at: Date.now() });
    store('quizy:events', mine.slice(0, 50));
    location.href = `/admin/${data.code}#key=${data.adminKey}`;
  } catch (err) { toast(err.message, true); }
});

const fmt = (ms) => new Date(ms).toLocaleDateString(lang === 'ro' ? 'ro-RO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

async function load() {
  let data;
  try {
    data = await api('/api/panel/events');
  } catch (err) {
    if (err.status === 401) return start();
    return toast(err.message, true);
  }
  $('#open-creation').checked = data.openCreation;
  const box = $('#events');
  if (!data.events.length) return fill(box, h('div', { class: 'card empty' }, t('Niciun eveniment încă.')));
  fill(box, h('div', { class: 'table-wrap' }, h('table', { class: 'events' },
    h('thead', {}, h('tr', {},
      [t('Eveniment'), t('Cod'), t('Creat'), t('Participanți'), t('Sondaje'), t('Certificate'), ''].map((c) => h('th', {}, c)))),
    h('tbody', {}, data.events.map((ev) => h('tr', {},
      h('td', {}, h('strong', {}, ev.name), ev.closed ? h('span', { class: 'badge', style: { marginLeft: '.4rem' } }, t('Închis')) : null),
      h('td', {}, h('code', {}, ev.code)),
      h('td', { class: 'muted' }, fmt(ev.createdAt)),
      h('td', { class: 'num' }, ev.participants),
      h('td', { class: 'num' }, ev.polls),
      h('td', { class: 'num' }, ev.certificates),
      h('td', {}, h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        h('a', { class: 'btn sm primary', href: `/admin/${ev.code}` }, t('Administrează')),
        h('a', { class: 'btn sm', href: `/present/${ev.code}`, target: '_blank', rel: 'noopener' }, t('Ecran')),
        h('a', { class: 'btn sm', href: `/report/${ev.code}`, target: '_blank', rel: 'noopener' }, t('Raport')),
        h('button', { class: 'sm', type: 'button', onclick: () => newKey(ev) }, t('Link nou de administrare')),
        h('button', { class: 'sm ghost danger', type: 'button', onclick: () => remove(ev) }, t('Șterge'))))))))));
}

async function newKey(ev) {
  if (!confirm(t('Generezi un link nou de administrare pentru „{name}”? Linkul vechi nu va mai funcționa.', { name: ev.name }))) return;
  try {
    const { adminKey } = await api(`/api/panel/events/${ev.code}/key`, { method: 'POST' });
    const url = `${location.origin}/admin/${ev.code}#key=${adminKey}`;
    const mine = storage('quizy:events', []).filter((e) => e.code !== ev.code);
    mine.unshift({ code: ev.code, key: adminKey, name: ev.name, at: Date.now() });
    store('quizy:events', mine.slice(0, 50));
    copy(url);
    toast(t('Linkul nou a fost copiat. Trimite-l organizatorului.'));
  } catch (err) { toast(err.message, true); }
}

async function remove(ev) {
  const typed = prompt(t('Scrie codul evenimentului ({code}) ca să confirmi ștergerea definitivă:', { code: ev.code }));
  if (typed?.trim().toUpperCase() !== ev.code) return;
  try {
    await api(`/api/panel/events/${ev.code}`, { method: 'DELETE' });
    toast(t('Evenimentul a fost șters.'));
    load();
  } catch (err) { toast(err.message, true); }
}

start().catch((err) => toast(err.message, true));
