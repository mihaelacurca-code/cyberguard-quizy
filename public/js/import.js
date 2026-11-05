// Turns pasted text into poll definitions. Pure function, no DOM, so it is tested in Node too.
//
//   Who are you?                      ← question
//   - Public authority                ← option
//   - Vendor
//
//   Ce înseamnă NIS2? [30s]           ← "*" marks the correct option → quiz (optional time limit)
//   * Directivă UE
//   - Standard ISO
//
//   [multiplu] Ce teme vă interesează?
//   [nor] Un cuvânt despre eveniment
//   [nota 10] Cât de util a fost?
//   Ce ai învățat azi?                ← no options → free text

const TAGS = [
  [/^\[(nor|cloud|word ?cloud|cuvinte|words)\]\s*/i, (p) => { p.type = 'wordcloud'; }],
  [/^\[(text|liber|deschis|open)\]\s*/i, (p) => { p.type = 'open'; }],
  [/^\[(multiplu|multi|multiple)\]\s*/i, (p) => { p.multi = true; }],
  [/^\[(nota|notă|rating|evaluare|stele|stars|scale)(?:\s+(\d+))?\]\s*/i, (p, m) => { p.type = 'rating'; p.scale = Number(m[2]) || 5; }],
];

export function parsePolls(text) {
  const polls = [];
  let cur = null;
  const finish = () => {
    if (!cur) return;
    if (cur.options.length) {
      if (cur.correct.length) cur.type = 'quiz';
      else if (!cur.type || cur.type === 'open') cur.type = 'choice';
    } else if (!cur.type) {
      cur.type = 'open';
    }
    if (cur.type !== 'choice' && cur.type !== 'quiz') { delete cur.options; delete cur.correct; }
    if (cur.type === 'wordcloud') cur.maxEntries = 3;
    if (cur.type === 'open') cur.maxEntries = 1;
    if (cur.type === 'quiz') { delete cur.multi; cur.timeLimit ??= 0; } else delete cur.timeLimit;
    polls.push(cur);
    cur = null;
  };

  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { finish(); continue; }
    const opt = line.match(/^([-–•*])\s*(.+)$/);
    if (opt && cur) {
      if (opt[1] === '*') cur.correct.push(cur.options.length);
      cur.options.push(opt[2].trim());
      continue;
    }
    // A new non-option line after options starts the next question even without a blank line.
    // So does a line that opens with a [tag].
    if (cur && (cur.options.length || TAGS.some(([re]) => re.test(line)))) finish();
    if (cur) { cur.question += ` ${line}`; continue; }
    cur = { type: null, question: '', options: [], correct: [], multi: false, showResults: true };
    let q = line.replace(/^(\d+|[a-z])[.)]\s+/i, '');
    for (let changed = true; changed;) {
      changed = false;
      for (const [re, apply] of TAGS) {
        const m = q.match(re);
        if (m) { apply(cur, m); q = q.slice(m[0].length); changed = true; }
      }
    }
    const time = q.match(/\s*\[(\d+)\s*s(ec)?\]\s*$/i);
    if (time) { cur.timeLimit = Number(time[1]); q = q.slice(0, time.index); }
    cur.question = q.trim();
  }
  finish();
  return polls;
}
