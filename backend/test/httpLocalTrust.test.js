const test = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('./helpers/server');

// The mirror's own display talks to 127.0.0.1 without a token. That trust must not extend to a web page that
// merely runs in a browser on the same machine (CSRF) or to a DNS name that was rebound to 127.0.0.1.

let server;
test.before(async () => { server = await startServer({ trustLocal: true }); });
test.after(async () => { await server.close(); });

test('the display on this machine needs no token', async () => {
  const res = await server.request('GET', '/api/display/context', { headers: { host: '127.0.0.1:3000' } });
  assert.equal(res.status, 200);
  const status = await server.request('GET', '/api/security/status', { headers: { host: 'localhost:3000' } });
  assert.equal(status.json.authenticated, true);
  assert.equal(status.json.method, 'local');
});

test('a DNS name in the Host header is refused (DNS rebinding)', async () => {
  const res = await server.request('GET', '/api/config', { headers: { host: 'attacker.example.com:3000' } });
  assert.equal(res.status, 401);
  const withToken = await server.request('GET', '/api/config', { token: server.token, headers: { host: 'attacker.example.com:3000' } });
  assert.equal(withToken.status, 200, 'the token still works from anywhere: it is the credential, the host is not');
});

test('a browser page on another origin cannot ride on the local trust (CSRF)', async () => {
  const res = await server.request('POST', '/api/config', {
    headers: { host: '127.0.0.1:3000', origin: 'https://evil.example.com' },
    body: { system: { timezone: 'Mars/Base' } },
  });
  assert.equal(res.status, 401);
  const read = await server.request('GET', '/api/household', { headers: { origin: 'http://evil.example.com' } });
  assert.equal(read.status, 401);
});

test('an origin that is an IP or localhost is still trusted (the remote UI dev server, the display)', async () => {
  const res = await server.request('GET', '/api/household', { headers: { origin: 'http://127.0.0.1:5173' } });
  assert.equal(res.status, 200);
});

test('any proxy header makes the request untrusted: the peer is the proxy, not the user', async () => {
  for (const header of ['x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'forwarded', 'via']) {
    const res = await server.request('GET', '/api/config', { headers: { [header]: '203.0.113.9' } });
    assert.equal(res.status, 401, header);
  }
});

test('CORS: no allow-origin for a strange site, one for an IP origin, and the preflight names only what is needed', async () => {
  const strange = await server.request('GET', '/api/security/status', { headers: { origin: 'https://evil.example.com' } });
  assert.equal(strange.headers['access-control-allow-origin'], undefined);

  const ip = await server.request('GET', '/api/security/status', { headers: { origin: 'http://192.168.1.20:5173' } });
  assert.equal(ip.headers['access-control-allow-origin'], 'http://192.168.1.20:5173');
  assert.equal(ip.headers['access-control-allow-credentials'], undefined, 'credentials are a header, never a cookie');

  const preflight = await server.request('OPTIONS', '/api/config', {
    headers: { origin: 'http://192.168.1.20:5173', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers['access-control-allow-headers'], /Authorization/i);
});

test('the display status report works from the local machine', async () => {
  const res = await server.request('POST', '/api/display/status', { body: { width: 800, height: 480, devicePixelRatio: 2 } });
  assert.equal(res.status, 200);
  const bad = await server.request('POST', '/api/display/status', { body: { width: -1, height: 'x' } });
  assert.equal(bad.status, 400);
});
