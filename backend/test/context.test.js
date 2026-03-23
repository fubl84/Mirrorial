const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBirthdayContext,
  buildContextCandidates,
  buildDailyBrief,
  buildEnrichedBriefInsights,
  estimateRouteFallback,
  filterLlmBriefAgainstInsights,
  findMatchingSavedPlace,
  inferTripAnchorFromEvent,
  validateLlmSelection,
} = require('../index.js');

const isoFromNow = (hoursFromNow) => new Date(Date.now() + (hoursFromNow * 3600000)).toISOString();
const isoDateOffset = (daysFromNow) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString();
};
const localDateOffsetString = (daysFromNow) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

test('buildBirthdayContext prioritizes the nearest upcoming birthday', () => {
  const household = {
    members: [
      {
        id: 'anna',
        name: 'Anna',
        birthdate: localDateOffsetString(1),
        shareInBrief: true,
      },
      {
        id: 'ben',
        name: 'Ben',
        birthdate: localDateOffsetString(5),
        shareInBrief: true,
      },
    ],
  };

  const birthday = buildBirthdayContext(household);

  assert.equal(birthday.memberName, 'Anna');
  assert.equal(birthday.isTomorrow, true);
  assert.equal(birthday.isToday, false);
});

test('estimateRouteFallback returns duration and distance for a local commute', () => {
  const route = estimateRouteFallback(
    { latitude: 53.5511, longitude: 9.9937 },
    { latitude: 53.5586, longitude: 9.9278 },
    'bike',
  );

  assert.equal(route.source, 'estimated');
  assert.equal(route.profile, 'cycling-regular');
  assert.ok(route.distanceKm >= 1);
  assert.ok(route.durationMinutes >= 5);
  assert.match(route.summary, /About \d+ min from home/);
});

test('findMatchingSavedPlace matches calendar text against saved place names and tags', () => {
  const event = {
    title: 'Family trip to Zoo Hagenbeck',
    description: 'Kids outing with animals',
    location: '',
  };
  const household = {
    savedPlaces: [
      {
        id: 'museum',
        name: 'Science Museum',
        category: 'indoor',
        indoor: true,
        tags: ['museum', 'rainy day'],
        location: { latitude: 53.56, longitude: 9.9 },
      },
      {
        id: 'zoo',
        name: 'Zoo Hagenbeck',
        category: 'outdoor',
        indoor: false,
        tags: ['zoo', 'animals', 'family'],
        location: { latitude: 53.5942, longitude: 9.9447 },
      },
    ],
  };

  const place = findMatchingSavedPlace(event, household);

  assert.equal(place.id, 'zoo');
  assert.equal(place.name, 'Zoo Hagenbeck');
});

test('inferTripAnchorFromEvent suppresses home-address-like destinations unless explicitly useful', () => {
  const plainAddressEvent = {
    id: 'evt_plain_address',
    title: 'Privat',
    description: '',
    location: 'Schottmüllerstr. 15, 20251 Hamburg',
    start: isoFromNow(24),
    end: isoFromNow(26),
    isAllDay: false,
  };

  const usefulAddressEvent = {
    ...plainAddressEvent,
    id: 'evt_useful_address',
    title: 'Hospital appointment',
    location: 'UKE, Martinistrasse 52, Hamburg',
  };

  assert.equal(inferTripAnchorFromEvent(plainAddressEvent, { services: { context: { usefulLocationWhitelist: [] } } }, null), null);

  const usefulAnchor = inferTripAnchorFromEvent(usefulAddressEvent, { services: { context: { usefulLocationWhitelist: [] } } }, null);
  assert.ok(usefulAnchor);
  assert.match(usefulAnchor.destination, /Martinistrasse|UKE/i);
});

test('inferTripAnchorFromEvent allows address-like destinations when they match the configured whitelist', () => {
  const event = {
    id: 'evt_whitelist',
    title: 'Messehallen setup',
    description: 'Annual hall access',
    location: 'Karolinenstrasse 8, Hamburg',
    start: isoFromNow(24),
    end: isoFromNow(26),
    isAllDay: false,
  };

  const anchor = inferTripAnchorFromEvent(
    event,
    { services: { context: { usefulLocationWhitelist: ['messehallen'] } } },
    null,
  );

  assert.ok(anchor);
  assert.match(anchor.destination, /Messehallen/i);
});

test('buildContextCandidates ranks active travel above lower-priority household items', () => {
  const activeTrip = {
    destination: 'Athens',
    enrichment: {
      destination: 'Athens, Greece',
      forecast: { label: '18-24C, clear' },
      currentTime: '14:35',
    },
    intent: { label: 'Business trip' },
    phase: { code: 'trip_active', label: 'Trip active' },
    transportLifecycle: { code: 'delayed', label: '45 min delay' },
    transportSummary: 'LH123 • active',
    eventCount: 3,
    start: isoFromNow(-2),
  };

  const birthdayContext = {
    memberName: 'Anna',
    turning: 8,
    isToday: false,
    isTomorrow: true,
    nextOccurrence: isoDateOffset(1),
    daysUntil: 1,
  };

  const householdEventContext = {
    type: 'holiday',
    title: 'Public holiday',
    start: isoFromNow(24),
    advice: 'Check opening hours if errands are planned.',
  };

  const candidates = buildContextCandidates(
    [{ id: 'evt_1', title: 'Public holiday', start: isoFromNow(24), end: isoFromNow(25) }],
    activeTrip,
    null,
    null,
    null,
    birthdayContext,
    null,
    householdEventContext,
  );

  assert.equal(candidates[0].id, 'active_trip');
  assert.match(candidates[0].householdView, /delayed/i);
});

test('buildDailyBrief surfaces the highest ranked context first', () => {
  const events = [
    {
      id: 'commute_evt',
      title: 'School drop-off',
      start: isoFromNow(3),
      end: isoFromNow(4),
      isAllDay: false,
    },
  ];

  const commuteContext = {
    sourceEventId: 'commute_evt',
    memberName: 'Mia',
    eventTitle: 'School drop-off',
    start: isoFromNow(3),
    placeLabel: 'School',
    route: { durationMinutes: 32 },
    forecast: { label: '8-11C, rain' },
    advice: 'Mia may need extra time getting to School. About 32 min expected.',
  };

  const brief = buildDailyBrief(events, null, events[0], null, null, null, commuteContext, null);

  assert.equal(brief.headline, 'Commute context');
  assert.equal(brief.householdView, 'Mia may need extra time getting to School. About 32 min expected.');
  assert.ok(brief.bullets.some((bullet) => /32 min/.test(bullet)));
});

test('validateLlmSelection keeps only known events and valid decisions', () => {
  const events = [
    { id: 'evt_1' },
    { id: 'evt_2' },
  ];

  const parsed = validateLlmSelection({
    items: [
      { eventId: 'evt_1', decision: 'needs_enrichment', enrichmentType: 'ticket_sale', why: 'tickets' },
      { eventId: 'evt_missing', decision: 'needs_enrichment', enrichmentType: 'concert', why: 'invalid' },
      { eventId: 'evt_2', decision: 'nope', enrichmentType: 'concert', why: 'invalid' },
    ],
  }, events);

  assert.deepEqual(parsed, {
    items: [
      { eventId: 'evt_1', decision: 'needs_enrichment', enrichmentType: 'ticket_sale', why: 'tickets' },
    ],
  });
});

test('buildEnrichedBriefInsights prefers non-calendar route and ticket facts', () => {
  const event = {
    id: 'evt_ticket',
    title: 'Don Broco Tickets!!!!',
    description: 'Ticketmaster Germany sale for Hamburg and Berlin',
    location: '',
    start: isoFromNow(48),
    end: isoFromNow(49),
    isAllDay: false,
    calendarSummary: 'Private',
  };

  const enriched = buildEnrichedBriefInsights({
    selections: {
      items: [
        {
          eventId: 'evt_ticket',
          decision: 'needs_enrichment',
          enrichmentType: 'ticket_sale',
          why: 'external_context_needed',
        },
      ],
    },
    sourceEvents: [event],
    activeTrip: null,
    recentTrip: null,
    commuteContext: null,
    householdEventContext: null,
  });

  assert.equal(enriched.insights.length, 1);
  assert.equal(enriched.insights[0].enrichmentType, 'ticket_sale');
  assert.ok(enriched.insights[0].addedFacts.some((fact) => /Ticketmaster/.test(fact)));
  assert.ok(enriched.insights[0].addedFacts.some((fact) => /Hamburg/.test(fact)));
});

test('filterLlmBriefAgainstInsights drops plain calendar restatements', () => {
  const insights = [
    {
      eventId: 'evt_ticket',
      eventTitle: 'Don Broco Tickets!!!!',
      addedFacts: ['Likely ticket source: Ticketmaster.', 'Known city hints: Hamburg, Berlin.'],
    },
  ];

  const filtered = filterLlmBriefAgainstInsights({
    headline: 'Daily brief',
    bullets: [
      'Don Broco Tickets beginnen am Freitag um 11:00 Uhr.',
      'Freitag Don Broco Tickets: Ticketmaster mit Hamburg und Berlin.',
    ],
    householdView: 'Don Broco Tickets beginnen am Freitag um 11:00 Uhr.',
    priority: 'normal',
  }, insights);

  assert.deepEqual(filtered.bullets, ['Freitag Don Broco Tickets: Ticketmaster mit Hamburg und Berlin.']);
  assert.equal(filtered.householdView, '');
});
