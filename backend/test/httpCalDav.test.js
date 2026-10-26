const test = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('./helpers/server');
const { startCalendarServer } = require('./helpers/calendarServer');

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

test('a CalDAV account is discovered (PROPFIND), queried (REPORT) and its events parsed', async () => {
  const res = await app.request('POST', '/api/calendar-sources', {
    ...auth(),
    body: { sources: [{ id: 'dav', type: 'caldav', url: calendar.davUrl, username: 'anna', password: 'PW-DAV-SECRET-1' }] },
  });
  assert.equal(res.status, 200);
  const source = res.json.sources.find((entry) => entry.id === 'dav');
  assert.equal(source.syncStatus, 'ready');
  assert.equal(source.syncEventCount, 2);
  assert.equal(calendar.stats.propfind, 1);
  assert.equal(calendar.stats.report, 1);
  assert.doesNotMatch(res.text, /PW-DAV-SECRET-1/, 'the password never comes back');

  const events = (await app.request('GET', '/api/display/calendar/events', auth())).json.events;
  assert.deepEqual(events.map((event) => event.title).sort(), ['Elternabend', 'Zahnarzt Dr. Weber']);
  assert.equal(events[0].calendarSummary, 'Fake Family');
});

test('a CalDAV server that answers with an error is reported, not crashed on', async () => {
  calendar.set({ mode: 'fail' });
  const res = await app.request('GET', '/api/calendars', auth());
  const source = res.json.sources.find((entry) => entry.id === 'dav');
  assert.equal(source.status, 'error');
  assert.equal(source.stale, true, 'the events of the last good sync are kept');
});

test('a cloud-metadata address is refused when saving, with the reason, and nothing is stored', async () => {
  const before = (await app.request('GET', '/api/calendar-sources', auth())).json.sources.length;
  for (const type of ['caldav', 'ics']) {
    const res = await app.request('POST', '/api/calendar-sources', {
      ...auth(),
      body: { sources: [{ id: `bad-${type}`, type, url: 'http://169.254.169.254/dav/' }] },
    });
    assert.equal(res.status, 400, type);
    assert.match(res.json.details, /blocked address/i, type);
  }
  assert.equal((await app.request('GET', '/api/calendar-sources', auth())).json.sources.length, before);
});
