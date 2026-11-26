import 'package:uuid/uuid.dart';

/// Identificadores de UNA compra de vuelo: la `Idempotency-Key` y el
/// `X-Correlation-Id` (mismo criterio que `correlacionDeCompraActual` en la web).
///
/// Regla de oro: reintentar la misma compra (tras un corte de red o un tiempo de
/// espera agotado) debe mandar la MISMA clave, para que el servidor reconozca el
/// reintento y no cobre dos veces. Una clave nueva solo se crea cuando cambia la
/// retención de precio (hold), es decir, cuando es otra compra.
class ClaveCompra {
  ClaveCompra({Uuid? generador}) : _uuid = generador ?? const Uuid();

  final Uuid _uuid;
  String? _holdId;
  String? _clave;
  String? _correlacion;

  /// Clave de idempotencia de la reserva asociada a [holdId].
  String idempotencia(String holdId) {
    _asegurar(holdId);
    return _clave!;
  }

  /// Código de correlación de la reserva asociada a [holdId].
  String correlacion(String holdId) {
    _asegurar(holdId);
    return _correlacion!;
  }

  void _asegurar(String holdId) {
    if (_holdId == holdId && _clave != null) return;
    _holdId = holdId;
    _clave = _uuid.v4();
    _correlacion = 'corr-${_uuid.v4().substring(0, 8)}';
  }

  /// Olvida la compra actual (por ejemplo, tras confirmarla).
  void reiniciar() {
    _holdId = null;
    _clave = null;
    _correlacion = null;
  }
}

/// `Idempotency-Key` para reservas sin retención previa (autos, atracciones).
///
/// Mientras el contenido de la reserva no cambie, un reintento manda la misma
/// clave (el servidor lo reconoce y no cobra dos veces). Si el usuario cambia
/// algo (fecha, personas, cobertura), es otra reserva y recibe otra clave.
class ClavePorContenido {
  ClavePorContenido({Uuid? generador}) : _uuid = generador ?? const Uuid();

  final Uuid _uuid;
  String? _huella;
  String? _clave;

  String para(Map<String, dynamic> contenido) {
    final huella = _huellaDe(contenido);
    if (_clave == null || _huella != huella) {
      _huella = huella;
      _clave = _uuid.v4();
    }
    return _clave!;
  }

  /// Llamar al confirmar la reserva: la siguiente usa una clave nueva.
  void reiniciar() {
    _huella = null;
    _clave = null;
  }

  // Orden de claves estable: dos mapas iguales con distinto orden dan la misma huella.
  static String _huellaDe(Object? v) {
    if (v is Map) {
      final claves = v.keys.map((k) => k.toString()).toList()..sort();
      return '{${claves.map((k) => '$k:${_huellaDe(v[k])}').join(',')}}';
    }
    if (v is List) return '[${v.map(_huellaDe).join(',')}]';
    return '$v';
  }
}
