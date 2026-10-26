const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { startServer } = require('./helpers/server');

// Config and secret handling through the real routes.

let server;
test.before(async () => { server = await startServer({ trustLocal: false }); });
test.after(async () => { await server.close(); });

const auth = () => ({ token: server.token });
const getConfig = async () => (await server.request('GET', '/api/config', auth())).json;
const saveConfig = (config) => server.request('POST', '/api/config', { ...auth(), body: config });

test('the first read creates a usable config', async () => {
  const config = await getConfig();
  assert.ok(config.system);
  assert.ok(config.services.llm);
});

test('an API key is stored in the secrets file, never in config.json, and never sent back', async () => {
  const config = await getConfig();
  config.services.llm = { ...config.services.llm, enabled: true, provider: 'openai', apiKey: 'sk-test-SECRET-123456' };
  const saved = await saveConfig(config);
  assert.equal(saved.status, 200);
  assert.doesNotMatch(saved.text, /SECRET-123456/, 'the save response must not echo the key');

  assert.doesNotMatch(server.readFile('config.json'), /SECRET-123456/, 'not in config.json');
  assert.match(fs.readFileSync(server.dataFile('secrets.json'), 'utf8'), /SECRET-123456/);
  assert.equal(fs.statSync(server.dataFile('secrets.json')).mode & 0o777, 0o600);

  const again = await server.request('GET', '/api/config', auth());
  assert.doesNotMatch(again.text, /SECRET-123456/);
  assert.equal(again.json.services.llm.apiKey, '');
  assert.equal(again.json.services.llm.apiKeyConfigured, true);
});

test('saving again without retyping the key keeps it', async () => {
  const config = await getConfig();
  config.services.llm.apiKey = '';
  config.services.llm.model = 'another-model';
  await saveConfig(config);
  assert.match(fs.readFileSync(server.dataFile('secrets.json'), 'utf8'), /SECRET-123456/);
  assert.equal((await getConfig()).services.llm.model, 'another-model');
});

test('the saved key is dropped when the endpoint it belongs to changes (it must not be sent to a new host)', async () => {
  const config = await getConfig();
  config.services.llm.provider = 'custom';
  config.services.llm.baseUrl = 'http://192.0.2.50:11434';
  config.services.llm.apiKey = '';
  await saveConfig(config);
  assert.doesNotMatch(fs.readFileSync(server.dataFile('secrets.json'), 'utf8'), /SECRET-123456/);
  assert.equal((await getConfig()).services.llm.apiKeyConfigured, false);
});

test('a Home Assistant token never leaves the backend, survives a save with an empty field, and is dropped for a new URL', async () => {
  const config = await getConfig();
  config.moduleSettings = { ...(config.moduleSettings || {}), home_assistant: { url: 'http://ha.local:8123', token: 'HA-TOKEN-SECRET-987654' } };
  assert.equal((await saveConfig(config)).status, 200);
  // The display reads config.json from disk, so the token is there ...
  assert.match(server.readFile('config.json'), /HA-TOKEN-SECRET-987654/);
  // ... but no API answer contains it.
  const read = await server.request('GET', '/api/config', auth());
  assert.doesNotMatch(read.text, /HA-TOKEN-SECRET-987654/);
  assert.equal(read.json.moduleSettings.home_assistant.tokenConfigured, true);

  // The remote UI sends the field empty on the next save: the stored token is kept.
  const unchanged = read.json;
  unchanged.moduleSettings.home_assistant.token = '';
  await saveConfig(unchanged);
  assert.match(server.readFile('config.json'), /HA-TOKEN-SECRET-987654/);

  // Pointing the integration at another host must not send the old token there.
  const moved = (await getConfig());
  moved.moduleSettings.home_assistant.url = 'http://evil.example.net:8123';
  moved.moduleSettings.home_assistant.token = '';
  await saveConfig(moved);
  assert.doesNotMatch(server.readFile('config.json'), /HA-TOKEN-SECRET-987654/);
});

test('an invalid URL is refused with 400, says why, and nothing is saved', async () => {
  const before = server.readFile('config.json');
  const config = await getConfig();
  config.services.llm.baseUrl = 'ftp://example.com';
  const res = await saveConfig(config);
  assert.equal(res.status, 400);
  assert.match(res.json.details, /http/i);
  assert.equal(server.readFile('config.json'), before, 'config.json is unchanged after a refused save');
});

test('no temp files are left next to config.json and the file is private', async () => {
  const config = await getConfig();
  await saveConfig(config);
  const leftovers = fs.readdirSync(server.dir).filter((name) => name.endsWith('.tmp'));
  assert.deepEqual(leftovers, []);
  assert.equal(fs.statSync(`${server.dir}/config.json`).mode & 0o777, 0o600);
});
