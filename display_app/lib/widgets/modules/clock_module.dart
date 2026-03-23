import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../layout/layout_helpers.dart';
import '../../services/display_preferences.dart';

class ClockModule extends StatelessWidget {
  final Map config;
  final ModuleLayoutData? layoutData;
  final Map<String, dynamic>? rootConfig;

  const ClockModule({super.key, required this.config, this.layoutData, this.rootConfig});

  @override
  Widget build(BuildContext context) {
    final showSeconds = config['showSeconds'] ?? false;
    final locale = resolveDisplayLocale(rootConfig);
    final use24HourFormat = resolveUse24HourFormat(config, rootConfig);

    return StreamBuilder(
      stream: Stream.periodic(const Duration(seconds: 1)),
      builder: (context, snapshot) {
        final now = DateTime.now();
        final timeString = formatClockTime(now, locale, use24HourFormat: use24HourFormat, includeSeconds: showSeconds);
        final dateString = formatLongDate(now, locale);
        final weekdayString = formatShortWeekday(now, locale);
        final weekdayLongString = _formatWeekdayLong(now, locale);
        final monthDayString = formatMonthDay(now, locale);
        final quarterLabel = _buildQuarterLabel(now, locale);
        final calendarWeekLabel = _buildCalendarWeekLabel(now, locale);

        return LayoutBuilder(
          builder: (context, constraints) {
            final variant = _resolveClockVariant(constraints, layoutData);
            final align = layoutData?.align ?? 'stretch';

            return AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              child: switch (variant) {
                _ClockVariant.banner => _ClockBannerLayout(
                    key: const ValueKey('clock-banner'),
                    timeString: timeString,
                    weekdayString: weekdayString,
                    weekdayLongString: weekdayLongString,
                    monthDayString: monthDayString,
                    quarterLabel: quarterLabel,
                    calendarWeekLabel: calendarWeekLabel,
                    align: align,
                  ),
                _ClockVariant.split => _ClockSplitLayout(
                    key: const ValueKey('clock-split'),
                    timeString: timeString,
                    dateString: dateString,
                    quarterLabel: quarterLabel,
                    calendarWeekLabel: calendarWeekLabel,
                  ),
                _ClockVariant.hero => _ClockHeroLayout(
                    key: const ValueKey('clock-hero'),
                    timeString: timeString,
                    dateString: dateString,
                    quarterLabel: quarterLabel,
                    calendarWeekLabel: calendarWeekLabel,
                  ),
                _ClockVariant.compact => _ClockCompactLayout(
                    key: const ValueKey('clock-compact'),
                    timeString: timeString,
                    weekdayString: weekdayString,
                    monthDayString: monthDayString,
                    calendarWeekLabel: calendarWeekLabel,
                  ),
              },
            );
          },
        );
      },
    );
  }
}

enum _ClockVariant { compact, banner, split, hero }

_ClockVariant _resolveClockVariant(BoxConstraints constraints, ModuleLayoutData? layoutData) {
  final width = constraints.maxWidth.isFinite ? constraints.maxWidth : (layoutData?.bounds.width ?? 0);
  final height = constraints.maxHeight.isFinite ? constraints.maxHeight : (layoutData?.bounds.height ?? 0);
  final safeHeight = height <= 0 ? 1.0 : height;
  final aspect = width / safeHeight;

  if (height <= 120 || aspect >= 3.4) {
    return _ClockVariant.banner;
  }
  if (aspect >= 2.2) {
    return _ClockVariant.split;
  }
  if ((layoutData?.density ?? ModuleVisualDensity.medium) == ModuleVisualDensity.compact) {
    return _ClockVariant.compact;
  }
  return _ClockVariant.hero;
}

class _ClockBannerLayout extends StatelessWidget {
  final String timeString;
  final String weekdayString;
  final String weekdayLongString;
  final String monthDayString;
  final String quarterLabel;
  final String calendarWeekLabel;
  final String align;

  const _ClockBannerLayout({
    super.key,
    required this.timeString,
    required this.weekdayString,
    required this.weekdayLongString,
    required this.monthDayString,
    required this.quarterLabel,
    required this.calendarWeekLabel,
    required this.align,
  });

  @override
  Widget build(BuildContext context) {
    if (align == 'center') {
      return Center(
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    weekdayLongString.toUpperCase(),
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.4,
                        ),
                  ),
                  Text(
                    monthDayString,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 20),
                  ),
                ],
              ),
              const SizedBox(width: 22),
              Text(
                timeString,
                style: Theme.of(context).textTheme.displayLarge?.copyWith(
                      fontSize: 82,
                      fontWeight: FontWeight.w700,
                      height: 0.94,
                    ),
              ),
              const SizedBox(width: 22),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    quarterLabel.toUpperCase(),
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.4,
                        ),
                  ),
                  Text(
                    calendarWeekLabel.toUpperCase(),
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 20),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    }

    final timeStyle = Theme.of(context).textTheme.displayLarge?.copyWith(
          fontSize: 72,
          fontWeight: FontWeight.w700,
          height: 0.95,
        );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          flex: 3,
          child: Align(
            alignment: align == 'end' ? Alignment.centerRight : Alignment.centerLeft,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: align == 'end' ? Alignment.centerRight : Alignment.centerLeft,
              child: Text(timeString, style: timeStyle),
            ),
          ),
        ),
        const SizedBox(width: 16),
        Flexible(
          flex: 2,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerRight,
                child: Text(
                  weekdayString,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 24),
                ),
              ),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerRight,
                child: Text(
                  '$monthDayString • $quarterLabel • $calendarWeekLabel',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontSize: 16),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ClockSplitLayout extends StatelessWidget {
  final String timeString;
  final String dateString;
  final String quarterLabel;
  final String calendarWeekLabel;

  const _ClockSplitLayout({
    super.key,
    required this.timeString,
    required this.dateString,
    required this.quarterLabel,
    required this.calendarWeekLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          flex: 5,
          child: Align(
            alignment: Alignment.centerLeft,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                timeString,
                style: Theme.of(context).textTheme.displayLarge?.copyWith(
                      fontSize: 96,
                      fontWeight: FontWeight.w700,
                      height: 0.95,
                    ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 24),
        Expanded(
          flex: 3,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                dateString,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 28),
              ),
              const SizedBox(height: 8),
              Text(
                '$quarterLabel • $calendarWeekLabel',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontSize: 16),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ClockHeroLayout extends StatelessWidget {
  final String timeString;
  final String dateString;
  final String quarterLabel;
  final String calendarWeekLabel;

  const _ClockHeroLayout({
    super.key,
    required this.timeString,
    required this.dateString,
    required this.quarterLabel,
    required this.calendarWeekLabel,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final timeSize = math.min(constraints.maxHeight * 0.42, constraints.maxWidth * 0.24).clamp(60, 116).toDouble();
        final dateSize = math.min(timeSize * 0.32, 32.0).clamp(18, 32).toDouble();

        return Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                timeString,
                style: Theme.of(context).textTheme.displayLarge?.copyWith(
                      fontSize: timeSize,
                      fontWeight: FontWeight.w700,
                      height: 0.92,
                    ),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              dateString,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: dateSize),
            ),
            const SizedBox(height: 6),
            Text(
              '$quarterLabel • $calendarWeekLabel',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontSize: math.max(14, dateSize * 0.55)),
            ),
          ],
        );
      },
    );
  }
}

class _ClockCompactLayout extends StatelessWidget {
  final String timeString;
  final String weekdayString;
  final String monthDayString;
  final String calendarWeekLabel;

  const _ClockCompactLayout({
    super.key,
    required this.timeString,
    required this.weekdayString,
    required this.monthDayString,
    required this.calendarWeekLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              timeString,
              style: Theme.of(context).textTheme.displayLarge?.copyWith(
                    fontSize: 46,
                    fontWeight: FontWeight.w700,
                    height: 0.96,
                  ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(weekdayString, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 18)),
            Text('$monthDayString • $calendarWeekLabel', style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontSize: 13)),
          ],
        ),
      ],
    );
  }
}

String _formatWeekdayLong(DateTime value, String locale) {
  final weekday = formatLongDate(value, locale).split(',').first.trim();
  return weekday;
}

String _buildQuarterLabel(DateTime value, String locale) {
  final quarter = ((value.month - 1) ~/ 3) + 1;
  return locale == 'de' ? '$quarter. Quartal' : 'Q$quarter';
}

String _buildCalendarWeekLabel(DateTime value, String locale) {
  final week = _isoWeekNumber(value);
  return locale == 'de' ? 'KW $week' : 'CW $week';
}

int _isoWeekNumber(DateTime date) {
  final normalized = DateTime.utc(date.year, date.month, date.day);
  final weekday = normalized.weekday == DateTime.sunday ? 7 : normalized.weekday;
  final thursday = normalized.add(Duration(days: 4 - weekday));
  final yearStart = DateTime.utc(thursday.year, 1, 1);
  return (((thursday.difference(yearStart).inDays) + 1) / 7).ceil();
}
