import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Settings, RefreshCcw, Power, Save, Monitor, Layout, Cloud, Plus, Trash2, GripVertical, Info } from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';

const MODULE_TYPES = [
  { id: 'clock', label: 'Clock & Date', icon: '🕒' },
  { id: 'weather', label: 'Weather', icon: '🌤' },
  { id: 'home_assistant', label: 'Home Assistant', icon: '🏠' },
  { id: 'calendar', label: 'Google Calendar', icon: '📅' },
];

function App() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('display'); // display, layout, integrations

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await axios.get(`${API_BASE}/config`);
      setConfig(res.data);
    } catch (err) {
      alert('Failed to fetch config');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/config`, config);
      alert('Config saved successfully!');
    } catch (err) {
      alert('Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const runCommand = async (cmd) => {
    if (!confirm(`Are you sure you want to trigger ${cmd}?`)) return;
    try {
      await axios.post(`${API_BASE}/system/${cmd}`);
      alert(`Command ${cmd} sent`);
    } catch (err) {
      alert('Command failed');
    }
  };

  const addPane = () => {
    const newPane = {
      id: `pane_${Date.now()}`,
      flex: 1,
      modules: []
    };
    setConfig({ ...config, layout: [...config.layout, newPane] });
  };

  const removePane = (paneId) => {
    setConfig({ ...config, layout: config.layout.filter(p => p.id !== paneId) });
  };

  const addModuleToPane = (paneId, type) => {
    const newModule = {
      type,
      config: type === 'weather' ? { location: 'Berlin', apiKey: '' } : 
              type === 'home_assistant' ? { url: '', token: '', entities: [] } : {}
    };
    const newLayout = config.layout.map(p => {
      if (p.id === paneId) {
        return { ...p, modules: [...p.modules, newModule] };
      }
      return p;
    });
    setConfig({ ...config, layout: newLayout });
  };

  const removeModuleFromPane = (paneId, modIndex) => {
    const newLayout = config.layout.map(p => {
      if (p.id === paneId) {
        const newMods = [...p.modules];
        newMods.splice(modIndex, 1);
        return { ...p, modules: newMods };
      }
      return p;
    });
    setConfig({ ...config, layout: newLayout });
  };

  const updateIntegrationConfig = (type, key, value) => {
    const newLayout = JSON.parse(JSON.stringify(config.layout));
    newLayout.forEach(p => p.modules.forEach(m => {
      if (m.type === type) m.config[key] = value;
    }));
    setConfig({ ...config, layout: newLayout });
  };

  const [calAuthStatus, setCalAuthStatus] = useState(false);
  useEffect(() => {
    if (activeTab === 'integrations') {
      axios.get(`${API_BASE}/auth/google/status`).then(res => setCalAuthStatus(res.data.authenticated));
    }
  }, [activeTab]);

  const connectGoogle = async () => {
    try {
      const res = await axios.get(`${API_BASE}/auth/google/url`);
      window.open(res.data.url, '_blank');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start Google Auth. Make sure Client ID/Secret are saved first.');
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">M</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight leading-none">Mirrorial</h1>
              <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">Remote OS v1.0</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={saveConfig}
              disabled={saving}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-500/10 active:scale-95"
            >
              <Save size={18} /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </header>

        <div className="flex gap-1 p-1 bg-slate-900/50 rounded-2xl border border-slate-800 mb-8 overflow-x-auto no-scrollbar">
          {[
            { id: 'display', label: 'System', icon: Monitor },
            { id: 'layout', label: 'Layout Editor', icon: Layout },
            { id: 'styling', label: 'Styling', icon: Settings },
            { id: 'integrations', label: 'Integrations', icon: Cloud },
          ].map(tab => (
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
                <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-white">Display Preferences</h2>
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Refresh Rate</label>
                      <select 
                        value={config.system.fps}
                        onChange={(e) => setConfig({ ...config, system: { ...config.system, fps: parseInt(e.target.value) } })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      >
                        <option value={30}>30 FPS (Standard)</option>
                        <option value={60}>60 FPS (Ultra Smooth)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Rotation</label>
                      <select 
                        value={config.system.rotation}
                        onChange={(e) => setConfig({ ...config, system: { ...config.system, rotation: parseInt(e.target.value) } })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      >
                        <option value={0}>0° - Landscape</option>
                        <option value={90}>90° - Portrait</option>
                        <option value={180}>180° - Landscape (Rev)</option>
                        <option value={270}>270° - Portrait (Rev)</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                <hr className="my-6 border-slate-800" />
                
                <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-white">Power Schedule</h2>
                <div className="space-y-5">
                  <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-800">
                    <div>
                      <div className="text-sm font-semibold text-white">Auto Shutdown</div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Shut down the Pi daily</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={config.system.power?.autoShutdownEnabled || false}
                        onChange={(e) => setConfig({ ...config, system: { ...config.system, power: { ...config.system.power, autoShutdownEnabled: e.target.checked } } })}
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                  
                  <div className={config.system.power?.autoShutdownEnabled ? 'block' : 'opacity-40 pointer-events-none'}>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Shutdown Time (24h)</label>
                    <input 
                      type="time" 
                      value={config.system.power?.autoShutdownTime || '23:00'}
                      onChange={(e) => setConfig({ ...config, system: { ...config.system, power: { ...config.system.power, autoShutdownTime: e.target.value } } })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm text-white"
                    />
                  </div>
                </div>
              </section>

              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-white">System Actions</h2>
                <div className="grid grid-cols-1 gap-3">
                  <button onClick={() => runCommand('restart-display')} className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 p-4 rounded-xl transition-all group active:scale-95">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20">
                      <RefreshCcw size={18} className="text-amber-500" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold">Restart Display</div>
                      <div className="text-xs text-slate-500">Restart the Flutter display process</div>
                    </div>
                  </button>
                  <button onClick={() => runCommand('reboot')} className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 p-4 rounded-xl transition-all group active:scale-95">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20">
                      <RefreshCcw size={18} className="text-blue-500" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold">Reboot Pi</div>
                      <div className="text-xs text-slate-500">Full system reboot</div>
                    </div>
                  </button>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'layout' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Pane Configuration</h2>
                  <p className="text-sm text-slate-500">Define the vertical sections of your mirror.</p>
                </div>
                <button 
                  onClick={addPane}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl transition-all active:scale-95 border border-slate-700"
                >
                  <Plus size={18} /> Add Pane
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {config.layout.map((pane, pIdx) => (
                  <div key={pane.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="p-4 bg-slate-800/30 flex items-center justify-between border-b border-slate-800">
                      <div className="flex items-center gap-4">
                        <GripVertical size={20} className="text-slate-600" />
                        <span className="font-bold text-slate-300">Pane #{pIdx + 1}</span>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-500 uppercase font-bold">Size (Flex):</label>
                          <input 
                            type="number"
                            value={pane.flex}
                            onChange={(e) => {
                              const newLayout = [...config.layout];
                              newLayout[pIdx].flex = parseInt(e.target.value) || 1;
                              setConfig({ ...config, layout: newLayout });
                            }}
                            className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                      <button onClick={() => removePane(pane.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {pane.modules.map((mod, mIdx) => (
                        <div key={mIdx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 relative group">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">{MODULE_TYPES.find(t => t.id === mod.type)?.icon}</span>
                            <span className="font-bold text-slate-200 capitalize">{mod.type.replace('_', ' ')}</span>
                          </div>
                          <button 
                            onClick={() => removeModuleFromPane(pane.id, mIdx)}
                            className="absolute top-4 right-4 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      
                      <div className="relative group">
                        <select 
                          value=""
                          onChange={(e) => addModuleToPane(pane.id, e.target.value)}
                          className="w-full h-full min-h-[80px] bg-slate-900/50 border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-400 transition-all cursor-pointer appearance-none px-4 text-center font-medium"
                        >
                          <option value="" disabled>+ Add Module</option>
                          {MODULE_TYPES.map(type => (
                            <option key={type.id} value={type.id}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'styling' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-white">Theme Colors</h2>
                <div className="space-y-4">
                  {[
                    { label: 'Primary (Main Text)', key: 'primaryColor' },
                    { label: 'Secondary (Subtitles)', key: 'secondaryColor' },
                    { label: 'Accent (Icons/Highlights)', key: 'accentColor' },
                  ].map(color => (
                    <div key={color.key} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-800">
                      <label className="text-sm font-medium text-slate-300">{color.label}</label>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-500 uppercase">{config.theme[color.key]}</span>
                        <input 
                          type="color" 
                          value={config.theme[color.key]} 
                          onChange={(e) => setConfig({ ...config, theme: { ...config.theme, [color.key]: e.target.value } })}
                          className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-white">Typography</h2>
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
                      onChange={(e) => setConfig({ ...config, theme: { ...config.theme, fontSizeBase: parseInt(e.target.value) } })}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Font Family</label>
                    <select 
                      value={config.theme.fontFamily}
                      onChange={(e) => setConfig({ ...config, theme: { ...config.theme, fontFamily: e.target.value } })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    >
                      <option value="Roboto">Roboto (Clean)</option>
                      <option value="Inter">Inter (Modern)</option>
                      <option value="Open Sans">Open Sans (Classic)</option>
                      <option value="Montserrat">Montserrat (Stylish)</option>
                    </select>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Weather */}
              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Cloud size={24} className="text-sky-400" />
                  <h2 className="text-lg font-semibold text-white">Weather Integration</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Service Provider</label>
                    <select 
                      value={config.layout.flatMap(p => p.modules).find(m => m.type === 'weather')?.config.provider || 'open-meteo'}
                      onChange={(e) => updateIntegrationConfig('weather', 'provider', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    >
                      <option value="open-meteo">Open-Meteo (Free, No Key Needed)</option>
                      <option value="openweathermap">OpenWeatherMap (Requires API Key)</option>
                    </select>
                  </div>

                  {config.layout.flatMap(p => p.modules).find(m => m.type === 'weather')?.config.provider === 'openweathermap' ? (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">API Key</label>
                        <input 
                          type="password"
                          placeholder="Enter OWM API Key"
                          value={config.layout.flatMap(p => p.modules).find(m => m.type === 'weather')?.config.apiKey || ''}
                          onChange={(e) => updateIntegrationConfig('weather', 'apiKey', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Location City</label>
                        <input 
                          type="text"
                          placeholder="e.g. London"
                          value={config.layout.flatMap(p => p.modules).find(m => m.type === 'weather')?.config.location || ''}
                          onChange={(e) => updateIntegrationConfig('weather', 'location', e.target.value)}
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
                          placeholder="52.52"
                          value={config.layout.flatMap(p => p.modules).find(m => m.type === 'weather')?.config.lat || 52.52}
                          onChange={(e) => updateIntegrationConfig('weather', 'lat', parseFloat(e.target.value))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Longitude</label>
                        <input 
                          type="number"
                          step="0.01"
                          placeholder="13.41"
                          value={config.layout.flatMap(p => p.modules).find(m => m.type === 'weather')?.config.lon || 13.41}
                          onChange={(e) => updateIntegrationConfig('weather', 'lon', parseFloat(e.target.value))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Home Assistant */}
              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                ...
              </section>

              {/* Google Calendar */}
              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Layout size={24} className="text-red-400" />
                  <h2 className="text-lg font-semibold text-white">Google Calendar</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Client ID</label>
                    <input 
                      type="text"
                      placeholder="Enter Google Client ID"
                      value={config.layout.flatMap(p => p.modules).find(m => m.type === 'calendar')?.config.clientId || ''}
                      onChange={(e) => updateIntegrationConfig('calendar', 'clientId', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Client Secret</label>
                    <input 
                      type="password"
                      placeholder="Enter Google Client Secret"
                      value={config.layout.flatMap(p => p.modules).find(m => m.type === 'calendar')?.config.clientSecret || ''}
                      onChange={(e) => updateIntegrationConfig('calendar', 'clientSecret', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    />
                  </div>
                  
                  <div className="pt-2">
                    <button 
                      onClick={connectGoogle}
                      className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl font-bold transition-all ${
                        calAuthStatus ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/10'
                      }`}
                    >
                      {calAuthStatus ? '✓ Google Calendar Connected' : 'Connect Google Calendar'}
                    </button>
                    {calAuthStatus && (
                      <p className="text-[10px] text-slate-500 mt-2 text-center uppercase tracking-tighter">
                        To change account, delete tokens.json on the Pi and reconnect.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

export default App;
