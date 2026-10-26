// Keeps a calendar usable while its server is having a bad moment.
//
// Before: a source that failed to load contributed ZERO events to the cache. One timeout was enough for the
// next context rebuild to see an empty calendar, and the brief lost real appointments until the next sync.
// Now: when a source fails, the events it delivered last time are kept (marked stale) for a limited time.
// A source that works again replaces them at once.

const STALE_KEEP_MS = 48 * 3600000;

const GOOGLE_SOURCE_ID = 'google';

// Events of a given source in the previous cache. Subscription events carry `sourceId`; Google events do not.
const eventsOfSource = (events, sourceId) => (Array.isArray(events) ? events : []).filter((event) => (
  sourceId === GOOGLE_SOURCE_ID ? !event.sourceId : event.sourceId === sourceId
));

const calendarsOfSource = (calendars, sourceId) => (Array.isArray(calendars) ? calendars : []).filter((calendar) => (
  sourceId === GOOGLE_SOURCE_ID ? !calendar.sourceId : calendar.sourceId === sourceId
));

// bundle:   { calendars, events, source: { id, status, error, ... } }  freshly fetched (events empty on error)
// previous: the previous calendar cache ({ events, calendars, sources })
// Returns the bundle to use, with `source.stale` / `source.lastSuccessAt` filled in.
const keepPreviousOnError = ({ bundle, previous, now = Date.now(), keepMs = STALE_KEEP_MS }) => {
  const source = bundle?.source;
  if (!source) {
    return bundle;
  }
  const previousSource = (previous?.sources || []).find((entry) => entry?.id === source.id);

  if (source.status === 'ready') {
    return {
      ...bundle,
      source: { ...source, stale: false, lastSuccessAt: new Date(now).toISOString() },
    };
  }

  // Disabled sources are meant to be empty; unknown errors without history have nothing to fall back to.
  if (source.status !== 'error') {
    return bundle;
  }

  // Caches written before this field existed have no lastSuccessAt. A source that was "ready" at the previous
  // sync did deliver its events then, so that moment counts (otherwise the first failure after an upgrade
  // would still lose everything).
  const lastSuccessAt = previousSource?.lastSuccessAt
    || (previousSource?.status === 'ready' && previous?.syncedAt ? previous.syncedAt : null);
  const lastSuccessMs = lastSuccessAt ? Date.parse(lastSuccessAt) : NaN;
  const keptEvents = eventsOfSource(previous?.events, source.id);
  const withinWindow = Number.isFinite(lastSuccessMs) && (now - lastSuccessMs) <= keepMs;

  if (!withinWindow || keptEvents.length === 0) {
    return { ...bundle, source: { ...source, stale: false, lastSuccessAt } };
  }

  return {
    ...bundle,
    calendars: bundle.calendars?.length ? bundle.calendars : calendarsOfSource(previous?.calendars, source.id),
    events: keptEvents,
    source: { ...source, stale: true, lastSuccessAt, eventCount: keptEvents.length },
  };
};

module.exports = {
  STALE_KEEP_MS,
  eventsOfSource,
  keepPreviousOnError,
};
