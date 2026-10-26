// Shapes the outcome of the dossier pipeline into the `llm` object the rest of the app stores, serves and
// shows in the debug view. Kept separate from index.js so the mapping can be unit tested.

const buildLlmResult = ({ run, provider, model, privacyMode, problems = [], now = new Date() }) => {
  const updatedAt = now.toISOString();
  const debug = {
    provider,
    model,
    privacyMode,
    enabled: true,
    pipeline: 'dossier',
    status: run.status,
    reason: run.reason || '',
    degraded: Boolean(run.degraded),
    dossier: run.dossier,
    system: run.debug?.system || '',
    prompt: run.debug?.prompt || '',
    rawResponse: run.debug?.rawResponse || '',
    providerPayload: run.debug?.providerPayload || null,
    // How the model was reached: structured-output mode, token usage, number of requests, temperature sent.
    call: run.debug?.call || null,
    parsedBrief: run.debug?.parsed || null,
    accepted: run.debug?.accepted || [],
    rejected: run.debug?.rejected || [],
    generated: run.debug?.generated || [],
    finalBullets: run.debug?.finalBullets || [],
    modelError: run.debug?.modelError || '',
    lookupProblems: problems,
  };

  if (run.status === 'failed') {
    return { updatedAt, provider, status: 'failed', reason: run.reason, brief: null, debug };
  }

  // "ready" with no brief means: nothing worth saying. The deterministic brief stays in charge, and this is
  // not an error, so the LLM is not asked again until something changes.
  return {
    updatedAt,
    provider,
    status: 'ready',
    reason: run.reason || '',
    degraded: Boolean(run.degraded),
    brief: run.brief,
    debug,
  };
};

// Never keep a full dossier or prompt of a failed lookup longer than needed: only what the debug view needs.
const buildSkippedResult = ({ gate, provider, model, privacyMode, now = new Date() }) => ({
  updatedAt: now.toISOString(),
  provider,
  status: gate.status,
  ...(gate.reason ? { reason: gate.reason } : {}),
  brief: null,
  debug: { provider, model, privacyMode, enabled: gate.status !== 'disabled', pipeline: 'dossier', status: gate.status, reason: gate.reason },
});

module.exports = {
  buildLlmResult,
  buildSkippedResult,
};
