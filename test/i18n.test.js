import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { toEnglish } from '../server/i18n.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Every single-quoted literal passed to t()/tr()/btn() in the browser code, including both
// branches of a ternary inside the call.
function translatedLiterals(src) {
  const out = [];
  const re = /\b(?:t|tr|btn)\(/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    let quote = null;
    let buf = '';
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (quote) {
        if (c === '\\') { buf += src[i + 1]; i += 2; continue; }
        if (c === quote) { if (quote === "'") out.push(buf); quote = null; buf = ''; } else buf += c;
      } else if (c === "'" || c === '`') quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === '{' && src.slice(i, i + 2) !== '{}') {
        // skip the vars object: its keys and values are not user text
        let d = 1; i++;
        while (i < src.length && d > 0) { if (src[i] === '{') d++; if (src[i] === '}') d--; i++; }
        continue;
      }
      i++;
    }
  }
  return out;
}

test('every interface text has an English version', async () => {
  globalThis.document = { documentElement: {}, querySelectorAll: () => [], body: { dataset: {} } };
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'en' }, configurable: true });
  globalThis.localStorage = { getItem: () => 'en', setItem() {} };
  const { t } = await import('../public/js/i18n.js');

  const missing = new Set();
  const ignore = new Set(['sm primary', 'sm', 'approve', 'archive', 'highlight', 'answer', 'restore', 'delete', 'Live', 'Quiz', 'Word cloud', 'participant', 'answer', 'Export CSV', 'online', 'Q&A', '● {n} online', 'closed', 'quiz', 'pending', 'live', 'pre', 'good', 'bad', 'end', 'reveal', '→ {step}']);
  for (const f of readdirSync(new URL('../public/js/', import.meta.url))) {
    for (const s of translatedLiterals(read(`public/js/${f}`))) {
      if (!ignore.has(s) && t(s) === s) missing.add(`${f}: ${s}`);
    }
  }
  for (const f of ['index.html', 'event.html', 'admin.html', 'present.html', 'panel.html', 'verify.html', 'report.html']) {
    const html = read(`public/${f}`);
    for (const m of html.matchAll(/<(\w+)[^>]*\sdata-i18n(?:\s[^>]*)?>([^<]*)</g)) {
      const s = m[2].trim().replace(/&amp;/g, '&');
      if (s && !ignore.has(s) && t(s) === s) missing.add(`${f}: ${s}`);
    }
    for (const m of html.matchAll(/(placeholder|aria-label|title)="([^"]+)"[^>]*data-i18n-(placeholder|aria|title)/g)) {
      if (t(m[2]) === m[2]) missing.add(`${f}: ${m[2]}`);
    }
  }
  assert.deepEqual([...missing], []);
});

test('every server message has an English version', () => {
  const missing = [];
  for (const f of ['server/app.js', 'server/store.js', 'server/scenario.js']) {
    for (const m of read(f).matchAll(/(?:UserError\(|error: )'([^']+)'/g)) {
      if (toEnglish(m[1]) === m[1]) missing.push(m[1]);
    }
  }
  assert.deepEqual(missing, []);
  assert.equal(toEnglish('Întrebarea lipsește.'), 'The question is missing.');
  assert.equal(toEnglish('Întrebarea 3: Adaugă cel puțin două opțiuni.'), 'Question 3: Add at least two options.');
  assert.equal(toEnglish('Poți trimite cel mult 3 răspunsuri.'), 'You can send at most 3 answers.');
  assert.equal(toEnglish('Rândul 7: pasul „plata” nu există în scenariu.'), 'Line 7: step "plata" does not exist in the scenario.');
  assert.equal(toEnglish('Pasul „start” are o singură opțiune. Adaugă încă una, sau niciuna dacă e un final.'), 'Step "start" has only one option. Add another, or none if it is an ending.');
});
