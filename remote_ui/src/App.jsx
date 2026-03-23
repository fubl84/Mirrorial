import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Cloud,
  GripVertical,
  Info,
  Layout,
  Monitor,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import MirrorPreview from './components/MirrorPreview';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';
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
};

const LAYOUT_TEMPLATES = {
  portrait_focus: {
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

const PREVIEW_RESOLUTION_PRESETS = {
  '1080x1920': { label: 'Portrait FHD', width: 1080, height: 1920 },
  '1440x2560': { label: 'Portrait QHD', width: 1440, height: 2560 },
  '2160x3840': { label: 'Portrait 4K', width: 2160, height: 3840 },
  '1920x1080': { label: 'Landscape FHD', width: 1920, height: 1080 },
  '2560x1440': { label: 'Landscape QHD', width: 2560, height: 1440 },
};

const defaultModuleConfig = (type) => {
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
      return { url: '', token: '', entities: [] };
    case 'calendar':
      return { maxItems: 5, viewMode: 'list', daysToShow: 4, calendarColors: {} };
    case 'daily_brief':
      return { maxItems: 3, pageSeconds: 10 };
    default:
      return {};
  }
};

const createDefaultGridLayout = (templateId = 'portrait_focus') => {
  const template = LAYOUT_TEMPLATES[templateId] || LAYOUT_TEMPLATES.portrait_focus;
  return {
    template: templateId,
    columns: template.columns,
    rows: template.rows,
    gap: 16,
    modules: template.modules.map((module) => ({
      ...module,
      config: defaultModuleConfig(module.type),
    })),
  };
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const modulesOverlap = (left, right) => (
  (left.x || 0) < (right.x || 0) + (right.w || 1) &&
  (left.x || 0) + (left.w || 1) > (right.x || 0) &&
  (left.y || 0) < (right.y || 0) + (right.h || 1) &&
  (left.y || 0) + (left.h || 1) > (right.y || 0)
);

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
  const [selectedCalendarIds, setSelectedCalendarIds] = useState([]);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [selectedLayoutModuleId, setSelectedLayoutModuleId] = useState(null);
  const [displayStatus, setDisplayStatus] = useState(null);
  const [dailyBriefDebug, setDailyBriefDebug] = useState(null);
  const [dailyBriefDebugLoading, setDailyBriefDebugLoading] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === 'integrations' || activeTab === 'household') {
      refreshGoogleState();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'layout' || activeTab === 'display') {
      refreshDisplayStatus();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'debug') {
      refreshDailyBriefDebug();
    }
  }, [activeTab]);

  useEffect(() => {
    const modules = config?.gridLayout?.modules || [];
    if (!modules.length) {
      if (selectedLayoutModuleId !== null) {
        setSelectedLayoutModuleId(null);
      }
      return;
    }

    if (!selectedLayoutModuleId || !modules.some((module) => module.id === selectedLayoutModuleId)) {
      setSelectedLayoutModuleId(modules[0].id);
    }
  }, [config, selectedLayoutModuleId]);

  const fetchInitialData = async () => {
    try {
      const [configResponse, householdResponse, displayStatusResponse] = await Promise.all([
        axios.get(`${API_BASE}/config`),
        axios.get(`${API_BASE}/household`),
        axios.get(`${API_BASE}/display/status`).catch(() => ({ data: null })),
      ]);
      setConfig({
        ...configResponse.data,
        gridLayout: configResponse.data.gridLayout || createDefaultGridLayout(),
      });
      setHousehold(householdResponse.data);
      setDisplayStatus(displayStatusResponse.data);
    } catch (error) {
      alert('Failed to fetch settings.');
    } finally {
      setLoading(false);
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

  const rebuildDailyBriefDebug = async () => {
    setDailyBriefDebugLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/debug/daily-brief/rebuild`);
      setDailyBriefDebug(response.data.debug || null);
    } catch (error) {
      alert('Failed to rebuild Daily Brief debug data.');
    } finally {
      setDailyBriefDebugLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const configResponse = await axios.post(`${API_BASE}/config`, config);
      const householdResponse = await axios.post(`${API_BASE}/household`, household);
      setConfig({
        ...configResponse.data.config,
        gridLayout: configResponse.data.config.gridLayout || createDefaultGridLayout(),
      });
      setHousehold(householdResponse.data.household);
      alert('Settings saved successfully.');
      if (activeTab === 'integrations') {
        refreshGoogleState();
      }
    } catch (error) {
      alert('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const runCommand = async (command) => {
    if (!window.confirm(`Are you sure you want to trigger ${command}?`)) {
      return;
    }

    try {
      await axios.post(`${API_BASE}/system/${command}`);
      alert(`Command ${command} sent.`);
    } catch (error) {
      alert('Command failed.');
    }
  };

  const updateConfig = (updater) => {
    setConfig((current) => updater(typeof structuredClone === 'function' ? structuredClone(current) : JSON.parse(JSON.stringify(current))));
  };

  const updateHousehold = (updater) => {
    setHousehold((current) => updater(typeof structuredClone === 'function' ? structuredClone(current) : JSON.parse(JSON.stringify(current))));
  };

  const ensureGridLayout = (draft) => {
    draft.gridLayout = draft.gridLayout || createDefaultGridLayout();
    draft.gridLayout.modules = draft.gridLayout.modules || [];
    return draft.gridLayout;
  };

  const normalizeGridModule = (module, gridLayout) => {
    const nextModule = { ...module };
    nextModule.w = clamp(parseInt(nextModule.w || '1', 10), 1, Math.max(1, gridLayout.columns));
    nextModule.h = clamp(parseInt(nextModule.h || '1', 10), 1, Math.max(1, gridLayout.rows));
    nextModule.x = clamp(parseInt(nextModule.x || '0', 10), 0, Math.max(0, gridLayout.columns - nextModule.w));
    nextModule.y = clamp(parseInt(nextModule.y || '0', 10), 0, Math.max(0, gridLayout.rows - nextModule.h));
    nextModule.align = nextModule.align || 'stretch';
    return nextModule;
  };

  const normalizeGridLayoutDraft = (gridLayout) => {
    gridLayout.columns = clamp(parseInt(gridLayout.columns || '4', 10), 2, 8);
    gridLayout.rows = clamp(parseInt(gridLayout.rows || '8', 10), 2, 12);
    gridLayout.gap = clamp(parseInt(gridLayout.gap || '16', 10), 0, 32);
    gridLayout.modules = (gridLayout.modules || []).map((module) => normalizeGridModule(module, gridLayout));
    return gridLayout;
  };

  const updateModuleConfig = (type, key, value) => {
    updateConfig((draft) => {
      const gridLayout = ensureGridLayout(draft);
      gridLayout.modules.forEach((module) => {
        if (module.type === type) {
          module.config = module.config || {};
          module.config[key] = value;
        }
      });
      return draft;
    });
  };

  const updateServiceConfig = (service, key, value) => {
    updateConfig((draft) => {
      draft.services[service][key] = value;
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
        birthdate: '',
        calendarIds: [],
        tags: [],
        shareInBrief: true,
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

  const applyLayoutTemplate = (templateId) => {
    const nextGridLayout = createDefaultGridLayout(templateId);
    setSelectedLayoutModuleId(nextGridLayout.modules[0]?.id || null);
    updateConfig((draft) => {
      draft.gridLayout = nextGridLayout;
      return draft;
    });
  };

  const addGridModule = (type) => {
    const moduleId = `${type}_${Date.now()}`;
    setSelectedLayoutModuleId(moduleId);
    updateConfig((draft) => {
      const gridLayout = ensureGridLayout(draft);
      const modules = gridLayout.modules || [];
      const nextIndex = modules.length;
      modules.push({
        id: moduleId,
        type,
        config: defaultModuleConfig(type),
        x: nextIndex % Math.max(1, gridLayout.columns - 1),
        y: Math.floor(nextIndex / Math.max(1, gridLayout.columns - 1)) * 2,
        w: type === 'daily_brief' ? 2 : 1,
        h: type === 'weather' ? 2 : 1,
        align: 'stretch',
      });
      gridLayout.modules = modules;
      return draft;
    });
  };

  const updateGridModule = (moduleId, key, value) => {
    updateConfig((draft) => {
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft));
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId);
      const module = moduleIndex >= 0 ? gridLayout.modules[moduleIndex] : null;
      if (module) {
        module[key] = value;
        gridLayout.modules[moduleIndex] = normalizeGridModule(module, gridLayout);
      }
      return draft;
    });
  };

  const removeGridModule = (moduleId) => {
    updateConfig((draft) => {
      const gridLayout = ensureGridLayout(draft);
      gridLayout.modules = gridLayout.modules.filter((module) => module.id !== moduleId);
      return draft;
    });
  };

  const placeGridModule = (moduleId, x, y) => {
    updateConfig((draft) => {
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft));
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId);
      if (moduleIndex >= 0) {
        const module = { ...gridLayout.modules[moduleIndex], x, y };
        gridLayout.modules[moduleIndex] = normalizeGridModule(module, gridLayout);
      }
      return draft;
    });
  };

  const moveGridModule = (moduleId, dx, dy) => {
    updateConfig((draft) => {
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft));
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId);
      if (moduleIndex >= 0) {
        const module = { ...gridLayout.modules[moduleIndex] };
        module.x = (module.x || 0) + dx;
        module.y = (module.y || 0) + dy;
        gridLayout.modules[moduleIndex] = normalizeGridModule(module, gridLayout);
      }
      return draft;
    });
  };

  const resizeGridModule = (moduleId, width, height) => {
    updateConfig((draft) => {
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft));
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId);
      if (moduleIndex >= 0) {
        const module = {
          ...gridLayout.modules[moduleIndex],
          w: width,
          h: height,
        };
        gridLayout.modules[moduleIndex] = normalizeGridModule(module, gridLayout);
      }
      return draft;
    });
  };

  const applyModuleSizePreset = (moduleId, presetKey) => {
    updateConfig((draft) => {
      const gridLayout = normalizeGridLayoutDraft(ensureGridLayout(draft));
      const moduleIndex = gridLayout.modules.findIndex((entry) => entry.id === moduleId);
      if (moduleIndex < 0) {
        return draft;
      }

      const module = { ...gridLayout.modules[moduleIndex] };
      const presets = MODULE_SIZE_PRESETS[module.type] || {};
      const preset = presets[presetKey];
      if (preset) {
        module.w = preset.w;
        module.h = preset.h;
        gridLayout.modules[moduleIndex] = normalizeGridModule(module, gridLayout);
      }
      return draft;
    });
  };

  const connectGoogle = () => {
    const popup = window.open(`${API_BASE}/auth/google/start`, 'mirrorial-google-auth', 'popup=yes,width=540,height=720');
    if (!popup) {
      alert('The popup was blocked by your browser.');
      return;
    }

    const onMessage = (event) => {
      if (!event.data || event.data.type !== 'mirrorial-google-auth') {
        return;
      }

      window.removeEventListener('message', onMessage);
      if (event.data.success) {
        refreshGoogleState();
      } else {
        alert(event.data.payload?.error || 'Google authentication failed.');
      }
    };

    window.addEventListener('message', onMessage);
  };

  const disconnectGoogle = async () => {
    try {
      await axios.post(`${API_BASE}/auth/google/disconnect`);
      await refreshGoogleState();
    } catch (error) {
      alert('Failed to disconnect Google.');
    }
  };

  const saveCalendarSelection = async () => {
    setCalendarSaving(true);
    try {
      await axios.post(`${API_BASE}/google/calendars/select`, { selectedCalendarIds });
      await refreshGoogleState();
      alert('Calendar selection saved.');
    } catch (error) {
      alert('Failed to save calendar selection.');
    } finally {
      setCalendarSaving(false);
    }
  };

  const findModule = (type) => (config?.gridLayout?.modules || []).find((module) => module.type === type);

  if (loading || !config || !household) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Loading...</div>;
  }

  const googleConfig = config.services.google;
  const llmConfig = config.services.llm;
  const transportConfig = config.services.transport;
  const routingConfig = config.services.routing;
  const contextConfig = config.services.context;
  const currentGridLayout = config.gridLayout || createDefaultGridLayout();
  const currentGridDiagnostics = buildGridDiagnostics(currentGridLayout);
  const overlapModuleIds = new Set(currentGridDiagnostics.overlapIds);
  const outOfBoundsModuleIds = new Set(currentGridDiagnostics.outOfBoundsIds);
  const selectedLayoutModule = (currentGridLayout.modules || []).find((module) => module.id === selectedLayoutModuleId) || null;
  const weatherConfig = findModule('weather')?.config || {};
  const homeAssistantConfig = findModule('home_assistant')?.config || {};
  const calendarModuleConfig = findModule('calendar')?.config || {};
  const dailyBriefConfig = findModule('daily_brief')?.config || {};
  const configuredPreviewResolution = config.system.previewResolution || 'auto';
  const resolvedPreviewResolution = configuredPreviewResolution === 'auto'
    ? (displayStatus?.width && displayStatus?.height
      ? { width: displayStatus.width, height: displayStatus.height, label: 'Live device' }
      : PREVIEW_RESOLUTION_PRESETS['1080x1920'])
    : PREVIEW_RESOLUTION_PRESETS[configuredPreviewResolution] || PREVIEW_RESOLUTION_PRESETS['1080x1920'];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">M</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight leading-none">Mirrorial</h1>
              <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">Remote OS v1.1</span>
            </div>
          </div>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-500/10 active:scale-95"
          >
            <Save size={18} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </header>

        <div className="flex gap-1 p-1 bg-slate-900/50 rounded-2xl border border-slate-800 mb-8 overflow-x-auto no-scrollbar">
          {[
            { id: 'display', label: 'System', icon: Monitor },
            { id: 'household', label: 'Household', icon: Users },
            { id: 'layout', label: 'Layout Editor', icon: Layout },
            { id: 'styling', label: 'Styling', icon: Settings },
            { id: 'integrations', label: 'Integrations', icon: Cloud },
            { id: 'debug', label: 'Debug', icon: Info },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <tab.icon size={18} /> {tab.label}
            </button>
          ))}
        </div>

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
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
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
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm text-white"
                    />
                  </div>
                </div>
              </section>

              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-6 text-white">System Actions</h2>
                <div className="grid grid-cols-1 gap-3">
                  <button onClick={() => runCommand('restart-display')} className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 p-4 rounded-xl transition-all active:scale-95">
                    <RefreshCcw size={18} className="text-amber-500" />
                    <div className="text-left">
                      <div className="font-semibold">Restart Display</div>
                      <div className="text-xs text-slate-500">Restart the Flutter display process</div>
                    </div>
                  </button>
                  <button onClick={() => runCommand('reboot')} className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 p-4 rounded-xl transition-all active:scale-95">
                    <RefreshCcw size={18} className="text-blue-500" />
                    <div className="text-left">
                      <div className="font-semibold">Reboot Mirror</div>
                      <div className="text-xs text-slate-500">Full system reboot</div>
                    </div>
                  </button>
                </div>

                <hr className="my-6 border-slate-800" />

                <h2 className="text-lg font-semibold mb-6 text-white">Context Engine</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Context Refresh</label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={contextConfig.refreshHours}
                      onChange={(event) => updateServiceConfig('context', 'refreshHours', parseInt(event.target.value || '3', 10))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Trip Lookahead</label>
                    <input
                      type="number"
                      min="3"
                      max="30"
                      value={contextConfig.tripLookaheadDays}
                      onChange={(event) => updateServiceConfig('context', 'tripLookaheadDays', parseInt(event.target.value || '14', 10))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
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
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      placeholder={'Hospital\nSchool\nArena'}
                    />
                    <div className="text-xs text-slate-500 mt-2">
                      Optional. One entry per line. Use this to allow genuinely useful place types or venue names even when calendar items contain street-address style destinations.
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'household' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <section className="xl:col-span-1 bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Users size={24} className="text-indigo-400" />
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
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                          />
                        </div>
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
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                          />
                        </div>
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
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                        {googleCalendars.length === 0 ? (
                          <div className="text-sm text-slate-500">Open the Integrations or Household tab after connecting Google to link calendars.</div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {googleCalendars.map((calendar) => (
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
                                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1 space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">Grid Layout</h2>
                    <p className="text-sm text-slate-500">Define module placement, width, height, and alignment with reusable templates.</p>
                  </div>
                </div>

                <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Template</label>
                      <select
                        value={currentGridLayout.template || 'portrait_focus'}
                        onChange={(event) => applyLayoutTemplate(event.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      >
                        {Object.entries(LAYOUT_TEMPLATES).map(([id, template]) => (
                          <option key={id} value={id}>{template.label}</option>
                        ))}
                      </select>
                      <div className="text-xs text-slate-500 mt-2">
                        {LAYOUT_TEMPLATES[currentGridLayout.template || 'portrait_focus']?.description}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cols</label>
                        <input
                          type="number"
                          min="2"
                          max="8"
                          value={currentGridLayout.columns}
                          onChange={(event) => updateConfig((draft) => {
                            draft.gridLayout.columns = parseInt(event.target.value || '4', 10);
                            normalizeGridLayoutDraft(draft.gridLayout);
                            return draft;
                          })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Rows</label>
                        <input
                          type="number"
                          min="2"
                          max="12"
                          value={currentGridLayout.rows}
                          onChange={(event) => updateConfig((draft) => {
                            draft.gridLayout.rows = parseInt(event.target.value || '8', 10);
                            normalizeGridLayoutDraft(draft.gridLayout);
                            return draft;
                          })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Gap</label>
                        <input
                          type="number"
                          min="0"
                          max="32"
                          value={currentGridLayout.gap}
                          onChange={(event) => updateConfig((draft) => {
                            draft.gridLayout.gap = parseInt(event.target.value || '16', 10);
                            normalizeGridLayoutDraft(draft.gridLayout);
                            return draft;
                          })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Add Module</label>
                    <select
                      value=""
                      onChange={(event) => event.target.value && addGridModule(event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    >
                      <option value="" disabled>Choose a module</option>
                      {MODULE_TYPES.map((type) => (
                        <option key={type.id} value={type.id}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                </section>

                <div className="grid grid-cols-1 gap-4">
                  {(currentGridLayout.modules || []).map((module, moduleIndex) => (
                    <div
                      key={module.id || `${module.type}-${moduleIndex}`}
                      onClick={() => setSelectedLayoutModuleId(module.id)}
                      className={`bg-slate-900/50 border rounded-2xl overflow-hidden transition-colors cursor-pointer ${
                        selectedLayoutModuleId === module.id
                          ? 'border-indigo-500 shadow-lg shadow-indigo-500/10'
                          : overlapModuleIds.has(module.id) || outOfBoundsModuleIds.has(module.id)
                            ? 'border-amber-500/60'
                            : 'border-slate-800'
                      }`}
                    >
                      <div className="p-4 bg-slate-800/30 flex items-center justify-between border-b border-slate-800">
                        <div className="flex items-center gap-4">
                          <GripVertical size={20} className="text-slate-600" />
                          <span className="text-2xl">{MODULE_TYPES.find((item) => item.id === module.type)?.icon || '•'}</span>
                          <div>
                            <div className="font-bold text-slate-200">{MODULE_TYPES.find((item) => item.id === module.type)?.label || module.type}</div>
                            <div className="text-xs text-slate-500">Position ({module.x}, {module.y}) • Size {module.w} x {module.h}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedLayoutModuleId === module.id && (
                            <span className="px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-wider">
                              Selected
                            </span>
                          )}
                          {overlapModuleIds.has(module.id) && (
                            <span className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                              Overlap
                            </span>
                          )}
                          {outOfBoundsModuleIds.has(module.id) && (
                            <span className="px-2 py-1 rounded-full bg-red-500/20 text-red-300 text-[10px] font-bold uppercase tracking-wider">
                              Bounds
                            </span>
                          )}
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              removeGridModule(module.id);
                            }}
                            className="text-slate-500 hover:text-red-400 transition-colors"
                          >
                          <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      <div className="p-6 grid grid-cols-2 md:grid-cols-6 gap-4">
                        <div className="col-span-2 md:col-span-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Quick Controls</div>
                          <div className="flex flex-wrap gap-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => moveGridModule(module.id, 0, -1)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200">
                                <ArrowUp size={16} />
                              </button>
                              <button onClick={() => moveGridModule(module.id, -1, 0)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200">
                                <ArrowLeft size={16} />
                              </button>
                              <button onClick={() => moveGridModule(module.id, 1, 0)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200">
                                <ArrowRight size={16} />
                              </button>
                              <button onClick={() => moveGridModule(module.id, 0, 1)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200">
                                <ArrowDown size={16} />
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {(Object.entries(MODULE_SIZE_PRESETS[module.type] || {})).map(([presetKey, preset]) => (
                                <button
                                  key={`${module.id}-${presetKey}`}
                                  onClick={() => applyModuleSizePreset(module.id, presetKey)}
                                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        {[
                          { key: 'x', label: 'X', min: 0, max: Math.max(0, currentGridLayout.columns - 1) },
                          { key: 'y', label: 'Y', min: 0, max: Math.max(0, currentGridLayout.rows - 1) },
                          { key: 'w', label: 'Width', min: 1, max: currentGridLayout.columns },
                          { key: 'h', label: 'Height', min: 1, max: currentGridLayout.rows },
                        ].map((field) => (
                          <div key={`${module.id}-${field.key}`}>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{field.label}</label>
                            <input
                              type="number"
                              min={field.min}
                              max={field.max}
                              value={module[field.key] ?? field.min}
                              onChange={(event) => updateGridModule(module.id, field.key, parseInt(event.target.value || `${field.min}`, 10))}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                            />
                          </div>
                        ))}
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Alignment</label>
                          <select
                            value={module.align || 'stretch'}
                            onChange={(event) => updateGridModule(module.id, 'align', event.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                          >
                            <option value="stretch">Stretch</option>
                            <option value="start">Top Left</option>
                            <option value="center">Center</option>
                            <option value="end">Bottom Right</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full lg:w-80 shrink-0">
                <div className="sticky top-8">
                  <div className="flex items-center gap-2 mb-4 text-slate-400">
                    <Info size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">Live Layout Preview</span>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 mb-4 space-y-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Selected Module</div>
                      <div className="text-sm text-white mt-1">
                        {selectedLayoutModule
                          ? MODULE_TYPES.find((item) => item.id === selectedLayoutModule.type)?.label || selectedLayoutModule.type
                          : 'No module selected'}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
                        <div className="text-slate-500 uppercase font-bold tracking-wider">Occupied</div>
                        <div className="text-white text-lg font-semibold mt-1">
                          {currentGridDiagnostics.occupiedCellCount} / {currentGridLayout.columns * currentGridLayout.rows}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
                        <div className="text-slate-500 uppercase font-bold tracking-wider">Conflicts</div>
                        <div className={`text-lg font-semibold mt-1 ${currentGridDiagnostics.overlappingCellCount > 0 ? 'text-amber-300' : 'text-white'}`}>
                          {currentGridDiagnostics.overlappingCellCount}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      Click a module card to select it, then click a preview cell to place it. You can also drag modules directly in the preview and resize them from the lower-right handle.
                    </div>
                    <div className="text-xs text-slate-500">
                      Preview resolution: {resolvedPreviewResolution.width}x{resolvedPreviewResolution.height} ({resolvedPreviewResolution.label})
                    </div>
                    {currentGridDiagnostics.overlapIds.length > 0 && (
                      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        {currentGridDiagnostics.overlapIds.length} module{currentGridDiagnostics.overlapIds.length === 1 ? '' : 's'} currently overlap.
                      </div>
                    )}
                  </div>
                  <MirrorPreview
                    config={config}
                    resolution={resolvedPreviewResolution}
                    selectedModuleId={selectedLayoutModuleId}
                    occupancy={currentGridDiagnostics.occupancy}
                    overlapModuleIds={currentGridDiagnostics.overlapIds}
                    onSelectModule={setSelectedLayoutModuleId}
                    onPlaceModule={(moduleId, x, y) => (moduleId || selectedLayoutModuleId) && placeGridModule(moduleId || selectedLayoutModuleId, x, y)}
                    onResizeModule={(moduleId, width, height) => resizeGridModule(moduleId, width, height)}
                  />
                </div>
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
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Font Scaling</label>
                      <span className="text-indigo-400 font-bold">{config.theme.fontSizeBase}px</span>
                    </div>
                    <input
                      type="range"
                      min="12"
                      max="32"
                      value={config.theme.fontSizeBase}
                      onChange={(event) => updateTheme('fontSizeBase', parseInt(event.target.value, 10))}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Font Family</label>
                    <select
                      value={config.theme.fontFamily}
                      onChange={(event) => updateTheme('fontFamily', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    >
                      <option value="Roboto">Roboto</option>
                      <option value="Inter">Inter</option>
                      <option value="Open Sans">Open Sans</option>
                      <option value="Montserrat">Montserrat</option>
                    </select>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Cloud size={24} className="text-red-400" />
                  <h2 className="text-lg font-semibold text-white">Google Calendar</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">OAuth Client ID</label>
                    <input
                      type="text"
                      value={googleConfig.clientId}
                      onChange={(event) => updateServiceConfig('google', 'clientId', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">OAuth Client Secret</label>
                    <input
                      type="password"
                      placeholder={googleConfig.clientSecretConfigured ? 'Stored securely. Enter to replace.' : 'Paste client secret'}
                      value={googleConfig.clientSecret || ''}
                      onChange={(event) => updateServiceConfig('google', 'clientSecret', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Redirect URI</label>
                    <input
                      type="text"
                      value={googleConfig.redirectUri}
                      onChange={(event) => updateServiceConfig('google', 'redirectUri', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300 space-y-2">
                    <div className="font-semibold text-white">Connection status</div>
                    <div>{googleStatus?.connected ? `Connected as ${googleStatus.email || 'Google account'}` : 'No Google account connected yet.'}</div>
                    <div className="text-xs text-slate-500">Save the OAuth settings before starting the popup flow.</div>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={connectGoogle} className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-xl px-4 py-3 font-semibold transition-all">
                      Connect Google
                    </button>
                    <button onClick={disconnectGoogle} className="bg-slate-800 hover:bg-slate-700 text-white rounded-xl px-4 py-3 font-semibold transition-all">
                      Disconnect
                    </button>
                  </div>
                </div>
              </section>

              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Layout size={24} className="text-indigo-400" />
                  <h2 className="text-lg font-semibold text-white">Calendar Sync</h2>
                </div>

                {googleCalendars.length === 0 ? (
                  <div className="text-sm text-slate-400">Connect Google first to fetch calendars.</div>
                ) : (
                  <div className="space-y-3">
                    {googleCalendars.map((calendar) => (
                      <div key={calendar.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/70">
                        <div className="flex items-center gap-3 flex-1">
                          <div
                            className="w-3 h-10 rounded-full"
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
                          className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-none"
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
                    <button onClick={saveCalendarSelection} disabled={calendarSaving} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-3 font-semibold transition-all">
                      {calendarSaving ? 'Saving...' : 'Save Calendar Selection'}
                    </button>
                  </div>
                )}
              </section>

              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Cloud size={24} className="text-sky-400" />
                  <h2 className="text-lg font-semibold text-white">Weather Integration</h2>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Display Name</label>
                      <input
                        type="text"
                        value={weatherConfig.displayName || ''}
                        onChange={(event) => updateModuleConfig('weather', 'displayName', event.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">City</label>
                      <input
                        type="text"
                        value={weatherConfig.city || ''}
                        onChange={(event) => updateModuleConfig('weather', 'city', event.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Postal Code</label>
                      <input
                        type="text"
                        value={weatherConfig.postalCode || ''}
                        onChange={(event) => updateModuleConfig('weather', 'postalCode', event.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Country</label>
                      <input
                        type="text"
                        value={weatherConfig.country || ''}
                        onChange={(event) => updateModuleConfig('weather', 'country', event.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Service Provider</label>
                    <select
                      value={weatherConfig.provider || 'open-meteo'}
                      onChange={(event) => updateModuleConfig('weather', 'provider', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                    <div className="text-xs text-slate-500 mt-2">
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
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Provider Query</label>
                        <input
                          type="text"
                          value={weatherConfig.location || ''}
                          onChange={(event) => updateModuleConfig('weather', 'location', event.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Latitude</label>
                        <input
                          type="number"
                          step="0.01"
                          value={weatherConfig.lat || 52.52}
                          onChange={(event) => updateModuleConfig('weather', 'lat', parseFloat(event.target.value))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Longitude</label>
                        <input
                          type="number"
                          step="0.01"
                          value={weatherConfig.lon || 13.41}
                          onChange={(event) => updateModuleConfig('weather', 'lon', parseFloat(event.target.value))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        />
                      </div>
                    </div>
                  )}
                  <div className="text-xs text-slate-500">
                    For Open-Meteo you can either provide exact latitude/longitude or just fill city/postal code/country and let the display geocode the place.
                  </div>
                </div>
              </section>

              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Settings size={24} className="text-emerald-400" />
                  <h2 className="text-lg font-semibold text-white">LLM Context Worker</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-800">
                    <div>
                      <div className="text-sm font-semibold text-white">Enable LLM Analysis</div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Deterministic context stays active regardless</div>
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
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Base URL</label>
                    <input
                      type="text"
                      placeholder="Optional. Required for custom/local providers."
                      value={llmConfig.baseUrl || ''}
                      onChange={(event) => updateServiceConfig('llm', 'baseUrl', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">API Key</label>
                    <input
                      type="password"
                      placeholder={llmConfig.apiKeyConfigured ? 'Stored securely. Enter to replace.' : 'Paste API key'}
                      value={llmConfig.apiKey || ''}
                      onChange={(event) => updateServiceConfig('llm', 'apiKey', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Refresh Hours</label>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={llmConfig.refreshHours}
                        onChange={(event) => updateServiceConfig('llm', 'refreshHours', parseInt(event.target.value || '3', 10))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Privacy Mode</label>
                      <select
                        value={llmConfig.privacyMode}
                        onChange={(event) => updateServiceConfig('llm', 'privacyMode', event.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      >
                        <option value="off">Off</option>
                        <option value="local-only">Local only</option>
                        <option value="cloud-redacted">Cloud redacted</option>
                        <option value="full">Full context</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-800">
                    <div>
                      <div className="text-sm font-semibold text-white">Suppress routine recurring events</div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Hide recurring classes, lessons, and similar noise from Daily Brief unless explicitly relevant</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={llmConfig.suppressRoutineRecurringEvents !== false}
                      onChange={(event) => updateServiceConfig('llm', 'suppressRoutineRecurringEvents', event.target.checked)}
                      className="h-5 w-5 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </section>

              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Cloud size={24} className="text-amber-400" />
                  <h2 className="text-lg font-semibold text-white">Transport Enrichment</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-800">
                    <div>
                      <div className="text-sm font-semibold text-white">Enable transport lookups</div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Deterministic parsing stays active regardless</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={transportConfig.enabled}
                      onChange={(event) => updateServiceConfig('transport', 'enabled', event.target.checked)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Provider</label>
                    <select
                      value={transportConfig.provider}
                      onChange={(event) => updateServiceConfig('transport', 'provider', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    >
                      <option value="none">None</option>
                      <option value="aviationstack">Aviationstack</option>
                      <option value="aviationapi">AviationAPI</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Provider API Key</label>
                    <input
                      type="password"
                      placeholder={transportConfig.apiKeyConfigured ? 'Stored securely. Enter to replace.' : 'Paste provider API key'}
                      value={transportConfig.apiKey || ''}
                      onChange={(event) => updateServiceConfig('transport', 'apiKey', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Home Airport</label>
                      <input
                        type="text"
                        placeholder="HAM"
                        value={transportConfig.homeAirport || ''}
                        onChange={(event) => updateServiceConfig('transport', 'homeAirport', event.target.value.toUpperCase())}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Home Station</label>
                      <input
                        type="text"
                        placeholder="Hamburg Hbf"
                        value={transportConfig.homeStation || ''}
                        onChange={(event) => updateServiceConfig('transport', 'homeStation', event.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Refresh Minutes</label>
                    <input
                      type="number"
                      min="5"
                      max="120"
                      value={transportConfig.refreshMinutes}
                      onChange={(event) => updateServiceConfig('transport', 'refreshMinutes', parseInt(event.target.value || '30', 10))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                </div>
              </section>

              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Cloud size={24} className="text-cyan-400" />
                  <h2 className="text-lg font-semibold text-white">Routing & Travel Time</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-800">
                    <div>
                      <div className="text-sm font-semibold text-white">Enable route estimates</div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Falls back to local estimates if no provider is configured</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={routingConfig.enabled}
                      onChange={(event) => updateServiceConfig('routing', 'enabled', event.target.checked)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Provider</label>
                    <select
                      value={routingConfig.provider}
                      onChange={(event) => updateServiceConfig('routing', 'provider', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    >
                      <option value="none">None</option>
                      <option value="openrouteservice">OpenRouteService</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Base URL</label>
                    <input
                      type="text"
                      placeholder="Optional. Defaults to https://api.openrouteservice.org"
                      value={routingConfig.baseUrl || ''}
                      onChange={(event) => updateServiceConfig('routing', 'baseUrl', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">API Key</label>
                    <input
                      type="password"
                      placeholder={routingConfig.apiKeyConfigured ? 'Stored securely. Enter to replace.' : 'Paste provider API key'}
                      value={routingConfig.apiKey || ''}
                      onChange={(event) => updateServiceConfig('routing', 'apiKey', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Profile</label>
                      <select
                        value={routingConfig.profile || 'driving-car'}
                        onChange={(event) => updateServiceConfig('routing', 'profile', event.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
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
                        value={routingConfig.refreshMinutes}
                        onChange={(event) => updateServiceConfig('routing', 'refreshMinutes', parseInt(event.target.value || '30', 10))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        />
                      </div>
                    </div>
                </div>
              </section>

              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Monitor size={24} className="text-indigo-400" />
                  <h2 className="text-lg font-semibold text-white">Module Inputs</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Home Assistant URL</label>
                    <input
                      type="text"
                      value={homeAssistantConfig.url || ''}
                      onChange={(event) => updateModuleConfig('home_assistant', 'url', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Home Assistant Token</label>
                    <input
                      type="password"
                      value={homeAssistantConfig.token || ''}
                      onChange={(event) => updateModuleConfig('home_assistant', 'token', event.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Entities</label>
                    <input
                      type="text"
                      value={homeAssistantConfig.entities?.join(', ') || ''}
                      onChange={(event) => updateModuleConfig('home_assistant', 'entities', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Calendar Items</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={calendarModuleConfig.maxItems || 5}
                        onChange={(event) => updateModuleConfig('calendar', 'maxItems', parseInt(event.target.value || '5', 10))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Daily Brief Items</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={dailyBriefConfig.maxItems || 3}
                        onChange={(event) => updateModuleConfig('daily_brief', 'maxItems', parseInt(event.target.value || '3', 10))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Daily Brief Page Seconds</label>
                    <input
                      type="number"
                      min="5"
                      max="30"
                      value={dailyBriefConfig.pageSeconds || 10}
                      onChange={(event) => updateModuleConfig('daily_brief', 'pageSeconds', parseInt(event.target.value || '10', 10))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Calendar View</label>
                      <select
                        value={calendarModuleConfig.viewMode || 'list'}
                        onChange={(event) => updateModuleConfig('calendar', 'viewMode', event.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      >
                        <option value="list">Agenda list</option>
                        <option value="day_cards">Day cards</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Days to Show</label>
                      <select
                        value={calendarModuleConfig.daysToShow || 4}
                        onChange={(event) => updateModuleConfig('calendar', 'daysToShow', parseInt(event.target.value, 10))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      >
                        {[1, 2, 3, 4, 5, 6, 7].map((days) => (
                          <option key={days} value={days}>{days === 7 ? 'Full week' : `${days} day${days === 1 ? '' : 's'}`}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </section>
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
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-60"
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
      </div>
    </div>
  );
}

export default App;
