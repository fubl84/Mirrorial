import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../services/config_service.dart';
import '../services/event_bus.dart';

class WeatherData {
  final double temp;
  final String condition;
  final String icon;

  WeatherData({required this.temp, required this.condition, required this.icon});

  factory WeatherData.fromJson(Map<String, dynamic> json) {
    return WeatherData(
      temp: (json['main']['temp'] as num).toDouble(),
      condition: json['weather'][0]['main'],
      icon: json['weather'][0]['icon'],
    );
  }
}

final weatherProvider = FutureProvider.autoDispose<WeatherData?>((ref) async {
  final configAsync = ref.watch(configStreamProvider);
  final config = configAsync.value;
  
  if (config == null) return null;

  Map? weatherConfig;
  for (var pane in config['layout']) {
    for (var mod in pane['modules']) {
      if (mod['type'] == 'weather') {
        weatherConfig = mod['config'];
        break;
      }
    }
  }

  final provider = weatherConfig?['provider'] ?? 'open-meteo';
  final location = weatherConfig?['location'] ?? 'Berlin';
  final apiKey = weatherConfig?['apiKey'];

  String url = '';
  
  if (provider == 'open-meteo') {
    // Open-Meteo needs lat/long. For simplicity, we'll fetch coordinates first or use defaults.
    // For now, let's use a common lat/long for Berlin or implement a quick geocoding helper.
    // Better: Open-Meteo can work with coordinates directly.
    final lat = weatherConfig?['lat'] ?? 52.52;
    final lon = weatherConfig?['lon'] ?? 13.41;
    url = 'https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon&current_weather=true';
  } else {
    if (apiKey == null || apiKey.isEmpty) return null;
    url = 'https://api.openweathermap.org/data/2.5/weather?q=$location&appid=$apiKey&units=metric';
  }
  
  try {
    final response = await http.get(Uri.parse(url));
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      
      if (provider == 'open-meteo') {
        final current = data['current_weather'];
        return WeatherData(
          temp: (current['temperature'] as num).toDouble(),
          condition: _mapMeteoCode(current['weathercode']),
          icon: _meteoIcon(current['weathercode']),
        );
      } else {
        return WeatherData.fromJson(data);
      }
    }
  } catch (e) {
    print('Weather Fetch Error: $e');
  }
  return null;
});

String _mapMeteoCode(int code) {
  if (code == 0) return 'Clear';
  if (code < 4) return 'Cloudy';
  if (code < 50) return 'Fog';
  if (code < 70) return 'Rain';
  return 'Storm';
}

String _meteoIcon(int code) {
  if (code == 0) return '01d';
  if (code < 4) return '02d';
  if (code < 70) return '10d';
  return '11d';
}
