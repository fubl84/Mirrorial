import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/ha_service.dart';

class HomeAssistantModule extends ConsumerWidget {
  final Map config;

  const HomeAssistantModule({super.key, required this.config});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entityStates = ref.watch(haProvider);
    final entitiesToWatch = config['entities'] as List? ?? [];

    if (entitiesToWatch.isEmpty) {
      return const Center(child: Text('Add entities in Remote UI', style: TextStyle(color: Colors.grey)));
    }

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Smart Home',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        ...entitiesToWatch.map((entityId) {
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
        }).toList(),
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
