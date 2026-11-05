// Shared helpers for every page. All user text goes through textContent.
import { t, plural, lang } from './i18n.js';

export { t, lang };

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && (typeof v !== 'string' || k === 'value')) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

// replaceChildren() would print arrays and nulls as text; this flattens and drops them.
export const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));

let toastTimer;
export function toast(message, error = false) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: `toast${error ? ' error' : ''}`, role: 'status' }, message);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), error ? 4500 : 2500);
}

export function storage(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
export function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

export function participantId() {
  let id = storage('quizy:pid');
  if (!id) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    store('quizy:pid', id);
  }
  return id;
}

export const codeFromPath = () => decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '').toUpperCase();

// Connects, (re)joins after every reconnect, and resolves socket.io acks as promises.
export function connect({ code, role, key, onState, onJoin, onError }) {
  const socket = window.io({ transports: ['websocket', 'polling'], query: { lang } });
  const join = () => socket.emit('join', { code, role, key, participantId: role === 'audience' ? participantId() : undefined }, (res) => {
    if (res?.error) return onError?.(res.error);
    onJoin?.(res);
    onState(res.state);
  });
  socket.on('connect', join);
  socket.on('state', onState);
  socket.on('deleted', () => onError?.(t('Evenimentul a fost șters.')));
  // The organizer changed the event code: keep this page (and any saved admin link) on the new one.
  socket.on('moved', ({ from, code: next }) => {
    const saved = storage('quizy:events', []);
    for (const e of saved) if (e.code === from) e.code = next;
    store('quizy:events', saved);
    const parts = location.pathname.split('/');
    parts[2] = next;
    location.replace(parts.join('/') + location.search);
  });
  socket.on('disconnect', () => document.body.classList.add('offline'));
  socket.on('connect', () => document.body.classList.remove('offline'));
  socket.call = (event, payload) => new Promise((resolve, reject) => {
    socket.timeout(10_000).emit(event, payload, (err, res) => {
      if (err) return reject(new Error(t('Conexiunea nu răspunde. Încearcă din nou.')));
      if (res?.error) return reject(new Error(res.error));
      resolve(res);
    });
  });
  return socket;
}

export const TYPE_LABELS = {
  choice: t('Alegere multiplă'),
  quiz: t('Quiz'),
  wordcloud: t('Word cloud'),
  open: t('Text liber'),
  rating: t('Evaluare'),
};

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
export const votersLabel = (n) => plural(n, 'participant');

export function renderResults(poll) {
  const r = poll.results;
  if (!r) return h('p', { class: 'muted' }, t('Rezultatele sunt ascunse.'));
  switch (poll.type) {
    case 'choice':
    case 'quiz': {
      const total = poll.type === 'choice' && poll.multi ? r.voters : r.counts.reduce((a, b) => a + b, 0);
      return h('div', { class: 'bars' },
        poll.options.map((opt, i) => h('div', { class: `bar${poll.correct?.includes(i) ? ' correct' : ''}` },
          h('div', { class: 'bar-label' }, h('span', {}, opt), h('span', { class: 'n' }, `${pct(r.counts[i], total)}% · ${r.counts[i]}`)),
          h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${pct(r.counts[i], total)}%` } })))),
        h('p', { class: 'muted small' }, votersLabel(r.voters)));
    }
    case 'rating': {
      const total = r.counts.reduce((a, b) => a + b, 0);
      return h('div', {},
        h('div', { class: 'row' }, h('span', { class: 'average' }, r.average ?? '–'), h('span', { class: 'muted' }, `${t('din {scale}', { scale: poll.scale })} · ${votersLabel(r.voters)}`)),
        h('div', { class: 'bars' }, r.counts.map((n, i) => i).reverse().map((i) => h('div', { class: 'bar' },
          h('div', { class: 'bar-label' }, h('span', {}, `${i + 1} ★`), h('span', { class: 'n' }, `${pct(r.counts[i], total)}% · ${r.counts[i]}`)),
          h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${pct(r.counts[i], total)}%` } }))))));
    }
    case 'wordcloud': {
      if (!r.words.length) return h('p', { class: 'empty' }, t('Încă nu există cuvinte.'));
      const max = r.words[0].count;
      const min = r.words[r.words.length - 1].count;
      const colors = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'];
      // Biggest words in the middle reads more like a cloud than a sorted list.
      const ordered = [];
      r.words.forEach((w, i) => (i % 2 ? ordered.push(w) : ordered.unshift(w)));
      return h('div', {},
        h('div', { class: 'cloud' }, ordered.map((w) => {
          const t = max === min ? 1 : (w.count - min) / (max - min);
          return h('span', {
            title: `${w.count}`,
            style: { fontSize: `${(0.9 + t * 2.6).toFixed(2)}em`, color: `var(${colors[[...w.word].reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length]})` },
          }, w.word);
        })),
        h('p', { class: 'muted small' }, `${plural(r.responses, 'answer')} · ${votersLabel(r.voters)}`));
    }
    case 'open': {
      if (!r.answers.length) return h('p', { class: 'empty' }, t('Încă nu există răspunsuri.'));
      return h('div', {},
        h('ul', { class: 'answers' }, r.answers.map((a) => h('li', {}, a.text, a.name ? h('div', { class: 'who' }, a.name) : null))),
        h('p', { class: 'muted small' }, `${plural(r.responses, 'answer')} · ${votersLabel(r.voters)}`));
    }
  }
  return h('div');
}

export function timeLeft(poll, skew = 0) {
  if (!poll?.timeLimit || poll.status !== 'live') return null;
  const end = poll.openedAt + poll.timeLimit * 1000;
  return Math.max(0, Math.ceil((end - (Date.now() + skew)) / 1000));
}

export function copy(text) {
  navigator.clipboard?.writeText(text).then(() => toast(t('Copiat.')), () => toast(t('Nu am putut copia.'), true));
}
