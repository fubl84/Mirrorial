import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'backend_client.dart';
import 'config_service.dart';
import 'display_preferences.dart';
import 'polling.dart';

/// How important a note is. Older backends send no urgency; those notes count as [normal].
enum NoteUrgency { high, normal, low }

NoteUrgency parseNoteUrgency(Object? value) {
  switch (value?.toString()) {
    case 'high':
      return NoteUrgency.high;
    case 'low':
      return NoteUrgency.low;
    default:
      return NoteUrgency.normal;
  }
}

/// One line of the brief with its urgency and, when it is about a timed appointment, that start time ("11:00").
class BriefNote {
  final String text;
  final NoteUrgency urgency;
  final String time;

  const BriefNote({required this.text, this.urgency = NoteUrgency.normal, this.time = ''});

  factory BriefNote.fromJson(Map<String, dynamic> json) {
    final time = json['time']?.toString() ?? '';
    return BriefNote(
      text: json['text']?.toString() ?? '',
      urgency: parseNoteUrgency(json['urgency']),
      time: RegExp(r'^\d{2}:\d{2}$').hasMatch(time) ? time : '',
    );
  }
}

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

  /// The same lines as householdView + bullets, with urgency and time. Empty when the backend is older than this
  /// field; the display then falls back to householdView and bullets.
  final List<BriefNote> notes;

  DailyBrief({
    required this.headline,
    required this.bullets,
    required this.householdView,
    required this.items,
    required this.source,
    this.notes = const [],
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
      notes: (json['notes'] as List? ?? [])
          .whereType<Map>()
          .map((item) => BriefNote.fromJson(item.cast<String, dynamic>()))
          .where((note) => note.text.trim().isNotEmpty)
          .toList(),
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

class BirthdayContext {
  final String memberId;
  final String memberName;
  final bool isToday;
  final bool isTomorrow;
  final int? turning;
  final bool allowAgeReveal;

  BirthdayContext({
    required this.memberId,
    required this.memberName,
    required this.isToday,
    required this.isTomorrow,
    required this.turning,
    required this.allowAgeReveal,
  });

  factory BirthdayContext.fromJson(Map<String, dynamic> json) {
    return BirthdayContext(
      memberId: json['memberId']?.toString() ?? '',
      memberName: json['memberName']?.toString() ?? '',
      isToday: json['isToday'] == true,
      isTomorrow: json['isTomorrow'] == true,
      turning: json['turning'] is num ? (json['turning'] as num).toInt() : null,
      allowAgeReveal: json['allowAgeReveal'] == true,
    );
  }
}

class ContextSnapshot {
  final String? updatedAt;
  final DailyBrief brief;
  final TripContext? activeTrip;
  final BirthdayContext? birthdayContext;

  /// Set when the backend has been unreachable for a while: everything above is the last good data.
  final StaleInfo? stale;

  ContextSnapshot({
    required this.updatedAt,
    required this.brief,
    required this.activeTrip,
    required this.birthdayContext,
    this.stale,
  });

  ContextSnapshot withStale(StaleInfo? info) => ContextSnapshot(
        updatedAt: updatedAt,
        brief: brief,
        activeTrip: activeTrip,
        birthdayContext: birthdayContext,
        stale: info,
      );

  factory ContextSnapshot.fromJson(Map<String, dynamic> json) {
    final briefJson = json['brief'] is Map ? (json['brief'] as Map).cast<String, dynamic>() : <String, dynamic>{};
    final activeTripJson = json['activeTrip'] is Map ? (json['activeTrip'] as Map).cast<String, dynamic>() : null;
    final birthdayJson = json['birthdayContext'] is Map ? (json['birthdayContext'] as Map).cast<String, dynamic>() : null;

    return ContextSnapshot(
      updatedAt: json['updatedAt'],
      brief: DailyBrief.fromJson(briefJson),
      activeTrip: activeTripJson != null ? TripContext.fromJson(activeTripJson) : null,
      birthdayContext: birthdayJson != null ? BirthdayContext.fromJson(birthdayJson) : null,
    );
  }
}

ContextSnapshot _emptySnapshot() => ContextSnapshot(
      updatedAt: null,
      brief: DailyBrief(headline: 'Daily brief', bullets: [], householdView: '', items: const [], source: 'deterministic'),
      activeTrip: null,
      birthdayContext: null,
    );

class ContextService {
  final Ref ref;

  ContextService(this.ref);

  /// Throws [BackendException] on any failure. An error is no longer turned into an empty brief: that blanked the
  /// card (and the birthday overlay) on every hiccup.
  Future<ContextSnapshot> fetchSnapshot() async {
    final config = ref.read(configStreamProvider).value;
    final payload = await ref.read(backendClientProvider).getJson(
          resolveBackendBaseUrl(config),
          '/api/display/context',
          query: {'locale': resolveDisplayLocale(config)},
        );
    if (payload is! Map) {
      throw const BackendException('The backend answer had an unexpected shape.');
    }
    return ContextSnapshot.fromJson(payload.cast<String, dynamic>());
  }

  Stream<ContextSnapshot> watchSnapshot() {
    return pollWithLastGood<ContextSnapshot>(
      fetch: fetchSnapshot,
      interval: () => const Duration(minutes: 5),
      placeholder: _emptySnapshot,
    ).map((result) => result.stale == null ? result.value : result.value.withStale(result.stale));
  }
}

final contextServiceProvider = Provider((ref) => ContextService(ref));

final contextSnapshotProvider = StreamProvider.autoDispose<ContextSnapshot>((ref) {
  final service = ref.watch(contextServiceProvider);
  return service.watchSnapshot();
});
