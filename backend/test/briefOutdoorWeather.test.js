const test = require('node:test');
const assert = require('node:assert/strict');

const { isOutdoorEvent } = require('../src/brief/extraFacts');
const { buildOutdoorWeatherFact } = require('../src/brief/contextFacts');
const { clear, collect, makeEvent, rain, snow, weatherFacts } = require('./helpers/outdoor');

test('what counts as an outdoor plan', () => {
  assert.equal(isOutdoorEvent(makeEvent('a', 'Grillen im Garten', '17:00', '20:00', { location: 'Garten' })), true, 'German "Grillen"');
  assert.equal(isOutdoorEvent(makeEvent('a', 'Spielplatz mit Lena', '15:00', '16:30')), true);
  assert.equal(isOutdoorEvent(makeEvent('a', 'Gartenarbeit', '10:00', '12:00', { location: 'Garten' })), false, 'a place word alone is not enough');
  assert.equal(isOutdoorEvent(makeEvent('a', 'BBQ bei Anna', '17:00', '20:00')), true);
  assert.equal(isOutdoorEvent(makeEvent('a', 'Ausflug', '10:00', '12:00', { location: 'Zoo Münster' })), true);
  assert.equal(isOutdoorEvent(makeEvent('a', 'Picnic', '12:00', '14:00', { isAllDay: true })), false, 'all-day: no hour to be rained on');
  assert.equal(isOutdoorEvent(makeEvent('a', 'Park Planning Call', '10:00', '11:00', { location: 'Zoom' })), false, 'online');
  assert.equal(isOutdoorEvent(makeEvent('a', 'Zahnarzt', '10:00', '11:00', { location: 'Praxis' })), false);
});

test('rain on the day of an outdoor plan gives a warning that names the plan', async () => {
  const bbq = makeEvent('a', 'BBQ bei Anna', '17:00', '20:00', { location: 'Anna zuhause' });
  const facts = weatherFacts(await collect([bbq], rain));
  assert.equal(facts.length, 1, 'one warning, not the warning plus the general weather note');
  assert.equal(facts[0].eventId, 'a');
  assert.match(facts[0].text, /"BBQ bei Anna" is outdoors/);
  assert.match(facts[0].text, /forecast for today is 5-9C, rain/);
  assert.match(facts[0].text, /alternative/);
});

test('snow gets a snow wording, not "rain gear"', async () => {
  const facts = weatherFacts(await collect([makeEvent('a', 'Wandertag Picnic', '10:00', '14:00')], snow));
  assert.match(facts[0].text, /Dress warmly/);
  assert.doesNotMatch(facts[0].text, /rain gear/);
});

test('good weather produces no warning at all', async () => {
  assert.deepEqual(weatherFacts(await collect([makeEvent('a', 'BBQ', '17:00', '20:00', { location: 'Garten' })], clear)), []);
});

test('the forecast is asked for the right day: an outdoor plan tomorrow uses tomorrow', async () => {
  const asked = [];
  const tomorrow = makeEvent('a', 'Picnic', '12:00', '14:00', { date: '2026-04-11' });
  const result = await collect([tomorrow], (day) => { asked.push(day); return day === 'tomorrow' ? rain : clear; });
  assert.deepEqual(asked, ['tomorrow']);
  assert.match(weatherFacts(result)[0].text, /forecast for tomorrow/);
});

test('buildOutdoorWeatherFact refuses incomplete input', () => {
  const event = { id: 'a', title: 'Picnic' };
  assert.equal(buildOutdoorWeatherFact({ forecast: null, bucket: 'rain', day: 'today', event }), null);
  assert.equal(buildOutdoorWeatherFact({ forecast: { label: '' }, bucket: 'rain', day: 'today', event }), null);
  assert.equal(buildOutdoorWeatherFact({ forecast: { label: 'x' }, bucket: 'clear', day: 'today', event }), null);
});
