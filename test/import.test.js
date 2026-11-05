import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePolls } from '../public/js/import.js';
import { openDb } from '../server/db.js';
import { createStore } from '../server/store.js';

const TEXT = `Who are you?
- Public authority · CSIRT/SOC
- Essential or important entity
- Other

2. Ce înseamnă NIS2? [30s]
* Directivă UE
- Standard ISO
[multiplu] Ce teme vă interesează?
- AI
- Cloud

[nor] Un cuvânt
[nota 10] Cât de util?

Ce ai învățat
azi?`;

test('parses every poll type from pasted text', () => {
  const polls = parsePolls(TEXT);
  assert.deepEqual(polls.map((p) => p.type), ['choice', 'quiz', 'choice', 'wordcloud', 'rating', 'open']);
  assert.deepEqual(polls[0].options, ['Public authority · CSIRT/SOC', 'Essential or important entity', 'Other']);
  assert.equal(polls[1].question, 'Ce înseamnă NIS2?');
  assert.deepEqual(polls[1].correct, [0]);
  assert.equal(polls[1].timeLimit, 30);
  assert.equal(polls[2].multi, true);
  assert.equal(polls[3].question, 'Un cuvânt');
  assert.equal(polls[4].scale, 10);
  assert.equal(polls[5].question, 'Ce ai învățat azi?');
});

test('import is all-or-nothing', () => {
  const store = createStore(openDb(':memory:'));
  const { code } = store.createEvent('Import');
  const ev = store.getEvent(code);
  assert.equal(store.createPolls(ev, parsePolls(TEXT)).length, 6);
  assert.throws(() => store.createPolls(ev, parsePolls('Bună?\n- doar una\n\nAltă întrebare')), /Întrebarea 1/);
  assert.equal(store.adminState(ev).polls.length, 6);
});
