import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';
import '../config/api_config.dart';

class ApiClient {
  static final http.Client _client = http.Client();
  static const Uuid _uuid = Uuid();

  static Map<String, String> _buildHeaders({String? token, String? idempotencyKey}) {
    final correlationId = 'corr-${_uuid.v4().substring(0, 8)}';
    final headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Correlation-Id': correlationId,
    };
    if (idempotencyKey != null) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  static Future<http.Response> get(String path, {String? token}) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    return await _client.get(uri, headers: _buildHeaders(token: token)).timeout(ApiConfig.timeout);
  }

  static Future<http.Response> post(String path, {dynamic body, String? token, String? idempotencyKey}) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    return await _client.post(
      uri,
      headers: _buildHeaders(token: token, idempotencyKey: idempotencyKey ?? _uuid.v4()),
      body: body != null ? jsonEncode(body) : null,
    ).timeout(ApiConfig.timeout);
  }
}

