import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Cloud,
  Droplets,
  Fan,
  GripVertical,
  Home,
  Info,
  Layout,
  Lightbulb,
  Lock,
  Monitor,
  Plug,
  Plus,
  Power,
  RefreshCcw,
  Save,
  Search,
  Settings,
  Thermometer,
  Trash2,
  Users,
  Wind,
} from 'lucide-react';
import MirrorPreview from './components/MirrorPreview';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
const APP_VERSION = '1.0';
const FONT_PREVIEW_STYLESHEETS = {
  Roboto: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
  Montserrat: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700&display=swap',
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

const MODULE_TYPES = [
  { id: 'clock', label: 'Clock & Date', icon: '🕒' },
  { id: 'weather', label: 'Weather', icon: '🌤' },
  { id: 'home_assistant', label: 'Home Assistant', icon: '🏠' },
  { id: 'calendar', label: 'Calendar Feed', icon: '📅' },
  { id: 'daily_brief', label: 'AI / Daily Brief', icon: '🧭' },
  { id: 'travel_time', label: 'Travel Time', icon: '🚗' },
  { id: 'module_rotator', label: 'Auto-Rotating Module Box', icon: '🪄' },
];

const ROTATABLE_MODULE_TYPES = MODULE_TYPES.filter((moduleType) => moduleType.id !== 'module_rotator');
const SHARED_MODULE_TYPES = ROTATABLE_MODULE_TYPES.map((moduleType) => moduleType.id);
const ROTATOR_ANIMATION_OPTIONS = [
  { id: 'swipe', label: 'Swipe' },
  { id: 'blend', label: 'Blend' },
  { id: 'lift', label: 'Lift' },
  { id: 'none', label: 'No animation' },
];
const EVENT_HINT_CATEGORY_OPTIONS = [
  { id: 'generic', label: 'General', description: 'Useful background facts for vague event titles.' },
  { id: 'medical', label: 'Medical / therapy', description: 'Appointments, treatments, clinics, or hospital visits.' },
  { id: 'prep', label: 'Meeting / prep', description: 'Events that usually need preparation or setup.' },
  { id: 'travel', label: 'Travel / stay', description: 'Trips, overnight stays, or destination-based plans.' },
  { id: 'pickup', label: 'Pickup / errand', description: 'Collection tasks, handoffs, or short errands.' },
];
const EVENT_HINT_ORIGIN_OPTIONS = [
  { id: 'home', label: 'Home' },
  { id: 'custom', label: 'Custom starting point' },
  { id: 'saved_place', label: 'Saved place' },
  { id: 'member_work', label: 'Member work place' },
  { id: 'member_school', label: 'Member school place' },
];
const EVENT_HINT_ROUTE_MODE_OPTIONS = [
  { id: 'car', label: 'Car' },
  { id: 'bike', label: 'Bike' },
  { id: 'walk', label: 'Walk' },
  { id: 'public_transport', label: 'Public transport' },
];

const MODULE_SIZE_PRESETS = {
  clock: {
    compact: { label: 'Compact', w: 1, h: 1 },
    standard: { label: 'Standard', w: 2, h: 2 },
    hero: { label: 'Hero', w: 2, h: 3 },
  },
  weather: {
    compact: { label: 'Compact', w: 1, h: 1 },
    standard: { label: 'Standard', w: 2, h: 2 },
    detailed: { label: 'Detailed', w: 2, h: 3 },
  },
  calendar: {
    compact: { label: 'Compact', w: 2, h: 2 },
    list: { label: 'List', w: 2, h: 3 },
    agenda: { label: 'Agenda', w: 4, h: 3 },
  },
  daily_brief: {
    compact: { label: 'Compact', w: 2, h: 1 },
    standard: { label: 'Standard', w: 2, h: 2 },
    focus: { label: 'Focus', w: 4, h: 3 },
  },
  home_assistant: {
    compact: { label: 'Compact', w: 1, h: 1 },
    standard: { label: 'Panel', w: 2, h: 2 },
    detail: { label: 'Detail', w: 2, h: 3 },
  },
  travel_time: {
    compact: { label: 'Compact', w: 2, h: 2 },
    standard: { label: 'Standard', w: 2, h: 3 },
    showcase: { label: 'Showcase', w: 4, h: 3 },
  },
  module_rotator: {
    compact: { label: 'Compact', w: 2, h: 2 },
    standard: { label: 'Standard', w: 2, h: 3 },
    showcase: { label: 'Showcase', w: 4, h: 3 },
  },
};

const GRID_ORIENTATION_PRESETS = {
  portrait: {
    label: 'Portrait',
    columns: 24,
    rows: 48,
    gap: 8,
    legacyColumns: 4,
    legacyRows: 8,
    defaultTemplate: 'portrait_focus',
  },
  landscape: {
    label: 'Landscape',
    columns: 30,
    rows: 20,
    gap: 8,
    legacyColumns: 6,
    legacyRows: 4,
    defaultTemplate: 'landscape_dashboard',
  },
};

const LEGACY_LAYOUT_TEMPLATES = {
  portrait_focus: {
    orientation: 'portrait',
    label: 'Portrait Focus',
    description: 'Tall portrait mirror with weather and AI context emphasized.',
    columns: 4,
    rows: 8,
    modules: [
      { id: 'clock_1', type: 'clock', x: 0, y: 0, w: 2, h: 2, align: 'start' },
      { id: 'weather_1', type: 'weather', x: 2, y: 0, w: 2, h: 3, align: 'stretch' },
      { id: 'brief_1', type: 'daily_brief', x: 0, y: 2, w: 4, h: 3, align: 'stretch' },
      { id: 'calendar_1', type: 'calendar', x: 0, y: 5, w: 2, h: 3, align: 'stretch' },
      { id: 'ha_1', type: 'home_assistant', x: 2, y: 5, w: 2, h: 3, align: 'stretch' },
    ],
  },
  portrait_compact: {
    orientation: 'portrait',
    label: 'Portrait Compact',
    description: 'Balanced portrait layout with smaller weather and tighter modules.',
    columns: 4,
    rows: 8,
    modules: [
      { id: 'clock_1', type: 'clock', x: 0, y: 0, w: 2, h: 2, align: 'start' },
      { id: 'weather_1', type: 'weather', x: 2, y: 0, w: 2, h: 2, align: 'stretch' },
      { id: 'brief_1', type: 'daily_brief', x: 0, y: 2, w: 4, h: 2, align: 'stretch' },
      { id: 'calendar_1', type: 'calendar', x: 0, y: 4, w: 4, h: 2, align: 'stretch' },
      { id: 'ha_1', type: 'home_assistant', x: 0, y: 6, w: 4, h: 2, align: 'stretch' },
    ],
  },
  landscape_dashboard: {
    orientation: 'landscape',
    label: 'Landscape Dashboard',
    description: 'Wide horizontal screen with top status and side-by-side content.',
    columns: 6,
    rows: 4,
    modules: [
      { id: 'clock_1', type: 'clock', x: 0, y: 0, w: 2, h: 2, align: 'start' },
      { id: 'weather_1', type: 'weather', x: 2, y: 0, w: 2, h: 2, align: 'stretch' },
      { id: 'brief_1', type: 'daily_brief', x: 4, y: 0, w: 2, h: 2, align: 'stretch' },
      { id: 'calendar_1', type: 'calendar', x: 0, y: 2, w: 3, h: 2, align: 'stretch' },
      { id: 'ha_1', type: 'home_assistant', x: 3, y: 2, w: 3, h: 2, align: 'stretch' },
    ],
  },
};

const scaleTemplateModules = (modules, sourceColumns, sourceRows, targetColumns, targetRows) => (
  (modules || []).map((module) => ({
    ...module,
    x: Math.round(((module.x || 0) / Math.max(1, sourceColumns)) * targetColumns),
    y: Math.round(((module.y || 0) / Math.max(1, sourceRows)) * targetRows),
    w: Math.max(1, Math.round(((module.w || 1) / Math.max(1, sourceColumns)) * targetColumns)),
    h: Math.max(1, Math.round(((module.h || 1) / Math.max(1, sourceRows)) * targetRows)),
  }))
);

const LAYOUT_TEMPLATES = Object.fromEntries(
  Object.entries(LEGACY_LAYOUT_TEMPLATES).map(([templateId, template]) => {
    const preset = GRID_ORIENTATION_PRESETS[template.orientation] || GRID_ORIENTATION_PRESETS.portrait;
    return [templateId, {
      ...template,
      columns: preset.columns,
      rows: preset.rows,
      gap: preset.gap,
      modules: scaleTemplateModules(
        template.modules,
        template.columns,
        template.rows,
        preset.columns,
        preset.rows,
      ),
    }];
  })
);

const PREVIEW_RESOLUTION_PRESETS = {
  '1080x1920': { label: 'Portrait FHD', width: 1080, height: 1920 },
  '1440x2560': { label: 'Portrait QHD', width: 1440, height: 2560 },
  '2160x3840': { label: 'Portrait 4K', width: 2160, height: 3840 },
  '1920x1080': { label: 'Landscape FHD', width: 1920, height: 1080 },
  '2560x1440': { label: 'Landscape QHD', width: 2560, height: 1440 },
};

const DAILY_BRIEF_CALENDAR_MODES = [
  {
    id: 'exclude_selected',
    label: 'Use all synced calendars except exclusions',
    description: 'Best default. Keep normal calendars in the brief and hide noisy sources like sports or holidays.',
  },
  {
    id: 'include_selected',
    label: 'Only use chosen calendars',
    description: 'Strict mode. The brief can only use calendars you explicitly allow below.',
  },
  {
    id: 'all_selected',
    label: 'Use all synced calendars',
    description: 'No Daily Brief filtering. Every synced calendar may create brief cards.',
  },
];

const DAILY_BRIEF_SIGNAL_OPTIONS = [
  { key: 'travel', label: 'Travel updates', description: 'Trips, flights, hotel stays, away status, return timing.' },
  { key: 'birthdays', label: 'Birthday reminders', description: 'Upcoming family birthdays with reminder lead time.' },
  { key: 'commute', label: 'Commute & route context', description: 'Travel time and weather for work, school, and similar routines.' },
  { key: 'household', label: 'Household reminders', description: 'Deliveries, public holidays, outdoor plans, garbage pickup, appointments.' },
  { key: 'visitors', label: 'Visitor context', description: 'Guests and visit-related weather context.' },
  { key: 'nextEvent', label: 'Next-up fallback', description: 'Short reminder when nothing more useful is available.' },
  { key: 'highlights', label: 'Prep reminders', description: 'Non-routine events that deserve a short heads-up in advance.' },
];

const CONFIG_TABS = [
  { id: 'display', label: 'System', icon: Monitor, eyebrow: 'Core', description: 'Display, device status, and mirror behavior.' },
  { id: 'household', label: 'Household', icon: Users, eyebrow: 'People', description: 'Members, calendars, places, and routines.' },
  { id: 'layout', label: 'Layout Editor', icon: Layout, eyebrow: 'Canvas', description: 'Grid templates, module placement, and sizing.' },
  { id: 'styling', label: 'Styling', icon: Settings, eyebrow: 'Theme', description: 'Visual language, colors, and contextual rules.' },
  { id: 'integrations', label: 'Integrations', icon: Cloud, eyebrow: 'Inputs', description: 'Connected services, sync, and module sources.' },
  { id: 'debug', label: 'Debug', icon: Info, eyebrow: 'Inspect', description: 'Daily Brief internals and troubleshooting data.' },
];

const INTEGRATION_SECTIONS = [
  { id: 'google', label: 'Google Calendar', eyebrow: 'Account', description: 'OAuth credentials and account connection.' },
  { id: 'calendar_sources', label: 'Calendar Sources', eyebrow: 'Sources', description: 'ICS feeds, CalDAV accounts, and multi-source sync.' },
  { id: 'weather', label: 'Weather', eyebrow: 'Feed', description: 'Location, provider, and refresh behavior.' },
  { id: 'home_assistant', label: 'Home Assistant', eyebrow: 'Smart Home', description: 'Connection status, activation, entity discovery, and tile configuration.' },
  { id: 'llm', label: 'LLM Context', eyebrow: 'AI', description: 'Provider setup, refresh cadence, and privacy mode.' },
  { id: 'travel', label: 'Travel', eyebrow: 'Travel', description: 'Flight enrichment, route providers, transit anchors, and refresh behavior.' },
  { id: 'module_inputs', label: 'Module Inputs', eyebrow: 'Modules', description: 'Separate inputs for Calendar and Daily Brief modules.' },
];

const HOME_ASSISTANT_ICON_OPTIONS = [
  { id: 'auto', label: 'Auto', icon: Home },
  { id: 'lightbulb', label: 'Light', icon: Lightbulb },
  { id: 'power', label: 'Power', icon: Power },
  { id: 'plug', label: 'Plug', icon: Plug },
  { id: 'thermometer', label: 'Temperature', icon: Thermometer },
  { id: 'droplets', label: 'Humidity', icon: Droplets },
  { id: 'fan', label: 'Fan', icon: Fan },
  { id: 'wind', label: 'Air', icon: Wind },
  { id: 'activity', label: 'Sensor', icon: Activity },
  { id: 'lock', label: 'Lock', icon: Lock },
  { id: 'home', label: 'Home', icon: Home },
];

const HOME_ASSISTANT_DOMAIN_ORDER = ['light', 'switch', 'sensor', 'binary_sensor', 'climate', 'fan', 'input_boolean', 'lock', 'cover'];

const getHomeAssistantDomain = (entityId = '') => {
  const [domain] = `${entityId}`.split('.');
  return domain || 'other';
};

const inferHomeAssistantEntityKind = (entity = {}) => {
  const domain = entity.domain || getHomeAssistantDomain(entity.id || entity.entityId || '');
  const deviceClass = `${entity.deviceClass || entity.device_class || ''}`.toLowerCase();
  const unit = `${entity.unit || entity.unit_of_measurement || ''}`.toLowerCase();

  if (['light', 'switch', 'binary_sensor', 'input_boolean', 'fan', 'lock', 'cover'].includes(domain)) {
    return 'binary';
  }
  if (domain === 'climate' || deviceClass === 'temperature' || unit.includes('°')) {
    return 'temperature';
  }
  if (deviceClass === 'humidity' || unit === '%') {
    return 'humidity';
  }
  if (domain === 'sensor') {
    return 'value';
  }
  return 'binary';
};

const suggestHomeAssistantIcon = (entity = {}) => {
  const domain = entity.domain || getHomeAssistantDomain(entity.id || entity.entityId || '');
  const kind = inferHomeAssistantEntityKind(entity);

  if (kind === 'temperature') return 'thermometer';
  if (kind === 'humidity') return 'droplets';
  if (domain === 'light') return 'lightbulb';
  if (domain === 'fan') return 'fan';
  if (domain === 'lock') return 'lock';
  if (domain === 'switch' || domain === 'input_boolean') return 'power';
  if (kind === 'value') return 'activity';
  return 'home';
};

const suggestHomeAssistantDisplayType = (entity = {}) => {
  const kind = inferHomeAssistantEntityKind(entity);
  if (kind === 'binary') {
    return 'small';
  }
  if (entity.domain === 'climate') {
    return 'large';
  }
  return 'medium';
};

const normalizeHomeAssistantEntityCard = (entry, entityMap = new Map()) => {
  if (typeof entry === 'string') {
    const entityId = entry.trim();
    if (!entityId) {
      return null;
    }
    const entity = entityMap.get(entityId) || { id: entityId };
    return {
      entityId,
      icon: suggestHomeAssistantIcon(entity),
      displayType: suggestHomeAssistantDisplayType(entity),
    };
  }

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const entityId = `${entry.entityId || entry.id || ''}`.trim();
  if (!entityId) {
    return null;
  }

  const entity = entityMap.get(entityId) || { id: entityId };
  const displayType = `${entry.displayType || ''}`.toLowerCase();

  return {
    entityId,
    icon: `${entry.icon || ''}`.trim() || suggestHomeAssistantIcon(entity),
    displayType: ['small', 'medium', 'large'].includes(displayType) ? displayType : suggestHomeAssistantDisplayType(entity),
  };
};

const normalizeHomeAssistantConfig = (config = {}, entityMap = new Map()) => {
  const sourceCards = Array.isArray(config.entityCards) && config.entityCards.length
    ? config.entityCards
    : (Array.isArray(config.entities) ? config.entities : []);
  const entityCards = sourceCards
    .map((entry) => normalizeHomeAssistantEntityCard(entry, entityMap))
    .filter(Boolean);

  return {
    ...config,
    enabled: config.enabled !== false,
    url: config.url || '',
    token: config.token || '',
    entities: entityCards.map((card) => card.entityId),
    entityCards,
  };
};

const getHomeAssistantDomainLabel = (domain) => domain.replace(/_/g, ' ');

const HomeAssistantIconPreview = ({ iconId, className = 'h-4 w-4' }) => {
  const match = HOME_ASSISTANT_ICON_OPTIONS.find((option) => option.id === iconId) || HOME_ASSISTANT_ICON_OPTIONS[0];
  const Icon = match.icon;
  return <Icon className={className} />;
};

const FeedbackToastViewport = ({ toasts, onDismiss }) => (
  <div className="fixed right-4 top-4 z-[90] flex w-full max-w-sm flex-col gap-3">
    {toasts.map((toast) => (
      <div
        key={toast.id}
        className={`rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur ${
          toast.tone === 'error'
            ? 'border-rose-400/30 bg-rose-500/15 text-rose-100'
            : toast.tone === 'warning'
              ? 'border-amber-400/30 bg-amber-500/15 text-amber-50'
              : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-50'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{toast.title}</div>
            {toast.message && <div className="mt-1 text-sm opacity-90">{toast.message}</div>}
          </div>
          <button onClick={() => onDismiss(toast.id)} className="text-xs uppercase tracking-wider opacity-70 transition hover:opacity-100">
            Close
          </button>
        </div>
      </div>
    ))}
  </div>
);

const OverlayDialog = ({ dialog, onClose, onConfirm }) => {
  if (!dialog) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/60">
        <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">{dialog.eyebrow || 'Attention'}</div>
        <h3 className="mt-3 text-xl font-semibold text-white">{dialog.title}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-300 whitespace-pre-line">{dialog.message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            {dialog.cancelLabel || 'Cancel'}
          </button>
          {dialog.confirmLabel && (
            <button
              onClick={onConfirm}
              className="rounded-xl bg-gradient-to-r from-[#ff86d3] via-[#ff8ea8] to-[#ffb28f] px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105"
            >
              {dialog.confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
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
      return { enabled: false, url: '', token: '', entities: [], entityCards: [] };
    case 'calendar':
      return { maxItems: 5, viewMode: 'list', daysToShow: 4, calendarColors: {} };
    case 'daily_brief':
      return { maxItems: 3, pageSeconds: 10 };
    case 'travel_time':
      return {
        items: [],
      };
    default:
      return {};
  }
};

const findModuleInLayoutTree = (modules, type) => {
  for (const module of modules || []) {
    if (module.type === type) {
      return module;
    }

    if (module.type === 'module_rotator') {
      const nestedMatch = findModuleInLayoutTree(module.config?.modules || [], type);
      if (nestedMatch) {
        return nestedMatch;
      }
    }
  }

  return null;
};

const normalizeSharedModuleConfig = (type, config = {}, entityMap = new Map()) => {
  if (type === 'home_assistant') {
    return normalizeHomeAssistantConfig(config, entityMap);
  }

  return {
    ...buildDefaultModuleConfig(type),
    ...(config && typeof config === 'object' ? config : {}),
  };
};

const normalizeModuleSettingsDraft = (moduleSettings = {}, modules = []) => {
  const normalized = {};

  SHARED_MODULE_TYPES.forEach((type) => {
    const storedConfig = moduleSettings?.[type] && typeof moduleSettings[type] === 'object'
      ? moduleSettings[type]
      : findModuleInLayoutTree(modules, type)?.config;
    normalized[type] = normalizeSharedModuleConfig(type, storedConfig);
  });

  return normalized;
};

const getOrientationForResolution = (resolution) => {
  if (!resolution?.width || !resolution?.height) {
    return null;
  }

  return resolution.width > resolution.height ? 'landscape' : 'portrait';
};

const getTemplateOrientation = (templateId) => (
  LAYOUT_TEMPLATES[templateId]?.orientation || 'portrait'
);

const getLegacyGridPreset = (orientation = 'portrait') => GRID_ORIENTATION_PRESETS[orientation] || GRID_ORIENTATION_PRESETS.portrait;

const scaleModuleToGrid = (module, sourceColumns, sourceRows, targetColumns, targetRows) => {
  const safeSourceColumns = Math.max(1, sourceColumns || 1);
  const safeSourceRows = Math.max(1, sourceRows || 1);
  const safeTargetColumns = Math.max(1, targetColumns || 1);
  const safeTargetRows = Math.max(1, targetRows || 1);

  return {
    ...module,
    x: Math.round(((module?.x || 0) / safeSourceColumns) * safeTargetColumns),
    y: Math.round(((module?.y || 0) / safeSourceRows) * safeTargetRows),
    w: Math.max(1, Math.round(((module?.w || 1) / safeSourceColumns) * safeTargetColumns)),
    h: Math.max(1, Math.round(((module?.h || 1) / safeSourceRows) * safeTargetRows)),
  };
};

const collectGridLayoutModules = (gridLayouts = {}, fallbackGridLayout = null) => {
  const layoutModules = Object.values(gridLayouts || {}).flatMap((layout) => (
    Array.isArray(layout?.modules) ? layout.modules : []
  ));

  if (layoutModules.length) {
    return layoutModules;
  }

  return Array.isArray(fallbackGridLayout?.modules) ? fallbackGridLayout.modules : [];
};

const buildRotatorChildId = (type = 'module') => `rotator_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createRotatorChildModule = (type = 'clock', moduleSettings = null) => ({
  id: buildRotatorChildId(type),
  type,
  align: 'stretch',
  config: defaultModuleConfig(type, moduleSettings),
});

const normalizeRotatorChildModule = (module, moduleSettings = null) => {
  const type = ROTATABLE_MODULE_TYPES.some((moduleType) => moduleType.id === module?.type) ? module.type : 'clock';
  const align = ['stretch', 'start', 'center', 'end'].includes(module?.align) ? module.align : 'stretch';

  return {
    id: `${module?.id || buildRotatorChildId(type)}`,
    type,
    align,
    config: normalizeSharedModuleConfig(
      type,
      moduleSettings?.[type] && typeof moduleSettings[type] === 'object'
        ? moduleSettings[type]
        : module?.config,
    ),
  };
};

const normalizeRotatorConfig = (config = {}, moduleSettings = null) => {
  const rawChildren = Array.isArray(config.modules) ? config.modules : [];
  const normalizedChildren = rawChildren
    .map((module) => normalizeRotatorChildModule(module, moduleSettings))
    .slice(0, 3);

  return {
    rotationSeconds: clamp(parseInt(config.rotationSeconds || '10', 10), 3, 120),
    animation: ROTATOR_ANIMATION_OPTIONS.some((option) => option.id === config.animation) ? config.animation : 'swipe',
    modules: normalizedChildren.length ? normalizedChildren : [createRotatorChildModule('clock', moduleSettings)],
  };
};

const defaultModuleConfig = (type, moduleSettings = null) => {
  if (type === 'module_rotator') {
    return normalizeRotatorConfig({}, moduleSettings);
  }

  if (moduleSettings?.[type] && typeof moduleSettings[type] === 'object') {
    return normalizeSharedModuleConfig(type, moduleSettings[type]);
  }

  return normalizeSharedModuleConfig(type);
};

const createDefaultGridLayout = (templateId = 'portrait_focus', moduleSettings = null) => {
  const template = LAYOUT_TEMPLATES[templateId] || LAYOUT_TEMPLATES.portrait_focus;
  const preset = getLegacyGridPreset(template.orientation);
  return {
    template: templateId,
    orientation: template.orientation,
    columns: preset.columns,
    rows: preset.rows,
    gap: template.gap || preset.gap,
    modules: template.modules.map((module) => ({
      ...module,
      config: defaultModuleConfig(module.type, moduleSettings),
    })),
  };
};

const normalizeGridLayoutShape = (gridLayout, orientation = 'portrait', moduleSettings = {}) => {
  const preset = getLegacyGridPreset(orientation);
  const templateId = gridLayout?.template && getTemplateOrientation(gridLayout.template) === orientation
    ? gridLayout.template
    : preset.defaultTemplate;
  const sourceColumns = Number(gridLayout?.columns) || preset.columns;
  const sourceRows = Number(gridLayout?.rows) || preset.rows;
  const sourceModules = Array.isArray(gridLayout?.modules) ? gridLayout.modules : [];
  const needsScaling = sourceColumns !== preset.columns || sourceRows !== preset.rows;
  const scaledModules = needsScaling
    ? sourceModules.map((module) => scaleModuleToGrid(module, sourceColumns, sourceRows, preset.columns, preset.rows))
    : sourceModules;

  return {
    template: templateId,
    orientation,
    columns: preset.columns,
    rows: preset.rows,
    gap: clamp(parseInt(gridLayout?.gap ?? `${preset.gap}`, 10), 4, 24),
    modules: scaledModules.map((module) => ({
      ...module,
      config: module.type === 'module_rotator'
        ? normalizeRotatorConfig(module.config || {}, moduleSettings)
        : normalizeSharedModuleConfig(
          module.type,
          moduleSettings?.[module.type] && typeof moduleSettings[module.type] === 'object'
            ? moduleSettings[module.type]
            : module.config,
        ),
    })),
  };
};

const normalizeGridLayoutsDraft = (gridLayouts = {}, moduleSettings = {}, fallbackGridLayout = null) => {
  const sourceLayouts = gridLayouts && typeof gridLayouts === 'object' ? gridLayouts : {};
  const fallbackOrientation = getTemplateOrientation(fallbackGridLayout?.template);

  return {
    portrait: normalizeGridLayoutShape(
      sourceLayouts.portrait || (fallbackOrientation === 'portrait' ? fallbackGridLayout : null) || createDefaultGridLayout('portrait_focus', moduleSettings),
      'portrait',
      moduleSettings,
    ),
    landscape: normalizeGridLayoutShape(
      sourceLayouts.landscape || (fallbackOrientation === 'landscape' ? fallbackGridLayout : null) || createDefaultGridLayout('landscape_dashboard', moduleSettings),
      'landscape',
      moduleSettings,
    ),
  };
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const modulesOverlap = (left, right) => (
  (left.x || 0) < (right.x || 0) + (right.w || 1) &&
  (left.x || 0) + (left.w || 1) > (right.x || 0) &&
  (left.y || 0) < (right.y || 0) + (right.h || 1) &&
  (left.y || 0) + (left.h || 1) > (right.y || 0)
);

const isModulePlacementValid = (gridLayout, moduleId, x, y, w, h) => {
  const columns = Math.max(1, gridLayout?.columns || 1);
  const rows = Math.max(1, gridLayout?.rows || 1);
  if (x < 0 || y < 0 || x + w > columns || y + h > rows) {
    return false;
  }

  return !(gridLayout?.modules || []).some((module) => (
    module.id !== moduleId
    && modulesOverlap(
      { x, y, w, h },
      { x: module.x || 0, y: module.y || 0, w: module.w || 1, h: module.h || 1 },
    )
  ));
};

const findNearestValidPlacement = (gridLayout, moduleId, proposedX, proposedY, w, h) => {
  let bestPlacement = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let y = 0; y <= Math.max(0, (gridLayout?.rows || 1) - h); y += 1) {
    for (let x = 0; x <= Math.max(0, (gridLayout?.columns || 1) - w); x += 1) {
      if (!isModulePlacementValid(gridLayout, moduleId, x, y, w, h)) {
        continue;
      }

      const distance = Math.abs(x - proposedX) + Math.abs(y - proposedY);
      if (!bestPlacement || distance < bestDistance) {
        bestPlacement = { x, y };
        bestDistance = distance;
      }
    }
  }

  return bestPlacement;
};

const findNearestValidSize = (gridLayout, moduleId, x, y, proposedWidth, proposedHeight) => {
  let bestSize = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let width = 1; width <= Math.max(1, (gridLayout?.columns || 1) - x); width += 1) {
    for (let height = 1; height <= Math.max(1, (gridLayout?.rows || 1) - y); height += 1) {
      if (!isModulePlacementValid(gridLayout, moduleId, x, y, width, height)) {
        continue;
      }

      const distance = Math.abs(width - proposedWidth) + Math.abs(height - proposedHeight);
      if (!bestSize || distance < bestDistance) {
        bestSize = { width, height };
        bestDistance = distance;
      }
    }
  }

  return bestSize;
};

const buildGridDiagnostics = (gridLayout) => {
  const columns = Math.max(1, gridLayout?.columns || 1);
  const rows = Math.max(1, gridLayout?.rows || 1);
  const modules = gridLayout?.modules || [];
  const occupancy = Array.from({ length: rows }, () => Array.from({ length: columns }, () => []));
  const overlapIds = new Set();
  const outOfBoundsIds = new Set();

  modules.forEach((module) => {
    const x = module.x || 0;
    const y = module.y || 0;
    const w = module.w || 1;
    const h = module.h || 1;

    if (x < 0 || y < 0 || x + w > columns || y + h > rows) {
      outOfBoundsIds.add(module.id);
    }

    for (let row = Math.max(0, y); row < Math.min(rows, y + h); row += 1) {
      for (let col = Math.max(0, x); col < Math.min(columns, x + w); col += 1) {
        occupancy[row][col].push(module.id);
      }
    }
  });

  for (let leftIndex = 0; leftIndex < modules.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < modules.length; rightIndex += 1) {
      if (modulesOverlap(modules[leftIndex], modules[rightIndex])) {
        overlapIds.add(modules[leftIndex].id);
        overlapIds.add(modules[rightIndex].id);
      }
    }
  }

  return {
    occupancy,
    overlapIds: Array.from(overlapIds),
    outOfBoundsIds: Array.from(outOfBoundsIds),
    occupiedCellCount: occupancy.flat().filter((cell) => cell.length > 0).length,
    overlappingCellCount: occupancy.flat().filter((cell) => cell.length > 1).length,
  };
};

function App() {
  const [config, setConfig] = useState(null);
  const [household, setHousehold] = useState(DEFAULT_HOUSEHOLD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('display');
  const [googleStatus, setGoogleStatus] = useState(null);
  const [googleCalendars, setGoogleCalendars] = useState([]);
  const [availableCalendars, setAvailableCalendars] = useState([]);
  const [calendarSources, setCalendarSources] = useState([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState([]);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [activeIntegrationSection, setActiveIntegrationSection] = useState('google');
  const [activeLayoutOrientation, setActiveLayoutOrientation] = useState('portrait');
  const [selectedLayoutModuleId, setSelectedLayoutModuleId] = useState(null);
  const [isLayersPanelOpen, setIsLayersPanelOpen] = useState(true);
  const [isAddModuleMenuOpen, setIsAddModuleMenuOpen] = useState(false);
  const [displayStatus, setDisplayStatus] = useState(null);
  const [dailyBriefDebug, setDailyBriefDebug] = useState(null);
  const [dailyBriefDebugLoading, setDailyBriefDebugLoading] = useState(false);
  const [travelTimeDebug, setTravelTimeDebug] = useState(null);
  const [travelTimeDebugLoading, setTravelTimeDebugLoading] = useState(false);
  const [haEntities, setHaEntities] = useState([]);
  const [haEntitiesLoading, setHaEntitiesLoading] = useState(false);
  const [haEntitiesError, setHaEntitiesError] = useState('');
  const [haEntityQuery, setHaEntityQuery] = useState('');
  const [haEntityDomainFilter, setHaEntityDomainFilter] = useState('all');
  const [systemCapabilities, setSystemCapabilities] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [dialogState, setDialogState] = useState(null);
  const currentEditingLayout = config?.gridLayouts?.[activeLayoutOrientation] || config?.gridLayout || null;

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    const selectedFont = config?.theme?.fontFamily;
    const stylesheetHref = selectedFont ? FONT_PREVIEW_STYLESHEETS[selectedFont] : null;
    const linkId = 'mirrorial-font-preview';
    const existing = document.getElementById(linkId);

    if (!stylesheetHref) {
      existing?.remove();
      return undefined;
    }

    if (existing instanceof HTMLLinkElement) {
      if (existing.href !== stylesheetHref) {
        existing.href = stylesheetHref;
      }
      return undefined;
    }

    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = stylesheetHref;
    document.head.appendChild(link);

    return () => {
      if (document.getElementById(linkId) === link) {
        link.remove();
      }
    };
  }, [config?.theme?.fontFamily]);

  useEffect(() => {
    if (activeTab === 'integrations' || activeTab === 'household') {
      refreshGoogleState();
      refreshCalendarSources();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'layout' || activeTab === 'display') {
      refreshDisplayStatus();
      refreshSystemCapabilities();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'debug') {
      refreshDailyBriefDebug();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'integrations' && activeIntegrationSection === 'home_assistant') {
      refreshHomeAssistantEntities();
    }
  }, [activeTab, activeIntegrationSection]);

  useEffect(() => {
    if (activeTab === 'integrations' && activeIntegrationSection === 'travel') {
      refreshTravelTimeDebug();
    }
  }, [activeTab, activeIntegrationSection]);

  useEffect(() => {
    const modules = currentEditingLayout?.modules || [];
    if (!modules.length) {
      if (selectedLayoutModuleId !== null) {
        setSelectedLayoutModuleId(null);
      }
      return;
    }

    if (!selectedLayoutModuleId || !modules.some((module) => module.id === selectedLayoutModuleId)) {
      setSelectedLayoutModuleId(modules[0].id);
    }
  }, [currentEditingLayout, selectedLayoutModuleId]);

  const dismissToast = (toastId) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  };

  const pushToast = (title, message = '', tone = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, title, message, tone }]);
    window.setTimeout(() => {
      dismissToast(id);
    }, tone === 'error' ? 6000 : 3000);
  };

  const showErrorDialog = (title, message) => {
    setDialogState({
      eyebrow: 'Error',
      title,
      message,
      cancelLabel: 'Close',
      confirmLabel: null,
      onConfirm: null,
    });
  };

  const confirmAction = ({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, eyebrow = 'Confirm' }) => {
    setDialogState({
      title,
      message,
      confirmLabel,
      cancelLabel,
      eyebrow,
      onConfirm,
    });
  };

  const closeDialog = () => setDialogState(null);

  const handleDialogConfirm = async () => {
    const callback = dialogState?.onConfirm;
    setDialogState(null);
    if (typeof callback === 'function') {
      await callback();
    }
  };

  const fetchInitialData = async () => {
    try {
      const [configResponse, householdResponse, displayStatusResponse, systemCapabilitiesResponse, calendarsResponse, calendarSourcesResponse] = await Promise.all([
        axios.get(`${API_BASE}/config`),
        axios.get(`${API_BASE}/household`),
        axios.get(`${API_BASE}/display/status`).catch(() => ({ data: null })),
        axios.get(`${API_BASE}/system/capabilities`).catch(() => ({ data: null })),
        axios.get(`${API_BASE}/calendars`).catch(() => ({ data: null })),
        axios.get(`${API_BASE}/calendar-sources`).catch(() => ({ data: { sources: [] } })),
      ]);
      const moduleSettings = normalizeModuleSettingsDraft(
        configResponse.data.moduleSettings || {},
        collectGridLayoutModules(configResponse.data.gridLayouts, configResponse.data.gridLayout),
      );
      const initialOrientation = getOrientationForResolution(displayStatusResponse.data)
        || getOrientationForResolution(PREVIEW_RESOLUTION_PRESETS[configResponse.data.system?.previewResolution])
        || 'portrait';
      setConfig({
        ...configResponse.data,
        moduleSettings,
        gridLayouts: normalizeGridLayoutsDraft(
          configResponse.data.gridLayouts,
          moduleSettings,
          configResponse.data.gridLayout,
        ),
        gridLayout: normalizeGridLayoutShape(
          configResponse.data.gridLayouts?.portrait || configResponse.data.gridLayout || createDefaultGridLayout('portrait_focus', moduleSettings),
          'portrait',
          moduleSettings,
        ),
      });
      setActiveLayoutOrientation(initialOrientation);
      setHousehold(householdResponse.data);
      setDisplayStatus(displayStatusResponse.data);
      setSystemCapabilities(systemCapabilitiesResponse.data);
      setAvailableCalendars(calendarsResponse.data?.calendars || []);
      setCalendarSources(calendarSourcesResponse.data?.sources || []);
    } catch (error) {
      showErrorDialog('Failed to load settings', 'The configuration console could not fetch the current settings from the backend.');
    } finally {
      setLoading(false);
    }
  };

  const refreshSystemCapabilities = async () => {
    try {
      const response = await axios.get(`${API_BASE}/system/capabilities`);
      setSystemCapabilities(response.data);
    } catch (error) {
      setSystemCapabilities(null);
    }
  };

  const refreshCalendarState = async () => {
    try {
      const response = await axios.get(`${API_BASE}/calendars`);
      setAvailableCalendars(response.data.calendars || []);
    } catch (error) {
      setAvailableCalendars([]);
    }
  };

  const refreshCalendarSources = async () => {
    try {
      const response = await axios.get(`${API_BASE}/calendar-sources`);
      setCalendarSources(response.data.sources || []);
    } catch (error) {
      setCalendarSources([]);
    }
  };

  const refreshGoogleState = async () => {
    try {
      const statusResponse = await axios.get(`${API_BASE}/auth/google/status`);
      setGoogleStatus(statusResponse.data);

      if (statusResponse.data.connected) {
        const calendarsResponse = await axios.get(`${API_BASE}/google/calendars`);
        setGoogleCalendars(calendarsResponse.data.calendars || []);
        setSelectedCalendarIds(calendarsResponse.data.selectedCalendarIds || []);
      } else {
        setGoogleCalendars([]);
        setSelectedCalendarIds(statusResponse.data.selectedCalendarIds || []);
      }
      refreshCalendarState();
    } catch (error) {
      setGoogleCalendars([]);
    }
  };

  const refreshDisplayStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE}/display/status`);
      setDisplayStatus(response.data);
    } catch (error) {
      setDisplayStatus(null);
    }
  };

  const refreshDailyBriefDebug = async () => {
    setDailyBriefDebugLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/debug/daily-brief`);
      setDailyBriefDebug(response.data);
    } catch (error) {
      setDailyBriefDebug(null);
    } finally {
      setDailyBriefDebugLoading(false);
    }
  };

  const refreshTravelTimeDebug = async () => {
    setTravelTimeDebugLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/debug/travel-time`);
      setTravelTimeDebug(response.data);
    } catch (error) {
      setTravelTimeDebug(null);
    } finally {
      setTravelTimeDebugLoading(false);
    }
  };

  const runTravelTimeDebug = async () => {
    setTravelTimeDebugLoading(true);
    try {
      await axios.post(`${API_BASE}/display/travel-time`, {
        items: travelTimeModuleConfig.items || [],
      });
      const response = await axios.get(`${API_BASE}/debug/travel-time`);
      setTravelTimeDebug(response.data);
      pushToast('Travel debug updated', 'The backend recalculated the configured Travel Time routes.', 'success');
    } catch (error) {
      showErrorDialog('Travel debug failed', error.response?.data?.error || 'The backend could not recalculate the Travel Time routes.');
    } finally {
      setTravelTimeDebugLoading(false);
    }
  };

  const refreshHomeAssistantEntities = async () => {
    const homeAssistantModuleConfig = normalizeHomeAssistantConfig(
      config?.moduleSettings?.home_assistant || {},
    );

    if (!homeAssistantModuleConfig.url || !homeAssistantModuleConfig.token) {
      setHaEntities([]);
      setHaEntitiesError('Enter a Home Assistant URL and long-lived token to browse entities.');
      return;
    }

    setHaEntitiesLoading(true);
    setHaEntitiesError('');
    try {
      const response = await axios.post(`${API_BASE}/ha/entities/discover`, {
        url: homeAssistantModuleConfig.url,
        token: homeAssistantModuleConfig.token,
      });
      setHaEntities(response.data.entities || []);
    } catch (error) {
      setHaEntities([]);
      setHaEntitiesError(error.response?.data?.error || 'Failed to fetch Home Assistant entities.');
    } finally {
      setHaEntitiesLoading(false);
    }
  };

  const rebuildDailyBriefDebug = async () => {
    setDailyBriefDebugLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/debug/daily-brief/rebuild`);
      setDailyBriefDebug(response.data.debug || null);
    } catch (error) {
      showErrorDialog('Daily Brief rebuild failed', 'The backend could not rebuild the Daily Brief debug payload.');
    } finally {
      setDailyBriefDebugLoading(false);
    }
  };

  const forceContextRefresh = async () => {
    confirmAction({
      title: 'Force Daily Brief refresh?',
      message: 'This may trigger weather, travel, routing, and LLM requests and can cause external API or token costs.',
      confirmLabel: 'Refresh now',
      onConfirm: async () => {
        setDailyBriefDebugLoading(true);
        try {
          await axios.post(`${API_BASE}/debug/daily-brief/rebuild`);
          pushToast('Daily Brief refreshed', 'The context payload has been rebuilt.', 'success');
        } catch (error) {
          showErrorDialog('Daily Brief refresh failed', 'The backend could not refresh the Daily Brief context.');
        } finally {
          setDailyBriefDebugLoading(false);
        }
      },
    });
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const configResponse = await axios.post(`${API_BASE}/config`, config);
      const householdResponse = await axios.post(`${API_BASE}/household`, household);
      const moduleSettings = normalizeModuleSettingsDraft(
        configResponse.data.config.moduleSettings || {},
        collectGridLayoutModules(configResponse.data.config.gridLayouts, configResponse.data.config.gridLayout),
      );
      setConfig({
        ...configResponse.data.config,
        moduleSettings,
        gridLayouts: normalizeGridLayoutsDraft(
          configResponse.data.config.gridLayouts,
          moduleSettings,
          configResponse.data.config.gridLayout,
        ),
        gridLayout: normalizeGridLayoutShape(
          configResponse.data.config.gridLayouts?.portrait || configResponse.data.config.gridLayout || createDefaultGridLayout('portrait_focus', moduleSettings),
          'portrait',
          moduleSettings,
        ),
      });
      setHousehold(householdResponse.data.household);
      pushToast('Settings saved', 'Configuration and household data were persisted successfully.', 'success');
      if (activeTab === 'integrations') {
        refreshGoogleState();
        refreshCalendarSources();
      }
    } catch (error) {
      showErrorDialog(
        'Save failed',
        error.response?.data?.details || error.response?.data?.error || 'The backend rejected the current configuration or household payload.',
      );
    } finally {
      setSaving(false);
    }
  };

  const runCommand = async (command) => {
    confirmAction({
      title: `Trigger ${command}?`,
      message: `This sends the system command "${command}" to the mirror backend.`,
      confirmLabel: 'Send command',
      onConfirm: async () => {
        try {
          await axios.post(`${API_BASE}/system/${command}`);
          pushToast('Command sent', `The mirror accepted ${command}.`, 'success');
          refreshSystemCapabilities();
        } catch (error) {
          showErrorDialog('Command failed', error.response?.data?.error || 'The system command could not be executed on this device.');
        }
      },
    });
  };

  const updateConfig = (updater) => {
    setConfig((current) => updater(typeof structuredClone === 'function' ? structuredClone(current) : JSON.parse(JSON.stringify(current))));
  };

  const updateHousehold = (updater) => {
    setHousehold((current) => updater(typeof structuredClone === 'function' ? structuredClone(current) : JSON.parse(JSON.stringify(current))));
  };

  const ensureGridLayouts = (draft) => {
    draft.gridLayouts = normalizeGridLayoutsDraft(draft.gridLayouts, draft.moduleSettings, draft.gridLayout);
    draft.gridLayout = draft.gridLayouts.portrait;
    return draft.gridLayouts;
  };

  const ensureGridLayout = (draft, orientation = activeLayoutOrientation) => {
    const gridLayouts = ensureGridLayouts(draft);
    gridLayouts[orientation] = normalizeGridLayoutShape(gridLayouts[orientation], orientation, draft.moduleSettings);
    draft.gridLayout = gridLayouts.portrait;
    return gridLayouts[orientation];
  };

  const ensureModuleSettings = (draft) => {
    draft.moduleSettings = normalizeModuleSettingsDraft(
      draft.moduleSettings || {},
      collectGridLayoutModules(draft.gridLayouts, draft.gridLayout),
    );
    return draft.moduleSettings;
  };

  const mapNestedModules = (modules, visitor) => (
    (modules || []).map((module) => {
      let nextModule = visitor({ ...module }) || { ...module };

      if (nextModule.type === 'module_rotator') {
        const nextConfig = normalizeRotatorConfig(nextModule.config || {});
        nextModule = {
          ...nextModule,
          config: {
            ...nextConfig,
            modules: mapNestedModules(nextConfig.modules, visitor).map((childModule) => normalizeRotatorChildModule(childModule)),
          },
        };
      }

      return nextModule;
    })
  );

  const normalizeGridModule = (module, gridLayout, moduleSettings = {}) => {
    const nextModule = { ...module };
    nextModule.w = clamp(parseInt(nextModule.w || '1', 10), 1, Math.max(1, gridLayout.columns));
    nextModule.h = clamp(parseInt(nextModule.h || '1', 10), 1, Math.max(1, gridLayout.rows));
    nextModule.x = clamp(parseInt(nextModule.x || '0', 10), 0, Math.max(0, gridLayout.columns - nextModule.w));
    nextModule.y = clamp(parseInt(nextModule.y || '0', 10), 0, Math.max(0, gridLayout.rows - nextModule.h));
    nextModule.align = nextModule.type === 'module_rotator' ? 'stretch' : (nextModule.align || 'stretch');
    nextModule.config = nextModule.type === 'module_rotator'
      ? normalizeRotatorConfig(nextModule.config || {}, moduleSettings)
      : normalizeSharedModuleConfig(
        nextModule.type,
        moduleSettings?.[nextModule.type] && typeof moduleSettings[nextModule.type] === 'object'
          ? moduleSettings[nextModule.type]
          : nextModule.config,
      );
    return nextModule;
  };

  const normalizeGridLayoutDraft = (gridLayout, moduleSettings = {}, orientation = activeLayoutOrientation) => {
    const preset = getLegacyGridPreset(orientation);
    gridLayout.orientation = orientation;
    gridLayout.columns = preset.columns;
    gridLayout.rows = preset.rows;
    gridLayout.gap = clamp(parseInt(gridLayout.gap || `${preset.gap}`, 10), 4, 24);
    gridLayout.modules = (gridLayout.modules || []).map((module) => normalizeGridModule(module, gridLayout, moduleSettings));
    return gridLayout;
  };

  const updateModuleConfig = (type, key, value) => {
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      moduleSettings[type] = normalizeSharedModuleConfig(type, {
        ...(moduleSettings[type] || {}),
        [key]: value,
      });
      draft.moduleSettings = moduleSettings;
      const gridLayouts = ensureGridLayouts(draft);
      draft.gridLayouts = {
        portrait: normalizeGridLayoutDraft(gridLayouts.portrait, moduleSettings, 'portrait'),
        landscape: normalizeGridLayoutDraft(gridLayouts.landscape, moduleSettings, 'landscape'),
      };
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const updateHomeAssistantConfigState = (updater) => {
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const entityMap = new Map(haEntities.map((entity) => [entity.id, entity]));
      const currentConfig = normalizeHomeAssistantConfig(moduleSettings.home_assistant || {}, entityMap);
      moduleSettings.home_assistant = normalizeHomeAssistantConfig(updater(currentConfig), entityMap);
      draft.moduleSettings = moduleSettings;
      const gridLayouts = ensureGridLayouts(draft);
      draft.gridLayouts = {
        portrait: normalizeGridLayoutDraft(gridLayouts.portrait, moduleSettings, 'portrait'),
        landscape: normalizeGridLayoutDraft(gridLayouts.landscape, moduleSettings, 'landscape'),
      };
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const updateTravelTimeConfigState = (updater) => {
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const currentConfig = normalizeSharedModuleConfig('travel_time', moduleSettings.travel_time || {});
      moduleSettings.travel_time = normalizeSharedModuleConfig('travel_time', updater(currentConfig));
      draft.moduleSettings = moduleSettings;
      const gridLayouts = ensureGridLayouts(draft);
      draft.gridLayouts = {
        portrait: normalizeGridLayoutDraft(gridLayouts.portrait, moduleSettings, 'portrait'),
        landscape: normalizeGridLayoutDraft(gridLayouts.landscape, moduleSettings, 'landscape'),
      };
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const addHomeAssistantEntity = (entity) => {
    updateHomeAssistantConfigState((currentConfig) => {
      if (currentConfig.entityCards.some((card) => card.entityId === entity.id)) {
        return currentConfig;
      }

      return {
        ...currentConfig,
        entityCards: [
          ...currentConfig.entityCards,
          {
            entityId: entity.id,
            icon: suggestHomeAssistantIcon(entity),
            displayType: suggestHomeAssistantDisplayType(entity),
          },
        ],
      };
    });
  };

  const updateHomeAssistantEntityCard = (entityId, changes) => {
    updateHomeAssistantConfigState((currentConfig) => ({
      ...currentConfig,
      entityCards: currentConfig.entityCards.map((card) => (
        card.entityId === entityId ? { ...card, ...changes } : card
      )),
    }));
  };

  const removeHomeAssistantEntity = (entityId) => {
    updateHomeAssistantConfigState((currentConfig) => ({
      ...currentConfig,
      entityCards: currentConfig.entityCards.filter((card) => card.entityId !== entityId),
    }));
  };

  const updateServiceConfig = (service, key, value) => {
    updateConfig((draft) => {
      draft.services[service][key] = value;
      return draft;
    });
  };

  const toggleDailyBriefScopedCalendar = (calendarId, enabled) => {
    updateConfig((draft) => {
      const mode = draft.services.context.briefCalendarMode || 'exclude_selected';
      const key = mode === 'include_selected' ? 'briefIncludedCalendarIds' : 'briefExcludedCalendarIds';
      const currentIds = new Set(draft.services.context[key] || []);
      if (enabled) {
        currentIds.add(calendarId);
      } else {
        currentIds.delete(calendarId);
      }
      draft.services.context[key] = Array.from(currentIds);
      return draft;
    });
  };

  const updateTheme = (key, value) => {
    updateConfig((draft) => {
      draft.theme[key] = value;
      return draft;
    });
  };

  const addHouseholdMember = () => {
    updateHousehold((draft) => {
      draft.members.push({
        id: `member_${Date.now()}`,
        name: '',
        nickname: '',
        birthdate: '',
        calendarIds: [],
        tags: [],
        shareInBrief: true,
        allowAgeReveal: false,
        commute: { mode: 'auto' },
        places: {
          work: { label: 'Work', address: '', location: null },
          school: { label: 'School', address: '', location: null },
        },
      });
      return draft;
    });
  };

  const removeHouseholdMember = (memberId) => {
    updateHousehold((draft) => {
      draft.members = draft.members.filter((member) => member.id !== memberId);
      return draft;
    });
  };

  const addSavedPlace = () => {
    updateHousehold((draft) => {
      draft.savedPlaces = draft.savedPlaces || [];
      draft.savedPlaces.push({
        id: `place_${Date.now()}`,
        name: '',
        address: '',
        category: 'general',
        indoor: false,
        tags: [],
        location: null,
      });
      return draft;
    });
  };

  const removeSavedPlace = (placeId) => {
    updateHousehold((draft) => {
      draft.savedPlaces = (draft.savedPlaces || []).filter((place) => place.id !== placeId);
      return draft;
    });
  };

  const createTravelRouteItem = () => ({
    id: `travel_route_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    enabled: true,
    originType: 'home',
    originReferenceId: '',
    originLabel: '',
    originAddress: '',
    destinationType: 'custom',
    destinationReferenceId: '',
    destinationLabel: '',
    destinationAddress: '',
    mode: 'car',
  });

  const createEventHintRule = () => ({
    id: `event_hint_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    enabled: true,
    label: '',
    keywords: [],
    category: 'generic',
    personLabel: '',
    locationLabel: '',
    locationAddress: '',
    additionalInfo: '',
    arriveEarlyMinutes: 0,
    originType: 'home',
    originReferenceId: '',
    originLabel: '',
    originAddress: '',
    transportMode: 'car',
  });

  const addTravelRouteItem = () => {
    updateTravelTimeConfigState((currentConfig) => ({
      ...currentConfig,
      items: [...(currentConfig.items || []), createTravelRouteItem()],
    }));
  };

  const updateTravelRouteItem = (itemId, changes) => {
    updateTravelTimeConfigState((currentConfig) => ({
      ...currentConfig,
      items: (currentConfig.items || []).map((item) => (
        item.id === itemId ? { ...item, ...changes } : item
      )),
    }));
  };

  const removeTravelRouteItem = (itemId) => {
    updateTravelTimeConfigState((currentConfig) => ({
      ...currentConfig,
      items: (currentConfig.items || []).filter((item) => item.id !== itemId),
    }));
  };

  const addEventHintRule = () => {
    updateConfig((draft) => {
      draft.services.context.eventHintRules = [...(draft.services.context.eventHintRules || []), createEventHintRule()];
      return draft;
    });
  };

  const updateEventHintRule = (ruleId, changes) => {
    updateConfig((draft) => {
      draft.services.context.eventHintRules = (draft.services.context.eventHintRules || []).map((rule) => (
        rule.id === ruleId ? { ...rule, ...changes } : rule
      ));
      return draft;
    });
  };

  const removeEventHintRule = (ruleId) => {
    updateConfig((draft) => {
      draft.services.context.eventHintRules = (draft.services.context.eventHintRules || []).filter((rule) => rule.id !== ruleId);
      return draft;
    });
  };

  const resolvePresetSizeForLayout = (gridLayout, preset) => {
    const presetGrid = getLegacyGridPreset(gridLayout?.orientation || activeLayoutOrientation);
    return {
      w: Math.max(1, Math.round((preset.w / presetGrid.legacyColumns) * gridLayout.columns)),
      h: Math.max(1, Math.round((preset.h / presetGrid.legacyRows) * gridLayout.rows)),
    };
  };

  const findFirstOpenPlacement = (gridLayout, moduleId, w, h) => {
    for (let y = 0; y <= Math.max(0, gridLayout.rows - h); y += 1) {
      for (let x = 0; x <= Math.max(0, gridLayout.columns - w); x += 1) {
        if (isModulePlacementValid(gridLayout, moduleId, x, y, w, h)) {
          return { x, y };
        }
      }
    }

    return null;
  };

  const getModuleInsertionSpans = (type, gridLayout) => {
    const presetCandidates = Object.values(MODULE_SIZE_PRESETS[type] || {})
      .map((preset) => resolvePresetSizeForLayout(gridLayout, preset))
      .sort((left, right) => (left.w * left.h) - (right.w * right.h));
    const fallbackCandidates = [
      { w: Math.min(4, gridLayout.columns), h: Math.min(4, gridLayout.rows) },
      { w: Math.min(3, gridLayout.columns), h: Math.min(3, gridLayout.rows) },
      { w: Math.min(2, gridLayout.columns), h: Math.min(2, gridLayout.rows) },
      { w: 1, h: 1 },
    ];

    return [...presetCandidates, ...fallbackCandidates].filter((candidate, index, candidates) => (
      candidates.findIndex((entry) => entry.w === candidate.w && entry.h === candidate.h) === index
    ));
  };

  const findAvailableModulePlacement = (type, moduleId, gridLayout) => {
    for (const span of getModuleInsertionSpans(type, gridLayout)) {
      const placement = findFirstOpenPlacement(gridLayout, moduleId, span.w, span.h);
      if (placement) {
        return { ...placement, w: span.w, h: span.h };
      }
    }

    return null;
  };

  const applyLayoutTemplate = (templateId) => {
    const nextGridLayout = createDefaultGridLayout(templateId, config?.moduleSettings);
    setSelectedLayoutModuleId(nextGridLayout.modules[0]?.id || null);
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const gridLayouts = ensureGridLayouts(draft);
      const orientation = getTemplateOrientation(templateId);
      draft.gridLayouts = {
        ...gridLayouts,
        [orientation]: normalizeGridLayoutDraft(nextGridLayout, moduleSettings, orientation),
      };
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const addGridModule = (type) => {
    const moduleId = `${type}_${Date.now()}`;
    setSelectedLayoutModuleId(moduleId);
    setIsAddModuleMenuOpen(false);
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft), moduleSettings, activeLayoutOrientation);
      const modules = gridLayout.modules || [];
      const placement = findAvailableModulePlacement(type, moduleId, gridLayout);
      if (!placement) {
        pushToast('No space available', 'Remove or resize an existing module before adding another one.', 'warning');
        return draft;
      }
      modules.push({
        id: moduleId,
        type,
        config: defaultModuleConfig(type, moduleSettings),
        x: placement.x,
        y: placement.y,
        w: placement.w,
        h: placement.h,
        align: 'stretch',
      });
      gridLayout.modules = modules.map((module) => normalizeGridModule(module, gridLayout, moduleSettings));
      draft.gridLayouts[activeLayoutOrientation] = gridLayout;
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const updateRotatorConfig = (moduleId, key, value) => {
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft), moduleSettings, activeLayoutOrientation);
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId && entry.type === 'module_rotator');
      if (moduleIndex >= 0) {
        const module = { ...gridLayout.modules[moduleIndex] };
        module.config = normalizeRotatorConfig({
          ...(module.config || {}),
          [key]: value,
        }, moduleSettings);
        gridLayout.modules[moduleIndex] = normalizeGridModule(module, gridLayout, moduleSettings);
      }
      draft.gridLayouts[activeLayoutOrientation] = gridLayout;
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const addRotatorChildModule = (moduleId, type) => {
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft), moduleSettings, activeLayoutOrientation);
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId && entry.type === 'module_rotator');
      if (moduleIndex >= 0) {
        const module = { ...gridLayout.modules[moduleIndex] };
        const config = normalizeRotatorConfig(module.config || {}, moduleSettings);
        if (config.modules.length < 3) {
          module.config = {
            ...config,
            modules: [...config.modules, createRotatorChildModule(type, moduleSettings)],
          };
          gridLayout.modules[moduleIndex] = normalizeGridModule(module, gridLayout, moduleSettings);
        }
      }
      draft.gridLayouts[activeLayoutOrientation] = gridLayout;
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const updateRotatorChildModule = (moduleId, childId, changes) => {
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft), moduleSettings, activeLayoutOrientation);
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId && entry.type === 'module_rotator');
      if (moduleIndex >= 0) {
        const module = { ...gridLayout.modules[moduleIndex] };
        const config = normalizeRotatorConfig(module.config || {}, moduleSettings);
        module.config = {
          ...config,
          modules: config.modules.map((child) => {
            if (child.id !== childId) {
              return normalizeRotatorChildModule(child, moduleSettings);
            }

            if (changes.type && changes.type !== child.type) {
              return normalizeRotatorChildModule({
                ...child,
                type: changes.type,
                config: defaultModuleConfig(changes.type, moduleSettings),
                align: changes.align || child.align,
              }, moduleSettings);
            }

            return normalizeRotatorChildModule({ ...child, ...changes }, moduleSettings);
          }),
        };
        gridLayout.modules[moduleIndex] = normalizeGridModule(module, gridLayout, moduleSettings);
      }
      draft.gridLayouts[activeLayoutOrientation] = gridLayout;
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const removeRotatorChildModule = (moduleId, childId) => {
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft), moduleSettings, activeLayoutOrientation);
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId && entry.type === 'module_rotator');
      if (moduleIndex >= 0) {
        const module = { ...gridLayout.modules[moduleIndex] };
        const config = normalizeRotatorConfig(module.config || {}, moduleSettings);
        if (config.modules.length > 1) {
          module.config = {
            ...config,
            modules: config.modules.filter((child) => child.id !== childId),
          };
          gridLayout.modules[moduleIndex] = normalizeGridModule(module, gridLayout, moduleSettings);
        }
      }
      draft.gridLayouts[activeLayoutOrientation] = gridLayout;
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const updateGridModule = (moduleId, key, value) => {
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft), moduleSettings, activeLayoutOrientation);
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId);
      const module = moduleIndex >= 0 ? gridLayout.modules[moduleIndex] : null;
      if (module) {
        const nextModule = normalizeGridModule({ ...module, [key]: value }, gridLayout, moduleSettings);
        if (isModulePlacementValid(gridLayout, nextModule.id, nextModule.x, nextModule.y, nextModule.w, nextModule.h)) {
          gridLayout.modules[moduleIndex] = nextModule;
        }
      }
      draft.gridLayouts[activeLayoutOrientation] = gridLayout;
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const updateGridModuleConfig = (moduleId, updater) => {
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft), moduleSettings, activeLayoutOrientation);
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId);
      const module = moduleIndex >= 0 ? gridLayout.modules[moduleIndex] : null;
      if (module) {
        const nextConfig = typeof updater === 'function' ? updater({ ...(module.config || {}) }) : updater;
        gridLayout.modules[moduleIndex] = normalizeGridModule({ ...module, config: nextConfig }, gridLayout, moduleSettings);
      }
      draft.gridLayouts[activeLayoutOrientation] = gridLayout;
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const removeGridModule = (moduleId) => {
    updateConfig((draft) => {
      const gridLayout = ensureGridLayout(draft, activeLayoutOrientation);
      gridLayout.modules = gridLayout.modules.filter((module) => module.id !== moduleId);
      draft.gridLayouts[activeLayoutOrientation] = gridLayout;
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const placeGridModule = (moduleId, x, y) => {
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft), moduleSettings, activeLayoutOrientation);
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId);
      if (moduleIndex >= 0) {
        const module = { ...gridLayout.modules[moduleIndex], x, y };
        const normalizedModule = normalizeGridModule(module, gridLayout, moduleSettings);
        const placement = findNearestValidPlacement(
          gridLayout,
          normalizedModule.id,
          normalizedModule.x,
          normalizedModule.y,
          normalizedModule.w,
          normalizedModule.h,
        );
        if (placement) {
          gridLayout.modules[moduleIndex] = normalizeGridModule({ ...normalizedModule, ...placement }, gridLayout, moduleSettings);
        }
      }
      draft.gridLayouts[activeLayoutOrientation] = gridLayout;
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const moveGridModule = (moduleId, dx, dy) => {
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft), moduleSettings, activeLayoutOrientation);
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId);
      if (moduleIndex >= 0) {
        const module = { ...gridLayout.modules[moduleIndex] };
        const nextModule = normalizeGridModule({
          ...module,
          x: (module.x || 0) + dx,
          y: (module.y || 0) + dy,
        }, gridLayout, moduleSettings);
        const placement = findNearestValidPlacement(gridLayout, nextModule.id, nextModule.x, nextModule.y, nextModule.w, nextModule.h);
        if (placement) {
          gridLayout.modules[moduleIndex] = normalizeGridModule({ ...nextModule, ...placement }, gridLayout, moduleSettings);
        }
      }
      draft.gridLayouts[activeLayoutOrientation] = gridLayout;
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const resizeGridModule = (moduleId, width, height) => {
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft), moduleSettings, activeLayoutOrientation);
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId);
      if (moduleIndex >= 0) {
        const module = {
          ...gridLayout.modules[moduleIndex],
          w: width,
          h: height,
        };
        const normalizedModule = normalizeGridModule(module, gridLayout, moduleSettings);
        const nextSize = findNearestValidSize(
          gridLayout,
          normalizedModule.id,
          normalizedModule.x,
          normalizedModule.y,
          normalizedModule.w,
          normalizedModule.h,
        );
        if (nextSize) {
          gridLayout.modules[moduleIndex] = normalizeGridModule({
            ...normalizedModule,
            w: nextSize.width,
            h: nextSize.height,
          }, gridLayout, moduleSettings);
        }
      }
      draft.gridLayouts[activeLayoutOrientation] = gridLayout;
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const applyModuleSizePreset = (moduleId, presetKey) => {
    updateConfig((draft) => {
      const moduleSettings = ensureModuleSettings(draft);
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft), moduleSettings, activeLayoutOrientation);
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId);
      if (moduleIndex < 0) {
        return draft;
      }

      const module = { ...gridLayout.modules[moduleIndex] };
      const presets = MODULE_SIZE_PRESETS[module.type] || {};
      const preset = presets[presetKey];
      if (preset) {
        const resolvedPreset = resolvePresetSizeForLayout(gridLayout, preset);
        const nextSize = findNearestValidSize(
          gridLayout,
          module.id,
          module.x || 0,
          module.y || 0,
          resolvedPreset.w,
          resolvedPreset.h,
        );
        if (nextSize) {
          module.w = nextSize.width;
          module.h = nextSize.height;
          gridLayout.modules[moduleIndex] = normalizeGridModule(module, gridLayout, moduleSettings);
        }
      }
      draft.gridLayouts[activeLayoutOrientation] = gridLayout;
      draft.gridLayout = draft.gridLayouts.portrait;
      return draft;
    });
  };

  const connectGoogle = () => {
    const popup = window.open(`${API_BASE}/auth/google/start`, 'mirrorial-google-auth', 'popup=yes,width=540,height=720');
    if (!popup) {
      showErrorDialog('Popup blocked', 'The browser blocked the Google OAuth popup. Allow popups for this console and try again.');
      return;
    }

    const onMessage = (event) => {
      if (!event.data || event.data.type !== 'mirrorial-google-auth') {
        return;
      }

      window.removeEventListener('message', onMessage);
      if (event.data.success) {
        refreshGoogleState();
        pushToast('Google connected', 'The Google account connection completed successfully.', 'success');
      } else {
        showErrorDialog('Google authentication failed', event.data.payload?.error || 'Google authentication failed.');
      }
    };

    window.addEventListener('message', onMessage);
  };

  const disconnectGoogle = async () => {
    try {
      await axios.post(`${API_BASE}/auth/google/disconnect`);
      await refreshGoogleState();
      pushToast('Google disconnected', 'The Google account has been disconnected from this mirror.', 'success');
    } catch (error) {
      showErrorDialog('Disconnect failed', 'The Google account could not be disconnected.');
    }
  };

  const saveCalendarSelection = async () => {
    setCalendarSaving(true);
    try {
      await axios.post(`${API_BASE}/google/calendars/select`, { selectedCalendarIds });
      await refreshGoogleState();
      pushToast('Calendar selection saved', 'Google calendar selection has been updated.', 'success');
    } catch (error) {
      showErrorDialog('Calendar selection failed', 'The selected Google calendars could not be saved.');
    } finally {
      setCalendarSaving(false);
    }
  };

  const addCalendarSource = (type = 'ics') => {
    setCalendarSources((current) => ([
      ...current,
      {
        id: `calendar_source_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type,
        name: '',
        enabled: true,
        url: '',
        username: '',
        password: '',
        passwordConfigured: false,
        color: '',
      },
    ]));
  };

  const updateCalendarSource = (sourceId, changes) => {
    setCalendarSources((current) => current.map((source) => (
      source.id === sourceId ? { ...source, ...changes } : source
    )));
  };

  const removeCalendarSource = (sourceId) => {
    setCalendarSources((current) => current.filter((source) => source.id !== sourceId));
  };

  const saveCalendarSources = async () => {
    try {
      const response = await axios.post(`${API_BASE}/calendar-sources`, { sources: calendarSources });
      setCalendarSources(response.data.sources || []);
      setAvailableCalendars(response.data.calendars || []);
      pushToast('Calendar sources saved', 'ICS and CalDAV sources were updated and synced.', 'success');
    } catch (error) {
      showErrorDialog('Calendar source save failed', error.response?.data?.error || 'The calendar sources could not be saved.');
    }
  };

  const getModuleSettings = (type, entityMap = new Map()) => {
    const storedConfig = config?.moduleSettings?.[type];
    return normalizeSharedModuleConfig(type, storedConfig, entityMap);
  };

  if (loading || !config || !household) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Loading...</div>;
  }

  const googleConfig = config.services.google;
  const llmConfig = config.services.llm;
  const travelConfig = config.services.travel || {};
  const contextConfig = config.services.context;
  const eventHintRules = contextConfig.eventHintRules || [];
  const dailyBriefSignals = contextConfig.signals || {};
  const dailyBriefCalendarMode = contextConfig.briefCalendarMode || 'exclude_selected';
  const dailyBriefScopedCalendarIds = dailyBriefCalendarMode === 'include_selected'
    ? (contextConfig.briefIncludedCalendarIds || [])
    : (contextConfig.briefExcludedCalendarIds || []);
  const currentGridLayout = config.gridLayouts?.[activeLayoutOrientation]
    || config.gridLayout
    || createDefaultGridLayout(activeLayoutOrientation === 'landscape' ? 'landscape_dashboard' : 'portrait_focus', config.moduleSettings);
  const currentGridDiagnostics = buildGridDiagnostics(currentGridLayout);
  const selectedLayoutModule = (currentGridLayout.modules || []).find((module) => module.id === selectedLayoutModuleId) || null;
  const weatherConfig = getModuleSettings('weather');
  const haEntityMap = new Map(haEntities.map((entity) => [entity.id, entity]));
  const homeAssistantConfig = getModuleSettings('home_assistant', haEntityMap);
  const travelTimeModuleConfig = getModuleSettings('travel_time');
  const selectedHomeAssistantEntityIds = new Set(homeAssistantConfig.entityCards.map((card) => card.entityId));
  const homeAssistantDomains = Array.from(haEntities.reduce((map, entity) => {
    const domain = entity.domain || getHomeAssistantDomain(entity.id);
    map.set(domain, (map.get(domain) || 0) + 1);
    return map;
  }, new Map()).entries())
    .sort((left, right) => {
      const leftIndex = HOME_ASSISTANT_DOMAIN_ORDER.indexOf(left[0]);
      const rightIndex = HOME_ASSISTANT_DOMAIN_ORDER.indexOf(right[0]);
      const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      if (normalizedLeft !== normalizedRight) {
        return normalizedLeft - normalizedRight;
      }
      return left[0].localeCompare(right[0]);
    });
  const filteredHomeAssistantEntities = haEntities.filter((entity) => {
    const matchesDomain = haEntityDomainFilter === 'all' || entity.domain === haEntityDomainFilter;
    const query = haEntityQuery.trim().toLowerCase();
    const matchesQuery = !query
      || entity.name.toLowerCase().includes(query)
      || entity.id.toLowerCase().includes(query)
      || (entity.deviceClass || '').toLowerCase().includes(query);
    return matchesDomain && matchesQuery;
  });
  const calendarModuleConfig = getModuleSettings('calendar');
  const dailyBriefConfig = getModuleSettings('daily_brief');
  const configuredPreviewResolution = config.system.previewResolution || 'auto';
  const resolvedPreviewResolution = configuredPreviewResolution === 'auto'
    ? (displayStatus?.width && displayStatus?.height
      ? { width: displayStatus.width, height: displayStatus.height, label: 'Live device' }
      : PREVIEW_RESOLUTION_PRESETS['1080x1920'])
    : PREVIEW_RESOLUTION_PRESETS[configuredPreviewResolution] || PREVIEW_RESOLUTION_PRESETS['1080x1920'];
  const activeCanvasResolution = getOrientationForResolution(resolvedPreviewResolution) === activeLayoutOrientation
    ? resolvedPreviewResolution
    : (activeLayoutOrientation === 'landscape'
      ? PREVIEW_RESOLUTION_PRESETS['1920x1080']
      : PREVIEW_RESOLUTION_PRESETS['1080x1920']);
  const availableLayoutTemplates = Object.entries(LAYOUT_TEMPLATES)
    .filter(([, template]) => template.orientation === activeLayoutOrientation);
  const activeTabMeta = CONFIG_TABS.find((tab) => tab.id === activeTab) || CONFIG_TABS[0];
  const activeIntegrationMeta = INTEGRATION_SECTIONS.find((section) => section.id === activeIntegrationSection) || INTEGRATION_SECTIONS[0];
  const currentYear = new Date().getFullYear();
  const selectedLayoutModuleMeta = selectedLayoutModule
    ? (MODULE_TYPES.find((item) => item.id === selectedLayoutModule.type) || { label: selectedLayoutModule.type, icon: '•' })
    : null;

  const renderModuleSpecificInspector = () => {
    if (!selectedLayoutModule) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-5 text-sm text-slate-500">
          Select a module in the canvas to inspect its layout and settings.
        </div>
      );
    }

    if (selectedLayoutModule.type === 'weather') {
      return (
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Display Name</label>
            <input
              type="text"
              value={weatherConfig.displayName || ''}
              onChange={(event) => updateModuleConfig('weather', 'displayName', event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">City</label>
              <input
                type="text"
                value={weatherConfig.city || ''}
                onChange={(event) => updateModuleConfig('weather', 'city', event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Country</label>
              <input
                type="text"
                value={weatherConfig.country || ''}
                onChange={(event) => updateModuleConfig('weather', 'country', event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Postal Code</label>
              <input
                type="text"
                value={weatherConfig.postalCode || ''}
                onChange={(event) => updateModuleConfig('weather', 'postalCode', event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Refresh</label>
              <input
                type="number"
                min="5"
                max="180"
                value={weatherConfig.refreshMinutes || 30}
                onChange={(event) => updateModuleConfig('weather', 'refreshMinutes', parseInt(event.target.value || '30', 10))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
              />
            </div>
          </div>
        </div>
      );
    }

    if (selectedLayoutModule.type === 'calendar') {
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">View</label>
            <select
              value={calendarModuleConfig.viewMode || 'list'}
              onChange={(event) => updateModuleConfig('calendar', 'viewMode', event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
            >
              <option value="list">List</option>
              <option value="day_cards">Day cards</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Days</label>
            <input
              type="number"
              min="1"
              max="7"
              value={calendarModuleConfig.daysToShow || 4}
              onChange={(event) => updateModuleConfig('calendar', 'daysToShow', parseInt(event.target.value || '4', 10))}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Max Items</label>
            <input
              type="number"
              min="1"
              max="12"
              value={calendarModuleConfig.maxItems || 5}
              onChange={(event) => updateModuleConfig('calendar', 'maxItems', parseInt(event.target.value || '5', 10))}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
            />
          </div>
        </div>
      );
    }

    if (selectedLayoutModule.type === 'daily_brief') {
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Cards Per Page</label>
            <input
              type="number"
              min="1"
              max="5"
              value={dailyBriefConfig.maxItems || 3}
              onChange={(event) => updateModuleConfig('daily_brief', 'maxItems', parseInt(event.target.value || '3', 10))}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Page Seconds</label>
            <input
              type="number"
              min="3"
              max="60"
              value={dailyBriefConfig.pageSeconds || 10}
              onChange={(event) => updateModuleConfig('daily_brief', 'pageSeconds', parseInt(event.target.value || '10', 10))}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
            />
          </div>
        </div>
      );
    }

    if (selectedLayoutModule.type === 'home_assistant') {
      return (
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-white">Enabled</div>
              <div className="text-xs text-slate-500">Entity cards are configured in Integrations.</div>
            </div>
            <input
              type="checkbox"
              checked={homeAssistantConfig.enabled !== false}
              onChange={(event) => updateModuleConfig('home_assistant', 'enabled', event.target.checked)}
            />
          </label>
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-500">
            {homeAssistantConfig.entityCards.length} entity card{homeAssistantConfig.entityCards.length === 1 ? '' : 's'} configured.
          </div>
        </div>
      );
    }

    if (selectedLayoutModule.type === 'travel_time') {
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-500">
            Route cards are now managed in Integrations → Travel so the same route set is shared by normal Travel Time modules and rotator children.
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
            {travelTimeModuleConfig.items?.length || 0} route card{travelTimeModuleConfig.items?.length === 1 ? '' : 's'} configured.
          </div>
        </div>
      );
    }

    if (selectedLayoutModule.type === 'module_rotator') {
      const rotatorConfig = normalizeRotatorConfig(selectedLayoutModule.config || {}, config.moduleSettings);
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Rotation Seconds</label>
              <input
                type="number"
                min="3"
                max="120"
                value={rotatorConfig.rotationSeconds}
                onChange={(event) => updateRotatorConfig(selectedLayoutModule.id, 'rotationSeconds', parseInt(event.target.value || '10', 10))}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Animation</label>
              <select
                value={rotatorConfig.animation}
                onChange={(event) => updateRotatorConfig(selectedLayoutModule.id, 'animation', event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
              >
                {ROTATOR_ANIMATION_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-3">
            {rotatorConfig.modules.map((childModule, childIndex) => (
              <div key={childModule.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Page {childIndex + 1}</div>
                    <div className="mt-1 text-sm font-semibold text-white">{MODULE_TYPES.find((item) => item.id === childModule.type)?.label || childModule.type}</div>
                  </div>
                  <button
                    type="button"
                    disabled={rotatorConfig.modules.length <= 1}
                    onClick={() => removeRotatorChildModule(selectedLayoutModule.id, childModule.id)}
                    className="text-slate-500 transition-colors hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <select
                    value={childModule.type}
                    onChange={(event) => updateRotatorChildModule(selectedLayoutModule.id, childModule.id, { type: event.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
                  >
                    {ROTATABLE_MODULE_TYPES.map((moduleType) => (
                      <option key={`${childModule.id}-${moduleType.id}`} value={moduleType.id}>{moduleType.label}</option>
                    ))}
                  </select>
                  <select
                    value={childModule.align || 'stretch'}
                    onChange={(event) => updateRotatorChildModule(selectedLayoutModule.id, childModule.id, { align: event.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
                  >
                    <option value="stretch">Stretch</option>
                    <option value="start">Top Left</option>
                    <option value="center">Center</option>
                    <option value="end">Bottom Right</option>
                  </select>
                </div>
              </div>
            ))}
            {rotatorConfig.modules.length < 3 && (
              <button
                type="button"
                onClick={() => addRotatorChildModule(selectedLayoutModule.id, 'clock')}
                className="w-full rounded-xl border border-dashed border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300 transition-all hover:border-[#ff8bbf] hover:text-white"
              >
                Add Rotator Page
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-500">
        This module uses shared settings configured elsewhere in the console.
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <FeedbackToastViewport toasts={toasts} onDismiss={dismissToast} />
      <OverlayDialog dialog={dialogState} onClose={closeDialog} onConfirm={handleDialogConfirm} />
      <div className="w-full p-4 md:p-8">
        <div className="grid gap-8 xl:grid-cols-[280px,minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-slate-950/40">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 p-1.5 shadow-lg shadow-pink-950/30 ring-1 ring-white/10">
                  <img src="/icon_mirrorial.png" alt="Mirrorial" className="h-full w-full object-contain" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-white">Mirrorial</h1>
                  <div className="text-xs font-bold uppercase tracking-[0.28em] text-[#ffd7aa]/80">Configuration Console</div>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">{activeTabMeta.eyebrow}</div>
                <div className="mt-2 text-lg font-semibold text-white">{activeTabMeta.label}</div>
                <div className="mt-1 text-sm text-slate-400">{activeTabMeta.description}</div>
              </div>
            </section>

            <nav className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {CONFIG_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-[24px] border p-4 text-left transition-all ${
                    activeTab === tab.id
                      ? 'border-[#ff9ab6]/50 bg-gradient-to-br from-[#ff86d3]/20 via-[#ff96aa]/14 to-slate-900 text-white shadow-lg shadow-pink-950/30'
                      : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${activeTab === tab.id ? 'bg-gradient-to-br from-[#ff86d3] via-[#ff8ea8] to-[#ffd29d] text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                      <tab.icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">{tab.eyebrow}</div>
                      <div className="mt-1 text-sm font-semibold">{tab.label}</div>
                      <div className="mt-1 text-xs text-slate-400">{tab.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </nav>
          </aside>

          <div className="space-y-8">
            <header className="rounded-[32px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(255,134,211,0.18),_rgba(255,210,157,0.1)_26%,_rgba(15,23,42,0.94)_48%,_rgba(2,6,23,1)_100%)] p-6 md:p-8 shadow-2xl shadow-slate-950/40">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <div className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffd7aa]/80">{activeTabMeta.eyebrow}</div>
                  <h2 className="mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl">{activeTabMeta.label}</h2>
                  <p className="mt-3 text-sm text-slate-300 md:text-base">{activeTabMeta.description}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-400">
                    Changes persist to mirror services and module configuration.
                  </div>
                  <button
                    onClick={saveConfig}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#ff86d3] via-[#ff8ea8] to-[#ffd29d] px-6 py-3 font-semibold text-slate-950 transition-all hover:brightness-105 active:scale-95 disabled:opacity-70"
                  >
                    <Save size={18} /> {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </header>

            <main className="space-y-8">
          {activeTab === 'display' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-6 text-white">Display Preferences</h2>
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Refresh Rate</label>
                      <select
                        value={config.system.fps}
                        onChange={(event) => updateConfig((draft) => {
                          draft.system.fps = parseInt(event.target.value, 10);
                          return draft;
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                      >
                        <option value={30}>30 FPS</option>
                        <option value={60}>60 FPS</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Rotation</label>
                      <select
                        value={config.system.rotation}
                        onChange={(event) => updateConfig((draft) => {
                          draft.system.rotation = parseInt(event.target.value, 10);
                          return draft;
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                      >
                        <option value={0}>0°</option>
                        <option value={90}>90°</option>
                        <option value={180}>180°</option>
                        <option value={270}>270°</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Display Language</label>
                      <select
                        value={config.system.displayLocale || 'en'}
                        onChange={(event) => updateConfig((draft) => {
                          draft.system.displayLocale = event.target.value;
                          return draft;
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                      >
                        <option value="en">English</option>
                        <option value="de">Deutsch</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Time Format</label>
                      <select
                        value={config.system.timeFormat || '24h'}
                        onChange={(event) => updateConfig((draft) => {
                          draft.system.timeFormat = event.target.value;
                          return draft;
                        })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                      >
                        <option value="24h">24 hour</option>
                        <option value="12h">12 hour</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Display Backend URL</label>
                    <input
                      type="text"
                      value={config.system.backendUrl || ''}
                      onChange={(event) => updateConfig((draft) => {
                        draft.system.backendUrl = event.target.value;
                        return draft;
                      })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Preview Resolution</label>
                    <select
                      value={config.system.previewResolution || 'auto'}
                      onChange={(event) => updateConfig((draft) => {
                        draft.system.previewResolution = event.target.value;
                        return draft;
                      })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                    >
                      <option value="auto">Use live device resolution</option>
                      {Object.entries(PREVIEW_RESOLUTION_PRESETS).map(([key, preset]) => (
                        <option key={key} value={key}>{preset.label} ({preset.width}x{preset.height})</option>
                      ))}
                    </select>
                    <div className="text-xs text-slate-500 mt-2">
                      {displayStatus?.width && displayStatus?.height
                        ? `Live display last reported ${displayStatus.width}x${displayStatus.height}${displayStatus.updatedAt ? ` at ${new Date(displayStatus.updatedAt).toLocaleTimeString()}` : ''}.`
                        : 'No live display resolution reported yet. A running mirror will report it automatically.'}
                    </div>
                  </div>
                </div>

                <hr className="my-6 border-slate-800" />

                <h2 className="text-lg font-semibold mb-6 text-white">Power Schedule</h2>
                <div className="space-y-5">
                  <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-800">
                    <div>
                      <div className="text-sm font-semibold text-white">Auto Shutdown</div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Shut down the mirror daily</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={config.system.power?.autoShutdownEnabled || false}
                        onChange={(event) => updateConfig((draft) => {
                          draft.system.power.autoShutdownEnabled = event.target.checked;
                          return draft;
                        })}
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ff7ea8]"></div>
                    </label>
                  </div>

                  <div className={config.system.power?.autoShutdownEnabled ? 'block' : 'opacity-40 pointer-events-none'}>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Shutdown Time</label>
                    <input
                      type="time"
                      value={config.system.power?.autoShutdownTime || '23:00'}
                      onChange={(event) => updateConfig((draft) => {
                        draft.system.power.autoShutdownTime = event.target.value;
                        return draft;
                      })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm text-white"
                    />
                  </div>
                </div>
              </section>

              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-6 text-white">System Actions</h2>
                {systemCapabilities && (
                  <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
                    Backend: <span className="font-semibold text-white">{systemCapabilities.commandBackend || 'unknown'}</span>
                    {systemCapabilities.isPi ? ' on Raspberry Pi hardware.' : ' on a non-Pi device.'}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => runCommand('restart-display')}
                    disabled={systemCapabilities && !systemCapabilities.canRestartDisplay}
                    className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 p-4 rounded-xl transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCcw size={18} className="text-amber-500" />
                    <div className="text-left">
                      <div className="font-semibold">Restart Display</div>
                      <div className="text-xs text-slate-500">
                        {systemCapabilities && !systemCapabilities.canRestartDisplay
                          ? 'Unavailable on this device backend'
                          : 'Restart the Flutter display process'}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => runCommand('reboot')}
                    disabled={systemCapabilities && !systemCapabilities.canReboot}
                    className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 p-4 rounded-xl transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCcw size={18} className="text-blue-500" />
                    <div className="text-left">
                      <div className="font-semibold">Reboot Mirror</div>
                      <div className="text-xs text-slate-500">
                        {systemCapabilities && !systemCapabilities.canReboot
                          ? 'Only available on supported production hardware'
                          : 'Full system reboot'}
                      </div>
                    </div>
                  </button>
                </div>

              </section>
            </div>
          )}

          {activeTab === 'household' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <section className="xl:col-span-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Users size={24} className="text-[#ff8bbf]" />
                  <h2 className="text-lg font-semibold text-white">Home Base</h2>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
                    Household profiles are stored privately on the device under the Mirrorial data directory and are not written to `config.json`.
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Home Label</label>
                    <input
                      type="text"
                      value={household.home?.label || 'Home'}
                      onChange={(event) => updateHousehold((draft) => {
                        draft.home.label = event.target.value;
                        return draft;
                      })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Home Address</label>
                    <textarea
                      rows={3}
                      value={household.home?.address || ''}
                      onChange={(event) => updateHousehold((draft) => {
                        draft.home.address = event.target.value;
                        return draft;
                      })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                    />
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
                    {household.home?.location?.label
                      ? `Resolved location: ${household.home.location.label}`
                      : 'Location will be geocoded and cached when you save.'}
                  </div>
                </div>
              </section>

              <section className="xl:col-span-2 bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <Users size={24} className="text-emerald-400" />
                    <div>
                      <h2 className="text-lg font-semibold text-white">Household Members</h2>
                      <div className="text-sm text-slate-500">Birthdays, commute relevance, and family-aware context.</div>
                    </div>
                  </div>
                  <button onClick={addHouseholdMember} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl transition-all active:scale-95 border border-slate-700">
                    <Plus size={18} /> Add Member
                  </button>
                </div>

                <div className="space-y-6">
                  {household.members.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-800 p-6 text-sm text-slate-500">
                      No household members yet. Add people to enable birthdays and commute-aware summaries.
                    </div>
                  )}

                  {household.members.map((member, index) => (
                    <div key={member.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-white font-semibold">Member #{index + 1}</div>
                          <div className="text-xs text-slate-500">Link calendars, birthday, and usual destinations.</div>
                        </div>
                        <button onClick={() => removeHouseholdMember(member.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Name</label>
                          <input
                            type="text"
                            value={member.name || ''}
                            onChange={(event) => updateHousehold((draft) => {
                              const target = draft.members.find((entry) => entry.id === member.id);
                              target.name = event.target.value;
                              return draft;
                            })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nickname</label>
                          <input
                            type="text"
                            value={member.nickname || ''}
                            onChange={(event) => updateHousehold((draft) => {
                              const target = draft.members.find((entry) => entry.id === member.id);
                              target.nickname = event.target.value;
                              return draft;
                            })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Birthdate</label>
                          <input
                            type="date"
                            value={member.birthdate || ''}
                            onChange={(event) => updateHousehold((draft) => {
                              const target = draft.members.find((entry) => entry.id === member.id);
                              target.birthdate = event.target.value;
                              return draft;
                            })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                        <label className="flex items-center justify-between gap-3 p-3 bg-slate-800/30 rounded-xl border border-slate-800">
                          <div>
                            <div className="text-sm font-semibold text-white">Allow age reveal</div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold">Used for birthday overlays and messages</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={member.allowAgeReveal === true}
                            onChange={(event) => updateHousehold((draft) => {
                              const target = draft.members.find((entry) => entry.id === member.id);
                              target.allowAgeReveal = event.target.checked;
                              return draft;
                            })}
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tags</label>
                          <input
                            type="text"
                            placeholder="parent, kid, student"
                            value={member.tags?.join(', ') || ''}
                            onChange={(event) => updateHousehold((draft) => {
                              const target = draft.members.find((entry) => entry.id === member.id);
                              target.tags = event.target.value.split(',').map((item) => item.trim()).filter(Boolean);
                              return draft;
                            })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Commute Mode</label>
                          <select
                            value={member.commute?.mode || 'auto'}
                            onChange={(event) => updateHousehold((draft) => {
                              const target = draft.members.find((entry) => entry.id === member.id);
                              target.commute.mode = event.target.value;
                              return draft;
                            })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          >
                            <option value="auto">Auto / unknown</option>
                            <option value="car">Car</option>
                            <option value="train">Train</option>
                            <option value="bike">Bike</option>
                            <option value="walk">Walk</option>
                          </select>
                        </div>
                      </div>

                      <label className="flex items-center justify-between gap-3 p-3 bg-slate-800/30 rounded-xl border border-slate-800">
                        <div>
                          <div className="text-sm font-semibold text-white">Show in hallway brief</div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold">Disable if this person should stay private</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={member.shareInBrief !== false}
                          onChange={(event) => updateHousehold((draft) => {
                            const target = draft.members.find((entry) => entry.id === member.id);
                            target.shareInBrief = event.target.checked;
                            return draft;
                          })}
                        />
                      </label>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Linked Calendars</label>
                        {availableCalendars.length === 0 ? (
                          <div className="text-sm text-slate-500">Connect Google, ICS, or CalDAV sources to link calendars to this household member.</div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {availableCalendars.map((calendar) => (
                              <label key={`${member.id}-${calendar.id}`} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/70">
                                <div>
                                  <div className="font-medium text-white">{calendar.summary}</div>
                                  <div className="text-xs text-slate-500">{calendar.primary ? 'Primary' : calendar.accessRole}</div>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={(member.calendarIds || []).includes(calendar.id)}
                                  onChange={(event) => updateHousehold((draft) => {
                                    const target = draft.members.find((entry) => entry.id === member.id);
                                    if (event.target.checked) {
                                      target.calendarIds = Array.from(new Set([...(target.calendarIds || []), calendar.id]));
                                    } else {
                                      target.calendarIds = (target.calendarIds || []).filter((id) => id !== calendar.id);
                                    }
                                    return draft;
                                  })}
                                />
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {['work', 'school'].map((placeType) => {
                          const place = member.places?.[placeType] || {};
                          const title = placeType === 'work' ? 'Work' : 'School';

                          return (
                            <div key={`${member.id}-${placeType}`} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                              <div className="font-semibold text-white">{title}</div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Label</label>
                                <input
                                  type="text"
                                  value={place.label || title}
                                  onChange={(event) => updateHousehold((draft) => {
                                    const target = draft.members.find((entry) => entry.id === member.id);
                                    target.places[placeType].label = event.target.value;
                                    return draft;
                                  })}
                                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Address</label>
                                <textarea
                                  rows={3}
                                  value={place.address || ''}
                                  onChange={(event) => updateHousehold((draft) => {
                                    const target = draft.members.find((entry) => entry.id === member.id);
                                    target.places[placeType].address = event.target.value;
                                    return draft;
                                  })}
                                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                />
                              </div>
                              <div className="text-xs text-slate-500">
                                {place.location?.label ? `Resolved: ${place.location.label}` : 'Will be geocoded when you save.'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="xl:col-span-3 bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Saved Places</h2>
                    <div className="text-sm text-slate-500">Optional local places like zoo, museum, grandma, airport, or favorite indoor fallback.</div>
                  </div>
                  <button onClick={addSavedPlace} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl transition-all active:scale-95 border border-slate-700">
                    <Plus size={18} /> Add Place
                  </button>
                </div>

                <div className="space-y-4">
                  {(household.savedPlaces || []).length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-800 p-6 text-sm text-slate-500">
                      No saved places yet. Add common destinations to improve outing weather guidance and local context.
                    </div>
                  )}

                  {(household.savedPlaces || []).map((place, index) => (
                    <div key={place.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-white font-semibold">Place #{index + 1}</div>
                          <div className="text-xs text-slate-500">Matched against calendar titles, locations, and tags.</div>
                        </div>
                        <button onClick={() => removeSavedPlace(place.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Name</label>
                          <input
                            type="text"
                            placeholder="Zoo Hagenbeck"
                            value={place.name || ''}
                            onChange={(event) => updateHousehold((draft) => {
                              const target = (draft.savedPlaces || []).find((entry) => entry.id === place.id);
                              target.name = event.target.value;
                              return draft;
                            })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Category</label>
                          <select
                            value={place.category || 'general'}
                            onChange={(event) => updateHousehold((draft) => {
                              const target = (draft.savedPlaces || []).find((entry) => entry.id === place.id);
                              target.category = event.target.value;
                              return draft;
                            })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          >
                            <option value="general">General</option>
                            <option value="family">Family</option>
                            <option value="outdoor">Outdoor</option>
                            <option value="indoor">Indoor</option>
                            <option value="travel">Travel</option>
                            <option value="shopping">Shopping</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Address</label>
                          <textarea
                            rows={3}
                            value={place.address || ''}
                            onChange={(event) => updateHousehold((draft) => {
                              const target = (draft.savedPlaces || []).find((entry) => entry.id === place.id);
                              target.address = event.target.value;
                              return draft;
                            })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tags</label>
                            <input
                              type="text"
                              placeholder="zoo, animals, family"
                              value={place.tags?.join(', ') || ''}
                              onChange={(event) => updateHousehold((draft) => {
                                const target = (draft.savedPlaces || []).find((entry) => entry.id === place.id);
                                target.tags = event.target.value.split(',').map((item) => item.trim()).filter(Boolean);
                                return draft;
                              })}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            />
                          </div>

                          <label className="flex items-center justify-between gap-3 p-3 bg-slate-800/30 rounded-xl border border-slate-800">
                            <div>
                              <div className="text-sm font-semibold text-white">Indoor fallback</div>
                              <div className="text-[10px] text-slate-500 uppercase font-bold">Use this place when weather is poor</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={place.indoor === true}
                              onChange={(event) => updateHousehold((draft) => {
                                const target = (draft.savedPlaces || []).find((entry) => entry.id === place.id);
                                target.indoor = event.target.checked;
                                return draft;
                              })}
                            />
                          </label>
                        </div>
                      </div>

                      <div className="text-xs text-slate-500">
                        {place.location?.label ? `Resolved: ${place.location.label}` : 'Will be geocoded when you save.'}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'layout' && (
            <div className="space-y-6">
              <section className="rounded-[28px] border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-slate-950/30">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.24em] text-[#ffd7aa]/80">Canvas Workspace</div>
                    <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Layout Editor</h2>
                    <p className="mt-2 max-w-2xl text-sm text-slate-400">Edit the mirror as a visual canvas. Select modules in the preview, drag to move, resize from the handle, and adjust details in the inspector.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex rounded-2xl border border-slate-700 bg-slate-950/80 p-1">
                      {['portrait', 'landscape'].map((orientation) => (
                        <button
                          key={orientation}
                          type="button"
                          onClick={() => {
                            setActiveLayoutOrientation(orientation);
                            setIsAddModuleMenuOpen(false);
                          }}
                          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                            activeLayoutOrientation === orientation
                              ? 'bg-[#ff8bbf] text-slate-950'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {GRID_ORIENTATION_PRESETS[orientation].label}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsAddModuleMenuOpen((current) => !current)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-white transition-all hover:border-[#ff8bbf] hover:text-[#ffd7aa]"
                      >
                        <Plus size={16} />
                        Add Module
                      </button>
                      {isAddModuleMenuOpen && (
                        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 min-w-[240px] rounded-2xl border border-slate-700 bg-slate-950/95 p-2 shadow-2xl shadow-slate-950/60 backdrop-blur">
                          {MODULE_TYPES.map((type) => (
                            <button
                              key={type.id}
                              type="button"
                              onClick={() => addGridModule(type.id)}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-200 transition-all hover:bg-slate-800"
                            >
                              <span className="text-lg">{type.icon}</span>
                              <span>{type.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,320px),160px,1fr]">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Template</label>
                    <select
                      value={currentGridLayout.template || GRID_ORIENTATION_PRESETS[activeLayoutOrientation].defaultTemplate}
                      onChange={(event) => applyLayoutTemplate(event.target.value)}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
                    >
                      {availableLayoutTemplates.map(([id, template]) => (
                        <option key={id} value={id}>{template.label}</option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-slate-500">
                      {LAYOUT_TEMPLATES[currentGridLayout.template || GRID_ORIENTATION_PRESETS[activeLayoutOrientation].defaultTemplate]?.description}
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Gap</label>
                    <input
                      type="number"
                      min="4"
                      max="24"
                      value={currentGridLayout.gap}
                      onChange={(event) => updateConfig((draft) => {
                        const moduleSettings = ensureModuleSettings(draft);
                        const gridLayout = ensureGridLayout(draft, activeLayoutOrientation);
                        gridLayout.gap = parseInt(event.target.value || `${getLegacyGridPreset(activeLayoutOrientation).gap}`, 10);
                        draft.gridLayouts[activeLayoutOrientation] = normalizeGridLayoutDraft(gridLayout, moduleSettings, activeLayoutOrientation);
                        draft.gridLayout = draft.gridLayouts.portrait;
                        return draft;
                      })}
                      className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
                    />
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-500">
                    Fixed internal grid: {currentGridLayout.columns} x {currentGridLayout.rows} for {GRID_ORIENTATION_PRESETS[activeLayoutOrientation].label.toLowerCase()}.
                    Preview ratio: {activeCanvasResolution.width} x {activeCanvasResolution.height} ({activeCanvasResolution.label}).
                  </div>
                </div>
              </section>

              <div className="grid gap-6 xl:grid-cols-[240px,minmax(0,1fr),360px]">
                <aside className="space-y-4">
                  <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Layers</div>
                        <div className="mt-1 text-sm text-slate-400">{currentGridLayout.modules.length} modules in this layout</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsLayersPanelOpen((current) => !current)}
                        className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition-all hover:border-[#ff8bbf] hover:text-white"
                      >
                        {isLayersPanelOpen ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                    {isLayersPanelOpen && (
                      <div className="mt-4 space-y-2">
                        {(currentGridLayout.modules || []).map((module) => {
                          const moduleMeta = MODULE_TYPES.find((item) => item.id === module.type) || { label: module.type, icon: '•' };
                          return (
                            <div
                              key={module.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedLayoutModuleId(module.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setSelectedLayoutModuleId(module.id);
                                }
                              }}
                              className={`w-full cursor-pointer rounded-2xl border px-3 py-3 text-left transition-all ${
                                selectedLayoutModuleId === module.id
                                  ? 'border-[#ff8bbf] bg-[#ff8bbf]/10'
                                  : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                    <span>{moduleMeta.icon}</span>
                                    <span className="truncate">{moduleMeta.label}</span>
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {module.x}, {module.y} • {module.w} x {module.h}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeGridModule(module.id);
                                  }}
                                  className="text-slate-500 transition-colors hover:text-red-400"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </aside>

                <section className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Occupied</div>
                      <div className="mt-2 text-2xl font-semibold text-white">
                        {currentGridDiagnostics.occupiedCellCount}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">of {currentGridLayout.columns * currentGridLayout.rows} cells</div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Conflicts</div>
                      <div className={`mt-2 text-2xl font-semibold ${currentGridDiagnostics.overlappingCellCount > 0 ? 'text-amber-300' : 'text-white'}`}>
                        {currentGridDiagnostics.overlappingCellCount}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">overlaps are blocked during editing</div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Selected</div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {selectedLayoutModuleMeta?.label || 'Nothing selected'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">Drag the selected module to reposition it.</div>
                    </div>
                  </div>
                  <div className="rounded-[32px] border border-slate-800 bg-slate-900/50 p-4 shadow-2xl shadow-slate-950/30">
                    <MirrorPreview
                      config={config}
                      gridLayout={currentGridLayout}
                      orientation={activeLayoutOrientation}
                      resolution={activeCanvasResolution}
                      selectedModuleId={selectedLayoutModuleId}
                      occupancy={currentGridDiagnostics.occupancy}
                      overlapModuleIds={currentGridDiagnostics.overlapIds}
                      onSelectModule={setSelectedLayoutModuleId}
                      onMoveModule={placeGridModule}
                      onResizeModule={resizeGridModule}
                    />
                  </div>
                </section>

                <aside className="space-y-4">
                  <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Inspector</div>
                        <div className="mt-2 text-lg font-semibold text-white">
                          {selectedLayoutModuleMeta ? `${selectedLayoutModuleMeta.icon} ${selectedLayoutModuleMeta.label}` : 'No module selected'}
                        </div>
                        {selectedLayoutModule && (
                          <div className="mt-1 text-xs text-slate-500">
                            Position ({selectedLayoutModule.x}, {selectedLayoutModule.y}) • Size {selectedLayoutModule.w} x {selectedLayoutModule.h}
                          </div>
                        )}
                      </div>
                      {selectedLayoutModule && (
                        <button
                          type="button"
                          onClick={() => removeGridModule(selectedLayoutModule.id)}
                          className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition-all hover:border-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      )}
                    </div>

                    {selectedLayoutModule && (
                      <div className="mt-6 space-y-5">
                        <div>
                          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Size Presets</div>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(MODULE_SIZE_PRESETS[selectedLayoutModule.type] || {}).map(([presetKey, preset]) => (
                              <button
                                key={`${selectedLayoutModule.id}-${presetKey}`}
                                type="button"
                                onClick={() => applyModuleSizePreset(selectedLayoutModule.id, presetKey)}
                                className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-200 transition-all hover:border-[#ff8bbf] hover:text-white"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { key: 'x', label: 'X', min: 0, max: Math.max(0, currentGridLayout.columns - 1) },
                            { key: 'y', label: 'Y', min: 0, max: Math.max(0, currentGridLayout.rows - 1) },
                            { key: 'w', label: 'Width', min: 1, max: currentGridLayout.columns },
                            { key: 'h', label: 'Height', min: 1, max: currentGridLayout.rows },
                          ].map((field) => (
                            <div key={`${selectedLayoutModule.id}-${field.key}`}>
                              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">{field.label}</label>
                              <input
                                type="number"
                                min={field.min}
                                max={field.max}
                                value={selectedLayoutModule[field.key] ?? field.min}
                                onChange={(event) => updateGridModule(selectedLayoutModule.id, field.key, parseInt(event.target.value || `${field.min}`, 10))}
                                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
                              />
                            </div>
                          ))}
                        </div>

                        <div>
                          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Nudge</div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => moveGridModule(selectedLayoutModule.id, 0, -1)} className="rounded-xl bg-slate-800 p-3 text-slate-100 transition-all hover:bg-slate-700"><ArrowUp size={16} /></button>
                            <button onClick={() => moveGridModule(selectedLayoutModule.id, -1, 0)} className="rounded-xl bg-slate-800 p-3 text-slate-100 transition-all hover:bg-slate-700"><ArrowLeft size={16} /></button>
                            <button onClick={() => moveGridModule(selectedLayoutModule.id, 1, 0)} className="rounded-xl bg-slate-800 p-3 text-slate-100 transition-all hover:bg-slate-700"><ArrowRight size={16} /></button>
                            <button onClick={() => moveGridModule(selectedLayoutModule.id, 0, 1)} className="rounded-xl bg-slate-800 p-3 text-slate-100 transition-all hover:bg-slate-700"><ArrowDown size={16} /></button>
                          </div>
                        </div>

                        {selectedLayoutModule.type !== 'module_rotator' && (
                          <div>
                            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Alignment</label>
                            <select
                              value={selectedLayoutModule.align || 'stretch'}
                              onChange={(event) => updateGridModule(selectedLayoutModule.id, 'align', event.target.value)}
                              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
                            >
                              <option value="stretch">Stretch</option>
                              <option value="start">Top Left</option>
                              <option value="center">Center</option>
                              <option value="end">Bottom Right</option>
                            </select>
                          </div>
                        )}

                        <div>
                          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Module Settings</div>
                          {renderModuleSpecificInspector()}
                        </div>
                      </div>
                    )}

                    {!selectedLayoutModule && (
                      <div className="mt-6 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-5 text-sm text-slate-500">
                        Click a module in the preview or layers list to populate the inspector.
                      </div>
                    )}
                  </section>
                </aside>
              </div>
            </div>
          )}

          {activeTab === 'styling' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-6 text-white">Theme Colors</h2>
                <div className="space-y-4">
                  {[
                    { label: 'Primary', key: 'primaryColor' },
                    { label: 'Secondary', key: 'secondaryColor' },
                    { label: 'Accent', key: 'accentColor' },
                  ].map((color) => (
                    <div key={color.key} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-800">
                      <label className="text-sm font-medium text-slate-300">{color.label}</label>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-500 uppercase">{config.theme[color.key]}</span>
                        <input
                          type="color"
                          value={config.theme[color.key]}
                          onChange={(event) => updateTheme(color.key, event.target.value)}
                          className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-6 text-white">Typography</h2>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mirror Text Size</label>
                      <span className="text-[#ff8bbf] font-bold">{config.theme.fontSizeBase}px</span>
                    </div>
                    <input
                      type="range"
                      min="12"
                      max="32"
                      value={config.theme.fontSizeBase}
                      onChange={(event) => updateTheme('fontSizeBase', parseInt(event.target.value, 10))}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="mt-2 text-xs text-slate-500">
                      This affects the mirror display typography base size. Module-specific typography controls can be investigated in v2.
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Font Family</label>
                    <select
                      value={config.theme.fontFamily}
                      onChange={(event) => updateTheme('fontFamily', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all"
                    >
                      <option value="Roboto">Roboto</option>
                      <option value="Inter">Inter</option>
                      <option value="Open Sans">Open Sans</option>
                      <option value="Montserrat">Montserrat</option>
                    </select>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Mirror Preview</div>
                    <div className="mt-4 space-y-3" style={{ fontFamily: config.theme.fontFamily }}>
                      <div className="text-4xl font-bold text-white" style={{ fontSize: `${config.theme.fontSizeBase * 2.4}px` }}>08:42</div>
                      <div className="text-lg font-semibold text-[#ffb28f]" style={{ fontSize: `${config.theme.fontSizeBase * 1.2}px` }}>Daily Brief</div>
                      <div className="text-slate-300" style={{ fontSize: `${config.theme.fontSizeBase}px` }}>
                        Yamaha by car is about 28 min from home.
                      </div>
                      <div className="text-slate-500" style={{ fontSize: `${Math.max(10, config.theme.fontSizeBase * 0.8)}px` }}>
                        Updated 08:30
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="grid gap-6 xl:grid-cols-[260px,minmax(0,1fr)]">
              <aside className="rounded-[28px] border border-slate-800 bg-slate-900/60 p-5">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">{activeIntegrationMeta.eyebrow}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{activeIntegrationMeta.label}</div>
                  <div className="mt-1 text-sm text-slate-400">{activeIntegrationMeta.description}</div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {INTEGRATION_SECTIONS.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => setActiveIntegrationSection(section.id)}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        activeIntegrationSection === section.id
                          ? 'border-[#ff9ab6]/50 bg-gradient-to-br from-[#ff86d3]/16 via-[#ff8ea8]/10 to-slate-900 text-white'
                          : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:bg-slate-950'
                      }`}
                    >
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">{section.eyebrow}</div>
                      <div className="mt-1 text-sm font-semibold">{section.label}</div>
                      <div className="mt-1 text-xs text-slate-400">{section.description}</div>
                    </button>
                  ))}
                </div>
              </aside>

              <div className="space-y-6">
                {activeIntegrationSection === 'google' && (
                  <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
                    <section className="bg-slate-900/50 border border-slate-800 rounded-[28px] p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <Cloud size={24} className="text-[#ff8bbf]" />
                        <h2 className="text-lg font-semibold text-white">Google Account</h2>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">OAuth Client ID</label>
                          <input
                            type="text"
                            value={googleConfig.clientId}
                            onChange={(event) => updateServiceConfig('google', 'clientId', event.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">OAuth Client Secret</label>
                          <input
                            type="password"
                            placeholder={googleConfig.clientSecretConfigured ? 'Stored securely. Enter to replace.' : 'Paste client secret'}
                            value={googleConfig.clientSecret || ''}
                            onChange={(event) => updateServiceConfig('google', 'clientSecret', event.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Redirect URI</label>
                          <input
                            type="text"
                            value={googleConfig.redirectUri}
                            onChange={(event) => updateServiceConfig('google', 'redirectUri', event.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300 space-y-2">
                          <div className="font-semibold text-white">Connection status</div>
                          <div>{googleStatus?.connected ? `Connected as ${googleStatus.email || 'Google account'}` : 'No Google account connected yet.'}</div>
                          <div className="text-xs text-slate-500">Save the OAuth settings before starting the popup flow.</div>
                        </div>

                        <div className="flex gap-3">
                          <button onClick={connectGoogle} className="flex-1 rounded-xl bg-gradient-to-r from-[#ff86d3] via-[#ff8ea8] to-[#ffb28f] px-4 py-3 font-semibold text-slate-950 transition-all hover:brightness-105">
                            Connect Google
                          </button>
                          <button onClick={disconnectGoogle} className="rounded-xl bg-slate-800 px-4 py-3 font-semibold text-white transition-all hover:bg-slate-700">
                            Disconnect
                          </button>
                        </div>
                      </div>
                    </section>

                    <section className="bg-slate-900/50 border border-slate-800 rounded-[28px] p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <Layout size={24} className="text-[#ff8bbf]" />
                        <h2 className="text-lg font-semibold text-white">Calendar Sync</h2>
                      </div>

                      {googleCalendars.length === 0 ? (
                        <div className="text-sm text-slate-400">Connect Google first to fetch calendars.</div>
                      ) : (
                        <div className="space-y-3">
                          {googleCalendars.map((calendar) => (
                            <div key={calendar.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                              <div className="flex flex-1 items-center gap-3">
                                <div
                                  className="h-10 w-3 rounded-full"
                                  style={{ backgroundColor: calendarModuleConfig.calendarColors?.[calendar.id] || calendar.backgroundColor || '#f472b6' }}
                                />
                                <div className="flex-1">
                                  <div className="font-medium text-white">{calendar.summary}</div>
                                  <div className="text-xs text-slate-500">{calendar.primary ? 'Primary calendar' : calendar.accessRole}</div>
                                </div>
                              </div>
                              <input
                                type="color"
                                value={calendarModuleConfig.calendarColors?.[calendar.id] || calendar.backgroundColor || '#f472b6'}
                                onChange={(event) => updateModuleConfig('calendar', 'calendarColors', {
                                  ...(calendarModuleConfig.calendarColors || {}),
                                  [calendar.id]: event.target.value,
                                })}
                                className="h-10 w-10 cursor-pointer rounded-lg border-none bg-transparent"
                              />
                              <input
                                type="checkbox"
                                checked={selectedCalendarIds.includes(calendar.id)}
                                onChange={(event) => {
                                  if (event.target.checked) {
                                    setSelectedCalendarIds((current) => Array.from(new Set([...current, calendar.id])));
                                  } else {
                                    setSelectedCalendarIds((current) => current.filter((id) => id !== calendar.id));
                                  }
                                }}
                              />
                            </div>
                          ))}
                          <button onClick={saveCalendarSelection} disabled={calendarSaving} className="w-full rounded-xl bg-gradient-to-r from-[#ff86d3] via-[#ff8ea8] to-[#ffb28f] px-4 py-3 font-semibold text-slate-950 transition-all hover:brightness-105 disabled:opacity-70">
                            {calendarSaving ? 'Saving...' : 'Save Calendar Selection'}
                          </button>
                        </div>
                      )}
                    </section>
                  </div>
                )}

                {activeIntegrationSection === 'calendar_sources' && (
                  <div className="space-y-6">
                    <section className="bg-slate-900/50 border border-slate-800 rounded-[28px] p-6">
                      <div className="flex items-center justify-between gap-4 mb-6">
                        <div>
                          <h2 className="text-lg font-semibold text-white">Additional Calendar Sources</h2>
                          <div className="text-sm text-slate-500">Add ICS subscription feeds and CalDAV accounts. All synced calendars flow into the same mirror and Daily Brief pipeline.</div>
                        </div>
                        <div className="flex gap-3">
                          <button onClick={() => addCalendarSource('ics')} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700">
                            Add ICS
                          </button>
                          <button onClick={() => addCalendarSource('caldav')} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700">
                            Add CalDAV
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {calendarSources.length === 0 && (
                          <div className="rounded-xl border border-dashed border-slate-800 p-6 text-sm text-slate-500">
                            No additional sources configured yet.
                          </div>
                        )}

                        {calendarSources.map((source, index) => (
                          <div key={source.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <div className="text-white font-semibold">{source.type === 'caldav' ? 'CalDAV account' : 'ICS feed'} #{index + 1}</div>
                                <div className="text-xs text-slate-500">Credentials are stored securely on the mirror.</div>
                              </div>
                              <button onClick={() => removeCalendarSource(source.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                                <Trash2 size={18} />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Name</label>
                                <input
                                  type="text"
                                  value={source.name || ''}
                                  onChange={(event) => updateCalendarSource(source.id, { name: event.target.value })}
                                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                />
                              </div>
                              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                                <div>
                                  <div className="text-sm font-semibold text-white">Enabled</div>
                                  <div className="text-xs text-slate-500">Include this source in sync and Daily Brief processing.</div>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={source.enabled !== false}
                                  onChange={(event) => updateCalendarSource(source.id, { enabled: event.target.checked })}
                                />
                              </label>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">URL</label>
                              <input
                                type="text"
                                value={source.url || ''}
                                onChange={(event) => updateCalendarSource(source.id, { url: event.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                placeholder={source.type === 'caldav' ? 'https://calendar.example.com/dav/' : 'https://example.com/calendar.ics'}
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Username</label>
                                <input
                                  type="text"
                                  value={source.username || ''}
                                  onChange={(event) => updateCalendarSource(source.id, { username: event.target.value })}
                                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
                                <input
                                  type="password"
                                  value={source.password || ''}
                                  placeholder={source.passwordConfigured ? 'Stored securely. Enter to replace.' : 'Optional'}
                                  onChange={(event) => updateCalendarSource(source.id, { password: event.target.value })}
                                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Color</label>
                                <input
                                  type="color"
                                  value={source.color || '#f472b6'}
                                  onChange={(event) => updateCalendarSource(source.id, { color: event.target.value })}
                                  className="h-12 w-full rounded-xl border border-slate-700 bg-slate-800 p-2"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button onClick={saveCalendarSources} className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#ff86d3] via-[#ff8ea8] to-[#ffb28f] px-4 py-3 font-semibold text-slate-950 transition-all hover:brightness-105">
                        Save Calendar Sources
                      </button>
                    </section>

                    <section className="bg-slate-900/50 border border-slate-800 rounded-[28px] p-6">
                      <h2 className="text-lg font-semibold text-white mb-4">Synced Calendars</h2>
                      <div className="grid gap-3">
                        {availableCalendars.length === 0 && (
                          <div className="text-sm text-slate-500">No calendars synced yet.</div>
                        )}
                        {availableCalendars.map((calendar) => (
                          <div key={`available-${calendar.id}`} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                            <div className="h-10 w-3 rounded-full" style={{ backgroundColor: calendar.backgroundColor || '#f472b6' }} />
                            <div className="min-w-0">
                              <div className="font-medium text-white truncate">{calendar.summary}</div>
                              <div className="text-xs text-slate-500">{calendar.sourceType || calendar.accessRole || 'calendar source'}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                )}

                {activeIntegrationSection === 'weather' && (
                  <section className="bg-slate-900/50 border border-slate-800 rounded-[28px] p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <Cloud size={24} className="text-sky-400" />
                      <h2 className="text-lg font-semibold text-white">Weather Integration</h2>
                    </div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Display Name</label>
                          <input
                            type="text"
                            value={weatherConfig.displayName || ''}
                            onChange={(event) => updateModuleConfig('weather', 'displayName', event.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">City</label>
                          <input
                            type="text"
                            value={weatherConfig.city || ''}
                            onChange={(event) => updateModuleConfig('weather', 'city', event.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Postal Code</label>
                          <input
                            type="text"
                            value={weatherConfig.postalCode || ''}
                            onChange={(event) => updateModuleConfig('weather', 'postalCode', event.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Country</label>
                          <input
                            type="text"
                            value={weatherConfig.country || ''}
                            onChange={(event) => updateModuleConfig('weather', 'country', event.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Service Provider</label>
                        <select
                          value={weatherConfig.provider || 'open-meteo'}
                          onChange={(event) => updateModuleConfig('weather', 'provider', event.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                        >
                          <option value="open-meteo">Open-Meteo</option>
                          <option value="openweathermap">OpenWeatherMap</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Refresh Interval</label>
                        <input
                          type="number"
                          min="10"
                          max="180"
                          value={weatherConfig.refreshMinutes || 30}
                          onChange={(event) => updateModuleConfig('weather', 'refreshMinutes', parseInt(event.target.value || '30', 10))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                        />
                        <div className="mt-2 text-xs text-slate-500">
                          Weather refresh uses a single request for current conditions, short-term changes, and daily forecast. `30` minutes is a good default for free providers.
                        </div>
                      </div>

                      {weatherConfig.provider === 'openweathermap' ? (
                        <>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">API Key</label>
                            <input
                              type="password"
                              value={weatherConfig.apiKey || ''}
                              onChange={(event) => updateModuleConfig('weather', 'apiKey', event.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Provider Query</label>
                            <input
                              type="text"
                              value={weatherConfig.location || ''}
                              onChange={(event) => updateModuleConfig('weather', 'location', event.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Latitude</label>
                            <input
                              type="number"
                              step="0.01"
                              value={weatherConfig.lat || 52.52}
                              onChange={(event) => updateModuleConfig('weather', 'lat', parseFloat(event.target.value))}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Longitude</label>
                            <input
                              type="number"
                              step="0.01"
                              value={weatherConfig.lon || 13.41}
                              onChange={(event) => updateModuleConfig('weather', 'lon', parseFloat(event.target.value))}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            />
                          </div>
                        </div>
                      )}
                      <div className="text-xs text-slate-500">
                        For Open-Meteo you can either provide exact latitude/longitude or just fill city, postal code, and country and let the display geocode the place.
                      </div>
                    </div>
                  </section>
                )}

                {activeIntegrationSection === 'llm' && (
                  <section className="bg-slate-900/50 border border-slate-800 rounded-[28px] p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <Settings size={24} className="text-emerald-400" />
                      <h2 className="text-lg font-semibold text-white">LLM Context</h2>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-white">Daily Brief Context Engine</div>
                            <div className="mt-1 text-xs text-slate-500">These settings control what the Daily Brief is allowed to look at, how aggressively it refreshes, and how shorthand calendar titles can be expanded into useful household context.</div>
                          </div>
                          <button
                            onClick={forceContextRefresh}
                            disabled={dailyBriefDebugLoading}
                            className="rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-slate-700 disabled:opacity-60"
                          >
                            {dailyBriefDebugLoading ? 'Refreshing...' : 'Force Context Refresh'}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Context Refresh (Minutes)</label>
                            <input
                              type="number"
                              min="1"
                              max="720"
                              value={contextConfig.refreshMinutes || 180}
                              onChange={(event) => updateServiceConfig('context', 'refreshMinutes', parseInt(event.target.value || '180', 10))}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            />
                            <div className="mt-2 text-xs text-slate-500">How often, in minutes, the backend refreshes the Daily Brief context and LLM analysis. Lower values feel fresher but can cause more calendar syncs, API calls, and token usage.</div>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Trip Lookahead</label>
                            <input
                              type="number"
                              min="3"
                              max="30"
                              value={contextConfig.tripLookaheadDays}
                              onChange={(event) => updateServiceConfig('context', 'tripLookaheadDays', parseInt(event.target.value || '14', 10))}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            />
                            <div className="mt-2 text-xs text-slate-500">How far ahead Mirrorial should search for travel-related events and trip preparation signals.</div>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Birthday Reminder Window</label>
                            <input
                              type="number"
                              min="1"
                              max="21"
                              value={contextConfig.birthdayLookaheadDays || 10}
                              onChange={(event) => updateServiceConfig('context', 'birthdayLookaheadDays', parseInt(event.target.value || '10', 10))}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            />
                            <div className="mt-2 text-xs text-slate-500">How many days in advance birthdays should start appearing in the Daily Brief.</div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
                          <div>
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Daily Brief Calendar Sources</div>
                            <div className="mt-2 text-sm text-slate-400">Choose whether the brief uses all synced calendars, only specific ones, or all except noisy sources like sports and holidays.</div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            {DAILY_BRIEF_CALENDAR_MODES.map((mode) => (
                              <button
                                key={mode.id}
                                onClick={() => updateConfig((draft) => {
                                  draft.services.context.briefCalendarMode = mode.id;
                                  return draft;
                                })}
                                className={`rounded-2xl border p-4 text-left transition-all ${
                                  dailyBriefCalendarMode === mode.id
                                    ? 'border-[#ff9ab6]/50 bg-gradient-to-br from-[#ff86d3]/16 via-[#ff8ea8]/10 to-slate-900 text-white'
                                    : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                                }`}
                              >
                                <div className="text-sm font-semibold">{mode.label}</div>
                                <div className="mt-1 text-xs text-slate-400">{mode.description}</div>
                              </button>
                            ))}
                          </div>

                          {dailyBriefCalendarMode !== 'all_selected' && (
                            availableCalendars.length === 0 ? (
                              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
                                Connect Google, ICS, or CalDAV sources to choose which calendars may create Daily Brief cards.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                  {dailyBriefCalendarMode === 'include_selected' ? 'Calendars Allowed In Daily Brief' : 'Calendars Excluded From Daily Brief'}
                                </div>
                                {availableCalendars.map((calendar) => {
                                  const checked = dailyBriefScopedCalendarIds.includes(calendar.id);
                                  const actionLabel = dailyBriefCalendarMode === 'include_selected' ? 'Allow' : 'Exclude';
                                  return (
                                    <label key={`brief-scope-${calendar.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div
                                          className="h-10 w-3 rounded-full shrink-0"
                                          style={{ backgroundColor: calendarModuleConfig.calendarColors?.[calendar.id] || calendar.backgroundColor || '#f472b6' }}
                                        />
                                        <div className="min-w-0">
                                          <div className="font-medium text-white truncate">{calendar.summary}</div>
                                          <div className="text-xs text-slate-500">{actionLabel} cards from this calendar</div>
                                        </div>
                                      </div>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(event) => toggleDailyBriefScopedCalendar(calendar.id, event.target.checked)}
                                      />
                                    </label>
                                  );
                                })}
                              </div>
                            )
                          )}
                        </div>

                        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
                          <div>
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Daily Brief Signal Types</div>
                            <div className="mt-2 text-sm text-slate-400">Turn whole categories on or off so the mirror only shows the types of information your household actually wants.</div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {DAILY_BRIEF_SIGNAL_OPTIONS.map((signal) => (
                              <label key={signal.key} className="flex items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                                <div>
                                  <div className="font-medium text-white">{signal.label}</div>
                                  <div className="text-xs text-slate-500 mt-1">{signal.description}</div>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={dailyBriefSignals[signal.key] !== false}
                                  onChange={(event) => updateConfig((draft) => {
                                    draft.services.context.signals = draft.services.context.signals || {};
                                    draft.services.context.signals[signal.key] = event.target.checked;
                                    return draft;
                                  })}
                                />
                              </label>
                            ))}
                          </div>
                          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                            <div>
                              <div className="font-medium text-white">Hide routine recurring events</div>
                              <div className="text-xs text-slate-500 mt-1">Suppress regular lessons, generic weekly repeats, and other low-value recurring entries from the brief.</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={contextConfig.suppressRoutineRecurringEvents !== false}
                              onChange={(event) => updateServiceConfig('context', 'suppressRoutineRecurringEvents', event.target.checked)}
                            />
                          </label>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Useful Location Whitelist</label>
                          <textarea
                            rows={3}
                            value={(contextConfig.usefulLocationWhitelist || []).join('\n')}
                            onChange={(event) => updateServiceConfig(
                              'context',
                              'usefulLocationWhitelist',
                              event.target.value
                                .split('\n')
                                .map((entry) => entry.trim())
                                .filter(Boolean),
                            )}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            placeholder={'Hospital\nSchool\nArena'}
                          />
                          <div className="text-xs text-slate-500 mt-2">
                            Optional. One entry per line. Use this to allow genuinely useful place types or venue names even when calendar items contain street-address style destinations.
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Event Hint Rules</div>
                              <div className="mt-2 text-sm text-slate-400">
                                Teach Mirrorial what short calendar titles really mean. If somebody only writes keywords like <span className="text-white font-medium">Tysabri</span> or <span className="text-white font-medium">Physio</span>, add the missing context here once and the Daily Brief can reuse it every time that keyword appears.
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={addEventHintRule}
                              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition-all hover:border-[#ff8bbf] hover:bg-slate-700"
                            >
                              Add Event Hint
                            </button>
                          </div>

                          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
                            <div className="flex items-start gap-3">
                              <Info size={16} className="mt-0.5 shrink-0 text-sky-400" />
                              <div className="space-y-2">
                                <div>Keyword matching is case-insensitive and checks the event title. A rule with the keyword <span className="text-white font-medium">tysabri</span> will also match <span className="text-white font-medium">Tysabri</span> or <span className="text-white font-medium">TYSABRI Behandlung</span>.</div>
                                <div>Structured fields work best. If you add a destination address, early-arrival buffer, and route origin, Mirrorial can calculate leave-time advice instead of only paraphrasing your notes.</div>
                                <div>Public transport leave-time guidance needs Google Routes in the Travel integration. Car, bike, and walk can still work with the normal routing setup.</div>
                              </div>
                            </div>
                          </div>

                          {eventHintRules.length === 0 && (
                            <div className="rounded-xl border border-dashed border-slate-800 p-6 text-sm text-slate-500">
                              No event hint rules yet. Add one for shorthand titles like medical treatments, physio, pickups, or vague meeting names that should trigger extra Daily Brief guidance.
                            </div>
                          )}

                          <div className="space-y-4">
                            {eventHintRules.map((rule, index) => (
                              <div key={rule.id || `event-hint-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                  <div>
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Hint Rule {index + 1}</div>
                                    <div className="mt-1 text-sm font-semibold text-white">{rule.label || (rule.keywords || []).join(', ') || 'Untitled event hint'}</div>
                                    <div className="mt-1 text-xs text-slate-500">These details are private household knowledge and are only used to enrich Daily Brief output.</div>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                                      <span>Enabled</span>
                                      <input
                                        type="checkbox"
                                        checked={rule.enabled !== false}
                                        onChange={(event) => updateEventHintRule(rule.id, { enabled: event.target.checked })}
                                      />
                                    </label>
                                    <button type="button" onClick={() => removeEventHintRule(rule.id)} className="text-slate-500 transition-colors hover:text-red-400">
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                  <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Rule Label</label>
                                    <input
                                      type="text"
                                      placeholder="Tysabri infusion"
                                      value={rule.label || ''}
                                      onChange={(event) => updateEventHintRule(rule.id, { label: event.target.value })}
                                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                    />
                                    <div className="mt-2 text-xs text-slate-500">Optional internal name for this rule. It helps you recognize the rule in the config and debug output.</div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Keywords</label>
                                    <input
                                      type="text"
                                      placeholder="Tysabri, Physio"
                                      value={(rule.keywords || []).join(', ')}
                                      onChange={(event) => updateEventHintRule(rule.id, {
                                        keywords: event.target.value
                                          .split(/[\n,]/g)
                                          .map((entry) => entry.trim())
                                          .filter(Boolean),
                                      })}
                                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                    />
                                    <div className="mt-2 text-xs text-slate-500">Important field. Add one or more title keywords, separated by commas. Matching ignores upper/lowercase.</div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                  <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Category</label>
                                    <select
                                      value={rule.category || 'generic'}
                                      onChange={(event) => updateEventHintRule(rule.id, { category: event.target.value })}
                                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                    >
                                      {EVENT_HINT_CATEGORY_OPTIONS.map((option) => (
                                        <option key={option.id} value={option.id}>{option.label}</option>
                                      ))}
                                    </select>
                                    <div className="mt-2 text-xs text-slate-500">{(EVENT_HINT_CATEGORY_OPTIONS.find((option) => option.id === (rule.category || 'generic')) || EVENT_HINT_CATEGORY_OPTIONS[0]).description}</div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Person / Nickname</label>
                                    <input
                                      type="text"
                                      placeholder="Becky"
                                      value={rule.personLabel || ''}
                                      onChange={(event) => updateEventHintRule(rule.id, { personLabel: event.target.value })}
                                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                    />
                                    <div className="mt-2 text-xs text-slate-500">Optional. Helps the Daily Brief mention who this event normally belongs to.</div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Arrive Early (Minutes)</label>
                                    <input
                                      type="number"
                                      min="0"
                                      max="480"
                                      value={rule.arriveEarlyMinutes || 0}
                                      onChange={(event) => updateEventHintRule(rule.id, { arriveEarlyMinutes: parseInt(event.target.value || '0', 10) })}
                                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                    />
                                    <div className="mt-2 text-xs text-slate-500">Optional buffer before the event starts. Useful for check-in, paperwork, parking, or preparation time.</div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                  <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Known Destination Label</label>
                                    <input
                                      type="text"
                                      placeholder="Israelitisches Krankenhaus Hamburg"
                                      value={rule.locationLabel || ''}
                                      onChange={(event) => updateEventHintRule(rule.id, { locationLabel: event.target.value })}
                                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                    />
                                    <div className="mt-2 text-xs text-slate-500">Optional human-friendly place name. This is what the brief can mention instead of the raw event title.</div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Route Mode</label>
                                    <select
                                      value={rule.transportMode || 'car'}
                                      onChange={(event) => updateEventHintRule(rule.id, { transportMode: event.target.value })}
                                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                    >
                                      {EVENT_HINT_ROUTE_MODE_OPTIONS.map((option) => (
                                        <option key={option.id} value={option.id}>
                                          {option.id === 'public_transport' && travelConfig.googleRoutesEnabled !== true
                                            ? `${option.label} (needs Google Routes)`
                                            : option.label}
                                        </option>
                                      ))}
                                    </select>
                                    <div className="mt-2 text-xs text-slate-500">Used when Mirrorial tries to calculate a leave time from the route origin to the destination address below.</div>
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Known Destination Address</label>
                                  <textarea
                                    rows={3}
                                    placeholder="Orthopaedische Ambulanz, Example Street 1, Hamburg"
                                    value={rule.locationAddress || ''}
                                    onChange={(event) => updateEventHintRule(rule.id, { locationAddress: event.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                  />
                                  <div className="mt-2 text-xs text-slate-500">Highly recommended for leave-time guidance. If this is filled and the route origin is known, Mirrorial can estimate when to leave.</div>
                                </div>

                                <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Additional Helpful Details</label>
                                  <textarea
                                    rows={4}
                                    placeholder="Wife, regular infusion treatment, needs to bring insurance card, usually checks in at reception."
                                    value={rule.additionalInfo || ''}
                                    onChange={(event) => updateEventHintRule(rule.id, { additionalInfo: event.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                  />
                                  <div className="mt-2 text-xs text-slate-500">Add facts a human in the household already knows. Good examples: purpose, clinic name, building, documents to bring, usual preparation steps, or a more meaningful description of the event.</div>
                                </div>

                                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">
                                  <div>
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Route Origin For Leave-Time Advice</div>
                                    <div className="mt-2 text-sm text-slate-400">Optional. Choose where the journey usually starts. Home is enough for many cases, but you can also use a saved place, a member's school/work place, or a custom start address.</div>
                                  </div>

                                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Route Origin</label>
                                      <select
                                        value={rule.originType || 'home'}
                                        onChange={(event) => updateEventHintRule(rule.id, {
                                          originType: event.target.value,
                                          originReferenceId: '',
                                          originLabel: '',
                                          originAddress: '',
                                        })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                      >
                                        {EVENT_HINT_ORIGIN_OPTIONS.map((option) => (
                                          <option key={option.id} value={option.id}>{option.label}</option>
                                        ))}
                                      </select>
                                    </div>

                                    {(rule.originType === 'member_work' || rule.originType === 'member_school') && (
                                      <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Household Member</label>
                                        <select
                                          value={rule.originReferenceId || ''}
                                          onChange={(event) => updateEventHintRule(rule.id, { originReferenceId: event.target.value })}
                                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                        >
                                          <option value="">Select member</option>
                                          {household.members.map((member) => (
                                            <option key={member.id} value={member.id}>{member.nickname || member.name || member.id}</option>
                                          ))}
                                        </select>
                                      </div>
                                    )}

                                    {rule.originType === 'saved_place' && (
                                      <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Saved Place</label>
                                        <select
                                          value={rule.originReferenceId || ''}
                                          onChange={(event) => updateEventHintRule(rule.id, { originReferenceId: event.target.value })}
                                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                        >
                                          <option value="">Select saved place</option>
                                          {(household.savedPlaces || []).map((place) => (
                                            <option key={place.id} value={place.id}>{place.name || place.address || place.id}</option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                  </div>

                                  {rule.originType === 'custom' && (
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                      <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Custom Origin Label</label>
                                        <input
                                          type="text"
                                          placeholder="Eppendorfer Marktplatz"
                                          value={rule.originLabel || ''}
                                          onChange={(event) => updateEventHintRule(rule.id, { originLabel: event.target.value })}
                                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Custom Origin Address</label>
                                        <input
                                          type="text"
                                          placeholder="Eppendorfer Marktplatz, Hamburg"
                                          value={rule.originAddress || ''}
                                          onChange={(event) => updateEventHintRule(rule.id, { originAddress: event.target.value })}
                                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  <div className="text-xs text-slate-500">
                                    Best results: fill <span className="text-white font-medium">Home Base</span> on the Household page, add the destination address above, and choose the usual route origin here.
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-800/30 p-3">
                        <div>
                          <div className="text-sm font-semibold text-white">Enable LLM Analysis</div>
                          <div className="text-[10px] font-bold uppercase text-slate-500">Deterministic context stays active regardless</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={llmConfig.enabled}
                          onChange={(event) => updateServiceConfig('llm', 'enabled', event.target.checked)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Provider</label>
                        <select
                          value={llmConfig.provider}
                          onChange={(event) => updateServiceConfig('llm', 'provider', event.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                        >
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic</option>
                          <option value="google">Google</option>
                          <option value="custom">Custom / local</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Model</label>
                        <input
                          type="text"
                          value={llmConfig.model}
                          onChange={(event) => updateServiceConfig('llm', 'model', event.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Base URL</label>
                        <input
                          type="url"
                          name="llm-base-url"
                          autoComplete="section-llm url"
                          autoCorrect="off"
                          autoCapitalize="none"
                          inputMode="url"
                          spellCheck={false}
                          data-lpignore="true"
                          data-1p-ignore="true"
                          placeholder="Optional. Required for custom/local providers."
                          value={llmConfig.baseUrl || ''}
                          onChange={(event) => updateServiceConfig('llm', 'baseUrl', event.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">API Key</label>
                        <input
                          type="password"
                          name="llm-api-key"
                          autoComplete="section-llm new-password"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          data-lpignore="true"
                          data-1p-ignore="true"
                          placeholder={llmConfig.apiKeyConfigured ? 'Stored securely. Enter to replace.' : 'Paste API key'}
                          value={llmConfig.apiKey || ''}
                          onChange={(event) => updateServiceConfig('llm', 'apiKey', event.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Privacy Mode</label>
                        <select
                          value={llmConfig.privacyMode}
                          onChange={(event) => updateServiceConfig('llm', 'privacyMode', event.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                        >
                          <option value="off">Off</option>
                          <option value="local-only">Local only</option>
                          <option value="cloud-redacted">Cloud redacted</option>
                          <option value="full">Full context</option>
                        </select>
                      </div>
                    </div>
                  </section>
                )}

                {activeIntegrationSection === 'travel' && (
                  <section className="bg-slate-900/50 border border-slate-800 rounded-[28px] p-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-800/30 p-3">
                        <div>
                          <div className="text-sm font-semibold text-white">Enable Travel integration</div>
                          <div className="text-[10px] font-bold uppercase text-slate-500">Flights, route estimates, and travel anchors for Daily Brief and Travel Time cards</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={travelConfig.enabled !== false}
                          onChange={(event) => updateServiceConfig('travel', 'enabled', event.target.checked)}
                        />
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
                          <div>
                            <div className="text-sm font-semibold text-white">Flight and station enrichment</div>
                            <div className="text-xs text-slate-500 mt-1">Used for trips, returns, and station-aware travel summaries.</div>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Flight provider</label>
                            <select
                              value={travelConfig.transportProvider || 'none'}
                              onChange={(event) => updateServiceConfig('travel', 'transportProvider', event.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            >
                              <option value="none">None</option>
                              <option value="aviationstack">Aviationstack</option>
                              <option value="aviationapi">AviationAPI</option>
                              <option value="custom">Custom</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Transport API Key</label>
                            <input
                              type="password"
                              placeholder={travelConfig.transportApiKeyConfigured ? 'Stored securely. Enter to replace.' : 'Paste provider API key'}
                              value={travelConfig.transportApiKey || ''}
                              onChange={(event) => updateServiceConfig('travel', 'transportApiKey', event.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Home Airport</label>
                              <input
                                type="text"
                                value={travelConfig.homeAirport || ''}
                                onChange={(event) => updateServiceConfig('travel', 'homeAirport', event.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Closest Train Station</label>
                              <input
                                type="text"
                                value={travelConfig.closestTrainStation || ''}
                                onChange={(event) => updateServiceConfig('travel', 'closestTrainStation', event.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Closest Bus Station</label>
                              <input
                                type="text"
                                value={travelConfig.closestBusStation || ''}
                                onChange={(event) => updateServiceConfig('travel', 'closestBusStation', event.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Closest Tube Station</label>
                              <input
                                type="text"
                                value={travelConfig.closestTubeStation || ''}
                                onChange={(event) => updateServiceConfig('travel', 'closestTubeStation', event.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
                          <div>
                            <div className="text-sm font-semibold text-white">Routing and traffic</div>
                            <div className="text-xs text-slate-500 mt-1">Used by commute context and Travel Time route cards.</div>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Base Routing Provider</label>
                            <select
                              value={travelConfig.routingProvider || 'none'}
                              onChange={(event) => updateServiceConfig('travel', 'routingProvider', event.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            >
                              <option value="none">None</option>
                              <option value="openrouteservice">OpenRouteService</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">OpenRouteService Base URL</label>
                            <input
                              type="text"
                              name="travel-routing-base-url"
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="none"
                              spellCheck={false}
                              placeholder="Optional. Leave empty for OpenRouteService cloud."
                              value={travelConfig.routingBaseUrl || ''}
                              onChange={(event) => updateServiceConfig('travel', 'routingBaseUrl', event.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            />
                            <div className="mt-2 text-xs text-slate-500">
                              For OpenRouteService, leave this empty unless you run your own proxy or an alternate API endpoint. The default is `https://api.openrouteservice.org`.
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">OpenRouteService API Key</label>
                            <input
                              type="password"
                              placeholder={travelConfig.routingApiKeyConfigured ? 'Stored securely. Enter to replace.' : 'Paste provider API key'}
                              value={travelConfig.routingApiKey || ''}
                              onChange={(event) => updateServiceConfig('travel', 'routingApiKey', event.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            />
                          </div>
                          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                            <div>
                              <div className="text-sm font-semibold text-white">Enable Google Routes</div>
                              <div className="text-xs text-slate-500">Use Google Routes for traffic-aware driving and real public transport routes.</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={travelConfig.googleRoutesEnabled === true}
                              onChange={(event) => updateServiceConfig('travel', 'googleRoutesEnabled', event.target.checked)}
                            />
                          </label>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Google Routes API Key</label>
                            <input
                              type="password"
                              placeholder={travelConfig.googleRoutesApiKeyConfigured ? 'Stored securely. Enter to replace.' : 'Paste Google Maps API key'}
                              value={travelConfig.googleRoutesApiKey || ''}
                              onChange={(event) => updateServiceConfig('travel', 'googleRoutesApiKey', event.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            />
                          </div>
                          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                            <div>
                              <div className="text-sm font-semibold text-white">Use Google Routes for all modes</div>
                              <div className="text-xs text-slate-500">When off, Google handles car and public transport only. Bike and walk stay on the base routing provider.</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={travelConfig.googleRoutesForAllModes === true}
                              onChange={(event) => updateServiceConfig('travel', 'googleRoutesForAllModes', event.target.checked)}
                            />
                          </label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Default Car Profile</label>
                              <select
                                value={travelConfig.routingProfile || 'driving-car'}
                                onChange={(event) => updateServiceConfig('travel', 'routingProfile', event.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                              >
                                <option value="driving-car">Driving</option>
                                <option value="cycling-regular">Cycling</option>
                                <option value="foot-walking">Walking</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Refresh Minutes</label>
                              <input
                                type="number"
                                min="5"
                                max="120"
                                value={travelConfig.refreshMinutes || 30}
                                onChange={(event) => updateServiceConfig('travel', 'refreshMinutes', parseInt(event.target.value || '30', 10))}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                              />
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
                            With Google Routes enabled, Mirrorial uses Google for car and public transport and can use live traffic for driving. OpenRouteService remains the base provider for bike and walk unless you enable the all-modes toggle.
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-white">Travel Time route cards</div>
                            <div className="text-xs text-slate-500 mt-1">These routes are shared by every Travel Time module, including Travel Time cards inside the auto-rotating module.</div>
                          </div>
                          <button
                            type="button"
                            onClick={addTravelRouteItem}
                            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition-all hover:border-[#ff8bbf] hover:bg-slate-700"
                          >
                            Add Travel Route
                          </button>
                        </div>

                        {(travelTimeModuleConfig.items || []).length === 0 && (
                          <div className="rounded-xl border border-dashed border-slate-800 p-6 text-sm text-slate-500">
                            No travel routes configured yet. Add route cards here, then place a Travel Time module anywhere in the layout or inside an auto-rotating module.
                          </div>
                        )}

                        {travelConfig.googleRoutesEnabled !== true && travelConfig.routingProvider === 'openrouteservice' && (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                            OpenRouteService is currently suitable for car, bike, and walk estimates here. It does not provide a real public-transport route for Mirrorial, and the current integration does not use live traffic data.
                          </div>
                        )}

                        <div className="space-y-3">
                          {(travelTimeModuleConfig.items || []).map((item, index) => (
                            <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Route {index + 1}</div>
                                  <div className="mt-1 text-sm font-semibold text-white">{item.label || item.destinationLabel || 'Untitled route'}</div>
                                </div>
                                <button onClick={() => removeTravelRouteItem(item.id)} className="text-slate-500 transition-colors hover:text-red-400">
                                  <Trash2 size={16} />
                                </button>
                              </div>
                              <div className="grid grid-cols-1 gap-3">
                                <input
                                  type="text"
                                  placeholder="Card label"
                                  value={item.label || ''}
                                  onChange={(event) => updateTravelRouteItem(item.id, { label: event.target.value })}
                                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
                                />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <select
                                    value={item.originType || 'home'}
                                    onChange={(event) => updateTravelRouteItem(item.id, { originType: event.target.value })}
                                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
                                  >
                                    <option value="home">Home</option>
                                    <option value="custom">Custom origin</option>
                                    <option value="home_airport">Home airport</option>
                                    <option value="closest_train_station">Closest train station</option>
                                    <option value="closest_bus_station">Closest bus station</option>
                                    <option value="closest_tube_station">Closest tube station</option>
                                  </select>
                                  <select
                                    value={item.mode || 'car'}
                                    onChange={(event) => updateTravelRouteItem(item.id, { mode: event.target.value })}
                                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
                                  >
                                    <option value="car">Car</option>
                                    <option value="bike">Bike</option>
                                    <option value="walk">Walk</option>
                                    <option value="public_transport">
                                      {travelConfig.googleRoutesEnabled !== true
                                        ? 'Public transport (needs Google Routes)'
                                        : 'Public transport'}
                                    </option>
                                  </select>
                                </div>
                                {item.originType === 'custom' && (
                                  <input
                                    type="text"
                                    placeholder="Custom origin address"
                                    value={item.originAddress || ''}
                                    onChange={(event) => updateTravelRouteItem(item.id, { originAddress: event.target.value, originLabel: event.target.value })}
                                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
                                  />
                                )}
                                <input
                                  type="text"
                                  placeholder="Destination label"
                                  value={item.destinationLabel || ''}
                                  onChange={(event) => updateTravelRouteItem(item.id, { destinationLabel: event.target.value })}
                                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
                                />
                                <input
                                  type="text"
                                  placeholder="Destination address"
                                  value={item.destinationAddress || ''}
                                  onChange={(event) => updateTravelRouteItem(item.id, { destinationAddress: event.target.value, destinationType: 'custom' })}
                                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#ff8bbf]"
                                />
                                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                                  <div>
                                    <div className="text-sm font-semibold text-white">Enabled</div>
                                    <div className="text-xs text-slate-500">Show this route card on the mirror.</div>
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={item.enabled !== false}
                                    onChange={(event) => updateTravelRouteItem(item.id, { enabled: event.target.checked })}
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-white">Travel Time debug</div>
                            <div className="text-xs text-slate-500 mt-1">Run the same route calculation the mirror uses and inspect what the backend resolved for each origin and destination.</div>
                          </div>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={refreshTravelTimeDebug}
                              disabled={travelTimeDebugLoading}
                              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-slate-700 disabled:opacity-60"
                            >
                              Refresh Debug
                            </button>
                            <button
                              type="button"
                              onClick={runTravelTimeDebug}
                              disabled={travelTimeDebugLoading}
                              className="rounded-xl bg-gradient-to-r from-[#ff86d3] via-[#ff8ea8] to-[#ffb28f] px-4 py-3 text-sm font-semibold text-slate-950 transition-all hover:brightness-105 disabled:opacity-60"
                            >
                              {travelTimeDebugLoading ? 'Running...' : 'Run Travel Debug'}
                            </button>
                          </div>
                        </div>

                        {travelTimeDebug?.updatedAt && (
                          <div className="text-xs text-slate-500">
                            Last run: {new Date(travelTimeDebug.updatedAt).toLocaleString()}
                          </div>
                        )}

                        {travelTimeDebug?.config && (
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Base Provider</div>
                              <div className="mt-1 text-sm font-semibold text-white">{travelTimeDebug.config.routingProvider || 'none'}</div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Routing Base URL</div>
                              <div className="mt-1 text-sm font-semibold text-white break-all">{travelTimeDebug.config.routingBaseUrl || 'default'}</div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Routing Profile</div>
                              <div className="mt-1 text-sm font-semibold text-white">{travelTimeDebug.config.routingProfile || 'driving-car'}</div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">API Key</div>
                              <div className="mt-1 text-sm font-semibold text-white">{travelTimeDebug.config.routingApiKeyConfigured ? 'Configured' : 'Missing'}</div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Google Routes</div>
                              <div className="mt-1 text-sm font-semibold text-white">{travelTimeDebug.config.googleRoutesEnabled ? 'Enabled' : 'Off'}</div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Google API Key</div>
                              <div className="mt-1 text-sm font-semibold text-white">{travelTimeDebug.config.googleRoutesApiKeyConfigured ? 'Configured' : 'Missing'}</div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Google All Modes</div>
                              <div className="mt-1 text-sm font-semibold text-white">{travelTimeDebug.config.googleRoutesForAllModes ? 'On' : 'Off'}</div>
                            </div>
                          </div>
                        )}

                        {!travelTimeDebugLoading && (!travelTimeDebug?.items || travelTimeDebug.items.length === 0) && (
                          <div className="rounded-xl border border-dashed border-slate-800 p-6 text-sm text-slate-500">
                            No Travel Time debug data yet. Run Travel Debug after saving your route settings.
                          </div>
                        )}

                        <div className="space-y-3">
                          {(travelTimeDebug?.items || []).map((item) => (
                            <div key={`travel-debug-${item.id}`} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <div className="text-sm font-semibold text-white">{item.label || 'Route'}</div>
                                  <div className="text-xs text-slate-500">Status: {item.status || 'unknown'}</div>
                                </div>
                                <div className="text-xs text-slate-400">{item.summary || 'No summary returned.'}</div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1">
                                  <div className="font-bold uppercase tracking-wider text-slate-500">Origin</div>
                                  <div className="text-slate-300">Type: {item.input?.originType || 'home'}</div>
                                  <div className="text-slate-300 break-words">Address: {item.origin?.address || item.input?.originAddress || 'n/a'}</div>
                                  <div className={item.origin?.hasLocation ? 'text-emerald-300' : 'text-amber-300'}>
                                    {item.origin?.hasLocation ? 'Geocoded successfully' : 'No resolved coordinates'}
                                  </div>
                                  {item.origin?.geocode?.provider && (
                                    <div className="text-slate-400">Provider: {item.origin.geocode.provider}{item.origin.geocode.fromCache ? ' (cache)' : ''}</div>
                                  )}
                                  {item.origin?.geocode?.error && (
                                    <div className="text-amber-300 break-words">Error: {item.origin.geocode.error}</div>
                                  )}
                                  {item.origin?.location?.resolvedLabel && (
                                    <div className="text-slate-400 break-words">{item.origin.location.resolvedLabel}</div>
                                  )}
                                </div>
                                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1">
                                  <div className="font-bold uppercase tracking-wider text-slate-500">Destination</div>
                                  <div className="text-slate-300">Type: {item.input?.destinationType || 'custom'}</div>
                                  <div className="text-slate-300 break-words">Address: {item.destination?.address || item.input?.destinationAddress || 'n/a'}</div>
                                  <div className={item.destination?.hasLocation ? 'text-emerald-300' : 'text-amber-300'}>
                                    {item.destination?.hasLocation ? 'Geocoded successfully' : 'No resolved coordinates'}
                                  </div>
                                  {item.destination?.geocode?.provider && (
                                    <div className="text-slate-400">Provider: {item.destination.geocode.provider}{item.destination.geocode.fromCache ? ' (cache)' : ''}</div>
                                  )}
                                  {item.destination?.geocode?.error && (
                                    <div className="text-amber-300 break-words">Error: {item.destination.geocode.error}</div>
                                  )}
                                  {item.destination?.location?.resolvedLabel && (
                                    <div className="text-slate-400 break-words">{item.destination.location.resolvedLabel}</div>
                                  )}
                                </div>
                              </div>
                              {item.route && (
                                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
                                  Source: {item.route.source || 'unknown'} | Profile: {item.route.profile || 'n/a'} | Duration: {item.route.durationMinutes ?? 'n/a'} min | Distance: {item.route.distanceKm ?? 'n/a'} km | Traffic: {item.route.trafficSeverity || 'neutral'}{item.route.trafficDelayMinutes != null ? ` (${item.route.trafficDelayMinutes} min delay)` : ''}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {activeIntegrationSection === 'home_assistant' && (
                  <div className="space-y-6">
                    <section className="rounded-[28px] border border-slate-800 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(34,211,238,0.08),rgba(15,23,42,0.92)_42%,rgba(2,6,23,1)_100%)] p-6">
                      <div className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-200/80">Smart Home</div>
                      <h2 className="mt-2 text-xl font-semibold text-white">Home Assistant integration</h2>
                      <p className="mt-2 text-sm text-slate-300">
                        Control the Home Assistant connection here: activation, credentials, entity discovery, and how selected entities render as smart-home tiles on the mirror.
                      </p>
                    </section>

                    <section className="bg-slate-900/50 border border-slate-800 rounded-[28px] p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <Monitor size={24} className="text-emerald-400" />
                        <h2 className="text-lg font-semibold text-white">Home Assistant</h2>
                      </div>
                      <div className="space-y-5">
                        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-800/30 p-3">
                          <div>
                            <div className="text-sm font-semibold text-white">Enable Home Assistant</div>
                            <div className="text-[10px] font-bold uppercase text-slate-500">Turns live smart-home syncing on or off for the mirror</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={homeAssistantConfig.enabled !== false}
                            onChange={(event) => updateModuleConfig('home_assistant', 'enabled', event.target.checked)}
                          />
                        </label>

                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Home Assistant URL</label>
                          <input
                            type="text"
                            value={homeAssistantConfig.url || ''}
                            onChange={(event) => updateModuleConfig('home_assistant', 'url', event.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Home Assistant Token</label>
                          <input
                            type="password"
                            value={homeAssistantConfig.token || ''}
                            onChange={(event) => updateModuleConfig('home_assistant', 'token', event.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>

                        <div className="rounded-[24px] border border-slate-800 bg-slate-950/60 p-4">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-white">Discover entities</div>
                              <div className="mt-1 text-xs text-slate-500">
                                Fetch all Home Assistant states, filter them by domain, and configure each selected entity as a tile. Binary domains render as status tiles; temperature and humidity sensors render as value tiles.
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={refreshHomeAssistantEntities}
                              disabled={haEntitiesLoading}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:border-[#ff8bbf] hover:text-[#ffd7aa] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <RefreshCcw size={16} className={haEntitiesLoading ? 'animate-spin' : ''} />
                              {haEntitiesLoading ? 'Loading entities...' : 'Refresh entity list'}
                            </button>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr),auto]">
                            <label className="relative block">
                              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                              <input
                                type="text"
                                value={haEntityQuery}
                                onChange={(event) => setHaEntityQuery(event.target.value)}
                                placeholder="Search by name, entity id, or device class"
                                className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-[#ff8bbf]"
                              />
                            </label>
                            <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-400">
                              {homeAssistantConfig.entityCards.length} selected / {haEntities.length} discovered
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setHaEntityDomainFilter('all')}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                haEntityDomainFilter === 'all'
                                  ? 'border-[#ff8bbf] bg-[#ff8bbf]/15 text-white'
                                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-white'
                              }`}
                            >
                              All ({haEntities.length})
                            </button>
                            {homeAssistantDomains.map(([domain, count]) => (
                              <button
                                key={domain}
                                type="button"
                                onClick={() => setHaEntityDomainFilter(domain)}
                                className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition ${
                                  haEntityDomainFilter === domain
                                    ? 'border-[#ff8bbf] bg-[#ff8bbf]/15 text-white'
                                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-white'
                                }`}
                              >
                                {getHomeAssistantDomainLabel(domain)} ({count})
                              </button>
                            ))}
                          </div>

                          {haEntitiesError && (
                            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                              {haEntitiesError}
                            </div>
                          )}

                          <div className="mt-5 grid gap-4 xl:grid-cols-2">
                            <div className="rounded-[20px] border border-slate-800 bg-slate-950/70 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-white">Available entities</div>
                                  <div className="mt-1 text-xs text-slate-500">Filter to lights, switches, sensors, and other domains, then add the ones this module should render.</div>
                                </div>
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-600">{filteredHomeAssistantEntities.length} visible</div>
                              </div>
                              <div className="mt-4 space-y-3 max-h-[540px] overflow-y-auto pr-1">
                                {!haEntitiesLoading && filteredHomeAssistantEntities.length === 0 && (
                                  <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-500">
                                    No entities match the current filter.
                                  </div>
                                )}
                                {filteredHomeAssistantEntities.map((entity) => {
                                  const isSelected = selectedHomeAssistantEntityIds.has(entity.id);
                                  return (
                                    <div key={entity.id} className={`rounded-2xl border p-4 transition ${
                                      isSelected ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60'
                                    }`}>
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200">
                                              <HomeAssistantIconPreview iconId={suggestHomeAssistantIcon(entity)} className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0">
                                              <div className="truncate text-sm font-semibold text-white">{entity.name}</div>
                                              <div className="truncate text-xs text-slate-500">{entity.id}</div>
                                            </div>
                                          </div>
                                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                            <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 capitalize text-slate-300">
                                              {getHomeAssistantDomainLabel(entity.domain)}
                                            </span>
                                            <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-slate-300">
                                              {`${entity.state}${entity.unit || ''}`}
                                            </span>
                                            {entity.deviceClass && (
                                              <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-slate-400">
                                                {entity.deviceClass}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => addHomeAssistantEntity(entity)}
                                          disabled={isSelected}
                                          className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                                            isSelected
                                              ? 'cursor-default border border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                                              : 'border border-slate-700 bg-slate-950 text-white hover:border-[#ff8bbf] hover:text-[#ffd7aa]'
                                          }`}
                                        >
                                          {isSelected ? 'Added' : 'Add'}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="rounded-[20px] border border-slate-800 bg-slate-950/70 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-white">Selected tiles</div>
                                  <div className="mt-1 text-xs text-slate-500">Set icon and size for each chosen entity. The display module uses these settings to build small, medium, and large tiles.</div>
                                </div>
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-600">{homeAssistantConfig.entityCards.length} tiles</div>
                              </div>
                              <div className="mt-4 space-y-3 max-h-[540px] overflow-y-auto pr-1">
                                {homeAssistantConfig.entityCards.length === 0 && (
                                  <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-500">
                                    No Home Assistant entities selected yet.
                                  </div>
                                )}
                                {homeAssistantConfig.entityCards.map((card) => {
                                  const entity = haEntityMap.get(card.entityId);
                                  const name = entity?.name || card.entityId;
                                  return (
                                    <div key={card.entityId} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100">
                                              <HomeAssistantIconPreview iconId={card.icon} className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0">
                                              <div className="truncate text-sm font-semibold text-white">{name}</div>
                                              <div className="truncate text-xs text-slate-500">{card.entityId}</div>
                                            </div>
                                          </div>
                                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                            <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 capitalize text-slate-300">
                                              {getHomeAssistantDomainLabel(entity?.domain || getHomeAssistantDomain(card.entityId))}
                                            </span>
                                            <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-slate-300">
                                              {card.displayType} tile
                                            </span>
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => removeHomeAssistantEntity(card.entityId)}
                                          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-rose-400/50 hover:text-rose-200"
                                        >
                                          Remove
                                        </button>
                                      </div>

                                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                                        <div>
                                          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Tile size</label>
                                          <select
                                            value={card.displayType}
                                            onChange={(event) => updateHomeAssistantEntityCard(card.entityId, { displayType: event.target.value })}
                                            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-[#ff8bbf]"
                                          >
                                            <option value="small">Small</option>
                                            <option value="medium">Medium</option>
                                            <option value="large">Large</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Icon</label>
                                          <select
                                            value={card.icon}
                                            onChange={(event) => updateHomeAssistantEntityCard(card.entityId, { icon: event.target.value })}
                                            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-[#ff8bbf]"
                                          >
                                            {HOME_ASSISTANT_ICON_OPTIONS.map((option) => (
                                              <option key={option.id} value={option.id}>{option.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {activeIntegrationSection === 'module_inputs' && (
                  <div className="space-y-6">
                    <section className="rounded-[28px] border border-slate-800 bg-[linear-gradient(135deg,rgba(255,134,211,0.14),rgba(255,210,157,0.1),rgba(15,23,42,0.92)_42%,rgba(2,6,23,1)_100%)] p-6">
                      <div className="text-xs font-bold uppercase tracking-[0.24em] text-[#ffd7aa]/80">Modules</div>
                      <h2 className="mt-2 text-xl font-semibold text-white">Separate module inputs</h2>
                      <p className="mt-2 text-sm text-slate-300">
                        Calendar and Daily Brief settings stay grouped here as module-level inputs, while Home Assistant now has its own dedicated integration section.
                      </p>
                    </section>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <section className="bg-slate-900/50 border border-slate-800 rounded-[28px] p-6">
                        <div className="flex items-center gap-3 mb-6">
                          <Layout size={24} className="text-[#ff8bbf]" />
                          <h2 className="text-lg font-semibold text-white">Calendar Input</h2>
                        </div>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Calendar Items</label>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={calendarModuleConfig.maxItems || 5}
                                onChange={(event) => updateModuleConfig('calendar', 'maxItems', parseInt(event.target.value || '5', 10))}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Days to Show</label>
                              <select
                                value={calendarModuleConfig.daysToShow || 4}
                                onChange={(event) => updateModuleConfig('calendar', 'daysToShow', parseInt(event.target.value, 10))}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                              >
                                {[1, 2, 3, 4, 5, 6, 7].map((days) => (
                                  <option key={days} value={days}>{days === 7 ? 'Full week' : `${days} day${days === 1 ? '' : 's'}`}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Calendar View</label>
                            <select
                              value={calendarModuleConfig.viewMode || 'list'}
                              onChange={(event) => updateModuleConfig('calendar', 'viewMode', event.target.value)}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                            >
                              <option value="list">Agenda list</option>
                              <option value="day_cards">Day cards</option>
                            </select>
                          </div>
                          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
                            Calendar source selection and color mapping stay in <span className="font-semibold text-white">Google Calendar</span>.
                          </div>
                        </div>
                      </section>
                    </div>

                    <section className="bg-slate-900/50 border border-slate-800 rounded-[28px] p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <Settings size={24} className="text-[#ffd7aa]" />
                        <h2 className="text-lg font-semibold text-white">Daily Brief Input</h2>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Daily Brief Items</label>
                          <input
                            type="number"
                            min="1"
                            max="5"
                            value={dailyBriefConfig.maxItems || 3}
                            onChange={(event) => updateModuleConfig('daily_brief', 'maxItems', parseInt(event.target.value || '3', 10))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Daily Brief Page Seconds</label>
                          <input
                            type="number"
                            min="5"
                            max="30"
                            value={dailyBriefConfig.pageSeconds || 10}
                            onChange={(event) => updateModuleConfig('daily_brief', 'pageSeconds', parseInt(event.target.value || '10', 10))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#ff8bbf] transition-all text-sm"
                          />
                        </div>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'debug' && (
            <div className="space-y-6">
              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Daily Brief Debug</h2>
                    <div className="text-sm text-slate-500">Trace deterministic context, LLM prompt/input, LLM response, and the final payload shown on the mirror.</div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={refreshDailyBriefDebug}
                      disabled={dailyBriefDebugLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-all disabled:opacity-60"
                    >
                      <RefreshCcw size={16} /> Refresh
                    </button>
                    <button
                      onClick={rebuildDailyBriefDebug}
                      disabled={dailyBriefDebugLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ff7ea8] hover:bg-[#ff90b5] text-white transition-all disabled:opacity-60"
                    >
                      <RefreshCcw size={16} /> Rebuild Context
                    </button>
                  </div>
                </div>

                {dailyBriefDebugLoading ? (
                  <div className="text-sm text-slate-400">Loading debug data...</div>
                ) : !dailyBriefDebug ? (
                  <div className="text-sm text-slate-400">No Daily Brief debug data available yet.</div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Updated</div>
                        <div className="text-sm text-white">{dailyBriefDebug.updatedAt || '—'}</div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Final Source</div>
                        <div className="text-sm text-white">{dailyBriefDebug.status || '—'}</div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">LLM Stage</div>
                        <div className="text-sm text-white">{dailyBriefDebug.stageSource || '—'}</div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Events</div>
                        <div className="text-sm text-white">{dailyBriefDebug.stages?.calendarInput?.totalEvents ?? 0}</div>
                      </div>
                    </div>

                    {[
                      ['Calendar Input', dailyBriefDebug.stages?.calendarInput],
                      ['Deterministic Context', dailyBriefDebug.stages?.deterministic],
                      ['LLM Stage', dailyBriefDebug.stages?.llm],
                      ['Final Display Payload', dailyBriefDebug.stages?.finalContext],
                    ].map(([label, payload]) => (
                      <details key={label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4" open={label === 'Final Display Payload'}>
                        <summary className="cursor-pointer text-sm font-semibold text-white">{label}</summary>
                        <pre className="mt-4 whitespace-pre-wrap break-all text-xs text-slate-300 overflow-x-auto">
                          {JSON.stringify(payload, null, 2)}
                        </pre>
                      </details>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
            </main>

            <footer className="rounded-[28px] border border-slate-800 bg-slate-900/60 px-6 py-4 text-sm text-slate-400">
              Mirrorial v{APP_VERSION} | {currentYear} Christoph Seiler | Flaming Battenberg
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
