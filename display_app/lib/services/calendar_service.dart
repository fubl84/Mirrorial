import 'dart:convert';
import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../services/config_service.dart';

class CalendarEvent {
  final String title;
  final DateTime start;
  final bool isAllDay;

  CalendarEvent({required this.title, required this.start, required this.isAllDay});
}

class CalendarService {
  final Ref ref;
  String? _accessToken;

  CalendarService(this.ref);

  Future<List<CalendarEvent>> fetchEvents() async {
    final tokensFile = File('../tokens.json');
    if (!await tokensFile.exists()) return [];

    final tokens = jsonDecode(await tokensFile.readAsString());
    final configAsync = ref.read(configStreamProvider);
    final config = configAsync.value;
    if (config == null) return [];

    // Find Calendar Config
    Map? calConfig;
    for (var pane in config['layout']) {
      for (var mod in pane['modules']) {
        if (mod['type'] == 'calendar') {
          calConfig = mod['config'];
          break;
        }
      }
    }

    if (calConfig == null) return [];

    if (_accessToken == null) {
      await _refreshToken(tokens, calConfig);
    }

    final now = DateTime.now().toUtc().toIso8601String();
    final url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=$now&maxResults=5&orderBy=startTime&singleEvents=true';

    try {
      final response = await http.get(
        Uri.parse(url),
        headers: {'Authorization': 'Bearer $_accessToken'},
      );

      if (response.statusCode == 401) {
        // Token expired, refresh and retry once
        await _refreshToken(tokens, calConfig);
        return fetchEvents();
      }

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final List items = data['items'] ?? [];
        return items.map((item) {
          final start = item['start'];
          final dateStr = start['dateTime'] ?? start['date'];
          return CalendarEvent(
            title: item['summary'] ?? '(No Title)',
            start: DateTime.parse(dateStr),
            isAllDay: start['dateTime'] == null,
          );
        }).toList();
      }
    } catch (e) {
      print('Calendar Fetch Error: $e');
    }

    return [];
  }

  Future<void> _refreshToken(Map tokens, Map config) async {
    final url = 'https://oauth2.googleapis.com/token';
    final response = await http.post(Uri.parse(url), body: {
      'client_id': config['clientId'],
      'client_secret': config['clientSecret'],
      'refresh_token': tokens['refresh_token'],
      'grant_type': 'refresh_token',
    });

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      _accessToken = data['access_token'];
    }
  }
}

final calendarServiceProvider = Provider((ref) => CalendarService(ref));

final calendarEventsProvider = FutureProvider.autoDispose<List<CalendarEvent>>((ref) async {
  final service = ref.watch(calendarServiceProvider);
  // Refresh every 15 minutes
  final timer = Stream.periodic(const Duration(minutes: 15));
  ref.onDispose(() {}); // Placeholder

  return service.fetchEvents();
});
