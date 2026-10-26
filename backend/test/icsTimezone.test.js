const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// parseIcsEvents depends on the time zone of the process, so every case runs in a child process with an
// explicit TZ. That is the only honest way to prove the result does not depend on where the backend runs.
const INDEX = path.join(__dirname, '..', 'index.js');

const parseIn = (serverTz, lines, window = ['2026-03-01T00:00:00Z', '2026-12-31T00:00:00Z']) => {
  const script = `
    const { parseIcsEvents } = require(${JSON.stringify(INDEX)});
    const events = parseIcsEvents({
      sourceId: 's', calendarId: 'c', calendarSummary: 'x',
      text: ${JSON.stringify(lines.join('\r\n'))},
      timeMin: ${JSON.stringify(window[0])}, timeMax: ${JSON.stringify(window[1])},
    });
    process.stdout.write(JSON.stringify(events.map((e) => ({ title: e.title, start: e.start, end: e.end, ms: Date.parse(e.start) }))));
    process.exit(0);
  `;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: serverTz }, encoding: 'utf8' }));
};

const single = (dtstart, dtend, extra = []) => [
  'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:one', dtstart, dtend, 'SUMMARY:Call', ...extra, 'END:VEVENT', 'END:VCALENDAR',
];

test('a TZID event is the same instant on a server in any time zone', () => {
  const lines = single('DTSTART;TZID=America/New_York:20260415T090000', 'DTEND;TZID=America/New_York:20260415T100000');
  const results = ['Europe/Berlin', 'UTC', 'Asia/Tokyo', 'America/Los_Angeles'].map((tz) => parseIn(tz, lines)[0]);
  results.forEach((event) => {
    assert.equal(event.start, '2026-04-15T13:00:00Z', 'the output is an absolute instant');
    assert.equal(event.end, '2026-04-15T14:00:00Z');
  });
});

test('UTC and floating values behave as before', () => {
  const utc = parseIn('Europe/Berlin', single('DTSTART:20260415T090000Z', 'DTEND:20260415T100000Z'))[0];
  assert.equal(utc.start, '2026-04-15T09:00:00Z');
  const floating = parseIn('Europe/Berlin', single('DTSTART:20260415T090000', 'DTEND:20260415T100000'))[0];
  assert.equal(floating.start, '2026-04-15T09:00:00', 'floating time stays floating (the device zone)');
});

test('an unknown TZID (Outlook style) is not misread: it keeps the previous behaviour', () => {
  const event = parseIn('Europe/Berlin', single('DTSTART;TZID=W. Europe Standard Time:20260415T090000', 'DTEND;TZID=W. Europe Standard Time:20260415T100000'))[0];
  assert.equal(event.start, '2026-04-15T09:00:00');
});

test('all-day events ignore TZID and stay a plain date', () => {
  const event = parseIn('Asia/Tokyo', single('DTSTART;VALUE=DATE:20260415', 'DTEND;VALUE=DATE:20260416'))[0];
  assert.equal(event.start, '2026-04-15');
});

test('a weekly series keeps its local wall time across the spring DST change, on any server zone', () => {
  // Every Wednesday 09:00 Berlin, from 18 March. Berlin changes to summer time on 29 March 2026.
  const lines = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:weekly',
    'DTSTART;TZID=Europe/Berlin:20260318T090000', 'DTEND;TZID=Europe/Berlin:20260318T100000',
    'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=4', 'SUMMARY:Standup', 'END:VEVENT', 'END:VCALENDAR',
  ];
  ['Europe/Berlin', 'UTC', 'Asia/Tokyo', 'America/New_York'].forEach((tz) => {
    const starts = parseIn(tz, lines, ['2026-03-01T00:00:00Z', '2026-04-30T00:00:00Z']).map((event) => event.start);
    assert.deepEqual(starts, [
      '2026-03-18T08:00:00Z', // CET  (UTC+1)
      '2026-03-25T08:00:00Z', // CET
      '2026-04-01T07:00:00Z', // CEST (UTC+2): the clock on the wall is still 09:00
      '2026-04-08T07:00:00Z',
    ], `server zone ${tz}`);
  });
});

test('EXDATE with a TZID removes the right occurrence', () => {
  const lines = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:weekly',
    'DTSTART;TZID=Europe/Berlin:20260401T090000', 'DTEND;TZID=Europe/Berlin:20260401T100000',
    'RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=3', 'EXDATE;TZID=Europe/Berlin:20260408T090000', 'SUMMARY:Standup',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  ['Europe/Berlin', 'America/Los_Angeles'].forEach((tz) => {
    const starts = parseIn(tz, lines, ['2026-03-30T00:00:00Z', '2026-04-30T00:00:00Z']).map((event) => event.start);
    assert.deepEqual(starts, ['2026-04-01T07:00:00Z', '2026-04-15T07:00:00Z'], `server zone ${tz}`);
  });
});
