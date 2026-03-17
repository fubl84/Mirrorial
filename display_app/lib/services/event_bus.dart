import 'package:flutter_riverpod/flutter_riverpod.dart';

enum SystemEventType {
  weatherAlert,
  calendarAlert,
  haAlert,
  generalInfo
}

class SystemEvent {
  final SystemEventType type;
  final String message;
  final Map<String, dynamic>? data;
  final DateTime timestamp;

  SystemEvent({
    required this.type,
    required this.message,
    this.data,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();
}

class EventBusNotifier extends StateNotifier<SystemEvent?> {
  EventBusNotifier() : super(null);

  void emit(SystemEvent event) {
    state = event;
    // Optional: Clear event after some time if it's a transient toast
    if (event.type != SystemEventType.generalInfo) {
      Future.delayed(const Duration(seconds: 10), () {
        if (state == event) state = null;
      });
    }
  }

  void clear() {
    state = null;
  }
}

final eventBusProvider = StateNotifierProvider<EventBusNotifier, SystemEvent?>((ref) {
  return EventBusNotifier();
});
