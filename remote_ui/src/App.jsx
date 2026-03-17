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
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
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
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      >
                        <option value={0}>0° - Landscape</option>
                        <option value={90}>90° - Portrait</option>
                        <option value={180}>180° - Landscape (Rev)</option>
                        <option value={270}>270° - Portrait (Rev)</option>
                      </select>
                    </div>
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

          {activeTab === 'integrations' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Weather */}
              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Cloud size={24} className="text-sky-400" />
                  <h2 className="text-lg font-semibold text-white">Weather (OpenWeatherMap)</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">API Key</label>
                    <input 
                      type="password"
                      placeholder="Enter OWM API Key"
                      value={config.layout.flatMap(p => p.modules).find(m => m.type === 'weather')?.config.apiKey || ''}
                      onChange={(e) => updateIntegrationConfig('weather', 'apiKey', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Location City</label>
                    <input 
                      type="text"
                      placeholder="e.g. London"
                      value={config.layout.flatMap(p => p.modules).find(m => m.type === 'weather')?.config.location || ''}
                      onChange={(e) => updateIntegrationConfig('weather', 'location', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                </div>
              </section>

              {/* Home Assistant */}
              <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Monitor size={24} className="text-indigo-400" />
                  <h2 className="text-lg font-semibold text-white">Home Assistant</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Instance URL</label>
                    <input 
                      type="text"
                      placeholder="http://homeassistant.local:8123"
                      value={config.layout.flatMap(p => p.modules).find(m => m.type === 'home_assistant')?.config.url || ''}
                      onChange={(e) => updateIntegrationConfig('home_assistant', 'url', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Long-Lived Access Token</label>
                    <input 
                      type="password"
                      placeholder="Paste HA Token"
                      value={config.layout.flatMap(p => p.modules).find(m => m.type === 'home_assistant')?.config.token || ''}
                      onChange={(e) => updateIntegrationConfig('home_assistant', 'token', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Entity IDs (comma separated)</label>
                    <input 
                      type="text"
                      placeholder="light.living_room, sensor.temp"
                      value={config.layout.flatMap(p => p.modules).find(m => m.type === 'home_assistant')?.config.entities?.join(', ') || ''}
                      onChange={(e) => updateIntegrationConfig('home_assistant', 'entities', e.target.value.split(',').map(s => s.trim()))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
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
