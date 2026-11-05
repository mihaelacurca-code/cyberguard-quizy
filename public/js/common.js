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
  ranking: t('Clasament de opțiuni'),
  scale: t('Scală cu afirmații'),
  pin: t('Pin pe imagine'),
};

// Image attached to a poll; served per event, versioned by upload time.
export const pollImageUrl = (poll, code = codeFromPath()) => (poll?.image ? `/media/${encodeURIComponent(code)}/poll/${poll.id}?v=${poll.image}` : '');

export const pollImage = (poll, cls = 'poll-image') => (poll?.image && poll.type !== 'pin' ? h('img', { class: cls, src: pollImageUrl(poll), alt: '' }) : null);

// The image with every pin on it, plus the correct area once revealed.
export function pinBoard(poll, { mine = null, onPick = null, showPins = true, src = '' } = {}) {
  const r = poll.results;
  const board = h('div', { class: `pin-board${onPick ? ' pickable' : ''}` },
    h('img', { src: src || pollImageUrl(poll), alt: '', draggable: false }));
  if (showPins && r?.pins) for (const [x, y] of r.pins) board.append(h('span', { class: 'pin', style: { left: `${x * 100}%`, top: `${y * 100}%` } }));
  if (poll.region) {
    board.append(h('span', { class: 'pin-region', style: {
      left: `${poll.region.x * 100}%`, top: `${poll.region.y * 100}%`, width: `${poll.region.r * 200}%`,
    } }));
  }
  if (mine) board.append(h('span', { class: 'pin mine', style: { left: `${mine[0] * 100}%`, top: `${mine[1] * 100}%` } }));
  if (onPick) {
    board.addEventListener('click', (e) => {
      const rect = board.getBoundingClientRect();
      onPick([Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))]);
    });
  }
  return board;
}

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
  if (poll.type === 'ranking') {
    if (!r.voters) return h('p', { class: 'empty' }, t('Încă nu există răspunsuri.'));
    return h('div', { class: 'bars' },
      r.ranking.map((row, i) => h('div', { class: `bar${i === 0 ? ' correct' : ''}` },
        h('div', { class: 'bar-label' }, h('span', {}, `${i + 1}. ${poll.options[row.option]}`), h('span', { class: 'n' }, t('loc mediu {avg}', { avg: row.average }))),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${pct(row.points, r.maxPoints)}%` } })))),
      h('p', { class: 'muted small' }, votersLabel(r.voters)));
  }
  if (poll.type === 'scale') {
    const [low, high] = poll.labels?.length === 2 && poll.labels[0] && poll.labels[1] ? poll.labels : [t('Deloc de acord'), t('Total de acord')];
    return h('div', { class: 'scale-results' },
      h('div', { class: 'scale-legend small muted' }, h('span', {}, `1 = ${low}`), h('span', {}, `${poll.scale} = ${high}`)),
      poll.options.map((s, i) => {
        const st = r.statements[i];
        const total = st.counts.reduce((a, b) => a + b, 0);
        return h('div', { class: 'scale-row' },
          h('div', { class: 'scale-head' }, h('span', {}, s), h('span', { class: 'avg-badge' }, st.average ?? '–')),
          h('div', { class: 'scale-stack' }, st.counts.map((n, k) => (n ? h('span', {
            class: 'seg', title: `${k + 1}: ${n}`,
            style: { width: `${pct(n, total)}%`, opacity: String(0.25 + (0.75 * k) / Math.max(1, poll.scale - 1)) },
          }, pct(n, total) >= 8 ? String(k + 1) : '') : null))));
      }),
      h('p', { class: 'muted small' }, votersLabel(r.voters)));
  }
  if (poll.type === 'pin') {
    return h('div', {},
      pinBoard(poll),
      h('p', { class: 'muted small' }, votersLabel(r.voters),
        r.inside !== undefined && poll.region ? ` · ${t('{p}% au nimerit zona corectă', { p: pct(r.inside, r.voters) })}` : ''));
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

// ---------- per-event look ----------
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (rgb, to, t) => rgb.map((c, i) => Math.round(c + (to[i] - c) * t));
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const toHsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
};
const fromHsl = ([h, s, l]) => {
  if (!s) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
};
// Raises lightness (keeping hue and saturation) until the color reads on the dark background:
// luminance 0.2 gives at least 4.5:1 contrast against the near-black page.
const legible = (rgb) => {
  const [h, s] = toHsl(rgb);
  let [, , l] = toHsl(rgb);
  let out = rgb;
  while (luminance(out) < 0.2 && l < 0.95) { l += 0.03; out = fromHsl([h, s, l]); }
  return out;
};
const css = (rgb, a) => (a === undefined ? `rgb(${rgb.join(' ')})` : `rgb(${rgb.join(' ')} / ${a}%)`);
const BRAND_VARS = ['--primary', '--primary-strong', '--primary-deep', '--primary-soft', '--primary-ink', '--glow', '--glow-color', '--c1', '--c4'];

// The client color adjusted to read on a dark background, plus a lighter variant.
export function brandAccent(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return null;
  const main = legible(hexRgb(hex));
  return { main: css(main), strong: css(mix(main, [255, 255, 255], 0.2)), glow: css(main, 80) };
}

// Applies the event's accent color, background and logo. A dark client color (e.g. navy) is
// lightened until it reads on the dark background; the original is kept for gradient starts.
export function applyBrand(event) {
  const brand = event?.settings?.brand || {};
  const root = document.documentElement.style;
  if (/^#[0-9a-f]{6}$/i.test(brand.color || '')) {
    const base = hexRgb(brand.color);
    const main = legible(base);
    const strong = mix(main, [255, 255, 255], 0.2);
    root.setProperty('--primary', css(main));
    root.setProperty('--primary-strong', css(strong));
    root.setProperty('--primary-deep', css(luminance(base) < 0.05 ? mix(base, [255, 255, 255], 0.25) : base));
    root.setProperty('--primary-soft', css(main, 16));
    root.setProperty('--primary-ink', luminance(main) > 0.45 ? '#06101f' : '#ffffff');
    root.setProperty('--glow', `0 0 0 1px ${css(main, 55)}, 0 0 18px ${css(main, 45)}`);
    root.setProperty('--glow-color', css(strong, 60));
    root.setProperty('--c1', css(main));
    root.setProperty('--c4', css(strong));
  } else {
    BRAND_VARS.forEach((v) => root.removeProperty(v));
  }
  document.body.classList.toggle('plain-bg', brand.background === 'plain');
  document.body.classList.toggle('white-label', Boolean(brand.hideProduct));
  const src = brand.logo ? `/brand/${encodeURIComponent(event.code)}/logo?v=${brand.logo}` : '';
  for (const img of document.querySelectorAll('img.client-logo')) {
    if (src) { if (img.getAttribute('src') !== src) img.src = src; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
  }
}
