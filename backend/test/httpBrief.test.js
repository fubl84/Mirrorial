const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { startServer } = require('./helpers/server');

let server;
test.before(async () => { server = await startServer({ trustLocal: false }); });
test.after(async () => { await server.close(); });

const auth = () => ({ token: server.token });
const iso = (offsetHours) => new Date(Date.now() + (offsetHours * 3600000)).toISOString();

const writeCalendar = (events) => {
  const file = server.dataFile('cache/calendar-events.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ syncedAt: new Date().toISOString(), calendars: [], sources: [], events }));
};
const event = (id, title, extra = {}) => ({
  id, title, description: '', location: '', start: iso(1), end: iso(2), isAllDay: false, isRecurring: false,
  calendarId: 'cal', calendarSummary: 'Family', ...extra,
});

test('explain: lists upcoming events with the reason, needs a token', async () => {
  writeCalendar([event('a', 'Zahnarzt Dr. Weber'), event('b', 'Lesson', { isRecurring: true, start: iso(2), end: iso(3) })]);
  assert.equal((await server.request('GET', '/api/brief/explain')).status, 401);

  const res = await server.request('GET', '/api/brief/explain', auth());
  assert.equal(res.status, 200);
  const byTitle = Object.fromEntries(res.json.events.map((row) => [row.title, row]));
  assert.equal(byTitle['Zahnarzt Dr. Weber'].included, true);
  assert.equal(byTitle['Zahnarzt Dr. Weber'].reason, 'medical_appointment');
  assert.equal(byTitle.Lesson.included, false);
  assert.ok(byTitle.Lesson.reasonText.length > 10);
  assert.deepEqual(res.json.rules, { alwaysShow: [], neverShow: [], routineHints: [] });
});

test('mute: the rule is saved, the event is reported as hidden, and the API key stays untouched', async () => {
  // Put a key in place first: saving rules must not lose it or leak it.
  const config = (await server.request('GET', '/api/config', auth())).json;
  config.services.llm = { ...config.services.llm, provider: 'openai', apiKey: 'sk-KEEP-ME-123456' };
  await server.request('POST', '/api/config', { ...auth(), body: config });
  writeCalendar([event('a', 'Fußball Training')]);

  const res = await server.request('POST', '/api/brief/rules', { ...auth(), body: { action: 'mute', keyword: 'Fußball Training', eventId: 'a' } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.rules.neverShow, ['Fußball Training']);
  assert.doesNotMatch(res.text, /KEEP-ME/);

  const stored = JSON.parse(server.readFile('config.json'));
  assert.deepEqual(stored.services.context.rules.neverShow, ['Fußball Training']);
  assert.doesNotMatch(server.readFile('config.json'), /KEEP-ME/, 'the key must not end up in config.json');
  assert.match(fs.readFileSync(server.dataFile('secrets.json'), 'utf8'), /KEEP-ME-123456/, 'and must still be in the secrets file');

  const explained = await server.request('GET', '/api/brief/explain', auth());
  assert.equal(explained.json.events[0].reason, 'user_never_show');
});

test('pin: removes the never-show word that was hiding the event and says so', async () => {
  writeCalendar([event('a', 'Newsletter Termin')]);
  await server.request('POST', '/api/brief/rules', { ...auth(), body: { action: 'mute', keyword: 'Newsletter' } });
  const res = await server.request('POST', '/api/brief/rules', { ...auth(), body: { action: 'pin', keyword: 'Newsletter Termin', eventId: 'a' } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.removed, ['Newsletter']);
  assert.deepEqual(res.json.rules.alwaysShow, ['Newsletter Termin']);
  const explained = await server.request('GET', '/api/brief/explain', auth());
  assert.equal(explained.json.events[0].reason, 'user_always_show');
});

test('clear: takes the word out again', async () => {
  const res = await server.request('POST', '/api/brief/rules', { ...auth(), body: { action: 'clear', keyword: 'Newsletter Termin' } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.rules.alwaysShow, []);
});

test('bad requests are refused with 400 and change nothing', async () => {
  const before = server.readFile('config.json');
  for (const body of [{}, { action: 'delete', keyword: 'Yoga' }, { action: 'mute', keyword: 'x' }, { action: 'mute', keyword: 'y'.repeat(80) }, { action: 'mute', keyword: 42 }]) {
    const res = await server.request('POST', '/api/brief/rules', { ...auth(), body });
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal(server.readFile('config.json'), before);
  assert.equal((await server.request('POST', '/api/brief/rules', { body: { action: 'mute', keyword: 'Yoga' } })).status, 401);
});
