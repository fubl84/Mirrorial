const test = require('node:test');
const assert = require('node:assert/strict');

const { applyRuleAction, matchesKeywords, normalizeContextRules } = require('../src/brief/rules');
const { classifyBriefEvent } = require('../src/brief/selection');
const { ruleKeywordForEvent } = require('../src/brief/explain');

const NOW = Date.parse('2026-04-10T07:00:00Z'); // Fri 09:00 Berlin
const TZ = 'Europe/Berlin';
const at = (date, time) => `${date}T${time}:00+02:00`;
const makeEvent = (overrides = {}) => ({
  id: overrides.title || 'e', title: 'Event', description: '', location: '', isAllDay: false, isRecurring: false,
  calendarSummary: 'Family', start: at('2026-04-10', '15:00'), end: at('2026-04-10', '16:00'), ...overrides,
});

test('mute puts the title into "never show" and the event disappears from the brief', () => {
  const event = makeEvent({ title: 'Fußball Training' });
  const { rules, removed } = applyRuleAction({}, 'mute', ruleKeywordForEvent(event), event);
  assert.deepEqual(rules.neverShow, ['Fußball Training']);
  assert.deepEqual(removed, []);
  assert.equal(classifyBriefEvent(event, { now: NOW, timeZone: TZ, rules }).reason, 'user_never_show');
});

test('pin puts the title into "always show" and a hidden routine event appears', () => {
  const event = makeEvent({ title: 'JMC 1', isRecurring: true });
  const base = normalizeContextRules({ routineHints: ['jmc'] });
  const before = classifyBriefEvent(event, { now: NOW, timeZone: TZ, rules: base });
  assert.equal(before.include, false);
  const { rules } = applyRuleAction(base, 'pin', 'JMC 1', event);
  assert.equal(classifyBriefEvent(event, { now: NOW, timeZone: TZ, rules }).reason, 'user_always_show');
  assert.deepEqual(rules.routineHints, ['jmc'], 'the other rules stay as they were');
});

test('pinning an event that a "never show" word hides removes that word, otherwise the pin would do nothing', () => {
  const event = makeEvent({ title: 'Physio Spam' });
  const start = normalizeContextRules({ neverShow: ['Spam', 'Newsletter'] });
  const { rules, removed } = applyRuleAction(start, 'pin', 'Physio Spam', event);
  assert.deepEqual(removed, ['Spam']);
  assert.deepEqual(rules.neverShow, ['Newsletter']);
  assert.equal(classifyBriefEvent(event, { now: NOW, timeZone: TZ, rules }).reason, 'user_always_show');
});

test('mute after pin and pin after mute switch sides instead of keeping both', () => {
  const event = makeEvent({ title: 'Choir' });
  const pinned = applyRuleAction({}, 'pin', 'Choir', event).rules;
  assert.deepEqual(pinned.alwaysShow, ['Choir']);
  const muted = applyRuleAction(pinned, 'mute', 'Choir', event).rules;
  assert.deepEqual(muted.alwaysShow, []);
  assert.deepEqual(muted.neverShow, ['Choir']);
  const back = applyRuleAction(muted, 'pin', 'choir', event).rules;
  assert.deepEqual(back.neverShow, []);
  assert.deepEqual(back.alwaysShow, ['choir']);
});

test('clear removes the keyword from both lists, ignoring case and umlauts', () => {
  const start = normalizeContextRules({ alwaysShow: ['Zahnärztin'], neverShow: ['Spam'] });
  const { rules } = applyRuleAction(start, 'clear', 'zahnarztin');
  assert.deepEqual(rules, { alwaysShow: [], neverShow: ['Spam'], routineHints: [] });
});

test('doing the same thing twice does not duplicate the word', () => {
  const event = makeEvent({ title: 'Yoga' });
  const once = applyRuleAction({}, 'mute', 'Yoga', event).rules;
  const twice = applyRuleAction(once, 'mute', 'Yoga', event).rules;
  assert.deepEqual(twice.neverShow, ['Yoga']);
});

test('the input rules are not modified', () => {
  const start = normalizeContextRules({ neverShow: ['A1'] });
  const frozen = JSON.parse(JSON.stringify(start));
  applyRuleAction(start, 'mute', 'B2', makeEvent({ title: 'B2' }));
  assert.deepEqual(start, frozen);
});

test('unusable input is refused: unknown action, too short, too long, empty', () => {
  assert.throws(() => applyRuleAction({}, 'delete', 'Yoga'), /action/i);
  assert.throws(() => applyRuleAction({}, 'mute', 'a'), /2 to 60/);
  assert.throws(() => applyRuleAction({}, 'mute', 'x'.repeat(61)), /2 to 60/);
  assert.throws(() => applyRuleAction({}, 'mute', '   '), /2 to 60/);
  assert.throws(() => applyRuleAction({}, 'mute', undefined), /2 to 60/);
});

test('a muted word is matched the same way the selection matches it', () => {
  const { rules } = applyRuleAction({}, 'mute', 'Fußball Training');
  assert.ok(matchesKeywords(makeEvent({ title: 'Fussball training' }), rules.neverShow));
});
