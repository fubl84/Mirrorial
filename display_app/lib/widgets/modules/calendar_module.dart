import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../services/calendar_service.dart';

class CalendarModule extends ConsumerWidget {
  final Map config;

  const CalendarModule({super.key, required this.config});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final eventsAsync = ref.watch(calendarEventsProvider);

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Upcoming Events',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        eventsAsync.when(
          data: (events) {
            if (events.isEmpty) {
              return Text('No upcoming events', style: Theme.of(context).textTheme.bodyMedium);
            }

            return Column(
              children: events.map((event) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 6.0),
                child: Row(
                  children: [
                    Container(
                      width: 4,
                      height: 24,
                      decoration: BoxDecoration(
                        color: Theme.of(context).iconTheme.color,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            event.title,
                            style: Theme.of(context).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w500),
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            event.isAllDay ? 'All Day' : DateFormat('HH:mm').format(event.start),
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                    Text(
                      _getRelativeDate(event.start),
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              )).toList(),
            );
          },
          loading: () => const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
          error: (e, st) => const Icon(Icons.error_outline, color: Colors.red),
        ),
      ],
    );
  }

  String _getRelativeDate(DateTime date) {
    final now = DateTime.now();
    final diff = date.difference(DateTime(now.year, now.month, now.day)).inDays;

    if (diff == 0) return 'Today';
    if (diff == 1) return 'Tomorrow';
    return DateFormat('E, d. MMM').format(date);
  }
}
