const test = require('node:test');
const assert = require('node:assert/strict');

const { parseIcsEvents } = require('../index.js');

const lines = (...rows) => rows.join('\r\n');
const parse = (text, extra = {}) => parseIcsEvents({
  sourceId: 'src',
  calendarId: 'cal',
  calendarSummary: 'Family',
  text,
  timeMin: '2026-04-09T00:00:00Z',
  timeMax: '2026-04-30T00:00:00Z',
  ...extra,
});

test('alarms inside an event no longer overwrite its description', () => {
  const [event] = parse(lines(
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:a1',
    'DTSTART:20260410T100000Z',
    'DTEND:20260410T110000Z',
    'SUMMARY:Zahnarzt',
    'DESCRIPTION:Bring the insurance card',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ));
  assert.equal(event.description, 'Bring the insurance card');
});

test('an event without its own description is not given the alarm text', () => {
  const [event] = parse(lines(
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:a2',
    'DTSTART:20260410T100000Z',
    'DTEND:20260410T110000Z',
    'SUMMARY:Dinner',
    'BEGIN:VALARM',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
  ));
  assert.equal(event.description, '');
});

test('events the owner declined are flagged, others are not, and nothing is guessed without addresses', () => {
  const text = lines(
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:d1',
    'DTSTART:20260410T100000Z',
    'DTEND:20260410T110000Z',
    'SUMMARY:Team lunch',
    'ATTENDEE;CN="Doe; Jane";PARTSTAT=DECLINED:mailto:Jane@Example.com',
    'ATTENDEE;PARTSTAT=ACCEPTED:mailto:bob@example.com',
    'END:VEVENT',
  );
  assert.equal(parse(text, { ownerEmails: ['jane@example.com'] })[0].declined, true);
  assert.equal(parse(text, { ownerEmails: ['bob@example.com'] })[0].declined, false);
  assert.equal(parse(text)[0].declined, false);
  assert.deepEqual(parse(text)[0].attendees, ['jane@example.com', 'bob@example.com']);
});

test('quoted parameters with colons do not break date parsing', () => {
  const [event] = parse(lines(
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:q1',
    'DTSTART:20260410T100000Z',
    'DTEND:20260410T110000Z',
    'SUMMARY:Call',
    'ORGANIZER;CN="Boss: The Great":mailto:boss@example.com',
    'END:VEVENT',
  ));
  assert.equal(event.title, 'Call');
  assert.equal(event.start, '2026-04-10T10:00:00Z');
});
