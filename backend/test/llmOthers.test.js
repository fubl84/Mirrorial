const test = require('node:test');
const assert = require('node:assert/strict');

const { resetLearnedCapabilities } = require('../src/llm/providers');
const {
  GOOD, anthropicAnswer, call, fakeHttp, googleAnswer, httpError, openAiAnswer,
} = require('./helpers/fakeLlm');

test.beforeEach(() => resetLearnedCapabilities());

test('anthropic: output_config schema, system prompt separate, no temperature, 1500 tokens', async () => {
  const http = fakeHttp([anthropicAnswer()]);
  const result = await call({ provider: 'anthropic', model: 'claude-haiku-5-5' }, http);
  const { url, body, headers } = http.requests[0];
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(headers['x-api-key'], 'k');
  assert.equal(headers['anthropic-version'], '2023-06-01');
  assert.equal(body.system, 's');
  assert.equal(body.max_tokens, 1500);
  assert.equal('temperature' in body, false);
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal('maxItems' in body.output_config.format.schema.properties.bullets, false);
  assert.deepEqual(result.usage, { inputTokens: 90, outputTokens: 15 });
});

test('anthropic: max_tokens and refusal are errors; a rejected schema falls back to plain', async () => {
  await assert.rejects(call({ provider: 'anthropic', model: 'm' }, fakeHttp([anthropicAnswer('{"bullets":[', 'max_tokens')])), /output_truncated/);
  await assert.rejects(call({ provider: 'anthropic', model: 'm' }, fakeHttp([anthropicAnswer('', 'refusal')])), /refusal/);

  const http = fakeHttp([httpError(400, 'output_config is not supported for this model'), anthropicAnswer()]);
  const result = await call({ provider: 'anthropic', model: 'older-model' }, http);
  assert.equal(result.mode, 'plain');
  assert.equal('output_config' in http.requests[1].body, false);
});

test('google: key in a header, upper case schema, thought parts ignored', async () => {
  const answer = { candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text: GOOD }] }, finishReason: 'STOP' }] };
  const http = fakeHttp([answer]);
  const result = await call({ provider: 'google', model: 'gemini-3.6-flash' }, http);
  const { url, body, headers } = http.requests[0];
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
  assert.equal(url.includes('key='), false);
  assert.equal(headers['x-goog-api-key'], 'k');
  assert.equal(body.systemInstruction.parts[0].text, 's');
  assert.equal(body.generationConfig.responseSchema.type, 'OBJECT');
  assert.equal(result.text, GOOD);
});

test('google: MAX_TOKENS and empty answers are errors; usage is read', async () => {
  await assert.rejects(call({ provider: 'google', model: 'm' }, fakeHttp([googleAnswer('{"b', 'MAX_TOKENS')])), /output_truncated/);
  const blocked = fakeHttp([{ candidates: [{ finishReason: 'SAFETY' }] }]);
  await assert.rejects(call({ provider: 'google', model: 'm' }, blocked), /google_empty_response finishReason=SAFETY/);
  const ok = await call({ provider: 'google', model: 'm' }, fakeHttp([googleAnswer()]));
  assert.deepEqual(ok.usage, { inputTokens: 80, outputTokens: 10 });
});

test('transient errors are retried and counted; auth errors are not', async () => {
  const http = fakeHttp([httpError(503), httpError(429), anthropicAnswer()]);
  const result = await call({ provider: 'anthropic', model: 'm' }, http);
  assert.equal(result.attempts, 3);

  const denied = fakeHttp([httpError(401), anthropicAnswer()]);
  await assert.rejects(call({ provider: 'anthropic', model: 'm' }, denied), (error) => error.response.status === 401);
  assert.equal(denied.requests.length, 1);
});

test('the configured timeout is passed on and clamped', async () => {
  const http = fakeHttp([openAiAnswer(), openAiAnswer(), openAiAnswer()]);
  await call({ provider: 'openai', model: 'm', timeoutMs: 60000 }, http);
  await call({ provider: 'openai', model: 'm', timeoutMs: 10 }, http);
  await call({ provider: 'openai', model: 'm', timeoutMs: 9999999 }, http);
  assert.deepEqual(http.requests.map((request) => request.timeout), [60000, 5000, 180000]);
});

test('missing key or model fails before any request; keyless custom servers are fine', async () => {
  const http = fakeHttp([openAiAnswer()]);
  await assert.rejects(call({ provider: 'openai', model: 'm', apiKey: '' }, http), /no_api_key/);
  await assert.rejects(call({ provider: 'openai', model: '  ' }, http), /no_model/);
  assert.equal(http.requests.length, 0);
  await call({ provider: 'custom', model: 'llama', apiKey: '' }, http);
  assert.equal('Authorization' in http.requests[0].headers, false);
});

test('a blocked endpoint is refused before sending anything', async () => {
  const http = fakeHttp([openAiAnswer()]);
  await assert.rejects(call({ provider: 'custom', model: 'm', baseUrl: 'http://169.254.169.254/v1' }, http), /blocked address/);
  assert.equal(http.requests.length, 0);
});

test('without a schema the request is plain', async () => {
  const http = fakeHttp([openAiAnswer()]);
  const result = await call({ provider: 'openai', model: 'm', schema: null }, http);
  assert.equal(result.mode, 'plain');
  assert.equal('response_format' in http.requests[0].body, false);
});
