import 'package:booking_flutter/models/admin_models.dart';
import 'package:booking_flutter/providers/auth_provider.dart';
import 'package:booking_flutter/utils/casos_vuelo.dart';
import 'package:booking_flutter/utils/gantt.dart';
import 'package:flutter_test/flutter_test.dart';

AuthUser _u(String email, {String rol = ''}) => AuthUser(nombre: 'A', apellido: 'B', email: email, cedula: '', telefono: '', rolApp: rol);

EventoTraza _e(int seq, String paso, String ts, {String res = 'ok', int? ms, String corr = 'corr-1', String? cliente = 'a@b.com', double? monto, String detalle = ''}) =>
    EventoTraza(seq: seq, ts: ts, correlacion: corr, paso: paso, resultado: res, detalle: detalle, ms: ms, cliente: cliente, monto: monto);

void main() {
  group('esAdmin', () {
    test('correo de la lista, sin importar mayúsculas', () {
      expect(_u('Admin@Booking.com').esAdmin, isTrue);
    });
    test('app_metadata.role admin', () {
      expect(_u('x@y.com', rol: 'admin').esAdmin, isTrue);
    });
    test('usuario normal no es admin', () {
      expect(_u('x@y.com').esAdmin, isFalse);
      expect(_u('x@y.com', rol: 'user').esAdmin, isFalse);
    });
    test('el rol sobrevive a guardar y leer la sesión', () {
      expect(AuthUser.fromJson(_u('x@y.com', rol: 'admin').toJson()).esAdmin, isTrue);
    });
  });

  group('modelos', () {
    test('métricas tolerantes a campos que faltan', () {
      final m = MetricasAdmin.fromJson({'dias': 30, 'kpis': {'ingresos': '120.5', 'reservas': 3}, 'serieDiaria': [{'fecha': '2026-01-01', 'reservas': 1, 'ingresos': 10}], 'porVertical': [{'vertical': 'vuelos', 'reservas': 2}]});
      expect(m.kpis.ingresos, 120.5);
      expect(m.kpisAnterior.reservas, 0);
      expect(m.serie.single.ingresos, 10);
      expect(m.porVertical.single.vertical, 'vuelos');
      expect(m.topDestinos, isEmpty);
    });
    test('variación sin base es nula', () {
      expect(KpisAdmin.variacion(10, 0), isNull);
      expect(KpisAdmin.variacion(150, 100), 50);
    });
    test('informe SLO no disponible', () {
      final i = InformeSlo.fromJson({'disponible': false, 'motivo': 'sin traza'});
      expect(i.disponible, isFalse);
      expect(i.motivo, 'sin traza');
    });
    test('informe SLO con objetivos y latencias', () {
      final i = InformeSlo.fromJson({
        'ventanaDias': 7,
        'slos': [{'id': 'a', 'nombre': 'Compra', 'meta': '99%', 'total': 100, 'malos': 2, 'cumplimiento': 0.98, 'presupuestoConsumidoPct': 200, 'fallosPermitidos': 1, 'burnRate': {'h1': 2, 'h6': null, 'h24': 1.5}, 'estado': 'atencion', 'mensaje': 'm'}],
        'latencias': [{'paso': 'hold', 'nodo': null, 'n': 5, 'p50': 10, 'p95': 20, 'p99': 30, 'max': 40}],
      });
      expect(i.slos.single.burn6h, isNull);
      expect(i.slos.single.burn1h, 2);
      expect(i.latencias.single.p95, 20);
    });
  });

  group('barrasGantt', () {
    test('descarta consultas, duración cero y fechas inválidas; ordena por inicio', () {
      final g = barrasGantt([
        _e(1, 'cobro', '2026-01-01T10:00:03.000Z', ms: 1000),
        _e(2, 'hold', '2026-01-01T10:00:01.000Z', ms: 500),
        _e(3, 'consulta', '2026-01-01T10:00:02.000Z', ms: 50),
        _e(4, 'asiento', '2026-01-01T10:00:02.000Z', ms: 0),
        _e(5, 'factura', 'no-fecha', ms: 10),
      ]);
      expect(g.barras.map((b) => b.paso), ['hold', 'cobro']);
      expect(g.barras.first.desdeMs, 0);
      expect(g.barras.last.desdeMs, 1500); // cobro empezó en 10:00:02.0; hold en 10:00:00.5
      expect(g.totalMs, 2500);
      expect(g.masLarga!.paso, 'cobro');
      expect(g.pctMasLarga, 40);
    });
    test('sin barras', () {
      expect(barrasGantt([]).barras, isEmpty);
    });
  });

  group('armarCasosCompra', () {
    final ahora = DateTime.parse('2026-01-01T12:00:00Z');
    test('compra completada', () {
      final c = armarCasosCompra([_e(1, 'hold', '2026-01-01T11:59:00Z'), _e(2, 'cobro', '2026-01-01T11:59:10Z', monto: 99), _e(3, 'confirmada', '2026-01-01T11:59:20Z')], ahora: ahora);
      expect(c.single.estado, EstadoCaso.completada);
      expect(c.single.monto, 99);
    });
    test('falla de la aerolínea con cobro devuelto', () {
      final c = armarCasosCompra([_e(1, 'hold', '2026-01-01T11:59:00Z'), _e(2, 'cobro', '2026-01-01T11:59:10Z'), _e(3, 'reserva_aerolinea', '2026-01-01T11:59:12Z', res: 'error'), _e(4, 'reembolso', '2026-01-01T11:59:13Z')], ahora: ahora);
      expect(c.single.estado, EstadoCaso.fallo);
      expect(c.single.etiqueta, contains('cobro devuelto'));
    });
    test('reembolso fallido es crítico', () {
      final c = armarCasosCompra([_e(1, 'hold', '2026-01-01T11:59:00Z'), _e(2, 'reembolso', '2026-01-01T11:59:13Z', res: 'error')], ahora: ahora);
      expect(c.single.estado, EstadoCaso.critico);
    });
    test('hold vencido sin cobro es abandonada; reciente está en curso', () {
      final vieja = armarCasosCompra([_e(1, 'hold', '2026-01-01T11:00:00Z')], ahora: ahora);
      expect(vieja.single.estado, EstadoCaso.abandonada);
      final nueva = armarCasosCompra([_e(1, 'hold', '2026-01-01T11:58:00Z')], ahora: ahora);
      expect(nueva.single.estado, EstadoCaso.curso);
    });
    test('pruebas y búsquedas sin hold no cuentan', () {
      final c = armarCasosCompra([
        _e(1, 'hold', '2026-01-01T11:59:00Z', cliente: 'qa@example.com'),
        _e(2, 'hold', '2026-01-01T11:59:00Z', corr: 'corr-e2e-1'),
        _e(3, 'busqueda', '2026-01-01T11:59:00Z', corr: 'corr-9'),
      ], ahora: ahora);
      expect(c, isEmpty);
    });
    test('más reciente primero', () {
      final c = armarCasosCompra([_e(1, 'hold', '2026-01-01T11:50:00Z', corr: 'a'), _e(2, 'hold', '2026-01-01T11:58:00Z', corr: 'b')], ahora: ahora);
      expect(c.map((x) => x.correlacion), ['b', 'a']);
    });
  });
}
