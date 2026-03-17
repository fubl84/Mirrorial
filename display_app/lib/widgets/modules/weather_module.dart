import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/weather_service.dart';

class WeatherModule extends ConsumerWidget {
  final Map config;

  const WeatherModule({super.key, required this.config});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final weatherAsync = ref.watch(weatherProvider);
    final location = config['location'] ?? 'Location';

    return weatherAsync.when(
      data: (weather) {
        if (weather == null) {
          return const Text('Set OWM Key', style: TextStyle(color: Colors.grey));
        }

        return Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Image.network(
              'https://openweathermap.org/img/wn/${weather.icon}@2x.png',
              width: 64,
              height: 64,
              errorBuilder: (context, error, stackTrace) => const Icon(Icons.wb_cloudy, size: 64, color: Colors.blueGrey),
            ),
            Text(
              '${weather.temp.round()}°C',
              style: const TextStyle(fontSize: 48, color: Colors.white, fontWeight: FontWeight.w300),
            ),
            Text(
              location,
              style: const TextStyle(fontSize: 18, color: Colors.grey),
            ),
          ],
        );
      },
      loading: () => const Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))),
      error: (e, st) => const Icon(Icons.error_outline, color: Colors.red),
    );
  }
}
