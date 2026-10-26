const { extractClockTimes } = require('./clock');
const { normalizeText } = require('./rules');

// Turns the model's answer into bullets that are safe to show. The model is not trusted: every bullet must
// cite facts from the dossier, may not contain links, and may not mention a clock time, a duration or a
// temperature that the cited facts / events do not contain.

const MAX_BULLETS = 4;
const MAX_BULLET_LENGTH = 130;
const URGENCIES = new Set(['high', 'normal', 'low']);
const URL_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|de|io|app|co|info|ly)\b)/i;

const numbersIn = (text, pattern) => Array.from(`${text || ''}`.matchAll(pattern)).map((match) => Number(match[1].replace(',', '.')));

const MINUTES_PATTERN = /(?<![\d:.])(\d{1,3})\s*(?:min(?:ute[n]?)?|minutes?)\b/gi;
const HOURS_PATTERN = /(?<![\d:.])(\d{1,2}(?:[.,]\d)?)\s*(?:h|std|stunden?|hours?|hrs?)\b/gi;
// Temperatures: "19°", "19 °C", "19C", "19 Grad", "19 degrees". A minus only counts as a sign when it does not
// follow a digit, otherwise the dash of a range ("5-19°") would be read as "-19".
const DEGREE_UNIT = '(?:°\\s*C?|grad\\b|degrees?\\b|C\\b)';
const DEGREES_SINGLE = new RegExp(`(?<!\\d)(-?\\d{1,2})\\s*${DEGREE_UNIT}`, 'gi');
const DEGREES_RANGE = new RegExp(`(?<![\\d-])(-?\\d{1,2})\\s*(?:[-–]|bis|to)\\s*(-?\\d{1,2})\\s*${DEGREE_UNIT}`, 'gi');

// Both ends of a range are checked, not just the one next to the unit.
const degreesIn = (text) => {
  const values = [];
  Array.from(`${text || ''}`.matchAll(DEGREES_RANGE)).forEach((match) => values.push(Number(match[1]), Number(match[2])));
  Array.from(`${text || ''}`.matchAll(DEGREES_SINGLE)).forEach((match) => values.push(Number(match[1])));
  return values;
};

// Everything the cited material allows a bullet to say.
const collectAllowed = (cited) => {
  const text = cited.map((entry) => entry.text).join(' \n ');
  const clocks = new Set(extractClockTimes(text));
  const minutes = new Set(numbersIn(text, MINUTES_PATTERN));
  const hours = new Set(numbersIn(text, HOURS_PATTERN));
  const degrees = new Set(degreesIn(text));
  // Numbers written plainly in a fact ("24 appointments", "about 25 min") may be repeated in other units' words.
  const plain = new Set(Array.from(text.matchAll(/(?<![\d:.])(\d{1,3})(?![\d:])/g)).map((match) => Number(match[1])));
  return { clocks, minutes, hours, degrees, plain };
};

const isSubset = (values, allowed, fallback = null) => values.every((value) => allowed.has(value) || (fallback && fallback.has(value)));

const checkBulletClaims = (bulletText, cited) => {
  const allowed = collectAllowed(cited);
  const clocks = extractClockTimes(bulletText);
  if (!clocks.every((clock) => allowed.clocks.has(clock))) {
    return 'unsupported_time';
  }
  if (!isSubset(numbersIn(bulletText, MINUTES_PATTERN), allowed.minutes, allowed.plain)) {
    return 'unsupported_duration';
  }
  if (!isSubset(numbersIn(bulletText, HOURS_PATTERN), allowed.hours, allowed.plain)) {
    return 'unsupported_duration';
  }
  if (!isSubset(degreesIn(bulletText), allowed.degrees, allowed.plain)) {
    return 'unsupported_temperature';
  }
  return null;
};

// A bullet that only repeats an event's title and time says nothing the calendar does not already show.
const restatesCalendarEntry = (bulletText, citedEvents) => {
  const bullet = normalizeText(bulletText).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return citedEvents.some((event) => {
    const title = normalizeText(event.title).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!title) {
      return false;
    }
    const rest = bullet.replace(title, '').replace(/\b(heute|morgen|today|tomorrow|um|at|am|on|uhr|ist|is|um)\b/g, ' ')
      .replace(/[0-9 ]/g, '').trim();
    return bullet.includes(title) && rest.length < 8;
  });
};

// Returns { bullets: [{ text, facts, events, urgency }], rejected: [{ text, reason }] }.
const validateComposerOutput = (payload, dossier) => {
  const rejected = [];
  const accepted = [];
  const factByRef = new Map(dossier.facts.map((fact) => [fact.ref, fact]));
  const eventByRef = new Map(dossier.events.map((event) => [event.ref, event]));

  const rawBullets = Array.isArray(payload?.bullets) ? payload.bullets : [];
  const seen = new Set();

  rawBullets.forEach((raw) => {
    const text = `${typeof raw === 'string' ? raw : (raw?.text ?? '')}`.replace(/\s+/g, ' ').trim();
    const reject = (reason) => rejected.push({ text, reason });

    if (!text) {
      return reject('empty');
    }
    if (text.length > MAX_BULLET_LENGTH) {
      return reject('too_long');
    }
    if (URL_PATTERN.test(text)) {
      return reject('contains_link');
    }

    const factRefs = Array.isArray(raw?.facts) ? raw.facts.map((ref) => `${ref}`.trim()) : [];
    const cited = factRefs.map((ref) => factByRef.get(ref)).filter(Boolean);
    if (cited.length === 0) {
      return reject('no_valid_fact_cited');
    }

    const citedEvents = Array.from(new Set(cited.map((fact) => fact.eventRef).filter(Boolean)))
      .map((ref) => eventByRef.get(ref)).filter(Boolean);
    const claimProblem = checkBulletClaims(text, [...cited, ...citedEvents.map((event) => ({ text: `${event.when}` }))]);
    if (claimProblem) {
      return reject(claimProblem);
    }
    if (restatesCalendarEntry(text, citedEvents)) {
      return reject('restates_calendar');
    }

    const key = normalizeText(text).replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) {
      return reject('duplicate');
    }
    seen.add(key);

    accepted.push({
      text,
      facts: cited.map((fact) => fact.ref),
      events: citedEvents.map((event) => event.ref),
      urgency: URGENCIES.has(raw?.urgency) ? raw.urgency : 'normal',
    });
    return null;
  });

  const rank = { high: 0, normal: 1, low: 2 };
  accepted.sort((left, right) => rank[left.urgency] - rank[right.urgency]);
  if (accepted.length > MAX_BULLETS) {
    accepted.slice(MAX_BULLETS).forEach((bullet) => rejected.push({ text: bullet.text, reason: 'over_limit' }));
  }

  return { bullets: accepted.slice(0, MAX_BULLETS), rejected };
};

module.exports = {
  MAX_BULLETS,
  MAX_BULLET_LENGTH,
  checkBulletClaims,
  validateComposerOutput,
};
