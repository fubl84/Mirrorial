import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'backend_client.dart';
import 'config_service.dart';
import 'polling.dart';

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

int _resolveTravelRefreshMinutes(Map<String, dynamic>? config) {
  final configValue = config?['services']?['travel']?['refreshMinutes'];
  final minutes = (configValue as num?)?.toInt() ?? 30;
  return minutes.clamp(5, 180);
}

class TravelTimeService {
  final Ref ref;

  TravelTimeService(this.ref);

  /// Throws [BackendException] on any failure (a failed fetch is not "no routes").
  Future<TravelTimeSnapshot> fetchItems(List<dynamic> configItems) async {
    final config = ref.read(configStreamProvider).value;
    final payload = await ref.read(backendClientProvider).postJson(
          resolveBackendBaseUrl(config),
          '/api/display/travel-time',
          {'items': configItems},
        );
    final items = (payload is Map ? payload['items'] : null) as List? ?? [];
    return TravelTimeSnapshot(
      updatedAt: payload is Map ? payload['updatedAt']?.toString() : null,
      items: items.whereType<Map>().map((item) => TravelTimeItem.fromJson(item.cast<String, dynamic>())).toList(),
    );
  }

  Stream<PollResult<TravelTimeSnapshot>> watchItems(List<dynamic> configItems) {
    return pollWithLastGood<TravelTimeSnapshot>(
      fetch: () => fetchItems(configItems),
      interval: () => Duration(minutes: _resolveTravelRefreshMinutes(ref.read(configStreamProvider).value)),
      placeholder: () => TravelTimeSnapshot(updatedAt: null, items: const []),
    );
  }
}

final travelTimeServiceProvider = Provider((ref) => TravelTimeService(ref));

/// Keyed by the route list as JSON, so the same routes share ONE polling loop however often the module rebuilds
/// (it used to start a new loop and a new request on every rebuild).
final travelTimeProvider = StreamProvider.autoDispose.family<PollResult<TravelTimeSnapshot>, String>((ref, itemsJson) {
  final items = jsonDecode(itemsJson) as List<dynamic>;
  return ref.watch(travelTimeServiceProvider).watchItems(items);
});
