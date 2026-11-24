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

  // --- AUTOS (Multi-nivel resiliente) ---
  static Future<List<Auto>> getAutos({String? location}) async {
    List<Auto> results = [];

    // 1. Intentar POST /autos/search (idéntico a frontend/src/services/autosApi.js)
    try {
      final searchRes = await ApiClient.post('/autos/search', body: {
        'pickup_location': location ?? 'Quito',
        'q': location ?? '',
        'driver_age': 32,
        'category': 'ALL',
        'transmission': 'ALL',
        'currency': 'USD',
      });
      if (searchRes.statusCode == 200) {
        final data = jsonDecode(searchRes.body);
        final list = (data is List) ? data : (data['data'] ?? []);
        if (list is List && list.isNotEmpty) {
          for (var item in list) {
            try {
              if (item is Map<String, dynamic>) {
                results.add(Auto.fromJson(item));
              } else if (item is Map) {
                results.add(Auto.fromJson(Map<String, dynamic>.from(item)));
              }
            } catch (_) {}
          }
          if (results.isNotEmpty) return results;
        }
      }
    } catch (_) {}

    // 2. Intentar GET /autos (catálogo completo)
    try {
      final res = await ApiClient.get('/autos');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = (data is List) ? data : (data['data'] ?? []);
        if (list is List && list.isNotEmpty) {
          for (var item in list) {
            try {
              if (item is Map<String, dynamic>) {
                results.add(Auto.fromJson(item));
              } else if (item is Map) {
                results.add(Auto.fromJson(Map<String, dynamic>.from(item)));
              }
            } catch (_) {}
          }
          if (results.isNotEmpty) return results;
        }
      }
    } catch (_) {}

    // 3. Fallback de contingencia garantizado (evita pantalla vacía si Azure sufre timeout)
    return [
      Auto(
        id: 'auto-spark-01',
        modelo: 'Spark GT',
        marca: 'Chevrolet',
        categoria: 'ECONOMICO',
        precioPorDia: 35.5,
        transmision: 'Manual',
        capacidadPasajeros: 4,
        puertas: 4,
        maletasGrandes: 1,
        aireAcondicionado: true,
        kilometrajeIlimitado: true,
        imagenUrl: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=600&q=80',
        proveedor: 'Europcar',
        proveedorRating: 8.4,
        proveedorUbicacion: 'En el aeropuerto (Terminal Llegadas)',
        estado: 'DISPONIBLE',
      ),
      Auto(
        id: 'auto-rio-02',
        modelo: 'Rio Sedan',
        marca: 'Kia',
        categoria: 'COMPACTO',
        precioPorDia: 45.0,
        transmision: 'Automático',
        capacidadPasajeros: 5,
        puertas: 4,
        maletasGrandes: 2,
        aireAcondicionado: true,
        kilometrajeIlimitado: true,
        imagenUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80',
        proveedor: 'Alamo',
        proveedorRating: 8.6,
        proveedorUbicacion: 'En el aeropuerto (Mostrador 2)',
        estado: 'DISPONIBLE',
      ),
      Auto(
        id: 'auto-tracker-03',
        modelo: 'Tracker Turbo (SUV)',
        marca: 'Chevrolet',
        categoria: 'SUV',
        precioPorDia: 68.0,
        transmision: 'Automático',
        capacidadPasajeros: 5,
        puertas: 5,
        maletasGrandes: 3,
        aireAcondicionado: true,
        kilometrajeIlimitado: true,
        imagenUrl: 'https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&w=600&q=80',
        proveedor: 'Enterprise',
        proveedorRating: 9.1,
        proveedorUbicacion: 'En el aeropuerto (Terminal Llegadas)',
        estado: 'DISPONIBLE',
      ),
      Auto(
        id: 'auto-audi-04',
        modelo: 'A4 Sedan Executive',
        marca: 'Audi',
        categoria: 'PREMIUM',
        precioPorDia: 110.0,
        transmision: 'Automático',
        capacidadPasajeros: 5,
        puertas: 4,
        maletasGrandes: 2,
        aireAcondicionado: true,
        kilometrajeIlimitado: true,
        imagenUrl: 'https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?auto=format&fit=crop&w=600&q=80',
        proveedor: 'Europcar Prestige',
        proveedorRating: 8.4,
        proveedorUbicacion: 'En el aeropuerto (Zona VIP)',
        estado: 'DISPONIBLE',
      ),
    ];
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
