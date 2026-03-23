import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:watcher/watcher.dart';

class ConfigService {
  final String configPath;
  
  ConfigService(this.configPath);

  static void _log(String message) {
    debugPrint(message);
  }

  Stream<Map<String, dynamic>> watchConfig() async* {
    final file = File(configPath);
    _log('📂 [ConfigService] Watching: ${file.absolute.path}');
    
    if (await file.exists()) {
      _log('✅ [ConfigService] Found config. Reading...');
      yield jsonDecode(await file.readAsString());
    } else {
      _log('⚠️ [ConfigService] Config file not found at ${file.absolute.path}');
      // Yield an empty map so the app doesn't hang in loading state
      yield {}; 
    }

    try {
      final watcher = FileWatcher(configPath);
      await for (final event in watcher.events) {
        if (event.type == ChangeType.MODIFY) {
          _log('🔄 [ConfigService] Config changed on disk. Reloading...');
          try {
            final content = await file.readAsString();
            yield jsonDecode(content);
          } catch (e) {
            _log('❌ [ConfigService] Error parsing config: $e');
          }
        }
      }
    } catch (e) {
      _log('❌ [ConfigService] Watcher failed: $e');
    }
  }
}

final configServiceProvider = Provider<ConfigService>((ref) {
  // Use path from environment if provided (passed via --dart-define in run_mac.sh)
  const envPath = String.fromEnvironment('LOCAL_CONFIG_PATH');
  
  if (envPath.isNotEmpty) {
    ConfigService._log('📍 [ConfigService] Using environment path: $envPath');
    return ConfigService(envPath);
  }

  // Fallback to searching common locations (for Pi production)
  String path = '../config.json';
  ConfigService._log('🔍 [ConfigService] Searching for config.json...');
  
  if (!File(path).existsSync()) {
    ConfigService._log('   -> Not at $path, checking root...');
    path = 'config.json';
  }
  
  if (!File(path).existsSync()) {
    ConfigService._log('   -> Not at $path, checking parent root...');
    path = '../../config.json';
  }
  
  final finalPath = File(path).absolute.path;
  ConfigService._log('📍 [ConfigService] Final path resolved to: $finalPath');
  
  return ConfigService(path);
});

final configStreamProvider = StreamProvider<Map<String, dynamic>>((ref) {
  final service = ref.watch(configServiceProvider);
  return service.watchConfig();
});
