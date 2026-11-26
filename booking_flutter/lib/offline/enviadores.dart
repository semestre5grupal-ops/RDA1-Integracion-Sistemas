import '../services/booking_services.dart';
import 'cola_reservas.dart';

/// Cómo se envía cada tipo de reserva guardada. Usan EXACTAMENTE las mismas
/// llamadas y la misma `Idempotency-Key` que la compra normal.
Map<String, EnviarReserva> enviadoresPorDefecto() => {
      'auto': (r, token) async {
        await BookingServices.reservarAuto(r.payload, r.idempotencyKey, token: token);
      },
      'atraccion': (r, token) async {
        await BookingServices.reservarAtraccion(
          r.payload['atraccionId'].toString(),
          Map<String, dynamic>.from(r.payload['data'] as Map),
          r.idempotencyKey,
          token: token,
        );
      },
      'alojamiento': (r, token) async {
        await BookingServices.reservarAlojamiento(
          r.payload['alojamientoId'].toString(),
          Map<String, dynamic>.from(r.payload['data'] as Map),
          r.idempotencyKey,
          token: token,
        );
      },
      'vuelo': (r, token) async {
        await BookingServices.crearReservaVuelo(r.payload, r.idempotencyKey, token: token);
      },
    };
