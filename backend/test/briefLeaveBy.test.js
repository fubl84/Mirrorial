const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLeaveByStatements, isRealRoute } = require('../src/brief/leaveBy');

const NOW = Date.parse('2026-04-10T07:00:00Z'); // 09:00 Berlin
const clock = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
const at = (time) => Date.parse(`2026-04-10T${time}:00+02:00`);
const build = (overrides = {}) => buildLeaveByStatements({
  route: { durationMinutes: 25, source: 'openrouteservice' },
  startMs: at('11:00'),
  now: NOW,
  formatClock: clock,
  originLabel: 'Home',
  destinationLabel: 'Praxis Weber',
  ...overrides,
});

test('a live route gives the duration and the departure time', () => {
  assert.deepEqual(build(), [
    'Estimated car from Home to Praxis Weber takes about 25 min.',
    'Leave around 10:35 for on-time arrival.',
  ]);
});

test('an arrival buffer moves the departure earlier and is named', () => {
  const statements = build({ arrivalBufferMinutes: 10 });
  assert.equal(statements[1], 'Leave around 10:25 to arrive about 10 min early.');
});

test('a straight-line estimate never becomes a departure time', () => {
  const statements = build({ route: { durationMinutes: 25, source: 'estimated' } });
  assert.equal(statements.length, 1);
  assert.match(statements[0], /Rough estimate/);
  assert.match(statements[0], /no live route/);
  assert.doesNotMatch(statements.join(' '), /Leave/i);
  assert.equal(isRealRoute({ source: 'estimated' }), false);
  assert.equal(isRealRoute({ source: 'google_routes' }), true);
});

test('a departure time that has passed becomes "leave now", while the appointment is still ahead', () => {
  const statements = build({ startMs: at('09:20') }); // leave-by would have been 08:55
  assert.equal(statements[1], 'Leave now: the planned departure time (08:55) has already passed.');
  assert.doesNotMatch(statements[1], /Leave around/);
});

test('once the appointment has started nothing is said about leaving', () => {
  const statements = build({ startMs: at('08:30') });
  assert.deepEqual(statements, ['Estimated car from Home to Praxis Weber takes about 25 min.']);
});

test('the wording has no countdown, so the text does not change from minute to minute', () => {
  const early = build({ now: NOW });
  const later = build({ now: NOW + (37 * 60000) });
  assert.deepEqual(early, later, 'same statements 37 minutes later (still before the departure time)');
  const passed = build({ startMs: at('09:20'), now: NOW });
  const passedLater = build({ startMs: at('09:20'), now: NOW + (10 * 60000) });
  assert.deepEqual(passed, passedLater);
});

test('missing or broken input yields nothing instead of a wrong statement', () => {
  assert.deepEqual(build({ route: null }), []);
  assert.deepEqual(build({ route: { durationMinutes: 'abc', source: 'google_routes' } }), []);
  assert.deepEqual(build({ startMs: NaN }), []);
});

test('a duration below one minute is shown as one minute, not zero', () => {
  assert.equal(build({ route: { durationMinutes: 0.2, source: 'google_routes' } })[0], 'Estimated car from Home to Praxis Weber takes about 1 min.');
});
