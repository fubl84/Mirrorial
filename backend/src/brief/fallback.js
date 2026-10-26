// Deterministic bullets for the things that must never be missing from the mirror, whatever the model did.
// They are rendered from the facts' raw `params`, in the display language, without any model involvement.

const MUST_MENTION = new Set(['conflict', 'schedule_change', 'tight_transition', 'missing_location']);

const quote = (title) => `„${title}“`;

const TEMPLATES = {
  de: {
    conflict: (fact, event) => `${quote(event.title)} überschneidet sich mit ${quote(fact.params.otherTitle)} (${fact.params.otherRange}).`,
    schedule_change: (fact, event) => `Änderung im Plan: ${quote(event.title)} (${event.when}).`,
    tight_transition: (fact, event) => `Nur ${fact.params.gapMinutes} Min. zwischen ${quote(fact.params.otherTitle)} und ${quote(event.title)}, an verschiedenen Orten.`,
    missing_location: (fact, event) => `Für ${quote(event.title)} fehlt im Kalender der Ort.`,
  },
  en: {
    conflict: (fact, event) => `${quote(event.title)} overlaps with ${quote(fact.params.otherTitle)} (${fact.params.otherRange}).`,
    schedule_change: (fact, event) => `Schedule change: ${quote(event.title)} (${event.when}).`,
    tight_transition: (fact, event) => `Only ${fact.params.gapMinutes} min between ${quote(fact.params.otherTitle)} and ${quote(event.title)}, different places.`,
    missing_location: (fact, event) => `The calendar has no location for ${quote(event.title)}.`,
  },
};

const URGENCY = { conflict: 'high', schedule_change: 'high', tight_transition: 'normal', missing_location: 'normal' };

// Returns one bullet per must-mention fact that no accepted bullet cites. Pairs of conflicting events are
// reported once (the fact is generated for both events; the first one is enough).
const buildMissingBullets = ({ dossier, bullets, locale = dossier.locale }) => {
  const templates = TEMPLATES[locale === 'de' ? 'de' : 'en'];
  const cited = new Set(bullets.flatMap((bullet) => bullet.facts));
  const eventByRef = new Map(dossier.events.map((event) => [event.ref, event]));
  const result = [];
  // A collision exists as two mirrored facts (one per event). It is reported once, and not at all when a
  // bullet already cites either side of it.
  const handledCollisions = new Set();
  const collisionKey = (fact) => [fact.eventId, fact.params?.otherEventId].sort().join('|');
  dossier.facts.forEach((fact) => {
    if (fact.kind === 'conflict' && cited.has(fact.ref)) {
      handledCollisions.add(collisionKey(fact));
    }
  });

  dossier.facts.forEach((fact) => {
    if (!MUST_MENTION.has(fact.kind) || cited.has(fact.ref)) {
      return;
    }
    const event = fact.eventRef ? eventByRef.get(fact.eventRef) : null;
    if (!event) {
      return;
    }
    if (fact.kind === 'conflict') {
      const key = collisionKey(fact);
      if (handledCollisions.has(key)) {
        return;
      }
      handledCollisions.add(key);
    }
    result.push({
      text: templates[fact.kind](fact, event),
      facts: [fact.ref],
      events: [event.ref],
      urgency: URGENCY[fact.kind],
      generated: true,
    });
  });

  return result;
};

module.exports = {
  MUST_MENTION,
  buildMissingBullets,
};
