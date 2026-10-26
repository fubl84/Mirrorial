import 'package:flutter_test/flutter_test.dart';
import 'package:mirrorial_display/services/polling.dart';

void main() {
  final t0 = DateTime(2026, 4, 10, 9, 0);

  // A fake clock that moves forward by exactly the time the loop waits.
  Stream<PollResult<String>> run(List<Object> script, {List<Duration>? waits, int takeCount = 100}) {
    var clock = t0;
    var step = 0;
    return pollWithLastGood<String>(
      fetch: () async {
        final next = script[step++ % script.length];
        if (next is Exception) throw next;
        return next as String;
      },
      interval: () => const Duration(minutes: 5),
      placeholder: () => 'placeholder',
      now: () => clock,
      wait: (duration) async {
        waits?.add(duration);
        clock = clock.add(duration);
      },
      log: (_) {},
    ).take(takeCount);
  }

  test('passes good values through unmarked', () async {
    final results = await run(['a', 'b', 'c'], takeCount: 3).toList();
    expect(results.map((r) => r.value), ['a', 'b', 'c']);
    expect(results.every((r) => r.stale == null), isTrue);
  });

  test('a short outage changes nothing on screen: no event, old value stays', () async {
    final results = await run(['a', Exception('down'), 'b'], takeCount: 2).toList();
    expect(results.map((r) => r.value), ['a', 'b'], reason: 'the failed poll emitted nothing');
    expect(results.every((r) => r.stale == null), isTrue);
  });

  test('a long outage re-emits the LAST GOOD value, marked stale since the last success', () async {
    final waits = <Duration>[];
    final results = await run(
      ['good', Exception('down'), Exception('down'), Exception('down'), Exception('down'), Exception('down'), 'recovered'],
      waits: waits,
      takeCount: 4,
    ).toList();

    expect(results.first.value, 'good');
    expect(results.first.stale, isNull);
    final staleOnes = results.where((r) => r.stale != null).toList();
    expect(staleOnes, isNotEmpty);
    expect(staleOnes.every((r) => r.value == 'good'), isTrue, reason: 'never the empty placeholder when data exists');
    expect(staleOnes.first.stale!.dataFrom, t0);
    expect(waits.take(3).toList(), [const Duration(minutes: 5), const Duration(seconds: 15), const Duration(seconds: 30)]);
  });

  test('recovery clears the stale mark', () async {
    final results = await run(
      ['good', Exception('x'), Exception('x'), Exception('x'), Exception('x'), Exception('x'), 'fresh'],
      takeCount: 10,
    ).toList();
    final freshIndex = results.indexWhere((r) => r.value == 'fresh');
    expect(freshIndex, greaterThan(0));
    expect(results[freshIndex].stale, isNull);
  });

  test('without any good value the placeholder appears at once, marked stale', () async {
    final results = await run([Exception('down')], takeCount: 1).toList();
    expect(results.single.value, 'placeholder');
    expect(results.single.stale, isNotNull);
    expect(results.single.stale!.dataFrom, isNull, reason: 'there never was a good fetch');
  });

  test('errors of any kind are survived, not just exceptions of one type', () async {
    var calls = 0;
    final results = await pollWithLastGood<int>(
      fetch: () async {
        calls++;
        if (calls == 1) throw StateError('bad state');
        if (calls == 2) throw const FormatException('bad json');
        return calls;
      },
      interval: () => const Duration(minutes: 1),
      placeholder: () => -1,
      wait: (_) async {},
      log: (_) {},
    ).take(3).toList();
    expect(results.map((r) => r.value), [-1, -1, 3]);
  });
}
