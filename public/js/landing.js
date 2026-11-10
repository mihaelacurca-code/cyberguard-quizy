import { $, h, toast, storage, store, fill } from './common.js';
import { t, lang, translatePage, langSwitch } from './i18n.js';

translatePage();
$('#lang-slot').replaceWith(langSwitch());

fetch('/api/config').then((r) => r.json()).then((cfg) => {
  $('#panel-link').classList.toggle('hidden', !cfg.panel);
  if (!cfg.openCreation) {
    $('#create').classList.add('hidden');
    $('#create-closed').classList.remove('hidden');
  }
}).catch(() => {});

$('#join').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('#join-code').value.trim().toUpperCase();
  const res = await fetch(`/api/events/${encodeURIComponent(code)}`, { headers: { 'X-Lang': lang } });
  if (!res.ok) return toast(t('Nu există niciun eveniment cu acest cod.'), true);
  location.href = `/e/${code}`;
});

$('#create').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const name = $('#event-name').value;
    const res = await fetch('/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lang': lang }, body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const mine = storage('quizy:events', []);
    mine.unshift({ code: data.code, key: data.adminKey, name: name.trim(), at: Date.now() });
    store('quizy:events', mine.slice(0, 50));
    location.href = `/admin/${data.code}#key=${data.adminKey}`;
  } catch (err) {
    toast(err.message || t('Nu am putut crea evenimentul.'), true);
    btn.disabled = false;
  }
});

// Events this browser created or opened as organizer (with their admin keys). They live only
// in this browser's storage; on a shared computer the organizer can remove them here.
function renderMine() {
  const mine = storage('quizy:events', []);
  $('#mine').classList.toggle('hidden', !mine.length);
  const forget = (code) => {
    store('quizy:events', storage('quizy:events', []).filter((e) => e.code !== code));
    renderMine();
  };
  fill($('#mine-list'), ...mine.map((ev) => h('div', { class: 'row between mine-row' },
    h('div', { class: 'grow' }, h('strong', {}, ev.name), ' ', h('span', { class: 'muted small' }, ev.code)),
    h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
      h('a', { class: 'btn sm', href: `/admin/${ev.code}#key=${ev.key}` }, t('Administrează')),
      h('button', {
        class: 'sm ghost', type: 'button', title: t('Scoate de pe acest dispozitiv'), 'aria-label': t('Scoate „{name}” de pe acest dispozitiv', { name: ev.name }),
        onclick: () => {
          if (!confirm(t('Scoți „{name}” din lista de pe acest dispozitiv? Evenimentul nu se șterge; îl redeschizi cu linkul de administrare sau din panou.', { name: ev.name }))) return;
          forget(ev.code);
          toast(t('Am scos evenimentul de pe acest dispozitiv.'));
        },
      }, '✕')))),
  mine.length > 1 ? h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
    h('button', {
      class: 'sm ghost danger', type: 'button',
      onclick: () => {
        if (!confirm(t('Uiți toate evenimentele de pe acest dispozitiv? Ele nu se șterg; le redeschizi cu linkurile de administrare sau din panou.'))) return;
        store('quizy:events', []);
        renderMine();
        toast(t('Lista a fost golită pe acest dispozitiv.'));
      },
    }, t('Uită toate'))) : null);
}
renderMine();
