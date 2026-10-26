const test = require('node:test');
const assert = require('node:assert/strict');

const { runDossierBrief } = require('../src/brief/run');
const { buildLlmResult } = require('../src/brief/result');
const { decideLlmReuse, fingerprintDossier } = require('../src/brief/freshness');

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-04-10T07:00:00Z');
const at = (time) => `2026-04-10T${time}:00+02:00`;
const makeEvent = (id, title, startTime, endTime, extra = {}) => ({
  id, title, start: at(startTime), end: at(endTime), isAllDay: false, location: '', description: '', ...extra,
});
const collision = () => [
  makeEvent('a', 'Zahnarzt', '11:00', '12:00', { location: 'Praxis' }),
  makeEvent('b', 'Elternabend', '11:30', '13:00', { location: 'Schule' }),
];
const answer = { bullets: [{ text: 'Zahnarzt und Elternabend überschneiden sich.', facts: ['f1'], urgency: 'high' }] };

// A tiny in-memory "context cache" that behaves like generateDossierBrief does in index.js.
const makeSystem = () => {
  const state = { stored: null, modelCalls: 0, nowMs: NOW };
  const callModel = async () => {
    state.modelCalls += 1;
    return { text: JSON.stringify(answer), payload: {} };
  };
  const generate = async ({ events = collision(), force = false, failModel = false } = {}) => {
    const run = await runDossierBrief({
      events,
      now: state.nowMs,
      timeZone: TZ,
      locale: 'de',
      fingerprintOf: (dossier) => fingerprintDossier(dossier, { provider: 'p', model: 'm', privacyMode: 'cloud-redacted' }),
      reusePrevious: (fingerprint) => (decideLlmReuse({ previous: state.stored, fingerprint, force, now: state.nowMs, timeZone: TZ }).reuse
        ? { reusedFrom: state.stored }
        : null),
      callModel: failModel ? async () => { state.modelCalls += 1; throw new Error('provider down'); } : callModel,
      parseJson: JSON.parse,
    });
    if (run.reused) {
      return state.stored;
    }
    state.stored = buildLlmResult({ run, provider: 'p', model: 'm', privacyMode: 'cloud-redacted', now: new Date(state.nowMs) });
    return state.stored;
  };
  return { state, generate };
};

test('twenty display polls over an hour cost exactly one model call', async () => {
  const { state, generate } = makeSystem();
  for (let poll = 0; poll < 20; poll += 1) {
    state.nowMs = NOW + (poll * 3 * 60000);
    const result = await generate();
    assert.equal(result.status, 'ready');
  }
  assert.equal(state.modelCalls, 1);
});

test('a calendar change that matters asks again, one that does not matter does not', async () => {
  const { state, generate } = makeSystem();
  await generate();
  await generate({ events: [...collision(), makeEvent('far', 'Far away', '10:00', '11:00', { location: 'X' })].map((event) => (
    event.id === 'far' ? { ...event, start: '2026-05-20T10:00:00+02:00', end: '2026-05-20T11:00:00+02:00' } : event
  )) });
  assert.equal(state.modelCalls, 1, 'an event next month is not in the dossier');

  const moved = collision();
  moved[1] = makeEvent('b', 'Elternabend', '14:00', '15:00', { location: 'Schule' });
  await generate({ events: moved });
  assert.equal(state.modelCalls, 2, 'the collision is gone, the model is told');
});

test('"force" always asks again', async () => {
  const { state, generate } = makeSystem();
  await generate();
  await generate({ force: true });
  assert.equal(state.modelCalls, 2);
});

test('during a provider outage the model is asked once per back-off period, not on every poll', async () => {
  const { state, generate } = makeSystem();
  for (let poll = 0; poll < 10; poll += 1) {
    state.nowMs = NOW + (poll * 60000);
    const result = await generate({ failModel: true });
    assert.equal(result.degraded, true);
    assert.match(result.brief.householdView, /überschneidet sich/, 'the rule-based note is still shown');
  }
  assert.equal(state.modelCalls, 1, 'ten polls in ten minutes: one attempt');

  state.nowMs = NOW + (20 * 60000);
  await generate({ failModel: true });
  assert.equal(state.modelCalls, 2, 'retried after 15 minutes');
});

test('after the outage the next poll recovers with a real model answer', async () => {
  const { state, generate } = makeSystem();
  await generate({ failModel: true });
  state.nowMs = NOW + (20 * 60000);
  const result = await generate();
  assert.equal(result.degraded, false);
  assert.equal(state.modelCalls, 2);
});

test('a quiet day never calls the model and is not stored as a model result to reuse', async () => {
  const { state, generate } = makeSystem();
  const result = await generate({ events: [makeEvent('x', 'Lunch', '12:00', '13:00')] });
  assert.equal(result.reason, 'nothing_to_report');
  assert.equal(state.modelCalls, 0);
});
