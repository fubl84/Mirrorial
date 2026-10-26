const test = require('node:test');
const assert = require('node:assert/strict');

const { fingerprintDossier } = require('../src/brief/freshness');
const { buildDossier } = require('../src/brief/dossier');

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-04-10T07:00:00Z'); // Fri 09:00 Berlin
const at = (time, date = '2026-04-10') => `${date}T${time}:00+02:00`;
const makeEvent = (id, title, startTime, endTime, extra = {}) => ({
  id, title, start: at(startTime, extra.date), end: at(endTime, extra.date), isAllDay: false, location: '', description: '', ...extra,
});
const collision = () => [
  makeEvent('a', 'Zahnarzt', '11:00', '12:00', { location: 'Praxis' }),
  makeEvent('b', 'Elternabend', '11:30', '13:00', { location: 'Schule' }),
];
const dossierAt = (now, events = collision(), options = {}) => buildDossier({ events, now, timeZone: TZ, locale: 'de', ...options });
const fp = (dossier, extra = {}) => fingerprintDossier(dossier, { provider: 'anthropic', model: 'm', privacyMode: 'cloud-redacted', ...extra });

test('minutes ticking by do not change the fingerprint', () => {
  assert.equal(fp(dossierAt(NOW)), fp(dossierAt(NOW + (37 * 60000))), '"starts in N minutes" must not cost a new model call');
});

test('events the model never sees do not change the fingerprint; ids do not matter', () => {
  const base = fp(dossierAt(NOW));
  const withHiddenFarEvent = [...collision(), makeEvent('z', 'Next month', '10:00', '11:00', { date: '2026-05-20' })];
  assert.equal(fp(dossierAt(NOW, withHiddenFarEvent)), base);
  const renamedIds = collision().map((event) => ({ ...event, id: `other-${event.id}` }));
  assert.equal(fp(dossierAt(NOW, renamedIds)), base);
});

test('anything the model is told does change the fingerprint', () => {
  const base = fp(dossierAt(NOW));
  const moved = collision();
  moved[1] = makeEvent('b', 'Elternabend', '12:30', '14:00', { location: 'Schule' }); // no longer overlaps
  assert.notEqual(fp(dossierAt(NOW, moved)), base, 'time of an event');
  const retitled = collision();
  retitled[0] = { ...retitled[0], title: 'Zahnarzt Dr. Weber' };
  assert.notEqual(fp(dossierAt(NOW, retitled)), base, 'title');
  assert.notEqual(fp(dossierAt(NOW, collision(), { locale: 'en' })), base, 'language');
  assert.notEqual(fp(dossierAt(NOW, collision(), { extraFacts: [{ eventId: 'a', kind: 'weather', text: 'Rain.' }] })), base, 'extra fact');
  assert.notEqual(fp(dossierAt(NOW), { model: 'other' }), base, 'model');
  assert.notEqual(fp(dossierAt(NOW), { provider: 'openai' }), base, 'provider');
  assert.notEqual(fp(dossierAt(NOW), { privacyMode: 'full' }), base, 'privacy mode');
  assert.notEqual(fp(dossierAt(NOW), { prompt: 'v2' }), base, 'prompt version');
});

test('the focus switch at 18:00 changes the fingerprint', () => {
  const evening = Date.parse('2026-04-10T16:30:00Z'); // 18:30 Berlin
  assert.notEqual(fp(dossierAt(NOW)), fp(dossierAt(evening)));
});

test('an empty dossier does not throw', () => {
  assert.equal(fingerprintDossier(null), '');
  assert.equal(typeof fp(dossierAt(NOW, [])), 'string');
});
