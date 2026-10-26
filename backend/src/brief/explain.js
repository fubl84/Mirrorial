const { getEventDayOffset } = require('../time/zone');

// "Why is this (not) in my brief?" One row per upcoming event, with the first rule that decided it.
// Pure: the caller passes in how to judge an event, this only orders, labels and cuts the list.

// Plain-language reasons for the codes of classifyBriefEvent plus the calendar-scope check.
const REASON_TEXT = {
  calendar_not_in_brief: 'Its calendar is not part of the brief (Brief calendars setting).',
  invalid_dates: 'The calendar entry has no usable start or end time.',
  already_finished: 'Already over.',
  cancelled_or_declined: 'Cancelled, or you declined it.',
  user_never_show: 'Hidden by your rule "Never show".',
  user_always_show: 'Shown because of your rule "Always show".',
  schedule_change: 'Shown: it looks like a change to the normal schedule.',
  medical_appointment: 'Shown: it looks like a doctor or therapy appointment.',
  routine_non_recurring: 'Hidden: looks like a routine entry (lesson, shift).',
  distinct_or_non_recurring: 'Shown: a single appointment.',
  routine_recurring: 'Hidden: a repeating routine entry.',
  recurring_allowed_by_setting: 'Shown: repeating events are allowed by your setting.',
  recurring_all_day: 'Shown: repeating all-day entry (birthday, holiday, ...).',
  recurring_household_reminder: 'Shown: repeating household reminder (birthday, garbage, delivery, ...).',
  recurring_beyond_horizon: 'Hidden for now: it repeats and is not due until later; it appears when it gets close.',
  recurring_distinctive_event: 'Shown: repeating, but it looks like a special event.',
  routine_recurring_suppressed: 'Hidden: a repeating routine entry (setting "Hide routine recurring events").',
  generic_recurring_suppressed: 'Hidden: a plain repeating entry (setting "Hide routine recurring events").',
};

const describeReason = (reason) => REASON_TEXT[reason] || reason || '';

// What a pin/mute button adds to the rules: the event title, which is what the rules match against.
const ruleKeywordForEvent = (event) => `${event?.title || ''}`.replace(/\s+/g, ' ').trim().slice(0, 60);

// options.isInScope(event)  -> boolean   the "Brief calendars" setting
// options.classify(event)   -> { include, reason }
// options.horizonDays       days ahead to list (default 3: today, tomorrow and the day after)
const explainEvents = ({
  events,
  now = Date.now(),
  timeZone = 'UTC',
  isInScope = () => true,
  classify,
  horizonDays = 3,
  limit = 60,
}) => {
  const rows = [];
  (Array.isArray(events) ? events : []).forEach((event) => {
    const startMs = Date.parse(event.start);
    const endMs = Date.parse(event.end);
    if (Number.isNaN(startMs) || (!Number.isNaN(endMs) && endMs < now)) {
      return;
    }
    const dayOffset = getEventDayOffset(event, now, timeZone);
    if (dayOffset === null || dayOffset > horizonDays - 1) {
      return;
    }

    let included;
    let reason;
    if (!isInScope(event)) {
      included = false;
      reason = 'calendar_not_in_brief';
    } else {
      const decision = classify(event);
      included = decision.include === true;
      reason = decision.reason;
    }

    rows.push({
      id: event.id,
      title: `${event.title || ''}`,
      start: event.start,
      end: event.end,
      isAllDay: Boolean(event.isAllDay),
      isRecurring: Boolean(event.isRecurring),
      calendar: `${event.calendarSummary || ''}`,
      location: `${event.location || ''}`,
      day: dayOffset <= 0 ? 'today' : (dayOffset === 1 ? 'tomorrow' : 'later'),
      included,
      reason,
      reasonText: describeReason(reason),
      // Muting a calendar-level exclusion with a title rule would not do anything, so no button for it.
      canMute: included && ruleKeywordForEvent(event).length >= 2,
      canPin: !included && reason !== 'calendar_not_in_brief' && reason !== 'already_finished'
        && reason !== 'cancelled_or_declined' && reason !== 'invalid_dates' && ruleKeywordForEvent(event).length >= 2,
      ruleKeyword: ruleKeywordForEvent(event),
    });
  });

  rows.sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
  return rows.slice(0, limit);
};

module.exports = {
  REASON_TEXT,
  describeReason,
  explainEvents,
  ruleKeywordForEvent,
};
