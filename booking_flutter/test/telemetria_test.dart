import 'dart:async';

import 'package:booking_flutter/services/telemetria.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('el evento tiene la misma forma que el de la web', () {
    final enviados = <Map<String, dynamic>>[];
    final t = Telemetria(enviar: (e) async => enviados.add(e), sesion: 'sesion-1');
    t.track('search_submitted', 'vuelos', {'origen': 'UIO', 'destino': 'GYE', 'esIdaVuelta': false});
    expect(enviados.single, {
      'event_name': 'search_submitted',
      'session_id': 'sesion-1',
      'vertical': 'vuelos',
      'device': 'mobile',
      'properties': {'origen': 'UIO', 'destino': 'GYE', 'esIdaVuelta': false},
    });
  });

  test('vertical global por defecto y misma sesión en todos los eventos', () {
    final enviados = <Map<String, dynamic>>[];
    final t = Telemetria(enviar: (e) async => enviados.add(e));
    t.track('a');
    t.track('b');
    expect(enviados.map((e) => e['vertical']), ['global', 'global']);
    expect(enviados[0]['session_id'], enviados[1]['session_id']);
  });

  test('si el envío falla (asíncrono o síncrono) nunca lanza ni afecta la compra', () async {
    final t1 = Telemetria(enviar: (e) async => throw Exception('sin red'));
    expect(() => t1.track('x'), returnsNormally);
    final t2 = Telemetria(enviar: (e) => throw StateError('falla síncrona'));
    expect(() => t2.track('x'), returnsNormally);
    await Future<void>.delayed(const Duration(milliseconds: 10)); // sin errores sin capturar
  });

  test('recorta textos largos (un mensaje de error no debe arrastrar datos de más)', () {
    final enviados = <Map<String, dynamic>>[];
    final t = Telemetria(enviar: (e) async => enviados.add(e));
    t.track('payment_failed', 'vuelos', {'error': 'x' * 500});
    expect((enviados.single['properties'] as Map)['error'], hasLength(200));
  });
}
