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

const isUtcName = (name) => ['utc', 'etc/utc', 'gmt', 'etc/gmt', 'z'].includes(`${name || ''}`.trim().toLowerCase());

const getSystemTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (error) {
    return 'UTC';
  }
};

// The time zone the mirror lives in.
//   "" / "auto"  -> the time zone of this device (what the Pi was set to during installation)
//   "UTC"        -> ALSO the device zone when the device is not on UTC. "UTC" is what every config file written
//                   by earlier versions contains, so it cannot be told apart from "never set". Anybody who really
//                   wants UTC writes "Etc/UTC".
//   anything else -> that IANA zone, or the device zone if the name is not valid.
const resolveTimeZone = (configured, { systemTimeZone = getSystemTimeZone() } = {}) => {
  const value = typeof configured === 'string' ? configured.trim() : '';
  const system = safeTimeZone(systemTimeZone);
  if (!value || value.toLowerCase() === 'auto') {
    return system;
  }
  if (value === 'UTC' && !isUtcName(system)) {
    return system;
  }
  // safeTimeZone() answers "UTC" for invalid names, so a "UTC" result only counts when UTC was really asked for.
  // Intl also canonicalises a valid "Etc/UTC" to "UTC", which is why the user's own spelling is what is checked.
  const candidate = safeTimeZone(value);
  if (candidate === 'UTC' && !isUtcName(value)) {
    return system;
  }
  return isUtcName(value) ? value : candidate;
};

// Building an Intl.DateTimeFormat is the expensive part; recurrence expansion asks for thousands of offsets.
const wallClockFormatters = new Map();
const getWallClockFormatter = (timeZone) => {
  if (!wallClockFormatters.has(timeZone)) {
    wallClockFormatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }));
  }
  return wallClockFormatters.get(timeZone);
};

// Offset of a zone from UTC at a given instant, in ms (positive east of Greenwich).
const getZoneOffsetMs = (ms, timeZone) => {
  const parts = getWallClockFormatter(timeZone).formatToParts(new Date(ms));
  const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
  const wallAsUtc = Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute'), pick('second'));
  return wallAsUtc - (Math.floor(ms / 1000) * 1000);
};

// The instant at which the wall clock of `timeZone` shows the given date and time. This is what an iCalendar
// `DTSTART;TZID=Europe/Berlin:20260415T090000` means. Returns null when the zone name is not a real zone.
// Around a DST change a wall time can be skipped (spring) or happen twice (autumn): a skipped time moves
// forward by the gap (09:30 in a 02:00->03:00 jump becomes 03:30), a repeated one takes the first occurrence.
const zonedWallTimeToMs = ({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) => {
  const zone = typeof timeZone === 'string' ? timeZone.trim() : '';
  if (!zone) {
    return null;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0);
  } catch (error) {
    return null;
  }

  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const DAY_MS = 86400000;
  // The offset in force a day before and a day after: next to a DST change these are the two candidates.
  const offsetBefore = getZoneOffsetMs(wallAsUtc - DAY_MS, zone);
  const offsetAfter = getZoneOffsetMs(wallAsUtc + DAY_MS, zone);

  // A candidate is only real if the zone really has that offset at that instant.
  const candidates = Array.from(new Set([offsetBefore, offsetAfter]))
    .map((offset) => wallAsUtc - offset)
    .filter((instant) => wallAsUtc - instant === getZoneOffsetMs(instant, zone));

  if (candidates.length > 0) {
    // Two real candidates = the wall time happens twice (autumn): RFC 5545 says the first occurrence.
    return Math.min(...candidates);
  }
  // No real candidate = the wall time was skipped (spring): RFC 5545 says use the offset from before the gap.
  return wallAsUtc - offsetBefore;
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

// "14:30" in the given zone (24 h, zero padded).
const formatLocalTime = (ms, timeZone = 'UTC') => new Intl.DateTimeFormat('en-GB', {
  timeZone: safeTimeZone(timeZone),
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}).format(new Date(ms));

const getLocalHour = (ms, timeZone = 'UTC') => Number(new Intl.DateTimeFormat('en-GB', {
  timeZone: safeTimeZone(timeZone),
  hour: '2-digit',
  hourCycle: 'h23',
}).format(new Date(ms)));

// night 00-04, morning 05-11, afternoon 12-16, evening 17-23
const getTimeOfDay = (ms, timeZone = 'UTC') => {
  const hour = getLocalHour(ms, timeZone);
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

// "Thu 16 Apr"
const formatWeekdayDate = (ms, timeZone = 'UTC') => new Intl.DateTimeFormat('en-GB', {
  timeZone: safeTimeZone(timeZone),
  weekday: 'short',
  day: 'numeric',
  month: 'short',
}).format(new Date(ms));

// Shifts a "YYYY-MM-DD" key by whole days (calendar arithmetic, immune to DST).
const addDaysToKey = (key, days) => {
  const [year, month, day] = `${key}`.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + days));
  return shifted.toISOString().slice(0, 10);
};

module.exports = {
  addDaysToKey,
  dayKeyDiff,
  formatLocalTime,
  formatWeekdayDate,
  getEventDayKey,
  getEventDayOffset,
  getLocalDateKey,
  getLocalHour,
  getSystemTimeZone,
  getTimeOfDay,
  getZoneOffsetMs,
  resolveTimeZone,
  safeTimeZone,
  zonedWallTimeToMs,
};
