import express from 'express';
import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { openDb } from './db.js';
import { createStore, UserError } from './store.js';
import { localize, pickLang } from './i18n.js';
import { SCENARIO_EXAMPLE } from './scenario.js';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));
const FLUSH_MS = 200;

export function createApp({ dbFile = ':memory:', publicUrl = '', trustProxy = false, adminPassword = '' } = {}) {
  const db = openDb(dbFile);
  const store = createStore(db);
  const app = express();
  const http = createServer(app);
  const io = new Server(http, { serveClient: true, maxHttpBufferSize: 64 * 1024 });

  // Trust exactly one proxy hop (Caddy, Nginx, Render). `true` would believe a client-supplied
  // X-Forwarded-For and let anyone pick their own IP to dodge the rate limits.
  if (trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  // Error messages go out in the language the page asked for (X-Lang: en | ro).
  app.use((req, res, next) => {
    const lang = pickLang(req.get('x-lang'));
    const json = res.json.bind(res);
    res.json = (body) => json(body && typeof body.error === 'string' ? { ...body, error: localize(body.error, lang) } : body);
    next();
  });
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    // Older Safari does not count same-origin ws:// as 'self', so name this host explicitly.
    const host = /^[a-z0-9.-]+(:\d+)?$/i.test(req.get('host') || '') ? req.get('host') : '';
    const ws = host ? ` wss://${host} ws://${host}` : '';
    res.set('Content-Security-Policy',
      `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'${ws}; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'`);
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // ---------- organizer panel sessions ----------
  // One password for the whole server (ADMIN_PASSWORD). A login gives an HttpOnly cookie that
  // opens every event's admin page; sessions live in memory and end on restart or after 12 h.
  const SESSION_MS = 12 * 3_600_000;
  const sessions = new Map();
  const sha = (s) => createHash('sha256').update(String(s)).digest();
  const passwordOk = (p) => Boolean(adminPassword) && typeof p === 'string' && timingSafeEqual(sha(p), sha(adminPassword));
  const cookieValue = (header, name) => {
    for (const part of String(header || '').split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === name) return decodeURIComponent(v.join('='));
    }
    return '';
  };
  const sessionValid = (token) => {
    const exp = token && sessions.get(token);
    if (!exp) return false;
    if (exp < Date.now()) { sessions.delete(token); return false; }
    return true;
  };
  const panelAuthed = (req) => Boolean(adminPassword) && sessionValid(cookieValue(req.get('cookie'), 'quizy_panel'));
  const requirePanel = (req, res, next) => (panelAuthed(req) ? next() : res.status(401).json({ error: 'Autentifică-te în panoul de administrare.' }));
  const openCreation = () => store.appSetting('openCreation', true);

  const page = (name) => (req, res) => res.sendFile(join(PUBLIC, name));
  app.get('/', page('index.html'));
  app.get('/panel', page('panel.html'));
  app.get('/v/:id', page('verify.html'));
  app.get('/report/:code', page('report.html'));
  app.get('/e/:code', page('event.html'));
  app.get('/admin/:code', page('admin.html'));
  app.get('/present/:code', page('present.html'));
  // No long cache: after an update every browser picks up the new scripts (ETag keeps repeat loads cheap).
  app.use(express.static(PUBLIC, { index: false, maxAge: 0 }));

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // Per-IP limits. They are generous on purpose: a whole conference can sit behind one venue NAT.
  const limits = {
    create: rateLimiter(30, 3_600_000), // new events per hour
    miss: rateLimiter(60, 600_000), // wrong event codes / admin keys per 10 min (stops code guessing)
    join: rateLimiter(1500, 600_000), // audience joins per 10 min (slows scripted fake participants)
    ask: rateLimiter(120, 60_000), // Q&A questions per minute
  };
  const sweeper = setInterval(() => Object.values(limits).forEach((l) => l.sweep()), 60_000);
  sweeper.unref();

  app.get('/api/scenario-example', (req, res) => res.json({ text: SCENARIO_EXAMPLE[pickLang(req.get('x-lang'))] }));

  app.get('/api/config', (req, res) => res.json({ openCreation: openCreation(), panel: Boolean(adminPassword) }));

  app.post('/api/events', (req, res) => {
    if (!openCreation() && !panelAuthed(req)) return res.status(403).json({ error: 'Crearea de evenimente este rezervată administratorilor.' });
    if (!limits.create.take(req.ip)) return res.status(429).json({ error: 'Prea multe evenimente create într-o oră.' });
    try {
      res.status(201).json(store.createEvent(req.body?.name));
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get('/api/events/:code', (req, res) => {
    if (limits.miss.blocked(req.ip)) return res.status(429).json({ error: 'Prea multe coduri greșite. Încearcă peste câteva minute.' });
    const ev = store.getEvent(req.params.code);
    if (!ev) {
      limits.miss.take(req.ip);
      return res.status(404).json({ error: 'Nu există niciun eveniment cu acest cod.' });
    }
    res.json({ code: ev.code, name: ev.name });
  });

  app.get('/api/events/:code/report', (req, res) => {
    if (limits.miss.blocked(req.ip)) return res.status(429).json({ error: 'Prea multe încercări.' });
    const ev = store.verifyAdmin(req.params.code, req.get('x-admin-key')) || (panelAuthed(req) ? store.getEvent(req.params.code) : null);
    if (!ev) {
      limits.miss.take(req.ip);
      return res.status(403).json({ error: 'Acces interzis.' });
    }
    res.set('Cache-Control', 'no-store');
    res.json(store.reportData(ev));
  });

  app.get('/api/events/:code/export.csv', (req, res) => {
    if (limits.miss.blocked(req.ip)) return res.status(429).json({ error: 'Prea multe încercări.' });
    const ev = store.verifyAdmin(req.params.code, req.get('x-admin-key')) || (panelAuthed(req) ? store.getEvent(req.params.code) : null);
    if (!ev) {
      limits.miss.take(req.ip);
      return res.status(403).json({ error: 'Acces interzis.' });
    }
    const csv = store.exportRows(ev, pickLang(req.get('x-lang'))).map((r) => r.map(csvCell).join(',')).join('\r\n');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('Content-Disposition', `attachment; filename="quizy-${ev.code}.csv"`);
    res.send('﻿' + csv);
  });

  // ---------- certificates ----------
  app.get('/api/certificates/:id', (req, res) => {
    if (limits.miss.blocked(req.ip)) return res.status(429).json({ error: 'Prea multe încercări.' });
    const cert = store.certificateView(req.params.id);
    if (!cert) {
      limits.miss.take(req.ip);
      return res.status(404).json({ error: 'Certificatul nu există.' });
    }
    res.json(cert);
  });

  app.get('/qr/cert/:id.svg', async (req, res) => {
    const cert = store.certificateView(req.params.id);
    if (!cert) return res.status(404).end();
    const base = publicUrl || `${req.protocol}://${req.get('host')}`;
    const svg = await QRCode.toString(`${base}/v/${cert.id}`, { type: 'svg', margin: 1, width: 400, errorCorrectionLevel: 'M' });
    res.set('Content-Type', 'image/svg+xml').set('Cache-Control', 'private, max-age=300').send(svg);
  });

  // ---------- panel API ----------
  app.post('/api/panel/login', (req, res) => {
    if (!adminPassword) return res.status(404).json({ error: 'Panoul de administrare nu este configurat pe acest server.' });
    if (limits.miss.blocked(req.ip)) return res.status(429).json({ error: 'Prea multe încercări greșite. Încearcă peste câteva minute.' });
    if (!passwordOk(req.body?.password)) {
      limits.miss.take(req.ip);
      return res.status(403).json({ error: 'Parolă greșită.' });
    }
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, Date.now() + SESSION_MS);
    res.set('Set-Cookie', `quizy_panel=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${req.secure ? '; Secure' : ''}`);
    res.json({ ok: true });
  });

  app.post('/api/panel/logout', (req, res) => {
    sessions.delete(cookieValue(req.get('cookie'), 'quizy_panel'));
    res.set('Set-Cookie', 'quizy_panel=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    res.json({ ok: true });
  });

  app.get('/api/panel/session', (req, res) => res.json({ configured: Boolean(adminPassword), authed: panelAuthed(req) }));

  app.get('/api/panel/events', requirePanel, (req, res) => {
    res.json({ events: store.listEvents(), openCreation: openCreation() });
  });

  app.post('/api/panel/settings', requirePanel, (req, res) => {
    if ('openCreation' in (req.body || {})) store.setAppSetting('openCreation', Boolean(req.body.openCreation));
    res.json({ openCreation: openCreation() });
  });

  app.post('/api/panel/events/:code/key', requirePanel, (req, res) => {
    const ev = store.getEvent(req.params.code);
    if (!ev) return res.status(404).json({ error: 'Evenimentul nu există.' });
    res.json({ code: ev.code, adminKey: store.rotateAdminKey(ev) });
  });

  app.delete('/api/panel/events/:code', requirePanel, (req, res) => {
    const ev = store.getEvent(req.params.code);
    if (!ev) return res.status(404).json({ error: 'Evenimentul nu există.' });
    store.deleteEvent(ev);
    changed(ev.code);
    res.json({ ok: true });
  });

  app.get('/qr/:code.svg', async (req, res) => {
    const ev = store.getEvent(req.params.code);
    if (!ev) return res.status(404).end();
    const base = publicUrl || `${req.protocol}://${req.get('host')}`;
    const svg = await QRCode.toString(`${base}/e/${ev.code}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    // Without PUBLIC_URL the link comes from the Host header, so a shared cache must not keep it.
    res.set('Content-Type', 'image/svg+xml').set('Cache-Control', publicUrl ? 'public, max-age=86400' : 'private, max-age=300').send(svg);
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Nu există.' }));

  // ---------- realtime ----------

  const rooms = (code) => ({ audience: `aud:${code}`, present: `pres:${code}`, admin: `adm:${code}` });
  const roomSize = (name) => io.sockets.adapter.rooms.get(name)?.size || 0;
  const pending = new Map();
  let closing = false;

  function changed(code) {
    if (closing || pending.has(code)) return;
    pending.set(code, setTimeout(() => flush(code), FLUSH_MS));
  }

  function flush(code) {
    pending.delete(code);
    const ev = store.getEvent(code);
    const r = rooms(code);
    if (!ev) {
      io.to([r.audience, r.present, r.admin]).emit('deleted');
      return;
    }
    const online = roomSize(r.audience);
    const now = Date.now();
    if (roomSize(r.audience)) io.to(r.audience).emit('state', { ...store.audienceState(ev), online, now });
    if (roomSize(r.present)) io.to(r.present).emit('state', { ...store.presenterState(ev), online, now });
    if (roomSize(r.admin)) io.to(r.admin).emit('state', { ...store.adminState(ev), online, now });
  }

  function stateFor(role, ev) {
    const extra = { online: roomSize(rooms(ev.code).audience), now: Date.now() };
    if (role === 'admin') return { ...store.adminState(ev), ...extra };
    if (role === 'present') return { ...store.presenterState(ev), ...extra };
    return { ...store.audienceState(ev), ...extra };
  }

  const adminActions = {
    'event:update': (ev, p) => store.updateEvent(ev, p),
    'event:delete': (ev) => store.deleteEvent(ev),
    'poll:create': (ev, p) => ({ id: store.createPoll(ev, p.poll) }),
    'poll:import': (ev, p) => ({ ids: store.createPolls(ev, p.polls) }),
    'poll:update': (ev, p) => store.updatePoll(ev, p.id, p.poll),
    'poll:duplicate': (ev, p) => ({ id: store.duplicatePoll(ev, p.id) }),
    'poll:delete': (ev, p) => store.deletePoll(ev, p.id),
    'poll:move': (ev, p) => store.movePoll(ev, p.id, p.direction),
    'poll:status': (ev, p) => store.setPollStatus(ev, p.id, p.status),
    'poll:show': (ev, p) => store.setShowResults(ev, p.id, p.show),
    'poll:reveal': (ev, p) => store.revealQuiz(ev, p.id, p.revealed !== false),
    'poll:reset': (ev, p) => store.resetPoll(ev, p.id),
    'question:moderate': (ev, p) => store.moderate(ev, p.id, p.op),
    'question:reply': (ev, p) => store.replyToQuestion(ev, p.id, p.text),
    'test:create': (ev, p) => ({ id: store.createPoll(ev, p.poll, 'test') }),
    'test:import': (ev, p) => ({ ids: store.createPolls(ev, p.polls, 'test') }),
    'scenario:create': (ev, p) => ({ id: store.createScenario(ev, p.text) }),
    'scenario:delete': (ev, p) => store.deleteScenario(ev, p.id),
    'scenario:start': (ev, p) => store.startScenario(ev, p.id),
    'scenario:reveal': (ev) => store.revealScenario(ev),
    'scenario:advance': (ev, p) => store.advanceScenario(ev, p.choice),
    'scenario:back': (ev) => store.backScenario(ev),
    'scenario:stop': (ev) => store.stopScenario(ev),
  };

  // Changing the code moves everyone who is connected: their rooms follow, and each page
  // updates its own address bar.
  function moveEvent(oldCode, newCode) {
    const from = rooms(oldCode);
    const to = rooms(newCode);
    for (const s of io.sockets.sockets.values()) {
      if (s.data?.code !== oldCode) continue;
      s.data.code = newCode;
      const role = s.data.role;
      s.leave(from[role]);
      s.join(to[role]);
    }
    io.to([to.audience, to.present, to.admin]).emit('moved', { from: oldCode, code: newCode });
  }

  // Same rule as Express: with one trusted proxy, the client is the last X-Forwarded-For entry.
  const socketIp = (socket) => {
    if (trustProxy) {
      const fwd = String(socket.handshake.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
      if (fwd.length) return fwd[fwd.length - 1];
    }
    return socket.handshake.address || 'unknown';
  };

  io.on('connection', (socket) => {
    const ip = socketIp(socket);
    const lang = pickLang(socket.handshake.query?.lang);
    let tokens = 40;
    let last = Date.now();
    const allow = () => {
      const t = Date.now();
      tokens = Math.min(40, tokens + ((t - last) / 1000) * 4);
      last = t;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    };

    const on = (name, fn) => socket.on(name, (payload, ack) => {
      const send = typeof ack === 'function' ? ack : () => {};
      const reply = (res) => send(res.error ? { ...res, error: localize(res.error, lang) } : res);
      if (!allow()) return reply({ error: 'Prea multe acțiuni. Încetinește puțin.' });
      try {
        reply({ ok: true, ...(fn(payload && typeof payload === 'object' ? payload : {}) || {}) });
      } catch (e) {
        if (!(e instanceof UserError)) console.error(e);
        reply({ error: e instanceof UserError ? e.message : 'Eroare internă.' });
      }
    });

    const me = () => socket.data;
    const requireAudience = () => {
      if (!me().code || !me().participantId) throw new UserError('Intră mai întâi în eveniment.');
      return me();
    };

    on('join', ({ code, role = 'audience', participantId, key }) => {
      if (me().code) throw new UserError('Deja conectat.');
      if (!['admin', 'present', 'audience'].includes(role)) throw new UserError('Rol necunoscut.');
      if (limits.miss.blocked(ip)) throw new UserError('Prea multe încercări greșite. Încearcă peste câteva minute.');
      const panel = role === 'admin' && Boolean(adminPassword) && sessionValid(cookieValue(socket.handshake.headers.cookie, 'quizy_panel'));
      const ev = role === 'admin' ? (store.verifyAdmin(code, key) || (panel ? store.getEvent(code) : null)) : store.getEvent(code);
      if (!ev) {
        limits.miss.take(ip);
        throw new UserError(role === 'admin' ? 'Cheie de administrare invalidă.' : 'Evenimentul nu există.');
      }
      if (role === 'audience' && !limits.join.take(ip)) throw new UserError('Prea multe conectări din această rețea. Încearcă puțin mai târziu.');
      const out = { state: stateFor(role, ev) };
      if (role === 'audience') out.me = store.personalState(ev.code, participantId);
      socket.data = { code: ev.code, role, participantId: role === 'audience' ? participantId : null };
      socket.join(rooms(ev.code)[role]);
      if (role === 'audience') changed(ev.code);
      return out;
    });

    on('vote', ({ pollId, value, name }) => {
      const { code, participantId } = requireAudience();
      store.vote(code, pollId, participantId, name, value);
      changed(code);
      return { me: store.personalState(code, participantId) };
    });

    on('ask', ({ text, name }) => {
      const { code, participantId } = requireAudience();
      if (!limits.ask.take(ip)) throw new UserError('Prea multe întrebări din această rețea. Încearcă peste un minut.');
      const out = store.ask(code, participantId, name, text);
      changed(code);
      return out;
    });

    on('upvote', ({ questionId }) => {
      const { code, participantId } = requireAudience();
      store.toggleUpvote(code, participantId, questionId);
      changed(code);
      return { me: store.personalState(code, participantId) };
    });

    on('me', () => {
      const { code, participantId } = requireAudience();
      return { me: store.personalState(code, participantId) };
    });

    on('scenario:vote', ({ choice }) => {
      const { code, participantId } = requireAudience();
      store.scenarioVote(code, participantId, choice);
      changed(code);
      return { me: store.personalState(code, participantId) };
    });

    on('certificate', ({ name }) => {
      const { code, participantId } = requireAudience();
      const cert = store.issueCertificate(code, participantId, name);
      changed(code);
      return { certificate: cert };
    });

    on('admin', ({ action, ...payload }) => {
      if (me().role !== 'admin') throw new UserError('Acces interzis.');
      if (action === 'event:code') {
        const oldCode = me().code;
        const code = store.changeCode(store.requireEvent(oldCode), payload.code);
        if (code !== oldCode) moveEvent(oldCode, code);
        changed(code);
        return { code };
      }
      const fn = adminActions[action];
      if (!fn) throw new UserError('Acțiune necunoscută.');
      const out = fn(store.requireEvent(me().code), payload);
      changed(me().code);
      return out;
    });

    socket.on('disconnect', () => {
      if (me().role === 'audience') changed(me().code);
    });
  });

  return {
    app, http, io, store,
    close: () => new Promise((resolve) => {
      closing = true;
      clearInterval(sweeper);
      for (const t of pending.values()) clearTimeout(t);
      io.close(() => {
        db.close();
        resolve();
      });
    }),
  };
}

function rateLimiter(max, windowMs) {
  const hits = new Map();
  const recent = (key) => (hits.get(key) || []).filter((t) => t > Date.now() - windowMs);
  return {
    blocked: (key) => recent(key).length >= max,
    take(key) {
      const list = recent(key);
      if (list.length >= max) return false;
      list.push(Date.now());
      hits.set(key, list);
      return true;
    },
    sweep() {
      for (const key of hits.keys()) {
        const list = recent(key);
        if (list.length) hits.set(key, list); else hits.delete(key);
      }
    },
  };
}

function sendError(res, e) {
  if (e instanceof UserError) return res.status(400).json({ error: e.message });
  console.error(e);
  res.status(500).json({ error: 'Eroare internă.' });
}

function csvCell(v) {
  const s = String(v ?? '');
  // Stop spreadsheet apps from treating answers as formulas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
