import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

/// Anything that went wrong while talking to the Mirrorial backend. [statusCode] is null when the request never
/// got an answer (no connection, timeout, answer was not JSON).
class BackendException implements Exception {
  final String message;
  final int? statusCode;

  const BackendException(this.message, {this.statusCode});

  /// The backend answered but refused: wrong or missing access token.
  bool get isAuthError => statusCode == 401 || statusCode == 403;

  @override
  String toString() => 'BackendException: $message';
}

/// The backend address: `system.backendUrl` from the config, else the DISPLAY_API_BASE build define, else the
/// backend on this machine. One place instead of one copy per service.
String resolveBackendBaseUrl(Map<String, dynamic>? config) {
  const envBaseUrl = String.fromEnvironment('DISPLAY_API_BASE');
  final configuredBaseUrl = config?['system']?['backendUrl'] as String?;
  final baseUrl = (configuredBaseUrl != null && configuredBaseUrl.trim().isNotEmpty)
      ? configuredBaseUrl.trim()
      : (envBaseUrl.isNotEmpty ? envBaseUrl : 'http://127.0.0.1:3000');

  return baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
}

/// The access token for a backend that is not on this machine. The display on the mirror itself talks to
/// 127.0.0.1 and needs none (the backend trusts the local machine). A token is only ever read from the build
/// define DISPLAY_ACCESS_TOKEN or the environment, never from config.json, which the remote UI can read.
String resolveAccessToken() {
  const defined = String.fromEnvironment('DISPLAY_ACCESS_TOKEN');
  if (defined.trim().isNotEmpty) {
    return defined.trim();
  }
  try {
    return (Platform.environment['MIRRORIAL_ACCESS_TOKEN'] ?? '').trim();
  } catch (_) {
    return '';
  }
}

/// One HTTP client for every call to the backend: a timeout on every request, the access token when there is
/// one, and one kind of error ([BackendException]) instead of a mix of exceptions and silent empty lists.
class BackendClient {
  final http.Client _client;
  final Duration timeout;
  final String _token;

  BackendClient({http.Client? client, this.timeout = const Duration(seconds: 10), String? token})
      : _client = client ?? http.Client(),
        _token = token ?? resolveAccessToken();

  Map<String, String> _headers({bool json = false}) => {
        'accept': 'application/json',
        if (json) 'content-type': 'application/json',
        if (_token.isNotEmpty) 'authorization': 'Bearer $_token',
      };

  Uri _uri(String baseUrl, String path, Map<String, String>? query) {
    final base = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    final uri = Uri.parse('$base$path');
    return query == null || query.isEmpty ? uri : uri.replace(queryParameters: {...uri.queryParameters, ...query});
  }

  Future<dynamic> getJson(String baseUrl, String path, {Map<String, String>? query}) {
    return _send(() => _client.get(_uri(baseUrl, path, query), headers: _headers()));
  }

  Future<dynamic> postJson(String baseUrl, String path, Object body) {
    return _send(() => _client.post(_uri(baseUrl, path, null), headers: _headers(json: true), body: jsonEncode(body)));
  }

  /// Like [postJson] for calls whose answer is not used (status report). Never throws.
  Future<void> postQuietly(String baseUrl, String path, Object body) async {
    try {
      await postJson(baseUrl, path, body);
    } catch (_) {
      // Best effort only.
    }
  }

  Future<dynamic> _send(Future<http.Response> Function() request) async {
    final http.Response response;
    try {
      response = await request().timeout(timeout);
    } on TimeoutException {
      throw const BackendException('The backend did not answer in time.');
    } on SocketException catch (error) {
      throw BackendException('The backend is not reachable (${error.message}).');
    } on http.ClientException catch (error) {
      throw BackendException('The backend is not reachable (${error.message}).');
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw BackendException(
        response.statusCode == 401 || response.statusCode == 403
            ? 'The backend refused the request (HTTP ${response.statusCode}): access token missing or wrong.'
            : 'The backend answered with HTTP ${response.statusCode}.',
        statusCode: response.statusCode,
      );
    }

    try {
      return jsonDecode(utf8.decode(response.bodyBytes));
    } on FormatException {
      throw BackendException('The backend answer was not valid JSON.', statusCode: response.statusCode);
    }
  }

  void close() => _client.close();
}

final backendClientProvider = Provider<BackendClient>((ref) {
  final client = BackendClient();
  ref.onDispose(client.close);
  return client;
});

/// "The data on screen is not current". [dataFrom] is when it was last fetched successfully, null when there
/// never was a successful fetch.
class StaleInfo {
  final DateTime? dataFrom;

  const StaleInfo(this.dataFrom);
}
