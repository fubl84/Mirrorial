const test = require('node:test');
const assert = require('node:assert/strict');

const { checkLlmPreconditions } = require('../src/brief/gate');
const { isLocalBaseUrl } = require('../src/security/urlGuard');

const check = (llmConfig, apiKey = 'sk-test') => checkLlmPreconditions({ llmConfig, apiKey });

test('a disabled or unconfigured model is reported, not called', () => {
  assert.deepEqual(check({ enabled: false }), { status: 'disabled', reason: '' });
  assert.deepEqual(check({ enabled: true, provider: 'anthropic' }, ''), { status: 'skipped', reason: 'missing_api_key' });
  assert.equal(check({ enabled: true, provider: 'custom', baseUrl: 'http://127.0.0.1:11434/v1' }, ''), null, 'a local model needs no key');
});

test('privacy mode "off" really prevents any model call', () => {
  assert.deepEqual(check({ enabled: true, provider: 'openai', privacyMode: 'off' }), { status: 'skipped', reason: 'privacy_mode_off' });
});

test('local-only requires a custom provider on a local address', () => {
  assert.equal(check({ enabled: true, provider: 'openai', privacyMode: 'local-only' }).reason, 'local_only_requires_custom_provider');
  assert.equal(check({ enabled: true, provider: 'custom', privacyMode: 'local-only', baseUrl: 'https://api.example.com/v1' }).reason, 'custom_provider_not_local');
  assert.equal(check({ enabled: true, provider: 'custom', privacyMode: 'local-only', baseUrl: 'http://ollama.local:11434/v1' }), null);
  assert.equal(check({ enabled: true, provider: 'custom', privacyMode: 'local-only', baseUrl: 'http://[::1]:11434/v1' }), null);
});

test('cloud privacy modes pass the gate', () => {
  assert.equal(check({ enabled: true, provider: 'anthropic', privacyMode: 'cloud-redacted' }), null);
  assert.equal(check({ enabled: true, provider: 'openai', privacyMode: 'full' }), null);
  assert.equal(check({ enabled: true, provider: 'openai' }), null, 'default mode is cloud-redacted');
});

test('isLocalBaseUrl recognises loopback and .local only', () => {
  assert.equal(isLocalBaseUrl('http://localhost:11434'), true);
  assert.equal(isLocalBaseUrl('http://127.0.0.1:11434/v1'), true);
  assert.equal(isLocalBaseUrl('http://pi.local/v1'), true);
  assert.equal(isLocalBaseUrl('https://localhost.evil.com'), false);
  assert.equal(isLocalBaseUrl('http://192.168.1.20:11434'), false, 'LAN addresses are not "this machine"');
  assert.equal(isLocalBaseUrl('not a url'), false);
});
