const crypto = require('crypto');
const { getLocalDateKey, getTimeOfDay } = require('../time/zone');

// Decides WHEN the model has to be asked again. Until now it was asked whenever the context was rebuilt with
// force=true, i.e. on every display poll after the refresh interval and on every calendar change. The answer
// only depends on what the model is given, so the rule is: same input, same answer.
//
// The fingerprint covers exactly what reaches the prompt (dossier events and facts, language, focus, model
// settings). It deliberately ignores clock noise: "starts in 37 minutes" changes every minute and must not
// trigger a new model call.

const stable = (value) => JSON.stringify(value);

const fingerprintDossier = (dossier, { provider = '', model = '', privacyMode = '', prompt = 'v1' } = {}) => {
  if (!dossier) {
    return '';
  }
  const payload = {
    prompt,
    provider,
    model,
    privacyMode,
    locale: dossier.locale,
    focus: dossier.focus,
    day: dossier.todayDate,
    events: (dossier.events || []).map((event) => [event.title, event.day, event.when, event.location, event.calendar, event.notes || '']),
    facts: (dossier.facts || []).map((fact) => [fact.kind, fact.eventRef, fact.text]),
  };
  return crypto.createHash('sha1').update(stable(payload)).digest('hex');
};

// The wording of the brief depends on the part of the day ("Heute" / "Morgen" headline, what is still ahead).
// The model is asked again when the dossier changes anyway; this only covers the day-part boundary.
const getDayPart = (now, timeZone) => `${getLocalDateKey(now, timeZone)}|${getTimeOfDay(now, timeZone)}`;

const FAILED_RETRY_MINUTES = 15;
const SAFETY_REFRESH_HOURS = 12;

// Returns { reuse: boolean, reason }. `previous` is the stored llm result of the dossier pipeline.
const decideLlmReuse = ({
  previous,
  fingerprint,
  force = false,
  now = Date.now(),
  timeZone = 'UTC',
  failedRetryMinutes = FAILED_RETRY_MINUTES,
  safetyRefreshHours = SAFETY_REFRESH_HOURS,
}) => {
  if (force) {
    return { reuse: false, reason: 'forced' };
  }
  if (!previous || previous.debug?.pipeline !== 'dossier' || !previous.debug?.fingerprint) {
    return { reuse: false, reason: 'no_previous_result' };
  }
  const updatedAt = Date.parse(previous.updatedAt);
  if (Number.isNaN(updatedAt)) {
    return { reuse: false, reason: 'no_previous_result' };
  }
  const ageMinutes = (now - updatedAt) / 60000;

  // A "degraded" result (the model failed, the rule-based notes were shown) is a failure in disguise: its status
  // is "ready", but the model never answered. It must not be reused as if the model had said this.
  if (previous.status === 'failed' || previous.degraded === true) {
    // A provider outage must not turn into a request on every refresh, nor stay broken for hours.
    return ageMinutes < failedRetryMinutes && previous.debug.fingerprint === fingerprint
      ? { reuse: true, reason: 'recent_failure_backoff' }
      : { reuse: false, reason: 'retry_after_failure' };
  }
  if (previous.status !== 'ready') {
    // disabled / skipped results are cheap to recompute and must pick up a new key or setting at once.
    return { reuse: false, reason: 'not_a_model_result' };
  }
  if (previous.debug.fingerprint !== fingerprint) {
    return { reuse: false, reason: 'input_changed' };
  }
  if (getDayPart(updatedAt, timeZone) !== getDayPart(now, timeZone)) {
    return { reuse: false, reason: 'day_part_changed' };
  }
  if (ageMinutes > safetyRefreshHours * 60) {
    return { reuse: false, reason: 'safety_refresh' };
  }
  return { reuse: true, reason: 'unchanged' };
};

module.exports = {
  FAILED_RETRY_MINUTES,
  SAFETY_REFRESH_HOURS,
  decideLlmReuse,
  fingerprintDossier,
  getDayPart,
};
