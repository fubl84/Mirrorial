import 'package:flutter/material.dart';

const Set<String> _rotatorChildTypes = {
  'clock',
  'weather',
  'home_assistant',
  'calendar',
  'daily_brief',
};

Map<String, dynamic> _normalizeRotatorChildModule(Map<String, dynamic>? module, {int index = 0}) {
  final type = _rotatorChildTypes.contains(module?['type']?.toString()) ? module!['type'].toString() : 'clock';
  final align = switch (module?['align']?.toString()) {
    'start' => 'start',
    'center' => 'center',
    'end' => 'end',
    _ => 'stretch',
  };

  return {
    'id': module?['id']?.toString() ?? 'rotator_${type}_${index + 1}',
    'type': type,
    'align': align,
    'config': (module?['config'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{},
  };
}

Map<String, dynamic> _normalizeRotatorConfig(Map<String, dynamic>? config) {
  final rawModules = (config?['modules'] as List? ?? [])
      .whereType<Map>()
      .map((module) => module.cast<String, dynamic>())
      .toList();
  final normalizedChildren = rawModules
      .asMap()
      .entries
      .map((entry) => _normalizeRotatorChildModule(entry.value, index: entry.key))
      .take(3)
      .toList();

  return {
    'rotationSeconds': ((config?['rotationSeconds'] as num?)?.toInt() ?? 10).clamp(3, 120),
    'animation': switch (config?['animation']?.toString()) {
      'blend' => 'blend',
      'lift' => 'lift',
      'none' => 'none',
      _ => 'swipe',
    },
    'modules': normalizedChildren.isNotEmpty
        ? normalizedChildren
        : <Map<String, dynamic>>[_normalizeRotatorChildModule(const {'type': 'clock'})],
  };
}

Map<String, dynamic> normalizeGridModuleData(Map<String, dynamic> module) {
  final type = module['type']?.toString() ?? '';
  final normalized = {
    ...module,
    'id': module['id']?.toString() ?? type,
    'type': type,
    'config': (module['config'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{},
  };

  if (type == 'module_rotator') {
    return {
      ...normalized,
      'align': 'stretch',
      'config': _normalizeRotatorConfig(normalized['config'] as Map<String, dynamic>),
    };
  }

  return {
    ...normalized,
    'align': switch (module['align']?.toString()) {
      'start' => 'start',
      'center' => 'center',
      'end' => 'end',
      _ => 'stretch',
    },
  };
}

List<Map<String, dynamic>> _flattenModules(Iterable<Map<String, dynamic>> modules) {
  final flattened = <Map<String, dynamic>>[];

  for (final module in modules) {
    final normalized = normalizeGridModuleData(module);
    flattened.add(normalized);
    if (normalized['type'] == 'module_rotator') {
      final config = normalized['config'] as Map<String, dynamic>? ?? <String, dynamic>{};
      final nested = (config['modules'] as List? ?? [])
          .whereType<Map>()
          .map((child) => child.cast<String, dynamic>());
      flattened.addAll(_flattenModules(nested));
    }
  }

  return flattened;
}

List<Map<String, dynamic>> getAllModules(Map<String, dynamic> config) {
  final gridModules = config['gridLayout']?['modules'];
  if (gridModules is List) {
    return _flattenModules(
      gridModules.whereType<Map>().map((module) => module.cast<String, dynamic>()),
    );
  }

  return [];
}

Map<String, dynamic> normalizeGridLayout(Map<String, dynamic> config) {
  final rawGrid = config['gridLayout'];
  if (rawGrid is Map) {
    return {
      'template': rawGrid['template'] ?? 'portrait_focus',
      'columns': ((rawGrid['columns'] as num?)?.toInt() ?? 4).clamp(1, 12),
      'rows': ((rawGrid['rows'] as num?)?.toInt() ?? 8).clamp(1, 20),
      'gap': ((rawGrid['gap'] as num?)?.toDouble() ?? 16).clamp(0, 48),
      'modules': (rawGrid['modules'] as List? ?? [])
          .whereType<Map>()
          .map((module) => normalizeGridModuleData(module.cast<String, dynamic>()))
          .toList(),
    };
  }

  return {
    'template': 'portrait_focus',
    'columns': 4,
    'rows': 8,
    'gap': 16.0,
    'modules': <Map<String, dynamic>>[],
  };
}

enum ModuleVisualDensity { compact, medium, expanded }

class ModuleLayoutData {
  final int widthUnits;
  final int heightUnits;
  final String align;
  final Rect bounds;

  const ModuleLayoutData({
    required this.widthUnits,
    required this.heightUnits,
    required this.align,
    required this.bounds,
  });

  ModuleLayoutData copyWith({
    int? widthUnits,
    int? heightUnits,
    String? align,
    Rect? bounds,
  }) {
    return ModuleLayoutData(
      widthUnits: widthUnits ?? this.widthUnits,
      heightUnits: heightUnits ?? this.heightUnits,
      align: align ?? this.align,
      bounds: bounds ?? this.bounds,
    );
  }

  double get areaUnits => widthUnits * heightUnits.toDouble();

  ModuleVisualDensity get density {
    if (areaUnits >= 9 || widthUnits >= 4 || heightUnits >= 4) {
      return ModuleVisualDensity.expanded;
    }
    if (areaUnits >= 4) {
      return ModuleVisualDensity.medium;
    }
    return ModuleVisualDensity.compact;
  }
}
