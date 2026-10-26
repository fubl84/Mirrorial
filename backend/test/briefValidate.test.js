const test = require('node:test');
const assert = require('node:assert/strict');

const { validateComposerOutput, checkBulletClaims } = require('../src/brief/validate');

// A small hand-made dossier: refs, facts and events as the composer would see them.
const dossier = {
  events: [
    { ref: 'e1', title: 'Zahnarzt Dr. Weber', when: '11:00-12:00' },
    { ref: 'e2', title: 'Elternabend', when: '11:30-13:00' },
    { ref: 'e3', title: 'Mucki in Ahlen', when: 'all day, 3 days from 2026-04-14' },
  ],
  facts: [
    { ref: 'f1', kind: 'conflict', eventRef: 'e1', text: 'Overlaps with "Elternabend" (11:30-13:00).' },
    { ref: 'f2', kind: 'route', eventRef: 'e1', text: 'Estimated car from Home to Praxis takes about 25 min. Leave around 10:30 for on-time arrival.' },
    { ref: 'f3', kind: 'weather', eventRef: 'e3', text: 'Mucki in Ahlen: forecast 5-19C, rain.' },
    { ref: 'f4', kind: 'busy_day', eventRef: 'e1', text: 'Busy today: 6 appointments, the last one ends at 19:30.' },
  ],
};
const run = (bullets) => validateComposerOutput({ bullets }, dossier);
const reasons = (result) => result.rejected.map((entry) => entry.reason);

test('a bullet that cites a real fact and only uses its numbers is accepted', () => {
  const result = run([{ text: 'Zahnarzt und Elternabend überschneiden sich (11:30-13:00).', facts: ['f1'], urgency: 'high' }]);
  assert.equal(result.bullets.length, 1);
  assert.deepEqual(result.bullets[0].facts, ['f1']);
  assert.deepEqual(result.bullets[0].events, ['e1']);
  assert.equal(result.rejected.length, 0);
});

test('German bullets are not penalised for using other words than the English facts', () => {
  const result = run([{ text: 'Losfahren gegen 10:30 Uhr, die Fahrt dauert etwa 25 Minuten.', facts: ['f2'] }]);
  assert.equal(result.bullets.length, 1, reasons(result).join());
});

test('a time that is not in the cited material is rejected', () => {
  assert.deepEqual(reasons(run([{ text: 'Losfahren um 10:15 Uhr.', facts: ['f2'] }])), ['unsupported_time']);
  assert.deepEqual(reasons(run([{ text: 'Termin um 2 pm.', facts: ['f1'] }])), ['unsupported_time']);
});

test('a duration or temperature that was not given is rejected', () => {
  assert.deepEqual(reasons(run([{ text: 'Die Fahrt dauert 40 Minuten.', facts: ['f2'] }])), ['unsupported_duration']);
  assert.deepEqual(reasons(run([{ text: 'Es werden 30° erwartet.', facts: ['f3'] }])), ['unsupported_temperature']);
  assert.equal(run([{ text: 'Mucki in Ahlen: 5-19° und Regen, Regenjacke einpacken.', facts: ['f3'] }]).bullets.length, 1);
});

test('temperature ranges are checked at both ends and a dash is not read as a minus', () => {
  assert.equal(run([{ text: 'In Ahlen 5-19 °C, nimm eine Jacke mit.', facts: ['f3'] }]).bullets.length, 1);
  assert.equal(run([{ text: 'In Ahlen 5 bis 19 Grad, nimm eine Jacke mit.', facts: ['f3'] }]).bullets.length, 1);
  assert.deepEqual(reasons(run([{ text: 'In Ahlen 2 bis 19 Grad, nimm eine Jacke mit.', facts: ['f3'] }])), ['unsupported_temperature'], 'the low end of a "bis" range is checked too');
  assert.deepEqual(reasons(run([{ text: 'In Ahlen 2-19°, nimm eine Jacke mit.', facts: ['f3'] }])), ['unsupported_temperature'], 'the low end is wrong');
  assert.deepEqual(reasons(run([{ text: 'In Ahlen 5-25°, nimm eine Jacke mit.', facts: ['f3'] }])), ['unsupported_temperature'], 'the high end is wrong');
});

test('only facts that exist count; invented refs and missing citations are rejected', () => {
  assert.deepEqual(reasons(run([{ text: 'Etwas Erfundenes.', facts: ['f99'] }])), ['no_valid_fact_cited']);
  assert.deepEqual(reasons(run([{ text: 'Ohne Beleg.' }])), ['no_valid_fact_cited']);
  assert.deepEqual(reasons(run([{ text: 'Mit Beleg und Müll.', facts: ['f99', 'f3'] }])).length, 0);
});

test('links, empty and over-long bullets are rejected', () => {
  assert.deepEqual(reasons(run([{ text: 'Mehr unter https://evil.example.com', facts: ['f1'] }])), ['contains_link']);
  assert.deepEqual(reasons(run([{ text: 'Siehe www.example.org', facts: ['f1'] }])), ['contains_link']);
  assert.deepEqual(reasons(run([{ text: 'Termin bei evil.com ansehen', facts: ['f1'] }])), ['contains_link']);
  assert.deepEqual(reasons(run([{ text: '   ', facts: ['f1'] }])), ['empty']);
  assert.deepEqual(reasons(run([{ text: 'x'.repeat(131), facts: ['f1'] }])), ['too_long']);
});

test('a bullet that only repeats the calendar entry is rejected', () => {
  assert.deepEqual(reasons(run([{ text: 'Heute um 11:00 Zahnarzt Dr. Weber', facts: ['f2'] }])), ['restates_calendar']);
});

test('duplicates are dropped and bullets are ordered by urgency and capped at four', () => {
  const result = run([
    { text: 'Regenjacke einpacken für Mucki.', facts: ['f3'], urgency: 'low' },
    { text: 'Regenjacke einpacken für Mucki!', facts: ['f3'], urgency: 'low' },
    { text: 'Zahnarzt und Elternabend überschneiden sich.', facts: ['f1'], urgency: 'high' },
    { text: 'Heute ein voller Tag mit 6 Terminen.', facts: ['f4'], urgency: 'normal' },
    { text: 'Losfahren gegen 10:30 Uhr.', facts: ['f2'] },
    { text: 'Noch ein Hinweis zur Fahrt, 25 Minuten.', facts: ['f2'] },
    { text: 'Und noch einer zum Wetter.', facts: ['f3'] },
  ]);
  assert.equal(result.bullets.length, 4);
  assert.equal(result.bullets[0].urgency, 'high');
  assert.ok(reasons(result).includes('duplicate'));
  assert.ok(reasons(result).includes('over_limit'));
});

test('garbage payloads never throw', () => {
  [null, undefined, {}, { bullets: 'x' }, { bullets: [null, 5, {}] }].forEach((payload) => {
    const result = validateComposerOutput(payload, dossier);
    assert.equal(result.bullets.length, 0);
  });
  assert.equal(validateComposerOutput({ bullets: ['plain string without facts'] }, dossier).rejected[0].reason, 'no_valid_fact_cited');
});

test('checkBulletClaims allows plain numbers that appear in the cited facts', () => {
  const cited = [{ text: 'Busy today: 6 appointments, the last one ends at 19:30.' }];
  assert.equal(checkBulletClaims('Sechs Termine, der letzte endet um 19:30.', cited), null);
  assert.equal(checkBulletClaims('Der letzte endet um 20:30.', cited), 'unsupported_time');
});
