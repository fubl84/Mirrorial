import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../layout/layout_helpers.dart';
import '../../services/calendar_service.dart';
import '../../services/display_preferences.dart';

class CalendarModule extends ConsumerWidget {
  final Map config;
  final ModuleLayoutData? layoutData;
  final Map<String, dynamic>? rootConfig;

  const CalendarModule({super.key, required this.config, this.layoutData, this.rootConfig});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final eventsAsync = ref.watch(calendarEventsProvider);
    final now = ref.watch(calendarNowProvider).value ?? DateTime.now();
    final density = layoutData?.density ?? ModuleVisualDensity.medium;
    final locale = resolveDisplayLocale(rootConfig);
    final use24HourFormat = resolveUse24HourFormat(config, rootConfig);
    final viewMode = config['viewMode']?.toString() == 'day_cards' ? 'day_cards' : 'list';

    return eventsAsync.when(
      data: (events) {
        if (events.isEmpty) {
          return Text(
            translateDisplayLabel('no_upcoming_events', locale),
            style: Theme.of(context).textTheme.bodyMedium,
          );
        }

        return LayoutBuilder(
          builder: (context, constraints) {
            if (viewMode == 'day_cards' && density != ModuleVisualDensity.compact) {
              return _DayCardCalendar(
                events: events,
                locale: locale,
                density: density,
                daysToShow: _resolveDayCount(config),
                use24HourFormat: use24HourFormat,
                now: now,
              );
            }

            final maxItems = _maxItemsForLayout(constraints.maxHeight, density, config);
            return _AgendaCalendar(
              events: events.take(maxItems).toList(),
              locale: locale,
              density: density,
              use24HourFormat: use24HourFormat,
            );
          },
        );
      },
      loading: () => const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
      error: (e, st) => const Icon(Icons.error_outline, color: Colors.red),
    );
  }
}

int _maxItemsForLayout(double height, ModuleVisualDensity density, Map config) {
  final configured = (config['maxItems'] as num?)?.toInt() ?? 5;
  if (density == ModuleVisualDensity.compact) {
    return configured.clamp(2, 4).toInt();
  }

  final estimated = ((height - 48) / (density == ModuleVisualDensity.expanded ? 76 : 68)).floor().clamp(2, 10).toInt();
  return configured.clamp(1, estimated).toInt();
}

int _resolveDayCount(Map config) {
  final configured = (config['daysToShow'] as num?)?.toInt() ?? 4;
  return configured.clamp(1, 7).toInt();
}

class _AgendaCalendar extends StatelessWidget {
  final List<CalendarEvent> events;
  final String locale;
  final ModuleVisualDensity density;
  final bool use24HourFormat;

  const _AgendaCalendar({
    required this.events,
    required this.locale,
    required this.density,
    required this.use24HourFormat,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (density != ModuleVisualDensity.compact) ...[
          Text(
            translateDisplayLabel('upcoming_events', locale),
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
        ],
        ...events.map((event) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 5,
                    height: density == ModuleVisualDensity.compact ? 36 : 42,
                    decoration: BoxDecoration(
                      color: _parseCalendarColor(event.calendarColor, Theme.of(context).iconTheme.color ?? Colors.white),
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          event.title,
                          style: Theme.of(context).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
                          maxLines: density == ModuleVisualDensity.compact ? 1 : 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _buildAgendaSubtitle(event, locale, use24HourFormat),
                          style: Theme.of(context).textTheme.bodyMedium,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _getRelativeDate(event.start, locale),
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            )),
      ],
    );
  }
}

class _DayCardCalendar extends StatelessWidget {
  final List<CalendarEvent> events;
  final String locale;
  final ModuleVisualDensity density;
  final int daysToShow;
  final bool use24HourFormat;
  final DateTime now;

  const _DayCardCalendar({
    required this.events,
    required this.locale,
    required this.density,
    required this.daysToShow,
    required this.use24HourFormat,
    required this.now,
  });

  @override
  Widget build(BuildContext context) {
    final today = DateTime(now.year, now.month, now.day);
    final dayBuckets = List.generate(daysToShow, (offset) {
      final target = today.add(Duration(days: offset));
      final bucketEvents = events.where((event) => _eventOccursOnDay(event, target)).toList()
        ..sort((left, right) => left.start.compareTo(right.start));
      return (day: target, events: bucketEvents);
    });
    final tightLayout = daysToShow >= 6;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: dayBuckets.asMap().entries.map((entry) {
        final index = entry.key;
        final bucket = entry.value;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(right: index == dayBuckets.length - 1 ? 0 : (tightLayout ? 6 : 10)),
            child: _DayColumn(
              day: bucket.day,
              events: bucket.events,
              locale: locale,
              now: now,
              use24HourFormat: use24HourFormat,
              compact: tightLayout,
            ),
          ),
        );
      }).toList(),
    );
  }
}

class _DayColumn extends StatelessWidget {
  final DateTime day;
  final List<CalendarEvent> events;
  final String locale;
  final DateTime now;
  final bool use24HourFormat;
  final bool compact;

  const _DayColumn({
    required this.day,
    required this.events,
    required this.locale,
    required this.now,
    required this.use24HourFormat,
    required this.compact,
  });

  @override
  Widget build(BuildContext context) {
    final processed = _prepareDayBucket(day: day, events: events, now: now);
    final theme = Theme.of(context);
    final emptyTextStyle = theme.textTheme.bodyMedium?.copyWith(
      color: Colors.white.withValues(alpha: 0.55),
      fontSize: compact ? 11 : 12,
    );

    return Container(
      padding: EdgeInsets.all(compact ? 10 : 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(22),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final visibleTimedEvents = _visibleTimedEventsForHeight(
            processed.timedEvents,
            height: constraints.maxHeight,
            hasAllDayStrip: processed.allDayEvents.isNotEmpty,
            compact: compact,
          );
          final hiddenCount = math.max(0, processed.timedEvents.length - visibleTimedEvents.length);
          final footerLabel = _buildFooterLabel(
            locale: locale,
            hiddenCount: hiddenCount,
            lastEventEnd: processed.lastEventEnd,
            use24HourFormat: use24HourFormat,
          );

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _buildDayHeader(day, locale),
                style: theme.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  fontSize: compact ? 14 : 15,
                ),
              ),
              SizedBox(height: compact ? 8 : 10),
              if (processed.allDayEvents.isNotEmpty) ...[
                _AllDayStrip(
                  events: processed.allDayEvents,
                  locale: locale,
                  compact: compact,
                ),
                SizedBox(height: compact ? 8 : 10),
              ],
              Expanded(
                child: visibleTimedEvents.isEmpty
                    ? Align(
                        alignment: Alignment.topLeft,
                        child: Text(
                          translateDisplayLabel('no_events', locale),
                          style: emptyTextStyle,
                        ),
                      )
                    : Column(
                        children: [
                          ...visibleTimedEvents.map((event) => _TimedEventCard(
                                event: event,
                                day: day,
                                locale: locale,
                                compact: compact,
                                use24HourFormat: use24HourFormat,
                                now: now,
                              )),
                          const Spacer(),
                          if (footerLabel != null)
                            _DayFooter(label: footerLabel),
                        ],
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _TimedEventCard extends StatelessWidget {
  final CalendarEvent event;
  final DateTime day;
  final String locale;
  final bool compact;
  final bool use24HourFormat;
  final DateTime now;

  const _TimedEventCard({
    required this.event,
    required this.day,
    required this.locale,
    required this.compact,
    required this.use24HourFormat,
    required this.now,
  });

  @override
  Widget build(BuildContext context) {
    final accent = _parseCalendarColor(event.calendarColor, Theme.of(context).iconTheme.color ?? Colors.white);
    final segment = _segmentForDay(event, day);
    final isActive = !event.isAllDay && !segment.start.isAfter(now) && segment.end.isAfter(now);
    final background = Color.lerp(Colors.black, accent, isActive ? 0.38 : 0.22) ?? accent;
    final borderColor = accent.withValues(alpha: isActive ? 0.92 : 0.44);

    return Container(
      width: double.infinity,
      margin: EdgeInsets.only(bottom: compact ? 6 : 8),
      padding: EdgeInsets.all(compact ? 7 : 8),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _TimeRail(
            start: segment.start,
            end: segment.end,
            locale: locale,
            use24HourFormat: use24HourFormat,
            compact: compact,
            isActive: isActive,
          ),
          SizedBox(width: compact ? 8 : 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _AutoScrollText(
                        text: event.title,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                              fontSize: compact ? 15 : 17,
                              color: Colors.white.withValues(alpha: 0.94),
                            ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    if (event.isRecurring)
                      Icon(
                        Icons.repeat_rounded,
                        size: compact ? 15 : 16,
                        color: Colors.white.withValues(alpha: 0.8),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TimeRail extends StatelessWidget {
  final DateTime start;
  final DateTime end;
  final String locale;
  final bool use24HourFormat;
  final bool compact;
  final bool isActive;

  const _TimeRail({
    required this.start,
    required this.end,
    required this.locale,
    required this.use24HourFormat,
    required this.compact,
    required this.isActive,
  });

  @override
  Widget build(BuildContext context) {
    final labelStyle = Theme.of(context).textTheme.bodyMedium?.copyWith(
      fontWeight: FontWeight.w800,
      fontSize: compact ? 11.5 : 13,
      color: isActive ? Colors.black.withValues(alpha: 0.9) : Colors.white,
      height: 1.05,
    );

    return Container(
      width: compact ? 52 : 60,
      padding: EdgeInsets.symmetric(horizontal: compact ? 6 : 7, vertical: compact ? 5 : 6),
      decoration: BoxDecoration(
        color: isActive ? Colors.white : Colors.black.withValues(alpha: 0.38),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          Text(_formatTime(start, locale, use24HourFormat), style: labelStyle),
          SizedBox(height: compact ? 2 : 3),
          Text(_formatTime(end, locale, use24HourFormat), style: labelStyle),
        ],
      ),
    );
  }
}

class _AllDayStrip extends StatelessWidget {
  final List<CalendarEvent> events;
  final String locale;
  final bool compact;

  const _AllDayStrip({
    required this.events,
    required this.locale,
    required this.compact,
  });

  @override
  Widget build(BuildContext context) {
    final accent = events.isEmpty
        ? Colors.white
        : _parseCalendarColor(events.first.calendarColor, Theme.of(context).iconTheme.color ?? Colors.white);
    final label = events.map((event) => event.title).join(' • ');

    return Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(horizontal: compact ? 10 : 12, vertical: compact ? 6 : 7),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: accent.withValues(alpha: 0.42)),
      ),
      child: Row(
        children: [
          Text(
            _translateAllDayLabel(locale),
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: accent,
                ),
          ),
          SizedBox(width: compact ? 8 : 10),
          Expanded(
            child: _AutoScrollText(
              text: label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    fontSize: compact ? 12 : 13,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DayFooter extends StatelessWidget {
  final String label;

  const _DayFooter({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        label,
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Colors.black.withValues(alpha: 0.82),
              fontWeight: FontWeight.w700,
              fontSize: 12,
            ),
      ),
    );
  }
}

class _AutoScrollText extends StatefulWidget {
  final String text;
  final TextStyle? style;

  const _AutoScrollText({
    required this.text,
    required this.style,
  });

  @override
  State<_AutoScrollText> createState() => _AutoScrollTextState();
}

class _AutoScrollTextState extends State<_AutoScrollText> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  double _overflow = 0;
  String _loopKey = '';

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 1));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _scheduleLoop(String key, double overflow) {
    if (_loopKey == key && _overflow == overflow) {
      return;
    }

    _loopKey = key;
    _overflow = overflow;
    _controller.stop();
    _controller.value = 0;

    if (overflow <= 0) {
      return;
    }

    unawaited(_runLoop(key, overflow));
  }

  Future<void> _runLoop(String key, double overflow) async {
    while (mounted && _loopKey == key && overflow > 0) {
      await Future<void>.delayed(const Duration(seconds: 2));
      if (!mounted || _loopKey != key) {
        break;
      }

      final duration = Duration(milliseconds: math.max(3200, (overflow * 18).round()));
      await _controller.animateTo(1, duration: duration, curve: Curves.linear);
      if (!mounted || _loopKey != key) {
        break;
      }

      await Future<void>.delayed(const Duration(seconds: 2));
      if (!mounted || _loopKey != key) {
        break;
      }

      await _controller.animateTo(0, duration: duration, curve: Curves.linear);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final style = widget.style ?? DefaultTextStyle.of(context).style;
        final painter = TextPainter(
          text: TextSpan(text: widget.text, style: style),
          maxLines: 1,
          textDirection: Directionality.of(context),
        )..layout(maxWidth: double.infinity);

        final overflow = math.max(0.0, painter.width - constraints.maxWidth).toDouble();
        final loopKey = '${widget.text}|${constraints.maxWidth.round()}';
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            _scheduleLoop(loopKey, overflow);
          }
        });

        if (overflow <= 0) {
          return Text(
            widget.text,
            maxLines: 1,
            overflow: TextOverflow.clip,
            style: style,
          );
        }

        return ClipRect(
          child: SizedBox(
            width: constraints.maxWidth,
            height: painter.height,
            child: AnimatedBuilder(
              animation: _controller,
              builder: (context, child) {
                final gap = compactGapForStyle(style);
                return Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned(
                      left: -(overflow + gap) * _controller.value,
                      top: 0,
                      child: child!,
                    ),
                  ],
                );
              },
              child: SizedBox(
                width: (painter.width * 2) + compactGapForStyle(style),
                height: painter.height,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: painter.width,
                      child: Text(
                        widget.text,
                        maxLines: 1,
                        softWrap: false,
                        overflow: TextOverflow.visible,
                        style: style,
                      ),
                    ),
                    SizedBox(width: compactGapForStyle(style)),
                    SizedBox(
                      width: painter.width,
                      child: Text(
                        widget.text,
                        maxLines: 1,
                        softWrap: false,
                        overflow: TextOverflow.visible,
                        style: style,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

_PreparedDayBucket _prepareDayBucket({
  required DateTime day,
  required List<CalendarEvent> events,
  required DateTime now,
}) {
  final dayStart = DateTime(day.year, day.month, day.day);
  final dayEnd = dayStart.add(const Duration(days: 1));
  final isToday = _isSameDay(day, now);
  final allDayEvents = <CalendarEvent>[];
  final timedEvents = <CalendarEvent>[];

  for (final event in events) {
    if (event.isAllDay) {
      allDayEvents.add(event);
      continue;
    }

    final endsBeforeNow = isToday && !event.end.isAfter(now);
    final outsideDay = !event.start.isBefore(dayEnd) || !event.end.isAfter(dayStart);
    if (endsBeforeNow || outsideDay) {
      continue;
    }

    timedEvents.add(event);
  }

  timedEvents.sort((left, right) {
    final leftIsActive = isToday && !left.start.isAfter(now) && left.end.isAfter(now);
    final rightIsActive = isToday && !right.start.isAfter(now) && right.end.isAfter(now);
    if (leftIsActive != rightIsActive) {
      return leftIsActive ? -1 : 1;
    }
    return left.start.compareTo(right.start);
  });

  DateTime? lastEventEnd;
  if (timedEvents.isNotEmpty) {
    lastEventEnd = timedEvents.map((event) => _segmentForDay(event, day).end).reduce((left, right) => left.isAfter(right) ? left : right);
  }

  return _PreparedDayBucket(
    allDayEvents: allDayEvents,
    timedEvents: timedEvents,
    lastEventEnd: lastEventEnd,
  );
}

List<CalendarEvent> _visibleTimedEventsForHeight(
  List<CalendarEvent> timedEvents, {
  required double height,
  required bool hasAllDayStrip,
  required bool compact,
}) {
  if (timedEvents.isEmpty) {
    return const [];
  }

  final headerHeight = compact ? 28.0 : 30.0;
  final gapAfterHeader = compact ? 8.0 : 10.0;
  final allDayHeight = hasAllDayStrip ? (compact ? 32.0 : 36.0) + (compact ? 8.0 : 10.0) : 0.0;
  final eventTileHeight = compact ? 60.0 : 68.0;
  const footerHeight = 32.0;

  int capacity = ((height - headerHeight - gapAfterHeader - allDayHeight) / eventTileHeight).floor().clamp(1, 12);
  if (timedEvents.length > capacity) {
    capacity = ((height - headerHeight - gapAfterHeader - allDayHeight - footerHeight) / eventTileHeight).floor().clamp(1, 12);
  }

  return timedEvents.take(capacity).toList();
}

String? _buildFooterLabel({
  required String locale,
  required int hiddenCount,
  required DateTime? lastEventEnd,
  required bool use24HourFormat,
}) {
  if (hiddenCount <= 0 || lastEventEnd == null) {
    return null;
  }

  final endLabel = _formatTime(lastEventEnd, locale, use24HourFormat);
  final moreLabel = locale == 'de' ? '+$hiddenCount mehr' : '+$hiddenCount more';
  return locale == 'de'
      ? 'Letzter Termin bis $endLabel · $moreLabel'
      : 'Last event until $endLabel · $moreLabel';
}

String _getRelativeDate(DateTime date, String locale) {
  final now = DateTime.now();
  final diff = date.difference(DateTime(now.year, now.month, now.day)).inDays;

  if (diff == 0) return translateDisplayLabel('today', locale);
  if (diff == 1) return translateDisplayLabel('tomorrow', locale);
  return formatCalendarDate(date, locale);
}

String _buildAgendaSubtitle(CalendarEvent event, String locale, bool use24HourFormat) {
  if (event.isAllDay) {
    return translateDisplayLabel('all_day', locale);
  }

  return '${_formatTime(event.start, locale, use24HourFormat)} - ${_formatTime(event.end, locale, use24HourFormat)}';
}

String _buildDayHeader(DateTime date, String locale) {
  final now = DateTime.now();
  final dayDelta = date.difference(DateTime(now.year, now.month, now.day)).inDays;
  if (dayDelta == 0) return translateDisplayLabel('today', locale);
  if (dayDelta == 1) return translateDisplayLabel('tomorrow', locale);
  return DateFormat(locale == 'de' ? 'E. d MMM' : 'E d MMM', locale).format(date);
}

String _formatTime(DateTime value, String locale, bool use24HourFormat) =>
    DateFormat(use24HourFormat ? 'HH:mm' : 'hh:mm a', locale).format(value);

bool _isSameDay(DateTime left, DateTime right) =>
    left.year == right.year && left.month == right.month && left.day == right.day;

bool _eventOccursOnDay(CalendarEvent event, DateTime day) {
  final dayStart = DateTime(day.year, day.month, day.day);
  final dayEnd = dayStart.add(const Duration(days: 1));

  if (event.isAllDay) {
    final allDayStart = DateTime(event.start.year, event.start.month, event.start.day);
    final allDayEndExclusive = DateTime(event.end.year, event.end.month, event.end.day);
    return !allDayStart.isAfter(dayStart) && allDayEndExclusive.isAfter(dayStart);
  }

  return event.start.isBefore(dayEnd) && event.end.isAfter(dayStart);
}

_DaySegment _segmentForDay(CalendarEvent event, DateTime day) {
  final dayStart = DateTime(day.year, day.month, day.day);
  final dayEnd = dayStart.add(const Duration(days: 1));
  final start = event.start.isBefore(dayStart) ? dayStart : event.start;
  final end = event.end.isAfter(dayEnd) ? dayEnd : event.end;
  return _DaySegment(start: start, end: end);
}

String _translateAllDayLabel(String locale) => locale == 'de' ? 'Ganztägig' : 'All day';

Color _parseCalendarColor(String? hex, Color fallback) {
  final value = hex?.trim();
  if (value == null || value.isEmpty) {
    return fallback;
  }

  final normalized = value.startsWith('#') ? value.substring(1) : value;
  if (normalized.length != 6) {
    return fallback;
  }

  try {
    return Color(int.parse('FF$normalized', radix: 16));
  } catch (_) {
    return fallback;
  }
}

double compactGapForStyle(TextStyle style) => ((style.fontSize ?? 14) * 1.2).clamp(12, 28).toDouble();

class _PreparedDayBucket {
  final List<CalendarEvent> allDayEvents;
  final List<CalendarEvent> timedEvents;
  final DateTime? lastEventEnd;

  const _PreparedDayBucket({
    required this.allDayEvents,
    required this.timedEvents,
    required this.lastEventEnd,
  });
}

class _DaySegment {
  final DateTime start;
  final DateTime end;

  const _DaySegment({required this.start, required this.end});
}
