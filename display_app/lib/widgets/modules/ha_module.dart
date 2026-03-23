import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/ha_service.dart';
import '../../layout/layout_helpers.dart';

class HomeAssistantModule extends ConsumerWidget {
  final Map config;
  final ModuleLayoutData? layoutData;

  const HomeAssistantModule({super.key, required this.config, this.layoutData});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entityStates = ref.watch(haProvider);
    final entitiesToWatch = config['entities'] as List? ?? [];
    final density = layoutData?.density ?? ModuleVisualDensity.medium;
    final isCompact = density == ModuleVisualDensity.compact;
    final isExpanded = density == ModuleVisualDensity.expanded;

    if (entitiesToWatch.isEmpty) {
      return const Center(child: Text('Add entities in Remote UI', style: TextStyle(color: Colors.grey)));
    }

    final visibleEntities = isCompact
        ? entitiesToWatch.take(2).toList()
        : (isExpanded ? entitiesToWatch.take(6).toList() : entitiesToWatch.take(4).toList());

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (!isCompact) ...[
          Text(
            'Smart Home',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
        ],
        if (isCompact)
          ...visibleEntities.map((entityId) {
            final entity = entityStates[entityId];
            if (entity == null) return Container();

            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4.0),
              child: Row(
                children: [
                  _buildIcon(context, entity),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      entity.friendlyName,
                      style: Theme.of(context).textTheme.bodyLarge,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    entity.state.toUpperCase(),
                    style: TextStyle(
                      color: _getStateColor(entity),
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            );
          })
        else if (isExpanded)
          Expanded(
            child: GridView.count(
              crossAxisCount: 2,
              childAspectRatio: 2.3,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              physics: const NeverScrollableScrollPhysics(),
              children: visibleEntities.map((entityId) {
                final entity = entityStates[entityId];
                if (entity == null) return const SizedBox.shrink();
                final unit = entity.attributes['unit_of_measurement'] ?? '';
                return Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Row(
                    children: [
                      _buildIcon(context, entity),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              entity.friendlyName,
                              style: Theme.of(context).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              '${entity.state.toUpperCase()}$unit',
                              style: TextStyle(
                                color: _getStateColor(entity),
                                fontWeight: FontWeight.bold,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          )
        else
          ...visibleEntities.map((entityId) {
            final entity = entityStates[entityId];
            if (entity == null) return Container();

            final isOff = entity.state == 'off';
            final unit = entity.attributes['unit_of_measurement'] ?? '';

            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 6.0),
              child: Row(
                children: [
                  _buildIcon(context, entity),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      entity.friendlyName,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: isOff ? Theme.of(context).textTheme.bodyMedium?.color : Theme.of(context).textTheme.bodyLarge?.color,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    '${entity.state.toUpperCase()}$unit',
                    style: TextStyle(
                      color: isOff ? Theme.of(context).textTheme.bodyMedium?.color : Theme.of(context).iconTheme.color,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }

  Widget _buildIcon(BuildContext context, HAEntity entity) {
    IconData iconData = Icons.device_unknown;
    Color? iconColor = Theme.of(context).textTheme.bodyMedium?.color;

    if (entity.entityId.startsWith('light')) {
      iconData = Icons.lightbulb;
      iconColor = entity.state == 'on' ? Colors.yellow : iconColor;
    } else if (entity.entityId.startsWith('switch')) {
      iconData = Icons.power;
      iconColor = entity.state == 'on' ? Colors.green : iconColor;
    } else if (entity.entityId.startsWith('sensor')) {
      iconData = Icons.sensors;
      iconColor = Theme.of(context).iconTheme.color;
    } else if (entity.entityId.startsWith('climate')) {
      iconData = Icons.thermostat;
      iconColor = Colors.orange;
    }

    return Icon(iconData, size: 20, color: iconColor);
  }

  Color _getStateColor(HAEntity entity) {
    if (entity.state == 'on' || entity.state == 'active' || entity.state == 'home') return Colors.greenAccent;
    if (entity.state == 'off' || entity.state == 'not_home') return Colors.grey;
    return Colors.white70;
  }
}
