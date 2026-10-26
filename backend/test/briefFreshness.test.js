const test = require('node:test');
const assert = require('node:assert/strict');

const { decideLlmReuse, getDayPart } = require('../src/brief/freshness');

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-04-10T07:00:00Z'); // Fri 09:00 Berlin

const ready = (fingerprint, minutesAgo, status = 'ready') => ({
  status,
  updatedAt: new Date(NOW - (minutesAgo * 60000)).toISOString(),
  debug: { pipeline: 'dossier', fingerprint },
});
const decide = (previous, fingerprint, extra = {}) => decideLlmReuse({ previous, fingerprint, now: NOW, timeZone: TZ, ...extra });

test('unchanged input is reused, however often the display polls', () => {
  assert.deepEqual(decide(ready('abc', 5), 'abc'), { reuse: true, reason: 'unchanged' });
  assert.deepEqual(decide(ready('abc', 120), 'abc'), { reuse: true, reason: 'unchanged' });
});

test('changed input, a force request, or a missing result asks the model again', () => {
  assert.deepEqual(decide(ready('abc', 5), 'xyz'), { reuse: false, reason: 'input_changed' });
  assert.deepEqual(decide(ready('abc', 5), 'abc', { force: true }), { reuse: false, reason: 'forced' });
  assert.equal(decide(null, 'abc').reason, 'no_previous_result');
  assert.equal(decide({ status: 'ready', updatedAt: new Date(NOW).toISOString(), debug: { pipeline: 'legacy' } }, 'abc').reason, 'no_previous_result');
  assert.equal(decide({ status: 'ready', updatedAt: 'garbage', debug: { pipeline: 'dossier', fingerprint: 'abc' } }, 'abc').reason, 'no_previous_result');
});

test('the wording is refreshed when the part of the day changes, and after the safety interval', () => {
  const morning = ready('abc', 0);
  const lateMorning = decideLlmReuse({ previous: morning, fingerprint: 'abc', now: NOW + (60 * 60000), timeZone: TZ });
  assert.equal(lateMorning.reuse, true, '09:00 -> 10:00 is the same part of the day');
  const afternoon = decideLlmReuse({ previous: morning, fingerprint: 'abc', now: NOW + (4 * 3600000), timeZone: TZ });
  assert.deepEqual(afternoon, { reuse: false, reason: 'day_part_changed' });
  assert.equal(getDayPart(NOW, TZ), '2026-04-10|morning');
  assert.equal(decide(ready('abc', 13 * 60), 'abc').reason, 'day_part_changed', 'a day-old result');
  const old = decideLlmReuse({ previous: ready('abc', 0), fingerprint: 'abc', now: NOW + (60 * 60000), timeZone: TZ, safetyRefreshHours: 0.5 });
  assert.equal(old.reason, 'safety_refresh');
});

test('a failed result is not retried on every refresh, but after the back-off or when the input changes', () => {
  assert.deepEqual(decide(ready('abc', 3, 'failed'), 'abc'), { reuse: true, reason: 'recent_failure_backoff' });
  assert.equal(decide(ready('abc', 20, 'failed'), 'abc').reason, 'retry_after_failure');
  assert.equal(decide(ready('abc', 3, 'failed'), 'changed').reason, 'retry_after_failure');
});

test('a degraded result (model down, rule-based notes shown) is retried after the back-off, not kept for hours', () => {
  const degraded = { ...ready('abc', 3), degraded: true };
  assert.deepEqual(decide(degraded, 'abc'), { reuse: true, reason: 'recent_failure_backoff' });
  assert.equal(decide({ ...degraded, updatedAt: new Date(NOW - (20 * 60000)).toISOString() }, 'abc').reason, 'retry_after_failure');
  assert.equal(decide(degraded, 'other').reason, 'retry_after_failure');
});

test('disabled and skipped results are never reused, so a new key or setting acts at once', () => {
  assert.equal(decide({ ...ready('abc', 1), status: 'skipped' }, 'abc').reuse, false);
  assert.equal(decide({ ...ready('abc', 1), status: 'disabled' }, 'abc').reuse, false);
});
