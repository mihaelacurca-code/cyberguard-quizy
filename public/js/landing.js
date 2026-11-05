import { $, h, toast, storage, store } from './common.js';

$('#join').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('#join-code').value.trim().toUpperCase();
  const res = await fetch(`/api/events/${encodeURIComponent(code)}`);
  if (!res.ok) return toast('Nu există niciun eveniment cu acest cod.', true);
  location.href = `/e/${code}`;
});

$('#create').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const name = $('#event-name').value;
    const res = await fetch('/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const mine = storage('quizy:events', []);
    mine.unshift({ code: data.code, key: data.adminKey, name: name.trim(), at: Date.now() });
    store('quizy:events', mine.slice(0, 50));
    location.href = `/admin/${data.code}#key=${data.adminKey}`;
  } catch (err) {
    toast(err.message || 'Nu am putut crea evenimentul.', true);
    btn.disabled = false;
  }
});

const mine = storage('quizy:events', []);
if (mine.length) {
  $('#mine').classList.remove('hidden');
  $('#mine-list').append(...mine.map((ev) => h('div', { class: 'row between' },
    h('div', { class: 'grow' }, h('strong', {}, ev.name), ' ', h('span', { class: 'muted small' }, ev.code)),
    h('a', { class: 'btn sm', href: `/admin/${ev.code}#key=${ev.key}` }, 'Administrează'))));
}
