const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyBriefEvent, isLowValueRoutineEvent } = require('../src/brief/selection');
const { selectEventsByHorizon } = require('../src/brief/horizon');
const { normalizeContextRules, hasMedicalSignal } = require('../src/brief/rules');
const { getEventDayOffset, getLocalDateKey } = require('../src/time/zone');

const NOW = Date.parse('2026-04-10T10:00:00Z'); // Friday 12:00 in Berlin
const TZ = 'Europe/Berlin';
const at = (date, time = '10:00') => `${date}T${time}:00+02:00`;
const makeEvent = (overrides = {}) => ({
  id: overrides.title || 'event',
  title: 'Event',
  description: '',
  location: '',
  start: at('2026-04-10', '15:00'),
  end: at('2026-04-10', '16:00'),
  isAllDay: false,
  isRecurring: false,
  calendarSummary: 'Family',
  ...overrides,
});
const classify = (event, options = {}) => classifyBriefEvent(event, { now: NOW, timeZone: TZ, ...options });
const later = { start: at('2026-04-20'), end: at('2026-04-20', '11:00') };

test('user rules: neverShow beats everything, alwaysShow beats routine, routineHints mark routine', () => {
  const rules = normalizeContextRules({
    alwaysShow: ['Lena'],
    neverShow: ['Fußball Training', 'Spam'],
    routineHints: ['jmc'],
  });

  assert.equal(classify(makeEvent({ title: 'Lena', isRecurring: true }), { rules }).reason, 'user_always_show');
  assert.equal(classify(makeEvent({ title: 'Fussball Training' }), { rules }).reason, 'user_never_show', 'diacritics are ignored');
  assert.equal(classify(makeEvent({ title: 'Physio Spam' }), { rules }).reason, 'user_never_show', 'never beats medical');
  assert.equal(isLowValueRoutineEvent(makeEvent({ title: 'JMC 1', isRecurring: true }), rules), true);
  assert.equal(isLowValueRoutineEvent(makeEvent({ title: 'JMC 1', isRecurring: false }), rules), false, 'hints only apply to recurring events');
});

test('personal rules that used to be hard-coded no longer apply by default', () => {
  assert.equal(isLowValueRoutineEvent(makeEvent({ title: 'JMC 1', isRecurring: true, location: 'Yamaha Music School' })), false);
});

test('recurring household reminders keep working through alwaysKeepPatterns', () => {
  const result = classify(makeEvent({ title: 'Restmüll', isRecurring: true, ...later }), { alwaysKeepPatterns: [/\b(restmüll|biomüll)\b/i] });
  assert.equal(result.reason, 'recurring_household_reminder');
});

test('suppressRecurring=false lets non-routine recurring events through', () => {
  assert.equal(classify(makeEvent({ title: 'Choir practice', isRecurring: true, ...later }), { suppressRecurring: false }).include, true);
});

test('a single capitalised word that repeats looks like a lesson slot; alwaysShow is the escape hatch', () => {
  assert.equal(classify(makeEvent({ title: 'Yoga', isRecurring: true, ...later }), { suppressRecurring: false }).include, false);
  const rules = normalizeContextRules({ alwaysShow: ['Yoga'] });
  assert.equal(classify(makeEvent({ title: 'Yoga', isRecurring: true, ...later }), { rules }).include, true);
});

test('normalizeContextRules accepts arrays and newline/comma strings, trims and de-duplicates', () => {
  assert.deepEqual(normalizeContextRules({ alwaysShow: ' Anna \nanna\n,Bob, x' }).alwaysShow, ['Anna', 'Bob']);
  assert.deepEqual(normalizeContextRules(null), { alwaysShow: [], neverShow: [], routineHints: [] });
  assert.equal(normalizeContextRules({ neverShow: 'y'.repeat(61) }).neverShow.length, 0);
});

test('hasMedicalSignal does not fire on unrelated words', () => {
  assert.equal(hasMedicalSignal({ title: 'Therapeutic horse riding' }), true);
  assert.equal(hasMedicalSignal({ title: 'Altersvorsorge Beratung' }), false);
  assert.equal(hasMedicalSignal({ title: 'Marzipan baking' }), false);
});

test('day offsets use the mirror time zone, including all-day events', () => {
  const lateEvening = makeEvent({ start: '2026-04-10T23:30:00Z', end: '2026-04-11T00:30:00Z' }); // already Apr 11 in Berlin
  assert.equal(getEventDayOffset(lateEvening, NOW, TZ), 1);
  assert.equal(getEventDayOffset(lateEvening, NOW, 'UTC'), 0);
  assert.equal(getEventDayOffset(makeEvent({ start: '2026-04-12', isAllDay: true }), NOW, TZ), 2);
  assert.equal(getEventDayOffset(makeEvent({ start: 'garbage' }), NOW, TZ), null);
  assert.equal(getLocalDateKey(NOW, 'Not/AZone'), '2026-04-10', 'invalid zones fall back to UTC');
});

const entry = (title, date, score) => {
  const event = makeEvent({ title, start: at(date, '15:00'), end: at(date, '16:00') });
  return { event, score, startMs: Date.parse(event.start) };
};

test('selectEventsByHorizon keeps today visible when many far-future events score higher', () => {
  const entries = [
    entry('Today A', '2026-04-10', 10),
    entry('Today B', '2026-04-10', 5),
    ...Array.from({ length: 10 }, (_, index) => entry(`Week ${index}`, '2026-04-15', 90 - index)),
    ...Array.from({ length: 6 }, (_, index) => entry(`Later ${index}`, '2026-04-30', 80 - index)),
  ];
  const titles = selectEventsByHorizon(entries, { now: NOW, timeZone: TZ, limit: 8 }).map((event) => event.title);
  assert.ok(titles.includes('Today A') && titles.includes('Today B'), 'today is always represented');
  assert.equal(titles.length, 8);
});

test('selectEventsByHorizon fills spare room with the best leftovers and sorts by start', () => {
  const entries = Array.from({ length: 6 }, (_, index) => entry(`Week ${index}`, `2026-04-${15 + index}`, 50 - index));
  const result = selectEventsByHorizon(entries, { now: NOW, timeZone: TZ, limit: 6 });
  assert.equal(result.length, 6, 'the per-bucket cap is exceeded when nothing else competes');
  const starts = result.map((event) => Date.parse(event.start));
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
});
