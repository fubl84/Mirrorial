const test = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('./helpers/server');

let server;
test.before(async () => { server = await startServer({ trustLocal: false }); });
test.after(async () => { await server.close(); });

const auth = () => ({ token: server.token });
const post = (route, body) => server.request('POST', route, { ...auth(), body });

test('calendar link test: refuses cloud-metadata and other internal addresses without connecting', async () => {
  for (const url of ['http://169.254.169.254/latest/meta-data', 'http://metadata.google.internal/x.ics', 'file:///etc/passwd', 'ftp://example.com/a.ics']) {
    const res = await post('/api/calendar-sources/test', { source: { type: 'ics', url } });
    assert.equal(res.status, 200, url);
    assert.equal(res.json.ok, false, url);
    assert.ok(res.json.error, `${url} must come with a reason`);
  }
});

test('calendar link test: an empty link is a friendly message, not an error', async () => {
  const res = await post('/api/calendar-sources/test', { source: { type: 'ics', url: '' } });
  assert.equal(res.json.ok, false);
  assert.match(res.json.error, /link/i);
});

test('calendar sources: a password is stored in the secrets file and never returned', async () => {
  const res = await post('/api/calendar-sources', {
    sources: [{ id: 'fam', type: 'caldav', url: 'https://cal.example.com/dav/', username: 'anna', password: 'PW-SECRET-424242', enabled: true }],
  });
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.text, /PW-SECRET-424242/);
  const read = await server.request('GET', '/api/calendar-sources', auth());
  assert.doesNotMatch(read.text, /PW-SECRET-424242/);
  assert.doesNotMatch(require('fs').readFileSync(server.dataFile('calendar-sources.json'), 'utf8'), /PW-SECRET-424242/);
  assert.match(require('fs').readFileSync(server.dataFile('secrets.json'), 'utf8'), /PW-SECRET-424242/);
});

test('LLM routes: provider list is served, connection test never leaks a key and never throws a 500', async () => {
  const list = await server.request('GET', '/api/llm/providers', auth());
  assert.equal(list.status, 200);
  assert.deepEqual(Object.keys(list.json.providers).sort(), ['anthropic', 'custom', 'google', 'openai']);

  const noKey = await post('/api/llm/test', { llm: { provider: 'anthropic', model: 'some-model' } });
  assert.equal(noKey.status, 200);
  assert.equal(noKey.json.ok, false);

  const blocked = await post('/api/llm/test', { llm: { provider: 'custom', baseUrl: 'http://169.254.169.254/v1', model: 'x', apiKey: 'KEY-SECRET-777' } });
  assert.equal(blocked.status, 200);
  assert.equal(blocked.json.ok, false);
  assert.doesNotMatch(blocked.text, /KEY-SECRET-777/);

  const notUrl = await post('/api/llm/test', { llm: { provider: 'custom', baseUrl: 'ftp://x', model: 'x' } });
  assert.equal(notUrl.json.ok, false);
});

test('system commands: unknown commands are refused, and the burst limit applies', async () => {
  const unknown = await post('/api/system/format-disk', {});
  assert.equal(unknown.status, 400);
  assert.equal(unknown.json.error, 'Invalid command');

  let limited = null;
  for (let index = 0; index < 8 && !limited; index += 1) {
    const res = await post('/api/system/format-disk', {});
    if (res.status === 429) {
      limited = res;
    }
  }
  assert.ok(limited, 'the 5-per-minute limit on /api/system/* must kick in');
});

test('Google sign-in: the ticket is issued to an authenticated caller, works once, and is bound to the caller origin', async () => {
  const init = await server.request('POST', '/api/auth/google/init', { ...auth(), headers: { origin: 'http://192.168.1.20:5173' }, body: {} });
  assert.equal(init.status, 200);
  assert.match(init.json.ticket, /^[A-Za-z0-9_-]{20,}$/);
  assert.ok(init.json.startPath.includes(init.json.ticket));
  assert.doesNotMatch(init.json.startPath, new RegExp(server.token), 'the access token never appears in a URL');

  // First use passes the ticket check (it then stops because Google is not configured in this test).
  const first = await server.request('GET', init.json.startPath);
  assert.equal(first.status, 400);
  assert.match(first.text, /not configured/i);
  assert.match(first.text, /192\.168\.1\.20:5173/, 'the popup reports back to the origin that started the flow');

  // Second use: the ticket is gone.
  const second = await server.request('GET', init.json.startPath);
  assert.equal(second.status, 401);
});

test('the brief rebuild route answers an authenticated caller with the debug payload', async () => {
  const res = await post('/api/debug/daily-brief/rebuild', {});
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
  assert.ok(res.json.debug);
});
