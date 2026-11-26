import 'package:uuid/uuid.dart';

import 'api_client.dart';

/// Telemetría del cliente (equivale a `hooks/useTelemetry.js` de la web).
///
/// Manda eventos de uso a `POST /telemetry/events` para que el equipo vea dónde se
/// atascan los clientes (búsqueda → bloqueo de precio → pago → confirmación).
///
/// Reglas:
/// - Nunca lanza ni bloquea: una falla de telemetría jamás debe afectar una compra.
/// - No lleva datos personales: solo nombres de evento, vertical y datos de la búsqueda.
/// - La sesión es la de esta ejecución de la app (la web usa la sesión del navegador).
class Telemetria {
  Telemetria({Future<void> Function(Map<String, dynamic> evento)? enviar, String? sesion})
      : _enviar = enviar ?? _enviarPorHttp,
        sesion = sesion ?? const Uuid().v4();

  /// Instancia que usa la app. Las pruebas crean la suya con un envío falso.
  static final Telemetria instancia = Telemetria();

  /// Atajo: `Telemetria.registrar('payment_started', 'vuelos')`.
  static void registrar(String evento, [String vertical = 'global', Map<String, dynamic> propiedades = const {}]) =>
      instancia.track(evento, vertical, propiedades);

  final Future<void> Function(Map<String, dynamic> evento) _enviar;
  final String sesion;

  /// Arma el evento con la misma forma que la web.
  Map<String, dynamic> armar(String evento, String vertical, Map<String, dynamic> propiedades) => {
        'event_name': evento,
        'session_id': sesion,
        'vertical': vertical,
        'device': 'mobile',
        'properties': propiedades,
      };

  /// Envía sin esperar y sin lanzar nunca.
  void track(String evento, [String vertical = 'global', Map<String, dynamic> propiedades = const {}]) {
    try {
      final f = _enviar(armar(evento, vertical, _limpiar(propiedades)));
      f.catchError((Object _) {});
    } catch (_) {}
  }

  // Los mensajes de error pueden traer datos del usuario: se recortan.
  static Map<String, dynamic> _limpiar(Map<String, dynamic> p) =>
      p.map((k, v) => MapEntry(k, v is String && v.length > 200 ? v.substring(0, 200) : v));

  static Future<void> _enviarPorHttp(Map<String, dynamic> evento) async {
    await ApiClient.post('/telemetry/events', body: evento, timeout: const Duration(seconds: 5));
  }
}
