const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyBriefEvent, isLowValueRoutineEvent } = require('../src/brief/selection');
const { normalizeContextRules, hasChangeSignal, hasMedicalSignal } = require('../src/brief/rules');

// Friday 2026-04-10 12:00 in Berlin (10:00 UTC). Titles below come from a real daily-brief-debug.json.
const NOW = Date.parse('2026-04-10T10:00:00Z');
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
const nextWeek = { start: at('2026-04-14'), end: at('2026-04-14', '11:00') };
const classify = (event, options = {}) => classifyBriefEvent(event, { now: NOW, timeZone: TZ, ...options });

test('doctor and therapy appointments are kept even when they repeat', () => {
  ['Physio', 'Staedtisches KH Chirurg. Ambulanz', 'Zahnarzt Müller', 'Dr. Ärztin Schmidt', 'MRT Kopf'].forEach((title) => {
    const result = classify(makeEvent({ title, isRecurring: true, ...nextWeek }));
    assert.equal(result.include, true, `${title} should be kept (${result.reason})`);
    assert.equal(result.reason, 'medical_appointment');
  });
});

test('substitute, cancelled and moved items are always kept, even in a routine calendar', () => {
  const result = classify(makeEvent({
    title: 'Kompo-Kurs Ersatz',
    isRecurring: true,
    calendarSummary: 'Musikschule',
    start: at('2026-04-20'),
    end: at('2026-04-20', '11:00'),
  }));
  assert.equal(result.include, true);
  assert.equal(result.reason, 'schedule_change');
  assert.equal(hasChangeSignal({ title: 'Unterricht entfällt' }), true);
  assert.equal(hasChangeSignal({ title: 'Termin verschoben auf Montag' }), true);
  assert.equal(hasChangeSignal({ title: 'Lesson moved to 5pm' }), true);
  assert.equal(hasChangeSignal({ title: 'Wochenende' }), false);
});

test('recurring person-named lesson slots are suppressed', () => {
  ['Lena', 'Mia Becker', 'Paul Wagner'].forEach((title) => {
    const result = classify(makeEvent({ title, isRecurring: true }));
    assert.equal(result.include, false, `${title} (${result.reason})`);
  });
});

test('a person-named recurring event with a place or description is not treated as routine', () => {
  assert.equal(isLowValueRoutineEvent(makeEvent({ title: 'Jonas Roth', isRecurring: true, location: 'Café Central' })), false);
  assert.equal(isLowValueRoutineEvent(makeEvent({ title: 'Jonas Roth', isRecurring: true, description: 'Bring the contract' })), false);
});

test('"Start Arbeiten" style shift markers stay routine', () => {
  assert.equal(classify(makeEvent({ title: 'Start Arbeiten', isRecurring: true })).include, false);
});

test('recurring meetings are only mentioned today or tomorrow, not 6 days ahead', () => {
  const soon = classify(makeEvent({ title: 'Weekly Alignment Meeting OL', isRecurring: true, start: at('2026-04-11'), end: at('2026-04-11', '11:00') }));
  assert.equal(soon.include, true);
  const far = classify(makeEvent({ title: 'Weekly Alignment Meeting OL', isRecurring: true, start: at('2026-04-16'), end: at('2026-04-16', '11:00') }));
  assert.equal(far.include, false);
  assert.equal(far.reason, 'recurring_beyond_horizon');
});

test('non-recurring events are kept regardless of distance', () => {
  assert.equal(classify(makeEvent({ title: 'Mucki in Ahlen', start: '2026-04-20', end: '2026-04-23', isAllDay: true })).include, true);
});

test('declined, cancelled and finished events are dropped', () => {
  assert.equal(classify(makeEvent({ title: 'Dinner', declined: true })).reason, 'cancelled_or_declined');
  assert.equal(classify(makeEvent({ title: 'Dinner', status: 'cancelled' })).reason, 'cancelled_or_declined');
  const finished = classify(makeEvent({ title: 'Breakfast', start: at('2026-04-10', '08:00'), end: at('2026-04-10', '09:00') }));
  assert.equal(finished.reason, 'already_finished');
});
