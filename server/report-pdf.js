// The post-event report as a real PDF file, drawn on the server, so the organizer downloads
// it with one click instead of going through the browser's print dialog. Same content as the
// report page (public/js/report.js), laid out for A4.
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

const FONT = fileURLToPath(new URL('./fonts/Inter-Regular.otf', import.meta.url));
const FONT_BOLD = fileURLToPath(new URL('./fonts/Inter-SemiBold.otf', import.meta.url));

const C = { ink: '#0e1a33', muted: '#5a6a86', line: '#e2ded3', soft: '#f6f4ee', accent: '#1b2f6e', accent2: '#e6a400', ok: '#148a5c', pre: '#9aaac4', bad: '#c0323f' };

const EN = {
  'Raport de eveniment': 'Event report',
  'Raport de eveniment · CYBERGUARD Quizy': 'Event report · CYBERGUARD Quizy',
  'Data': 'Date', 'Cod': 'Code', 'Organizator': 'Organizer',
  'participanți': 'participants', 'sondaje și quiz-uri': 'polls and quizzes', 'răspunsuri': 'answers',
  'întrebări din public': 'audience questions', 'progres la test (puncte %)': 'test progress (% points)', 'certificate emise': 'certificates issued',
  'Test înainte / după': 'Before / after test', '{n} întrebări': '{n} questions',
  'Înainte': 'Before', 'După': 'After', 'Diferență': 'Change', 'Întrebare': 'Question',
  'puncte procentuale': 'percentage points',
  'Dintre cei {n} care au dat ambele teste: {up} au progresat, {same} au rămas la fel, {down} au scăzut.': 'Of the {n} who took both tests: {up} improved, {same} stayed the same, {down} dropped.',
  'Scenarii decizionale': 'Decision scenarios', '{n} parcurgeri': '{n} runs',
  '{good} din {n} decizii recomandate': '{good} of {n} recommended decisions',
  'Final bun': 'Good ending', 'Final rău': 'Bad ending', 'Final': 'Ending', 'Oprit înainte de final': 'Stopped before the end',
  'Pas': 'Step', 'Decizia sălii': 'Room decision', 'Voturi': 'Votes', 'Recomandată': 'Recommended', 'da': 'yes', 'nu': 'no',
  'aleasă de facilitator': 'chosen by the facilitator',
  'Sondaje și quiz-uri': 'Polls and quizzes',
  'corect': 'correct', '{p}% au răspuns corect.': '{p}% answered correctly.',
  'medie, din {scale}': 'average, out of {scale}', 'loc mediu {avg}': 'average place {avg}',
  'Afirmație': 'Statement', 'Media': 'Average',
  '{p}% au nimerit zona corectă': '{p}% hit the correct area', '{n} pinuri': '{n} pins',
  'Fără răspunsuri.': 'No answers.', 'și încă {n} cuvinte': 'and {n} more words',
  'și încă {n} răspunsuri (lista completă e în exportul CSV)': 'and {n} more answers (the full list is in the CSV export)',
  'Clasament quiz': 'Quiz leaderboard', 'Nume': 'Name', 'Răspunsuri corecte': 'Correct answers', 'Cea mai lungă serie': 'Longest streak', 'Puncte': 'Points', 'Anonim': 'Anonymous',
  'Întrebări din public': 'Audience questions', 'Autor': 'Author', 'Stare': 'Status', 'Răspuns: {text}': 'Answer: {text}',
  'publicată': 'published', 'răspunsă': 'answered', 'arhivată': 'archived',
  'Certificate emise': 'Certificates issued', 'Scor test final': 'Final test score', 'Cod de verificare': 'Verification code',
  'Evenimentul nu are încă activitate de raportat.': 'The event has no activity to report yet.',
  'Generat la {date}': 'Generated on {date}', 'Pagina {n} din {total}': 'Page {n} of {total}',
  'Imaginea nu poate fi inclusă în PDF (format WebP).': 'The image cannot be included in the PDF (WebP format).',
  Raport: 'Report',
};

const TYPES = {
  ro: { choice: 'Alegere multiplă', quiz: 'Quiz', wordcloud: 'Word cloud', open: 'Text liber', rating: 'Evaluare', ranking: 'Clasament de opțiuni', scale: 'Scală cu afirmații', pin: 'Pin pe imagine' },
  en: { choice: 'Multiple choice', quiz: 'Quiz', wordcloud: 'Word cloud', open: 'Open text', rating: 'Rating', ranking: 'Option ranking', scale: 'Statement scale', pin: 'Pin on image' },
};

// Raster formats pdfkit can embed.
const embeddable = (img) => img && (img.mime === 'image/png' || img.mime === 'image/jpeg');

export function reportPdf(data, { lang = 'ro', host = '', images = {} } = {}) {
  const en = lang === 'en';
  const t = (s, vars = {}) => (en ? EN[s] ?? s : s).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  const plural = (n, one, many) => {
    if (en) return `${n} ${n === 1 ? one[1] : many[1]}`;
    if (n === 1) return `1 ${one[0]}`;
    const r = n % 100;
    return `${n}${n !== 0 && (r === 0 || r >= 20) ? ' de' : ''} ${many[0]}`;
  };
  const participants = (n) => plural(n, ['participant', 'participant'], ['participanți', 'participants']);
  const answers = (n) => plural(n, ['răspuns', 'answer'], ['răspunsuri', 'answers']);
  const fmtDate = (ms, withTime = false) => new Date(ms).toLocaleString(en ? 'en-GB' : 'ro-RO',
    withTime ? { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' } : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' });
  const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
  const pctText = (v) => (v === null || v === undefined ? '–' : `${v}%`);
  const signed = (v) => `${v >= 0 ? '+' : ''}${v}`;

  const ev = data.event;
  const brand = ev.settings?.brand || {};
  // The client's color marks headings and bars; very light colors are darkened for white paper.
  const colors = { ...C };
  if (/^#[0-9a-f]{6}$/i.test(brand.color || '')) {
    const rgb = [1, 3, 5].map((i) => parseInt(brand.color.slice(i, i + 2), 16));
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    const ink = lum > 0.6 ? rgb.map((c) => Math.round(c * 0.55)) : rgb;
    colors.accent = `#${ink.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    colors.accent2 = brand.color;
  }

  const doc = new PDFDocument({
    size: 'A4', margins: { top: 50, bottom: 60, left: 48, right: 48 }, bufferPages: true,
    info: { Title: `${t('Raport')} – ${ev.name}`, Author: ev.issuer || 'CYBERGUARD Quizy', Creator: 'CYBERGUARD Quizy' },
  });
  doc.registerFont('R', FONT);
  doc.registerFont('B', FONT_BOLD);
  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensure = (h) => { if (doc.y + h > bottom()) doc.addPage(); };
  const write = (str, { font = 'R', size = 10, color = C.ink, x = L, width = W, align = 'left', gap = 0 } = {}) => {
    doc.font(font).fontSize(size).fillColor(color).text(String(str), x, doc.y, { width, align });
    if (gap) doc.y += gap;
  };
  const heightOf = (str, font, size, width) => doc.font(font).fontSize(size).heightOfString(String(str), { width });

  // ---------- cover ----------
  const logo = images.logo;
  let top = doc.y;
  let textX = L;
  if (embeddable(logo)) {
    try {
      doc.image(Buffer.from(logo.data), L, top, { fit: [110, 54], valign: 'center' });
      textX = L + 124;
    } catch { /* unreadable image: skip it */ }
  }
  doc.y = top;
  write(brand.hideProduct ? t('Raport de eveniment') : t('Raport de eveniment · CYBERGUARD Quizy'), { font: 'B', size: 8.5, color: colors.accent, x: textX, width: W - (textX - L) });
  doc.moveDown(0.15);
  write(ev.name, { font: 'B', size: 20, x: textX, width: W - (textX - L) });
  doc.y = Math.max(doc.y, top + 58) + 6;
  const meta = [[t('Data'), fmtDate(ev.createdAt)], [t('Cod'), ev.code]];
  if (ev.issuer) meta.push([t('Organizator'), ev.issuer]);
  let mx = L;
  const my = doc.y;
  for (const [k, v] of meta) {
    doc.font('R').fontSize(9).fillColor(C.muted).text(`${k}: `, mx, my, { continued: true }).font('B').fillColor(C.ink).text(v);
    mx += doc.font('R').fontSize(9).widthOfString(`${k}: `) + doc.font('B').widthOfString(v) + 22;
  }
  doc.y = my + 18;
  doc.rect(L, doc.y, W, 2.5).fill(colors.accent2);
  doc.y += 14;

  // ---------- key figures ----------
  const s = data.stats;
  const test = data.test && data.test.total && (data.test.participants.pre || data.test.participants.post) ? data.test : null;
  const gain = test && test.average.pre !== null && test.average.post !== null ? test.average.post - test.average.pre : null;
  const kpis = [[s.participants, t('participanți')], [s.polls, t('sondaje și quiz-uri')], [s.responses, t('răspunsuri')], [s.questions, t('întrebări din public')]];
  if (test) kpis.push([gain !== null ? signed(gain) : '–', t('progres la test (puncte %)'), gain > 0]);
  if (s.certificates) kpis.push([s.certificates, t('certificate emise')]);
  const perRow = 3;
  const gap = 8;
  const kw = (W - gap * (perRow - 1)) / perRow;
  for (let i = 0; i < kpis.length; i += perRow) {
    const y = doc.y;
    kpis.slice(i, i + perRow).forEach(([v, label, good], j) => {
      const x = L + j * (kw + gap);
      doc.roundedRect(x, y, kw, 50, 6).fill(C.soft);
      doc.font('B').fontSize(18).fillColor(good ? C.ok : C.ink).text(String(v), x + 10, y + 8, { width: kw - 20 });
      doc.font('R').fontSize(8.5).fillColor(C.muted).text(label, x + 10, y + 32, { width: kw - 20 });
    });
    doc.y = y + 50 + gap;
  }

  // ---------- building blocks ----------
  // A section title never sits alone at the bottom of a page: it needs room for some content.
  const section = (title, count) => {
    ensure(110);
    doc.y += 14;
    const y = doc.y;
    doc.font('B').fontSize(13.5).fillColor(C.ink).text(title, L, y, { width: W - 90 });
    if (count !== undefined) doc.font('B').fontSize(9).fillColor(C.muted).text(String(count), L + W - 90, y + 3, { width: 90, align: 'right' });
    doc.y = Math.max(doc.y, y + 18) + 3;
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.7).strokeColor(C.line).stroke();
    doc.y += 9;
  };

  const bar = (label, valueText, frac, { correct = false, color } = {}) => {
    const lw = W - 95;
    const h = heightOf(label, correct ? 'B' : 'R', 9.5, lw);
    ensure(h + 14);
    const y = doc.y;
    doc.font(correct ? 'B' : 'R').fontSize(9.5).fillColor(correct ? C.ok : C.ink).text(label, L, y, { width: lw });
    doc.font('R').fontSize(8.5).fillColor(C.muted).text(valueText, L + W - 90, y + 1, { width: 90, align: 'right' });
    const ty = y + h + 2;
    doc.roundedRect(L, ty, W, 6, 3).fill(C.soft);
    const fw = Math.max(0, Math.min(1, frac)) * W;
    if (fw > 0.5) doc.roundedRect(L, ty, Math.max(fw, 6), 6, 3).fill(color || (correct ? C.ok : colors.accent2));
    doc.y = ty + 12;
  };

  const note = (str, color = C.muted) => { ensure(16); write(str, { size: 8.5, color, gap: 4 }); };

  // Simple table: columns [{ label, width (fraction), align }], rows of cell strings (or { text, sub, bold, color }).
  const table = (columns, rows) => {
    const widths = columns.map((c) => c.width * W);
    const pad = 4;
    const header = (first) => {
      ensure(22 + (first || 0));
      const y = doc.y;
      let x = L;
      columns.forEach((c, i) => {
        doc.font('B').fontSize(7.5).fillColor(C.muted).text(c.label.toUpperCase(), x + pad, y + 4, { width: widths[i] - pad * 2, align: c.align || 'left' });
        x += widths[i];
      });
      doc.y = y + 16;
      doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.7).strokeColor(C.line).stroke();
      doc.y += 2;
    };
    const rowHeight = (row) => {
      const cells = row.map((c) => (typeof c === 'object' && c !== null ? c : { text: c ?? '' }));
      return Math.max(...cells.map((c, i) => heightOf(c.text, c.bold ? 'B' : 'R', 9, widths[i] - pad * 2)
        + (c.sub ? heightOf(c.sub, 'R', 8, widths[i] - pad * 2) + 2 : 0))) + 8;
    };
    header(rows.length ? rowHeight(rows[0]) : 0);
    for (const row of rows) {
      const cells = row.map((c) => (typeof c === 'object' && c !== null ? c : { text: c ?? '' }));
      const h = Math.max(...cells.map((c, i) => heightOf(c.text, c.bold ? 'B' : 'R', 9, widths[i] - pad * 2)
        + (c.sub ? heightOf(c.sub, 'R', 8, widths[i] - pad * 2) + 2 : 0))) + 8;
      if (doc.y + h > bottom()) { doc.addPage(); header(); }
      const y = doc.y;
      let x = L;
      cells.forEach((c, i) => {
        doc.font(c.bold ? 'B' : 'R').fontSize(9).fillColor(c.color || C.ink).text(String(c.text), x + pad, y + 4, { width: widths[i] - pad * 2, align: columns[i].align || 'left' });
        if (c.sub) doc.font('R').fontSize(8).fillColor(c.subColor || C.muted).text(String(c.sub), x + pad, doc.y + 2, { width: widths[i] - pad * 2, align: columns[i].align || 'left' });
        x += widths[i];
      });
      doc.y = y + h;
      doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.5).strokeColor(C.line).stroke();
    }
    doc.y += 4;
  };

  const image = (img, maxH) => {
    if (!img) return null;
    if (!embeddable(img)) { note(t('Imaginea nu poate fi inclusă în PDF (format WebP).')); return null; }
    try {
      const opened = doc.openImage(Buffer.from(img.data));
      const scale = Math.min(W * 0.75 / opened.width, maxH / opened.height, 1.5);
      const w = opened.width * scale;
      const h = opened.height * scale;
      ensure(h + 8);
      const box = { x: L, y: doc.y, w, h };
      doc.image(opened, L, doc.y, { width: w, height: h });
      doc.rect(L, box.y, w, h).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.y = box.y + h + 8;
      return box;
    } catch { return null; }
  };

  // ---------- test before / after ----------
  if (test) {
    section(t('Test înainte / după'), t('{n} întrebări', { n: test.total }));
    ensure(50);
    const y = doc.y;
    const col = (x, label, value, sub) => {
      doc.font('R').fontSize(8.5).fillColor(C.muted).text(label, x, y);
      doc.font('B').fontSize(22).fillColor(C.ink).text(value, x, y + 11);
      doc.font('R').fontSize(8.5).fillColor(C.muted).text(sub, x, y + 38);
    };
    col(L, t('Înainte'), pctText(test.average.pre), participants(test.participants.pre));
    doc.font('R').fontSize(18).fillColor(C.muted).text('→', L + 100, y + 14);
    col(L + 135, t('După'), pctText(test.average.post), participants(test.participants.post));
    if (gain !== null) {
      doc.roundedRect(L + 270, y + 6, 120, 40, 6).fill(gain < 0 ? '#fde8ea' : '#e3f5ec');
      doc.font('B').fontSize(18).fillColor(gain < 0 ? C.bad : C.ok).text(signed(gain), L + 280, y + 10, { width: 100 });
      doc.font('R').fontSize(7.5).fillColor(gain < 0 ? C.bad : C.ok).text(t('puncte procentuale'), L + 280, y + 32, { width: 100 });
    }
    doc.y = y + 58;
    if (test.matched.gain !== null) note(t('Dintre cei {n} care au dat ambele teste: {up} au progresat, {same} au rămas la fel, {down} au scăzut.', { n: test.participants.both, up: test.matched.improved, same: test.matched.same, down: test.matched.worse }));
    table(
      [{ label: t('Întrebare'), width: 0.58 }, { label: t('Înainte'), width: 0.14, align: 'right' }, { label: t('După'), width: 0.14, align: 'right' }, { label: t('Diferență'), width: 0.14, align: 'right' }],
      test.questions.map((q, i) => [`${i + 1}. ${q.question}`, pctText(q.pre), pctText(q.post),
        q.pre !== null && q.post !== null ? { text: signed(q.post - q.pre), bold: true, color: q.post - q.pre < 0 ? C.bad : C.ok } : '–']),
    );
  }

  // ---------- scenarios ----------
  if (data.scenarioRuns?.length) {
    section(t('Scenarii decizionale'), t('{n} parcurgeri', { n: data.scenarioRuns.length }));
    for (const r of data.scenarioRuns) {
      ensure(60);
      write(`${r.title} · ${t('{good} din {n} decizii recomandate', { good: r.good, n: r.decisions.length })}`, { font: 'B', size: 8.5, color: colors.accent });
      const end = r.ending ? `${r.ending.outcome === 'good' ? `${t('Final bun')}: ` : r.ending.outcome === 'bad' ? `${t('Final rău')}: ` : `${t('Final')}: `}${r.ending.title}` : t('Oprit înainte de final');
      write(end, { font: 'B', size: 11, gap: 4 });
      table(
        [{ label: t('Pas'), width: 0.3 }, { label: t('Decizia sălii'), width: 0.42 }, { label: t('Voturi'), width: 0.13, align: 'right' }, { label: t('Recomandată'), width: 0.15, align: 'right' }],
        r.decisions.map((p) => [p.step, { text: p.choice, sub: p.chosenBy === 'facilitator' ? t('aleasă de facilitator') : null },
          p.voters ? `${p.share}% · ${p.voters}` : '–', { text: p.good ? t('da') : t('nu'), color: p.good ? C.ok : C.bad, bold: true }]),
      );
      doc.y += 6;
    }
  }

  // ---------- polls ----------
  if (data.polls.length) {
    section(t('Sondaje și quiz-uri'), data.polls.length);
    data.polls.forEach((p, i) => {
      const r = p.results;
      // keep the question with the start of its answers (and with its image)
      ensure(p.image ? 250 : 90);
      const y = doc.y;
      doc.font('B').fontSize(8).fillColor(colors.accent).text(`${i + 1} · ${TYPES[en ? 'en' : 'ro'][p.type].toUpperCase()}`, L, y, { width: W - 150 });
      doc.font('R').fontSize(8.5).fillColor(C.muted).text(`${participants(r.voters)}${p.type === 'wordcloud' || p.type === 'open' ? ` · ${answers(r.responses)}` : ''}`, L + W - 150, y, { width: 150, align: 'right' });
      doc.y = y + 12;
      write(p.question, { font: 'B', size: 11, gap: 5 });
      if (p.image && p.type !== 'pin') image(images.polls?.[p.id], 150);

      if (p.type === 'choice' || p.type === 'quiz') {
        const total = p.type === 'choice' && p.multi ? r.voters : r.counts.reduce((a, b) => a + b, 0);
        p.options.forEach((o, k) => {
          const correct = p.type === 'quiz' && p.correct?.includes(k);
          bar(correct ? `${o}  (${t('corect')})` : o, `${pct(r.counts[k], total)}% · ${r.counts[k]}`, total ? r.counts[k] / total : 0, { correct });
        });
        if (p.type === 'quiz' && total) note(t('{p}% au răspuns corect.', { p: pct(p.correct.reduce((sum, k) => sum + r.counts[k], 0), total) }));
      } else if (p.type === 'rating') {
        const total = r.counts.reduce((a, b) => a + b, 0);
        ensure(30);
        const yy = doc.y;
        doc.font('B').fontSize(20).fillColor(colors.accent).text(String(r.average ?? '–'), L, yy);
        doc.font('R').fontSize(9).fillColor(C.muted).text(t('medie, din {scale}', { scale: p.scale }), L + 50, yy + 8);
        doc.y = yy + 30;
        for (let k = r.counts.length - 1; k >= 0; k--) bar(`${k + 1} / ${p.scale}`, `${pct(r.counts[k], total)}% · ${r.counts[k]}`, total ? r.counts[k] / total : 0);
      } else if (p.type === 'ranking') {
        r.ranking.forEach((row, k) => bar(`${k + 1}. ${p.options[row.option]}`, t('loc mediu {avg}', { avg: row.average ?? '–' }), r.maxPoints ? row.points / r.maxPoints : 0, { correct: k === 0 && r.voters > 0 }));
      } else if (p.type === 'scale') {
        const w = 0.5 / (p.scale + 1);
        table(
          [{ label: t('Afirmație'), width: 0.5 }, { label: t('Media'), width: w, align: 'right' }, ...Array.from({ length: p.scale }, (_, k) => ({ label: String(k + 1), width: w, align: 'right' }))],
          p.options.map((st, k) => [st, { text: String(r.statements[k].average ?? '–'), bold: true }, ...r.statements[k].counts.map(String)]),
        );
      } else if (p.type === 'pin') {
        const box = image(images.polls?.[p.id], 220);
        if (box) {
          if (p.region) {
            doc.circle(box.x + p.region.x * box.w, box.y + p.region.y * box.h, p.region.r * box.w).lineWidth(1.5).dash(3, { space: 2 }).strokeColor(C.ok).stroke().undash();
          }
          for (const [x, yy] of r.pins) doc.circle(box.x + x * box.w, box.y + yy * box.h, 3).fillOpacity(0.8).fillAndStroke(colors.accent, '#ffffff').fillOpacity(1);
        }
        note(p.region && r.voters ? `${t('{n} pinuri', { n: r.pins.length })} · ${t('{p}% au nimerit zona corectă', { p: pct(r.inside, r.voters) })}` : t('{n} pinuri', { n: r.pins.length }));
      } else if (p.type === 'wordcloud') {
        const top10 = r.words.slice(0, 15);
        const max = top10[0]?.count || 0;
        if (!top10.length) note(t('Fără răspunsuri.'));
        top10.forEach((w) => bar(w.word, String(w.count), max ? w.count / max : 0));
        if (r.words.length > 15) note(t('și încă {n} cuvinte', { n: r.words.length - 15 }));
      } else {
        const shown = r.answers.slice(0, 40);
        if (!shown.length) note(t('Fără răspunsuri.'));
        for (const a of shown) {
          const h = heightOf(a.text, 'R', 9.5, W - 14) + (a.name ? 11 : 0) + 6;
          ensure(h);
          const yy = doc.y;
          doc.rect(L, yy, 2, h - 4).fill(colors.accent2);
          doc.font('R').fontSize(9.5).fillColor(C.ink).text(a.text, L + 10, yy, { width: W - 14 });
          if (a.name) doc.font('R').fontSize(8).fillColor(C.muted).text(a.name, L + 10, doc.y + 1, { width: W - 14 });
          doc.y = yy + h;
        }
        if (r.answers.length > 40) note(t('și încă {n} răspunsuri (lista completă e în exportul CSV)', { n: r.answers.length - 40 }));
      }
      doc.y += 4;
      if (i < data.polls.length - 1) {
        ensure(10);
        doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.5).strokeColor(C.line).stroke();
        doc.y += 10;
      }
    });
  }

  // ---------- leaderboard ----------
  if (data.leaderboard.length) {
    section(t('Clasament quiz'));
    table(
      [{ label: '#', width: 0.07 }, { label: t('Nume'), width: 0.41 }, { label: t('Răspunsuri corecte'), width: 0.18, align: 'right' }, { label: t('Cea mai lungă serie'), width: 0.18, align: 'right' }, { label: t('Puncte'), width: 0.16, align: 'right' }],
      data.leaderboard.map((r) => [String(r.rank), r.name || t('Anonim'), String(r.correct), String(r.best), { text: String(r.score), bold: true }]),
    );
  }

  // ---------- audience questions ----------
  if (data.questions.length) {
    const status = { visible: t('publicată'), answered: t('răspunsă'), archived: t('arhivată') };
    section(t('Întrebări din public'), data.questions.length);
    table(
      [{ label: t('Voturi'), width: 0.1, align: 'right' }, { label: t('Întrebare'), width: 0.56 }, { label: t('Autor'), width: 0.2 }, { label: t('Stare'), width: 0.14 }],
      data.questions.map((q) => [String(q.votes), { text: q.text, sub: q.reply ? t('Răspuns: {text}', { text: q.reply }) : null, subColor: colors.accent }, q.author || t('Anonim'), status[q.status] || q.status]),
    );
  }

  // ---------- certificates ----------
  if (data.certificates.length) {
    section(t('Certificate emise'), data.certificates.length);
    table(
      [{ label: t('Nume'), width: 0.4 }, { label: t('Scor test final'), width: 0.17, align: 'right' }, { label: t('Cod de verificare'), width: 0.22 }, { label: t('Data'), width: 0.21 }],
      data.certificates.map((c) => [c.name, c.score !== null ? `${c.score}%` : '–', c.id, fmtDate(c.issuedAt)]),
    );
  }

  if (!data.polls.length && !data.questions.length && !test) note(t('Evenimentul nu are încă activitate de raportat.'));

  // ---------- footer on every page ----------
  const range = doc.bufferedPageRange();
  const footLeft = t('Generat la {date}', { date: fmtDate(data.generatedAt, true) });
  const footMid = brand.hideProduct ? host : `${host} · CYBERGUARD Quizy`;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - 38;
    doc.page.margins.bottom = 0;
    doc.moveTo(L, y - 6).lineTo(L + W, y - 6).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.font('R').fontSize(7.5).fillColor(C.muted);
    doc.text(footLeft, L, y, { width: W / 2, lineBreak: false });
    doc.text(`${footMid} · ${t('Pagina {n} din {total}', { n: i + 1, total: range.count })}`, L + W / 2, y, { width: W / 2, align: 'right', lineBreak: false });
  }
  doc.end();
  return doc;
}
