import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'config_service.dart';

class TransitLineDetail {
  final String vehicleType;
  final String label;

  TransitLineDetail({
    required this.vehicleType,
    required this.label,
  });

  factory TransitLineDetail.fromJson(Map<String, dynamic> json) {
    return TransitLineDetail(
      vehicleType: json['vehicleType']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
    );
  }
}

class TravelTimeItem {
  final String id;
  final String label;
  final String originLabel;
  final String destinationLabel;
  final String mode;
  final String status;
  final String summary;
  final int? durationMinutes;
  final int? distanceKm;
  final String severity;
  final String trafficSeverity;
  final int? trafficDelayMinutes;
  final List<String> lineDetails;
  final List<TransitLineDetail> lineDetailsDetailed;

  TravelTimeItem({
    required this.id,
    required this.label,
    required this.originLabel,
    required this.destinationLabel,
    required this.mode,
    required this.status,
    required this.summary,
    required this.durationMinutes,
    required this.distanceKm,
    required this.severity,
    required this.trafficSeverity,
    required this.trafficDelayMinutes,
    required this.lineDetails,
    required this.lineDetailsDetailed,
  });

  factory TravelTimeItem.fromJson(Map<String, dynamic> json) {
    return TravelTimeItem(
      id: json['id']?.toString() ?? '',
      label: json['label']?.toString() ?? 'Route',
      originLabel: json['originLabel']?.toString() ?? '',
      destinationLabel: json['destinationLabel']?.toString() ?? '',
      mode: json['mode']?.toString() ?? 'car',
      status: json['status']?.toString() ?? 'estimated',
      summary: json['summary']?.toString() ?? '',
      durationMinutes: json['durationMinutes'] is num ? (json['durationMinutes'] as num).toInt() : null,
      distanceKm: json['distanceKm'] is num ? (json['distanceKm'] as num).toInt() : null,
      severity: json['severity']?.toString() ?? 'green',
      trafficSeverity: json['trafficSeverity']?.toString() ?? 'neutral',
      trafficDelayMinutes: json['trafficDelayMinutes'] is num ? (json['trafficDelayMinutes'] as num).toInt() : null,
      lineDetails: (json['lineDetails'] as List? ?? []).map((entry) => entry.toString()).toList(),
      lineDetailsDetailed: (json['lineDetailsDetailed'] as List? ?? [])
          .whereType<Map>()
          .map((entry) => TransitLineDetail.fromJson(entry.cast<String, dynamic>()))
          .toList(),
    );
  }
}

class TravelTimeSnapshot {
  final String? updatedAt;
  final List<TravelTimeItem> items;

  TravelTimeSnapshot({
    required this.updatedAt,
    required this.items,
  });
}

String _resolveBackendBaseUrl(Map<String, dynamic>? config) {
  const envBaseUrl = String.fromEnvironment('DISPLAY_API_BASE');
  final configuredBaseUrl = config?['system']?['backendUrl'] as String?;
  final baseUrl = (configuredBaseUrl != null && configuredBaseUrl.trim().isNotEmpty)
      ? configuredBaseUrl.trim()
      : (envBaseUrl.isNotEmpty ? envBaseUrl : 'http://127.0.0.1:3000');

  return baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
}

int _resolveTravelRefreshMinutes(Map<String, dynamic>? config) {
  final configValue = config?['services']?['travel']?['refreshMinutes'];
  final minutes = (configValue as num?)?.toInt() ?? 30;
  return minutes.clamp(5, 180);
}

class TravelTimeService {
  final Ref ref;

  TravelTimeService(this.ref);

  Future<TravelTimeSnapshot> fetchItems(List<dynamic> configItems) async {
    final config = ref.read(configStreamProvider).value;
    final baseUrl = _resolveBackendBaseUrl(config);
    final response = await http.post(
      Uri.parse('$baseUrl/api/display/travel-time'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'items': configItems}),
    );

    if (response.statusCode != 200) {
      return TravelTimeSnapshot(updatedAt: null, items: const []);
    }

    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    final items = payload['items'] as List? ?? [];
    return TravelTimeSnapshot(
      updatedAt: payload['updatedAt']?.toString(),
      items: items.whereType<Map>().map((item) => TravelTimeItem.fromJson(item.cast<String, dynamic>())).toList(),
    );
  }

  Stream<TravelTimeSnapshot> watchItems(List<dynamic> configItems) async* {
    while (true) {
      try {
        yield await fetchItems(configItems);
      } catch (_) {
        yield TravelTimeSnapshot(updatedAt: null, items: const []);
      }
      final config = ref.read(configStreamProvider).value;
      await Future<void>.delayed(Duration(minutes: _resolveTravelRefreshMinutes(config)));
    }
  }
}

final travelTimeServiceProvider = Provider((ref) => TravelTimeService(ref));
