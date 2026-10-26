const { buildBirthdayFact, buildOutdoorWeatherFact, buildWeatherFact, contextFactsFromStrings } = require('./contextFacts');
const { HOUSEHOLD_EVENT_PATTERNS } = require('./householdPatterns');
const { getEventDayKey, getLocalDateKey } = require('../time/zone');

// Collects the facts that come from outside the calendar (routes, trips, hint rules, weather, birthdays).
// All I/O is injected through `sources`, so this stays testable and one failing lookup never breaks the brief:
//   sources.contextStrings(event)  -> string[]            trip / commute / household facts for one event
//   sources.hintStrings(event)     -> Promise<string[]>   hint-rule, route and weather facts for one event
//   sources.homeWeather(day)       -> Promise<{ forecast, bucket } | null>

const ONLINE_PATTERN = /\b(online|remote|zoom|teams|webex|video ?call)\b/i;

// A timed plan that is outside: "barbecue", "picnic", "zoo", ... in the title or place. Online meetings that
// merely mention a park in the room name are not outdoors, and all-day entries have no hour to be rained on.
// The shared household pattern only knows "grill", not "Grillen"/"Grillfest", and misses a few common German
// outdoor words; those are added here (not in the shared pattern, which other code relies on).
const GERMAN_OUTDOOR_PATTERN = /\b(grill\w*|wanderung|spielplatz|freibad|ausflug|gartenfest)\b/i;

const isOutdoorEvent = (event) => {
  const text = `${event.title || ''} ${event.location || ''}`;
  return !event.isAllDay
    && !ONLINE_PATTERN.test(text)
    && (HOUSEHOLD_EVENT_PATTERNS.outdoor_plan.test(text) || GERMAN_OUTDOOR_PATTERN.test(text));
};

// Weather only matters when somebody leaves the house on the focus day: at least one timed, non-online event
// with a place. The weather module already shows the forecast; repeating it as a note would be noise.
const focusDayLeavesHome = ({ windowEvents, focus, now, timeZone }) => {
  const todayKey = getLocalDateKey(now, timeZone);
  return windowEvents.some((event) => {
    if (event.isAllDay || !`${event.location || ''}`.trim() || ONLINE_PATTERN.test(`${event.title} ${event.location}`)) {
      return false;
    }
    const isToday = getEventDayKey(event, timeZone) === todayKey;
    return focus === 'today' ? isToday : !isToday;
  });
};

const safely = async (label, fn, problems) => {
  try {
    return await fn();
  } catch (error) {
    problems.push({ label, error: `${error?.message || error}` });
    return null;
  }
};

const collectExtraFacts = async ({
  windowEvents,
  now,
  timeZone,
  focus,
  privacyMode,
  birthdayContext = null,
  sources,
}) => {
  const facts = [];
  const problems = [];

  for (const event of windowEvents) {
    const strings = await safely(`context:${event.id}`, async () => sources.contextStrings(event), problems);
    facts.push(...contextFactsFromStrings({ eventId: event.id, strings: strings || [], source: 'context', privacyMode }));

    const hintStrings = await safely(`hint:${event.id}`, async () => sources.hintStrings(event), problems);
    facts.push(...contextFactsFromStrings({ eventId: event.id, strings: hintStrings || [], source: 'hint', privacyMode }));
  }

  const birthday = buildBirthdayFact(birthdayContext);
  if (birthday) {
    facts.push(birthday);
  }

  // Outdoor plans get their own warning, on the event itself: "rain is forecast and the barbecue is outside".
  // It replaces the general home-weather note for that day (it says the same thing, only more usefully).
  const outdoorDays = new Set();
  const outdoorEvents = windowEvents.filter(isOutdoorEvent);
  if (outdoorEvents.length > 0) {
    const todayKey = getLocalDateKey(now, timeZone);
    const forecasts = new Map();
    for (const event of outdoorEvents) {
      const day = getEventDayKey(event, timeZone) === todayKey ? 'today' : 'tomorrow';
      if (!forecasts.has(day)) {
        forecasts.set(day, await safely(`weather:${day}`, async () => sources.homeWeather(day), problems));
      }
      const weather = forecasts.get(day);
      const fact = weather ? buildOutdoorWeatherFact({ forecast: weather.forecast, bucket: weather.bucket, day, event }) : null;
      if (fact) {
        facts.push(fact);
        outdoorDays.add(day);
      }
    }
  }

  if (!outdoorDays.has(focus) && focusDayLeavesHome({ windowEvents, focus, now, timeZone })) {
    const weather = await safely('weather', async () => sources.homeWeather(focus), problems);
    const fact = weather ? buildWeatherFact({ forecast: weather.forecast, bucket: weather.bucket, day: focus }) : null;
    if (fact) {
      facts.push(fact);
    }
  }

  return { facts, problems };
};

module.exports = {
  collectExtraFacts,
  focusDayLeavesHome,
  isOutdoorEvent,
};
