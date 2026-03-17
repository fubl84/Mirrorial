import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'services/config_service.dart';
import 'services/event_bus.dart';
import 'widgets/flex_grid.dart';

void main() {
  runApp(
    const ProviderScope(
      child: MirrorialApp(),
    ),
  );
}

class MirrorialApp extends ConsumerWidget {
  const MirrorialApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final configAsync = ref.watch(configStreamProvider);

    return configAsync.when(
      data: (config) {
        final rotation = (config['system']?['rotation'] as num?)?.toDouble() ?? 0.0;
        final theme = config['theme'] ?? {};
        
        // Helper to convert hex to Color
        Color parseColor(String hex) {
          return Color(int.parse(hex.replaceFirst('#', '0xFF')));
        }

        final primaryColor = parseColor(theme['primaryColor'] ?? '#FFFFFF');
        final secondaryColor = parseColor(theme['secondaryColor'] ?? '#888888');
        final accentColor = parseColor(theme['accentColor'] ?? '#00BCD4');
        final fontSizeBase = (theme['fontSizeBase'] as num?)?.toDouble() ?? 16.0;

        return MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            brightness: Brightness.dark,
            scaffoldBackgroundColor: Colors.black,
            fontFamily: theme['fontFamily'] ?? 'Roboto',
            textTheme: TextTheme(
              displayLarge: TextStyle(color: primaryColor, fontSize: fontSizeBase * 4, fontWeight: FontWeight.bold),
              bodyLarge: TextStyle(color: primaryColor, fontSize: fontSizeBase),
              bodyMedium: TextStyle(color: secondaryColor, fontSize: fontSizeBase * 0.8),
              titleLarge: TextStyle(color: accentColor, fontSize: fontSizeBase * 1.2, fontWeight: FontWeight.bold),
            ),
            iconTheme: IconThemeData(color: accentColor),
          ),
          home: Scaffold(
            body: RotatedBox(
              quarterTurns: (rotation / 90).round() % 4,
              child: Stack(
                children: [
                  const FlexGrid(),
                  const AlertOverlay(),
                ],
              ),
            ),
          ),
        );
      },
      loading: () => const MaterialApp(
        home: Scaffold(backgroundColor: Colors.black),
      ),
      error: (e, st) => MaterialApp(
        home: Scaffold(
          backgroundColor: Colors.black,
          body: Center(child: Text('Fatal Error: $e')),
        ),
      ),
    );
  }
}

class AlertOverlay extends ConsumerWidget {
  const AlertOverlay({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final event = ref.watch(eventBusProvider);
    if (event == null) return const SizedBox.shrink();

    return Positioned(
      top: 40,
      left: 20,
      right: 20,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 500),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        decoration: BoxDecoration(
          color: _getAlertColor(event.type).withOpacity(0.2),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _getAlertColor(event.type).withOpacity(0.5), width: 2),
        ),
        child: Row(
          children: [
            Icon(_getAlertIcon(event.type), color: _getAlertColor(event.type), size: 28),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                event.message,
                style: TextStyle(
                  color: _getAlertColor(event.type),
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color _getAlertColor(SystemEventType type) {
    switch (type) {
      case SystemEventType.weatherAlert: return Colors.lightBlueAccent;
      case SystemEventType.haAlert: return Colors.orangeAccent;
      case SystemEventType.calendarAlert: return Colors.redAccent;
      default: return Colors.white;
    }
  }

  IconData _getAlertIcon(SystemEventType type) {
    switch (type) {
      case SystemEventType.weatherAlert: return Icons.warning_amber_rounded;
      case SystemEventType.haAlert: return Icons.notification_important_rounded;
      case SystemEventType.calendarAlert: return Icons.event_available_rounded;
      default: return Icons.info_outline_rounded;
    }
  }
}
