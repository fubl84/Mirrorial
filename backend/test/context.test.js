const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBirthdayContext,
  buildCalendarCacheFingerprint,
  buildContextCandidates,
  buildDailyBrief,
  buildEnrichedBriefInsights,
  buildGoogleCalendarErrorSource,
  buildHeuristicLlmSelection,
  buildGoogleTokenStatus,
  derivePrimaryActionFromInsights,
  estimateRouteFallback,
  filterEventsForDailyBrief,
  filterLlmBriefAgainstInsights,
  findMatchingEventHintRule,
  findMatchingSavedPlace,
  inferTripAnchorFromEvent,
  buildBriefItemsFromBrief,
  llmBriefHasMeaningfulContent,
  normalizeConfig,
  resolveContextRefreshMinutes,
  selectActiveTrip,
  selectContextBrief,
  validateConfigForSave,
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
        nickname: 'Anni',
        birthdate: localDateOffsetString(1),
        shareInBrief: true,
        allowAgeReveal: true,
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

  assert.equal(birthday.memberName, 'Anni');
  assert.equal(birthday.isTomorrow, true);
  assert.equal(birthday.isToday, false);
  assert.equal(birthday.allowAgeReveal, true);
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

test('buildGoogleTokenStatus marks time-limited refresh tokens as reconnect required after expiry', () => {
  const connectedAt = '2026-03-30T21:31:44.409Z';
  const status = buildGoogleTokenStatus({
    connectedAt,
    tokens: {
      refresh_token: 'redacted',
      access_token: 'redacted',
      refresh_token_expires_in: 604799,
      expiry_date: Date.parse('2026-03-30T22:31:42.713Z'),
    },
  }, Date.parse('2026-04-14T00:00:00.000Z'));

  assert.equal(status.refreshTokenExpiresAt, '2026-04-06T21:31:43.409Z');
  assert.equal(status.refreshTokenExpired, true);
  assert.equal(status.needsReconnect, true);
  assert.equal(status.statusReason, 'refresh_token_expired');
});

test('buildGoogleTokenStatus keeps production refresh tokens connected when no expiry metadata exists', () => {
  const status = buildGoogleTokenStatus({
    connectedAt: '2026-03-30T21:31:44.409Z',
    tokens: {
      refresh_token: 'redacted',
      access_token: 'redacted',
      expiry_date: Date.parse('2026-03-30T22:31:42.713Z'),
    },
  }, Date.parse('2026-04-14T00:00:00.000Z'));

  assert.equal(status.refreshTokenExpiresAt, null);
  assert.equal(status.refreshTokenExpired, false);
  assert.equal(status.needsReconnect, false);
  assert.equal(status.statusReason, 'ready');
});

test('buildGoogleCalendarErrorSource marks invalid grants as reconnect required', () => {
  const source = buildGoogleCalendarErrorSource({
    response: {
      data: {
        error: 'invalid_grant',
      },
    },
  });

  assert.equal(source.id, 'google');
  assert.equal(source.status, 'error');
  assert.equal(source.reconnectRequired, true);
  assert.match(source.error, /Reconnect Google Calendar/);
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

test('normalizeConfig preserves separate portrait and landscape layouts', () => {
  const normalized = normalizeConfig({
    gridLayouts: {
      portrait: {
        template: 'portrait_focus',
        columns: 4,
        rows: 8,
        gap: 16,
        modules: [{ id: 'clock_portrait', type: 'clock', x: 0, y: 0, w: 2, h: 2 }],
      },
      landscape: {
        template: 'landscape_dashboard',
        columns: 6,
        rows: 4,
        gap: 16,
        modules: [{ id: 'clock_landscape', type: 'clock', x: 0, y: 0, w: 2, h: 2 }],
      },
    },
  });

  assert.equal(normalized.gridLayouts.portrait.modules[0].id, 'clock_portrait');
  assert.equal(normalized.gridLayouts.landscape.modules[0].id, 'clock_landscape');
  assert.equal(normalized.gridLayout.modules[0].id, 'clock_portrait');
});

test('normalizeConfig keeps shared travel time module settings and applies them to layout modules', () => {
  const normalized = normalizeConfig({
    moduleSettings: {
      travel_time: {
        items: [
          {
            id: 'route_1',
            label: 'Office',
            originType: 'custom',
            originAddress: 'Schottmuellerstrasse 15, Hamburg, Germany',
            destinationType: 'custom',
            destinationAddress: 'Siemensstrasse 22, Rellingen, Germany',
            mode: 'car',
          },
        ],
      },
    },
    gridLayout: {
      modules: [
        {
          id: 'travel_1',
          type: 'travel_time',
          x: 0,
          y: 0,
          w: 2,
          h: 2,
          config: {},
        },
      ],
    },
  });

  assert.equal(normalized.moduleSettings.travel_time.items.length, 1);
  assert.equal(normalized.gridLayout.modules[0].config.items.length, 1);
  assert.equal(normalized.gridLayout.modules[0].config.items[0].label, 'Office');
});

test('normalizeConfig preserves structured event hint fields and migrates legacy additional info', () => {
  const normalized = normalizeConfig({
    services: {
      context: {
        eventHintRules: [
          {
            id: 'hint_1',
            keywords: ['Israelitisches'],
            category: 'medical',
            additionalInfo: 'Bring insurance card.',
            weatherRule: 'warn_rain',
            alternativeTransportOptions: [
              {
                id: 'alt_1',
                label: 'MOIA',
                showPolicy: 'always',
                reminderText: 'Denk daran, das MOIA vorzubestellen!',
              },
            ],
          },
        ],
      },
    },
  });

  const [rule] = normalized.services.context.eventHintRules;
  assert.equal(rule.prepNotes, 'Bring insurance card.');
  assert.equal(rule.weatherRule, 'warn_rain');
  assert.equal(rule.alternativeTransportOptions[0].label, 'MOIA');
  assert.equal(rule.alternativeTransportOptions[0].reminderText, 'Denk daran, das MOIA vorzubestellen!');
});

test('normalizeConfig merges travel settings into legacy transport and routing compatibility blocks', () => {
  const normalized = normalizeConfig({
    services: {
      travel: {
        enabled: true,
        transportProvider: 'aviationstack',
        routingProvider: 'openrouteservice',
        routingBaseUrl: 'https://api.openrouteservice.org',
        routingProfile: 'cycling-regular',
        homeAirport: 'HAM',
        closestTrainStation: 'Hamburg Hbf',
        closestBusStation: 'Mundsburger Bruecke',
        closestTubeStation: 'Kellinghusenstrasse',
        refreshMinutes: 45,
      },
    },
  });

  assert.equal(normalized.services.travel.transportProvider, 'aviationstack');
  assert.equal(normalized.services.transport.provider, 'aviationstack');
  assert.equal(normalized.services.routing.provider, 'openrouteservice');
  assert.equal(normalized.services.routing.baseUrl, 'https://api.openrouteservice.org');
  assert.equal(normalized.services.routing.profile, 'cycling-regular');
  assert.equal(normalized.services.transport.homeAirport, 'HAM');
  assert.equal(normalized.services.transport.homeStation, 'Hamburg Hbf');
  assert.equal(normalized.services.travel.closestBusStation, 'Mundsburger Bruecke');
  assert.equal(normalized.services.travel.closestTubeStation, 'Kellinghusenstrasse');
  assert.equal(normalized.services.routing.refreshMinutes, 45);
});

test('normalizeConfig allows travel routing base URL to be cleared without restoring legacy routing baseUrl', () => {
  const normalized = normalizeConfig({
    services: {
      routing: {
        baseUrl: 'bernd@test.com',
      },
      travel: {
        routingProvider: 'openrouteservice',
        routingBaseUrl: '',
      },
    },
  });

  assert.equal(normalized.services.travel.routingBaseUrl, '');
  assert.equal(normalized.services.routing.baseUrl, '');
});

test('normalizeConfig migrates legacy context refresh hours into shared refresh minutes', () => {
  const normalized = normalizeConfig({
    services: {
      context: {
        refreshHours: 2,
      },
      llm: {
        refreshHours: 6,
      },
    },
  });

  assert.equal(normalized.services.context.refreshMinutes, 120);
  assert.equal('refreshHours' in normalized.services.context, false);
  assert.equal('refreshHours' in normalized.services.llm, false);
});

test('resolveContextRefreshMinutes prefers explicit minutes and falls back to hours', () => {
  assert.equal(resolveContextRefreshMinutes({ refreshMinutes: 45, refreshHours: 2 }), 45);
  assert.equal(resolveContextRefreshMinutes({ refreshHours: 2 }), 120);
  assert.equal(resolveContextRefreshMinutes({}), 180);
});

test('validateConfigForSave rejects an invalid LLM base URL', () => {
  assert.throws(
    () => validateConfigForSave(normalizeConfig({
      services: {
        llm: {
          baseUrl: 'bernd@test.com',
        },
      },
    })),
    /LLM Base URL must be a full http:\/\/ or https:\/\/ URL, or empty\./,
  );
});

test('validateConfigForSave allows empty and valid service base URLs', () => {
  const normalized = validateConfigForSave(normalizeConfig({
    services: {
      llm: {
        baseUrl: 'http://127.0.0.1:11434/v1',
      },
      travel: {
        routingBaseUrl: '',
      },
    },
  }));

  assert.equal(normalized.services.llm.baseUrl, 'http://127.0.0.1:11434/v1');
  assert.equal(normalized.services.travel.routingBaseUrl, '');
});

test('normalizeConfig migrates legacy google_routes provider into the new travel google flags', () => {
  const normalized = normalizeConfig({
    services: {
      routing: {
        provider: 'google_routes',
      },
    },
  });

  assert.equal(normalized.services.travel.routingProvider, 'none');
  assert.equal(normalized.services.travel.googleRoutesEnabled, true);
  assert.equal(normalized.services.travel.googleRoutesForAllModes, true);
  assert.equal(normalized.services.routing.provider, 'none');
  assert.equal(normalized.services.routing.googleRoutesEnabled, true);
});

test('inferTripAnchorFromEvent suppresses home-address-like destinations unless explicitly useful', () => {
  const plainAddressEvent = {
    id: 'evt_plain_address',
    title: 'Privat',
    description: '',
    location: 'Beispielstr. 15, 12345 Musterstadt',
    start: isoFromNow(24),
    end: isoFromNow(26),
    isAllDay: false,
  };

  const usefulAddressEvent = {
    ...plainAddressEvent,
    id: 'evt_useful_address',
    title: 'Hospital appointment',
    location: 'City Hospital, Klinikstrasse 52, Musterstadt',
  };

  assert.equal(inferTripAnchorFromEvent(plainAddressEvent, { services: { context: { usefulLocationWhitelist: [] } } }, null), null);

  const usefulAnchor = inferTripAnchorFromEvent(usefulAddressEvent, { services: { context: { usefulLocationWhitelist: [] } } }, null);
  assert.ok(usefulAnchor);
  assert.match(usefulAnchor.destination, /Klinikstrasse|City Hospital/i);
});

test('inferTripAnchorFromEvent allows address-like destinations when they match the configured whitelist', () => {
  const event = {
    id: 'evt_whitelist',
    title: 'Messehallen setup',
    description: 'Annual hall access',
    location: 'Beispielallee 8, Musterstadt',
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
    title: 'Alex Dienstreise Athen',
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
      title: 'Alex Dienstreise Athen',
      start: isoDateOffset(2),
      end: isoDateOffset(5),
      isAllDay: true,
    },
  ];

  const travelHeadsUpContext = {
    title: 'Alex Dienstreise Athen',
    destination: 'Athen',
    start: isoDateOffset(2),
    end: isoDateOffset(5),
    isAllDay: true,
    sourceEventId: 'trip_evt',
    travelerLabel: 'Alex',
  };

  const brief = buildDailyBrief(events, null, null, null, travelHeadsUpContext, null, null, null, null, {});

  assert.equal(brief.items[0].headline, 'Travel update');
  assert.match(brief.items[0].householdView, /Alex leaves for Athen|Alex leaves for/i);
});

test('buildHeuristicLlmSelection upgrades prep-heavy events with missing details to enrichment candidates', () => {
  const sourceEvents = [
    {
      id: 'alignment',
      title: 'Weekly Alignment Meeting OL',
      start: isoFromNow(50),
      end: isoFromNow(50.5),
      isAllDay: false,
      isRecurring: true,
      calendarId: 'school',
      calendarSummary: 'Schule',
      description: '',
      location: '',
    },
    {
      id: 'kickoff',
      title: 'Meeting Prep Kick-Off',
      start: isoFromNow(54),
      end: isoFromNow(55),
      isAllDay: false,
      isRecurring: false,
      calendarId: 'school',
      calendarSummary: 'Schule',
      description: '',
      location: '',
    },
  ];

  const selection = buildHeuristicLlmSelection(sourceEvents);
  const kickoff = selection.items.find((item) => item.eventId === 'kickoff');

  assert.equal(kickoff?.decision, 'needs_enrichment');
  assert.equal(kickoff?.enrichmentType, 'household_prep');
});

test('findMatchingEventHintRule matches event titles case-insensitively', () => {
  const match = findMatchingEventHintRule({
    id: 'infusion_evt',
    title: 'INFUSION treatment',
  }, {
    services: {
      context: {
        eventHintRules: [
          {
            id: 'infusion_rule',
            keywords: ['infusion'],
            category: 'medical',
            personLabel: 'Alex',
          },
        ],
      },
    },
  });

  assert.equal(match?.id, 'infusion_rule');
  assert.equal(match?.matchedKeyword, 'infusion');
  assert.equal(match?.category, 'medical');
  assert.equal(match?.enrichmentType, 'household_prep');
});

test('buildHeuristicLlmSelection upgrades matched event hint rules to enrichment candidates', () => {
  const selection = buildHeuristicLlmSelection([
    {
      id: 'infusion_evt',
      title: 'Infusion',
      start: isoFromNow(4),
      end: isoFromNow(5),
      isAllDay: false,
      isRecurring: false,
      calendarId: 'family',
      calendarSummary: 'Family',
      description: '',
      location: '',
    },
  ], {
    services: {
      context: {
        eventHintRules: [
          {
            id: 'infusion_rule',
            keywords: ['Infusion'],
            category: 'medical',
            locationLabel: 'City Medical Center',
          },
        ],
      },
    },
  });

  assert.equal(selection.items[0]?.decision, 'needs_enrichment');
  assert.equal(selection.items[0]?.enrichmentType, 'household_prep');
  assert.match(selection.items[0]?.why || '', /matched_event_hint_rule/i);
});

test('buildEnrichedBriefInsights derives added facts for prep events with weak calendar metadata', () => {
  const sourceEvents = [
    {
      id: 'alignment',
      title: 'Weekly Alignment Meeting OL',
      start: '2026-04-02T10:30:00+02:00',
      end: '2026-04-02T11:00:00+02:00',
      isAllDay: false,
      isRecurring: true,
      calendarId: 'school',
      calendarSummary: 'Schule',
      description: '',
      location: '',
    },
    {
      id: 'onboarding',
      title: 'Vendor Onboarding OL',
      start: '2026-04-02T11:15:00+02:00',
      end: '2026-04-02T12:00:00+02:00',
      isAllDay: false,
      isRecurring: false,
      calendarId: 'school',
      calendarSummary: 'Schule',
      description: '',
      location: '',
    },
    {
      id: 'kickoff',
      title: 'Meeting Prep Kick-Off',
      start: '2026-04-02T15:00:00+02:00',
      end: '2026-04-02T16:00:00+02:00',
      isAllDay: false,
      isRecurring: false,
      calendarId: 'school',
      calendarSummary: 'Schule',
      description: '',
      location: '',
    },
  ];

  const { insights } = buildEnrichedBriefInsights({
    selections: {
      items: [
        {
          eventId: 'kickoff',
          decision: 'needs_enrichment',
          enrichmentType: 'household_prep',
          why: 'prep_risk',
        },
      ],
    },
    sourceEvents,
    activeTrip: null,
    recentTrip: null,
    commuteContext: null,
    householdEventContext: null,
  });

  assert.equal(insights.length, 1);
  assert.ok(insights[0].addedFacts.some((fact) => /no location, notes, or link/i.test(fact)));
  assert.ok(insights[0].addedFacts.some((fact) => /3 calendar items on that day/i.test(fact)));
});

test('buildEnrichedBriefInsights includes user-provided event hint facts for sparse events', () => {
  const sourceEvents = [
    {
      id: 'infusion_evt',
      title: 'Infusion',
      start: '2026-03-31T15:00:00+02:00',
      end: '2026-03-31T16:00:00+02:00',
      isAllDay: false,
      isRecurring: false,
      calendarId: 'family',
      calendarSummary: 'Family',
      description: '',
      location: '',
    },
  ];

  const { insights } = buildEnrichedBriefInsights({
    selections: {
      items: [
        {
          eventId: 'infusion_evt',
          decision: 'needs_enrichment',
          enrichmentType: 'household_prep',
          why: 'matched_event_hint_rule:infusion',
        },
      ],
    },
    sourceEvents,
    activeTrip: null,
    recentTrip: null,
    commuteContext: null,
    householdEventContext: null,
    config: {
      services: {
        context: {
          eventHintRules: [
            {
              id: 'infusion_rule',
              keywords: ['Infusion'],
              category: 'medical',
              personLabel: 'Alex',
              locationLabel: 'City Medical Center',
              locationAddress: 'Example Street 1, Sampletown',
              arriveEarlyMinutes: 15,
              additionalInfo: 'Regular infusion treatment.',
            },
          ],
        },
      },
    },
  });

  assert.equal(insights.length, 1);
  assert.ok(insights[0].addedFacts.some((fact) => /Alex is the main person/i.test(fact)));
  assert.ok(insights[0].addedFacts.some((fact) => /Known destination: City Medical Center/i.test(fact)));
  assert.ok(insights[0].addedFacts.some((fact) => /arrive about 15 min early/i.test(fact)));
  assert.ok(insights[0].addedFacts.some((fact) => /Regular infusion treatment/i.test(fact)));
});

test('buildEnrichedBriefInsights keeps operational hint checks out of far-future event facts', () => {
  const sourceEvents = [
    {
      id: 'clinic_evt',
      title: 'Clinic appointment',
      start: isoFromNow(48),
      end: isoFromNow(49),
      isAllDay: false,
      isRecurring: false,
      calendarId: 'family',
      calendarSummary: 'Family',
      description: '',
      location: '',
    },
  ];

  const { insights } = buildEnrichedBriefInsights({
    selections: {
      items: [
        {
          eventId: 'clinic_evt',
          decision: 'needs_enrichment',
          enrichmentType: 'household_prep',
          why: 'matched_event_hint_rule:clinic',
        },
      ],
    },
    sourceEvents,
    activeTrip: null,
    recentTrip: null,
    commuteContext: null,
    householdEventContext: null,
    config: {
      services: {
        context: {
          eventHintRules: [
            {
              id: 'clinic_rule',
              keywords: ['clinic'],
              category: 'medical',
              locationLabel: 'Israelitisches Krankenhaus',
              locationAddress: 'Orchideenstieg 14, Hamburg',
              weatherRule: 'warn_rain',
              alternativeTransportOptions: [
                {
                  id: 'moia_1',
                  label: 'MOIA',
                  showPolicy: 'always',
                  reminderText: 'Denk daran, das MOIA vorzubestellen!',
                },
              ],
            },
          ],
        },
      },
    },
  });

  assert.equal(insights.length, 1);
  assert.ok(insights[0].addedFacts.some((fact) => /last 24 hours before the event/i.test(fact)));
  assert.equal(insights[0].addedFacts.some((fact) => /Primary action:/i.test(fact)), false);
  assert.equal(insights[0].addedFacts.some((fact) => /Weather action:/i.test(fact)), false);
});

test('derivePrimaryActionFromInsights prefers explicit reminder actions', () => {
  const action = derivePrimaryActionFromInsights([
    {
      addedFacts: [
        'Weather action: Take an umbrella just in case.',
        'Primary action: Denk daran, das MOIA vorzubestellen!',
      ],
    },
  ]);

  assert.equal(action, 'Denk daran, das MOIA vorzubestellen!');
});

test('buildDailyBrief does not fall back to a plain prep-event reminder without added context', () => {
  const events = [
    {
      id: 'kickoff',
      title: 'Meeting Prep Kick-Off',
      start: isoFromNow(54),
      end: isoFromNow(55),
      isAllDay: false,
      isRecurring: false,
      calendarId: 'school',
      calendarSummary: 'Schule',
      description: '',
      location: '',
    },
  ];

  const brief = buildDailyBrief(events, null, events[0], null, null, null, null, null, null, {});

  assert.equal(brief.items.length, 0);
  assert.deepEqual(brief.bullets, []);
  assert.equal(brief.householdView, '');
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
    bullets: ['Alex leaves for Athens soon.'],
    householdView: 'Alex leaves for Athens on Tue.',
    items: [
      {
        id: 'active_trip',
        headline: 'Travel update',
        householdView: 'Alex leaves for Athens on Tue.',
        bullets: ['Alex leaves for Athens soon.'],
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
    bullets: ['Alex leaves for Athens soon.'],
    householdView: 'Alex leaves for Athens on Tue.',
    items: [
      {
        id: 'active_trip',
        headline: 'Travel update',
        householdView: 'Alex leaves for Athens on Tue.',
        bullets: ['Alex leaves for Athens soon.'],
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
    travelerLabel: 'Alex',
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
    travelerLabel: 'Alex',
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
    title: 'Alex Dienstreise Athen',
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
