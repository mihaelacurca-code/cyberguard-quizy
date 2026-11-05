import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { openDb } from '../server/db.js';
import { createStore, STREAK_BONUS } from '../server/store.js';
import { createApp } from '../server/app.js';

const A = 'participant-aaaa';
const B = 'participant-bbbb';
const C = 'participant-cccc';

function setup() {
  const store = createStore(openDb(':memory:'));
  const { code, adminKey } = store.createEvent('Training NIS2');
  return { store, code, adminKey, ev: () => store.getEvent(code) };
}

// ---------- 1. knowledge test before / after ----------

test('test questions stay out of polls, leaderboard and the live slot', () => {
  const { store, code, ev } = setup();
  store.createPolls(ev(), [
    { question: 'Q1', options: ['a', 'b'], correct: [0] },
    { question: 'Q2', options: ['a', 'b'], correct: [1] },
  ], 'test');
  assert.equal(store.adminState(ev()).polls.length, 0);
  assert.equal(store.adminState(ev()).testQuestions.length, 2);
  assert.throws(() => store.createPolls(ev(), [{ type: 'rating', question: 'x' }], 'test'), /doar întrebări cu răspuns corect/);
  const id = store.adminState(ev()).testQuestions[0].id;
  assert.throws(() => store.setPollStatus(ev(), id, 'live'), /secțiunea Test/);
  assert.throws(() => store.vote(code, id, A, '', [0]), /nu este deschis/);
});

test('before/after rounds, report and personal scores', () => {
  const { store, code, ev } = setup();
  const [q1, q2] = store.createPolls(ev(), [
    { question: 'Q1', options: ['a', 'b'], correct: [0] },
    { question: 'Q2', options: ['a', 'b'], correct: [1] },
  ], 'test');

  store.updateEvent(ev(), { settings: { testRound: 'pre' } });
  const aud = store.audienceState(ev());
  assert.equal(aud.test.round, 'pre');
  assert.equal(aud.test.questions[0].correct, undefined, 'no answers sent to phones');
  store.vote(code, q1, A, 'Ana', [1]); // wrong
  store.vote(code, q2, A, 'Ana', [1]); // right
  store.vote(code, q1, B, 'Bogdan', [1]); // wrong
  assert.throws(() => store.vote(code, q1, A, 'Ana', [0]), /deja/);
  assert.equal(store.personalState(code, A).testScore.pre, null, 'hidden while the round is open');

  store.updateEvent(ev(), { settings: { testRound: 'post' } });
  store.vote(code, q1, A, 'Ana', [0]);
  store.vote(code, q2, A, 'Ana', [1]);
  store.vote(code, q1, C, 'Cezar', [0]);
  store.updateEvent(ev(), { settings: { testRound: null } });

  const r = store.testReport(ev());
  assert.equal(r.total, 2);
  assert.deepEqual(r.participants, { pre: 2, post: 2, both: 1 });
  assert.equal(r.questions[0].pre, 0);
  assert.equal(r.questions[0].post, 100);
  assert.equal(r.average.pre, 25); // Ana 50%, Bogdan 0%
  assert.equal(r.average.post, 75); // Ana 100%, Cezar 50%
  assert.deepEqual(r.matched, { improved: 1, same: 0, worse: 0, gain: 50 });

  const me = store.personalState(code, A);
  assert.deepEqual(me.testScore.pre, { correct: 1, total: 2, percent: 50 });
  assert.deepEqual(me.testScore.post, { correct: 2, total: 2, percent: 100 });
  assert.equal(store.leaderboard(ev()).length, 0, 'test answers do not score on the leaderboard');
});

// ---------- 2. certificates ----------

test('certificates: enabled, named, earned, verifiable, issued once', () => {
  const { store, code, ev } = setup();
  const [q1] = store.createPolls(ev(), [{ question: 'Q1', options: ['a', 'b'], correct: [0] }], 'test');
  assert.throws(() => store.issueCertificate(code, A, 'Ana Pop'), /nu sunt activate/);
  store.updateEvent(ev(), { settings: { certEnabled: true, certIssuer: 'CYBERGUARD', certMinScore: 80 } });
  assert.throws(() => store.issueCertificate(code, A, 'Ana Pop'), /cel puțin o activitate/);
  store.updateEvent(ev(), { settings: { testRound: 'post' } });
  store.vote(code, q1, A, 'Ana', [1]);
  assert.throws(() => store.issueCertificate(code, A, 'Ana Pop'), /80%/);
  store.vote(code, q1, B, 'Bogdan', [0]);
  assert.throws(() => store.issueCertificate(code, B, 'B'), /numele complet/);
  const cert = store.issueCertificate(code, B, 'Bogdan Ionescu');
  assert.match(cert.id, /^[A-Z2-9]{10}$/);
  assert.equal(cert.score, 100);
  assert.equal(cert.issuer, 'CYBERGUARD');
  assert.equal(cert.event, 'Training NIS2');
  assert.deepEqual(store.issueCertificate(code, B, 'Alt Nume'), cert, 'the same certificate comes back');
  assert.deepEqual(store.certificateView(cert.id.toLowerCase()), cert);
  assert.equal(store.certificateView('NOPE'), null);
  assert.equal(store.personalState(code, B).certificate, cert.id);
});

// ---------- 3. Q&A reply and custom code ----------

test('organizer replies to a question; custom event code', () => {
  const { store, code, ev } = setup();
  const q = store.ask(code, A, 'Ana', 'Când e pauza?');
  store.replyToQuestion(ev(), q.id, '  La 11:00.  ');
  assert.equal(store.audienceState(ev()).questions[0].reply, 'La 11:00.');
  store.replyToQuestion(ev(), q.id, '');
  assert.equal(store.audienceState(ev()).questions[0].reply, '');

  assert.throws(() => store.changeCode(ev(), 'a b'), /3–20/);
  assert.equal(store.changeCode(ev(), 'nis2'), 'NIS2');
  assert.ok(store.getEvent('NIS2'));
  assert.equal(store.getEvent(code), null);
  const other = store.createEvent('Alt eveniment');
  assert.throws(() => store.changeCode(store.getEvent(other.code), 'NIS2'), /deja folosit/);
});

// ---------- 4. streaks ----------

test('streak bonus for correct answers in a row, reset on a miss', () => {
  const { store, code, ev } = setup();
  const quiz = () => {
    const id = store.createPoll(ev(), { type: 'quiz', question: 'Q', options: ['a', 'b'], correct: [0] });
    store.setPollStatus(ev(), id, 'live');
    return id;
  };
  const answers = { [A]: [0, 0, 0], [B]: [0, 1, 0] };
  for (let i = 0; i < 3; i++) {
    const id = quiz();
    for (const [pid, picks] of Object.entries(answers)) store.vote(code, id, pid, pid.slice(-4), [picks[i]]);
    store.revealQuiz(ev(), id);
  }
  const lb = store.leaderboard(ev());
  const a = lb.find((r) => r.id === A);
  const b = lb.find((r) => r.id === B);
  assert.equal(a.streak, 3);
  assert.equal(a.best, 3);
  assert.equal(a.bonus, STREAK_BONUS * (0 + 1 + 2));
  assert.equal(b.streak, 1);
  assert.equal(b.bonus, 0);
  assert.equal(lb[0].id, A);
  assert.equal(store.personalState(code, A).score.streak, 3);
});

// ---------- 5. admin panel ----------

test('panel: password, session cookie, event list, new admin key, closed creation', async () => {
  const { server, base } = await (async () => {
    const s = createApp({ adminPassword: 'corect-horse-battery' });
    await new Promise((r) => s.http.listen(0, r));
    return { server: s, base: `http://localhost:${s.http.address().port}` };
  })();
  try {
    const { code } = server.store.createEvent('Eveniment 1');
    assert.equal((await fetch(`${base}/api/panel/events`)).status, 401);
    const bad = await fetch(`${base}/api/panel/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"nu"}' });
    assert.equal(bad.status, 403);
    const ok = await fetch(`${base}/api/panel/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"corect-horse-battery"}' });
    const cookie = ok.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly; SameSite=Strict/);
    const jar = { headers: { cookie: cookie.split(';')[0] } };

    const list = await (await fetch(`${base}/api/panel/events`, jar)).json();
    assert.equal(list.events[0].code, code);

    const { adminKey } = await (await fetch(`${base}/api/panel/events/${code}/key`, { method: 'POST', ...jar })).json();
    assert.ok(server.store.verifyAdmin(code, adminKey));

    // A panel session opens any admin page without the key.
    const s = connect(base, { transports: ['websocket'], forceNew: true, extraHeaders: jar.headers });
    await new Promise((r) => s.on('connect', r));
    const joined = await new Promise((r) => s.emit('join', { code, role: 'admin' }, r));
    assert.ok(joined.ok, joined.error);
    s.close();

    await fetch(`${base}/api/panel/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...jar.headers }, body: '{"openCreation":false}' });
    assert.equal((await (await fetch(`${base}/api/config`)).json()).openCreation, false);
    const refused = await fetch(`${base}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lang': 'en' }, body: '{"name":"x"}' });
    assert.equal(refused.status, 403);
    assert.match((await refused.json()).error, /Only administrators/);
    const allowed = await fetch(`${base}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...jar.headers }, body: '{"name":"x"}' });
    assert.equal(allowed.status, 201);
  } finally {
    await server.close();
  }
});

test('changing the code moves connected participants', async () => {
  const server = createApp();
  await new Promise((r) => server.http.listen(0, r));
  const base = `http://localhost:${server.http.address().port}`;
  const sockets = [];
  const client = async () => {
    const s = connect(base, { transports: ['websocket'], forceNew: true });
    sockets.push(s);
    await new Promise((r) => s.on('connect', r));
    return s;
  };
  try {
    const { code, adminKey } = server.store.createEvent('Mutare');
    const admin = await client();
    await new Promise((r) => admin.emit('join', { code, role: 'admin', key: adminKey }, r));
    const phone = await client();
    await new Promise((r) => phone.emit('join', { code, role: 'audience', participantId: 'participant-move' }, r));
    const moved = new Promise((r) => phone.on('moved', r));
    const res = await new Promise((r) => admin.emit('admin', { action: 'event:code', code: 'mutat1' }, r));
    assert.equal(res.code, 'MUTAT1');
    assert.deepEqual(await moved, { from: code, code: 'MUTAT1' });
    const q = await new Promise((r) => phone.emit('ask', { text: 'Merge după mutare?' }, r));
    assert.ok(q.ok, q.error);
  } finally {
    sockets.forEach((s) => s.close());
    await server.close();
  }
});

// ---------- post-event report ----------

test('report: admin key or panel session only, with stats, polls, test and certificates', async () => {
  const server = createApp({ adminPassword: 'parola-raport-1234' });
  await new Promise((r) => server.http.listen(0, r));
  const base = `http://localhost:${server.http.address().port}`;
  try {
    const { store } = server;
    const { code, adminKey } = store.createEvent('Raport');
    const ev = () => store.getEvent(code);
    const poll = store.createPoll(ev(), { type: 'choice', question: 'Culoare?', options: ['A', 'B'] });
    store.createPoll(ev(), { type: 'rating', question: 'Neînceput' });
    store.setPollStatus(ev(), poll, 'live');
    store.vote(code, poll, A, 'Ana', [0]);
    store.vote(code, poll, B, 'Bogdan', [1]);
    store.ask(code, C, 'Cezar', 'O întrebare?');
    const [t1] = store.createPolls(ev(), [{ question: 'T', options: ['x', 'y'], correct: [0] }], 'test');
    store.updateEvent(ev(), { settings: { testRound: 'post', certEnabled: true } });
    store.vote(code, t1, A, 'Ana', [0]);
    store.issueCertificate(code, A, 'Ana Popescu');

    assert.equal((await fetch(`${base}/api/events/${code}/report`)).status, 403);
    const res = await fetch(`${base}/api/events/${code}/report`, { headers: { 'X-Admin-Key': adminKey } });
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.equal(d.event.name, 'Raport');
    assert.deepEqual(d.stats, { participants: 3, polls: 1, responses: 2, questions: 1, upvotes: 0, certificates: 1 });
    assert.equal(d.polls.length, 1, 'polls never started stay out of the report');
    assert.deepEqual(d.polls[0].results.counts, [1, 1]);
    assert.equal(d.test.total, 1);
    assert.equal(d.certificates[0].name, 'Ana Popescu');
    assert.equal((await fetch(`${base}/report/${code}`)).status, 200);
  } finally {
    await server.close();
  }
});
