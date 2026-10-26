const { COMPOSER_JSON_SCHEMA } = require('../../src/brief/composer');
const { generateJson } = require('../../src/llm/providers');

// Fakes for the provider layer tests: a queue of canned answers instead of real network calls.

const GOOD = JSON.stringify({ bullets: [] });

const httpError = (status, message = 'bad') => Object.assign(new Error(`HTTP ${status}`), {
  response: { status, headers: {}, data: { error: { message } } },
});

// Fake axios: answers come from a queue (an Error is thrown); every request is recorded.
const fakeHttp = (answers) => {
  const requests = [];
  return {
    requests,
    post: async (url, body, config) => {
      requests.push({ url, body, headers: config.headers, timeout: config.timeout });
      const answer = answers.shift();
      if (answer instanceof Error) {
        throw answer;
      }
      return { data: answer };
    },
  };
};

const openAiAnswer = (content = GOOD, extra = {}) => ({
  choices: [{ message: { content }, finish_reason: 'stop', ...extra }],
  usage: { prompt_tokens: 100, completion_tokens: 20 },
});

const anthropicAnswer = (text = GOOD, stop = 'end_turn') => ({
  content: [{ type: 'text', text }],
  stop_reason: stop,
  usage: { input_tokens: 90, output_tokens: 15 },
});

const googleAnswer = (text = GOOD, finishReason = 'STOP') => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason }],
  usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 10 },
});

const base = { apiKey: 'k', prompt: 'p', system: 's', schema: COMPOSER_JSON_SCHEMA, sleep: async () => {} };
const call = (options, http) => generateJson({ ...base, ...options, http });

module.exports = {
  GOOD,
  anthropicAnswer,
  call,
  fakeHttp,
  googleAnswer,
  httpError,
  openAiAnswer,
};
