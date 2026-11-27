import 'package:flutter/foundation.dart';

class ApiConfig {
  /// URL del backend central en producción desplegado en Microsoft Azure.
  static const String azureBaseUrl = 'https://booking-core-api.azurewebsites.net/api/v1';

  /// URL del backend en entorno local (puerto 3000).
  static const String localBaseUrl = 'http://localhost:3000/api/v1';

  /// Retorna la URL base activa:
  /// - Si se define `API_URL` vía `--dart-define=API_URL=...`, tiene máxima prioridad.
  /// - Si se activa `--dart-define=USE_LOCAL=true`, apunta al backend local en puerto 3000.
  /// - Por defecto apunta al backend en la nube (Azure) para disponer de los catálogos en vivo sin requerir levantar el servidor localmente.
  static String get baseUrl {
    const envUrl = String.fromEnvironment('API_URL');
    if (envUrl.isNotEmpty) return envUrl;

    const useLocal = bool.fromEnvironment('USE_LOCAL', defaultValue: false);
    if (useLocal) {
      if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
        return 'http://10.0.2.2:3000/api/v1';
      }
      return localBaseUrl;
    }

    return azureBaseUrl;
  }

  static const Duration timeout = Duration(seconds: 30);
  static const Duration sagaTimeout = Duration(seconds: 45);
  static const Duration vuelosBookingTimeout = Duration(seconds: 90);
}
