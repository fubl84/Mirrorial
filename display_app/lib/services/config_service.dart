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
  // On the Pi, Mirrorial runs in a predictable folder structure
  // The config is in the parent directory or root
  return ConfigService('../config.json');
});

final configStreamProvider = StreamProvider<Map<String, dynamic>>((ref) {
  final service = ref.watch(configServiceProvider);
  return service.watchConfig();
});
