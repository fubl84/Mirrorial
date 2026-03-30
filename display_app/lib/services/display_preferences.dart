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
      'travel_car': 'Car',
      'travel_bike': 'Bike',
      'travel_walk': 'Walk',
      'travel_transit': 'Transit',
      'travel_on_time': 'On time',
      'travel_check_route': 'Check route',
      'travel_provider_needed': 'Provider needed',
      'travel_traffic_delay': 'traffic',
      'transit_bus': 'Bus',
      'transit_tram': 'Tram',
      'transit_tube': 'Tube',
      'transit_suburban_train': 'Suburban',
      'transit_train': 'Train',
      'transit_ferry': 'Ferry',
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
      'travel_car': 'Auto',
      'travel_bike': 'Rad',
      'travel_walk': 'Zu Fuß',
      'travel_transit': 'ÖPNV',
      'travel_on_time': 'Pünktlich',
      'travel_check_route': 'Route prüfen',
      'travel_provider_needed': 'Anbieter nötig',
      'travel_traffic_delay': 'Verkehr',
      'transit_bus': 'Bus',
      'transit_tram': 'Tram',
      'transit_tube': 'U-Bahn',
      'transit_suburban_train': 'S-Bahn',
      'transit_train': 'Zug',
      'transit_ferry': 'Fähre',
    },
  };

  final languagePack = labels[locale] ?? labels['en']!;
  return languagePack[key] ?? labels['en']![key] ?? key;
}
