const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyBriefEvent } = require('../src/brief/selection');
const { describeReason, explainEvents } = require('../src/brief/explain');

const NOW = Date.parse('2026-04-10T07:00:00Z'); // Fri 09:00 Berlin
const TZ = 'Europe/Berlin';
const at = (date, time) => `${date}T${time}:00+02:00`;
const makeEvent = (overrides = {}) => ({
  id: overrides.title || 'e', title: 'Event', description: '', location: '', isAllDay: false, isRecurring: false,
  calendarSummary: 'Family', start: at('2026-04-10', '15:00'), end: at('2026-04-10', '16:00'), ...overrides,
});
const explain = (events, options = {}) => explainEvents({
  events,
  now: NOW,
  timeZone: TZ,
  classify: (event) => classifyBriefEvent(event, { now: NOW, timeZone: TZ }),
  ...options,
});

test('every upcoming event gets a row with a readable reason, ordered by start time', () => {
  const rows = explain([
    makeEvent({ title: 'Später', start: at('2026-04-10', '18:00'), end: at('2026-04-10', '19:00') }),
    makeEvent({ title: 'Zahnarzt', start: at('2026-04-10', '11:00'), end: at('2026-04-10', '12:00') }),
    makeEvent({ title: 'Lesson', isRecurring: true, start: at('2026-04-10', '13:00'), end: at('2026-04-10', '14:00') }),
  ]);
  assert.deepEqual(rows.map((row) => row.title), ['Zahnarzt', 'Lesson', 'Später']);
  assert.equal(rows[0].included, true);
  assert.equal(rows[0].reason, 'medical_appointment');
  assert.match(rows[0].reasonText, /doctor/i);
  assert.equal(rows[1].included, false);
  assert.match(rows[1].reasonText, /routine/i);
  assert.equal(rows[2].day, 'today');
});

test('finished events and events beyond the horizon are not listed', () => {
  const rows = explain([
    makeEvent({ title: 'Vorbei', start: at('2026-04-10', '07:00'), end: at('2026-04-10', '08:00') }),
    makeEvent({ title: 'Nächste Woche', start: at('2026-04-20', '10:00'), end: at('2026-04-20', '11:00') }),
    makeEvent({ title: 'Morgen', start: at('2026-04-11', '10:00'), end: at('2026-04-11', '11:00') }),
  ]);
  assert.deepEqual(rows.map((row) => row.title), ['Morgen']);
  assert.equal(rows[0].day, 'tomorrow');
});

test('an event whose calendar is outside the brief says so, and offers neither pin nor mute', () => {
  const rows = explain([makeEvent({ title: 'Work', calendarId: 'work' })], { isInScope: (event) => event.calendarId !== 'work' });
  assert.equal(rows[0].included, false);
  assert.equal(rows[0].reason, 'calendar_not_in_brief');
  assert.match(rows[0].reasonText, /Brief calendars/);
  assert.equal(rows[0].canPin, false, 'a title rule cannot override the calendar choice');
  assert.equal(rows[0].canMute, false);
});

test('shown events can be muted, hidden ones can be pinned', () => {
  const rows = explain([
    makeEvent({ title: 'Zahnarzt', start: at('2026-04-10', '11:00'), end: at('2026-04-10', '12:00') }),
    makeEvent({ title: 'Lesson', isRecurring: true, start: at('2026-04-10', '13:00'), end: at('2026-04-10', '14:00') }),
  ]);
  const [shown, hidden] = rows;
  assert.deepEqual([shown.canMute, shown.canPin], [true, false]);
  assert.deepEqual([hidden.canMute, hidden.canPin], [false, true]);
  assert.equal(hidden.ruleKeyword, 'Lesson');
});

test('declined and cancelled events cannot be pinned (nothing would make them show)', () => {
  const rows = explain([makeEvent({ title: 'Abgesagt', declined: true })]);
  assert.equal(rows[0].reason, 'cancelled_or_declined');
  assert.equal(rows[0].canPin, false);
});

test('events with an unreadable start are skipped, long lists are cut', () => {
  assert.deepEqual(explain([makeEvent({ title: 'Kaputt', start: 'not a date' })]), []);
  const many = Array.from({ length: 100 }, (_, index) => makeEvent({ title: `Event ${index}`, id: `e${index}` }));
  assert.equal(explain(many, { limit: 20 }).length, 20);
});

test('every reason code the selection can produce has a plain-language text', () => {
  const codes = [
    'invalid_dates', 'already_finished', 'cancelled_or_declined', 'user_never_show', 'user_always_show', 'schedule_change',
    'medical_appointment', 'routine_non_recurring', 'distinct_or_non_recurring', 'routine_recurring', 'recurring_allowed_by_setting',
    'recurring_all_day', 'recurring_household_reminder', 'recurring_beyond_horizon', 'recurring_distinctive_event',
    'routine_recurring_suppressed', 'generic_recurring_suppressed', 'calendar_not_in_brief',
  ];
  codes.forEach((code) => assert.notEqual(describeReason(code), code, `${code} needs a text`));
  assert.equal(describeReason('something_new'), 'something_new', 'unknown codes are shown as they are, not hidden');
});
