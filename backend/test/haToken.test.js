const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractHomeAssistantToken,
  restoreHomeAssistantToken,
  stripHomeAssistantToken,
} = require('../src/security/haToken');
const { PublicError, safeDetails, GENERIC_DETAILS } = require('../src/security/errors');
const { sameUrlOrigin } = require('../src/security/urlGuard');

const haConfig = (token, url = 'http://ha.local:8123') => ({
  moduleSettings: { home_assistant: { url, token, entities: [] } },
  gridLayouts: {
    portrait: {
      modules: [
        { id: 'ha_1', type: 'home_assistant', config: { url, token } },
        { id: 'rot', type: 'module_rotator', config: { modules: [{ id: 'ha_2', type: 'home_assistant', config: { url, token } }] } },
        { id: 'clock', type: 'clock', config: { token: 'not-a-ha-token' } },
      ],
    },
  },
});

test('stripHomeAssistantToken removes the token everywhere and flags it as configured', () => {
  const stripped = stripHomeAssistantToken(haConfig('secret-ha-token'));
  assert.equal(JSON.stringify(stripped).includes('secret-ha-token'), false);
  assert.equal(stripped.moduleSettings.home_assistant.tokenConfigured, true);
  assert.equal(stripped.gridLayouts.portrait.modules[0].config.tokenConfigured, true);
  assert.equal(stripped.gridLayouts.portrait.modules[1].config.modules[0].config.token, '');
  assert.equal(stripped.gridLayouts.portrait.modules[2].config.token, 'not-a-ha-token', 'other modules are untouched');
});

test('stripHomeAssistantToken reports tokenConfigured=false when no token is stored', () => {
  assert.equal(stripHomeAssistantToken(haConfig('')).moduleSettings.home_assistant.tokenConfigured, false);
});

test('restoreHomeAssistantToken keeps the stored token for the same URL when the client sends none', () => {
  const previous = haConfig('stored-token');
  const incoming = stripHomeAssistantToken(haConfig('stored-token'));
  const restored = restoreHomeAssistantToken(incoming, previous, sameUrlOrigin);
  assert.equal(restored.moduleSettings.home_assistant.token, 'stored-token');
  assert.equal(restored.gridLayouts.portrait.modules[0].config.token, 'stored-token');
  assert.equal('tokenConfigured' in restored.moduleSettings.home_assistant, false);
});

test('restoreHomeAssistantToken drops the stored token when the URL points elsewhere', () => {
  const previous = haConfig('stored-token', 'http://ha.local:8123');
  const incoming = stripHomeAssistantToken(haConfig('stored-token', 'https://attacker.example.com'));
  const restored = restoreHomeAssistantToken(incoming, previous, sameUrlOrigin);
  assert.equal(restored.moduleSettings.home_assistant.token, '');
});

test('restoreHomeAssistantToken accepts a newly entered token', () => {
  const restored = restoreHomeAssistantToken(haConfig('new-token'), haConfig('old-token'), sameUrlOrigin);
  assert.equal(restored.moduleSettings.home_assistant.token, 'new-token');
});

test('extractHomeAssistantToken finds the token and its URL', () => {
  assert.deepEqual(extractHomeAssistantToken(haConfig('abc')), { token: 'abc', url: 'http://ha.local:8123' });
  assert.deepEqual(extractHomeAssistantToken({}), { token: '', url: '' });
});

test('safeDetails exposes PublicError messages only', () => {
  const logged = [];
  const log = (...args) => logged.push(args.join(' '));
  assert.equal(safeDetails(new PublicError('URL is invalid'), { log }), 'URL is invalid');
  assert.equal(logged.length, 0);

  const upstream = new Error('connect ECONNREFUSED 10.0.0.5:8123 with key sk-secret');
  assert.equal(safeDetails(upstream, { log }), GENERIC_DETAILS);
  assert.equal(logged.length, 1, 'the real error is logged server-side');
});
