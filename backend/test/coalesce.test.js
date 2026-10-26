const test = require('node:test');
const assert = require('node:assert/strict');

const { createCoalescedRunner } = require('../src/runtime/coalesce');

// A task whose completion the test controls.
const controlledTask = () => {
  const calls = [];
  const task = (options) => new Promise((resolve, reject) => {
    calls.push({ options, resolve, reject });
  });
  return { task, calls };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('a single request runs once and returns the task result', async () => {
  const runner = createCoalescedRunner(async ({ n }) => n * 2);
  assert.equal(await runner.request({ n: 21 }), 42);
  assert.equal(runner.isRunning(), false);
  assert.equal(runner.runCount(), 1);
});

test('requests during a run never overlap: one follow-up run serves all of them', async () => {
  const { task, calls } = controlledTask();
  const runner = createCoalescedRunner(task);

  const first = runner.request({ forceLlm: false });
  await tick();
  assert.equal(calls.length, 1);

  const second = runner.request({ forceLlm: false });
  const third = runner.request({ forceLlm: true });
  const fourth = runner.request({ forceLlm: false });
  await tick();
  assert.equal(calls.length, 1, 'nothing starts while the first run is active');
  assert.equal(runner.hasQueued(), true);

  calls[0].resolve('one');
  assert.equal(await first, 'one');
  await tick();
  assert.equal(calls.length, 2, 'exactly one follow-up');
  assert.deepEqual(calls[1].options, { forceLlm: true }, 'flags are merged: one forced request forces the follow-up');

  calls[1].resolve('two');
  assert.deepEqual(await Promise.all([second, third, fourth]), ['two', 'two', 'two']);
  assert.equal(runner.isRunning(), false);
  assert.equal(runner.runCount(), 2);
});

test('a request that arrives mid-run is served by a run that starts afterwards', async () => {
  let inputVersion = 1;
  const seen = [];
  const { task: raw, calls } = controlledTask();
  const runner = createCoalescedRunner((options) => {
    seen.push(inputVersion);
    return raw(options);
  });

  const first = runner.request();
  await tick();
  inputVersion = 2; // e.g. the household was saved while the first build was running
  const second = runner.request();
  calls[0].resolve('built-with-v1');
  await first;
  await tick();
  calls[1].resolve('built-with-v2');
  await second;
  assert.deepEqual(seen, [1, 2]);
});

test('a failing run rejects its waiters but the queued follow-up still runs', async () => {
  const { task, calls } = controlledTask();
  const runner = createCoalescedRunner(task);

  const first = runner.request();
  await tick();
  const second = runner.request();
  calls[0].reject(new Error('boom'));
  await assert.rejects(first, /boom/);
  await tick();
  calls[1].resolve('recovered');
  assert.equal(await second, 'recovered');
  assert.equal(runner.isRunning(), false);
});

test('after everything finished the next request starts a fresh run', async () => {
  const { task, calls } = controlledTask();
  const runner = createCoalescedRunner(task);
  const first = runner.request();
  await tick();
  calls[0].resolve(1);
  await first;
  const second = runner.request();
  await tick();
  assert.equal(calls.length, 2);
  calls[1].resolve(2);
  assert.equal(await second, 2);
});

test('trigger never throws and reports errors to onError', async () => {
  const errors = [];
  const runner = createCoalescedRunner(async () => { throw new Error('nope'); }, { onError: (error) => errors.push(error.message) });
  runner.trigger();
  await tick();
  assert.deepEqual(errors, ['nope']);
  assert.equal(runner.isRunning(), false);
});

test('many concurrent requests produce at most two task runs', async () => {
  let active = 0;
  let maxActive = 0;
  const runner = createCoalescedRunner(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await tick();
    active -= 1;
    return 'ok';
  });
  const results = await Promise.all(Array.from({ length: 25 }, () => runner.request()));
  assert.equal(results.every((value) => value === 'ok'), true);
  assert.equal(maxActive, 1, 'never two at once');
  assert.equal(runner.runCount(), 2);
});
