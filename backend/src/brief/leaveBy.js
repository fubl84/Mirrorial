// The "when do I have to leave" statements for an appointment. Pure: times and the route are passed in.
//
// Rules this module enforces (all three were missing before):
//   - A duration that is only a straight-line guess (no routing provider answered) is never turned into a
//     departure time. "Leave around 10:30" built on a guess is worse than saying nothing.
//   - A departure time that has already passed is not stated as if it were still ahead. While the appointment
//     has not started yet the statement becomes "leave now".
//   - Nothing is said once the appointment has started.
//   - The wording contains no countdown ("starts in 12 min"): that would change every minute, and the text is
//     part of what decides whether the model has to be asked again.

const ESTIMATE_SOURCES = new Set(['estimated']);

const isRealRoute = (route) => Boolean(route) && !ESTIMATE_SOURCES.has(route.source);

// route: { durationMinutes, source }   startMs / now: epoch ms
// formatClock(ms) -> "10:30"
// Returns an array of fact strings (possibly empty).
const buildLeaveByStatements = ({
  route,
  startMs,
  now = Date.now(),
  arrivalBufferMinutes = 0,
  modeLabel = 'car',
  originLabel = 'home',
  destinationLabel = 'the destination',
  formatClock,
}) => {
  const travelMinutes = Math.max(1, Math.round(Number(route?.durationMinutes) || 0));
  if (!route || !Number.isFinite(Number(route.durationMinutes)) || !Number.isFinite(startMs)) {
    return [];
  }

  if (!isRealRoute(route)) {
    // Straight-line distance at an average speed: good enough to say "about", never good enough to say "leave at".
    return [`Rough estimate from the straight-line distance (no live route): about ${travelMinutes} min by ${modeLabel} from ${originLabel} to ${destinationLabel}.`];
  }

  const statements = [`Estimated ${modeLabel} from ${originLabel} to ${destinationLabel} takes about ${travelMinutes} min.`];
  if (startMs <= now) {
    return statements;
  }

  const buffer = Math.max(0, Number(arrivalBufferMinutes) || 0);
  const leaveByMs = startMs - ((travelMinutes + buffer) * 60000);
  const leaveBy = formatClock(leaveByMs);

  if (leaveByMs > now) {
    statements.push(buffer > 0
      ? `Leave around ${leaveBy} to arrive about ${buffer} min early.`
      : `Leave around ${leaveBy} for on-time arrival.`);
  } else {
    // The planned departure has passed. Whether it is still possible is not decided here: the statement only
    // says that the time is up.
    statements.push(`Leave now: the planned departure time (${leaveBy}) has already passed.`);
  }
  return statements;
};

module.exports = {
  buildLeaveByStatements,
  isRealRoute,
};
