import { parsePolls } from './import.js';
import { $, h, toast, storage, store, connect, codeFromPath, renderResults, TYPE_LABELS, votersLabel, copy } from './common.js';

const code = codeFromPath();
const hashKey = new URLSearchParams(location.hash.slice(1)).get('key');
const saved = storage('quizy:events', []);
const key = hashKey || saved.find((e) => e.code === code)?.key;
let state = null;
let qaFilter = 'visible';
const openDetails = new Set();

if (!key) {
  showError('Lipsește cheia de administrare. Deschide linkul de administrare primit la crearea evenimentului.');
} else {
  if (hashKey && !saved.some((e) => e.code === code)) {
    saved.unshift({ code, key, name: code, at: Date.now() });
    store('quizy:events', saved.slice(0, 50));
  }
  // Keep the secret out of the address bar: organizers often project or share their screen.
  // The key stays in this browser's storage and in the masked link under „Linkuri”.
  if (hashKey) history.replaceState(null, '', location.pathname);
}

function showError(msg) {
  $('#app').classList.add('hidden');
  const err = $('#error');
  err.classList.remove('hidden');
  err.replaceChildren(h('h2', {}, msg), h('a', { class: 'btn', href: '/' }, 'Pagina principală'));
}

const socket = key && connect({
  code, role: 'admin', key,
  onState: (s) => { state = s; render(); },
  onError: showError,
});

const act = async (action, payload = {}) => {
  try {
    return await socket.call('admin', { ...payload, action });
  } catch (e) {
    toast(e.message, true);
    return null;
  }
};

// ---------- render ----------
function render() {
  $('#app').classList.remove('hidden');
  const ev = state.event;
  document.title = `${ev.name} · Administrare · Quizy`;
  $('#event-title').textContent = `${ev.name} · ${ev.code}`;
  $('#online').textContent = `● ${votersLabel(state.online)} online`;
  $('#present-link').href = `/present/${ev.code}`;
  if (document.activeElement !== $('#rename-input')) $('#rename-input').value = ev.name;
  $('#qa-enabled').checked = ev.settings.qaEnabled;
  $('#qa-moderation').checked = ev.settings.qaModeration;
  $('#closed').checked = ev.settings.closed;

  const mine = storage('quizy:events', []);
  const entry = mine.find((e) => e.code === ev.code);
  if (entry && entry.name !== ev.name) { entry.name = ev.name; store('quizy:events', mine); }

  renderScreen();
  renderLinks();
  renderPolls();
  renderQuestions();
  renderLeaderboard();
}

function renderScreen() {
  const screens = [['join', 'Codul de intrare'], ['poll', 'Sondajul'], ['qa', 'Întrebările'], ['leaderboard', 'Clasamentul']];
  $('#screen').replaceChildren(...screens.map(([id, label]) => h('button', {
    type: 'button', class: 'sm', 'aria-pressed': String(state.event.settings.screen === id),
    onclick: () => act('event:update', { settings: { screen: id } }),
  }, label)));
}

function renderLinks() {
  const base = location.origin;
  const rows = [
    ['Participanți', `${base}/e/${code}`],
    ['Ecran de proiecție', `${base}/present/${code}`],
    ['Administrare (secret!)', `${base}/admin/${code}#key=${key}`],
  ];
  $('#links').replaceChildren(...rows.map(([label, url]) => {
    const secret = url.includes('#key=');
    const shown = secret ? url.replace(/#key=.*/, '#key=••••••••') : url;
    return h('div', {},
      h('div', { class: 'small muted' }, label),
      h('div', { class: 'link' }, h('code', {}, shown), h('button', { class: 'sm', type: 'button', onclick: () => copy(url) }, 'Copiază')));
  }), h('p', { class: 'small muted', style: { margin: 0 } }, 'Cine are linkul de administrare controlează evenimentul. Nu-l proiecta și nu-l trimite participanților.'));
}

function statusBadge(p) {
  if (p.status === 'live') return h('span', { class: 'badge live' }, 'Live');
  if (p.status === 'closed') return h('span', { class: 'badge closed' }, 'Închis');
  return h('span', { class: 'badge' }, 'Ciornă');
}

function renderPolls() {
  const box = $('#polls');
  if (!state.polls.length) {
    box.replaceChildren(h('div', { class: 'card empty' }, h('p', {}, 'Niciun sondaj încă.'), h('p', { class: 'small' }, 'Creează primul sondaj sau quiz cu butonul de mai sus.')));
    return;
  }
  box.replaceChildren(...state.polls.map((p, idx) => {
    const isLive = p.status === 'live';
    const actions = [
      isLive
        ? h('button', { class: 'sm', type: 'button', onclick: () => act('poll:status', { id: p.id, status: 'closed' }) }, '■ Oprește')
        : h('button', { class: 'sm primary', type: 'button', onclick: () => act('poll:status', { id: p.id, status: 'live' }) }, p.status === 'closed' ? '▶ Redeschide' : '▶ Pornește'),
    ];
    if (p.type === 'quiz') {
      actions.push(h('button', { class: 'sm', type: 'button', onclick: () => act('poll:reveal', { id: p.id, revealed: !p.revealed }) },
        p.revealed ? 'Ascunde răspunsul' : 'Dezvăluie răspunsul'));
    } else {
      actions.push(h('button', { class: 'sm', type: 'button', onclick: () => act('poll:show', { id: p.id, show: !p.showResults }) },
        p.showResults ? 'Ascunde rezultatele de public' : 'Arată rezultatele publicului'));
    }
    actions.push(
      h('button', { class: 'sm ghost', type: 'button', onclick: () => openEditor(p) }, 'Editează'),
      h('button', { class: 'sm ghost', type: 'button', onclick: () => act('poll:duplicate', { id: p.id }) }, 'Duplică'),
      h('button', { class: 'sm ghost', type: 'button', disabled: !p.results.responses, onclick: () => confirm('Ștergi toate răspunsurile acestui sondaj?') && act('poll:reset', { id: p.id }) }, 'Resetează'),
      h('button', { class: 'sm ghost', type: 'button', disabled: idx === 0, 'aria-label': 'Mută sus', onclick: () => act('poll:move', { id: p.id, direction: 'up' }) }, '↑'),
      h('button', { class: 'sm ghost', type: 'button', disabled: idx === state.polls.length - 1, 'aria-label': 'Mută jos', onclick: () => act('poll:move', { id: p.id, direction: 'down' }) }, '↓'),
      h('button', { class: 'sm ghost danger', type: 'button', onclick: () => confirm('Ștergi sondajul și răspunsurile lui?') && act('poll:delete', { id: p.id }) }, 'Șterge'),
    );
    const details = h('details', { open: openDetails.has(p.id) || isLive },
      h('summary', {}, `Rezultate · ${votersLabel(p.results.voters)}`),
      h('div', { style: { marginTop: '.5rem' } }, renderResults({ ...p, correct: p.correct })));
    details.addEventListener('toggle', () => (details.open ? openDetails.add(p.id) : openDetails.delete(p.id)));
    return h('div', { class: `poll-item${isLive ? ' live' : ''}` },
      h('div', { class: 'row between' },
        h('div', { class: 'row' }, statusBadge(p), h('span', { class: 'small muted' }, TYPE_LABELS[p.type]),
          p.type === 'quiz' && p.timeLimit ? h('span', { class: 'small muted' }, `· ${p.timeLimit}s`) : null),
        h('span', { class: 'small muted' }, votersLabel(p.results.voters))),
      h('div', { class: 'q', style: { margin: '.4rem 0' } }, p.question),
      h('div', { class: 'row' }, actions),
      details);
  }));
}

function renderQuestions() {
  const all = state.questions;
  const pending = all.filter((q) => q.status === 'pending').length;
  const badge = $('#pending-count');
  badge.classList.toggle('hidden', !pending);
  badge.textContent = `${pending} în așteptare`;
  document.querySelectorAll('#qa-filter [data-f]').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.f === qaFilter));
    const n = all.filter((q) => q.status === b.dataset.f).length;
    b.textContent = `${{ pending: 'În așteptare', visible: 'Publicate', answered: 'Răspunse', archived: 'Arhivate' }[b.dataset.f]}${n ? ` (${n})` : ''}`;
  });
  const list = all.filter((q) => q.status === qaFilter);
  if (!list.length) return $('#questions').replaceChildren(h('p', { class: 'empty small' }, 'Nimic aici.'));
  const btn = (label, action, q, cls = 'sm ghost') => h('button', { class: cls, type: 'button', onclick: () => act('question:moderate', { id: q.id, op: action }) }, label);
  $('#questions').replaceChildren(...list.map((q) => h('div', { class: `question${q.highlighted ? ' highlighted' : ''}` },
    h('div', { class: 'upvote btn', 'aria-hidden': 'true' }, h('span', {}, '▲'), h('strong', {}, q.votes)),
    h('div', { class: 'body' }, q.text,
      h('div', { class: 'meta' }, q.author || 'Anonim', ' · ', new Date(q.at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })),
      h('div', { class: 'row', style: { marginTop: '.4rem' } },
        q.status === 'pending' ? [btn('Publică', 'approve', q, 'sm primary'), btn('Arhivează', 'archive', q)] : null,
        q.status === 'visible' ? [btn(q.highlighted ? 'Scoate de pe ecran' : 'Pe ecran', 'highlight', q, q.highlighted ? 'sm primary' : 'sm'), btn('Marcat ca răspuns', 'answer', q), btn('Arhivează', 'archive', q)] : null,
        q.status === 'answered' || q.status === 'archived' ? btn('Readu în listă', 'restore', q) : null,
        h('button', { class: 'sm ghost danger', type: 'button', onclick: () => confirm('Ștergi întrebarea?') && act('question:moderate', { id: q.id, op: 'delete' }) }, 'Șterge'))))));
}

function renderLeaderboard() {
  const lb = state.leaderboard;
  $('#leaderboard').replaceChildren(lb.length
    ? h('ol', { class: 'leader' }, lb.map((r) => h('li', {}, h('span', {}, `${r.rank}. ${r.name}`), h('span', { class: 'pts' }, `${r.score} · ${r.correct} corecte`))))
    : h('p', { class: 'muted small' }, 'Clasamentul apare după ce dezvălui răspunsul unui quiz.'));
}

// ---------- settings ----------
$('#qa-enabled').addEventListener('change', (e) => act('event:update', { settings: { qaEnabled: e.target.checked } }));
$('#qa-moderation').addEventListener('change', (e) => act('event:update', { settings: { qaModeration: e.target.checked } }));
$('#closed').addEventListener('change', (e) => act('event:update', { settings: { closed: e.target.checked } }));
$('#rename').addEventListener('submit', (e) => {
  e.preventDefault();
  act('event:update', { name: $('#rename-input').value }).then((r) => r && toast('Salvat.'));
});
$('#delete-event').addEventListener('click', async () => {
  if (prompt(`Scrie codul evenimentului (${code}) ca să confirmi ștergerea definitivă:`)?.trim().toUpperCase() !== code) return;
  if (!await act('event:delete')) return;
  store('quizy:events', storage('quizy:events', []).filter((e) => e.code !== code));
  location.href = '/';
});
document.querySelectorAll('#qa-filter [data-f]').forEach((b) => b.addEventListener('click', () => { qaFilter = b.dataset.f; renderQuestions(); }));

$('#export').addEventListener('click', async () => {
  const res = await fetch(`/api/events/${code}/export.csv`, { headers: { 'X-Admin-Key': key } });
  if (!res.ok) return toast('Exportul a eșuat.', true);
  const url = URL.createObjectURL(await res.blob());
  h('a', { href: url, download: `quizy-${code}.csv` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ---------- bulk import ----------
const EXAMPLE = `Who are you?
- Public authority · CSIRT/SOC
- Essential or important entity
- Vendor/MSSP
- Academia
- Other

Ce înseamnă NIS2? [30s]
* Directivă UE privind securitatea cibernetică
- Un standard ISO

[nor] Un cuvânt despre eveniment

[nota 5] Cât de utilă a fost sesiunea?

Ce ai învățat azi?`;

$('#import-polls').addEventListener('click', () => {
  const form = $('#editor');
  const area = h('textarea', { rows: 14, placeholder: EXAMPLE, style: { fontFamily: 'ui-monospace, monospace', fontSize: '.9rem' } });
  const preview = h('div', { class: 'small muted' });
  const update = () => {
    const polls = parsePolls(area.value);
    preview.replaceChildren(polls.length
      ? h('ol', { style: { margin: 0, paddingLeft: '1.2rem' } }, polls.map((p) => h('li', {},
        h('strong', {}, TYPE_LABELS[p.type]), ` · ${p.question || '(fără text)'}`, p.options ? ` · ${p.options.length} opțiuni` : '')))
      : 'Lipește întrebările mai sus.');
  };
  area.addEventListener('input', update);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const polls = parsePolls(area.value);
    const res = await act('poll:import', { polls });
    if (!res) return;
    form.classList.add('hidden');
    toast(`Am importat ${res.ids.length} ${res.ids.length === 1 ? 'întrebare' : 'întrebări'}.`);
  };
  form.replaceChildren(
    h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, 'Import în bloc'),
      h('button', { type: 'button', class: 'ghost sm', onclick: () => form.classList.add('hidden') }, '✕')),
    h('details', {}, h('summary', {}, 'Cum scriu întrebările?'),
      h('ul', { class: 'small', style: { paddingLeft: '1.2rem' } },
        h('li', {}, 'Un rând liber între întrebări.'),
        h('li', {}, 'Opțiunile încep cu „-”. Opțiunea corectă cu „*” → devine quiz. „[30s]” la finalul întrebării = cronometru.'),
        h('li', {}, '„[multiplu]” = se pot alege mai multe opțiuni.'),
        h('li', {}, '„[nor]” = word cloud, „[nota 5]” sau „[nota 10]” = evaluare.'),
        h('li', {}, 'Întrebare fără opțiuni = răspuns liber.')),
      h('button', { type: 'button', class: 'sm', onclick: () => { area.value = EXAMPLE; update(); } }, 'Pune exemplul')),
    area, preview,
    h('button', { type: 'submit', class: 'primary' }, 'Importă'));
  update();
  form.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  area.focus();
});

// ---------- poll editor ----------
$('#new-poll').addEventListener('click', () => openEditor(null));

function openEditor(poll) {
  const form = $('#editor');
  const draft = poll
    ? { type: poll.type, question: poll.question, options: [...(poll.options || ['', ''])], multi: poll.multi, correct: [...(poll.correct || [])],
      scale: poll.scale || 5, maxEntries: poll.maxEntries || 3, timeLimit: poll.timeLimit || 0, showResults: poll.showResults }
    : { type: 'choice', question: '', options: ['', ''], multi: false, correct: [], scale: 5, maxEntries: 3, timeLimit: 20, showResults: true };

  const draw = () => {
    const t = draft.type;
    const typeSelect = h('select', { id: 'f-type', onchange: (e) => { draft.type = e.target.value; if (draft.type === 'open') draft.maxEntries = 1; draw(); } },
      Object.entries(TYPE_LABELS).map(([v, l]) => h('option', { value: v, selected: v === t }, l)));
    const parts = [
      h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, poll ? 'Editează sondajul' : 'Sondaj nou'),
        h('button', { type: 'button', class: 'ghost sm', onclick: () => form.classList.add('hidden') }, '✕')),
      h('div', {}, h('label', { for: 'f-type' }, 'Tip'), typeSelect),
      h('div', {}, h('label', { for: 'f-q' }, 'Întrebarea'),
        h('textarea', { id: 'f-q', maxlength: '300', required: true, value: draft.question, oninput: (e) => { draft.question = e.target.value; } })),
    ];
    if (t === 'choice' || t === 'quiz') {
      parts.push(h('div', {},
        h('label', {}, t === 'quiz' ? 'Opțiuni (bifează răspunsul corect)' : 'Opțiuni'),
        draft.options.map((o, i) => h('div', { class: 'opt-row' },
          t === 'quiz' ? h('input', {
            type: 'checkbox', class: 'correct-toggle', checked: draft.correct.includes(i), 'aria-label': `Opțiunea ${i + 1} e corectă`,
            onchange: (e) => { draft.correct = e.target.checked ? [...draft.correct, i] : draft.correct.filter((x) => x !== i); },
          }) : null,
          h('input', { type: 'text', maxlength: '120', value: o, placeholder: `Opțiunea ${i + 1}`, oninput: (e) => { draft.options[i] = e.target.value; } }),
          h('button', {
            type: 'button', class: 'sm ghost', disabled: draft.options.length <= 2, 'aria-label': 'Elimină opțiunea',
            onclick: () => {
              draft.options.splice(i, 1);
              draft.correct = draft.correct.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x));
              draw();
            },
          }, '✕'))),
        h('button', { type: 'button', class: 'sm', disabled: draft.options.length >= 20, onclick: () => { draft.options.push(''); draw(); } }, '+ Opțiune')));
    }
    if (t === 'choice') {
      parts.push(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: draft.multi, onchange: (e) => { draft.multi = e.target.checked; } }), 'Se pot alege mai multe opțiuni'));
    }
    if (t === 'quiz') {
      parts.push(h('div', {}, h('label', { for: 'f-time' }, 'Timp de răspuns (secunde, 0 = fără limită)'),
        h('input', { id: 'f-time', type: 'number', min: '0', max: '600', value: draft.timeLimit, oninput: (e) => { draft.timeLimit = Number(e.target.value); } })));
    }
    if (t === 'rating') {
      parts.push(h('div', {}, h('label', { for: 'f-scale' }, 'Scală'),
        h('select', { id: 'f-scale', onchange: (e) => { draft.scale = Number(e.target.value); } },
          [3, 5, 7, 10].map((n) => h('option', { value: n, selected: n === draft.scale }, `1 – ${n}`)))));
    }
    if (t === 'wordcloud' || t === 'open') {
      parts.push(h('div', {}, h('label', { for: 'f-max' }, 'Răspunsuri permise per participant'),
        h('input', { id: 'f-max', type: 'number', min: '1', max: '10', value: draft.maxEntries, oninput: (e) => { draft.maxEntries = Number(e.target.value); } })));
    }
    if (t !== 'quiz') {
      parts.push(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: draft.showResults, onchange: (e) => { draft.showResults = e.target.checked; } }),
        'Publicul vede rezultatele după ce răspunde'));
    }
    parts.push(h('div', { class: 'row' },
      h('button', { type: 'submit', class: 'primary' }, poll ? 'Salvează' : 'Creează'),
      poll ? null : h('button', { type: 'button', onclick: () => save(true) }, 'Creează și pornește')));
    form.replaceChildren(...parts);
  };

  const save = async (start = false) => {
    const payload = { ...draft };
    if (poll) {
      if (!await act('poll:update', { id: poll.id, poll: payload })) return;
    } else {
      const created = await act('poll:create', { poll: payload });
      if (!created) return;
      if (start) await act('poll:status', { id: created.id, status: 'live' });
    }
    form.classList.add('hidden');
    toast('Salvat.');
  };
  form.onsubmit = (e) => { e.preventDefault(); save(false); };
  draw();
  form.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#f-q').focus();
}
