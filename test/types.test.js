import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';

const P = (n) => `participant-${String(n).padStart(4, '0')}`;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 7)]);

function setup() {
  const store = createStore(openDb(':memory:'));
  const { code } = store.createEvent('Tipuri');
  return { store, code, ev: () => store.getEvent(code) };
}

test('ranking: full order only, Borda points, average position', () => {
  const { store, code, ev } = setup();
  const id = store.createPoll(ev(), { type: 'ranking', question: 'Priorități', options: ['Backup', 'MFA', 'Instruire'] });
  store.setPollStatus(ev(), id, 'live');
  assert.throws(() => store.vote(code, id, P(1), '', [0, 1]), /toate opțiunile/);
  assert.throws(() => store.vote(code, id, P(1), '', [0, 0, 1]), /toate opțiunile/);
  store.vote(code, id, P(1), '', [1, 0, 2]); // MFA, Backup, Instruire
  store.vote(code, id, P(2), '', [1, 2, 0]); // MFA, Instruire, Backup
  store.vote(code, id, P(3), '', [0, 1, 2]);
  store.vote(code, id, P(3), '', [1, 0, 2]); // changed their mind
  const r = store.audienceState(ev()).poll.results;
  assert.equal(r.ranking[0].option, 1, 'MFA first');
  assert.equal(r.ranking[0].points, 6);
  assert.equal(r.ranking[0].firsts, 3);
  assert.equal(r.ranking[0].average, 1);
  assert.equal(r.maxPoints, 6);
});

test('scale: every statement rated within the scale; averages and counts', () => {
  const { store, code, ev } = setup();
  const id = store.createPoll(ev(), { type: 'scale', question: 'Cât de de acord ești?', options: ['A', 'B'], scale: 5, labels: ['Deloc', 'Total'] });
  store.setPollStatus(ev(), id, 'live');
  assert.throws(() => store.vote(code, id, P(1), '', [3]), /fiecărei afirmații/);
  assert.throws(() => store.vote(code, id, P(1), '', [3, 6]), /fiecărei afirmații/);
  store.vote(code, id, P(1), '', [5, 2]);
  store.vote(code, id, P(2), '', [4, 2]);
  const p = store.audienceState(ev()).poll;
  assert.deepEqual(p.labels, ['Deloc', 'Total']);
  assert.equal(p.results.statements[0].average, 4.5);
  assert.deepEqual(p.results.statements[1].counts, [0, 2, 0, 0, 0]);
  assert.throws(() => store.createPoll(ev(), { type: 'scale', question: 'x', options: [] }), /cel puțin o afirmație/);
});

test('pin: needs an image to start, region hidden until reveal, share inside', () => {
  const { store, code, ev } = setup();
  const id = store.createPoll(ev(), { type: 'pin', question: 'Unde e semnul de phishing?', region: { x: 0.5, y: 0.2, r: 0.1 } });
  assert.throws(() => store.setPollStatus(ev(), id, 'live'), /imaginea/);
  store.setPollImage(ev(), id, PNG);
  store.setPollStatus(ev(), id, 'live');
  assert.throws(() => store.vote(code, id, P(1), '', [1.4, 0.2]), /pinul/);
  store.vote(code, id, P(1), '', [0.52, 0.21]); // inside
  store.vote(code, id, P(2), '', [0.9, 0.9]); // outside
  let p = store.audienceState(ev()).poll;
  assert.equal(p.region, undefined, 'region hidden before reveal');
  assert.equal(store.presenterState(ev()).poll.results.inside, undefined, 'projector does not leak the hit count early');
  assert.ok(store.adminState(ev()).polls[0].region, 'the organizer sees the region');
  store.revealQuiz(ev(), id);
  assert.throws(() => store.vote(code, id, P(3), '', [0.5, 0.5]), /dezvăluită/);
  p = store.audienceState(ev()).poll;
  assert.deepEqual(p.region, { x: 0.5, y: 0.2, r: 0.1 });
  assert.equal(p.results.inside, 1);
  assert.equal(p.results.pins.length, 2);
  assert.match(store.exportRows(ev()).at(-1)[4], /x=0\.9 y=0\.9/);
});

test('poll images: kept on edit, copied on duplicate, removed with the poll', () => {
  const { store, ev } = setup();
  const id = store.createPoll(ev(), { type: 'choice', question: 'Ce vezi?', options: ['a', 'b'] });
  assert.throws(() => store.setPollImage(ev(), id, Buffer.from('<svg/>xxxxxxxxxxxx')), /PNG, JPG sau WebP/);
  store.setPollImage(ev(), id, PNG);
  store.updatePoll(ev(), id, { type: 'choice', question: 'Ce vezi acum?', options: ['a', 'b'] });
  assert.ok(store.adminState(ev()).polls[0].image > 0);
  const copy = store.duplicatePoll(ev(), id);
  assert.deepEqual(Buffer.from(store.getPollImage(ev().code, copy).data), PNG);
  store.deletePoll(ev(), id);
  assert.equal(store.getPollImage(ev().code, id), null);
});

test('image upload over HTTP: admin only, size limit, sandboxed', async () => {
  const server = createApp();
  await new Promise((r) => server.http.listen(0, r));
  const base = `http://localhost:${server.http.address().port}`;
  try {
    const { code, adminKey } = server.store.createEvent('Imagini');
    const id = server.store.createPoll(server.store.getEvent(code), { type: 'pin', question: 'Unde?' });
    const url = `${base}/api/events/${code}/polls/${id}/image`;
    assert.equal((await fetch(url, { method: 'POST', body: PNG })).status, 403);
    const big = await fetch(url, { method: 'POST', headers: { 'X-Admin-Key': adminKey, 'X-Lang': 'en' }, body: Buffer.concat([PNG, Buffer.alloc(1100 * 1024)]) });
    assert.equal(big.status, 413);
    assert.match((await big.json()).error, /1 MB/);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'X-Admin-Key': adminKey }, body: PNG })).status, 200);
    const img = await fetch(`${base}/media/${code}/poll/${id}`);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.match(img.headers.get('content-security-policy'), /sandbox/);
  } finally {
    await server.close();
  }
});
