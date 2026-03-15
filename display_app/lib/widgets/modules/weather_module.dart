import 'package:flutter/material.dart';

class WeatherModule extends StatelessWidget {
  final Map config;

  const WeatherModule({super.key, required this.config});

  @override
  Widget build(BuildContext context) {
    final location = config['location'] ?? 'Location';

    // In a real scenario, this would use a FutureBuilder or a Riverpod provider to fetch API data
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        const Icon(Icons.wb_sunny, size: 64, color: Colors.orange),
        const Text(
          '22°C',
          style: TextStyle(fontSize: 48, color: Colors.white, fontWeight: FontWeight.w300),
        ),
        Text(
          location,
          style: const TextStyle(fontSize: 18, color: Colors.grey),
        ),
      ],
    );
  }
}
