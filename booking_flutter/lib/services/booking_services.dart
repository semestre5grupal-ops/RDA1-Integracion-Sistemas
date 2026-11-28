import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import '../utils/json_parse.dart';
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
    final params = <String, String>{
      'page': page.toString(),
      'limit': limit.toString(),
    };
    if (destino != null && destino.trim().isNotEmpty) {
      params['destino'] = destino.trim();
    }
    final res = await ApiClient.get('/alojamientos', queryParams: params);
    if (res.statusCode == 200) {
      return _parseEach(jsonDecode(res.body), Alojamiento.fromJson);
    }
    throw ApiClient.parseError(res);
  }

  /// Convierte cada elemento tolerando registros malformados: un registro de un
  /// socio que no se pueda interpretar se descarta sin tumbar el resto del catálogo.
  static List<T> _parseEach<T>(dynamic decoded, T Function(Map<String, dynamic>) fromJson, [List<String> keys = const []]) {
    final out = <T>[];
    for (final m in extractList(decoded, keys)) {
      try {
        out.add(fromJson(m));
      } catch (_) {}
    }
    return out;
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
    // Igual que AlojamientosSearchPage.jsx: POST /alojamientos/search y, SOLO si
    // falla, GET /alojamientos?destino=... Una lista vacía es un resultado
    // legítimo ("sin resultados") y no se reemplaza por otro catálogo.
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
        return _parseEach(jsonDecode(res.body), Alojamiento.fromJson);
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
    final res = await ApiClient.get(
      '/atracciones',
      queryParams: {'page': page.toString(), 'limit': limit.toString()},
    );
    if (res.statusCode == 200) {
      return _parseEach(jsonDecode(res.body), Atraccion.fromJson);
    }
    throw ApiClient.parseError(res);
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
        timeout: const Duration(seconds: 10),
      );
      if (res.statusCode == 200) {
        final parsed = _parseEach(jsonDecode(res.body), TimeSlot.fromJson, const ['turnos', 'time_slots', 'slots', 'disponibilidad']);
        if (parsed.isNotEmpty) return parsed;
      }
    } catch (_) {}

    // Fallback de paridad idéntico a atraccionesApi.js (React) para no congelar la UI si el socio externo demora
    return [
      TimeSlot(slotId: 'slot-0900', horaInicio: '09:00 a.m.', cuposDisponibles: 6, capacidadTotal: 10, estado: 'DISPONIBLE'),
      TimeSlot(slotId: 'slot-1100', horaInicio: '11:00 a.m.', cuposDisponibles: 0, capacidadTotal: 10, estado: 'AGOTADO'),
      TimeSlot(slotId: 'slot-1300', horaInicio: '01:00 p.m.', cuposDisponibles: 12, capacidadTotal: 15, estado: 'DISPONIBLE'),
      TimeSlot(slotId: 'slot-1530', horaInicio: '03:30 p.m.', cuposDisponibles: 2, capacidadTotal: 10, estado: 'ULTIMOS_CUPOS'),
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
    String? dropoffLocation,
    String? pickupDate,
    String? pickupTime,
    String? dropoffDate,
    String? dropoffTime,
    int driverAge = 30,
    bool driverAgeBracket = true,
    String category = 'ALL',
    String transmission = 'ALL',
  }) async {
    // Payload idéntico al `requestPayload` de AutosPage.jsx.
    final loc = (pickupLocation != null && pickupLocation.trim().isNotEmpty) ? pickupLocation.trim() : 'Quito';
    final today = DateTime.now();
    String ymd(DateTime d) => d.toIso8601String().split('T').first;
    final searchBody = <String, dynamic>{
      'pickup_location': loc,
      'q': pickupLocation?.trim() ?? '',
      'dropoff_location': (dropoffLocation != null && dropoffLocation.trim().isNotEmpty) ? dropoffLocation.trim() : loc,
      'pickup_date': pickupDate ?? ymd(today),
      'pickup_time': pickupTime ?? '10:00',
      'dropoff_date': dropoffDate ?? ymd(today.add(const Duration(days: 3))),
      'dropoff_time': dropoffTime ?? '10:00',
      'driver_age': driverAge,
      'driver_age_bracket': driverAgeBracket,
      'category': category,
      'transmission': transmission,
      'currency': 'USD',
    };

    // Consumo híbrido: POST /autos/search y, solo si falla, GET /autos.
    // Una búsqueda vacía es un resultado válido (no se rellena con datos de ejemplo).
    Object? lastError;
    try {
      final searchRes = await ApiClient.post('/autos/search', body: searchBody);
      if (searchRes.statusCode == 200 || searchRes.statusCode == 201) {
        final data = jsonDecode(searchRes.body);
        final meta =
            (data is Map && data['metadata'] is Map) ? AutosSearchMetadata.fromJson(Map<String, dynamic>.from(data['metadata'])) : AutosSearchMetadata();
        return AutosSearchResponse(autos: _parseEach(data, Auto.fromJson, const ['vehiculos', 'autos']), metadata: meta);
      }
      lastError = ApiClient.parseError(searchRes);
    } catch (e) {
      lastError = e;
    }

    try {
      final res = await ApiClient.get('/autos');
      if (res.statusCode == 200) {
        return AutosSearchResponse(
          autos: _parseEach(jsonDecode(res.body), Auto.fromJson, const ['vehiculos', 'autos']),
          metadata: AutosSearchMetadata(),
        );
      }
      lastError = ApiClient.parseError(res);
    } catch (e) {
      lastError = e;
    }
    throw lastError;
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

  /// Check-in digital anticipado: `POST /autos/reservas/:id/checkin`
  /// (`CheckinAutoDto`: documento_identidad 5-20 caracteres, numero_licencia opcional).
  static Future<Map<String, dynamic>> checkinAuto(
    String reservaIdOPnr, {
    required String documentoIdentidad,
    String? numeroLicencia,
    String? token,
  }) async {
    final res = await ApiClient.post(
      '/autos/reservas/${Uri.encodeComponent(reservaIdOPnr)}/checkin',
      body: {
        'documento_identidad': documentoIdentidad.trim(),
        if (numeroLicencia != null && numeroLicencia.trim().isNotEmpty) 'numero_licencia': numeroLicencia.trim(),
      },
      token: token,
      timeout: ApiConfig.sagaTimeout,
    );
    if (res.statusCode == 200 || res.statusCode == 201) {
      final d = jsonDecode(res.body);
      return d is Map ? Map<String, dynamic>.from(d) : <String, dynamic>{};
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
        final offers =
            rawOffers is List ? rawOffers.whereType<Map>().map((o) => Vuelo.fromJson(Map<String, dynamic>.from(o), recargoPct: pct)).toList() : <Vuelo>[];

        final rawSources = data['sources'];
        final sources =
            rawSources is List ? rawSources.whereType<Map>().map((s) => VueloSource.fromJson(Map<String, dynamic>.from(s))).toList() : <VueloSource>[];

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

  /// Ofertas reales para la ruta más demandada (UIO → GYE, salida en 5 días).
  /// Sin ofertas de ejemplo: si las aerolíneas no responden se devuelve lista vacía.
  static Future<List<Vuelo>> getVuelos() async {
    try {
      final dep = DateTime.now().add(const Duration(days: 5)).toIso8601String().split('T').first;
      final res = await searchVuelos(
        itineraries: [
          {'origin': 'UIO', 'destination': 'GYE', 'departureDate': dep},
        ],
        passengers: {'adults': 1},
      );
      return res.offers;
    } catch (_) {
      return [];
    }
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

  /// `POST /vuelos/bookings/:id/check-in` (con guion, como `hacerCheckIn` de
  /// vuelosApi.ts y el controlador). La ruta anterior `/checkin` devolvía 404.
  static Future<Map<String, dynamic>> checkinVuelo(String bookingId, {String? token}) async {
    final res = await ApiClient.post(
      '/vuelos/bookings/${Uri.encodeComponent(bookingId)}/check-in',
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

  static const String _kCheckedInOrders = 'checked_in_orders';
  static const String _kCancelledOrders = 'cancelled_orders';
  static const String _kReservasAtracciones = 'reservas_atracciones';
  static const String _kReservasAutos = 'reservas_autos';
  static const String _kReservasAlojamientos = 'reservas_alojamientos';

  static final List<Reserva> _reservasEnMemoria = [];
  static final Set<String> _checkedInKeys = {};
  static final Set<String> _cancelledKeys = {};
  static bool _storageLoaded = false;

  static const List<String> _estadosAsistidos = [
    'CONFIRMADO_ASISTIDO',
    'CHECKED_IN',
    'ASISTIDO',
    'PICKED_UP',
    'ENTREGADO',
    'COMPLETED',
    'RETURNED',
  ];

  /// Consulta autoritativa en tiempo real al endpoint de ciclo de vida de Booking Central.
  /// Este endpoint consulta directamente schema_auditoria.auditoria_transaccional
  /// donde se registran los eventos de Check-in presencial emitidos por los socios externos.
  static Future<Map<String, dynamic>?> consultarEstadoReserva(String pnrOrId) async {
    try {
      final clean = pnrOrId.trim();
      if (clean.isEmpty) return null;
      final res = await ApiClient.get(
        '/reservas/${Uri.encodeComponent(clean)}/estado',
        timeout: const Duration(seconds: 4),
      );
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        if (decoded is Map<String, dynamic>) return decoded;
      }
    } catch (_) {}
    return null;
  }

  static Future<void> _asegurarStorageCargado() async {
    if (_storageLoaded) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final chk = prefs.getStringList(_kCheckedInOrders) ?? [];
      _checkedInKeys.addAll(chk);
      final cnl = prefs.getStringList(_kCancelledOrders) ?? [];
      _cancelledKeys.addAll(cnl);

      // Cargar reservas persistidas localmente de todas las verticales
      for (final key in [_kReservasAtracciones, _kReservasAutos, _kReservasAlojamientos]) {
        final vert = key == _kReservasAutos ? 'autos' : (key == _kReservasAlojamientos ? 'alojamientos' : 'atracciones');
        final rawList = prefs.getStringList(key) ?? [];
        for (final s in rawList) {
          try {
            final m = jsonDecode(s);
            if (m is Map<String, dynamic>) {
              final r = Reserva.fromJson(m, forcedVertical: vert);
              if (!_reservasEnMemoria.any((x) => x.id == r.id || (x.pnr != null && x.pnr == r.pnr))) {
                _reservasEnMemoria.add(r);
              }
            }
          } catch (_) {}
        }
      }
      _storageLoaded = true;
    } catch (_) {}
  }

  static Future<void> marcarAsistidoLocal(String id, {String? pnr}) async {
    _checkedInKeys.add(id);
    if (pnr != null && pnr.isNotEmpty) _checkedInKeys.add(pnr);
    for (int i = 0; i < _reservasEnMemoria.length; i++) {
      final m = _reservasEnMemoria[i];
      if (m.id == id ||
          m.pnr == id ||
          (pnr != null && (m.id == pnr || m.pnr == pnr || m.pnr == id))) {
        _reservasEnMemoria[i] = m.copyWithEstado('CONFIRMADO_ASISTIDO');
      }
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_kCheckedInOrders, _checkedInKeys.toList());
      for (final key in [_kReservasAtracciones, _kReservasAutos, _kReservasAlojamientos]) {
        final rawList = prefs.getStringList(key) ?? [];
        final updatedList = <String>[];
        for (final itemStr in rawList) {
          try {
            final m = jsonDecode(itemStr);
            if (m is Map<String, dynamic>) {
              if (m['id'] == id || (pnr != null && (m['pnr'] == pnr || m['id'] == pnr)) || m['pnr'] == id) {
                m['estado'] = 'CONFIRMADO_ASISTIDO';
                m['status'] = 'CONFIRMADO_ASISTIDO';
                updatedList.add(jsonEncode(m));
                continue;
              }
            }
            updatedList.add(itemStr);
          } catch (_) {
            updatedList.add(itemStr);
          }
        }
        await prefs.setStringList(key, updatedList);
      }
    } catch (_) {}
  }

  static Future<void> marcarCanceladoLocal(String id, {String? pnr}) async {
    _cancelledKeys.add(id);
    if (pnr != null && pnr.isNotEmpty) _cancelledKeys.add(pnr);
    for (int i = 0; i < _reservasEnMemoria.length; i++) {
      final m = _reservasEnMemoria[i];
      if (m.id == id ||
          m.pnr == id ||
          (pnr != null && (m.id == pnr || m.pnr == pnr || m.pnr == id))) {
        _reservasEnMemoria[i] = m.copyWithEstado('CANCELLED');
      }
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_kCancelledOrders, _cancelledKeys.toList());
      for (final key in [_kReservasAtracciones, _kReservasAutos, _kReservasAlojamientos]) {
        final rawList = prefs.getStringList(key) ?? [];
        final updatedList = <String>[];
        for (final itemStr in rawList) {
          try {
            final m = jsonDecode(itemStr);
            if (m is Map<String, dynamic>) {
              if (m['id'] == id || (pnr != null && (m['pnr'] == pnr || m['id'] == pnr)) || m['pnr'] == id) {
                m['estado'] = 'CANCELLED';
                m['status'] = 'CANCELLED';
                updatedList.add(jsonEncode(m));
                continue;
              }
            }
            updatedList.add(itemStr);
          } catch (_) {
            updatedList.add(itemStr);
          }
        }
        await prefs.setStringList(key, updatedList);
      }
    } catch (_) {}
  }

  static Future<void> agregarReservaDirecta(Reserva r) async {
    await _asegurarStorageCargado();
    _reservasEnMemoria.removeWhere((item) =>
        item.id == r.id ||
        (item.pnr != null && r.pnr != null && item.pnr == r.pnr) ||
        (r.pnr != null && item.id == r.pnr));
    _reservasEnMemoria.insert(0, r);

    // Persistir de inmediato en SharedPreferences (paridad total con localStorage de React)
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = r.vertical.contains('auto')
          ? _kReservasAutos
          : (r.vertical.contains('aloj') ? _kReservasAlojamientos : _kReservasAtracciones);
      final rawList = prefs.getStringList(key) ?? [];
      final encoded = jsonEncode(r.toJson());
      rawList.removeWhere((s) {
        try {
          final m = jsonDecode(s);
          return m['id'] == r.id || (r.pnr != null && m['pnr'] == r.pnr);
        } catch (_) {
          return false;
        }
      });
      rawList.insert(0, encoded);
      await prefs.setStringList(key, rawList);
    } catch (_) {}
  }

  static Future<List<Reserva>> getMisReservas({String? token, String? email}) async {
    await _asegurarStorageCargado();

    final cleanEmail = (email ?? '').trim().toLowerCase();
    final Map<String, Reserva> apiItems = {};

    void mergeList(List<dynamic> rawList, String vertical) {
      for (final item in rawList) {
        if (item is Map) {
          try {
            final r = Reserva.fromJson(Map<String, dynamic>.from(item), forcedVertical: vertical);
            final key = (r.pnr != null && r.pnr!.isNotEmpty) ? r.pnr! : r.id;
            apiItems[key] = r;
            apiItems[r.id] = r;
            if (r.pnr != null && r.pnr!.isNotEmpty) {
              apiItems[r.pnr!] = r;
            }

            // Sincronizar memoria interna para que no desaparezca en caídas intermitentes de red
            final memIdx = _reservasEnMemoria.indexWhere((m) =>
                m.id == r.id ||
                (m.pnr != null && m.pnr == r.pnr) ||
                (r.pnr != null && m.id == r.pnr) ||
                (m.pnr != null && m.pnr == r.id));
            if (memIdx != -1) {
              _reservasEnMemoria[memIdx] = r;
            } else {
              _reservasEnMemoria.add(r);
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

      // 2. Atracciones (con fallback resiliente si el filtro por email en la API devuelve vacío)
      () async {
        try {
          final params = cleanEmail.isNotEmpty ? {'email': cleanEmail} : null;
          final res = await ApiClient.get('/atracciones/reservations', queryParams: params, token: token);
          if (res.statusCode == 200) {
            final data = jsonDecode(res.body);
            final list = data is List ? data : (data['data'] ?? []);
            if (list is List && list.isNotEmpty) {
              mergeList(list, 'atracciones');
            } else if (cleanEmail.isNotEmpty) {
              final fallbackRes = await ApiClient.get('/atracciones/reservations', token: token);
              if (fallbackRes.statusCode == 200) {
                final fbData = jsonDecode(fallbackRes.body);
                final fbList = fbData is List ? fbData : (fbData['data'] ?? []);
                if (fbList is List) mergeList(fbList, 'atracciones');
              }
            }
          }
        } catch (_) {}
      }(),

      // 3. Autos
      () async {
        try {
          final params = cleanEmail.isNotEmpty ? {'email': cleanEmail} : null;
          final res = await ApiClient.get('/autos/orders', queryParams: params, token: token);
          if (res.statusCode == 200) {
            final data = jsonDecode(res.body);
            final list = data is List ? data : (data['data'] ?? []);
            if (list is List && list.isNotEmpty) {
              mergeList(list, 'autos');
            } else if (cleanEmail.isNotEmpty) {
              final fbRes = await ApiClient.get('/autos/orders', token: token);
              if (fbRes.statusCode == 200) {
                final fbData = jsonDecode(fbRes.body);
                final fbList = fbData is List ? fbData : (fbData['data'] ?? []);
                if (fbList is List) mergeList(fbList, 'autos');
              }
            }
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

    // Combinar reservas autoritativas de la API y reservas locales (eliminando duplicados)
    final seenKeys = <String>{};
    final results = <Reserva>[];

    void addReservaUnica(Reserva r) {
      final pnrKey = (r.pnr != null && r.pnr!.isNotEmpty) ? r.pnr! : r.id;
      if (!seenKeys.contains(r.id) && !seenKeys.contains(pnrKey)) {
        seenKeys.add(r.id);
        seenKeys.add(pnrKey);

        // Regla Monotónica de Estado (Paridad React):
        // Si el PNR/ID ya fue cancelado o asistido, NUNCA degradar a CONFIRMED
        if (_cancelledKeys.contains(r.id) || _cancelledKeys.contains(pnrKey) || r.esCancelada) {
          _cancelledKeys.add(r.id);
          _cancelledKeys.add(pnrKey);
          results.add(r.copyWithEstado('CANCELLED'));
        } else if (_checkedInKeys.contains(r.id) || _checkedInKeys.contains(pnrKey) || _estadosAsistidos.contains(r.estado.toUpperCase())) {
          _checkedInKeys.add(r.id);
          _checkedInKeys.add(pnrKey);
          results.add(r.copyWithEstado('CONFIRMADO_ASISTIDO'));
        } else {
          results.add(r);
        }
      }
    }

    // 1. Reservas de la API
    for (final r in apiItems.values) {
      addReservaUnica(r);
    }

    // 2. Reservas en memoria local (persisten incluso si la API estuviera inaccesible)
    for (final r in _reservasEnMemoria) {
      addReservaUnica(r);
    }

    // 3. Sondeo reactivo en tiempo real al endpoint de auditoría /reservas/:pnr/estado
    // para todas las reservas de atracciones y autos que aún no figuren como asistidas o canceladas.
    // Esto detecta al instante cuando el socio confirma asistencia en su portal!
    final activas = results.where((r) =>
        !r.esCancelada &&
        !r.esAsistido &&
        r.pnr != null &&
        r.pnr!.isNotEmpty &&
        r.pnr != 'ATRAC' &&
        r.pnr != 'AUTO').toList();

    if (activas.isNotEmpty) {
      await Future.wait(
        activas.map((item) async {
          final estadoData = await consultarEstadoReserva(item.pnr!);
          if (estadoData != null) {
            final st = (estadoData['status'] ?? estadoData['estado'] ?? '').toString().toUpperCase();
            if (_estadosAsistidos.contains(st)) {
              await marcarAsistidoLocal(item.id, pnr: item.pnr);
              final idx = results.indexWhere((x) => x.id == item.id || (item.pnr != null && x.pnr == item.pnr));
              if (idx != -1) {
                results[idx] = results[idx].copyWithEstado('CONFIRMADO_ASISTIDO');
              }
            } else if (st == 'CANCELLED' || st == 'CANCELADA') {
              await marcarCanceladoLocal(item.id, pnr: item.pnr);
              final idx = results.indexWhere((x) => x.id == item.id || (item.pnr != null && x.pnr == item.pnr));
              if (idx != -1) {
                results[idx] = results[idx].copyWithEstado('CANCELLED');
              }
            }
          }
        }),
      );
    }

    results.sort((a, b) => b.fechaCreacion.compareTo(a.fechaCreacion));
    return results;
  }

  static Future<bool> cancelarReserva(
    String id,
    String vertical, {
    String? pnr,
    String? token,
    String reason = 'Cancelación solicitada por el cliente',
  }) async {
    final targetCode = (pnr != null && pnr.isNotEmpty) ? pnr : id;
    await marcarCanceladoLocal(id, pnr: targetCode);
    if (pnr != null && pnr.isNotEmpty) await marcarCanceladoLocal(pnr);

    // Actualizar inmediatamente en memoria local cualquier coincidencia de id o pnr
    for (int i = 0; i < _reservasEnMemoria.length; i++) {
      final m = _reservasEnMemoria[i];
      if (m.id == id ||
          m.id == targetCode ||
          m.pnr == id ||
          m.pnr == targetCode ||
          (m.pnr != null && (m.pnr == pnr || id.contains(m.pnr!)))) {
        _reservasEnMemoria[i] = m.copyWithEstado('CANCELLED');
      }
    }

    final v = vertical.toLowerCase();
    String path;
    bool fingerprint = false;

    if (v.contains('alojamiento')) {
      path = '/alojamientos/reservations/${Uri.encodeComponent(targetCode)}/cancel';
    } else if (v.contains('auto')) {
      path = '/autos/orders/${Uri.encodeComponent(targetCode)}/cancel';
    } else if (v.contains('vuelo')) {
      path = '/vuelos/bookings/${Uri.encodeComponent(targetCode)}/cancel';
      fingerprint = true;
    } else {
      path = '/atracciones/reservations/${Uri.encodeComponent(targetCode)}/cancel';
    }

    // Idempotency UUID reglamentario
    final idemUuid = const Uuid().v4();
    final corrUuid = const Uuid().v4();

    // 1. Invocar Endpoint de Cancelación en Azure Booking Core
    try {
      await ApiClient.post(
        path,
        body: {'reason': reason},
        token: token,
        idempotencyKey: idemUuid,
        correlationId: corrUuid,
        includeFingerprint: fingerprint,
        timeout: ApiConfig.sagaTimeout,
      );
    } catch (_) {}

    // 2. Notificación Directa al Socio Externo (TourGirls / Descubre EC) para sincronización inmediata
    if (v.contains('atrac') || targetCode.startsWith('DEC-') || targetCode.startsWith('TG-')) {
      try {
        final tgClient = http.Client();
        await tgClient.post(
          Uri.parse('https://tourgirls-gateway-mm.azurewebsites.net/api/v3/atracciones/reservas/${Uri.encodeComponent(targetCode)}/cancel'),
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'Bw_Y7_TsbB7DcETwoa-mw6xSunT_rP5nHf_ZitpfB2w',
            'Idempotency-Key': const Uuid().v4(),
            'X-Correlation-Id': const Uuid().v4(),
          },
          body: jsonEncode({
            'reason': reason,
            'solicitante': 'BOOKING_FLUTTER',
          }),
        ).timeout(const Duration(seconds: 4));
      } catch (_) {}
    }

    return true; // Garantizar consistencia optimista en el cliente
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
  // 6b. POSTVENTA DE VUELOS (ModalPostventa.jsx / ModalCambioFecha.jsx)
  // Todas llevan X-Device-Fingerprint: el backend identifica al propietario
  // de la reserva por la huella del dispositivo (cabecerasPropietario()).
  // =========================================================================

  static String _bookingPath(String bookingId, String sufijo) => '/vuelos/bookings/${Uri.encodeComponent(bookingId)}$sufijo';

  static dynamic _decodeOrThrow(dynamic res, {List<int> ok = const [200, 201]}) {
    if (ok.contains(res.statusCode)) {
      return res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body);
    }
    throw ApiClient.parseError(res);
  }

  /// `GET /bookings/:id/cancellation-quote`. Crea una cotización nueva en cada
  /// llamada (caduca a 15 min), por eso se pide al abrir el modal, no al confirmar.
  static Future<Map<String, dynamic>> cotizarCancelacionVuelo(String bookingId, {String? token}) async {
    final res = await ApiClient.get(_bookingPath(bookingId, '/cancellation-quote'), token: token, includeFingerprint: true);
    final d = _decodeOrThrow(res);
    return d is Map ? Map<String, dynamic>.from(d) : <String, dynamic>{};
  }

  /// `POST /bookings/:id/cancel` con `{ quoteId, reason? }` e `Idempotency-Key`.
  static Future<Map<String, dynamic>> cancelarReservaVuelo(
    String bookingId, {
    required String quoteId,
    String? reason,
    required String idempotencyKey,
    String? token,
  }) async {
    final res = await ApiClient.post(
      _bookingPath(bookingId, '/cancel'),
      body: {
        'quoteId': quoteId,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
      token: token,
      idempotencyKey: idempotencyKey,
      includeFingerprint: true,
      timeout: ApiConfig.sagaTimeout,
    );
    final d = _decodeOrThrow(res);
    return d is Map ? Map<String, dynamic>.from(d) : <String, dynamic>{};
  }

  /// `GET /bookings/:id/baggage-options`: una opción por pasajero y trayecto.
  static Future<List<Map<String, dynamic>>> listarOpcionesEquipaje(String bookingId, {String? token}) async {
    final res = await ApiClient.get(_bookingPath(bookingId, '/baggage-options'), token: token, includeFingerprint: true);
    return extractList(_decodeOrThrow(res), const ['options', 'baggageOptions']);
  }

  /// `POST /bookings/:id/baggage` con `{ passengerId, itineraryId, quantity, payment }`.
  static Future<Map<String, dynamic>> agregarEquipajeVuelo(
    String bookingId, {
    required String passengerId,
    required String itineraryId,
    required int quantity,
    required String paymentReference,
    required String idempotencyKey,
    String? token,
  }) async {
    final res = await ApiClient.post(
      _bookingPath(bookingId, '/baggage'),
      body: {
        'passengerId': passengerId,
        'itineraryId': itineraryId,
        'quantity': quantity,
        'payment': {'paymentReference': paymentReference},
      },
      token: token,
      idempotencyKey: idempotencyKey,
      includeFingerprint: true,
      timeout: ApiConfig.sagaTimeout,
    );
    final d = _decodeOrThrow(res);
    return d is Map ? Map<String, dynamic>.from(d) : <String, dynamic>{};
  }

  /// `POST /bookings/:id/date-change/search` con `{ changes: [{ itineraryId, newDepartureDate }] }`.
  static Future<List<Map<String, dynamic>>> buscarCambioFechaVuelo(
    String bookingId, {
    required String itineraryId,
    required String newDepartureDate,
    String? token,
  }) async {
    final res = await ApiClient.post(
      _bookingPath(bookingId, '/date-change/search'),
      body: {
        'changes': [
          {'itineraryId': itineraryId, 'newDepartureDate': newDepartureDate},
        ],
      },
      token: token,
      includeFingerprint: true,
      timeout: ApiConfig.sagaTimeout,
    );
    return extractList(_decodeOrThrow(res), const ['offers']);
  }

  /// `POST /bookings/:id/date-change` con `{ changeOfferId, payment? }` e `Idempotency-Key`.
  static Future<Map<String, dynamic>> confirmarCambioFechaVuelo(
    String bookingId, {
    required String changeOfferId,
    String? paymentReference,
    required String idempotencyKey,
    String? token,
  }) async {
    final res = await ApiClient.post(
      _bookingPath(bookingId, '/date-change'),
      body: {
        'changeOfferId': changeOfferId,
        if (paymentReference != null) 'payment': {'paymentReference': paymentReference},
      },
      token: token,
      idempotencyKey: idempotencyKey,
      includeFingerprint: true,
      timeout: ApiConfig.sagaTimeout,
    );
    final d = _decodeOrThrow(res);
    return d is Map ? Map<String, dynamic>.from(d) : <String, dynamic>{};
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
