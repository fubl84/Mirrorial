const { getEventDayKey } = require('../time/zone');
const { normalizeText } = require('./rules');

// Schedule analysis on plain event objects: duplicates, overlaps and back-to-back moves between places.
// Pure functions, no I/O. All-day events never take part in overlaps (they do not occupy a time slot).

const startOf = (event) => Date.parse(event.start);
const endOf = (event) => {
  const end = Date.parse(event.end);
  return Number.isNaN(end) ? startOf(event) : end;
};
const isTimed = (event) => !event.isAllDay && !Number.isNaN(startOf(event));

// The same appointment often arrives twice (an override next to the series, or two subscribed calendars).
// Same normalised title and same start = one event; the entry with more detail wins.
const dedupeEvents = (events) => {
  const bestByKey = new Map();
  const order = [];
  events.forEach((event) => {
    const key = `${normalizeText(event.title).replace(/\s+/g, ' ').trim()}|${event.start}`;
    const detail = (event.location ? 2 : 0) + (event.description ? 1 : 0) + (event.isRecurring ? 0 : 1);
    const known = bestByKey.get(key);
    if (!known) {
      bestByKey.set(key, { event, detail });
      order.push(key);
    } else if (detail > known.detail) {
      known.event = event;
      known.detail = detail;
    }
  });
  return order.map((key) => bestByKey.get(key).event);
};

// Pairs of timed events whose time ranges overlap. Touching ranges (end == start) are not overlaps.
// `couldConflict(a, b)` (see people.js) filters out pairs that belong to different people.
const ALWAYS = () => true;

const findOverlaps = (events, { couldConflict = ALWAYS } = {}) => {
  const timed = events.filter(isTimed).sort((left, right) => startOf(left) - startOf(right));
  const pairs = [];
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      if (startOf(timed[j]) >= endOf(timed[i])) {
        break;
      }
      if (couldConflict(timed[i], timed[j])) {
        pairs.push([timed[i], timed[j]]);
      }
    }
  }
  return pairs;
};

const sameDay = (left, right, timeZone) => getEventDayKey(left, timeZone) === getEventDayKey(right, timeZone);

// Consecutive timed events on one day with a short gap and different places. Without routing data this is a
// signal, not a proof: it says "little time between two different places", never a travel-time estimate.
// "Next" means the next event of the same agenda: with A1 (member A), B1 (member B), A2 (member A) the move
// that matters is A1 -> A2, not the two cross-person pairs that happen to be adjacent in time.
const findTightTransitions = (events, { timeZone = 'UTC', maxGapMinutes = 15, couldConflict = ALWAYS } = {}) => {
  const timed = events.filter(isTimed).sort((left, right) => startOf(left) - startOf(right));
  const result = [];
  for (let index = 0; index < timed.length - 1; index += 1) {
    const first = timed[index];
    const second = timed.slice(index + 1).find((candidate) => couldConflict(first, candidate));
    if (!second) {
      continue;
    }
    const gapMinutes = Math.round((startOf(second) - endOf(first)) / 60000);
    const firstPlace = normalizeText(first.location).trim();
    const secondPlace = normalizeText(second.location).trim();
    if (gapMinutes >= 0 && gapMinutes <= maxGapMinutes
      && firstPlace && secondPlace && firstPlace !== secondPlace
      && sameDay(first, second, timeZone)) {
      result.push({ first, second, gapMinutes });
    }
  }
  return result;
};

module.exports = {
  dedupeEvents,
  findOverlaps,
  findTightTransitions,
};