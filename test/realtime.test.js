import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';

let server;
let base;
const sockets = [];

before(async () => {
  server = createApp();
  await new Promise((r) => server.http.listen(0, r));
  base = `http://localhost:${server.http.address().port}`;
});

after(async () => {
  sockets.forEach((s) => s.close());
  await server.close();
});

const call = (s, ev, payload) => new Promise((resolve) => s.emit(ev, payload, resolve));
const client = () => {
  const s = connect(base, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return new Promise((r) => s.on('connect', () => r(s)));
};
const nextState = (s, pred) => new Promise((resolve) => {
  const fn = (st) => { if (pred(st)) { s.off('state', fn); resolve(st); } };
  s.on('state', fn);
});

test('http: create event, lookup, qr, export requires key', async () => {
  const res = await fetch(`${base}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"Demo"}' });
  assert.equal(res.status, 201);
  const { code, adminKey } = await res.json();
  assert.equal((await fetch(`${base}/api/events/${code}`)).status, 200);
  assert.equal((await fetch(`${base}/api/events/NOPE00`)).status, 404);
  const qr = await fetch(`${base}/qr/${code}.svg`);
  assert.match(qr.headers.get('content-type'), /svg/);
  assert.equal((await fetch(`${base}/api/events/${code}/export.csv`)).status, 403);
  const csv = await fetch(`${base}/api/events/${code}/export.csv`, { headers: { 'X-Admin-Key': adminKey } });
  assert.equal(csv.status, 200);
  for (const path of ['/', `/e/${code}`, `/admin/${code}`, `/present/${code}`, '/js/common.js', '/socket.io/socket.io.min.js']) {
    assert.equal((await fetch(base + path)).status, 200, path);
  }
});

test('socket: admin runs a poll, audience votes, everyone gets live results', async () => {
  const { code, adminKey } = server.store.createEvent('Live');
  const admin = await client();
  const bad = await call(admin, 'join', { code, role: 'admin', key: 'nope' });
  assert.match(bad.error, /invalid/);
  const joined = await call(admin, 'join', { code, role: 'admin', key: adminKey });
  assert.ok(joined.ok);

  const audience = await client();
  const forbidden = await call(audience, 'admin', { action: 'poll:create', poll: { type: 'rating', question: 'x' } });
  assert.match(forbidden.error, /interzis/);
  const aj = await call(audience, 'join', { code, role: 'audience', participantId: 'abcdefgh1234' });
  assert.ok(aj.ok);
  assert.equal(aj.state.poll, null);

  const presenter = await client();
  await call(presenter, 'join', { code, role: 'present' });

  const { id } = await call(admin, 'admin', { action: 'poll:create', poll: { type: 'choice', question: 'Da sau nu?', options: ['Da', 'Nu'] } });
  const live = nextState(audience, (s) => s.poll?.id === id);
  await call(admin, 'admin', { action: 'poll:status', id, status: 'live' });
  const st = await live;
  assert.equal(st.online, 1);

  const counted = nextState(presenter, (s) => s.poll?.results?.counts[0] === 1);
  const v = await call(audience, 'vote', { pollId: id, value: [0] });
  assert.ok(v.ok);
  assert.deepEqual(v.me.votes[id], [0]);
  await counted;

  const q = await call(audience, 'ask', { text: 'O întrebare?', name: 'Ana' });
  assert.equal(q.status, 'visible');
  const adminSees = await nextState(admin, (s) => s.questions.length === 1);
  assert.equal(adminSees.questions[0].author, 'Ana');

  const onScreen = nextState(presenter, (s) => s.event.settings.screen === 'qa' && s.questions[0]?.highlighted);
  const m = await call(admin, 'admin', { action: 'question:moderate', id: q.id, op: 'highlight' });
  assert.ok(m.ok, m.error);
  await onScreen;
});
