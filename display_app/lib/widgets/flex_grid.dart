import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/config_service.dart';
import '../module_registry.dart';

class FlexGrid extends ConsumerWidget {
  const FlexGrid({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final configAsync = ref.watch(configStreamProvider);

    return configAsync.when(
      data: (config) {
        final layout = config['layout'] as List? ?? [];
        
        return Column(
          children: layout.map((pane) {
            final flex = (pane['flex'] as num?)?.toInt() ?? 1;
            final modules = (pane['modules'] as List? ?? []);

            return Expanded(
              flex: flex,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Row(
                  children: modules.map((mod) {
                    return Expanded(
                      child: buildModuleFromRegistry(mod['type'], mod['config'] ?? {}),
                    );
                  }).toList(),
                ),
              ),
            );
          }).toList(),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, st) => Center(child: Text('Error: $e')),
    );
  }
}
