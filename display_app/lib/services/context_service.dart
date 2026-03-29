import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'config_service.dart';
import 'display_preferences.dart';

class BriefCard {
  final String id;
  final String kind;
  final String headline;
  final String householdView;
  final List<String> bullets;

  BriefCard({
    required this.id,
    required this.kind,
    required this.headline,
    required this.householdView,
    required this.bullets,
  });

  factory BriefCard.fromJson(Map<String, dynamic> json) {
    return BriefCard(
      id: json['id']?.toString() ?? '',
      kind: json['kind']?.toString() ?? '',
      headline: json['headline']?.toString() ?? 'Daily brief',
      householdView: json['householdView']?.toString() ?? '',
      bullets: (json['bullets'] as List? ?? []).map((item) => item.toString()).toList(),
    );
  }
}

class DailyBrief {
  final String headline;
  final List<String> bullets;
  final String householdView;
  final List<BriefCard> items;
  final String source;

  DailyBrief({
    required this.headline,
    required this.bullets,
    required this.householdView,
    required this.items,
    required this.source,
  });

  factory DailyBrief.fromJson(Map<String, dynamic> json) {
    return DailyBrief(
      headline: json['headline'] ?? 'Daily brief',
      bullets: (json['bullets'] as List? ?? []).map((item) => item.toString()).toList(),
      householdView: json['householdView'] ?? '',
      items: (json['items'] as List? ?? [])
          .whereType<Map>()
          .map((item) => BriefCard.fromJson(item.cast<String, dynamic>()))
          .toList(),
      source: json['source']?.toString() ?? 'deterministic',
    );
  }
}

class TripContext {
  final String destination;
  final String start;
  final String end;
  final String? timezone;
  final int? utcOffsetMinutes;
  final String? weatherLabel;
  final String? currentTime;
  final String transportSummary;
  final String transportStatus;
  final String transportLiveSummary;
  final String transportLifecycleLabel;

  TripContext({
    required this.destination,
    required this.start,
    required this.end,
    this.timezone,
    this.utcOffsetMinutes,
    this.weatherLabel,
    this.currentTime,
    required this.transportSummary,
    required this.transportStatus,
    required this.transportLiveSummary,
    required this.transportLifecycleLabel,
  });

  factory TripContext.fromJson(Map<String, dynamic> json) {
    final enrichment = json['enrichment'] is Map ? (json['enrichment'] as Map).cast<String, dynamic>() : null;
    final forecast = enrichment?['forecast'] is Map ? (enrichment?['forecast'] as Map).cast<String, dynamic>() : null;
    final firstTransportSegment = json['transportSegments'] is List && (json['transportSegments'] as List).isNotEmpty && (json['transportSegments'] as List).first is Map
        ? ((json['transportSegments'] as List).first as Map).cast<String, dynamic>()
        : null;
    final live = firstTransportSegment?['live'] is Map ? (firstTransportSegment?['live'] as Map).cast<String, dynamic>() : null;
    final lifecycle = json['transportLifecycle'] is Map ? (json['transportLifecycle'] as Map).cast<String, dynamic>() : null;

    return TripContext(
      destination: json['destination'] ?? '',
      start: json['start'] ?? '',
      end: json['end'] ?? '',
      timezone: enrichment?['timezone']?.toString(),
      utcOffsetMinutes: enrichment?['utcOffsetMinutes'] is num ? (enrichment?['utcOffsetMinutes'] as num).toInt() : null,
      weatherLabel: forecast?['label'],
      currentTime: enrichment?['currentTime'],
      transportSummary: json['transportSummary'] ?? '',
      transportStatus: firstTransportSegment?['liveStatus']?.toString() ?? '',
      transportLiveSummary: live?['summary']?.toString() ?? '',
      transportLifecycleLabel: lifecycle?['label']?.toString() ?? '',
    );
  }
}

class ContextSnapshot {
  final String? updatedAt;
  final DailyBrief brief;
  final TripContext? activeTrip;

  ContextSnapshot({
    required this.updatedAt,
    required this.brief,
    required this.activeTrip,
  });

  factory ContextSnapshot.fromJson(Map<String, dynamic> json) {
    final briefJson = json['brief'] is Map ? (json['brief'] as Map).cast<String, dynamic>() : <String, dynamic>{};
    final activeTripJson = json['activeTrip'] is Map ? (json['activeTrip'] as Map).cast<String, dynamic>() : null;

    return ContextSnapshot(
      updatedAt: json['updatedAt'],
      brief: DailyBrief.fromJson(briefJson),
      activeTrip: activeTripJson != null ? TripContext.fromJson(activeTripJson) : null,
    );
  }
}

String _resolveBackendBaseUrl(Map<String, dynamic>? config) {
  const envBaseUrl = String.fromEnvironment('DISPLAY_API_BASE');
  final configuredBaseUrl = config?['system']?['backendUrl'] as String?;
  final baseUrl = (configuredBaseUrl != null && configuredBaseUrl.trim().isNotEmpty)
      ? configuredBaseUrl.trim()
      : (envBaseUrl.isNotEmpty ? envBaseUrl : 'http://127.0.0.1:3000');

  return baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
}

class ContextService {
  final Ref ref;

  ContextService(this.ref);

  Future<ContextSnapshot> fetchSnapshot() async {
    final config = ref.read(configStreamProvider).value;
    final baseUrl = _resolveBackendBaseUrl(config);
    final locale = resolveDisplayLocale(config);
    final response = await http.get(Uri.parse('$baseUrl/api/display/context?locale=$locale'));

    if (response.statusCode != 200) {
      return ContextSnapshot(
        updatedAt: null,
        brief: DailyBrief(headline: 'Daily brief', bullets: [], householdView: '', items: const [], source: 'deterministic'),
        activeTrip: null,
      );
    }

    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    return ContextSnapshot.fromJson(payload);
  }

  Stream<ContextSnapshot> watchSnapshot() async* {
    while (true) {
      try {
        yield await fetchSnapshot();
      } catch (_) {
        yield ContextSnapshot(
          updatedAt: null,
          brief: DailyBrief(headline: 'Daily brief', bullets: [], householdView: '', items: const [], source: 'deterministic'),
          activeTrip: null,
        );
      }
      await Future<void>.delayed(const Duration(minutes: 5));
    }
  }
}

final contextServiceProvider = Provider((ref) => ContextService(ref));

final contextSnapshotProvider = StreamProvider.autoDispose<ContextSnapshot>((ref) {
  final service = ref.watch(contextServiceProvider);
  return service.watchSnapshot();
});
