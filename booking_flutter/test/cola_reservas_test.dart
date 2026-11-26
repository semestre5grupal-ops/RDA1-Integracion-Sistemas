import 'dart:async';

import 'package:booking_flutter/offline/cola_reservas.dart';
import 'package:booking_flutter/offline/estado_red.dart';
import 'package:booking_flutter/services/api_client.dart';
import 'package:booking_flutter/services/sesion_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

ApiException _api(int status, {String detail = 'x', String? corr}) =>
    ApiException(statusCode: status, title: 'Error', detail: detail, correlationId: corr);

ColaReservas _cola(MemorySesionStorage almacen, EnviarReserva enviar, {int maxIntentos = 5}) =>
    ColaReservas(storage: almacen, enviadores: {'auto': enviar}, token: () => 'tok', maxIntentos: maxIntentos);

Future<ReservaPendiente> _encolar(ColaReservas c, {String clave = 'k1'}) =>
    c.encolar(tipo: 'auto', payload: {'dias': 3}, idempotencyKey: clave, titulo: 'Renta: Kia Rio');

void main() {
  group('guardar', () {
    test('la reserva queda guardada y sobrevive a cerrar la app', () async {
      final almacen = MemorySesionStorage();
      final c1 = _cola(almacen, (r, t) async {});
      await _encolar(c1);

      final c2 = _cola(almacen, (r, t) async {});
      await c2.cargar();
      expect(c2.pendientes, hasLength(1));
      expect(c2.pendientes.first.idempotencyKey, 'k1');
      expect(c2.pendientes.first.payload, {'dias': 3});
    });

    test('tocar dos veces no duplica: misma clave, una sola reserva', () async {
      final c = _cola(MemorySesionStorage(), (r, t) async {});
      final a = await _encolar(c);
      final b = await _encolar(c);
      expect(b.id, a.id);
      expect(c.pendientes, hasLength(1));
    });
  });

  group('enviar al volver la red', () {
    test('éxito: sale de la cola y se manda con la MISMA clave y el token', () async {
      final vistas = <String>[];
      final c = _cola(MemorySesionStorage(), (r, t) async => vistas.add('${r.idempotencyKey}|$t'));
      await _encolar(c, clave: 'clave-fija');
      expect(await c.sincronizar(), 1);
      expect(vistas, ['clave-fija|tok']);
      expect(c.pendientes, isEmpty);
    });

    test('sin red: sigue pendiente, conserva la clave y no sigue con las demás', () async {
      var llamadas = 0;
      final c = _cola(MemorySesionStorage(), (r, t) async {
        llamadas++;
        throw http.ClientException('sin red');
      });
      await _encolar(c, clave: 'k1');
      await _encolar(c, clave: 'k2');
      expect(await c.sincronizar(), 0);
      expect(llamadas, 1); // cortó al primer error de red
      expect(c.pendientes.map((r) => r.idempotencyKey), ['k1', 'k2']);
      expect(c.pendientes.first.intentos, 1);
    });

    test('error 5xx: sigue pendiente para reintentar', () async {
      final c = _cola(MemorySesionStorage(), (r, t) async => throw _api(503));
      await _encolar(c);
      await c.sincronizar();
      expect(c.pendientes, hasLength(1));
      expect(c.rechazadas, isEmpty);
    });

    test('error 409 (petición anterior en curso): sigue pendiente, no se descarta', () async {
      final c = _cola(MemorySesionStorage(), (r, t) async => throw _api(409));
      await _encolar(c);
      await c.sincronizar();
      expect(c.pendientes, hasLength(1));
    });

    test('rechazo del servidor (400/422): queda "rechazada" con motivo y código; no se pierde en silencio', () async {
      final c = _cola(MemorySesionStorage(), (r, t) async => throw _api(422, detail: 'Licencia inválida', corr: 'corr-ab12'));
      await _encolar(c);
      await c.sincronizar();
      expect(c.pendientes, isEmpty);
      expect(c.rechazadas, hasLength(1));
      expect(c.rechazadas.first.error, 'Licencia inválida');
      expect(c.rechazadas.first.codigoSoporte, 'corr-ab12');
      // No se reintenta sola.
      var reintentos = 0;
      final c2 = _cola(MemorySesionStorage(), (r, t) async => reintentos++);
      expect(await c2.sincronizar(), 0);
      expect(reintentos, 0);
    });

    test('tras demasiados intentos pasa a "rechazada" para que el usuario la revise', () async {
      final c = _cola(MemorySesionStorage(), (r, t) async => throw _api(503), maxIntentos: 3);
      await _encolar(c);
      for (var i = 0; i < 3; i++) {
        await c.sincronizar();
      }
      expect(c.pendientes, isEmpty);
      expect(c.rechazadas.single.error, contains('Mis Reservas'));
    });

    test('descartar quita la reserva y se guarda', () async {
      final almacen = MemorySesionStorage();
      final c = _cola(almacen, (r, t) async => throw _api(422));
      final r = await _encolar(c);
      await c.sincronizar();
      await c.descartar(r.id);
      final c2 = _cola(almacen, (r, t) async {});
      await c2.cargar();
      expect(c2.rechazadas, isEmpty);
      expect(c2.pendientes, isEmpty);
    });

    test('dos sincronizaciones a la vez no envían dos veces', () async {
      var envios = 0;
      final liberar = Completer<void>();
      final c = _cola(MemorySesionStorage(), (r, t) async {
        envios++;
        await liberar.future;
      });
      await _encolar(c);
      final a = c.sincronizar();
      final b = c.sincronizar();
      liberar.complete();
      await Future.wait([a, b]);
      expect(envios, 1);
    });
  });

  group('esErrorDeRed', () {
    test('red y tiempo agotado sí; errores del servidor no', () {
      expect(esErrorDeRed(http.ClientException('x')), isTrue);
      expect(esErrorDeRed(TimeoutException('x')), isTrue);
      expect(esErrorDeRed(_api(500)), isFalse);
      expect(esErrorDeRed(StateError('x')), isFalse);
    });
  });

  group('EstadoRed', () {
    test('al volver la red envía lo pendiente', () async {
      final cambios = StreamController<bool>();
      var enviadas = 0;
      final c = _cola(MemorySesionStorage(), (r, t) async => enviadas++);
      await _encolar(c);
      final red = EstadoRed(cola: c, cambios: cambios.stream, consultar: () async => false);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(red.enLinea, isFalse);
      expect(enviadas, 0);

      cambios.add(true);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(red.enLinea, isTrue);
      expect(enviadas, 1);
      expect(c.pendientes, isEmpty);
      red.dispose();
      await cambios.close();
    });
  });
}
