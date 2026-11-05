import { $, h, connect, codeFromPath, renderResults, timeLeft, votersLabel, TYPE_LABELS, fill, applyBrand, pollImage } from './common.js';
import { t, translatePage, langSwitch } from './i18n.js';

translatePage();
$('#lang-slot').replaceWith(langSwitch());

const code = codeFromPath();
const joinUrl = `${location.host}/e/${code}`;
let state = null;
let skew = 0;
let timer;

$('#footer-url').textContent = t('Intră pe {url}', { url: joinUrl });

connect({
  code, role: 'present',
  onState: (s) => { state = s; skew = s.now - Date.now(); render(); },
  onError: (msg) => {
    fill($('#main'), );
    const err = $('#error');
    err.classList.remove('hidden');
    fill(err, h('div', { class: 'card empty' }, h('h2', {}, msg)));
  },
});

const toggleFullscreen = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
};
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return;
  toggleFullscreen();
});
// A button too, for touch screens, tablets and TVs without a keyboard. Hidden where the browser has no fullscreen API (iPhone).
const fsBtn = $('#fs-btn');
if (document.documentElement.requestFullscreen) fsBtn.addEventListener('click', toggleFullscreen);
else fsBtn.remove();

const qr = () => h('img', { src: `/qr/${code}.svg`, alt: t('Cod QR pentru {url}', { url: joinUrl }) });

function joinBox() {
  return h('aside', { class: 'card join-box stack' },
    h('img', { class: 'client-logo', alt: '', hidden: true }),
    h('div', { class: 'muted' }, t('Intră pe')),
    h('strong', {}, `${location.host}/e/`),
    h('div', { class: 'code' }, code),
    qr(),
    h('div', { class: 'muted small' }, votersLabel(state.online), ' ', t('online')));
}

function render() {
  clearInterval(timer);
  applyBrand(state.event);
  document.title = state.event.settings.brand?.hideProduct ? state.event.name : `${state.event.name} · CYBERGUARD Quizy`;
  $('#online').textContent = `${votersLabel(state.online)} ${t('online')}`;
  const screen = state.event.settings.screen;
  const main = $('#main');

  if (screen === 'join') {
    main.style.gridTemplateColumns = '1fr';
    fill(main, h('div', { class: 'join-full' },
      h('img', { class: 'client-logo', alt: '', hidden: true }),
      h('h1', {}, state.event.name),
      h('p', { class: 'muted', style: { fontSize: '1.5rem' } }, t('Intră pe {url} sau scanează codul', { url: `${location.host}/e/` })),
      h('div', { class: 'code join-box' }, h('span', { class: 'code' }, code)),
      h('div', { class: 'join-box' }, qr()),
      h('p', { class: 'muted' }, `${votersLabel(state.online)} ${t('online')}`)));
    applyBrand(state.event);
    return;
  }
  main.style.gridTemplateColumns = '';

  let content;
  if (screen === 'poll') content = pollView();
  else if (screen === 'qa') content = qaView();
  else if (screen === 'test') content = testView();
  else if (screen === 'scenario') content = scenarioView();
  else {
    // Rebuild the podium only when the scores move, so its entrance animation plays once.
    const key = JSON.stringify(state.leaderboard);
    if (key === lastBoard && main.querySelector('.podium-wrap')) return;
    lastBoard = key;
    content = leaderboardView();
  }
  if (screen !== 'leaderboard') lastBoard = '';
  fill(main, h('section', {}, content), joinBox());
  applyBrand(state.event);
}

function pollView() {
  const p = state.poll;
  if (!p) return h('div', { class: 'empty' }, h('h1', {}, t('Niciun sondaj încă')));
  const head = h('div', { class: 'row between', style: { marginBottom: '1rem' } },
    h('div', { class: 'row' },
      h('span', { class: `badge ${p.status === 'live' ? 'live' : 'closed'}` }, t(p.status === 'live' ? 'Live' : 'Închis')),
      h('span', { class: 'muted' }, TYPE_LABELS[p.type])),
    timerEl(p));
  const hideQuiz = p.type === 'quiz' && !p.revealed;
  let body;
  if (hideQuiz) {
    body = h('div', {},
      h('div', { class: 'bars' }, p.options.map((o, i) => h('div', { class: 'card', style: { marginBottom: '.6rem', fontSize: '1.5rem', boxShadow: 'none' } },
        `${String.fromCharCode(65 + i)}. ${o}`))),
      h('p', { class: 'muted', style: { fontSize: '1.3rem' } }, t('{n} au răspuns', { n: votersLabel(p.results.voters) })));
  } else {
    body = renderResults(p);
  }
  return h('div', {}, head, h('h1', {}, p.question), pollImage(p, 'poll-image big'), body);
}

function timerEl(p) {
  if (p.type !== 'quiz' || !p.timeLimit || p.status !== 'live' || p.revealed) return h('span');
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
    h('h1', {}, t('Întrebări din public')),
    top ? h('div', { class: 'card', style: { fontSize: '2rem', fontWeight: 700, borderColor: 'var(--primary)', marginBottom: '1.5rem' } },
      top.text, h('div', { class: 'muted', style: { fontSize: '1rem', fontWeight: 400, marginTop: '.5rem' } }, `${top.author || t('Anonim')} · ▲ ${top.votes}`),
      top.reply ? h('div', { class: 'reply', style: { fontSize: '1.3rem', fontWeight: 400 } }, h('strong', {}, t('Răspunsul organizatorului:')), ' ', top.reply) : null) : null,
    rest.length || top ? rest.map((q) => h('div', { class: 'question' },
      h('div', { class: 'upvote btn' }, h('span', {}, '▲'), h('strong', {}, q.votes)),
      h('div', { class: 'body' }, q.text, h('div', { class: 'meta' }, q.author || t('Anonim')))))
      : h('p', { class: 'muted', style: { fontSize: '1.4rem' } }, t('Trimite întrebările tale de pe telefon.')));
}

let lastBoard = '';

function leaderboardView() {
  const lb = state.leaderboard;
  if (!lb.length) {
    return h('div', {}, h('h1', {}, t('🏆 Clasament')),
      h('p', { class: 'muted', style: { fontSize: '1.4rem' } }, t('Clasamentul apare după primul quiz.')));
  }
  const name = (r) => r.name || t('Anonim');
  const flame = (r) => (r.streak >= 2 ? h('div', { class: 'flame' }, `🔥 ${r.streak}`) : null);
  // Podium order: 2nd, 1st, 3rd, so the winner stands in the middle.
  const steps = [lb[1], lb[0], lb[2]].map((r, i) => (r ? h('div', { class: `step step-${r.rank}`, style: { animationDelay: `${[0.4, 0.9, 0][i]}s` } },
    h('div', { class: 'who' }, h('div', { class: 'medal' }, ['🥇', '🥈', '🥉'][r.rank - 1]), h('div', { class: 'pname' }, name(r)), h('div', { class: 'ppts' }, r.score), flame(r)),
    h('div', { class: 'block' }, r.rank)) : h('div', { class: 'step empty' })));
  return h('div', { class: 'podium-wrap' },
    h('h1', {}, t('🏆 Clasament')),
    h('div', { class: 'podium' }, steps),
    lb.length > 3 ? h('ol', { class: 'leader rest', start: 4 }, lb.slice(3).map((r) => h('li', {}, h('span', {}, `${r.rank}. ${name(r)}`), h('span', { class: 'pts' }, r.streak >= 2 ? `🔥${r.streak} · ` : '', r.score)))) : null);
}

function scenarioView() {
  const sc = state.scenario;
  if (!sc) return h('div', { class: 'empty' }, h('h1', {}, t('Niciun scenariu nu rulează')));
  const s = sc.step;
  if (sc.phase === 'end') {
    const good = sc.path.filter((p) => p.good).length;
    return h('div', { class: 'scenario-stage' },
      h('div', { class: 'muted kicker' }, `${sc.title} · ${t('Final')}`),
      h('h1', { class: `outcome ${s.outcome || ''}` }, `${s.outcome === 'good' ? '✅ ' : s.outcome === 'bad' ? '⛔ ' : ''}${s.title}`),
      s.text ? h('p', { class: 'scenario-text big' }, s.text) : null,
      h('p', { class: 'muted' }, t('Sala a ales varianta recomandată în {good} din {n} decizii.', { good, n: sc.path.length })),
      h('ol', { class: 'scenario-path big' }, sc.path.map((p) => h('li', {},
        h('span', { class: 'muted' }, `${p.title}: `), p.choice, ' ', p.good ? '✓' : '⚠',
        h('span', { class: 'muted' }, p.chosenBy === 'facilitator' ? t(' (aleasă de facilitator)') : t(' ({share}% din sală)', { share: p.share }))))));
  }
  const open = sc.phase === 'reveal';
  const total = open ? s.options.reduce((a, o) => a + o.count, 0) : 0;
  const best = s.options.find((o) => o.good);
  return h('div', { class: 'scenario-stage' },
    h('div', { class: 'muted kicker' }, `${sc.title} · ${t('pasul {n}', { n: sc.path.length + 1 })}`),
    h('h1', {}, s.title),
    s.text ? h('p', { class: 'scenario-text big' }, s.text) : null,
    h('div', { class: 'bars' }, s.options.map((o, i) => (open
      ? h('div', { class: `bar${o.good ? ' correct' : ''}` },
        h('div', { class: 'bar-label' }, h('span', {}, `${String.fromCharCode(65 + i)}. ${o.label}`), h('span', { class: 'n' }, `${total ? Math.round((o.count / total) * 100) : 0}% · ${o.count}`)),
        h('div', { class: 'bar-track' }, h('div', { class: `bar-fill${o.good ? '' : ' pre'}`, style: { width: `${total ? Math.round((o.count / total) * 100) : 0}%` } })))
      : h('div', { class: 'card scenario-letter' }, `${String.fromCharCode(65 + i)}. ${o.label}`)))),
    open && best?.feedback ? h('div', { class: 'reply big' }, h('strong', {}, t('Varianta recomandată: ')), best.feedback) : null,
    !open ? h('p', { class: 'muted', style: { fontSize: '1.3rem' } }, t('{n} au votat', { n: votersLabel(sc.voters) })) : null);
}

function testView() {
  const r = state.test;
  if (!r || !r.total) return h('div', {}, h('h1', {}, t('Test înainte / după')), h('p', { class: 'muted' }, t('Testul nu are încă întrebări.')));
  const pct = (v) => (v === null || v === undefined ? '–' : `${v}%`);
  const running = r.round ? h('p', { class: 'muted', style: { fontSize: '1.4rem' } },
    t(r.round === 'pre' ? 'Testul inițial e deschis: {n} au răspuns până acum.' : 'Testul final e deschis: {n} au răspuns până acum.', { n: votersLabel(r.participants[r.round]) })) : null;
  const delta = r.average.pre !== null && r.average.post !== null ? r.average.post - r.average.pre : null;
  return h('div', {},
    h('h1', {}, t('Ce am învățat')),
    running,
    h('div', { class: 'test-summary big' },
      h('div', {}, h('div', { class: 'muted' }, t('Înainte')), h('div', { class: 'big-num' }, pct(r.average.pre))),
      h('div', { class: 'arrow' }, '→'),
      h('div', {}, h('div', { class: 'muted' }, t('După')), h('div', { class: 'big-num' }, pct(r.average.post))),
      delta !== null ? h('div', { class: `gain ${delta >= 0 ? 'up' : 'down'}` }, `${delta >= 0 ? '+' : ''}${delta}`, h('div', { class: 'small' }, t('puncte procentuale'))) : null),
    h('div', { class: 'bars test-bars' }, r.questions.slice(0, 8).map((q, i) => h('div', { class: 'test-q' },
      h('div', { class: 'bar-label' }, h('span', {}, `${i + 1}. ${q.question}`), h('span', { class: 'n' }, `${pct(q.pre)} → ${pct(q.post)}`)),
      h('div', { class: 'bar-track thin' }, h('div', { class: 'bar-fill pre', style: { width: `${q.pre || 0}%` } })),
      h('div', { class: 'bar-track thin' }, h('div', { class: 'bar-fill', style: { width: `${q.post || 0}%` } }))))));
}
