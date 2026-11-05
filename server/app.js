import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { openDb } from './db.js';
import { createStore, UserError } from './store.js';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));
const FLUSH_MS = 200;

export function createApp({ dbFile = ':memory:', publicUrl = '', trustProxy = false } = {}) {
  const db = openDb(dbFile);
  const store = createStore(db);
  const app = express();
  const http = createServer(app);
  const io = new Server(http, { serveClient: true, maxHttpBufferSize: 64 * 1024 });

  if (trustProxy) app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; frame-ancestors 'self'");
    next();
  });

  const page = (name) => (req, res) => res.sendFile(join(PUBLIC, name));
  app.get('/', page('index.html'));
  app.get('/e/:code', page('event.html'));
  app.get('/admin/:code', page('admin.html'));
  app.get('/present/:code', page('present.html'));
  app.use(express.static(PUBLIC, { index: false, maxAge: '1h' }));

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // Event creation is the only anonymous write over HTTP; keep it from being scripted into the ground.
  const created = new Map();
  app.post('/api/events', (req, res) => {
    const ip = req.ip || 'unknown';
    const hour = Date.now() - 3_600_000;
    const recent = (created.get(ip) || []).filter((t) => t > hour);
    if (recent.length >= 30) return res.status(429).json({ error: 'Prea multe evenimente create într-o oră.' });
    try {
      const out = store.createEvent(req.body?.name);
      recent.push(Date.now());
      created.set(ip, recent);
      res.status(201).json(out);
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get('/api/events/:code', (req, res) => {
    const ev = store.getEvent(req.params.code);
    if (!ev) return res.status(404).json({ error: 'Nu există niciun eveniment cu acest cod.' });
    res.json({ code: ev.code, name: ev.name });
  });

  app.get('/api/events/:code/export.csv', (req, res) => {
    const ev = store.verifyAdmin(req.params.code, req.get('x-admin-key'));
    if (!ev) return res.status(403).json({ error: 'Acces interzis.' });
    const csv = store.exportRows(ev).map((r) => r.map(csvCell).join(',')).join('\r\n');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="quizy-${ev.code}.csv"`);
    res.send('﻿' + csv);
  });

  app.get('/qr/:code.svg', async (req, res) => {
    const ev = store.getEvent(req.params.code);
    if (!ev) return res.status(404).end();
    const base = publicUrl || `${req.protocol}://${req.get('host')}`;
    const svg = await QRCode.toString(`${base}/e/${ev.code}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.set('Content-Type', 'image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
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
  };

  io.on('connection', (socket) => {
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
      const reply = typeof ack === 'function' ? ack : () => {};
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
      let ev;
      if (role === 'admin') {
        ev = store.verifyAdmin(code, key);
        if (!ev) throw new UserError('Cheie de administrare invalidă.');
      } else {
        ev = store.requireEvent(code);
      }
      if (!['admin', 'present', 'audience'].includes(role)) throw new UserError('Rol necunoscut.');
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

    on('admin', ({ action, ...payload }) => {
      if (me().role !== 'admin') throw new UserError('Acces interzis.');
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
      for (const t of pending.values()) clearTimeout(t);
      io.close(() => {
        db.close();
        resolve();
      });
    }),
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
