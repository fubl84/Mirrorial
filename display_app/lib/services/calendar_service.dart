import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'config_service.dart';

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

String _resolveBackendBaseUrl(Map<String, dynamic>? config) {
  const envBaseUrl = String.fromEnvironment('DISPLAY_API_BASE');
  final configuredBaseUrl = config?['system']?['backendUrl'] as String?;
  final baseUrl = (configuredBaseUrl != null && configuredBaseUrl.trim().isNotEmpty)
      ? configuredBaseUrl.trim()
      : (envBaseUrl.isNotEmpty ? envBaseUrl : 'http://127.0.0.1:3000');

  return baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
}

class CalendarService {
  final Ref ref;

  CalendarService(this.ref);

  Future<List<CalendarEvent>> fetchEvents() async {
    final config = ref.read(configStreamProvider).value;
    final baseUrl = _resolveBackendBaseUrl(config);
    final response = await http.get(Uri.parse('$baseUrl/api/display/calendar/events'));

    if (response.statusCode != 200) {
      return [];
    }

    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    final items = payload['events'] as List? ?? [];
    return items
        .whereType<Map>()
        .map((item) => CalendarEvent.fromJson(item.cast<String, dynamic>()))
        .toList();
  }

  Stream<List<CalendarEvent>> watchEvents() async* {
    while (true) {
      try {
        yield await fetchEvents();
      } catch (_) {
        yield [];
      }
      await Future<void>.delayed(const Duration(minutes: 5));
    }
  }
}

final calendarServiceProvider = Provider((ref) => CalendarService(ref));

final calendarEventsProvider = StreamProvider.autoDispose<List<CalendarEvent>>((ref) {
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
