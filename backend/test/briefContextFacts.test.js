const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBirthdayFact,
  buildWeatherFact,
  classifyContextFactKind,
  contextFactsFromStrings,
} = require('../src/brief/contextFacts');

test('context strings are classified by what they describe', () => {
  assert.equal(classifyContextFactKind('Estimated car from Home to Praxis takes about 25 min.'), 'route');
  assert.equal(classifyContextFactKind('Leave around 08:15 for on-time arrival.'), 'route');
  assert.equal(classifyContextFactKind('Ahlen weather: 5-19C, rain.'), 'weather');
  assert.equal(classifyContextFactKind('Take an umbrella just in case.'), 'weather');
  assert.equal(classifyContextFactKind('Boarding starts soon.'), 'transport');
  assert.equal(classifyContextFactKind('Bring the insurance card.'), 'context');
});

test('filler and private statements are filtered, action prefixes are removed', () => {
  const strings = [
    'Matched household keyword: physio.',
    'Known city hints: Hamburg.',
    'Weather action: Take an umbrella just in case.',
    'Leave around 10:30 for on-time arrival.',
    'Known prep note: Bring the MRI images.',
    '',
  ];
  const redacted = contextFactsFromStrings({ eventId: 'a', strings, source: 'hint', privacyMode: 'cloud-redacted' });
  assert.deepEqual(redacted.map((fact) => fact.text), ['Take an umbrella just in case.', 'Leave around 10:30 for on-time arrival.']);
  assert.deepEqual(redacted.map((fact) => fact.kind), ['weather', 'route']);
  assert.ok(redacted.every((fact) => fact.eventId === 'a' && fact.source === 'hint'));

  const full = contextFactsFromStrings({ eventId: 'a', strings, source: 'hint', privacyMode: 'full' });
  assert.ok(full.some((fact) => fact.text.startsWith('Known prep note')));
  assert.ok(!full.some((fact) => fact.text.startsWith('Matched household keyword')));
});

test('birthday facts only appear within two days and only reveal the age when allowed', () => {
  assert.equal(buildBirthdayFact(null), null);
  assert.equal(buildBirthdayFact({ memberName: 'Anna', daysUntil: 5 }), null);
  assert.equal(buildBirthdayFact({ memberName: '', daysUntil: 0 }), null);
  assert.equal(buildBirthdayFact({ memberName: 'Anna', daysUntil: 0, turning: 7, allowAgeReveal: false }).text, 'Anna has a birthday today.');
  assert.equal(buildBirthdayFact({ memberName: 'Anna', daysUntil: 1, turning: 7, allowAgeReveal: true }).text, 'Anna has a birthday tomorrow and turns 7.');
  assert.equal(buildBirthdayFact({ memberName: 'Anna', daysUntil: 2 }).text, 'Anna has a birthday in 2 days.');
});

test('weather only becomes a fact for rain or snow, with a matching action', () => {
  const forecast = { label: '5-9C, rain' };
  assert.equal(buildWeatherFact({ forecast, bucket: 'clear', day: 'today' }), null);
  assert.equal(buildWeatherFact({ forecast: null, bucket: 'rain', day: 'today' }), null);
  assert.match(buildWeatherFact({ forecast, bucket: 'rain', day: 'today' }).text, /^Forecast for today at home: 5-9C, rain\. Take an umbrella/);
  assert.match(buildWeatherFact({ forecast: { label: '-3-0C, snow' }, bucket: 'snow', day: 'tomorrow' }).text, /Dress warmly/);
});
