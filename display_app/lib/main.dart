import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'services/backend_client.dart';
import 'services/config_service.dart';
import 'services/context_service.dart';
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
                  const BirthdayCelebrationOverlay(),
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

class _DisplayStatusReporter extends ConsumerStatefulWidget {
  final Map<String, dynamic> config;

  const _DisplayStatusReporter({required this.config});

  @override
  ConsumerState<_DisplayStatusReporter> createState() => _DisplayStatusReporterState();
}

class _DisplayStatusReporterState extends ConsumerState<_DisplayStatusReporter> {
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
    // Best effort only: the display keeps working if the status endpoint is unavailable.
    await ref.read(backendClientProvider).postQuietly(
      resolveBackendBaseUrl(widget.config),
      '/api/display/status',
      {'width': size.width.round(), 'height': size.height.round(), 'devicePixelRatio': devicePixelRatio},
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

class BirthdayCelebrationOverlay extends ConsumerStatefulWidget {
  const BirthdayCelebrationOverlay({super.key});

  @override
  ConsumerState<BirthdayCelebrationOverlay> createState() => _BirthdayCelebrationOverlayState();
}

class _BirthdayCelebrationOverlayState extends ConsumerState<BirthdayCelebrationOverlay> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  bool _visible = false;
  DateTime? _lastShownAt;
  Timer? _timer;
  String _headline = '';
  String? _birthdaySignature;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = ref.watch(contextSnapshotProvider).value;
    final birthday = snapshot?.birthdayContext;
    final nextSignature = birthday == null ? null : '${birthday.memberId}:${birthday.isToday}:${birthday.turning}:${birthday.allowAgeReveal}';
    if (_birthdaySignature != nextSignature) {
      _birthdaySignature = nextSignature;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _syncSchedule(birthday);
        }
      });
    }

    if (!_visible || birthday == null || !birthday.isToday) {
      return const SizedBox.shrink();
    }

    return Positioned.fill(
      child: IgnorePointer(
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            final progress = Curves.easeOutCubic.transform(_controller.value);
            return Opacity(
              opacity: progress,
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.18),
                      Colors.transparent,
                    ],
                  ),
                ),
                child: Stack(
                  children: [
                    ...List.generate(18, (index) {
                      final horizontal = (index % 6) / 5;
                      final vertical = ((index * 37) % 100) / 100;
                      final drift = (index.isEven ? 1 : -1) * 12 * progress;
                      return Positioned(
                        left: (MediaQuery.of(context).size.width * horizontal) + drift,
                        top: (MediaQuery.of(context).size.height * vertical) - (40 * progress),
                        child: Icon(
                          index.isEven ? Icons.celebration_rounded : Icons.cake_rounded,
                          color: index.isEven ? const Color(0xFFF59E0B) : const Color(0xFFF472B6),
                          size: 20 + ((index % 4) * 6),
                        ),
                      );
                    }),
                    Center(
                      child: Transform.scale(
                        scale: 0.92 + (0.08 * progress),
                        child: Container(
                          margin: const EdgeInsets.symmetric(horizontal: 42),
                          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 18),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.54),
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(color: const Color(0xFFF59E0B).withValues(alpha: 0.45), width: 2),
                          ),
                          child: Text(
                            _headline,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.displayLarge?.copyWith(
                                  fontSize: 34,
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  void _syncSchedule(BirthdayContext? birthday) {
    _timer?.cancel();
    if (birthday == null || !birthday.isToday) {
      return;
    }

    final now = DateTime.now();
    if (_shouldShowNow(now)) {
      _showBirthday(birthday);
    }
    final nextSlotMinute = now.minute < 30 ? 30 : 60;
    final nextSlot = DateTime(now.year, now.month, now.day, now.hour, 0).add(Duration(minutes: nextSlotMinute));
    final delay = nextSlot.difference(now);
    _timer = Timer(delay, () {
      if (mounted) {
        _showBirthday(birthday);
        _syncSchedule(birthday);
      }
    });
  }

  bool _shouldShowNow(DateTime now) {
    if (_lastShownAt == null) {
      return true;
    }
    return now.difference(_lastShownAt!).inMinutes >= 30;
  }

  void _showBirthday(BirthdayContext birthday) {
    final messages = <String>[
      'Happy Birthday, ${birthday.memberName}!',
      'Alles Gute zum Geburtstag, ${birthday.memberName}!',
      'A very happy birthday to ${birthday.memberName}!',
      '${birthday.memberName}, today is your day!',
      if (birthday.allowAgeReveal && birthday.turning != null) '${birthday.memberName}, you are ${birthday.turning} today!',
    ];
    _headline = messages[DateTime.now().minute % messages.length];
    _lastShownAt = DateTime.now();
    setState(() {
      _visible = true;
    });
    _controller.forward(from: 0);
    Timer(const Duration(seconds: 8), () {
      if (!mounted) {
        return;
      }
      _controller.reverse();
      setState(() {
        _visible = false;
      });
    });
  }
}
