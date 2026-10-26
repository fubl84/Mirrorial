const { buildBirthdayFact, buildWeatherFact, contextFactsFromStrings } = require('./contextFacts');
const { getEventDayKey, getLocalDateKey } = require('../time/zone');

// Collects the facts that come from outside the calendar (routes, trips, hint rules, weather, birthdays).
// All I/O is injected through `sources`, so this stays testable and one failing lookup never breaks the brief:
//   sources.contextStrings(event)  -> string[]            trip / commute / household facts for one event
//   sources.hintStrings(event)     -> Promise<string[]>   hint-rule, route and weather facts for one event
//   sources.homeWeather(day)       -> Promise<{ forecast, bucket } | null>

const ONLINE_PATTERN = /\b(online|remote|zoom|teams|webex|video ?call)\b/i;

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

  if (focusDayLeavesHome({ windowEvents, focus, now, timeZone })) {
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
};
