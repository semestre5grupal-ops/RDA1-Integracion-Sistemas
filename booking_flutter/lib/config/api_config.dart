import 'package:flutter/foundation.dart';

class ApiConfig {
  /// En producción (web release o APK release) apunta al API Gateway de Azure.
  /// En desarrollo local usa 10.0.2.2 en emulador Android y localhost en Web/Desktop.
  static String get baseUrl {
    const envUrl = String.fromEnvironment('API_URL');
    if (envUrl.isNotEmpty) return envUrl;
    if (kReleaseMode) {
      return 'https://booking-core-api.azurewebsites.net/api/v1';
    }
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000/api/v1';
    }
    return 'http://localhost:3000/api/v1';
  }

  static const Duration timeout = Duration(seconds: 30);
  static const Duration sagaTimeout = Duration(seconds: 45);
  static const Duration vuelosBookingTimeout = Duration(seconds: 90);
}
