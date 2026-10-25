// Small time-zone helpers built on Intl (no dependency). Phase 5 extends this module; Phase 2 only needs
// "which local calendar day is this" so that horizon rules work in the mirror's timezone, not the server's.

const safeTimeZone = (timeZone) => {
  const candidate = typeof timeZone === 'string' && timeZone.trim() ? timeZone.trim() : 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(0);
    return candidate;
  } catch (error) {
    return 'UTC';
  }
};

// "YYYY-MM-DD" of an instant in the given time zone.
const getLocalDateKey = (ms, timeZone = 'UTC') => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
};

// Whole days from key `from` to key `to` (both "YYYY-MM-DD"). DST-safe because it works on date keys, not instants.
const dayKeyDiff = (from, to) => {
  const parse = (key) => {
    const [year, month, day] = `${key}`.split('-').map(Number);
    return Date.UTC(year, (month || 1) - 1, day || 1);
  };
  return Math.round((parse(to) - parse(from)) / 86400000);
};

// Local day key of an event start. All-day events carry a plain date, which already is the local day.
const getEventDayKey = (event, timeZone = 'UTC') => {
  const start = `${event?.start || ''}`;
  if (event?.isAllDay && /^\d{4}-\d{2}-\d{2}/.test(start)) {
    return start.slice(0, 10);
  }
  const ms = Date.parse(start);
  return Number.isNaN(ms) ? '' : getLocalDateKey(ms, timeZone);
};

// 0 = today, 1 = tomorrow, negative = started on an earlier day. null when the start is unknown.
const getEventDayOffset = (event, now = Date.now(), timeZone = 'UTC') => {
  const eventKey = getEventDayKey(event, timeZone);
  return eventKey ? dayKeyDiff(getLocalDateKey(now, timeZone), eventKey) : null;
};

module.exports = {
  dayKeyDiff,
  getEventDayKey,
  getEventDayOffset,
  getLocalDateKey,
  safeTimeZone,
};
