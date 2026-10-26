import 'package:flutter/material.dart';

import '../services/backend_client.dart';
import '../services/display_preferences.dart';

/// "Data from 09:15" (or "No connection" when nothing was ever loaded). Quiet on purpose: the mirror keeps
/// showing the last good data and only says, in small dim text, that it is not current.
String staleLabel(StaleInfo stale, String locale, {required bool use24HourFormat}) {
  final from = stale.dataFrom;
  if (from == null) {
    return translateDisplayLabel('stale_no_connection', locale);
  }
  return '${translateDisplayLabel('stale_data_from', locale)} ${formatClockTime(from.toLocal(), locale, use24HourFormat: use24HourFormat)}';
}

/// Puts the stale mark into the top-right corner of [child]. Without [stale] it is just [child].
class StaleBadge extends StatelessWidget {
  final StaleInfo? stale;
  final String locale;
  final bool use24HourFormat;
  final Widget child;

  const StaleBadge({
    super.key,
    required this.stale,
    required this.locale,
    required this.use24HourFormat,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final info = stale;
    if (info == null) {
      return child;
    }

    return Stack(
      children: [
        Positioned.fill(child: child),
        Positioned(
          top: 0,
          right: 0,
          child: IgnorePointer(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.55),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.cloud_off, size: 11, color: Colors.white54),
                  const SizedBox(width: 4),
                  Text(
                    staleLabel(info, locale, use24HourFormat: use24HourFormat),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.white54, fontSize: 11),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
