import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createStore, UserError } from '../server/store.js';

const P1 = 'participant-one';
const P2 = 'participant-two';

function setup() {
  const store = createStore(openDb(':memory:'));
  const { code, adminKey } = store.createEvent('Test');
  return { store, code, adminKey, ev: () => store.getEvent(code) };
}

test('event code and admin key', () => {
  const { store, code, adminKey } = setup();
  assert.match(code, /^[A-Z2-9]{6}$/);
  assert.ok(store.verifyAdmin(code, adminKey));
  assert.ok(store.verifyAdmin(code.toLowerCase(), adminKey));
  assert.equal(store.verifyAdmin(code, 'wrong'), null);
  assert.throws(() => store.createEvent('  '), UserError);
});

test('single choice: one vote per participant, can change it', () => {
  const { store, code, ev } = setup();
  const id = store.createPoll(ev(), { type: 'choice', question: 'Culoare?', options: ['Roșu', 'Verde', ''] });
  assert.throws(() => store.vote(code, id, P1, '', [0]), /nu mai primește/);
  store.setPollStatus(ev(), id, 'live');
  store.vote(code, id, P1, '', [0]);
  store.vote(code, id, P1, '', [1]);
  store.vote(code, id, P2, '', [1]);
  assert.throws(() => store.vote(code, id, P2, '', [0, 1]), /singură/);
  const poll = store.audienceState(ev()).poll;
  assert.deepEqual(poll.options, ['Roșu', 'Verde']);
  assert.deepEqual(poll.results.counts, [0, 2]);
  assert.equal(poll.results.voters, 2);
});

test('only one live poll at a time and screen follows it', () => {
  const { store, ev } = setup();
  const a = store.createPoll(ev(), { type: 'rating', question: 'A' });
  const b = store.createPoll(ev(), { type: 'rating', question: 'B' });
  store.setPollStatus(ev(), a, 'live');
  store.setPollStatus(ev(), b, 'live');
  const polls = store.adminState(ev()).polls;
  assert.deepEqual(polls.map((p) => p.status), ['closed', 'live']);
  assert.equal(ev().settings.screen, 'poll');
});

test('quiz: locked answer, correct hidden until reveal, leaderboard', () => {
  const { store, code, ev } = setup();
  const id = store.createPoll(ev(), { type: 'quiz', question: '2+2?', options: ['3', '4'], correct: [1], timeLimit: 30 });
  store.setPollStatus(ev(), id, 'live');
  store.vote(code, id, P1, 'Ana', [1]);
  store.vote(code, id, P2, 'Ion', [0]);
  assert.throws(() => store.vote(code, id, P1, 'Ana', [0]), /deja/);
  let poll = store.audienceState(ev()).poll;
  assert.equal(poll.correct, undefined);
  assert.equal(poll.results, undefined, 'quiz results hidden before reveal');
  assert.equal(store.leaderboard(ev()).length, 0);

  store.revealQuiz(ev(), id);
  poll = store.presenterState(ev()).poll;
  assert.deepEqual(poll.correct, [1]);
  assert.equal(poll.status, 'live', 'stays on screen after reveal');
  assert.throws(() => store.vote(code, id, 'late-participant', '', [1]), /dezvăluit/);
  const lb = store.leaderboard(ev());
  assert.equal(lb[0].name, 'Ana');
  assert.ok(lb[0].score >= 900);
  assert.equal(lb[1].score, 0);
  assert.equal(store.personalState(code, P1).score.rank, 1);
});

test('word cloud merges case and limits entries', () => {
  const { store, code, ev } = setup();
  const id = store.createPoll(ev(), { type: 'wordcloud', question: 'Un cuvânt', maxEntries: 2 });
  store.setPollStatus(ev(), id, 'live');
  store.vote(code, id, P1, '', 'Inovație');
  store.vote(code, id, P1, '', 'echipă');
  assert.throws(() => store.vote(code, id, P1, '', 'altceva'), /cel mult 2/);
  store.vote(code, id, P2, '', '  inovație ');
  const words = store.adminState(ev()).polls[0].results.words;
  assert.deepEqual(words[0], { word: 'Inovație', count: 2 });
});

test('editing options is blocked once there are votes', () => {
  const { store, code, ev } = setup();
  const id = store.createPoll(ev(), { type: 'choice', question: 'Q', options: ['a', 'b'] });
  store.setPollStatus(ev(), id, 'live');
  store.vote(code, id, P1, '', [0]);
  assert.throws(() => store.updatePoll(ev(), id, { type: 'choice', question: 'Q', options: ['a', 'c'] }), /Resetează/);
  store.updatePoll(ev(), id, { type: 'choice', question: 'Q nou', options: ['a', 'b'] });
  store.resetPoll(ev(), id);
  store.updatePoll(ev(), id, { type: 'choice', question: 'Q', options: ['a', 'c'] });
});

test('Q&A: moderation, upvotes, highlight', () => {
  const { store, code, ev } = setup();
  const visible = store.ask(code, P1, 'Ana', 'Prima întrebare?');
  assert.equal(visible.status, 'visible');
  store.updateEvent(ev(), { settings: { qaModeration: true } });
  const pending = store.ask(code, P2, '', 'A doua?');
  assert.equal(pending.status, 'pending');
  assert.equal(store.audienceState(ev()).questions.length, 1);
  assert.throws(() => store.toggleUpvote(code, P1, pending.id), UserError);

  assert.equal(store.toggleUpvote(code, P2, visible.id), true);
  assert.equal(store.toggleUpvote(code, P2, visible.id), false);
  store.toggleUpvote(code, P2, visible.id);

  store.moderate(ev(), pending.id, 'approve');
  store.moderate(ev(), pending.id, 'highlight');
  const qs = store.audienceState(ev()).questions;
  assert.equal(qs[0].id, pending.id, 'highlighted first');
  assert.equal(qs[1].votes, 1);
  assert.equal(ev().settings.screen, 'qa');
  assert.deepEqual(store.personalState(code, P2).upvotes, [visible.id]);
});

test('closed event refuses input', () => {
  const { store, code, ev } = setup();
  const id = store.createPoll(ev(), { type: 'rating', question: 'Notă', scale: 10 });
  store.setPollStatus(ev(), id, 'live');
  store.updateEvent(ev(), { settings: { closed: true } });
  assert.throws(() => store.vote(code, id, P1, '', 7), /închis/);
  assert.throws(() => store.ask(code, P1, '', 'x'), /închis/);
});

test('export guards against spreadsheet formulas', () => {
  const { store, code, ev } = setup();
  const id = store.createPoll(ev(), { type: 'open', question: 'Feedback' });
  store.setPollStatus(ev(), id, 'live');
  store.vote(code, id, P1, '', '=HYPERLINK("x")');
  const rows = store.exportRows(ev());
  assert.equal(rows[1][4], '=HYPERLINK("x")');
});

test('no hard caps on participants or polls', () => {
  const { store, code, ev } = setup();
  for (let i = 0; i < 300; i++) store.createPoll(ev(), { type: 'rating', question: `Q${i}` });
  const id = store.adminState(ev()).polls.at(-1).id;
  store.setPollStatus(ev(), id, 'live');
  for (let i = 0; i < 2000; i++) store.vote(code, id, `participant-${i}`, '', (i % 5) + 1);
  assert.equal(store.audienceState(ev()).poll.results.voters, 2000);
});
