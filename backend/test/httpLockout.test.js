const test = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('./helpers/server');

// Brute-force protection, end to end. Own file: the failure counter is per client address and lives for the
// life of the process, so it must not share a process with tests that expect to log in afterwards.

let server;
test.before(async () => { server = await startServer({ trustLocal: false }); });
test.after(async () => { await server.close(); });

test('after 10 wrong tokens the client is blocked, even with the right token, with a Retry-After hint', async () => {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const res = await server.request('GET', '/api/config', { token: `wrong-token-number-${attempt}-xxxx` });
    assert.equal(res.status, 401, `attempt ${attempt}`);
  }

  const blocked = await server.request('GET', '/api/config', { token: 'wrong-token-number-11-xxxx' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['retry-after'], '300');

  // Blocked means blocked: the correct token is not accepted either while the block lasts. Otherwise the limit
  // would only slow a guesser down by one request.
  const correct = await server.request('GET', '/api/config', { token: server.token });
  assert.equal(correct.status, 429);

  // Requests with no token at all are not "attempts" and keep getting the plain 401 (the UI login screen).
  const anonymous = await server.request('GET', '/api/config');
  assert.equal(anonymous.status, 401);
});
