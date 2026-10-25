// Helpers for reading iCalendar content lines and the attendee/ownership information that subscription
// feeds carry. Pure functions, no I/O.

// Splits `KEY;PARAM=a;PARAM2="b;c":value` into { key, params, value }. Quoted parameter values may contain
// ';' and ':' (e.g. CN="Doe; Jane"), so the line is scanned instead of split on the first ':' / every ';'.
const splitIcsContentLine = (line) => {
  let inQuotes = false;
  let separatorIndex = -1;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ':' && !inQuotes) {
      separatorIndex = index;
      break;
    }
  }
  if (separatorIndex <= 0) {
    return null;
  }

  const head = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);
  const segments = [];
  let current = '';
  inQuotes = false;
  for (const char of head) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === ';' && !inQuotes) {
      segments.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  segments.push(current);

  const [rawKey, ...rawParams] = segments;
  const params = {};
  rawParams.forEach((segment) => {
    const equalsIndex = segment.indexOf('=');
    if (equalsIndex > 0) {
      params[segment.slice(0, equalsIndex).trim().toUpperCase()] = segment.slice(equalsIndex + 1).trim().replace(/^"|"$/g, '');
    }
  });

  return { key: rawKey.trim().toUpperCase(), params, value };
};

const normalizeEmail = (value) => `${value || ''}`.trim().replace(/^mailto:/i, '').toLowerCase();

// Own addresses entered by the user ("anna@example.com, anna@work.example") -> unique lower-case list.
const parseOwnerEmails = (value) => {
  const source = Array.isArray(value) ? value : `${value || ''}`.split(/[\s,;]+/);
  return Array.from(new Set(source.map(normalizeEmail).filter((entry) => entry.includes('@'))));
};

const getAttendees = (props) => (props.ATTENDEE || []).map((entry) => ({
  email: normalizeEmail(entry.value),
  status: `${entry.params?.PARTSTAT || ''}`.toUpperCase(),
}));

// True when one of the owner's own addresses answered DECLINED. Without known addresses nothing is
// declined: guessing would hide events that belong to somebody else's calendar view.
const isDeclinedForOwner = (props, ownerEmails = []) => {
  if (!Array.isArray(ownerEmails) || ownerEmails.length === 0) {
    return false;
  }
  const owners = new Set(ownerEmails.map(normalizeEmail));
  return getAttendees(props).some((attendee) => owners.has(attendee.email) && attendee.status === 'DECLINED');
};

// Display name that publishers put into the feed (Google, Apple, Outlook and Nextcloud all use X-WR-CALNAME).
const getCalendarNameFromIcs = (text) => {
  const head = `${text || ''}`.split(/BEGIN:VEVENT/i)[0];
  const line = head.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).find((entry) => /^X-WR-CALNAME[;:]/i.test(entry));
  const parsed = line ? splitIcsContentLine(line) : null;
  return parsed ? parsed.value.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ').trim() : '';
};

module.exports = {
  getAttendees,
  getCalendarNameFromIcs,
  isDeclinedForOwner,
  normalizeEmail,
  parseOwnerEmails,
  splitIcsContentLine,
};
