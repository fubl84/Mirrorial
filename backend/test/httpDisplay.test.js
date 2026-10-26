const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { startServer } = require('./helpers/server');

// What the Flutter display reads, through the real routes. Calendar and context caches are written the way the
// sync writes them, so the routes are tested on realistic files.

let server;
test.before(async () => { server = await startServer({ trustLocal: true }); });
test.after(async () => { await server.close(); });

const writeCache = (name, payload) => {
  const file = server.dataFile(`cache/${name}`);
  fs.mkdirSync(require('path').dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload));
};

test('display calendar events: declined events are left out and calendar colours are applied', async () => {
  writeCache('calendar-events.json', {
    syncedAt: new Date().toISOString(),
    events: [
      { id: 'a', title: 'Zahnarzt', start: '2026-04-10T09:00:00Z', end: '2026-04-10T10:00:00Z', calendarId: 'cal1', calendarColor: '#111111' },
      { id: 'b', title: 'Abgesagt', start: '2026-04-10T11:00:00Z', end: '2026-04-10T12:00:00Z', calendarId: 'cal1', declined: true },
    ],
    calendars: [],
    sources: [],
  });
  const res = await server.request('GET', '/api/display/calendar/events');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.events.map((event) => event.id), ['a']);
  assert.equal(res.json.events[0].calendarColor, '#111111');
});

test('display context: the cached context is served at once, localized, with the notes of the brief', async () => {
  writeCache('context.json', {
    updatedAt: new Date().toISOString(),
    calendarFingerprint: 'whatever',
    brief: {
      headline: 'Daily brief',
      bullets: ['Eins'],
      householdView: 'Zwei',
      items: [],
      notes: [{ text: 'Zwei', urgency: 'high', time: '11:00' }],
      source: 'llm',
    },
    llm: { status: 'ready' },
  });
  const started = Date.now();
  const res = await server.request('GET', '/api/display/context?locale=de');
  assert.equal(res.status, 200);
  assert.ok(Date.now() - started < 2000, 'a cached context must not wait for a rebuild');
  assert.equal(res.json.brief.headline, 'Tagesüberblick');
  assert.deepEqual(res.json.brief.notes, [{ text: 'Zwei', urgency: 'high', time: '11:00' }]);
});

test('display context: an unknown locale falls back instead of failing', async () => {
  const res = await server.request('GET', '/api/display/context?locale=xx');
  assert.equal(res.status, 200);
  assert.equal(res.json.brief.headline, 'Daily brief');
});

test('display travel-time: bad input is answered, not crashed on', async () => {
  const none = await server.request('POST', '/api/display/travel-time', { body: {} });
  assert.equal(none.status, 200);
  assert.deepEqual(none.json.items, []);
  const notAList = await server.request('POST', '/api/display/travel-time', { body: { items: 'nope' } });
  assert.equal(notAList.status, 200);
});

test('malformed JSON in a request body is a client error and does not leak a stack trace', async () => {
  const res = await server.request('POST', '/api/display/travel-time', { body: '{"items": [' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.json, { error: 'The request could not be read.' });
  assert.doesNotMatch(res.text, /node_modules|SyntaxError|\.js:\d+/);
});

test('a body above the size limit is refused with a plain JSON message', async () => {
  const res = await server.request('POST', '/api/display/travel-time', { body: { items: [], pad: 'x'.repeat(3 * 1024 * 1024) } });
  assert.equal(res.status, 413);
  assert.deepEqual(res.json, { error: 'The request is too large.' });
});
