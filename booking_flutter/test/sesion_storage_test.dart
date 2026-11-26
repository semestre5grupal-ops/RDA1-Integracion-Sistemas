import 'dart:convert';

import 'package:booking_flutter/providers/auth_provider.dart';
import 'package:booking_flutter/services/sesion_storage.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _json(Object body, int status) =>
    http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});

final _sesion = {
  'access_token': 'jwt-real',
  'refresh_token': 'refresh-1',
  'expires_in': 3600,
  'user': {
    'email': 'ana@correo.ec',
    'user_metadata': {'nombre': 'Ana', 'apellido': 'Torres', 'cedula': '1712345675', 'telefono': '0991234567'},
  },
};

void main() {
  group('la sesión va al almacén cifrado, no a SharedPreferences', () {
    test('login guarda los tokens en el almacén y deja SharedPreferences sin ellos', () async {
      SharedPreferences.setMockInitialValues({});
      final almacen = MemorySesionStorage();
      final p = AuthProvider(storage: almacen, client: MockClient((_) async => _json(_sesion, 200)));
      await p.initAuth();
      expect((await p.login('ana@correo.ec', 'buena')).ok, isTrue);

      expect(almacen.datos['auth_token'], 'jwt-real');
      expect(almacen.datos['auth_refresh_token'], 'refresh-1');
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getKeys().where((k) => k.startsWith('auth_')), isEmpty);
    });

    test('al reabrir la app la sesión se restaura desde el almacén', () async {
      SharedPreferences.setMockInitialValues({});
      final almacen = MemorySesionStorage();
      final primera = AuthProvider(storage: almacen, client: MockClient((_) async => _json(_sesion, 200)));
      await primera.initAuth();
      await primera.login('ana@correo.ec', 'buena');

      final segunda = AuthProvider(storage: almacen, client: MockClient((_) async => fail('no debe llamar a la red')));
      await segunda.initAuth();
      expect(segunda.isAuthenticated, isTrue);
      expect(segunda.token, 'jwt-real');
      expect(segunda.userEmail, 'ana@correo.ec');
    });

    test('logout borra la sesión del almacén', () async {
      SharedPreferences.setMockInitialValues({});
      final almacen = MemorySesionStorage();
      final p = AuthProvider(storage: almacen, client: MockClient((_) async => _json(_sesion, 200)));
      await p.initAuth();
      await p.login('ana@correo.ec', 'buena');
      await p.logout();
      expect(almacen.datos.keys.where((k) => k.startsWith('auth_')), isEmpty);
      expect(p.isAuthenticated, isFalse);
    });
  });

  group('migración desde SharedPreferences (versiones anteriores)', () {
    test('mueve la sesión guardada en texto plano al almacén cifrado y la borra del texto plano', () async {
      FlutterSecureStorage.setMockInitialValues({});
      SharedPreferences.setMockInitialValues({
        'auth_token': 'jwt-viejo',
        'auth_refresh_token': 'refresh-viejo',
        'auth_expires_at': 4102444800,
        'booking_currency': 'EUR',
      });
      final almacen = SecureSesionStorage();
      await almacen.migrarLegado(const ['auth_token', 'auth_refresh_token', 'auth_expires_at', 'auth_user_data']);

      expect(await almacen.leer('auth_token'), 'jwt-viejo');
      expect(await almacen.leer('auth_refresh_token'), 'refresh-viejo');
      expect(await almacen.leer('auth_expires_at'), '4102444800');
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.containsKey('auth_token'), isFalse);
      expect(prefs.getString('booking_currency'), 'EUR'); // lo demás no se toca
    });

    test('si el almacén ya tiene la sesión, no se pisa con la copia vieja', () async {
      FlutterSecureStorage.setMockInitialValues({'auth_token': 'jwt-nuevo'});
      SharedPreferences.setMockInitialValues({'auth_token': 'jwt-viejo'});
      final almacen = SecureSesionStorage();
      await almacen.migrarLegado(const ['auth_token']);
      expect(await almacen.leer('auth_token'), 'jwt-nuevo');
      expect((await SharedPreferences.getInstance()).containsKey('auth_token'), isFalse);
    });
  });
}
