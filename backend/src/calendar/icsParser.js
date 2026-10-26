// Reads iCalendar (.ics) text into Mirrorial events.
//
// Pure functions, no I/O. What it does that a plain split-on-lines parser does not:
//   - DTSTART;TZID=Europe/Berlin is converted to a real instant (floating times stay floating, all-day dates stay dates)
//   - repeating events are expanded in the zone of the event (see recurrence.js), with EXDATE and edited occurrences
//   - declined events are marked, alarms are ignored, cancelled events are dropped
//   - indefinite repeating series that began long ago are dropped unless they look like birthdays, holidays and the like

const { expandRecurrence } = require('./recurrence');
const { isDeclinedForOwner, splitIcsContentLine } = require('./icsMeta');
const { RECURRING_ALWAYS_KEEP_PATTERNS } = require('../brief/householdPatterns');
const { zonedWallTimeToMs } = require('../time/zone');

const decodeIcsText = (value = '') => value
  .replace(/\\n/gi, '\n')
  .replace(/\\,/g, ',')
  .replace(/\\;/g, ';')
  .replace(/\\\\/g, '\\')
  .trim();

const unfoldIcsLines = (input = '') => input
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .replace(/\n[ \t]/g, '');

const parseIcsDateValue = (value, isAllDay = false) => {
  const normalized = `${value || ''}`.trim();
  if (!normalized) {
    return null;
  }

  if (/^\d{8}$/.test(normalized)) {
    const iso = `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
    return isAllDay ? iso : `${iso}T00:00:00`;
  }

  if (/^\d{8}T\d{6}Z$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T${normalized.slice(9, 11)}:${normalized.slice(11, 13)}:${normalized.slice(13, 15)}Z`;
  }

  if (/^\d{8}T\d{6}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T${normalized.slice(9, 11)}:${normalized.slice(11, 13)}:${normalized.slice(13, 15)}`;
  }

  return normalized;
};

const parseIcsBlockProps = (block) => {
  const props = {};
  const withoutAlarms = block.replace(/BEGIN:VALARM[\s\S]*?END:VALARM/gi, '');
  withoutAlarms.split('\n').forEach((line) => {
    const parsed = splitIcsContentLine(line);
    if (!parsed) {
      return;
    }
    if (!props[parsed.key]) {
      props[parsed.key] = [];
    }
    props[parsed.key].push({ value: parsed.value, params: parsed.params });
  });
  return props;
};

const parseIcsRrule = (value = '') => value.split(';').reduce((rule, segment) => {
  const [rawKey, rawValue] = segment.split('=');
  const key = (rawKey || '').trim().toUpperCase();
  const normalizedValue = (rawValue || '').trim();
  if (!key || !normalizedValue) {
    return rule;
  }
  if (key === 'INTERVAL' || key === 'COUNT') {
    rule[key.toLowerCase()] = Math.max(1, Number.parseInt(normalizedValue, 10) || 1);
    return rule;
  }
  if (key === 'BYDAY') {
    rule.byDay = normalizedValue.split(',').map((entry) => entry.replace(/^[+-]?\d+/, '').toUpperCase()).filter(Boolean);
    rule.byDayOrdinals = normalizedValue.split(',')
      .map((entry) => /^([+-]?\d+)?([A-Za-z]{2})$/.exec(entry.trim()))
      .filter(Boolean)
      .map((match) => ({ n: match[1] ? Number.parseInt(match[1], 10) : 0, day: match[2].toUpperCase() }));
    return rule;
  }
  if (key === 'BYMONTHDAY') {
    rule.byMonthDay = normalizedValue.split(',').map((entry) => Number.parseInt(entry, 10)).filter((day) => Number.isInteger(day) && day !== 0);
    return rule;
  }
  rule[key.toLowerCase()] = normalizedValue;
  return rule;
}, {});

const ICS_LOCAL_DATE_TIME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/;

// `tzid` is the TZID parameter of the property. Only a date-time with a known IANA zone is converted;
// UTC values (trailing Z), all-day dates and unknown zone names (Outlook's "W. Europe Standard Time") keep
// the behaviour they had before.
const parseIcsDateToDate = (value, isAllDay = false, tzid = '') => {
  const zoned = !isAllDay && tzid ? ICS_LOCAL_DATE_TIME.exec(`${value || ''}`.trim()) : null;
  if (zoned) {
    const ms = zonedWallTimeToMs({
      year: Number(zoned[1]), month: Number(zoned[2]), day: Number(zoned[3]),
      hour: Number(zoned[4]), minute: Number(zoned[5]), second: Number(zoned[6]),
    }, tzid);
    if (ms !== null) {
      return new Date(ms);
    }
  }
  const parsed = parseIcsDateValue(value, isAllDay);
  if (!parsed) {
    return null;
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(parsed);
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(parsed);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getIcsPropDate = (prop, isAllDay = false) => parseIcsDateToDate(prop?.value, isAllDay, prop?.params?.TZID);

// A zoned value becomes an absolute instant, so it is written with a trailing Z like a UTC value.
const icsOutputTemplate = (prop, isAllDay) => {
  const wasConverted = !isAllDay
    && prop?.params?.TZID
    && ICS_LOCAL_DATE_TIME.test(`${prop?.value || ''}`.trim())
    && zonedWallTimeToMs({ year: 2026, month: 1, day: 1 }, prop.params.TZID) !== null;
  return wasConverted ? 'Z' : prop?.value;
};

const formatIcsOccurrenceDate = (date, templateValue = '', isAllDay = false) => {
  const pad = (value) => String(value).padStart(2, '0');
  if (isAllDay) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  if (`${templateValue || ''}`.trim().endsWith('Z')) {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const getIcsRecurrenceKey = (value, isAllDay = false, tzid = '') => {
  const date = parseIcsDateToDate(value, isAllDay, tzid);
  return date ? String(date.getTime()) : '';
};

const addIcsDuration = (startDate, durationMs) => new Date(startDate.getTime() + Math.max(0, durationMs));

const eventOverlapsWindow = (event, timeMin = null, timeMax = null) => {
  const startMs = new Date(event.start).getTime();
  const endMs = new Date(event.end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return false;
  }
  const minMs = timeMin ? new Date(timeMin).getTime() : -Infinity;
  const maxMs = timeMax ? new Date(timeMax).getTime() : Infinity;
  return endMs >= minMs && startMs <= maxMs;
};

// The zone a repeating event's wall clock belongs to: its TZID, UTC for a trailing Z, null for floating
// times and all-day dates (those follow the calendar of the machine, as before).
const getIcsRecurrenceZone = (startMeta, isAllDay) => {
  if (isAllDay) {
    return null;
  }
  const value = `${startMeta?.value || ''}`.trim();
  if (value.endsWith('Z')) {
    return 'UTC';
  }
  const tzid = startMeta?.params?.TZID;
  return tzid && zonedWallTimeToMs({ year: 2026, month: 1, day: 1 }, tzid) !== null ? tzid : null;
};

const buildRecurringIcsStartDates = ({ startDate, rule, isAllDay, timeMin, timeMax, timeZone = null, untilTzid = '' }) => {
  if (!startDate) {
    return [];
  }
  const until = rule.until ? parseIcsDateToDate(rule.until, isAllDay, untilTzid) : null;
  return expandRecurrence({
    startMs: startDate.getTime(),
    rule,
    windowStartMs: (timeMin ? new Date(timeMin) : new Date(Date.now() - 86400000)).getTime(),
    windowEndMs: (timeMax ? new Date(timeMax) : new Date(Date.now() + (14 * 86400000))).getTime(),
    untilMs: until ? until.getTime() : null,
    timeZone,
  }).map((ms) => new Date(ms));
};

const buildIcsEventFromProps = ({
  sourceId,
  calendarId,
  calendarSummary,
  calendarColor,
  defaultUrl,
  props,
  index,
  occurrenceStart = null,
  occurrenceIndex = null,
  ownerEmails = [],
}) => {
  const uid = props.UID?.[0]?.value || `${sourceId}:${calendarId}:${index + 1}`;
  const startMeta = props.DTSTART?.[0] || null;
  const endMeta = props.DTEND?.[0] || null;
  const isAllDay = (startMeta?.params?.VALUE || '').toUpperCase() === 'DATE' || /^\d{8}$/.test(startMeta?.value || '');
  const startDate = occurrenceStart || getIcsPropDate(startMeta, isAllDay);
  const originalStartDate = getIcsPropDate(startMeta, isAllDay);
  const originalEndDate = getIcsPropDate(endMeta || startMeta, isAllDay) || originalStartDate;
  if (!startDate || !originalStartDate || !originalEndDate) {
    return null;
  }
  const durationMs = originalEndDate.getTime() - originalStartDate.getTime();
  const endDate = occurrenceStart ? addIcsDuration(occurrenceStart, durationMs) : originalEndDate;
  const status = decodeIcsText(props.STATUS?.[0]?.value || 'confirmed').toLowerCase();
  const recurrenceId = props['RECURRENCE-ID']?.[0]?.value || '';
  const isRecurring = Boolean(props.RRULE?.[0]?.value || recurrenceId || occurrenceStart);
  const suffix = occurrenceIndex !== null
    ? `:${formatIcsOccurrenceDate(occurrenceStart, icsOutputTemplate(startMeta, isAllDay), isAllDay)}`
    : (recurrenceId ? `:${recurrenceId}` : '');

  return {
    id: `${sourceId}:${uid}${suffix}`,
    sourceId,
    status,
    title: decodeIcsText(props.SUMMARY?.[0]?.value || '(No title)'),
    description: decodeIcsText(props.DESCRIPTION?.[0]?.value || ''),
    location: decodeIcsText(props.LOCATION?.[0]?.value || ''),
    start: formatIcsOccurrenceDate(startDate, icsOutputTemplate(startMeta, isAllDay), isAllDay),
    end: formatIcsOccurrenceDate(endDate, icsOutputTemplate(endMeta || startMeta, isAllDay), isAllDay),
    isAllDay,
    htmlLink: decodeIcsText(props.URL?.[0]?.value || defaultUrl || ''),
    calendarId,
    calendarSummary,
    calendarColor,
    calendarTextColor: '',
    isRecurring,
    recurringEventId: decodeIcsText(props.UID?.[0]?.value || ''),
    attendees: (props.ATTENDEE || []).map((entry) => `${entry.value || ''}`.replace(/^mailto:/i, '').toLowerCase()).filter(Boolean),
    declined: isDeclinedForOwner(props, ownerEmails),
  };
};

const getIcsExdateKeys = (props, isAllDay) => new Set((props.EXDATE || [])
  .flatMap((entry) => `${entry.value || ''}`.split(',').map((value) => ({ value, tzid: entry.params?.TZID })))
  .map(({ value, tzid }) => getIcsRecurrenceKey(value, isAllDay, tzid))
  .filter(Boolean));

const isStaleIndefiniteIcsRecurrence = ({ props, rule, startDate, timeMin }) => {
  if (!rule?.freq || rule.count || rule.until || !startDate) {
    return false;
  }

  const combinedText = [
    props.SUMMARY?.[0]?.value || '',
    props.DESCRIPTION?.[0]?.value || '',
    props.LOCATION?.[0]?.value || '',
  ].join(' ');
  if (RECURRING_ALWAYS_KEEP_PATTERNS.some((pattern) => pattern.test(combinedText))) {
    return false;
  }

  const windowStart = timeMin ? new Date(timeMin).getTime() : Date.now();
  const staleCutoffMs = windowStart - (730 * 86400000);
  return startDate.getTime() < staleCutoffMs;
};

const parseIcsEvents = ({ sourceId, calendarId, calendarSummary, calendarColor = '', text, defaultUrl = '', timeMin = null, timeMax = null, ownerEmails = [] }) => {
  const unfolded = unfoldIcsLines(text);
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  const parsedBlocks = blocks.map((block, index) => ({ props: parseIcsBlockProps(block), index }));
  const overridesByUid = new Map();
  parsedBlocks
    .filter(({ props }) => props['RECURRENCE-ID']?.[0]?.value)
    .forEach(({ props }) => {
      const uid = props.UID?.[0]?.value || '';
      const startMeta = props.DTSTART?.[0] || null;
      const isAllDay = (startMeta?.params?.VALUE || '').toUpperCase() === 'DATE' || /^\d{8}$/.test(startMeta?.value || '');
      const key = getIcsRecurrenceKey(props['RECURRENCE-ID']?.[0]?.value, isAllDay, props['RECURRENCE-ID']?.[0]?.params?.TZID);
      if (!uid || !key) {
        return;
      }
      if (!overridesByUid.has(uid)) {
        overridesByUid.set(uid, new Map());
      }
      overridesByUid.get(uid).set(key, props);
    });

  const events = [];
  parsedBlocks.forEach(({ props, index }) => {
    const uid = props.UID?.[0]?.value || `${sourceId}:${calendarId}:${index + 1}`;
    const startMeta = props.DTSTART?.[0] || null;
    const isAllDay = (startMeta?.params?.VALUE || '').toUpperCase() === 'DATE' || /^\d{8}$/.test(startMeta?.value || '');
    const status = decodeIcsText(props.STATUS?.[0]?.value || 'confirmed').toLowerCase();
    if (props['RECURRENCE-ID']?.[0]?.value) {
      const overrideEvent = buildIcsEventFromProps({ sourceId, calendarId, calendarSummary, calendarColor, defaultUrl, props, index, ownerEmails });
      if (overrideEvent && overrideEvent.status !== 'cancelled' && eventOverlapsWindow(overrideEvent, timeMin, timeMax)) {
        events.push(overrideEvent);
      }
      return;
    }

    const rrule = props.RRULE?.[0]?.value ? parseIcsRrule(props.RRULE[0].value) : null;
    if (rrule?.freq) {
      const startDate = getIcsPropDate(startMeta, isAllDay);
      if (isStaleIndefiniteIcsRecurrence({ props, rule: rrule, startDate, timeMin })) {
        return;
      }
      const overrideKeys = overridesByUid.get(uid) || new Map();
      const exdateKeys = getIcsExdateKeys(props, isAllDay);
      buildRecurringIcsStartDates({
        startDate, rule: rrule, isAllDay, timeMin, timeMax,
        timeZone: getIcsRecurrenceZone(startMeta, isAllDay),
        untilTzid: startMeta?.params?.TZID,
      }).forEach((occurrenceStart, occurrenceIndex) => {
        const recurrenceKey = String(occurrenceStart.getTime());
        if (exdateKeys.has(recurrenceKey) || overrideKeys.has(recurrenceKey)) {
          return;
        }
        const event = buildIcsEventFromProps({
          sourceId,
          calendarId,
          calendarSummary,
          calendarColor,
          defaultUrl,
          props,
          index,
          occurrenceStart,
          occurrenceIndex,
          ownerEmails,
        });
        if (event && event.status !== 'cancelled' && eventOverlapsWindow(event, timeMin, timeMax)) {
          events.push(event);
        }
      });
      return;
    }

    const event = buildIcsEventFromProps({ sourceId, calendarId, calendarSummary, calendarColor, defaultUrl, props, index, ownerEmails });
    if (event && status !== 'cancelled' && eventOverlapsWindow(event, timeMin, timeMax)) {
      events.push(event);
    }
  });

  return events.sort((left, right) => new Date(left.start) - new Date(right.start));
};

module.exports = {
  decodeIcsText,
  eventOverlapsWindow,
  parseIcsEvents,
  unfoldIcsLines,
};
