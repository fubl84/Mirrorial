const axios = require('axios');
const { assertSafeOutboundUrl } = require('../security/urlGuard');
const { createOpenAiAdapter } = require('./openai');
const { anthropicAdapter } = require('./anthropic');
const { googleAdapter } = require('./google');
const {
  DEFAULT_TIMEOUT_MS,
  clampTimeoutMs,
  getProviderErrorMessage,
  postJson,
} = require('./http');

// One interface for every provider:
//   generateJson({ provider, apiKey, model, baseUrl, system, prompt, schema, timeoutMs, maxAttempts })
//     -> { text, payload, usage, mode, attempts, temperature }
// - structured output is used when the provider supports it, and the layer steps down to a weaker mode if the
//   API rejects the request (400/422), e.g. for an old model or a local server without json_schema support
// - `temperature` is dropped when the API says the model does not accept it
// - 429, 5xx and timeouts are retried with backoff (see retry.js)
// The caller still validates the content: structured output guarantees the shape, not that facts are true.

const ADAPTERS = {
  openai: createOpenAiAdapter({ custom: false }),
  custom: createOpenAiAdapter({ custom: true }),
  anthropic: anthropicAdapter,
  google: googleAdapter,
};

const MAX_REQUESTS = 6;

// What this process has learned about a model: which mode works and whether temperature must be left out.
// In memory only, so a server upgrade or a different model is re-probed after a restart.
const learned = new Map();
const learnedKey = ({ provider, model, baseUrl }) => `${provider}|${model}|${`${baseUrl || ''}`.toLowerCase()}`;
const resetLearnedCapabilities = () => learned.clear();

const isRejectedRequest = (error) => {
  const status = error?.response?.status;
  return status === 400 || status === 422;
};

const mentionsTemperature = (error) => /temperature/i.test(getProviderErrorMessage(error));

const generateJson = async ({
  provider,
  apiKey = '',
  model,
  baseUrl = '',
  system = 'Return valid JSON only.',
  prompt,
  schema,
  timeoutMs,
  maxAttempts = 3,
  http = axios,
  sleep,
}) => {
  const resolvedProvider = ADAPTERS[provider] ? provider : 'openai';
  const adapter = ADAPTERS[resolvedProvider];
  if (adapter.needsKey && !`${apiKey || ''}`.trim()) {
    throw new Error('no_api_key');
  }
  if (!`${model || ''}`.trim()) {
    throw new Error('no_model');
  }

  const key = learnedKey({ provider: resolvedProvider, model, baseUrl });
  const memory = learned.get(key) || {};
  const modes = schema ? adapter.modes : ['plain'];
  let modeIndex = Math.min(memory.modeIndex || 0, modes.length - 1);
  let temperatureDropped = Boolean(memory.dropTemperature);
  let temperature = temperatureDropped ? undefined : adapter.defaultTemperature(model);
  const timeout = clampTimeoutMs(timeoutMs || DEFAULT_TIMEOUT_MS);
  let requests = 0;
  let lastError = null;

  while (modeIndex < modes.length && requests < MAX_REQUESTS) {
    const mode = modes[modeIndex];
    const request = adapter.build({ model, system, prompt, schema, mode, temperature, apiKey, baseUrl });
    assertSafeOutboundUrl(request.url, 'LLM URL');

    let sent;
    try {
      sent = await postJson({
        http, url: request.url, body: request.body, headers: request.headers, timeoutMs: timeout, maxAttempts, sleep,
      });
    } catch (error) {
      requests += error.attempts || 1;
      lastError = error;
      if (!isRejectedRequest(error)) {
        break;
      }
      if (temperature !== undefined && mentionsTemperature(error)) {
        temperature = undefined;
        temperatureDropped = true;
      } else {
        modeIndex += 1;
      }
      continue;
    }

    requests += sent.attempts;
    // A usable-looking answer that is cut off or empty is not retried in another mode: that would only cost more.
    const parsed = adapter.parse(sent.data);
    if (modeIndex > 0 || temperatureDropped) {
      learned.set(key, { modeIndex, dropTemperature: temperatureDropped });
    }
    return { text: parsed.text, payload: sent.data, usage: parsed.usage, mode, attempts: requests, temperature };
  }

  if (lastError) {
    lastError.requests = requests;
    throw lastError;
  }
  throw new Error('llm_request_not_sent');
};

module.exports = {
  ADAPTERS,
  generateJson,
  resetLearnedCapabilities,
};
