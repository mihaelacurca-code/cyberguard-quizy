import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createStore } from '../server/store.js';
import { parseScenario, SCENARIO_EXAMPLE } from '../server/scenario.js';

const P = (n) => `participant-${String(n).padStart(4, '0')}`;

function setup() {
  const store = createStore(openDb(':memory:'));
  const { code } = store.createEvent('Tabletop');
  return { store, code, ev: () => store.getEvent(code) };
}

test('both built-in examples parse', () => {
  for (const lang of ['ro', 'en']) {
    const s = parseScenario(SCENARIO_EXAMPLE[lang]);
    assert.equal(s.start, 'start');
    assert.equal(s.steps.length, 6);
    assert.equal(s.steps.filter((x) => !x.options.length).length, 3);
    assert.equal(s.steps[0].options.filter((o) => o.good).length, 1);
  }
});

test('parser explains what is wrong, with the line', () => {
  assert.throws(() => parseScenario(''), /niciun pas/);
  assert.throws(() => parseScenario('Text fără pas'), /Rândul 1: scenariul trebuie să înceapă/);
  assert.throws(() => parseScenario('## start: A\n- Da -> b\n- Nu -> c\n\n## b: B'), /Rândul 3: pasul „c” nu există/);
  assert.throws(() => parseScenario('## start: A\n- Doar una -> b\n\n## b: B'), /o singură opțiune/);
  assert.throws(() => parseScenario('## start: A\n- Fără săgeată\n- Alta -> b\n\n## b: B'), /Rândul 2: opțiunea trebuie să spună/);
  assert.throws(() => parseScenario('## start: A\n- X -> start\n- Y -> start'), /niciun final/);
  const s = parseScenario('# Titlu\n## start: Început\nText\n* Bun -> fin | De ce\n- Rău -> fin\n\n## fin: [+] Final');
  assert.equal(s.title, 'Titlu');
  assert.deepEqual(s.steps[0].options[0], { label: 'Bun', next: 'fin', good: true, feedback: 'De ce' });
  assert.equal(s.steps[1].outcome, 'good');
});

test('a run: vote, hidden counts, reveal, majority branch, facilitator override, back, ending saved', () => {
  const { store, code, ev } = setup();
  const id = store.createScenario(ev(), SCENARIO_EXAMPLE.ro);
  store.startScenario(ev(), id);
  assert.equal(ev().settings.screen, 'scenario');

  // three vote "restart", two vote "isolate"
  [1, 2, 3].forEach((n) => store.scenarioVote(code, P(n), 1));
  [4, 5].forEach((n) => store.scenarioVote(code, P(n), 0));
  store.scenarioVote(code, P(5), 0); // changing your mind is allowed while voting
  let aud = store.audienceState(ev()).scenario;
  assert.equal(aud.voters, 5);
  assert.equal(aud.step.options[0].count, undefined, 'no counts while voting');
  assert.equal(aud.step.options[0].good, undefined, 'no hint while voting');
  assert.equal(store.adminState(ev()).scenario.step.options[1].count, 3, 'the facilitator sees live counts');
  assert.equal(store.personalState(code, P(1)).scenarioChoice, 1);

  store.revealScenario(ev());
  assert.throws(() => store.scenarioVote(code, P(9), 0), /s-a încheiat/);
  aud = store.audienceState(ev()).scenario;
  assert.equal(aud.step.options[0].good, true);
  assert.match(aud.step.options[0].feedback, /Izolarea/);

  store.advanceScenario(ev()); // majority: restart
  assert.equal(ev().settings.scenario.step, 'repornire');
  store.backScenario(ev());
  assert.equal(ev().settings.scenario.step, 'start');
  assert.equal(ev().settings.scenario.phase, 'reveal');

  store.advanceScenario(ev(), 0); // facilitator takes the room to "isolate"
  assert.throws(() => store.advanceScenario(ev()), /Nimeni n-a votat/);
  store.scenarioVote(code, P(1), 0);
  store.advanceScenario(ev()); // report -> good ending
  const end = store.audienceState(ev()).scenario;
  assert.equal(end.phase, 'end');
  assert.equal(end.step.outcome, 'good');
  assert.deepEqual(end.path.map((p) => [p.good, p.chosenBy]), [[true, 'facilitator'], [true, 'room']]);

  const runs = store.scenarioRuns(ev());
  assert.equal(runs.length, 1);
  assert.equal(runs[0].ending.outcome, 'good');
  assert.equal(runs[0].good, 2);
  assert.equal(store.reportData(ev()).scenarioRuns.length, 1);

  store.stopScenario(ev());
  assert.equal(store.audienceState(ev()).scenario, null);
});

test('ties go to the recommended option', () => {
  const { store, code, ev } = setup();
  const id = store.createScenario(ev(), SCENARIO_EXAMPLE.ro);
  store.startScenario(ev(), id);
  store.scenarioVote(code, P(1), 2);
  store.scenarioVote(code, P(2), 0);
  store.advanceScenario(ev());
  assert.equal(ev().settings.scenario.step, 'izolare');
});

test('deleting the running scenario stops it', () => {
  const { store, ev } = setup();
  const id = store.createScenario(ev(), SCENARIO_EXAMPLE.en);
  store.startScenario(ev(), id);
  store.deleteScenario(ev(), id);
  assert.equal(ev().settings.scenario, null);
  assert.equal(store.adminState(ev()).scenarios.length, 0);
});
