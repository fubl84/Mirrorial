const { collectExtraFacts } = require('../../src/brief/extraFacts');

// Shared setup for the outdoor-weather tests.
const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-04-10T07:00:00Z'); // Fri 09:00 Berlin
const at = (time, date = '2026-04-10') => `${date}T${time}:00+02:00`;
const makeEvent = (id, title, startTime, endTime, extra = {}) => ({
  id, title, start: at(startTime, extra.date), end: at(endTime, extra.date), isAllDay: false, location: '', description: '', ...extra,
});
const rain = { forecast: { label: '5-9C, rain' }, bucket: 'rain' };
const snow = { forecast: { label: '-3-1C, snow' }, bucket: 'snow' };
const clear = { forecast: { label: '18-24C, clear' }, bucket: 'clear' };

const sources = (weatherByDay) => ({
  contextStrings: () => [],
  hintStrings: async () => [],
  homeWeather: async (day) => (typeof weatherByDay === 'function' ? weatherByDay(day) : weatherByDay),
});
const collect = (windowEvents, weather, extra = {}) => collectExtraFacts({
  windowEvents, now: NOW, timeZone: TZ, focus: 'today', privacyMode: 'cloud-redacted', sources: sources(weather), ...extra,
});
const weatherFacts = (result) => result.facts.filter((fact) => fact.kind === 'weather');

module.exports = { NOW, TZ, at, clear, collect, makeEvent, rain, snow, weatherFacts };
