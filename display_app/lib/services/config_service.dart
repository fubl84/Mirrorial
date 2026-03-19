import 'dart:convert';
import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:watcher/watcher.dart';

class ConfigService {
  final String configPath;
  
  ConfigService(this.configPath);

  Stream<Map<String, dynamic>> watchConfig() async* {
    final file = File(configPath);
    print('📂 [ConfigService] Watching: ${file.absolute.path}');
    
    if (await file.exists()) {
      print('✅ [ConfigService] Found config. Reading...');
      yield jsonDecode(await file.readAsString());
    } else {
      print('⚠️ [ConfigService] Config file not found at ${file.absolute.path}');
      // Yield an empty map so the app doesn't hang in loading state
      yield {}; 
    }

    try {
      final watcher = FileWatcher(configPath);
      await for (final event in watcher.events) {
        if (event.type == ChangeType.MODIFY) {
          print('🔄 [ConfigService] Config changed on disk. Reloading...');
          try {
            final content = await file.readAsString();
            yield jsonDecode(content);
          } catch (e) {
            print('❌ [ConfigService] Error parsing config: $e');
          }
        }
      }
    } catch (e) {
      print('❌ [ConfigService] Watcher failed: $e');
    }
  }
}

final configServiceProvider = Provider<ConfigService>((ref) {
  // Use path from environment if provided (passed via --dart-define in run_mac.sh)
  const envPath = String.fromEnvironment('LOCAL_CONFIG_PATH');
  
  if (envPath.isNotEmpty) {
    print('📍 [ConfigService] Using environment path: $envPath');
    return ConfigService(envPath);
  }

  // Fallback to searching common locations (for Pi production)
  String path = '../config.json';
  print('🔍 [ConfigService] Searching for config.json...');
  
  if (!File(path).existsSync()) {
    print('   -> Not at $path, checking root...');
    path = 'config.json';
  }
  
  if (!File(path).existsSync()) {
    print('   -> Not at $path, checking parent root...');
    path = '../../config.json';
  }
  
  final finalPath = File(path).absolute.path;
  print('📍 [ConfigService] Final path resolved to: $finalPath');
  
  return ConfigService(path);
});

final configStreamProvider = StreamProvider<Map<String, dynamic>>((ref) {
  final service = ref.watch(configServiceProvider);
  return service.watchConfig();
});
