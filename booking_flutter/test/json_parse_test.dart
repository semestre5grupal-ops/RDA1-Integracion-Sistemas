import 'package:booking_flutter/models/alojamiento.dart';
import 'package:booking_flutter/models/atraccion.dart';
import 'package:booking_flutter/models/auto.dart';
import 'package:booking_flutter/models/reserva.dart';
import 'package:booking_flutter/utils/json_parse.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('parseDouble tolera formatos heterogéneos de los socios', () {
    test('números y strings', () {
      expect(parseDouble(45), 45.0);
      expect(parseDouble('45.50'), 45.5);
      expect(parseDouble('\$1,250.50'), 1250.5);
      expect(parseDouble('1.250,50'), 1250.5);
      expect(parseDouble('45,50'), 45.5);
      expect(parseDouble('USD 99'), 99.0);
    });
    test('objetos de precio', () {
      expect(parseDouble({'total': 50}), 50.0);
      expect(parseDouble({'amount': '50.00', 'currency': 'USD'}), 50.0);
      expect(parseDouble({'total': {'amount': '12.5'}}), 12.5);
    });
    test('valores irreconocibles devuelven el fallback sin lanzar', () {
      expect(parseDouble(null, 7), 7.0);
      expect(parseDouble('abc', 7), 7.0);
      expect(parseDouble(true, 7), 7.0);
      expect(parseDouble({'foo': 'bar'}, 7), 7.0);
      expect(parseInt('3.6'), 4);
    });
  });

  group('parseBool', () {
    test('acepta bool, número y texto', () {
      expect(parseBool('true'), isTrue);
      expect(parseBool(1), isTrue);
      expect(parseBool('sí'), isTrue);
      expect(parseBool('false', true), isFalse);
      expect(parseBool(null, true), isTrue);
      expect(parseBool('quizás', true), isTrue);
    });
  });

  group('extractList', () {
    test('lista directa, {data}, {items} y {data:{items}}', () {
      expect(extractList([{'a': 1}]).length, 1);
      expect(extractList({'data': [{'a': 1}, {'b': 2}]}).length, 2);
      expect(extractList({'items': [{'a': 1}]}).length, 1);
      expect(extractList({'data': {'items': [{'a': 1}]}}).length, 1);
      expect(extractList({'turnos': [{'a': 1}]}, ['turnos']).length, 1);
      expect(extractList('basura'), isEmpty);
    });
  });

  group('Modelos aceptan identificadores alternativos', () {
    test('Auto con vehiculo_id / auto_id y booleanos como string', () {
      final a = Auto.fromJson({
        'vehiculo_id': 'veh-9',
        'marca': 'Kia',
        'modelo': 'Rio',
        'precio_diario': {'amount': '42.00'},
        'aire_acondicionado': 'true',
        'kilometraje_ilimitado': 0,
      });
      expect(a.id, 'veh-9');
      expect(a.precioPorDia, 42.0);
      expect(a.aireAcondicionado, isTrue);
      expect(a.kilometrajeIlimitado, isFalse);
      expect(Auto.fromJson({'auto_id': 7}).id, '7');
    });

    test('Alojamiento con _id / idAlojamiento y precio objeto', () {
      final h = Alojamiento.fromJson({
        '_id': 'mongo-1',
        'nombre': 'Hostal Andino',
        'precio_por_noche': {'total': 80},
        'amenidades': [
          {'nombre': 'Piscina'},
          'WiFi',
        ],
        'cancelacionGratis': 'false',
      });
      expect(h.id, 'mongo-1');
      expect(h.precioPorNoche, 80.0);
      expect(h.tienePiscina, isTrue);
      expect(h.amenidades, containsAll(['Piscina', 'WiFi']));
      expect(h.cancelacionGratis, isFalse);
      expect(Alojamiento.fromJson({'idAlojamiento': 'x'}).id, 'x');
    });

    test('Atraccion con atraccion_id y precio como objeto', () {
      final at = Atraccion.fromJson({
        'atraccion_id': 'atr-3',
        'name': 'Teleférico',
        'price': {'total': 45, 'child': 20},
        'free_cancellation': 'false',
        'inclusiones': [
          {'nombre': 'Guía oficial'},
        ],
      });
      expect(at.id, 'atr-3');
      expect(at.precioAdulto, 45.0);
      expect(at.freeCancellation, isFalse);
      expect(at.includes, ['Guía oficial']);
    });

    test('TimeSlot y Reserva', () {
      final s = TimeSlot.fromJson({'time': '10:00', 'cupos': '0'});
      expect(s.estaAgotado, isTrue);
      final r = Reserva.fromJson({'order_id': 'ORD-1', 'total': {'amount': '99.90'}}, forcedVertical: 'autos');
      expect(r.id, 'ORD-1');
      expect(r.total, closeTo(99.9, 0.001));
    });
  });
}
