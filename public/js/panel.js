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
  me = s.user;
  $('#logout').classList.remove('hidden');
  $('#whoami').classList.remove('hidden');
  $('#whoami').textContent = me.super ? t('Administratorul serverului') : me.name;
  $('#events-title').textContent = me.super ? t('Toate evenimentele') : t('Evenimentele mele');
  ['#users-card', '#server-settings'].forEach((id) => $(id).classList.toggle('hidden', !me.super));
  $('#password-form').classList.toggle('hidden', me.super);
  show('#app');
  await load();
}

$('#login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/panel/login', { method: 'POST', body: JSON.stringify({ username: $('#username').value, password: $('#password').value }) });
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

$('#retention-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/panel/settings', { method: 'POST', body: JSON.stringify({ retentionDays: Number($('#retention-days').value) || 0 }) });
    toast(t('Salvat.'));
    load();
  } catch (err) { toast(err.message, true); }
});

let retention = 0;
let me = null;
let users = [];
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
  retention = data.retentionDays || 0;
  if (data.users) { users = data.users; drawUsers(); }
  if (document.activeElement !== $('#retention-days')) $('#retention-days').value = retention;
  const box = $('#events');
  if (!data.events.length) return fill(box, h('div', { class: 'card empty' }, t('Niciun eveniment încă.')));
  const owner = (ev) => (ev.ownerId === 0 ? t('Administratorul serverului') : ev.ownerName || h('span', { class: 'badge pending' }, t('Fără organizator')));
  fill(box, h('div', { class: 'table-wrap' }, h('table', { class: 'events' },
    h('thead', {}, h('tr', {},
      [t('Eveniment'), t('Cod'), me.super ? t('Organizator') : null, t('Creat'), t('Participanți'), t('Sondaje'), t('Certificate'), ''].filter(Boolean).map((c) => h('th', {}, c)))),
    h('tbody', {}, data.events.map((ev) => h('tr', {},
      h('td', {}, h('strong', {}, ev.name), ev.closed ? h('span', { class: 'badge', style: { marginLeft: '.4rem' } }, t('Închis')) : null,
        ev.closed && retention > 0 && ev.closedAt ? h('div', { class: 'small muted' }, t('Se șterge automat pe {date}', { date: fmt(ev.closedAt + retention * 86_400_000) })) : null),
      h('td', {}, h('code', {}, ev.code)),
      // The administrator gives out events without an organizer, and their own events (e.g. to the
      // colleague who runs them); an organizer's event cannot be taken.
      me.super ? h('td', {}, ev.ownerId === null || ev.ownerId === 0
        ? h('select', { 'aria-label': t('Organizator'), style: { width: 'auto', padding: '.3rem .5rem' }, onchange: (e) => assign(ev, e.target.value) },
          h('option', { value: '', selected: ev.ownerId === null }, t('Fără organizator')),
          h('option', { value: '0', selected: ev.ownerId === 0 }, t('Eu (administrator)')),
          users.map((u) => h('option', { value: String(u.id), selected: ev.ownerId === u.id }, u.name)))
        : owner(ev)) : null,
      h('td', { class: 'muted' }, fmt(ev.createdAt)),
      h('td', { class: 'num' }, ev.participants),
      h('td', { class: 'num' }, ev.polls),
      h('td', { class: 'num' }, ev.certificates),
      h('td', {}, ev.mine
        ? h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
          h('a', { class: 'btn sm primary', href: `/admin/${ev.code}` }, t('Administrează')),
          h('a', { class: 'btn sm', href: `/present/${ev.code}`, target: '_blank', rel: 'noopener' }, t('Ecran')),
          h('a', { class: 'btn sm', href: `/report/${ev.code}`, target: '_blank', rel: 'noopener' }, t('Raport')),
          h('button', { class: 'sm', type: 'button', onclick: () => duplicate(ev) }, t('Duplică')),
          h('button', { class: 'sm', type: 'button', onclick: () => newKey(ev) }, t('Link nou de administrare')),
          h('button', { class: 'sm ghost danger', type: 'button', onclick: () => remove(ev) }, t('Șterge')))
        // someone else's event: the administrator only sees it (and can delete it). An event without
        // an organizer (created before accounts, or whose account was deleted) can be given to someone.
        : h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
          h('span', { class: 'small muted' }, t(ev.ownerId === null ? 'Alege organizatorul în coloana „Organizator”.' : 'Doar organizatorul îl poate deschide.')),
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

async function duplicate(ev) {
  const name = prompt(t('Numele evenimentului nou (copia):'), `${ev.name} (${t('copie')})`);
  if (name === null) return;
  try {
    const data = await api(`/api/panel/events/${ev.code}/duplicate`, { method: 'POST', body: JSON.stringify({ name }) });
    const mine = storage('quizy:events', []);
    mine.unshift({ code: data.code, key: data.adminKey, name: name.trim(), at: Date.now() });
    store('quizy:events', mine.slice(0, 50));
    toast(t('Am creat copia.'));
    load();
  } catch (err) { toast(err.message, true); }
}

async function assign(ev, value) {
  const ownerId = value === '' ? null : Number(value);
  const who = ownerId === null ? t('nimeni') : ownerId === 0 ? t('tine') : users.find((u) => u.id === ownerId)?.name;
  if (!confirm(t('Dai evenimentul „{name}” lui {who}? Doar organizatorul lui îl poate deschide.', { name: ev.name, who }))) return load();
  try {
    await api(`/api/panel/events/${ev.code}/owner`, { method: 'POST', body: JSON.stringify({ ownerId }) });
    toast(t('Salvat.'));
    load();
  } catch (err) { toast(err.message, true); load(); }
}

// ---------- organizer accounts (administrator only) ----------
function showSecret(name, username, password) {
  const box = $('#user-secret');
  box.classList.remove('hidden');
  fill(box,
    h('p', { style: { margin: '0 0 .4rem' } }, t('Datele de autentificare pentru {name}. Parola apare o singură dată: trimite-o pe un canal sigur.', { name })),
    h('div', { class: 'link' },
      h('code', {}, `${location.origin}/panel · ${username} · ${password}`),
      h('button', { class: 'sm', type: 'button', onclick: () => copy([`${t('Panou de administrare')}: ${location.origin}/panel`, `${t('Utilizator')}: ${username}`, `${t('Parola')}: ${password}`].join('\n')) }, t('Copiază'))),
    h('button', { class: 'sm ghost', type: 'button', style: { marginTop: '.4rem' }, onclick: () => box.classList.add('hidden') }, t('Am notat, ascunde')));
}

function drawUsers() {
  fill($('#users'), users.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'events' },
    h('thead', {}, h('tr', {}, [t('Nume'), t('Utilizator'), t('Evenimente'), ''].map((c) => h('th', {}, c)))),
    h('tbody', {}, users.map((u) => h('tr', {},
      h('td', {}, h('strong', {}, u.name)),
      h('td', {}, h('code', {}, u.username)),
      h('td', { class: 'num' }, u.events),
      h('td', {}, h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        h('button', { class: 'sm', type: 'button', onclick: async () => {
          if (!confirm(t('Generezi o parolă nouă pentru {name}? Cea veche nu mai funcționează.', { name: u.name }))) return;
          try {
            const { password } = await api(`/api/panel/users/${u.id}/password`, { method: 'POST' });
            showSecret(u.name, u.username, password);
          } catch (err) { toast(err.message, true); }
        } }, t('Parolă nouă')),
        h('button', { class: 'sm ghost danger', type: 'button', onclick: async () => {
          if (!confirm(t('Ștergi contul lui {name}? Evenimentele lui rămân, fără organizator, până le dai altcuiva.', { name: u.name }))) return;
          try {
            await api(`/api/panel/users/${u.id}`, { method: 'DELETE' });
            toast(t('Contul a fost șters.'));
            load();
          } catch (err) { toast(err.message, true); }
        } }, t('Șterge'))))))))) : h('p', { class: 'muted small', style: { margin: 0 } }, t('Niciun cont încă.')));
}

$('#user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const u = await api('/api/panel/users', { method: 'POST', body: JSON.stringify({ name: $('#user-name').value, username: $('#user-username').value }) });
    $('#user-name').value = '';
    $('#user-username').value = '';
    showSecret(u.name, u.username, u.password);
    load();
  } catch (err) { toast(err.message, true); }
});

$('#password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/panel/password', { method: 'POST', body: JSON.stringify({ current: $('#pw-current').value, next: $('#pw-next').value }) });
    $('#pw-current').value = '';
    $('#pw-next').value = '';
    toast(t('Parola a fost schimbată.'));
  } catch (err) { toast(err.message, true); }
});

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
