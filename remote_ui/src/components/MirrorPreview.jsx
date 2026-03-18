import React from 'react';

const MirrorPreview = ({ config }) => {
  if (!config) return null;

  const { theme, layout } = config;

  const style = {
    fontFamily: theme.fontFamily,
    color: theme.primaryColor,
    backgroundColor: 'black',
    fontSize: `${theme.fontSizeBase}px`,
  };

  return (
    <div className="aspect-[9/16] bg-black rounded-3xl border-[8px] border-slate-800 shadow-2xl overflow-hidden flex flex-col p-8" style={style}>
      {layout.map((pane, pIdx) => (
        <div 
          key={pane.id} 
          className="flex gap-8 items-center"
          style={{ flex: pane.flex, padding: '1rem' }}
        >
          {pane.modules.map((mod, mIdx) => (
            <div key={mIdx} className="flex-1">
              <ModulePreview type={mod.type} theme={theme} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

const ModulePreview = ({ type, theme }) => {
  switch (type) {
    case 'clock':
      return (
        <div className="flex flex-col">
          <div className="text-5xl font-bold leading-none mb-2">12:45</div>
          <div className="text-sm opacity-60" style={{ color: theme.secondaryColor }}>Sonntag, 15. März</div>
        </div>
      );
    case 'weather':
      return (
        <div className="flex flex-col items-end">
          <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center mb-2">☀️</div>
          <div className="text-3xl font-light">22°C</div>
          <div className="text-xs opacity-60" style={{ color: theme.secondaryColor }}>Berlin</div>
        </div>
      );
    case 'home_assistant':
      return (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme.accentColor }}>Smart Home</div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Living Room</span>
            <span className="text-xs font-bold" style={{ color: theme.accentColor }}>ON</span>
          </div>
        </div>
      );
    case 'calendar':
      return (
        <div className="flex flex-col gap-3">
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme.accentColor }}>Upcoming</div>
          <div className="flex gap-3 items-center">
            <div className="w-1 h-6 rounded-full" style={{ backgroundColor: theme.accentColor }}></div>
            <div className="flex-1">
              <div className="text-sm font-medium">Project Meeting</div>
              <div className="text-[10px] opacity-60" style={{ color: theme.secondaryColor }}>14:00</div>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
};

export default MirrorPreview;
