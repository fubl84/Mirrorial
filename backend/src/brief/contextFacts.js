const { isUsefulContextFact } = require('./facts');

// Turns statements produced by the older context code (routes, weather, trips, hint rules) into dossier facts.
// Pure functions: the I/O (routing, forecasts) stays in index.js, this only classifies, filters and phrases.

const NOTABLE_WEATHER_BUCKETS = new Set(['rain', 'showers', 'stormy', 'snow']);

// The kind is only used for ordering and for tests; "must mention" kinds are decided elsewhere.
const classifyContextFactKind = (text) => {
  const value = `${text || ''}`;
  if (/\bLeave around\b|\btakes about\b|\bEstimated\b.*\bmin\b/i.test(value)) return 'route';
  if (/\b(weather|forecast|rain|snow|umbrella|dress warmly)\b/i.test(value)) return 'weather';
  if (/\bflight|train|boarding|departure|arrival|gate|terminal\b/i.test(value)) return 'transport';
  return 'context';
};

// strings: addedFacts coming from buildInsightFactsFromContext / hint rules / route / weather helpers.
const contextFactsFromStrings = ({ eventId, strings = [], source, privacyMode }) => strings
  .map((text) => `${text || ''}`.replace(/^(Primary action|Weather action|Action reminder):\s*/i, '').trim())
  .filter((text) => isUsefulContextFact(text, privacyMode))
  .map((text) => ({ eventId, kind: classifyContextFactKind(text), text, source }));

// "Anna has a birthday tomorrow." Age only when the household member allowed it.
const buildBirthdayFact = (birthdayContext) => {
  if (!birthdayContext || !Number.isFinite(birthdayContext.daysUntil) || birthdayContext.daysUntil > 2) {
    return null;
  }
  const name = `${birthdayContext.memberName || ''}`.trim();
  if (!name) {
    return null;
  }
  const when = birthdayContext.daysUntil === 0 ? 'today' : (birthdayContext.daysUntil === 1 ? 'tomorrow' : 'in 2 days');
  const age = birthdayContext.allowAgeReveal === true && Number.isFinite(birthdayContext.turning)
    ? ` and turns ${birthdayContext.turning}`
    : '';
  return { eventId: null, kind: 'birthday', text: `${name} has a birthday ${when}${age}.`, source: 'household' };
};

// Only worth a note when it changes what people should do. `day` is "today" or "tomorrow".
const buildWeatherFact = ({ forecast, bucket, day }) => {
  if (!forecast || !NOTABLE_WEATHER_BUCKETS.has(bucket) || !forecast.label) {
    return null;
  }
  const action = bucket === 'snow' ? 'Dress warmly.' : 'Take an umbrella or rain jacket.';
  return {
    eventId: null,
    kind: 'weather',
    text: `Forecast for ${day} at home: ${forecast.label}. ${action}`,
    source: 'weather',
  };
};

// Rain or snow forecast for the day of an outdoor plan. The forecast is for the whole day at home, not for the
// hour of the event, so the wording says "forecast for today/tomorrow" and not "it will rain at 15:00".
const buildOutdoorWeatherFact = ({ forecast, bucket, day, event }) => {
  if (!forecast || !NOTABLE_WEATHER_BUCKETS.has(bucket) || !forecast.label) {
    return null;
  }
  const title = `${event?.title || ''}`.replace(/\s+/g, ' ').trim().slice(0, 50);
  const action = bucket === 'snow' ? 'Dress warmly or plan an alternative.' : 'Plan an alternative or take rain gear.';
  return {
    eventId: event.id,
    kind: 'weather',
    text: `"${title}" is outdoors and the forecast for ${day} is ${forecast.label}. ${action}`,
    params: { bucket, day },
    source: 'weather',
  };
};

module.exports = {
  buildBirthdayFact,
  buildOutdoorWeatherFact,
  buildWeatherFact,
  classifyContextFactKind,
  contextFactsFromStrings,
};
