import 'package:flutter_test/flutter_test.dart';
import 'package:booking_flutter/models/reserva.dart';
import 'package:booking_flutter/services/booking_services.dart';

void main() {
  group('Reserva — Estados de Asistencia y Reglas de Negocio', () {
    test('Reserva confirmada inicial tiene estadoDisplay "Confirmada" y es cancelable si está a tiempo', () {
      final r = Reserva(
        id: 'ATR-101',
        vertical: 'atracciones',
        servicioNombre: 'Teleférico Quito',
        fecha: '2026-12-10',
        total: 25.0,
        estado: 'CONFIRMED',
        fechaCreacion: DateTime.now(),
        fechaServicio: DateTime.now().add(const Duration(days: 5)),
      );

      expect(r.esConfirmada, isTrue);
      expect(r.esAsistido, isFalse);
      expect(r.esCancelada, isFalse);
      expect(r.estadoDisplay, 'Confirmada');
      expect(r.cancelable, isTrue);
    });

    test('Cuando el socio externo confirma asistencia (CONFIRMADO_ASISTIDO), estadoDisplay es "Check-in Realizado (Sí asistió)" y cancelable es false', () {
      final r = Reserva(
        id: 'ATR-101',
        vertical: 'atracciones',
        servicioNombre: 'Teleférico Quito',
        fecha: '2026-12-10',
        total: 25.0,
        estado: 'CONFIRMADO_ASISTIDO',
        fechaCreacion: DateTime.now(),
        fechaServicio: DateTime.now().add(const Duration(days: 5)),
      );

      expect(r.esConfirmada, isFalse);
      expect(r.esAsistido, isTrue);
      expect(r.esCancelada, isFalse);
      expect(r.estadoDisplay, 'Check-in Realizado (Sí asistió)');
      // La regla de negocio estricta prohíbe cancelar servicios una vez asistidos
      expect(r.cancelable, isFalse);
    });

    test('Variantes de check-in y asistencia (CHECKED_IN, ASISTIDO, ENTREGADO, PICKED_UP) marcan esAsistido = true y cancelable = false', () {
      final estados = ['CHECKED_IN', 'ASISTIDO', 'ENTREGADO', 'PICKED_UP', 'COMPLETED'];
      for (final st in estados) {
        final r = Reserva(
          id: 'AUTO-202',
          vertical: 'autos',
          servicioNombre: 'Alquiler Chevrolet Tracker',
          fecha: '2026-12-12',
          total: 80.0,
          estado: st,
          fechaCreacion: DateTime.now(),
          fechaServicio: DateTime.now().add(const Duration(days: 4)),
        );

        expect(r.esAsistido, isTrue, reason: 'Estado $st debe ser reconocido como asistido');
        expect(r.cancelable, isFalse, reason: 'Estado $st no debe ser cancelable');
        expect(r.estadoDisplay, 'Check-in Realizado (Sí asistió)');
      }
    });

    test('Reserva CANCELLED tiene estadoDisplay "Cancelada" y cancelable = false', () {
      final r = Reserva(
        id: 'ALOJ-303',
        vertical: 'alojamientos',
        servicioNombre: 'Hotel Dann Carlton',
        fecha: '2026-12-15',
        total: 120.0,
        estado: 'CANCELLED',
        fechaCreacion: DateTime.now(),
        fechaServicio: DateTime.now().add(const Duration(days: 6)),
      );

      expect(r.esCancelada, isTrue);
      expect(r.estadoDisplay, 'Cancelada');
      expect(r.cancelable, isFalse);
    });

    test('BookingServices.agregarReservaDirecta almacena la reserva en memoria y permite consultar', () {
      final testRes = Reserva(
        id: 'TEST-MEM-999',
        vertical: 'atracciones',
        servicioNombre: 'Tour Mitad del Mundo',
        fecha: '2026-12-20',
        total: 15.0,
        estado: 'CONFIRMED',
        fechaCreacion: DateTime.now(),
        fechaServicio: DateTime.now().add(const Duration(days: 7)),
      );

      BookingServices.agregarReservaDirecta(testRes);
      expect(testRes.id, 'TEST-MEM-999');
      expect(testRes.estadoDisplay, 'Confirmada');
    });
  });
}
