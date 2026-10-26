const test = require('node:test');
const assert = require('node:assert/strict');

const { describeLlmError } = require('../src/llm/diagnostics');
const { resetLearnedCapabilities } = require('../src/llm/providers');
const { testConnection } = require('../src/llm/diagnostics');
const { getLlmProviderInfo } = require('../src/llm/models');
const { call, fakeHttp, httpError, openAiAnswer } = require('./helpers/fakeLlm');

test.beforeEach(() => resetLearnedCapabilities());

const withStatus = (status, message) => httpError(status, message);

test('describeLlmError explains the common failures in plain words', () => {
  assert.match(describeLlmError(withStatus(401)), /rejected the API key/);
  assert.match(describeLlmError(withStatus(403)), /rejected the API key/);
  assert.match(describeLlmError(withStatus(404, 'model not found')), /does not know this model/);
  assert.match(describeLlmError(withStatus(429)), /rate limiting|no credit/);
  assert.match(describeLlmError(withStatus(503)), /problem right now/);
  assert.match(describeLlmError(withStatus(400, 'bad thing')), /refused the request: bad thing/);
  assert.match(describeLlmError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), /could not be reached/);
  assert.match(describeLlmError(Object.assign(new Error('x'), { code: 'ECONNABORTED' })), /in time/);
  assert.match(describeLlmError(new Error('no_api_key')), /No API key/);
  assert.match(describeLlmError(new Error('boom')), /See the backend log/);
});

test('describeLlmError never repeats a key or a long upstream body', () => {
  const secret = 'sk-live-1234567890';
  const message = `Incorrect API key provided: ${secret}. ${'x'.repeat(500)}`;
  const text = describeLlmError(withStatus(400, message));
  assert.ok(text.length < 300);
  assert.equal(text.includes('x'.repeat(250)), false);
});

test('testConnection reports success, mode and usage', async () => {
  const http = fakeHttp([openAiAnswer('{"ok": true}')]);
  const result = await testConnection({ provider: 'openai', apiKey: 'k', model: 'gpt-6-luna', http, sleep: async () => {} });
  assert.equal(result.ok, true);
  assert.equal(result.structured, true);
  assert.equal(result.validJson, true);
  assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 20 });
  assert.equal(http.requests.length, 1);
});

test('testConnection warns when the answer is not valid JSON', async () => {
  const result = await testConnection({
    provider: 'openai', apiKey: 'k', model: 'm', http: fakeHttp([openAiAnswer('Sure! Here you go')]), sleep: async () => {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.validJson, false);
  assert.match(result.message, /not with valid JSON/);
});

test('testConnection turns failures into a message and never throws', async () => {
  const result = await testConnection({
    provider: 'openai', apiKey: 'bad', model: 'm', http: fakeHttp([withStatus(401)]), sleep: async () => {},
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /rejected the API key/);

  const noKey = await testConnection({ provider: 'anthropic', apiKey: '', model: 'm' });
  assert.equal(noKey.ok, false);
  assert.match(noKey.message, /No API key/);
});

test('testConnection does not retry, so a wrong setup answers quickly', async () => {
  const http = fakeHttp([withStatus(503), openAiAnswer('{"ok":true}')]);
  const result = await testConnection({ provider: 'openai', apiKey: 'k', model: 'm', http, sleep: async () => {} });
  assert.equal(result.ok, false);
  assert.equal(http.requests.length, 1);
});

test('call helper and provider list are consistent', () => {
  assert.equal(typeof call, 'function');
  const info = getLlmProviderInfo();
  assert.deepEqual(Object.keys(info).sort(), ['anthropic', 'custom', 'google', 'openai']);
  Object.values(info).forEach((provider) => provider.models.forEach((model) => assert.match(model.id, /^[a-z0-9.\-]+$/)));
  assert.equal(info.custom.needsBaseUrl, true);
});
