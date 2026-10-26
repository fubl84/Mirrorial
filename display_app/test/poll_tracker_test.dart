import 'package:flutter_test/flutter_test.dart';
import 'package:mirrorial_display/services/polling.dart';

void main() {
  final t0 = DateTime(2026, 4, 10, 9, 0);

  test('polls at the normal interval while everything works', () {
    final tracker = PollTracker();
    tracker.recordSuccess(t0);
    expect(tracker.nextDelay(const Duration(minutes: 5)), const Duration(minutes: 5));
    expect(tracker.staleInfo(t0), isNull);
  });

  test('retries soon after the first failure, then backs off up to the cap', () {
    final tracker = PollTracker();
    final delays = <Duration>[];
    for (var i = 0; i < 8; i++) {
      tracker.recordFailure(t0);
      delays.add(tracker.nextDelay(const Duration(minutes: 5)));
    }
    expect(delays.first, const Duration(seconds: 15));
    expect(delays[1], const Duration(seconds: 30));
    expect(delays[2], const Duration(minutes: 1));
    expect(delays.last, const Duration(minutes: 10));
    for (var i = 1; i < delays.length; i++) {
      expect(delays[i] >= delays[i - 1], isTrue, reason: 'never gets shorter during an outage');
    }
  });

  test('an interval longer than the cap is never shortened by the backoff', () {
    final tracker = PollTracker();
    for (var i = 0; i < 12; i++) {
      tracker.recordFailure(t0);
    }
    expect(tracker.nextDelay(const Duration(minutes: 30)), const Duration(minutes: 30));
  });

  test('one success resets the backoff and the outage', () {
    final tracker = PollTracker();
    tracker.recordFailure(t0);
    tracker.recordFailure(t0);
    tracker.recordSuccess(t0.add(const Duration(minutes: 1)));
    expect(tracker.failures, 0);
    expect(tracker.nextDelay(const Duration(minutes: 5)), const Duration(minutes: 5));
    expect(tracker.staleInfo(t0.add(const Duration(minutes: 10))), isNull);
  });

  test('data only counts as stale after the outage has lasted long enough', () {
    final tracker = PollTracker();
    tracker.recordSuccess(t0);
    tracker.recordFailure(t0.add(const Duration(minutes: 1)));
    expect(tracker.staleInfo(t0.add(const Duration(minutes: 2))), isNull, reason: 'one lost request is not an outage');
    final stale = tracker.staleInfo(t0.add(const Duration(minutes: 3, seconds: 1)));
    expect(stale, isNotNull);
    expect(stale!.dataFrom, t0, reason: 'the stale mark carries the time of the last good data');
  });

  test('a huge number of failures does not overflow the backoff', () {
    final tracker = PollTracker();
    for (var i = 0; i < 500; i++) {
      tracker.recordFailure(t0);
    }
    expect(tracker.nextDelay(const Duration(minutes: 5)), const Duration(minutes: 10));
  });
}
