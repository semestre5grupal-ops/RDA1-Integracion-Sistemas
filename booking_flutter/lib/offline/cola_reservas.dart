import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import '../services/api_client.dart';
import '../services/sesion_storage.dart';

/// Reserva que se hizo sin conexión (o con la conexión caída) y espera para enviarse.
///
/// Equivale a `offlineSync.js` de la web. La `idempotencyKey` se guarda con la
/// reserva y NO cambia nunca: si el primer intento sí llegó al servidor pero la
/// respuesta se perdió, el reintento es reconocido y no se cobra dos veces.
class ReservaPendiente {
  ReservaPendiente({
    required this.id,
    required this.tipo,
    required this.payload,
    required this.idempotencyKey,
    required this.titulo,
    required this.creada,
    this.intentos = 0,
    this.rechazada = false,
    this.error,
    this.codigoSoporte,
  });

  final String id;

  /// `vuelo`, `auto`, `atraccion` o `alojamiento`.
  final String tipo;
  final Map<String, dynamic> payload;
  final String idempotencyKey;

  /// Texto para mostrar al usuario ("Renta: Kia Rio").
  final String titulo;
  final DateTime creada;
  int intentos;

  /// El servidor la rechazó (datos inválidos, sin cupo…): no se reintenta sola.
  bool rechazada;
  String? error;
  String? codigoSoporte;

  Map<String, dynamic> toJson() => {
        'id': id,
        'tipo': tipo,
        'payload': payload,
        'idempotencyKey': idempotencyKey,
        'titulo': titulo,
        'creada': creada.toIso8601String(),
        'intentos': intentos,
        'rechazada': rechazada,
        'error': error,
        'codigoSoporte': codigoSoporte,
      };

  factory ReservaPendiente.fromJson(Map<String, dynamic> j) => ReservaPendiente(
        id: j['id'].toString(),
        tipo: j['tipo'].toString(),
        payload: Map<String, dynamic>.from(j['payload'] as Map),
        idempotencyKey: j['idempotencyKey'].toString(),
        titulo: j['titulo']?.toString() ?? '',
        creada: DateTime.tryParse(j['creada']?.toString() ?? '') ?? DateTime.now(),
        intentos: (j['intentos'] as num?)?.toInt() ?? 0,
        rechazada: j['rechazada'] == true,
        error: j['error']?.toString(),
        codigoSoporte: j['codigoSoporte']?.toString(),
      );
}

/// Envía una reserva al servidor. Debe lanzar si no se confirmó.
typedef EnviarReserva = Future<void> Function(ReservaPendiente reserva, String? token);

/// `true` si el error es de conexión (sin red, tiempo agotado): la reserva puede
/// guardarse y reintentarse. Un error del servidor (`ApiException`) NO es de red.
bool esErrorDeRed(Object e) => e is TimeoutException || e is http.ClientException;

/// Cola de reservas pendientes: se guarda en el aparato y se envía al volver la red.
class ColaReservas extends ChangeNotifier {
  ColaReservas({
    required SesionStorage storage,
    required Map<String, EnviarReserva> enviadores,
    String? Function()? token,
    int maxIntentos = 5,
    Uuid? generador,
  })  : _storage = storage,
        _enviadores = enviadores,
        _token = token ?? (() => null),
        _maxIntentos = maxIntentos,
        _uuid = generador ?? const Uuid();

  static const _clave = 'cola_reservas_pendientes_v1';

  final SesionStorage _storage;
  final Map<String, EnviarReserva> _enviadores;
  final String? Function() _token;
  final int _maxIntentos;
  final Uuid _uuid;

  final List<ReservaPendiente> _items = [];
  bool _sincronizando = false;
  bool _cargada = false;

  List<ReservaPendiente> get pendientes => _items.where((r) => !r.rechazada).toList(growable: false);
  List<ReservaPendiente> get rechazadas => _items.where((r) => r.rechazada).toList(growable: false);
  bool get sincronizando => _sincronizando;

  /// Lee la cola guardada. Idempotente.
  Future<void> cargar() async {
    if (_cargada) return;
    _cargada = true;
    try {
      final crudo = await _storage.leer(_clave);
      if (crudo == null || crudo.isEmpty) return;
      final lista = jsonDecode(crudo);
      if (lista is List) {
        for (final e in lista.whereType<Map>()) {
          try {
            _items.add(ReservaPendiente.fromJson(Map<String, dynamic>.from(e)));
          } catch (_) {}
        }
      }
    } catch (_) {}
    notifyListeners();
  }

  Future<void> _guardar() async {
    try {
      await _storage.escribir(_clave, jsonEncode(_items.map((r) => r.toJson()).toList()));
    } catch (_) {}
  }

  /// Guarda una reserva para enviarla después. Si [idempotencyKey] ya está en la
  /// cola (por ejemplo, el usuario toca dos veces), no se duplica.
  Future<ReservaPendiente> encolar({
    required String tipo,
    required Map<String, dynamic> payload,
    required String idempotencyKey,
    required String titulo,
  }) async {
    await cargar();
    final existente = _items.where((r) => r.idempotencyKey == idempotencyKey);
    if (existente.isNotEmpty) return existente.first;
    final r = ReservaPendiente(
      id: _uuid.v4(),
      tipo: tipo,
      payload: payload,
      idempotencyKey: idempotencyKey,
      titulo: titulo,
      creada: DateTime.now(),
    );
    _items.add(r);
    await _guardar();
    notifyListeners();
    return r;
  }

  /// Quita una reserva de la cola (la envió bien, o el usuario la descarta).
  Future<void> descartar(String id) async {
    _items.removeWhere((r) => r.id == id);
    await _guardar();
    notifyListeners();
  }

  /// Envía en orden las reservas pendientes. Devuelve cuántas se confirmaron.
  ///
  /// - Éxito: sale de la cola.
  /// - Error de red, 5xx, 408, 409 o 429: sigue pendiente y se reintentará (con la MISMA
  ///   clave). Tras [_maxIntentos] intentos pasa a "rechazada" para que el usuario la revise.
  /// - Otro error 4xx (datos inválidos, sin cupo…): queda "rechazada" con el motivo y el
  ///   código de soporte; no se reintenta sola.
  Future<int> sincronizar() async {
    await cargar();
    if (_sincronizando) return 0;
    _sincronizando = true;
    notifyListeners();
    var enviadas = 0;
    try {
      for (final r in List<ReservaPendiente>.of(pendientes)) {
        final enviar = _enviadores[r.tipo];
        if (enviar == null) {
          r
            ..rechazada = true
            ..error = 'Tipo de reserva desconocido (${r.tipo}).';
          continue;
        }
        try {
          await enviar(r, _token());
          _items.removeWhere((x) => x.id == r.id);
          enviadas++;
        } catch (e) {
          r.intentos++;
          if (e is ApiException && _esRechazoDefinitivo(e.statusCode)) {
            r
              ..rechazada = true
              ..error = e.userMessage
              ..codigoSoporte = e.correlationId;
          } else if (r.intentos >= _maxIntentos) {
            r
              ..rechazada = true
              ..error = 'No se pudo enviar después de ${r.intentos} intentos. Revisa Mis Reservas antes de repetir.'
              ..codigoSoporte = e is ApiException ? e.correlationId : null;
          }
          // Si el error es de red, no tiene sentido seguir con las demás ahora.
          if (esErrorDeRed(e)) break;
        }
      }
    } finally {
      _sincronizando = false;
      await _guardar();
      notifyListeners();
    }
    return enviadas;
  }

  static bool _esRechazoDefinitivo(int status) {
    if (status < 400 || status >= 500) return false;
    return status != 408 && status != 409 && status != 429;
  }
}
