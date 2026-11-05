import { $, h, connect, codeFromPath, renderResults, timeLeft, votersLabel, TYPE_LABELS } from './common.js';

const code = codeFromPath();
const joinUrl = `${location.host}/e/${code}`;
let state = null;
let skew = 0;
let timer;

$('#footer-url').textContent = `Intră pe ${joinUrl}`;

connect({
  code, role: 'present',
  onState: (s) => { state = s; skew = s.now - Date.now(); render(); },
  onError: (msg) => {
    $('#main').replaceChildren();
    const err = $('#error');
    err.classList.remove('hidden');
    err.replaceChildren(h('div', { class: 'card empty' }, h('h2', {}, msg)));
  },
});

document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'f') return;
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});

const qr = () => h('img', { src: `/qr/${code}.svg`, alt: `Cod QR pentru ${joinUrl}` });

function joinBox() {
  return h('aside', { class: 'card join-box stack' },
    h('div', { class: 'muted' }, 'Intră pe'),
    h('strong', {}, `${location.host}/e/`),
    h('div', { class: 'code' }, code),
    qr(),
    h('div', { class: 'muted small' }, votersLabel(state.online), ' online'));
}

function render() {
  clearInterval(timer);
  document.title = `${state.event.name} · Quizy`;
  $('#online').textContent = `${votersLabel(state.online)} online`;
  const screen = state.event.settings.screen;
  const main = $('#main');

  if (screen === 'join') {
    main.style.gridTemplateColumns = '1fr';
    main.replaceChildren(h('div', { class: 'join-full' },
      h('h1', {}, state.event.name),
      h('p', { class: 'muted', style: { fontSize: '1.5rem' } }, `Intră pe ${location.host}/e/ sau scanează codul`),
      h('div', { class: 'code join-box' }, h('span', { class: 'code' }, code)),
      h('div', { class: 'join-box' }, qr()),
      h('p', { class: 'muted' }, `${votersLabel(state.online)} online`)));
    return;
  }
  main.style.gridTemplateColumns = '';

  let content;
  if (screen === 'poll') content = pollView();
  else if (screen === 'qa') content = qaView();
  else content = leaderboardView();
  main.replaceChildren(h('section', {}, content), joinBox());
}

function pollView() {
  const p = state.poll;
  if (!p) return h('div', { class: 'empty' }, h('h1', {}, 'Niciun sondaj încă'));
  const head = h('div', { class: 'row between', style: { marginBottom: '1rem' } },
    h('div', { class: 'row' },
      h('span', { class: `badge ${p.status === 'live' ? 'live' : 'closed'}` }, p.status === 'live' ? 'Live' : 'Închis'),
      h('span', { class: 'muted' }, TYPE_LABELS[p.type])),
    timerEl(p));
  const hideQuiz = p.type === 'quiz' && !p.revealed;
  let body;
  if (hideQuiz) {
    body = h('div', {},
      h('div', { class: 'bars' }, p.options.map((o, i) => h('div', { class: 'card', style: { marginBottom: '.6rem', fontSize: '1.5rem', boxShadow: 'none' } },
        `${String.fromCharCode(65 + i)}. ${o}`))),
      h('p', { class: 'muted', style: { fontSize: '1.3rem' } }, `${votersLabel(p.results.voters)} au răspuns`));
  } else {
    body = renderResults(p);
  }
  return h('div', {}, head, h('h1', {}, p.question), body);
}

function timerEl(p) {
  if (p.type !== 'quiz' || !p.timeLimit || p.status !== 'live') return h('span');
  const el = h('span', { class: 'timer', style: { fontSize: '2.5rem' } });
  const tick = () => {
    const left = timeLeft(p, skew);
    el.textContent = `${left}s`;
    if (left === 0) clearInterval(timer);
  };
  tick();
  timer = setInterval(tick, 250);
  return el;
}

function qaView() {
  const qs = state.questions;
  const top = qs.find((q) => q.highlighted);
  const rest = qs.filter((q) => !q.highlighted).slice(0, 8);
  return h('div', {},
    h('h1', {}, 'Întrebări din public'),
    top ? h('div', { class: 'card', style: { fontSize: '2rem', fontWeight: 700, borderColor: 'var(--primary)', marginBottom: '1.5rem' } },
      top.text, h('div', { class: 'muted', style: { fontSize: '1rem', fontWeight: 400, marginTop: '.5rem' } }, `${top.author || 'Anonim'} · ▲ ${top.votes}`)) : null,
    rest.length || top ? rest.map((q) => h('div', { class: 'question' },
      h('div', { class: 'upvote btn' }, h('span', {}, '▲'), h('strong', {}, q.votes)),
      h('div', { class: 'body' }, q.text, h('div', { class: 'meta' }, q.author || 'Anonim'))))
      : h('p', { class: 'muted', style: { fontSize: '1.4rem' } }, 'Trimite întrebările tale de pe telefon.'));
}

function leaderboardView() {
  const lb = state.leaderboard;
  return h('div', {},
    h('h1', {}, '🏆 Clasament'),
    lb.length
      ? h('ol', { class: 'leader', style: { fontSize: '1.6rem' } }, lb.map((r) => h('li', {}, h('span', {}, `${r.rank}. ${r.name}`), h('span', { class: 'pts' }, r.score))))
      : h('p', { class: 'muted', style: { fontSize: '1.4rem' } }, 'Clasamentul apare după primul quiz.'));
}
