const { dayKeyDiff, formatLocalTime } = require('../time/zone');
const { hasChangeSignal, hasMedicalSignal } = require('./rules');
const { findOverlaps, findTightTransitions } = require('./schedule');

// Facts are short, verified statements computed by the software (never by the model). The model may only
// rephrase facts it is given and has to cite them, so everything it says can be traced back to one of these.

const ONLINE_PATTERN = /\b(online|remote|zoom|teams|webex|video ?call)\b/i;
const MISSING_LOCATION_WINDOW_HOURS = 3;
const EARLY_START_HOUR = 8.5; // appointments before 08:30 are worth a heads-up the evening before
const BUSY_DAY_EVENT_COUNT = 5;

// Untrusted calendar text is flattened to one line and capped before it goes into any prompt or fact.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;
const cleanText = (value, max = 80) => {
  const flat = `${value ?? ''}`.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

const startMsOf = (event) => Date.parse(event.start);
const endMsOf = (event) => {
  const end = Date.parse(event.end);
  return Number.isNaN(end) ? startMsOf(event) : end;
};

const timeRange = (event, timeZone) => `${formatLocalTime(startMsOf(event), timeZone)}-${formatLocalTime(endMsOf(event), timeZone)}`;

const hourOfDay = (ms, timeZone) => {
  const [hour, minute] = formatLocalTime(ms, timeZone).split(':').map(Number);
  return hour + (minute / 60);
};

// Facts about single events and about pairs of events. `events` are the brief candidates for the
// next two days; `now` decides what is still ahead.
const buildScheduleFacts = ({ events, now = Date.now(), timeZone = 'UTC', couldConflict }) => {
  const facts = [];
  // `params` keep the raw values so deterministic fallback bullets can be rendered in any language;
  // `text` is the English statement the model gets.
  const add = (event, kind, text, params = {}) => facts.push({ eventId: event.id, kind, text, params });

  findOverlaps(events, { couldConflict }).forEach(([first, second]) => {
    // `otherEventId` lets later steps recognise the two mirrored facts of one collision as a pair.
    add(first, 'conflict', `Overlaps with "${cleanText(second.title, 50)}" (${timeRange(second, timeZone)}).`,
      { otherTitle: cleanText(second.title, 50), otherRange: timeRange(second, timeZone), otherEventId: second.id });
    add(second, 'conflict', `Overlaps with "${cleanText(first.title, 50)}" (${timeRange(first, timeZone)}).`,
      { otherTitle: cleanText(first.title, 50), otherRange: timeRange(first, timeZone), otherEventId: first.id });
  });

  findTightTransitions(events, { timeZone, couldConflict }).forEach(({ first, second, gapMinutes }) => {
    add(second, 'tight_transition',
      `Only ${gapMinutes} min between "${cleanText(first.title, 40)}" (${cleanText(first.location, 40)}) and "${cleanText(second.title, 40)}" (${cleanText(second.location, 40)}), different places.`,
      { gapMinutes, otherTitle: cleanText(first.title, 40) });
  });

  events.forEach((event) => {
    if (hasChangeSignal(event)) {
      add(event, 'schedule_change', 'The calendar entry signals a change to the normal schedule (substitute, moved or cancelled).');
    }
    if (hasMedicalSignal(event)) {
      add(event, 'medical', 'This is a medical or therapy appointment.');
      const hoursUntil = (startMsOf(event) - now) / 3600000;
      if (!event.isAllDay && !(event.location || '').trim() && !ONLINE_PATTERN.test(`${event.title} ${event.description || ''}`)
        && hoursUntil >= 0 && hoursUntil <= MISSING_LOCATION_WINDOW_HOURS) {
        add(event, 'missing_location', 'The calendar entry has no location.');
      }
    }
  });

  return facts;
};

// Facts about one whole day (`events` are that day's timed events). `earlyStart: false` for today, where the
// morning is usually already over.
const buildDayFacts = ({ events, dayLabel, timeZone = 'UTC', earlyStart = true }) => {
  const timed = events.filter((event) => !event.isAllDay && !Number.isNaN(startMsOf(event)))
    .sort((left, right) => startMsOf(left) - startMsOf(right));
  if (timed.length === 0) {
    return [];
  }

  const facts = [];
  const first = timed[0];
  if (earlyStart && hourOfDay(startMsOf(first), timeZone) < EARLY_START_HOUR) {
    facts.push({
      eventId: first.id,
      kind: 'early_start',
      text: `The earliest appointment ${dayLabel} starts at ${formatLocalTime(startMsOf(first), timeZone)}.`,
      params: { time: formatLocalTime(startMsOf(first), timeZone) },
    });
  }
  if (timed.length >= BUSY_DAY_EVENT_COUNT) {
    const last = timed[timed.length - 1];
    facts.push({
      eventId: first.id,
      kind: 'busy_day',
      text: `Busy ${dayLabel}: ${timed.length} appointments, the last one ends at ${formatLocalTime(endMsOf(last), timeZone)}.`,
      params: { count: timed.length, endTime: formatLocalTime(endMsOf(last), timeZone) },
    });
  }
  return facts;
};

// The older enrichment code also produces statements that only describe how the software matched an event
// ("Matched household keyword: ...", "Source links mention: ...", city/venue guesses). They carry no
// information for the user and were the main source of useless AI comments, so they never reach the model.
// Street addresses are only forwarded when the user allows full context.
const FILLER_FACT_PATTERNS = [
  /^Matched household keyword/i,
  /^Known city hints/i,
  /^Source links mention/i,
  /^Venue hint/i,
  /^Likely ticket source/i,
  /^Ticket source hint/i,
  /^This (event )?is usually /i,
  /^This event usually /i,
  /^Detailed travel, weather/i,
  /is the main person for this event/i,
];
// Personal details the user typed into an event hint rule. They are only forwarded when the user chose to
// share full context (or runs a local model).
const PRIVATE_FACT_PATTERNS = [
  /^Known destination address:/i,
  /^Known prep note:/i,
  /^Known household context:/i,
];

const sharesPrivateContext = (privacyMode) => privacyMode === 'full' || privacyMode === 'local-only';

const isUsefulContextFact = (text, privacyMode = 'cloud-redacted') => {
  const value = `${text || ''}`.trim();
  if (!value) {
    return false;
  }
  if (FILLER_FACT_PATTERNS.some((pattern) => pattern.test(value))) {
    return false;
  }
  if (!sharesPrivateContext(privacyMode) && PRIVATE_FACT_PATTERNS.some((pattern) => pattern.test(value))) {
    return false;
  }
  return true;
};

// Whole days an all-day event spans (ICS/Google all-day ends are exclusive).
const getAllDaySpanDays = (event) => {
  const startKey = `${event.start || ''}`.slice(0, 10);
  const endKey = `${event.end || ''}`.slice(0, 10);
  const span = /^\d{4}-\d{2}-\d{2}$/.test(startKey) && /^\d{4}-\d{2}-\d{2}$/.test(endKey) ? dayKeyDiff(startKey, endKey) : 1;
  return Math.max(1, span);
};

module.exports = {
  buildDayFacts,
  buildScheduleFacts,
  cleanText,
  getAllDaySpanDays,
  isUsefulContextFact,
  timeRange,
};
