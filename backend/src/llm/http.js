const { withRetry } = require('./retry');

// Shared plumbing for the provider adapters.

const DEFAULT_TIMEOUT_MS = 45000;
const MIN_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 180000;

const clampTimeoutMs = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(number)));
};

// Message the provider put into its error body (all three providers use { error: { message } }).
const getProviderErrorMessage = (error) => {
  const data = error?.response?.data;
  const message = data?.error?.message || data?.message || '';
  return typeof message === 'string' && message ? message : (error?.message || '');
};

// POST with retry on 429/5xx/timeouts. Returns { data, attempts } where attempts counts every request made.
const postJson = async ({ http, url, body, headers, timeoutMs, maxAttempts, sleep }) => {
  const { value, attempts } = await withRetry({
    maxAttempts,
    sleep,
    run: () => http.post(url, body, { headers, timeout: timeoutMs }),
  });
  return { data: value.data, attempts };
};

// A model answer that cannot be trusted. providerPayload ends up in the debug view.
const createModelError = (message, providerPayload = null) => Object.assign(new Error(message), { providerPayload });

const normalizeUsage = (inputTokens, outputTokens) => ({
  inputTokens: Number.isFinite(inputTokens) ? inputTokens : null,
  outputTokens: Number.isFinite(outputTokens) ? outputTokens : null,
});

module.exports = {
  DEFAULT_TIMEOUT_MS,
  clampTimeoutMs,
  createModelError,
  getProviderErrorMessage,
  normalizeUsage,
  postJson,
};
