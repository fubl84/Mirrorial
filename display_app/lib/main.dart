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
        final fps = (config['system']?['fps'] as num?)?.toInt() ?? 30;

        return MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            brightness: Brightness.dark,
            scaffoldBackgroundColor: Colors.black,
            fontFamily: config['theme']?['fontFamily'] ?? 'Roboto',
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
