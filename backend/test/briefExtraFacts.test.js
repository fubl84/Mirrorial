const test = require('node:test');
const assert = require('node:assert/strict');

const { collectExtraFacts, focusDayLeavesHome } = require('../src/brief/extraFacts');

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-04-10T07:00:00Z'); // Fri 09:00 Berlin
const at = (time, date = '2026-04-10') => `${date}T${time}:00+02:00`;
const makeEvent = (id, title, startTime, endTime, extra = {}) => ({
  id, title, start: at(startTime, extra.date), end: at(endTime, extra.date), isAllDay: false, location: '', ...extra,
});
const rain = { forecast: { label: '5-9C, rain' }, bucket: 'rain' };
const sources = (overrides = {}) => ({
  contextStrings: () => [],
  hintStrings: async () => [],
  homeWeather: async () => rain,
  ...overrides,
});
const collect = (windowEvents, overrides = {}, extra = {}) => collectExtraFacts({
  windowEvents, now: NOW, timeZone: TZ, focus: 'today', privacyMode: 'cloud-redacted', sources: sources(overrides), ...extra,
});

test('weather is only mentioned when somebody leaves the house on the focus day', async () => {
  const away = makeEvent('a', 'Dentist', '11:00', '12:00', { location: 'Praxis Weber' });
  const noPlace = makeEvent('b', 'Lunch', '12:00', '13:00');
  const online = makeEvent('c', 'Call', '14:00', '15:00', { location: 'Zoom' });

  assert.ok((await collect([away])).facts.some((fact) => fact.kind === 'weather'));
  assert.ok(!(await collect([noPlace, online])).facts.some((fact) => fact.kind === 'weather'));
  assert.equal(focusDayLeavesHome({ windowEvents: [away], focus: 'tomorrow', now: NOW, timeZone: TZ }), false, 'today event, tomorrow focus');
});

test('clear weather never becomes a note', async () => {
  const away = makeEvent('a', 'Dentist', '11:00', '12:00', { location: 'Praxis Weber' });
  const result = await collect([away], { homeWeather: async () => ({ forecast: { label: '18-24C, clear' }, bucket: 'clear' }) });
  assert.ok(!result.facts.some((fact) => fact.kind === 'weather'));
});

test('context and hint statements are filtered by privacy mode and attached to their event', async () => {
  const event = makeEvent('a', 'Physio', '11:00', '12:00', { location: 'Praxis' });
  const overrides = {
    contextStrings: () => ['Leave around 10:30 for on-time arrival.', 'Matched household keyword: physio.'],
    hintStrings: async () => ['Known prep note: Bring the MRI images.', 'Weather action: Take an umbrella just in case.'],
  };
  const redacted = await collect([event], overrides);
  assert.deepEqual(
    redacted.facts.filter((fact) => fact.eventId === 'a').map((fact) => fact.text),
    ['Leave around 10:30 for on-time arrival.', 'Take an umbrella just in case.'],
  );
  const full = await collect([event], overrides, { privacyMode: 'full' });
  assert.ok(full.facts.some((fact) => fact.text.startsWith('Known prep note')));
});

test('a failing lookup is reported but does not stop the other facts', async () => {
  const events = [makeEvent('a', 'Dentist', '11:00', '12:00', { location: 'Praxis' }), makeEvent('b', 'Physio', '14:00', '15:00', { location: 'Praxis' })];
  const result = await collect(events, {
    hintStrings: async (event) => {
      if (event.id === 'a') throw new Error('routing timeout');
      return ['Leave around 13:30 for on-time arrival.'];
    },
    homeWeather: async () => { throw new Error('weather down'); },
  });
  assert.ok(result.facts.some((fact) => fact.eventId === 'b' && /13:30/.test(fact.text)));
  assert.deepEqual(result.problems.map((problem) => problem.label).sort(), ['hint:a', 'weather']);
  assert.ok(result.problems.every((problem) => problem.error));
});

test('birthdays are added without an event', async () => {
  const result = await collect([], {}, { birthdayContext: { memberName: 'Anna', daysUntil: 1, turning: 7, allowAgeReveal: false } });
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].text, 'Anna has a birthday tomorrow.');
  assert.equal(result.facts[0].eventId, null);
});
