// Runs an async task so that it never overlaps with itself, without losing a request:
//   - nothing running            -> the task starts at once
//   - something running          -> exactly ONE follow-up run is queued; every request that arrives meanwhile
//                                   joins it (their options are merged) and waits for that follow-up
// The follow-up exists because a request that arrives mid-run may have newer inputs (a calendar that was
// just saved, a household that just changed) which the running task has already read.
//
//   const runner = createCoalescedRunner(async ({ forceLlm }) => buildSomething(forceLlm));
//   await runner.request({ forceLlm: true });       // waits for a run that started after this call
//   runner.trigger();                                // fire and forget, never throws, never waits
//
// `mergeOptions(a, b)` decides how queued requests combine (default: boolean flags are OR-ed).

const defaultMerge = (left = {}, right = {}) => {
  const merged = { ...left };
  Object.entries(right).forEach(([key, value]) => {
    merged[key] = typeof value === 'boolean' ? Boolean(merged[key]) || value : (value ?? merged[key]);
  });
  return merged;
};

const createCoalescedRunner = (task, { mergeOptions = defaultMerge, onError = () => {} } = {}) => {
  let running = false;
  let queued = null;
  let runs = 0;

  const loop = async (firstJob) => {
    let job = firstJob;
    while (job) {
      runs += 1;
      try {
        const value = await task(job.options);
        job.waiters.forEach((waiter) => waiter.resolve(value));
      } catch (error) {
        job.waiters.forEach((waiter) => waiter.reject(error));
      }
      // No await between taking the queue and clearing `running`: a request can never fall into the gap.
      job = queued;
      queued = null;
    }
    running = false;
  };

  const request = (options = {}) => new Promise((resolve, reject) => {
    const waiter = { resolve, reject };
    if (!running) {
      running = true;
      loop({ options: { ...options }, waiters: [waiter] });
      return;
    }
    if (!queued) {
      queued = { options: { ...options }, waiters: [waiter] };
    } else {
      queued.options = mergeOptions(queued.options, options);
      queued.waiters.push(waiter);
    }
  });

  // For callers that only want a refresh to happen (display polling): failures go to onError, nobody waits.
  const trigger = (options = {}) => {
    request(options).catch((error) => onError(error));
  };

  return {
    request,
    trigger,
    isRunning: () => running,
    hasQueued: () => queued !== null,
    runCount: () => runs,
  };
};

module.exports = {
  createCoalescedRunner,
  defaultMerge,
};
