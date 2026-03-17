import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'services/config_service.dart';
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
              child: const FlexGrid(),
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
