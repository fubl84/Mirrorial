import React, { useEffect, useRef } from 'react';

const MirrorPreview = ({
  config,
  resolution,
  occupancy = [],
  selectedModuleId = null,
  overlapModuleIds = [],
  onSelectModule,
  onPlaceModule,
  onResizeModule,
}) => {
  if (!config) return null;

  const { theme } = config;
  const containerRef = useRef(null);
  const dragStateRef = useRef(null);
  const gridLayout = config.gridLayout || {
    columns: 4,
    rows: 8,
    gap: 16,
    modules: [],
  };

  const style = {
    fontFamily: theme.fontFamily,
    color: theme.primaryColor,
    backgroundColor: 'black',
    fontSize: `${theme.fontSizeBase}px`,
    display: 'grid',
    gridTemplateColumns: `repeat(${gridLayout.columns || 4}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${gridLayout.rows || 8}, minmax(0, 1fr))`,
    gap: `${gridLayout.gap || 16}px`,
  };
  const overlapSet = new Set(overlapModuleIds || []);
  const selectedModule = (gridLayout.modules || []).find((module) => module.id === selectedModuleId) || null;
  const selectedCells = new Set();

  if (selectedModule) {
    for (let row = selectedModule.y || 0; row < (selectedModule.y || 0) + (selectedModule.h || 1); row += 1) {
      for (let col = selectedModule.x || 0; col < (selectedModule.x || 0) + (selectedModule.w || 1); col += 1) {
        selectedCells.add(`${col}:${row}`);
      }
    }
  }

  useEffect(() => {
    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!dragState || !rect) {
        return;
      }

      const columnWidth = rect.width / Math.max(1, gridLayout.columns || 1);
      const rowHeight = rect.height / Math.max(1, gridLayout.rows || 1);
      const rawColumn = Math.floor((event.clientX - rect.left) / Math.max(1, columnWidth));
      const rawRow = Math.floor((event.clientY - rect.top) / Math.max(1, rowHeight));
      const column = Math.min(Math.max(rawColumn, 0), Math.max(0, (gridLayout.columns || 1) - 1));
      const row = Math.min(Math.max(rawRow, 0), Math.max(0, (gridLayout.rows || 1) - 1));

      if (dragState.mode === 'move') {
        const nextX = Math.min(
          Math.max(column - dragState.anchorColumn, 0),
          Math.max(0, (gridLayout.columns || 1) - dragState.module.w)
        );
        const nextY = Math.min(
          Math.max(row - dragState.anchorRow, 0),
          Math.max(0, (gridLayout.rows || 1) - dragState.module.h)
        );
        if (nextX !== dragState.lastX || nextY !== dragState.lastY) {
          dragState.lastX = nextX;
          dragState.lastY = nextY;
          onPlaceModule?.(dragState.module.id, nextX, nextY);
        }
      }

      if (dragState.mode === 'resize') {
        const nextWidth = Math.min(
          Math.max(column - dragState.module.x + 1, 1),
          Math.max(1, (gridLayout.columns || 1) - dragState.module.x)
        );
        const nextHeight = Math.min(
          Math.max(row - dragState.module.y + 1, 1),
          Math.max(1, (gridLayout.rows || 1) - dragState.module.y)
        );
        if (nextWidth !== dragState.lastWidth || nextHeight !== dragState.lastHeight) {
          dragState.lastWidth = nextWidth;
          dragState.lastHeight = nextHeight;
          onResizeModule?.(dragState.module.id, nextWidth, nextHeight);
        }
      }
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [gridLayout.columns, gridLayout.rows, onPlaceModule, onResizeModule]);

  const startMove = (event, module) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    event.preventDefault();
    onSelectModule?.(module.id);
    const columnWidth = rect.width / Math.max(1, gridLayout.columns || 1);
    const rowHeight = rect.height / Math.max(1, gridLayout.rows || 1);
    const pointerColumn = Math.min(Math.max(Math.floor((event.clientX - rect.left) / Math.max(1, columnWidth)), 0), Math.max(0, (gridLayout.columns || 1) - 1));
    const pointerRow = Math.min(Math.max(Math.floor((event.clientY - rect.top) / Math.max(1, rowHeight)), 0), Math.max(0, (gridLayout.rows || 1) - 1));

    dragStateRef.current = {
      mode: 'move',
      module,
      anchorColumn: pointerColumn - (module.x || 0),
      anchorRow: pointerRow - (module.y || 0),
      lastX: module.x || 0,
      lastY: module.y || 0,
    };
  };

  const startResize = (event, module) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectModule?.(module.id);
    dragStateRef.current = {
      mode: 'resize',
      module,
      lastWidth: module.w || 1,
      lastHeight: module.h || 1,
    };
  };

  const aspectRatio = resolution?.width && resolution?.height
    ? `${resolution.width} / ${resolution.height}`
    : '9 / 16';

  return (
    <div
      className="bg-black rounded-3xl border-[8px] border-slate-800 shadow-2xl overflow-hidden p-6 w-full"
      style={{ aspectRatio }}
    >
      <div ref={containerRef} className="w-full h-full relative grid select-none" style={style}>
        {Array.from({ length: gridLayout.rows || 8 }).flatMap((_, rowIndex) => (
          Array.from({ length: gridLayout.columns || 4 }).map((_, columnIndex) => {
            const cellModuleIds = occupancy[rowIndex]?.[columnIndex] || [];
            const isOccupied = cellModuleIds.length > 0;
            const isOverlapping = cellModuleIds.length > 1;
            const isSelected = selectedCells.has(`${columnIndex}:${rowIndex}`);

            return (
              <button
                type="button"
                key={`cell-${columnIndex}-${rowIndex}`}
                onClick={() => onPlaceModule?.(selectedModuleId, columnIndex, rowIndex)}
                className={`rounded-xl border transition-colors ${
                  isOverlapping
                    ? 'border-amber-400/80 bg-amber-500/15'
                    : isSelected
                      ? 'border-indigo-400/80 bg-indigo-500/15'
                      : isOccupied
                        ? 'border-sky-400/40 bg-sky-500/8'
                        : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
                style={{
                  gridColumn: `${columnIndex + 1} / span 1`,
                  gridRow: `${rowIndex + 1} / span 1`,
                }}
                title={cellModuleIds.length ? `Occupied by ${cellModuleIds.length} module${cellModuleIds.length === 1 ? '' : 's'}` : `Place selected module at ${columnIndex}, ${rowIndex}`}
              />
            );
          })
        ))}
        {(gridLayout.modules || []).map((mod, index) => (
          <div
            key={mod.id || `${mod.type}-${index}`}
            onClick={() => onSelectModule?.(mod.id)}
            onPointerDown={(event) => startMove(event, mod)}
            className={`relative rounded-[24px] border p-4 overflow-hidden text-left transition-all z-10 ${
              selectedModuleId === mod.id
                ? 'border-indigo-400 shadow-lg shadow-indigo-500/10 bg-white/10 cursor-move'
                : overlapSet.has(mod.id)
                  ? 'border-amber-400/80 bg-white/10 cursor-move'
                  : 'border-white/10 bg-white/5 cursor-move'
            }`}
            style={{
              gridColumn: `${(mod.x || 0) + 1} / span ${mod.w || 1}`,
              gridRow: `${(mod.y || 0) + 1} / span ${mod.h || 1}`,
            }}
            title="Click to select this module"
          >
            <ModulePreview type={mod.type} theme={theme} module={mod} />
            {selectedModuleId === mod.id && (
              <button
                type="button"
                onPointerDown={(event) => startResize(event, mod)}
                className="absolute bottom-2 right-2 w-7 h-7 rounded-full border border-indigo-300/60 bg-indigo-500/30 text-indigo-100 text-[10px] font-bold flex items-center justify-center cursor-se-resize"
                title="Drag to resize"
              >
                ↘
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const getDensity = (module) => {
  const area = (module.w || 1) * (module.h || 1);
  if (area >= 9 || (module.w || 1) >= 4 || (module.h || 1) >= 4) return 'expanded';
  if (area >= 4) return 'medium';
  return 'compact';
};

const getClockVariant = (module) => {
  const width = module.w || 1;
  const height = module.h || 1;
  const aspect = width / Math.max(height, 1);

  if (height <= 1 || aspect >= 3.4) return 'banner';
  if (aspect >= 2) return 'split';
  if ((width * height) <= 2) return 'compact';
  return 'hero';
};

const getWeatherVariant = (module) => {
  const width = module.w || 1;
  const height = module.h || 1;
  const aspect = width / Math.max(height, 1);

  if (height <= 1) return 'compact';
  if (aspect >= 2) return 'panorama';
  return 'card';
};

const buildClockPreviewMeta = () => ({
  weekdayShort: 'MO.',
  weekdayLong: 'MONTAG',
  date: '23. März',
  quarter: '1. QUARTAL',
  week: 'KW 4',
});

const ModulePreview = ({ type, theme, module }) => {
  const density = getDensity(module);

  switch (type) {
    case 'clock': {
      const variant = getClockVariant(module);
      const meta = buildClockPreviewMeta();

      if (variant === 'banner') {
        if (module.align === 'center') {
          return (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-5">
                <div className="text-right leading-tight">
                  <div className="text-xl font-bold">{meta.weekdayLong}</div>
                  <div className="text-lg font-bold" style={{ color: theme.accentColor }}>{meta.date}</div>
                </div>
                <div className="text-6xl font-bold leading-none">10:27</div>
                <div className="leading-tight">
                  <div className="text-xl font-bold">{meta.quarter}</div>
                  <div className="text-lg font-bold" style={{ color: theme.accentColor }}>{meta.week}</div>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="flex h-full items-center justify-between gap-3">
            <div className="text-5xl font-bold leading-none">12:45</div>
            <div className="text-right">
              <div className="text-base font-bold">{meta.weekdayShort}</div>
              <div className="text-[11px] opacity-60" style={{ color: theme.secondaryColor }}>{meta.date} • Q1 • {meta.week}</div>
            </div>
          </div>
        );
      }

      if (variant === 'split') {
        return (
          <div className="flex h-full items-center gap-4">
            <div className="text-6xl font-bold leading-none">12:45</div>
            <div>
              <div className="text-sm font-semibold">Sunday, 15 March</div>
              <div className="text-[11px] opacity-60 mt-1" style={{ color: theme.secondaryColor }}>Q1 • {meta.week}</div>
            </div>
          </div>
        );
      }

      if (variant === 'compact') {
        return (
          <div className="flex h-full items-center justify-between">
            <div className="text-3xl font-bold leading-none">12:45</div>
            <div className="text-right">
              <div className="text-sm font-bold">SUN</div>
              <div className="text-[10px] opacity-60" style={{ color: theme.secondaryColor }}>15 Mar</div>
            </div>
          </div>
        );
      }

      return (
          <div className="flex flex-col h-full justify-center">
            <div className="text-7xl font-bold leading-none mb-2">12:45</div>
            <div className="text-base" style={{ color: theme.accentColor }}>Sunday, 15 March</div>
          <div className="text-xs mt-2 opacity-60" style={{ color: theme.secondaryColor }}>Q1 • {meta.week}</div>
        </div>
      );
    }
    case 'weather':
    {
      const variant = getWeatherVariant(module);
      const forecastDays = variant === 'panorama' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Mon', 'Tue', 'Wed'];
      const justifyClass = module.align === 'center'
        ? 'justify-center'
        : module.align === 'end'
          ? 'justify-end'
          : 'justify-start';

      if (variant === 'compact') {
        return (
          <div className="flex h-full items-center gap-3">
            <div className="text-3xl">☀️</div>
            <div className="flex-1">
              <div className="text-2xl font-bold leading-none">22°</div>
              <div className="text-[10px] opacity-70" style={{ color: theme.secondaryColor }}>Feels 20°</div>
            </div>
          </div>
        );
      }

      return (
        <div className="flex flex-col h-full">
          <div className={`flex ${justifyClass}`}>
            <div className="flex items-center gap-3">
              <div className={`${variant === 'panorama' ? 'text-5xl' : 'text-4xl'} leading-none`}>☀️</div>
              <div className="min-w-0">
                <div className={`${variant === 'panorama' ? 'text-lg' : 'text-base'} font-semibold truncate`}>Hamburg</div>
                <div className="text-xs opacity-70 truncate" style={{ color: theme.secondaryColor }}>Klar</div>
              </div>
              <div className="text-right">
                <div className={`${variant === 'panorama' ? 'text-5xl' : 'text-4xl'} font-bold leading-none`}>22°</div>
                <div className="text-xs opacity-70" style={{ color: theme.secondaryColor }}>Gefühlt 20°</div>
              </div>
              <div className="inline-flex max-w-[180px] rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] leading-tight" style={{ color: theme.secondaryColor }}>
                Wolken werden dichter in ~2 Std.
              </div>
            </div>
          </div>
          <div className={`mt-3 grid flex-1 gap-2 ${variant === 'panorama' ? 'grid-cols-7' : 'grid-cols-3'}`}>
            {forecastDays.map((day) => (
              <div key={day} className="rounded-xl bg-white/5 px-2 py-2 text-center flex flex-col justify-center">
                <div className={`${variant === 'panorama' ? 'text-xs' : 'text-[11px]'} opacity-70 font-medium`} style={{ color: theme.secondaryColor }}>{day}</div>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <div className={`${variant === 'panorama' ? 'text-xl' : 'text-lg'}`}>☀️</div>
                  <div className="text-left leading-tight">
                    <div className={`${variant === 'panorama' ? 'text-sm' : 'text-[13px]'} font-semibold`}>24°</div>
                    <div className={`${variant === 'panorama' ? 'text-xs' : 'text-[11px]'} opacity-60`} style={{ color: theme.secondaryColor }}>16°</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'home_assistant':
      return density === 'expanded' ? (
        <div className="flex flex-col gap-3 h-full">
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme.accentColor }}>Smart Home</div>
          <div className="grid grid-cols-2 gap-2 mt-auto">
            {[
              ['Living Room', 'ON'],
              ['Thermostat', '21°C'],
              ['Hall Light', 'OFF'],
              ['Door', 'LOCK'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white/5 p-3">
                <div className="text-sm">{label}</div>
                <div className="text-xs font-bold mt-1" style={{ color: theme.accentColor }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 h-full">
          {density !== 'compact' && <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme.accentColor }}>Smart Home</div>}
          <div className="flex items-center justify-between">
            <span className="text-sm">Living Room</span>
            <span className="text-xs font-bold" style={{ color: theme.accentColor }}>ON</span>
          </div>
          {density !== 'compact' && (
            <div className="flex items-center justify-between">
              <span className="text-sm">Thermostat</span>
              <span className="text-xs font-bold" style={{ color: theme.accentColor }}>21°C</span>
            </div>
          )}
        </div>
      );
    case 'calendar':
    {
      const useDayCards = module.config?.viewMode === 'day_cards' && density !== 'compact';
      if (!useDayCards) {
        return (
          <div className="flex flex-col gap-3 h-full">
            {density !== 'compact' && <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme.accentColor }}>Upcoming</div>}
            {['Project Meeting', 'School pickup', 'Dinner'].slice(0, density === 'compact' ? 2 : 3).map((title) => (
              <div key={title} className="flex gap-3 items-center">
                <div className="w-1 h-6 rounded-full" style={{ backgroundColor: theme.accentColor }}></div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{title}</div>
                  <div className="text-[10px] opacity-60" style={{ color: theme.secondaryColor }}>14:00</div>
                </div>
              </div>
            ))}
          </div>
        );
      }

      const dayCount = Math.max(1, Math.min(module.config?.daysToShow || (module.w >= 4 ? 4 : 3), 7));
      const columns = Array.from({ length: dayCount }).map((_, index) => ({
        label: index === 0 ? 'Heute' : index === 1 ? 'Morgen' : ['Mi. 25 Mär', 'Do. 26 Mär', 'Fr. 27 Mär', 'Sa. 28 Mär', 'So. 29 Mär'][index - 2] || 'Mo. 30 Mär',
        allDay: index === 0 ? 'Feiertag • Flo Geburtstag • Müll' : '',
        footer: index === 0 ? 'Letzter Termin bis 20:00' : '',
        events: index === 0
          ? [
              { start: '09:00', end: '11:00', title: 'Cordes Sanitär', color: '#b889ff', active: true, recurring: false },
              { start: '10:45', end: '10:50', title: 'Start Arbeiten', color: '#6f8e8f', active: false, recurring: true },
              { start: '14:30', end: '15:15', title: 'Matthias Niem • Mat', color: '#6f8e8f', active: false, recurring: true },
            ]
          : index === 1
            ? [
                { start: '09:30', end: '09:35', title: 'Start Arbeiten', color: '#6f8e8f', active: false, recurring: true },
              ]
            : [],
      }));

      return (
        <div className="flex h-full gap-2">
          {columns.map((column) => (
            <div key={column.label} className="flex min-w-0 flex-1 flex-col rounded-2xl bg-white/5 p-2">
              <div className="text-[11px] font-bold mb-2">{column.label}</div>
              {column.allDay && (
                <div className="mb-2 rounded-lg border px-2 py-1 text-[9px] font-semibold truncate" style={{ borderColor: `${theme.accentColor}80`, backgroundColor: `${theme.accentColor}20` }}>
                  {column.allDay}
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2">
                {column.events.map((event) => (
                  <div
                    key={`${column.label}-${event.start}-${event.title}`}
                    className="rounded-xl border p-1.5"
                    style={{ borderColor: `${event.color}aa`, backgroundColor: `${event.color}33` }}
                  >
                    <div className="flex gap-2">
                      <div className="w-9 shrink-0 rounded-md bg-black/35 px-1 py-1 text-center text-[9px] font-bold leading-tight">
                        <div>{event.start}</div>
                        <div>{event.end}</div>
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="truncate text-[10px] font-semibold text-black/85">{event.title}</div>
                      </div>
                      {event.recurring && <div className="text-[9px] opacity-70">↻</div>}
                      {event.active && (
                        <div className="rounded-full bg-black/25 px-1.5 py-0.5 text-[8px] font-bold">
                          NOW
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex-1" />
                {column.footer && (
                  <div className="rounded-lg bg-white/90 px-2 py-1 text-center text-[9px] font-bold text-black/80">
                    {column.footer}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'daily_brief':
      return (
        <div className="flex flex-col gap-2 h-full">
          {density !== 'compact' && <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme.accentColor }}>AI / Daily Brief</div>}
          <div className="text-sm font-medium">Athens trip starts tomorrow</div>
          <div className="text-[10px] opacity-60" style={{ color: theme.secondaryColor }}>22-27C, sunny, local time 14:20</div>
          {density === 'expanded' && (
            <>
              <div className="text-sm">Mia needs about 32 min to reach school.</div>
              <div className="text-sm">Zoo Hagenbeck weather: 18-23C, clear.</div>
            </>
          )}
        </div>
      );
    default:
      return null;
  }
};

export default MirrorPreview;
