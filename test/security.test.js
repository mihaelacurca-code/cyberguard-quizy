import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { createStore } from '../server/store.js';

async function start(opts) {
  const server = createApp(opts);
  await new Promise((r) => server.http.listen(0, r));
  return { server, base: `http://localhost:${server.http.address().port}` };
}

test('guessing event codes gets blocked, and X-Forwarded-For cannot dodge it', async () => {
  const { server, base } = await start({ trustProxy: true });
  try {
    const { code } = server.store.createEvent('Real');
    // The attacker controls everything left of the entry our proxy (Caddy) appends for the real client.
    const spoof = (i) => ({ headers: { 'X-Forwarded-For': `10.0.0.${i % 250}, 203.0.113.7` } });
    for (let i = 0; i < 60; i++) assert.equal((await fetch(`${base}/api/events/ZZZZ${String(i).padStart(2, '0')}`, spoof(i))).status, 404);
    // Rotating the client-supplied part changes nothing: the limit follows the proxy-appended address.
    assert.equal((await fetch(`${base}/api/events/${code}`, spoof(99))).status, 429);
  } finally {
    await server.close();
  }
});

test('wrong admin keys over the socket count as misses too', async () => {
  const { server, base } = await start();
  const s = connect(base, { transports: ['websocket'], forceNew: true });
  try {
    await new Promise((r) => s.on('connect', r));
    const { code } = server.store.createEvent('Real');
    let last;
    for (let i = 0; i < 61; i++) {
      const c = connect(base, { transports: ['websocket'], forceNew: true });
      await new Promise((r) => c.on('connect', r));
      last = await new Promise((r) => c.emit('join', { code, role: 'admin', key: `wrong-${i}` }, r));
      c.close();
    }
    assert.match(last.error, /Prea multe/);
  } finally {
    s.close();
    await server.close();
  }
});

test('security headers', async () => {
  const { server, base } = await start();
  try {
    const res = await fetch(`${base}/`);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /default-src 'self'/);
    assert.doesNotMatch(csp, /connect-src[^;]*\sws:\s/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    const evil = await fetch(`${base}/`, { headers: { Host: 'evil.example"; script-src *' } }).catch(() => null);
    if (evil) assert.doesNotMatch(evil.headers.get('content-security-policy') || '', /evil/);
  } finally {
    await server.close();
  }
});

test('projector page does not leak unrevealed quiz answers', () => {
  const store = createStore(openDb(':memory:'));
  const { code } = store.createEvent('Quiz');
  const ev = () => store.getEvent(code);
  const id = store.createPoll(ev(), { type: 'quiz', question: 'Q', options: ['a', 'b'], correct: [1] });
  store.setPollStatus(ev(), id, 'live');
  store.vote(code, id, 'participant-1', '', [1]);
  const before = store.presenterState(ev()).poll;
  assert.equal(before.results.counts, undefined);
  assert.equal(before.results.voters, 1);
  assert.equal(before.correct, undefined);
  store.revealQuiz(ev(), id);
  assert.deepEqual(store.presenterState(ev()).poll.results.counts, [0, 1]);
});

test('closed event refuses upvotes', () => {
  const store = createStore(openDb(':memory:'));
  const { code } = store.createEvent('Q');
  const q = store.ask(code, 'participant-1', '', 'Întrebare?');
  store.updateEvent(store.getEvent(code), { settings: { closed: true } });
  assert.throws(() => store.toggleUpvote(code, 'participant-2', q.id), /închis/);
});
