import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'backend_client.dart';
import 'config_service.dart';
import 'polling.dart';

class CalendarEvent {
  final String id;
  final String title;
  final DateTime start;
  final DateTime end;
  final bool isAllDay;
  final bool isRecurring;
  final String calendarSummary;
  final String location;
  final String calendarColor;

  CalendarEvent({
    required this.id,
    required this.title,
    required this.start,
    required this.end,
    required this.isAllDay,
    required this.isRecurring,
    required this.calendarSummary,
    required this.location,
    required this.calendarColor,
  });

  factory CalendarEvent.fromJson(Map<String, dynamic> json) {
    final isAllDay = json['isAllDay'] ?? false;
    return CalendarEvent(
      id: json['id'] ?? '',
      title: json['title'] ?? '(No title)',
      start: _parseCalendarDate(json['start'], isAllDay: isAllDay),
      end: _parseCalendarDate(json['end'] ?? json['start'], isAllDay: isAllDay),
      isAllDay: isAllDay,
      isRecurring: json['isRecurring'] ?? false,
      calendarSummary: json['calendarSummary'] ?? '',
      location: json['location'] ?? '',
      calendarColor: json['calendarColor'] ?? '',
    );
  }
}

DateTime _parseCalendarDate(dynamic rawValue, {required bool isAllDay}) {
  final parsed = DateTime.parse(rawValue.toString());
  if (isAllDay) {
    return DateTime(parsed.year, parsed.month, parsed.day);
  }

  return parsed.isUtc ? parsed.toLocal() : parsed.toLocal();
}

class CalendarService {
  final Ref ref;

  CalendarService(this.ref);

  /// Throws [BackendException] when the backend cannot be reached or refuses: a failed fetch is NOT an empty
  /// calendar, and must never replace the events that are on screen.
  Future<List<CalendarEvent>> fetchEvents() async {
    final config = ref.read(configStreamProvider).value;
    final payload = await ref.read(backendClientProvider).getJson(
          resolveBackendBaseUrl(config),
          '/api/display/calendar/events',
        );
    final items = (payload is Map ? payload['events'] : null) as List? ?? [];
    return items
        .whereType<Map>()
        .map((item) => CalendarEvent.fromJson(item.cast<String, dynamic>()))
        .toList();
  }

  Stream<PollResult<List<CalendarEvent>>> watchEvents() {
    return pollWithLastGood<List<CalendarEvent>>(
      fetch: fetchEvents,
      interval: () => const Duration(minutes: 5),
      placeholder: () => const <CalendarEvent>[],
    );
  }
}

final calendarServiceProvider = Provider((ref) => CalendarService(ref));

/// Events plus, when the backend has been unreachable for a while, the mark "these are old".
final calendarEventsProvider = StreamProvider.autoDispose<PollResult<List<CalendarEvent>>>((ref) {
  final service = ref.watch(calendarServiceProvider);
  return service.watchEvents();
});

final calendarNowProvider = StreamProvider.autoDispose<DateTime>((ref) async* {
  yield DateTime.now();
  while (true) {
    await Future<void>.delayed(const Duration(minutes: 1));
    yield DateTime.now();
  }
});
