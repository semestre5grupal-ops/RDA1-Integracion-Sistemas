import 'package:booking_flutter/utils/pase_abordar.dart';
import 'package:booking_flutter/utils/puerta_embarque.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  // Respuesta con los nombres del contrato v2 (BoardingPass).
  final paseV2 = {
    'passengerId': 'PAX-1',
    'segmentId': 'SEG-AV1632-20261120',
    'seat': '14C',
    'boardingGroup': 'B',
    'boardingPosition': '23',
    'gate': 'A4',
    'barcode': 'M1ANDRADE/MARIA EXK7P2Q',
    'barcodeType': 'PDF417',
  };

  group('pase de abordar según el contrato v2', () {
    test('lee seat, barcode, grupo, posición y tipo', () {
      expect(asientoDe(paseV2), '14C');
      expect(codigoBarrasDe(paseV2), 'M1ANDRADE/MARIA EXK7P2Q');
      expect(grupoEmbarqueDe(paseV2), 'B');
      expect(posicionEmbarqueDe(paseV2), '23');
      expect(tipoCodigoDe(paseV2), 'PDF417');
    });

    test('acepta los nombres antiguos que usaba la app', () {
      final viejo = {'seatNumber': '3A', 'barcodeData': 'ABC123'};
      expect(asientoDe(viejo), '3A');
      expect(codigoBarrasDe(viejo), 'ABC123');
      expect(codigoBarrasDe({'boardingPassCode': 'XYZ'}), 'XYZ');
    });

    test('vacío o ausente devuelve null', () {
      expect(asientoDe(null), isNull);
      expect(asientoDe({'seat': '  '}), isNull);
      expect(codigoBarrasDe({}), isNull);
    });

    test('número de boleto: eTicketNumber del contrato, o el nombre antiguo', () {
      expect(numeroBoletoDe({'eTicketNumber': '1342400012345'}), '1342400012345');
      expect(numeroBoletoDe({'ticketNumber': 'T-9'}), 'T-9');
      expect(numeroBoletoDe({}), '--');
    });
  });

  group('puerta de embarque', () {
    test('con puerta asignada se muestra', () => expect(puertaDe(paseV2), 'A4'));
    test('sin puerta (null, vacía o ausente) no cambia nada', () {
      expect(puertaDe({'gate': null}), isNull);
      expect(puertaDe({'gate': ''}), isNull);
      expect(puertaDe({'seat': '14C'}), isNull);
      expect(puertaDe(null), isNull);
    });
  });

  group('emparejar boleto y pase', () {
    final pases = [
      {'passengerId': 'PAX-1', 'segmentId': 'S1', 'seat': '14C'},
      {'passengerId': 'PAX-2', 'segmentId': 'S1', 'seat': '14D'},
    ];

    test('cada pasajero recibe SU pase (antes todos mostraban el primero)', () {
      expect(asientoDe(paseDelBoleto(pases, {'passengerId': 'PAX-2'})), '14D');
      expect(asientoDe(paseDelBoleto(pases, {'passengerId': 'PAX-1'})), '14C');
    });

    test('con varios tramos del mismo pasajero prefiere el primer tramo del boleto', () {
      final idaVuelta = [
        {'passengerId': 'PAX-1', 'segmentId': 'S2', 'seat': '20A'},
        {'passengerId': 'PAX-1', 'segmentId': 'S1', 'seat': '14C'},
      ];
      final boleto = {
        'passengerId': 'PAX-1',
        'segments': [
          {'segmentId': 'S1'}
        ]
      };
      expect(asientoDe(paseDelBoleto(idaVuelta, boleto)), '14C');
    });

    test('sin forma de emparejar y varios pases: no se inventa uno', () {
      expect(paseDelBoleto(pases, {'ticketId': 'otro'}), isNull);
    });

    test('sin forma de emparejar pero con un solo pase: se usa ese', () {
      expect(asientoDe(paseDelBoleto([pases.first], {'ticketId': 'x'})), '14C');
    });

    test('respuestas antiguas: por ticketId o por nombre', () {
      final viejos = [
        {'ticketId': 'T1', 'seatNumber': '1A'},
        {'passengerName': 'Ana Torres', 'seatNumber': '1B'},
      ];
      expect(asientoDe(paseDelBoleto(viejos, {'ticketId': 'T1'})), '1A');
      expect(asientoDe(paseDelBoleto(viejos, {'passengerName': 'Ana Torres'})), '1B');
    });

    test('lista vacía devuelve null', () => expect(paseDelBoleto([], {'passengerId': 'PAX-1'}), isNull));
  });
}
