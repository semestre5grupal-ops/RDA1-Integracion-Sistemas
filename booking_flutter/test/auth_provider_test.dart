import 'dart:convert';

import 'package:booking_flutter/providers/auth_provider.dart';
import 'package:booking_flutter/services/sesion_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _json(Object body, int status) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});

Map<String, dynamic> _sesion({String token = 'jwt-real', int expiresIn = 3600}) => {
      'access_token': token,
      'refresh_token': 'refresh-1',
      'expires_in': expiresIn,
      'user': {
        'email': 'ana@correo.ec',
        'user_metadata': {'nombre': 'Ana', 'apellido': 'Torres', 'cedula': '1712345675', 'telefono': '0991234567'},
      },
    };

Future<AuthProvider> _provider(MockClient client, [Map<String, Object> prefs = const {}]) async {
  SharedPreferences.setMockInitialValues(prefs);
  final p = AuthProvider(client: client, storage: PrefsSesionStorage());
  await p.initAuth();
  return p;
}

void main() {
  group('login', () {
    test('contraseña incorrecta: NO crea sesión y muestra el mensaje de React', () async {
      final p = await _provider(MockClient((_) async => _json({'error': 'invalid_grant', 'error_description': 'Invalid login credentials'}, 400)));
      final r = await p.login('ana@correo.ec', 'mala');
      expect(r.ok, isFalse);
      expect(r.error, 'Correo o contraseña invalidos');
      expect(p.isAuthenticated, isFalse);
      expect(p.token, isNull);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('auth_token'), isNull);
    });

    test('fallo de red: NO crea sesión', () async {
      final p = await _provider(MockClient((_) async => throw http.ClientException('sin red')));
      final r = await p.login('ana@correo.ec', 'x');
      expect(r.ok, isFalse);
      expect(r.error, contains('No se pudo conectar'));
      expect(p.isAuthenticated, isFalse);
    });

    test('correo sin confirmar', () async {
      final p = await _provider(MockClient((_) async => _json({'error_description': 'Email not confirmed'}, 400)));
      final r = await p.login('ana@correo.ec', 'x');
      expect(r.ok, isFalse);
      expect(r.error, contains('confirmar tu correo'));
    });

    test('200 sin access_token no se acepta', () async {
      final p = await _provider(MockClient((_) async => _json({'user': {}}, 200)));
      expect((await p.login('ana@correo.ec', 'x')).ok, isFalse);
      expect(p.isAuthenticated, isFalse);
    });

    test('credenciales válidas: sesión real con datos de user_metadata', () async {
      late http.Request enviada;
      final p = await _provider(MockClient((req) async {
        enviada = req;
        return _json(_sesion(), 200);
      }));
      final r = await p.login(' Ana@Correo.EC ', 'buena');
      expect(r.ok, isTrue);
      expect(enviada.url.query, 'grant_type=password');
      expect(jsonDecode(enviada.body)['email'], 'ana@correo.ec');
      expect(p.isAuthenticated, isTrue);
      expect(p.token, 'jwt-real');
      expect(p.user!.nombreCompleto, 'Ana Torres');
      expect(p.user!.cedula, '1712345675');
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('auth_refresh_token'), 'refresh-1');
      expect(prefs.getString('auth_expires_at'), isNotNull); // ahora se guarda como texto
    });
  });

  group('restaurar sesión (initAuth)', () {
    test('descarta sesiones inventadas por el antiguo modo demo', () async {
      final p = await _provider(MockClient((_) async => fail('no debe llamar a la red')), {
        'auth_token': 'jwt-session-1700000000000',
        'auth_user_data': jsonEncode({'nombre': 'x', 'email': 'x@y.z'}),
        'booking_cookie_decision': 'all',
      });
      expect(p.isAuthenticated, isFalse);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('auth_token'), isNull);
      expect(prefs.getString('booking_cookie_decision'), 'all'); // no se borra lo ajeno a la sesión
    });

    test('token sin datos de usuario no se restaura', () async {
      final p = await _provider(MockClient((_) async => fail('sin red')), {'auth_token': 'jwt-real'});
      expect(p.isAuthenticated, isFalse);
    });

    test('token caducado se renueva con refresh_token (una sola vez)', () async {
      var llamadas = 0;
      final ahora = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      SharedPreferences.setMockInitialValues({
        'auth_token': 'viejo',
        'auth_refresh_token': 'refresh-0',
        'auth_expires_at': ahora - 10,
        'auth_user_data': jsonEncode({'nombre': 'Ana', 'email': 'ana@correo.ec'}),
      });
      final p = AuthProvider(storage: PrefsSesionStorage(), client: MockClient((req) async {
        llamadas++;
        expect(req.url.query, 'grant_type=refresh_token');
        expect(jsonDecode(req.body)['refresh_token'], 'refresh-0');
        return _json(_sesion(token: 'nuevo'), 200);
      }));
      await Future.wait([p.initAuth(), p.initAuth()]); // como main.dart + constructor
      expect(llamadas, 1);
      expect(p.token, 'nuevo');
      expect(p.isAuthenticated, isTrue);
    });

    test('si la renovación falla se cierra la sesión', () async {
      final ahora = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      final p = await _provider(MockClient((_) async => _json({'error': 'invalid_grant'}, 400)), {
        'auth_token': 'viejo',
        'auth_refresh_token': 'refresh-0',
        'auth_expires_at': ahora - 10,
        'auth_user_data': jsonEncode({'nombre': 'Ana', 'email': 'ana@correo.ec'}),
      });
      expect(p.isAuthenticated, isFalse);
      expect((await SharedPreferences.getInstance()).getString('auth_token'), isNull);
    });
  });

  group('register', () {
    Future<AuthResult> registrar(AuthProvider p) => p.register(
          nombre: 'Ana',
          apellido: 'Torres',
          tipoDocumento: 'CEDULA',
          cedula: '1712345675',
          telefono: '0991234567',
          email: 'ana@correo.ec',
          password: 'Clave#2026',
        );

    test('alta que requiere confirmar correo: sin sesión y con aviso', () async {
      final p = await _provider(MockClient((_) async => _json({
            'id': 'u1',
            'email': 'ana@correo.ec',
            'identities': [{}]
          }, 200)));
      final r = await registrar(p);
      expect(r.ok, isTrue);
      expect(r.info, contains('revisa tu correo'));
      expect(p.isAuthenticated, isFalse);
    });

    test('correo ya existente (identities vacío) es error', () async {
      final p = await _provider(MockClient((_) async => _json({'id': 'u1', 'identities': []}, 200)));
      final r = await registrar(p);
      expect(r.ok, isFalse);
      expect(r.error, contains('ya se encuentra registrado'));
      expect(p.isAuthenticated, isFalse);
    });

    test('error de Supabase o de red: sin sesión', () async {
      final p1 = await _provider(MockClient((_) async => _json({'msg': 'User already registered'}, 422)));
      expect((await registrar(p1)).error, contains('ya se encuentra registrado'));
      expect(p1.isAuthenticated, isFalse);
      final p2 = await _provider(MockClient((_) async => throw http.ClientException('sin red')));
      expect((await registrar(p2)).ok, isFalse);
      expect(p2.isAuthenticated, isFalse);
    });

    test('con autoconfirmación: sesión real', () async {
      final p = await _provider(MockClient((_) async => _json(_sesion(), 200)));
      final r = await registrar(p);
      expect(r.ok, isTrue);
      expect(r.info, isNull);
      expect(p.isAuthenticated, isTrue);
    });
  });

  group('perfil y logout', () {
    test('si no se puede verificar la contraseña actual, no se cambia', () async {
      var fase = 0;
      final p = await _provider(MockClient((req) async {
        fase++;
        if (fase == 1) return _json(_sesion(), 200); // login
        throw http.ClientException('sin red'); // verificación de la contraseña actual
      }));
      await p.login('ana@correo.ec', 'buena');
      final err = await p.updateProfile(
        nombre: 'Ana',
        apellido: 'Torres',
        telefono: '099',
        email: 'ana@correo.ec',
        currentPassword: 'buena',
        newPassword: 'Nueva#1',
      );
      expect(err, isNotNull);
      expect(fase, 2); // nunca llegó al PUT /auth/v1/user
    });

    test('logout borra solo la sesión (conserva huella, cookies y moneda)', () async {
      final p = await _provider(MockClient((_) async => _json(_sesion(), 200)), {
        'booking_device_fingerprint_v1': 'fl-abc',
        'booking_cookie_decision': 'all',
        'booking_currency': 'EUR',
      });
      await p.login('ana@correo.ec', 'buena');
      await p.logout();
      expect(p.isAuthenticated, isFalse);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('auth_token'), isNull);
      expect(prefs.getString('booking_device_fingerprint_v1'), 'fl-abc');
      expect(prefs.getString('booking_cookie_decision'), 'all');
      expect(prefs.getString('booking_currency'), 'EUR');
    });
  });
}
