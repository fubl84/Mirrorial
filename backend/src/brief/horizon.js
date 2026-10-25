const { getEventDayOffset } = require('../time/zone');

// Time-bucketed selection. The old "top N of the next 14 days by score" let far-away events crowd out today.
// Every bucket gets a guaranteed share; unused room goes to the best leftovers.
const BUCKETS = [
  { id: 'today', cap: 7, match: (offset) => offset <= 0 },
  { id: 'tomorrow', cap: 5, match: (offset) => offset === 1 },
  { id: 'week', cap: 4, match: (offset) => offset >= 2 && offset <= 7 },
  { id: 'later', cap: 2, match: (offset) => offset > 7 },
];

const byScoreThenStart = (left, right) => (right.score - left.score) || (left.startMs - right.startMs);

// entries: [{ event, score, startMs }]  ->  events sorted by start time
const selectEventsByHorizon = (entries, { now = Date.now(), timeZone = 'UTC', limit = 18 } = {}) => {
  const bucketed = BUCKETS.map((bucket) => ({
    ...bucket,
    items: entries
      .filter((entry) => {
        const offset = getEventDayOffset(entry.event, now, timeZone);
        return bucket.match(offset === null ? 99 : offset);
      })
      .sort(byScoreThenStart),
  }));

  const chosen = [];
  bucketed.forEach((bucket) => chosen.push(...bucket.items.slice(0, bucket.cap)));

  if (chosen.length < limit) {
    const taken = new Set(chosen);
    const leftovers = bucketed
      .flatMap((bucket) => bucket.items.slice(bucket.cap))
      .filter((entry) => !taken.has(entry))
      .sort(byScoreThenStart);
    chosen.push(...leftovers.slice(0, limit - chosen.length));
  }

  return chosen
    .sort(byScoreThenStart)
    .slice(0, limit)
    .sort((left, right) => left.startMs - right.startMs)
    .map((entry) => entry.event);
};

module.exports = {
  BUCKETS,
  selectEventsByHorizon,
};
