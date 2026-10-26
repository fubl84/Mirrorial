const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAgendaScope, getConflictPredicate } = require('../src/brief/people');
const { findOverlaps, findTightTransitions } = require('../src/brief/schedule');
const { buildDossier } = require('../src/brief/dossier');

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-04-10T07:00:00Z');
const at = (time) => `2026-04-10T${time}:00+02:00`;
const makeEvent = (id, calendarId, startTime, endTime, extra = {}) => ({
  id, calendarId, title: `Event ${id}`, start: at(startTime), end: at(endTime), isAllDay: false, location: '', ...extra,
});

const household = {
  members: [
    { id: 'anna', calendarIds: ['cal-anna'] },
    { id: 'ben', calendarIds: ['cal-ben'] },
    { id: 'both', calendarIds: ['cal-anna', 'cal-shared-adults'] },
  ],
};

test('without any calendar assignment everything may conflict (no information, no guessing)', () => {
  assert.equal(buildAgendaScope(null), null);
  assert.equal(buildAgendaScope({ members: [] }), null);
  assert.equal(buildAgendaScope({ members: [{ id: 'x', calendarIds: [] }] }), null);
  assert.equal(getConflictPredicate(null)(makeEvent('a', 'c1', '10:00', '11:00'), makeEvent('b', 'c2', '10:30', '11:30')), true);
});

test('two events in the same calendar always compete', () => {
  const conflict = getConflictPredicate(household);
  assert.equal(conflict(makeEvent('a', 'cal-anna', '10:00', '11:00'), makeEvent('b', 'cal-anna', '10:30', '11:30')), true);
  assert.equal(conflict(makeEvent('a', 'unowned', '10:00', '11:00'), makeEvent('b', 'unowned', '10:30', '11:30')), true);
});

test('calendars of different members do not compete', () => {
  const conflict = getConflictPredicate(household);
  assert.equal(conflict(makeEvent('a', 'cal-anna', '10:00', '11:00'), makeEvent('b', 'cal-ben', '10:30', '11:30')), false);
});

test('a calendar that nobody owns could involve anyone, so it competes with everything', () => {
  const conflict = getConflictPredicate(household);
  assert.equal(conflict(makeEvent('a', 'cal-family', '10:00', '11:00'), makeEvent('b', 'cal-ben', '10:30', '11:30')), true);
  assert.equal(conflict(makeEvent('a', 'cal-anna', '10:00', '11:00'), makeEvent('b', 'cal-family', '10:30', '11:30')), true);
});

test('a person who follows several calendars competes across them', () => {
  const conflict = getConflictPredicate(household);
  assert.equal(conflict(makeEvent('a', 'cal-shared-adults', '10:00', '11:00'), makeEvent('b', 'cal-anna', '10:30', '11:30')), true);
  assert.equal(conflict(makeEvent('a', 'cal-shared-adults', '10:00', '11:00'), makeEvent('b', 'cal-ben', '10:30', '11:30')), false);
});

test('findOverlaps keeps only pairs of one agenda', () => {
  const events = [
    makeEvent('a', 'cal-anna', '10:00', '11:00'),
    makeEvent('b', 'cal-ben', '10:15', '11:15'),
    makeEvent('c', 'cal-anna', '10:30', '11:30'),
  ];
  const all = findOverlaps(events).map(([x, y]) => `${x.id}${y.id}`);
  const same = findOverlaps(events, { couldConflict: getConflictPredicate(household) }).map(([x, y]) => `${x.id}${y.id}`);
  assert.deepEqual(all, ['ab', 'ac', 'bc']);
  assert.deepEqual(same, ['ac'], 'only Anna against Anna');
});

test('a tight transition looks at the next event of the same agenda, not just the next in time', () => {
  const events = [
    makeEvent('a1', 'cal-anna', '10:00', '11:00', { location: 'Clinic' }),
    makeEvent('b1', 'cal-ben', '11:05', '11:08', { location: 'School' }),
    makeEvent('a2', 'cal-anna', '11:12', '12:00', { location: 'Office' }),
  ];
  const options = { timeZone: TZ };
  const naive = findTightTransitions(events, options).map((entry) => `${entry.first.id}>${entry.second.id}`);
  assert.deepEqual(naive, ['a1>b1', 'b1>a2'], 'by time alone, the cross-person pairs look like moves');
  const scoped = findTightTransitions(events, { ...options, couldConflict: getConflictPredicate(household) });
  assert.deepEqual(scoped.map((entry) => `${entry.first.id}>${entry.second.id}`), ['a1>a2'], 'Anna moves from the clinic to the office');
  assert.equal(scoped[0].gapMinutes, 12);
});

test('a gap that is only short because of another person\'s event is not a tight move for either', () => {
  const events = [
    makeEvent('a1', 'cal-anna', '10:00', '11:00', { location: 'Clinic' }),
    makeEvent('b1', 'cal-ben', '11:05', '11:30', { location: 'School' }),
  ];
  assert.equal(findTightTransitions(events, { timeZone: TZ, couldConflict: getConflictPredicate(household) }).length, 0);
});

test('the dossier reports a collision between two members only when they share an agenda', () => {
  const events = [
    makeEvent('a', 'cal-anna', '11:00', '12:00', { location: 'Praxis' }),
    makeEvent('b', 'cal-ben', '11:30', '13:00', { location: 'Schule' }),
  ];
  const kinds = (couldConflict) => buildDossier({ events, now: NOW, timeZone: TZ, couldConflict }).facts.map((fact) => fact.kind);
  assert.ok(kinds(undefined).includes('conflict'), 'before: every overlap was a conflict');
  assert.ok(!kinds(getConflictPredicate(household)).includes('conflict'), 'now: different people, no conflict');
});
