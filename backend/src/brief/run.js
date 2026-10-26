const { buildDossier } = require('./dossier');
const { COMPOSER_SYSTEM_PROMPT, buildComposerPrompt } = require('./composer');
const { buildMissingBullets } = require('./fallback');
const { MAX_BULLETS, validateComposerOutput } = require('./validate');

const URGENCY_RANK = { high: 0, normal: 1, low: 2 };

const HEADLINES = {
  de: { today: 'Heute', tomorrow: 'Morgen' },
  en: { today: 'Today', tomorrow: 'Tomorrow' },
};

// The top note is shown prominently (householdView) when it is urgent; everything else is a plain bullet.
const assembleBrief = ({ bullets, dossier }) => {
  const [lead, ...rest] = bullets;
  const promoteLead = lead && lead.urgency === 'high';
  return {
    headline: (HEADLINES[dossier.locale] || HEADLINES.en)[dossier.focus],
    bullets: (promoteLead ? rest : bullets).map((bullet) => bullet.text),
    householdView: promoteLead ? lead.text : '',
    priority: bullets.some((bullet) => bullet.urgency === 'high') ? 'high' : 'normal',
  };
};

const mergeBullets = (accepted, generated) => [...generated, ...accepted]
  .map((bullet, index) => ({ bullet, index }))
  .sort((left, right) => (URGENCY_RANK[left.bullet.urgency] - URGENCY_RANK[right.bullet.urgency]) || (left.index - right.index))
  .map((entry) => entry.bullet)
  .slice(0, MAX_BULLETS);

// Builds the dossier, asks the model (when there is something worth saying), validates the answer and adds
// deterministic notes for anything important the model left out.
//   callModel({ system, prompt }) -> { text, payload }      (injected; the provider layer lives elsewhere)
//   parseJson(text)               -> object                 (injected; tolerant JSON extraction)
// Never throws for model problems: the result carries status and reason, and still contains the deterministic
// notes whenever there are any, so a provider outage cannot hide a schedule conflict.
const runDossierBrief = async ({
  events,
  now = Date.now(),
  timeZone = 'UTC',
  locale = 'en',
  privacyMode = 'cloud-redacted',
  extraFacts = [],
  isIncluded = null,
  couldConflict = undefined,
  fingerprintOf = null,
  reusePrevious = null,
  callModel,
  parseJson,
}) => {
  const dossier = buildDossier({ events, now, timeZone, locale, privacyMode, extraFacts, isIncluded, couldConflict });
  const fingerprint = fingerprintOf ? fingerprintOf(dossier) : '';
  const debug = { pipeline: 'dossier', dossier, usedModel: false, fingerprint };

  if (!dossier.hasContent) {
    return { status: 'ready', reason: 'nothing_to_report', brief: null, bullets: [], dossier, debug };
  }

  // Same input as the last answer: no model call. `reusePrevious(fingerprint)` returns the stored result or null.
  const reused = reusePrevious ? reusePrevious(fingerprint, dossier) : null;
  if (reused) {
    return { ...reused, reused: true };
  }

  let accepted = [];
  let modelProblem = null;
  const prompt = buildComposerPrompt(dossier);
  debug.system = COMPOSER_SYSTEM_PROMPT;
  debug.prompt = prompt;

  try {
    debug.usedModel = true;
    const result = await callModel({ system: COMPOSER_SYSTEM_PROMPT, prompt });
    debug.rawResponse = result?.text || '';
    debug.providerPayload = result?.payload || null;
    debug.call = result?.call || null;
    if (!`${result?.text || ''}`.trim()) {
      throw Object.assign(new Error('empty_model_response'), { providerPayload: result?.payload || null });
    }
    debug.parsed = parseJson(result.text);
    const validated = validateComposerOutput(debug.parsed, dossier);
    accepted = validated.bullets;
    debug.rejected = validated.rejected;
  } catch (error) {
    modelProblem = error;
    debug.modelError = `${error?.message || error}`;
    if (error?.providerPayload) {
      debug.providerPayload = error.providerPayload;
    }
  }

  const generated = buildMissingBullets({ dossier, bullets: accepted });
  debug.accepted = accepted;
  debug.generated = generated;

  const bullets = mergeBullets(accepted, generated);
  debug.finalBullets = bullets;

  if (bullets.length === 0) {
    return modelProblem
      ? { status: 'failed', reason: debug.modelError, brief: null, bullets, dossier, debug, error: modelProblem }
      : { status: 'ready', reason: 'model_found_nothing_worth_saying', brief: null, bullets, dossier, debug };
  }

  return {
    status: 'ready',
    reason: modelProblem ? `model_unavailable_using_rules: ${debug.modelError}` : '',
    degraded: Boolean(modelProblem),
    brief: assembleBrief({ bullets, dossier }),
    bullets,
    dossier,
    debug,
  };
};

module.exports = {
  assembleBrief,
  mergeBullets,
  runDossierBrief,
};
