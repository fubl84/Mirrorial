import 'package:flutter/material.dart';

class HomeAssistantModule extends StatelessWidget {
  final Map config;

  const HomeAssistantModule({super.key, required this.config});

  @override
  Widget build(BuildContext context) {
    final entities = config['entities'] as List? ?? [];

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Smart Home',
          style: TextStyle(fontSize: 18, color: Colors.indigoAccent, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        ...entities.map((entity) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4.0),
          child: Row(
            children: [
              const Icon(Icons.lightbulb_outline, size: 20, color: Colors.yellow),
              const SizedBox(width: 8),
              Text(
                entity.toString(),
                style: const TextStyle(fontSize: 16, color: Colors.white),
              ),
              const Spacer(),
              const Text('ON', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
            ],
          ),
        )).toList(),
      ],
    );
  }
}
