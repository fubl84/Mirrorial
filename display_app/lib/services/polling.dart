import 'dart:async';

import 'package:flutter/foundation.dart';

import 'backend_client.dart';

/// Decides how long to wait before the next poll and whether the data on screen counts as stale.
///
///  - all good: poll every [baseInterval]
///  - a poll failed: try again soon ([firstRetry]), then back off (x2 each time) up to [maxBackoff], so a
///    backend that is restarting is picked up quickly and one that is down is not hammered
///  - failing for at least [staleAfter]: the data on screen is marked stale. One lost packet is not an outage.
class PollTracker {
  final Duration staleAfter;
  final Duration firstRetry;
  final Duration maxBackoff;

  int failures = 0;
  DateTime? firstFailureAt;
  DateTime? lastSuccessAt;

  PollTracker({
    this.staleAfter = const Duration(minutes: 2),
    this.firstRetry = const Duration(seconds: 15),
    this.maxBackoff = const Duration(minutes: 10),
  });

  void recordSuccess(DateTime now) {
    failures = 0;
    firstFailureAt = null;
    lastSuccessAt = now;
  }

  void recordFailure(DateTime now) {
    failures += 1;
    firstFailureAt ??= now;
  }

  Duration nextDelay(Duration baseInterval) {
    if (failures == 0) {
      return baseInterval;
    }
    final ceiling = baseInterval > maxBackoff ? baseInterval : maxBackoff;
    final exponent = (failures - 1).clamp(0, 20);
    final delay = firstRetry * (1 << exponent);
    return delay > ceiling ? ceiling : delay;
  }

  /// Null while the data is current (or the trouble is too recent to matter).
  StaleInfo? staleInfo(DateTime now) {
    final since = firstFailureAt;
    if (since == null || now.difference(since) < staleAfter) {
      return null;
    }
    return StaleInfo(lastSuccessAt);
  }
}

/// One value from the backend plus, if it is not current, how stale it is.
class PollResult<T> {
  final T value;
  final StaleInfo? stale;

  const PollResult(this.value, [this.stale]);
}

/// Polls forever and never lets an outage wipe the screen:
///  - success -> the new value
///  - failure -> nothing at first (the old value stays on screen); once the outage has lasted [PollTracker.staleAfter]
///    the last good value again, now marked stale. Without any good value yet, [placeholder] is shown at once,
///    marked stale.
///
/// [wait] and [now] can be replaced in tests. The loop ends when the subscriber cancels.
Stream<PollResult<T>> pollWithLastGood<T>({
  required Future<T> Function() fetch,
  required Duration Function() interval,
  required T Function() placeholder,
  PollTracker? tracker,
  DateTime Function() now = DateTime.now,
  Future<void> Function(Duration) wait = _defaultWait,
  void Function(String message)? log,
}) async* {
  final poll = tracker ?? PollTracker();
  T? lastGood;
  var hasGood = false;

  while (true) {
    try {
      final value = await fetch();
      poll.recordSuccess(now());
      lastGood = value;
      hasGood = true;
      yield PollResult<T>(value);
    } catch (error) {
      poll.recordFailure(now());
      (log ?? debugPrint)('[backend] poll failed (${poll.failures}x): $error');
      // Without any good value there is nothing on screen to protect: show the placeholder at once instead of
      // a spinner that would run for the whole stale delay.
      final stale = hasGood ? poll.staleInfo(now()) : StaleInfo(poll.lastSuccessAt);
      if (stale != null) {
        yield PollResult<T>(hasGood ? lastGood as T : placeholder(), stale);
      }
    }
    await wait(poll.nextDelay(interval()));
  }
}

Future<void> _defaultWait(Duration duration) => Future<void>.delayed(duration);
