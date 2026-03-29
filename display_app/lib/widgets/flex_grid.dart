import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../layout/layout_helpers.dart';
import '../services/config_service.dart';
import '../module_registry.dart';
import 'modules/rotating_module_container.dart';

class FlexGrid extends ConsumerWidget {
  const FlexGrid({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final configAsync = ref.watch(configStreamProvider);

    return configAsync.when(
      data: (config) {
        final grid = normalizeGridLayout(config);
        final columns = grid['columns'] as int;
        final rows = grid['rows'] as int;
        final gap = (grid['gap'] as num).toDouble();
        final modules = (grid['modules'] as List).whereType<Map<String, dynamic>>().toList();

        return LayoutBuilder(
          builder: (context, constraints) {
            final contentWidth = constraints.maxWidth.isFinite ? constraints.maxWidth : MediaQuery.of(context).size.width;
            final contentHeight = constraints.maxHeight.isFinite ? constraints.maxHeight : MediaQuery.of(context).size.height;
            final safeGap = gap.clamp(0, 48);
            final cellWidth = math.max(1.0, (contentWidth - ((columns + 1) * safeGap)) / columns);
            final cellHeight = math.max(1.0, (contentHeight - ((rows + 1) * safeGap)) / rows);

            return Stack(
              children: modules.map((module) {
                final x = (module['x'] as num?)?.toInt() ?? 0;
                final y = (module['y'] as num?)?.toInt() ?? 0;
                final w = math.max(1, (module['w'] as num?)?.toInt() ?? 1);
                final h = math.max(1, (module['h'] as num?)?.toInt() ?? 1);
                final align = module['align']?.toString() ?? 'stretch';
                final left = safeGap + (x * (cellWidth + safeGap));
                final top = safeGap + (y * (cellHeight + safeGap));
                final width = (w * cellWidth) + ((w - 1) * safeGap);
                final height = (h * cellHeight) + ((h - 1) * safeGap);
                final layoutData = ModuleLayoutData(
                  widthUnits: w,
                  heightUnits: h,
                  align: align,
                  bounds: Rect.fromLTWH(left, top, width, height),
                );

                return Positioned(
                  left: left,
                  top: top,
                  width: width,
                  height: height,
                  child: _ModuleShell(
                    align: align,
                    child: module['type']?.toString() == 'module_rotator'
                        ? RotatingModuleContainer(
                            config: (module['config'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{},
                            layoutData: layoutData,
                            rootConfig: config,
                          )
                        : buildModuleFromRegistry(
                            module['type']?.toString() ?? '',
                            (module['config'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{},
                            layoutData: layoutData,
                            rootConfig: config,
                          ),
                  ),
                );
              }).toList(),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, st) => Center(child: Text('Error: $e')),
    );
  }
}

class _ModuleShell extends StatelessWidget {
  final String align;
  final Widget child;

  const _ModuleShell({required this.align, required this.child});

  @override
  Widget build(BuildContext context) {
    final alignment = switch (align) {
      'start' => Alignment.topLeft,
      'center' => Alignment.center,
      'end' => Alignment.bottomRight,
      _ => Alignment.center,
    };

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: align == 'stretch'
          ? child
          : Align(
              alignment: alignment,
              child: child,
            ),
    );
  }
}
