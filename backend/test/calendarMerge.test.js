const test = require('node:test');
const assert = require('node:assert/strict');

const { STALE_KEEP_MS, keepPreviousOnError } = require('../src/calendar/merge');

const NOW = Date.parse('2026-04-10T10:00:00Z');
const hoursAgo = (hours) => new Date(NOW - (hours * 3600000)).toISOString();

const previousCache = (lastSuccessAt) => ({
  events: [
    { id: 'i1', sourceId: 'family', title: 'Zahnarzt' },
    { id: 'i2', sourceId: 'family', title: 'Elternabend' },
    { id: 'i3', sourceId: 'work', title: 'Meeting' },
    { id: 'g1', title: 'Google event' },
  ],
  calendars: [{ id: 'family:x', sourceId: 'family', summary: 'Family' }, { id: 'cal-g', summary: 'Mine' }],
  sources: [
    { id: 'family', status: 'ready', lastSuccessAt },
    { id: 'work', status: 'ready', lastSuccessAt },
    { id: 'google', status: 'ready', lastSuccessAt },
  ],
});
const failed = (id) => ({ calendars: [], events: [], source: { id, type: 'ics', status: 'error', error: 'The calendar server did not answer in time.' } });
const worked = (id, events) => ({ calendars: [{ id: `${id}:x`, sourceId: id }], events, source: { id, type: 'ics', status: 'ready', eventCount: events.length } });

test('a failing source keeps the events it delivered last time, marked stale', () => {
  const result = keepPreviousOnError({ bundle: failed('family'), previous: previousCache(hoursAgo(1)), now: NOW });
  assert.deepEqual(result.events.map((event) => event.id), ['i1', 'i2'], 'only its own events, not the other sources');
  assert.equal(result.source.stale, true);
  assert.equal(result.source.status, 'error', 'the error is still shown to the user');
  assert.equal(result.source.lastSuccessAt, hoursAgo(1));
  assert.equal(result.source.eventCount, 2);
  assert.equal(result.calendars[0].summary, 'Family', 'the calendar entry survives too');
});

test('a source that works replaces the old events and records the success time', () => {
  const fresh = worked('family', [{ id: 'i9', sourceId: 'family', title: 'New' }]);
  const result = keepPreviousOnError({ bundle: fresh, previous: previousCache(hoursAgo(5)), now: NOW });
  assert.deepEqual(result.events.map((event) => event.id), ['i9']);
  assert.equal(result.source.stale, false);
  assert.equal(result.source.lastSuccessAt, new Date(NOW).toISOString());
});

test('after the keep window the old events are dropped instead of showing outdated appointments', () => {
  const justInside = keepPreviousOnError({ bundle: failed('family'), previous: previousCache(hoursAgo(47)), now: NOW });
  assert.equal(justInside.events.length, 2);
  const outside = keepPreviousOnError({ bundle: failed('family'), previous: previousCache(hoursAgo(49)), now: NOW });
  assert.equal(outside.events.length, 0);
  assert.equal(outside.source.stale, false);
  assert.equal(STALE_KEEP_MS, 48 * 3600000);
});

test('a cache from before lastSuccessAt existed still protects the first failure after an upgrade', () => {
  const legacy = previousCache(undefined);
  legacy.sources.forEach((source) => { delete source.lastSuccessAt; });
  legacy.syncedAt = hoursAgo(2);
  const result = keepPreviousOnError({ bundle: failed('family'), previous: legacy, now: NOW });
  assert.equal(result.events.length, 2);
  assert.equal(result.source.lastSuccessAt, hoursAgo(2));

  const neverReady = { ...legacy, sources: [{ id: 'family', status: 'error' }] };
  assert.equal(keepPreviousOnError({ bundle: failed('family'), previous: neverReady, now: NOW }).events.length, 0);
});

test('a source that never worked has nothing to fall back to', () => {
  const result = keepPreviousOnError({ bundle: failed('brand-new'), previous: previousCache(hoursAgo(1)), now: NOW });
  assert.equal(result.events.length, 0);
  assert.equal(result.source.stale, false);
  const noHistory = keepPreviousOnError({ bundle: failed('family'), previous: { events: [], sources: [] }, now: NOW });
  assert.equal(noHistory.events.length, 0);
  const noPrevious = keepPreviousOnError({ bundle: failed('family'), previous: null, now: NOW });
  assert.equal(noPrevious.events.length, 0);
});

test('google events are recognised by having no sourceId', () => {
  const result = keepPreviousOnError({ bundle: failed('google'), previous: previousCache(hoursAgo(2)), now: NOW });
  assert.deepEqual(result.events.map((event) => event.id), ['g1']);
  assert.equal(result.source.stale, true);
});

test('disabled sources stay empty and are not touched', () => {
  const disabled = { calendars: [], events: [], source: { id: 'family', status: 'disabled' } };
  const result = keepPreviousOnError({ bundle: disabled, previous: previousCache(hoursAgo(1)), now: NOW });
  assert.equal(result, disabled);
});

test('the last success time is carried through repeated failures, so the window really ends', () => {
  const first = keepPreviousOnError({ bundle: failed('family'), previous: previousCache(hoursAgo(10)), now: NOW });
  // the next sync starts from the cache this produced
  const nextPrevious = { events: first.events, calendars: first.calendars, sources: [first.source] };
  // 40 h after the last success (10 h before NOW + 30 h): still inside the 48 h window.
  const second = keepPreviousOnError({ bundle: failed('family'), previous: nextPrevious, now: NOW + (30 * 3600000) });
  assert.equal(second.source.lastSuccessAt, hoursAgo(10));
  assert.equal(second.events.length, 2);

  // 50 h after the last success: the window has ended, although every single sync in between also failed.
  const third = keepPreviousOnError({
    bundle: failed('family'),
    previous: { events: second.events, calendars: second.calendars, sources: [second.source] },
    now: NOW + (40 * 3600000),
  });
  assert.equal(third.source.lastSuccessAt, hoursAgo(10), 'the time of the real last success is never reset by a failure');
  assert.equal(third.events.length, 0);
});
