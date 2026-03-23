import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:intl/date_symbol_data_local.dart';
import 'services/config_service.dart';
import 'services/event_bus.dart';
import 'widgets/flex_grid.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('en');
  await initializeDateFormatting('de');
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
        if (config.isEmpty) {
          return const MaterialApp(
            debugShowCheckedModeBanner: false,
            home: Scaffold(
              backgroundColor: Colors.black,
              body: Center(
                child: Text(
                  'Mirrorial Engine Active\n\nNo modules configured.\nUse the Remote UI to add panes.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white24, fontSize: 14),
                ),
              ),
            ),
          );
        }

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
        final fontFamily = theme['fontFamily'] ?? 'Roboto';

        return MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            brightness: Brightness.dark,
            scaffoldBackgroundColor: Colors.black,
            textTheme: GoogleFonts.getTextTheme(
              fontFamily,
              TextTheme(
                displayLarge: TextStyle(color: primaryColor, fontSize: fontSizeBase * 4, fontWeight: FontWeight.bold),
                bodyLarge: TextStyle(color: primaryColor, fontSize: fontSizeBase),
                bodyMedium: TextStyle(color: secondaryColor, fontSize: fontSizeBase * 0.8),
                titleLarge: TextStyle(color: accentColor, fontSize: fontSizeBase * 1.2, fontWeight: FontWeight.bold),
              ),
            ),
            iconTheme: IconThemeData(color: accentColor),
          ),
          home: Scaffold(
            body: RotatedBox(
              quarterTurns: (rotation / 90).round() % 4,
              child: Stack(
                children: [
                  _DisplayStatusReporter(config: config),
                  const FlexGrid(),
                  const AlertOverlay(),
                ],
              ),
            ),
          ),
        );
      },
      loading: () => const MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          backgroundColor: Colors.black,
          body: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                CircularProgressIndicator(color: Colors.white12),
                SizedBox(height: 24),
                Text('MIRRORIAL\nConnecting to Display Engine...', 
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white12, fontSize: 10, letterSpacing: 2)
                ),
              ],
            ),
          ),
        ),
      ),
      error: (e, st) => MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          backgroundColor: Colors.black,
          body: Center(child: Text('Fatal Error: $e', style: const TextStyle(color: Colors.redAccent))),
        ),
      ),
    );
  }
}

class _DisplayStatusReporter extends StatefulWidget {
  final Map<String, dynamic> config;

  const _DisplayStatusReporter({required this.config});

  @override
  State<_DisplayStatusReporter> createState() => _DisplayStatusReporterState();
}

class _DisplayStatusReporterState extends State<_DisplayStatusReporter> {
  String? _lastSignature;

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final size = mediaQuery.size;
    final signature = '${size.width.round()}x${size.height.round()}@${mediaQuery.devicePixelRatio.toStringAsFixed(2)}';

    if (_lastSignature != signature) {
      _lastSignature = signature;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _reportStatus(size, mediaQuery.devicePixelRatio);
      });
    }

    return const SizedBox.shrink();
  }

  Future<void> _reportStatus(Size size, double devicePixelRatio) async {
    final backendUrl = (widget.config['system']?['backendUrl'] as String?)?.trim();
    final baseUrl = (backendUrl != null && backendUrl.isNotEmpty) ? backendUrl : 'http://127.0.0.1:3000';
    final normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;

    try {
      await http.post(
        Uri.parse('$normalizedBaseUrl/api/display/status'),
        headers: {'content-type': 'application/json'},
        body: '{"width":${size.width.round()},"height":${size.height.round()},"devicePixelRatio":$devicePixelRatio}',
      );
    } catch (_) {
      // Best-effort only. The display keeps working if the status endpoint is unavailable.
    }
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
          color: _getAlertColor(event.type).withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _getAlertColor(event.type).withValues(alpha: 0.5), width: 2),
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
