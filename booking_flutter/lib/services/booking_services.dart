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
        return list.map<Atraccion>((json) => Atraccion.fromJson(json)).toList();
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
        return list.map<TimeSlot>((json) => TimeSlot.fromJson(json)).toList();
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
        return list.map<Auto>((json) => Auto.fromJson(json)).toList();
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
        return list.map<Alojamiento>((json) => Alojamiento.fromJson(json)).toList();
      }
    } catch (_) {}
    return [];
  }

  // --- VUELOS ---
  static Future<List<Vuelo>> getVuelos() async {
    try {
      final res = await ApiClient.get('/vuelos');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = (data is List) ? data : (data['data'] ?? []);
        return list.map<Vuelo>((json) => Vuelo.fromJson(json)).toList();
      }
    } catch (_) {}
    return [];
  }

  // --- RESERVAS & CHECKOUT ---
  static Future<List<Reserva>> getMisReservas({String? token}) async {
    try {
      final res = await ApiClient.get('/reservas', token: token);
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = (data is List) ? data : (data['data'] ?? []);
        return list.map<Reserva>((json) => Reserva.fromJson(json)).toList();
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
      final res = await ApiClient.post('/esb/checkout-saga', body: payload, token: token);
      if (res.statusCode == 200 || res.statusCode == 201) {
        return jsonDecode(res.body);
      }
    } catch (_) {}
    return null;
  }
}

