import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../layout/layout_helpers.dart';
import '../../services/ha_service.dart';

class HomeAssistantModule extends ConsumerWidget {
  final Map config;
  final ModuleLayoutData? layoutData;

  const HomeAssistantModule({super.key, required this.config, this.layoutData});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entityStates = ref.watch(haProvider);
    final isEnabled = config['enabled'] != false;
    final configuredEntities = parseConfiguredHAEntities(config);
    final density = layoutData?.density ?? ModuleVisualDensity.medium;
    final heightUnits = layoutData?.heightUnits ?? 1;

    if (!isEnabled) {
      return const Center(
        child: Text(
          'Enable Home Assistant in Integrations',
          style: TextStyle(color: Colors.grey),
        ),
      );
    }

    if (configuredEntities.isEmpty) {
      return const Center(
          child: Text('Add entities in Remote UI',
              style: TextStyle(color: Colors.grey)));
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final spacing = density == ModuleVisualDensity.compact ? 10.0 : 12.0;
        final showHeader =
            density != ModuleVisualDensity.compact && heightUnits > 1;
        final availableWidth =
            constraints.maxWidth.isFinite ? constraints.maxWidth : 280.0;
        final availableHeight =
            constraints.maxHeight.isFinite ? constraints.maxHeight : 220.0;
        final headerHeight = showHeader ? 42.0 : 0.0;
        final contentHeight = math.max(1.0, availableHeight - headerHeight);
        final packedLayout = _buildPackedTileLayout(
          entities: configuredEntities,
          availableWidth: availableWidth,
          availableHeight: contentHeight,
          spacing: spacing,
          heightUnits: heightUnits,
        );

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (showHeader) ...[
              Text(
                'Smart Home',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 12),
            ],
            Expanded(
              child: Align(
                alignment: Alignment.topLeft,
                child: SizedBox(
                  width: availableWidth,
                  height: packedLayout.contentHeight,
                  child: Stack(
                    children: packedLayout.placements.map((placement) {
                      final entity = entityStates[placement.config.entityId];
                      return Positioned(
                        left: placement.left,
                        top: placement.top,
                        width: placement.width,
                        height: placement.height,
                        child: _buildTileForPlacement(
                          config: placement.config,
                          entity: entity,
                          density: density,
                          singleRow: packedLayout.rowCount == 1,
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
            ),
            if (packedLayout.hiddenCount > 0 &&
                density != ModuleVisualDensity.compact &&
                heightUnits > 1) ...[
              const SizedBox(height: 10),
              Text(
                '+${packedLayout.hiddenCount} more configured',
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Colors.white54),
              ),
            ],
          ],
        );
      },
    );
  }
}

Widget _buildTileForPlacement({
  required HAConfiguredEntity config,
  required HAEntity? entity,
  required ModuleVisualDensity density,
  required bool singleRow,
}) {
  if (config.displayType == HATileDisplayType.small) {
    return _SmallHomeAssistantTile(
      config: config,
      entity: entity,
    );
  }

  if (singleRow) {
    return _WideHomeAssistantTile(
      config: config,
      entity: entity,
    );
  }

  return _HomeAssistantTile(
    config: config,
    entity: entity,
    density: density,
  );
}

class _PackedTilePlacement {
  final HAConfiguredEntity config;
  final double left;
  final double top;
  final double width;
  final double height;

  const _PackedTilePlacement({
    required this.config,
    required this.left,
    required this.top,
    required this.width,
    required this.height,
  });
}

class _PackedTileLayout {
  final List<_PackedTilePlacement> placements;
  final int hiddenCount;
  final int rowCount;
  final double contentHeight;

  const _PackedTileLayout({
    required this.placements,
    required this.hiddenCount,
    required this.rowCount,
    required this.contentHeight,
  });
}

class _GridItemSpec {
  final HAConfiguredEntity config;
  final int colSpan;
  final int rowSpan;
  final int priorityGroup;
  final int sourceIndex;

  const _GridItemSpec({
    required this.config,
    required this.colSpan,
    required this.rowSpan,
    required this.priorityGroup,
    required this.sourceIndex,
  });
}

class _GridCellPlacement {
  final _GridItemSpec spec;
  final int column;
  final int row;

  const _GridCellPlacement({
    required this.spec,
    required this.column,
    required this.row,
  });
}

_GridItemSpec _specForEntity(
  HAConfiguredEntity config, {
  required int sourceIndex,
  required int rowCount,
}) {
  final (colSpan, rowSpan, priorityGroup) = switch (config.displayType) {
    HATileDisplayType.small => (1, 1, rowCount == 1 ? 0 : 2),
    HATileDisplayType.medium => (2, 1, rowCount == 1 ? 1 : 1),
    HATileDisplayType.large => (2, rowCount > 1 ? 2 : 1, rowCount == 1 ? 2 : 0),
  };

  return _GridItemSpec(
    config: config,
    colSpan: colSpan,
    rowSpan: rowSpan,
    priorityGroup: priorityGroup,
    sourceIndex: sourceIndex,
  );
}

List<_GridCellPlacement> _packGridItems({
  required List<_GridItemSpec> specs,
  required int columns,
  required int rows,
}) {
  final sortedSpecs = [...specs]..sort((left, right) {
      if (left.priorityGroup != right.priorityGroup) {
        return left.priorityGroup.compareTo(right.priorityGroup);
      }
      if (rows > 1 && left.rowSpan != right.rowSpan) {
        return right.rowSpan.compareTo(left.rowSpan);
      }
      if (left.colSpan != right.colSpan) {
        return right.colSpan.compareTo(left.colSpan);
      }
      return left.sourceIndex.compareTo(right.sourceIndex);
    });

  final occupied = List.generate(
    rows,
    (_) => List.generate(columns, (_) => false),
  );
  final placements = <_GridCellPlacement>[];

  for (final spec in sortedSpecs) {
    for (var row = 0; row <= rows - spec.rowSpan; row += 1) {
      var placed = false;
      for (var column = 0; column <= columns - spec.colSpan; column += 1) {
        if (_canPlaceSpec(
          occupied: occupied,
          row: row,
          column: column,
          rowSpan: spec.rowSpan,
          colSpan: spec.colSpan,
        )) {
          _markSpecOccupied(
            occupied: occupied,
            row: row,
            column: column,
            rowSpan: spec.rowSpan,
            colSpan: spec.colSpan,
          );
          placements.add(
            _GridCellPlacement(
              spec: spec,
              column: column,
              row: row,
            ),
          );
          placed = true;
          break;
        }
      }
      if (placed) {
        break;
      }
    }
  }

  return placements;
}

bool _canPlaceSpec({
  required List<List<bool>> occupied,
  required int row,
  required int column,
  required int rowSpan,
  required int colSpan,
}) {
  for (var r = row; r < row + rowSpan; r += 1) {
    for (var c = column; c < column + colSpan; c += 1) {
      if (occupied[r][c]) {
        return false;
      }
    }
  }
  return true;
}

void _markSpecOccupied({
  required List<List<bool>> occupied,
  required int row,
  required int column,
  required int rowSpan,
  required int colSpan,
}) {
  for (var r = row; r < row + rowSpan; r += 1) {
    for (var c = column; c < column + colSpan; c += 1) {
      occupied[r][c] = true;
    }
  }
}

_PackedTileLayout _buildPackedTileLayout({
  required List<HAConfiguredEntity> entities,
  required double availableWidth,
  required double availableHeight,
  required double spacing,
  required int heightUnits,
}) {
  final rowCount = heightUnits > 1 ? 2 : 1;
  final minCellSize = rowCount == 1 ? 48.0 : 58.0;
  final maxColumns = math.max(1, math.min(10, entities.length * 2));

  var bestCellSize = 0.0;
  List<_GridCellPlacement> bestPlacements = const [];

  for (var columns = 1; columns <= maxColumns; columns += 1) {
    final widthCellSize =
        (availableWidth - ((columns - 1) * spacing)) / columns;
    final heightCellSize =
        (availableHeight - ((rowCount - 1) * spacing)) / rowCount;
    final cellSize = math.min(widthCellSize, heightCellSize);

    if (cellSize < minCellSize) {
      continue;
    }

    final specs = entities
        .asMap()
        .entries
        .map(
          (entry) => _specForEntity(
            entry.value,
            sourceIndex: entry.key,
            rowCount: rowCount,
          ),
        )
        .toList();
    final placements = _packGridItems(
      specs: specs,
      columns: columns,
      rows: rowCount,
    );

    if (placements.length > bestPlacements.length ||
        (placements.length == bestPlacements.length &&
            cellSize > bestCellSize)) {
      bestPlacements = placements;
      bestCellSize = cellSize;
    }
  }

  if (bestPlacements.isEmpty) {
    final fallbackCellSize = math.max(
      36.0,
      math.min(
        availableWidth,
        availableHeight,
      ),
    );
    final visibleCount = math.min(entities.length, 1);
    return _PackedTileLayout(
      placements: entities.take(visibleCount).map((entity) {
        return _PackedTilePlacement(
          config: entity,
          left: 0,
          top: 0,
          width: fallbackCellSize,
          height: fallbackCellSize,
        );
      }).toList(),
      hiddenCount: math.max(0, entities.length - visibleCount),
      rowCount: 1,
      contentHeight: fallbackCellSize,
    );
  }

  final placementColumns = bestPlacements.fold<int>(
    1,
    (maxValue, placement) => math.max(
      maxValue,
      placement.column + placement.spec.colSpan,
    ),
  );
  final cellSize = math.min(
    (availableWidth - ((placementColumns - 1) * spacing)) / placementColumns,
    (availableHeight - ((rowCount - 1) * spacing)) / rowCount,
  );
  final placements = bestPlacements.map((placement) {
    return _PackedTilePlacement(
      config: placement.spec.config,
      left: placement.column * (cellSize + spacing),
      top: placement.row * (cellSize + spacing),
      width: (placement.spec.colSpan * cellSize) +
          ((placement.spec.colSpan - 1) * spacing),
      height: (placement.spec.rowSpan * cellSize) +
          ((placement.spec.rowSpan - 1) * spacing),
    );
  }).toList();

  return _PackedTileLayout(
    placements: placements,
    hiddenCount: math.max(0, entities.length - placements.length),
    rowCount: rowCount,
    contentHeight: (rowCount * cellSize) + ((rowCount - 1) * spacing),
  );
}

enum _HATileKind { binary, temperature, humidity, value }

class _HomeAssistantTile extends StatelessWidget {
  final HAConfiguredEntity config;
  final HAEntity? entity;
  final ModuleVisualDensity density;

  const _HomeAssistantTile({
    required this.config,
    required this.entity,
    required this.density,
  });

  @override
  Widget build(BuildContext context) {
    final currentEntity = entity;
    if (currentEntity == null) {
      return _buildUnavailableTile(context);
    }

    final kind = _inferKind(currentEntity);
    final palette = _paletteFor(currentEntity, kind);
    final icon = _resolveIcon(config.icon, currentEntity, kind);
    final isSmall = config.displayType == HATileDisplayType.small;
    final isLarge = config.displayType == HATileDisplayType.large;
    final unit =
        currentEntity.attributes['unit_of_measurement']?.toString() ?? '';
    final stateLabel = _humanizeState(currentEntity.state);
    final valueLabel =
        unit.isEmpty ? currentEntity.state : '${currentEntity.state}$unit';
    final basePadding =
        isLarge ? (density == ModuleVisualDensity.compact ? 14.0 : 16.0) : 12.0;

    if (!isLarge) {
      return _buildMediumCard(
        context: context,
        entity: currentEntity,
        icon: icon,
        palette: palette,
        kind: kind,
        valueLabel: valueLabel,
        stateLabel: stateLabel,
      );
    }

    return Container(
      padding: EdgeInsets.all(basePadding),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(isSmall ? 22 : 26),
        border: Border.all(color: palette.border),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            palette.backgroundTop,
            palette.backgroundBottom,
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: palette.accent.withValues(alpha: 0.12),
            blurRadius: 24,
            offset: const Offset(0, 16),
          ),
        ],
      ),
      child: kind == _HATileKind.binary
          ? _buildBinaryContent(
              context: context,
              entity: currentEntity,
              icon: icon,
              palette: palette,
              stateLabel: stateLabel,
              isSmall: isSmall,
              isLarge: isLarge,
            )
          : _buildValueContent(
              context: context,
              entity: currentEntity,
              icon: icon,
              palette: palette,
              valueLabel: valueLabel,
              unit: unit,
              isSmall: isSmall,
              isLarge: isLarge,
            ),
    );
  }

  Widget _buildUnavailableTile(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compactHeight = constraints.maxHeight.isFinite && constraints.maxHeight < 92;
        final padding = compactHeight ? 10.0 : 16.0;
        final iconSize = compactHeight ? 16.0 : 20.0;
        final gap = compactHeight ? 6.0 : 10.0;

        return Container(
          padding: EdgeInsets.all(padding),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(compactHeight ? 18 : 22),
            border: Border.all(color: Colors.white10),
            color: Colors.white.withValues(alpha: 0.04),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.link_off_rounded, color: Colors.white54, size: iconSize),
              SizedBox(height: gap),
              Text(
                config.entityId,
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: Colors.white70, fontSize: compactHeight ? 11 : null),
                maxLines: compactHeight ? 1 : 2,
                overflow: TextOverflow.ellipsis,
              ),
              SizedBox(height: compactHeight ? 4 : 6),
              Text(
                'Waiting for Home Assistant state',
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Colors.white54, fontSize: compactHeight ? 10 : null),
                maxLines: compactHeight ? 1 : 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildBinaryContent({
    required BuildContext context,
    required HAEntity entity,
    required IconData icon,
    required _HATilePalette palette,
    required String stateLabel,
    required bool isSmall,
    required bool isLarge,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            _IconBadge(icon: icon, palette: palette),
            const Spacer(),
            _StatusPill(
              label: stateLabel.toUpperCase(),
              textColor: palette.accent,
              background: palette.accent.withValues(alpha: 0.14),
            ),
          ],
        ),
        const Spacer(),
        Text(
          entity.friendlyName,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
          maxLines: isSmall ? 2 : 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 6),
        Text(
          isLarge ? entity.entityId : 'Binary state',
          style: Theme.of(context)
              .textTheme
              .bodySmall
              ?.copyWith(color: Colors.white60),
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }

  Widget _buildMediumCard({
    required BuildContext context,
    required HAEntity entity,
    required IconData icon,
    required _HATilePalette palette,
    required _HATileKind kind,
    required String valueLabel,
    required String stateLabel,
  }) {
    final trailingLabel =
        kind == _HATileKind.binary ? stateLabel.toUpperCase() : valueLabel;

    return LayoutBuilder(
      builder: (context, constraints) {
        final compactHeight = constraints.maxHeight.isFinite && constraints.maxHeight < 68;
        final padding = compactHeight ? 8.0 : 12.0;
        final iconBadgeSize = compactHeight ? 28.0 : 36.0;
        final iconSize = compactHeight ? 14.0 : 18.0;
        final gap = compactHeight ? 8.0 : 10.0;
        final titleSize = compactHeight ? 11.0 : 13.0;
        final subtitleSize = compactHeight ? 9.0 : 10.0;
        final trailingSize = compactHeight ? (kind == _HATileKind.binary ? 10.0 : 13.0) : (kind == _HATileKind.binary ? 11.0 : 16.0);

        return Container(
          padding: EdgeInsets.all(padding),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(compactHeight ? 16 : 20),
            border: Border.all(color: palette.border),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                palette.backgroundTop,
                palette.backgroundBottom,
              ],
            ),
            boxShadow: [
              BoxShadow(
                color: palette.accent.withValues(alpha: 0.10),
                blurRadius: 18,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: Row(
            children: [
              _IconBadge(
                icon: icon,
                palette: palette,
                size: iconBadgeSize,
                iconSize: iconSize,
              ),
              SizedBox(width: gap),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entity.friendlyName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: titleSize,
                          ),
                    ),
                    SizedBox(height: compactHeight ? 2 : 4),
                    Text(
                      kind == _HATileKind.binary ? 'Binary state' : entity.entityId,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.white60,
                            fontSize: subtitleSize,
                          ),
                    ),
                  ],
                ),
              ),
              SizedBox(width: gap),
              Flexible(
                child: Text(
                  trailingLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.right,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: trailingSize,
                      ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildValueContent({
    required BuildContext context,
    required HAEntity entity,
    required IconData icon,
    required _HATilePalette palette,
    required String valueLabel,
    required String unit,
    required bool isSmall,
    required bool isLarge,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            _IconBadge(icon: icon, palette: palette),
            const Spacer(),
            if (unit.isNotEmpty)
              _StatusPill(
                label: unit,
                textColor: Colors.white,
                background: Colors.white.withValues(alpha: 0.10),
              ),
          ],
        ),
        const Spacer(),
        Text(
          valueLabel,
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: Colors.white,
                height: 0.95,
                fontSize: isLarge ? 34 : (isSmall ? 24 : 30),
              ),
        ),
        const SizedBox(height: 6),
        Text(
          entity.friendlyName,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                fontWeight: FontWeight.w600,
                color: Colors.white.withValues(alpha: 0.92),
              ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        if (isLarge) ...[
          const SizedBox(height: 4),
          Text(
            entity.entityId,
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: Colors.white60),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ],
    );
  }
}

class _SmallHomeAssistantTile extends StatelessWidget {
  final HAConfiguredEntity config;
  final HAEntity? entity;

  const _SmallHomeAssistantTile({
    required this.config,
    required this.entity,
  });

  @override
  Widget build(BuildContext context) {
    final currentEntity = entity;
    if (currentEntity == null) {
      return LayoutBuilder(
        builder: (context, constraints) {
          final ultraCompact = constraints.maxHeight.isFinite && constraints.maxHeight < 54;
          return Container(
            padding: EdgeInsets.all(ultraCompact ? 6 : 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(ultraCompact ? 14 : 18),
              color: Colors.white.withValues(alpha: 0.04),
              border: Border.all(color: Colors.white10),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.link_off_rounded, color: Colors.white54, size: ultraCompact ? 14 : 18),
                SizedBox(height: ultraCompact ? 4 : 8),
                Text(
                  _smallTileLabel(config.entityId),
                  textAlign: TextAlign.center,
                  maxLines: ultraCompact ? 1 : 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.white60,
                        fontSize: ultraCompact ? 9 : 10,
                        height: 1.1,
                      ),
                ),
              ],
            ),
          );
        },
      );
    }

    final kind = _inferKind(currentEntity);
    final palette = _paletteFor(currentEntity, kind);
    final icon = _resolveIcon(config.icon, currentEntity, kind);
    final isBinary = kind == _HATileKind.binary;
    final shortValue = _smallTileValue(currentEntity, kind);

    return LayoutBuilder(
      builder: (context, constraints) {
        final ultraCompact = constraints.maxHeight.isFinite && constraints.maxHeight < 54;
        final compact = constraints.maxHeight.isFinite && constraints.maxHeight < 68;
        final padding = ultraCompact ? 6.0 : (compact ? 8.0 : 10.0);
        final dotSize = ultraCompact ? 6.0 : 9.0;
        final iconSize = ultraCompact ? 16.0 : (compact ? 18.0 : 22.0);
        final showValue = !isBinary && shortValue.isNotEmpty && !ultraCompact;
        final titleMaxLines = ultraCompact ? 1 : 2;

        return Container(
          padding: EdgeInsets.all(padding),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(ultraCompact ? 14 : 18),
            border: Border.all(color: palette.border),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                palette.backgroundTop,
                palette.backgroundBottom,
              ],
            ),
            boxShadow: [
              BoxShadow(
                color: palette.accent.withValues(alpha: 0.10),
                blurRadius: 18,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.topRight,
                child: Container(
                  width: dotSize,
                  height: dotSize,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: palette.accent,
                  ),
                ),
              ),
              const Spacer(),
              Icon(icon, size: iconSize, color: palette.accent),
              if (showValue) ...[
                SizedBox(height: compact ? 4 : 6),
                Text(
                  shortValue,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: compact ? 10 : 11,
                      ),
                ),
              ],
              const Spacer(),
              Text(
                _smallTileLabel(currentEntity.friendlyName),
                textAlign: TextAlign.center,
                maxLines: titleMaxLines,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.white.withValues(alpha: 0.92),
                      fontWeight: FontWeight.w600,
                      fontSize: ultraCompact ? 8.5 : (compact ? 9.0 : 10.0),
                      height: 1.1,
                    ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _WideHomeAssistantTile extends StatelessWidget {
  final HAConfiguredEntity config;
  final HAEntity? entity;

  const _WideHomeAssistantTile({
    required this.config,
    required this.entity,
  });

  @override
  Widget build(BuildContext context) {
    final currentEntity = entity;
    if (currentEntity == null) {
      return LayoutBuilder(
        builder: (context, constraints) {
          final compactHeight = constraints.maxHeight.isFinite && constraints.maxHeight < 54;
          return Container(
            padding: EdgeInsets.symmetric(horizontal: compactHeight ? 8 : 12, vertical: compactHeight ? 6 : 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(compactHeight ? 14 : 18),
              color: Colors.white.withValues(alpha: 0.04),
              border: Border.all(color: Colors.white10),
            ),
            child: Row(
              children: [
                Icon(Icons.link_off_rounded, color: Colors.white54, size: compactHeight ? 14 : 18),
                SizedBox(width: compactHeight ? 8 : 10),
                Expanded(
                  child: Text(
                    _smallTileLabel(config.entityId),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.white60,
                          fontSize: compactHeight ? 10 : null,
                        ),
                  ),
                ),
              ],
            ),
          );
        },
      );
    }

    final kind = _inferKind(currentEntity);
    final palette = _paletteFor(currentEntity, kind);
    final icon = _resolveIcon(config.icon, currentEntity, kind);
    final trailingLabel = kind == _HATileKind.binary
        ? _humanizeState(currentEntity.state).toUpperCase()
        : _smallTileValue(currentEntity, kind);

    return LayoutBuilder(
      builder: (context, constraints) {
        final compactHeight = constraints.maxHeight.isFinite && constraints.maxHeight < 54;
        final paddingX = compactHeight ? 8.0 : 12.0;
        final paddingY = compactHeight ? 6.0 : 10.0;
        final badgeSize = compactHeight ? 22.0 : 30.0;
        final badgeIconSize = compactHeight ? 12.0 : 16.0;

        return Container(
          padding: EdgeInsets.symmetric(horizontal: paddingX, vertical: paddingY),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(compactHeight ? 14 : 18),
            border: Border.all(color: palette.border),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                palette.backgroundTop,
                palette.backgroundBottom,
              ],
            ),
          ),
          child: Row(
            children: [
              _IconBadge(
                icon: icon,
                palette: palette,
                size: badgeSize,
                iconSize: badgeIconSize,
              ),
              SizedBox(width: compactHeight ? 8 : 10),
              Expanded(
                child: Text(
                  currentEntity.friendlyName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: compactHeight ? 10.5 : 12,
                      ),
                ),
              ),
              if (trailingLabel.isNotEmpty) ...[
                SizedBox(width: compactHeight ? 6 : 8),
                Flexible(
                  child: Text(
                    trailingLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: compactHeight ? 10 : 11,
                        ),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _IconBadge extends StatelessWidget {
  final IconData icon;
  final _HATilePalette palette;
  final double size;
  final double iconSize;

  const _IconBadge({
    required this.icon,
    required this.palette,
    this.size = 42,
    this.iconSize = 21,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: palette.accent.withValues(alpha: 0.16),
        border: Border.all(color: palette.accent.withValues(alpha: 0.28)),
      ),
      child: Icon(icon, size: iconSize, color: palette.accent),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final String label;
  final Color textColor;
  final Color background;

  const _StatusPill({
    required this.label,
    required this.textColor,
    required this.background,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: background,
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
              color: textColor,
            ),
      ),
    );
  }
}

class _HATilePalette {
  final Color accent;
  final Color border;
  final Color backgroundTop;
  final Color backgroundBottom;

  const _HATilePalette({
    required this.accent,
    required this.border,
    required this.backgroundTop,
    required this.backgroundBottom,
  });
}

String _entityDomain(String entityId) {
  final parts = entityId.split('.');
  return parts.isNotEmpty ? parts.first : '';
}

_HATileKind _inferKind(HAEntity entity) {
  final domain = _entityDomain(entity.entityId);
  final deviceClass =
      '${entity.attributes['device_class'] ?? ''}'.toLowerCase();
  final unit =
      '${entity.attributes['unit_of_measurement'] ?? ''}'.toLowerCase();

  if ([
    'light',
    'switch',
    'binary_sensor',
    'input_boolean',
    'fan',
    'lock',
    'cover'
  ].contains(domain)) {
    return _HATileKind.binary;
  }
  if (domain == 'climate' ||
      deviceClass == 'temperature' ||
      unit.contains('°')) {
    return _HATileKind.temperature;
  }
  if (deviceClass == 'humidity' || unit == '%') {
    return _HATileKind.humidity;
  }
  return _HATileKind.value;
}

_HATilePalette _paletteFor(HAEntity entity, _HATileKind kind) {
  final isActive = ['on', 'active', 'home', 'open', 'unlocked']
      .contains(entity.state.toLowerCase());
  switch (kind) {
    case _HATileKind.binary:
      return isActive
          ? const _HATilePalette(
              accent: Color(0xFF86EFAC),
              border: Color(0x3334D399),
              backgroundTop: Color(0xCC0F2419),
              backgroundBottom: Color(0xCC07130E),
            )
          : const _HATilePalette(
              accent: Color(0xFFCBD5E1),
              border: Color(0x26E2E8F0),
              backgroundTop: Color(0xCC151B2A),
              backgroundBottom: Color(0xCC080C12),
            );
    case _HATileKind.temperature:
      return const _HATilePalette(
        accent: Color(0xFFFBBF24),
        border: Color(0x33F59E0B),
        backgroundTop: Color(0xCC271507),
        backgroundBottom: Color(0xCC120903),
      );
    case _HATileKind.humidity:
      return const _HATilePalette(
        accent: Color(0xFF7DD3FC),
        border: Color(0x3338BDF8),
        backgroundTop: Color(0xCC081D2D),
        backgroundBottom: Color(0xCC04111B),
      );
    case _HATileKind.value:
      return const _HATilePalette(
        accent: Color(0xFF67E8F9),
        border: Color(0x3322D3EE),
        backgroundTop: Color(0xCC0B2027),
        backgroundBottom: Color(0xCC061217),
      );
  }
}

IconData _resolveIcon(
    String configuredIcon, HAEntity entity, _HATileKind kind) {
  switch (configuredIcon) {
    case 'lightbulb':
      return Icons.lightbulb_rounded;
    case 'power':
      return Icons.power_settings_new_rounded;
    case 'plug':
      return Icons.power_rounded;
    case 'thermometer':
      return Icons.thermostat_rounded;
    case 'droplets':
      return Icons.water_drop_rounded;
    case 'fan':
      return Icons.air_rounded;
    case 'wind':
      return Icons.air_rounded;
    case 'activity':
      return Icons.sensors_rounded;
    case 'lock':
      return Icons.lock_rounded;
    case 'home':
      return Icons.home_rounded;
    case 'auto':
    default:
      final domain = _entityDomain(entity.entityId);
      if (kind == _HATileKind.temperature) {
        return Icons.thermostat_rounded;
      }
      if (kind == _HATileKind.humidity) {
        return Icons.water_drop_rounded;
      }
      if (domain == 'light') {
        return Icons.lightbulb_rounded;
      }
      if (domain == 'switch' || domain == 'input_boolean') {
        return Icons.power_settings_new_rounded;
      }
      if (domain == 'fan') {
        return Icons.air_rounded;
      }
      if (domain == 'lock') {
        return Icons.lock_rounded;
      }
      return kind == _HATileKind.binary
          ? Icons.toggle_on_rounded
          : Icons.sensors_rounded;
  }
}

String _humanizeState(String rawState) {
  if (rawState.isEmpty) {
    return 'Unknown';
  }

  final normalized = rawState.replaceAll('_', ' ');
  return normalized.substring(0, 1).toUpperCase() + normalized.substring(1);
}

String _smallTileLabel(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return 'Entity';
  }

  return trimmed.length > 24 ? '${trimmed.substring(0, 24)}…' : trimmed;
}

String _smallTileValue(HAEntity entity, _HATileKind kind) {
  if (kind == _HATileKind.binary) {
    return '';
  }

  final unit = entity.attributes['unit_of_measurement']?.toString() ?? '';
  if (unit.isEmpty) {
    return entity.state;
  }
  return '${entity.state}$unit';
}
