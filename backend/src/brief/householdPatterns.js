// Words that mark household events (birthdays, school, deliveries, ...). Shared by the calendar parser
// (a repeating series that looks like a birthday is kept even when it started long ago) and by the brief.

const HOUSEHOLD_EVENT_PATTERNS = {
  birthday: /\b(birthday|geburtstag|bday)\b/i,
  anniversary: /\b(anniversary|jahrestag)\b/i,
  holiday: /\b(public holiday|bank holiday|holiday|feiertag|schulfrei|no school)\b/i,
  school_event: /\b(school|kindergarten|kita|daycare|elternabend|parents evening|sports day|class trip|field trip|excursion|wandertag)\b/i,
  delivery: /\b(delivery|package|parcel|lieferung|zustellung|pickup|abholung|amazon|dhl|ups|dpd|hermes|gls)\b/i,
  garbage_pickup: /\b(garbage|trash|recycling|waste|bin collection|müllabfuhr|restmüll|biomüll|papiermüll|gelbe tonne|gelber sack)\b/i,
  overnight_guest: /\b(sleepover|stay over|staying over|overnight guest|overnight stay|übernachtung)\b/i,
  outdoor_plan: /\b(bbq|barbecue|grill|garden party|gartenparty|picnic|beach|zoo|park|hike|hiking|boat trip|outdoor)\b/i,
};

// A repeating series that matches one of these is never treated as stale routine.
const RECURRING_ALWAYS_KEEP_PATTERNS = [
  HOUSEHOLD_EVENT_PATTERNS.birthday,
  HOUSEHOLD_EVENT_PATTERNS.anniversary,
  HOUSEHOLD_EVENT_PATTERNS.holiday,
  HOUSEHOLD_EVENT_PATTERNS.garbage_pickup,
  HOUSEHOLD_EVENT_PATTERNS.delivery,
];

module.exports = {
  HOUSEHOLD_EVENT_PATTERNS,
  RECURRING_ALWAYS_KEEP_PATTERNS,
};
