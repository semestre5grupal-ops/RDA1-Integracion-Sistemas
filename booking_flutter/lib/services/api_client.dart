import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import '../config/api_config.dart';

class ApiInvalidParam {
  final String name;
  final String reason;

  ApiInvalidParam({required this.name, required this.reason});

  factory ApiInvalidParam.fromJson(Map<String, dynamic> json) {
    return ApiInvalidParam(
      name: json['name']?.toString() ?? '',
      reason: json['reason']?.toString() ?? '',
    );
  }
}

class ApiException implements Exception {
  final int statusCode;
  final String title;
  final String detail;
  final String? code;
  final String? type;
  final List<ApiInvalidParam> invalidParams;
  final Map<String, dynamic>? rawBody;

  ApiException({
    required this.statusCode,
    required this.title,
    required this.detail,
    this.code,
    this.type,
    this.invalidParams = const [],
    this.rawBody,
  });

  String get userMessage {
    if (invalidParams.isNotEmpty) {
      return invalidParams.map((p) => p.reason.isNotEmpty ? p.reason : p.name).join(' · ');
    }
    if (detail.isNotEmpty) return detail;
    if (title.isNotEmpty) return title;
    return 'Error del servidor (HTTP $statusCode).';
  }

  @override
  String toString() => userMessage;
}

class ApiClient {
  static final http.Client _client = http.Client();
  static const Uuid _uuid = Uuid();
  static const String _fpKey = 'booking_device_fingerprint_v1';
  static String? _cachedFingerprint;

  /// Obtiene o genera la huella persistente del dispositivo (`X-Device-Fingerprint`),
  /// obligatoria en el contrato de vuelos (`/vuelos/*`) para asociar holds y reservas.
  static Future<String> getDeviceFingerprint() async {
    if (_cachedFingerprint != null && _cachedFingerprint!.isNotEmpty) {
      return _cachedFingerprint!;
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_fpKey);
      if (saved != null && saved.isNotEmpty) {
        _cachedFingerprint = saved;
        return saved;
      }
      final created = 'fl-${_uuid.v4()}';
      await prefs.setString(_fpKey, created);
      _cachedFingerprint = created;
      return created;
    } catch (_) {
      _cachedFingerprint ??= 'fl-${_uuid.v4()}';
      return _cachedFingerprint!;
    }
  }

  static Future<Map<String, String>> _buildHeaders({
    String? token,
    String? idempotencyKey,
    String? correlationId,
    bool includeFingerprint = false,
  }) async {
    final corr = correlationId ?? 'corr-${_uuid.v4().substring(0, 8)}';
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Correlation-Id': corr,
    };
    if (idempotencyKey != null && idempotencyKey.isNotEmpty) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    if (includeFingerprint) {
      headers['X-Device-Fingerprint'] = await getDeviceFingerprint();
    }
    return headers;
  }

  static ApiException parseError(http.Response res) {
    try {
      final decoded = jsonDecode(res.body);
      if (decoded is Map<String, dynamic>) {
        final rawParams = decoded['invalidParams'];
        final params = rawParams is List
            ? rawParams
                .whereType<Map>()
                .map((m) => ApiInvalidParam.fromJson(Map<String, dynamic>.from(m)))
                .toList()
            : <ApiInvalidParam>[];
        return ApiException(
          statusCode: res.statusCode,
          title: decoded['title']?.toString() ?? 'Error',
          detail: decoded['detail']?.toString() ?? decoded['message']?.toString() ?? '',
          code: decoded['code']?.toString(),
          type: decoded['type']?.toString(),
          invalidParams: params,
          rawBody: decoded,
        );
      }
    } catch (_) {}
    return ApiException(
      statusCode: res.statusCode,
      title: 'HTTP ${res.statusCode}',
      detail: res.body.isNotEmpty ? res.body : 'Error inesperado de comunicación.',
    );
  }

  static Uri _buildUri(String path, [Map<String, String>? queryParams]) {
    final base = Uri.parse('${ApiConfig.baseUrl}$path');
    if (queryParams == null || queryParams.isEmpty) return base;
    final clean = <String, String>{};
    queryParams.forEach((k, v) {
      if (v.isNotEmpty) clean[k] = v;
    });
    return base.replace(queryParameters: {...base.queryParameters, ...clean});
  }

  static Future<http.Response> get(
    String path, {
    Map<String, String>? queryParams,
    String? token,
    String? correlationId,
    bool includeFingerprint = false,
    Duration? timeout,
  }) async {
    final uri = _buildUri(path, queryParams);
    final headers = await _buildHeaders(
      token: token,
      correlationId: correlationId,
      includeFingerprint: includeFingerprint,
    );
    return await _client.get(uri, headers: headers).timeout(timeout ?? ApiConfig.timeout);
  }

  static Future<http.Response> post(
    String path, {
    dynamic body,
    String? token,
    String? idempotencyKey,
    String? correlationId,
    bool includeFingerprint = false,
    Duration? timeout,
  }) async {
    final uri = _buildUri(path);
    final headers = await _buildHeaders(
      token: token,
      idempotencyKey: idempotencyKey,
      correlationId: correlationId,
      includeFingerprint: includeFingerprint,
    );
    return await _client
        .post(
          uri,
          headers: headers,
          body: body != null ? jsonEncode(body) : null,
        )
        .timeout(timeout ?? ApiConfig.timeout);
  }

  static Future<http.Response> put(
    String path, {
    dynamic body,
    String? token,
    String? correlationId,
    bool includeFingerprint = false,
    Duration? timeout,
  }) async {
    final uri = _buildUri(path);
    final headers = await _buildHeaders(
      token: token,
      correlationId: correlationId,
      includeFingerprint: includeFingerprint,
    );
    return await _client
        .put(
          uri,
          headers: headers,
          body: body != null ? jsonEncode(body) : null,
        )
        .timeout(timeout ?? ApiConfig.timeout);
  }

  static Future<http.Response> delete(
    String path, {
    Map<String, String>? queryParams,
    String? token,
    String? correlationId,
    bool includeFingerprint = false,
    Duration? timeout,
  }) async {
    final uri = _buildUri(path, queryParams);
    final headers = await _buildHeaders(
      token: token,
      correlationId: correlationId,
      includeFingerprint: includeFingerprint,
    );
    return await _client.delete(uri, headers: headers).timeout(timeout ?? ApiConfig.timeout);
  }
}
