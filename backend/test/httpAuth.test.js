const test = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('./helpers/server');

// These tests talk to the real app over a real socket. The peer is always 127.0.0.1, so "remote" behaviour is
// produced with trustLocal=false (the same switch an operator uses) and with Host/Origin headers.

let server;
test.before(async () => { server = await startServer({ trustLocal: false }); });
test.after(async () => { await server.close(); });

test('a request without a token is refused, with a hint for the remote UI', async () => {
  const res = await server.request('GET', '/api/config');
  assert.equal(res.status, 401);
  assert.equal(res.json.authRequired, true);
  assert.match(res.headers['www-authenticate'], /Bearer/);
});

test('a wrong token is refused and the answer does not echo it', async () => {
  const res = await server.request('GET', '/api/config', { token: 'definitely-the-wrong-token' });
  assert.equal(res.status, 401);
  assert.doesNotMatch(res.text, /definitely-the-wrong-token/);
});

test('the right token opens the API, and responses are never cached', async () => {
  const res = await server.request('GET', '/api/config', { token: server.token });
  assert.equal(res.status, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('every protected route refuses a request without a token', async () => {
  const routes = [
    ['GET', '/api/config'], ['POST', '/api/config'], ['GET', '/api/household'], ['POST', '/api/household'],
    ['GET', '/api/calendars'], ['GET', '/api/calendar-sources'], ['POST', '/api/calendar-sources'],
    ['POST', '/api/calendar-sources/test'], ['GET', '/api/display/context'], ['GET', '/api/display/calendar/events'],
    ['POST', '/api/display/travel-time'], ['GET', '/api/debug/daily-brief'], ['POST', '/api/debug/daily-brief/rebuild'],
    ['GET', '/api/llm/providers'], ['POST', '/api/llm/test'], ['POST', '/api/system/reboot'], ['GET', '/api/system/capabilities'],
    ['POST', '/api/auth/google/init'], ['POST', '/api/auth/google/disconnect'], ['GET', '/api/google/calendars'],
  ];
  for (const [method, route] of routes) {
    const res = await server.request(method, route, { body: method === 'POST' ? {} : undefined });
    assert.equal(res.status, 401, `${method} ${route} must require authentication, got ${res.status}`);
  }
});

test('only the security status and the two OAuth browser steps are public', async () => {
  const status = await server.request('GET', '/api/security/status');
  assert.equal(status.status, 200);
  assert.equal(status.json.authenticated, false);
  assert.equal(status.json.authRequired, true);

  const authed = await server.request('GET', '/api/security/status', { token: server.token });
  assert.equal(authed.json.authenticated, true);
  assert.equal(authed.json.method, 'token');

  // Public paths are reachable without a token (they have their own one-time protection) ...
  const callback = await server.request('GET', '/api/auth/google/callback');
  assert.equal(callback.status, 400, 'no state, no code: refused by the handler, not by the auth layer');
  const start = await server.request('GET', '/api/auth/google/start');
  assert.equal(start.status, 401, 'no ticket: refused by the handler');
  assert.match(start.text, /expired|sign-in/i);
});

test('the OAuth popup page never carries a wildcard target origin', async () => {
  const callback = await server.request('GET', '/api/auth/google/callback?code=x&state=nope');
  assert.equal(callback.status, 400);
  assert.doesNotMatch(callback.text, /postMessage\([^)]*['"]\*['"]/);
});

test('a bad token on a public path still reaches the handler, unauthenticated', async () => {
  const res = await server.request('GET', '/api/security/status', { token: 'wrong-wrong-wrong-wrong' });
  assert.equal(res.status, 200);
  assert.equal(res.json.authenticated, false);
});
