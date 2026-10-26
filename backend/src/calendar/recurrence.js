const { getZoneOffsetMs, zonedWallTimeToMs } = require('../time/zone');

// Start times of a repeating event inside a window.
//
// The old version in index.js did its calendar arithmetic ("same weekday next week, same wall time") with the
// calendar of the machine the backend runs on. That is only right when the event lives in that same zone:
//   - an event defined in Europe/Berlin, expanded on a UTC machine, moved by an hour after every DST change
//   - a series in UTC (DTSTART...Z), expanded on a Berlin machine, did the same the other way round
// Now the arithmetic is done on the wall clock of the event's own zone:
//   zone = 'Europe/Berlin' (TZID)  -> wall time stays 09:00 in Berlin, the instant moves with DST (RFC 5545)
//   zone = 'UTC'          (...Z)   -> the instant stays fixed
//   zone = null           (floating, all-day) -> the machine's own calendar, as before: "09:00 where you are"

const DAY_MS = 86400000;
const MAX_STARTS = 500;
const MAX_WEEKS = 3000;
const WEEKDAY_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// A calendar knows two things: which wall fields an instant has, and which instant a wall time is.
const createCalendar = (timeZone) => {
  if (!timeZone) {
    return {
      fieldsOf: (ms) => {
        const date = new Date(ms);
        return {
          year: date.getFullYear(), month: date.getMonth(), day: date.getDate(), dow: date.getDay(),
          hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds(), millis: date.getMilliseconds(),
        };
      },
      msOf: ({ year, month, day, hour, minute, second, millis }) => new Date(year, month, day, hour, minute, second, millis).getTime(),
    };
  }
  return {
    fieldsOf: (ms) => {
      const wall = new Date(ms + getZoneOffsetMs(ms, timeZone));
      return {
        year: wall.getUTCFullYear(), month: wall.getUTCMonth(), day: wall.getUTCDate(), dow: wall.getUTCDay(),
        hour: wall.getUTCHours(), minute: wall.getUTCMinutes(), second: wall.getUTCSeconds(), millis: wall.getUTCMilliseconds(),
      };
    },
    msOf: ({ year, month, day, hour, minute, second, millis }) => {
      // Date.UTC normalises overflow (day 35, month 14) exactly like the local constructor does.
      const normal = new Date(Date.UTC(year, month, day, hour, minute, second));
      const ms = zonedWallTimeToMs({
        year: normal.getUTCFullYear(), month: normal.getUTCMonth() + 1, day: normal.getUTCDate(),
        hour: normal.getUTCHours(), minute: normal.getUTCMinutes(), second: normal.getUTCSeconds(),
      }, timeZone);
      return ms === null ? null : ms + millis;
    },
  };
};

const MAX_MONTHS = 1200;

// Days (1-31, ascending) of one month selected by BYDAY ordinals and/or BYMONTHDAY.
//   ordinals:  [{ n: 2, day: 'TU' }]  second Tuesday;  n = -1 last;  n = 0 every such weekday
//   monthDays: [15, -1]               the 15th and the last day
// Both given = only days that satisfy both (RFC 5545 "limit" semantics).
const monthDays = ({ year, month, ordinals, monthDays: byMonthDay }) => {
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weekdayOf = (day) => new Date(Date.UTC(year, month, day)).getUTCDay();

  const fromOrdinals = (ordinals || []).flatMap(({ n, day }) => {
    const weekday = WEEKDAY_INDEX[day];
    if (weekday === undefined) {
      return [];
    }
    const matching = [];
    for (let d = 1; d <= length; d += 1) {
      if (weekdayOf(d) === weekday) matching.push(d);
    }
    if (n === 0) return matching;
    const picked = n > 0 ? matching[n - 1] : matching[matching.length + n];
    return picked ? [picked] : [];
  });
  const fromMonthDays = (byMonthDay || [])
    .map((d) => (d > 0 ? d : length + d + 1))
    .filter((d) => d >= 1 && d <= length);

  const hasOrdinals = (ordinals || []).length > 0;
  const hasMonthDays = (byMonthDay || []).length > 0;
  let days;
  if (hasOrdinals && hasMonthDays) {
    days = fromOrdinals.filter((d) => fromMonthDays.includes(d));
  } else {
    days = hasOrdinals ? fromOrdinals : fromMonthDays;
  }
  return Array.from(new Set(days)).sort((left, right) => left - right);
};

// Whole days between two wall dates, independent of DST.
const wallDayNumber = (fields) => Math.round(Date.UTC(fields.year, fields.month, fields.day) / DAY_MS);

// startMs / windowStartMs / windowEndMs / untilMs are instants. rule: { freq, interval, count, byDay[], wkst }.
// Returns instants (ms), ascending.
const expandRecurrence = ({ startMs, rule, windowStartMs, windowEndMs, untilMs = null, timeZone = null }) => {
  if (!Number.isFinite(startMs)) {
    return [];
  }
  const calendar = createCalendar(timeZone);
  const freq = `${rule.freq || ''}`.toUpperCase();
  const interval = Math.max(1, Number(rule.interval) || 1);
  const count = Number(rule.count) || Infinity;
  const hardEnd = untilMs !== null && untilMs < windowEndMs ? untilMs : windowEndMs;
  const start = calendar.fieldsOf(startMs);
  const starts = [];

  const withDate = (overrides) => calendar.msOf({ ...start, ...overrides });
  const pushIfInWindow = (candidate, sequenceIndex) => {
    if (candidate === null || sequenceIndex >= count || candidate < startMs || candidate > hardEnd) {
      return;
    }
    if (candidate >= windowStartMs && candidate <= windowEndMs) {
      starts.push(candidate);
    }
  };

  if (freq === 'DAILY') {
    const daysToWindow = wallDayNumber(calendar.fieldsOf(windowStartMs)) - wallDayNumber(start);
    let sequenceIndex = Math.max(0, Math.floor(daysToWindow / interval) - 1);
    while (sequenceIndex < count && starts.length < MAX_STARTS) {
      const candidate = withDate({ day: start.day + (sequenceIndex * interval) });
      if (candidate === null || candidate > hardEnd) break;
      pushIfInWindow(candidate, sequenceIndex);
      sequenceIndex += 1;
    }
    return starts;
  }

  if (freq === 'WEEKLY') {
    const weekStartsOn = WEEKDAY_INDEX[`${rule.wkst || 'MO'}`.toUpperCase()] ?? 1;
    const byDays = (Array.isArray(rule.byDay) && rule.byDay.length ? rule.byDay : null)
      ?.map((day) => WEEKDAY_INDEX[day])
      .filter((day) => day !== undefined) || [start.dow];
    // The wall date on which the first week begins; weeks are then counted in whole 7-day steps.
    const firstWeekDay = start.day - ((start.dow - weekStartsOn + 7) % 7);
    let weekIndex = 0;
    let sequenceIndex = 0;
    while (sequenceIndex < count && starts.length < MAX_STARTS && weekIndex < MAX_WEEKS) {
      const weekFirstMs = withDate({ day: firstWeekDay + (weekIndex * 7) });
      if (weekFirstMs === null || weekFirstMs > hardEnd) break;
      if (weekIndex % interval === 0) {
        for (const day of byDays) {
          const dayOffset = (day - weekStartsOn + 7) % 7;
          const candidate = withDate({ day: firstWeekDay + (weekIndex * 7) + dayOffset });
          if (candidate !== null && candidate >= startMs) {
            pushIfInWindow(candidate, sequenceIndex);
            sequenceIndex += 1;
            if (sequenceIndex >= count) {
              break;
            }
          }
        }
      }
      weekIndex += 1;
    }
    return starts.sort((left, right) => left - right);
  }

  if (freq === 'MONTHLY' && (rule.byDayOrdinals?.length || rule.byMonthDay?.length)) {
    // "second Tuesday", "last Friday", "the 15th": the days of each month are computed, not carried over from
    // the start date (which put "BYDAY=2TU" on the day-of-month of the first occurrence).
    let sequenceIndex = 0;
    for (let monthStep = 0; monthStep < MAX_MONTHS && starts.length < MAX_STARTS && sequenceIndex < count; monthStep += interval) {
      const firstOfMonth = new Date(Date.UTC(start.year, start.month + monthStep, 1));
      if (firstOfMonth.getTime() > hardEnd + (32 * DAY_MS)) break;
      const days = monthDays({
        year: firstOfMonth.getUTCFullYear(),
        month: firstOfMonth.getUTCMonth(),
        ordinals: rule.byDayOrdinals || [],
        monthDays: rule.byMonthDay || [],
      });
      for (const day of days) {
        const candidate = calendar.msOf({ ...start, year: firstOfMonth.getUTCFullYear(), month: firstOfMonth.getUTCMonth(), day });
        if (candidate === null || candidate < startMs) {
          continue;
        }
        pushIfInWindow(candidate, sequenceIndex);
        sequenceIndex += 1;
        if (sequenceIndex >= count || candidate > hardEnd) {
          break;
        }
      }
    }
    return starts.sort((left, right) => left - right);
  }

  if (freq === 'MONTHLY' || freq === 'YEARLY') {
    let sequenceIndex = 0;
    let candidate = startMs;
    while (candidate !== null && candidate <= hardEnd && sequenceIndex < count && starts.length < MAX_STARTS) {
      pushIfInWindow(candidate, sequenceIndex);
      sequenceIndex += 1;
      const step = sequenceIndex * interval;
      candidate = freq === 'MONTHLY' ? withDate({ month: start.month + step }) : withDate({ year: start.year + step });
    }
    return starts;
  }

  return [];
};

module.exports = {
  createCalendar,
  expandRecurrence,
};

