const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveTimeZone, getLocalDateKey, getTimeOfDay } = require('../src/time/zone');

const BERLIN = { systemTimeZone: 'Europe/Berlin' };
const UTC_DEVICE = { systemTimeZone: 'UTC' };

test('empty and "auto" mean the device time zone', () => {
  assert.equal(resolveTimeZone('', BERLIN), 'Europe/Berlin');
  assert.equal(resolveTimeZone(undefined, BERLIN), 'Europe/Berlin');
  assert.equal(resolveTimeZone('  auto ', BERLIN), 'Europe/Berlin');
  assert.equal(resolveTimeZone('AUTO', UTC_DEVICE), 'UTC');
});

test('the legacy default "UTC" on a device that is not on UTC means the device zone', () => {
  assert.equal(resolveTimeZone('UTC', BERLIN), 'Europe/Berlin');
  assert.equal(resolveTimeZone('UTC', { systemTimeZone: 'America/New_York' }), 'America/New_York');
});

test('"Etc/UTC" is the way to ask for UTC explicitly', () => {
  assert.equal(resolveTimeZone('Etc/UTC', BERLIN), 'Etc/UTC');
  assert.equal(resolveTimeZone('UTC', UTC_DEVICE), 'UTC');
  // Intl treats "Etc/UTC" and "UTC" as the same zone, so for a device on UTC either spelling means UTC.
  assert.equal(resolveTimeZone('UTC', { systemTimeZone: 'Etc/UTC' }), 'UTC');
  assert.equal(getLocalDateKey(Date.parse('2026-04-10T22:30:00Z'), resolveTimeZone('Etc/UTC', BERLIN)), '2026-04-10');
});

test('an explicit IANA zone wins; an invalid name falls back to the device zone, not to UTC', () => {
  assert.equal(resolveTimeZone('America/Los_Angeles', BERLIN), 'America/Los_Angeles');
  assert.equal(resolveTimeZone('Mars/Olympus_Mons', BERLIN), 'Europe/Berlin');
  assert.equal(resolveTimeZone(42, BERLIN), 'Europe/Berlin');
});

test('an invalid device zone still yields a usable zone', () => {
  assert.equal(resolveTimeZone('', { systemTimeZone: 'Not/AZone' }), 'UTC');
});

test('the result is what the brief needs: local day and time of day follow the resolved zone', () => {
  const evening = Date.parse('2026-04-10T22:30:00Z'); // 00:30 on 11 April in Berlin
  assert.equal(getLocalDateKey(evening, resolveTimeZone('UTC', BERLIN)), '2026-04-11');
  assert.equal(getLocalDateKey(evening, 'Etc/UTC'), '2026-04-10');
  assert.equal(getTimeOfDay(Date.parse('2026-04-10T16:30:00Z'), resolveTimeZone('UTC', BERLIN)), 'evening');
});
