// Retry with backoff for transient provider problems. Only things that can plausibly succeed on a second
// try are retried: rate limits, overloaded/unavailable servers and network hiccups or timeouts.
// Client errors (400, 401, 403, 404) fail immediately.

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);
const RETRYABLE_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'EPIPE', 'ERR_NETWORK']);

const MAX_DELAY_MS = 8000;
const BASE_DELAY_MS = 1000;

const isRetryableError = (error) => {
  const status = error?.response?.status;
  if (status) {
    return RETRYABLE_STATUSES.has(status);
  }
  return RETRYABLE_CODES.has(error?.code);
};

const getRetryDelayMs = (error, attempt) => {
  const retryAfter = Number(error?.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(MAX_DELAY_MS, Math.round(retryAfter * 1000));
  }
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * (2 ** (attempt - 1)));
};

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// run(attempt) -> value. Resolves { value, attempts }. On failure the last error is thrown with `attempts` set.
const withRetry = async ({ run, maxAttempts = 3, sleep = defaultSleep }) => {
  const limit = Math.max(1, Math.floor(maxAttempts));
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return { value: await run(attempt), attempts: attempt };
    } catch (error) {
      error.attempts = attempt;
      if (attempt >= limit || !isRetryableError(error)) {
        throw error;
      }
      await sleep(getRetryDelayMs(error, attempt));
    }
  }
};

module.exports = {
  getRetryDelayMs,
  isRetryableError,
  withRetry,
};
