import 'package:booking_flutter/models/vuelo.dart';
import 'package:booking_flutter/services/api_client.dart';
import 'package:booking_flutter/utils/clave_compra.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

void main() {
  pruebasClavePorContenido();
  group('ClaveCompra: un reintento no puede crear otra compra', () {
    test('misma retención de precio => misma Idempotency-Key y mismo código de correlación', () {
      final c = ClaveCompra();
      final k1 = c.idempotencia('hold-1');
      final corr1 = c.correlacion('hold-1');
      // Reintento tras un corte de red o un tiempo de espera agotado.
      expect(c.idempotencia('hold-1'), k1);
      expect(c.correlacion('hold-1'), corr1);
      expect(corr1, startsWith('corr-'));
    });

    test('otra retención de precio => otra compra, otra clave', () {
      final c = ClaveCompra();
      final k1 = c.idempotencia('hold-1');
      final k2 = c.idempotencia('hold-2');
      expect(k2, isNot(k1));
      expect(c.idempotencia('hold-2'), k2);
    });

    test('reiniciar tras confirmar la compra genera claves nuevas', () {
      final c = ClaveCompra();
      final k1 = c.idempotencia('hold-1');
      c.reiniciar();
      expect(c.idempotencia('hold-1'), isNot(k1));
    });

    test('la clave es un UUID válido (formato que acepta el contrato)', () {
      final k = ClaveCompra().idempotencia('h');
      expect(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$').hasMatch(k), isTrue);
    });
  });

  group('ApiException muestra el código de soporte', () {
    http.Response resp(int status, String body, {String? corr}) {
      final req = http.Request('POST', Uri.parse('https://api.test/vuelos/bookings'));
      if (corr != null) req.headers['X-Correlation-Id'] = corr;
      return http.Response(body, status, request: req);
    }

    test('toma el código de la petición enviada', () {
      final e = ApiClient.parseError(resp(502, '{"title":"Bad gateway","detail":"La aerolínea no respondió"}', corr: 'corr-ab12cd34'));
      expect(e.correlationId, 'corr-ab12cd34');
      expect(e.userMessage, 'La aerolínea no respondió');
      expect(e.userMessageConCodigo, 'La aerolínea no respondió\nCódigo de soporte: corr-ab12cd34');
    });

    test('también cuando el cuerpo no es JSON', () {
      final e = ApiClient.parseError(resp(503, 'Service Unavailable', corr: 'corr-zz'));
      expect(e.statusCode, 503);
      expect(e.userMessageConCodigo, contains('corr-zz'));
    });

    test('sin código, el mensaje queda igual que antes', () {
      final e = ApiClient.parseError(http.Response('{"detail":"Falla"}', 500));
      expect(e.correlationId, isNull);
      expect(e.userMessageConCodigo, 'Falla');
    });
  });

  group('precio con recargo de Booking: siempre centavos exactos', () {
    test('casos conocidos', () {
      expect(conRecargoBooking(100, 12), 112.0);
      expect(conRecargoBooking(19.99, 12), 22.39);
      expect(conRecargoBooking(0.1 + 0.2, 0), 0.30000000000000004); // sin recargo no se toca
    });

    test('con recargo el resultado nunca arrastra restos de coma flotante', () {
      for (var cents = 1; cents <= 200000; cents += 137) {
        final base = cents / 100;
        for (final pct in [3.0, 5.0, 7.5, 12.0, 15.0]) {
          final r = conRecargoBooking(base, pct);
          final enCentavos = (r * 100).roundToDouble();
          expect((r * 100 - enCentavos).abs() < 1e-6, isTrue, reason: 'base=$base pct=$pct => $r');
        }
      }
    });
  });
}

void pruebasClavePorContenido() {
  group('ClavePorContenido (autos y atracciones)', () {
    test('mismo contenido => misma clave, aunque cambie el orden de los campos', () {
      final c = ClavePorContenido();
      final k = c.para({'dias': 3, 'cobertura': 'TOTAL', 'cliente': {'email': 'a@b.ec', 'nombre': 'Ana'}});
      expect(c.para({'cliente': {'nombre': 'Ana', 'email': 'a@b.ec'}, 'cobertura': 'TOTAL', 'dias': 3}), k);
    });

    test('si el usuario cambia algo, es otra reserva con otra clave', () {
      final c = ClavePorContenido();
      final k = c.para({'personas': 2});
      expect(c.para({'personas': 3}), isNot(k));
    });

    test('reiniciar tras confirmar da una clave nueva', () {
      final c = ClavePorContenido();
      final k = c.para({'personas': 2});
      c.reiniciar();
      expect(c.para({'personas': 2}), isNot(k));
    });
  });
}
