import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mirrorial_display/services/backend_client.dart';
import 'package:mirrorial_display/services/context_service.dart';
import 'package:mirrorial_display/widgets/stale_badge.dart';

void main() {
  setUpAll(() async {
    // main() does this at app start; the formatting helpers need it.
    await initializeDateFormatting('en');
    await initializeDateFormatting('de');
  });

  test('an old backend payload without notes still parses and has no notes', () {
    final snapshot = ContextSnapshot.fromJson({
      'updatedAt': '2026-04-10T07:00:00.000Z',
      'brief': {
        'headline': 'Heute',
        'bullets': ['Eins'],
        'householdView': 'Zwei',
        'items': [],
        'source': 'llm',
      },
    });
    expect(snapshot.brief.notes, isEmpty);
    expect(snapshot.brief.bullets, ['Eins']);
    expect(snapshot.stale, isNull);
  });

  test('notes carry urgency and time; unknown urgency counts as normal; bad time is dropped', () {
    final brief = DailyBrief.fromJson({
      'headline': 'Heute',
      'bullets': [],
      'householdView': '',
      'notes': [
        {'text': 'Kollision', 'urgency': 'high', 'time': '11:00'},
        {'text': 'Feiertag', 'urgency': 'low', 'time': ''},
        {'text': 'Irgendwas', 'urgency': 'urgent!!', 'time': '9am'},
        {'text': '   ', 'urgency': 'high'},
        'not a map',
      ],
    });
    expect(brief.notes.map((n) => n.text), ['Kollision', 'Feiertag', 'Irgendwas']);
    expect(brief.notes[0].urgency, NoteUrgency.high);
    expect(brief.notes[0].time, '11:00');
    expect(brief.notes[1].urgency, NoteUrgency.low);
    expect(brief.notes[2].urgency, NoteUrgency.normal);
    expect(brief.notes[2].time, '');
  });

  test('withStale keeps all data and only adds the mark', () {
    final snapshot = ContextSnapshot.fromJson({
      'updatedAt': '2026-04-10T07:00:00.000Z',
      'brief': {'headline': 'Heute', 'bullets': ['Eins'], 'householdView': 'Zwei'},
    });
    final stale = snapshot.withStale(StaleInfo(DateTime(2026, 4, 10, 9, 15)));
    expect(stale.brief.bullets, ['Eins']);
    expect(stale.updatedAt, snapshot.updatedAt);
    expect(stale.stale, isNotNull);
  });

  test('the stale label names the time of the last good data, or says there is no connection', () {
    expect(staleLabel(StaleInfo(DateTime(2026, 4, 10, 9, 15)), 'de', use24HourFormat: true), 'Stand 09:15');
    expect(staleLabel(StaleInfo(DateTime(2026, 4, 10, 9, 15)), 'en', use24HourFormat: true), 'Data from 09:15');
    expect(staleLabel(const StaleInfo(null), 'de', use24HourFormat: true), 'Keine Verbindung');
    expect(staleLabel(const StaleInfo(null), 'en', use24HourFormat: true), 'No connection');
  });
}
