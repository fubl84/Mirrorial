import 'package:intl/intl.dart';

String resolveDisplayLocale(Map<String, dynamic>? rootConfig) {
  final configured = rootConfig?['system']?['displayLocale']?.toString().trim().toLowerCase();
  return configured == 'de' ? 'de' : 'en';
}

bool resolveUse24HourFormat(Map<dynamic, dynamic>? moduleConfig, Map<String, dynamic>? rootConfig) {
  final moduleFormat = moduleConfig?['format']?.toString().trim();
  if (moduleFormat == '12h' || moduleFormat == '24h') {
    return moduleFormat == '24h';
  }

  final systemFormat = rootConfig?['system']?['timeFormat']?.toString().trim();
  return systemFormat != '12h';
}

String formatClockTime(DateTime value, String locale, {required bool use24HourFormat, bool includeSeconds = false}) {
  final pattern = use24HourFormat
      ? (includeSeconds ? 'HH:mm:ss' : 'HH:mm')
      : (includeSeconds ? 'hh:mm:ss a' : 'hh:mm a');
  return DateFormat(pattern, locale).format(value);
}

String formatLongDate(DateTime value, String locale) => DateFormat('EEEE, d MMMM', locale).format(value);

String formatShortWeekday(DateTime value, String locale) => DateFormat('EEE', locale).format(value).toUpperCase();

String formatMonthDay(DateTime value, String locale) => DateFormat('d MMM', locale).format(value);

String formatCalendarDate(DateTime value, String locale) => DateFormat('E, d MMM', locale).format(value);

bool shouldAllowAddressLikeLocation(String value, Map<String, dynamic>? rootConfig) {
  final normalized = value.trim().toLowerCase();
  if (normalized.isEmpty) {
    return false;
  }

  const builtInKeywords = [
    'hospital',
    'clinic',
    'doctor',
    'praxis',
    'arzt',
    'school',
    'schule',
    'kita',
    'kindergarten',
    'daycare',
    'museum',
    'zoo',
    'theater',
    'theatre',
    'cinema',
    'concert',
    'venue',
    'arena',
    'stadium',
    'airport',
    'station',
    'bahnhof',
    'terminal',
    'hotel',
    'embassy',
    'consulate',
    'university',
    'campus',
    'office',
    'buero',
    'büro',
    'messe',
    'expo',
  ];

  if (builtInKeywords.any((keyword) => normalized.contains(keyword))) {
    return true;
  }

  final configured = rootConfig?['services']?['context']?['usefulLocationWhitelist'];
  if (configured is List) {
    return configured
        .map((entry) => entry.toString().trim().toLowerCase())
        .where((entry) => entry.isNotEmpty)
        .any((entry) => normalized.contains(entry));
  }

  return false;
}

String translateDisplayLabel(String key, String locale) {
  const labels = {
    'en': {
      'upcoming_events': 'Upcoming Events',
      'no_upcoming_events': 'No upcoming events',
      'all_day': 'All day',
      'today': 'Today',
      'tomorrow': 'Tomorrow',
      'forecast': 'Forecast',
      'feels_like': 'Feels like',
      'configure_weather': 'Configure weather source',
      'no_brief': 'No contextual brief available yet.',
      'updated': 'Updated',
      'travel_update': 'Travel update',
      'week_view': 'Week',
      'no_events': 'No events',
    },
    'de': {
      'upcoming_events': 'Nächste Termine',
      'no_upcoming_events': 'Keine anstehenden Termine',
      'all_day': 'Ganztägig',
      'today': 'Heute',
      'tomorrow': 'Morgen',
      'forecast': 'Vorhersage',
      'feels_like': 'Gefühlt',
      'configure_weather': 'Wetterquelle konfigurieren',
      'no_brief': 'Noch keine Kontext-Zusammenfassung verfügbar.',
      'updated': 'Aktualisiert',
      'travel_update': 'Reise-Update',
      'week_view': 'Woche',
      'no_events': 'Keine Termine',
    },
  };

  final languagePack = labels[locale] ?? labels['en']!;
  return languagePack[key] ?? labels['en']![key] ?? key;
}
