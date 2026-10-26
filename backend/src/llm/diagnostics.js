const { generateJson } = require('./providers');
const { clampTimeoutMs, getProviderErrorMessage } = require('./http');

// "Test connection" support: a short, user-facing explanation of a provider failure (never the key and never
// a raw upstream payload) and one tiny request that tells the UI whether the setup works.

const describeLlmError = (error) => {
  const status = error?.response?.status;
  const detail = `${getProviderErrorMessage(error) || ''}`.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (error?.message === 'no_api_key') {
    return 'No API key is saved for this provider.';
  }
  if (error?.message === 'no_model') {
    return 'Enter a model name first.';
  }
  if (status === 401 || status === 403) {
    return 'The provider rejected the API key (or the key has no access to this model).';
  }
  if (status === 404) {
    return `The provider does not know this model or endpoint. Check the model name${detail ? ` (${detail})` : ''}.`;
  }
  if (status === 429) {
    return 'The provider is rate limiting this key, or the account has no credit left. Try again later.';
  }
  if (status >= 500) {
    return 'The provider has a problem right now. Try again later.';
  }
  if (status === 400 || status === 422) {
    return `The provider refused the request${detail ? `: ${detail}` : '.'}`;
  }
  if (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) {
    return 'The provider did not answer in time.';
  }
  if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET'].includes(error?.code)) {
    return 'The provider could not be reached. Check the base URL and your network.';
  }
  if (error?.providerPayload !== undefined) {
    return `The provider answered, but not usably (${`${error.message}`.slice(0, 160)}).`;
  }
  if (/must (use|be a|not contain)|blocked address/.test(`${error?.message}`)) {
    return error.message;
  }
  return 'The connection test failed. See the backend log for details.';
};

const TEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok'],
  properties: { ok: { type: 'boolean' } },
};

const parseTestAnswer = (text) => {
  try {
    return JSON.parse(`${text}`.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')).ok === true;
  } catch (error) {
    return false;
  }
};

// Always resolves; the UI shows `ok` and `message`.
const testConnection = async (options) => {
  const startedAt = Date.now();
  try {
    const result = await generateJson({
      ...options,
      system: 'Answer with JSON only.',
      prompt: 'Return {"ok": true}.',
      schema: TEST_SCHEMA,
      maxAttempts: 1,
      timeoutMs: Math.min(clampTimeoutMs(options.timeoutMs), 30000),
    });
    const validJson = parseTestAnswer(result.text);
    return {
      ok: true,
      mode: result.mode,
      structured: result.mode === 'json_schema',
      validJson,
      latencyMs: Date.now() - startedAt,
      usage: result.usage,
      message: validJson
        ? 'Connection works.'
        : 'The provider answered, but not with valid JSON. Briefs may fall back to rule-based notes with this model.',
    };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - startedAt, message: describeLlmError(error) };
  }
};

module.exports = {
  describeLlmError,
  testConnection,
};
