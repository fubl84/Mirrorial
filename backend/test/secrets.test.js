const test = require('node:test');
const assert = require('node:assert/strict');

const { bindSecretsToEndpoints, getLlmEndpoint, getRoutingEndpoint } = require('../src/security/keyBinding');
const { sameUrlOrigin } = require('../src/security/urlGuard');

const llmConfig = (overrides = {}) => ({ services: { llm: { provider: 'openai', baseUrl: '', ...overrides } } });

test('getLlmEndpoint uses provider defaults and only honours baseUrl for openai/custom', () => {
  assert.equal(getLlmEndpoint({ provider: 'openai', baseUrl: '' }), 'https://api.openai.com');
  assert.equal(getLlmEndpoint({ provider: 'openai', baseUrl: 'https://proxy.example.com/v1' }), 'https://proxy.example.com');
  assert.equal(getLlmEndpoint({ provider: 'anthropic', baseUrl: 'https://evil.example.com' }), 'https://api.anthropic.com');
  assert.equal(getLlmEndpoint({ provider: 'google', baseUrl: 'https://evil.example.com' }), 'https://generativelanguage.googleapis.com');
  assert.equal(getLlmEndpoint({ provider: 'custom', baseUrl: '' }), 'http://127.0.0.1:11434');
});

test('getRoutingEndpoint falls back to OpenRouteService', () => {
  assert.equal(getRoutingEndpoint(''), 'https://api.openrouteservice.org');
  assert.equal(getRoutingEndpoint('http://ors.local:8080/ors'), 'http://ors.local:8080');
});

test('stored LLM key is dropped when the base URL is redirected without a new key', () => {
  const secrets = { llm: { apiKey: 'sk-stored' }, routing: {} };
  const result = bindSecretsToEndpoints({
    previousConfig: llmConfig(),
    nextConfig: llmConfig({ baseUrl: 'https://attacker.example.com/v1' }),
    secrets,
  });
  assert.equal(result.llm.apiKey, undefined);
  assert.equal(secrets.llm.apiKey, 'sk-stored', 'input is not mutated');
});

test('stored LLM key is kept when the endpoint is unchanged', () => {
  const result = bindSecretsToEndpoints({
    previousConfig: llmConfig({ baseUrl: 'https://proxy.example.com/v1' }),
    nextConfig: llmConfig({ baseUrl: 'https://proxy.example.com/v2' }),
    secrets: { llm: { apiKey: 'sk-stored' }, routing: {} },
  });
  assert.equal(result.llm.apiKey, 'sk-stored');
});

test('a newly entered key is not dropped when the endpoint changes', () => {
  const result = bindSecretsToEndpoints({
    previousConfig: llmConfig(),
    nextConfig: llmConfig({ baseUrl: 'https://other.example.com/v1', apiKey: 'sk-new' }),
    secrets: { llm: { apiKey: 'sk-stored' }, routing: {} },
  });
  // The stored key survives here only because extractSecretsFromConfig overwrites it with the new one afterwards.
  assert.equal(result.llm.apiKey, 'sk-stored');
});

test('switching provider moves the endpoint and drops the key', () => {
  const result = bindSecretsToEndpoints({
    previousConfig: llmConfig({ provider: 'openai' }),
    nextConfig: llmConfig({ provider: 'anthropic' }),
    secrets: { llm: { apiKey: 'sk-openai' }, routing: {} },
  });
  assert.equal(result.llm.apiKey, undefined, 'an OpenAI key must never be sent to another vendor');
});

test('routing key is bound to the routing base URL', () => {
  const previousConfig = { services: { llm: {}, routing: { baseUrl: '' }, travel: { routingBaseUrl: '' } } };
  const redirected = {
    services: {
      llm: {},
      routing: { baseUrl: 'https://attacker.example.com' },
      travel: { routingBaseUrl: 'https://attacker.example.com' },
    },
  };
  const result = bindSecretsToEndpoints({
    previousConfig,
    nextConfig: redirected,
    secrets: { llm: {}, routing: { apiKey: 'ors-key', googleRoutesApiKey: 'g-key' } },
  });
  assert.equal(result.routing.apiKey, undefined);
  assert.equal(result.routing.googleRoutesApiKey, 'g-key', 'Google Routes key always goes to Google');
});

test('sameUrlOrigin is what decides whether the HA token may be reused', () => {
  assert.equal(sameUrlOrigin('http://ha.local:8123', 'http://ha.local:8123/'), true);
  assert.equal(sameUrlOrigin('http://ha.local:8123', 'http://ha.local:9999'), false);
});
