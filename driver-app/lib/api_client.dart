import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class AegisApiClient {
  AegisApiClient(this.baseUri, this._storage);
  final Uri baseUri;
  final FlutterSecureStorage _storage;
  static const _authKey = 'aegis.basic-auth';
  Future<void> saveDemoCredentials(String username, String password) => _storage.write(key: _authKey, value: base64Encode(utf8.encode('$username:$password')));
  Future<Map<String, String>> _headers() async { final value = await _storage.read(key: _authKey); return {'Content-Type': 'application/json', if (value != null) 'Authorization': 'Basic $value'}; }
  Future<Map<String, dynamic>> getJson(String path) async { final response = await http.get(baseUri.resolve(path), headers: await _headers()); return _decode(response); }
  Future<Map<String, dynamic>> postJson(String path, [Map<String, dynamic>? body]) async { final response = await http.post(baseUri.resolve(path), headers: await _headers(), body: jsonEncode(body ?? {})); return _decode(response); }
  Future<void> postNoBody(String path) async { final response = await http.post(baseUri.resolve(path), headers: await _headers()); if (response.statusCode < 200 || response.statusCode >= 300) throw AegisApiException.fromResponse(response); }
  Future<void> uploadTelemetry(Map<String, dynamic> value) => postJson('/api/v1/driver/telemetry', value).then((_) {});
  Map<String, dynamic> _decode(http.Response response) { final body = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body) as Map<String, dynamic>; if (response.statusCode < 200 || response.statusCode >= 300) throw AegisApiException(response.statusCode, body['message'] as String? ?? 'Request failed'); return body; }
}
class AegisApiException implements Exception { AegisApiException(this.status, this.message); final int status; final String message; factory AegisApiException.fromResponse(http.Response response) { final body = response.body.isEmpty ? <String,dynamic>{} : jsonDecode(response.body) as Map<String,dynamic>; return AegisApiException(response.statusCode, body['message'] as String? ?? 'Request failed'); } @override String toString() => message; }
