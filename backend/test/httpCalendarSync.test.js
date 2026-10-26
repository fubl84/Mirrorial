const test = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('./helpers/server');
const { startCalendarServer } = require('./helpers/calendarServer');

// The calendar fetchers and the sync runner, end to end: real app, real HTTP to a fake calendar server.
// These tests pin the behaviour down before the fetcher code is moved out of index.js.

let app;
let calendar;
test.before(async () => {
  calendar = await startCalendarServer();
  app = await startServer({ trustLocal: false });
});
test.after(async () => {
  await app.close();
  await calendar.close();
});

const auth = () => ({ token: app.token });
const saveSources = (sources) => app.request('POST', '/api/calendar-sources', { ...auth(), body: { sources } });
const getCalendars = () => app.request('GET', '/api/calendars', auth());
const displayEvents = async () => (await app.request('GET', '/api/display/calendar/events', auth())).json.events;

test('an ICS subscription is fetched, parsed and served to the display', async () => {
  const res = await saveSources([{ id: 'fam', type: 'ics', url: calendar.feedUrl }]);
  assert.equal(res.status, 200);
  const source = res.json.sources.find((entry) => entry.id === 'fam');
  assert.equal(source.syncStatus, 'ready');
  assert.equal(source.syncEventCount, 2);
  assert.equal(res.json.calendars[0].summary, 'Fake Family', 'the feed name is used when no name was entered');

  const events = await displayEvents();
  assert.deepEqual(events.map((event) => event.title).sort(), ['Elternabend', 'Zahnarzt Dr. Weber']);
  const dentist = events.find((event) => event.title === 'Zahnarzt Dr. Weber');
  assert.equal(dentist.location, 'Praxis Weber');
  assert.match(dentist.start, /Z$/, 'UTC feed times stay absolute instants');
  assert.equal(dentist.calendarSummary, 'Fake Family');
});

test('syncs never overlap: ten simultaneous requests fetch the feed at most twice', async () => {
  const before = calendar.stats.feed;
  const responses = await Promise.all(Array.from({ length: 10 }, () => getCalendars()));
  assert.equal(responses.every((res) => res.status === 200), true);
  assert.ok(calendar.stats.feed - before <= 2, `fetched ${calendar.stats.feed - before} times`);
});

test('a feed that goes down keeps its events for the display and says so; the error is shown', async () => {
  calendar.set({ mode: 'fail' });
  const res = await getCalendars();
  const source = res.json.sources.find((entry) => entry.id === 'fam');
  assert.equal(source.status, 'error');
  assert.equal(source.stale, true);
  assert.ok(source.lastSuccessAt);
  assert.match(source.error, /error|server/i);
  assert.doesNotMatch(source.error, /calendar server down/, 'the raw body of the failing server is not passed on');
  assert.equal((await displayEvents()).length, 2, 'the events from the last good sync are still served');

  const sources = (await app.request('GET', '/api/calendar-sources', auth())).json.sources;
  const listed = sources.find((entry) => entry.id === 'fam');
  assert.equal(listed.syncStatus, 'error');
  assert.equal(listed.syncStale, true);
});

test('when the feed is back the stale mark goes away and new events arrive', async () => {
  calendar.set({
    mode: 'ok',
    events: [{ uid: 'c', title: 'Neuer Termin', startHours: 6, endHours: 7, location: '' }],
  });
  const res = await getCalendars();
  const source = res.json.sources.find((entry) => entry.id === 'fam');
  assert.equal(source.status, 'ready');
  assert.equal(source.stale, false);
  assert.deepEqual((await displayEvents()).map((event) => event.title), ['Neuer Termin']);
});

test('a source that never worked has no stale events to fall back to', async () => {
  const res = await saveSources([{ id: 'nope', type: 'ics', url: `http://127.0.0.1:${calendar.port}/missing.ics` }]);
  const source = res.json.sources.find((entry) => entry.id === 'nope');
  assert.equal(source.syncStatus, 'error');
  assert.equal(source.syncStale, false);
  assert.deepEqual(await displayEvents(), []);
});

test('a disabled source is not fetched', async () => {
  const before = calendar.stats.feed;
  const res = await saveSources([{ id: 'off', type: 'ics', url: calendar.feedUrl, enabled: false }]);
  assert.equal(res.json.sources.find((entry) => entry.id === 'off').syncStatus, 'disabled');
  assert.equal(calendar.stats.feed, before);
});

test('removing a source removes its events', async () => {
  await saveSources([{ id: 'fam', type: 'ics', url: calendar.feedUrl }]);
  assert.ok((await displayEvents()).length > 0);
  await saveSources([]);
  assert.deepEqual(await displayEvents(), []);
});
