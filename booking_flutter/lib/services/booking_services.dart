import 'dart:convert';
import 'api_client.dart';
import '../models/atraccion.dart';
import '../models/auto.dart';
import '../models/alojamiento.dart';
import '../models/vuelo.dart';
import '../models/reserva.dart';

class BookingServices {
  // --- ATRACCIONES ---
  static Future<List<Atraccion>> getAtracciones() async {
    try {
      final res = await ApiClient.get('/atracciones');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = (data is List) ? data : (data['data'] ?? []);
        return (list as List).map<Atraccion>((json) => Atraccion.fromJson(json as Map<String, dynamic>)).toList();
      }
    } catch (_) {}
    return [];
  }

  static Future<List<TimeSlot>> getDisponibilidadAtraccion(String id, String fecha) async {
    try {
      final res = await ApiClient.get('/atracciones/$id/disponibilidad?date=$fecha');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = (data is List) ? data : (data['time_slots'] ?? data['turnos'] ?? []);
        return (list as List).map<TimeSlot>((json) => TimeSlot.fromJson(json as Map<String, dynamic>)).toList();
      }
    } catch (_) {}
    return [];
  }

  // --- AUTOS ---
  static Future<List<Auto>> getAutos() async {
    try {
      final res = await ApiClient.get('/autos');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = (data is List) ? data : (data['data'] ?? []);
        return (list as List).map<Auto>((json) => Auto.fromJson(json as Map<String, dynamic>)).toList();
      }
    } catch (_) {}
    return [];
  }

  // --- ALOJAMIENTOS ---
  static Future<List<Alojamiento>> getAlojamientos() async {
    try {
      final res = await ApiClient.get('/alojamientos');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = (data is List) ? data : (data['data'] ?? []);
        return (list as List).map<Alojamiento>((json) => Alojamiento.fromJson(json as Map<String, dynamic>)).toList();
      }
    } catch (_) {}
    return [];
  }

  // --- VUELOS ---
  static Future<List<Vuelo>> getVuelos() async {
    try {
      final res = await ApiClient.post(
        '/vuelos/search',
        body: {
          'tipo_itinerario': 'ONE_WAY',
          'tramos': [
            {'origen': 'UIO', 'destino': 'GYE', 'fecha_salida': '2026-12-05'}
          ],
          'pasajeros': {'adultos': 1}
        },
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final offers = data['offers'] ?? data['ofertas'] ?? [];
        if (offers is List && offers.isNotEmpty) {
          return offers.map<Vuelo>((json) => Vuelo.fromJson(json as Map<String, dynamic>)).toList();
        }
      }
    } catch (_) {}

    // Fallback de contingencia en caso de que las 5 aerolíneas externas estén en hold
    return [
      Vuelo(
        id: 'vue-eq-301',
        numeroVuelo: 'EQ-301',
        aerolinea: 'Aerolíneas Galápagos',
        origen: 'Quito (UIO)',
        destino: 'Guayaquil (GYE)',
        fechaSalida: '2026-12-05',
        horaSalida: '08:30',
        horaLlegada: '09:20',
        precio: 89.0,
        estado: 'A TIEMPO',
        puertaEmbarque: 'A4',
      ),
      Vuelo(
        id: 'vue-av-140',
        numeroVuelo: 'AV-140',
        aerolinea: 'Avianca Ecuador',
        origen: 'Quito (UIO)',
        destino: 'Cuenca (CUE)',
        fechaSalida: '2026-12-06',
        horaSalida: '10:15',
        horaLlegada: '11:05',
        precio: 75.0,
        estado: 'PROGRAMADO',
        puertaEmbarque: 'B2',
      ),
      Vuelo(
        id: 'vue-lat-502',
        numeroVuelo: 'LA-1452',
        aerolinea: 'LATAM Ecuador',
        origen: 'Guayaquil (GYE)',
        destino: 'Baltra (GPS)',
        fechaSalida: '2026-12-10',
        horaSalida: '11:00',
        horaLlegada: '12:45',
        precio: 145.0,
        estado: 'EN VUELO',
        puertaEmbarque: 'C1',
      ),
    ];
  }

  // --- RESERVAS & CHECKOUT ---
  static Future<List<Reserva>> getMisReservas({String? token}) async {
    try {
      final res = await ApiClient.get('/reservas', token: token);
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = (data is List) ? data : (data['data'] ?? []);
        return (list as List).map<Reserva>((json) => Reserva.fromJson(json as Map<String, dynamic>)).toList();
      }
    } catch (_) {}
    return [];
  }

  static Future<bool> cancelarReserva(String id, String vertical, {String? token}) async {
    try {
      final path = (vertical == 'autos')
          ? '/autos/orders/$id/cancel'
          : '/atracciones/reservas/$id/cancel';
      final res = await ApiClient.post(path, token: token);
      return res.statusCode == 200 || res.statusCode == 204;
    } catch (_) {
      return false;
    }
  }

  static Future<Map<String, dynamic>?> checkoutSaga(Map<String, dynamic> payload, {String? token}) async {
    try {
      final res = await ApiClient.post('/checkout', body: payload, token: token);
      if (res.statusCode == 200 || res.statusCode == 201) {
        return jsonDecode(res.body) as Map<String, dynamic>;
      }
    } catch (_) {}
    return null;
  }
}
