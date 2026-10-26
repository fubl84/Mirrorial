const test = require('node:test');
const assert = require('node:assert/strict');

const { extractClockTimes } = require('../src/brief/clock');
const { dedupeEvents, findOverlaps, findTightTransitions } = require('../src/brief/schedule');

const TZ = 'Europe/Berlin';
const at = (time, date = '2026-04-10') => `${date}T${time}:00+02:00`;
const makeEvent = (id, title, startTime, endTime, extra = {}) => ({
  id,
  title,
  start: at(startTime, extra.date),
  end: at(endTime, extra.date),
  isAllDay: false,
  location: '',
  description: '',
  ...extra,
});

test('extractClockTimes understands 24h, 12h and German notations', () => {
  assert.deepEqual(extractClockTimes('um 14:30 und 9:05'), ['14:30', '09:05']);
  assert.deepEqual(extractClockTimes('2:30 pm'), ['14:30']);
  assert.deepEqual(extractClockTimes('12 am und 12 pm'), ['00:00', '12:00']);
  assert.deepEqual(extractClockTimes('um 14.30 Uhr'), ['14:30']);
  assert.deepEqual(extractClockTimes('gegen 9 Uhr'), ['09:00']);
  assert.deepEqual(extractClockTimes('Preis 14.30 Euro, Version 2.5, 25:99'), []);
});

test('findOverlaps ignores touching ranges and all-day events', () => {
  const a = makeEvent('a', 'A', '10:00', '11:00');
  const b = makeEvent('b', 'B', '10:30', '11:30');
  const c = makeEvent('c', 'C', '11:30', '12:00');
  const allDay = { id: 'd', title: 'Holiday', start: '2026-04-10', end: '2026-04-11', isAllDay: true };
  const pairs = findOverlaps([a, b, c, allDay]).map(([x, y]) => `${x.id}${y.id}`);
  assert.deepEqual(pairs, ['ab'], 'b and c only touch, the all-day event never overlaps');
});

test('findTightTransitions needs a short gap, two different places and the same day', () => {
  const a = makeEvent('a', 'Dentist', '10:00', '11:00', { location: 'Clinic' });
  const b = makeEvent('b', 'Meeting', '11:10', '12:00', { location: 'Office' });
  const same = makeEvent('c', 'Follow-up', '12:05', '13:00', { location: 'Office' });
  const result = findTightTransitions([a, b, same], { timeZone: TZ });
  assert.equal(result.length, 1);
  assert.equal(result[0].gapMinutes, 10);
  assert.equal(result[0].second.id, 'b');

  const farApart = makeEvent('x', 'X', '11:40', '12:00', { location: 'Office' });
  assert.deepEqual(findTightTransitions([a, farApart], { timeZone: TZ }), [], '40 minutes is not tight');
});

test('dedupeEvents merges the same appointment and keeps the more detailed copy', () => {
  const plain = makeEvent('1', 'Physio ', '11:00', '12:00', { isRecurring: true });
  const detailed = makeEvent('2', 'physio', '11:00', '12:00', { location: 'Praxis' });
  const other = makeEvent('3', 'Physio', '14:00', '15:00');
  const result = dedupeEvents([plain, detailed, other]);
  assert.equal(result.length, 2);
  assert.ok(result.some((event) => event.id === '2'));
  assert.ok(!result.some((event) => event.id === '1'));
});
