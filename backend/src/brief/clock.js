// Finds clock times in free text so a generated sentence can be checked against the times the software
// actually knows. The check only has to be safe, not complete: a time that is not recognised is simply not
// checked, while a recognised time that is not in the dossier gets the sentence rejected.

const pad = (value) => String(value).padStart(2, '0');

const toClock = (hour, minute = 0) => (
  Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? `${pad(hour)}:${pad(minute)}`
    : null
);

const to24Hour = (hour, meridiem) => {
  const normalized = `${meridiem || ''}`.toLowerCase();
  if (!normalized) return hour;
  if (hour < 1 || hour > 12) return NaN;
  if (normalized === 'am') return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
};

// Recognises: 14:30, 9:05, 2:30 pm, 14.30 Uhr, 14.30h, 14 Uhr, 2 pm.
// A bare "14.30" is not treated as a time (could be a price or a version).
const extractClockTimes = (text) => {
  const source = `${text || ''}`;
  const found = new Set();
  const add = (hour, minute, meridiem) => {
    const clock = toClock(to24Hour(Number(hour), meridiem), Number(minute || 0));
    if (clock) found.add(clock);
  };

  for (const match of source.matchAll(/(?<![\d:.])(\d{1,2}):([0-5]\d)(?:\s*(am|pm)\b)?(?![\d:])/gi)) {
    add(match[1], match[2], match[3]);
  }
  for (const match of source.matchAll(/(?<![\d:.])(\d{1,2})\.([0-5]\d)\s*(?:uhr|h)\b/gi)) {
    add(match[1], match[2]);
  }
  for (const match of source.matchAll(/(?<![\d:.])(\d{1,2})\s*uhr\b/gi)) {
    add(match[1], 0);
  }
  for (const match of source.matchAll(/(?<![\d:.])(\d{1,2})\s*(am|pm)\b/gi)) {
    add(match[1], 0, match[2]);
  }

  return Array.from(found);
};

module.exports = {
  extractClockTimes,
  toClock,
};