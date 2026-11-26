import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

import 'cola_reservas.dart';

/// Sabe si hay red y, al volver, manda a enviar las reservas guardadas.
class EstadoRed extends ChangeNotifier {
  EstadoRed({required ColaReservas cola, Stream<bool>? cambios, Future<bool> Function()? consultar})
      : _cola = cola,
        _consultar = consultar ?? _consultarConectividad {
    _suscripcion = (cambios ?? _cambiosConectividad()).listen(_alCambiar);
    _inicializar();
  }

  final ColaReservas _cola;
  final Future<bool> Function() _consultar;
  StreamSubscription<bool>? _suscripcion;
  bool _enLinea = true;
  int _ultimasEnviadas = 0;

  bool get enLinea => _enLinea;

  /// Reservas que se enviaron en la última sincronización (para avisar al usuario).
  int get ultimasEnviadas => _ultimasEnviadas;

  Future<void> _inicializar() async {
    await _cola.cargar();
    try {
      _alCambiar(await _consultar());
    } catch (_) {}
  }

  Future<void> _alCambiar(bool enLinea) async {
    final cambio = enLinea != _enLinea;
    _enLinea = enLinea;
    if (cambio) notifyListeners();
    if (enLinea && _cola.pendientes.isNotEmpty) {
      _ultimasEnviadas = await _cola.sincronizar();
      notifyListeners();
    }
  }

  /// Para el botón "Reintentar ahora".
  Future<void> reintentar() => _alCambiar(true);

  static Future<bool> _consultarConectividad() async => _hayRed(await Connectivity().checkConnectivity());

  static Stream<bool> _cambiosConectividad() => Connectivity().onConnectivityChanged.map(_hayRed);

  static bool _hayRed(List<ConnectivityResult> r) => r.any((c) => c != ConnectivityResult.none);

  @override
  void dispose() {
    _suscripcion?.cancel();
    super.dispose();
  }
}
