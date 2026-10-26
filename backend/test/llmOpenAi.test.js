const test = require('node:test');
const assert = require('node:assert/strict');

const { resetLearnedCapabilities } = require('../src/llm/providers');
const {
  call, fakeHttp, httpError, openAiAnswer,
} = require('./helpers/fakeLlm');

test.beforeEach(() => resetLearnedCapabilities());

test('openai: strict json_schema, system message, no temperature for gpt-5 style models', async () => {
  const http = fakeHttp([openAiAnswer()]);
  const result = await call({ provider: 'openai', model: 'gpt-5-mini' }, http);
  const { url, body, headers } = http.requests[0];
  assert.equal(url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(headers.Authorization, 'Bearer k');
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.response_format.json_schema.schema.required, ['bullets']);
  assert.equal('temperature' in body, false);
  assert.deepEqual(body.messages.map((message) => message.role), ['system', 'user']);
  assert.equal(result.mode, 'json_schema');
  assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 20 });
});

test('openai: classic chat models keep a low temperature', async () => {
  const http = fakeHttp([openAiAnswer()]);
  await call({ provider: 'openai', model: 'gpt-4.1-mini' }, http);
  assert.equal(http.requests[0].body.temperature, 0.2);
});

test('openai: a rejected temperature is dropped and remembered', async () => {
  const http = fakeHttp([httpError(400, "Unsupported value: 'temperature' does not support 0.2"), openAiAnswer(), openAiAnswer()]);
  const first = await call({ provider: 'openai', model: 'gpt-4.1-mini' }, http);
  assert.equal(http.requests.length, 2);
  assert.equal('temperature' in http.requests[1].body, false);
  assert.equal(first.mode, 'json_schema');
  await call({ provider: 'openai', model: 'gpt-4.1-mini' }, http);
  assert.equal('temperature' in http.requests[2].body, false, 'learned for the next call');
});

test('custom: falls back to json_object, then remembers it', async () => {
  const options = { provider: 'custom', model: 'llama', baseUrl: 'http://192.168.1.5:11434/v1', apiKey: '' };
  const http = fakeHttp([httpError(400, 'json_schema not supported'), openAiAnswer(), openAiAnswer()]);
  const result = await call(options, http);
  assert.equal(result.mode, 'json_object');
  assert.equal(http.requests[1].body.response_format.type, 'json_object');
  assert.equal(http.requests[0].url, 'http://192.168.1.5:11434/v1/chat/completions');
  await call(options, http);
  assert.equal(http.requests[2].body.response_format.type, 'json_object', 'no probing again');
});

test('custom: steps all the way down to plain text when needed', async () => {
  const http = fakeHttp([httpError(400), httpError(400), openAiAnswer()]);
  const result = await call({ provider: 'custom', model: 'tiny', apiKey: '' }, http);
  assert.equal(result.mode, 'plain');
  assert.equal('response_format' in http.requests[2].body, false);
});

test('openai: refusal and truncation are reported, not parsed', async () => {
  const refusal = { choices: [{ message: { refusal: 'no', content: null }, finish_reason: 'stop' }] };
  await assert.rejects(call({ provider: 'openai', model: 'm' }, fakeHttp([refusal])), /openai_refusal/);
  const cut = openAiAnswer('{"bullets":[', { finish_reason: 'length' });
  await assert.rejects(call({ provider: 'openai', model: 'm' }, fakeHttp([cut])), /output_truncated/);
});
