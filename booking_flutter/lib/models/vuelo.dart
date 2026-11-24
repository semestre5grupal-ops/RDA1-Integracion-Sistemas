double _vueloParseDouble(dynamic val, [double fallback = 0.0]) {
  if (val is num) return val.toDouble();
  if (val is String) return double.tryParse(val) ?? fallback;
  if (val is Map && val['total'] != null) return _vueloParseDouble(val['total'], fallback);
  return fallback;
}

int _vueloParseInt(dynamic val, [int fallback = 0]) {
  if (val is num) return val.toInt();
  if (val is String) return int.tryParse(val) ?? fallback;
  return fallback;
}

double conRecargoBooking(double valor, double pct) {
  if (pct <= 0) return valor;
  final r = (valor * 100).roundToDouble() / 100;
  final fee = ((r * pct / 100) * 100).roundToDouble() / 100;
  return ((r + fee) * 100).roundToDouble() / 100;
}

String extraerHoraIso(String? iso) {
  if (iso == null || iso.isEmpty) return '--:--';
  final m = RegExp(r'T(\d{2}:\d{2})').firstMatch(iso);
  if (m != null) return m.group(1)!;
  if (RegExp(r'^\d{2}:\d{2}').hasMatch(iso)) return iso.substring(0, 5);
  return iso;
}

String extraerFechaIso(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final tIdx = iso.indexOf('T');
  return tIdx > 0 ? iso.substring(0, tIdx) : (iso.length >= 10 ? iso.substring(0, 10) : iso);
}

String formatearDuracionMinutos(int? minutos) {
  if (minutos == null || minutos <= 0) return '--';
  final h = minutos ~/ 60;
  final rem = minutos % 60;
  if (h == 0) return '$rem min';
  if (rem == 0) return '$h h';
  return '$h h $rem min';
}

class VueloSegment {
  final String segmentId;
  final String flightNumber;
  final String originIata;
  final String destinationIata;
  final String departureAt;
  final String arrivalAt;
  final String? terminalSalida;
  final String? terminalLlegada;
  final int? durationMinutes;
  final String? aircraft;
  final String status;
  final String marketingCarrier;
  final String operatingCarrier;

  VueloSegment({
    required this.segmentId,
    required this.flightNumber,
    required this.originIata,
    required this.destinationIata,
    required this.departureAt,
    required this.arrivalAt,
    this.terminalSalida,
    this.terminalLlegada,
    this.durationMinutes,
    this.aircraft,
    this.status = 'SCHEDULED',
    this.marketingCarrier = '',
    this.operatingCarrier = '',
  });

  factory VueloSegment.fromJson(Map<String, dynamic> json) {
    final dep = json['departure'] is Map ? Map<String, dynamic>.from(json['departure']) : <String, dynamic>{};
    final arr = json['arrival'] is Map ? Map<String, dynamic>.from(json['arrival']) : <String, dynamic>{};

    return VueloSegment(
      segmentId: json['segmentId']?.toString() ?? json['id']?.toString() ?? '',
      flightNumber: json['flightNumber']?.toString() ?? json['numero_vuelo']?.toString() ?? 'EQ100',
      originIata: dep['iataCode']?.toString() ?? json['departureIataCode']?.toString() ?? json['origin']?.toString() ?? 'UIO',
      destinationIata: arr['iataCode']?.toString() ?? json['arrivalIataCode']?.toString() ?? json['destination']?.toString() ?? 'GYE',
      departureAt: dep['at']?.toString() ?? json['departureAt']?.toString() ?? json['hora_salida']?.toString() ?? '08:00',
      arrivalAt: arr['at']?.toString() ?? json['arrivalAt']?.toString() ?? json['hora_llegada']?.toString() ?? '09:00',
      terminalSalida: dep['terminal']?.toString(),
      terminalLlegada: arr['terminal']?.toString(),
      durationMinutes: json['durationMinutes'] != null ? _vueloParseInt(json['durationMinutes']) : null,
      aircraft: json['aircraft']?.toString(),
      status: json['status']?.toString() ?? 'SCHEDULED',
      marketingCarrier: json['marketingCarrier']?.toString() ?? json['carrierCode']?.toString() ?? '',
      operatingCarrier: json['operatingCarrier']?.toString() ?? '',
    );
  }
}

class VueloCabinOption {
  final String cabinClass; // ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST
  final String fareBrand;
  final int availableSeats;
  final bool isRefundable;
  final bool isChangeable;
  final bool personalItemIncluded;
  final int carryOnIncluded;
  final int checkedBaggageIncluded;
  final Map<String, double> pricePerPassengerType;

  String get cabinLabelEs {
    switch (cabinClass.toUpperCase()) {
      case 'PREMIUM_ECONOMY':
        return 'Premium';
      case 'BUSINESS':
        return 'Ejecutiva';
      case 'FIRST':
        return 'Primera';
      default:
        return 'Económica';
    }
  }

  double get basePassengerPrice {
    if (pricePerPassengerType.containsKey('ADULT')) return pricePerPassengerType['ADULT']!;
    if (pricePerPassengerType.isNotEmpty) return pricePerPassengerType.values.first;
    return 0.0;
  }

  VueloCabinOption({
    required this.cabinClass,
    required this.fareBrand,
    required this.availableSeats,
    this.isRefundable = false,
    this.isChangeable = false,
    this.personalItemIncluded = true,
    this.carryOnIncluded = 1,
    this.checkedBaggageIncluded = 0,
    this.pricePerPassengerType = const {},
  });

  factory VueloCabinOption.fromJson(Map<String, dynamic> json, {double recargoPct = 0.0}) {
    final rules = json['fareRules'] is Map ? Map<String, dynamic>.from(json['fareRules']) : <String, dynamic>{};
    final bag = json['baggageAllowance'] is Map ? Map<String, dynamic>.from(json['baggageAllowance']) : <String, dynamic>{};
    final ppt = <String, double>{};
    if (json['pricePerPassengerType'] is List) {
      for (final item in json['pricePerPassengerType'] as List) {
        if (item is Map) {
          final pType = item['passengerType']?.toString() ?? 'ADULT';
          final rawTotal = _vueloParseDouble(item['price'], 0.0);
          ppt[pType] = conRecargoBooking(rawTotal, recargoPct);
        }
      }
    }

    return VueloCabinOption(
      cabinClass: json['cabinClass']?.toString() ?? 'ECONOMY',
      fareBrand: json['fareBrand']?.toString() ?? 'STANDARD',
      availableSeats: _vueloParseInt(json['availableSeats'], 9),
      isRefundable: rules['isRefundable'] == true,
      isChangeable: rules['isChangeable'] == true,
      personalItemIncluded: bag['personalItemIncluded'] ?? true,
      carryOnIncluded: _vueloParseInt(bag['carryOnIncluded'], 1),
      checkedBaggageIncluded: _vueloParseInt(bag['checkedBaggageIncluded'], 0),
      pricePerPassengerType: ppt,
    );
  }
}

class VueloItinerary {
  final String itineraryId;
  final int totalDurationMinutes;
  final int stopsCount;
  final List<VueloSegment> segments;
  final List<VueloCabinOption> pricingOptions;

  VueloItinerary({
    required this.itineraryId,
    required this.totalDurationMinutes,
    required this.stopsCount,
    required this.segments,
    required this.pricingOptions,
  });

  factory VueloItinerary.fromJson(Map<String, dynamic> json, {double recargoPct = 0.0}) {
    final segs = <VueloSegment>[];
    if (json['segments'] is List) {
      for (final s in json['segments'] as List) {
        if (s is Map) segs.add(VueloSegment.fromJson(Map<String, dynamic>.from(s)));
      }
    }

    final opts = <VueloCabinOption>[];
    if (json['pricingOptions'] is List) {
      for (final p in json['pricingOptions'] as List) {
        if (p is Map) opts.add(VueloCabinOption.fromJson(Map<String, dynamic>.from(p), recargoPct: recargoPct));
      }
    }

    int dur = _vueloParseInt(json['totalDurationMinutes'], 0);
    if (dur <= 0 && segs.isNotEmpty) {
      try {
        final d1 = DateTime.parse(segs.first.departureAt);
        final d2 = DateTime.parse(segs.last.arrivalAt);
        dur = d2.difference(d1).inMinutes;
      } catch (_) {}
    }

    final stops = json['stopsCount'] != null
        ? _vueloParseInt(json['stopsCount'])
        : (segs.isNotEmpty ? segs.length - 1 : 0);

    return VueloItinerary(
      itineraryId: json['itineraryId']?.toString() ?? '',
      totalDurationMinutes: dur,
      stopsCount: stops,
      segments: segs,
      pricingOptions: opts,
    );
  }
}

class Vuelo {
  final String offerId;
  final String airlineCode;
  final String airlineName;
  final String? providerCode;
  final String? providerName;
  final List<VueloItinerary> itineraries;
  final double totalPrice;
  final String currency;
  final double recargoPct;

  // Campos de compatibilidad directa (también usados en EstadoVueloScreen o fallback plano)
  final String? _flatNumber;
  final String? _flatOrigin;
  final String? _flatDest;
  final String? _flatDate;
  final String? _flatDepTime;
  final String? _flatArrTime;
  final String? _flatStatus;
  final String? _flatGate;

  VueloSegment? get primerSegmento => itineraries.isNotEmpty && itineraries.first.segments.isNotEmpty
      ? itineraries.first.segments.first
      : null;

  VueloSegment? get ultimoSegmento => itineraries.isNotEmpty && itineraries.first.segments.isNotEmpty
      ? itineraries.first.segments.last
      : null;

  String get id => offerId;
  String get numeroVuelo => primerSegmento?.flightNumber ?? _flatNumber ?? 'EQ-100';
  String get aerolinea => airlineName;
  String get origen => primerSegmento?.originIata ?? _flatOrigin ?? 'UIO';
  String get destino => ultimoSegmento?.destinationIata ?? _flatDest ?? 'GYE';
  String get fechaSalida => primerSegmento != null ? extraerFechaIso(primerSegmento!.departureAt) : (_flatDate ?? '2026-12-05');
  String get horaSalida => primerSegmento != null ? extraerHoraIso(primerSegmento!.departureAt) : (_flatDepTime ?? '08:00');
  String get horaLlegada => ultimoSegmento != null ? extraerHoraIso(ultimoSegmento!.arrivalAt) : (_flatArrTime ?? '09:00');
  double get precio => totalPrice;
  String get estado => primerSegmento?.status ?? _flatStatus ?? 'SCHEDULED';
  String? get puertaEmbarque => primerSegmento?.terminalSalida ?? _flatGate ?? 'T1';
  String get fecha => fechaSalida;
  int get escalas => itineraries.isNotEmpty ? itineraries.first.stopsCount : 0;
  int get duracionMinutos => itineraries.isNotEmpty ? itineraries.first.totalDurationMinutes : 50;
  int get availableSeats {
    if (itineraries.isNotEmpty && itineraries.first.pricingOptions.isNotEmpty) {
      return itineraries.first.pricingOptions.first.availableSeats;
    }
    return 9;
  }

  Vuelo({
    required this.offerId,
    this.airlineCode = 'EQ',
    required this.airlineName,
    this.providerCode,
    this.providerName,
    this.itineraries = const [],
    required this.totalPrice,
    this.currency = 'USD',
    this.recargoPct = 0.0,
    String? flatNumber,
    String? flatOrigin,
    String? flatDest,
    String? flatDate,
    String? flatDepTime,
    String? flatArrTime,
    String? flatStatus,
    String? flatGate,
  })  : _flatNumber = flatNumber,
        _flatOrigin = flatOrigin,
        _flatDest = flatDest,
        _flatDate = flatDate,
        _flatDepTime = flatDepTime,
        _flatArrTime = flatArrTime,
        _flatStatus = flatStatus,
        _flatGate = flatGate;

  factory Vuelo.fromJson(Map<String, dynamic> json, {double recargoPct = 0.0}) {
    // 1. Formato enriquecido FlightOffer (POST /vuelos/search)
    if (json['itineraries'] is List) {
      final airlineMap = json['airline'] is Map ? Map<String, dynamic>.from(json['airline']) : <String, dynamic>{};
      final provMap = json['provider'] is Map ? Map<String, dynamic>.from(json['provider']) : <String, dynamic>{};
      final grand = json['grandTotal'] is Map ? Map<String, dynamic>.from(json['grandTotal']) : <String, dynamic>{};

      final itins = (json['itineraries'] as List)
          .whereType<Map>()
          .map((it) => VueloItinerary.fromJson(Map<String, dynamic>.from(it), recargoPct: recargoPct))
          .toList();

      final rawTotal = _vueloParseDouble(grand['total'] ?? json['precio'] ?? json['price'], 89.0);
      final finalTotal = conRecargoBooking(rawTotal, recargoPct);

      return Vuelo(
        offerId: json['offerId']?.toString() ?? json['id']?.toString() ?? '',
        airlineCode: airlineMap['code']?.toString() ?? 'EQ',
        airlineName: airlineMap['name']?.toString() ?? provMap['name']?.toString() ?? 'Aerolínea Aliada',
        providerCode: provMap['nodeCode']?.toString(),
        providerName: provMap['name']?.toString(),
        itineraries: itins,
        totalPrice: finalTotal,
        currency: grand['currency']?.toString() ?? 'USD',
        recargoPct: recargoPct,
      );
    }

    // 2. Formato plano de respaldo
    return Vuelo(
      offerId: json['id']?.toString() ?? json['offerId']?.toString() ?? '',
      airlineName: json['aerolinea']?.toString() ?? json['airline']?.toString() ?? 'Aerolíneas Aliadas',
      totalPrice: _vueloParseDouble(json['precio'] ?? json['price'], 89.0),
      flatNumber: json['numero_vuelo']?.toString() ?? json['flight_number']?.toString() ?? 'EQ-100',
      flatOrigin: json['origen']?.toString() ?? json['origin']?.toString() ?? 'UIO',
      flatDest: json['destino']?.toString() ?? json['destination']?.toString() ?? 'GYE',
      flatDate: json['fecha_salida']?.toString() ?? json['date']?.toString() ?? '2026-12-05',
      flatDepTime: json['hora_salida']?.toString() ?? json['departure_time']?.toString() ?? '08:00',
      flatArrTime: json['hora_llegada']?.toString() ?? json['arrival_time']?.toString() ?? '09:00',
      flatStatus: json['estado']?.toString() ?? json['status']?.toString() ?? 'SCHEDULED',
      flatGate: json['puerta_embarque']?.toString() ?? json['gate']?.toString() ?? 'T1',
    );
  }
}

class VueloSource {
  final String codigoNodo;
  final String nombre;
  final bool ok;
  final int ofertas;
  final int? ms;
  final String? error;

  VueloSource({
    required this.codigoNodo,
    required this.nombre,
    required this.ok,
    this.ofertas = 0,
    this.ms,
    this.error,
  });

  factory VueloSource.fromJson(Map<String, dynamic> json) {
    return VueloSource(
      codigoNodo: json['codigoNodo']?.toString() ?? '',
      nombre: json['nombre']?.toString() ?? 'Aerolínea',
      ok: json['ok'] == true,
      ofertas: _vueloParseInt(json['ofertas'], 0),
      ms: json['ms'] != null ? _vueloParseInt(json['ms']) : null,
      error: json['error']?.toString(),
    );
  }
}

class VueloSearchResult {
  final int totalOffers;
  final List<Vuelo> offers;
  final List<VueloSource> sources;
  final double bookingFeePct;

  VueloSearchResult({
    required this.totalOffers,
    required this.offers,
    required this.sources,
    this.bookingFeePct = 0.0,
  });
}
