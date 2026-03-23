const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const morgan = require('morgan');
const { exec } = require('child_process');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, '../config.json');
const PUBLIC_UI_PATH = path.join(__dirname, '../remote_ui/dist');
const DATA_ROOT = process.env.MIRRORIAL_DATA_DIR || path.join(os.homedir(), '.config', 'mirrorial');
const SECRETS_PATH = path.join(DATA_ROOT, 'secrets.json');
const HOUSEHOLD_PATH = path.join(DATA_ROOT, 'household.json');
const GOOGLE_ACCOUNT_PATH = path.join(DATA_ROOT, 'accounts', 'google-account.json');
const CALENDAR_CACHE_PATH = path.join(DATA_ROOT, 'cache', 'calendar-events.json');
const CONTEXT_CACHE_PATH = path.join(DATA_ROOT, 'cache', 'context.json');
const DAILY_BRIEF_DEBUG_PATH = path.join(DATA_ROOT, 'cache', 'daily-brief-debug.json');
const TRANSPORT_CACHE_PATH = path.join(DATA_ROOT, 'cache', 'transport-live.json');
const GEOCODE_CACHE_PATH = path.join(DATA_ROOT, 'cache', 'geocode.json');
const ROUTING_CACHE_PATH = path.join(DATA_ROOT, 'cache', 'routing.json');
const DISPLAY_STATUS_PATH = path.join(DATA_ROOT, 'cache', 'display-status.json');
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];
const GOOGLE_AUTH_STATES = new Map();
const LOCAL_HOST_PATTERNS = ['localhost', '127.0.0.1', '::1'];
const DEFAULT_CONFIG = {
  system: {
    fps: 30,
    rotation: 0,
    units: 'metric',
    timezone: 'UTC',
    displayLocale: 'en',
    timeFormat: '24h',
    previewResolution: 'auto',
    backendUrl: 'http://127.0.0.1:3000',
    power: {
      autoShutdownEnabled: false,
      autoShutdownTime: '23:00',
    },
  },
  theme: {
    primaryColor: '#FFFFFF',
    secondaryColor: '#888888',
    accentColor: '#00BCD4',
    fontSizeBase: 16,
    fontFamily: 'Roboto',
  },
  services: {
    google: {
      clientId: '',
      redirectUri: '',
      selectedCalendarIds: [],
    },
    context: {
      refreshHours: 3,
      tripLookaheadDays: 14,
      usefulLocationWhitelist: [],
    },
    llm: {
      enabled: false,
      provider: 'openai',
      model: 'gpt-5-mini',
      baseUrl: '',
      refreshHours: 3,
      privacyMode: 'cloud-redacted',
      suppressRoutineRecurringEvents: true,
    },
    transport: {
      enabled: false,
      provider: 'none',
      homeAirport: '',
      homeStation: '',
      refreshMinutes: 30,
    },
    routing: {
      enabled: false,
      provider: 'none',
      baseUrl: '',
      profile: 'driving-car',
      refreshMinutes: 30,
    },
  },
  gridLayout: {
    template: 'portrait_focus',
    columns: 4,
    rows: 8,
    gap: 16,
    modules: [],
  },
};

const DEFAULT_HOUSEHOLD = {
  home: {
    label: 'Home',
    address: '',
    location: null,
  },
  members: [],
  savedPlaces: [],
};

app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(express.static(PUBLIC_UI_PATH));

const clone = (value) => JSON.parse(JSON.stringify(value));

const deepMerge = (base, override) => {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override : base;
  }
  if (!base || typeof base !== 'object') {
    return override === undefined ? base : override;
  }
  const result = { ...base };
  const source = override && typeof override === 'object' ? override : {};

  Object.keys(source).forEach((key) => {
    if (Array.isArray(source[key])) {
      result[key] = source[key];
      return;
    }
    if (source[key] && typeof source[key] === 'object' && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      result[key] = deepMerge(base[key], source[key]);
      return;
    }
    result[key] = source[key];
  });

  return result;
};

const ensureRuntimePaths = async () => {
  await fs.ensureDir(DATA_ROOT);
  await fs.ensureDir(path.dirname(SECRETS_PATH));
  await fs.ensureDir(path.dirname(HOUSEHOLD_PATH));
  await fs.ensureDir(path.dirname(GOOGLE_ACCOUNT_PATH));
  await fs.ensureDir(path.dirname(CALENDAR_CACHE_PATH));
  await fs.ensureDir(path.dirname(CONTEXT_CACHE_PATH));
  await fs.ensureDir(path.dirname(DAILY_BRIEF_DEBUG_PATH));
  await fs.ensureDir(path.dirname(TRANSPORT_CACHE_PATH));
  await fs.ensureDir(path.dirname(GEOCODE_CACHE_PATH));
  await fs.ensureDir(path.dirname(ROUTING_CACHE_PATH));
  await fs.ensureDir(path.dirname(DISPLAY_STATUS_PATH));
};

const ensureConfig = async () => {
  if (!await fs.pathExists(CONFIG_PATH)) {
    const example = path.join(__dirname, '../configs/config.json.example');
    await fs.copy(example, CONFIG_PATH);
  }
};

const normalizeConfig = (rawConfig = {}) => {
  const config = deepMerge(clone(DEFAULT_CONFIG), rawConfig);
  config.gridLayout = config.gridLayout && typeof config.gridLayout === 'object'
    ? {
      template: config.gridLayout.template || 'portrait_focus',
      columns: Number(config.gridLayout.columns) || 4,
      rows: Number(config.gridLayout.rows) || 8,
      gap: Number(config.gridLayout.gap) || 16,
      modules: Array.isArray(config.gridLayout.modules) ? config.gridLayout.modules : [],
    }
    : clone(DEFAULT_CONFIG.gridLayout);

  const calendarModule = getAllModules(config)
    .find((module) => module.type === 'calendar');

  if (calendarModule?.config?.googleClientId && !config.services.google.clientId) {
    config.services.google.clientId = calendarModule.config.googleClientId;
  }

  if (Array.isArray(calendarModule?.config?.calendarIds) && config.services.google.selectedCalendarIds.length === 0) {
    config.services.google.selectedCalendarIds = calendarModule.config.calendarIds;
  }

  return config;
};

const getAllModules = (config) => {
  const gridModules = config?.gridLayout?.modules;
  if (Array.isArray(gridModules)) {
    return gridModules.filter((module) => module && typeof module === 'object');
  }

  return [];
};

const readJsonIfExists = async (targetPath, fallbackValue) => {
  if (!await fs.pathExists(targetPath)) {
    return clone(fallbackValue);
  }
  return fs.readJson(targetPath);
};

const readTransportCache = async () => {
  const cache = await readJsonIfExists(TRANSPORT_CACHE_PATH, { entries: {} });
  return {
    entries: cache.entries && typeof cache.entries === 'object' ? cache.entries : {},
  };
};

const readRoutingCache = async () => {
  const cache = await readJsonIfExists(ROUTING_CACHE_PATH, { entries: {} });
  return {
    entries: cache.entries && typeof cache.entries === 'object' ? cache.entries : {},
  };
};

const writeTransportCache = async (cache) => {
  await ensureRuntimePaths();
  await fs.writeJson(TRANSPORT_CACHE_PATH, cache, { spaces: 2 });
};

const writeRoutingCache = async (cache) => {
  await ensureRuntimePaths();
  await fs.writeJson(ROUTING_CACHE_PATH, cache, { spaces: 2 });
};

const readDisplayStatus = async () => readJsonIfExists(DISPLAY_STATUS_PATH, {
  width: null,
  height: null,
  devicePixelRatio: null,
  updatedAt: null,
});

const readDailyBriefDebug = async () => readJsonIfExists(DAILY_BRIEF_DEBUG_PATH, {
  updatedAt: null,
  status: 'idle',
  stages: {},
});

const writeDailyBriefDebug = async (payload) => {
  await ensureRuntimePaths();
  await fs.writeJson(DAILY_BRIEF_DEBUG_PATH, payload, { spaces: 2 });
};

const writeDisplayStatus = async (status) => {
  await ensureRuntimePaths();
  await fs.writeJson(DISPLAY_STATUS_PATH, status, { spaces: 2 });
};

const decodeJwtPayload = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }
};

const inferGoogleEmailFromTokens = (tokens = {}) => {
  const payload = decodeJwtPayload(tokens.id_token);
  return typeof payload?.email === 'string' ? payload.email : '';
};

const inferGoogleEmailFromCalendars = (calendars = []) => {
  const primaryCalendar = calendars.find((calendar) => calendar.primary && typeof calendar.id === 'string' && calendar.id.includes('@'));
  if (primaryCalendar) {
    return primaryCalendar.id;
  }

  const fallbackCalendar = calendars.find((calendar) => typeof calendar.id === 'string' && calendar.id.includes('@'));
  return fallbackCalendar?.id || '';
};

const formatGoogleAuthError = (error) => {
  const responseData = error?.response?.data;
  if (typeof responseData?.error_description === 'string' && responseData.error_description.trim()) {
    return responseData.error_description.trim();
  }
  if (typeof responseData?.error?.message === 'string' && responseData.error.message.trim()) {
    return responseData.error.message.trim();
  }
  if (typeof responseData?.error === 'string' && responseData.error.trim()) {
    return responseData.error.trim();
  }
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  return 'Google authentication failed.';
};

const readConfig = async () => {
  await ensureConfig();
  const rawConfig = await fs.readJson(CONFIG_PATH);
  return normalizeConfig(rawConfig);
};

const normalizeHousehold = (rawHousehold = {}) => {
  const household = deepMerge(clone(DEFAULT_HOUSEHOLD), rawHousehold);

  household.home = household.home && typeof household.home === 'object'
    ? {
      label: household.home.label || 'Home',
      address: household.home.address || '',
      location: household.home.location || null,
    }
    : clone(DEFAULT_HOUSEHOLD.home);

  household.members = Array.isArray(household.members) ? household.members : [];
  household.members = household.members.map((member, index) => ({
    id: member.id || `member_${index + 1}`,
    name: member.name || '',
    birthdate: member.birthdate || '',
    calendarIds: Array.isArray(member.calendarIds) ? member.calendarIds.filter(Boolean) : [],
    tags: Array.isArray(member.tags) ? member.tags.filter(Boolean) : [],
    shareInBrief: member.shareInBrief !== false,
    commute: {
      mode: member.commute?.mode || 'auto',
    },
    places: {
      work: {
        label: member.places?.work?.label || 'Work',
        address: member.places?.work?.address || '',
        location: member.places?.work?.location || null,
      },
      school: {
        label: member.places?.school?.label || 'School',
        address: member.places?.school?.address || '',
        location: member.places?.school?.location || null,
      },
    },
  }));

  household.savedPlaces = Array.isArray(household.savedPlaces) ? household.savedPlaces : [];
  household.savedPlaces = household.savedPlaces.map((place, index) => ({
    id: place.id || `place_${index + 1}`,
    name: place.name || '',
    address: place.address || '',
    category: place.category || 'general',
    indoor: place.indoor === true,
    tags: Array.isArray(place.tags) ? place.tags.filter(Boolean) : [],
    location: place.location || null,
  }));

  return household;
};

const readGeocodeCache = async () => {
  const cache = await readJsonIfExists(GEOCODE_CACHE_PATH, { entries: {} });
  return {
    entries: cache.entries && typeof cache.entries === 'object' ? cache.entries : {},
  };
};

const writeGeocodeCache = async (cache) => {
  await ensureRuntimePaths();
  await fs.writeJson(GEOCODE_CACHE_PATH, cache, { spaces: 2, mode: 0o600 });
  await fs.chmod(GEOCODE_CACHE_PATH, 0o600).catch(() => {});
};

const readHousehold = async () => normalizeHousehold(await readJsonIfExists(HOUSEHOLD_PATH, DEFAULT_HOUSEHOLD));

const readSecrets = async () => {
  const secrets = await readJsonIfExists(SECRETS_PATH, { google: {}, llm: {}, transport: {}, routing: {} });
  return {
    google: secrets.google || {},
    llm: secrets.llm || {},
    transport: secrets.transport || {},
    routing: secrets.routing || {},
  };
};

const writeSecrets = async (secrets) => {
  await ensureRuntimePaths();
  await fs.writeJson(SECRETS_PATH, secrets, { spaces: 2, mode: 0o600 });
  await fs.chmod(SECRETS_PATH, 0o600).catch(() => {});
};

const sanitizeConfigForClient = (config, secrets) => {
  const safeConfig = clone(config);
  safeConfig.services.google.clientSecret = '';
  safeConfig.services.google.clientSecretConfigured = Boolean(secrets.google?.clientSecret);
  safeConfig.services.llm.apiKey = '';
  safeConfig.services.llm.apiKeyConfigured = Boolean(secrets.llm?.apiKey);
  safeConfig.services.transport.apiKey = '';
  safeConfig.services.transport.apiKeyConfigured = Boolean(secrets.transport?.apiKey);
  safeConfig.services.routing.apiKey = '';
  safeConfig.services.routing.apiKeyConfigured = Boolean(secrets.routing?.apiKey);
  return safeConfig;
};

const extractSecretsFromConfig = (config, currentSecrets) => {
  const nextConfig = clone(config);
  const nextSecrets = clone(currentSecrets);

  const incomingClientSecret = nextConfig.services?.google?.clientSecret;
  if (typeof incomingClientSecret === 'string') {
    if (incomingClientSecret.trim()) {
      nextSecrets.google.clientSecret = incomingClientSecret.trim();
    }
    delete nextConfig.services.google.clientSecret;
  }

  const incomingApiKey = nextConfig.services?.llm?.apiKey;
  if (typeof incomingApiKey === 'string') {
    if (incomingApiKey.trim()) {
      nextSecrets.llm.apiKey = incomingApiKey.trim();
    }
    delete nextConfig.services.llm.apiKey;
  }

  const incomingTransportApiKey = nextConfig.services?.transport?.apiKey;
  if (typeof incomingTransportApiKey === 'string') {
    if (incomingTransportApiKey.trim()) {
      nextSecrets.transport.apiKey = incomingTransportApiKey.trim();
    }
    delete nextConfig.services.transport.apiKey;
  }

  const incomingRoutingApiKey = nextConfig.services?.routing?.apiKey;
  if (typeof incomingRoutingApiKey === 'string') {
    if (incomingRoutingApiKey.trim()) {
      nextSecrets.routing.apiKey = incomingRoutingApiKey.trim();
    }
    delete nextConfig.services.routing.apiKey;
  }

  delete nextConfig.services?.google?.clientSecretConfigured;
  delete nextConfig.services?.llm?.apiKeyConfigured;
  delete nextConfig.services?.transport?.apiKeyConfigured;
  delete nextConfig.services?.routing?.apiKeyConfigured;

  return {
    config: normalizeConfig(nextConfig),
    secrets: nextSecrets,
  };
};

const saveConfig = async (rawConfig) => {
  const currentSecrets = await readSecrets();
  const { config, secrets } = extractSecretsFromConfig(normalizeConfig(rawConfig), currentSecrets);
  await writeSecrets(secrets);
  await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });
  return sanitizeConfigForClient(config, secrets);
};

const normalizeAddressKey = (value) => value.toString().trim().toLowerCase();

const geocodeAddress = async (address, geocodeCache) => {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    return null;
  }

  const cacheKey = normalizeAddressKey(trimmedAddress);
  if (geocodeCache.entries[cacheKey]) {
    return geocodeCache.entries[cacheKey];
  }

  try {
    const response = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: {
        name: trimmedAddress,
        count: 1,
        language: 'en',
        format: 'json',
      },
      timeout: 8000,
    });

    const place = response.data?.results?.[0];
    if (!place) {
      geocodeCache.entries[cacheKey] = null;
      return null;
    }

    const location = {
      label: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone || 'UTC',
      country: place.country || '',
      name: place.name || '',
      admin1: place.admin1 || '',
      resolvedAt: new Date().toISOString(),
    };

    geocodeCache.entries[cacheKey] = location;
    return location;
  } catch (error) {
    return null;
  }
};

const resolveStoredPlace = async (place, geocodeCache) => {
  const nextPlace = {
    label: place?.label || '',
    address: place?.address || '',
    location: place?.location || null,
  };

  if (!nextPlace.address.trim()) {
    nextPlace.location = null;
    return nextPlace;
  }

  const resolvedLocation = await geocodeAddress(nextPlace.address, geocodeCache);
  nextPlace.location = resolvedLocation
    ? {
      ...resolvedLocation,
      address: nextPlace.address,
    }
    : (nextPlace.location && nextPlace.location.address === nextPlace.address ? nextPlace.location : null);

  return nextPlace;
};

const saveHousehold = async (rawHousehold) => {
  const household = normalizeHousehold(rawHousehold);
  const geocodeCache = await readGeocodeCache();

  household.home = await resolveStoredPlace(household.home, geocodeCache);
  household.members = await Promise.all(household.members.map(async (member) => ({
    ...member,
    places: {
      work: await resolveStoredPlace(member.places?.work || {}, geocodeCache),
      school: await resolveStoredPlace(member.places?.school || {}, geocodeCache),
    },
  })));
  household.savedPlaces = await Promise.all(household.savedPlaces.map(async (place) => {
    const resolvedPlace = await resolveStoredPlace({
      label: place.name || '',
      address: place.address || '',
      location: place.location || null,
    }, geocodeCache);

    return {
      ...place,
      name: place.name || resolvedPlace.label || '',
      address: resolvedPlace.address || '',
      location: resolvedPlace.location || null,
    };
  }));

  await ensureRuntimePaths();
  await writeGeocodeCache(geocodeCache);
  await fs.writeJson(HOUSEHOLD_PATH, household, { spaces: 2, mode: 0o600 });
  await fs.chmod(HOUSEHOLD_PATH, 0o600).catch(() => {});

  return household;
};

const getGoogleSettings = async (req = null) => {
  const [config, secrets] = await Promise.all([readConfig(), readSecrets()]);
  const derivedRedirectUri = req ? `${req.protocol}://${req.get('host')}/api/auth/google/callback` : '';
  const settings = {
    clientId: process.env.GOOGLE_CLIENT_ID || config.services.google.clientId || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || secrets.google.clientSecret || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || config.services.google.redirectUri || derivedRedirectUri,
  };

  return { config, secrets, settings };
};

const createGoogleClient = (settings) => new OAuth2Client(settings.clientId, settings.clientSecret, settings.redirectUri);

const getStoredGoogleAccount = async () => readJsonIfExists(GOOGLE_ACCOUNT_PATH, null);

const writeGoogleAccount = async (account) => {
  await ensureRuntimePaths();
  await fs.writeJson(GOOGLE_ACCOUNT_PATH, account, { spaces: 2, mode: 0o600 });
  await fs.chmod(GOOGLE_ACCOUNT_PATH, 0o600).catch(() => {});
};

const deleteGoogleAccount = async () => {
  await fs.remove(GOOGLE_ACCOUNT_PATH);
  await fs.remove(CALENDAR_CACHE_PATH);
  await fs.remove(CONTEXT_CACHE_PATH);
};

const withGoogleClient = async () => {
  const [{ settings }, account] = await Promise.all([getGoogleSettings(), getStoredGoogleAccount()]);

  if (!account || !settings.clientId || !settings.clientSecret || !settings.redirectUri) {
    return null;
  }

  const client = createGoogleClient(settings);
  client.setCredentials(account.tokens || {});
  return { client, account };
};

const googleRequest = async (client, url, params = {}) => {
  const response = await client.request({ url, params });
  return response.data;
};

const summarizeCalendar = (calendar) => ({
  id: calendar.id,
  summary: calendar.summary,
  primary: Boolean(calendar.primary),
  backgroundColor: calendar.backgroundColor,
  foregroundColor: calendar.foregroundColor,
  accessRole: calendar.accessRole,
});

const normalizeEvent = (event, calendar) => {
  const startValue = event.start?.dateTime || event.start?.date;
  const endValue = event.end?.dateTime || event.end?.date || startValue;

  return {
    id: event.id,
    status: event.status,
    title: event.summary || '(No title)',
    description: event.description || '',
    location: event.location || '',
    start: startValue,
    end: endValue,
    isAllDay: !event.start?.dateTime,
    htmlLink: event.htmlLink || '',
    calendarId: calendar.id,
    calendarSummary: calendar.summary,
    calendarColor: calendar.backgroundColor || '',
    calendarTextColor: calendar.foregroundColor || '',
    isRecurring: Boolean(event.recurringEventId || event.recurringEventId === ''),
    recurringEventId: event.recurringEventId || '',
    attendees: Array.isArray(event.attendees) ? event.attendees.map((attendee) => attendee.email).filter(Boolean) : [],
  };
};

const fetchGoogleCalendarEvents = async ({
  client,
  calendar,
  timeMin,
  timeMax,
}) => {
  const events = [];
  let pageToken = null;

  do {
    const payload = await googleRequest(
      client,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`,
      {
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500,
        pageToken: pageToken || undefined,
      },
    );

    events.push(...((payload.items || []).map((event) => normalizeEvent(event, calendar))));
    pageToken = payload.nextPageToken || null;
  } while (pageToken);

  return events;
};

const weatherCodeToLabel = (code) => {
  if (code === 0) return 'clear';
  if (code <= 3) return 'partly cloudy';
  if (code <= 48) return 'fog';
  if (code <= 67) return 'rain';
  if (code <= 77) return 'snow';
  if (code <= 82) return 'showers';
  return 'stormy';
};

const weatherNeedsIndoorPlan = (code) => {
  if (code === undefined || code === null) {
    return false;
  }
  return code >= 45;
};

const summarizeForecast = (forecast, startDate, endDate) => {
  if (!forecast?.daily?.time?.length) {
    return null;
  }

  const startKey = startDate.toISOString().slice(0, 10);
  const endKey = endDate.toISOString().slice(0, 10);
  const selectedIndexes = forecast.daily.time
    .map((date, index) => ({ date, index }))
    .filter((entry) => entry.date >= startKey && entry.date <= endKey)
    .map((entry) => entry.index);

  if (selectedIndexes.length === 0) {
    return null;
  }

  const tempsMax = selectedIndexes.map((index) => forecast.daily.temperature_2m_max[index]).filter((value) => value !== undefined);
  const tempsMin = selectedIndexes.map((index) => forecast.daily.temperature_2m_min[index]).filter((value) => value !== undefined);
  const codes = selectedIndexes.map((index) => forecast.daily.weathercode[index]).filter((value) => value !== undefined);
  const minTemp = Math.round(Math.min(...tempsMin));
  const maxTemp = Math.round(Math.max(...tempsMax));
  const primaryCode = codes[0];

  return {
    label: `${minTemp}-${maxTemp}C, ${weatherCodeToLabel(primaryCode)}`,
    minTemp,
    maxTemp,
    weatherCode: primaryCode,
  };
};

const tryFetchForecastForLocation = async (location, startDate, endDate) => {
  if (!location || location.latitude === undefined || location.longitude === undefined) {
    return null;
  }

  try {
    const forecastResponse = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: location.latitude,
        longitude: location.longitude,
        daily: 'weathercode,temperature_2m_max,temperature_2m_min',
        timezone: location.timezone || 'auto',
        forecast_days: 14,
      },
      timeout: 8000,
    });

    const forecast = summarizeForecast(forecastResponse.data, startDate, endDate);
    const currentTime = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: location.timezone || 'UTC',
    }).format(new Date());

    return {
      destination: location.label || location.name || '',
      timezone: location.timezone || 'UTC',
      currentTime,
      forecast,
    };
  } catch (error) {
    return null;
  }
};

const tryFetchDestinationWeather = async (destination, tripStart, tripEnd) => {
  if (!destination) {
    return null;
  }

  try {
    const geoResponse = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: {
        name: destination,
        count: 1,
        language: 'en',
        format: 'json',
      },
      timeout: 8000,
    });

    const place = geoResponse.data?.results?.[0];
    if (!place) {
      return null;
    }

    return tryFetchForecastForLocation({
      label: `${place.name}${place.country ? `, ${place.country}` : ''}`,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone || 'UTC',
      country: place.country || '',
      name: place.name || '',
      admin1: place.admin1 || '',
    }, tripStart, tripEnd);
  } catch (error) {
    return null;
  }
};

const findWeatherModuleConfig = (config) => getAllModules(config)
  .find((module) => module.type === 'weather')?.config || null;

const tryFetchHomeForecast = async (config, household, startDate, endDate) => {
  if (household?.home?.location?.latitude !== undefined && household?.home?.location?.longitude !== undefined) {
    const homeForecast = await tryFetchForecastForLocation(household.home.location, startDate, endDate);
    return homeForecast?.forecast || null;
  }

  const weatherConfig = findWeatherModuleConfig(config);
  if (!weatherConfig) {
    return null;
  }

  if (weatherConfig.provider === 'open-meteo' && weatherConfig.lat && weatherConfig.lon) {
    const forecast = await tryFetchForecastForLocation({
      label: weatherConfig.location || 'Home',
      latitude: weatherConfig.lat,
      longitude: weatherConfig.lon,
      timezone: config.system.timezone || 'UTC',
    }, startDate, endDate);
    return forecast?.forecast || null;
  }

  if (weatherConfig.location) {
    const destination = await tryFetchDestinationWeather(weatherConfig.location, startDate, endDate);
    return destination?.forecast || null;
  }

  return null;
};

const extractDestination = (event) => {
  const location = (event.location || '').trim();
  if (location) {
    return location.split(',')[0].trim();
  }

  const title = (event.title || '').trim();
  const tripMatch = title.match(/\b(?:to|in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/);
  if (tripMatch) {
    return tripMatch[1];
  }

  const trailingMatch = title.match(/[-:]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})$/);
  return trailingMatch ? trailingMatch[1] : '';
};

const normalizeDestinationKey = (destination = '') => destination.trim().toLowerCase();
const STREET_ADDRESS_PATTERN = /\b\d{1,5}[a-z]?\b|(?:strasse|straße|street|road|avenue|allee|weg|gasse|platz|drive|lane)\b/i;
const ONLINE_EVENT_PATTERN = /\b(online|remote|zoom|teams|meet|webex)\b/i;
const USEFUL_LOCATION_KEYWORD_PATTERN = /\b(hospital|clinic|doctor|praxis|arzt|schule|school|kita|kindergarten|daycare|museum|zoo|theater|theatre|cinema|concert|venue|arena|stadium|airport|bahnhof|station|terminal|hotel|embassy|consulate|university|campus|messe|expo|office|büro)\b/i;
const GENERIC_DESTINATION_PATTERN = /^(school|schule|private|privat|work|office|home|zu hause|haus|kita|kindergarten|daycare|online|remote|meeting room|conference room|room)$/i;

const TRAVEL_SIGNAL_PATTERN = /\b(trip|flight|summit|conference|meetup|travel|hotel|airport|train|boarding|arrival|departure)\b/i;
const FLIGHT_NUMBER_PATTERN = /\b([A-Z]{2,3}\s?\d{2,4}[A-Z]?)\b/;
const TRAIN_NUMBER_PATTERN = /\b(ICE|IC|EC|RE|RB|RJ|TGV|AVE|IR|S)\s?(\d{1,4})\b/i;
const ROUTE_TEXT_PATTERN = /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s*[-–>]\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\b/;
const AIRPORT_ROUTE_PATTERN = /\b([A-Z]{3})\s*[-–>]\s*([A-Z]{3})\b/;

const eventHasTravelSignal = (event) => TRAVEL_SIGNAL_PATTERN.test([
  event.title || '',
  event.description || '',
  event.location || '',
].join(' '));

const eventMentionsDestination = (event, destination) => {
  if (!destination) {
    return false;
  }

  const haystack = [
    event.title || '',
    event.description || '',
    event.location || '',
  ].join(' ').toLowerCase();

  return haystack.includes(destination.toLowerCase());
};

const looksLikeStreetAddress = (value = '') => STREET_ADDRESS_PATTERN.test(value.trim());

const getConfiguredUsefulLocationWhitelist = (config) => {
  const raw = config?.services?.context?.usefulLocationWhitelist;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => entry?.toString().trim().toLowerCase())
    .filter(Boolean);
};

const getSavedPlaceTokens = (household) => {
  const savedPlaces = Array.isArray(household?.savedPlaces) ? household.savedPlaces : [];
  return savedPlaces.flatMap((place) => [
    place.name || '',
    place.category || '',
    ...(Array.isArray(place.tags) ? place.tags : []),
  ].map((entry) => entry.toString().trim().toLowerCase()).filter(Boolean));
};

const toDisplayLabel = (value = '') => value
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const findUsefulLocationToken = (event, config, household) => {
  const segments = [
    event.title || '',
    event.description || '',
    event.location || '',
  ];

  const savedPlaceMatch = (Array.isArray(household?.savedPlaces) ? household.savedPlaces : [])
    .find((place) => [
      place.name || '',
      place.category || '',
      ...(Array.isArray(place.tags) ? place.tags : []),
    ]
      .map((entry) => entry.toString().trim().toLowerCase())
      .filter(Boolean)
      .some((token) => segments.some((segment) => segment.toLowerCase().includes(token))));
  if (savedPlaceMatch?.name) {
    return savedPlaceMatch.name;
  }

  const configuredTokens = getConfiguredUsefulLocationWhitelist(config);
  const configuredMatch = configuredTokens.find((token) => segments.some((segment) => segment.toLowerCase().includes(token)));
  if (configuredMatch) {
    return toDisplayLabel(configuredMatch);
  }

  const keywordMatch = segments
    .map((segment) => segment.match(USEFUL_LOCATION_KEYWORD_PATTERN)?.[0])
    .find(Boolean);
  return keywordMatch ? toDisplayLabel(keywordMatch) : '';
};

const hasUsefulLocationSignal = (event, config, household) => {
  const eventText = [
    event.title || '',
    event.description || '',
    event.location || '',
  ].join(' ').toLowerCase();

  if (USEFUL_LOCATION_KEYWORD_PATTERN.test(eventText)) {
    return true;
  }

  const configuredTokens = getConfiguredUsefulLocationWhitelist(config);
  if (configuredTokens.some((token) => eventText.includes(token))) {
    return true;
  }

  const savedPlaceTokens = getSavedPlaceTokens(household);
  return savedPlaceTokens.some((token) => eventText.includes(token));
};

const isGenericDestinationLabel = (value = '') => GENERIC_DESTINATION_PATTERN.test(value.trim().toLowerCase());

const inferTripAnchorFromEvent = (event, config = null, household = null) => {
  const rawDestination = extractDestination(event);
  const usefulLocationLabel = findUsefulLocationToken(event, config, household);
  const destination = looksLikeStreetAddress(rawDestination) && usefulLocationLabel
    ? usefulLocationLabel
    : rawDestination;
  if (!destination) {
    return null;
  }

  if (looksLikeStreetAddress(rawDestination) && !hasUsefulLocationSignal(event, config, household)) {
    return null;
  }

  if (isGenericDestinationLabel(destination)) {
    return null;
  }

  const eventText = [event.title || '', event.description || '', event.location || ''].join(' ');
  if (ONLINE_EVENT_PATTERN.test(eventText) && !eventHasTravelSignal(event)) {
    return null;
  }

  const start = new Date(event.start);
  const end = new Date(event.end);
  const title = event.title.toLowerCase();
  const durationMs = Math.max(end.getTime() - start.getTime(), 0);
  const durationDays = Math.max(1, Math.round(durationMs / 86400000));
  let confidence = 0.25;

  if (event.location) confidence += 0.25;
  if (event.isAllDay && durationDays > 1) confidence += 0.2;
  if (TRAVEL_SIGNAL_PATTERN.test(title)) confidence += 0.25;
  if (event.calendarSummary?.toLowerCase().includes('work')) confidence += 0.05;

  if (confidence < 0.45) {
    return null;
  }

  return {
    eventId: event.id,
    destinationKey: normalizeDestinationKey(destination),
    destination,
    location: event.location || '',
    start: event.start,
    end: event.end,
    confidence: Number(confidence.toFixed(2)),
    transport: /\bflight\b/i.test(event.title) ? 'flight' : 'trip',
    title: event.title,
    calendarSummary: event.calendarSummary || '',
  };
};

const extractRoute = (text) => {
  if (!text) {
    return null;
  }

  const airportMatch = text.match(AIRPORT_ROUTE_PATTERN);
  if (airportMatch) {
    return {
      origin: airportMatch[1],
      destination: airportMatch[2],
      kind: 'airport_code',
    };
  }

  const routeMatch = text.match(ROUTE_TEXT_PATTERN);
  if (routeMatch) {
    return {
      origin: routeMatch[1].trim(),
      destination: routeMatch[2].trim(),
      kind: 'text',
    };
  }

  return null;
};

const buildTransportConfidence = ({ identifier, route, event, type }) => {
  if (identifier) {
    return 'exact';
  }
  if (route && (event.location || type !== 'trip')) {
    return 'inferred';
  }
  return 'unknown';
};

const buildTransportSummary = (segment) => {
  const timeLabel = !segment.isAllDay && segment.start
    ? new Date(segment.start).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : new Date(segment.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  if (segment.type === 'flight') {
    if (segment.identifier) {
      return `Flight ${segment.identifier}${segment.routeLabel ? ` ${segment.routeLabel}` : ''} ${timeLabel}`.trim();
    }
    if (segment.routeLabel) {
      return `Flight ${segment.routeLabel} ${timeLabel}`.trim();
    }
  }

  if (segment.type === 'train') {
    if (segment.identifier) {
      return `${segment.identifier}${segment.routeLabel ? ` ${segment.routeLabel}` : ''} ${timeLabel}`.trim();
    }
    if (segment.routeLabel) {
      return `Train ${segment.routeLabel} ${timeLabel}`.trim();
    }
  }

  return `${segment.title} ${timeLabel}`.trim();
};

const parseFlightIdentifier = (identifier) => {
  if (!identifier) {
    return null;
  }

  const normalized = identifier.replace(/\s+/g, '').toUpperCase();
  const match = normalized.match(/^([A-Z]{2,3})(\d{2,4}[A-Z]?)$/);
  if (!match) {
    return null;
  }

  return {
    code: normalized,
    airlineCode: match[1],
    flightNumber: match[2],
  };
};

const TRIP_INTENT_KEYWORDS = {
  business_trip: /\b(work|business|conference|summit|client|meeting|internal team|onsite|offsite|expo|messe|teacher summit)\b/i,
  vacation: /\b(vacation|holiday|urlaub|ferien|honeymoon|getaway|resort)\b/i,
  weekend_trip: /\b(weekend|city break|kurztrip)\b/i,
  day_trip: /\b(day trip|tagesausflug|excursion|outing|museum|zoo|beach day)\b/i,
};

const VISITOR_KEYWORDS = /\b(visit|visitor|visiting|guest|guests|besuch)\b/i;
const HOUSEHOLD_EVENT_PATTERNS = {
  birthday: /\b(birthday|geburtstag|bday)\b/i,
  anniversary: /\b(anniversary|jahrestag)\b/i,
  holiday: /\b(public holiday|bank holiday|holiday|feiertag|schulfrei|no school)\b/i,
  school_event: /\b(school|kindergarten|kita|daycare|elternabend|parents evening|sports day|class trip|field trip|excursion|wandertag)\b/i,
  delivery: /\b(delivery|package|parcel|lieferung|zustellung|pickup|abholung|amazon|dhl|ups|dpd|hermes|gls)\b/i,
  garbage_pickup: /\b(garbage|trash|recycling|waste|bin collection|müllabfuhr|restmüll|biomüll|papiermüll|gelbe tonne|gelber sack)\b/i,
  overnight_guest: /\b(sleepover|stay over|staying over|overnight guest|overnight stay|übernachtung)\b/i,
  outdoor_plan: /\b(bbq|barbecue|grill|garden party|gartenparty|picnic|beach|zoo|park|hike|hiking|boat trip|outdoor)\b/i,
};

const WEATHER_SENSITIVE_LOCAL_EVENT_PATTERNS = /\b(sports day|class trip|field trip|excursion|wandertag|zoo|park|picnic|beach|boat trip|garden|grill|bbq|outdoor)\b/i;

const classifyTripIntent = (sourceEvents, startMs, endMs) => {
  const combinedText = sourceEvents.map((event) => [
    event.title || '',
    event.description || '',
    event.location || '',
    event.calendarSummary || '',
  ].join(' ')).join(' ').toLowerCase();
  const durationHours = Math.max(1, Math.round((endMs - startMs) / 3600000));
  const startDate = new Date(startMs);
  const endDate = new Date(endMs);
  const spansWeekend = [startDate.getDay(), endDate.getDay()].includes(5) || [startDate.getDay(), endDate.getDay()].includes(6);

  if (TRIP_INTENT_KEYWORDS.vacation.test(combinedText)) {
    return { code: 'vacation', label: 'Vacation' };
  }
  if (TRIP_INTENT_KEYWORDS.business_trip.test(combinedText)) {
    return { code: 'business_trip', label: 'Business trip' };
  }
  if (TRIP_INTENT_KEYWORDS.weekend_trip.test(combinedText) || (durationHours <= 72 && spansWeekend)) {
    return { code: 'weekend_trip', label: 'Weekend trip' };
  }
  if (TRIP_INTENT_KEYWORDS.day_trip.test(combinedText) || durationHours <= 16) {
    return { code: 'day_trip', label: 'Day trip' };
  }

  return { code: 'trip', label: 'Trip' };
};

const inferVisitorName = (event) => {
  const title = event.title || '';
  const match = title.match(/^(.+?)\s+(?:visit|visitor|visiting|guest|guests|besuch)\b/i);
  if (match) {
    return match[1].trim();
  }
  return title.trim();
};

const ROUTINE_EVENT_PATTERNS = {
  workStart: /\b(start arbeiten|start work|shift start|dienstbeginn)\b/i,
  onlineLesson: /\b(online lessons?|lesson|unterricht)\b/i,
  genericClass: /\b(gruppe|group|kurs|course|class|training|topics?\s*\d*|flex|jmc\s*\d+|jac\s*\d+)\b/i,
};

const PERSON_LIKE_TITLE_PATTERN = /^[A-ZÄÖÜ][\p{L}'-]+(?:\s+[A-ZÄÖÜ][\p{L}'-]+){0,2}$/u;
const DISTINCTIVE_EVENT_PATTERN = /\b(concert|conference|partner|setup|presentation|tickets?|dinner|meeting|summit|event|rennen|race|tour|show|festival|lunch|prep|overview)\b/i;
const MUSIC_SCHOOL_LOCATION_PATTERN = /\b(yamaha music school|music school|musikschule)\b/i;

const isLowValueRoutineEvent = (event) => {
  if (!event) {
    return false;
  }

  const title = (event.title || '').trim();
  const combinedText = [
    event.title || '',
    event.description || '',
    event.location || '',
  ].join(' ');
  const schoolLikeCalendar = /\b(schule|school)\b/i.test(event.calendarSummary || '');
  const musicSchoolLocation = MUSIC_SCHOOL_LOCATION_PATTERN.test(event.location || '');
  const simpleNameTitle = PERSON_LIKE_TITLE_PATTERN.test(title);

  if (ROUTINE_EVENT_PATTERNS.workStart.test(combinedText) || ROUTINE_EVENT_PATTERNS.onlineLesson.test(combinedText)) {
    return true;
  }

  if (event.isRecurring && (schoolLikeCalendar || musicSchoolLocation) && ROUTINE_EVENT_PATTERNS.genericClass.test(title)) {
    return true;
  }

  if (event.isRecurring && simpleNameTitle && (schoolLikeCalendar || musicSchoolLocation)) {
    return true;
  }

  if (event.isRecurring && simpleNameTitle && !DISTINCTIVE_EVENT_PATTERN.test(combinedText) && !event.location) {
    return true;
  }

  return false;
};

const scoreEventInterest = (event) => {
  if (!event) {
    return 0;
  }

  const combinedText = [
    event.title || '',
    event.description || '',
    event.location || '',
  ].join(' ');
  let score = 0;

  if (!event.isRecurring) score += 24;
  if (event.isAllDay) score += 6;
  if (DISTINCTIVE_EVENT_PATTERN.test(combinedText)) score += 22;
  if (TRAVEL_SIGNAL_PATTERN.test(combinedText)) score += 12;
  if ((event.location || '').trim()) score += 6;
  if (isLowValueRoutineEvent(event)) score -= 32;

  return score;
};

const scoreUpcomingEventRelevance = (event, now = Date.now()) => {
  if (!event) {
    return -Infinity;
  }

  const startMs = new Date(event.start).getTime();
  const endMs = new Date(event.end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < now) {
    return -Infinity;
  }

  const hoursAway = Math.max(0, (startMs - now) / 3600000);
  let score = scoreEventInterest(event);

  if (hoursAway <= 6) score += 18;
  else if (hoursAway <= 24) score += 14;
  else if (hoursAway <= 72) score += 8;
  else if (hoursAway <= 168) score += 3;
  else score -= Math.min(20, Math.round((hoursAway - 168) / 24));

  return score;
};

const shouldSuppressRoutineRecurringEvents = (config) => config?.services?.llm?.suppressRoutineRecurringEvents !== false;

const RECURRING_ALWAYS_KEEP_PATTERNS = [
  HOUSEHOLD_EVENT_PATTERNS.birthday,
  HOUSEHOLD_EVENT_PATTERNS.anniversary,
  HOUSEHOLD_EVENT_PATTERNS.holiday,
  HOUSEHOLD_EVENT_PATTERNS.garbage_pickup,
  HOUSEHOLD_EVENT_PATTERNS.delivery,
];

const explainBriefEventSelection = (event, config, now = Date.now()) => {
  const startMs = new Date(event.start).getTime();
  const endMs = new Date(event.end).getTime();
  const combinedText = [
    event.title || '',
    event.description || '',
    event.location || '',
  ].join(' ');

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { include: false, reason: 'invalid_dates' };
  }

  if (endMs < now) {
    return { include: false, reason: 'already_finished' };
  }

  if (!event.isRecurring) {
    return { include: !isLowValueRoutineEvent(event), reason: isLowValueRoutineEvent(event) ? 'routine_non_recurring' : 'distinct_or_non_recurring' };
  }

  if (!shouldSuppressRoutineRecurringEvents(config)) {
    return { include: !isLowValueRoutineEvent(event), reason: isLowValueRoutineEvent(event) ? 'routine_recurring' : 'recurring_allowed_by_setting' };
  }

  if (event.isAllDay) {
    return { include: true, reason: 'recurring_all_day' };
  }

  if (RECURRING_ALWAYS_KEEP_PATTERNS.some((pattern) => pattern.test(combinedText))) {
    return { include: true, reason: 'recurring_household_reminder' };
  }

  if (DISTINCTIVE_EVENT_PATTERN.test(combinedText) && !isLowValueRoutineEvent(event)) {
    return { include: true, reason: 'recurring_distinctive_event' };
  }

  if (isLowValueRoutineEvent(event)) {
    return { include: false, reason: 'routine_recurring_suppressed' };
  }

  return { include: false, reason: 'generic_recurring_suppressed' };
};

const getRelevantBriefEvents = (events, config, limit = 18) => {
  const now = Date.now();
  return events
    .filter((event) => explainBriefEventSelection(event, config, now).include)
    .map((event) => ({
      event,
      score: scoreUpcomingEventRelevance(event, now),
      startMs: new Date(event.start).getTime(),
    }))
    .filter((entry) => entry.score > -Infinity)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.startMs - right.startMs;
    })
    .slice(0, limit)
    .sort((left, right) => left.startMs - right.startMs)
    .map((entry) => entry.event);
};

const classifyHouseholdEvent = (event) => {
  const combinedText = [
    event.title || '',
    event.description || '',
    event.location || '',
  ].join(' ');

  if (VISITOR_KEYWORDS.test(combinedText) || eventHasTravelSignal(event)) {
    return null;
  }

  if (isLowValueRoutineEvent(event)) {
    return null;
  }

  if (HOUSEHOLD_EVENT_PATTERNS.birthday.test(combinedText)) {
    return { code: 'birthday', label: 'Birthday' };
  }
  if (HOUSEHOLD_EVENT_PATTERNS.anniversary.test(combinedText)) {
    return { code: 'anniversary', label: 'Anniversary' };
  }
  if (HOUSEHOLD_EVENT_PATTERNS.holiday.test(combinedText)) {
    return { code: 'holiday', label: 'Holiday' };
  }
  if (HOUSEHOLD_EVENT_PATTERNS.school_event.test(combinedText)) {
    return { code: 'school_event', label: 'School event' };
  }
  if (HOUSEHOLD_EVENT_PATTERNS.delivery.test(combinedText)) {
    return { code: 'delivery', label: 'Delivery' };
  }
  if (HOUSEHOLD_EVENT_PATTERNS.garbage_pickup.test(combinedText)) {
    return { code: 'garbage_pickup', label: 'Garbage pickup' };
  }
  if (HOUSEHOLD_EVENT_PATTERNS.overnight_guest.test(combinedText)) {
    return { code: 'overnight_guest', label: 'Overnight guest' };
  }
  if (HOUSEHOLD_EVENT_PATTERNS.outdoor_plan.test(combinedText)) {
    return { code: 'outdoor_plan', label: 'Outdoor plan' };
  }

  return null;
};

const buildPlaceSearchTokens = (place) => [
  place.name || '',
  place.category || '',
  ...(Array.isArray(place.tags) ? place.tags : []),
].map((entry) => entry.toString().trim().toLowerCase()).filter(Boolean);

const findMatchingSavedPlace = (event, household, options = {}) => {
  const savedPlaces = Array.isArray(household?.savedPlaces) ? household.savedPlaces : [];
  const eventText = [
    event.title || '',
    event.description || '',
    event.location || '',
  ].join(' ').toLowerCase();

  const filteredPlaces = savedPlaces.filter((place) => {
    if (options.indoorOnly && !place.indoor) {
      return false;
    }
    return hasResolvedLocation(place);
  });

  const scoredPlaces = filteredPlaces.map((place) => {
    const tokens = buildPlaceSearchTokens(place);
    const score = tokens.reduce((sum, token) => (eventText.includes(token) ? sum + Math.max(token.length, 3) : sum), 0);
    return { place, score };
  }).filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return scoredPlaces[0]?.place || null;
};

const findIndoorFallbackPlace = (household, excludedPlaceId = '') => {
  const savedPlaces = Array.isArray(household?.savedPlaces) ? household.savedPlaces : [];
  return savedPlaces.find((place) => place.indoor && place.id !== excludedPlaceId && hasResolvedLocation(place)) || null;
};

const buildHouseholdEventContext = async (events, config, household, routingConfig, routingSecrets, routingCache) => {
  const now = Date.now();
  const candidate = events
    .map((event) => ({ event, category: classifyHouseholdEvent(event) }))
    .filter(({ event, category }) => {
      if (!category) {
        return false;
      }
      const start = new Date(event.start).getTime();
      const end = new Date(event.end).getTime();
      return end >= now && (start - now) <= (7 * 86400000);
    })
    .map((entry) => {
      const startMs = new Date(entry.event.start).getTime();
      const hoursAway = Math.max(0, (startMs - now) / 3600000);
      let score = scoreUpcomingEventRelevance(entry.event, now);

      if (entry.category.code === 'birthday') score += 18;
      if (entry.category.code === 'anniversary') score += 12;
      if (entry.category.code === 'holiday') score += 10;
      if (entry.category.code === 'delivery' || entry.category.code === 'garbage_pickup') score += hoursAway <= 24 ? 14 : 8;
      if (entry.category.code === 'outdoor_plan') score += 10;
      if (entry.category.code === 'school_event') score -= 8;

      return {
        ...entry,
        score,
        startMs,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.startMs - right.startMs;
    })[0];

  if (!candidate) {
    return null;
  }

  const start = new Date(candidate.event.start);
  const end = new Date(candidate.event.end);
  const combinedText = [
    candidate.event.title || '',
    candidate.event.description || '',
    candidate.event.location || '',
  ].join(' ');
  const matchedPlace = findMatchingSavedPlace(candidate.event, household);
  const weatherSensitive = ['outdoor_plan', 'overnight_guest'].includes(candidate.category.code)
    || (candidate.category.code === 'school_event' && WEATHER_SENSITIVE_LOCAL_EVENT_PATTERNS.test(combinedText));
  const targetForecast = weatherSensitive
    ? (matchedPlace?.location
      ? await tryFetchForecastForLocation(matchedPlace.location, start, end)
      : null)
    : null;
  const homeForecast = weatherSensitive ? await tryFetchHomeForecast(config, household, start, end) : null;
  const placeForecast = targetForecast?.forecast || null;
  const effectiveForecast = placeForecast || homeForecast;
  const weatherRisk = effectiveForecast?.weatherCode !== undefined && weatherNeedsIndoorPlan(effectiveForecast.weatherCode);
  const startMs = start.getTime();
  const hoursUntilStart = Math.round((startMs - now) / 3600000);
  const indoorFallback = weatherRisk ? findIndoorFallbackPlace(household, matchedPlace?.id) : null;
  const route = matchedPlace?.location && hasResolvedLocation(household?.home)
    ? await getRouteEstimate({
      origin: household.home.location,
      destination: matchedPlace.location,
      routingConfig,
      routingSecrets,
      routingCache,
      mode: 'auto',
    })
    : null;

  let advice = '';
  if (candidate.category.code === 'outdoor_plan') {
    advice = weatherRisk
      ? `Weather may be poor, plan an indoor fallback${indoorFallback ? ` like ${indoorFallback.name}` : ''}.`
      : (effectiveForecast ? 'Weather looks suitable for being outside.' : '');
  } else if (candidate.category.code === 'school_event') {
    advice = weatherRisk
      ? 'Weather may be poor, prepare indoor alternatives or rain gear.'
      : (effectiveForecast ? 'Weather looks manageable for the planned activity.' : '');
  } else if (candidate.category.code === 'holiday') {
    advice = 'Check opening hours if errands are planned.';
  } else if (candidate.category.code === 'delivery') {
    advice = hoursUntilStart <= 24
      ? 'A delivery window is close, make sure someone can receive it.'
      : 'Delivery is coming up soon.';
  } else if (candidate.category.code === 'garbage_pickup') {
    advice = hoursUntilStart <= 18
      ? 'Put the bins out tonight if needed.'
      : 'Bin collection is coming up soon.';
  } else if (candidate.category.code === 'overnight_guest' && weatherRisk) {
    advice = 'Weather may be poor, indoor plans could work better.';
  }

  if (!advice && route?.durationMinutes) {
    advice = `${route.summary}.`;
  } else if (advice && route?.durationMinutes) {
    advice = `${advice} ${route.summary}.`;
  }

  return {
    type: candidate.category.code,
    label: candidate.category.label,
    title: candidate.event.title,
    start: candidate.event.start,
    end: candidate.event.end,
    sourceEventId: candidate.event.id,
    matchedPlace: matchedPlace
      ? {
        id: matchedPlace.id,
        name: matchedPlace.name,
        category: matchedPlace.category,
        indoor: matchedPlace.indoor,
      }
      : null,
    placeForecast,
    homeForecast,
    route,
    advice,
  };
};

const hasResolvedLocation = (place) => place?.location?.latitude !== undefined && place?.location?.longitude !== undefined;

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const diffDays = (left, right) => Math.round((startOfDay(left).getTime() - startOfDay(right).getTime()) / 86400000);

const getNextBirthdayOccurrence = (birthdate) => {
  if (!birthdate) {
    return null;
  }

  const original = new Date(birthdate);
  if (Number.isNaN(original.getTime())) {
    return null;
  }

  const now = new Date();
  const occurrence = new Date(now.getFullYear(), original.getMonth(), original.getDate());
  if (occurrence < startOfDay(now)) {
    occurrence.setFullYear(now.getFullYear() + 1);
  }
  return occurrence;
};

const buildBirthdayContext = (household) => {
  const members = Array.isArray(household?.members) ? household.members : [];
  const candidate = members
    .filter((member) => member.shareInBrief !== false && member.name && member.birthdate)
    .map((member) => {
      const occurrence = getNextBirthdayOccurrence(member.birthdate);
      if (!occurrence) {
        return null;
      }
      const birthdate = new Date(member.birthdate);
      const daysUntil = diffDays(occurrence, new Date());
      const turning = occurrence.getFullYear() - birthdate.getFullYear();
      return {
        memberId: member.id,
        memberName: member.name,
        birthdate: member.birthdate,
        nextOccurrence: occurrence.toISOString(),
        daysUntil,
        turning,
      };
    })
    .filter(Boolean)
    .filter((entry) => entry.daysUntil >= 0 && entry.daysUntil <= 14)
    .sort((left, right) => left.daysUntil - right.daysUntil)[0];

  if (!candidate) {
    return null;
  }

  return {
    ...candidate,
    isToday: candidate.daysUntil === 0,
    isTomorrow: candidate.daysUntil === 1,
  };
};

const degreesToRadians = (value) => value * (Math.PI / 180);

const calculateDistanceKm = (origin, destination) => {
  if (!origin || !destination) {
    return null;
  }

  const earthRadiusKm = 6371;
  const latDelta = degreesToRadians(destination.latitude - origin.latitude);
  const lonDelta = degreesToRadians(destination.longitude - origin.longitude);
  const lat1 = degreesToRadians(origin.latitude);
  const lat2 = degreesToRadians(destination.latitude);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c);
};

const buildRoutingCacheKey = (origin, destination, profile) => [
  profile || 'driving-car',
  origin.latitude,
  origin.longitude,
  destination.latitude,
  destination.longitude,
].join(':');

const inferRoutingProfile = (mode = 'auto') => {
  if (mode === 'bike') {
    return 'cycling-regular';
  }
  if (mode === 'walk') {
    return 'foot-walking';
  }
  return 'driving-car';
};

const estimateRouteFallback = (origin, destination, mode = 'auto') => {
  const distanceKm = calculateDistanceKm(origin, destination);
  if (distanceKm === null) {
    return null;
  }

  const averageSpeedKmH = mode === 'walk'
    ? 5
    : mode === 'bike'
      ? 16
      : mode === 'train'
        ? 55
        : 38;
  const durationMinutes = Math.max(5, Math.round((distanceKm / averageSpeedKmH) * 60));

  return {
    source: 'estimated',
    profile: inferRoutingProfile(mode),
    distanceKm,
    durationMinutes,
    summary: `About ${durationMinutes} min from home`,
  };
};

const fetchOpenRouteServiceEstimate = async (origin, destination, routingConfig, routingSecrets) => {
  const baseUrl = (routingConfig.baseUrl || 'https://api.openrouteservice.org').replace(/\/$/, '');
  const profile = routingConfig.profile || 'driving-car';
  const response = await axios.post(`${baseUrl}/v2/directions/${encodeURIComponent(profile)}/geojson`, {
    coordinates: [
      [origin.longitude, origin.latitude],
      [destination.longitude, destination.latitude],
    ],
  }, {
    headers: {
      Authorization: routingSecrets.apiKey,
      'content-type': 'application/json',
    },
    timeout: 15000,
  });

  const segment = response.data?.features?.[0]?.properties?.segments?.[0];
  const summary = response.data?.features?.[0]?.properties?.summary;
  const durationSeconds = segment?.duration || summary?.duration;
  const distanceMeters = segment?.distance || summary?.distance;
  if (!durationSeconds || !distanceMeters) {
    return null;
  }

  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const distanceKm = Math.round(distanceMeters / 1000);
  return {
    source: 'openrouteservice',
    profile,
    distanceKm,
    durationMinutes,
    summary: `About ${durationMinutes} min from home`,
  };
};

const getRouteEstimate = async ({ origin, destination, routingConfig, routingSecrets, routingCache, mode = 'auto' }) => {
  if (!origin || !destination) {
    return null;
  }

  const profile = routingConfig.enabled
    ? (routingConfig.profile || inferRoutingProfile(mode))
    : inferRoutingProfile(mode);
  const cacheKey = buildRoutingCacheKey(origin, destination, profile);
  const refreshMinutes = Number(routingConfig.refreshMinutes) || 30;
  const cachedEntry = routingCache.entries?.[cacheKey];
  const isFresh = cachedEntry?.fetchedAt
    && (Date.now() - new Date(cachedEntry.fetchedAt).getTime()) < (refreshMinutes * 60000);

  if (isFresh && cachedEntry?.route) {
    return cachedEntry.route;
  }

  let route = null;
  try {
    if (routingConfig.enabled && routingConfig.provider === 'openrouteservice' && routingSecrets.apiKey) {
      route = await fetchOpenRouteServiceEstimate(origin, destination, routingConfig, routingSecrets);
    }
  } catch (error) {
    route = null;
  }

  if (!route) {
    route = estimateRouteFallback(origin, destination, mode);
  }

  if (route) {
    routingCache.entries[cacheKey] = {
      fetchedAt: new Date().toISOString(),
      route,
    };
  }

  return route;
};

const guessMemberDestinationType = (member, event) => {
  const combinedText = [
    event.title || '',
    event.description || '',
    event.location || '',
    event.calendarSummary || '',
    ...(member.tags || []),
  ].join(' ').toLowerCase();

  if (hasResolvedLocation(member.places?.school)) {
    const schoolSignals = HOUSEHOLD_EVENT_PATTERNS.school_event.test(combinedText)
      || /\b(school|class|kita|kindergarten|daycare|student|kid|child)\b/i.test(combinedText);
    if (schoolSignals || !hasResolvedLocation(member.places?.work)) {
      return 'school';
    }
  }

  if (hasResolvedLocation(member.places?.work)) {
    return 'work';
  }

  return hasResolvedLocation(member.places?.school) ? 'school' : null;
};

const buildCommuteAdvice = ({ memberName, placeLabel, forecast, distanceKm, commuteMode, route }) => {
  const weatherRisk = forecast?.weatherCode !== undefined && weatherNeedsIndoorPlan(forecast.weatherCode);
  if (weatherRisk) {
    return route?.durationMinutes
      ? `${memberName} may need extra time getting to ${placeLabel}. About ${route.durationMinutes} min expected.`
      : `${memberName} may need extra time getting to ${placeLabel}.`;
  }
  if (route?.durationMinutes) {
    return `${memberName} needs about ${route.durationMinutes} min to reach ${placeLabel}.`;
  }
  if (distanceKm !== null && distanceKm >= 25) {
    return `${memberName} has a longer commute to ${placeLabel}.`;
  }
  if (commuteMode === 'bike') {
    return `Bike conditions to ${placeLabel} look manageable.`;
  }
  return `${memberName} has a scheduled trip to ${placeLabel}.`;
};

const buildCommuteContext = async (events, household, config, routingConfig, routingSecrets, routingCache) => {
  const members = Array.isArray(household?.members) ? household.members : [];
  if (!hasResolvedLocation(household?.home)) {
    return null;
  }

  const now = Date.now();
  const candidates = members
    .filter((member) => member.shareInBrief !== false && member.name)
    .flatMap((member) => events
      .filter((event) => {
        const startMs = new Date(event.start).getTime();
        return startMs >= now
          && (startMs - now) <= (36 * 3600000)
          && Array.isArray(member.calendarIds)
          && member.calendarIds.includes(event.calendarId);
      })
      .map((event) => ({ member, event })))
    .sort((left, right) => new Date(left.event.start) - new Date(right.event.start));

  const match = candidates.find(({ member, event }) => guessMemberDestinationType(member, event));
  if (!match) {
    return null;
  }

  const destinationType = guessMemberDestinationType(match.member, match.event);
  const place = match.member.places?.[destinationType];
  if (!hasResolvedLocation(place)) {
    return null;
  }

  const forecastResult = await tryFetchForecastForLocation(place.location, new Date(match.event.start), new Date(match.event.end));
  const distanceKm = calculateDistanceKm(household.home.location, place.location);
  const placeLabel = place.label || place.location?.label || destinationType;
  const commuteMode = match.member.commute?.mode || 'auto';
  const route = await getRouteEstimate({
    origin: household.home.location,
    destination: place.location,
    routingConfig,
    routingSecrets,
    routingCache,
    mode: commuteMode,
  });

  return {
    memberId: match.member.id,
    memberName: match.member.name,
    type: destinationType,
    placeLabel,
    start: match.event.start,
    sourceEventId: match.event.id,
    eventTitle: match.event.title,
    distanceKm,
    commuteMode,
    route,
    forecast: forecastResult?.forecast || null,
    advice: buildCommuteAdvice({
      memberName: match.member.name,
      placeLabel,
      forecast: forecastResult?.forecast || null,
      distanceKm,
      commuteMode,
      route,
    }),
  };
};

const getBestTimestamp = (...values) => {
  for (const value of values) {
    if (!value) {
      continue;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
};

const deriveFlightLifecycle = (live) => {
  const now = Date.now();
  const scheduledDeparture = getBestTimestamp(live.departure?.estimated, live.departure?.scheduled);
  const actualDeparture = getBestTimestamp(live.departure?.actual);
  const actualArrival = getBestTimestamp(live.arrival?.actual);
  const estimatedArrival = getBestTimestamp(live.arrival?.estimated, live.arrival?.scheduled);
  const status = (live.statusCode || '').toLowerCase();
  const delayMinutes = Number(live.delayMinutes || 0);

  if (actualArrival || status === 'landed') {
    const label = actualArrival
      ? `Landed ${actualArrival.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
      : 'Landed';
    return { code: 'landed', label };
  }

  if (actualDeparture || status === 'active') {
    const eta = estimatedArrival
      ? estimatedArrival.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : '';
    return { code: 'departed', label: eta ? `In the air, ETA ${eta}` : 'Departed' };
  }

  if (status === 'cancelled') {
    return { code: 'cancelled', label: 'Cancelled' };
  }

  if (delayMinutes >= 20) {
    return { code: 'delayed', label: `${delayMinutes} min delay` };
  }

  if (scheduledDeparture) {
    const diffMinutes = Math.round((scheduledDeparture.getTime() - now) / 60000);
    if (diffMinutes >= 0 && diffMinutes <= 45) {
      return { code: 'boarding_soon', label: `Boarding soon for ${scheduledDeparture.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` };
    }
    if (diffMinutes > 45 && diffMinutes <= 180) {
      return { code: 'departure_today', label: `Departure ${scheduledDeparture.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` };
    }
  }

  return {
    code: 'scheduled',
    label: live.statusText || 'Scheduled',
  };
};

const buildTransportCacheKey = (provider, segment) => {
  const routePart = segment.routeLabel || '';
  const datePart = new Date(segment.start).toISOString().slice(0, 10);
  return `${provider}:${segment.type}:${segment.identifier}:${routePart}:${datePart}`;
};

const buildFlightLiveSummary = (live) => {
  const pieces = [];
  if (live.statusText) {
    pieces.push(live.statusText);
  }
  if (live.departure?.gate) {
    pieces.push(`gate ${live.departure.gate}`);
  }
  if (live.departure?.terminal) {
    pieces.push(`terminal ${live.departure.terminal}`);
  }
  if (live.delayMinutes) {
    pieces.push(`${live.delayMinutes} min delay`);
  }

  return pieces.join(' • ');
};

const pickBestAviationstackFlight = (flights, segment) => {
  if (!Array.isArray(flights) || flights.length === 0) {
    return null;
  }

  const identifier = parseFlightIdentifier(segment.identifier);
  const targetStart = new Date(segment.start).getTime();

  const scoredFlights = flights.map((flight) => {
    let score = 0;
    const flightIata = (flight.flight?.iata || flight.flight?.iataNumber || '').toUpperCase();
    const flightNumber = (flight.flight?.number || '').toString().toUpperCase();
    const depIata = (flight.departure?.iata || flight.departure?.iataCode || '').toUpperCase();
    const arrIata = (flight.arrival?.iata || flight.arrival?.iataCode || '').toUpperCase();
    const scheduled = flight.departure?.scheduled || flight.departure?.scheduledTime || null;
    const flightTime = scheduled ? new Date(scheduled).getTime() : targetStart;
    const route = segment.route;

    if (identifier && flightIata === identifier.code) {
      score += 8;
    }
    if (identifier && flightNumber === identifier.flightNumber) {
      score += 4;
    }
    if (route?.kind === 'airport_code' && depIata === route.origin.toUpperCase()) {
      score += 3;
    }
    if (route?.kind === 'airport_code' && arrIata === route.destination.toUpperCase()) {
      score += 3;
    }

    score -= Math.min(Math.abs(flightTime - targetStart) / 3600000, 12);

    return { flight, score };
  }).sort((left, right) => right.score - left.score);

  return scoredFlights[0]?.score > 2 ? scoredFlights[0].flight : null;
};

const fetchAviationstackFlight = async (segment, transportSecrets) => {
  const identifier = parseFlightIdentifier(segment.identifier);
  if (!identifier || !transportSecrets.apiKey) {
    return null;
  }

  const date = new Date(segment.start).toISOString().slice(0, 10);
  const params = {
    access_key: transportSecrets.apiKey,
    flight_iata: identifier.code,
    flight_date: date,
    limit: 10,
  };

  if (segment.route?.kind === 'airport_code') {
    params.dep_iata = segment.route.origin.toUpperCase();
    params.arr_iata = segment.route.destination.toUpperCase();
  }

  const response = await axios.get('https://api.aviationstack.com/v1/flights', {
    params,
    timeout: 15000,
  });

  const data = response.data?.data || response.data?.results || [];
  const bestFlight = pickBestAviationstackFlight(data, segment);
  if (!bestFlight) {
    return null;
  }

  const departure = bestFlight.departure || {};
  const arrival = bestFlight.arrival || {};
  const live = {
    provider: 'aviationstack',
    statusCode: bestFlight.flight_status || bestFlight.status || '',
    statusText: (bestFlight.flight_status || bestFlight.status || '').replace(/_/g, ' '),
    departure: {
      airport: departure.airport || '',
      iata: departure.iata || departure.iataCode || '',
      gate: departure.gate || '',
      terminal: departure.terminal || '',
      scheduled: departure.scheduled || departure.scheduledTime || '',
      estimated: departure.estimated || departure.estimatedTime || '',
      actual: departure.actual || departure.actualTime || '',
    },
    arrival: {
      airport: arrival.airport || '',
      iata: arrival.iata || arrival.iataCode || '',
      gate: arrival.gate || '',
      terminal: arrival.terminal || '',
      scheduled: arrival.scheduled || arrival.scheduledTime || '',
      estimated: arrival.estimated || arrival.estimatedTime || '',
      actual: arrival.actual || arrival.actualTime || '',
    },
    delayMinutes: Number(departure.delay || arrival.delay || 0) || 0,
  };

  live.summary = buildFlightLiveSummary(live);
  live.lifecycle = deriveFlightLifecycle(live);
  return live;
};

const enrichTransportSegment = async (segment, transportConfig, transportSecrets, transportCache) => {
  if (!segment.liveEligible) {
    return segment;
  }

  try {
    if (transportConfig.provider === 'aviationstack') {
      const cacheKey = buildTransportCacheKey(transportConfig.provider, segment);
      const refreshMinutes = Number(transportConfig.refreshMinutes) || 30;
      const cachedEntry = transportCache.entries?.[cacheKey];
      const isFresh = cachedEntry?.fetchedAt
        && (Date.now() - new Date(cachedEntry.fetchedAt).getTime()) < (refreshMinutes * 60000);

      let live = cachedEntry?.live || null;
      if (!isFresh) {
        live = await fetchAviationstackFlight(segment, transportSecrets);
        if (live) {
          transportCache.entries[cacheKey] = {
            fetchedAt: new Date().toISOString(),
            live,
          };
        }
      }

      if (live) {
        return {
          ...segment,
          live,
          liveStatus: 'live_available',
          lifecycle: live.lifecycle || null,
          summary: live.summary ? `${segment.summary} • ${live.summary}` : segment.summary,
        };
      }
    }
  } catch (error) {
    return {
      ...segment,
      liveStatus: 'provider_error',
      liveError: error.message,
    };
  }

  return segment;
};

const inferTransportSegment = (event, trip, transportConfig, transportSecrets) => {
  const combinedText = [event.title || '', event.description || '', event.location || ''].join(' ');
  const flightMatch = combinedText.match(FLIGHT_NUMBER_PATTERN);
  const trainMatch = combinedText.match(TRAIN_NUMBER_PATTERN);
  const route = extractRoute(event.title || '') || extractRoute(event.location || '') || extractRoute(event.description || '');

  let type = 'trip';
  let identifier = '';

  if (flightMatch || /\bflight\b/i.test(combinedText)) {
    type = 'flight';
    identifier = flightMatch ? flightMatch[1].replace(/\s+/g, '') : '';
  } else if (trainMatch || /\btrain\b/i.test(combinedText)) {
    type = 'train';
    identifier = trainMatch ? `${trainMatch[1].toUpperCase()} ${trainMatch[2]}` : '';
  }

  const confidence = buildTransportConfidence({ identifier, route, event, type });
  const routeLabel = route
    ? `${route.origin} -> ${route.destination}`
    : (trip.destination ? `to ${trip.destination}` : '');
  const liveEligible = Boolean(identifier) && transportConfig.enabled && transportConfig.provider !== 'none' && Boolean(transportSecrets.apiKey);
  const liveStatus = !identifier
    ? 'identifier_missing'
    : (!transportConfig.enabled || transportConfig.provider === 'none')
      ? 'provider_not_configured'
      : (!transportSecrets.apiKey ? 'provider_api_key_missing' : 'provider_ready');

  return {
    type,
    title: event.title,
    identifier,
    confidence,
    start: event.start,
    end: event.end,
    isAllDay: event.isAllDay,
    route,
    routeLabel,
    liveEligible,
    liveStatus,
    summary: buildTransportSummary({
      type,
      identifier,
      routeLabel,
      title: event.title,
      start: event.start,
      isAllDay: event.isAllDay,
    }),
  };
};

const buildTripTimelines = async (events, config, household, transportConfig, transportSecrets, transportCache) => {
  const anchors = events
    .slice(0, 40)
    .map((event) => inferTripAnchorFromEvent(event, config, household))
    .filter(Boolean)
    .sort((left, right) => new Date(left.start) - new Date(right.start));

  if (anchors.length === 0) {
    return [];
  }

  const clusters = [];
  anchors.forEach((anchor) => {
    const previousCluster = clusters[clusters.length - 1];
    const anchorStart = new Date(anchor.start).getTime();
    const previousEnd = previousCluster ? new Date(previousCluster.end).getTime() : 0;
    const sameDestination = previousCluster && previousCluster.destinationKey === anchor.destinationKey;
    const closeEnough = previousCluster && (anchorStart - previousEnd) <= (72 * 3600000);

    if (sameDestination && closeEnough) {
      previousCluster.anchors.push(anchor);
      previousCluster.start = new Date(Math.min(new Date(previousCluster.start).getTime(), anchorStart)).toISOString();
      previousCluster.end = new Date(Math.max(new Date(previousCluster.end).getTime(), new Date(anchor.end).getTime())).toISOString();
      return;
    }

    clusters.push({
      destinationKey: anchor.destinationKey,
      destination: anchor.destination,
      start: anchor.start,
      end: anchor.end,
      anchors: [anchor],
    });
  });

  const tripTimelines = await Promise.all(clusters.map(async (cluster) => {
    const anchorCalendarIds = new Set(cluster.anchors.map((anchor) => anchor.calendarSummary).filter(Boolean));
    let windowStart = new Date(cluster.start).getTime() - (12 * 3600000);
    let windowEnd = new Date(cluster.end).getTime() + (12 * 3600000);

    const relatedEvents = events.filter((event) => {
      const eventStart = new Date(event.start).getTime();
      const eventEnd = new Date(event.end).getTime();
      const overlapsWindow = eventStart <= windowEnd && eventEnd >= windowStart;
      const mentionsDestination = eventMentionsDestination(event, cluster.destination);
      const sameCalendar = anchorCalendarIds.has(event.calendarSummary || '');

      return mentionsDestination || (overlapsWindow && (sameCalendar || eventHasTravelSignal(event)));
    });

    if (relatedEvents.length > 0) {
      windowStart = Math.min(...relatedEvents.map((event) => new Date(event.start).getTime()), windowStart);
      windowEnd = Math.max(...relatedEvents.map((event) => new Date(event.end).getTime()), windowEnd);
    }

    const sourceEvents = relatedEvents.length > 0 ? relatedEvents : cluster.anchors
      .map((anchor) => events.find((event) => event.id === anchor.eventId))
      .filter(Boolean);
    const intent = classifyTripIntent(sourceEvents, windowStart, windowEnd);
    const enrichment = await tryFetchDestinationWeather(cluster.destination, new Date(windowStart), new Date(windowEnd));
    const transportSegments = await Promise.all(sourceEvents
      .filter((event) => eventHasTravelSignal(event) || eventMentionsDestination(event, cluster.destination))
      .map((event) => inferTransportSegment(event, cluster, transportConfig, transportSecrets))
      .filter((segment) => segment.type !== 'trip' || segment.confidence !== 'unknown')
      .map((segment) => enrichTransportSegment(segment, transportConfig, transportSecrets, transportCache)));
    const primaryTransport = sourceEvents.some((event) => /\bflight\b/i.test(event.title))
      ? 'flight'
      : (sourceEvents.some((event) => /\btrain\b/i.test(event.title)) ? 'train' : 'trip');
    const confidence = Math.min(0.98, Number((
      cluster.anchors.reduce((sum, anchor) => sum + anchor.confidence, 0) / cluster.anchors.length
      + Math.min(sourceEvents.length, 4) * 0.03
    ).toFixed(2)));

    return {
      destination: enrichment?.destination || cluster.destination,
      destinationKey: cluster.destinationKey,
      start: new Date(windowStart).toISOString(),
      end: new Date(windowEnd).toISOString(),
      confidence,
      intent,
      transport: primaryTransport,
      transportSummary: transportSegments[0]?.summary || '',
      transportLifecycle: transportSegments[0]?.lifecycle || null,
      transportSegments,
      enrichment,
      sourceEventIds: sourceEvents.map((event) => event.id),
      eventCount: sourceEvents.length,
      calendars: Array.from(new Set(sourceEvents.map((event) => event.calendarSummary).filter(Boolean))),
      eventTitles: sourceEvents.map((event) => event.title).slice(0, 6),
    };
  }));

  return tripTimelines.sort((left, right) => new Date(left.start) - new Date(right.start));
};

const selectActiveTrip = (trips) => {
  const now = Date.now();
  return trips.find((trip) => now >= new Date(trip.start).getTime() && now <= new Date(trip.end).getTime())
    || trips.find((trip) => {
      const start = new Date(trip.start).getTime();
      return start >= now && (start - now) <= 172800000;
    })
    || null;
};

const selectRecentTrip = (trips) => {
  const now = Date.now();
  return trips
    .filter((trip) => {
      const end = new Date(trip.end).getTime();
      return end <= now && (now - end) <= (18 * 3600000);
    })
    .sort((left, right) => new Date(right.end) - new Date(left.end))[0] || null;
};

const normalizeTransitCode = (value) => (value || '').toString().trim().toUpperCase();

const isHomeboundSegment = (segment, transportConfig) => {
  if (!segment?.route) {
    return false;
  }

  if (segment.type === 'flight' && segment.route.kind === 'airport_code') {
    return normalizeTransitCode(segment.route.destination) === normalizeTransitCode(transportConfig.homeAirport);
  }

  if (segment.type === 'train') {
    return normalizeTransitCode(segment.route.destination) === normalizeTransitCode(transportConfig.homeStation);
  }

  return false;
};

const getLatestHomeboundSegment = (trip, transportConfig) => {
  const segments = Array.isArray(trip?.transportSegments) ? trip.transportSegments : [];
  return segments
    .filter((segment) => isHomeboundSegment(segment, transportConfig))
    .sort((left, right) => new Date(right.start) - new Date(left.start))[0] || null;
};

const deriveTripPhase = (trip, transportConfig, relation) => {
  if (!trip) {
    return null;
  }

  const now = Date.now();
  const startMs = new Date(trip.start).getTime();
  const endMs = new Date(trip.end).getTime();
  const destination = trip.enrichment?.destination || trip.destination;
  const homeboundSegment = getLatestHomeboundSegment(trip, transportConfig);
  const homeboundLifecycleCode = homeboundSegment?.lifecycle?.code || '';
  const homeboundLifecycleLabel = homeboundSegment?.lifecycle?.label || '';
  const homeboundStartMs = homeboundSegment ? new Date(homeboundSegment.start).getTime() : null;

  if (homeboundLifecycleCode === 'landed') {
    return {
      code: 'returned_home',
      label: homeboundLifecycleLabel || 'Back home',
      summary: `Back home from ${destination}.`,
    };
  }

  if (homeboundStartMs && now >= (homeboundStartMs - (4 * 3600000)) && now <= (homeboundStartMs + (8 * 3600000))) {
    return {
      code: 'returning_home',
      label: homeboundLifecycleLabel || 'Returning home',
      summary: `Returning home from ${destination}.`,
    };
  }

  if (relation === 'recent') {
    return {
      code: 'trip_complete',
      label: 'Trip completed',
      summary: `${trip.intent?.label || 'Trip'} to ${destination} finished recently.`,
    };
  }

  if (startMs > now) {
    return {
      code: 'upcoming_trip',
      label: 'Upcoming trip',
      summary: `Upcoming ${trip.intent?.label?.toLowerCase() || 'trip'} to ${destination}.`,
    };
  }

  if (now > endMs) {
    return {
      code: 'trip_complete',
      label: 'Trip completed',
      summary: `${trip.intent?.label || 'Trip'} to ${destination} finished recently.`,
    };
  }

  return {
    code: 'trip_active',
    label: 'Trip active',
    summary: `${trip.intent?.label || 'Trip'} context is active for ${destination}.`,
  };
};

const attachTripPhase = (trip, transportConfig, relation) => {
  if (!trip) {
    return null;
  }

  return {
    ...trip,
    phase: deriveTripPhase(trip, transportConfig, relation),
  };
};

const getNextUpcomingEvent = (events) => {
  const now = new Date();
  return events.find((event) => new Date(event.end) >= now) || null;
};

const getNextRelevantEvent = (events, config) => {
  const now = Date.now();
  return events.find((event) => {
    const endMs = new Date(event.end).getTime();
    return !Number.isNaN(endMs) && endMs >= now && explainBriefEventSelection(event, config, now).include;
  }) || getNextUpcomingEvent(events);
};

const buildHighlightEventContext = (events, config) => {
  const now = Date.now();
  const candidate = events
    .filter((event) => {
      const endMs = new Date(event.end).getTime();
      const startMs = new Date(event.start).getTime();
      return !Number.isNaN(startMs)
        && !Number.isNaN(endMs)
        && endMs >= now
        && (startMs - now) <= (5 * 86400000)
        && !eventHasTravelSignal(event)
        && explainBriefEventSelection(event, config, now).include;
    })
    .map((event) => ({
      event,
      score: scoreUpcomingEventRelevance(event, now),
      startMs: new Date(event.start).getTime(),
    }))
    .filter((entry) => entry.score >= 24)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.startMs - right.startMs;
    })[0];

  if (!candidate) {
    return null;
  }

  return {
    title: candidate.event.title,
    start: candidate.event.start,
    end: candidate.event.end,
    sourceEventId: candidate.event.id,
    isAllDay: candidate.event.isAllDay,
    score: candidate.score,
  };
};

const buildVisitorContext = async (events, config, household) => {
  const now = Date.now();
  const visitorEvent = events.find((event) => {
    const text = [event.title || '', event.description || ''].join(' ');
    const start = new Date(event.start).getTime();
    return VISITOR_KEYWORDS.test(text) && start >= now && (start - now) <= (5 * 86400000);
  });

  if (!visitorEvent) {
    return null;
  }

  const start = new Date(visitorEvent.start);
  const end = new Date(visitorEvent.end);
  const homeForecast = await tryFetchHomeForecast(config, household, start, end);
  const indoorAdvice = homeForecast?.weatherCode !== undefined && weatherNeedsIndoorPlan(homeForecast.weatherCode);

  return {
    title: visitorEvent.title,
    person: inferVisitorName(visitorEvent),
    start: visitorEvent.start,
    end: visitorEvent.end,
    sourceEventId: visitorEvent.id,
    homeForecast,
    advice: indoorAdvice
      ? 'Weather may be poor, indoor plans could be a better fit.'
      : (homeForecast ? 'Weather looks fine for outdoor plans.' : ''),
  };
};

const formatDateLabel = (value) => new Date(value).toLocaleDateString('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const hoursUntil = (value) => Math.round((new Date(value).getTime() - Date.now()) / 3600000);

const uniqueTexts = (values) => Array.from(new Set(values.map((value) => value?.toString().trim()).filter(Boolean)));

const buildContextCandidates = (events, activeTrip, nextEvent, recentTrip, visitorContext, birthdayContext, commuteContext, householdEventContext, highlightEventContext = null) => {
  const candidates = [];

  if (activeTrip) {
    const destination = activeTrip.enrichment?.destination || activeTrip.destination;
    const lifecycleCode = activeTrip.transportLifecycle?.code || '';
    const lifecycleLabel = activeTrip.transportLifecycle?.label || '';
    const intentLabel = activeTrip.intent?.label || 'Trip';
    const phaseCode = activeTrip.phase?.code || '';
    const phaseLabel = activeTrip.phase?.label || '';
    const tripHours = hoursUntil(activeTrip.start);

    let householdView = `${intentLabel} context is active for ${destination}.`;
    let score = 78;
    const bullets = [];

    if (phaseCode === 'returned_home') {
      householdView = `Back home from ${destination}.`;
      score = 86;
      bullets.push(`Back home from ${destination}.`);
    } else if (phaseCode === 'returning_home') {
      householdView = phaseLabel ? `Returning home from ${destination}. ${phaseLabel}` : `Returning home from ${destination}.`;
      score = 92;
      bullets.push(`Returning home from ${destination}.`);
    } else if (lifecycleCode === 'boarding_soon') {
      householdView = `${intentLabel} to ${destination} is leaving soon. ${lifecycleLabel}`;
      score = 100;
      bullets.push(`${intentLabel} to ${destination} starts soon.`);
    } else if (lifecycleCode === 'departure_today') {
      householdView = `${intentLabel} to ${destination} departs later today.`;
      score = 95;
      bullets.push(`${intentLabel} to ${destination} departs later today.`);
    } else if (lifecycleCode === 'departed') {
      householdView = `Currently travelling for ${intentLabel.toLowerCase()} to ${destination}. ${lifecycleLabel}`;
      score = 97;
      bullets.push(`${destination} is active now.`);
    } else if (lifecycleCode === 'landed') {
      householdView = `${intentLabel} to ${destination} has landed safely.`;
      score = 90;
      bullets.push(`${intentLabel} to ${destination} landed safely.`);
    } else if (lifecycleCode === 'delayed') {
      householdView = `${intentLabel} to ${destination} is delayed. ${lifecycleLabel}`;
      score = 98;
      bullets.push(`${intentLabel} to ${destination} is delayed.`);
    } else if (lifecycleCode === 'cancelled') {
      householdView = `${intentLabel} to ${destination} was cancelled.`;
      score = 99;
      bullets.push(`${intentLabel} to ${destination} was cancelled.`);
    } else if (phaseCode === 'upcoming_trip' || (tripHours >= 0 && tripHours <= 48)) {
      householdView = `Upcoming ${intentLabel.toLowerCase()} to ${destination} starts ${formatDateLabel(activeTrip.start)}.`;
      score = tripHours <= 24 ? 88 : 80;
      bullets.push(`${intentLabel} to ${destination} starts soon.`);
    } else {
      bullets.push(`${destination} is active now.`);
    }

    if (phaseLabel && !['Trip active', 'Upcoming trip'].includes(phaseLabel)) {
      bullets.push(phaseLabel);
    }
    if (activeTrip.transportLifecycle?.label) {
      bullets.push(activeTrip.transportLifecycle.label);
    }
    if (activeTrip.transportSummary) {
      bullets.push(activeTrip.transportSummary);
    }
    if (activeTrip.enrichment?.forecast?.label) {
      bullets.push(`${destination} weather: ${activeTrip.enrichment.forecast.label}.`);
    }
    if (activeTrip.enrichment?.currentTime) {
      bullets.push(`Local time there is ${activeTrip.enrichment.currentTime}.`);
    }

    candidates.push({
      id: 'active_trip',
      score,
      headline: 'Travel update',
      householdView,
      bullets: uniqueTexts(bullets),
    });
  } else if (recentTrip) {
    const destination = recentTrip.enrichment?.destination || recentTrip.destination;
    const householdView = recentTrip.phase?.code === 'returned_home'
      ? `Back home from ${destination}.`
      : (recentTrip.transportLifecycle?.code === 'landed'
        ? `${recentTrip.intent?.label || 'Trip'} to ${destination} landed safely.`
        : `${recentTrip.intent?.label || 'Trip'} to ${destination} finished recently.`);

    candidates.push({
      id: 'recent_trip',
      score: recentTrip.phase?.code === 'returned_home' ? 74 : 68,
      headline: 'Travel update',
      householdView,
      bullets: uniqueTexts([
        recentTrip.phase?.code === 'returned_home'
          ? `Back home from ${destination}.`
          : `${recentTrip.intent?.label || 'Trip'} to ${destination} finished recently.`,
      ]),
    });
  }

  if (visitorContext) {
    const householdView = visitorContext.advice
      ? `${visitorContext.person} visiting ${formatDateLabel(visitorContext.start)}. ${visitorContext.advice}`
      : `${visitorContext.person} visiting ${formatDateLabel(visitorContext.start)}.`;
    const score = Math.max(58, 78 - Math.max(0, diffDays(visitorContext.start, new Date()) * 5));
    candidates.push({
      id: 'visitor',
      score,
      headline: 'Visitor context',
      householdView,
      bullets: uniqueTexts([
        `${visitorContext.person} visiting ${formatDateLabel(visitorContext.start)}.`,
        visitorContext.homeForecast?.label ? `Home weather then: ${visitorContext.homeForecast.label}.` : '',
        visitorContext.advice || '',
      ]),
    });
  }

  if (birthdayContext) {
    const householdView = birthdayContext.isToday
      ? `${birthdayContext.memberName} turns ${birthdayContext.turning} today.`
      : (birthdayContext.isTomorrow
        ? `${birthdayContext.memberName} turns ${birthdayContext.turning} tomorrow.`
        : `${birthdayContext.memberName}'s birthday is ${formatDateLabel(birthdayContext.nextOccurrence)}.`);
    const score = birthdayContext.isToday ? 96 : (birthdayContext.isTomorrow ? 84 : Math.max(60, 78 - birthdayContext.daysUntil));
    candidates.push({
      id: 'birthday',
      score,
      headline: 'Birthday reminder',
      householdView,
      bullets: uniqueTexts([
        birthdayContext.isToday
          ? `${birthdayContext.memberName} turns ${birthdayContext.turning} today.`
          : (birthdayContext.isTomorrow
            ? `${birthdayContext.memberName} turns ${birthdayContext.turning} tomorrow.`
            : `${birthdayContext.memberName} turns ${birthdayContext.turning} on ${formatDateLabel(birthdayContext.nextOccurrence)}.`),
      ]),
    });
  }

  if (commuteContext) {
    const commuteHours = hoursUntil(commuteContext.start);
    const weatherRisk = commuteContext.forecast?.weatherCode !== undefined && weatherNeedsIndoorPlan(commuteContext.forecast.weatherCode);
    const score = Math.max(55, 82 - Math.max(0, commuteHours)) + (weatherRisk ? 8 : 0);
    candidates.push({
      id: 'commute',
      score,
      headline: 'Commute context',
      householdView: commuteContext.advice || `${commuteContext.memberName} has a commute planned.`,
      bullets: uniqueTexts([
        `${commuteContext.memberName}: ${commuteContext.eventTitle} on ${formatDateLabel(commuteContext.start)}.`,
        commuteContext.route?.durationMinutes
          ? `${commuteContext.placeLabel} is about ${commuteContext.route.durationMinutes} min from home.`
          : (commuteContext.distanceKm !== null ? `${commuteContext.placeLabel} is about ${commuteContext.distanceKm} km from home.` : ''),
        commuteContext.forecast?.label ? `${commuteContext.placeLabel} weather: ${commuteContext.forecast.label}.` : '',
        commuteContext.advice || '',
      ]),
    });
  }

  if (householdEventContext) {
    const startLabel = formatDateLabel(householdEventContext.start);
    const placeSuffix = householdEventContext.matchedPlace?.name ? ` at ${householdEventContext.matchedPlace.name}` : '';
    const eventHours = hoursUntil(householdEventContext.start);
    let householdView = `${householdEventContext.title}${placeSuffix} is planned ${startLabel}.`;
    let score = Math.max(48, 74 - Math.max(0, Math.round(eventHours / 6)));

    if (householdEventContext.type === 'holiday') {
      householdView = householdEventContext.advice
        ? `${householdEventContext.title} is on ${startLabel}. ${householdEventContext.advice}`
        : `${householdEventContext.title} is on ${startLabel}.`;
      score += 4;
    } else if (householdEventContext.type === 'delivery' || householdEventContext.type === 'garbage_pickup') {
      householdView = householdEventContext.advice
        ? `${householdEventContext.title} is due ${startLabel}. ${householdEventContext.advice}`
        : `${householdEventContext.title} is due ${startLabel}.`;
      score += eventHours <= 24 ? 12 : 6;
    } else if (householdEventContext.type === 'overnight_guest') {
      householdView = householdEventContext.advice
        ? `${householdEventContext.title} starts ${startLabel}. ${householdEventContext.advice}`
        : `${householdEventContext.title} starts ${startLabel}.`;
      score += 8;
    } else if (householdEventContext.type === 'school_event' || householdEventContext.type === 'outdoor_plan') {
      householdView = householdEventContext.advice
        ? `${householdEventContext.title}${placeSuffix} is planned ${startLabel}. ${householdEventContext.advice}`
        : `${householdEventContext.title}${placeSuffix} is planned ${startLabel}.`;
      score += householdEventContext.placeForecast?.weatherCode !== undefined
        && weatherNeedsIndoorPlan(householdEventContext.placeForecast.weatherCode) ? 8 : 3;
    } else if (householdEventContext.type === 'birthday') {
      householdView = `${householdEventContext.title} is coming up ${startLabel}.`;
      score += 8;
    } else if (householdEventContext.type === 'anniversary') {
      householdView = `${householdEventContext.title} is on ${startLabel}.`;
      score += 6;
    }

    candidates.push({
      id: 'household_event',
      score,
      headline: 'Household brief',
      householdView,
      bullets: uniqueTexts([
        `${householdEventContext.title}${placeSuffix} on ${startLabel}.`,
        householdEventContext.route?.durationMinutes
          ? `${householdEventContext.matchedPlace?.name || 'Destination'} is about ${householdEventContext.route.durationMinutes} min from home.`
          : '',
        householdEventContext.placeForecast?.label
          ? `${householdEventContext.matchedPlace?.name || 'Destination'} weather: ${householdEventContext.placeForecast.label}.`
          : '',
        householdEventContext.homeForecast?.label ? `Home weather then: ${householdEventContext.homeForecast.label}.` : '',
        householdEventContext.advice || '',
      ]),
    });
  }

  if (highlightEventContext) {
    const start = new Date(highlightEventContext.start);
    const dayOffset = diffDays(start, new Date());
    const whenLabel = dayOffset <= 0
      ? `today${highlightEventContext.isAllDay ? '' : ` at ${start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}`
      : (dayOffset === 1
        ? `tomorrow${highlightEventContext.isAllDay ? '' : ` at ${start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}`
        : `on ${formatDateLabel(highlightEventContext.start)}`);
    const prepLike = /\b(setup|prep|preparation|conference|meeting|presentation|overview|tickets?|concert|show|festival|dinner|lunch)\b/i;
    const householdView = prepLike.test(highlightEventContext.title)
      ? `${highlightEventContext.title} is coming up ${whenLabel}.`
      : `Keep ${highlightEventContext.title} in mind ${whenLabel}.`;

    candidates.push({
      id: 'highlight_event',
      score: Math.max(58, highlightEventContext.score + 18),
      headline: 'Daily brief',
      householdView,
      bullets: uniqueTexts([
        prepLike.test(highlightEventContext.title)
          ? `Think about ${highlightEventContext.title} ${whenLabel}.`
          : `${highlightEventContext.title} ${whenLabel}.`,
      ]),
    });
  }

  const skipNextEventBullet = nextEvent && (
    nextEvent.id === visitorContext?.sourceEventId
    || nextEvent.id === householdEventContext?.sourceEventId
    || nextEvent.id === commuteContext?.sourceEventId
  );

  if (nextEvent && !skipNextEventBullet) {
    const start = new Date(nextEvent.start);
    const startLabel = nextEvent.isAllDay
      ? start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      : start.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const score = Math.max(30, 54 - Math.max(0, hoursUntil(nextEvent.start)));
    const householdView = buildNextEventHouseholdView(nextEvent);
    candidates.push({
      id: 'next_event',
      score,
      headline: 'Next up',
      householdView,
      bullets: [`Next: ${nextEvent.title} on ${startLabel}.`],
    });
  }

  return candidates.sort((left, right) => right.score - left.score);
};

const buildHouseholdMessage = (activeTrip, nextEvent, recentTrip, visitorContext, birthdayContext, commuteContext, householdEventContext) => (
  buildContextCandidates(
    [],
    activeTrip,
    nextEvent,
    recentTrip,
    visitorContext,
    birthdayContext,
    commuteContext,
    householdEventContext,
    null,
  )[0]?.householdView || ''
);

const buildNextEventHouseholdView = (event) => {
  if (!event) {
    return '';
  }

  const title = (event.title || '').trim();
  if (!title) {
    return '';
  }

  if (isLowValueRoutineEvent(event)) {
    return '';
  }

  const start = new Date(event.start);
  const dayOffset = diffDays(start, new Date());
  const whenLabel = dayOffset <= 0 ? 'today' : (dayOffset === 1 ? 'tomorrow' : `on ${formatDateLabel(event.start)}`);
  const timeLabel = event.isAllDay
    ? ''
    : ` at ${start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

  if (/\b(repair|repairs|sanit[aä]r|plumber|maintenance|technician|service)\b/i.test(title)) {
    return `Prepare for ${title} ${whenLabel}.`;
  }

  if (/\b(start arbeiten|start work|shift|dienst|arbeit)\b/i.test(title) && !event.isAllDay) {
    return `${title} ${whenLabel}${timeLabel}.`;
  }

  if (ONLINE_EVENT_PATTERN.test(title)) {
    return `${title} ${whenLabel}${timeLabel}.`;
  }

  return dayOffset <= 1 ? `${title} ${whenLabel}${timeLabel}.` : '';
};

const buildDailyBrief = (events, activeTrip, nextEvent, recentTrip, visitorContext, birthdayContext, commuteContext, householdEventContext, config) => {
  const highlightEventContext = buildHighlightEventContext(events, config);
  const candidates = buildContextCandidates(
    events,
    activeTrip,
    nextEvent,
    recentTrip,
    visitorContext,
    birthdayContext,
    commuteContext,
    householdEventContext,
    highlightEventContext,
  );
  const primary = candidates[0] || null;
  const bullets = uniqueTexts(candidates.flatMap((candidate) => candidate.bullets)).slice(0, 3);

  return {
    headline: primary?.headline || 'Daily brief',
    bullets: bullets.length > 0 ? bullets : (events.length > 1 ? [`${events.length} upcoming calendar items are on the mirror.`] : []),
    householdView: primary?.householdView || '',
  };
};

const CONTEXT_HEADLINE_TRANSLATIONS = {
  de: {
    'Travel update': 'Reise-Update',
    'Visitor context': 'Besuchsinfo',
    'Birthday reminder': 'Geburtstag',
    'Commute context': 'Pendeln',
    'Household brief': 'Haushaltsinfo',
    'Next up': 'Als Nächstes',
    'Daily brief': 'Tagesüberblick',
  },
};

const translateContextText = (text, locale) => {
  if (!text || locale !== 'de') {
    return text;
  }

  const exact = CONTEXT_HEADLINE_TRANSLATIONS.de[text];
  if (exact) {
    return exact;
  }

  return text
    .replace(/^Back home from (.+)\.$/, 'Zurueck aus $1.')
    .replace(/^Returning home from (.+)\.$/, 'Auf dem Rueckweg aus $1.')
    .replace(/^Prepare for (.+) tomorrow\.$/, 'Vorbereitung fuer $1 morgen.')
    .replace(/^Prepare for (.+) today\.$/, 'Vorbereitung fuer $1 heute.')
    .replace(/^No upcoming events$/, 'Keine anstehenden Termine')
    .replace(/^Upcoming Events$/, 'Naechste Termine')
    .replace(/^Travel update$/, 'Reise-Update')
    .replace(/^Birthday reminder$/, 'Geburtstag')
    .replace(/^Next: (.+) on (.+)\.$/, 'Als Naechstes: $1 am $2.')
    .replace(/^Updated /, 'Aktualisiert ');
};

const localizeContextPayload = (payload, locale) => {
  if (!payload || locale !== 'de') {
    return payload;
  }

  const nextPayload = clone(payload);
  if (nextPayload.brief) {
    nextPayload.brief.headline = translateContextText(nextPayload.brief.headline, locale);
    nextPayload.brief.householdView = translateContextText(nextPayload.brief.householdView, locale);
    nextPayload.brief.bullets = Array.isArray(nextPayload.brief.bullets)
      ? nextPayload.brief.bullets.map((bullet) => translateContextText(bullet, locale))
      : [];
  }
  return nextPayload;
};

const isLocalBaseUrl = (baseUrl = '') => {
  try {
    const hostname = new URL(baseUrl).hostname;
    return LOCAL_HOST_PATTERNS.includes(hostname) || hostname.endsWith('.local');
  } catch (error) {
    return false;
  }
};

const redactEventForLlm = (event, privacyMode) => {
  if (privacyMode === 'full' || privacyMode === 'local-only') {
    return {
      title: event.title,
      description: event.description,
      location: event.location,
      start: event.start,
      end: event.end,
      isAllDay: event.isAllDay,
      calendarSummary: event.calendarSummary,
    };
  }

  return {
    title: event.title,
    location: event.location,
    start: event.start,
    end: event.end,
    isAllDay: event.isAllDay,
    calendarSummary: event.calendarSummary,
  };
};

const LLM_SELECTION_DECISIONS = new Set(['ignore', 'calendar_only', 'needs_enrichment']);
const LLM_ENRICHMENT_TYPES = new Set([
  'ticket_sale',
  'concert',
  'travel',
  'route_weather',
  'delivery',
  'household_prep',
  'generic',
]);

const TICKET_SIGNAL_PATTERN = /\b(ticket|tickets|presale|pre-sale|on sale|onsale|vorverkauf)\b/i;
const CONCERT_SIGNAL_PATTERN = /\b(concert|show|gig|tour|festival|live)\b/i;
const HOUSEHOLD_PREP_SIGNAL_PATTERN = /\b(setup|prep|preparation|conference|meeting|presentation|overview|delivery|pickup)\b/i;
const URL_PATTERN = /https?:\/\/[^\s)]+/gi;
const TICKET_SELLER_PATTERNS = [
  { label: 'Ticketmaster', pattern: /\bticketmaster\b/i },
  { label: 'Eventim', pattern: /\beventim\b/i },
  { label: 'Live Nation', pattern: /\blive nation\b/i },
  { label: 'Bandsintown', pattern: /\bbandsintown\b/i },
  { label: 'Songkick', pattern: /\bsongkick\b/i },
];
const CITY_HINT_PATTERNS = [
  ['Hamburg', /\bhamburg\b/i],
  ['Berlin', /\bberlin\b/i],
  ['Muenchen', /\b(muenchen|munich)\b/i],
  ['Frankfurt', /\bfrankfurt\b/i],
  ['Koeln', /\b(koeln|cologne)\b/i],
  ['Leipzig', /\bleipzig\b/i],
  ['Stuttgart', /\bstuttgart\b/i],
  ['Duesseldorf', /\b(duesseldorf|düsseldorf)\b/i],
  ['Hannover', /\bhannover\b/i],
  ['Dresden', /\bdresden\b/i],
  ['Bremen', /\bbremen\b/i],
  ['Nuernberg', /\b(nuernberg|nürnberg|nuremberg)\b/i],
];
const BRIEF_STOP_WORDS = new Set([
  'der', 'die', 'das', 'und', 'mit', 'fuer', 'für', 'von', 'den', 'dem', 'des', 'ist', 'im', 'am', 'um',
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'auf', 'bei', 'zum', 'zur', 'ein', 'eine', 'einer',
  'today', 'tomorrow', 'heute', 'morgen', 'freitag', 'samstag', 'sonntag', 'montag', 'dienstag', 'mittwoch',
  'donnerstag', 'maerz', 'märz', 'ticket', 'tickets', 'source', 'known', 'city', 'cities', 'hints', 'hint',
  'venue', 'likely',
]);

const getEventCombinedText = (event) => [
  event.title || '',
  event.description || '',
  event.location || '',
  event.calendarSummary || '',
].join('\n');

const detectSuggestedEnrichmentType = (event) => {
  const combinedText = getEventCombinedText(event);

  if (TICKET_SIGNAL_PATTERN.test(combinedText)) {
    return 'ticket_sale';
  }
  if (TRAVEL_SIGNAL_PATTERN.test(combinedText)) {
    return 'travel';
  }
  if (CONCERT_SIGNAL_PATTERN.test(combinedText)) {
    return 'concert';
  }
  if (HOUSEHOLD_EVENT_PATTERNS.delivery.test(combinedText)) {
    return 'delivery';
  }
  if ((event.location || '').trim() || WEATHER_SENSITIVE_LOCAL_EVENT_PATTERNS.test(combinedText)) {
    return 'route_weather';
  }
  if (HOUSEHOLD_PREP_SIGNAL_PATTERN.test(combinedText)) {
    return 'household_prep';
  }

  return 'generic';
};

const redactEventForLlmSelection = (event, privacyMode) => ({
  id: event.id,
  suggestedEnrichmentType: detectSuggestedEnrichmentType(event),
  ...redactEventForLlm(event, privacyMode),
});

const buildLlmSelectorPrompt = ({ events, activeTrip, nextEvent, config }) => {
  const locale = config.system?.displayLocale === 'de' ? 'de' : 'en';
  const promptPayload = {
    generatedAt: new Date().toISOString(),
    systemTimezone: config.system.timezone || 'UTC',
    displayLocale: locale,
    activeTrip: activeTrip
      ? {
        destination: activeTrip.enrichment?.destination || activeTrip.destination,
        phase: activeTrip.phase?.label || '',
        transportSummary: activeTrip.transportSummary || '',
      }
      : null,
    nextEvent: nextEvent
      ? {
        id: nextEvent.id,
        title: nextEvent.title,
        start: nextEvent.start,
        isAllDay: nextEvent.isAllDay,
        calendarSummary: nextEvent.calendarSummary,
      }
      : null,
    events,
  };

  return [
    'You are selecting calendar entries for additional smart-mirror enrichment.',
    'Return valid JSON only.',
    'Schema:',
    '{"items":[{"eventId":"string","decision":"ignore|calendar_only|needs_enrichment","enrichmentType":"ticket_sale|concert|travel|route_weather|delivery|household_prep|generic","why":"string"}]}',
    'Rules:',
    '- Decide whether each event needs additional value beyond what the calendar already shows.',
    '- Mark events as "calendar_only" if the calendar entry itself is enough and no extra facts are likely needed.',
    '- Mark events as "needs_enrichment" only when extra information would clearly improve the mirror.',
    '- Prefer ticket drops, travel, route/weather-sensitive plans, deliveries, and events that likely need outside context.',
    '- Ignore routine lessons, repeated appointments, and simple reminders.',
    '- Do not write user-facing mirror copy.',
    '- Output one JSON object and nothing else.',
    JSON.stringify(promptPayload, null, 2),
  ].join('\n');
};

const normalizeSelectionDecision = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return LLM_SELECTION_DECISIONS.has(normalized) ? normalized : null;
};

const normalizeEnrichmentType = (value) => {
  if (typeof value !== 'string') {
    return 'generic';
  }
  const normalized = value.trim().toLowerCase();
  return LLM_ENRICHMENT_TYPES.has(normalized) ? normalized : 'generic';
};

const validateLlmSelection = (payload, sourceEvents) => {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) {
    return null;
  }

  const validIds = new Set(sourceEvents.map((event) => event.id));
  const seenIds = new Set();
  const items = payload.items
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const eventId = typeof item.eventId === 'string' ? item.eventId.trim() : '';
      const decision = normalizeSelectionDecision(item.decision);
      if (!eventId || !decision || !validIds.has(eventId) || seenIds.has(eventId)) {
        return null;
      }
      seenIds.add(eventId);

      return {
        eventId,
        decision,
        enrichmentType: normalizeEnrichmentType(item.enrichmentType),
        why: typeof item.why === 'string' ? item.why.trim() : '',
      };
    })
    .filter(Boolean);

  return { items };
};

const buildFallbackLlmSelection = (sourceEvents) => ({
  items: sourceEvents.map((event) => {
    const enrichmentType = detectSuggestedEnrichmentType(event);
    const interesting = !isLowValueRoutineEvent(event) && scoreEventInterest(event) >= 18;
    return {
      eventId: event.id,
      decision: interesting && enrichmentType !== 'generic' ? 'needs_enrichment' : (interesting ? 'calendar_only' : 'ignore'),
      enrichmentType,
      why: interesting && enrichmentType !== 'generic'
        ? `detected_${enrichmentType}`
        : (interesting ? 'calendar_is_already_sufficient' : 'not_useful_for_brief'),
    };
  }),
});

const extractTicketSeller = (text) => {
  const match = TICKET_SELLER_PATTERNS.find((entry) => entry.pattern.test(text || ''));
  return match?.label || '';
};

const extractCities = (text) => CITY_HINT_PATTERNS
  .filter(([, pattern]) => pattern.test(text || ''))
  .map(([city]) => city);

const extractUrls = (text) => Array.from(new Set(((text || '').match(URL_PATTERN) || []).map((url) => url.trim())));

const extractUrlDomains = (urls) => urls.map((value) => {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch (error) {
    return '';
  }
}).filter(Boolean);

const extractVenueHint = (location = '') => {
  const lines = location.split('\n').map((line) => line.trim()).filter(Boolean);
  const candidate = lines.find((line) => /[A-Za-zÄÖÜäöü]/.test(line) && !STREET_ADDRESS_PATTERN.test(line));
  return candidate || '';
};

const buildInsightFactsFromContext = (event, activeTrip, recentTrip, commuteContext, householdEventContext) => {
  if (commuteContext?.sourceEventId === event.id) {
    return {
      type: 'route_weather',
      sources: ['commute_context'],
      addedFacts: uniqueTexts([
        commuteContext.route?.durationMinutes ? `${commuteContext.placeLabel} is about ${commuteContext.route.durationMinutes} min from home.` : '',
        commuteContext.forecast?.label ? `${commuteContext.placeLabel} weather: ${commuteContext.forecast.label}.` : '',
        commuteContext.advice || '',
      ]),
    };
  }

  if (householdEventContext?.sourceEventId === event.id) {
    return {
      type: householdEventContext.type === 'delivery' || householdEventContext.type === 'garbage_pickup'
        ? 'delivery'
        : 'route_weather',
      sources: ['household_event_context'],
      addedFacts: uniqueTexts([
        householdEventContext.route?.durationMinutes
          ? `${householdEventContext.matchedPlace?.name || 'Destination'} is about ${householdEventContext.route.durationMinutes} min from home.`
          : '',
        householdEventContext.placeForecast?.label
          ? `${householdEventContext.matchedPlace?.name || 'Destination'} weather: ${householdEventContext.placeForecast.label}.`
          : '',
        householdEventContext.homeForecast?.label ? `Home weather then: ${householdEventContext.homeForecast.label}.` : '',
        householdEventContext.advice || '',
      ]),
    };
  }

  const relatedTrip = [activeTrip, recentTrip].find((trip) => Array.isArray(trip?.sourceEventIds) && trip.sourceEventIds.includes(event.id));
  if (relatedTrip) {
    const destination = relatedTrip.enrichment?.destination || relatedTrip.destination;
    return {
      type: 'travel',
      sources: ['trip_context'],
      addedFacts: uniqueTexts([
        relatedTrip.transportLifecycle?.label || '',
        relatedTrip.transportSummary || '',
        relatedTrip.enrichment?.forecast?.label ? `${destination} weather: ${relatedTrip.enrichment.forecast.label}.` : '',
        relatedTrip.enrichment?.currentTime ? `Local time there is ${relatedTrip.enrichment.currentTime}.` : '',
      ]),
    };
  }

  return null;
};

const buildInsightFactsFromEventDetails = (event, enrichmentType) => {
  const combinedText = getEventCombinedText(event);
  const urls = extractUrls(combinedText);
  const urlDomains = extractUrlDomains(urls);
  const cities = extractCities(combinedText);
  const venue = extractVenueHint(event.location || '');
  const seller = extractTicketSeller(combinedText) || extractTicketSeller(urlDomains.join(' '));

  if (enrichmentType === 'ticket_sale') {
    const addedFacts = uniqueTexts([
      seller ? `Likely ticket source: ${seller}.` : '',
      cities.length ? `Known city hints: ${cities.slice(0, 4).join(', ')}.` : '',
      venue ? `Venue hint: ${venue}.` : '',
      urlDomains.length ? `Source links mention: ${urlDomains.slice(0, 2).join(', ')}.` : '',
    ]);

    return addedFacts.length > 0 ? { type: 'ticket_sale', sources: ['event_metadata'], addedFacts } : null;
  }

  if (enrichmentType === 'concert') {
    const addedFacts = uniqueTexts([
      venue ? `Venue hint: ${venue}.` : '',
      cities.length ? `Known city hints: ${cities.slice(0, 4).join(', ')}.` : '',
      seller ? `Ticket source hint: ${seller}.` : '',
      urlDomains.length ? `Source links mention: ${urlDomains.slice(0, 2).join(', ')}.` : '',
    ]);

    return addedFacts.length > 0 ? { type: 'concert', sources: ['event_metadata'], addedFacts } : null;
  }

  return null;
};

const buildEnrichedBriefInsights = ({
  selections,
  sourceEvents,
  activeTrip,
  recentTrip,
  commuteContext,
  householdEventContext,
}) => {
  const eventMap = new Map(sourceEvents.map((event) => [event.id, event]));
  const insightDebug = [];
  const insights = [];

  selections.items
    .filter((item) => item.decision === 'needs_enrichment')
    .forEach((item) => {
      const event = eventMap.get(item.eventId);
      if (!event) {
        return;
      }

      const suggestedType = item.enrichmentType === 'generic' ? detectSuggestedEnrichmentType(event) : item.enrichmentType;
      const contextual = buildInsightFactsFromContext(event, activeTrip, recentTrip, commuteContext, householdEventContext);
      const metadata = buildInsightFactsFromEventDetails(event, suggestedType);
      const addedFacts = uniqueTexts([
        ...(contextual?.addedFacts || []),
        ...(metadata?.addedFacts || []),
      ]);
      const resolvedType = metadata?.type || contextual?.type || suggestedType;
      const sources = Array.from(new Set([
        ...(contextual?.sources || []),
        ...(metadata?.sources || []),
      ]));

      const insight = {
        eventId: event.id,
        eventTitle: event.title,
        eventStart: event.start,
        isAllDay: Boolean(event.isAllDay),
        enrichmentType: resolvedType,
        why: item.why,
        addedFacts,
        sources,
      };

      if (addedFacts.length > 0) {
        insights.push(insight);
        insightDebug.push({ ...insight, include: true });
      } else {
        insightDebug.push({
          ...insight,
          include: false,
          reason: 'no_non_calendar_facts_available',
        });
      }
    });

  return { insights, insightDebug };
};

const buildLlmComposerPrompt = ({ insights, config }) => {
  const locale = config.system?.displayLocale === 'de' ? 'de' : 'en';
  const promptPayload = {
    generatedAt: new Date().toISOString(),
    systemTimezone: config.system.timezone || 'UTC',
    displayLocale: locale,
    insights,
    instruction: 'Write only value beyond what the calendar already shows. Use only the verified addedFacts.',
  };

  return [
    'You are generating short smart-mirror context from pre-filtered insights.',
    'Return valid JSON only.',
    'Schema:',
    '{"headline":"string","bullets":["string"],"householdView":"string","priority":"low|normal|high"}',
    'Rules:',
    '- Maximum 4 bullets.',
    '- Keep each bullet under 110 characters.',
    '- Write all user-facing text in German.',
    '- Do not restate a calendar title/time by itself.',
    '- Mention an event only when you add specific value from addedFacts.',
    '- Use only facts from addedFacts. Do not guess or browse.',
    '- If no insight contains meaningful added value, return an empty bullets array and an empty householdView.',
    '- Output one JSON object and nothing else.',
    JSON.stringify(promptPayload, null, 2),
  ].join('\n');
};

const normalizeBriefText = (value) => (value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokenizeBriefText = (value) => normalizeBriefText(value)
  .split(' ')
  .filter((token) => token.length >= 3 && !BRIEF_STOP_WORDS.has(token));

const bulletMatchesInsightTitle = (bullet, insight) => {
  const bulletText = normalizeBriefText(bullet);
  const titleTokens = tokenizeBriefText(insight.eventTitle);
  if (titleTokens.length === 0) {
    return false;
  }
  const matches = titleTokens.filter((token) => bulletText.includes(token));
  return matches.length >= Math.min(2, titleTokens.length);
};

const bulletUsesInsightFacts = (bullet, insight) => {
  const bulletText = normalizeBriefText(bullet);
  const factTokens = insight.addedFacts.flatMap((fact) => tokenizeBriefText(fact));
  if (factTokens.length === 0) {
    return false;
  }
  return factTokens.some((token) => bulletText.includes(token));
};

const filterLlmBriefAgainstInsights = (brief, insights) => {
  if (!brief) {
    return null;
  }

  const filteredBullets = (Array.isArray(brief.bullets) ? brief.bullets : [])
    .filter((bullet) => {
      const matchingInsight = insights.find((insight) => bulletMatchesInsightTitle(bullet, insight));
      if (!matchingInsight) {
        return true;
      }
      return bulletUsesInsightFacts(bullet, matchingInsight);
    });

  const householdView = typeof brief.householdView === 'string'
    ? brief.householdView.trim()
    : '';
  const filteredHouseholdView = insights.some((insight) => bulletMatchesInsightTitle(householdView, insight) && !bulletUsesInsightFacts(householdView, insight))
    ? ''
    : householdView;

  return {
    ...brief,
    bullets: filteredBullets,
    householdView: filteredHouseholdView,
  };
};

const extractTextContent = (value) => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (typeof entry?.text === 'string') {
        return entry.text;
      }
      if (entry?.type === 'text' && typeof entry.text === 'string') {
        return entry.text;
      }
      if (typeof entry?.content === 'string') {
        return entry.content;
      }
      if (typeof entry?.output_text === 'string') {
        return entry.output_text;
      }
      return '';
    }).join('\n');
  }

  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') {
      return value.text;
    }
    if (typeof value.output_text === 'string') {
      return value.output_text;
    }
  }

  return '';
};

const normalizeJsonText = (text) => {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  return trimmed;
};

const extractBalancedJsonObject = (text) => {
  const source = normalizeJsonText(text);
  const firstBrace = source.indexOf('{');
  if (firstBrace < 0) {
    return source;
  }

  let inString = false;
  let escaping = false;
  let depth = 0;
  let lastBalancedIndex = -1;

  for (let index = firstBrace; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        lastBalancedIndex = index;
        break;
      }
    }
  }

  if (lastBalancedIndex >= firstBrace) {
    return source.slice(firstBrace, lastBalancedIndex + 1);
  }

  const partial = source.slice(firstBrace);
  const opened = (partial.match(/{/g) || []).length;
  const closed = (partial.match(/}/g) || []).length;
  if (opened > closed && !inString) {
    return `${partial}${'}'.repeat(opened - closed)}`;
  }

  return partial;
};

const parseLlmJson = (text) => {
  const candidate = extractBalancedJsonObject(text);
  return JSON.parse(candidate);
};

const validateLlmBrief = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const headline = typeof payload.headline === 'string' && payload.headline.trim()
    ? payload.headline.trim()
    : null;
  const bullets = Array.isArray(payload.bullets)
    ? payload.bullets.map((item) => item.toString().trim()).filter(Boolean).slice(0, 4)
    : [];

  if (!headline && bullets.length === 0) {
    return null;
  }

  return {
    headline: headline || 'Daily brief',
    bullets,
    householdView: typeof payload.householdView === 'string' ? payload.householdView.trim() : '',
    priority: typeof payload.priority === 'string' ? payload.priority : 'normal',
  };
};

const callOpenAiCompatible = async ({ baseUrl, apiKey, model, prompt }) => {
  const response = await axios.post(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    model,
    messages: [
      { role: 'system', content: 'Respond with JSON only.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  }, {
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    timeout: 20000,
  });

  return {
    text: extractTextContent(response.data?.choices?.[0]?.message?.content),
    payload: response.data,
  };
};

const callAnthropic = async ({ apiKey, model, prompt }) => {
  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model,
    max_tokens: 500,
    temperature: 0.2,
    system: 'Return valid JSON only.',
    messages: [
      { role: 'user', content: prompt },
    ],
  }, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    timeout: 20000,
  });

  return {
    text: extractTextContent(response.data?.content),
    payload: response.data,
  };
};

const GOOGLE_BRIEF_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    bullets: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    householdView: { type: 'STRING' },
    priority: { type: 'STRING' },
  },
  required: ['headline', 'bullets'],
};

const GOOGLE_SELECTOR_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          eventId: { type: 'STRING' },
          decision: { type: 'STRING' },
          enrichmentType: { type: 'STRING' },
          why: { type: 'STRING' },
        },
        required: ['eventId', 'decision'],
      },
    },
  },
  required: ['items'],
};

const callGoogleGenerativeAi = async ({ apiKey, model, prompt, responseSchema = GOOGLE_BRIEF_RESPONSE_SCHEMA }) => {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${prompt}\n\nReturn valid JSON only.` }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema,
      },
    },
    {
      params: { key: apiKey },
      headers: { 'content-type': 'application/json' },
      timeout: 20000,
    },
  );

  return {
    text: extractTextContent(response.data?.candidates?.[0]?.content?.parts),
    payload: response.data,
  };
};

const callLlmProvider = async ({ provider, apiKey, model, baseUrl, prompt, responseSchema = GOOGLE_BRIEF_RESPONSE_SCHEMA }) => {
  if (provider === 'anthropic') {
    return callAnthropic({ apiKey, model, prompt });
  }
  if (provider === 'google') {
    return callGoogleGenerativeAi({ apiKey, model, prompt, responseSchema });
  }
  if (provider === 'custom') {
    return callOpenAiCompatible({
      baseUrl: baseUrl || 'http://127.0.0.1:11434/v1',
      apiKey,
      model,
      prompt,
    });
  }

  return callOpenAiCompatible({
    baseUrl: baseUrl || 'https://api.openai.com/v1',
    apiKey,
    model,
    prompt,
  });
};

const generateLlmBrief = async ({
  calendarCache,
  config,
  secrets,
  activeTrip,
  recentTrip,
  nextEvent,
  commuteContext,
  householdEventContext,
  existingContext,
  force,
}) => {
  const llmConfig = config.services.llm || {};
  if (!llmConfig.enabled) {
    return {
      updatedAt: new Date().toISOString(),
      provider: llmConfig.provider || 'openai',
      status: 'disabled',
      brief: null,
      debug: {
        provider: llmConfig.provider || 'openai',
        model: llmConfig.model || 'gpt-5-mini',
        enabled: false,
      },
    };
  }

  const refreshHours = Number(llmConfig.refreshHours) || 3;
  const existingLlm = existingContext?.llm;
  const isFresh = existingLlm?.updatedAt
    && (Date.now() - new Date(existingLlm.updatedAt).getTime()) < (refreshHours * 3600000);

  if (!force && isFresh && existingLlm?.brief) {
    return existingLlm;
  }

  const provider = llmConfig.provider || 'openai';
  const model = llmConfig.model || 'gpt-5-mini';
  const privacyMode = llmConfig.privacyMode || 'cloud-redacted';
  const baseUrl = (llmConfig.baseUrl || '').trim();
  const apiKey = secrets.llm?.apiKey || '';

  if (!apiKey && provider !== 'custom') {
    return {
      updatedAt: new Date().toISOString(),
      provider,
      status: 'skipped',
      reason: 'missing_api_key',
      brief: null,
      debug: {
        provider,
        model,
        privacyMode,
        enabled: true,
        status: 'skipped',
        reason: 'missing_api_key',
      },
    };
  }

  if (privacyMode === 'local-only' && provider !== 'custom') {
    return {
      updatedAt: new Date().toISOString(),
      provider,
      status: 'skipped',
      reason: 'local_only_requires_custom_provider',
      brief: null,
      debug: {
        provider,
        model,
        privacyMode,
        enabled: true,
        status: 'skipped',
        reason: 'local_only_requires_custom_provider',
      },
    };
  }

  if (privacyMode === 'local-only' && !isLocalBaseUrl(baseUrl)) {
    return {
      updatedAt: new Date().toISOString(),
      provider,
      status: 'skipped',
      reason: 'custom_provider_not_local',
      brief: null,
      debug: {
        provider,
        model,
        privacyMode,
        enabled: true,
        status: 'skipped',
        reason: 'custom_provider_not_local',
      },
    };
  }

  const selectionAnalysis = calendarCache.events.map((event) => {
    const decision = explainBriefEventSelection(event, config);
    return {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      isRecurring: event.isRecurring,
      isAllDay: event.isAllDay,
      include: decision.include,
      reason: decision.reason,
    };
  });
  const selectedSourceEvents = getRelevantBriefEvents(calendarCache.events, config, 18);
  const selectorSourceEvents = selectedSourceEvents.length > 0 ? selectedSourceEvents : calendarCache.events.slice(0, 12);
  const selectorInputEvents = selectorSourceEvents.map((event) => redactEventForLlmSelection(event, privacyMode));
  const selectorPrompt = buildLlmSelectorPrompt({ events: selectorInputEvents, activeTrip, nextEvent, config });
  let selectorRawText = '';
  let selectorProviderPayload = null;
  let composerRawText = '';
  let composerProviderPayload = null;
  let composerPrompt = '';

  try {
    const selectorResult = await callLlmProvider({
      provider,
      apiKey,
      model,
      baseUrl,
      prompt: selectorPrompt,
      responseSchema: GOOGLE_SELECTOR_RESPONSE_SCHEMA,
    });
    selectorRawText = selectorResult.text;
    selectorProviderPayload = selectorResult.payload;

    if (!selectorRawText || !selectorRawText.trim()) {
      const detail = provider === 'google'
        ? JSON.stringify({
          promptFeedback: selectorProviderPayload?.promptFeedback || null,
          finishReason: selectorProviderPayload?.candidates?.[0]?.finishReason || null,
          finishMessage: selectorProviderPayload?.candidates?.[0]?.finishMessage || null,
          safetyRatings: selectorProviderPayload?.candidates?.[0]?.safetyRatings || null,
        })
        : 'no_text_content';
      const error = new Error(`${provider}_selector_empty_response ${detail}`);
      error.providerPayload = selectorProviderPayload;
      throw error;
    }

    let parsedSelection = null;
    try {
      parsedSelection = validateLlmSelection(parseLlmJson(selectorRawText), selectorSourceEvents);
    } catch (error) {
      parsedSelection = null;
    }
    parsedSelection = parsedSelection || buildFallbackLlmSelection(selectorSourceEvents);
    const { insights, insightDebug } = buildEnrichedBriefInsights({
      selections: parsedSelection,
      sourceEvents: selectorSourceEvents,
      activeTrip,
      recentTrip,
      commuteContext,
      householdEventContext,
    });
    composerPrompt = buildLlmComposerPrompt({ insights, config });

    const composerResult = insights.length > 0
      ? await callLlmProvider({
        provider,
        apiKey,
        model,
        baseUrl,
        prompt: composerPrompt,
        responseSchema: GOOGLE_BRIEF_RESPONSE_SCHEMA,
      })
      : { text: '{"headline":"Daily brief","bullets":[],"householdView":"","priority":"low"}', payload: null };
    composerRawText = composerResult.text;
    composerProviderPayload = composerResult.payload;

    if (!composerRawText || !composerRawText.trim()) {
      const detail = provider === 'google'
        ? JSON.stringify({
          promptFeedback: composerProviderPayload?.promptFeedback || null,
          finishReason: composerProviderPayload?.candidates?.[0]?.finishReason || null,
          finishMessage: composerProviderPayload?.candidates?.[0]?.finishMessage || null,
          safetyRatings: composerProviderPayload?.candidates?.[0]?.safetyRatings || null,
        })
        : 'no_text_content';
      const error = new Error(`${provider}_composer_empty_response ${detail}`);
      error.providerPayload = composerProviderPayload;
      throw error;
    }

    const parsed = validateLlmBrief(parseLlmJson(composerRawText));
    const filteredBrief = filterLlmBriefAgainstInsights(parsed, insights);
    if (!filteredBrief) {
      return {
        updatedAt: new Date().toISOString(),
        provider,
        status: 'failed',
        reason: 'invalid_json_payload',
        brief: null,
        debug: {
          provider,
          model,
          privacyMode,
          suppressRoutineRecurringEvents: shouldSuppressRoutineRecurringEvents(config),
          enabled: true,
          status: 'failed',
          reason: 'invalid_json_payload',
          eventSelection: selectionAnalysis,
          inputEvents: selectorInputEvents,
          prompt: composerPrompt,
          rawResponse: composerRawText,
          providerPayload: composerProviderPayload,
          selectorInputEvents,
          selectorPrompt,
          selectorRawResponse: selectorRawText,
          selectorProviderPayload,
          selectorParsed: parsedSelection,
          enrichedInsights: insightDebug,
          composerPrompt,
          composerRawResponse: composerRawText,
          composerProviderPayload,
          parsedBrief: null,
        },
      };
    }

    return {
      updatedAt: new Date().toISOString(),
      provider,
      status: 'ready',
      brief: filteredBrief,
      debug: {
        provider,
        model,
        privacyMode,
        suppressRoutineRecurringEvents: shouldSuppressRoutineRecurringEvents(config),
        enabled: true,
        status: 'ready',
        eventSelection: selectionAnalysis,
        inputEvents: selectorInputEvents,
        prompt: composerPrompt,
        rawResponse: composerRawText,
        providerPayload: composerProviderPayload,
        selectorInputEvents,
        selectorPrompt,
        selectorRawResponse: selectorRawText,
        selectorProviderPayload,
        selectorParsed: parsedSelection,
        enrichedInsights: insightDebug,
        composerPrompt,
        composerRawResponse: composerRawText,
        composerProviderPayload,
        parsedBrief: parsed,
        filteredBrief,
      },
    };
  } catch (error) {
    return {
      updatedAt: new Date().toISOString(),
      provider,
      status: 'failed',
      reason: error.message,
      brief: null,
      debug: {
        provider,
        model,
        privacyMode,
        suppressRoutineRecurringEvents: shouldSuppressRoutineRecurringEvents(config),
        enabled: true,
        status: 'failed',
        reason: error.message,
        eventSelection: selectionAnalysis,
        inputEvents: selectorInputEvents,
        prompt: composerPrompt || selectorPrompt,
        rawResponse: typeof composerRawText === 'string' && composerRawText.trim()
          ? composerRawText
          : (typeof selectorRawText === 'string' ? selectorRawText : ''),
        providerPayload: error.providerPayload || composerProviderPayload || selectorProviderPayload,
        selectorInputEvents,
        selectorPrompt,
        selectorRawResponse: typeof selectorRawText === 'string' ? selectorRawText : '',
        selectorProviderPayload,
        composerRawResponse: typeof composerRawText === 'string' ? composerRawText : '',
        composerProviderPayload: error.providerPayload || composerProviderPayload,
      },
    };
  }
};

const buildContext = async (calendarCache, config, secrets, household, existingContext = null, forceLlm = false) => {
  const events = Array.isArray(calendarCache?.events) ? calendarCache.events : [];
  const transportConfig = config.services.transport || {};
  const routingConfig = config.services.routing || {};
  const transportCache = await readTransportCache();
  const routingCache = await readRoutingCache();
  const tripCandidates = await buildTripTimelines(events, config, household, transportConfig, secrets.transport || {}, transportCache);
  await writeTransportCache(transportCache);
  const activeTrip = attachTripPhase(selectActiveTrip(tripCandidates), transportConfig, 'active');
  const recentTrip = attachTripPhase(selectRecentTrip(tripCandidates), transportConfig, 'recent');
  const nextEvent = getNextRelevantEvent(events, config);
  const visitorContext = await buildVisitorContext(events, config, household);
  const birthdayContext = buildBirthdayContext(household);
  const commuteContext = await buildCommuteContext(events, household, config, routingConfig, secrets.routing || {}, routingCache);
  const householdEventContext = await buildHouseholdEventContext(events, config, household, routingConfig, secrets.routing || {}, routingCache);
  const highlightEventContext = buildHighlightEventContext(events, config);
  await writeRoutingCache(routingCache);
  const refreshHours = Number(config.services.context.refreshHours) || 3;
  const llm = await generateLlmBrief({
    calendarCache,
    config,
    secrets,
    activeTrip,
    recentTrip,
    nextEvent,
    commuteContext,
    householdEventContext,
    existingContext,
    force: forceLlm,
  });
  const deterministicBrief = buildDailyBrief(
    events,
    activeTrip,
    nextEvent,
    recentTrip,
    visitorContext,
    birthdayContext,
    commuteContext,
    householdEventContext,
    config,
  );
  const deterministicCandidates = buildContextCandidates(
    events,
    activeTrip,
    nextEvent,
    recentTrip,
    visitorContext,
    birthdayContext,
    commuteContext,
    householdEventContext,
    highlightEventContext,
  );
  const brief = llm?.status === 'ready' && llm?.brief
    ? {
      headline: llm.brief.headline || deterministicBrief.headline,
      bullets: Array.isArray(llm.brief.bullets) ? llm.brief.bullets : deterministicBrief.bullets,
      householdView: typeof llm.brief.householdView === 'string' ? llm.brief.householdView : deterministicBrief.householdView,
      source: 'llm',
    }
    : {
      ...deterministicBrief,
      source: 'deterministic',
    };

  const contextPayload = {
    updatedAt: new Date().toISOString(),
    refreshHours,
    activeTrip,
    recentTrip,
    visitorContext,
    birthdayContext,
    commuteContext,
    householdEventContext,
    trips: tripCandidates.slice(0, 5),
    brief,
    llm,
  };

  await writeDailyBriefDebug({
    updatedAt: contextPayload.updatedAt,
    status: brief.source,
    stageSource: llm?.status || 'deterministic',
    config: {
      displayLocale: config.system?.displayLocale || 'en',
      contextRefreshHours: refreshHours,
      llmEnabled: Boolean(config.services.llm?.enabled),
      llmProvider: config.services.llm?.provider || 'openai',
      llmModel: config.services.llm?.model || 'gpt-5-mini',
      llmPrivacyMode: config.services.llm?.privacyMode || 'cloud-redacted',
    },
    stages: {
      calendarInput: {
        syncedAt: calendarCache?.syncedAt || null,
        selectedCalendarIds: calendarCache?.selectedCalendarIds || [],
        totalEvents: events.length,
        events: events.map((event) => ({
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          isAllDay: event.isAllDay,
          isRecurring: event.isRecurring,
          location: event.location,
          calendarSummary: event.calendarSummary,
        })),
      },
      deterministic: {
        activeTrip,
        recentTrip,
        nextEvent,
        visitorContext,
        birthdayContext,
        commuteContext,
        householdEventContext,
        highlightEventContext,
        eventSelection: events.map((event) => {
          const decision = explainBriefEventSelection(event, config);
          return {
            id: event.id,
            title: event.title,
            start: event.start,
            isRecurring: event.isRecurring,
            isAllDay: event.isAllDay,
            include: decision.include,
            reason: decision.reason,
          };
        }),
        trips: tripCandidates.slice(0, 5),
        candidates: deterministicCandidates,
        brief: deterministicBrief,
      },
      llm: llm?.debug || {
        provider: config.services.llm?.provider || 'openai',
        model: config.services.llm?.model || 'gpt-5-mini',
        enabled: Boolean(config.services.llm?.enabled),
        status: 'not_used',
      },
      finalContext: {
        brief,
        activeTrip,
        displayPayload: localizeContextPayload(contextPayload, config.system?.displayLocale || 'en'),
      },
    },
  });

  return contextPayload;
};

const syncGoogleCalendarData = async ({ forceContext = false } = {}) => {
  const [clientInfo, config, secrets, household] = await Promise.all([withGoogleClient(), readConfig(), readSecrets(), readHousehold()]);
  if (!clientInfo) {
    return null;
  }

  const { client, account } = clientInfo;
  const calendarList = await googleRequest(client, 'https://www.googleapis.com/calendar/v3/users/me/calendarList');
  const calendars = Array.isArray(calendarList.items) ? calendarList.items.map(summarizeCalendar) : [];

  let selectedCalendarIds = Array.isArray(config.services.google.selectedCalendarIds)
    ? config.services.google.selectedCalendarIds.filter(Boolean)
    : [];

  if (selectedCalendarIds.length === 0) {
    const primaryCalendar = calendars.find((calendar) => calendar.primary) || calendars[0];
    selectedCalendarIds = primaryCalendar ? [primaryCalendar.id] : [];
    config.services.google.selectedCalendarIds = selectedCalendarIds;
    await saveConfig(config);
  }

  const now = new Date();
  const timeMin = new Date(now.getTime() - 86400000).toISOString();
  const timeMax = new Date(now.getTime() + ((Number(config.services.context.tripLookaheadDays) || 14) * 86400000)).toISOString();
  const selectedCalendars = calendars.filter((calendar) => selectedCalendarIds.includes(calendar.id));
  const eventBuckets = await Promise.all(selectedCalendars.map(async (calendar) => {
    return fetchGoogleCalendarEvents({
      client,
      calendar,
      timeMin,
      timeMax,
    });
  }));

  const calendarCache = {
    syncedAt: new Date().toISOString(),
    connectedEmail: account.email || '',
    calendars,
    selectedCalendarIds,
    events: eventBuckets.flat().sort((left, right) => new Date(left.start) - new Date(right.start)),
  };

  await fs.writeJson(CALENDAR_CACHE_PATH, calendarCache, { spaces: 2 });

  const existingContext = await readJsonIfExists(CONTEXT_CACHE_PATH, null);
  const refreshHours = Number(config.services.context.refreshHours) || 3;
  const shouldRefreshContext = forceContext
    || !existingContext?.updatedAt
    || (Date.now() - new Date(existingContext.updatedAt).getTime()) >= (refreshHours * 3600000);

  if (shouldRefreshContext) {
    const context = await buildContext(calendarCache, config, secrets, household, existingContext, forceContext);
    await fs.writeJson(CONTEXT_CACHE_PATH, context, { spaces: 2 });
  }

  return calendarCache;
};

const loadCalendarCache = async () => readJsonIfExists(CALENDAR_CACHE_PATH, {
  syncedAt: null,
  connectedEmail: '',
  calendars: [],
  selectedCalendarIds: [],
  events: [],
});

const loadContextCache = async () => readJsonIfExists(CONTEXT_CACHE_PATH, {
  updatedAt: null,
  refreshHours: 3,
  activeTrip: null,
  recentTrip: null,
  visitorContext: null,
  birthdayContext: null,
  commuteContext: null,
  householdEventContext: null,
  trips: [],
  brief: { headline: 'Daily brief', bullets: [] },
});

const buildAuthPopupHtml = ({ success, payload }) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Mirrorial Google Auth</title>
    <style>
      body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .card { max-width: 420px; padding: 24px; border-radius: 16px; background: #111827; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.45); }
      h1 { margin: 0 0 12px; font-size: 20px; }
      p { margin: 0; line-height: 1.5; color: #cbd5e1; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${success ? 'Google account connected' : 'Google connection failed'}</h1>
      <p>${success ? 'You can close this window now.' : payload.error}</p>
    </div>
    <script>
      if (window.opener) {
        window.opener.postMessage(${JSON.stringify({
          type: 'mirrorial-google-auth',
          success,
          payload,
        })}, '*');
      }
      window.setTimeout(() => window.close(), 350);
    </script>
  </body>
</html>`;

const startPowerManager = () => {
  setInterval(async () => {
    try {
      const config = await readConfig();
      const power = config.system.power;

      if (!power?.autoShutdownEnabled || !power.autoShutdownTime) {
        return;
      }

      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (currentTime === power.autoShutdownTime) {
        exec('sudo shutdown -h now');
      }
    } catch (error) {
      console.error('Power manager error:', error.message);
    }
  }, 60000);
};

const startCalendarSyncLoop = () => {
  setInterval(async () => {
    try {
      await syncGoogleCalendarData();
    } catch (error) {
      console.error('Calendar sync failed:', error.message);
    }
  }, 15 * 60 * 1000);
};

app.get('/api/config', async (req, res) => {
  try {
    const [config, secrets] = await Promise.all([readConfig(), readSecrets()]);
    res.json(sanitizeConfigForClient(config, secrets));
  } catch (error) {
    res.status(500).json({ error: 'Failed to read config', details: error.message });
  }
});

app.post('/api/config', async (req, res) => {
  try {
    const publicConfig = await saveConfig(req.body);
    res.json({ success: true, config: publicConfig });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save config', details: error.message });
  }
});

app.get('/api/household', async (req, res) => {
  try {
    const household = await readHousehold();
    res.json(household);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read household settings', details: error.message });
  }
});

app.post('/api/household', async (req, res) => {
  try {
    const household = await saveHousehold(req.body);
    const [config, secrets, calendarCache, existingContext] = await Promise.all([
      readConfig(),
      readSecrets(),
      loadCalendarCache(),
      readJsonIfExists(CONTEXT_CACHE_PATH, null),
    ]);

    const context = await buildContext(calendarCache, config, secrets, household, existingContext, false);
    await fs.writeJson(CONTEXT_CACHE_PATH, context, { spaces: 2 });

    res.json({ success: true, household });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save household settings', details: error.message });
  }
});

app.post('/api/system/:command', (req, res) => {
  const { command } = req.params;
  let shellCmd = '';

  switch (command) {
    case 'reboot':
      shellCmd = 'sudo reboot';
      break;
    case 'shutdown':
      shellCmd = 'sudo shutdown -h now';
      break;
    case 'restart-display':
      shellCmd = 'sudo systemctl restart mirror-display';
      break;
    default:
      return res.status(400).json({ error: 'Invalid command' });
  }

  exec(shellCmd, (error) => {
    if (error) {
      return res.status(500).json({ error: 'Command execution failed', details: error.message });
    }
    return res.json({ success: true, message: `Command ${command} triggered` });
  });
});

app.get('/api/auth/google/start', async (req, res) => {
  try {
    const { settings } = await getGoogleSettings(req);
    if (!settings.clientId || !settings.clientSecret || !settings.redirectUri) {
      return res.status(400).send(buildAuthPopupHtml({
        success: false,
        payload: {
          error: 'Google OAuth is not configured yet. Save client ID, client secret, and redirect URI first.',
        },
      }));
    }

    const state = crypto.randomBytes(24).toString('hex');
    GOOGLE_AUTH_STATES.set(state, Date.now());

    const client = createGoogleClient(settings);
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: CALENDAR_SCOPES,
      state,
    });

    return res.redirect(url);
  } catch (error) {
    return res.status(500).send(buildAuthPopupHtml({
      success: false,
      payload: { error: error.message },
    }));
  }
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state || !GOOGLE_AUTH_STATES.has(state)) {
      return res.status(400).send(buildAuthPopupHtml({
        success: false,
        payload: { error: 'Google auth callback is missing a valid state or code.' },
      }));
    }

    GOOGLE_AUTH_STATES.delete(state);
    const { settings } = await getGoogleSettings(req);
    const client = createGoogleClient(settings);
    const tokenResponse = await client.getToken(code);
    client.setCredentials(tokenResponse.tokens);

    const existingAccount = await getStoredGoogleAccount();
    const mergedTokens = {
      ...(existingAccount?.tokens || {}),
      ...(tokenResponse.tokens || {}),
    };
    const initialEmail = inferGoogleEmailFromTokens(mergedTokens);

    await writeGoogleAccount({
      email: initialEmail,
      connectedAt: new Date().toISOString(),
      scopes: CALENDAR_SCOPES,
      tokens: mergedTokens,
    });

    const calendarCache = await syncGoogleCalendarData({ forceContext: true });
    const email = initialEmail || inferGoogleEmailFromCalendars(calendarCache?.calendars || []);

    if (email && email !== initialEmail) {
      await writeGoogleAccount({
        email,
        connectedAt: new Date().toISOString(),
        scopes: CALENDAR_SCOPES,
        tokens: mergedTokens,
      });
    }

    return res.send(buildAuthPopupHtml({
      success: true,
      payload: { email },
    }));
  } catch (error) {
    return res.status(500).send(buildAuthPopupHtml({
      success: false,
      payload: { error: formatGoogleAuthError(error) },
    }));
  }
});

app.get('/api/auth/google/status', async (req, res) => {
  try {
    const [{ config, secrets }, account, calendarCache] = await Promise.all([
      getGoogleSettings(req),
      getStoredGoogleAccount(),
      loadCalendarCache(),
    ]);

    res.json({
      connected: Boolean(account?.tokens?.refresh_token || account?.tokens?.access_token),
      email: account?.email || '',
      clientConfigured: Boolean(config.services.google.clientId && secrets.google?.clientSecret),
      redirectUri: config.services.google.redirectUri || `${req.protocol}://${req.get('host')}/api/auth/google/callback`,
      selectedCalendarIds: calendarCache.selectedCalendarIds || config.services.google.selectedCalendarIds,
      lastSyncedAt: calendarCache.syncedAt,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read Google auth status', details: error.message });
  }
});

app.post('/api/auth/google/disconnect', async (req, res) => {
  try {
    await deleteGoogleAccount();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect Google account', details: error.message });
  }
});

app.get('/api/google/calendars', async (req, res) => {
  try {
    const cache = await syncGoogleCalendarData();
    if (!cache) {
      return res.status(404).json({ error: 'Google account is not connected.' });
    }
    return res.json({
      calendars: cache.calendars,
      selectedCalendarIds: cache.selectedCalendarIds,
      lastSyncedAt: cache.syncedAt,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch calendars', details: error.message });
  }
});

app.post('/api/google/calendars/select', async (req, res) => {
  try {
    const { selectedCalendarIds } = req.body;
    if (!Array.isArray(selectedCalendarIds)) {
      return res.status(400).json({ error: 'selectedCalendarIds must be an array.' });
    }

    const config = await readConfig();
    config.services.google.selectedCalendarIds = selectedCalendarIds.filter(Boolean);
    await saveConfig(config);
    const cache = await syncGoogleCalendarData({ forceContext: true });
    return res.json({
      success: true,
      calendars: cache?.calendars || [],
      selectedCalendarIds: cache?.selectedCalendarIds || [],
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save calendar selection', details: error.message });
  }
});

app.get('/api/display/calendar/events', async (req, res) => {
  try {
    const cache = await loadCalendarCache();
    const config = await readConfig();
    const calendarOverrides = getAllModules(config)
      .find((module) => module.type === 'calendar')?.config?.calendarColors || {};
    res.json({
      syncedAt: cache.syncedAt,
      events: cache.events.map((event) => ({
        ...event,
        calendarColor: calendarOverrides[event.calendarId] || event.calendarColor || '',
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read calendar cache', details: error.message });
  }
});

app.get('/api/display/context', async (req, res) => {
  try {
    const [context, config] = await Promise.all([loadContextCache(), readConfig()]);
    const locale = req.query.locale?.toString() || config.system?.displayLocale || 'en';
    res.json(localizeContextPayload(context, locale));
  } catch (error) {
    res.status(500).json({ error: 'Failed to read context cache', details: error.message });
  }
});

app.get('/api/debug/daily-brief', async (req, res) => {
  try {
    const debug = await readDailyBriefDebug();
    res.json(debug);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read Daily Brief debug log', details: error.message });
  }
});

app.post('/api/debug/daily-brief/rebuild', async (req, res) => {
  try {
    const [config, secrets, calendarCache, household, existingContext] = await Promise.all([
      readConfig(),
      readSecrets(),
      loadCalendarCache(),
      readHousehold(),
      readJsonIfExists(CONTEXT_CACHE_PATH, null),
    ]);

    const context = await buildContext(calendarCache, config, secrets, household, existingContext, true);
    await fs.writeJson(CONTEXT_CACHE_PATH, context, { spaces: 2 });

    const debug = await readDailyBriefDebug();
    res.json({ success: true, debug });
  } catch (error) {
    res.status(500).json({ error: 'Failed to rebuild Daily Brief debug log', details: error.message });
  }
});

app.get('/api/display/status', async (req, res) => {
  try {
    const status = await readDisplayStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read display status', details: error.message });
  }
});

app.post('/api/display/status', async (req, res) => {
  try {
    const width = Number(req.body?.width);
    const height = Number(req.body?.height);
    const devicePixelRatio = Number(req.body?.devicePixelRatio);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return res.status(400).json({ error: 'width and height must be positive numbers.' });
    }

    const status = {
      width: Math.round(width),
      height: Math.round(height),
      devicePixelRatio: Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : null,
      updatedAt: new Date().toISOString(),
    };
    await writeDisplayStatus(status);
    return res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: 'Failed to persist display status', details: error.message });
  }
});

app.get('/api/ha/entities', async (req, res) => {
  try {
    const config = await readConfig();
    const ha = getAllModules(config).find((module) => module.type === 'home_assistant')?.config;

    if (!ha?.url || !ha?.token) {
      return res.status(400).json({ error: 'HA URL and token must be saved first.' });
    }

    const response = await axios.get(`${ha.url}/api/states`, {
      headers: { Authorization: `Bearer ${ha.token}` },
    });

    const entities = response.data.map((entity) => ({
      id: entity.entity_id,
      name: entity.attributes.friendly_name || entity.entity_id,
      state: entity.state,
    }));

    return res.json(entities);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch entities', details: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_UI_PATH, 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, async () => {
    await ensureRuntimePaths();
    await ensureConfig();
    startPowerManager();
    startCalendarSyncLoop();
    console.log(`Mirrorial backend running on port ${PORT}`);
    console.log(`Managing config at ${CONFIG_PATH}`);
    console.log(`Persisting runtime data in ${DATA_ROOT}`);
  });
}

module.exports = {
  app,
  buildBirthdayContext,
  buildContextCandidates,
  buildDailyBrief,
  buildEnrichedBriefInsights,
  estimateRouteFallback,
  filterLlmBriefAgainstInsights,
  findMatchingSavedPlace,
  inferTripAnchorFromEvent,
  validateLlmSelection,
};
