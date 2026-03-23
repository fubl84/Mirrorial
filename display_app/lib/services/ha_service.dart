import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../services/config_service.dart';
import '../layout/layout_helpers.dart';

class HAEntity {
  final String entityId;
  final String state;
  final String friendlyName;
  final Map attributes;

  HAEntity({required this.entityId, required this.state, required this.friendlyName, required this.attributes});

  factory HAEntity.fromJson(Map json) {
    return HAEntity(
      entityId: json['entity_id'],
      state: json['state'],
      friendlyName: json['attributes']?['friendly_name'] ?? json['entity_id'],
      attributes: json['attributes'] ?? {},
    );
  }
}

class HANotifier extends StateNotifier<Map<String, HAEntity>> {
  WebSocketChannel? _channel;
  final Ref ref;
  bool _authenticated = false;

  HANotifier(this.ref) : super({}) {
    _init();
  }

  void _init() {
    final configAsync = ref.watch(configStreamProvider);
    final config = configAsync.value;
    if (config == null) return;

    // Find HA config
    final modules = getAllModules(config);
    Map<String, dynamic>? haModule;
    for (final mod in modules) {
      if (mod['type'] == 'home_assistant') {
        haModule = mod;
        break;
      }
    }
    final haConfig = haModule?['config'] as Map?;

    final url = haConfig?['url'];
    final token = haConfig?['token'];
    final entities = haConfig?['entities'] as List? ?? [];

    if (url == null || token == null || url.isEmpty || token.isEmpty) return;

    final wsUrl = url.replaceFirst('http', 'ws') + '/api/websocket';
    _connect(wsUrl, token, entities);
  }

  void _connect(String wsUrl, String token, List entities) {
    _channel?.sink.close();
    _channel = WebSocketChannel.connect(Uri.parse(wsUrl));

    _channel!.stream.listen((message) {
      final data = jsonDecode(message);
      
      if (data['type'] == 'auth_required') {
        _channel!.sink.add(jsonEncode({
          'type': 'auth',
          'access_token': token,
        }));
      } else if (data['type'] == 'auth_ok') {
        _authenticated = true;
        _subscribeToEntities(entities);
      } else if (data['type'] == 'event' && data['event']['event_type'] == 'state_changed') {
        final newState = data['event']['data']['new_state'];
        if (newState != null) {
          final entity = HAEntity.fromJson(newState);
          state = {...state, entity.entityId: entity};
        }
      } else if (data['type'] == 'result' && data['success'] == true && data['result'] is List) {
        // Initial state fetch
        final Map<String, HAEntity> initialStates = {};
        for (var s in data['result']) {
          if (entities.contains(s['entity_id'])) {
            initialStates[s['entity_id']] = HAEntity.fromJson(s);
          }
        }
        state = initialStates;
      }
    });
  }

  void _subscribeToEntities(List entities) {
    if (!_authenticated) return;

    // 1. Get initial states
    _channel!.sink.add(jsonEncode({
      'id': 1,
      'type': 'get_states',
    }));

    // 2. Subscribe to all state changes
    _channel!.sink.add(jsonEncode({
      'id': 2,
      'type': 'subscribe_events',
      'event_type': 'state_changed',
    }));
  }

  @override
  void dispose() {
    _channel?.sink.close();
    super.dispose();
  }
}

final haProvider = StateNotifierProvider<HANotifier, Map<String, HAEntity>>((ref) {
  return HANotifier(ref);
});
