import 'dart:convert';
import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:watcher/watcher.dart';
import 'package:path/path.dart' as p;

class ConfigService {
  final String configPath;
  
  ConfigService(this.configPath);

  Stream<Map<String, dynamic>> watchConfig() async* {
    final file = File(configPath);
    if (await file.exists()) {
      yield jsonDecode(await file.readAsString());
    }

    final watcher = FileWatcher(configPath);
    await for (final event in watcher.events) {
      if (event.type == ChangeType.MODIFY) {
        try {
          final content = await file.readAsString();
          yield jsonDecode(content);
        } catch (e) {
          print('Error reading config: $e');
        }
      }
    }
  }
}

final configServiceProvider = Provider<ConfigService>((ref) {
  // Try to find the config in common locations
  String path = '../config.json';
  if (!File(path).existsSync()) {
    // If not in parent, check current dir (happens in some dev envs)
    path = 'config.json';
  }
  if (!File(path).existsSync()) {
    // Mac Dev fallback: try to look up 2 levels if running from build folder
    path = '../../config.json';
  }
  
  return ConfigService(path);
});

final configStreamProvider = StreamProvider<Map<String, dynamic>>((ref) {
  final service = ref.watch(configServiceProvider);
  return service.watchConfig();
});
