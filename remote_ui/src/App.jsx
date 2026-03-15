import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Settings, RefreshCcw, Power, Save, Monitor, Layout, Cloud } from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';

function App() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  if (loading) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">M</div>
          <h1 className="text-2xl font-bold tracking-tight">Mirrorial <span className="text-slate-500 font-normal">Remote</span></h1>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-all"
          >
            <Save size={18} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Settings */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Monitor size={20} className="text-indigo-400" /> Display Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Refresh Rate (FPS)</label>
              <select 
                value={config.system.fps}
                onChange={(e) => setConfig({ ...config, system: { ...config.system, fps: parseInt(e.target.value) } })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={30}>30 FPS (Standard)</option>
                <option value={60}>60 FPS (Ultra Smooth)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Screen Rotation</label>
              <select 
                value={config.system.rotation}
                onChange={(e) => setConfig({ ...config, system: { ...config.system, rotation: parseInt(e.target.value) } })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={0}>0° (Landscape)</option>
                <option value={90}>90° (Portrait)</option>
                <option value={180}>180° (Landscape Inverted)</option>
                <option value={270}>270° (Portrait Inverted)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Integration Settings */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Cloud size={20} className="text-indigo-400" /> Integrations</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">OpenWeatherMap API Key</label>
              <input 
                type="password"
                value={config.layout.find(p => p.id === 'top_right')?.modules[0]?.config.apiKey || ''}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </section>

        {/* Maintenance */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Settings size={20} className="text-indigo-400" /> Maintenance</h2>
          <div className="grid grid-cols-1 gap-2">
            <button onClick={() => runCommand('restart-display')} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 p-3 rounded-lg transition-colors">
              <RefreshCcw size={18} className="text-amber-400" /> Restart Display Engine
            </button>
            <button onClick={() => runCommand('reboot')} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 p-3 rounded-lg transition-colors">
              <RefreshCcw size={18} className="text-blue-400" /> Reboot Raspberry Pi
            </button>
            <button onClick={() => runCommand('shutdown')} className="flex items-center gap-2 bg-red-900/20 hover:bg-red-900/30 text-red-400 p-3 rounded-lg transition-colors">
              <Power size={18} /> Shutdown System
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
