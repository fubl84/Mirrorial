import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../services/config_service.dart';
import '../layout/layout_helpers.dart';

class WeatherData {
  final double temp;
  final double? feelsLike;
  final String condition;
  final String icon;
  final String locationLabel;
  final String visualKind;
  final List<WeatherForecastItem> forecast;
  final WeatherUpcomingChange? upcomingChange;

  WeatherData({
    required this.temp,
    required this.condition,
    required this.icon,
    required this.locationLabel,
    required this.visualKind,
    this.feelsLike,
    this.forecast = const [],
    this.upcomingChange,
  });

  factory WeatherData.fromJson(Map<String, dynamic> json, {required String locationLabel}) {
    final weather = (json['weather'] as List? ?? const [])
            .whereType<Map>()
            .map((entry) => entry.cast<String, dynamic>())
            .toList()
            .firstOrNull ??
        <String, dynamic>{};
    final condition = weather['main']?.toString() ?? 'Clear';
    final icon = weather['icon']?.toString() ?? '01d';

    return WeatherData(
      temp: (json['main']['temp'] as num).toDouble(),
      feelsLike: (json['main']['feels_like'] as num?)?.toDouble(),
      condition: condition,
      icon: icon,
      locationLabel: locationLabel,
      visualKind: _visualKindFromOpenWeather(condition, icon),
    );
  }
}

class WeatherForecastItem {
  final DateTime date;
  final double minTemp;
  final double maxTemp;
  final String icon;
  final String visualKind;

  WeatherForecastItem({
    required this.date,
    required this.minTemp,
    required this.maxTemp,
    required this.icon,
    required this.visualKind,
  });
}

class WeatherUpcomingChange {
  final String code;
  final int hoursUntil;

  const WeatherUpcomingChange({
    required this.code,
    required this.hoursUntil,
  });
}

Future<WeatherData?> _fetchWeatherForConfig(Map<String, dynamic> config) async {
  final modules = getAllModules(config);
  Map<String, dynamic>? weatherModule;
  for (final mod in modules) {
    if (mod['type'] == 'weather') {
      weatherModule = mod;
      break;
    }
  }

  final weatherConfig = weatherModule?['config'] as Map?;
  final provider = weatherConfig?['provider']?.toString() ?? 'open-meteo';
  final weatherQuery = _buildWeatherQuery(weatherConfig);
  final configuredLabel = _buildWeatherLocationLabel(weatherConfig);
  final apiKey = weatherConfig?['apiKey']?.toString();

  try {
    if (provider == 'open-meteo') {
      final resolvedLocation = await _resolveOpenMeteoLocation(weatherConfig, weatherQuery);
      if (resolvedLocation == null) {
        return null;
      }

      final uri = Uri.https('api.open-meteo.com', '/v1/forecast', {
        'latitude': resolvedLocation['lat']!.toString(),
        'longitude': resolvedLocation['lon']!.toString(),
        'current': 'temperature_2m,apparent_temperature,weather_code',
        'hourly': 'weather_code',
        'forecast_hours': '8',
        'daily': 'weather_code,temperature_2m_max,temperature_2m_min',
        'forecast_days': '7',
        'timezone': 'auto',
      });

      final response = await http.get(uri);
      if (response.statusCode != 200) {
        return null;
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final current = (data['current'] ?? data['current_weather']) as Map<String, dynamic>? ?? {};
      final daily = data['daily'] as Map<String, dynamic>? ?? {};
      final hourly = data['hourly'] as Map<String, dynamic>? ?? {};
      final currentCode = (current['weather_code'] ?? current['weathercode']) as int? ?? 0;
      final times = (daily['time'] as List? ?? []).cast<dynamic>();
      final maxTemps = (daily['temperature_2m_max'] as List? ?? []).cast<dynamic>();
      final minTemps = (daily['temperature_2m_min'] as List? ?? []).cast<dynamic>();
      final weatherCodes = (daily['weather_code'] as List? ?? daily['weathercode'] as List? ?? []).cast<dynamic>();
      final hourlyCodes = (hourly['weather_code'] as List? ?? hourly['weathercode'] as List? ?? []).cast<dynamic>();

      return WeatherData(
        temp: (current['temperature_2m'] as num? ?? current['temperature'] as num).toDouble(),
        feelsLike: (current['apparent_temperature'] as num?)?.toDouble(),
        condition: _mapMeteoCode(currentCode),
        icon: _meteoIcon(currentCode),
        locationLabel: resolvedLocation['label']?.toString().trim().isNotEmpty == true
            ? resolvedLocation['label'].toString()
            : configuredLabel,
        visualKind: _visualKindFromMeteoCode(currentCode),
        upcomingChange: _inferUpcomingChange(currentCode, hourlyCodes),
        forecast: List.generate(times.length > 7 ? 7 : times.length, (index) {
          final date = DateTime.tryParse(times[index].toString()) ?? DateTime.now().add(Duration(days: index));
          final weatherCode = (weatherCodes[index] as num?)?.toInt() ?? 0;
          return WeatherForecastItem(
            date: date,
            minTemp: (minTemps[index] as num?)?.toDouble() ?? 0,
            maxTemp: (maxTemps[index] as num?)?.toDouble() ?? 0,
            icon: _meteoIcon(weatherCode),
            visualKind: _visualKindFromMeteoCode(weatherCode),
          );
        }),
      );
    }

    if (apiKey == null || apiKey.isEmpty || weatherQuery.isEmpty) {
      return null;
    }

    final uri = Uri.https('api.openweathermap.org', '/data/2.5/weather', {
      'q': weatherQuery,
      'appid': apiKey,
      'units': 'metric',
    });
    final response = await http.get(uri);
    if (response.statusCode != 200) {
      return null;
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return WeatherData.fromJson(
      data,
      locationLabel: configuredLabel.isNotEmpty ? configuredLabel : (data['name']?.toString() ?? 'Weather'),
    );
  } catch (_) {
    return null;
  }
}

int _resolveWeatherRefreshMinutes(Map<String, dynamic> config) {
  final modules = getAllModules(config);
  Map<String, dynamic>? weatherModule;
  for (final mod in modules) {
    if (mod['type'] == 'weather') {
      weatherModule = mod;
      break;
    }
  }
  final configValue = (weatherModule?['config'] as Map?)?['refreshMinutes'];
  final minutes = (configValue as num?)?.toInt() ?? 30;
  return minutes.clamp(10, 180);
}

final weatherProvider = StreamProvider.autoDispose<WeatherData?>((ref) async* {
  final configAsync = ref.watch(configStreamProvider);
  final config = configAsync.value;
  if (config == null) {
    yield null;
    return;
  }

  while (true) {
    yield await _fetchWeatherForConfig(config);
    await Future<void>.delayed(Duration(minutes: _resolveWeatherRefreshMinutes(config)));
  }
});

Future<Map<String, dynamic>?> _resolveOpenMeteoLocation(Map? weatherConfig, String query) async {
  final lat = (weatherConfig?['lat'] as num?)?.toDouble();
  final lon = (weatherConfig?['lon'] as num?)?.toDouble();
  if (lat != null && lon != null && lat.isFinite && lon.isFinite) {
    return {
      'lat': lat,
      'lon': lon,
      'label': _buildWeatherLocationLabel(weatherConfig),
    };
  }

  if (query.isEmpty) {
    return null;
  }

  final uri = Uri.https('geocoding-api.open-meteo.com', '/v1/search', {
    'name': query,
    'count': '1',
    'language': 'de',
    'format': 'json',
  });
  final response = await http.get(uri);
  if (response.statusCode != 200) {
    return null;
  }

  final payload = jsonDecode(response.body) as Map<String, dynamic>;
  final result = (payload['results'] as List?)?.cast<Map<String, dynamic>>().firstOrNull;
  if (result == null) {
    return null;
  }

  return {
    'lat': (result['latitude'] as num?)?.toDouble(),
    'lon': (result['longitude'] as num?)?.toDouble(),
    'label': [
      result['name']?.toString(),
      result['admin1']?.toString(),
      result['country']?.toString(),
    ].where((part) => part != null && part.trim().isNotEmpty).join(', '),
  };
}

String _buildWeatherQuery(Map? weatherConfig) {
  final parts = [
    weatherConfig?['city']?.toString().trim(),
    weatherConfig?['postalCode']?.toString().trim(),
    weatherConfig?['country']?.toString().trim(),
  ].where((part) => part != null && part.isNotEmpty).cast<String>().toList();

  if (parts.isNotEmpty) {
    return parts.join(', ');
  }

  return weatherConfig?['location']?.toString().trim() ?? '';
}

String _buildWeatherLocationLabel(Map? weatherConfig) {
  final explicitLabel = weatherConfig?['displayName']?.toString().trim();
  if (explicitLabel != null && explicitLabel.isNotEmpty) {
    return explicitLabel;
  }

  final query = _buildWeatherQuery(weatherConfig);
  return query.isNotEmpty ? query : 'Weather';
}

String _mapMeteoCode(int code) {
  if (code == 0) return 'Clear';
  if (code < 4) return 'Partly cloudy';
  if (code < 50) return 'Fog';
  if (code < 70) return 'Rain';
  if (code < 80) return 'Snow';
  return 'Storm';
}

String _meteoIcon(int code) {
  if (code == 0) return '01d';
  if (code <= 2) return '02d';
  if (code <= 48) return '03d';
  if (code < 70) return '10d';
  if (code < 80) return '13d';
  return '11d';
}

String _visualKindFromMeteoCode(int code) {
  if (code == 0) return 'clear';
  if (code <= 2) return 'partly_cloudy';
  if (code <= 48) return 'cloudy';
  if (code < 70) return 'rain';
  if (code < 80) return 'snow';
  return 'storm';
}

String _visualKindFromOpenWeather(String condition, String icon) {
  final normalized = condition.toLowerCase();
  if (normalized.contains('thunder')) return 'storm';
  if (normalized.contains('snow')) return 'snow';
  if (normalized.contains('rain') || normalized.contains('drizzle')) return 'rain';
  if (normalized.contains('mist') || normalized.contains('fog')) return 'fog';
  if (normalized.contains('cloud')) return icon.contains('02') ? 'partly_cloudy' : 'cloudy';
  return 'clear';
}

WeatherUpcomingChange? _inferUpcomingChange(int currentCode, List<dynamic> hourlyCodes) {
  if (hourlyCodes.length < 2) {
    return null;
  }

  final currentKind = _visualKindFromMeteoCode(currentCode);
  for (var index = 1; index < hourlyCodes.length && index <= 6; index += 1) {
    final nextCode = (hourlyCodes[index] as num?)?.toInt() ?? currentCode;
    final nextKind = _visualKindFromMeteoCode(nextCode);
    if (nextKind == currentKind) {
      continue;
    }

    return WeatherUpcomingChange(
      code: _buildUpcomingChangeCode(currentKind, nextKind),
      hoursUntil: index,
    );
  }

  return null;
}

String _buildUpcomingChangeCode(String currentKind, String nextKind) {
  if (nextKind == 'rain') return currentKind == 'rain' ? 'rain_continues' : 'rain_start';
  if (nextKind == 'snow') return currentKind == 'snow' ? 'snow_continues' : 'snow_start';
  if (nextKind == 'storm') return 'storm_start';
  if (nextKind == 'fog') return currentKind == 'fog' ? 'conditions_shift' : 'fog_start';
  if (nextKind == 'cloudy' || nextKind == 'partly_cloudy') {
    if (currentKind == 'clear') {
      return nextKind == 'partly_cloudy' ? 'some_clouds' : 'clouds_increase';
    }
    if (currentKind == 'partly_cloudy' && nextKind == 'cloudy') return 'clouds_thicken';
    if (currentKind == 'cloudy' && nextKind == 'partly_cloudy') return 'clouds_break';
    if (currentKind == 'rain' || currentKind == 'snow' || currentKind == 'storm') return 'precipitation_eases';
    if (currentKind == 'fog') return 'fog_lifts';
    return 'conditions_shift';
  }
  if (nextKind == 'clear') {
    if (currentKind == 'partly_cloudy' || currentKind == 'cloudy') return 'clearing';
    if (currentKind == 'fog') return 'fog_lifts';
    return 'conditions_shift';
  }
  return 'conditions_shift';
}

extension<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
