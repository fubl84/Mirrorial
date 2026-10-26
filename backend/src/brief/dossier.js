const { addDaysToKey, formatLocalTime, formatWeekdayDate, getEventDayKey, getLocalDateKey, getLocalHour, safeTimeZone } = require('../time/zone');
const {
  buildDayFacts,
  buildScheduleFacts,
  cleanText,
  getAllDaySpanDays,
  timeRange,
} = require('./facts');
const { dedupeEvents } = require('./schedule');

// The dossier is the only thing the model sees: a small, flat, pre-computed picture of the next two days.
// Events and facts get short refs (e1.., f1..) so every statement in the answer can be checked against them.

const DEFAULT_MAX_EVENTS = 14;
const EVENING_FOCUS_HOUR = 18;
const DESCRIPTION_MAX = 160;

// Before 18:00 the user is looking at the day itself, afterwards tomorrow becomes the focus.
const getBriefFocus = (now, timeZone) => (getLocalHour(now, timeZone) >= EVENING_FOCUS_HOUR ? 'tomorrow' : 'today');

const startMsOf = (event) => Date.parse(event.start);
const endMsOf = (event) => {
  const end = Date.parse(event.end);
  return Number.isNaN(end) ? startMsOf(event) : end;
};

const describeWhen = (event, timeZone) => {
  if (event.isAllDay) {
    const days = getAllDaySpanDays(event);
    return days > 1 ? `all day, ${days} days from ${event.start.slice(0, 10)}` : 'all day';
  }
  return endMsOf(event) <= startMsOf(event) ? formatLocalTime(startMsOf(event), timeZone) : timeRange(event, timeZone);
};

// Events for the window: not finished, allowed by the selection rules, starting today or tomorrow.
// Duplicates are merged first.
const pickWindowEvents = ({ events, now, timeZone, isIncluded }) => {
  const lastKey = addDaysToKey(getLocalDateKey(now, timeZone), 1);

  return dedupeEvents(events).filter((event) => {
    if (Number.isNaN(startMsOf(event)) || endMsOf(event) < now) {
      return false;
    }
    if (isIncluded && !isIncluded(event)) {
      return false;
    }
    const startKey = getEventDayKey(event, timeZone);
    return Boolean(startKey) && startKey <= lastKey;
  }).sort((left, right) => startMsOf(left) - startMsOf(right));
};

// extraFacts: [{ eventId?, kind, text, params?, source }] computed elsewhere (weather, routes, birthdays, hints).
const buildDossier = ({
  events,
  now = Date.now(),
  timeZone = 'UTC',
  locale = 'en',
  privacyMode = 'cloud-redacted',
  extraFacts = [],
  isIncluded = null,
  maxEvents = DEFAULT_MAX_EVENTS,
}) => {
  const zone = safeTimeZone(timeZone);
  const todayKey = getLocalDateKey(now, zone);
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const windowEvents = pickWindowEvents({ events, now, timeZone: zone, isIncluded }).slice(0, maxEvents);

  const dayOf = (event) => (getEventDayKey(event, zone) === todayKey ? 'today' : 'tomorrow');
  const sendNotes = privacyMode === 'full' || privacyMode === 'local-only';

  const eventRefs = new Map();
  const dossierEvents = windowEvents.map((event, index) => {
    const ref = `e${index + 1}`;
    eventRefs.set(event.id, ref);
    const entry = {
      ref,
      day: dayOf(event),
      title: cleanText(event.title, 80),
      when: describeWhen(event, zone),
      location: cleanText(event.location, 80),
      calendar: cleanText(event.calendarSummary, 40),
      recurring: Boolean(event.isRecurring),
      startsInMinutes: event.isAllDay ? null : Math.round((startMsOf(event) - now) / 60000),
    };
    if (sendNotes && (event.description || '').trim()) {
      entry.notes = cleanText(event.description, DESCRIPTION_MAX);
    }
    return entry;
  });

  const rawFacts = [
    ...buildScheduleFacts({ events: windowEvents, now, timeZone: zone }).map((fact) => ({ ...fact, source: 'schedule' })),
    ...['today', 'tomorrow'].flatMap((day) => buildDayFacts({
      events: windowEvents.filter((event) => !event.isAllDay && dayOf(event) === day),
      dayLabel: day,
      timeZone: zone,
      earlyStart: day === 'tomorrow',
    }).map((fact) => ({ ...fact, source: 'schedule' }))),
    ...extraFacts,
  ];

  const seen = new Set();
  const facts = [];
  rawFacts.forEach((fact) => {
    const text = cleanText(fact.text, 220);
    const key = `${fact.eventId || ''}|${text}`;
    if (!text || seen.has(key)) {
      return;
    }
    seen.add(key);
    facts.push({
      ref: `f${facts.length + 1}`,
      kind: fact.kind,
      // Facts about events outside the window (e.g. a trip next week) keep their text but have no event ref.
      eventRef: fact.eventId ? (eventRefs.get(fact.eventId) || null) : null,
      eventId: fact.eventId || null,
      text,
      params: fact.params || {},
      source: fact.source || 'context',
    });
  });

  return {
    generatedAt: new Date(now).toISOString(),
    timezone: zone,
    locale: locale === 'de' ? 'de' : 'en',
    focus: getBriefFocus(now, zone),
    todayDate: formatWeekdayDate(now, zone),
    tomorrowDate: formatWeekdayDate(Date.parse(`${tomorrowKey}T12:00:00Z`), 'UTC'),
    nowLocal: formatLocalTime(now, zone),
    events: dossierEvents,
    facts,
    hasContent: facts.length > 0,
    eventIdByRef: Object.fromEntries(Array.from(eventRefs.entries()).map(([id, ref]) => [ref, id])),
  };
};

// The part of the dossier that goes into the prompt (no internal bookkeeping).
const toPromptPayload = (dossier) => ({
  now: `${dossier.todayDate}, ${dossier.nowLocal}`,
  timezone: dossier.timezone,
  focus: dossier.focus,
  language: dossier.locale === 'de' ? 'German' : 'English',
  events: dossier.events,
  facts: dossier.facts.map((fact) => ({
    ref: fact.ref,
    about: fact.eventRef,
    kind: fact.kind,
    text: fact.text,
  })),
});

module.exports = {
  DEFAULT_MAX_EVENTS,
  buildDossier,
  getBriefFocus,
  pickWindowEvents,
  toPromptPayload,
};

