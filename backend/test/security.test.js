const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  isTrustedLocalRequest,
  loadOrCreateAccessToken,
  normalizeHostname,
  tokensMatch,
} = require('../src/security/access');
const { createExpiringStore, createRateLimiter } = require('../src/security/limits');
const { createAuthMiddleware, buildCorsOptions } = require('../src/security/middleware');
const { assertSafeOutboundUrl, sameUrlOrigin } = require('../src/security/urlGuard');

const makeReq = ({ remote = '127.0.0.1', host = '127.0.0.1:3000', headers = {}, path: reqPath = '/config' } = {}) => ({
  socket: { remoteAddress: remote },
  headers: { host, ...headers },
  path: reqPath,
});

const makeRes = () => {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.set = (key, value) => { res.headers[key] = value; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

const runAuth = (middleware, req) => {
  const res = makeRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
};

const remoteReq = (extra = {}) => makeReq({ remote: '192.168.1.50', host: '192.168.1.10:3000', ...extra });

test('normalizeHostname strips ports and handles IPv6 literals', () => {
  assert.equal(normalizeHostname('Mirror.local:3000'), 'mirror.local');
  assert.equal(normalizeHostname('[::1]:3000'), '::1');
  assert.equal(normalizeHostname('127.0.0.1'), '127.0.0.1');
});

test('isTrustedLocalRequest trusts plain loopback requests', () => {
  assert.equal(isTrustedLocalRequest(makeReq()), true);
  assert.equal(isTrustedLocalRequest(makeReq({ remote: '::ffff:127.0.0.1', host: 'localhost:3000' })), true);
  assert.equal(isTrustedLocalRequest(makeReq({ headers: { origin: 'http://localhost:5173' } })), true);
});

test('isTrustedLocalRequest rejects remote peers, proxies, DNS hosts and foreign origins', () => {
  assert.equal(isTrustedLocalRequest(makeReq({ remote: '192.168.1.50' })), false);
  assert.equal(isTrustedLocalRequest(makeReq({ headers: { 'x-forwarded-for': '192.168.1.50' } })), false);
  assert.equal(isTrustedLocalRequest(makeReq({ host: 'evil.example.com:3000' })), false, 'DNS rebinding');
  assert.equal(isTrustedLocalRequest(makeReq({ headers: { origin: 'https://evil.example.com' } })), false, 'CSRF from website');
  assert.equal(isTrustedLocalRequest(makeReq(), { trustLocal: false }), false);
});

test('tokensMatch compares securely and rejects empty values', () => {
  assert.equal(tokensMatch('abc', 'abc'), true);
  assert.equal(tokensMatch('abc', 'abd'), false);
  assert.equal(tokensMatch('', ''), false);
  assert.equal(tokensMatch('abc', ''), false);
});

test('loadOrCreateAccessToken prefers env, then file, then creates a 0600 file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirrorial-token-'));
  const logs = [];
  const log = (line) => logs.push(line);

  assert.equal(loadOrCreateAccessToken({ dataRoot: dir, envToken: 'x'.repeat(20), log }), 'x'.repeat(20));

  const created = loadOrCreateAccessToken({ dataRoot: dir, envToken: '', log });
  assert.match(created, /^[0-9a-f]{64}$/);
  const stat = await fs.stat(path.join(dir, 'access-token'));
  assert.equal(stat.mode & 0o777, 0o600);
  assert.equal(loadOrCreateAccessToken({ dataRoot: dir, envToken: '', log }), created);
  assert.ok(logs.length >= 1);
  await fs.remove(dir);
});

test('auth middleware: remote needs a valid token, local is trusted, public paths are open', () => {
  const middleware = createAuthMiddleware({ getToken: () => 'secret-token-1234567890', publicPaths: ['/auth/google/callback'] });

  const anonymous = runAuth(middleware, remoteReq());
  assert.equal(anonymous.nextCalled, false);
  assert.equal(anonymous.res.statusCode, 401);
  assert.equal(anonymous.res.body.authRequired, true);

  assert.equal(runAuth(middleware, remoteReq({ headers: { authorization: 'Bearer secret-token-1234567890' } })).nextCalled, true);

  const wrong = runAuth(middleware, remoteReq({ headers: { authorization: 'Bearer nope' } }));
  assert.equal(wrong.nextCalled, false);
  assert.equal(wrong.res.statusCode, 401);

  assert.equal(runAuth(middleware, makeReq()).nextCalled, true);
  assert.equal(runAuth(middleware, remoteReq({ path: '/auth/google/callback' })).nextCalled, true);
});

test('auth middleware locks out clients after repeated bad tokens', () => {
  const middleware = createAuthMiddleware({
    getToken: () => 'secret-token-1234567890',
    failureLimiter: createRateLimiter({ windowMs: 60000, max: 3 }),
  });
  const bad = () => makeReq({ remote: '10.0.0.9', host: '10.0.0.1:3000', headers: { authorization: 'Bearer wrong' } });

  for (let i = 0; i < 3; i += 1) {
    assert.equal(runAuth(middleware, bad()).res.statusCode, 401);
  }
  const blocked = runAuth(middleware, makeReq({
    remote: '10.0.0.9',
    host: '10.0.0.1:3000',
    headers: { authorization: 'Bearer secret-token-1234567890' },
  }));
  assert.equal(blocked.res.statusCode, 429, 'even the right token is refused while locked out');
});

test('rate limiter resets after the window', () => {
  let clock = 1000;
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => clock });
  assert.equal(limiter.consume('a').allowed, true);
  assert.equal(limiter.consume('a').allowed, true);
  assert.equal(limiter.consume('a').allowed, false);
  assert.equal(limiter.consume('b').allowed, true);
  clock += 1001;
  assert.equal(limiter.consume('a').allowed, true);
});

test('expiring store issues one-time values that expire', () => {
  let clock = 0;
  const store = createExpiringStore({ ttlMs: 1000, now: () => clock });
  const key = store.issue({ ok: true });
  assert.deepEqual(store.take(key), { ok: true });
  assert.equal(store.take(key), null, 'single use');

  const expiring = store.issue(true);
  clock += 1500;
  assert.equal(store.take(expiring), null, 'expired');
  assert.equal(store.size(), 0);
});

test('cors only allows IP/localhost origins unless configured', async () => {
  const options = buildCorsOptions({ extraOrigins: ['https://mirror.example.com'] });
  const check = (origin) => new Promise((resolve) => options.origin(origin, (error, allowed) => resolve(allowed)));
  assert.equal(await check(undefined), true);
  assert.equal(await check('http://localhost:5173'), true);
  assert.equal(await check('http://192.168.1.10:3000'), true);
  assert.equal(await check('https://mirror.example.com'), true);
  assert.equal(await check('https://evil.example.com'), false);
});

test('assertSafeOutboundUrl accepts LAN services and rejects dangerous targets', () => {
  assert.doesNotThrow(() => assertSafeOutboundUrl('http://homeassistant.local:8123', 'HA URL'));
  assert.doesNotThrow(() => assertSafeOutboundUrl('http://127.0.0.1:11434/v1', 'LLM URL'));
  assert.doesNotThrow(() => assertSafeOutboundUrl('https://api.openai.com/v1', 'LLM URL'));
  assert.throws(() => assertSafeOutboundUrl('file:///etc/passwd'), /http/);
  assert.throws(() => assertSafeOutboundUrl('ftp://example.com'), /http/);
  assert.throws(() => assertSafeOutboundUrl('http://user:pw@example.com'), /credentials/);
  assert.throws(() => assertSafeOutboundUrl('http://169.254.169.254/latest/meta-data'), /blocked/);
  assert.throws(() => assertSafeOutboundUrl('http://[fe80::1]/'), /blocked/);
  assert.throws(() => assertSafeOutboundUrl('http://metadata.google.internal/'), /blocked/);
  assert.throws(() => assertSafeOutboundUrl('not a url'), /full http/);
});

test('sameUrlOrigin ignores paths but not hosts', () => {
  assert.equal(sameUrlOrigin('https://api.openai.com/v1', 'https://api.openai.com/v1/'), true);
  assert.equal(sameUrlOrigin('https://api.openai.com/v1', 'https://evil.example.com/v1'), false);
  assert.equal(sameUrlOrigin('', ''), false);
});

