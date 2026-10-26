const test = require('node:test');
const assert = require('node:assert/strict');

const { getRetryDelayMs, isRetryableError, withRetry } = require('../src/llm/retry');

const httpError = (status, headers = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, headers } });
const netError = (code) => Object.assign(new Error(code), { code });

test('rate limits, server errors and network problems are retryable; client errors are not', () => {
  [429, 500, 502, 503, 504, 529].forEach((status) => assert.equal(isRetryableError(httpError(status)), true, `${status}`));
  [400, 401, 403, 404, 422].forEach((status) => assert.equal(isRetryableError(httpError(status)), false, `${status}`));
  ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET'].forEach((code) => assert.equal(isRetryableError(netError(code)), true, code));
  assert.equal(isRetryableError(new Error('something else')), false);
});

test('the delay grows exponentially, is capped, and honours Retry-After', () => {
  assert.equal(getRetryDelayMs(httpError(503), 1), 1000);
  assert.equal(getRetryDelayMs(httpError(503), 2), 2000);
  assert.equal(getRetryDelayMs(httpError(503), 3), 4000);
  assert.equal(getRetryDelayMs(httpError(503), 10), 8000);
  assert.equal(getRetryDelayMs(httpError(429, { 'retry-after': '3' }), 1), 3000);
  assert.equal(getRetryDelayMs(httpError(429, { 'retry-after': '600' }), 1), 8000);
});

test('a transient failure is retried and the attempt count is reported', async () => {
  const delays = [];
  let calls = 0;
  const result = await withRetry({
    sleep: async (ms) => { delays.push(ms); },
    run: async () => {
      calls += 1;
      if (calls < 3) {
        throw httpError(503);
      }
      return 'done';
    },
  });
  assert.deepEqual(result, { value: 'done', attempts: 3 });
  assert.deepEqual(delays, [1000, 2000]);
});

test('a client error is thrown at once without waiting', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry({ sleep: async () => { throw new Error('must not sleep'); }, run: async () => { calls += 1; throw httpError(401); } }),
    (error) => error.attempts === 1 && error.response.status === 401,
  );
  assert.equal(calls, 1);
});

test('retrying stops after maxAttempts and the last error carries the count', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry({ maxAttempts: 2, sleep: async () => {}, run: async () => { calls += 1; throw httpError(429); } }),
    (error) => error.attempts === 2,
  );
  assert.equal(calls, 2);
});

test('maxAttempts 1 means no retry at all', async () => {
  let calls = 0;
  await assert.rejects(withRetry({ maxAttempts: 1, sleep: async () => {}, run: async () => { calls += 1; throw httpError(500); } }));
  assert.equal(calls, 1);
});
