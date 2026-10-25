const { getEventDayOffset } = require('../time/zone');
const {
  hasChangeSignal,
  hasMedicalSignal,
  matchesKeywords,
  normalizeContextRules,
} = require('./rules');

// Words that make an event "distinctive" (worth a mention even when it repeats).
const DISTINCTIVE_EVENT_PATTERN = /\b(concert|conference|partner|setup|presentation|tickets?|dinner|meeting|summit|event|rennen|race|tour|show|festival|lunch|prep|overview)\b/i;

const ROUTINE_EVENT_PATTERNS = {
  workStart: /\b(start arbeiten|start work|shift start|dienstbeginn)\b/i,
  onlineLesson: /\b(online lessons?|lesson|unterricht)\b/i,
  genericClass: /\b(gruppe|group|kurs|course|class|training|topics?\s*\d*|flex)\b/i,
};
const PERSON_LIKE_TITLE_PATTERN = /^[A-ZÄÖÜ][\p{L}'-]+(?:\s+[A-ZÄÖÜ][\p{L}'-]+){0,2}$/u;
const SCHOOL_CALENDAR_PATTERN = /\b(schule|school)\b/i;

// Recurring events further away than this many days are not worth mentioning yet; they appear when they get close.
const RECURRING_HORIZON_DAYS = 1;

// A routine event repeats and is not interesting on its own (lessons, shifts, regular classes).
// Rules that used to be hard-coded for one household are now the user's `routineHints`.
const isLowValueRoutineEvent = (event, rules = normalizeContextRules()) => {
  if (!event) {
    return false;
  }

  // Never hide a schedule change or an appointment because it looks like a routine item.
  if (hasChangeSignal(event) || hasMedicalSignal(event)) {
    return false;
  }

  const title = (event.title || '').trim();
  const combinedText = [event.title || '', event.description || '', event.location || ''].join(' ');
  const schoolLikeCalendar = SCHOOL_CALENDAR_PATTERN.test(event.calendarSummary || '');
  const simpleNameTitle = PERSON_LIKE_TITLE_PATTERN.test(title);

  if (ROUTINE_EVENT_PATTERNS.workStart.test(combinedText) || ROUTINE_EVENT_PATTERNS.onlineLesson.test(combinedText)) {
    return true;
  }
  if (event.isRecurring && matchesKeywords(event, rules.routineHints)) {
    return true;
  }
  if (event.isRecurring && schoolLikeCalendar && ROUTINE_EVENT_PATTERNS.genericClass.test(title)) {
    return true;
  }
  if (event.isRecurring && schoolLikeCalendar && simpleNameTitle) {
    return true;
  }
  // "Anna" / "Max Mustermann" repeating with no place and no description is almost always a lesson slot.
  if (event.isRecurring && simpleNameTitle && !DISTINCTIVE_EVENT_PATTERN.test(combinedText)
    && !event.location && !(event.description || '').trim()) {
    return true;
  }
  return false;
};

const isCancelledOrDeclined = (event) => `${event?.status || ''}`.toLowerCase() === 'cancelled' || event?.declined === true;

// Decides whether an event may reach the brief. Returns { include, reason } so the debug view can explain it.
//   rules               normalized services.context.rules
//   suppressRecurring   config switch "hide routine recurring events"
//   alwaysKeepPatterns  regexes for recurring items that must always stay (birthdays, garbage pickup, ...)
const classifyBriefEvent = (event, {
  now = Date.now(),
  timeZone = 'UTC',
  rules = normalizeContextRules(),
  suppressRecurring = true,
  alwaysKeepPatterns = [],
} = {}) => {
  const startMs = new Date(event.start).getTime();
  const endMs = new Date(event.end).getTime();
  const combinedText = [event.title || '', event.description || '', event.location || ''].join(' ');

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { include: false, reason: 'invalid_dates' };
  }
  if (endMs < now) {
    return { include: false, reason: 'already_finished' };
  }
  if (isCancelledOrDeclined(event)) {
    return { include: false, reason: 'cancelled_or_declined' };
  }
  if (matchesKeywords(event, rules.neverShow)) {
    return { include: false, reason: 'user_never_show' };
  }
  if (matchesKeywords(event, rules.alwaysShow)) {
    return { include: true, reason: 'user_always_show' };
  }
  if (hasChangeSignal(event)) {
    return { include: true, reason: 'schedule_change' };
  }
  if (hasMedicalSignal(event)) {
    return { include: true, reason: 'medical_appointment' };
  }

  const routine = isLowValueRoutineEvent(event, rules);
  if (!event.isRecurring) {
    return { include: !routine, reason: routine ? 'routine_non_recurring' : 'distinct_or_non_recurring' };
  }
  if (!suppressRecurring) {
    return { include: !routine, reason: routine ? 'routine_recurring' : 'recurring_allowed_by_setting' };
  }
  if (event.isAllDay) {
    return { include: true, reason: 'recurring_all_day' };
  }
  if (alwaysKeepPatterns.some((pattern) => pattern.test(combinedText))) {
    return { include: true, reason: 'recurring_household_reminder' };
  }

  const dayOffset = getEventDayOffset(event, now, timeZone);
  if (dayOffset !== null && dayOffset > RECURRING_HORIZON_DAYS) {
    return { include: false, reason: 'recurring_beyond_horizon' };
  }
  if (DISTINCTIVE_EVENT_PATTERN.test(combinedText) && !routine) {
    return { include: true, reason: 'recurring_distinctive_event' };
  }
  return { include: false, reason: routine ? 'routine_recurring_suppressed' : 'generic_recurring_suppressed' };
};

module.exports = {
  DISTINCTIVE_EVENT_PATTERN,
  RECURRING_HORIZON_DAYS,
  classifyBriefEvent,
  isLowValueRoutineEvent,
};
