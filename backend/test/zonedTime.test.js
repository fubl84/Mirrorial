const test = require('node:test');
const assert = require('node:assert/strict');

const { zonedWallTimeToMs } = require('../src/time/zone');

const iso = (ms) => new Date(ms).toISOString();
const at = (year, month, day, hour, minute, zone) => zonedWallTimeToMs({ year, month, day, hour, minute }, zone);

test('winter and summer offsets are applied correctly', () => {
  assert.equal(iso(at(2026, 1, 15, 9, 0, 'Europe/Berlin')), '2026-01-15T08:00:00.000Z', 'CET is UTC+1');
  assert.equal(iso(at(2026, 7, 15, 9, 0, 'Europe/Berlin')), '2026-07-15T07:00:00.000Z', 'CEST is UTC+2');
  assert.equal(iso(at(2026, 4, 15, 9, 0, 'America/New_York')), '2026-04-15T13:00:00.000Z', 'EDT is UTC-4');
  assert.equal(iso(at(2026, 12, 15, 9, 0, 'America/New_York')), '2026-12-15T14:00:00.000Z', 'EST is UTC-5');
  assert.equal(iso(at(2026, 4, 15, 9, 0, 'Asia/Kolkata')), '2026-04-15T03:30:00.000Z', 'half-hour zone');
  assert.equal(iso(at(2026, 4, 15, 9, 0, 'UTC')), '2026-04-15T09:00:00.000Z');
});

test('the result does not depend on the zone of the machine running the code', () => {
  // The same wall time in the same zone must be the same instant everywhere; it is computed with Intl only.
  const first = at(2026, 4, 15, 9, 0, 'Europe/Berlin');
  const original = process.env.TZ;
  process.env.TZ = 'Pacific/Auckland';
  const second = at(2026, 4, 15, 9, 0, 'Europe/Berlin');
  process.env.TZ = original;
  assert.equal(first, second);
});

test('a wall time that is skipped in spring moves forward by the gap', () => {
  // Berlin, 29 March 2026: 02:00 -> 03:00. 02:30 does not exist.
  assert.equal(iso(at(2026, 3, 29, 2, 30, 'Europe/Berlin')), '2026-03-29T01:30:00.000Z', '02:30 reads as 03:30 CEST');
  assert.equal(iso(at(2026, 3, 29, 1, 59, 'Europe/Berlin')), '2026-03-29T00:59:00.000Z');
  assert.equal(iso(at(2026, 3, 29, 3, 0, 'Europe/Berlin')), '2026-03-29T01:00:00.000Z');
});

test('a wall time that happens twice in autumn takes the first occurrence', () => {
  // Berlin, 25 October 2026: 03:00 CEST -> 02:00 CET. 02:30 happens twice.
  assert.equal(iso(at(2026, 10, 25, 2, 30, 'Europe/Berlin')), '2026-10-25T00:30:00.000Z', 'the CEST one');
  assert.equal(iso(at(2026, 10, 25, 1, 30, 'Europe/Berlin')), '2026-10-24T23:30:00.000Z');
  assert.equal(iso(at(2026, 10, 25, 3, 30, 'Europe/Berlin')), '2026-10-25T02:30:00.000Z', 'after the change: CET');
});

test('the date rolls over correctly near midnight', () => {
  assert.equal(iso(at(2026, 4, 15, 0, 30, 'Europe/Berlin')), '2026-04-14T22:30:00.000Z');
  assert.equal(iso(at(2026, 4, 15, 23, 30, 'Pacific/Auckland')), '2026-04-15T11:30:00.000Z');
});

test('repeated lookups of a zone name give the same answer (the zone check is cached)', () => {
  const first = at(2026, 4, 15, 9, 0, 'Europe/Berlin');
  for (let index = 0; index < 50; index += 1) {
    assert.equal(at(2026, 4, 15, 9, 0, 'Europe/Berlin'), first);
    assert.equal(at(2026, 4, 15, 9, 0, 'Mars/Olympus'), null);
  }
  // Many different bogus names (a hostile feed) must neither throw nor change the answer for a real zone.
  for (let index = 0; index < 500; index += 1) {
    assert.equal(at(2026, 4, 15, 9, 0, `Nowhere/Zone${index}`), null);
  }
  assert.equal(at(2026, 4, 15, 9, 0, 'Europe/Berlin'), first);
});

test('an unknown or empty zone returns null instead of guessing', () => {
  assert.equal(at(2026, 4, 15, 9, 0, 'Mars/Olympus'), null);
  assert.equal(at(2026, 4, 15, 9, 0, ''), null);
  assert.equal(at(2026, 4, 15, 9, 0, undefined), null);
  // Outlook writes Windows names; they are not IANA zones and must not be silently misread.
  assert.equal(at(2026, 4, 15, 9, 0, 'W. Europe Standard Time'), null);
});
