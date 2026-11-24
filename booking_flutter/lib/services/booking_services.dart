import 'dart:convert';
import '../config/api_config.dart';
import 'api_client.dart';
import '../models/atraccion.dart';
import '../models/auto.dart';
import '../models/alojamiento.dart';
import '../models/vuelo.dart';
import '../models/reserva.dart';

class BookingServices {
  // =========================================================================
  // 1. ALOJAMIENTOS
  // =========================================================================

  static Future<List<Alojamiento>> getAlojamientos({
    int page = 1,
    int limit = 25,
    String? destino,
  }) async {
    try {
      final params = <String, String>{
        'page': page.toString(),
        'limit': limit.toString(),
      };
      if (destino != null && destino.trim().isNotEmpty) {
        params['destino'] = destino.trim();
      }
      final res = await ApiClient.get('/alojamientos', queryParams: params);
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = (data is List) ? data : (data['data'] ?? []);
        return (list as List)
            .whereType<Map>()
            .map((json) => Alojamiento.fromJson(Map<String, dynamic>.from(json)))
            .toList();
      }
    } catch (_) {}
    return [];
  }

  static Future<List<Alojamiento>> searchAlojamientos({
    required String destino,
    required String checkin,
    required String checkout,
    int adultos = 2,
    int ninos = 0,
    int habitaciones = 1,
    int rows = 25,
  }) async {
    try {
      final res = await ApiClient.post(
        '/alojamientos/search',
        body: {
          'destino': destino,
          'adultos': adultos,
          'ninos': ninos,
          'habitaciones': habitaciones,
          'dates': {'checkin': checkin, 'checkout': checkout},
          'rows': rows,
        },
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = jsonDecode(res.body);
        final list = (data is List) ? data : (data['data'] ?? []);
        if (list is List) {
          return list
              .whereType<Map>()
              .map((json) => Alojamiento.fromJson(Map<String, dynamic>.from(json)))
              .toList();
        }
      }
    } catch (_) {}
    return getAlojamientos(limit: rows, destino: destino);
  }

  static Future<Alojamiento?> getAlojamientoDetalle(String id) async {
    try {
      final res = await ApiClient.get('/alojamientos/${Uri.encodeComponent(id)}');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data is Map) {
          return Alojamiento.fromJson(Map<String, dynamic>.from(data));
        }
      }
    } catch (_) {}
    return null;
  }

  /// Consulta disponibilidad y tarifas REALES de un alojamiento para fechas + ocupación (`POST /alojamientos/availability`).
  /// Lanza [ApiException] si el backend rechaza fechas o capacidades (HTTP 400/409).
  static Future<AlojamientoAvailabilityResult> consultarDisponibilidadAlojamiento({
    required String id,
    required String checkin,
    required String checkout,
    required int adultos,
    List<int> edadesNinos = const [],
    required int habitaciones,
  }) async {
    final guests = <String, dynamic>{
      'number_of_adults': adultos,
      'number_of_rooms': habitaciones,
    };
    if (edadesNinos.isNotEmpty) {
      guests['children'] = edadesNinos;
    }

    final res = await ApiClient.post(
      '/alojamientos/availability',
      body: {
        'accommodation': id,
        'checkin': checkin,
        'checkout': checkout,
        'guests': guests,
      },
    );

    if (res.statusCode == 200 || res.statusCode == 201) {
      final data = jsonDecode(res.body);
      if (data is Map) {
        return AlojamientoAvailabilityResult.fromJson(Map<String, dynamic>.from(data));
      }
    }
    throw ApiClient.parseError(res);
  }

  static Future<Map<String, dynamic>> reservarAlojamiento(
    String id,
    Map<String, dynamic> payload,
    String idempotencyKey, {
    String? token,
  }) async {
    final res = await ApiClient.post(
      '/alojamientos/${Uri.encodeComponent(id)}/reservations',
      body: payload,
      token: token,
      idempotencyKey: idempotencyKey,
      timeout: ApiConfig.sagaTimeout,
    );
    if (res.statusCode == 200 || res.statusCode == 201) {
      final decoded = jsonDecode(res.body);
      return decoded is Map<String, dynamic> ? decoded : {'data': decoded};
    }
    throw ApiClient.parseError(res);
  }

  // =========================================================================
  // 2. ATRACCIONES
  // =========================================================================

  static Future<List<Atraccion>> getAtracciones({int page = 1, int limit = 100}) async {
    try {
      final res = await ApiClient.get(
        '/atracciones',
        queryParams: {'page': page.toString(), 'limit': limit.toString()},
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = (data is List) ? data : (data['data'] ?? []);
        return (list as List)
            .whereType<Map>()
            .map((json) => Atraccion.fromJson(Map<String, dynamic>.from(json)))
            .toList();
      }
    } catch (_) {}
    return [];
  }

  static Future<Atraccion?> getAtraccionDetalle(String id) async {
    try {
      final res = await ApiClient.get('/atracciones/${Uri.encodeComponent(id)}');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data is Map) {
          return Atraccion.fromJson(Map<String, dynamic>.from(data));
        }
      }
    } catch (_) {}
    return null;
  }

  static Future<List<TimeSlot>> getDisponibilidadAtraccion(String id, String fecha) async {
    try {
      final res = await ApiClient.get(
        '/atracciones/${Uri.encodeComponent(id)}/disponibilidad',
        queryParams: {'date': fecha},
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = (data is List)
            ? data
            : (data['turnos'] ?? data['time_slots'] ?? data['slots'] ?? []);
        if (list is List && list.isNotEmpty) {
          return list
              .whereType<Map>()
              .map((json) => TimeSlot.fromJson(Map<String, dynamic>.from(json)))
              .toList();
        }
      }
    } catch (_) {}
    return [
      TimeSlot(slotId: 'slot-$fecha-0900', horaInicio: '09:00 a.m.', cuposDisponibles: 6, estado: 'DISPONIBLE'),
      TimeSlot(slotId: 'slot-$fecha-1100', horaInicio: '11:00 a.m.', cuposDisponibles: 0, estado: 'AGOTADO'),
      TimeSlot(slotId: 'slot-$fecha-1300', horaInicio: '01:00 p.m.', cuposDisponibles: 12, estado: 'DISPONIBLE'),
      TimeSlot(slotId: 'slot-$fecha-1530', horaInicio: '03:30 p.m.', cuposDisponibles: 2, estado: 'ULTIMOS_CUPOS'),
    ];
  }

  static Future<Map<String, dynamic>> reservarAtraccion(
    String id,
    Map<String, dynamic> payload,
    String idempotencyKey, {
    String? token,
  }) async {
    final res = await ApiClient.post(
      '/atracciones/${Uri.encodeComponent(id)}/reservations',
      body: payload,
      token: token,
      idempotencyKey: idempotencyKey,
      timeout: ApiConfig.sagaTimeout,
    );
    if (res.statusCode == 200 || res.statusCode == 201) {
      final decoded = jsonDecode(res.body);
      return decoded is Map<String, dynamic> ? decoded : {'data': decoded};
    }
    throw ApiClient.parseError(res);
  }

  // =========================================================================
  // 3. AUTOS (RDA2 + Cooldown 2h + Recargo <25 años)
  // =========================================================================

  static Future<AutosSearchResponse> searchAutos({
    String? pickupLocation,
    String? pickupDate,
    String? pickupTime,
    String? dropoffDate,
    String? dropoffTime,
    int driverAge = 30,
    String category = 'ALL',
    String transmission = 'ALL',
  }) async {
    final results = <Auto>[];
    AutosSearchMetadata meta = AutosSearchMetadata();

    try {
      final searchBody = <String, dynamic>{
        'pickup_location': (pickupLocation != null && pickupLocation.trim().isNotEmpty) ? pickupLocation.trim() : 'Quito',
        'q': pickupLocation?.trim() ?? '',
        'driver_age': driverAge,
        'category': category,
        'transmission': transmission,
        'currency': 'USD',
      };
      if (pickupDate != null) searchBody['pickup_date'] = pickupDate;
      if (pickupTime != null) searchBody['pickup_time'] = pickupTime;
      if (dropoffDate != null) searchBody['dropoff_date'] = dropoffDate;
      if (dropoffTime != null) searchBody['dropoff_time'] = dropoffTime;

      final searchRes = await ApiClient.post('/autos/search', body: searchBody);
      if (searchRes.statusCode == 200 || searchRes.statusCode == 201) {
        final data = jsonDecode(searchRes.body);
        if (data is Map && data['metadata'] is Map) {
          meta = AutosSearchMetadata.fromJson(Map<String, dynamic>.from(data['metadata']));
        }
        final list = (data is List) ? data : (data['data'] ?? []);
        if (list is List && list.isNotEmpty) {
          for (final item in list) {
            if (item is Map) {
              try {
                results.add(Auto.fromJson(Map<String, dynamic>.from(item)));
              } catch (_) {}
            }
          }
          if (results.isNotEmpty) {
            return AutosSearchResponse(autos: results, metadata: meta);
          }
        }
      }
    } catch (_) {}

    try {
      final res = await ApiClient.get('/autos');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = (data is List) ? data : (data['data'] ?? []);
        if (list is List && list.isNotEmpty) {
          for (final item in list) {
            if (item is Map) {
              try {
                results.add(Auto.fromJson(Map<String, dynamic>.from(item)));
              } catch (_) {}
            }
          }
          if (results.isNotEmpty) {
            return AutosSearchResponse(autos: results, metadata: meta);
          }
        }
      }
    } catch (_) {}

    return AutosSearchResponse(
      metadata: meta,
      autos: [
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
          maletasPequenas: 1,
          imagenUrl: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=600&q=80',
          proveedor: 'Europcar',
          proveedorRating: 8.4,
          proveedorUbicacion: 'En el aeropuerto (Terminal Llegadas)',
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
          maletasPequenas: 2,
          imagenUrl: 'https://images.unsplash.com/photo-1550355291-bbee04a92027?auto=format&fit=crop&w=600&q=80',
          proveedor: 'Enterprise',
          proveedorRating: 9.1,
          proveedorUbicacion: 'En el aeropuerto (Terminal Llegadas)',
        ),
      ],
    );
  }

  static Future<List<Auto>> getAutos({String? location}) async {
    final res = await searchAutos(pickupLocation: location);
    return res.autos;
  }

  static Future<Auto?> getAutoDetalle(String id) async {
    try {
      final res = await ApiClient.get('/autos/${Uri.encodeComponent(id)}');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data is Map) {
          return Auto.fromJson(Map<String, dynamic>.from(data));
        }
      }
    } catch (_) {}
    return null;
  }

  static Future<Map<String, dynamic>> reservarAuto(
    Map<String, dynamic> payload,
    String idempotencyKey, {
    String? token,
  }) async {
    final res = await ApiClient.post(
      '/autos/orders/create',
      body: payload,
      token: token,
      idempotencyKey: idempotencyKey,
      timeout: ApiConfig.sagaTimeout,
    );
    if (res.statusCode == 200 || res.statusCode == 201) {
      final decoded = jsonDecode(res.body);
      return decoded is Map<String, dynamic> ? decoded : {'data': decoded};
    }
    throw ApiClient.parseError(res);
  }

  // =========================================================================
  // 4. VUELOS (Contrato v1.5.0.0 — 5 aerolíneas socias + Hold + Seatmap)
  // =========================================================================

  static Future<VueloSearchResult> searchVuelos({
    required List<Map<String, String>> itineraries,
    required Map<String, int> passengers,
  }) async {
    final res = await ApiClient.post(
      '/vuelos/search',
      includeFingerprint: true,
      body: {
        'itineraries': itineraries,
        'passengers': passengers,
      },
    );

    if (res.statusCode == 200 || res.statusCode == 201) {
      final data = jsonDecode(res.body);
      if (data is Map<String, dynamic>) {
        final feeMap = data['bookingFee'] is Map ? Map<String, dynamic>.from(data['bookingFee']) : <String, dynamic>{};
        final pct = double.tryParse(feeMap['percentage']?.toString() ?? '0') ?? 0.0;

        final rawOffers = data['offers'];
        final offers = rawOffers is List
            ? rawOffers
                .whereType<Map>()
                .map((o) => Vuelo.fromJson(Map<String, dynamic>.from(o), recargoPct: pct))
                .toList()
            : <Vuelo>[];

        final rawSources = data['sources'];
        final sources = rawSources is List
            ? rawSources
                .whereType<Map>()
                .map((s) => VueloSource.fromJson(Map<String, dynamic>.from(s)))
                .toList()
            : <VueloSource>[];

        return VueloSearchResult(
          totalOffers: (data['totalOffers'] as num?)?.toInt() ?? offers.length,
          offers: offers,
          sources: sources,
          bookingFeePct: pct,
        );
      }
    }
    throw ApiClient.parseError(res);
  }

  static Future<List<Vuelo>> getVuelos() async {
    try {
      final dep = DateTime.now().add(const Duration(days: 5)).toIso8601String().split('T').first;
      final res = await searchVuelos(
        itineraries: [
          {'origin': 'UIO', 'destination': 'GYE', 'departureDate': dep},
        ],
        passengers: {'adults': 1},
      );
      if (res.offers.isNotEmpty) return res.offers;
    } catch (_) {}

    return [
      Vuelo(
        offerId: 'vue-eq-301',
        airlineCode: 'EQ',
        airlineName: 'Aerolíneas Galápagos',
        totalPrice: 89.0,
        flatNumber: 'EQ-301',
        flatOrigin: 'UIO',
        flatDest: 'GYE',
        flatDate: '2026-12-05',
        flatDepTime: '08:30',
        flatArrTime: '09:20',
        flatStatus: 'SCHEDULED',
        flatGate: 'A4',
      ),
    ];
  }

  static Future<Map<String, dynamic>> crearHoldVuelo({
    required String offerId,
    required List<Map<String, String>> itinerarySelections,
    Map<String, int>? passengersBreakdown,
    required String idempotencyKey,
    String? token,
  }) async {
    final body = <String, dynamic>{
      'offerId': offerId,
      'itinerarySelections': itinerarySelections,
    };
    if (passengersBreakdown != null) {
      body['passengersBreakdown'] = passengersBreakdown;
    }

    final res = await ApiClient.post(
      '/vuelos/offers/hold',
      body: body,
      token: token,
      idempotencyKey: idempotencyKey,
      includeFingerprint: true,
      timeout: ApiConfig.sagaTimeout,
    );
    if (res.statusCode == 200 || res.statusCode == 201) {
      final decoded = jsonDecode(res.body);
      return decoded is Map<String, dynamic> ? decoded : {'data': decoded};
    }
    throw ApiClient.parseError(res);
  }

  static Future<void> liberarHoldVuelo(String holdId) async {
    try {
      await ApiClient.delete(
        '/vuelos/offers/hold/${Uri.encodeComponent(holdId)}',
        includeFingerprint: true,
      );
    } catch (_) {}
  }

  static Future<Map<String, dynamic>?> obtenerMapaAsientos(
    String offerId,
    String segmentId, {
    String? holdId,
  }) async {
    try {
      final params = <String, String>{'segmentId': segmentId};
      if (holdId != null && holdId.isNotEmpty) params['holdId'] = holdId;

      final res = await ApiClient.get(
        '/vuelos/offers/${Uri.encodeComponent(offerId)}/seatmap',
        queryParams: params,
        includeFingerprint: true,
      );
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        if (decoded is Map<String, dynamic>) return decoded;
      }
    } catch (_) {}
    return null;
  }

  static Future<Map<String, dynamic>?> bloquearAsientos(
    String offerId,
    String holdId,
    List<Map<String, String>> seats, {
    String? expiresAt,
  }) async {
    final body = <String, dynamic>{'holdId': holdId, 'seats': seats};
    if (expiresAt != null) body['expiresAt'] = expiresAt;

    final res = await ApiClient.put(
      '/vuelos/offers/${Uri.encodeComponent(offerId)}/seat-locks',
      body: body,
      includeFingerprint: true,
    );
    if (res.statusCode == 200 || res.statusCode == 201) {
      final decoded = jsonDecode(res.body);
      return decoded is Map<String, dynamic> ? decoded : null;
    }
    throw ApiClient.parseError(res);
  }

  static Future<Map<String, dynamic>> crearReservaVuelo(
    Map<String, dynamic> payload,
    String idempotencyKey, {
    String? token,
  }) async {
    final res = await ApiClient.post(
      '/vuelos/bookings',
      body: payload,
      token: token,
      idempotencyKey: idempotencyKey,
      includeFingerprint: true,
      timeout: ApiConfig.vuelosBookingTimeout,
    );
    if (res.statusCode == 200 || res.statusCode == 201 || res.statusCode == 202) {
      final decoded = jsonDecode(res.body);
      return decoded is Map<String, dynamic> ? decoded : {'data': decoded};
    }
    throw ApiClient.parseError(res);
  }

  static Future<Map<String, dynamic>?> consultarEstadoVuelo(String flightNumber, String date) async {
    final res = await ApiClient.get(
      '/vuelos/flights/${Uri.encodeComponent(flightNumber.trim().toUpperCase())}/status',
      queryParams: {'date': date},
    );
    if (res.statusCode == 200) {
      final decoded = jsonDecode(res.body);
      if (decoded is Map<String, dynamic>) return decoded;
    }
    throw ApiClient.parseError(res);
  }

  static Future<Map<String, dynamic>> checkinVuelo(String bookingId, {String? token}) async {
    final res = await ApiClient.post(
      '/vuelos/bookings/${Uri.encodeComponent(bookingId)}/checkin',
      body: {},
      token: token,
      includeFingerprint: true,
      timeout: ApiConfig.sagaTimeout,
    );
    if (res.statusCode == 200 || res.statusCode == 201) {
      final decoded = jsonDecode(res.body);
      return decoded is Map<String, dynamic> ? decoded : {'data': decoded};
    }
    throw ApiClient.parseError(res);
  }

  // =========================================================================
  // 5. MIS RESERVAS MULTI-VERTICAL & COMPENSACIÓN SAGA
  // =========================================================================

  static final List<Reserva> _reservasEnMemoria = [];

  static void agregarReservaDirecta(Reserva r) {
    _reservasEnMemoria.removeWhere((item) => item.id == r.id);
    _reservasEnMemoria.insert(0, r);
  }

  static Future<List<Reserva>> getMisReservas({String? token, String? email}) async {
    final results = <Reserva>[..._reservasEnMemoria];
    final seenIds = results.map((r) => r.id).toSet();

    void mergeList(List<dynamic> rawList, String vertical) {
      for (final item in rawList) {
        if (item is Map) {
          try {
            final r = Reserva.fromJson(Map<String, dynamic>.from(item), forcedVertical: vertical);
            if (!seenIds.contains(r.id)) {
              seenIds.add(r.id);
              results.add(r);
            }
          } catch (_) {}
        }
      }
    }

    await Future.wait([
      // 1. Alojamientos (requiere token JWT)
      () async {
        if (token == null || token.isEmpty) return;
        try {
          final res = await ApiClient.get('/alojamientos/reservations', token: token);
          if (res.statusCode == 200) {
            final data = jsonDecode(res.body);
            final list = data is List ? data : (data['data'] ?? []);
            if (list is List) mergeList(list, 'alojamientos');
          }
        } catch (_) {}
      }(),

      // 2. Atracciones
      () async {
        try {
          final params = (email != null && email.isNotEmpty) ? {'email': email} : null;
          final res = await ApiClient.get('/atracciones/reservations', queryParams: params, token: token);
          if (res.statusCode == 200) {
            final data = jsonDecode(res.body);
            final list = data is List ? data : (data['data'] ?? []);
            if (list is List) mergeList(list, 'atracciones');
          }
        } catch (_) {}
      }(),

      // 3. Autos
      () async {
        try {
          final params = (email != null && email.isNotEmpty) ? {'email': email} : null;
          final res = await ApiClient.get('/autos/orders', queryParams: params, token: token);
          if (res.statusCode == 200) {
            final data = jsonDecode(res.body);
            final list = data is List ? data : (data['data'] ?? []);
            if (list is List) mergeList(list, 'autos');
          }
        } catch (_) {}
      }(),

      // 4. Vuelos (X-Device-Fingerprint)
      () async {
        try {
          final res = await ApiClient.get(
            '/vuelos/bookings',
            token: token,
            includeFingerprint: true,
          );
          if (res.statusCode == 200) {
            final data = jsonDecode(res.body);
            final list = data is List ? data : (data['items'] ?? data['data'] ?? []);
            if (list is List) mergeList(list, 'vuelos');
          }
        } catch (_) {}
      }(),
    ]);

    return results;
  }

  static Future<bool> cancelarReserva(
    String id,
    String vertical, {
    String? token,
    String reason = 'Cancelación solicitada por el cliente',
  }) async {
    final v = vertical.toLowerCase();
    String path;
    bool fingerprint = false;

    if (v.contains('alojamiento')) {
      path = '/alojamientos/reservations/${Uri.encodeComponent(id)}/cancel';
    } else if (v.contains('auto')) {
      path = '/autos/orders/${Uri.encodeComponent(id)}/cancel';
    } else if (v.contains('vuelo')) {
      path = '/vuelos/bookings/${Uri.encodeComponent(id)}/cancel';
      fingerprint = true;
    } else {
      path = '/atracciones/reservations/${Uri.encodeComponent(id)}/cancel';
    }

    try {
      final res = await ApiClient.post(
        path,
        body: {'reason': reason},
        token: token,
        idempotencyKey: 'cancel-$id-${DateTime.now().millisecondsSinceEpoch}',
        includeFingerprint: fingerprint,
        timeout: ApiConfig.sagaTimeout,
      );
      if (res.statusCode == 200 || res.statusCode == 201 || res.statusCode == 204) {
        final idx = _reservasEnMemoria.indexWhere((r) => r.id == id);
        if (idx != -1) {
          final old = _reservasEnMemoria[idx];
          _reservasEnMemoria[idx] = Reserva(
            id: old.id,
            vertical: old.vertical,
            servicioNombre: old.servicioNombre,
            proveedor: old.proveedor,
            fecha: old.fecha,
            hora: old.hora,
            checkin: old.checkin,
            checkout: old.checkout,
            total: old.total,
            estado: 'CANCELLED',
            voucherQr: old.voucherQr,
            pnr: old.pnr,
            imagenUrl: old.imagenUrl,
            fechaCreacion: old.fechaCreacion,
            fechaServicio: old.fechaServicio,
          );
        }
        return true;
      }
    } catch (_) {}
    return false;
  }

  // =========================================================================
  // 6. DETALLE RESERVA VUELO + TICKETS + EQUIPAJE + BOARDING PASS
  // =========================================================================

  static Future<Map<String, dynamic>?> getVueloBookingDetalle(String bookingId, {String? token}) async {
    try {
      final res = await ApiClient.get(
        '/vuelos/bookings/${Uri.encodeComponent(bookingId)}',
        token: token,
        includeFingerprint: true,
      );
      if (res.statusCode == 200) {
        final d = jsonDecode(res.body);
        if (d is Map<String, dynamic>) return d;
      }
    } catch (_) {}
    return null;
  }

  static Future<List<Map<String, dynamic>>> listarTicketsVuelo(String bookingId, {String? token}) async {
    try {
      final res = await ApiClient.get(
        '/vuelos/bookings/${Uri.encodeComponent(bookingId)}/tickets',
        token: token,
        includeFingerprint: true,
      );
      if (res.statusCode == 200) {
        final d = jsonDecode(res.body);
        final list = d is Map ? (d['tickets'] ?? d['data'] ?? []) : d;
        if (list is List) {
          return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        }
      }
    } catch (_) {}
    return [];
  }

  static Future<List<Map<String, dynamic>>> listarPasesAbordar(String bookingId, {String? token}) async {
    try {
      final res = await ApiClient.get(
        '/vuelos/bookings/${Uri.encodeComponent(bookingId)}/boarding-passes',
        token: token,
        includeFingerprint: true,
      );
      if (res.statusCode == 200) {
        final d = jsonDecode(res.body);
        final list = d is Map ? (d['boardingPasses'] ?? d['data'] ?? []) : d;
        if (list is List) {
          return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        }
      }
    } catch (_) {}
    return [];
  }

  static Future<Map<String, dynamic>> emitirTicketsVuelo(String bookingId, {String? token}) async {
    final res = await ApiClient.post(
      '/vuelos/bookings/${Uri.encodeComponent(bookingId)}/tickets',
      body: {},
      token: token,
      includeFingerprint: true,
      timeout: ApiConfig.sagaTimeout,
    );
    if (res.statusCode == 200 || res.statusCode == 201) {
      final d = jsonDecode(res.body);
      return d is Map<String, dynamic> ? d : {'data': d};
    }
    throw ApiClient.parseError(res);
  }

  // =========================================================================
  // 7. CHATBOT, PROVEEDORES Y ENVÍO DE FACTURAS
  // =========================================================================

  static Future<bool> chatbotEstado() async {
    try {
      final res = await ApiClient.get('/chatbot/estado');
      if (res.statusCode == 200) {
        final d = jsonDecode(res.body);
        if (d is Map) return d['disponible'] == true;
      }
    } catch (_) {}
    return true;
  }

  static Future<Map<String, dynamic>> chatbotEnviarMensaje({
    required String mensaje,
    required String sessionId,
    String idioma = 'es',
    String? token,
  }) async {
    final res = await ApiClient.post(
      '/chatbot/mensaje',
      body: {
        'mensaje': mensaje,
        'sessionId': sessionId,
        'idioma': idioma,
      },
      token: token,
      timeout: ApiConfig.sagaTimeout,
    );
    if (res.statusCode == 200 || res.statusCode == 201) {
      final d = jsonDecode(res.body);
      return d is Map<String, dynamic> ? d : {'respuesta': d.toString()};
    }
    throw ApiClient.parseError(res);
  }

  static Future<Map<String, dynamic>> enviarSolicitudProveedor(Map<String, dynamic> payload) async {
    final res = await ApiClient.post(
      '/proveedores/solicitudes',
      body: payload,
      timeout: ApiConfig.sagaTimeout,
    );
    if (res.statusCode == 200 || res.statusCode == 201) {
      final d = jsonDecode(res.body);
      return d is Map<String, dynamic> ? d : {'data': d};
    }
    throw ApiClient.parseError(res);
  }

  static Future<Map<String, dynamic>> enviarFacturaPorCorreo({
    required String pnr,
    required String concepto,
    String pdfBase64 = '',
    String? token,
  }) async {
    final res = await ApiClient.post(
      '/facturas/enviar',
      body: {
        'pdfBase64': pdfBase64,
        'pnr': pnr,
        'concepto': concepto,
      },
      token: token,
      timeout: ApiConfig.sagaTimeout,
    );
    if (res.statusCode == 200 || res.statusCode == 201) {
      final d = jsonDecode(res.body);
      return d is Map<String, dynamic> ? d : {'data': d};
    }
    throw ApiClient.parseError(res);
  }
}
