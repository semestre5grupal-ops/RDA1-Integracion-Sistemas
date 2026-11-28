import 'dart:convert';

import 'package:booking_flutter/services/actualizacion.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Client _servidor(Object cuerpo, {int status = 200}) =>
    MockClient((_) async => http.Response(cuerpo is String ? cuerpo : jsonEncode(cuerpo), status));

const _ok = {'build': 12, 'obligatoria': true, 'url': 'https://example.com/booking.apk', 'notas': 'Arreglos'};

void main() {
  test('avisa cuando hay una compilación más nueva', () async {
    final v = await buscarActualizacion(client: _servidor(_ok), actual: 10, esWeb: false);
    expect(v, isNotNull);
    expect(v!.build, 12);
    expect(v.obligatoria, isTrue);
    expect(v.notas, 'Arreglos');
  });

  test('no avisa si ya está al día o es más nueva', () async {
    expect(await buscarActualizacion(client: _servidor(_ok), actual: 12, esWeb: false), isNull);
    expect(await buscarActualizacion(client: _servidor(_ok), actual: 13, esWeb: false), isNull);
  });

  test('compilación local (0) y web nunca preguntan', () async {
    expect(await buscarActualizacion(client: _servidor(_ok), actual: 0, esWeb: false), isNull);
    expect(await buscarActualizacion(client: _servidor(_ok), actual: 5, esWeb: true), isNull);
  });

  test('errores del servidor o archivo raro no rompen la app', () async {
    expect(await buscarActualizacion(client: _servidor('no es json'), actual: 1, esWeb: false), isNull);
    expect(await buscarActualizacion(client: _servidor(_ok, status: 404), actual: 1, esWeb: false), isNull);
    expect(await buscarActualizacion(client: _servidor({'build': 'x', 'url': 'https://a'}), actual: 1, esWeb: false), isNull);
    expect(await buscarActualizacion(client: _servidor({'build': 9, 'url': 'http://inseguro'}), actual: 1, esWeb: false), isNull);
    final caido = MockClient((_) async => throw Exception('sin red'));
    expect(await buscarActualizacion(client: caido, actual: 1, esWeb: false), isNull);
  });

  test('obligatoria es falsa si no viene', () {
    expect(InfoVersion.desdeJson({'build': 3, 'url': 'https://a/b.apk'})!.obligatoria, isFalse);
  });
}
