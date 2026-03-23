import 'package:flutter/material.dart';

List<Map<String, dynamic>> getAllModules(Map<String, dynamic> config) {
  final gridModules = config['gridLayout']?['modules'];
  if (gridModules is List) {
    return gridModules.whereType<Map>().map((module) => module.cast<String, dynamic>()).toList();
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
      'modules': (rawGrid['modules'] as List? ?? []).whereType<Map>().map((module) => module.cast<String, dynamic>()).toList(),
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
