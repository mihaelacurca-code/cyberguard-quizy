import { $, h, toast, storage, store, connect, codeFromPath, renderResults, timeLeft, fill, applyBrand } from './common.js';
import { t, translatePage, langSwitch } from './i18n.js';
import { downloadCertificate } from './certificate.js';

translatePage();
$('#lang-slot').replaceWith(langSwitch());

const code = codeFromPath();
let state = null;
let me = { votes: {}, upvotes: [], score: null };
let tab = 'poll';
let sort = 'top';
let skew = 0;
let pollKey = '';
let revealedSeen = new Set();

const name = () => storage('quizy:name', '');

function renderName() {
  $('#name-btn').textContent = name() ? `${name()} ✎` : t('Adaugă numele ✎');
  $('#ask-as').textContent = name() ? t('Trimiți ca {name}', { name: name() }) : t('Trimiți anonim');
}
$('#name-btn').addEventListener('click', () => {
  const next = prompt(t('Numele tău (opțional, apare la quiz și la întrebări):'), name());
  if (next === null) return;
  store('quizy:name', next.trim().slice(0, 40));
  renderName();
});
renderName();

const socket = connect({
  code,
  role: 'audience',
  onJoin: (res) => { me = res.me; },
  onState: (s) => {
    state = s;
    skew = s.now - Date.now();
    render();
  },
  onError: (msg) => {
    $('#app').classList.add('hidden');
    const err = $('#error');
    err.classList.remove('hidden');
    fill(err, h('h2', {}, msg), h('a', { class: 'btn', href: '/' }, t('Înapoi la pagina principală')));
  },
});

// ---------- tabs ----------
for (const b of document.querySelectorAll('#tabs [data-tab]')) {
  b.addEventListener('click', () => { tab = b.dataset.tab; render(); });
}
for (const b of document.querySelectorAll('[data-sort]')) {
  b.addEventListener('click', () => {
    sort = b.dataset.sort;
    document.querySelectorAll('[data-sort]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    renderQuestions();
  });
}

function render() {
  if (!state) return;
  $('#app').classList.remove('hidden');
  applyBrand(state.event);
  document.title = state.event.settings.brand?.hideProduct ? state.event.name : `${state.event.name} · CYBERGUARD Quizy`;
  $('#event-name').textContent = `${state.event.name} · ${state.event.code}`;
  const qa = state.event.settings.qaEnabled;
  $('#tabs').classList.toggle('hidden', !qa);
  if (!qa) tab = 'poll';
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $('#tab-poll').classList.toggle('hidden', tab !== 'poll');
  $('#tab-qa').classList.toggle('hidden', tab !== 'qa');
  $('#qa-count').textContent = state.questions.filter((q) => q.status === 'visible').length || '';
  $('#ask').classList.toggle('hidden', state.event.settings.closed);

  const p = state.poll;
  if (p?.type === 'quiz' && p.revealed && !revealedSeen.has(p.id)) {
    revealedSeen.add(p.id);
    socket.call('me').then((r) => { me = r.me; pollKey = ''; renderPoll(); }).catch(() => {});
  }
  // When a test round closes, fetch this participant's score for it.
  const round = state.event.settings.testRound || null;
  if (round !== lastRound) {
    lastRound = round;
    socket.call('me').then((r) => { me = r.me; testKey = ''; renderTest(); renderCert(); }).catch(() => {});
  }
  renderScenario();
  renderTest();
  renderLeaderboard();
  renderPoll();
  renderQuestions();
  renderCert();
}

let lastRound;
let testKey = '';
let scenarioStep;

// ---------- tabletop scenario ----------
function renderScenario() {
  const box = $('#scenario');
  const sc = state.scenario;
  if (!sc) { box.classList.add('hidden'); scenarioStep = undefined; return; }
  box.classList.remove('hidden');
  const stepKey = `${sc.run}:${sc.step.key}`;
  // A new step starts with no vote of ours (the join snapshot is already current).
  if (scenarioStep !== undefined && scenarioStep !== stepKey) me.scenarioChoice = null;
  scenarioStep = stepKey;
  const s = sc.step;

  if (sc.phase === 'end') {
    const good = sc.path.filter((p) => p.good).length;
    fill(box,
      h('span', { class: `badge ${s.outcome === 'bad' ? 'pending' : 'live'}` }, t('Final')),
      h('h2', { style: { marginTop: '.6rem' } }, `${s.outcome === 'good' ? '✅ ' : s.outcome === 'bad' ? '⛔ ' : ''}${s.title}`),
      s.text ? h('p', { class: 'scenario-text' }, s.text) : null,
      h('p', { class: 'small muted' }, t('Sala a ales varianta recomandată în {good} din {n} decizii.', { good, n: sc.path.length })),
      h('ol', { class: 'scenario-path small' }, sc.path.map((p) => h('li', {}, h('span', { class: 'muted' }, `${p.title}: `), p.choice, ' ', p.good ? '✓' : '⚠'))));
    return;
  }

  const open = sc.phase === 'reveal';
  const total = open ? s.options.reduce((a, o) => a + o.count, 0) : 0;
  const mine = me.scenarioChoice;
  fill(box,
    h('div', { class: 'row between' },
      h('span', { class: 'badge live' }, t('Scenariu · pasul {n}', { n: sc.path.length + 1 })),
      h('span', { class: 'small muted' }, sc.title)),
    h('h2', { style: { marginTop: '.6rem' } }, s.title),
    s.text ? h('p', { class: 'scenario-text' }, s.text) : null,
    h('p', { class: 'small muted' }, open ? t('Voturile sălii:') : t('Ce faceți? Votul se poate schimba până la dezvăluire.')),
    s.options.map((o, i) => h('div', { class: 'scenario-choice' },
      h('button', {
        class: `option${open && o.good ? ' correct' : ''}`, type: 'button', 'aria-pressed': String(mine === i),
        disabled: open || state.event.settings.closed,
        onclick: async () => {
          try {
            me = (await socket.call('scenario:vote', { choice: i })).me;
            renderScenario();
          } catch (err) { toast(err.message, true); }
        },
      }, open && o.good ? '★ ' : '', o.label),
      open ? h('div', { class: 'bar-track', style: { margin: '.3rem 0 0' } }, h('div', { class: `bar-fill${o.good ? '' : ' pre'}`, style: { width: `${total ? Math.round((o.count / total) * 100) : 0}%` } })) : null,
      open ? h('div', { class: 'small muted', style: { marginTop: '.2rem' } }, `${total ? Math.round((o.count / total) * 100) : 0}% · ${o.count}`, mine === i ? t(' · votul tău') : '') : null,
      open && o.feedback && (o.good || mine === i) ? h('div', { class: 'reply' }, o.feedback) : null)));
}

// ---------- knowledge test ----------
function renderTest() {
  const box = $('#test');
  const test = state.test;
  const scores = me.testScore || {};
  if (!test) {
    testKey = '';
    if (!scores.pre && !scores.post) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const line = (label, s) => (s ? h('div', { class: 'score-line' }, h('span', {}, label), h('strong', {}, `${s.percent}%`), h('span', { class: 'muted small' }, `${s.correct}/${s.total}`)) : null);
    const gain = scores.pre && scores.post ? scores.post.percent - scores.pre.percent : null;
    fill(box, h('h2', {}, t('Rezultatele tale la test')),
      line(t('Test inițial'), scores.pre),
      line(t('Test final'), scores.post),
      gain !== null ? h('p', { class: gain > 0 ? 'gain-note up' : 'gain-note' }, gain > 0 ? t('Ai progresat cu {n} puncte procentuale. 🎉', { n: gain }) : gain === 0 ? t('Același scor ca la început.') : t('Scor mai mic decât la început.')) : null);
    return;
  }
  const answers = (me.test && me.test[test.round]) || {};
  const key = JSON.stringify([test.round, test.questions.map((q) => q.id), answers]);
  box.classList.remove('hidden');
  if (key === testKey) return;
  testKey = key;
  const done = test.questions.filter((q) => answers[q.id] !== undefined).length;
  const total = test.questions.length;
  fill(box, 
    h('div', { class: 'row between' },
      h('span', { class: 'badge live' }, t(test.round === 'pre' ? 'Test inițial' : 'Test final')),
      h('span', { class: 'small muted' }, t('{done} din {total} răspunsuri', { done, total }))),
    h('div', { class: 'bar-track', style: { margin: '.6rem 0 1rem' } }, h('div', { class: 'bar-fill', style: { width: `${Math.round((done / total) * 100)}%` } })),
    done === total
      ? h('p', { class: 'muted' }, t('Gata! Ai răspuns la toate întrebările. Scorul apare după ce organizatorul închide testul.'))
      : h('p', { class: 'muted small' }, t('Răspunde în ritmul tău. Fiecare întrebare are un singur răspuns, iar alegerea nu se mai poate schimba.')),
    test.questions.map((q, n) => h('div', { class: 'test-question' },
      h('h3', {}, `${n + 1}. ${q.question}`),
      q.options.map((o, i) => h('button', {
        class: 'option', type: 'button', 'aria-pressed': String(answers[q.id] === i), disabled: answers[q.id] !== undefined || state.event.settings.closed,
        onclick: async (e) => {
          e.currentTarget.disabled = true;
          try {
            me = (await socket.call('vote', { pollId: q.id, value: [i], name: name() })).me;
            renderTest();
          } catch (err) { toast(err.message, true); e.currentTarget.disabled = false; }
        },
      }, o)))));
}

// ---------- certificate ----------
function renderCert() {
  const box = $('#cert');
  if (!state.event.settings.certEnabled) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  if (box.dataset.key === String(me.certificate)) return;
  box.dataset.key = String(me.certificate);
  const btn = h('button', { class: 'primary', type: 'button' }, t(me.certificate ? 'Descarcă din nou certificatul' : 'Obține certificatul'));
  btn.addEventListener('click', async () => {
    let full = name();
    if (!me.certificate && full.trim().length < 3) {
      const typed = prompt(t('Numele complet, așa cum apare pe certificat:'), full);
      if (typed === null) return;
      full = typed.trim().slice(0, 40);
      store('quizy:name', full);
      renderName();
    }
    btn.disabled = true;
    try {
      const { certificate } = await socket.call('certificate', { name: full });
      me.certificate = certificate.id;
      await downloadCertificate(certificate);
      box.dataset.key = '';
      renderCert();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  });
  fill(box, 
    h('h2', {}, t('🎓 Certificat de participare')),
    h('p', { class: 'muted small' }, me.certificate
      ? t('Certificatul tău a fost emis. Îl poți descărca oricând din nou.')
      : t('Descarcă un certificat PDF cu numele tău. Numele nu se mai poate schimba după emitere.')),
    btn);
}

// ---------- poll ----------
function renderPoll() {
  const box = $('#poll');
  const p = state.poll;
  const mine = p ? me.votes[p.id] || [] : [];
  const key = JSON.stringify([p?.id, p?.status, p?.revealed, p?.showResults, mine, state.event.settings.closed]);
  if (key === pollKey) {
    // Only the numbers moved; keep whatever the participant is typing.
    const res = box.querySelector('[data-results]');
    if (res && p) fill(res, renderResults(p));
    return;
  }
  pollKey = key;

  if (!p) {
    fill(box, h('div', { class: 'empty' },
      h('h2', {}, t(state.event.settings.closed ? 'Evenimentul s-a încheiat' : 'Niciun sondaj activ acum')),
      h('p', {}, t(state.event.settings.closed ? 'Mulțumim pentru participare!' : 'Pagina se actualizează singură când începe următorul.'))));
    return;
  }

  const answered = mine.length > 0;
  const parts = [h('div', { class: 'row between' }, h('span', { class: 'badge live' }, t('Live')), timerEl(p))];
  parts.push(h('h2', { style: { marginTop: '.75rem' } }, p.question));

  if (p.type === 'choice') parts.push(choiceForm(p, mine));
  if (p.type === 'quiz') parts.push(quizView(p, mine));
  if (p.type === 'rating') parts.push(ratingForm(p, mine));
  if (p.type === 'wordcloud' || p.type === 'open') parts.push(textForm(p, mine));

  const showResults = p.results && (answered || p.type === 'quiz' || state.event.settings.closed);
  if (showResults && p.type !== 'quiz') {
    parts.push(h('hr', { style: { border: 0, borderTop: '1px solid var(--border)', margin: '1rem 0' } }));
    parts.push(h('h3', {}, t('Rezultate')));
    parts.push(h('div', { 'data-results': '' }, renderResults(p)));
  } else if (answered && p.type !== 'quiz') {
    parts.push(h('p', { class: 'muted', style: { marginTop: '1rem' } }, t('Răspuns trimis. Rezultatele apar pe ecran.')));
  }
  fill(box, ...parts);
}

let timerInterval;
function timerEl(p) {
  clearInterval(timerInterval);
  if (!p.timeLimit || p.status !== 'live' || p.revealed) return h('span');
  const el = h('span', { class: 'timer' });
  const tick = () => {
    const left = timeLeft(p, skew);
    el.textContent = `⏱ ${left}s`;
    if (left === 0) { clearInterval(timerInterval); pollKey = ''; renderPoll(); }
  };
  tick();
  timerInterval = setInterval(tick, 250);
  return el;
}

async function send(p, value, btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await socket.call('vote', { pollId: p.id, value, name: name() });
    me = res.me;
    pollKey = '';
    renderPoll();
  } catch (e) {
    toast(e.message, true);
    if (btn) btn.disabled = false;
  }
}

function choiceForm(p, mine) {
  const picked = new Set(mine);
  const list = h('div', { style: { marginTop: '1rem' } });
  const submit = h('button', { class: 'primary big', type: 'button', style: { marginTop: '1rem', width: '100%', justifyContent: 'center' } },
    t(mine.length ? 'Schimbă răspunsul' : 'Trimite'));
  const sync = () => list.querySelectorAll('.option').forEach((b, i) => b.setAttribute('aria-pressed', String(picked.has(i))));
  p.options.forEach((opt, i) => list.append(h('button', {
    class: 'option', type: 'button', 'aria-pressed': String(picked.has(i)),
    onclick: () => {
      if (state.event.settings.closed) return;
      if (p.multi) { picked.has(i) ? picked.delete(i) : picked.add(i); sync(); return; }
      picked.clear(); picked.add(i); sync();
      send(p, [i]);
    },
  }, opt)));
  if (!p.multi) return h('div', {}, list, h('p', { class: 'muted small', style: { marginTop: '.5rem' } }, t('Atinge o opțiune pentru a vota. Poți schimba răspunsul cât timp sondajul e deschis.')));
  submit.addEventListener('click', () => {
    if (!picked.size) return toast(t('Alege cel puțin o opțiune.'), true);
    send(p, [...picked], submit);
  });
  return h('div', {}, h('p', { class: 'muted small' }, t('Poți alege mai multe opțiuni.')), list, submit);
}

function quizView(p, mine) {
  const pick = mine[0];
  const answered = pick !== undefined;
  const expired = p.timeLimit && timeLeft(p, skew) === 0;
  const list = h('div', { style: { marginTop: '1rem' } }, p.options.map((opt, i) => {
    let cls = 'option';
    if (p.revealed && p.correct.includes(i)) cls += ' correct';
    else if (p.revealed && pick === i) cls += ' wrong';
    return h('button', {
      class: cls, type: 'button', 'aria-pressed': String(pick === i),
      disabled: answered || p.revealed || expired || state.event.settings.closed,
      onclick: (e) => send(p, [i], e.currentTarget),
    }, opt);
  }));
  let note;
  if (p.revealed) {
    const ok = answered && p.correct.includes(pick);
    note = h('div', { class: 'card', style: { marginTop: '1rem', background: ok ? 'var(--ok-soft)' : 'var(--danger-soft)', boxShadow: 'none' } },
      h('strong', {}, t(!answered ? 'Nu ai răspuns la această întrebare.' : ok ? 'Corect! 🎉' : 'Greșit.')),
      me.score ? h('div', { class: 'small' }, t('Locul {rank} din {of} · {score} puncte', me.score)) : null,
      ok && me.score?.streak >= 2 ? h('div', { class: 'streak' }, t('🔥 {n} răspunsuri corecte la rând · +{bonus} bonus', { n: me.score.streak, bonus: Math.min(me.score.streak - 1, 5) * 100 })) : null);
  } else if (answered) {
    note = h('p', { class: 'muted', style: { marginTop: '1rem' } }, t('Răspuns înregistrat. Așteaptă dezvăluirea răspunsului corect.'));
  } else if (expired) {
    note = h('p', { class: 'muted', style: { marginTop: '1rem' } }, t('Timpul a expirat.'));
  } else {
    note = h('p', { class: 'muted small', style: { marginTop: '.5rem' } }, t('Ai un singur răspuns. Cu cât răspunzi mai repede, cu atât primești mai multe puncte.'));
  }
  return h('div', {}, list, note, p.revealed && p.results ? h('div', { style: { marginTop: '1rem' }, 'data-results': '' }, renderResults(p)) : null);
}

function ratingForm(p, mine) {
  const current = mine[0];
  return h('div', { style: { marginTop: '1rem' } },
    h('div', { class: 'stars' }, Array.from({ length: p.scale }, (_, i) => h('button', {
      type: 'button', 'aria-pressed': String(current === i + 1), disabled: state.event.settings.closed,
      'aria-label': t('Nota {n}', { n: i + 1 }), onclick: (e) => send(p, [i + 1], e.currentTarget),
    }, `${i + 1}`))),
    h('p', { class: 'muted small', style: { marginTop: '.5rem' } }, t('1 = cel mai puțin, {scale} = cel mai mult', { scale: p.scale })));
}

function textForm(p, mine) {
  const left = p.maxEntries - mine.length;
  const wc = p.type === 'wordcloud';
  const sent = mine.length ? h('ul', { class: 'answers', style: { marginTop: '1rem' } }, mine.map((m) => h('li', {}, m))) : null;
  if (left <= 0 || state.event.settings.closed) {
    return h('div', {}, sent, h('p', { class: 'muted', style: { marginTop: '.5rem' } }, t(wc ? 'Mulțumim! Ai trimis toate cuvintele.' : 'Mulțumim pentru răspuns!')));
  }
  const input = wc
    ? h('input', { type: 'text', maxlength: '40', placeholder: t('Un cuvânt sau o expresie scurtă'), required: true })
    : h('textarea', { maxlength: '500', placeholder: t('Răspunsul tău…'), required: true });
  const btn = h('button', { class: 'primary', type: 'submit' }, t('Trimite'));
  const form = h('form', { class: 'stack', style: { marginTop: '1rem' } },
    input,
    h('div', { class: 'row between' }, h('span', { class: 'muted small' }, p.maxEntries > 1 ? t('Mai poți trimite {n}', { n: left }) : ''), btn));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    send(p, [input.value], btn);
  });
  return h('div', {}, sent, form);
}

function renderLeaderboard() {
  const box = $('#leaderboard');
  const lb = state.leaderboard;
  box.classList.toggle('hidden', !lb);
  if (!lb) return;
  fill(box, h('h2', {}, t('🏆 Clasament')),
    lb.length ? h('ol', { class: 'leader' }, lb.map((r) => h('li', {}, h('span', {}, `${r.rank}. ${r.name || t('Anonim')}`), h('span', { class: 'pts' }, r.streak >= 2 ? `🔥${r.streak} · ` : '', r.score))))
      : h('p', { class: 'muted' }, t('Încă nu există punctaje.')),
    me.score ? h('p', { class: 'small', style: { marginTop: '.5rem' } }, t('Tu: locul {rank} din {of} · {score} puncte', me.score), me.score.streak >= 2 ? ` · 🔥${me.score.streak}` : '') : null);
}

// ---------- Q&A ----------
$('#ask').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const res = await socket.call('ask', { text: $('#ask-text').value, name: name() });
    $('#ask-text').value = '';
    toast(t(res.status === 'pending' ? 'Întrebarea a fost trimisă moderatorului.' : 'Întrebarea a fost publicată.'));
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

function renderQuestions() {
  if (!state) return;
  const box = $('#questions');
  const list = [...state.questions].sort(sort === 'new'
    ? (a, b) => b.at - a.at
    : (a, b) => (b.highlighted - a.highlighted) || (a.status === 'answered') - (b.status === 'answered') || (b.votes - a.votes) || (b.at - a.at));
  if (!list.length) return fill(box, h('p', { class: 'empty' }, t('Încă nu există întrebări. Fii primul!')));
  const up = new Set(me.upvotes);
  fill(box, ...list.map((q) => h('div', { class: `question${q.highlighted ? ' highlighted' : ''}${q.status === 'answered' ? ' answered' : ''}` },
    h('button', {
      class: 'upvote', type: 'button', 'aria-pressed': String(up.has(q.id)), disabled: q.status !== 'visible',
      'aria-label': t('Votează întrebarea'),
      onclick: async () => {
        try { me = (await socket.call('upvote', { questionId: q.id })).me; renderQuestions(); } catch (e) { toast(e.message, true); }
      },
    }, h('span', {}, '▲'), h('strong', {}, q.votes)),
    h('div', { class: 'body' }, q.text,
      h('div', { class: 'meta' }, q.author || t('Anonim'), q.highlighted ? t(' · pe ecran acum') : '', q.status === 'answered' ? t(' · răspuns') : ''),
      q.reply ? h('div', { class: 'reply' }, h('strong', {}, t('Răspunsul organizatorului:')), ' ', q.reply) : null))));
}
