import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../services/config_service.dart';

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

  // Find the weather module config in the layout
  Map? weatherConfig;
  for (var pane in config['layout']) {
    for (var mod in pane['modules']) {
      if (mod['type'] == 'weather') {
        weatherConfig = mod['config'];
        break;
      }
    }
  }

  final apiKey = weatherConfig?['apiKey'];
  final location = weatherConfig?['location'] ?? 'Berlin';

  if (apiKey == null || apiKey.isEmpty) return null;

  final url = 'https://api.openweathermap.org/data/2.5/weather?q=$location&appid=$apiKey&units=metric';
  
  try {
    final response = await http.get(Uri.parse(url));
    if (response.statusCode == 200) {
      return WeatherData.fromJson(jsonDecode(response.body));
    }
  } catch (e) {
    print('Weather Fetch Error: $e');
  }
  return null;
});
