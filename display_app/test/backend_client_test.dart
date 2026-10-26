import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mirrorial_display/services/backend_client.dart';

http.Response json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  test('resolveBackendBaseUrl: config wins, trailing slash is removed, local backend is the default', () {
    expect(resolveBackendBaseUrl(null), 'http://127.0.0.1:3000');
    expect(resolveBackendBaseUrl({'system': {'backendUrl': ''}}), 'http://127.0.0.1:3000');
    expect(resolveBackendBaseUrl({'system': {'backendUrl': ' http://mirror.local:3000/ '}}), 'http://mirror.local:3000');
  });

  test('sends the access token as a bearer header when there is one, and none when there is not', () async {
    final seen = <http.Request>[];
    final mock = MockClient((request) async {
      seen.add(request);
      return json({'ok': true});
    });
    await BackendClient(client: mock, token: 'secret-token-123456').getJson('http://b', '/api/x');
    await BackendClient(client: mock, token: '').getJson('http://b', '/api/x');
    expect(seen[0].headers['authorization'], 'Bearer secret-token-123456');
    expect(seen[1].headers.containsKey('authorization'), isFalse);
  });

  test('builds the URL from base, path and query', () async {
    late Uri uri;
    final client = BackendClient(client: MockClient((request) async {
      uri = request.url;
      return json({});
    }), token: '');
    await client.getJson('http://b:3000/', '/api/display/context', query: {'locale': 'de'});
    expect(uri.toString(), 'http://b:3000/api/display/context?locale=de');
  });

  test('postJson sends a JSON body with a content type', () async {
    late http.Request seen;
    final client = BackendClient(client: MockClient((request) async {
      seen = request;
      return json({'items': []});
    }), token: '');
    await client.postJson('http://b', '/api/display/travel-time', {'items': [1]});
    expect(seen.method, 'POST');
    expect(seen.headers['content-type'], contains('application/json'));
    expect(jsonDecode(seen.body), {'items': [1]});
  });

  test('a non-2xx answer is an error, never an empty result', () async {
    final client = BackendClient(client: MockClient((_) async => json({'error': 'x'}, 500)), token: '');
    await expectLater(client.getJson('http://b', '/api/x'), throwsA(isA<BackendException>().having((e) => e.statusCode, 'status', 500)));
  });

  test('401 and 403 are recognised as a token problem and say so', () async {
    for (final status in [401, 403]) {
      final client = BackendClient(client: MockClient((_) async => json({'error': 'no'}, status)), token: '');
      await expectLater(
        client.getJson('http://b', '/api/x'),
        throwsA(isA<BackendException>().having((e) => e.isAuthError, 'isAuthError', true).having((e) => e.message, 'message', contains('token'))),
      );
    }
  });

  test('an answer that is not JSON is an error', () async {
    final client = BackendClient(client: MockClient((_) async => http.Response('<html>login</html>', 200)), token: '');
    await expectLater(client.getJson('http://b', '/api/x'), throwsA(isA<BackendException>()));
  });

  test('a backend that never answers is cut off by the timeout', () async {
    final never = Completer<http.Response>();
    final client = BackendClient(
      client: MockClient((_) => never.future),
      timeout: const Duration(milliseconds: 50),
      token: '',
    );
    await expectLater(client.getJson('http://b', '/api/x'), throwsA(isA<BackendException>().having((e) => e.message, 'message', contains('in time'))));
  });

  test('a connection failure becomes a BackendException', () async {
    final client = BackendClient(client: MockClient((_) async => throw http.ClientException('connection refused')), token: '');
    await expectLater(client.getJson('http://b', '/api/x'), throwsA(isA<BackendException>()));
  });

  test('umlauts survive: the body is decoded as UTF-8 regardless of the charset header', () async {
    final client = BackendClient(
      client: MockClient((_) async => http.Response.bytes(utf8.encode('{"t":"Zähne Größe"}'), 200)),
      token: '',
    );
    expect((await client.getJson('http://b', '/api/x'))['t'], 'Zähne Größe');
  });

  test('postQuietly never throws', () async {
    final client = BackendClient(client: MockClient((_) async => throw http.ClientException('down')), token: '');
    await client.postQuietly('http://b', '/api/display/status', {'width': 1});
  });
}
