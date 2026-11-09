// Changes after the pilot run in town halls: duplicate an event, reset results, remove one
// participant, edit and reorder test questions, export questions, certificate text and score,
// privacy notice and automatic deletion of closed events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createStore } from '../server/store.js';
import { parsePolls, toImportText } from '../public/js/import.js';

const A = 'participant-aaaa';
const B = 'participant-bbbb';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function setup() {
  const store = createStore(openDb(':memory:'));
  const { code } = store.createEvent('Primăria A');
  return { store, code, ev: () => store.getEvent(code) };
}

function runSession(store, code, ev) {
  store.createPolls(ev(), [{ question: 'T1', options: ['a', 'b'], correct: [0] }, { question: 'T2', options: ['a', 'b'], correct: [1] }], 'test');
  const [pollId] = store.createPolls(ev(), [{ type: 'choice', question: 'Cine?', options: ['x', 'y'] }]);
  store.setPollStatus(ev(), pollId, 'live');
  store.vote(code, pollId, A, 'Ana Pop', [0]);
  store.vote(code, pollId, B, '', [1]);
  store.updateEvent(ev(), { settings: { testRound: 'post' } });
  const [t1] = store.adminState(ev()).testQuestions;
  store.vote(code, t1.id, A, 'Ana Pop', [0]);
  store.updateEvent(ev(), { settings: { testRound: null, certEnabled: true } });
  store.ask(code, B, '', 'O întrebare?');
  return { pollId, cert: store.issueCertificate(code, A, 'Ana Pop') };
}

test('duplicating an event copies the content and settings, not the people', () => {
  const { store, code, ev } = setup();
  store.setLogo(ev(), PNG);
  store.updateEvent(ev(), { settings: { certIssuer: 'DNSC', certMinScore: 50, certIntro: 'Se acordă', certShowScore: false, privacy: 'Notă\n\nRând 2', brand: { color: '#123456' } } });
  store.createScenario(ev(), '## start: A\n- x -> b\n- y -> b\n\n## b: [+] Gata');
  runSession(store, code, ev);
  store.setPollImage(ev(), store.adminState(ev()).polls[0].id, PNG);

  const copy = store.duplicateEvent(ev(), 'Primăria B');
  const e2 = store.getEvent(copy.code);
  assert.ok(store.verifyAdmin(copy.code, copy.adminKey));
  assert.equal(e2.name, 'Primăria B');
  const s = e2.settings;
  assert.equal(s.certEnabled, true);
  assert.equal(s.certIssuer, 'DNSC');
  assert.equal(s.certMinScore, 50);
  assert.equal(s.certIntro, 'Se acordă');
  assert.equal(s.certShowScore, false);
  assert.equal(s.privacy, 'Notă\n\nRând 2');
  assert.equal(s.brand.color, '#123456');
  assert.ok(s.brand.logo > 0 && store.getLogo(copy.code));
  assert.equal(s.closed, false);
  assert.equal(s.testRound, null);

  const admin = store.adminState(e2);
  assert.equal(admin.polls.length, 1);
  assert.equal(admin.polls[0].status, 'draft');
  assert.equal(admin.polls[0].results.responses, 0);
  assert.ok(admin.polls[0].image && store.getPollImage(copy.code, admin.polls[0].id));
  assert.deepEqual(admin.testQuestions.map((q) => q.question), ['T1', 'T2']);
  assert.equal(admin.scenarios.length, 1);
  assert.equal(admin.questions.length, 0);
  assert.equal(admin.certificates, 0);
  assert.equal(store.participantList(e2).length, 0);
  // the original is untouched
  assert.equal(store.adminState(ev()).polls[0].results.responses, 2);
});

test('resetting results keeps questions and settings, clears everything people did', () => {
  const { store, code, ev } = setup();
  const { cert } = runSession(store, code, ev);
  store.resetResults(ev());
  const admin = store.adminState(ev());
  assert.equal(admin.polls.length, 1);
  assert.equal(admin.polls[0].status, 'draft');
  assert.equal(admin.polls[0].results.responses, 0);
  assert.equal(admin.testQuestions.length, 2);
  assert.equal(admin.test.participants.post, 0);
  assert.equal(admin.questions.length, 0);
  assert.equal(admin.certificates, 0);
  assert.equal(store.certificateView(cert.id), null);
  assert.equal(store.participantList(ev()).length, 0);
  assert.equal(ev().settings.certEnabled, true);
});

test('participant list and deleting one participant', () => {
  const { store, code, ev } = setup();
  const { cert } = runSession(store, code, ev);
  const list = store.participantList(ev());
  assert.equal(list.length, 2);
  const ana = list.find((p) => p.id === A);
  assert.equal(ana.name, 'Ana Pop');
  assert.equal(ana.answers, 2);
  assert.equal(ana.post, 50);
  assert.equal(ana.pre, null);
  assert.equal(ana.certificate, cert.id);
  const b = list.find((p) => p.id === B);
  assert.equal(b.questions, 1);

  store.deleteParticipant(ev(), A);
  assert.deepEqual(store.participantList(ev()).map((p) => p.id), [B]);
  assert.equal(store.certificateView(cert.id), null);
  assert.equal(store.adminState(ev()).polls[0].results.responses, 1);
  assert.throws(() => store.deleteParticipant(ev(), 'x'), /invalid/);
});

test('certificate: custom text, score shown or hidden', () => {
  const { store, code, ev } = setup();
  const { cert } = runSession(store, code, ev);
  assert.equal(cert.intro, '');
  assert.equal(cert.score, 50);
  store.updateEvent(ev(), { settings: { certIntro: '  Prezentul   certificat se acordă  ', certShowScore: false } });
  const v = store.certificateView(cert.id);
  assert.equal(v.intro, 'Prezentul certificat se acordă');
  assert.equal(v.score, null);
  assert.throws(() => store.updateEvent(ev(), { settings: { certIntro: 'x'.repeat(121) } }), /cel mult 120/);
});

test('privacy notice keeps its paragraphs and has a length limit', () => {
  const { store, ev } = setup();
  store.updateEvent(ev(), { settings: { privacy: 'Operator: X  \r\n\r\n\r\n\r\nDate: nume\n' } });
  assert.equal(ev().settings.privacy, 'Operator: X\n\nDate: nume');
  assert.throws(() => store.updateEvent(ev(), { settings: { privacy: 'x'.repeat(3001) } }), /cel mult 3000/);
});

test('closed events are deleted after the retention period', () => {
  const { store, code, ev } = setup();
  const { code: open } = store.createEvent('Încă deschis');
  const day = 86_400_000;
  store.updateEvent(ev(), { settings: { closed: true } });
  const closedAt = ev().settings.closedAt;
  assert.ok(closedAt > 0);
  // re-saving another setting keeps the original closing time
  store.updateEvent(ev(), { settings: { closed: true, qaEnabled: false } });
  assert.equal(ev().settings.closedAt, closedAt);
  assert.deepEqual(store.purgeClosedEvents(0, closedAt + 400 * day), []);
  assert.deepEqual(store.purgeClosedEvents(30, closedAt + 29 * day), []);
  assert.deepEqual(store.purgeClosedEvents(30, closedAt + 31 * day), [code]);
  assert.equal(store.getEvent(code), null);
  assert.ok(store.getEvent(open));
  // reopening clears the clock
  const { code: c2 } = store.createEvent('Altul');
  store.updateEvent(store.getEvent(c2), { settings: { closed: true } });
  store.updateEvent(store.getEvent(c2), { settings: { closed: false } });
  assert.equal(store.getEvent(c2).settings.closedAt, 0);
});

test('test questions can be edited and reordered', () => {
  const { store, ev } = setup();
  store.createPolls(ev(), [{ question: 'T1', options: ['a', 'b'], correct: [0] }, { question: 'T2', options: ['a', 'b'], correct: [1] }], 'test');
  const [q1, q2] = store.adminState(ev()).testQuestions;
  store.updatePoll(ev(), q1.id, { type: 'quiz', question: 'T1 corectat', options: ['a', 'b', 'c'], correct: [2] });
  store.movePoll(ev(), q2.id, 'up');
  const after = store.adminState(ev()).testQuestions;
  assert.deepEqual(after.map((q) => q.question), ['T2', 'T1 corectat']);
  assert.deepEqual(after[1].options, ['a', 'b', 'c']);
  assert.deepEqual(after[1].correct, [2]);
});

test('export writes the import format back', () => {
  const polls = [
    { type: 'quiz', question: 'Ce e NIS2?', options: ['Directivă', 'ISO'], correct: [0], timeLimit: 30 },
    { type: 'choice', question: 'Cine?', options: ['A', 'B'], multi: true },
    { type: 'wordcloud', question: 'Un cuvânt' },
    { type: 'rating', question: 'Util?', scale: 10 },
    { type: 'open', question: 'Ce ai învățat?' },
    { type: 'ranking', question: 'Ordine', options: ['x', 'y'] },
    { type: 'scale', question: 'Cât?', options: ['a1', 'a2'], scale: 7 },
    { type: 'pin', question: 'Unde?' },
    { type: 'quiz', question: '- începe ca o opțiune', options: ['a', 'b'], correct: [1] },
  ];
  const back = parsePolls(toImportText(polls));
  assert.equal(back.length, polls.length);
  back.forEach((b, i) => {
    const a = polls[i];
    assert.equal(b.type, a.type);
    assert.equal(b.question, a.question.replace(/^- /, ''));
    assert.deepEqual(b.options || [], a.options || []);
    if (a.type === 'quiz') assert.deepEqual(b.correct, a.correct);
    if (a.scale) assert.equal(b.scale, a.scale);
    if (a.multi) assert.equal(b.multi, true);
    if (a.timeLimit) assert.equal(b.timeLimit, a.timeLimit);
  });
});

test('repeated options are refused, with a clear message', async () => {
  const { store, ev } = setup();
  assert.throws(() => store.createPolls(ev(), [{ type: 'choice', question: 'Cine?', options: ['Public authority', 'public  authority ', 'Vendor'] }]), /Întrebarea 1: Opțiunea „public authority” apare de două ori/);
  assert.throws(() => store.createPolls(ev(), [{ type: 'scale', question: 'Cât?', options: ['A', 'a'] }]), /Afirmația „a” apare de două ori/);
  const { toEnglish } = await import('../server/i18n.js');
  assert.equal(toEnglish('Întrebarea 2: Opțiunea „X” apare de două ori.'), 'Question 2: The option "X" appears twice.');
});

test('several polls can stay open; the projector shows the chosen one', () => {
  const { store, code, ev } = setup();
  const [a, b, c] = store.createPolls(ev(), [
    { type: 'choice', question: 'A?', options: ['x', 'y'] },
    { type: 'rating', question: 'B?' },
    { type: 'open', question: 'C?' },
  ]);
  store.setPollStatus(ev(), a, 'live');
  store.setPollStatus(ev(), b, 'live', { keepOthers: true });
  let aud = store.audienceState(ev());
  assert.deepEqual(aud.polls.map((p) => p.id), [b, a]); // newest first
  assert.equal(aud.poll.id, b);
  assert.equal(store.presenterState(ev()).poll.id, b);
  // answers go to either open poll
  store.vote(code, a, A, '', [0]);
  store.vote(code, b, A, '', [4]);
  // the organizer puts the older one back on screen
  store.showPollOnScreen(ev(), a);
  assert.equal(store.presenterState(ev()).poll.id, a);
  assert.equal(store.adminState(ev()).onScreen, a);
  // starting without keepOthers closes the open ones (the classic behaviour)
  store.setPollStatus(ev(), c, 'live');
  aud = store.audienceState(ev());
  assert.deepEqual(aud.polls.map((p) => p.id), [c]);
  assert.equal(store.presenterState(ev()).poll.id, c);
  assert.throws(() => store.vote(code, a, B, '', [1]), /nu mai primește/);
  // close all
  store.setPollStatus(ev(), a, 'live', { keepOthers: true });
  store.closeAllPolls(ev());
  assert.deepEqual(store.audienceState(ev()).polls, []);
  // the projector keeps showing the last chosen poll after everything closes
  assert.equal(store.presenterState(ev()).poll.id, a);
});

test('organizer accounts: each organizer sees and opens only their own events', async () => {
  const { createApp } = await import('../server/app.js');
  const { io: connect } = await import('socket.io-client');
  const server = createApp({ adminPassword: 'parola-admin-serverului' });
  await new Promise((r) => server.http.listen(0, r));
  const base = `http://localhost:${server.http.address().port}`;
  const post = (path, body, cookie) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const login = async (body) => { const r = await post('/api/panel/login', body); return r.ok ? r.headers.get('set-cookie').split(';')[0] : r.status; };
  const join = (cookie, code) => new Promise((resolve) => {
    const s = connect(base, { transports: ['websocket'], forceNew: true, extraHeaders: { cookie } });
    s.on('connect', () => s.emit('join', { code, role: 'admin' }, (r) => { s.close(); resolve(r); }));
  });
  try {
    const adminCookie = await login({ password: 'parola-admin-serverului' });
    // the administrator creates two organizer accounts (passwords are generated and shown once)
    const ana = await (await post('/api/panel/users', { username: 'Ana.Pop', name: 'Ana Pop' }, adminCookie)).json();
    const dan = await (await post('/api/panel/users', { username: 'dan', name: 'Dan Ion' }, adminCookie)).json();
    assert.equal(ana.username, 'ana.pop');
    assert.ok(ana.password.length >= 10);
    assert.equal((await post('/api/panel/users', { username: 'dan', name: 'Altul' }, adminCookie)).status, 400);
    assert.equal(await login({ username: 'ana.pop', password: 'gresit-gresit' }), 403);
    const anaCookie = await login({ username: 'ana.pop', password: ana.password });
    const danCookie = await login({ username: 'dan', password: dan.password });
    // organizers cannot manage accounts or server settings
    assert.equal((await post('/api/panel/users', { username: 'x1x', name: 'X' }, anaCookie)).status, 403);
    assert.equal((await post('/api/panel/settings', { openCreation: false }, anaCookie)).status, 403);

    const anaEvent = await (await post('/api/events', { name: 'Sesiunea Anei' }, anaCookie)).json();
    const danEvent = await (await post('/api/events', { name: 'Sesiunea lui Dan' }, danCookie)).json();
    const list = async (cookie) => (await (await fetch(base + '/api/panel/events', { headers: { cookie } })).json()).events;
    assert.deepEqual((await list(anaCookie)).map((e) => e.code), [anaEvent.code]);
    assert.deepEqual((await list(danCookie)).map((e) => e.code), [danEvent.code]);
    // the administrator sees both, with their organizer, but none is theirs
    const all = await list(adminCookie);
    assert.equal(all.length, 2);
    assert.deepEqual(all.map((e) => e.ownerName).sort(), ['Ana Pop', 'Dan Ion']);
    assert.ok(all.every((e) => !e.mine));
    // and cannot take an organizer's event for themself
    assert.equal((await post(`/api/panel/events/${anaEvent.code}/owner`, { ownerId: 0 }, adminCookie)).status, 400);
    assert.ok((await join(adminCookie, anaEvent.code)).error);

    // nobody gets into someone else's event: admin page, report, export, new link
    assert.ok((await join(anaCookie, anaEvent.code)).ok);
    assert.ok((await join(anaCookie, danEvent.code)).error);
    assert.ok((await join(adminCookie, anaEvent.code)).error);
    assert.equal((await fetch(`${base}/api/events/${danEvent.code}/report`, { headers: { cookie: anaCookie } })).status, 403);
    assert.equal((await fetch(`${base}/api/events/${anaEvent.code}/report`, { headers: { cookie: adminCookie } })).status, 403);
    assert.equal((await fetch(`${base}/api/events/${danEvent.code}/export.csv`, { headers: { cookie: anaCookie } })).status, 403);
    assert.equal((await post(`/api/panel/events/${danEvent.code}/key`, {}, anaCookie)).status, 403);
    assert.equal((await post(`/api/panel/events/${danEvent.code}/duplicate`, {}, anaCookie)).status, 403);
    assert.equal((await fetch(`${base}/api/panel/events/${danEvent.code}`, { method: 'DELETE', headers: { cookie: anaCookie } })).status, 403);
    // the admin link still works for whoever has it
    assert.ok((await fetch(`${base}/api/events/${anaEvent.code}/report`, { headers: { 'X-Admin-Key': anaEvent.adminKey } })).ok);

    // a duplicate belongs to whoever made it
    const copy = await (await post(`/api/panel/events/${anaEvent.code}/duplicate`, { name: 'Copia Anei' }, anaCookie)).json();
    assert.equal((await list(anaCookie)).length, 2);
    assert.ok((await join(anaCookie, copy.code)).ok);

    // the organizer changes their password; the old one stops working
    assert.equal((await post('/api/panel/password', { current: 'nu-e-asta', next: 'parola-noua-ana-123' }, anaCookie)).status, 400);
    assert.ok((await post('/api/panel/password', { current: ana.password, next: 'parola-noua-ana-123' }, anaCookie)).ok);
    assert.equal(await login({ username: 'ana.pop', password: ana.password }), 403);
    assert.equal(typeof await login({ username: 'ana.pop', password: 'parola-noua-ana-123' }), 'string');

    // deleting an account ends its sessions; its events stay, without an owner, until reassigned
    assert.ok((await fetch(`${base}/api/panel/users/${dan.id}`, { method: 'DELETE', headers: { cookie: adminCookie } })).ok);
    assert.equal((await fetch(base + '/api/panel/events', { headers: { cookie: danCookie } })).status, 401);
    const orphan = (await list(adminCookie)).find((e) => e.code === danEvent.code);
    assert.equal(orphan.ownerId, null);
    await post(`/api/panel/events/${danEvent.code}/owner`, { ownerId: 0 }, adminCookie);
    assert.ok((await join(adminCookie, danEvent.code)).ok);
    // the administrator can delete any event (to keep the server tidy)
    assert.ok((await fetch(`${base}/api/panel/events/${copy.code}`, { method: 'DELETE', headers: { cookie: adminCookie } })).ok);
  } finally {
    await server.close();
  }
});
