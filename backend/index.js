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
const CALENDAR_SOURCES_PATH = path.join(DATA_ROOT, 'calendar-sources.json');
const CALENDAR_CACHE_PATH = path.join(DATA_ROOT, 'cache', 'calendar-events.json');
const CONTEXT_CACHE_PATH = path.join(DATA_ROOT, 'cache', 'context.json');
const DAILY_BRIEF_DEBUG_PATH = path.join(DATA_ROOT, 'cache', 'daily-brief-debug.json');
const TRAVEL_TIME_DEBUG_PATH = path.join(DATA_ROOT, 'cache', 'travel-time-debug.json');
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
const SHARED_MODULE_TYPES = new Set(['clock', 'weather', 'home_assistant', 'calendar', 'daily_brief', 'travel_time']);
const DEFAULT_CONTEXT_REFRESH_MINUTES = 180;
const EVENT_HINT_RULE_CATEGORIES = new Set(['generic', 'medical', 'prep', 'travel', 'pickup']);
const EVENT_HINT_RULE_ORIGIN_TYPES = new Set(['home', 'custom', 'saved_place', 'member_work', 'member_school']);
const EVENT_HINT_RULE_ROUTE_MODES = new Set(['car', 'bike', 'walk', 'public_transport']);
const EVENT_HINT_WEATHER_RULES = new Set(['none', 'warn_rain', 'warn_snow', 'warn_rain_or_snow']);
const EVENT_HINT_ALT_TRANSPORT_POLICIES = new Set(['always', 'bad_weather', 'tight_schedule', 'manual_note']);
const EVENT_HINT_ACTIVE_WINDOW_HOURS = 24;

const resolveContextRefreshMinutes = (contextConfig = {}) => {
  const explicitMinutes = Number(contextConfig?.refreshMinutes);
  if (Number.isFinite(explicitMinutes) && explicitMinutes > 0) {
    return Math.round(explicitMinutes);
  }

  const legacyHours = Number(contextConfig?.refreshHours);
  if (Number.isFinite(legacyHours) && legacyHours > 0) {
    return Math.round(legacyHours * 60);
  }

  return DEFAULT_CONTEXT_REFRESH_MINUTES;
};

const buildDefaultModuleConfig = (type) => {
  switch (type) {
    case 'weather':
      return {
        provider: 'open-meteo',
        lat: 52.52,
        lon: 13.41,
        refreshMinutes: 30,
        location: 'Berlin',
        displayName: 'Berlin',
        city: 'Berlin',
        postalCode: '',
        country: 'Germany',
      };
    case 'home_assistant':
      return {
        enabled: false,
        url: '',
        token: '',
        entities: [],
        entityCards: [],
      };
    case 'calendar':
      return {
        maxItems: 5,
        viewMode: 'list',
        daysToShow: 4,
        calendarColors: {},
      };
    case 'daily_brief':
      return {
        maxItems: 3,
        pageSeconds: 10,
      };
    case 'travel_time':
      return {
        items: [],
      };
    default:
      return {};
  }
};

const findModuleByType = (modules, type) => {
  for (const module of Array.isArray(modules) ? modules : []) {
    if (!module || typeof module !== 'object') {
      continue;
    }

    if (module.type === type) {
      return module;
    }

    if (module.type === 'module_rotator') {
      const nestedMatch = findModuleByType(module.config?.modules, type);
      if (nestedMatch) {
        return nestedMatch;
      }
    }
  }

  return null;
};

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
      refreshMinutes: DEFAULT_CONTEXT_REFRESH_MINUTES,
      tripLookaheadDays: 14,
      birthdayLookaheadDays: 10,
      usefulLocationWhitelist: [],
      eventHintRules: [],
      briefCalendarMode: 'exclude_selected',
      briefIncludedCalendarIds: [],
      briefExcludedCalendarIds: [],
      suppressRoutineRecurringEvents: true,
      signals: {
        travel: true,
        birthdays: true,
        commute: true,
        household: true,
        visitors: true,
        nextEvent: true,
        highlights: true,
      },
    },
    llm: {
      enabled: false,
      provider: 'openai',
      model: 'gpt-5-mini',
      baseUrl: '',
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
    travel: {
      enabled: false,
      transportProvider: 'none',
      routingProvider: 'none',
      routingBaseUrl: '',
      routingProfile: 'driving-car',
      googleRoutesEnabled: false,
      googleRoutesForAllModes: false,
      refreshMinutes: 30,
      homeAirport: '',
      closestTrainStation: '',
      closestBusStation: '',
      closestTubeStation: '',
    },
  },
  gridLayout: {
    template: 'portrait_focus',
    columns: 4,
    rows: 8,
    gap: 16,
    modules: [],
  },
  gridLayouts: {
    portrait: {
      template: 'portrait_focus',
      columns: 4,
      rows: 8,
      gap: 16,
      modules: [],
    },
    landscape: {
      template: 'landscape_dashboard',
      columns: 6,
      rows: 4,
      gap: 16,
      modules: [],
    },
  },
  moduleSettings: {
    clock: buildDefaultModuleConfig('clock'),
    weather: buildDefaultModuleConfig('weather'),
    home_assistant: buildDefaultModuleConfig('home_assistant'),
    calendar: buildDefaultModuleConfig('calendar'),
    daily_brief: buildDefaultModuleConfig('daily_brief'),
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

const DEFAULT_CALENDAR_SOURCE_STORE = {
  sources: [],
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

const normalizeHaEntityCard = (entry) => {
  if (typeof entry === 'string') {
    const entityId = entry.trim();
    if (!entityId) {
      return null;
    }
    return {
      entityId,
      icon: 'auto',
      displayType: 'medium',
    };
  }

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const entityId = typeof entry.entityId === 'string'
    ? entry.entityId.trim()
    : (typeof entry.id === 'string' ? entry.id.trim() : '');

  if (!entityId) {
    return null;
  }

  const displayType = typeof entry.displayType === 'string' ? entry.displayType.trim().toLowerCase() : 'medium';
  const normalizedDisplayType = ['small', 'medium', 'large'].includes(displayType) ? displayType : 'medium';
  const icon = typeof entry.icon === 'string' && entry.icon.trim() ? entry.icon.trim() : 'auto';

  return {
    entityId,
    icon,
    displayType: normalizedDisplayType,
  };
};

const normalizeHomeAssistantModuleConfig = (config = {}) => {
  const legacyEntities = Array.isArray(config.entities) ? config.entities : [];
  const configuredCards = Array.isArray(config.entityCards) ? config.entityCards : [];
  const normalizedCards = (configuredCards.length ? configuredCards : legacyEntities)
    .map((entry) => normalizeHaEntityCard(entry))
    .filter(Boolean);

  return {
    ...config,
    enabled: config.enabled !== false,
    url: typeof config.url === 'string' ? config.url : '',
    token: typeof config.token === 'string' ? config.token : '',
    entities: normalizedCards.map((card) => card.entityId),
    entityCards: normalizedCards,
  };
};

const normalizeSharedModuleConfig = (type, config = {}) => {
  if (type === 'home_assistant') {
    return normalizeHomeAssistantModuleConfig(config);
  }

  const baseConfig = buildDefaultModuleConfig(type);
  const incomingConfig = config && typeof config === 'object' ? config : {};
  return {
    ...baseConfig,
    ...incomingConfig,
  };
};

const normalizeModuleSettings = (moduleSettings = {}, layoutModules = []) => {
  const source = moduleSettings && typeof moduleSettings === 'object' ? moduleSettings : {};
  const normalized = {};

  SHARED_MODULE_TYPES.forEach((type) => {
    const storedConfig = source[type] && typeof source[type] === 'object'
      ? source[type]
      : findModuleByType(layoutModules, type)?.config;
    normalized[type] = normalizeSharedModuleConfig(type, storedConfig);
  });

  return normalized;
};

const ROTATOR_ANIMATION_TYPES = new Set(['swipe', 'blend', 'lift', 'none']);
const ROTATOR_CHILD_TYPES = new Set(['clock', 'weather', 'home_assistant', 'calendar', 'daily_brief', 'travel_time']);

const normalizeRotatorChildModule = (module, index = 0, moduleSettings = null) => {
  const type = ROTATOR_CHILD_TYPES.has(module?.type) ? module.type : 'clock';
  const align = ['stretch', 'start', 'center', 'end'].includes(module?.align) ? module.align : 'stretch';
  const resolvedConfig = moduleSettings?.[type] && SHARED_MODULE_TYPES.has(type)
    ? moduleSettings[type]
    : module?.config;

  return {
    id: typeof module?.id === 'string' && module.id.trim() ? module.id.trim() : `rotator_${type}_${index + 1}`,
    type,
    align,
    config: normalizeSharedModuleConfig(type, resolvedConfig),
  };
};

const normalizeRotatorModuleConfig = (config = {}, moduleSettings = null) => {
  const children = Array.isArray(config.modules) ? config.modules : [];
  const normalizedChildren = children
    .map((module, index) => normalizeRotatorChildModule(module, index, moduleSettings))
    .slice(0, 3);

  return {
    rotationSeconds: Math.min(Math.max(Number(config.rotationSeconds) || 10, 3), 120),
    animation: ROTATOR_ANIMATION_TYPES.has(config.animation) ? config.animation : 'swipe',
    modules: normalizedChildren.length ? normalizedChildren : [normalizeRotatorChildModule({ type: 'clock' }, 0, moduleSettings)],
  };
};

const normalizeLayoutModule = (module, moduleSettings = null) => {
  if (!module || typeof module !== 'object') {
    return module;
  }

  if (module.type === 'module_rotator') {
    return {
      ...module,
      align: 'stretch',
      config: normalizeRotatorModuleConfig(module.config && typeof module.config === 'object' ? module.config : {}, moduleSettings),
    };
  }

  if (SHARED_MODULE_TYPES.has(module.type)) {
    return {
      ...module,
      config: normalizeSharedModuleConfig(
        module.type,
        moduleSettings?.[module.type] && typeof moduleSettings[module.type] === 'object'
          ? moduleSettings[module.type]
          : (module.config && typeof module.config === 'object' ? module.config : {}),
      ),
    };
  }

  return module;
};

const TEMPLATE_ORIENTATION = new Map([
  ['portrait_focus', 'portrait'],
  ['portrait_compact', 'portrait'],
  ['landscape_dashboard', 'landscape'],
]);

const getTemplateOrientation = (templateId) => TEMPLATE_ORIENTATION.get(templateId) || 'portrait';

const normalizeSingleGridLayout = (gridLayout, moduleSettings, fallbackLayout) => {
  const source = gridLayout && typeof gridLayout === 'object' ? gridLayout : fallbackLayout;
  const base = source && typeof source === 'object' ? source : fallbackLayout;

  return {
    template: base.template || fallbackLayout.template,
    columns: Number(base.columns) || fallbackLayout.columns,
    rows: Number(base.rows) || fallbackLayout.rows,
    gap: Number(base.gap) || fallbackLayout.gap,
    modules: Array.isArray(base.modules)
      ? base.modules.map((module) => normalizeLayoutModule(module, moduleSettings))
      : clone(fallbackLayout.modules),
  };
};

const collectGridLayoutModules = (gridLayouts, fallbackGridLayout) => {
  if (gridLayouts && typeof gridLayouts === 'object') {
    const modules = Object.values(gridLayouts).flatMap((layout) => (
      Array.isArray(layout?.modules) ? layout.modules : []
    ));
    if (modules.length) {
      return modules;
    }
  }

  return Array.isArray(fallbackGridLayout?.modules) ? fallbackGridLayout.modules : [];
};

const sanitizeHomeAssistantUrl = (value = '') => value.toString().trim().replace(/\/+$/, '');

const assertOptionalHttpUrl = (value, label) => {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  if (!normalizedValue) {
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedValue);
  } catch (error) {
    throw new Error(`${label} must be a full http:// or https:// URL, or empty.`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`${label} must use http:// or https://.`);
  }
};

const validateConfigForSave = (config) => {
  assertOptionalHttpUrl(config?.services?.llm?.baseUrl, 'LLM Base URL');
  assertOptionalHttpUrl(config?.services?.travel?.routingBaseUrl, 'OpenRouteService Base URL');
  return config;
};

const fetchHomeAssistantEntities = async ({ url, token }) => {
  const normalizedUrl = sanitizeHomeAssistantUrl(url);
  const normalizedToken = typeof token === 'string' ? token.trim() : '';

  if (!normalizedUrl || !normalizedToken) {
    throw new Error('HA URL and token must be provided.');
  }

  const response = await axios.get(`${normalizedUrl}/api/states`, {
    headers: { Authorization: `Bearer ${normalizedToken}` },
  });

  return response.data
    .map((entity) => {
      const entityId = typeof entity.entity_id === 'string' ? entity.entity_id : '';
      const attributes = entity.attributes && typeof entity.attributes === 'object' ? entity.attributes : {};
      return {
        id: entityId,
        name: attributes.friendly_name || entityId,
        state: entity.state,
        domain: entityId.includes('.') ? entityId.split('.')[0] : 'other',
        unit: attributes.unit_of_measurement || null,
        deviceClass: attributes.device_class || null,
        icon: attributes.icon || null,
      };
    })
    .filter((entity) => entity.id)
    .sort((left, right) => left.name.localeCompare(right.name));
};

const ensureRuntimePaths = async () => {
  await fs.ensureDir(DATA_ROOT);
  await fs.ensureDir(path.dirname(SECRETS_PATH));
  await fs.ensureDir(path.dirname(HOUSEHOLD_PATH));
  await fs.ensureDir(path.dirname(GOOGLE_ACCOUNT_PATH));
  await fs.ensureDir(path.dirname(CALENDAR_SOURCES_PATH));
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
  const fallbackGridLayout = config.gridLayout && typeof config.gridLayout === 'object'
    ? config.gridLayout
    : clone(DEFAULT_CONFIG.gridLayout);
  const rawGridLayouts = rawConfig?.gridLayouts && typeof rawConfig.gridLayouts === 'object'
    ? rawConfig.gridLayouts
    : {};
  const legacyOrientation = getTemplateOrientation(rawConfig?.gridLayout?.template || fallbackGridLayout.template);
  const rawLayoutModules = collectGridLayoutModules(rawGridLayouts, fallbackGridLayout);
  const rawModuleSettings = rawConfig?.moduleSettings && typeof rawConfig.moduleSettings === 'object'
    ? rawConfig.moduleSettings
    : {};
  config.moduleSettings = normalizeModuleSettings(rawModuleSettings, rawLayoutModules);
  config.gridLayouts = {
    portrait: normalizeSingleGridLayout(
      rawGridLayouts.portrait || (legacyOrientation === 'portrait' ? fallbackGridLayout : null),
      config.moduleSettings,
      DEFAULT_CONFIG.gridLayouts.portrait,
    ),
    landscape: normalizeSingleGridLayout(
      rawGridLayouts.landscape || (legacyOrientation === 'landscape' ? fallbackGridLayout : null),
      config.moduleSettings,
      DEFAULT_CONFIG.gridLayouts.landscape,
    ),
  };
  config.gridLayout = clone(config.gridLayouts.portrait);

  const calendarModule = getAllModules(config)
    .find((module) => module.type === 'calendar');

  if (calendarModule?.config?.googleClientId && !config.services.google.clientId) {
    config.services.google.clientId = calendarModule.config.googleClientId;
  }

  if (Array.isArray(calendarModule?.config?.calendarIds) && config.services.google.selectedCalendarIds.length === 0) {
    config.services.google.selectedCalendarIds = calendarModule.config.calendarIds;
  }

  const rawTravel = rawConfig?.services?.travel && typeof rawConfig.services.travel === 'object'
    ? rawConfig.services.travel
    : {};
  const hasRawTravelField = (key) => Object.prototype.hasOwnProperty.call(rawTravel, key);
  const transport = config.services.transport || {};
  const routing = config.services.routing || {};
  const legacyGoogleRoutes = rawTravel.routingProvider === 'google_routes' || routing.provider === 'google_routes';
  config.services.travel = {
    ...clone(DEFAULT_CONFIG.services.travel),
    ...rawTravel,
    enabled: rawTravel.enabled ?? Boolean(transport.enabled || routing.enabled),
    transportProvider: hasRawTravelField('transportProvider') ? (rawTravel.transportProvider || 'none') : (transport.provider || 'none'),
    routingProvider: hasRawTravelField('routingProvider')
      ? ((rawTravel.routingProvider === 'google_routes') ? 'none' : (rawTravel.routingProvider || 'none'))
      : ((routing.provider === 'google_routes') ? 'none' : (routing.provider || 'none')),
    routingBaseUrl: hasRawTravelField('routingBaseUrl') ? `${rawTravel.routingBaseUrl || ''}` : (routing.baseUrl || ''),
    routingProfile: hasRawTravelField('routingProfile') ? (rawTravel.routingProfile || 'driving-car') : (routing.profile || 'driving-car'),
    googleRoutesEnabled: hasRawTravelField('googleRoutesEnabled') ? rawTravel.googleRoutesEnabled === true : legacyGoogleRoutes,
    googleRoutesForAllModes: hasRawTravelField('googleRoutesForAllModes') ? rawTravel.googleRoutesForAllModes === true : legacyGoogleRoutes,
    refreshMinutes: Number(rawTravel.refreshMinutes) || Number(routing.refreshMinutes) || Number(transport.refreshMinutes) || 30,
    homeAirport: hasRawTravelField('homeAirport') ? `${rawTravel.homeAirport || ''}` : (transport.homeAirport || ''),
    closestTrainStation: hasRawTravelField('closestTrainStation') ? `${rawTravel.closestTrainStation || ''}` : (transport.homeStation || ''),
    closestBusStation: hasRawTravelField('closestBusStation') ? `${rawTravel.closestBusStation || ''}` : '',
    closestTubeStation: hasRawTravelField('closestTubeStation') ? `${rawTravel.closestTubeStation || ''}` : '',
  };
  config.services.transport = {
    ...transport,
    enabled: Boolean(config.services.travel.enabled),
    provider: config.services.travel.transportProvider || transport.provider || 'none',
    homeAirport: config.services.travel.homeAirport || '',
    homeStation: config.services.travel.closestTrainStation || '',
    refreshMinutes: Number(config.services.travel.refreshMinutes) || Number(transport.refreshMinutes) || 30,
  };
  config.services.routing = {
    ...routing,
    enabled: Boolean(config.services.travel.enabled),
    provider: config.services.travel.routingProvider || routing.provider || 'none',
    baseUrl: config.services.travel.routingBaseUrl || '',
    profile: config.services.travel.routingProfile || routing.profile || 'driving-car',
    googleRoutesEnabled: config.services.travel.googleRoutesEnabled === true,
    googleRoutesForAllModes: config.services.travel.googleRoutesForAllModes === true,
    refreshMinutes: Number(config.services.travel.refreshMinutes) || Number(routing.refreshMinutes) || 30,
  };
  config.services.context = {
    ...config.services.context,
    refreshMinutes: resolveContextRefreshMinutes(rawConfig?.services?.context || config.services.context),
    eventHintRules: normalizeEventHintRules(rawConfig?.services?.context?.eventHintRules ?? config.services.context.eventHintRules),
  };
  delete config.services.context.refreshHours;
  config.services.llm = {
    ...config.services.llm,
    baseUrl: typeof config.services.llm?.baseUrl === 'string' ? config.services.llm.baseUrl.trim() : '',
  };
  delete config.services.llm.refreshHours;
  config.services.travel.routingBaseUrl = typeof config.services.travel.routingBaseUrl === 'string'
    ? config.services.travel.routingBaseUrl.trim()
    : '';
  config.services.routing.baseUrl = typeof config.services.routing.baseUrl === 'string'
    ? config.services.routing.baseUrl.trim()
    : '';

  return config;
};

const getAllModules = (config) => {
  const gridModules = collectGridLayoutModules(config?.gridLayouts, config?.gridLayout);
  if (Array.isArray(gridModules)) {
    return gridModules.flatMap((module) => {
      if (!module || typeof module !== 'object') {
        return [];
      }

      const normalizedModule = normalizeLayoutModule(module, config?.moduleSettings);
      const nestedModules = normalizedModule.type === 'module_rotator'
        ? (normalizedModule.config?.modules || []).map((nestedModule) => normalizeLayoutModule(nestedModule, config?.moduleSettings))
        : [];

      return [normalizedModule, ...nestedModules];
    });
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

const readTravelTimeDebug = async () => readJsonIfExists(TRAVEL_TIME_DEBUG_PATH, {
  updatedAt: null,
  items: [],
  config: {},
});

const writeDailyBriefDebug = async (payload) => {
  await ensureRuntimePaths();
  await fs.writeJson(DAILY_BRIEF_DEBUG_PATH, payload, { spaces: 2 });
};

const writeTravelTimeDebug = async (payload) => {
  await ensureRuntimePaths();
  await fs.writeJson(TRAVEL_TIME_DEBUG_PATH, payload, { spaces: 2 });
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
  if (error?.code === 'GOOGLE_RECONNECT_REQUIRED') {
    return error.message;
  }
  if (responseData?.error === 'invalid_grant') {
    return 'Google Calendar authorization expired or was revoked. Reconnect Google Calendar.';
  }
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

const getGoogleRefreshTokenExpiresAt = (account = null) => {
  const seconds = Number(account?.tokens?.refresh_token_expires_in);
  const connectedAt = new Date(account?.connectedAt || 0).getTime();
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(connectedAt) || connectedAt <= 0) {
    return null;
  }

  return new Date(connectedAt + (seconds * 1000)).toISOString();
};

const getGoogleAccessTokenExpiresAt = (account = null) => {
  const expiryDate = Number(account?.tokens?.expiry_date);
  if (!Number.isFinite(expiryDate) || expiryDate <= 0) {
    return null;
  }

  return new Date(expiryDate).toISOString();
};

const buildGoogleTokenStatus = (account = null, now = Date.now()) => {
  const tokens = account?.tokens || {};
  const refreshTokenExpiresAt = getGoogleRefreshTokenExpiresAt(account);
  const accessTokenExpiresAt = getGoogleAccessTokenExpiresAt(account);
  const refreshTokenExpired = Boolean(refreshTokenExpiresAt && new Date(refreshTokenExpiresAt).getTime() <= now);
  const accessTokenExpired = Boolean(accessTokenExpiresAt && new Date(accessTokenExpiresAt).getTime() <= now);
  const hasRefreshToken = Boolean(tokens.refresh_token);
  const hasAccessToken = Boolean(tokens.access_token);
  const hasUsableAccessToken = hasAccessToken && !accessTokenExpired;
  const needsReconnect = refreshTokenExpired || (!hasRefreshToken && !hasUsableAccessToken);

  return {
    hasRefreshToken,
    hasAccessToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    refreshTokenExpired,
    needsReconnect,
    statusReason: needsReconnect
      ? (refreshTokenExpired ? 'refresh_token_expired' : 'missing_refresh_token')
      : 'ready',
  };
};

const assertGoogleTokenUsable = (account) => {
  const tokenStatus = buildGoogleTokenStatus(account);
  if (!tokenStatus.needsReconnect) {
    return tokenStatus;
  }

  const error = new Error(tokenStatus.statusReason === 'refresh_token_expired'
    ? 'Google Calendar authorization expired. Reconnect Google Calendar.'
    : 'Google Calendar authorization is incomplete. Reconnect Google Calendar.');
  error.code = 'GOOGLE_RECONNECT_REQUIRED';
  error.tokenStatus = tokenStatus;
  throw error;
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
    nickname: member.nickname || '',
    birthdate: member.birthdate || '',
    calendarIds: Array.isArray(member.calendarIds) ? member.calendarIds.filter(Boolean) : [],
    tags: Array.isArray(member.tags) ? member.tags.filter(Boolean) : [],
    shareInBrief: member.shareInBrief !== false,
    allowAgeReveal: member.allowAgeReveal === true,
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
  const secrets = await readJsonIfExists(SECRETS_PATH, { google: {}, llm: {}, transport: {}, routing: {}, calendarSources: {} });
  return {
    google: secrets.google || {},
    llm: secrets.llm || {},
    transport: secrets.transport || {},
    routing: secrets.routing || {},
    calendarSources: secrets.calendarSources || {},
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
  safeConfig.services.travel.transportApiKey = '';
  safeConfig.services.travel.transportApiKeyConfigured = Boolean(secrets.transport?.apiKey);
  safeConfig.services.travel.routingApiKey = '';
  safeConfig.services.travel.routingApiKeyConfigured = Boolean(secrets.routing?.apiKey);
  safeConfig.services.travel.googleRoutesApiKey = '';
  safeConfig.services.travel.googleRoutesApiKeyConfigured = Boolean(secrets.routing?.googleRoutesApiKey);
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

  const incomingTravelTransportApiKey = nextConfig.services?.travel?.transportApiKey;
  if (typeof incomingTravelTransportApiKey === 'string') {
    if (incomingTravelTransportApiKey.trim()) {
      nextSecrets.transport.apiKey = incomingTravelTransportApiKey.trim();
    }
    delete nextConfig.services.travel.transportApiKey;
  }

  const incomingTravelRoutingApiKey = nextConfig.services?.travel?.routingApiKey;
  if (typeof incomingTravelRoutingApiKey === 'string') {
    if (incomingTravelRoutingApiKey.trim()) {
      nextSecrets.routing.apiKey = incomingTravelRoutingApiKey.trim();
    }
    delete nextConfig.services.travel.routingApiKey;
  }

  const incomingGoogleRoutesApiKey = nextConfig.services?.travel?.googleRoutesApiKey;
  if (typeof incomingGoogleRoutesApiKey === 'string') {
    if (incomingGoogleRoutesApiKey.trim()) {
      nextSecrets.routing.googleRoutesApiKey = incomingGoogleRoutesApiKey.trim();
    }
    delete nextConfig.services.travel.googleRoutesApiKey;
  }

  delete nextConfig.services?.google?.clientSecretConfigured;
  delete nextConfig.services?.llm?.apiKeyConfigured;
  delete nextConfig.services?.transport?.apiKeyConfigured;
  delete nextConfig.services?.routing?.apiKeyConfigured;
  delete nextConfig.services?.travel?.transportApiKeyConfigured;
  delete nextConfig.services?.travel?.routingApiKeyConfigured;
  delete nextConfig.services?.travel?.googleRoutesApiKeyConfigured;

  return {
    config: normalizeConfig(nextConfig),
    secrets: nextSecrets,
  };
};

const saveConfig = async (rawConfig) => {
  const currentSecrets = await readSecrets();
  const { config, secrets } = extractSecretsFromConfig(validateConfigForSave(normalizeConfig(rawConfig)), currentSecrets);
  await writeSecrets(secrets);
  await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });
  return sanitizeConfigForClient(config, secrets);
};

const normalizeCalendarSource = (source = {}, index = 0) => {
  const type = source.type === 'caldav' ? 'caldav' : 'ics';
  return {
    id: source.id || `calendar_source_${index + 1}`,
    type,
    name: source.name || '',
    enabled: source.enabled !== false,
    url: typeof source.url === 'string' ? source.url.trim() : '',
    username: typeof source.username === 'string' ? source.username.trim() : '',
    color: typeof source.color === 'string' ? source.color : '',
  };
};

const readCalendarSources = async () => {
  const raw = await readJsonIfExists(CALENDAR_SOURCES_PATH, DEFAULT_CALENDAR_SOURCE_STORE);
  const sources = Array.isArray(raw.sources) ? raw.sources : [];
  return {
    sources: sources.map((source, index) => normalizeCalendarSource(source, index)),
  };
};

const sanitizeCalendarSourcesForClient = (sources, secrets) => ({
  sources: (sources?.sources || []).map((source) => ({
    ...source,
    password: '',
    passwordConfigured: Boolean(secrets?.calendarSources?.[source.id]?.password),
  })),
});

const attachCalendarSourceStatuses = (safeSources, calendarCache) => {
  const sourceStatusById = new Map((calendarCache?.sources || []).map((source) => [source.id, source]));
  return {
    ...safeSources,
    sources: (safeSources.sources || []).map((source) => {
      const status = sourceStatusById.get(source.id);
      return {
        ...source,
        syncStatus: status?.status || null,
        syncError: status?.error || '',
        syncEventCount: status?.eventCount ?? null,
      };
    }),
  };
};

const readCalendarSourcesForClient = async () => {
  const [sources, secrets, calendarCache] = await Promise.all([
    readCalendarSources(),
    readSecrets(),
    loadCalendarCache(),
  ]);
  return attachCalendarSourceStatuses(sanitizeCalendarSourcesForClient(sources, secrets), calendarCache);
};

const saveCalendarSources = async (rawSources) => {
  const currentSecrets = await readSecrets();
  const sourceList = Array.isArray(rawSources?.sources) ? rawSources.sources : [];
  const normalizedSources = sourceList.map((source, index) => normalizeCalendarSource(source, index));
  const nextSecrets = clone(currentSecrets);
  nextSecrets.calendarSources = nextSecrets.calendarSources || {};

  normalizedSources.forEach((source) => {
    const incomingPassword = typeof sourceList.find((entry) => `${entry?.id || ''}` === source.id)?.password === 'string'
      ? sourceList.find((entry) => `${entry?.id || ''}` === source.id).password.trim()
      : '';
    if (!nextSecrets.calendarSources[source.id]) {
      nextSecrets.calendarSources[source.id] = {};
    }
    if (incomingPassword) {
      nextSecrets.calendarSources[source.id].password = incomingPassword;
    }
  });

  const knownIds = new Set(normalizedSources.map((source) => source.id));
  Object.keys(nextSecrets.calendarSources || {}).forEach((sourceId) => {
    if (!knownIds.has(sourceId)) {
      delete nextSecrets.calendarSources[sourceId];
    }
  });

  await writeSecrets(nextSecrets);
  await ensureRuntimePaths();
  await fs.writeJson(CALENDAR_SOURCES_PATH, { sources: normalizedSources }, { spaces: 2, mode: 0o600 });
  await fs.chmod(CALENDAR_SOURCES_PATH, 0o600).catch(() => {});

  return sanitizeCalendarSourcesForClient({ sources: normalizedSources }, nextSecrets);
};

const normalizeAddressKey = (value) => value.toString().trim().toLowerCase();

const geocodeWithOpenMeteo = async (trimmedAddress) => {
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
    return { provider: 'open-meteo', location: null, error: 'no_result' };
  }

  return {
    provider: 'open-meteo',
    location: {
      label: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone || 'UTC',
      country: place.country || '',
      name: place.name || '',
      admin1: place.admin1 || '',
      resolvedAt: new Date().toISOString(),
    },
    error: null,
  };
};

const geocodeWithOpenRouteService = async (trimmedAddress, routingConfig = {}, routingSecrets = {}) => {
  if (routingConfig.provider !== 'openrouteservice' || !routingSecrets.apiKey) {
    return { provider: 'openrouteservice', location: null, error: 'not_configured' };
  }

  const baseUrl = (routingConfig.baseUrl || 'https://api.openrouteservice.org').replace(/\/$/, '');
  const response = await axios.get(`${baseUrl}/geocode/search`, {
    params: {
      text: trimmedAddress,
      size: 1,
    },
    headers: {
      Authorization: routingSecrets.apiKey,
    },
    timeout: 15000,
  });

  const feature = response.data?.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return { provider: 'openrouteservice', location: null, error: 'no_result' };
  }

  const properties = feature.properties || {};
  return {
    provider: 'openrouteservice',
    location: {
      label: properties.label || properties.name || trimmedAddress,
      latitude: Number(coordinates[1]),
      longitude: Number(coordinates[0]),
      timezone: properties.timezone || 'UTC',
      country: properties.country || '',
      name: properties.name || '',
      admin1: properties.region || properties.localadmin || '',
      resolvedAt: new Date().toISOString(),
    },
    error: null,
  };
};

const geocodeAddressDetailed = async (address, geocodeCache, options = {}) => {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    return {
      location: null,
      provider: 'none',
      error: 'empty_address',
      fromCache: false,
      attempts: [],
    };
  }

  const cacheKey = normalizeAddressKey(trimmedAddress);
  if (geocodeCache.entries[cacheKey]) {
    return {
      location: geocodeCache.entries[cacheKey],
      provider: 'cache',
      error: null,
      fromCache: true,
      attempts: [],
    };
  }

  const attempts = [];

  try {
    if (options.preferRoutingGeocoder) {
      try {
        const orsResult = await geocodeWithOpenRouteService(trimmedAddress, options.routingConfig, options.routingSecrets);
        attempts.push({ provider: orsResult.provider, error: orsResult.error });
        if (orsResult.location) {
          geocodeCache.entries[cacheKey] = orsResult.location;
          return {
            location: orsResult.location,
            provider: orsResult.provider,
            error: null,
            fromCache: false,
            attempts,
          };
        }
      } catch (error) {
        attempts.push({ provider: 'openrouteservice', error: error.response?.data?.error?.message || error.message || 'request_failed' });
      }
    }

    try {
      const openMeteoResult = await geocodeWithOpenMeteo(trimmedAddress);
      attempts.push({ provider: openMeteoResult.provider, error: openMeteoResult.error });
      if (openMeteoResult.location) {
        geocodeCache.entries[cacheKey] = openMeteoResult.location;
        return {
          location: openMeteoResult.location,
          provider: openMeteoResult.provider,
          error: null,
          fromCache: false,
          attempts,
        };
      }
    } catch (error) {
      attempts.push({ provider: 'open-meteo', error: error.response?.data?.reason || error.message || 'request_failed' });
    }

    geocodeCache.entries[cacheKey] = null;
    return {
      location: null,
      provider: attempts[0]?.provider || 'unknown',
      error: attempts.map((attempt) => `${attempt.provider}:${attempt.error}`).join(', ') || 'no_result',
      fromCache: false,
      attempts,
    };
  } catch (error) {
    return {
      location: null,
      provider: 'unknown',
      error: error.message || 'request_failed',
      fromCache: false,
      attempts,
    };
  }
};

const geocodeAddress = async (address, geocodeCache, options = {}) => {
  const result = await geocodeAddressDetailed(address, geocodeCache, options);
  return result.location;
};

const resolveStoredPlace = async (place, geocodeCache, options = {}) => {
  const nextPlace = {
    label: place?.label || '',
    address: place?.address || '',
    location: place?.location || null,
  };

  if (!nextPlace.address.trim()) {
    nextPlace.location = null;
    return nextPlace;
  }

  const resolvedLocation = await geocodeAddress(nextPlace.address, geocodeCache, options);
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
};

const withGoogleClient = async () => {
  const [{ settings }, account] = await Promise.all([getGoogleSettings(), getStoredGoogleAccount()]);

  if (!account || !settings.clientId || !settings.clientSecret || !settings.redirectUri) {
    return null;
  }

  assertGoogleTokenUsable(account);

  const client = createGoogleClient(settings);
  client.setCredentials(account.tokens || {});
  client.on('tokens', (tokens) => {
    const mergedTokens = {
      ...(account.tokens || {}),
      ...(tokens || {}),
    };
    if (!tokens.refresh_token && account.tokens?.refresh_token) {
      mergedTokens.refresh_token = account.tokens.refresh_token;
    }
    void writeGoogleAccount({
      ...account,
      tokenUpdatedAt: new Date().toISOString(),
      tokens: mergedTokens,
    }).catch((error) => {
      console.error('Failed to persist refreshed Google token:', error.message);
    });
  });
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

const DEFAULT_CALENDAR_CACHE = {
  syncedAt: null,
  connectedEmail: '',
  calendars: [],
  selectedCalendarIds: [],
  events: [],
  sources: [],
};

const decodeXmlEntities = (value = '') => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, '\'');

const decodeIcsText = (value = '') => value
  .replace(/\\n/gi, '\n')
  .replace(/\\,/g, ',')
  .replace(/\\;/g, ';')
  .replace(/\\\\/g, '\\')
  .trim();

const unfoldIcsLines = (input = '') => input
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .replace(/\n[ \t]/g, '');

const formatCalDavDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const iso = date.toISOString().replace(/[-:]/g, '');
  return `${iso.slice(0, 15)}Z`;
};

const parseIcsDateValue = (value, isAllDay = false) => {
  const normalized = `${value || ''}`.trim();
  if (!normalized) {
    return null;
  }

  if (/^\d{8}$/.test(normalized)) {
    const iso = `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
    return isAllDay ? iso : `${iso}T00:00:00`;
  }

  if (/^\d{8}T\d{6}Z$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T${normalized.slice(9, 11)}:${normalized.slice(11, 13)}:${normalized.slice(13, 15)}Z`;
  }

  if (/^\d{8}T\d{6}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T${normalized.slice(9, 11)}:${normalized.slice(11, 13)}:${normalized.slice(13, 15)}`;
  }

  return normalized;
};

const parseIcsEvents = ({ sourceId, calendarId, calendarSummary, calendarColor = '', text, defaultUrl = '' }) => {
  const unfolded = unfoldIcsLines(text);
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  return blocks.map((block, index) => {
    const lines = block.split('\n');
    const props = {};
    lines.forEach((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex <= 0) {
        return;
      }
      const rawKey = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 1);
      const key = rawKey.split(';')[0].toUpperCase();
      const params = rawKey.includes(';')
        ? rawKey.split(';').slice(1).reduce((acc, segment) => {
          const [paramKey, paramValue] = segment.split('=');
          if (paramKey && paramValue) {
            acc[paramKey.toUpperCase()] = paramValue;
          }
          return acc;
        }, {})
        : {};
      if (!props[key]) {
        props[key] = [];
      }
      props[key].push({ value, params });
    });

    const uid = props.UID?.[0]?.value || `${sourceId}:${calendarId}:${index + 1}`;
    const startMeta = props.DTSTART?.[0] || null;
    const endMeta = props.DTEND?.[0] || null;
    const isAllDay = (startMeta?.params?.VALUE || '').toUpperCase() === 'DATE' || /^\d{8}$/.test(startMeta?.value || '');
    const start = parseIcsDateValue(startMeta?.value, isAllDay);
    const end = parseIcsDateValue(endMeta?.value || startMeta?.value, isAllDay) || start;
    const status = decodeIcsText(props.STATUS?.[0]?.value || 'confirmed').toLowerCase();

    return {
      id: `${sourceId}:${uid}`,
      sourceId,
      status,
      title: decodeIcsText(props.SUMMARY?.[0]?.value || '(No title)'),
      description: decodeIcsText(props.DESCRIPTION?.[0]?.value || ''),
      location: decodeIcsText(props.LOCATION?.[0]?.value || ''),
      start,
      end,
      isAllDay,
      htmlLink: decodeIcsText(props.URL?.[0]?.value || defaultUrl || ''),
      calendarId,
      calendarSummary,
      calendarColor,
      calendarTextColor: '',
      isRecurring: Boolean(props.RRULE?.[0]?.value || props['RECURRENCE-ID']?.[0]?.value),
      recurringEventId: decodeIcsText(props.UID?.[0]?.value || ''),
      attendees: [],
    };
  }).filter((event) => event.start && event.end && event.status !== 'cancelled');
};

const buildSourceCalendarId = (sourceId, rawCalendarId) => `${sourceId}:${rawCalendarId}`;

const buildSourceCalendar = ({ source, rawCalendarId, summary }) => ({
  id: buildSourceCalendarId(source.id, rawCalendarId),
  summary: summary || source.name || source.url || source.id,
  primary: false,
  backgroundColor: source.color || '',
  foregroundColor: '',
  accessRole: source.type,
  sourceId: source.id,
  sourceType: source.type,
});

const buildBasicAuthConfig = (username, password = '') => {
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  if (!normalizedUsername) {
    return {};
  }
  return {
    auth: {
      username: normalizedUsername,
      password,
    },
  };
};

const parseXmlResponseBlocks = (xml = '') => {
  const matches = xml.match(/<[^>]*response[^>]*>[\s\S]*?<\/[^>]*response>/gi);
  return matches || [];
};

const extractXmlTagValue = (xml = '', localName = '') => {
  const match = xml.match(new RegExp(`<[^>]*${localName}[^>]*>([\\s\\S]*?)<\\/[^>]*${localName}>`, 'i'));
  return match ? decodeXmlEntities(match[1].trim()) : '';
};

const normalizeCalendarPath = (baseUrl, href) => {
  if (!href) {
    return baseUrl;
  }
  try {
    return new URL(href, baseUrl).toString();
  } catch (error) {
    return href;
  }
};

const discoverCalDavCalendars = async ({ source, password }) => {
  const response = await axios.request({
    method: 'PROPFIND',
    url: source.url,
    headers: {
      Depth: '1',
      'content-type': 'application/xml; charset=utf-8',
    },
    data: `<?xml version="1.0" encoding="utf-8" ?>
      <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:prop>
          <d:displayname />
          <d:resourcetype />
        </d:prop>
      </d:propfind>`,
    timeout: 15000,
    ...buildBasicAuthConfig(source.username, password),
  });

  const blocks = parseXmlResponseBlocks(response.data);
  const calendars = blocks
    .map((block, index) => {
      const href = extractXmlTagValue(block, 'href');
      const isCalendar = /<[^>]*calendar\b/i.test(block);
      if (!href || !isCalendar) {
        return null;
      }
      return {
        rawId: href || `${source.id}_${index + 1}`,
        url: normalizeCalendarPath(source.url, href),
        summary: extractXmlTagValue(block, 'displayname') || source.name || href,
      };
    })
    .filter(Boolean);

  return calendars.length
    ? calendars
    : [{
      rawId: source.url,
      url: source.url,
      summary: source.name || source.url,
    }];
};

const fetchCalDavEvents = async ({ source, password, timeMin, timeMax }) => {
  const calendars = await discoverCalDavCalendars({ source, password });
  const results = [];

  for (const calendar of calendars) {
    const response = await axios.request({
      method: 'REPORT',
      url: calendar.url,
      headers: {
        Depth: '1',
        'content-type': 'application/xml; charset=utf-8',
      },
      data: `<?xml version="1.0" encoding="utf-8" ?>
        <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
          <d:prop>
            <d:getetag />
            <c:calendar-data />
          </d:prop>
          <c:filter>
            <c:comp-filter name="VCALENDAR">
              <c:comp-filter name="VEVENT">
                <c:time-range start="${formatCalDavDateTime(timeMin)}" end="${formatCalDavDateTime(timeMax)}" />
              </c:comp-filter>
            </c:comp-filter>
          </c:filter>
        </c:calendar-query>`,
      timeout: 20000,
      ...buildBasicAuthConfig(source.username, password),
    });

    const blocks = parseXmlResponseBlocks(response.data);
    blocks.forEach((block) => {
      const calendarData = extractXmlTagValue(block, 'calendar-data');
      if (!calendarData) {
        return;
      }
      const normalizedCalendar = buildSourceCalendar({
        source,
        rawCalendarId: calendar.rawId,
        summary: calendar.summary,
      });
      results.push(
        ...parseIcsEvents({
          sourceId: source.id,
          calendarId: normalizedCalendar.id,
          calendarSummary: normalizedCalendar.summary,
          calendarColor: normalizedCalendar.backgroundColor,
          text: calendarData,
          defaultUrl: calendar.url,
        }),
      );
    });
  }

  return {
    calendars: calendars.map((calendar) => buildSourceCalendar({
      source,
      rawCalendarId: calendar.rawId,
      summary: calendar.summary,
    })),
    events: results,
  };
};

const fetchIcsEvents = async ({ source, password }) => {
  const response = await axios.get(source.url, {
    timeout: 15000,
    responseType: 'text',
    ...buildBasicAuthConfig(source.username, password),
  });
  const calendar = buildSourceCalendar({
    source,
    rawCalendarId: source.url,
    summary: source.name || source.url,
  });

  return {
    calendars: [calendar],
    events: parseIcsEvents({
      sourceId: source.id,
      calendarId: calendar.id,
      calendarSummary: calendar.summary,
      calendarColor: calendar.backgroundColor,
      text: typeof response.data === 'string' ? response.data : `${response.data || ''}`,
      defaultUrl: source.url,
    }),
  };
};

const fetchCalendarSourceBundle = async ({ source, secrets, timeMin, timeMax }) => {
  if (!source.enabled || !source.url) {
    return { calendars: [], events: [], source: { id: source.id, type: source.type, status: 'disabled' } };
  }

  try {
    const password = secrets?.calendarSources?.[source.id]?.password || '';
    const payload = source.type === 'caldav'
      ? await fetchCalDavEvents({ source, password, timeMin, timeMax })
      : await fetchIcsEvents({ source, password });
    return {
      calendars: payload.calendars,
      events: payload.events,
      source: {
        id: source.id,
        type: source.type,
        name: source.name || source.url,
        status: 'ready',
        eventCount: payload.events.length,
      },
    };
  } catch (error) {
    return {
      calendars: [],
      events: [],
      source: {
        id: source.id,
        type: source.type,
        name: source.name || source.url,
        status: 'error',
        error: error.message,
      },
    };
  }
};

const buildGoogleCalendarErrorSource = (error) => ({
  id: 'google',
  type: 'google',
  name: 'Google Calendar',
  status: 'error',
  error: formatGoogleAuthError(error),
  reconnectRequired: error?.code === 'GOOGLE_RECONNECT_REQUIRED'
    || error?.response?.data?.error === 'invalid_grant',
});

const fetchGoogleCalendarBundle = async ({ forceContext = false } = {}) => {
  const [clientInfo, config] = await Promise.all([withGoogleClient(), readConfig()]);
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
  const eventBuckets = await Promise.all(selectedCalendars.map((calendar) => fetchGoogleCalendarEvents({
    client,
    calendar,
    timeMin,
    timeMax,
  })));

  return {
    connectedEmail: account.email || '',
    calendars,
    selectedCalendarIds,
    events: eventBuckets.flat().sort((left, right) => new Date(left.start) - new Date(right.start)),
    source: {
      id: 'google',
      type: 'google',
      name: 'Google Calendar',
      status: 'ready',
    },
    forceContext,
    timeMin,
    timeMax,
  };
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

const weatherCodeToBucket = (code) => {
  if (code === 0) return 'clear';
  if (code <= 3) return 'partly_cloudy';
  if (code <= 48) return 'fog';
  if (code <= 67) return 'rain';
  if (code <= 77) return 'snow';
  if (code <= 82) return 'showers';
  return 'stormy';
};

const selectDominantWeatherCode = (codes = []) => {
  const counts = new Map();
  codes.forEach((code) => {
    const bucket = weatherCodeToBucket(code);
    const current = counts.get(bucket) || { count: 0, code };
    counts.set(bucket, {
      count: current.count + 1,
      code: current.code,
    });
  });

  return Array.from(counts.values())
    .sort((left, right) => right.count - left.count)[0]?.code ?? codes[0];
};

const buildForecastNarrative = ({ dominantCode, minTemp, maxTemp, rainyDays, selectedDayCount, uniqueBuckets }) => {
  const midpoint = Math.round((minTemp + maxTemp) / 2);
  const dominantLabel = weatherCodeToLabel(dominantCode);
  const stableWeather = uniqueBuckets <= 2;

  if (selectedDayCount >= 3 && rainyDays === 0 && stableWeather) {
    return `Looks consistent through the trip: around ${midpoint}C and mostly ${dominantLabel}.`;
  }

  if (selectedDayCount >= 3 && rainyDays === 1) {
    return `Mostly ${dominantLabel} around ${midpoint}C, with one wetter day worth planning for.`;
  }

  if (selectedDayCount >= 3 && rainyDays >= 2) {
    return `Mixed weather through the trip, around ${midpoint}C with rain likely on multiple days.`;
  }

  if (minTemp !== maxTemp) {
    return `${minTemp}-${maxTemp}C and mostly ${dominantLabel}.`;
  }

  return `Around ${midpoint}C and ${dominantLabel}.`;
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
  const dailyWeatherCodes = forecast.daily.weather_code || forecast.daily.weathercode || [];
  const codes = selectedIndexes.map((index) => dailyWeatherCodes[index]).filter((value) => value !== undefined);
  const minTemp = Math.round(Math.min(...tempsMin));
  const maxTemp = Math.round(Math.max(...tempsMax));
  const primaryCode = selectDominantWeatherCode(codes);
  const rainyDays = codes.filter((code) => ['rain', 'showers', 'stormy'].includes(weatherCodeToBucket(code))).length;
  const uniqueBuckets = new Set(codes.map((code) => weatherCodeToBucket(code))).size;
  const narrative = buildForecastNarrative({
    dominantCode: primaryCode,
    minTemp,
    maxTemp,
    rainyDays,
    selectedDayCount: selectedIndexes.length,
    uniqueBuckets,
  });

  return {
    label: `${minTemp}-${maxTemp}C, ${weatherCodeToLabel(primaryCode)}`,
    narrative,
    minTemp,
    maxTemp,
    weatherCode: primaryCode,
    rainyDays,
    dayCount: selectedIndexes.length,
  };
};

const getTimeZoneOffsetMinutes = (timeZone, date = new Date()) => {
  if (!timeZone) {
    return 0;
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date).reduce((accumulator, part) => {
      if (part.type !== 'literal') {
        accumulator[part.type] = part.value;
      }
      return accumulator;
    }, {});

    const zonedTimestamp = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );

    return Math.round((zonedTimestamp - date.getTime()) / 60000);
  } catch (error) {
    return 0;
  }
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
        daily: 'weather_code,temperature_2m_max,temperature_2m_min',
        current: 'temperature_2m,weather_code',
        timezone: location.timezone || 'auto',
        forecast_days: 14,
      },
      timeout: 8000,
    });

    const forecast = summarizeForecast(forecastResponse.data, startDate, endDate);
    const utcOffsetMinutes = getTimeZoneOffsetMinutes(location.timezone || 'UTC');
    const currentTime = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: location.timezone || 'UTC',
    }).format(new Date());

    const current = forecastResponse.data?.current || forecastResponse.data?.current_weather || {};
    const currentWeatherCode = Number(current.weather_code ?? current.weathercode);

    return {
      destination: location.label || location.name || '',
      timezone: location.timezone || 'UTC',
      utcOffsetMinutes,
      currentTime,
      currentWeather: current && Object.keys(current).length > 0
        ? {
          temp: Number.isFinite(Number(current.temperature_2m))
            ? Math.round(Number(current.temperature_2m))
            : null,
          weatherCode: Number.isFinite(currentWeatherCode)
            ? currentWeatherCode
            : null,
          label: Number.isFinite(currentWeatherCode) ? weatherCodeToLabel(currentWeatherCode) : '',
        }
        : null,
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
  .find((module) => module.type === 'weather')?.config || config?.moduleSettings?.weather || null;

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
  const tripMatch = title.match(/\b(?:to|in|at|nach)\s+([A-ZÄÖÜ][\p{L}'-]+(?:\s+[A-ZÄÖÜ][\p{L}'-]+){0,2})\b/u);
  if (tripMatch) {
    return tripMatch[1];
  }

  const travelTitleMatch = title.match(/\b(?:dienstreise|reise|trip|travel|urlaub|business trip)\s+([A-ZÄÖÜ][\p{L}'-]+(?:\s+[A-ZÄÖÜ][\p{L}'-]+){0,2})$/iu);
  if (travelTitleMatch) {
    return travelTitleMatch[1];
  }

  const trailingMatch = title.match(/[-:]\s*([A-ZÄÖÜ][\p{L}'-]+(?:\s+[A-ZÄÖÜ][\p{L}'-]+){0,2})$/u);
  return trailingMatch ? trailingMatch[1] : '';
};

const normalizeDestinationKey = (destination = '') => destination.trim().toLowerCase();
const STREET_ADDRESS_PATTERN = /\b\d{1,5}[a-z]?\b|(?:strasse|straße|street|road|avenue|allee|weg|gasse|platz|drive|lane)\b/i;
const ONLINE_EVENT_PATTERN = /\b(online|remote|zoom|teams|meet|webex)\b/i;
const USEFUL_LOCATION_KEYWORD_PATTERN = /\b(hospital|clinic|doctor|praxis|arzt|schule|school|kita|kindergarten|daycare|museum|zoo|theater|theatre|cinema|concert|venue|arena|stadium|airport|bahnhof|station|terminal|hotel|embassy|consulate|university|campus|messe|expo|office|büro)\b/i;
const GENERIC_DESTINATION_PATTERN = /^(school|schule|private|privat|work|office|home|zu hause|haus|kita|kindergarten|daycare|online|remote|meeting room|conference room|room)$/i;

const TRAVEL_SIGNAL_PATTERN = /\b(trip|reise|dienstreise|flight|flug|summit|conference|meetup|travel|hotel|airport|flughafen|train|zug|boarding|abflug|arrival|ankunft|departure)\b/i;
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

const normalizeMatchText = (value = '') => value
  .toString()
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const normalizeEventHintRuleCategory = (value = '') => {
  const normalized = `${value}`.trim().toLowerCase();
  return EVENT_HINT_RULE_CATEGORIES.has(normalized) ? normalized : 'generic';
};

const normalizeEventHintRuleOriginType = (value = '') => {
  const normalized = `${value}`.trim().toLowerCase();
  return EVENT_HINT_RULE_ORIGIN_TYPES.has(normalized) ? normalized : 'home';
};

const normalizeEventHintRuleRouteMode = (value = '') => {
  switch (`${value}`.trim().toLowerCase()) {
    case 'bike':
    case 'cycling':
      return 'bike';
    case 'walk':
    case 'walking':
      return 'walk';
    case 'public_transport':
    case 'transit':
    case 'train':
      return 'public_transport';
    default:
      return 'car';
  }
};

const normalizeEventHintKeywords = (value) => {
  const rawEntries = Array.isArray(value)
    ? value
    : `${value || ''}`.split(/[\n,]/g);

  return Array.from(new Set(rawEntries
    .map((entry) => entry?.toString().trim())
    .filter(Boolean)));
};

const normalizeEventHintWeatherRule = (value) => {
  const normalized = `${value || ''}`.trim().toLowerCase();
  return EVENT_HINT_WEATHER_RULES.has(normalized) ? normalized : 'none';
};

const normalizeEventHintAlternativeTransportOptions = (value) => (Array.isArray(value) ? value : [])
  .map((option, index) => {
    const label = typeof option?.label === 'string' ? option.label.trim() : '';
    const reminderText = typeof option?.reminderText === 'string' ? option.reminderText.trim() : '';
    const showPolicy = EVENT_HINT_ALT_TRANSPORT_POLICIES.has(`${option?.showPolicy || ''}`.trim().toLowerCase())
      ? `${option.showPolicy}`.trim().toLowerCase()
      : 'always';

    if (!label && !reminderText) {
      return null;
    }

    return {
      id: typeof option?.id === 'string' && option.id.trim() ? option.id.trim() : `event_hint_alt_${index + 1}`,
      label,
      reminderText,
      showPolicy,
    };
  })
  .filter(Boolean);

const normalizeEventHintRules = (rawRules = []) => (Array.isArray(rawRules) ? rawRules : [])
  .map((rule, index) => {
    const arriveEarlyMinutes = Number(rule?.arriveEarlyMinutes);
    const prepNotes = typeof rule?.prepNotes === 'string' && rule.prepNotes.trim()
      ? rule.prepNotes.trim()
      : (typeof rule?.additionalInfo === 'string' ? rule.additionalInfo.trim() : '');
    const freeformContext = typeof rule?.freeformContext === 'string' && rule.freeformContext.trim()
      ? rule.freeformContext.trim()
      : '';
    return {
      id: typeof rule?.id === 'string' && rule.id.trim() ? rule.id.trim() : `event_hint_${index + 1}`,
      enabled: rule?.enabled !== false,
      label: typeof rule?.label === 'string' ? rule.label.trim() : '',
      keywords: normalizeEventHintKeywords(rule?.keywords),
      category: normalizeEventHintRuleCategory(rule?.category),
      personLabel: typeof rule?.personLabel === 'string' ? rule.personLabel.trim() : '',
      locationLabel: typeof rule?.locationLabel === 'string' ? rule.locationLabel.trim() : '',
      locationAddress: typeof rule?.locationAddress === 'string' ? rule.locationAddress.trim() : '',
      prepNotes,
      freeformContext,
      additionalInfo: typeof rule?.additionalInfo === 'string' ? rule.additionalInfo.trim() : '',
      weatherRule: normalizeEventHintWeatherRule(rule?.weatherRule),
      alternativeTransportOptions: normalizeEventHintAlternativeTransportOptions(rule?.alternativeTransportOptions),
      arriveEarlyMinutes: Number.isFinite(arriveEarlyMinutes) && arriveEarlyMinutes > 0
        ? Math.min(480, Math.round(arriveEarlyMinutes))
        : 0,
      originType: normalizeEventHintRuleOriginType(rule?.originType),
      originReferenceId: typeof rule?.originReferenceId === 'string' ? rule.originReferenceId.trim() : '',
      originLabel: typeof rule?.originLabel === 'string' ? rule.originLabel.trim() : '',
      originAddress: typeof rule?.originAddress === 'string' ? rule.originAddress.trim() : '',
      transportMode: normalizeEventHintRuleRouteMode(rule?.transportMode),
    };
  });

const mapEventHintRuleToEnrichmentType = (category = 'generic') => {
  switch (normalizeEventHintRuleCategory(category)) {
    case 'medical':
    case 'prep':
    case 'pickup':
      return 'household_prep';
    case 'travel':
      return 'travel';
    default:
      return 'generic';
  }
};

const findMatchingEventHintRule = (event, config) => {
  const titleText = normalizeMatchText(event?.title || '');
  if (!titleText) {
    return null;
  }

  const rules = normalizeEventHintRules(config?.services?.context?.eventHintRules);
  const matches = rules
    .filter((rule) => rule.enabled !== false && rule.keywords.length > 0)
    .map((rule) => {
      const matchedKeyword = rule.keywords
        .map((keyword) => ({
          original: keyword,
          normalized: normalizeMatchText(keyword),
        }))
        .filter((keyword) => keyword.normalized && titleText.includes(keyword.normalized))
        .sort((left, right) => right.normalized.length - left.normalized.length)[0];

      if (!matchedKeyword) {
        return null;
      }

      const score = (matchedKeyword.normalized.length * 10)
        + (rule.locationAddress ? 4 : 0)
        + (rule.prepNotes ? 3 : 0)
        + (rule.alternativeTransportOptions?.length ? 2 : 0)
        + (rule.weatherRule && rule.weatherRule !== 'none' ? 2 : 0)
        + (rule.personLabel ? 2 : 0)
        + (rule.arriveEarlyMinutes > 0 ? 1 : 0);

      return {
        ...rule,
        matchedKeyword: matchedKeyword.original,
        enrichmentType: mapEventHintRuleToEnrichmentType(rule.category),
        score,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return (right.label || right.matchedKeyword || '').length - (left.label || left.matchedKeyword || '').length;
    });

  return matches[0] || null;
};

const inferTripTravelerLabel = (sourceEvents, household) => {
  const members = Array.isArray(household?.members) ? household.members : [];
  if (members.length === 0 || !Array.isArray(sourceEvents) || sourceEvents.length === 0) {
    return '';
  }

  const combinedText = normalizeMatchText(sourceEvents
    .map((event) => [event.title || '', event.description || '', event.location || '', event.calendarSummary || ''].join(' '))
    .join(' '));

  const scoredMembers = members
    .filter((member) => member.shareInBrief !== false && member.name)
    .map((member) => {
      const identityTokens = Array.from(new Set([member.nickname, member.name, ...(Array.isArray(member.tags) ? member.tags : [])]
        .map((token) => token?.toString().trim())
        .filter(Boolean)));
      const tokenMatch = identityTokens.find((token) => combinedText.includes(normalizeMatchText(token)));
      const calendarMatches = sourceEvents.filter((event) => Array.isArray(member.calendarIds) && member.calendarIds.includes(event.calendarId)).length;
      const score = (calendarMatches * 5) + (tokenMatch ? 3 : 0);

      return {
        member,
        score,
        tokenMatch,
        calendarMatches,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const best = scoredMembers[0];
  if (!best) {
    return '';
  }

  if (best.tokenMatch && best.tokenMatch !== best.member.name && best.tokenMatch.length >= 3) {
    return best.tokenMatch;
  }

  return best.member.nickname || best.member.name || '';
};

const TRIP_INTENT_KEYWORDS = {
  business_trip: /\b(work|business|conference|summit|client|meeting|internal team|onsite|offsite|expo|messe|teacher summit|dienstreise)\b/i,
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

const shouldSuppressRoutineRecurringEvents = (config) => {
  if (config?.services?.context?.suppressRoutineRecurringEvents !== undefined) {
    return config.services.context.suppressRoutineRecurringEvents !== false;
  }
  return config?.services?.llm?.suppressRoutineRecurringEvents !== false;
};

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

const getEnabledContextSignals = (config) => ({
  travel: config?.services?.context?.signals?.travel !== false,
  birthdays: config?.services?.context?.signals?.birthdays !== false,
  commute: config?.services?.context?.signals?.commute !== false,
  household: config?.services?.context?.signals?.household !== false,
  visitors: config?.services?.context?.signals?.visitors !== false,
  nextEvent: config?.services?.context?.signals?.nextEvent !== false,
  highlights: config?.services?.context?.signals?.highlights !== false,
});

const getDailyBriefCalendarScope = (config) => {
  const contextConfig = config?.services?.context || {};
  return {
    mode: ['all_selected', 'include_selected', 'exclude_selected'].includes(contextConfig.briefCalendarMode)
      ? contextConfig.briefCalendarMode
      : 'exclude_selected',
    includedIds: new Set(Array.isArray(contextConfig.briefIncludedCalendarIds) ? contextConfig.briefIncludedCalendarIds.filter(Boolean) : []),
    excludedIds: new Set(Array.isArray(contextConfig.briefExcludedCalendarIds) ? contextConfig.briefExcludedCalendarIds.filter(Boolean) : []),
  };
};

const isEventIncludedInDailyBrief = (event, config) => {
  const scope = getDailyBriefCalendarScope(config);
  if (!event?.calendarId) {
    return true;
  }

  if (scope.mode === 'include_selected') {
    return scope.includedIds.has(event.calendarId);
  }

  if (scope.mode === 'exclude_selected') {
    return !scope.excludedIds.has(event.calendarId);
  }

  return true;
};

const filterEventsForDailyBrief = (events, config) => (Array.isArray(events) ? events : [])
  .filter((event) => isEventIncludedInDailyBrief(event, config));

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

const buildBirthdayContext = (household, lookaheadDays = 10) => {
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
        memberName: member.nickname || member.name,
        legalName: member.name,
        birthdate: member.birthdate,
        nextOccurrence: occurrence.toISOString(),
        daysUntil,
        turning,
        allowAgeReveal: member.allowAgeReveal === true,
      };
    })
    .filter(Boolean)
    .filter((entry) => entry.daysUntil >= 0 && entry.daysUntil <= Math.max(1, Number(lookaheadDays) || 10))
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

const buildRoutingCacheKey = ({
  origin,
  destination,
  originPlace = null,
  destinationPlace = null,
  provider,
  profile,
  mode,
  timeContext = '',
}) => {
  const originToken = origin
    ? `${origin.latitude}:${origin.longitude}`
    : `addr:${normalizeAddressKey(originPlace?.address || '')}`;
  const destinationToken = destination
    ? `${destination.latitude}:${destination.longitude}`
    : `addr:${normalizeAddressKey(destinationPlace?.address || '')}`;

  return [
    provider || 'estimated',
    profile || 'driving-car',
    mode || 'car',
    originToken,
    destinationToken,
    timeContext || 'default',
  ].join(':');
};

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
    trafficSeverity: 'neutral',
    trafficDelayMinutes: null,
  };
};

const parseGoogleDurationSeconds = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const match = value.match(/^(-?\d+(?:\.\d+)?)s$/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
};

const mapGoogleTravelMode = (mode = 'car') => {
  switch (normalizeTravelMode(mode)) {
    case 'bike':
      return 'BICYCLE';
    case 'walk':
      return 'WALK';
    case 'public_transport':
      return 'TRANSIT';
    default:
      return 'DRIVE';
  }
};

const buildTrafficSeverity = (delayMinutes, durationMinutes) => {
  if (!Number.isFinite(delayMinutes) || delayMinutes <= 1) {
    return 'green';
  }
  if (delayMinutes <= 6 || delayMinutes <= Math.max(3, Math.round((durationMinutes || 0) * 0.15))) {
    return 'orange';
  }
  return 'red';
};

const buildGoogleTransitLineDetail = (transit = {}) => {
  const line = transit.transitLine || {};
  const rawLabel = [line.nameShort, line.name, transit.headsign, line.agencies?.[0]?.name]
    .map((value) => value?.toString().trim())
    .find(Boolean);
  const vehicleType = line.vehicle?.type?.toString().trim() || '';

  if (!rawLabel && !vehicleType) {
    return null;
  }

  return {
    vehicleType,
    label: rawLabel || '',
  };
};

const extractGoogleTransitLineDetails = (route) => {
  const steps = route?.legs?.[0]?.steps;
  if (!Array.isArray(steps)) {
    return [];
  }

  const details = steps
    .map((step) => {
      const transit = step?.transitDetails;
      if (!transit) {
        return null;
      }
      return buildGoogleTransitLineDetail(transit);
    })
    .filter(Boolean);

  const seen = new Set();
  const unique = [];
  for (const detail of details) {
    const key = `${detail.vehicleType}:${detail.label}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(detail);
    if (unique.length >= 3) {
      break;
    }
  }
  return unique;
};

const buildGoogleWaypoint = (location, place) => {
  if (location?.latitude !== undefined && location?.longitude !== undefined) {
    return {
      location: {
        latLng: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
      },
    };
  }

  if (place?.address) {
    return {
      address: place.address,
    };
  }

  return null;
};

const fetchGoogleRoutesEstimate = async ({
  origin,
  destination,
  originPlace = null,
  destinationPlace = null,
  routingSecrets,
  mode = 'car',
  arrivalTime = null,
  departureTime = null,
}) => {
  const travelMode = mapGoogleTravelMode(mode);
  const originWaypoint = buildGoogleWaypoint(origin, originPlace);
  const destinationWaypoint = buildGoogleWaypoint(destination, destinationPlace);
  if (!originWaypoint || !destinationWaypoint) {
    return null;
  }
  const body = {
    origin: originWaypoint,
    destination: destinationWaypoint,
    travelMode,
    units: 'METRIC',
    languageCode: 'en-GB',
    regionCode: 'de',
  };

  if (travelMode === 'TRANSIT' && arrivalTime) {
    body.arrivalTime = arrivalTime;
  } else {
    body.departureTime = departureTime || new Date().toISOString();
  }

  if (travelMode === 'DRIVE') {
    body.routingPreference = 'TRAFFIC_AWARE_OPTIMAL';
  }

  const response = await axios.post('https://routes.googleapis.com/directions/v2:computeRoutes', body, {
    headers: {
      'X-Goog-Api-Key': routingSecrets.googleRoutesApiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.legs.steps.transitDetails',
      'content-type': 'application/json',
    },
    timeout: 15000,
  });

  const route = response.data?.routes?.[0];
  if (!route) {
    return null;
  }

  const durationSeconds = parseGoogleDurationSeconds(route.duration);
  const staticDurationSeconds = parseGoogleDurationSeconds(route.staticDuration);
  const distanceMeters = route.distanceMeters;
  if (!durationSeconds || !distanceMeters) {
    return null;
  }

  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const distanceKm = Math.round(distanceMeters / 1000);
  const staticMinutes = Number.isFinite(staticDurationSeconds) ? Math.max(1, Math.round(staticDurationSeconds / 60)) : null;
  const delayMinutes = staticMinutes !== null ? Math.max(0, durationMinutes - staticMinutes) : null;
  const trafficSeverity = travelMode === 'DRIVE'
    ? buildTrafficSeverity(delayMinutes, durationMinutes)
    : 'neutral';

  const summary = travelMode === 'TRANSIT'
    ? `About ${durationMinutes} min by public transport`
    : (travelMode === 'DRIVE'
      ? (delayMinutes && delayMinutes > 0
        ? `About ${durationMinutes} min with traffic`
        : `About ${durationMinutes} min`)
      : `About ${durationMinutes} min`);

  return {
    source: 'google_routes',
    profile: travelMode,
    distanceKm,
    durationMinutes,
    staticDurationMinutes: staticMinutes,
    trafficDelayMinutes: delayMinutes,
    trafficSeverity,
    summary,
    lineDetails: travelMode === 'TRANSIT'
      ? extractGoogleTransitLineDetails(route)
          .map((detail) => detail.label)
          .filter(Boolean)
      : [],
    lineDetailsDetailed: travelMode === 'TRANSIT' ? extractGoogleTransitLineDetails(route) : [],
  };
};

const resolveRoutingProviderForMode = (routingConfig, routingSecrets, mode = 'car') => {
  const normalizedMode = normalizeTravelMode(mode);
  const googleEnabled = routingConfig.googleRoutesEnabled === true && Boolean(routingSecrets.googleRoutesApiKey);

  if (googleEnabled && (normalizedMode === 'car' || normalizedMode === 'public_transport' || routingConfig.googleRoutesForAllModes === true)) {
    return 'google_routes';
  }

  if (routingConfig.enabled && routingConfig.provider === 'openrouteservice' && normalizedMode !== 'public_transport' && Boolean(routingSecrets.apiKey)) {
    return 'openrouteservice';
  }

  return 'estimated';
};

const getRouteEstimate = async ({
  origin,
  destination,
  originPlace = null,
  destinationPlace = null,
  routingConfig,
  routingSecrets,
  routingCache,
  mode = 'auto',
  arrivalTime = null,
  departureTime = null,
}) => {
  if ((!origin && !originPlace?.address) || (!destination && !destinationPlace?.address)) {
    return null;
  }

  const effectiveProvider = resolveRoutingProviderForMode(routingConfig, routingSecrets, mode);
  const profile = effectiveProvider === 'google_routes'
    ? mapGoogleTravelMode(mode)
    : (routingConfig.enabled ? (routingConfig.profile || inferRoutingProfile(mode)) : inferRoutingProfile(mode));
  const cacheKey = buildRoutingCacheKey({
    origin,
    destination,
    originPlace,
    destinationPlace,
    provider: effectiveProvider,
    profile,
    mode: normalizeTravelMode(mode),
    timeContext: arrivalTime || departureTime || '',
  });
  const refreshMinutes = Number(routingConfig.refreshMinutes) || 30;
  const cachedEntry = routingCache.entries?.[cacheKey];
  const isFresh = cachedEntry?.fetchedAt
    && (Date.now() - new Date(cachedEntry.fetchedAt).getTime()) < (refreshMinutes * 60000);

  if (isFresh && cachedEntry?.route) {
    return {
      ...cachedEntry.route,
      fetchedAt: cachedEntry.route?.fetchedAt || cachedEntry.fetchedAt,
    };
  }

  let route = null;
  try {
    if (effectiveProvider === 'google_routes') {
      route = await fetchGoogleRoutesEstimate({
        origin,
        destination,
        originPlace,
        destinationPlace,
        routingSecrets,
        mode,
        arrivalTime,
        departureTime,
      });
    } else if (effectiveProvider === 'openrouteservice') {
      route = await fetchOpenRouteServiceEstimate(origin, destination, routingConfig, routingSecrets);
    }
  } catch (error) {
    route = null;
  }

  if (!route && normalizeTravelMode(mode) !== 'public_transport') {
    route = estimateRouteFallback(origin, destination, mode);
  }

  if (route) {
    const fetchedAt = new Date().toISOString();
    const routeWithMeta = {
      ...route,
      fetchedAt,
    };
    routingCache.entries[cacheKey] = {
      fetchedAt,
      route: routeWithMeta,
    };
    return routeWithMeta;
  }

  return route;
};

const resolveTravelAnchorPlace = async ({ referenceType, referenceId, label, address, household, config, geocodeCache, routingConfig, routingSecrets, includeDebug = false }) => {
  const resolveOptions = {
    preferRoutingGeocoder: true,
    routingConfig,
    routingSecrets,
  };

  const withDebug = async (place) => {
    const resolvedPlace = await resolveStoredPlace(place || {}, geocodeCache, resolveOptions);
    if (!includeDebug) {
      return resolvedPlace;
    }
    const geocodeDebug = await geocodeAddressDetailed(resolvedPlace.address || '', geocodeCache, resolveOptions);
    return {
      place: resolvedPlace,
      debug: {
        provider: geocodeDebug.provider,
        error: geocodeDebug.error,
        fromCache: geocodeDebug.fromCache,
        attempts: geocodeDebug.attempts,
      },
    };
  };

  if (referenceType === 'home' && household?.home) {
    return withDebug(household.home);
  }

  if (referenceType === 'member_work') {
    const member = (household?.members || []).find((entry) => entry.id === referenceId);
    return withDebug(member?.places?.work || null);
  }

  if (referenceType === 'member_school') {
    const member = (household?.members || []).find((entry) => entry.id === referenceId);
    return withDebug(member?.places?.school || null);
  }

  if (referenceType === 'saved_place') {
    return withDebug((household?.savedPlaces || []).find((entry) => entry.id === referenceId) || null);
  }

  if (referenceType === 'home_airport') {
    return withDebug({ label: config.services?.travel?.homeAirport || 'Home airport', address: config.services?.travel?.homeAirport || '' });
  }

  if (referenceType === 'closest_train_station') {
    return withDebug({ label: config.services?.travel?.closestTrainStation || 'Train station', address: config.services?.travel?.closestTrainStation || '' });
  }

  if (referenceType === 'closest_bus_station') {
    return withDebug({ label: config.services?.travel?.closestBusStation || 'Bus station', address: config.services?.travel?.closestBusStation || '' });
  }

  if (referenceType === 'closest_tube_station') {
    return withDebug({ label: config.services?.travel?.closestTubeStation || 'Tube station', address: config.services?.travel?.closestTubeStation || '' });
  }

  if (referenceType === 'custom') {
    return withDebug({ label: label || '', address: address || '' });
  }

  return includeDebug ? { place: null, debug: null } : null;
};

const normalizeTravelMode = (value = '') => {
  switch (`${value}`.trim().toLowerCase()) {
    case 'car':
      return 'car';
    case 'bike':
    case 'cycling':
      return 'bike';
    case 'walk':
    case 'walking':
      return 'walk';
    case 'public_transport':
    case 'transit':
    case 'train':
      return 'public_transport';
    default:
      return 'car';
  }
};

const buildTravelTimeSeverity = ({ minutes, mode }) => {
  const normalizedMode = normalizeTravelMode(mode);
  const greenMax = normalizedMode === 'walk' ? 20 : 30;
  const orangeMax = normalizedMode === 'walk' ? 40 : 60;
  if (minutes <= greenMax) return 'green';
  if (minutes <= orangeMax) return 'orange';
  return 'red';
};

const buildTravelLineDetails = (route, mode) => {
  if (normalizeTravelMode(mode) !== 'public_transport') {
    return [];
  }
  return Array.isArray(route?.lineDetails) ? route.lineDetails : [];
};

const buildTravelLineDetailsDetailed = (route, mode) => {
  if (normalizeTravelMode(mode) !== 'public_transport') {
    return [];
  }
  return Array.isArray(route?.lineDetailsDetailed)
    ? route.lineDetailsDetailed
        .map((entry) => ({
          vehicleType: entry?.vehicleType?.toString() || '',
          label: entry?.label?.toString() || '',
        }))
        .filter((entry) => entry.vehicleType || entry.label)
    : [];
};

const supportsTransitRouting = (routingConfig = {}, routingSecrets = {}) => (
  routingConfig.googleRoutesEnabled === true && Boolean(routingSecrets.googleRoutesApiKey)
);

const supportsTrafficAwareDriving = (routingConfig = {}, routingSecrets = {}) => (
  routingConfig.googleRoutesEnabled === true && Boolean(routingSecrets.googleRoutesApiKey)
);

const describeTravelAnchorRequirement = (referenceType, config) => {
  switch (referenceType) {
    case 'home':
      return 'Set a household home address with a resolved location.';
    case 'home_airport':
      return 'Fill Home Airport in the Travel integration.';
    case 'closest_train_station':
      return 'Fill Closest Train Station in the Travel integration.';
    case 'closest_bus_station':
      return 'Fill Closest Bus Station in the Travel integration.';
    case 'closest_tube_station':
      return 'Fill Closest Tube Station in the Travel integration.';
    case 'member_work':
      return 'Set the household member work place with a valid address.';
    case 'member_school':
      return 'Set the household member school place with a valid address.';
    case 'saved_place':
      return 'Choose a saved place that has a valid address.';
    case 'custom':
      return 'Enter a destination or origin address that can be geocoded.';
    default:
      return config === 'origin'
        ? 'Complete the route origin settings.'
        : 'Complete the route destination settings.';
  }
};

const buildTravelLocationIssueSummary = ({ item, origin, destination, config }) => {
  const missingParts = [];

  if (!hasResolvedLocation(origin)) {
    missingParts.push(`Origin missing. ${describeTravelAnchorRequirement(item.originType || 'home', config)}`);
  }

  if (!hasResolvedLocation(destination)) {
    missingParts.push(`Destination missing. ${describeTravelAnchorRequirement(item.destinationType || 'custom', config)}`);
  }

  return missingParts.join(' ');
};

const summarizePlaceForDebug = (place) => ({
  label: place?.label || '',
  address: place?.address || '',
  hasLocation: hasResolvedLocation(place),
  location: hasResolvedLocation(place)
    ? {
      latitude: place.location.latitude,
      longitude: place.location.longitude,
      timezone: place.location.timezone || '',
      resolvedLabel: place.location.label || '',
    }
    : null,
});

const computeTravelTimeItems = async ({ items = [] }) => {
  const [config, secrets, household, geocodeCache, routingCache] = await Promise.all([
    readConfig(),
    readSecrets(),
    readHousehold(),
    readGeocodeCache(),
    readRoutingCache(),
  ]);
  const routingConfig = config.services.routing || {};
  const routingSecrets = secrets.routing || {};

  const results = [];
  const debugItems = [];
  let latestRouteFetchedAt = null;
  for (const item of items) {
    if (!item || item.enabled === false) {
      continue;
    }

    const debugItem = {
      id: item.id || `travel_item_${results.length + 1}`,
      label: item.label || item.destinationLabel || 'Route',
      input: {
        originType: item.originType || 'home',
        originReferenceId: item.originReferenceId || '',
        originLabel: item.originLabel || '',
        originAddress: item.originAddress || '',
        destinationType: item.destinationType || 'custom',
        destinationReferenceId: item.destinationReferenceId || '',
        destinationLabel: item.destinationLabel || '',
        destinationAddress: item.destinationAddress || '',
        mode: normalizeTravelMode(item.mode),
      },
      origin: null,
      destination: null,
      status: 'pending',
      summary: '',
      route: null,
    };

    const origin = await resolveTravelAnchorPlace({
      referenceType: item.originType || 'home',
      referenceId: item.originReferenceId || '',
      label: item.originLabel || '',
      address: item.originAddress || '',
      household,
      config,
      geocodeCache,
      routingConfig,
      routingSecrets,
      includeDebug: true,
    });
    const resolvedOrigin = origin?.place || null;
    debugItem.origin = {
      ...summarizePlaceForDebug(resolvedOrigin),
      geocode: origin?.debug || null,
    };
    const destination = await resolveTravelAnchorPlace({
      referenceType: item.destinationType || 'custom',
      referenceId: item.destinationReferenceId || '',
      label: item.destinationLabel || '',
      address: item.destinationAddress || '',
      household,
      config,
      geocodeCache,
      routingConfig,
      routingSecrets,
      includeDebug: true,
    });
    const resolvedDestination = destination?.place || null;
    debugItem.destination = {
      ...summarizePlaceForDebug(resolvedDestination),
      geocode: destination?.debug || null,
    };

    const mode = normalizeTravelMode(item.mode);
    const effectiveProvider = resolveRoutingProviderForMode(routingConfig, routingSecrets, mode);
    const providerCanRouteFromAddress = effectiveProvider === 'google_routes';
    const hasUsableOrigin = hasResolvedLocation(resolvedOrigin) || (providerCanRouteFromAddress && Boolean(resolvedOrigin?.address));
    const hasUsableDestination = hasResolvedLocation(resolvedDestination) || (providerCanRouteFromAddress && Boolean(resolvedDestination?.address));

    if (!hasUsableOrigin || !hasUsableDestination) {
      const summary = buildTravelLocationIssueSummary({ item, origin: resolvedOrigin, destination: resolvedDestination, config });
      results.push({
        id: item.id || `travel_item_${results.length + 1}`,
        label: item.label || item.destinationLabel || 'Route',
        mode: normalizeTravelMode(item.mode),
        status: 'missing_location',
        summary,
        severity: 'orange',
        trafficSeverity: 'neutral',
        trafficDelayMinutes: null,
        lineDetails: [],
        lineDetailsDetailed: [],
      });
      debugItems.push({
        ...debugItem,
        status: 'missing_location',
        summary,
      });
      continue;
    }

    if (mode === 'public_transport' && !supportsTransitRouting(routingConfig, routingSecrets)) {
      const summary = 'Public transport routing is not supported with the current provider. Use a transit-capable provider such as Google Routes.';
      results.push({
        id: item.id || `travel_item_${results.length + 1}`,
        label: item.label || resolvedDestination.label || resolvedDestination.location?.label || 'Route',
        originLabel: resolvedOrigin.label || resolvedOrigin.location?.label || 'Origin',
        destinationLabel: resolvedDestination.label || resolvedDestination.location?.label || 'Destination',
        mode,
        status: 'unsupported_provider',
        summary,
        durationMinutes: null,
        distanceKm: null,
        severity: 'orange',
        trafficSeverity: 'neutral',
        trafficDelayMinutes: null,
        lineDetails: [],
        lineDetailsDetailed: [],
      });
      debugItems.push({
        ...debugItem,
        status: 'unsupported_provider',
        summary,
        route: null,
      });
      continue;
    }

    const route = await getRouteEstimate({
      origin: hasResolvedLocation(resolvedOrigin) ? resolvedOrigin.location : null,
      destination: hasResolvedLocation(resolvedDestination) ? resolvedDestination.location : null,
      originPlace: resolvedOrigin,
      destinationPlace: resolvedDestination,
      routingConfig,
      routingSecrets,
      routingCache,
      mode,
    });
    const minutes = Number(route?.durationMinutes) || 0;
    const summary = route?.summary || 'No travel estimate available.';
    if (route?.fetchedAt && (!latestRouteFetchedAt || new Date(route.fetchedAt).getTime() > new Date(latestRouteFetchedAt).getTime())) {
      latestRouteFetchedAt = route.fetchedAt;
    }
    results.push({
      id: item.id || `travel_item_${results.length + 1}`,
      label: item.label || resolvedDestination.label || resolvedDestination.location?.label || 'Route',
      originLabel: resolvedOrigin.label || resolvedOrigin.location?.label || 'Origin',
      destinationLabel: resolvedDestination.label || resolvedDestination.location?.label || 'Destination',
      mode,
      status: route?.source === 'estimated' ? 'estimated' : 'live',
      summary,
      durationMinutes: minutes,
      distanceKm: route?.distanceKm || null,
      severity: buildTravelTimeSeverity({ minutes, mode }),
      trafficSeverity: route?.trafficSeverity || 'neutral',
      trafficDelayMinutes: route?.trafficDelayMinutes ?? null,
      lineDetails: buildTravelLineDetails(route, mode),
      lineDetailsDetailed: buildTravelLineDetailsDetailed(route, mode),
      fetchedAt: route?.fetchedAt || null,
    });
    debugItems.push({
      ...debugItem,
      status: route?.source === 'estimated' ? 'estimated' : 'live',
      summary,
        route: route
          ? {
            source: route.source || '',
            profile: route.profile || '',
            durationMinutes: route.durationMinutes || null,
            distanceKm: route.distanceKm || null,
            trafficSeverity: route.trafficSeverity || 'neutral',
            trafficDelayMinutes: route.trafficDelayMinutes ?? null,
            lineDetails: Array.isArray(route.lineDetails) ? route.lineDetails : [],
            lineDetailsDetailed: Array.isArray(route.lineDetailsDetailed) ? route.lineDetailsDetailed : [],
            fetchedAt: route.fetchedAt || null,
          }
          : null,
    });
  }

  await writeGeocodeCache(geocodeCache);
  await writeRoutingCache(routingCache);
  await writeTravelTimeDebug({
    updatedAt: new Date().toISOString(),
    config: {
      travelEnabled: config.services?.travel?.enabled !== false,
      routingProvider: routingConfig.provider || 'none',
      routingBaseUrl: routingConfig.baseUrl || 'https://api.openrouteservice.org',
      routingProfile: routingConfig.profile || 'driving-car',
      routingApiKeyConfigured: Boolean(routingSecrets.apiKey),
      googleRoutesEnabled: routingConfig.googleRoutesEnabled === true,
      googleRoutesForAllModes: routingConfig.googleRoutesForAllModes === true,
      googleRoutesApiKeyConfigured: Boolean(routingSecrets.googleRoutesApiKey),
      supportsTransitRouting: supportsTransitRouting(routingConfig, routingSecrets),
      supportsTrafficAwareDriving: supportsTrafficAwareDriving(routingConfig, routingSecrets),
    },
    items: debugItems,
  });
  return {
    updatedAt: latestRouteFetchedAt,
    items: results,
  };
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

const formatTransportTime = (value) => {
  const date = getBestTimestamp(value);
  if (!date) {
    return '';
  }

  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
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
      ? `Landed ${formatTransportTime(actualArrival)}`
      : 'Landed';
    return { code: 'landed', label };
  }

  if (actualDeparture || status === 'active') {
    const eta = formatTransportTime(estimatedArrival);
    return { code: 'departed', label: eta ? `In the air, lands ${eta}` : 'In the air' };
  }

  if (status === 'cancelled') {
    return { code: 'cancelled', label: 'Cancelled' };
  }

  if (delayMinutes >= 20) {
    const eta = formatTransportTime(estimatedArrival);
    return { code: 'delayed', label: eta ? `${delayMinutes} min delay, lands ${eta}` : `${delayMinutes} min delay` };
  }

  if (scheduledDeparture) {
    const diffMinutes = Math.round((scheduledDeparture.getTime() - now) / 60000);
    const departureLabel = formatTransportTime(scheduledDeparture);
    const arrivalLabel = formatTransportTime(estimatedArrival);
    if (diffMinutes >= 0 && diffMinutes <= 45) {
      return { code: 'boarding_soon', label: arrivalLabel ? `Boarding soon, lands ${arrivalLabel}` : `Boarding soon for ${departureLabel}` };
    }
    if (diffMinutes > 45 && diffMinutes <= 180) {
      return { code: 'departure_today', label: arrivalLabel ? `Departs ${departureLabel}, lands ${arrivalLabel}` : `Departure ${departureLabel}` };
    }
  }

  return {
    code: 'scheduled',
    label: formatTransportTime(estimatedArrival) ? `On time, lands ${formatTransportTime(estimatedArrival)}` : (live.statusText || 'Scheduled'),
  };
};

const buildTransportCacheKey = (provider, segment) => {
  const routePart = segment.routeLabel || '';
  const datePart = new Date(segment.start).toISOString().slice(0, 10);
  return `${provider}:${segment.type}:${segment.identifier}:${routePart}:${datePart}`;
};

const buildFlightLiveSummary = (live) => {
  return uniqueTexts([
    live.lifecycle?.label || '',
    live.departure?.terminal ? `terminal ${live.departure.terminal}` : '',
    live.departure?.gate ? `gate ${live.departure.gate}` : '',
    live.arrival?.terminal ? `arrival terminal ${live.arrival.terminal}` : '',
  ]).join(' • ');
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

  live.lifecycle = deriveFlightLifecycle(live);
  live.summary = buildFlightLiveSummary(live);
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
    const anchorEventIds = new Set(cluster.anchors.map((anchor) => anchor.eventId).filter(Boolean));
    const clusterStartMs = new Date(cluster.start).getTime();
    const clusterEndMs = new Date(cluster.end).getTime();
    let windowStart = new Date(cluster.start).getTime() - (12 * 3600000);
    let windowEnd = new Date(cluster.end).getTime() + (12 * 3600000);

    const relatedEvents = events.filter((event) => {
      const eventStart = new Date(event.start).getTime();
      const eventEnd = new Date(event.end).getTime();
      const overlapsWindow = eventStart <= windowEnd && eventEnd >= windowStart;
      const mentionsDestination = eventMentionsDestination(event, cluster.destination);
      const sameCalendar = anchorCalendarIds.has(event.calendarSummary || '');
      const isAnchorEvent = anchorEventIds.has(event.id);
      const isNearTripBoundary = Math.abs(eventStart - clusterStartMs) <= (18 * 3600000)
        || Math.abs(eventEnd - clusterEndMs) <= (18 * 3600000);

      return isAnchorEvent
        || mentionsDestination
        || eventHasTravelSignal(event)
        || (overlapsWindow && sameCalendar && isNearTripBoundary && !isLowValueRoutineEvent(event));
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
    const travelerLabel = inferTripTravelerLabel(sourceEvents, household);
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
      travelerLabel,
      sourceEventIds: sourceEvents.map((event) => event.id),
      eventCount: sourceEvents.length,
      calendars: Array.from(new Set(sourceEvents.map((event) => event.calendarSummary).filter(Boolean))),
      eventTitles: sourceEvents.map((event) => event.title).slice(0, 6),
    };
  }));

  return tripTimelines.sort((left, right) => new Date(left.start) - new Date(right.start));
};

const UPCOMING_TRIP_BRIEF_WINDOW_MS = 72 * 3600000;

const selectActiveTrip = (trips) => {
  const now = Date.now();
  return trips.find((trip) => now >= new Date(trip.start).getTime() && now <= new Date(trip.end).getTime())
    || trips.find((trip) => {
      const start = new Date(trip.start).getTime();
      return start >= now && (start - now) <= UPCOMING_TRIP_BRIEF_WINDOW_MS;
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
    homeboundSegment: getLatestHomeboundSegment(trip, transportConfig),
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

const buildTravelHeadsUpContext = (events, config, household) => {
  const now = Date.now();
  const candidate = events
    .map((event) => {
      const startMs = new Date(event.start).getTime();
      const endMs = new Date(event.end).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < now || startMs < now) {
        return null;
      }

      const anchor = inferTripAnchorFromEvent(event, config, household);
      if (!anchor || (startMs - now) > UPCOMING_TRIP_BRIEF_WINDOW_MS) {
        return null;
      }

      return {
        event,
        anchor,
        startMs,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.startMs - right.startMs)[0];

  if (!candidate) {
    return null;
  }

  return {
    title: candidate.event.title,
    destination: candidate.anchor.destination,
    start: candidate.event.start,
    end: candidate.event.end,
    isAllDay: candidate.event.isAllDay,
    sourceEventId: candidate.event.id,
    travelerLabel: inferTripTravelerLabel([candidate.event], household),
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

const hasMeaningfulBriefCandidate = (candidate) => Boolean(
  candidate
  && (
    (typeof candidate.householdView === 'string' && candidate.householdView.trim())
    || (Array.isArray(candidate.bullets) && candidate.bullets.length > 0)
  ),
);

const llmBriefHasMeaningfulContent = (brief) => Boolean(
  brief
  && (
    (typeof brief.householdView === 'string' && brief.householdView.trim())
    || (Array.isArray(brief.bullets) && brief.bullets.some((bullet) => bullet?.toString().trim()))
    || (Array.isArray(brief.items) && brief.items.some(hasMeaningfulBriefCandidate))
  ),
);

const buildBriefItems = (candidates, limit = 3) => candidates
  .filter(hasMeaningfulBriefCandidate)
  .slice(0, limit)
  .map((candidate) => ({
    id: candidate.id,
    kind: candidate.kind || candidate.id,
    headline: candidate.headline || 'Daily brief',
    householdView: candidate.householdView || '',
    bullets: uniqueTexts(candidate.bullets || []).slice(0, 3),
    score: candidate.score || 0,
  }));

const buildBriefItemsFromBrief = (brief) => {
  if (!brief || !llmBriefHasMeaningfulContent(brief)) {
    return [];
  }

  return [{
    id: 'llm_brief',
    kind: 'llm',
    headline: brief.headline || 'Daily brief',
    householdView: typeof brief.householdView === 'string' ? brief.householdView : '',
    bullets: Array.isArray(brief.bullets) ? brief.bullets.filter((bullet) => bullet?.toString().trim()).slice(0, 4) : [],
    score: 100,
  }];
};

const buildTripCurrentConditionsLabel = (trip) => {
  const temp = trip?.enrichment?.currentWeather?.temp;
  const weatherLabel = trip?.enrichment?.currentWeather?.label;
  if (temp === null || temp === undefined || !weatherLabel) {
    return '';
  }

  return `${trip.destination} now: ${weatherLabel}, ${temp}C.`;
};

const buildContextCandidates = (events, activeTrip, nextEvent, recentTrip, travelHeadsUpContext, visitorContext, birthdayContext, commuteContext, householdEventContext, highlightEventContext = null) => {
  const candidates = [];

  if (activeTrip) {
    const destination = activeTrip.enrichment?.destination || activeTrip.destination;
    const travelerLabel = activeTrip.travelerLabel || '';
    const lifecycleCode = activeTrip.transportLifecycle?.code || '';
    const lifecycleLabel = activeTrip.transportLifecycle?.label || '';
    const intentLabel = activeTrip.intent?.label || 'Trip';
    const phaseCode = activeTrip.phase?.code || '';
    const phaseLabel = activeTrip.phase?.label || '';
    const tripHours = hoursUntil(activeTrip.start);
    const forecastNarrative = activeTrip.enrichment?.forecast?.narrative || activeTrip.enrichment?.forecast?.label || '';
    const currentWeatherLabel = buildTripCurrentConditionsLabel(activeTrip);
    const homeboundSegment = activeTrip.homeboundSegment || null;
    const homeboundHours = homeboundSegment?.start ? hoursUntil(homeboundSegment.start) : null;

    let householdView = `${intentLabel} context is active for ${destination}.`;
    let score = 78;
    const bullets = [];

    if (phaseCode === 'returned_home') {
      householdView = travelerLabel ? `${travelerLabel} is back home from ${destination}.` : `Back home from ${destination}.`;
      score = 86;
      bullets.push(householdView);
    } else if (phaseCode === 'trip_active' && homeboundSegment && homeboundHours !== null && homeboundHours >= 0 && homeboundHours <= 36) {
      const returnDayLabel = homeboundHours <= 18 ? 'later today' : 'tomorrow';
      householdView = travelerLabel
        ? `${travelerLabel} returns from ${destination} ${returnDayLabel}.`
        : `Return from ${destination} is ${returnDayLabel}.`;
      score = homeboundHours <= 18 ? 96 : 90;
      bullets.push(homeboundSegment.lifecycle?.label || '');
      bullets.push(homeboundSegment.summary || '');
    } else if (phaseCode === 'returning_home') {
      householdView = travelerLabel
        ? `${travelerLabel} is returning from ${destination}.${phaseLabel ? ` ${phaseLabel}` : ''}`
        : (phaseLabel ? `Returning home from ${destination}. ${phaseLabel}` : `Returning home from ${destination}.`);
      score = 92;
      bullets.push(travelerLabel ? `${travelerLabel} is on the way back from ${destination}.` : `Returning home from ${destination}.`);
    } else if (lifecycleCode === 'boarding_soon') {
      householdView = travelerLabel
        ? `${travelerLabel} flies to ${destination} soon. ${lifecycleLabel}`
        : `${intentLabel} to ${destination} is leaving soon. ${lifecycleLabel}`;
      score = 100;
      bullets.push(travelerLabel ? `${travelerLabel} leaves for ${destination} soon.` : `${intentLabel} to ${destination} starts soon.`);
    } else if (lifecycleCode === 'departure_today') {
      householdView = travelerLabel
        ? `${travelerLabel} departs for ${destination} later today.`
        : `${intentLabel} to ${destination} departs later today.`;
      score = 95;
      bullets.push(travelerLabel ? `${travelerLabel} departs for ${destination} later today.` : `${intentLabel} to ${destination} departs later today.`);
    } else if (lifecycleCode === 'departed') {
      householdView = travelerLabel
        ? `${travelerLabel} is travelling to ${destination}. ${lifecycleLabel}`
        : `Currently travelling for ${intentLabel.toLowerCase()} to ${destination}. ${lifecycleLabel}`;
      score = 97;
      bullets.push(travelerLabel ? `${travelerLabel} is currently travelling.` : `${destination} is active now.`);
    } else if (lifecycleCode === 'landed') {
      householdView = travelerLabel
        ? `${travelerLabel} has landed safely in ${destination}.`
        : `${intentLabel} to ${destination} has landed safely.`;
      score = 90;
      bullets.push(householdView);
    } else if (lifecycleCode === 'delayed') {
      householdView = travelerLabel
        ? `${travelerLabel}'s trip to ${destination} is delayed. ${lifecycleLabel}`
        : `${intentLabel} to ${destination} is delayed. ${lifecycleLabel}`;
      score = 98;
      bullets.push(travelerLabel ? `${travelerLabel}'s trip to ${destination} is delayed.` : `${intentLabel} to ${destination} is delayed.`);
    } else if (lifecycleCode === 'cancelled') {
      householdView = `${intentLabel} to ${destination} was cancelled.`;
      score = 99;
      bullets.push(`${intentLabel} to ${destination} was cancelled.`);
    } else if (phaseCode === 'upcoming_trip' || (tripHours >= 0 && tripHours <= 72)) {
      householdView = travelerLabel
        ? `${travelerLabel} leaves for ${destination} ${tripHours <= 24 ? 'soon' : `on ${formatDateLabel(activeTrip.start)}`}.`
        : `Upcoming ${intentLabel.toLowerCase()} to ${destination} starts ${formatDateLabel(activeTrip.start)}.`;
      score = tripHours <= 24 ? 88 : 80;
      bullets.push(travelerLabel ? `${travelerLabel} leaves for ${destination} soon.` : `${intentLabel} to ${destination} starts soon.`);
    } else if (phaseCode === 'trip_active') {
      householdView = travelerLabel
        ? `${travelerLabel} is in ${destination}.`
        : `${intentLabel} in ${destination} is active.`;
      score = 84;
      bullets.push(travelerLabel ? `${travelerLabel} is currently in ${destination}.` : `${destination} is active now.`);
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
    const showDestinationLiveConditions = phaseCode === 'trip_active' || phaseCode === 'returning_home';
    if (forecastNarrative) {
      bullets.push(forecastNarrative);
    }
    if (showDestinationLiveConditions && currentWeatherLabel) {
      bullets.push(currentWeatherLabel);
    }

    candidates.push({
      id: 'active_trip',
      kind: 'travel',
      score,
      headline: 'Travel update',
      householdView,
      bullets: uniqueTexts(bullets).slice(0, 4),
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
      kind: 'travel',
      score: recentTrip.phase?.code === 'returned_home' ? 74 : 68,
      headline: 'Travel update',
      householdView,
      bullets: uniqueTexts([
        recentTrip.phase?.code === 'returned_home'
          ? `Back home from ${destination}.`
          : `${recentTrip.intent?.label || 'Trip'} to ${destination} finished recently.`,
      ]),
    });
  } else if (travelHeadsUpContext) {
    const start = new Date(travelHeadsUpContext.start);
    const hoursUntilStart = hoursUntil(travelHeadsUpContext.start);
    const destination = travelHeadsUpContext.destination;
    const travelerLabel = travelHeadsUpContext.travelerLabel || '';
    const householdView = travelerLabel
      ? `${travelerLabel} leaves for ${destination} ${hoursUntilStart <= 24 ? 'soon' : `on ${formatDateLabel(travelHeadsUpContext.start)}`}.`
      : `${travelHeadsUpContext.title} starts ${hoursUntilStart <= 24 ? 'soon' : `on ${formatDateLabel(travelHeadsUpContext.start)}`}.`;

    candidates.push({
      id: 'travel_heads_up',
      kind: 'travel',
      score: hoursUntilStart <= 24 ? 86 : 78,
      headline: 'Travel update',
      householdView,
      bullets: uniqueTexts([
        travelHeadsUpContext.title ? `${travelHeadsUpContext.title} starts ${formatDateLabel(travelHeadsUpContext.start)}.` : '',
        destination ? `Destination: ${destination}.` : '',
        !travelHeadsUpContext.isAllDay
          ? `Departure around ${start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`
          : '',
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
      kind: 'visitor',
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
    const ageLabel = birthdayContext.allowAgeReveal ? ` turns ${birthdayContext.turning}` : ' has a birthday';
    const householdView = birthdayContext.isToday
      ? `${birthdayContext.memberName}${ageLabel} today.`
      : (birthdayContext.isTomorrow
        ? `${birthdayContext.memberName}${ageLabel} tomorrow.`
        : `${birthdayContext.memberName} has a birthday in ${birthdayContext.daysUntil} days.`);
    const score = birthdayContext.isToday ? 96 : (birthdayContext.isTomorrow ? 84 : Math.max(58, 76 - birthdayContext.daysUntil));
    candidates.push({
      id: 'birthday',
      kind: 'birthday',
      score,
      headline: 'Birthday reminder',
      householdView,
      bullets: uniqueTexts([
        birthdayContext.isToday
          ? `${birthdayContext.memberName}${ageLabel} today.`
          : (birthdayContext.isTomorrow
            ? `${birthdayContext.memberName}${ageLabel} tomorrow.`
            : (birthdayContext.allowAgeReveal
              ? `${birthdayContext.memberName} turns ${birthdayContext.turning} on ${formatDateLabel(birthdayContext.nextOccurrence)}.`
              : `${birthdayContext.memberName} has a birthday on ${formatDateLabel(birthdayContext.nextOccurrence)}.`)),
        birthdayContext.daysUntil >= 3 ? 'Good time to plan a card or present.' : '',
      ]),
    });
  }

  if (commuteContext) {
    const commuteHours = hoursUntil(commuteContext.start);
    const weatherRisk = commuteContext.forecast?.weatherCode !== undefined && weatherNeedsIndoorPlan(commuteContext.forecast.weatherCode);
    const hasExtraValue = Boolean(weatherRisk || commuteContext.route?.durationMinutes || (commuteContext.distanceKm !== null && commuteContext.distanceKm >= 25));
    if (hasExtraValue) {
      const score = Math.max(55, 82 - Math.max(0, commuteHours)) + (weatherRisk ? 8 : 0);
      candidates.push({
        id: 'commute',
        kind: 'route',
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
      kind: householdEventContext.type || 'household',
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
    const householdView = buildNextEventHouseholdView(nextEvent);
    const nextEventHours = hoursUntil(nextEvent.start);
    if (householdView || nextEventHours <= 12) {
      const score = Math.max(30, 54 - Math.max(0, nextEventHours));
      candidates.push({
        id: 'next_event',
        kind: 'next_event',
        score,
        headline: 'Next up',
        householdView,
        bullets: [`Next: ${nextEvent.title} on ${startLabel}.`],
      });
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score)
    .filter(hasMeaningfulBriefCandidate);
};

const buildHouseholdMessage = (activeTrip, nextEvent, recentTrip, visitorContext, birthdayContext, commuteContext, householdEventContext) => (
  buildContextCandidates(
    [],
    activeTrip,
    nextEvent,
    recentTrip,
    null,
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
    return '';
  }

  return '';
};

const buildDailyBrief = (events, activeTrip, nextEvent, recentTrip, travelHeadsUpContext, visitorContext, birthdayContext, commuteContext, householdEventContext, config) => {
  const highlightEventContext = buildHighlightEventContext(events, config);
  const candidates = buildContextCandidates(
    events,
    activeTrip,
    nextEvent,
    recentTrip,
    travelHeadsUpContext,
    visitorContext,
    birthdayContext,
    commuteContext,
    householdEventContext,
    highlightEventContext,
  );
  const items = buildBriefItems(candidates, 3);
  const primary = items[0] || null;
  const bullets = uniqueTexts(primary?.bullets || []).slice(0, 3);

  return {
    headline: primary?.headline || 'Daily brief',
    bullets,
    householdView: primary?.householdView || '',
    items,
  };
};

const selectContextBrief = (deterministicBrief, llm) => {
  if (llm?.status !== 'ready' || !llmBriefHasMeaningfulContent(llm?.brief)) {
    return {
      ...deterministicBrief,
      source: 'deterministic',
    };
  }

  return {
    headline: llm.brief.headline || deterministicBrief.headline,
    bullets: Array.isArray(llm.brief.bullets) ? llm.brief.bullets : deterministicBrief.bullets,
    householdView: typeof llm.brief.householdView === 'string' ? llm.brief.householdView : deterministicBrief.householdView,
    items: buildBriefItemsFromBrief(llm.brief),
    source: 'llm',
  };
};

const formatLlmErrorReason = (error) => {
  const message = error?.message || 'unknown_llm_error';
  const responseData = error?.response?.data;
  if (!responseData) {
    return message;
  }

  try {
    return `${message} | ${JSON.stringify(responseData).slice(0, 500)}`;
  } catch (formatError) {
    return message;
  }
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
    nextPayload.brief.items = Array.isArray(nextPayload.brief.items)
      ? nextPayload.brief.items.map((item) => ({
        ...item,
        headline: translateContextText(item.headline, locale),
        householdView: translateContextText(item.householdView, locale),
        bullets: Array.isArray(item.bullets)
          ? item.bullets.map((bullet) => translateContextText(bullet, locale))
          : [],
      }))
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
const MEDICAL_SIGNAL_PATTERN = /\b(doctor|arzt|ambulanz|clinic|klinik|hospital|krankenhaus|physio|therapy|therapie|infusion|tysabri)\b/i;
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

const getEventDayKey = (value = '') => {
  const normalized = `${value || ''}`.trim();
  return normalized ? normalized.slice(0, 10) : '';
};

const getEventScheduleSignals = (event, sourceEvents = []) => {
  const dayKey = getEventDayKey(event?.start);
  if (!dayKey) {
    return {
      sameDayCount: 0,
      sameCalendarDayCount: 0,
      gapBeforeMinutes: null,
      gapAfterMinutes: null,
      previousTitle: '',
      nextTitle: '',
      tightlyClustered: false,
    };
  }

  const sameDayEvents = sourceEvents
    .filter((candidate) => getEventDayKey(candidate?.start) === dayKey)
    .sort((left, right) => new Date(left.start) - new Date(right.start));
  const sameCalendarDayEvents = sameDayEvents.filter((candidate) => candidate.calendarId === event.calendarId);
  const currentIndex = sameDayEvents.findIndex((candidate) => candidate.id === event.id);
  const previousEvent = currentIndex > 0 ? sameDayEvents[currentIndex - 1] : null;
  const nextEvent = currentIndex >= 0 && currentIndex < (sameDayEvents.length - 1) ? sameDayEvents[currentIndex + 1] : null;
  const gapBeforeMinutes = previousEvent
    ? Math.round((new Date(event.start).getTime() - new Date(previousEvent.end).getTime()) / 60000)
    : null;
  const gapAfterMinutes = nextEvent
    ? Math.round((new Date(nextEvent.start).getTime() - new Date(event.end).getTime()) / 60000)
    : null;

  return {
    sameDayCount: sameDayEvents.length,
    sameCalendarDayCount: sameCalendarDayEvents.length,
    gapBeforeMinutes,
    gapAfterMinutes,
    previousTitle: previousEvent?.title || '',
    nextTitle: nextEvent?.title || '',
    tightlyClustered: Boolean(
      (gapBeforeMinutes !== null && gapBeforeMinutes >= 0 && gapBeforeMinutes <= 75)
      || (gapAfterMinutes !== null && gapAfterMinutes >= 0 && gapAfterMinutes <= 75)
    ),
  };
};

const getEventSpanDays = (event) => {
  const startMs = new Date(event?.start).getTime();
  const endMs = new Date(event?.end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return 1;
  }

  const spanDays = (endMs - startMs) / 86400000;
  if (event?.isAllDay) {
    return Math.max(1, Math.round(spanDays));
  }

  return Math.max(1, Math.ceil(spanDays));
};

const buildSelectionSignals = (event, sourceEvents = [], config = null) => {
  const combinedText = getEventCombinedText(event);
  const urlMatches = Array.from(new Set(((combinedText || '').match(URL_PATTERN) || []).map((entry) => entry.trim())));
  const startMs = new Date(event.start).getTime();
  const endMs = new Date(event.end).getTime();
  const spanDays = getEventSpanDays(event);
  const eventHintRule = findMatchingEventHintRule(event, config);
  const durationHours = (!Number.isNaN(startMs) && !Number.isNaN(endMs))
    ? Math.max(0, Math.round(((endMs - startMs) / 3600000) * 10) / 10)
    : 0;
  const startsInHours = !Number.isNaN(startMs)
    ? Math.max(0, Math.round(((startMs - Date.now()) / 3600000) * 10) / 10)
    : null;

  return {
    hasLocation: Boolean((event.location || '').trim()),
    hasDescription: Boolean((event.description || '').trim()),
    hasUrl: urlMatches.length > 0,
    startsInHours,
    durationHours,
    spanDays,
    isMultiDay: spanDays > 1,
    isRoutine: isLowValueRoutineEvent(event),
    isMedical: MEDICAL_SIGNAL_PATTERN.test(combinedText) || eventHintRule?.category === 'medical',
    isOnline: ONLINE_EVENT_PATTERN.test(combinedText),
    missingDetailLevel: [
      !((event.location || '').trim()),
      !((event.description || '').trim()),
      urlMatches.length === 0,
    ].filter(Boolean).length,
    schedule: getEventScheduleSignals(event, sourceEvents),
    eventHintRule: eventHintRule
      ? {
        id: eventHintRule.id,
        label: eventHintRule.label,
        matchedKeyword: eventHintRule.matchedKeyword,
        category: eventHintRule.category,
        enrichmentType: eventHintRule.enrichmentType,
        hasLocationHint: Boolean(eventHintRule.locationLabel || eventHintRule.locationAddress),
        hasRoutePlan: Boolean(eventHintRule.locationAddress),
        personLabel: eventHintRule.personLabel,
      }
      : null,
  };
};

const getEventHintTimingWindow = (event, now = Date.now()) => {
  const startMs = new Date(event?.start).getTime();
  if (Number.isNaN(startMs)) {
    return {
      startMs: null,
      hoursUntilStart: null,
      withinActiveWindow: false,
      isSameDay: false,
    };
  }

  const hoursUntilStart = Math.max(0, (startMs - now) / 3600000);
  const eventDayKey = getEventDayKey(event?.start);
  const nowDayKey = new Date(now).toISOString().slice(0, 10);

  return {
    startMs,
    hoursUntilStart,
    withinActiveWindow: hoursUntilStart <= EVENT_HINT_ACTIVE_WINDOW_HOURS,
    isSameDay: eventDayKey === nowDayKey,
  };
};

const buildHeuristicLlmSelection = (sourceEvents, config = null) => ({
  items: sourceEvents.map((event) => {
    const enrichmentType = detectSuggestedEnrichmentType(event);
    const signals = buildSelectionSignals(event, sourceEvents, config);
    const hintEnrichmentType = signals.eventHintRule?.enrichmentType || null;
    const interesting = !signals.isRoutine && scoreEventInterest(event) >= 18;
    const clearlyNeedsExtraContext = Boolean(
      hintEnrichmentType
      || enrichmentType === 'travel'
      || enrichmentType === 'route_weather'
      || enrichmentType === 'delivery'
      || enrichmentType === 'ticket_sale'
      || enrichmentType === 'concert'
      || (enrichmentType === 'household_prep' && (signals.schedule.tightlyClustered || signals.missingDetailLevel >= 2))
      || (signals.isMedical && signals.missingDetailLevel >= 1)
      || (signals.isMultiDay && signals.missingDetailLevel >= 2)
    );

    return {
      eventId: event.id,
      decision: clearlyNeedsExtraContext ? 'needs_enrichment' : (interesting ? 'calendar_only' : 'ignore'),
      enrichmentType: hintEnrichmentType
        || (clearlyNeedsExtraContext && enrichmentType === 'generic' && signals.isMedical
          ? 'household_prep'
          : enrichmentType),
      why: clearlyNeedsExtraContext
        ? (signals.eventHintRule
          ? `matched_event_hint_rule:${signals.eventHintRule.matchedKeyword}`
          : 'heuristic_added_value_detected')
        : (interesting ? 'calendar_is_already_sufficient' : 'not_useful_for_brief'),
    };
  }),
});

const mergeLlmSelectionWithHeuristics = (llmSelection, sourceEvents, config = null) => {
  const heuristicSelection = buildHeuristicLlmSelection(sourceEvents, config);
  if (!llmSelection?.items?.length) {
    return heuristicSelection;
  }

  const heuristicById = new Map(heuristicSelection.items.map((item) => [item.eventId, item]));
  const llmById = new Map(llmSelection.items.map((item) => [item.eventId, item]));

  return {
    items: sourceEvents.map((event) => {
      const llmItem = llmById.get(event.id);
      const heuristicItem = heuristicById.get(event.id);
      if (!llmItem) {
        return heuristicItem;
      }

      if (heuristicItem?.decision === 'needs_enrichment' && llmItem.decision !== 'needs_enrichment') {
        return heuristicItem;
      }

      if (llmItem.decision === 'needs_enrichment' && llmItem.enrichmentType === 'generic' && heuristicItem?.enrichmentType && heuristicItem.enrichmentType !== 'generic') {
        return {
          ...llmItem,
          enrichmentType: heuristicItem.enrichmentType,
          why: llmItem.why || heuristicItem.why,
        };
      }

      return llmItem;
    }).filter(Boolean),
  };
};

const redactEventForLlmSelection = (event, privacyMode, sourceEvents = [], config = null) => {
  const signals = buildSelectionSignals(event, sourceEvents, config);
  return {
    id: event.id,
    suggestedEnrichmentType: detectSuggestedEnrichmentType(event),
    ...redactEventForLlm(event, privacyMode),
    selectionSignals: {
      startsInHours: signals.startsInHours,
      durationHours: signals.durationHours,
      hasLocation: signals.hasLocation,
      hasDescription: signals.hasDescription,
      hasUrl: signals.hasUrl,
      isMultiDay: signals.isMultiDay,
      spanDays: signals.spanDays,
      isRoutine: signals.isRoutine,
      isMedical: signals.isMedical,
      isOnline: signals.isOnline,
      missingDetailLevel: signals.missingDetailLevel,
      sameDayCount: signals.schedule.sameDayCount,
      sameCalendarDayCount: signals.schedule.sameCalendarDayCount,
      gapBeforeMinutes: signals.schedule.gapBeforeMinutes,
      gapAfterMinutes: signals.schedule.gapAfterMinutes,
      tightlyClustered: signals.schedule.tightlyClustered,
    },
    matchedEventHintRule: signals.eventHintRule,
  };
};

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
    '- Prefer "needs_enrichment" for travel, route/weather-sensitive plans, deliveries, prep-heavy meetings, and events with missing location/link/details.',
    '- Matched household event hint rules contain verified user-entered context and usually deserve enrichment.',
    '- Tight same-day schedules, stacked calendar days, medical appointments with missing details, and multi-day stays usually benefit from enrichment.',
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

const buildFallbackLlmSelection = (sourceEvents, config = null) => buildHeuristicLlmSelection(sourceEvents, config);

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

const extractTitlePlaceHint = (title = '') => {
  const match = title.match(/\bin\s+([A-ZÄÖÜ][\p{L}-]+(?:\s+[A-ZÄÖÜ][\p{L}-]+){0,2})/u);
  return match ? match[1].trim() : '';
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
  const titlePlaceHint = extractTitlePlaceHint(event.title || '');
  const signals = buildSelectionSignals(event, []);

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

  if (['travel', 'route_weather', 'delivery', 'household_prep', 'generic'].includes(enrichmentType)) {
    const addedFacts = uniqueTexts([
      !signals.hasLocation && !signals.hasDescription && !signals.hasUrl
        ? 'Calendar entry has no location, notes, or link yet.'
        : '',
      !signals.hasLocation && signals.isMedical
        ? 'Location is missing, so arrival planning may need a manual check.'
        : '',
      signals.isOnline && !signals.hasUrl
        ? 'This looks like an online event, but no meeting link is attached.'
        : '',
      signals.isMultiDay
        ? `This spans about ${signals.spanDays} days.`
        : '',
      venue ? `Venue hint: ${venue}.` : '',
      titlePlaceHint ? `Place hint: ${titlePlaceHint}.` : '',
      cities.length ? `Known city hints: ${cities.slice(0, 3).join(', ')}.` : '',
      urlDomains.length ? `Source links mention: ${urlDomains.slice(0, 2).join(', ')}.` : '',
    ]);

    return addedFacts.length > 0 ? { type: enrichmentType, sources: ['event_metadata'], addedFacts } : null;
  }

  return null;
};

const buildInsightFactsFromScheduleContext = (event, sourceEvents) => {
  const schedule = getEventScheduleSignals(event, sourceEvents);
  const addedFacts = uniqueTexts([
    schedule.sameDayCount >= 3 ? `There are ${schedule.sameDayCount} calendar items on that day.` : '',
    schedule.sameCalendarDayCount >= 2 && event.calendarSummary
      ? `${event.calendarSummary} has ${schedule.sameCalendarDayCount} items that day.`
      : '',
    schedule.gapBeforeMinutes !== null && schedule.gapBeforeMinutes >= 0 && schedule.gapBeforeMinutes <= 75 && schedule.previousTitle
      ? `Only ${schedule.gapBeforeMinutes} min remain after ${schedule.previousTitle} before this starts.`
      : '',
    schedule.gapAfterMinutes !== null && schedule.gapAfterMinutes >= 0 && schedule.gapAfterMinutes <= 75 && schedule.nextTitle
      ? `Only ${schedule.gapAfterMinutes} min remain after this before ${schedule.nextTitle}.`
      : '',
  ]);

  return addedFacts.length > 0
    ? { type: 'household_prep', sources: ['schedule_context'], addedFacts }
    : null;
};

const formatEventHintClockTime = (timestamp, config) => {
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat(
      config?.system?.displayLocale === 'de' ? 'de-DE' : 'en-GB',
      {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: config?.system?.timezone || 'UTC',
      },
    ).format(new Date(timestamp));
  } catch (error) {
    return new Date(timestamp).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
};

const describeEventHintCategory = (category = 'generic') => {
  switch (normalizeEventHintRuleCategory(category)) {
    case 'medical':
      return 'This is usually a medical treatment or appointment.';
    case 'prep':
      return 'This event usually needs preparation beforehand.';
    case 'travel':
      return 'This event usually involves travel or an overnight stay.';
    case 'pickup':
      return 'This event usually involves a pickup or collection.';
    default:
      return '';
  }
};

const buildInsightFactsFromEventHintRule = (eventHintRule, event) => {
  if (!eventHintRule) {
    return null;
  }

  const timing = getEventHintTimingWindow(event);
  const hasOperationalHints = eventHintRule.weatherRule !== 'none'
    || (eventHintRule.alternativeTransportOptions || []).length > 0
    || Boolean(eventHintRule.locationAddress);

  const addedFacts = uniqueTexts([
    eventHintRule.matchedKeyword ? `Matched household keyword: ${eventHintRule.matchedKeyword}.` : '',
    eventHintRule.personLabel ? `${eventHintRule.personLabel} is the main person for this event.` : '',
    describeEventHintCategory(eventHintRule.category),
    eventHintRule.locationLabel ? `Known destination: ${eventHintRule.locationLabel}.` : '',
    eventHintRule.locationAddress ? `Known destination address: ${eventHintRule.locationAddress}.` : '',
    eventHintRule.arriveEarlyMinutes > 0 ? `Plan to arrive about ${eventHintRule.arriveEarlyMinutes} min early.` : '',
    eventHintRule.prepNotes ? `Known prep note: ${eventHintRule.prepNotes}.` : '',
    eventHintRule.freeformContext ? `Known household context: ${eventHintRule.freeformContext}.` : '',
    hasOperationalHints && !timing.withinActiveWindow
      ? `Detailed travel, weather, and reminder checks become useful in the last ${EVENT_HINT_ACTIVE_WINDOW_HOURS} hours before the event.`
      : '',
  ]);

  return addedFacts.length > 0
    ? { type: eventHintRule.enrichmentType, sources: ['event_hint_rule'], addedFacts }
    : null;
};

const buildEventHintRouteFacts = async ({
  event,
  eventHintRule,
  household,
  config,
  routingConfig,
  routingSecrets,
  geocodeCache,
  routingCache,
}) => {
  if (!eventHintRule || event?.isAllDay || !eventHintRule.locationAddress) {
    return null;
  }

  const timing = getEventHintTimingWindow(event);
  if (!timing.withinActiveWindow || !Number.isFinite(timing.startMs)) {
    return null;
  }

  const origin = await resolveTravelAnchorPlace({
    referenceType: eventHintRule.originType || 'home',
    referenceId: eventHintRule.originReferenceId || '',
    label: eventHintRule.originLabel || '',
    address: eventHintRule.originAddress || '',
    household,
    config,
    geocodeCache,
    routingConfig,
    routingSecrets,
  });
  const destination = await resolveTravelAnchorPlace({
    referenceType: 'custom',
    label: eventHintRule.locationLabel || event.title || eventHintRule.matchedKeyword || 'Destination',
    address: eventHintRule.locationAddress || '',
    household,
    config,
    geocodeCache,
    routingConfig,
    routingSecrets,
  });

  if (!origin || !destination) {
    return null;
  }

  const mode = normalizeTravelMode(eventHintRule.transportMode || 'car');
  const arrivalBufferMinutes = Number(eventHintRule.arriveEarlyMinutes) || 0;
  const targetArrivalTimestamp = timing.startMs - (arrivalBufferMinutes * 60000);
  const route = await getRouteEstimate({
    origin: hasResolvedLocation(origin) ? origin.location : null,
    destination: hasResolvedLocation(destination) ? destination.location : null,
    originPlace: origin,
    destinationPlace: destination,
    routingConfig,
    routingSecrets,
    routingCache,
    mode,
    arrivalTime: mode === 'public_transport' && targetArrivalTimestamp > Date.now()
      ? new Date(targetArrivalTimestamp).toISOString()
      : null,
  });

  if (!route?.durationMinutes) {
    return null;
  }

  const travelMinutes = Math.max(1, Math.round(route.durationMinutes));
  const leaveByTimestamp = timing.startMs - ((travelMinutes + arrivalBufferMinutes) * 60000);
  const routeModeLabel = mode === 'public_transport'
    ? 'public transport'
    : mode;
  const originLabel = origin.label || household?.home?.label || 'origin';
  const destinationLabel = destination.label || eventHintRule.locationLabel || event.title || 'destination';
  const transitLines = mode === 'public_transport'
    ? uniqueTexts([
      ...buildTravelLineDetails(route, mode),
      ...buildTravelLineDetailsDetailed(route, mode)
        .map((entry) => [entry.vehicleType, entry.label].filter(Boolean).join(' ').trim()),
    ]).slice(0, 3)
    : [];

  const addedFacts = uniqueTexts([
    `Estimated ${routeModeLabel} from ${originLabel} to ${destinationLabel} takes about ${travelMinutes} min.`,
    leaveByTimestamp > 0
      ? (arrivalBufferMinutes > 0
        ? `Leave around ${formatEventHintClockTime(leaveByTimestamp, config)} to arrive about ${arrivalBufferMinutes} min early.`
        : `Leave around ${formatEventHintClockTime(leaveByTimestamp, config)} for on-time arrival.`)
      : '',
    transitLines.length > 0 ? `Transit lines mention: ${transitLines.join(', ')}.` : '',
  ]);

  return addedFacts.length > 0
    ? {
      type: eventHintRule.enrichmentType,
      sources: ['event_hint_route'],
      addedFacts,
      routeDurationMinutes: travelMinutes,
    }
    : null;
};

const weatherRuleMatchesBucket = (weatherRule, bucket) => {
  if (!weatherRule || weatherRule === 'none' || !bucket) {
    return false;
  }
  if (weatherRule === 'warn_rain') {
    return ['rain', 'showers', 'stormy'].includes(bucket);
  }
  if (weatherRule === 'warn_snow') {
    return bucket === 'snow';
  }
  if (weatherRule === 'warn_rain_or_snow') {
    return ['rain', 'showers', 'stormy', 'snow'].includes(bucket);
  }
  return false;
};

const buildEventHintWeatherFacts = async ({
  event,
  eventHintRule,
  household,
  config,
  routingConfig,
  routingSecrets,
  geocodeCache,
}) => {
  if (!eventHintRule || eventHintRule.weatherRule === 'none' || event?.isAllDay || !eventHintRule.locationAddress) {
    return null;
  }

  const timing = getEventHintTimingWindow(event);
  if (!timing.withinActiveWindow) {
    return null;
  }

  const destination = await resolveTravelAnchorPlace({
    referenceType: 'custom',
    label: eventHintRule.locationLabel || event.title || eventHintRule.matchedKeyword || 'Destination',
    address: eventHintRule.locationAddress || '',
    household,
    config,
    geocodeCache,
    routingConfig,
    routingSecrets,
  });

  if (!destination || !hasResolvedLocation(destination)) {
    return null;
  }

  const weather = await tryFetchForecastForLocation(destination.location, new Date(event.start), new Date(event.end));
  const forecast = weather?.forecast || null;
  const bucket = forecast?.weatherCode !== undefined && forecast?.weatherCode !== null
    ? weatherCodeToBucket(forecast.weatherCode)
    : '';

  if (!weatherRuleMatchesBucket(eventHintRule.weatherRule, bucket)) {
    return null;
  }

  const destinationLabel = destination.label || eventHintRule.locationLabel || event.title || 'the destination';
  const weatherAction = bucket === 'snow'
    ? 'Dress warmly and allow a little extra time.'
    : 'Take an umbrella just in case.';

  const addedFacts = uniqueTexts([
    `Forecast near ${destinationLabel} suggests ${forecast?.label || bucket} around the appointment.`,
    `Weather action: ${weatherAction}`,
  ]);

  return addedFacts.length > 0
    ? { type: eventHintRule.enrichmentType, sources: ['event_hint_weather'], addedFacts, weatherBucket: bucket }
    : null;
};

const alternativeTransportShouldShow = ({ option, weatherFacts, routeFacts, event }) => {
  const policy = option?.showPolicy || 'always';
  if (policy === 'always' || policy === 'manual_note') {
    return true;
  }
  if (policy === 'bad_weather') {
    return Boolean(weatherFacts?.weatherBucket);
  }
  if (policy === 'tight_schedule') {
    const timing = getEventHintTimingWindow(event);
    const routeMinutes = Number(routeFacts?.routeDurationMinutes) || 0;
    return routeMinutes >= 35 || (timing.hoursUntilStart !== null && timing.hoursUntilStart <= 2.5);
  }
  return false;
};

const buildEventHintAlternativeTransportFacts = ({
  event,
  eventHintRule,
  weatherFacts,
  routeFacts,
}) => {
  if (!eventHintRule || event?.isAllDay) {
    return null;
  }

  const timing = getEventHintTimingWindow(event);
  if (!timing.withinActiveWindow || !Array.isArray(eventHintRule.alternativeTransportOptions) || eventHintRule.alternativeTransportOptions.length === 0) {
    return null;
  }

  const eligibleOptions = eventHintRule.alternativeTransportOptions.filter((option) => alternativeTransportShouldShow({
    option,
    weatherFacts,
    routeFacts,
    event,
  }));

  if (eligibleOptions.length === 0) {
    return null;
  }

  const primaryOption = eligibleOptions[0];
  const primaryReminder = primaryOption.reminderText
    || (primaryOption.label ? `Remember to pre-book ${primaryOption.label}.` : '');
  const addedFacts = uniqueTexts([
    ...eligibleOptions.map((option) => option.label ? `Alternative transport option available: ${option.label}.` : ''),
    primaryReminder ? `Primary action: ${primaryReminder}` : '',
  ]);

  return addedFacts.length > 0
    ? { type: eventHintRule.enrichmentType, sources: ['event_hint_alternative_transport'], addedFacts }
    : null;
};

const buildEnrichedBriefInsights = ({
  selections,
  sourceEvents,
  activeTrip,
  recentTrip,
  commuteContext,
  householdEventContext,
  config = null,
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
      const eventHintRule = findMatchingEventHintRule(event, config);
      const contextual = buildInsightFactsFromContext(event, activeTrip, recentTrip, commuteContext, householdEventContext);
      const metadata = buildInsightFactsFromEventDetails(event, suggestedType);
      const schedule = buildInsightFactsFromScheduleContext(event, sourceEvents);
      const eventHint = buildInsightFactsFromEventHintRule(eventHintRule, event);
      const addedFacts = uniqueTexts([
        ...(contextual?.addedFacts || []),
        ...(metadata?.addedFacts || []),
        ...(schedule?.addedFacts || []),
        ...(eventHint?.addedFacts || []),
      ]);
      const resolvedType = eventHint?.type || metadata?.type || contextual?.type || suggestedType;
      const sources = Array.from(new Set([
        ...(contextual?.sources || []),
        ...(metadata?.sources || []),
        ...(schedule?.sources || []),
        ...(eventHint?.sources || []),
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
        eventHintRule: eventHintRule
          ? {
            id: eventHintRule.id,
            label: eventHintRule.label,
            matchedKeyword: eventHintRule.matchedKeyword,
            category: eventHintRule.category,
          }
          : null,
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

const augmentInsightsWithEventHintRoutes = async ({
  insights,
  insightDebug,
  sourceEvents,
  config,
  household,
  routingConfig,
  routingSecrets,
  geocodeCache,
  routingCache,
}) => {
  if (!Array.isArray(insights) || insights.length === 0) {
    return { insights, insightDebug };
  }

  const eventMap = new Map(sourceEvents.map((event) => [event.id, event]));
  const operationalFactsByEventId = new Map();

  for (const insight of insights) {
    const event = eventMap.get(insight.eventId);
    const eventHintRule = findMatchingEventHintRule(event, config);
    const routeFacts = await buildEventHintRouteFacts({
      event,
      eventHintRule,
      household,
      config,
      routingConfig,
      routingSecrets,
      geocodeCache,
      routingCache,
    });
    const weatherFacts = await buildEventHintWeatherFacts({
      event,
      eventHintRule,
      household,
      config,
      routingConfig,
      routingSecrets,
      geocodeCache,
    });
    const alternativeTransportFacts = buildEventHintAlternativeTransportFacts({
      event,
      eventHintRule,
      weatherFacts,
      routeFacts,
    });

    const operationalFacts = [routeFacts, weatherFacts, alternativeTransportFacts].filter(Boolean);
    if (operationalFacts.length > 0) {
      operationalFactsByEventId.set(insight.eventId, operationalFacts);
    }
  }

  if (operationalFactsByEventId.size === 0) {
    return { insights, insightDebug };
  }

  const mergeFacts = (entry) => {
    const factEntries = operationalFactsByEventId.get(entry.eventId);
    if (!factEntries?.length) {
      return entry;
    }

    return {
      ...entry,
      enrichmentType: factEntries.find((fact) => fact?.type)?.type || entry.enrichmentType,
      addedFacts: uniqueTexts([
        ...(entry.addedFacts || []),
        ...factEntries.flatMap((fact) => fact?.addedFacts || []),
      ]),
      sources: Array.from(new Set([
        ...(entry.sources || []),
        ...factEntries.flatMap((fact) => fact?.sources || []),
      ])),
    };
  };

  return {
    insights: insights.map(mergeFacts),
    insightDebug: Array.isArray(insightDebug) ? insightDebug.map(mergeFacts) : insightDebug,
  };
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
    '- Write all user-facing text in the display locale. If displayLocale is de, the headline and bullets must be German.',
    '- Use warm, helpful family-assistant wording. Medical items should sound calm, supportive, and caring.',
    '- Do not restate a calendar title/time by itself.',
    '- Mention an event only when you add specific value from addedFacts.',
    '- Use only facts from addedFacts. Do not guess or browse.',
    '- Prefer actionable value such as missing details, tight schedule pressure, route/weather implications, or prep needs.',
    '- householdView is optional and should contain only one clear, actionable reminder. Leave it empty if there is no strong action.',
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

const stripActionPrefix = (value) => `${value || ''}`
  .replace(/^Primary action:\s*/i, '')
  .replace(/^Weather action:\s*/i, '')
  .replace(/^Action reminder:\s*/i, '')
  .trim();

const derivePrimaryActionFromInsights = (insights = []) => {
  const candidates = [];

  insights.forEach((insight) => {
    (insight.addedFacts || []).forEach((fact) => {
      if (/^Primary action:\s*/i.test(fact)) {
        candidates.push({ priority: 1, text: stripActionPrefix(fact) });
      } else if (/^Weather action:\s*/i.test(fact)) {
        candidates.push({ priority: 2, text: stripActionPrefix(fact) });
      } else if (/^Action reminder:\s*/i.test(fact)) {
        candidates.push({ priority: 3, text: stripActionPrefix(fact) });
      }
    });
  });

  return candidates
    .filter((candidate) => candidate.text)
    .sort((left, right) => left.priority - right.priority)[0]?.text || '';
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

const buildGoogleGenerateContentPayload = (prompt, responseSchema) => {
  const generationConfig = {
    temperature: 0.2,
  };

  if (responseSchema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = responseSchema;
  }

  return {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${prompt}\n\nReturn valid JSON only.` }],
      },
    ],
    generationConfig,
  };
};

const callGoogleGenerativeAi = async ({ apiKey, model, prompt, responseSchema = GOOGLE_BRIEF_RESPONSE_SCHEMA }) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const requestConfig = {
    params: { key: apiKey },
    headers: { 'content-type': 'application/json' },
    timeout: 20000,
  };

  let response;
  try {
    response = await axios.post(
      url,
      buildGoogleGenerateContentPayload(prompt, responseSchema),
      requestConfig,
    );
  } catch (error) {
    const status = error?.response?.status;
    if (status !== 400 || !responseSchema) {
      throw error;
    }

    response = await axios.post(
      url,
      buildGoogleGenerateContentPayload(prompt, null),
      requestConfig,
    );
  }

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
  household,
  activeTrip,
  recentTrip,
  nextEvent,
  commuteContext,
  householdEventContext,
  routingConfig,
  routingSecrets,
  geocodeCache,
  routingCache,
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

  const refreshMinutes = resolveContextRefreshMinutes(config.services.context);
  const existingLlm = existingContext?.llm;
  const isFresh = existingLlm?.updatedAt
    && (Date.now() - new Date(existingLlm.updatedAt).getTime()) < (refreshMinutes * 60000);

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
  const selectorInputEvents = selectorSourceEvents.map((event) => redactEventForLlmSelection(event, privacyMode, selectorSourceEvents, config));
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
    parsedSelection = mergeLlmSelectionWithHeuristics(
      parsedSelection || buildFallbackLlmSelection(selectorSourceEvents, config),
      selectorSourceEvents,
      config,
    );
    let { insights, insightDebug } = buildEnrichedBriefInsights({
      selections: parsedSelection,
      sourceEvents: selectorSourceEvents,
      activeTrip,
      recentTrip,
      commuteContext,
      householdEventContext,
      config,
    });
    ({ insights, insightDebug } = await augmentInsightsWithEventHintRoutes({
      insights,
      insightDebug,
      sourceEvents: selectorSourceEvents,
      config,
      household,
      routingConfig,
      routingSecrets,
      geocodeCache,
      routingCache,
    }));
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
    const primaryAction = derivePrimaryActionFromInsights(insights);
    const nextBrief = {
      ...filteredBrief,
      householdView: primaryAction || '',
    };

    return {
      updatedAt: new Date().toISOString(),
      provider,
      status: 'ready',
      brief: nextBrief,
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
        filteredBrief: nextBrief,
      },
    };
  } catch (error) {
    const reason = formatLlmErrorReason(error);
    return {
      updatedAt: new Date().toISOString(),
      provider,
      status: 'failed',
      reason,
      brief: null,
      debug: {
        provider,
        model,
        privacyMode,
        suppressRoutineRecurringEvents: shouldSuppressRoutineRecurringEvents(config),
        enabled: true,
        status: 'failed',
        reason,
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
  const briefEvents = filterEventsForDailyBrief(events, config);
  const enabledSignals = getEnabledContextSignals(config);
  const transportConfig = config.services.transport || {};
  const routingConfig = config.services.routing || {};
  const transportCache = await readTransportCache();
  const geocodeCache = await readGeocodeCache();
  const routingCache = await readRoutingCache();
  const tripCandidates = enabledSignals.travel
    ? await buildTripTimelines(briefEvents, config, household, transportConfig, secrets.transport || {}, transportCache)
    : [];
  await writeTransportCache(transportCache);
  const activeTrip = attachTripPhase(selectActiveTrip(tripCandidates), transportConfig, 'active');
  const recentTrip = attachTripPhase(selectRecentTrip(tripCandidates), transportConfig, 'recent');
  const travelHeadsUpContext = enabledSignals.travel && !activeTrip && !recentTrip
    ? buildTravelHeadsUpContext(briefEvents, config, household)
    : null;
  const nextEvent = enabledSignals.nextEvent ? getNextRelevantEvent(briefEvents, config) : null;
  const visitorContext = enabledSignals.visitors ? await buildVisitorContext(briefEvents, config, household) : null;
  const birthdayContext = enabledSignals.birthdays
    ? buildBirthdayContext(household, Number(config.services.context?.birthdayLookaheadDays) || 10)
    : null;
  const commuteContext = enabledSignals.commute
    ? await buildCommuteContext(briefEvents, household, config, routingConfig, secrets.routing || {}, routingCache)
    : null;
  const householdEventContext = enabledSignals.household
    ? await buildHouseholdEventContext(briefEvents, config, household, routingConfig, secrets.routing || {}, routingCache)
    : null;
  const highlightEventContext = enabledSignals.highlights ? buildHighlightEventContext(briefEvents, config) : null;
  const refreshMinutes = resolveContextRefreshMinutes(config.services.context);
  const llm = await generateLlmBrief({
    calendarCache: {
      ...calendarCache,
      events: briefEvents,
    },
    config,
    secrets,
    household,
    activeTrip,
    recentTrip,
    nextEvent,
    commuteContext,
    householdEventContext,
    routingConfig,
    routingSecrets: secrets.routing || {},
    geocodeCache,
    routingCache,
    existingContext,
    force: forceLlm,
  });
  await writeGeocodeCache(geocodeCache);
  await writeRoutingCache(routingCache);
  const deterministicBrief = buildDailyBrief(
    briefEvents,
    activeTrip,
    nextEvent,
    recentTrip,
    travelHeadsUpContext,
    visitorContext,
    birthdayContext,
    commuteContext,
    householdEventContext,
    config,
  );
  const deterministicCandidates = buildContextCandidates(
    briefEvents,
    activeTrip,
    nextEvent,
    recentTrip,
    travelHeadsUpContext,
    visitorContext,
    birthdayContext,
    commuteContext,
    householdEventContext,
    highlightEventContext,
  );
  const brief = selectContextBrief(deterministicBrief, llm);

  const contextPayload = {
    updatedAt: new Date().toISOString(),
    refreshMinutes,
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
      contextRefreshMinutes: refreshMinutes,
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
        dailyBriefEligibleEvents: briefEvents.length,
        dailyBriefCalendarMode: config.services.context?.briefCalendarMode || 'exclude_selected',
        dailyBriefIncludedCalendarIds: config.services.context?.briefIncludedCalendarIds || [],
        dailyBriefExcludedCalendarIds: config.services.context?.briefExcludedCalendarIds || [],
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
        travelHeadsUpContext,
        nextEvent,
        visitorContext,
        birthdayContext,
        commuteContext,
        householdEventContext,
        highlightEventContext,
        eventSelection: briefEvents.map((event) => {
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

const buildCalendarCacheFingerprint = (calendarCache = {}) => crypto
  .createHash('sha1')
  .update(JSON.stringify({
    selectedCalendarIds: Array.isArray(calendarCache.selectedCalendarIds)
      ? [...calendarCache.selectedCalendarIds].sort()
      : [],
    events: Array.isArray(calendarCache.events)
      ? calendarCache.events.map((event) => ({
        id: event.id || '',
        title: event.title || '',
        start: event.start || '',
        end: event.end || '',
        isAllDay: Boolean(event.isAllDay),
        isRecurring: Boolean(event.isRecurring),
        location: event.location || '',
        calendarId: event.calendarId || '',
        calendarSummary: event.calendarSummary || '',
      }))
      : [],
  }))
  .digest('hex');

const writeContextBuildFailureDebug = async ({ error, calendarCache, config, existingContext }) => {
  await writeDailyBriefDebug({
    updatedAt: new Date().toISOString(),
    status: 'error',
    stageSource: 'context_failed',
    error: error?.message || 'Context rebuild failed.',
    config: {
      displayLocale: config.system?.displayLocale || 'en',
      contextRefreshMinutes: resolveContextRefreshMinutes(config.services.context),
      llmEnabled: Boolean(config.services.llm?.enabled),
      llmProvider: config.services.llm?.provider || 'openai',
      llmModel: config.services.llm?.model || 'gpt-5-mini',
      llmPrivacyMode: config.services.llm?.privacyMode || 'cloud-redacted',
    },
    stages: {
      calendarInput: {
        syncedAt: calendarCache?.syncedAt || null,
        selectedCalendarIds: calendarCache?.selectedCalendarIds || [],
        totalEvents: Array.isArray(calendarCache?.events) ? calendarCache.events.length : 0,
        sources: calendarCache?.sources || [],
      },
      finalContext: {
        brief: existingContext?.brief || { headline: 'Daily brief', bullets: [] },
        activeTrip: existingContext?.activeTrip || null,
      },
    },
  }).catch((writeError) => {
    console.error('Failed to write context failure debug:', writeError.message);
  });
};

const ensureFreshContextCache = async () => {
  const [context, calendarCache, config] = await Promise.all([
    loadContextCache(),
    loadCalendarCache(),
    readConfig(),
  ]);

  const calendarSyncedAt = calendarCache?.syncedAt ? new Date(calendarCache.syncedAt).getTime() : 0;
  const contextUpdatedAt = context?.updatedAt ? new Date(context.updatedAt).getTime() : 0;
  const refreshMinutes = resolveContextRefreshMinutes(config.services.context);
  const shouldRebuild = !context?.updatedAt
    || (calendarSyncedAt > contextUpdatedAt)
    || (Date.now() - contextUpdatedAt) >= (refreshMinutes * 60000);

  if (!shouldRebuild) {
    return { context, config };
  }

  const [secrets, household] = await Promise.all([readSecrets(), readHousehold()]);
  try {
    const rebuiltContext = await buildContext(calendarCache, config, secrets, household, context, true);
    await fs.writeJson(CONTEXT_CACHE_PATH, rebuiltContext, { spaces: 2 });
    return { context: rebuiltContext, config };
  } catch (error) {
    console.error('Context rebuild failed:', error.message);
    await writeContextBuildFailureDebug({ error, calendarCache, config, existingContext: context });
    return { context, config };
  }
};

const syncCalendarData = async ({ forceContext = false } = {}) => {
  const [config, secrets, household, sourceStore] = await Promise.all([
    readConfig(),
    readSecrets(),
    readHousehold(),
    readCalendarSources(),
  ]);
  const previousCalendarCache = await readJsonIfExists(CALENDAR_CACHE_PATH, DEFAULT_CALENDAR_CACHE);
  let googleBundle = null;
  let googleSource = null;
  try {
    googleBundle = await fetchGoogleCalendarBundle({ forceContext });
    googleSource = googleBundle?.source || null;
  } catch (error) {
    googleSource = buildGoogleCalendarErrorSource(error);
    console.error('Google calendar sync failed:', formatGoogleAuthError(error));
  }
  const now = new Date();
  const timeMin = googleBundle?.timeMin || new Date(now.getTime() - 86400000).toISOString();
  const timeMax = googleBundle?.timeMax || new Date(now.getTime() + ((Number(config.services.context.tripLookaheadDays) || 14) * 86400000)).toISOString();
  const externalBundles = await Promise.all((sourceStore.sources || []).map((source) => fetchCalendarSourceBundle({
    source,
    secrets,
    timeMin,
    timeMax,
  })));

  const calendarCache = {
    syncedAt: new Date().toISOString(),
    connectedEmail: googleBundle?.connectedEmail || previousCalendarCache.connectedEmail || '',
    calendars: [
      ...(googleBundle?.calendars || []),
      ...externalBundles.flatMap((bundle) => bundle.calendars || []),
    ],
    selectedCalendarIds: googleBundle?.selectedCalendarIds || config.services.google.selectedCalendarIds || [],
    events: [
      ...(googleBundle?.events || []),
      ...externalBundles.flatMap((bundle) => bundle.events || []),
    ].sort((left, right) => new Date(left.start) - new Date(right.start)),
    sources: [
      ...(googleSource ? [googleSource] : []),
      ...externalBundles.map((bundle) => bundle.source),
    ],
  };

  const calendarChanged = buildCalendarCacheFingerprint(previousCalendarCache) !== buildCalendarCacheFingerprint(calendarCache);
  await fs.writeJson(CALENDAR_CACHE_PATH, calendarCache, { spaces: 2 });

  const existingContext = await readJsonIfExists(CONTEXT_CACHE_PATH, null);
  const refreshMinutes = resolveContextRefreshMinutes(config.services.context);
  const shouldRefreshContext = forceContext
    || calendarChanged
    || !existingContext?.updatedAt
    || (Date.now() - new Date(existingContext.updatedAt).getTime()) >= (refreshMinutes * 60000);

  if (shouldRefreshContext) {
    try {
      const context = await buildContext(calendarCache, config, secrets, household, existingContext, forceContext || calendarChanged);
      await fs.writeJson(CONTEXT_CACHE_PATH, context, { spaces: 2 });
    } catch (error) {
      console.error('Context rebuild failed:', error.message);
      await writeContextBuildFailureDebug({ error, calendarCache, config, existingContext });
    }
  }

  return calendarCache;
};

const syncGoogleCalendarData = async ({ forceContext = false } = {}) => syncCalendarData({ forceContext });

const loadCalendarCache = async () => readJsonIfExists(CALENDAR_CACHE_PATH, DEFAULT_CALENDAR_CACHE);

const loadContextCache = async () => readJsonIfExists(CONTEXT_CACHE_PATH, {
  updatedAt: null,
  refreshMinutes: DEFAULT_CONTEXT_REFRESH_MINUTES,
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

const detectSystemCapabilities = async () => {
  const platform = process.platform;
  const isLinux = platform === 'linux';
  const isMac = platform === 'darwin';
  const systemctlAvailable = isLinux
    ? (await fs.pathExists('/bin/systemctl') || await fs.pathExists('/usr/bin/systemctl'))
    : false;
  const isPi = isLinux && await fs.pathExists('/sys/firmware/devicetree/base/model')
    ? /raspberry pi/i.test((await fs.readFile('/sys/firmware/devicetree/base/model', 'utf8')).replace(/\0/g, ''))
    : false;

  return {
    platform,
    isLinux,
    isMac,
    isPi,
    systemctlAvailable,
    canRestartDisplay: Boolean(isLinux && systemctlAvailable),
    canReboot: Boolean(isLinux && systemctlAvailable && isPi),
    commandBackend: isLinux && systemctlAvailable ? 'systemd' : 'unsupported',
  };
};

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
  let syncInFlight = false;
  const runSync = async () => {
    if (syncInFlight) {
      return;
    }

    syncInFlight = true;
    try {
      const [config, cache] = await Promise.all([
        readConfig(),
        loadCalendarCache(),
      ]);
      const refreshMinutes = resolveContextRefreshMinutes(config.services.context);
      const lastSyncedAt = cache?.syncedAt ? new Date(cache.syncedAt).getTime() : 0;
      const shouldSync = !lastSyncedAt || (Date.now() - lastSyncedAt) >= (refreshMinutes * 60000);
      if (!shouldSync) {
        return;
      }
      await syncCalendarData();
    } catch (error) {
      console.error('Calendar sync failed:', error.message);
    } finally {
      syncInFlight = false;
    }
  };

  runSync();
  setInterval(runSync, 60 * 1000);
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

app.get('/api/system/capabilities', async (req, res) => {
  try {
    res.json(await detectSystemCapabilities());
  } catch (error) {
    res.status(500).json({ error: 'Failed to detect system capabilities', details: error.message });
  }
});

app.post('/api/system/:command', async (req, res) => {
  const { command } = req.params;
  const capabilities = await detectSystemCapabilities();
  let shellCmd = '';

  switch (command) {
    case 'reboot':
      if (!capabilities.canReboot) {
        return res.status(400).json({ error: 'Reboot is not supported on this device.', capabilities });
      }
      shellCmd = 'sudo reboot';
      break;
    case 'shutdown':
      if (!capabilities.canReboot) {
        return res.status(400).json({ error: 'Shutdown is not supported on this device.', capabilities });
      }
      shellCmd = 'sudo shutdown -h now';
      break;
    case 'restart-display':
      if (!capabilities.canRestartDisplay) {
        return res.status(400).json({ error: 'Display restart is not supported on this device.', capabilities });
      }
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
    const tokenStatus = buildGoogleTokenStatus(account);

    res.json({
      connected: Boolean(account?.tokens && !tokenStatus.needsReconnect),
      email: account?.email || '',
      clientConfigured: Boolean(config.services.google.clientId && secrets.google?.clientSecret),
      redirectUri: config.services.google.redirectUri || `${req.protocol}://${req.get('host')}/api/auth/google/callback`,
      selectedCalendarIds: calendarCache.selectedCalendarIds || config.services.google.selectedCalendarIds,
      lastSyncedAt: calendarCache.syncedAt,
      tokenStatus,
      needsReconnect: tokenStatus.needsReconnect,
      statusReason: tokenStatus.statusReason,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read Google auth status', details: error.message });
  }
});

app.post('/api/auth/google/disconnect', async (req, res) => {
  try {
    await deleteGoogleAccount();
    await syncCalendarData({ forceContext: true });
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
    const googleSource = (cache.sources || []).find((source) => source?.id === 'google');
    if (googleSource?.status === 'error') {
      return res.status(401).json({
        error: 'Google Calendar sync failed',
        details: googleSource.error,
        reconnectRequired: googleSource.reconnectRequired === true,
      });
    }
    return res.json({
      calendars: (cache.calendars || []).filter((calendar) => !calendar.sourceId),
      selectedCalendarIds: cache.selectedCalendarIds,
      lastSyncedAt: cache.syncedAt,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch calendars', details: error.message });
  }
});

app.get('/api/calendars', async (req, res) => {
  try {
    const cache = await syncCalendarData();
    res.json({
      calendars: cache?.calendars || [],
      selectedCalendarIds: cache?.selectedCalendarIds || [],
      sources: cache?.sources || [],
      lastSyncedAt: cache?.syncedAt || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch calendars', details: error.message });
  }
});

app.get('/api/calendar-sources', async (req, res) => {
  try {
    res.json(await readCalendarSourcesForClient());
  } catch (error) {
    res.status(500).json({ error: 'Failed to read calendar sources', details: error.message });
  }
});

app.post('/api/calendar-sources', async (req, res) => {
  try {
    const saved = await saveCalendarSources(req.body);
    const cache = await syncCalendarData({ forceContext: true });
    res.json({
      success: true,
      ...attachCalendarSourceStatuses(saved, cache),
      calendars: cache?.calendars || [],
      lastSyncedAt: cache?.syncedAt || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save calendar sources', details: error.message });
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
    const calendarOverrides = config.moduleSettings?.calendar?.calendarColors
      || getAllModules(config).find((module) => module.type === 'calendar')?.config?.calendarColors
      || {};
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

app.post('/api/display/travel-time', async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const travelSnapshot = await computeTravelTimeItems({ items });
    res.json({
      updatedAt: travelSnapshot.updatedAt,
      items: travelSnapshot.items,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build travel time items', details: error.message });
  }
});

app.get('/api/display/context', async (req, res) => {
  try {
    const { context, config } = await ensureFreshContextCache();
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

app.get('/api/debug/travel-time', async (req, res) => {
  try {
    const debug = await readTravelTimeDebug();
    res.json(debug);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read Travel Time debug log', details: error.message });
  }
});

app.post('/api/debug/daily-brief/rebuild', async (req, res) => {
  try {
    await syncGoogleCalendarData({ forceContext: true });

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
    const ha = normalizeHomeAssistantModuleConfig(
      config.moduleSettings?.home_assistant
        || getAllModules(config).find((module) => module.type === 'home_assistant')?.config,
    );

    if (!ha?.url || !ha?.token) {
      return res.status(400).json({ error: 'HA URL and token must be saved first.' });
    }

    const entities = await fetchHomeAssistantEntities(ha);
    return res.json({ entities });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch entities', details: error.message });
  }
});

app.post('/api/ha/entities/discover', async (req, res) => {
  try {
    const url = typeof req.body?.url === 'string' ? req.body.url : '';
    const token = typeof req.body?.token === 'string' ? req.body.token : '';

    if (!url.trim() || !token.trim()) {
      return res.status(400).json({ error: 'Home Assistant URL and token are required.' });
    }

    const entities = await fetchHomeAssistantEntities({ url, token });
    return res.json({ entities });
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
  llmBriefHasMeaningfulContent,
  selectActiveTrip,
  selectContextBrief,
  buildBriefItemsFromBrief,
  normalizeConfig,
  resolveContextRefreshMinutes,
  validateConfigForSave,
  validateLlmSelection,
};
