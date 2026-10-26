const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLlmResult, buildSkippedResult } = require('../src/brief/result');
const { selectContextBrief, llmBriefHasMeaningfulContent } = require('../index.js');

const NOW = new Date('2026-04-10T07:00:00Z');
const base = { provider: 'anthropic', model: 'm', privacyMode: 'cloud-redacted', now: NOW };
const dossier = { events: [], facts: [] };

test('a brief becomes a ready llm result the existing selector accepts', () => {
  const result = buildLlmResult({
    ...base,
    run: { status: 'ready', brief: { headline: 'Heute', bullets: ['Eins'], householdView: 'Wichtig', priority: 'high' }, dossier, debug: { usedModel: true } },
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.updatedAt, NOW.toISOString());
  assert.equal(result.debug.pipeline, 'dossier');
  assert.equal(llmBriefHasMeaningfulContent(result.brief), true);

  const picked = selectContextBrief({ headline: 'Fallback', bullets: [], householdView: '' }, result);
  assert.equal(picked.source, 'llm');
  assert.equal(picked.householdView, 'Wichtig');
  assert.deepEqual(picked.bullets, ['Eins']);
});

test('"nothing worth saying" is a ready result without a brief, so the deterministic brief stays in charge', () => {
  const result = buildLlmResult({ ...base, run: { status: 'ready', reason: 'nothing_to_report', brief: null, dossier, debug: {} } });
  assert.equal(result.status, 'ready');
  assert.equal(result.brief, null);
  const picked = selectContextBrief({ headline: 'Fallback', bullets: ['x'], householdView: '' }, result);
  assert.equal(picked.source, 'deterministic');
});

test('a degraded run keeps its brief and says why', () => {
  const result = buildLlmResult({
    ...base,
    run: { status: 'ready', degraded: true, reason: 'model_unavailable_using_rules: ETIMEDOUT', brief: { headline: 'Heute', bullets: [], householdView: 'Überschneidung', priority: 'high' }, dossier, debug: { modelError: 'ETIMEDOUT' } },
  });
  assert.equal(result.degraded, true);
  assert.match(result.reason, /model_unavailable_using_rules/);
  assert.equal(result.debug.modelError, 'ETIMEDOUT');
});

test('a failed run has no brief and carries the reason and lookup problems', () => {
  const result = buildLlmResult({ ...base, problems: [{ label: 'weather', error: 'down' }], run: { status: 'failed', reason: 'boom', dossier, debug: {} } });
  assert.equal(result.status, 'failed');
  assert.equal(result.brief, null);
  assert.equal(result.reason, 'boom');
  assert.deepEqual(result.debug.lookupProblems, [{ label: 'weather', error: 'down' }]);
});

test('skipped results keep the reason vocabulary of the old pipeline', () => {
  const skipped = buildSkippedResult({ ...base, gate: { status: 'skipped', reason: 'missing_api_key' } });
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.reason, 'missing_api_key');
  assert.equal(skipped.brief, null);
  const disabled = buildSkippedResult({ ...base, gate: { status: 'disabled', reason: '' } });
  assert.equal(disabled.status, 'disabled');
  assert.equal('reason' in disabled, false);
  assert.equal(disabled.debug.enabled, false);
});
