const test = require('node:test');
const assert = require('node:assert/strict');

const { runDossierBrief } = require('../src/brief/run');
const { NOW, TZ, collect, makeEvent, rain, weatherFacts } = require('./helpers/outdoor');

test('two outdoor plans on one day cost one forecast lookup and each gets its own warning', async () => {
  let calls = 0;
  const events = [makeEvent('a', 'Picnic', '12:00', '14:00'), makeEvent('b', 'Zoo', '15:00', '17:00')];
  const result = await collect(events, () => { calls += 1; return rain; });
  assert.equal(calls, 1);
  assert.deepEqual(weatherFacts(result).map((fact) => fact.eventId), ['a', 'b']);
});

test('without an outdoor plan the general home-weather note works as before', async () => {
  const facts = weatherFacts(await collect([makeEvent('a', 'Dentist', '11:00', '12:00', { location: 'Praxis Weber' })], rain));
  assert.equal(facts.length, 1);
  assert.equal(facts[0].eventId, null);
  assert.match(facts[0].text, /Forecast for today at home/);
});

test('an outdoor plan tomorrow does not suppress today\'s general note', async () => {
  const events = [
    makeEvent('a', 'Dentist', '11:00', '12:00', { location: 'Praxis Weber' }),
    makeEvent('b', 'Picnic', '12:00', '14:00', { date: '2026-04-11' }),
  ];
  assert.equal(weatherFacts(await collect(events, rain)).length, 2);
});

test('a failing forecast lookup is reported and the brief goes on without the warning', async () => {
  const result = await collect([makeEvent('a', 'Picnic', '12:00', '14:00')], () => { throw new Error('open-meteo down'); });
  assert.deepEqual(weatherFacts(result), []);
  assert.equal(result.problems.length > 0, true);
  assert.match(result.problems[0].error, /open-meteo down/);
});

test('end to end: the warning reaches the model as a fact it can cite, and the brief is not empty', async () => {
  const events = [makeEvent('a', 'BBQ bei Anna', '17:00', '20:00', { location: 'Anna zuhause' })];
  const { facts } = await collect(events, rain);
  let prompt = '';
  const run = await runDossierBrief({
    events, now: NOW, timeZone: TZ, locale: 'de', extraFacts: facts,
    callModel: async ({ prompt: sent }) => {
      prompt = sent;
      const data = JSON.parse(sent.slice(sent.indexOf('DATA:') + 5));
      const weather = data.facts.find((fact) => fact.kind === 'weather');
      return { text: JSON.stringify({ bullets: [{ text: 'Beim Grillen bei Anna ist Regen angesagt, plane eine Alternative ein.', facts: [weather.ref], urgency: 'normal' }] }) };
    },
    parseJson: JSON.parse,
  });
  assert.equal(run.status, 'ready');
  assert.match(prompt, /is outdoors and the forecast for today is 5-9C, rain/);
  assert.equal(run.bullets.length, 1);
  assert.match(run.bullets[0].text, /Regen/);
});
