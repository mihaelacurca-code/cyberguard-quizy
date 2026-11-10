import { parsePolls, toImportText } from './import.js';
import { t as tr, lang, translatePage, langSwitch } from './i18n.js';

translatePage();
$('#lang-slot').replaceWith(langSwitch());
import { $, h, toast, storage, store, connect, codeFromPath, renderResults, TYPE_LABELS, votersLabel, copy, fill, applyBrand, pollImageUrl, pinBoard } from './common.js';

const code = codeFromPath();
const hashKey = new URLSearchParams(location.hash.slice(1)).get('key');
const saved = storage('quizy:events', []);
const key = hashKey || saved.find((e) => e.code === code)?.key;
let state = null;
let qaFilter = 'visible';
const openDetails = new Set();

if (key && hashKey && !saved.some((e) => e.code === code)) {
  saved.unshift({ code, key, name: code, at: Date.now() });
  store('quizy:events', saved.slice(0, 50));
}
// Keep the secret out of the address bar: organizers often project or share their screen.
// The key stays in this browser's storage and in the masked link under „Linkuri”.
if (hashKey) history.replaceState(null, '', location.pathname);

function showError(msg) {
  $('#app').classList.add('hidden');
  const err = $('#error');
  err.classList.remove('hidden');
  fill(err, 
    h('h2', {}, key ? msg : tr('Lipsește cheia de administrare. Deschide linkul de administrare primit la crearea evenimentului.')),
    h('p', { class: 'muted' }, tr('Dacă ai cont de organizator, intră în panou și deschide evenimentul de acolo. Dacă linkul a fost înlocuit cu unul nou („Link nou de administrare”), cel vechi nu mai funcționează: cere linkul nou organizatorului sau administratorului.')),
    h('div', { class: 'row' },
      h('a', { class: 'btn', href: '/' }, tr('Pagina principală')),
      h('a', { class: 'btn', href: '/panel' }, tr('Panoul de administrare'))));
}

// Without a key the server may still let us in through a panel login (cookie).
const socket = connect({
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
  document.title = `${ev.name} · Administrare · CYBERGUARD Quizy`;
  $('#event-title').textContent = `${ev.name} · ${ev.code}`;
  $('#online').textContent = tr('● {n} online', { n: votersLabel(state.online) });
  $('#present-link').href = `/present/${ev.code}`;
  $('#report-link').href = `/report/${ev.code}`;
  if (document.activeElement !== $('#rename-input')) $('#rename-input').value = ev.name;
  $('#qa-enabled').checked = ev.settings.qaEnabled;
  $('#qa-moderation').checked = ev.settings.qaModeration;
  $('#closed').checked = ev.settings.closed;
  if (document.activeElement !== $('#code-input')) $('#code-input').value = ev.code;
  applyBrand(ev);
  const brand = ev.settings.brand || {};
  $('#logo-none').classList.toggle('hidden', Boolean(brand.logo));
  $('#logo-remove').classList.toggle('hidden', !brand.logo);
  if (document.activeElement !== $('#brand-color')) $('#brand-color').value = brand.color || '#f5b400';
  $('#brand-bg').value = brand.background || 'neon';
  $('#brand-hide').checked = Boolean(brand.hideProduct);
  $('#cert-enabled').checked = ev.settings.certEnabled;
  if (!$('#cert-form').contains(document.activeElement)) {
    $('#cert-issuer').value = ev.settings.certIssuer || '';
    $('#cert-min').value = ev.settings.certMinScore || 0;
    $('#cert-intro').value = ev.settings.certIntro || '';
  }
  $('#cert-score').checked = ev.settings.certShowScore !== false;
  if (document.activeElement !== $('#privacy-text') && !privacyDirty) $('#privacy-text').value = ev.settings.privacy || '';
  $('#cert-count').textContent = tr('{n} emise', { n: state.certificates });

  const mine = storage('quizy:events', []);
  const entry = mine.find((e) => e.code === ev.code);
  if (entry && entry.name !== ev.name) { entry.name = ev.name; store('quizy:events', mine); }

  renderScreen();
  renderLinks();
  renderPolls();
  renderQuestions();
  renderLeaderboard();
  renderTest();
  renderScenario();
  renderParticipants();
}

function renderScreen() {
  const screens = [['join', tr('Codul de intrare')], ['poll', tr('Sondajul')], ['qa', tr('Întrebările')], ['leaderboard', tr('Clasamentul')], ['test', tr('Rezultatele testului')], ['scenario', tr('Scenariul')]];
  fill($('#screen'), ...screens.map(([id, label]) => h('button', {
    type: 'button', class: 'sm', 'aria-pressed': String(state.event.settings.screen === id),
    onclick: () => act('event:update', { settings: { screen: id } }),
  }, label)));
}

function renderLinks() {
  const base = location.origin;
  const rows = [
    [tr('Participanți'), `${base}/e/${code}`],
    [tr('Ecran de proiecție'), `${base}/present/${code}`],
  ];
  if (key) rows.push([tr('Administrare (secret!)'), `${base}/admin/${code}#key=${key}`]);
  fill($('#links'), ...rows.map(([label, url]) => {
    const secret = url.includes('#key=');
    const shown = secret ? url.replace(/#key=.*/, '#key=••••••••') : url;
    return h('div', {},
      h('div', { class: 'small muted' }, label),
      h('div', { class: 'link' }, h('code', {}, shown), h('button', { class: 'sm', type: 'button', onclick: () => copy(url) }, tr('Copiază'))));
  }), h('p', { class: 'small muted', style: { margin: 0 } }, tr('Cine are linkul de administrare controlează evenimentul. Nu-l proiecta și nu-l trimite participanților.')));
}

function statusBadge(p) {
  if (p.status === 'live') return h('span', { class: 'badge live' }, tr('Live'));
  if (p.status === 'closed') return h('span', { class: 'badge closed' }, tr('Închis'));
  return h('span', { class: 'badge' }, tr('Ciornă'));
}

function renderPolls() {
  const box = $('#polls');
  if (!state.polls.length) {
    fill(box, h('div', { class: 'card empty' }, h('p', {}, tr('Niciun sondaj încă.')), h('p', { class: 'small' }, tr('Creează primul sondaj sau quiz cu butonul de mai sus.'))));
    return;
  }
  const liveCount = state.polls.filter((p) => p.status === 'live').length;
  const head = liveCount > 1 ? h('div', { class: 'note row between', style: { marginBottom: '.6rem' } },
    h('span', { class: 'small' }, tr('{n} sondaje deschise în același timp. Participanții le văd pe toate; proiectorul îl arată pe cel marcat „Pe ecran”.', { n: liveCount })),
    h('button', { class: 'sm', type: 'button', onclick: () => act('poll:close-all') }, tr('■ Închide toate'))) : null;
  fill(box, head, ...state.polls.map((p, idx) => {
    const isLive = p.status === 'live';
    const onScreen = state.onScreen === p.id && state.event.settings.screen === 'poll';
    const actions = [
      isLive
        ? h('button', { class: 'sm', type: 'button', onclick: () => act('poll:status', { id: p.id, status: 'closed' }) }, tr('■ Oprește'))
        : h('button', { class: 'sm primary', type: 'button', title: liveCount ? tr('Închide sondajul deschis acum și îl pornește pe acesta') : '', onclick: () => act('poll:status', { id: p.id, status: 'live' }) }, tr(p.status === 'closed' ? '▶ Redeschide' : '▶ Pornește')),
      !isLive && liveCount ? h('button', { class: 'sm', type: 'button', onclick: () => act('poll:status', { id: p.id, status: 'live', keepOthers: true }) }, tr('+ Pornește și lasă-le deschise pe celelalte')) : null,
      isLive && liveCount > 1 ? h('button', { class: onScreen ? 'sm primary' : 'sm', type: 'button', 'aria-pressed': String(onScreen), onclick: () => act('poll:on-screen', { id: p.id }) }, tr(onScreen ? '● Pe ecran' : 'Arată pe ecran')) : null,
    ];
    if (p.type === 'pin' && p.region) {
      actions.push(h('button', { class: 'sm', type: 'button', onclick: () => act('poll:reveal', { id: p.id, revealed: !p.revealed }) },
        tr(p.revealed ? 'Ascunde zona corectă' : 'Dezvăluie zona corectă')));
    }
    if (p.type === 'quiz') {
      actions.push(h('button', { class: 'sm', type: 'button', onclick: () => act('poll:reveal', { id: p.id, revealed: !p.revealed }) },
        tr(p.revealed ? 'Ascunde răspunsul' : 'Dezvăluie răspunsul')));
    } else {
      actions.push(h('button', { class: 'sm', type: 'button', onclick: () => act('poll:show', { id: p.id, show: !p.showResults }) },
        tr(p.showResults ? 'Ascunde rezultatele de public' : 'Arată rezultatele publicului')));
    }
    actions.push(
      h('button', { class: 'sm ghost', type: 'button', onclick: () => openEditor(p) }, tr('Editează')),
      h('button', { class: 'sm ghost', type: 'button', onclick: () => act('poll:duplicate', { id: p.id }) }, tr('Duplică')),
      h('button', { class: 'sm ghost', type: 'button', disabled: !p.results.responses, onclick: () => confirm(tr('Ștergi toate răspunsurile acestui sondaj?')) && act('poll:reset', { id: p.id }) }, tr('Resetează')),
      h('button', { class: 'sm ghost', type: 'button', disabled: idx === 0, 'aria-label': tr('Mută sus'), onclick: () => act('poll:move', { id: p.id, direction: 'up' }) }, '↑'),
      h('button', { class: 'sm ghost', type: 'button', disabled: idx === state.polls.length - 1, 'aria-label': tr('Mută jos'), onclick: () => act('poll:move', { id: p.id, direction: 'down' }) }, '↓'),
      h('button', { class: 'sm ghost danger', type: 'button', onclick: () => confirm(tr('Ștergi sondajul și răspunsurile lui?')) && act('poll:delete', { id: p.id }) }, tr('Șterge')),
    );
    const details = h('details', { open: openDetails.has(p.id) || isLive },
      h('summary', {}, tr('Rezultate · {voters}', { voters: votersLabel(p.results.voters) })),
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

const replying = new Set();
const replyDrafts = new Map();

function renderQuestions() {
  // Don't rebuild the list under the organizer's cursor while they type a reply.
  if ($('#questions').contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return;
  const all = state.questions;
  const pending = all.filter((q) => q.status === 'pending').length;
  const badge = $('#pending-count');
  badge.classList.toggle('hidden', !pending);
  badge.textContent = tr('{n} în așteptare', { n: pending });
  document.querySelectorAll('#qa-filter [data-f]').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.f === qaFilter));
    const n = all.filter((q) => q.status === b.dataset.f).length;
    b.textContent = `${tr({ pending: 'În așteptare', visible: 'Publicate', answered: 'Răspunse', archived: 'Arhivate' }[b.dataset.f])}${n ? ` (${n})` : ''}`;
  });
  const list = all.filter((q) => q.status === qaFilter);
  if (!list.length) return fill($('#questions'), h('p', { class: 'empty small' }, tr('Nimic aici.')));
  const btn = (label, action, q, cls = 'sm ghost') => h('button', { class: cls, type: 'button', onclick: () => act('question:moderate', { id: q.id, op: action }) }, tr(label));
  fill($('#questions'), ...list.map((q) => h('div', { class: `question${q.highlighted ? ' highlighted' : ''}` },
    h('div', { class: 'upvote btn', 'aria-hidden': 'true' }, h('span', {}, '▲'), h('strong', {}, q.votes)),
    h('div', { class: 'body' }, q.text,
      h('div', { class: 'meta' }, q.author || tr('Anonim'), ' · ', new Date(q.at).toLocaleTimeString(lang === 'ro' ? 'ro-RO' : 'en-GB', { hour: '2-digit', minute: '2-digit' })),
      q.reply && !replying.has(q.id) ? h('div', { class: 'reply' }, h('strong', {}, tr('Răspunsul organizatorului:')), ' ', q.reply) : null,
      replying.has(q.id) ? replyForm(q) : null,
      h('div', { class: 'row', style: { marginTop: '.4rem' } },
        q.status !== 'archived' && !replying.has(q.id) ? h('button', { class: 'sm', type: 'button', onclick: () => { replying.add(q.id); renderQuestions(); $(`#reply-${q.id}`)?.focus(); } }, tr(q.reply ? 'Editează răspunsul' : 'Răspunde')) : null,
        q.status === 'pending' ? [btn('Publică', 'approve', q, 'sm primary'), btn('Arhivează', 'archive', q)] : null,
        q.status === 'visible' ? [btn(q.highlighted ? 'Scoate de pe ecran' : 'Pe ecran', 'highlight', q, q.highlighted ? 'sm primary' : 'sm'), btn('Marcat ca răspuns', 'answer', q), btn('Arhivează', 'archive', q)] : null,
        q.status === 'answered' || q.status === 'archived' ? btn('Readu în listă', 'restore', q) : null,
        h('button', { class: 'sm ghost danger', type: 'button', onclick: () => confirm(tr('Ștergi întrebarea?')) && act('question:moderate', { id: q.id, op: 'delete' }) }, tr('Șterge')))))));
}

function replyForm(q) {
  const ta = h('textarea', {
    id: `reply-${q.id}`, maxlength: '1000', rows: 3, value: replyDrafts.get(q.id) ?? q.reply,
    placeholder: tr('Scrie răspunsul; îl văd toți participanții sub întrebare.'),
    oninput: (e) => replyDrafts.set(q.id, e.target.value),
  });
  const close = () => { replying.delete(q.id); replyDrafts.delete(q.id); renderQuestions(); };
  const form = h('form', { class: 'stack', style: { marginTop: '.4rem' } }, ta,
    h('div', { class: 'row' },
      h('button', { class: 'sm primary', type: 'submit' }, tr('Publică răspunsul')),
      h('button', { class: 'sm ghost', type: 'button', onclick: close }, tr('Renunță')),
      q.reply ? h('button', { class: 'sm ghost danger', type: 'button', onclick: async () => { if (await act('question:reply', { id: q.id, text: '' })) close(); } }, tr('Șterge răspunsul')) : null));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await act('question:reply', { id: q.id, text: ta.value })) { close(); toast(tr('Răspuns publicat.')); }
  });
  return form;
}

function renderLeaderboard() {
  const lb = state.leaderboard;
  fill($('#leaderboard'), lb.length
    ? h('ol', { class: 'leader' }, lb.map((r) => h('li', {}, h('span', {}, `${r.rank}. ${r.name || tr('Anonim')}`), h('span', { class: 'pts' }, r.streak >= 2 ? `🔥${r.streak} · ` : '', tr('{score} · {correct} corecte', r)))))
    : h('p', { class: 'muted small' }, tr('Clasamentul apare după ce dezvălui răspunsul unui quiz.')));
}

// ---------- settings ----------
$('#cert-enabled').addEventListener('change', (e) => act('event:update', { settings: { certEnabled: e.target.checked } }));
$('#cert-score').addEventListener('change', (e) => act('event:update', { settings: { certShowScore: e.target.checked } }));
$('#cert-form').addEventListener('submit', (e) => {
  e.preventDefault();
  act('event:update', { settings: { certIssuer: $('#cert-issuer').value, certMinScore: Number($('#cert-min').value) || 0, certIntro: $('#cert-intro').value } })
    .then((r) => r && toast(tr('Salvat.')));
});

// ---------- privacy notice ----------
const PRIVACY_RO = `Informare privind prelucrarea datelor personale

Operator: [numele instituției], [adresa], [e-mail de contact].
Ce date prelucrăm: numele pe care îl introduci (opțional), răspunsurile la întrebări și la teste, scorurile și întrebările trimise în timpul sesiunii.
Scopul: desfășurarea sesiunii de instruire, măsurarea progresului și emiterea certificatului de participare.
Certificatul: dacă îl descarci, numele, evenimentul, data și scorul pot fi verificate de oricine are codul certificatului.
Cât timp: datele se păstrează până la [data / numărul de zile după încheierea programului], apoi se șterg.
Drepturile tale: acces, rectificare, ștergere și opoziție, la [e-mail de contact]. Te poți adresa și Autorității Naționale de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP).
Nu ai nevoie de cont, iar numele este opțional.`;
const PRIVACY_EN = `Personal data notice

Controller: [organisation name], [address], [contact e-mail].
What we process: the name you enter (optional), your answers to questions and tests, your scores and the questions you send during the session.
Purpose: running the training session, measuring progress and issuing the certificate of participation.
Certificate: if you download one, anyone with its code can check your name, the event, the date and the score.
How long: the data is kept until [date / number of days after the programme ends], then deleted.
Your rights: access, rectification, erasure and objection, at [contact e-mail]. You can also contact your national data protection authority.
You do not need an account, and your name is optional.`;
let privacyDirty = false;
$('#privacy-text').addEventListener('input', () => { privacyDirty = true; });
$('#privacy-example').addEventListener('click', () => {
  if ($('#privacy-text').value.trim() && !confirm(tr('Înlocuiești textul actual cu textul standard?'))) return;
  $('#privacy-text').value = lang === 'ro' ? PRIVACY_RO : PRIVACY_EN;
  privacyDirty = true;
  $('#privacy-text').focus();
});
$('#privacy-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#privacy-text').value;
  if (/\[[^\]]+\]/.test(text) && !confirm(tr('Textul mai are câmpuri între paranteze drepte, de completat. Salvezi așa?'))) return;
  if (await act('event:update', { settings: { privacy: text } })) { privacyDirty = false; toast(tr('Salvat.')); }
});

// ---------- participants ----------
let participants = null;
let participantsLoading = false;
async function loadParticipants() {
  if (participantsLoading) return;
  participantsLoading = true;
  const res = await act('participants:list');
  participantsLoading = false;
  if (res) { participants = res.participants; drawParticipants(); }
}
$('#participants-box').addEventListener('toggle', (e) => { if (e.target.open) loadParticipants(); });
let participantsTimer;
function renderParticipants() {
  // While the list is open, refresh it (at most every 2 s) as people answer.
  if (!$('#participants-box').open) return;
  clearTimeout(participantsTimer);
  participantsTimer = setTimeout(loadParticipants, 2000);
}
function drawParticipants() {
  $('#participant-count').textContent = votersLabel(participants.length);
  if (!participants.length) return fill($('#participants'), h('p', { class: 'muted small', style: { margin: 0 } }, tr('Încă nu a participat nimeni.')));
  const pct = (v) => (v === null ? '–' : `${v}%`);
  fill($('#participants'), h('div', { class: 'table-wrap' }, h('table', { class: 'events' },
    h('thead', {}, h('tr', {}, [tr('Nume'), tr('Răspunsuri'), tr('Test inițial'), tr('Test final'), tr('Certificat'), ''].map((c) => h('th', {}, c)))),
    h('tbody', {}, participants.map((p) => h('tr', {},
      h('td', {}, p.name || h('span', { class: 'muted' }, tr('Anonim')), p.questions ? h('div', { class: 'small muted' }, tr('{n} întrebări din public', { n: p.questions })) : null),
      h('td', { class: 'num' }, p.answers),
      h('td', { class: 'num' }, pct(p.pre)),
      h('td', { class: 'num' }, pct(p.post)),
      h('td', {}, p.certificate ? h('code', {}, p.certificate) : h('span', { class: 'muted' }, '–')),
      h('td', {}, h('button', { class: 'sm ghost danger', type: 'button', onclick: async () => {
        if (!confirm(tr('Ștergi participantul „{name}” cu toate răspunsurile lui{cert}?', { name: p.name || tr('Anonim'), cert: p.certificate ? tr(' și certificatul') : '' }))) return;
        if (await act('participant:delete', { id: p.id })) { toast(tr('Participantul a fost șters.')); loadParticipants(); }
      } }, tr('Șterge')))))))));
}

// ---------- duplicate / reset ----------
$('#duplicate-event').addEventListener('click', async () => {
  const name = prompt(tr('Numele evenimentului nou (copia):'), `${state.event.name} (${tr('copie')})`);
  if (name === null) return;
  const res = await act('event:duplicate', { name });
  if (!res) return;
  const mine = storage('quizy:events', []);
  mine.unshift({ code: res.code, key: res.adminKey, name: name.trim(), at: Date.now() });
  store('quizy:events', mine.slice(0, 50));
  toast(tr('Am creat copia. O deschid acum.'));
  setTimeout(() => { location.href = `/admin/${res.code}#key=${res.adminKey}`; }, 600);
});
$('#reset-event').addEventListener('click', async () => {
  const typed = prompt(tr('Se șterg toate răspunsurile, întrebările din public, scorurile și certificatele emise (codurile lor nu mai pot fi verificate). Întrebările și setările rămân. Scrie codul evenimentului ({code}) ca să confirmi:', { code: state.event.code }));
  if (typed?.trim().toUpperCase() !== state.event.code) return;
  if (await act('event:reset')) { toast(tr('Rezultatele au fost șterse.')); if (participants) loadParticipants(); }
});

// ---------- export in the import format ----------
function showExport(title, text, filename) {
  const form = $('#editor');
  const area = h('textarea', { rows: 14, readonly: true, value: text, style: { fontFamily: 'ui-monospace, monospace', fontSize: '.85rem' } });
  form.onsubmit = (e) => e.preventDefault();
  fill(form,
    h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, title),
      h('button', { type: 'button', class: 'ghost sm', onclick: () => form.classList.add('hidden') }, '✕')),
    h('p', { class: 'small muted', style: { margin: 0 } }, tr('Textul e în formatul de la „Import în bloc”: îl poți lipi în alt eveniment.')),
    area,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'primary', onclick: () => copy(text) }, tr('Copiază')),
      h('button', { type: 'button', onclick: () => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        h('a', { href: url, download: filename }).click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } }, tr('Descarcă .txt'))));
  form.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#export-polls').addEventListener('click', () => {
  if (!state.polls.length) return toast(tr('Niciun sondaj încă.'), true);
  showExport(tr('Export sondaje și quiz-uri'), toImportText(state.polls), `intrebari-${state.event.code}.txt`);
});
$('#export-test').addEventListener('click', () => {
  if (!state.testQuestions.length) return toast(tr('Testul nu are încă întrebări.'), true);
  showExport(tr('Export întrebările testului'), toImportText(state.testQuestions.map((q) => ({ ...q, type: 'quiz' }))), `test-${state.event.code}.txt`);
});
$('#code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await act('event:code', { code: $('#code-input').value });
  if (res) toast(tr('Codul nou: {code}', { code: res.code }));
});
$('#qa-enabled').addEventListener('change', (e) => act('event:update', { settings: { qaEnabled: e.target.checked } }));
$('#qa-moderation').addEventListener('change', (e) => act('event:update', { settings: { qaModeration: e.target.checked } }));
$('#closed').addEventListener('change', (e) => act('event:update', { settings: { closed: e.target.checked } }));
$('#rename').addEventListener('submit', (e) => {
  e.preventDefault();
  act('event:update', { name: $('#rename-input').value }).then((r) => r && toast(tr('Salvat.')));
});
$('#delete-event').addEventListener('click', async () => {
  if (prompt(tr('Scrie codul evenimentului ({code}) ca să confirmi ștergerea definitivă:', { code }))?.trim().toUpperCase() !== code) return;
  if (!await act('event:delete')) return;
  store('quizy:events', storage('quizy:events', []).filter((e) => e.code !== code));
  location.href = '/';
});
document.querySelectorAll('#qa-filter [data-f]').forEach((b) => b.addEventListener('click', () => { qaFilter = b.dataset.f; renderQuestions(); }));

$('#export').addEventListener('click', async () => {
  const res = await fetch(`/api/events/${code}/export.csv`, { headers: key ? { 'X-Admin-Key': key, 'X-Lang': lang } : { 'X-Lang': lang } });
  if (!res.ok) return toast(tr('Exportul a eșuat.'), true);
  const url = URL.createObjectURL(await res.blob());
  h('a', { href: url, download: `quizy-${code}.csv` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ---------- bulk import ----------
const EXAMPLE_RO = `Who are you?
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

const EXAMPLE_EN = `Who are you?
- Public authority · CSIRT/SOC
- Essential or important entity
- Vendor/MSSP
- Academia
- Other

What is NIS2? [30s]
* An EU cybersecurity directive
- An ISO standard

[cloud] One word about the event

[rating 5] How useful was this session?

What did you learn today?`;

const EXAMPLE = lang === 'ro' ? EXAMPLE_RO : EXAMPLE_EN;

$('#import-polls').addEventListener('click', () => {
  const form = $('#editor');
  const area = h('textarea', { rows: 14, placeholder: EXAMPLE, style: { fontFamily: 'ui-monospace, monospace', fontSize: '.9rem' } });
  const preview = h('div', { class: 'small muted' });
  const update = () => {
    const polls = parsePolls(area.value);
    fill(preview, polls.length
      ? h('ol', { style: { margin: 0, paddingLeft: '1.2rem' } }, polls.map((p) => h('li', {},
        h('strong', {}, TYPE_LABELS[p.type]), ` · ${p.question || tr('(fără text)')}`, p.options ? tr(' · {n} opțiuni', { n: p.options.length }) : '')))
      : tr('Lipește întrebările mai sus.'));
  };
  area.addEventListener('input', update);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const polls = parsePolls(area.value);
    const res = await act('poll:import', { polls });
    if (!res) return;
    form.classList.add('hidden');
    toast(res.ids.length === 1 ? tr('Am importat o întrebare.') : tr('Am importat {n} întrebări.', { n: res.ids.length }));
  };
  fill(form, 
    h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, tr('Import în bloc')),
      h('button', { type: 'button', class: 'ghost sm', onclick: () => form.classList.add('hidden') }, '✕')),
    h('details', {}, h('summary', {}, tr('Cum scriu întrebările?')),
      h('ul', { class: 'small', style: { paddingLeft: '1.2rem' } },
        h('li', {}, tr('Un rând liber între întrebări.')),
        h('li', {}, tr('Opțiunile încep cu „-”. Opțiunea corectă cu „*” → devine quiz. „[30s]” la finalul întrebării = cronometru.')),
        h('li', {}, tr('„[multiplu]” = se pot alege mai multe opțiuni.')),
        h('li', {}, tr('„[nor]” = word cloud, „[nota 5]” sau „[nota 10]” = evaluare.')),
        h('li', {}, tr('„[clasament]” = participanții ordonează opțiunile; „[likert]” = fiecare opțiune devine o afirmație notată 1–5; „[pin]” = pin pe imagine (imaginea o adaugi apoi din „Editează”).')),
        h('li', {}, tr('Întrebare fără opțiuni = răspuns liber.'))),
      h('button', { type: 'button', class: 'sm', onclick: () => { area.value = EXAMPLE; update(); } }, tr('Pune exemplul'))),
    area, preview,
    h('button', { type: 'submit', class: 'primary' }, tr('Importă')));
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
      scale: poll.scale || 5, maxEntries: poll.maxEntries || 3, timeLimit: poll.timeLimit || 0, showResults: poll.showResults,
      labels: [...(poll.labels || ['', ''])], region: poll.region || null }
    : { type: 'choice', question: '', options: ['', ''], multi: false, correct: [], scale: 5, maxEntries: 3, timeLimit: 20, showResults: true, labels: ['', ''], region: null };
  // The image travels separately: chosen here, uploaded after the poll is saved.
  let imageFile = null;
  let imagePreview = poll?.image ? pollImageUrl(poll) : '';
  let removeImage = false;

  const draw = () => {
    const t = draft.type;
    const typeSelect = h('select', { id: 'f-type', onchange: (e) => {
      draft.type = e.target.value;
      if (draft.type === 'open') draft.maxEntries = 1;
      if (draft.type === 'scale' && draft.scale > 7) draft.scale = 5;
      draw();
    } },
      Object.entries(TYPE_LABELS).map(([v, l]) => h('option', { value: v, selected: v === t }, l)));
    const parts = [
      h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, tr(poll ? 'Editează sondajul' : 'Sondaj nou')),
        h('button', { type: 'button', class: 'ghost sm', onclick: () => form.classList.add('hidden') }, '✕')),
      h('div', {}, h('label', { for: 'f-type' }, tr('Tip')), typeSelect),
      h('div', {}, h('label', { for: 'f-q' }, tr('Întrebarea')),
        h('textarea', { id: 'f-q', maxlength: '300', required: true, value: draft.question, oninput: (e) => { draft.question = e.target.value; } })),
    ];
    if (t === 'choice' || t === 'quiz' || t === 'ranking' || t === 'scale') {
      const isScale = t === 'scale';
      const min = isScale ? 1 : 2;
      const max = t === 'ranking' || isScale ? 10 : 20;
      parts.push(h('div', {},
        h('label', {}, tr(t === 'quiz' ? 'Opțiuni (bifează răspunsul corect)' : isScale ? 'Afirmații' : t === 'ranking' ? 'Opțiuni de ordonat' : 'Opțiuni')),
        draft.options.map((o, i) => h('div', { class: 'opt-row' },
          t === 'quiz' ? h('input', {
            type: 'checkbox', class: 'correct-toggle', checked: draft.correct.includes(i), 'aria-label': tr('Opțiunea {n} e corectă', { n: i + 1 }),
            onchange: (e) => { draft.correct = e.target.checked ? [...draft.correct, i] : draft.correct.filter((x) => x !== i); },
          }) : null,
          h('input', { type: 'text', maxlength: isScale ? '200' : '120', value: o, placeholder: tr(isScale ? 'Afirmația {n}' : 'Opțiunea {n}', { n: i + 1 }), oninput: (e) => { draft.options[i] = e.target.value; } }),
          h('button', {
            type: 'button', class: 'sm ghost', disabled: draft.options.length <= min, 'aria-label': tr('Elimină opțiunea'),
            onclick: () => {
              draft.options.splice(i, 1);
              draft.correct = draft.correct.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x));
              draw();
            },
          }, '✕'))),
        h('button', { type: 'button', class: 'sm', disabled: draft.options.length >= max, onclick: () => { draft.options.push(''); draw(); } }, tr(isScale ? '+ Afirmație' : '+ Opțiune'))));
    }
    if (t === 'scale') {
      parts.push(h('div', {}, h('label', { for: 'f-scale' }, tr('Scală')),
        h('select', { id: 'f-scale', onchange: (e) => { draft.scale = Number(e.target.value); } },
          [3, 5, 7].map((n) => h('option', { value: n, selected: n === draft.scale }, `1 – ${n}`)))));
      parts.push(h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        h('div', { class: 'grow' }, h('label', { for: 'f-low' }, tr('Eticheta pentru 1')),
          h('input', { id: 'f-low', type: 'text', maxlength: '40', value: draft.labels[0], placeholder: tr('Deloc de acord'), oninput: (e) => { draft.labels[0] = e.target.value; } })),
        h('div', { class: 'grow' }, h('label', { for: 'f-high' }, tr('Eticheta pentru maxim')),
          h('input', { id: 'f-high', type: 'text', maxlength: '40', value: draft.labels[1], placeholder: tr('Total de acord'), oninput: (e) => { draft.labels[1] = e.target.value; } }))));
    }
    // image: optional for every type, required for a pin
    const fileInput = h('input', { type: 'file', id: 'f-image', accept: 'image/png,image/jpeg,image/webp', hidden: true, onchange: (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 1024 * 1024) { toast(tr('Imaginea poate avea cel mult 1 MB.'), true); return; }
      imageFile = f; removeImage = false; imagePreview = URL.createObjectURL(f); draw();
    } });
    parts.push(h('div', { class: 'stack' },
      h('label', {}, tr(t === 'pin' ? 'Imaginea pe care participanții pun pinul' : 'Imagine (opțional)')),
      imagePreview && t !== 'pin' ? h('img', { class: 'poll-image', src: imagePreview, alt: '' }) : null,
      h('div', { class: 'row' },
        h('label', { class: 'btn sm', for: 'f-image' }, tr(imagePreview ? 'Schimbă imaginea' : 'Alege imaginea')), fileInput,
        imagePreview && t !== 'pin' ? h('button', { type: 'button', class: 'sm ghost danger', onclick: () => { imageFile = null; imagePreview = ''; removeImage = true; draw(); } }, tr('Fără imagine')) : null),
      h('p', { class: 'small muted', style: { margin: 0 } }, tr('PNG, JPG sau WebP, cel mult 1 MB.'))));
    if (t === 'pin') {
      if (imagePreview) {
        parts.push(h('div', { class: 'stack' },
          h('label', {}, tr('Zona corectă (opțional)')),
          h('p', { class: 'small muted', style: { margin: 0 } }, tr('Atinge imaginea în locul corect. Participanții văd zona doar după ce o dezvălui.')),
          pinBoard({ type: 'pin', region: draft.region, results: null }, { src: imagePreview, onPick: ([x, y]) => { draft.region = { x, y, r: draft.region?.r || 0.08 }; draw(); } }),
          draft.region ? h('div', { class: 'row' },
            h('label', { for: 'f-radius', style: { margin: 0 } }, tr('Mărimea zonei')),
            h('input', { id: 'f-radius', type: 'range', min: '2', max: '40', value: String(Math.round(draft.region.r * 100)), class: 'grow', oninput: (e) => { draft.region = { ...draft.region, r: Number(e.target.value) / 100 }; draw(); $('#f-radius')?.focus(); } }),
            h('button', { type: 'button', class: 'sm ghost', onclick: () => { draft.region = null; draw(); } }, tr('Fără zonă corectă'))) : null));
      } else {
        parts.push(h('p', { class: 'note small' }, tr('Alege imaginea, apoi poți marca zona corectă pe ea.')));
      }
    }
    if (t === 'choice') {
      parts.push(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: draft.multi, onchange: (e) => { draft.multi = e.target.checked; } }), tr('Se pot alege mai multe opțiuni')));
    }
    if (t === 'quiz') {
      parts.push(h('div', {}, h('label', { for: 'f-time' }, tr('Timp de răspuns (secunde, 0 = fără limită)')),
        h('input', { id: 'f-time', type: 'number', min: '0', max: '600', value: draft.timeLimit, oninput: (e) => { draft.timeLimit = Number(e.target.value); } })));
    }
    if (t === 'rating') {
      parts.push(h('div', {}, h('label', { for: 'f-scale' }, tr('Scală')),
        h('select', { id: 'f-scale', onchange: (e) => { draft.scale = Number(e.target.value); } },
          [3, 5, 7, 10].map((n) => h('option', { value: n, selected: n === draft.scale }, `1 – ${n}`)))));
    }
    if (t === 'wordcloud' || t === 'open') {
      parts.push(h('div', {}, h('label', { for: 'f-max' }, tr('Răspunsuri permise per participant')),
        h('input', { id: 'f-max', type: 'number', min: '1', max: '10', value: draft.maxEntries, oninput: (e) => { draft.maxEntries = Number(e.target.value); } })));
    }
    if (t !== 'quiz') {
      parts.push(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: draft.showResults, onchange: (e) => { draft.showResults = e.target.checked; } }),
        tr('Publicul vede rezultatele după ce răspunde')));
    }
    parts.push(h('div', { class: 'row' },
      h('button', { type: 'submit', class: 'primary' }, tr(poll ? 'Salvează' : 'Creează')),
      poll ? null : h('button', { type: 'button', onclick: () => save(true) }, tr('Creează și pornește'))));
    fill(form, ...parts);
  };

  const uploadImage = async (id) => {
    const headers = { 'X-Lang': lang };
    if (key) headers['X-Admin-Key'] = key;
    const url = `/api/events/${encodeURIComponent(state.event.code)}/polls/${id}/image`;
    if (imageFile) {
      const res = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': imageFile.type }, body: imageFile });
      if (!res.ok) { toast((await res.json().catch(() => ({}))).error || tr('Ceva n-a mers. Încearcă din nou.'), true); return false; }
    } else if (removeImage && poll?.image) {
      await fetch(url, { method: 'DELETE', headers });
    }
    return true;
  };

  const save = async (start = false) => {
    if (draft.type === 'pin' && !imagePreview) return toast(tr('Alege întâi imaginea pe care participanții pun pinul.'), true);
    const payload = { ...draft, region: draft.type === 'pin' ? draft.region : undefined };
    let id = poll?.id;
    if (poll) {
      if (!await act('poll:update', { id: poll.id, poll: payload })) return;
    } else {
      const created = await act('poll:create', { poll: payload });
      if (!created) return;
      id = created.id;
    }
    if (!await uploadImage(id)) return;
    if (start) await act('poll:status', { id, status: 'live' });
    form.classList.add('hidden');
    toast(tr('Salvat.'));
  };
  form.onsubmit = (e) => { e.preventDefault(); save(false); };
  draw();
  form.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#f-q').focus();
}


// ---------- knowledge test (before / after) ----------
const TEST_EXAMPLE = lang === 'ro'
  ? `Ce înseamnă NIS2?
* O directivă UE privind securitatea cibernetică
- Un standard ISO
- O lege doar pentru bănci

Ce faci când primești un e-mail suspect?
- Dau clic pe link ca să verific
* Îl raportez echipei IT sau de securitate
- Îl șterg și nu spun nimănui`
  : `What is NIS2?
* An EU cybersecurity directive
- An ISO standard
- A law for banks only

What do you do with a suspicious e-mail?
- Click the link to check it
* Report it to the IT or security team
- Delete it and tell no one`;

function testImportForm() {
  const form = $('#test-import');
  const area = h('textarea', { id: 'test-area', rows: 7, placeholder: TEST_EXAMPLE, style: { fontFamily: 'ui-monospace, monospace', fontSize: '.85rem' } });
  fill(form, 
    h('label', { for: 'test-area' }, tr('Adaugă întrebări în test (marchează răspunsul corect cu „*”)')),
    area,
    h('div', { class: 'row' },
      h('button', { type: 'submit', class: 'primary sm' }, tr('Adaugă în test')),
      h('button', { type: 'button', class: 'sm ghost', onclick: () => { area.value = TEST_EXAMPLE; } }, tr('Pune exemplul'))));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const polls = parsePolls(area.value);
    if (!polls.length) return toast(tr('Lipește întrebările mai sus.'), true);
    const res = await act('test:import', { polls: polls.map((p) => ({ ...p, type: 'quiz' })) });
    if (!res) return;
    area.value = '';
    toast(res.ids.length === 1 ? tr('Am importat o întrebare.') : tr('Am importat {n} întrebări.', { n: res.ids.length }));
  };
}
testImportForm();

const pctText = (v) => (v === null || v === undefined ? '–' : `${v}%`);

function renderTest() {
  const tq = state.testQuestions;
  const round = state.event.settings.testRound;
  const r = state.test;
  const status = $('#test-status');
  status.className = `badge${round ? ' live' : ''}`;
  status.textContent = round === 'pre' ? tr('Test inițial deschis') : round === 'post' ? tr('Test final deschis') : tr('{n} întrebări', { n: tq.length });

  const roundBtn = (which, label) => {
    const open = round === which;
    return h('button', {
      type: 'button', class: open ? 'sm' : 'sm primary', disabled: !tq.length,
      onclick: () => act('event:update', { settings: { testRound: open ? null : which } }),
    }, open ? tr('■ Închide {label}', { label }) : tr('▶ Deschide {label}', { label }));
  };
  fill($('#test-controls'), 
    roundBtn('pre', tr('testul inițial')),
    roundBtn('post', tr('testul final')),
    h('button', { type: 'button', class: 'sm', disabled: !tq.length, onclick: () => act('event:update', { settings: { screen: 'test' } }) }, tr('Arată rezultatele pe ecran')));

  if (!tq.length) {
    fill($('#test-report'), h('p', { class: 'muted small', style: { margin: 0 } }, tr('Adaugă întâi întrebările testului mai jos.')));
  } else {
    const delta = r.average.pre !== null && r.average.post !== null ? r.average.post - r.average.pre : null;
    fill($('#test-report'), 
      h('div', { class: 'test-summary' },
        h('div', {}, h('div', { class: 'small muted' }, tr('Test inițial')), h('div', { class: 'big-num' }, pctText(r.average.pre)), h('div', { class: 'small muted' }, votersLabel(r.participants.pre))),
        h('div', { class: 'arrow' }, '→'),
        h('div', {}, h('div', { class: 'small muted' }, tr('Test final')), h('div', { class: 'big-num' }, pctText(r.average.post)), h('div', { class: 'small muted' }, votersLabel(r.participants.post))),
        delta !== null ? h('div', { class: `gain ${delta >= 0 ? 'up' : 'down'}` }, `${delta >= 0 ? '+' : ''}${delta}`, h('div', { class: 'small' }, tr('puncte procentuale'))) : null),
      r.matched.gain !== null ? h('p', { class: 'small', style: { margin: '.5rem 0' } },
        tr('Dintre cei {n} care au dat ambele teste: {up} au progresat, {same} au rămas la fel, {down} au scăzut.', { n: r.participants.both, up: r.matched.improved, same: r.matched.same, down: r.matched.worse })) : null,
      h('div', { class: 'bars' }, r.questions.map((q, i) => h('div', { class: 'test-q' },
        h('div', { class: 'small', style: { fontWeight: 600 } }, `${i + 1}. ${q.question}`),
        h('div', { class: 'bar-label small' }, h('span', { class: 'muted' }, tr('Înainte')), h('span', { class: 'n' }, pctText(q.pre))),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill pre', style: { width: `${q.pre || 0}%` } })),
        h('div', { class: 'bar-label small' }, h('span', { class: 'muted' }, tr('După')), h('span', { class: 'n' }, pctText(q.post))),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${q.post || 0}%` } }))))));
  }

  $('#test-questions-summary').textContent = tr('Întrebările testului ({n})', { n: tq.length });
  // Don't redraw under the organizer's cursor while they edit a question.
  if ($('#test-questions').contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return;
  fill($('#test-questions'), ...tq.map((q, i) => h('div', { class: 'poll-item' },
    editingTest === q.id ? testEditForm(q) : [
      h('div', { class: 'q' }, `${i + 1}. ${q.question}`),
      h('ul', { class: 'small', style: { margin: '.3rem 0 .4rem', paddingLeft: '1.2rem' } },
        q.options.map((o, j) => h('li', { style: q.correct.includes(j) ? { color: 'var(--ok)', fontWeight: 600 } : {} }, o, q.correct.includes(j) ? ' ✓' : ''))),
      h('div', { class: 'row' },
        h('button', { class: 'sm', type: 'button', onclick: () => { editingTest = q.id; renderTest(); $(`#test-edit-${q.id}`)?.focus(); } }, tr('Editează')),
        h('button', { class: 'sm ghost', type: 'button', disabled: i === 0, 'aria-label': tr('Mută sus'), onclick: () => act('poll:move', { id: q.id, direction: 'up' }) }, '↑'),
        h('button', { class: 'sm ghost', type: 'button', disabled: i === tq.length - 1, 'aria-label': tr('Mută jos'), onclick: () => act('poll:move', { id: q.id, direction: 'down' }) }, '↓'),
        h('button', { class: 'sm ghost danger', type: 'button', onclick: () => confirm(tr('Ștergi întrebarea din test și răspunsurile ei?')) && act('poll:delete', { id: q.id }) }, tr('Șterge'))),
    ])));
}

let editingTest = null;
function testEditForm(q) {
  const area = h('textarea', { id: `test-edit-${q.id}`, rows: Math.max(4, q.options.length + 2), style: { fontFamily: 'ui-monospace, monospace', fontSize: '.85rem' },
    value: toImportText([{ ...q, type: 'quiz' }]) });
  const form = h('form', { class: 'stack' },
    h('label', { for: `test-edit-${q.id}` }, tr('Întrebarea pe primul rând, apoi opțiunile; „*” marchează răspunsul corect.')),
    area,
    h('div', { class: 'row' },
      h('button', { type: 'submit', class: 'sm primary' }, tr('Salvează')),
      h('button', { type: 'button', class: 'sm ghost', onclick: () => { editingTest = null; renderTest(); } }, tr('Renunță'))));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const [p, extra] = parsePolls(area.value);
    if (!p || extra) return toast(tr('Scrie o singură întrebare, cu opțiunile ei.'), true);
    if (await act('poll:update', { id: q.id, poll: { ...p, type: 'quiz' } })) { editingTest = null; toast(tr('Salvat.')); renderTest(); }
  });
  return form;
}


// ---------- tabletop scenarios ----------
$('#scenario-example').addEventListener('click', async () => {
  const res = await fetch('/api/scenario-example', { headers: { 'X-Lang': lang } });
  $('#scenario-text').value = (await res.json()).text;
});
$('#scenario-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await act('scenario:create', { text: $('#scenario-text').value });
  if (!res) return;
  $('#scenario-text').value = '';
  $('#scenario-new').open = false;
  toast(tr('Scenariul a fost adăugat.'));
});

function renderScenario() {
  const sc = state.scenario;
  const status = $('#scenario-status');
  status.className = `badge${sc ? ' live' : ''}`;
  status.textContent = sc ? tr('Rulează') : tr('{n} scenarii', { n: state.scenarios.length });

  // the running scenario: the facilitator's console
  if (!sc) {
    fill($('#scenario-live'));
  } else {
    const s = sc.step;
    const total = s.options.reduce((a, o) => a + (o.count || 0), 0);
    const ended = sc.phase === 'end';
    fill($('#scenario-live'), h('div', { class: 'scenario-console' },
      h('div', { class: 'row between' },
        h('strong', {}, sc.title),
        h('span', { class: 'small muted' }, tr('Pasul {n} · {voters} voturi', { n: sc.path.length + 1, voters: sc.voters }))),
      h('h3', { style: { margin: '.4rem 0 .2rem' } }, ended ? `${s.outcome === 'good' ? '✅ ' : s.outcome === 'bad' ? '⛔ ' : ''}${s.title}` : s.title),
      s.text ? h('p', { class: 'small scenario-text' }, s.text) : null,
      !ended ? h('div', { class: 'stack', style: { gap: '.4rem' } }, s.options.map((o, i) => h('div', { class: `scenario-opt${o.good ? ' good' : ''}` },
        h('div', { class: 'row between' },
          h('span', {}, o.good ? '★ ' : '', o.label),
          h('span', { class: 'small muted' }, `${total ? Math.round((o.count / total) * 100) : 0}% · ${o.count}`)),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${total ? Math.round((o.count / total) * 100) : 0}%` } })),
        h('div', { class: 'row between small muted', style: { marginTop: '.2rem' } },
          h('span', {}, tr('→ {step}', { step: o.nextTitle })),
          h('button', { class: 'sm ghost', type: 'button', onclick: () => act('scenario:advance', { choice: i }) }, tr('Mergi pe ramura asta')))))) : null,
      h('div', { class: 'row', style: { marginTop: '.6rem' } },
        sc.phase === 'vote' ? h('button', { class: 'sm primary', type: 'button', onclick: () => act('scenario:reveal') }, tr('Dezvăluie voturile')) : null,
        !ended ? h('button', { class: sc.phase === 'reveal' ? 'sm primary' : 'sm', type: 'button', onclick: () => act('scenario:advance') }, tr('Continuă cu varianta votată')) : null,
        sc.path.length ? h('button', { class: 'sm', type: 'button', onclick: () => act('scenario:back') }, tr('↶ Înapoi un pas')) : null,
        h('button', { class: 'sm ghost danger', type: 'button', onclick: () => act('scenario:stop') }, ended ? tr('Închide scenariul') : tr('Oprește scenariul'))),
      sc.path.length ? h('ol', { class: 'scenario-path small' }, sc.path.map((p) => h('li', {},
        h('span', { class: 'muted' }, `${p.title}: `), p.choice, ' ', p.good ? '✓' : '⚠',
        h('span', { class: 'muted' }, p.chosenBy === 'facilitator' ? tr(' (aleasă de facilitator)') : tr(' ({share}% din sală)', { share: p.share }))))) : null));
  }

  fill($('#scenario-list'), state.scenarios.length ? state.scenarios.map((x) => h('div', { class: 'row between scenario-item' },
    h('div', { class: 'grow' }, h('strong', {}, x.title), h('div', { class: 'small muted' }, tr('{steps} pași · {endings} finaluri', x))),
    h('div', { class: 'row' },
      h('button', { class: 'sm primary', type: 'button', onclick: () => (!sc || confirm(tr('Pornești alt scenariu? Cel care rulează acum se oprește.'))) && act('scenario:start', { id: x.id }) }, sc?.id === x.id ? tr('↺ Reia de la început') : tr('▶ Pornește')),
      h('button', { class: 'sm ghost danger', type: 'button', onclick: () => confirm(tr('Ștergi scenariul „{title}”?', { title: x.title })) && act('scenario:delete', { id: x.id }) }, tr('Șterge'))))) : h('p', { class: 'muted small', style: { margin: 0 } }, tr('Niciun scenariu încă. Deschide „Scenariu nou” și pune exemplul ca să vezi formatul.')));

  const runs = state.scenarioRuns;
  fill($('#scenario-runs'), runs.length ? h('details', {},
    h('summary', {}, tr('Parcurgeri încheiate ({n})', { n: runs.length })),
    runs.map((r) => h('div', { class: 'small', style: { marginTop: '.4rem' } },
      h('strong', {}, r.title), ' · ',
      r.ending ? `${r.ending.outcome === 'good' ? '✅' : r.ending.outcome === 'bad' ? '⛔' : '🏁'} ${r.ending.title}` : tr('oprit înainte de final'),
      ' · ', tr('{good} din {n} decizii recomandate', { good: r.good, n: r.decisions.length })))) : null);
}


// ---------- client look ----------
const setBrand = (patch) => act('event:update', { settings: { brand: patch } });
$('#brand-color').addEventListener('change', (e) => setBrand({ color: e.target.value }));
$('#brand-color-reset').addEventListener('click', () => setBrand({ color: '' }));
$('#brand-bg').addEventListener('change', (e) => setBrand({ background: e.target.value }));
$('#brand-hide').addEventListener('change', (e) => setBrand({ hideProduct: e.target.checked }));
$('#logo-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 500 * 1024) return toast(tr('Logo-ul poate avea cel mult 500 KB.'), true);
  const headers = { 'Content-Type': file.type || 'application/octet-stream', 'X-Lang': lang };
  if (key) headers['X-Admin-Key'] = key;
  const res = await fetch(`/api/events/${encodeURIComponent(state.event.code)}/logo`, { method: 'POST', headers, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return toast(data.error || tr('Ceva n-a mers. Încearcă din nou.'), true);
  toast(tr('Logo încărcat.'));
});
$('#logo-remove').addEventListener('click', async () => {
  if (!confirm(tr('Ștergi logo-ul clientului?'))) return;
  const headers = { 'X-Lang': lang };
  if (key) headers['X-Admin-Key'] = key;
  const res = await fetch(`/api/events/${encodeURIComponent(state.event.code)}/logo`, { method: 'DELETE', headers });
  if (!res.ok) toast(tr('Ceva n-a mers. Încearcă din nou.'), true);
});
