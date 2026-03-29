import React, { useEffect, useRef, useState } from "react";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const LEGACY_LAYOUT_REFERENCE = {
  portrait: { columns: 4, rows: 8 },
  landscape: { columns: 6, rows: 4 },
};

const ROTATOR_ANIMATIONS = {
  swipe: "translate-x-0 opacity-100",
  blend: "opacity-100",
  lift: "translate-y-0 scale-100 opacity-100",
  none: "",
};

const resolveRotatorPreviewState = (module, now) => {
  const config = module?.config || {};
  const modules =
    Array.isArray(config.modules) && config.modules.length
      ? config.modules.slice(0, 3)
      : [{ id: "preview-clock", type: "clock", align: "stretch", config: {} }];
  const rotationSeconds = clamp(
    parseInt(config.rotationSeconds || "10", 10),
    3,
    120,
  );

  if (modules.length <= 1) {
    return {
      activeIndex: 0,
      progress: 1,
      modules,
      activeModule: modules[0],
      animation: config.animation || "swipe",
    };
  }

  const intervalMs = rotationSeconds * 1000;
  const elapsedMs = now % (intervalMs * modules.length);
  const activeIndex = Math.floor(elapsedMs / intervalMs) % modules.length;

  return {
    activeIndex,
    progress: (elapsedMs % intervalMs) / intervalMs,
    modules,
    activeModule: modules[activeIndex],
    animation: config.animation || "swipe",
  };
};

const MirrorPreview = ({
  config,
  gridLayout,
  orientation = "portrait",
  resolution,
  occupancy = [],
  selectedModuleId = null,
  overlapModuleIds = [],
  onSelectModule,
  onMoveModule,
  onResizeModule,
}) => {
  if (!config) return null;

  const { theme } = config;
  const containerRef = useRef(null);
  const dragStateRef = useRef(null);
  const [previewNow, setPreviewNow] = useState(() => Date.now());
  const [dragPreview, setDragPreview] = useState(null);
  const [resizePreview, setResizePreview] = useState(null);
  const activeGridLayout = gridLayout ||
    config.gridLayout || {
      columns: 4,
      rows: 8,
      gap: 16,
      modules: [],
    };
  const previewGap = activeGridLayout.gap || 8;

  const style = {
    fontFamily: theme.fontFamily,
    color: theme.primaryColor,
    backgroundColor: "black",
    fontSize: `${theme.fontSizeBase}px`,
    display: "grid",
    gridTemplateColumns: `repeat(${activeGridLayout.columns || 4}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${activeGridLayout.rows || 8}, minmax(0, 1fr))`,
    gap: `${previewGap}px`,
  };
  const overlapSet = new Set(overlapModuleIds || []);
  const selectedModule =
    (activeGridLayout.modules || []).find(
      (module) => module.id === selectedModuleId,
    ) || null;
  const selectedModuleBox = selectedModule
    ? {
        ...selectedModule,
        x:
          dragPreview?.moduleId === selectedModule.id
            ? dragPreview.x
            : selectedModule.x || 0,
        y:
          dragPreview?.moduleId === selectedModule.id
            ? dragPreview.y
            : selectedModule.y || 0,
        w:
          resizePreview?.moduleId === selectedModule.id
            ? resizePreview.w
            : selectedModule.w || 1,
        h:
          resizePreview?.moduleId === selectedModule.id
            ? resizePreview.h
            : selectedModule.h || 1,
      }
    : null;
  const selectedCells = new Set();

  if (selectedModuleBox) {
    for (
      let row = selectedModuleBox.y || 0;
      row < (selectedModuleBox.y || 0) + (selectedModuleBox.h || 1);
      row += 1
    ) {
      for (
        let col = selectedModuleBox.x || 0;
        col < (selectedModuleBox.x || 0) + (selectedModuleBox.w || 1);
        col += 1
      ) {
        selectedCells.add(`${col}:${row}`);
      }
    }
  }

  const modulesOverlap = (left, right) =>
    (left.x || 0) < (right.x || 0) + (right.w || 1) &&
    (left.x || 0) + (left.w || 1) > (right.x || 0) &&
    (left.y || 0) < (right.y || 0) + (right.h || 1) &&
    (left.y || 0) + (left.h || 1) > (right.y || 0);

  const isPlacementValid = (moduleId, x, y, w, h) => {
    const columns = Math.max(1, activeGridLayout.columns || 1);
    const rows = Math.max(1, activeGridLayout.rows || 1);
    if (x < 0 || y < 0 || x + w > columns || y + h > rows) {
      return false;
    }

    return !(activeGridLayout.modules || []).some(
      (module) =>
        module.id !== moduleId &&
        modulesOverlap(
          { x, y, w, h },
          {
            x: module.x || 0,
            y: module.y || 0,
            w: module.w || 1,
            h: module.h || 1,
          },
        ),
    );
  };

  const findNearestPlacement = (moduleId, proposedX, proposedY, w, h) => {
    let bestPlacement = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (
      let y = 0;
      y <= Math.max(0, (activeGridLayout.rows || 1) - h);
      y += 1
    ) {
      for (
        let x = 0;
        x <= Math.max(0, (activeGridLayout.columns || 1) - w);
        x += 1
      ) {
        if (!isPlacementValid(moduleId, x, y, w, h)) {
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

  const findNearestSize = (moduleId, x, y, proposedW, proposedH) => {
    let bestSize = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (
      let width = 1;
      width <= Math.max(1, (activeGridLayout.columns || 1) - x);
      width += 1
    ) {
      for (
        let height = 1;
        height <= Math.max(1, (activeGridLayout.rows || 1) - y);
        height += 1
      ) {
        if (!isPlacementValid(moduleId, x, y, width, height)) {
          continue;
        }

        const distance =
          Math.abs(width - proposedW) + Math.abs(height - proposedH);
        if (!bestSize || distance < bestDistance) {
          bestSize = { w: width, h: height };
          bestDistance = distance;
        }
      }
    }

    return bestSize;
  };

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPreviewNow(Date.now());
    }, 120);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!dragState || !rect) {
        return;
      }

      const columnWidth =
        (rect.width -
          previewGap * Math.max(0, (activeGridLayout.columns || 1) - 1)) /
        Math.max(1, activeGridLayout.columns || 1);
      const rowHeight =
        (rect.height -
          previewGap * Math.max(0, (activeGridLayout.rows || 1) - 1)) /
        Math.max(1, activeGridLayout.rows || 1);
      const rawColumn = Math.floor(
        (event.clientX - rect.left) / Math.max(1, columnWidth + previewGap),
      );
      const rawRow = Math.floor(
        (event.clientY - rect.top) / Math.max(1, rowHeight + previewGap),
      );
      const column = Math.min(
        Math.max(rawColumn, 0),
        Math.max(0, (activeGridLayout.columns || 1) - 1),
      );
      const row = Math.min(
        Math.max(rawRow, 0),
        Math.max(0, (activeGridLayout.rows || 1) - 1),
      );

      if (dragState.mode === "move") {
        const nextX = Math.min(
          Math.max(column - dragState.anchorColumn, 0),
          Math.max(0, (activeGridLayout.columns || 1) - dragState.module.w),
        );
        const nextY = Math.min(
          Math.max(row - dragState.anchorRow, 0),
          Math.max(0, (activeGridLayout.rows || 1) - dragState.module.h),
        );
        const placement = findNearestPlacement(
          dragState.module.id,
          nextX,
          nextY,
          dragState.module.w,
          dragState.module.h,
        );
        if (
          placement &&
          (placement.x !== dragState.lastX || placement.y !== dragState.lastY)
        ) {
          dragState.lastX = placement.x;
          dragState.lastY = placement.y;
          setDragPreview({
            moduleId: dragState.module.id,
            x: placement.x,
            y: placement.y,
          });
        }
      }

      if (dragState.mode === "resize") {
        const nextWidth = Math.min(
          Math.max(column - dragState.module.x + 1, 1),
          Math.max(1, (activeGridLayout.columns || 1) - dragState.module.x),
        );
        const nextHeight = Math.min(
          Math.max(row - dragState.module.y + 1, 1),
          Math.max(1, (activeGridLayout.rows || 1) - dragState.module.y),
        );
        const size = findNearestSize(
          dragState.module.id,
          dragState.module.x || 0,
          dragState.module.y || 0,
          nextWidth,
          nextHeight,
        );
        if (
          size &&
          (size.w !== dragState.lastWidth || size.h !== dragState.lastHeight)
        ) {
          dragState.lastWidth = size.w;
          dragState.lastHeight = size.h;
          setResizePreview({
            moduleId: dragState.module.id,
            w: size.w,
            h: size.h,
          });
        }
      }
    };

    const handlePointerUp = () => {
      const dragState = dragStateRef.current;
      if (
        dragState?.mode === "move" &&
        dragState.lastX !== undefined &&
        dragState.lastY !== undefined
      ) {
        onMoveModule?.(dragState.module.id, dragState.lastX, dragState.lastY);
      }
      if (
        dragState?.mode === "resize" &&
        dragState.lastWidth !== undefined &&
        dragState.lastHeight !== undefined
      ) {
        onResizeModule?.(
          dragState.module.id,
          dragState.lastWidth,
          dragState.lastHeight,
        );
      }
      dragStateRef.current = null;
      setDragPreview(null);
      setResizePreview(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    activeGridLayout.columns,
    activeGridLayout.rows,
    onMoveModule,
    onResizeModule,
    previewGap,
  ]);

  const startMove = (event, module) => {
    if (selectedModuleId !== module.id) {
      onSelectModule?.(module.id);
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    event.preventDefault();
    const columnWidth =
      (rect.width -
        previewGap * Math.max(0, (activeGridLayout.columns || 1) - 1)) /
      Math.max(1, activeGridLayout.columns || 1);
    const rowHeight =
      (rect.height -
        previewGap * Math.max(0, (activeGridLayout.rows || 1) - 1)) /
      Math.max(1, activeGridLayout.rows || 1);
    const pointerColumn = Math.min(
      Math.max(
        Math.floor(
          (event.clientX - rect.left) / Math.max(1, columnWidth + previewGap),
        ),
        0,
      ),
      Math.max(0, (activeGridLayout.columns || 1) - 1),
    );
    const pointerRow = Math.min(
      Math.max(
        Math.floor(
          (event.clientY - rect.top) / Math.max(1, rowHeight + previewGap),
        ),
        0,
      ),
      Math.max(0, (activeGridLayout.rows || 1) - 1),
    );

    dragStateRef.current = {
      mode: "move",
      module,
      anchorColumn: pointerColumn - (module.x || 0),
      anchorRow: pointerRow - (module.y || 0),
      lastX: module.x || 0,
      lastY: module.y || 0,
    };
    setDragPreview({ moduleId: module.id, x: module.x || 0, y: module.y || 0 });
  };

  const startResize = (event, module) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectModule?.(module.id);
    dragStateRef.current = {
      mode: "resize",
      module,
      lastWidth: module.w || 1,
      lastHeight: module.h || 1,
    };
    setResizePreview({
      moduleId: module.id,
      w: module.w || 1,
      h: module.h || 1,
    });
  };

  const aspectRatio =
    resolution?.width && resolution?.height
      ? `${resolution.width} / ${resolution.height}`
      : "9 / 16";

  return (
    <div
      className="w-full overflow-hidden rounded-[30px] border-[10px] border-slate-800 bg-black p-3 shadow-2xl"
      style={{ aspectRatio }}
    >
      <div className="h-full w-full rounded-[24px] bg-black p-[1px]">
        <div
          ref={containerRef}
          className="relative h-full w-full select-none rounded-[22px] bg-black"
          style={{ padding: `${previewGap}px` }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_52%)]" />
          <div className="relative h-full w-full" style={style}>
            {Array.from({ length: activeGridLayout.rows || 8 }).flatMap(
              (_, rowIndex) =>
                Array.from({ length: activeGridLayout.columns || 4 }).map(
                  (_, columnIndex) => {
                    const cellModuleIds =
                      occupancy[rowIndex]?.[columnIndex] || [];
                    const isOccupied = cellModuleIds.length > 0;
                    const isOverlapping = cellModuleIds.length > 1;
                    const isSelected = selectedCells.has(
                      `${columnIndex}:${rowIndex}`,
                    );

                    return (
                      <div
                        key={`cell-${columnIndex}-${rowIndex}`}
                        className={`pointer-events-none flex items-center justify-center rounded-[10px] transition-colors ${
                          isOverlapping
                            ? "bg-amber-500/5"
                            : isSelected
                              ? "bg-indigo-500/5"
                              : isOccupied
                                ? "bg-sky-500/[0.04]"
                                : "bg-transparent"
                        }`}
                        style={{
                          gridColumn: `${columnIndex + 1} / span 1`,
                          gridRow: `${rowIndex + 1} / span 1`,
                        }}
                      >
                        <div
                          className={`rounded-full transition-all ${
                            isOverlapping
                              ? "h-0.5 w-0.5 bg-amber-300/50 shadow-[0_0_6px_rgba(252,211,77,0.35)]"
                              : isSelected
                                ? "h-0.5 w-0.5 bg-indigo-300/10 shadow-[0_0_6px_rgba(165,180,252,0.3)]"
                                : isOccupied
                                  ? "h-0.5 w0.51 bg-sky-200/35"
                                  : "h-0 w-0 bg-transparent"
                          }`}
                        />
                      </div>
                    );
                  },
                ),
            )}
            {(activeGridLayout.modules || []).map((mod, index) => {
              const previewModule = {
                ...mod,
                x:
                  dragPreview?.moduleId === mod.id ? dragPreview.x : mod.x || 0,
                y:
                  dragPreview?.moduleId === mod.id ? dragPreview.y : mod.y || 0,
                w:
                  resizePreview?.moduleId === mod.id
                    ? resizePreview.w
                    : mod.w || 1,
                h:
                  resizePreview?.moduleId === mod.id
                    ? resizePreview.h
                    : mod.h || 1,
              };

              return (
                <div
                  key={previewModule.id || `${previewModule.type}-${index}`}
                  onClick={() => onSelectModule?.(previewModule.id)}
                  onPointerDown={(event) => startMove(event, previewModule)}
                  className={`relative z-10 overflow-hidden rounded-[24px] border p-4 text-left transition-all ${
                    selectedModuleId === previewModule.id
                      ? "cursor-move border-indigo-400 bg-white/10 shadow-lg shadow-indigo-500/10"
                      : overlapSet.has(previewModule.id)
                        ? "cursor-default border-amber-400/80 bg-white/10"
                        : "cursor-default border-white/10 bg-white/5"
                  }`}
                  style={{
                    gridColumn: `${(previewModule.x || 0) + 1} / span ${previewModule.w || 1}`,
                    gridRow: `${(previewModule.y || 0) + 1} / span ${previewModule.h || 1}`,
                  }}
                  title={
                    selectedModuleId === previewModule.id
                      ? "Drag to move this module"
                      : "Click to select this module"
                  }
                >
                  <div className="absolute left-4 top-3 z-10 rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
                    {MODULE_LABELS[previewModule.type] || previewModule.type}
                  </div>
                  <ModulePreview
                    type={previewModule.type}
                    theme={theme}
                    module={previewModule}
                    now={previewNow}
                    gridLayout={activeGridLayout}
                    orientation={orientation}
                    resolution={resolution}
                  />
                  {selectedModuleId === previewModule.id && (
                    <button
                      type="button"
                      onPointerDown={(event) =>
                        startResize(event, previewModule)
                      }
                      className="absolute bottom-2 right-2 flex h-7 w-7 cursor-se-resize items-center justify-center rounded-full border border-indigo-300/60 bg-indigo-500/30 text-[10px] font-bold text-indigo-100"
                      title="Drag to resize"
                    >
                      ↘
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const MODULE_LABELS = {
  clock: "Clock",
  weather: "Weather",
  home_assistant: "Home",
  calendar: "Calendar",
  daily_brief: "Brief",
  module_rotator: "Rotator",
};

const getLogicalSpan = (span, total, axis, orientation = "portrait") => {
  const reference =
    LEGACY_LAYOUT_REFERENCE[orientation] || LEGACY_LAYOUT_REFERENCE.portrait;
  const referenceTotal = axis === "x" ? reference.columns : reference.rows;
  return Math.max(
    1,
    Math.round((span / Math.max(1, total || 1)) * referenceTotal),
  );
};

const getApproxModuleBounds = (module, gridLayout, resolution) => {
  const columns = Math.max(1, gridLayout?.columns || 1);
  const rows = Math.max(1, gridLayout?.rows || 1);
  const gap = gridLayout?.gap || 8;
  const width = resolution?.width || 1080;
  const height = resolution?.height || 1920;
  const cellWidth = Math.max(1, (width - (columns + 1) * gap) / columns);
  const cellHeight = Math.max(1, (height - (rows + 1) * gap) / rows);

  return {
    width: (module.w || 1) * cellWidth + Math.max(0, (module.w || 1) - 1) * gap,
    height:
      (module.h || 1) * cellHeight + Math.max(0, (module.h || 1) - 1) * gap,
  };
};

const getDensity = (module, gridLayout, orientation) => {
  const logicalW = getLogicalSpan(
    module.w || 1,
    gridLayout?.columns || 1,
    "x",
    orientation,
  );
  const logicalH = getLogicalSpan(
    module.h || 1,
    gridLayout?.rows || 1,
    "y",
    orientation,
  );
  const area = logicalW * logicalH;
  if (area >= 9 || logicalW >= 4 || logicalH >= 4) return "expanded";
  if (area >= 4) return "medium";
  return "compact";
};

const getClockVariant = (module, gridLayout, orientation, resolution) => {
  const width = getLogicalSpan(
    module.w || 1,
    gridLayout?.columns || 1,
    "x",
    orientation,
  );
  const height = getLogicalSpan(
    module.h || 1,
    gridLayout?.rows || 1,
    "y",
    orientation,
  );
  const bounds = getApproxModuleBounds(module, gridLayout, resolution);
  const aspect = width / Math.max(height, 1);

  if (bounds.height <= 120 || aspect >= 3.4) return "banner";
  if (aspect >= 2) return "split";
  if (width * height <= 2) return "compact";
  return "hero";
};

const getWeatherVariant = (module, gridLayout, orientation, resolution) => {
  const width = getLogicalSpan(
    module.w || 1,
    gridLayout?.columns || 1,
    "x",
    orientation,
  );
  const height = getLogicalSpan(
    module.h || 1,
    gridLayout?.rows || 1,
    "y",
    orientation,
  );
  const bounds = getApproxModuleBounds(module, gridLayout, resolution);
  const aspect = width / Math.max(height, 1);
  const density = getDensity(module, gridLayout, orientation);

  if (density === "compact" || bounds.height < 140 || bounds.width < 260)
    return "compact";
  if (density === "expanded" && bounds.width >= 900 && bounds.height >= 420)
    return "hero";
  if (aspect >= 2.4 && bounds.width >= 1180 && bounds.height >= 220)
    return "panorama";
  return "card";
};

const buildClockPreviewMeta = () => ({
  weekdayShort: "MO.",
  weekdayLong: "MONTAG",
  date: "23. März",
  quarter: "1. QUARTAL",
  week: "KW 4",
});

const RotatorIndicator = ({ pageCount, activeIndex, progress }) => (
  <div className="mt-3 flex items-center justify-center gap-2">
    {Array.from({ length: pageCount }).map((_, index) => (
      <div
        key={`rotator-dot-${index}`}
        className={`relative h-2.5 w-2.5 overflow-hidden rounded-full border ${
          index === activeIndex
            ? "border-white/60 bg-white/10"
            : "border-white/20 bg-white/5"
        }`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/80 transition-[width] duration-100"
          style={{
            width: `${index === activeIndex ? Math.max(10, progress * 100) : 0}%`,
          }}
        />
      </div>
    ))}
  </div>
);

const ModulePreview = ({
  type,
  theme,
  module,
  now = Date.now(),
  gridLayout,
  orientation = "portrait",
  resolution,
}) => {
  const density = getDensity(module, gridLayout, orientation);
  const bounds = getApproxModuleBounds(module, gridLayout, resolution);

  switch (type) {
    case "module_rotator": {
      const rotatorState = resolveRotatorPreviewState(module, now);
      const activeModule = {
        ...module,
        ...rotatorState.activeModule,
        type: rotatorState.activeModule?.type || "clock",
        align: rotatorState.activeModule?.align || "stretch",
        config: rotatorState.activeModule?.config || {},
        w: module.w,
        h: module.h,
      };

      return (
        <div className="flex h-full flex-col">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.24em]"
              style={{ color: theme.accentColor }}
            >
              Auto Rotate
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
              {rotatorState.activeIndex + 1} / {rotatorState.modules.length}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] border border-white/10 bg-black/20 p-3">
            <div
              className={`h-full transition-all duration-500 ${ROTATOR_ANIMATIONS[rotatorState.animation] || ""}`}
            >
              <ModulePreview
                type={activeModule.type}
                theme={theme}
                module={activeModule}
                now={now}
                gridLayout={gridLayout}
                orientation={orientation}
                resolution={resolution}
              />
            </div>
          </div>
          <RotatorIndicator
            pageCount={rotatorState.modules.length}
            activeIndex={rotatorState.activeIndex}
            progress={rotatorState.progress}
          />
        </div>
      );
    }
    case "clock": {
      const variant = getClockVariant(
        module,
        gridLayout,
        orientation,
        resolution,
      );
      const meta = buildClockPreviewMeta();

      if (variant === "banner") {
        if (module.align === "center") {
          return (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-5">
                <div className="text-right leading-tight">
                  <div className="text-xl font-bold">{meta.weekdayLong}</div>
                  <div
                    className="text-lg font-bold"
                    style={{ color: theme.accentColor }}
                  >
                    {meta.date}
                  </div>
                </div>
                <div className="text-6xl font-bold leading-none">10:27</div>
                <div className="leading-tight">
                  <div className="text-xl font-bold">{meta.quarter}</div>
                  <div
                    className="text-lg font-bold"
                    style={{ color: theme.accentColor }}
                  >
                    {meta.week}
                  </div>
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
              <div
                className="text-[11px] opacity-60"
                style={{ color: theme.secondaryColor }}
              >
                {meta.date} • Q1 • {meta.week}
              </div>
            </div>
          </div>
        );
      }

      if (variant === "split") {
        return (
          <div className="flex h-full items-center gap-4">
            <div className="text-6xl font-bold leading-none">12:45</div>
            <div>
              <div className="text-sm font-semibold">Sunday, 15 March</div>
              <div
                className="text-[11px] opacity-60 mt-1"
                style={{ color: theme.secondaryColor }}
              >
                Q1 • {meta.week}
              </div>
            </div>
          </div>
        );
      }

      if (variant === "compact") {
        return (
          <div className="flex h-full items-center justify-between">
            <div className="text-3xl font-bold leading-none">12:45</div>
            <div className="text-right">
              <div className="text-sm font-bold">SUN</div>
              <div
                className="text-[10px] opacity-60"
                style={{ color: theme.secondaryColor }}
              >
                15 Mar
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="flex flex-col h-full justify-center">
          <div className="text-7xl font-bold leading-none mb-2">12:45</div>
          <div className="text-base" style={{ color: theme.accentColor }}>
            Sunday, 15 March
          </div>
          <div
            className="text-xs mt-2 opacity-60"
            style={{ color: theme.secondaryColor }}
          >
            Q1 • {meta.week}
          </div>
        </div>
      );
    }
    case "weather": {
      const variant = getWeatherVariant(
        module,
        gridLayout,
        orientation,
        resolution,
      );
      const forecastDays =
        variant === "panorama"
          ? ["Mon", "Tue", "Wed", "Thu", "Fri"]
          : variant === "hero"
            ? ["Mon", "Tue", "Wed", "Thu"]
            : ["Mon", "Tue", "Wed"];
      const justifyClass =
        module.align === "center"
          ? "justify-center"
          : module.align === "end"
            ? "justify-end"
            : "justify-start";

      if (variant === "compact") {
        return (
          <div className="flex h-full items-center gap-3">
            <div className="text-3xl">☀️</div>
            <div className="flex-1">
              <div className="text-2xl font-bold leading-none">22°</div>
              <div
                className="text-[10px] opacity-70"
                style={{ color: theme.secondaryColor }}
              >
                Feels 20°
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="flex flex-col h-full">
          <div className={`flex ${justifyClass}`}>
            <div className="flex items-center gap-3">
              <div
                className={`${variant === "panorama" ? "text-5xl" : "text-4xl"} leading-none`}
              >
                ☀️
              </div>
              <div className="min-w-0">
                <div
                  className={`${variant === "panorama" ? "text-lg" : "text-base"} font-semibold truncate`}
                >
                  Hamburg
                </div>
                <div
                  className="text-xs opacity-70 truncate"
                  style={{ color: theme.secondaryColor }}
                >
                  Klar
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`${variant === "panorama" ? "text-5xl" : "text-4xl"} font-bold leading-none`}
                >
                  22°
                </div>
                <div
                  className="text-xs opacity-70"
                  style={{ color: theme.secondaryColor }}
                >
                  Gefühlt 20°
                </div>
              </div>
              <div
                className="inline-flex max-w-[180px] rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] leading-tight"
                style={{ color: theme.secondaryColor }}
              >
                Wolken werden dichter in ~2 Std.
              </div>
            </div>
          </div>
          <div
            className={`mt-3 grid flex-1 gap-2 ${variant === "panorama" ? "grid-cols-5" : variant === "hero" ? "grid-cols-4" : "grid-cols-3"}`}
          >
            {forecastDays.map((day) => (
              <div
                key={day}
                className="rounded-xl bg-white/5 px-2 py-2 text-center flex flex-col justify-center"
              >
                <div
                  className={`${variant === "panorama" ? "text-xs" : "text-[11px]"} opacity-70 font-medium`}
                  style={{ color: theme.secondaryColor }}
                >
                  {day}
                </div>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <div
                    className={`${variant === "panorama" ? "text-xl" : "text-lg"}`}
                  >
                    ☀️
                  </div>
                  <div className="text-left leading-tight">
                    <div
                      className={`${variant === "panorama" ? "text-sm" : "text-[13px]"} font-semibold`}
                    >
                      24°
                    </div>
                    <div
                      className={`${variant === "panorama" ? "text-xs" : "text-[11px]"} opacity-60`}
                      style={{ color: theme.secondaryColor }}
                    >
                      16°
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "home_assistant":
      return density === "expanded" ? (
        <div className="flex flex-col gap-3 h-full">
          <div
            className="text-xs font-bold uppercase tracking-wider mb-1"
            style={{ color: theme.accentColor }}
          >
            Smart Home
          </div>
          <div className="grid grid-cols-2 gap-2 mt-auto">
            {[
              ["Living Room", "ON"],
              ["Thermostat", "21°C"],
              ["Hall Light", "OFF"],
              ["Door", "LOCK"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white/5 p-3">
                <div className="text-sm">{label}</div>
                <div
                  className="text-xs font-bold mt-1"
                  style={{ color: theme.accentColor }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 h-full">
          {density !== "compact" && (
            <div
              className="text-xs font-bold uppercase tracking-wider mb-1"
              style={{ color: theme.accentColor }}
            >
              Smart Home
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm">Living Room</span>
            <span
              className="text-xs font-bold"
              style={{ color: theme.accentColor }}
            >
              ON
            </span>
          </div>
          {density !== "compact" && (
            <div className="flex items-center justify-between">
              <span className="text-sm">Thermostat</span>
              <span
                className="text-xs font-bold"
                style={{ color: theme.accentColor }}
              >
                21°C
              </span>
            </div>
          )}
        </div>
      );
    case "calendar": {
      const dayCount = Math.max(
        1,
        Math.min(module.config?.daysToShow || (module.w >= 4 ? 4 : 3), 7),
      );
      const useDayCards =
        module.config?.viewMode === "day_cards" &&
        density !== "compact" &&
        bounds.height >= 240 &&
        bounds.width / dayCount >= 130;
      if (!useDayCards) {
        return (
          <div className="flex flex-col gap-3 h-full">
            {density !== "compact" && (
              <div
                className="text-xs font-bold uppercase tracking-wider mb-1"
                style={{ color: theme.accentColor }}
              >
                Upcoming
              </div>
            )}
            {["Project Meeting", "School pickup", "Dinner"]
              .slice(0, density === "compact" ? 2 : 3)
              .map((title) => (
                <div key={title} className="flex gap-3 items-center">
                  <div
                    className="w-1 h-6 rounded-full"
                    style={{ backgroundColor: theme.accentColor }}
                  ></div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{title}</div>
                    <div
                      className="text-[10px] opacity-60"
                      style={{ color: theme.secondaryColor }}
                    >
                      14:00
                    </div>
                  </div>
                </div>
              ))}
          </div>
        );
      }
      const columns = Array.from({ length: dayCount }).map((_, index) => ({
        label:
          index === 0
            ? "Heute"
            : index === 1
              ? "Morgen"
              : [
                  "Mi. 25 Mär",
                  "Do. 26 Mär",
                  "Fr. 27 Mär",
                  "Sa. 28 Mär",
                  "So. 29 Mär",
                ][index - 2] || "Mo. 30 Mär",
        allDay: index === 0 ? "Feiertag • Flo Geburtstag • Müll" : "",
        footer: index === 0 ? "Letzter Termin bis 20:00" : "",
        events:
          index === 0
            ? [
                {
                  start: "09:00",
                  end: "11:00",
                  title: "Cordes Sanitär",
                  color: "#b889ff",
                  active: true,
                  recurring: false,
                },
                {
                  start: "10:45",
                  end: "10:50",
                  title: "Start Arbeiten",
                  color: "#6f8e8f",
                  active: false,
                  recurring: true,
                },
                {
                  start: "14:30",
                  end: "15:15",
                  title: "Matthias Niem • Mat",
                  color: "#6f8e8f",
                  active: false,
                  recurring: true,
                },
              ]
            : index === 1
              ? [
                  {
                    start: "09:30",
                    end: "09:35",
                    title: "Start Arbeiten",
                    color: "#6f8e8f",
                    active: false,
                    recurring: true,
                  },
                ]
              : [],
      }));

      return (
        <div className="flex h-full gap-2">
          {columns.map((column) => (
            <div
              key={column.label}
              className="flex min-w-0 flex-1 flex-col rounded-2xl bg-white/5 p-2"
            >
              <div className="text-[11px] font-bold mb-2">{column.label}</div>
              {column.allDay && (
                <div
                  className="mb-2 rounded-lg border px-2 py-1 text-[9px] font-semibold truncate"
                  style={{
                    borderColor: `${theme.accentColor}80`,
                    backgroundColor: `${theme.accentColor}20`,
                  }}
                >
                  {column.allDay}
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2">
                {column.events.map((event) => (
                  <div
                    key={`${column.label}-${event.start}-${event.title}`}
                    className="rounded-xl border p-1.5"
                    style={{
                      borderColor: `${event.color}aa`,
                      backgroundColor: `${event.color}33`,
                    }}
                  >
                    <div className="flex gap-2">
                      <div className="w-9 shrink-0 rounded-md bg-black/35 px-1 py-1 text-center text-[9px] font-bold leading-tight">
                        <div>{event.start}</div>
                        <div>{event.end}</div>
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="truncate text-[10px] font-semibold text-black/85">
                          {event.title}
                        </div>
                      </div>
                      {event.recurring && (
                        <div className="text-[9px] opacity-70">↻</div>
                      )}
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
    case "daily_brief":
      return (
        <div className="flex flex-col gap-2 h-full">
          {density !== "compact" && (
            <div
              className="text-xs font-bold uppercase tracking-wider mb-1"
              style={{ color: theme.accentColor }}
            >
              AI / Daily Brief
            </div>
          )}
          <div className="text-sm font-medium">Athens trip starts tomorrow</div>
          <div
            className="text-[10px] opacity-60"
            style={{ color: theme.secondaryColor }}
          >
            22-27C, sunny, local time 14:20
          </div>
          {density === "expanded" && (
            <>
              <div className="text-sm">
                Mia needs about 32 min to reach school.
              </div>
              <div className="text-sm">
                Zoo Hagenbeck weather: 18-23C, clear.
              </div>
            </>
          )}
        </div>
      );
    default:
      return null;
  }
};

export default MirrorPreview;
