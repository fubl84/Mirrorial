const test = require('node:test');
const assert = require('node:assert/strict');

const { prepareSchema } = require('../src/llm/schema');
const { COMPOSER_JSON_SCHEMA } = require('../src/brief/composer');

const walk = (node, visit) => {
  if (Array.isArray(node)) {
    node.forEach((entry) => walk(entry, visit));
    return;
  }
  if (node && typeof node === 'object') {
    visit(node);
    Object.values(node).forEach((child) => walk(child, visit));
  }
};

test('anthropic and openai schemas drop array bounds and close every object', () => {
  ['anthropic', 'openai-strict'].forEach((target) => {
    const prepared = prepareSchema(COMPOSER_JSON_SCHEMA, target);
    assert.equal('maxItems' in prepared.properties.bullets, false);
    walk(prepared, (node) => {
      if (node.type === 'object' && node.properties) {
        assert.equal(node.additionalProperties, false);
      }
    });
    // enum is supported by both and must survive
    assert.deepEqual(prepared.properties.bullets.items.properties.urgency.enum, ['high', 'normal', 'low']);
  });
});

test('openai strict mode lists every property as required', () => {
  const prepared = prepareSchema({
    type: 'object',
    properties: { a: { type: 'string' }, b: { type: 'array', items: { type: 'string' } } },
    required: ['a'],
  }, 'openai-strict');
  assert.deepEqual(prepared.required, ['a', 'b']);
});

test('anthropic keeps the required list of the original schema', () => {
  const prepared = prepareSchema({
    type: 'object',
    properties: { a: { type: 'string' }, b: { type: 'string' } },
    required: ['a'],
  }, 'anthropic');
  assert.deepEqual(prepared.required, ['a']);
});

test('google gets upper case types and no additionalProperties', () => {
  const prepared = prepareSchema(COMPOSER_JSON_SCHEMA, 'google');
  assert.equal(prepared.type, 'OBJECT');
  assert.equal(prepared.properties.bullets.type, 'ARRAY');
  walk(prepared, (node) => assert.equal('additionalProperties' in node, false));
});

test('legacy upper case schemas are accepted for every target', () => {
  const legacy = { type: 'OBJECT', properties: { x: { type: 'STRING' } }, required: ['x'] };
  assert.equal(prepareSchema(legacy, 'anthropic').type, 'object');
  assert.equal(prepareSchema(legacy, 'anthropic').properties.x.type, 'string');
  assert.equal(prepareSchema(legacy, 'google').properties.x.type, 'STRING');
});

test('the input schema is not modified', () => {
  const copy = JSON.parse(JSON.stringify(COMPOSER_JSON_SCHEMA));
  prepareSchema(COMPOSER_JSON_SCHEMA, 'openai-strict');
  prepareSchema(COMPOSER_JSON_SCHEMA, 'google');
  assert.deepEqual(COMPOSER_JSON_SCHEMA, copy);
});

test('an unknown target is a programming error', () => {
  assert.throws(() => prepareSchema({}, 'nope'), /Unknown schema target/);
});
