const test = require('node:test');
const assert = require('node:assert/strict');

const { expandRecurrence } = require('../src/calendar/recurrence');

const ms = (iso) => Date.parse(iso);
const expand = (startIso, rule, { from = '2026-01-01T00:00:00Z', to = '2026-12-31T00:00:00Z', zone = 'Europe/Berlin', until = null } = {}) => (
  expandRecurrence({
    startMs: ms(startIso), rule, windowStartMs: ms(from), windowEndMs: ms(to), untilMs: until ? ms(until) : null, timeZone: zone,
  }).map((value) => new Date(value).toISOString().replace('.000Z', 'Z'))
);

test('monthly "second Tuesday" is computed per month, not copied from the first date', () => {
  // 10 March 2026 is the second Tuesday.
  const result = expand('2026-03-10T18:00:00Z', { freq: 'MONTHLY', count: 4, byDayOrdinals: [{ n: 2, day: 'TU' }], byDay: ['TU'] });
  assert.deepEqual(result, ['2026-03-10T18:00:00Z', '2026-04-14T17:00:00Z', '2026-05-12T17:00:00Z', '2026-06-09T17:00:00Z']);
});

test('monthly "last Friday" follows month length', () => {
  const result = expand('2026-03-27T15:00:00Z', { freq: 'MONTHLY', count: 4, byDayOrdinals: [{ n: -1, day: 'FR' }], byDay: ['FR'] }, { zone: 'UTC' });
  assert.deepEqual(result, ['2026-03-27T15:00:00Z', '2026-04-24T15:00:00Z', '2026-05-29T15:00:00Z', '2026-06-26T15:00:00Z']);
});

test('BYMONTHDAY, including negative values and months that are too short', () => {
  const fifteenth = expand('2026-01-15T10:00:00Z', { freq: 'MONTHLY', count: 3, byMonthDay: [15] }, { zone: 'UTC' });
  assert.deepEqual(fifteenth, ['2026-01-15T10:00:00Z', '2026-02-15T10:00:00Z', '2026-03-15T10:00:00Z']);
  const lastDay = expand('2026-01-31T10:00:00Z', { freq: 'MONTHLY', count: 3, byMonthDay: [-1] }, { zone: 'UTC' });
  assert.deepEqual(lastDay, ['2026-01-31T10:00:00Z', '2026-02-28T10:00:00Z', '2026-03-31T10:00:00Z']);
  const thirtyFirst = expand('2026-01-31T10:00:00Z', { freq: 'MONTHLY', count: 3, byMonthDay: [31] }, { zone: 'UTC' });
  assert.deepEqual(
    thirtyFirst,
    ['2026-01-31T10:00:00Z', '2026-03-31T10:00:00Z', '2026-05-31T10:00:00Z'],
    'February and April have no 31st: skipped (RFC 5545), and a skipped month does not use up the count',
  );
});

test('every weekday occurrence inside a month (BYDAY=TU without a number)', () => {
  const result = expand('2026-03-03T08:00:00Z', { freq: 'MONTHLY', count: 5, byDayOrdinals: [{ n: 0, day: 'TU' }], byDay: ['TU'] }, { zone: 'UTC' });
  assert.deepEqual(result, ['2026-03-03T08:00:00Z', '2026-03-10T08:00:00Z', '2026-03-17T08:00:00Z', '2026-03-24T08:00:00Z', '2026-03-31T08:00:00Z']);
});

test('monthly interval 2 skips months', () => {
  const result = expand('2026-01-05T09:00:00Z', { freq: 'MONTHLY', interval: 2, count: 3, byDayOrdinals: [{ n: 1, day: 'MO' }], byDay: ['MO'] }, { zone: 'UTC' });
  assert.deepEqual(result, ['2026-01-05T09:00:00Z', '2026-03-02T09:00:00Z', '2026-05-04T09:00:00Z']);
});

test('plain monthly and yearly series keep working and clamp to the window', () => {
  assert.deepEqual(
    expand('2026-01-20T10:00:00Z', { freq: 'MONTHLY' }, { zone: 'UTC', from: '2026-03-01T00:00:00Z', to: '2026-05-31T00:00:00Z' }),
    ['2026-03-20T10:00:00Z', '2026-04-20T10:00:00Z', '2026-05-20T10:00:00Z'],
  );
  assert.deepEqual(
    expand('2024-04-12T08:00:00Z', { freq: 'YEARLY' }, { zone: 'UTC', from: '2026-01-01T00:00:00Z', to: '2026-12-31T00:00:00Z' }),
    ['2026-04-12T08:00:00Z'],
  );
});

test('UNTIL cuts the series, COUNT counts occurrences from the very first one', () => {
  assert.deepEqual(
    expand('2026-04-01T09:00:00Z', { freq: 'DAILY' }, { zone: 'UTC', to: '2026-04-30T00:00:00Z', until: '2026-04-03T09:00:00Z' }),
    ['2026-04-01T09:00:00Z', '2026-04-02T09:00:00Z', '2026-04-03T09:00:00Z'],
  );
  assert.deepEqual(
    expand('2026-01-05T09:00:00Z', { freq: 'WEEKLY', count: 3 }, { zone: 'UTC', from: '2026-01-11T00:00:00Z' }),
    ['2026-01-12T09:00:00Z', '2026-01-19T09:00:00Z'],
    'the 5th is before the window but still counts: COUNT=3 means 5th, 12th, 19th, and the 26th is not included',
  );
});

test('daily series in a zone keep their wall time over the DST change; UTC series keep their instant', () => {
  const berlin = expand('2026-03-27T08:00:00Z', { freq: 'DAILY', count: 4 }, { zone: 'Europe/Berlin' });
  assert.deepEqual(berlin, ['2026-03-27T08:00:00Z', '2026-03-28T08:00:00Z', '2026-03-29T07:00:00Z', '2026-03-30T07:00:00Z']);
  const utc = expand('2026-03-27T08:00:00Z', { freq: 'DAILY', count: 4 }, { zone: 'UTC' });
  assert.deepEqual(utc, ['2026-03-27T08:00:00Z', '2026-03-28T08:00:00Z', '2026-03-29T08:00:00Z', '2026-03-30T08:00:00Z']);
});

test('the number of occurrences is capped, so a bad rule cannot hang the sync', () => {
  const result = expand('2020-01-01T00:00:00Z', { freq: 'DAILY' }, { zone: 'UTC', from: '2020-01-01T00:00:00Z', to: '2030-01-01T00:00:00Z' });
  assert.equal(result.length, 500);
});

test('an unusable start or an unknown frequency yields nothing', () => {
  assert.deepEqual(expandRecurrence({ startMs: NaN, rule: { freq: 'DAILY' }, windowStartMs: 0, windowEndMs: 1e12 }), []);
  assert.deepEqual(expand('2026-01-01T00:00:00Z', { freq: 'SECONDLY' }), []);
});
