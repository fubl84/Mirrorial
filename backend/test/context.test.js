const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBirthdayContext,
  buildCalendarCacheFingerprint,
  buildContextCandidates,
  buildDailyBrief,
  buildEnrichedBriefInsights,
  estimateRouteFallback,
  filterEventsForDailyBrief,
  filterLlmBriefAgainstInsights,
  findMatchingSavedPlace,
  inferTripAnchorFromEvent,
  buildBriefItemsFromBrief,
  llmBriefHasMeaningfulContent,
  normalizeConfig,
  selectActiveTrip,
  selectContextBrief,
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

test('filterEventsForDailyBrief can exclude synced calendars from brief generation', () => {
  const events = [
    { id: 'work_1', calendarId: 'work', title: 'Business trip Athens' },
    { id: 'f1_1', calendarId: 'f1', title: 'F1 Japan GP' },
  ];

  const filtered = filterEventsForDailyBrief(events, {
    services: {
      context: {
        briefCalendarMode: 'exclude_selected',
        briefExcludedCalendarIds: ['f1'],
      },
    },
  });

  assert.deepEqual(filtered.map((event) => event.id), ['work_1']);
});

test('buildCalendarCacheFingerprint changes when calendar events change', () => {
  const baseCache = {
    selectedCalendarIds: ['work'],
    events: [
      { id: 'evt_1', title: 'Trip', start: isoDateOffset(2), end: isoDateOffset(5), isAllDay: true, isRecurring: false, location: '', calendarId: 'work', calendarSummary: 'Work' },
    ],
  };

  const changedCache = {
    ...baseCache,
    events: [],
  };

  assert.notEqual(buildCalendarCacheFingerprint(baseCache), buildCalendarCacheFingerprint(changedCache));
});

test('normalizeConfig preserves module settings after a layout module is removed', () => {
  const normalized = normalizeConfig({
    moduleSettings: {
      home_assistant: {
        enabled: true,
        url: 'http://ha.local:8123',
        token: 'secret-token',
        entityCards: [
          { entityId: 'light.kitchen', icon: 'lightbulb', displayType: 'small' },
        ],
      },
    },
    gridLayout: {
      modules: [],
    },
  });

  assert.equal(normalized.moduleSettings.home_assistant.url, 'http://ha.local:8123');
  assert.equal(normalized.moduleSettings.home_assistant.token, 'secret-token');
  assert.deepEqual(normalized.moduleSettings.home_assistant.entities, ['light.kitchen']);
  assert.equal(normalized.gridLayout.modules.length, 0);
});

test('normalizeConfig migrates legacy layout-only module config into moduleSettings', () => {
  const normalized = normalizeConfig({
    gridLayout: {
      modules: [
        {
          id: 'ha_1',
          type: 'home_assistant',
          x: 0,
          y: 0,
          w: 2,
          h: 2,
          config: {
            enabled: true,
            url: 'http://ha.local:8123',
            token: 'legacy-token',
            entityCards: [
              { entityId: 'sensor.temperature', icon: 'thermometer', displayType: 'medium' },
            ],
          },
        },
      ],
    },
  });

  assert.equal(normalized.moduleSettings.home_assistant.url, 'http://ha.local:8123');
  assert.equal(normalized.moduleSettings.home_assistant.token, 'legacy-token');
  assert.equal(normalized.gridLayout.modules[0].config.url, 'http://ha.local:8123');
  assert.equal(normalized.gridLayout.modules[0].config.token, 'legacy-token');
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

test('inferTripAnchorFromEvent extracts German travel destinations from event titles', () => {
  const event = {
    id: 'evt_trip_title',
    title: 'Mucki Dienstreise Athen',
    description: '',
    location: '',
    start: isoDateOffset(2),
    end: isoDateOffset(5),
    isAllDay: true,
    calendarSummary: 'Schule',
  };

  const anchor = inferTripAnchorFromEvent(event, { services: { context: {} } }, null);

  assert.ok(anchor);
  assert.equal(anchor.destination, 'Athen');
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

  const brief = buildDailyBrief(events, null, events[0], null, null, null, null, commuteContext, null);

  assert.equal(brief.headline, 'Commute context');
  assert.equal(brief.householdView, 'Mia may need extra time getting to School. About 32 min expected.');
  assert.ok(brief.bullets.some((bullet) => /32 min/.test(bullet)));
  assert.equal(brief.items[0].headline, 'Commute context');
  assert.equal(brief.items[0].householdView, 'Mia may need extra time getting to School. About 32 min expected.');
});

test('buildDailyBrief keeps unrelated situations in separate brief cards', () => {
  const events = [
    {
      id: 'commute_evt',
      title: 'School drop-off',
      start: isoFromNow(3),
      end: isoFromNow(4),
      isAllDay: false,
    },
  ];

  const birthdayContext = {
    memberName: 'Margret',
    turning: 70,
    isToday: false,
    isTomorrow: false,
    nextOccurrence: isoDateOffset(6),
    daysUntil: 6,
  };

  const commuteContext = {
    sourceEventId: 'commute_evt',
    memberName: 'Mia',
    eventTitle: 'School drop-off',
    start: isoFromNow(3),
    placeLabel: 'School',
    route: { durationMinutes: 32 },
    forecast: { label: '8-11C, rain', weatherCode: 61 },
    advice: 'Mia may need extra time getting to School. About 32 min expected.',
  };

  const brief = buildDailyBrief(events, null, events[0], null, null, null, birthdayContext, commuteContext, null, {});

  assert.equal(brief.items.length, 2);
  assert.equal(brief.items[0].headline, 'Commute context');
  assert.equal(brief.items[1].headline, 'Birthday reminder');
  assert.ok(brief.bullets.every((bullet) => !/Margret/.test(bullet)));
});

test('buildDailyBrief can surface a travel heads-up before trip enrichment is available', () => {
  const events = [
    {
      id: 'trip_evt',
      title: 'Mucki Dienstreise Athen',
      start: isoDateOffset(2),
      end: isoDateOffset(5),
      isAllDay: true,
    },
  ];

  const travelHeadsUpContext = {
    title: 'Mucki Dienstreise Athen',
    destination: 'Athen',
    start: isoDateOffset(2),
    end: isoDateOffset(5),
    isAllDay: true,
    sourceEventId: 'trip_evt',
    travelerLabel: 'Mucki',
  };

  const brief = buildDailyBrief(events, null, null, null, travelHeadsUpContext, null, null, null, null, {});

  assert.equal(brief.items[0].headline, 'Travel update');
  assert.match(brief.items[0].householdView, /Mucki leaves for Athen|Mucki leaves for/i);
});

test('llmBriefHasMeaningfulContent rejects empty LLM briefs', () => {
  assert.equal(llmBriefHasMeaningfulContent({
    headline: 'Daily brief',
    bullets: [],
    householdView: '',
  }), false);

  assert.equal(llmBriefHasMeaningfulContent({
    headline: 'Daily brief',
    bullets: ['Athen bleibt waehrend der Reise meist sonnig.'],
    householdView: '',
  }), true);
});

test('selectContextBrief falls back to deterministic content when LLM brief is empty', () => {
  const deterministicBrief = {
    headline: 'Travel update',
    bullets: ['Mucki leaves for Athens soon.'],
    householdView: 'Mucki leaves for Athens on Tue.',
    items: [
      {
        id: 'active_trip',
        headline: 'Travel update',
        householdView: 'Mucki leaves for Athens on Tue.',
        bullets: ['Mucki leaves for Athens soon.'],
      },
    ],
  };

  const brief = selectContextBrief(deterministicBrief, {
    status: 'ready',
    brief: {
      headline: 'Daily brief',
      bullets: [],
      householdView: '',
    },
  });

  assert.equal(brief.source, 'deterministic');
  assert.equal(brief.householdView, deterministicBrief.householdView);
  assert.deepEqual(brief.bullets, deterministicBrief.bullets);
  assert.equal(brief.items[0].id, 'active_trip');
});

test('selectContextBrief uses LLM-backed items when the LLM brief is meaningful', () => {
  const deterministicBrief = {
    headline: 'Travel update',
    bullets: ['Christoph leaves for Athens soon.'],
    householdView: 'Christoph leaves for Athens on Tue.',
    items: [
      {
        id: 'active_trip',
        headline: 'Travel update',
        householdView: 'Christoph leaves for Athens on Tue.',
        bullets: ['Christoph leaves for Athens soon.'],
      },
    ],
  };

  const llmBrief = {
    headline: 'Dienstreise nach Athen steht an',
    bullets: ['Wetter in Athen: 7-18°C, teils bewölkt.'],
    householdView: 'Die Reise nach Athen bringt mildes, teils bewölktes Wetter mit sich.',
  };

  const brief = selectContextBrief(deterministicBrief, {
    status: 'ready',
    brief: llmBrief,
  });

  assert.equal(brief.source, 'llm');
  assert.equal(brief.items.length, 1);
  assert.equal(brief.items[0].id, 'llm_brief');
  assert.equal(brief.items[0].headline, llmBrief.headline);
  assert.equal(brief.items[0].householdView, llmBrief.householdView);
});

test('buildBriefItemsFromBrief creates a single card from the top-level brief', () => {
  const items = buildBriefItemsFromBrief({
    headline: 'Dienstreise nach Athen steht an',
    bullets: ['Wetter in Athen: 7-18°C, teils bewölkt.'],
    householdView: 'Die Reise nach Athen bringt mildes, teils bewölktes Wetter mit sich.',
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'llm_brief');
  assert.equal(items[0].headline, 'Dienstreise nach Athen steht an');
});

test('buildContextCandidates highlights an upcoming return leg during an active trip', () => {
  const activeTrip = {
    destination: 'Athens',
    travelerLabel: 'Mucki',
    enrichment: {
      destination: 'Athens, Greece',
      forecast: { label: '18-24C, clear', narrative: 'Looks consistent through the trip: around 22C and mostly clear.' },
      currentTime: '11:02',
      currentWeather: { temp: 24, label: 'clear' },
    },
    intent: { label: 'Business trip' },
    phase: { code: 'trip_active', label: 'Trip active' },
    transportLifecycle: { code: 'scheduled', label: 'On time, lands 20:25' },
    transportSummary: 'LH123 HAM -> ATH',
    homeboundSegment: {
      start: isoFromNow(20),
      summary: 'LH456 ATH -> HAM',
      lifecycle: { code: 'scheduled', label: 'On time, lands 20:25' },
    },
    eventCount: 3,
    start: isoFromNow(-48),
  };

  const candidates = buildContextCandidates([], activeTrip, null, null, null, null, null, null, null);

  assert.equal(candidates[0].id, 'active_trip');
  assert.match(candidates[0].householdView, /returns from Athens/i);
  assert.ok(candidates[0].bullets.some((bullet) => /20:25/.test(bullet)));
});

test('selectActiveTrip surfaces an upcoming trip within three days', () => {
  const trips = [
    {
      id: 'athens',
      destination: 'Athens',
      start: isoFromNow(60),
      end: isoFromNow(132),
    },
  ];

  const activeTrip = selectActiveTrip(trips);

  assert.ok(activeTrip);
  assert.equal(activeTrip.destination, 'Athens');
});

test('buildContextCandidates does not show destination live conditions before departure', () => {
  const activeTrip = {
    destination: 'Athens',
    travelerLabel: 'Christoph',
    enrichment: {
      destination: 'Athens, Greece',
      forecast: { label: '7-18C, partly cloudy', narrative: 'Mixed weather through the trip, around 13C with rain likely on multiple days.' },
      currentTime: '17:06',
      currentWeather: { temp: 15, label: 'partly cloudy' },
    },
    intent: { code: 'business_trip', label: 'Business trip' },
    phase: { code: 'upcoming_trip', label: 'Upcoming trip' },
    transportLifecycle: null,
    start: isoFromNow(48),
  };

  const candidates = buildContextCandidates([], activeTrip, null, null, null, null, null, null, null);

  assert.equal(candidates[0].id, 'active_trip');
  assert.ok(candidates[0].bullets.some((bullet) => /Mixed weather/.test(bullet)));
  assert.ok(candidates[0].bullets.every((bullet) => !/Athens, Greece now|Local time/.test(bullet)));
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

test('buildEnrichedBriefInsights omits frozen local time from travel facts', () => {
  const event = {
    id: 'evt_trip',
    title: 'Mucki Dienstreise Athen',
    description: '',
    location: '',
    start: isoDateOffset(2),
    end: isoDateOffset(5),
    isAllDay: true,
    calendarSummary: 'Schule',
  };

  const activeTrip = {
    destination: 'Athens',
    sourceEventIds: ['evt_trip'],
    enrichment: {
      destination: 'Athens, Greece',
      forecast: { label: '7-18C, partly cloudy' },
      currentTime: '23:20',
    },
    transportSummary: 'LH123 HAM -> ATH',
    transportLifecycle: { label: 'On time' },
  };

  const enriched = buildEnrichedBriefInsights({
    selections: {
      items: [
        {
          eventId: 'evt_trip',
          decision: 'needs_enrichment',
          enrichmentType: 'travel',
          why: 'travel_context_needed',
        },
      ],
    },
    sourceEvents: [event],
    activeTrip,
    recentTrip: null,
    commuteContext: null,
    householdEventContext: null,
  });

  assert.equal(enriched.insights.length, 1);
  assert.ok(enriched.insights[0].addedFacts.some((fact) => /weather/.test(fact)));
  assert.ok(enriched.insights[0].addedFacts.every((fact) => !/Local time/.test(fact)));
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
