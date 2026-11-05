import { $, h, fill, storage, codeFromPath, TYPE_LABELS, pollImageUrl } from './common.js';
import { t, lang, plural, translatePage, langSwitch } from './i18n.js';

translatePage();
$('#lang-slot').replaceWith(langSwitch());

const code = codeFromPath();
const key = storage('quizy:events', []).find((e) => e.code === code)?.key;
$('#back').href = `/admin/${code}`;
$('#print').addEventListener('click', () => window.print());

const doc = $('#doc');
const fmtDate = (ms, withTime = false) => new Date(ms).toLocaleString(lang === 'ro' ? 'ro-RO' : 'en-GB',
  withTime ? { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long', year: 'numeric' });
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const pctText = (v) => (v === null || v === undefined ? '–' : `${v}%`);

const res = await fetch(`/api/events/${encodeURIComponent(code)}/report`, {
  headers: key ? { 'X-Admin-Key': key, 'X-Lang': lang } : { 'X-Lang': lang },
});
if (!res.ok) {
  const { error } = await res.json().catch(() => ({}));
  fill(doc, h('p', { class: 'error' }, error || t('Nu am putut încărca raportul.')),
    h('p', { class: 'error' }, t('Deschide raportul din pagina de administrare a evenimentului sau din panoul de administrare.')));
} else {
  render(await res.json());
}

function bar(label, value, total, { correct = false, valueText } = {}) {
  const p = pct(value, total);
  return h('div', { class: `bar${correct ? ' correct' : ''}` },
    h('span', { class: 'label' }, label, correct ? ' ✓' : ''),
    h('span', { class: 'val' }, valueText ?? `${p}% · ${value}`),
    h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${p}%` } })));
}

function pollBlock(p, i) {
  const r = p.results;
  const body = [];
  if (p.type === 'choice' || p.type === 'quiz') {
    const total = p.type === 'choice' && p.multi ? r.voters : r.counts.reduce((a, b) => a + b, 0);
    body.push(p.options.map((o, k) => bar(o, r.counts[k], total, { correct: p.type === 'quiz' && p.correct?.includes(k) })));
    if (p.type === 'quiz' && total) {
      const right = p.correct.reduce((s, k) => s + r.counts[k], 0);
      body.push(h('p', { class: 'more' }, t('{p}% au răspuns corect.', { p: pct(right, total) })));
    }
  } else if (p.type === 'rating') {
    const total = r.counts.reduce((a, b) => a + b, 0);
    body.push(h('p', {}, h('span', { class: 'avg' }, r.average ?? '–'), h('span', { class: 'n' }, t('medie, din {scale}', { scale: p.scale }))));
    body.push(r.counts.map((_, k) => k).reverse().map((k) => bar(`${k + 1} ★`, r.counts[k], total)));
  } else if (p.type === 'ranking') {
    body.push(r.ranking.map((row, k) => bar(`${k + 1}. ${p.options[row.option]}`, row.points, r.maxPoints, { correct: k === 0, valueText: t('loc mediu {avg}', { avg: row.average }) })));
  } else if (p.type === 'scale') {
    body.push(h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, t('Afirmație')), h('th', { class: 'num' }, t('Media')), ...Array.from({ length: p.scale }, (_, k) => h('th', { class: 'num' }, k + 1)))),
      h('tbody', {}, p.options.map((s, k) => h('tr', {},
        h('td', {}, s), h('td', { class: 'num' }, h('strong', {}, r.statements[k].average ?? '–')),
        ...r.statements[k].counts.map((n) => h('td', { class: 'num' }, n)))))));
  } else if (p.type === 'pin') {
    const board = h('div', { class: 'pin-board' }, h('img', { src: pollImageUrl(p, code), alt: '' }));
    for (const [x, y] of r.pins) board.append(h('span', { class: 'pin', style: { left: `${x * 100}%`, top: `${y * 100}%` } }));
    if (p.region) board.append(h('span', { class: 'pin-region', style: { left: `${p.region.x * 100}%`, top: `${p.region.y * 100}%`, width: `${p.region.r * 200}%` } }));
    body.push(board);
    if (p.region && r.voters) body.push(h('p', { class: 'more' }, t('{p}% au nimerit zona corectă', { p: pct(r.inside, r.voters) })));
  } else if (p.type === 'wordcloud') {
    const top = r.words.slice(0, 15);
    const max = top[0]?.count || 0;
    body.push(top.length ? top.map((w) => bar(w.word, w.count, max, { valueText: String(w.count) })) : h('p', { class: 'more' }, t('Fără răspunsuri.')));
    if (r.words.length > 15) body.push(h('p', { class: 'more' }, t('și încă {n} cuvinte', { n: r.words.length - 15 })));
  } else {
    const shown = r.answers.slice(0, 40);
    body.push(shown.length
      ? h('ul', { class: 'answers' }, shown.map((a) => h('li', {}, a.text, a.name ? h('div', { class: 'who' }, a.name) : null)))
      : h('p', { class: 'more' }, t('Fără răspunsuri.')));
    if (r.answers.length > 40) body.push(h('p', { class: 'more' }, t('și încă {n} răspunsuri (lista completă e în exportul CSV)', { n: r.answers.length - 40 })));
  }
  return h('div', { class: 'poll' },
    h('div', { class: 'head' },
      h('span', { class: 'tag' }, `${i + 1} · ${TYPE_LABELS[p.type]}`),
      h('span', { class: 'n' }, plural(r.voters, 'participant'), p.type === 'wordcloud' || p.type === 'open' ? ` · ${plural(r.responses, 'answer')}` : '')),
    h('h3', {}, p.question),
    p.image && p.type !== 'pin' ? h('img', { class: 'qimg', src: pollImageUrl(p, code), alt: '' }) : null,
    body);
}

function render(d) {
  const ev = d.event;
  const brand = ev.settings?.brand || {};
  // The client's color marks headings and bars; very light colors are darkened for white paper.
  if (/^#[0-9a-f]{6}$/i.test(brand.color || '')) {
    const rgb = [1, 3, 5].map((i) => parseInt(brand.color.slice(i, i + 2), 16));
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    const ink = lum > 0.6 ? rgb.map((c) => Math.round(c * 0.55)) : rgb;
    document.documentElement.style.setProperty('--accent', `rgb(${ink.join(' ')})`);
    document.documentElement.style.setProperty('--accent-2', brand.color);
  }
  document.title = `${t('Raport')} – ${ev.name}`;
  const s = d.stats;
  const test = d.test && d.test.total && (d.test.participants.pre || d.test.participants.post) ? d.test : null;
  const gain = test && test.average.pre !== null && test.average.post !== null ? test.average.post - test.average.pre : null;
  const statusLabel = { visible: t('publicată'), answered: t('răspunsă'), archived: t('arhivată') };

  fill(doc,
    h('header', { class: 'cover' },
      h('img', { src: brand.logo ? `/brand/${encodeURIComponent(ev.code)}/logo?v=${brand.logo}` : '/img/cyberguard-mark.svg', alt: '', class: brand.logo ? 'client' : '' }),
      h('div', {},
        h('div', { class: 'kicker' }, brand.hideProduct ? t('Raport de eveniment') : t('Raport de eveniment · CYBERGUARD Quizy')),
        h('h1', {}, ev.name)),
      h('div', { class: 'meta' },
        h('span', {}, t('Data: '), h('strong', {}, fmtDate(ev.createdAt))),
        h('span', {}, t('Cod: '), h('strong', {}, ev.code)),
        ev.issuer ? h('span', {}, t('Organizator: '), h('strong', {}, ev.issuer)) : null)),

    h('div', { class: 'kpis' },
      kpi(s.participants, t('participanți')),
      kpi(s.polls, t('sondaje și quiz-uri')),
      kpi(s.responses, t('răspunsuri')),
      kpi(s.questions, t('întrebări din public')),
      test ? kpi(gain !== null ? `${gain >= 0 ? '+' : ''}${gain}` : '–', t('progres la test (puncte %)'), gain > 0) : null,
      s.certificates ? kpi(s.certificates, t('certificate emise')) : null),

    test ? h('section', { class: 'block' },
      h('h2', {}, t('Test înainte / după'), h('span', { class: 'count' }, t('{n} întrebări', { n: test.total }))),
      h('div', { class: 'test-head' },
        h('div', {}, h('div', { class: 'lab' }, t('Înainte')), h('div', { class: 'num' }, pctText(test.average.pre)), h('div', { class: 'lab' }, plural(test.participants.pre, 'participant'))),
        h('div', { class: 'arrow' }, '→'),
        h('div', {}, h('div', { class: 'lab' }, t('După')), h('div', { class: 'num' }, pctText(test.average.post)), h('div', { class: 'lab' }, plural(test.participants.post, 'participant'))),
        gain !== null ? h('div', { class: `gain${gain < 0 ? ' down' : ''}` }, `${gain >= 0 ? '+' : ''}${gain}`) : null),
      test.matched.gain !== null ? h('p', { class: 'lead' }, t('Dintre cei {n} care au dat ambele teste: {up} au progresat, {same} au rămas la fel, {down} au scăzut.', { n: test.participants.both, up: test.matched.improved, same: test.matched.same, down: test.matched.worse })) : null,
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, t('Întrebare')), h('th', { class: 'num' }, t('Înainte')), h('th', { class: 'num' }, t('După')), h('th', { class: 'num' }, t('Diferență')))),
        h('tbody', {}, test.questions.map((q, i) => h('tr', {},
          h('td', {}, `${i + 1}. ${q.question}`),
          h('td', { class: 'num' }, pctText(q.pre)),
          h('td', { class: 'num' }, pctText(q.post)),
          h('td', { class: 'num' }, q.pre !== null && q.post !== null ? `${q.post - q.pre >= 0 ? '+' : ''}${q.post - q.pre}` : '–')))))) : null,

    d.scenarioRuns?.length ? h('section', { class: 'block' },
      h('h2', {}, t('Scenarii decizionale'), h('span', { class: 'count' }, t('{n} parcurgeri', { n: d.scenarioRuns.length }))),
      d.scenarioRuns.map((r) => h('div', { class: 'poll' },
        h('div', { class: 'head' },
          h('span', { class: 'tag' }, r.title),
          h('span', { class: 'n' }, t('{good} din {n} decizii recomandate', { good: r.good, n: r.decisions.length }))),
        h('h3', {}, r.ending ? `${r.ending.outcome === 'good' ? '✅ ' : r.ending.outcome === 'bad' ? '⛔ ' : ''}${r.ending.title}` : t('Oprit înainte de final')),
        h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, t('Pas')), h('th', {}, t('Decizia sălii')), h('th', { class: 'num' }, t('Voturi')), h('th', {}, ''))),
          h('tbody', {}, r.decisions.map((p) => h('tr', {},
            h('td', {}, p.step),
            h('td', {}, p.choice, p.chosenBy === 'facilitator' ? h('div', { class: 'status' }, t('aleasă de facilitator')) : null),
            h('td', { class: 'num' }, p.voters ? `${p.share}% · ${p.voters}` : '–'),
            h('td', { class: 'num' }, p.good ? '✓' : '⚠')))))))) : null,

    d.polls.length ? h('section', { class: 'block' },
      h('h2', {}, t('Sondaje și quiz-uri'), h('span', { class: 'count' }, String(d.polls.length))),
      d.polls.map(pollBlock)) : null,

    d.leaderboard.length ? h('section', { class: 'block' },
      h('h2', {}, t('Clasament quiz')),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, t('Nume')), h('th', { class: 'num' }, t('Răspunsuri corecte')), h('th', { class: 'num' }, t('Cea mai lungă serie')), h('th', { class: 'num' }, t('Puncte')))),
        h('tbody', {}, d.leaderboard.map((r) => h('tr', {},
          h('td', {}, r.rank), h('td', {}, r.name || t('Anonim')), h('td', { class: 'num' }, r.correct),
          h('td', { class: 'num' }, r.best >= 2 ? `🔥 ${r.best}` : r.best), h('td', { class: 'num' }, r.score)))))) : null,

    d.questions.length ? h('section', { class: 'block' },
      h('h2', {}, t('Întrebări din public'), h('span', { class: 'count' }, String(d.questions.length))),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', { class: 'num' }, '▲'), h('th', {}, t('Întrebare')), h('th', {}, t('Autor')), h('th', {}, t('Stare')))),
        h('tbody', {}, d.questions.map((q) => h('tr', {},
          h('td', { class: 'num' }, q.votes),
          h('td', {}, q.text, q.reply ? h('div', { class: 'reply' }, t('Răspuns: {text}', { text: q.reply })) : null),
          h('td', {}, q.author || t('Anonim')),
          h('td', { class: 'status' }, statusLabel[q.status] || q.status))))))) : null,

    d.certificates.length ? h('section', { class: 'block' },
      h('h2', {}, t('Certificate emise'), h('span', { class: 'count' }, String(d.certificates.length))),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, t('Nume')), h('th', { class: 'num' }, t('Scor test final')), h('th', {}, t('Cod de verificare')), h('th', {}, t('Data')))),
        h('tbody', {}, d.certificates.map((c) => h('tr', {},
          h('td', {}, c.name), h('td', { class: 'num' }, c.score !== null ? `${c.score}%` : '–'),
          h('td', {}, h('code', {}, c.id)), h('td', {}, fmtDate(c.issuedAt))))))) : null,

    !d.polls.length && !d.questions.length && !test ? h('p', { class: 'loading' }, t('Evenimentul nu are încă activitate de raportat.')) : null,

    h('footer', { class: 'foot' },
      h('span', {}, t('Generat la {date}', { date: fmtDate(d.generatedAt, true) })),
      h('span', {}, brand.hideProduct ? location.host : `${location.host} · CYBERGUARD Quizy`)));
}

function kpi(value, label, good = false) {
  return h('div', { class: `kpi${good ? ' good' : ''}` }, h('div', { class: 'v' }, value), h('div', { class: 'l' }, label));
}
