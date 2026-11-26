String formatearRegimenPlan(String? plan) {
  if (plan == null || plan.trim().isEmpty) return 'Solo habitación';
  final raw = plan.trim();
  const map = {
    'SOLO_HABITACION': 'Solo habitación',
    'SOLO_ALOJAMIENTO': 'Solo alojamiento',
    'ROOM_ONLY': 'Solo habitación',
    'DESAYUNO': 'Desayuno incluido',
    'DESAYUNO_INCLUIDO': 'Desayuno incluido',
    'BED_AND_BREAKFAST': 'Desayuno incluido',
    'MEDIA_PENSION': 'Media pensión',
    'HALF_BOARD': 'Media pensión',
    'PENSION_COMPLETA': 'Pensión completa',
    'FULL_BOARD': 'Pensión completa',
    'TODO_INCLUIDO': 'Todo incluido',
    'ALL_INCLUSIVE': 'Todo incluido',
  };
  final upper = raw.toUpperCase();
  if (map.containsKey(raw)) return map[raw]!;
  if (map.containsKey(upper)) return map[upper]!;
  if (RegExp(r'^[A-Z0-9_]+$').hasMatch(raw)) {
    final spaced = raw.replaceAll('_', ' ').toLowerCase();
    return spaced.isNotEmpty ? '${spaced[0].toUpperCase()}${spaced.substring(1)}' : raw;
  }
  return raw;
}

double _parseDouble(dynamic val, [double fallback = 0.0]) {
  if (val is num) return val.toDouble();
  if (val is String) return double.tryParse(val) ?? fallback;
  if (val is Map && val['total'] != null) return _parseDouble(val['total'], fallback);
  return fallback;
}

int _parseInt(dynamic val, [int fallback = 0]) {
  if (val is num) return val.toInt();
  if (val is String) return int.tryParse(val) ?? fallback;
  return fallback;
}

class TipoHabitacion {
  final String productId;
  final String? codigo;
  final String nombre;
  final String? descripcion;
  final String mealPlan;
  final String cancellationText;
  final bool reembolsable;
  final double price; // Precio total de estancia (1 habitación)
  final double pricePerNight;
  final String currency;
  final int availableRooms;
  final int capacidadAdultos;
  final int capacidadNinos;
  final int camas;
  final String? descripcionCamas;
  final double? tamanoM2;
  final List<String> amenidades;

  String get id => productId;
  double get precioPorNoche => pricePerNight;
  int get capacidadHuespedes => capacidadAdultos + capacidadNinos;

  TipoHabitacion({
    required this.productId,
    this.codigo,
    required this.nombre,
    this.descripcion,
    this.mealPlan = 'Solo habitación',
    this.cancellationText = 'Cancelación gratuita hasta 48 horas antes',
    this.reembolsable = true,
    required this.price,
    required this.pricePerNight,
    this.currency = 'USD',
    required this.availableRooms,
    required this.capacidadAdultos,
    this.capacidadNinos = 0,
    this.camas = 1,
    this.descripcionCamas,
    this.tamanoM2,
    this.amenidades = const [],
  });

  factory TipoHabitacion.fromJson(Map<String, dynamic> json) {
    final capMap = json['capacidad'] is Map ? Map<String, dynamic>.from(json['capacidad']) : <String, dynamic>{};
    final adultos = _parseInt(
      capMap['adultos'] ?? capMap['adults'] ?? json['capacidad_adultos'] ?? json['capacidadAdultos'] ?? json['capacidad'],
      2,
    );
    final ninos = _parseInt(
      capMap['ninos'] ?? capMap['children'] ?? json['capacidad_ninos'] ?? json['capacidadNinos'],
      0,
    );
    final priceNight = _parseDouble(
      json['price_per_night'] ?? json['precio_por_noche'] ?? json['precio'],
      60.0,
    );
    final totalStay = _parseDouble(json['price'], priceNight);
    final rawAms = json['amenidades'];
    final ams = rawAms is List ? rawAms.map((e) => e.toString()).toList() : <String>[];

    return TipoHabitacion(
      productId: json['product_id']?.toString() ?? json['tipo_habitacion_id']?.toString() ?? json['id']?.toString() ?? 'STD',
      codigo: json['codigo']?.toString(),
      nombre: json['room_name']?.toString() ?? json['nombre']?.toString() ?? json['name']?.toString() ?? 'Habitación Estándar',
      descripcion: json['descripcion']?.toString(),
      mealPlan: formatearRegimenPlan(json['meal_plan']?.toString() ?? json['regimen']?.toString()),
      cancellationText: json['cancelacion_texto']?.toString() ?? json['cancellation_type']?.toString() ?? 'Cancelación gratuita hasta 48 horas antes',
      reembolsable: json['reembolsable'] ?? true,
      price: totalStay,
      pricePerNight: priceNight > 0 ? priceNight : totalStay,
      currency: json['currency']?.toString() ?? 'USD',
      availableRooms: _parseInt(json['available_rooms'] ?? json['unidades_disponibles'] ?? json['stock'], 3),
      capacidadAdultos: adultos > 0 ? adultos : 2,
      capacidadNinos: ninos >= 0 ? ninos : 0,
      camas: _parseInt(json['camas'], 1),
      descripcionCamas: json['descripcion_camas']?.toString(),
      tamanoM2: json['tamano_m2'] != null ? _parseDouble(json['tamano_m2']) : null,
      amenidades: ams,
    );
  }
}

class AlojamientoAvailabilityResult {
  final int nights;
  final int availableRooms;
  final String currency;
  final List<TipoHabitacion> products;

  AlojamientoAvailabilityResult({
    required this.nights,
    required this.availableRooms,
    this.currency = 'USD',
    required this.products,
  });

  factory AlojamientoAvailabilityResult.fromJson(Map<String, dynamic> json) {
    final data = json['data'] is Map ? Map<String, dynamic>.from(json['data']) : json;
    final rawProducts = data['products'];
    final products = rawProducts is List
        ? rawProducts
            .whereType<Map>()
            .map((p) => TipoHabitacion.fromJson(Map<String, dynamic>.from(p)))
            .toList()
        : <TipoHabitacion>[];

    return AlojamientoAvailabilityResult(
      nights: _parseInt(data['nights'], 1),
      availableRooms: _parseInt(data['available_rooms'], products.isNotEmpty ? products.first.availableRooms : 0),
      currency: data['currency']?.toString() ?? 'USD',
      products: products,
    );
  }
}

class Alojamiento {
  final String id;
  final String nombre;
  final String descripcion;
  final String ciudad;
  final double precioPorNoche;
  final double? precioTotalCotizado;
  final int? nochesCotizadas;
  final int? habitacionesDisponibles;
  final String? imagenUrl;
  final List<String> fotosUrls;
  final double rating;
  final int reviewsCount;
  final int estrellas;
  final String tipoPropiedad;
  final String? tipoAlojamiento;
  final int capacidadAdultos;
  final int capacidadNinos;
  final int numHabitaciones;
  final int numCamas;
  final String? descripcionCamas;
  final int banos;
  final bool tienePiscina;
  final bool tieneParqueadero;
  final bool cancelacionGratis;
  final bool pagoEnAlojamiento;
  final String regimen;
  final String checkinDesde;
  final String? checkinHasta;
  final String checkoutHasta;
  final double? distanciaCentroKm;
  final String? direccion;
  final List<String> amenidades;
  final List<TipoHabitacion> habitaciones;

  Alojamiento({
    required this.id,
    required this.nombre,
    required this.descripcion,
    required this.ciudad,
    required this.precioPorNoche,
    this.precioTotalCotizado,
    this.nochesCotizadas,
    this.habitacionesDisponibles,
    this.imagenUrl,
    this.fotosUrls = const [],
    this.rating = 8.7,
    this.reviewsCount = 0,
    this.estrellas = 4,
    this.tipoPropiedad = 'Hotel',
    this.tipoAlojamiento,
    this.capacidadAdultos = 2,
    this.capacidadNinos = 1,
    this.numHabitaciones = 1,
    this.numCamas = 1,
    this.descripcionCamas,
    this.banos = 1,
    this.tienePiscina = false,
    this.tieneParqueadero = false,
    this.cancelacionGratis = true,
    this.pagoEnAlojamiento = true,
    this.regimen = 'Solo habitación',
    this.checkinDesde = '14:00',
    this.checkinHasta,
    this.checkoutHasta = '11:00',
    this.distanciaCentroKm,
    this.direccion,
    this.amenidades = const [],
    this.habitaciones = const [],
  });

  factory Alojamiento.fromJson(Map<String, dynamic> json) {
    final disp = json['disponibilidad'] is Map ? Map<String, dynamic>.from(json['disponibilidad']) : null;
    final ratings = json['ratings'] is Map ? Map<String, dynamic>.from(json['ratings']) : <String, dynamic>{};
    final ubicacion = json['ubicacion'] is Map ? Map<String, dynamic>.from(json['ubicacion']) : <String, dynamic>{};
    final politicas = json['politicas'] is Map ? Map<String, dynamic>.from(json['politicas']) : <String, dynamic>{};

    // Resolver lista de fotos reales (filtrando example.com igual que frontend)
    final fotos = <String>[];
    if (json['photos'] is List) {
      for (final p in json['photos'] as List) {
        final url = p is Map ? p['url']?.toString() : p?.toString();
        if (url != null && url.startsWith('http') && !url.contains('example.com')) {
          fotos.add(url);
        }
      }
    }
    final singleImg = json['foto_url']?.toString() ?? json['imagen_url']?.toString() ?? json['image_url']?.toString();
    if (fotos.isEmpty && singleImg != null && singleImg.startsWith('http') && !singleImg.contains('example.com')) {
      fotos.add(singleImg);
    }
    if (fotos.isEmpty) {
      fotos.add('https://cf.bstatic.com/xdata/images/hotel/max1024x768/833148758.jpg?k=4af6fee87e75cf2bdb688cfa67e30d77b3282140a0ed4ee22ac61e5be30b95dd&o=&hp=1');
    }

    // Parse tipos_habitacion si vinieran incluidos
    final rawRooms = json['tipos_habitacion'] ?? (json['habitaciones'] is List ? json['habitaciones'] : null);
    final roomsList = <TipoHabitacion>[];
    if (rawRooms is List) {
      for (final r in rawRooms) {
        if (r is Map) {
          roomsList.add(TipoHabitacion.fromJson(Map<String, dynamic>.from(r)));
        }
      }
    }

    // Calcular precio por noche y total cotizado igual que AlojamientosSearchPage.jsx (`getPropPrice`)
    final dispNights = disp != null ? _parseInt(disp['nights'], 1) : 1;
    double pricePerNight = 0;
    double? totalCotizado;
    if (disp != null) {
      if (disp['price_per_night'] != null && _parseDouble(disp['price_per_night']) > 0) {
        pricePerNight = _parseDouble(disp['price_per_night']);
      }
      if (disp['total_price'] != null && _parseDouble(disp['total_price']) > 0) {
        totalCotizado = _parseDouble(disp['total_price']);
        if (pricePerNight <= 0 && dispNights > 0) {
          pricePerNight = totalCotizado / dispNights;
        }
      }
    }
    if (pricePerNight <= 0) {
      pricePerNight = _parseDouble(
        json['precioPorNoche'] ?? json['precio_por_noche'] ?? json['precio_noche'] ?? json['precio_minimo'] ?? json['price'],
        55.0,
      );
    }

    final ams = (json['amenidades'] is List)
        ? (json['amenidades'] as List).map((e) => e.toString()).toList()
        : <String>[];

    final scoreRaw = _parseDouble(ratings['score'] ?? json['puntuacion'] ?? json['calificacion'] ?? json['rating'], 0);
    final reviewsRaw = _parseInt(ratings['number_of_reviews'] ?? json['numero_resenas'], 0);

    final numHab = json['habitaciones'] is num ? _parseInt(json['habitaciones'], 1) : 1;
    final capAd = _parseInt(json['capacidadAdultos'] ?? json['capacidad_adultos'], 2);
    final capNi = _parseInt(json['capacidadNinos'] ?? json['capacidad_ninos'], 0);

    final tienePiscinaFlag = json['tienePiscina'] == true ||
        ams.any((a) => a.toLowerCase().contains('piscina') || a.toLowerCase().contains('pool'));
    final tieneParkingFlag = json['tieneParqueadero'] == true ||
        ams.any((a) => a.toLowerCase().contains('parqueadero') || a.toLowerCase().contains('estacionamiento') || a.toLowerCase().contains('parking'));

    final rawRegimen = json['regimen']?.toString() ??
        (ams.any((a) => a.toLowerCase().contains('desayuno')) || json['incluye_desayuno'] == true
            ? 'DESAYUNO_INCLUIDO'
            : 'SOLO_HABITACION');

    return Alojamiento(
      id: json['id']?.toString() ??
          json['_id']?.toString() ??
          json['alojamiento_id']?.toString() ??
          json['alojamientoId']?.toString() ??
          json['idAlojamiento']?.toString() ??
          json['id_alojamiento']?.toString() ??
          json['accommodation_id']?.toString() ??
          json['accommodationId']?.toString() ??
          '',
      nombre: json['nombre']?.toString() ??
          json['name']?.toString() ??
          json['title']?.toString() ??
          'Alojamiento',
      descripcion: json['descripcion']?.toString() ??
          json['descripcion_camas']?.toString() ??
          json['description']?.toString() ??
          'Alojamiento verificado en Ecuador.',
      ciudad: json['destino']?.toString() ??
          ubicacion['city']?.toString() ??
          ubicacion['ciudad']?.toString() ??
          ubicacion['address']?.toString() ??
          json['ciudad']?.toString() ??
          json['city']?.toString() ??
          'Quito',
      precioPorNoche: pricePerNight,
      precioTotalCotizado: totalCotizado,
      nochesCotizadas: disp != null ? dispNights : null,
      habitacionesDisponibles: disp?['available_rooms'] != null
          ? _parseInt(disp!['available_rooms'])
          : (json['habitacionesDisponibles'] != null ? _parseInt(json['habitacionesDisponibles']) : null),
      imagenUrl: fotos.first,
      fotosUrls: fotos,
      rating: scoreRaw > 0 ? scoreRaw : 8.7,
      reviewsCount: reviewsRaw,
      estrellas: _parseInt(json['estrellas'] ?? json['stars'] ?? json['categoria'], 4),
      tipoPropiedad: json['tipo_propiedad']?.toString() ?? json['tipoPropiedad']?.toString() ?? json['tipo']?.toString() ?? 'Hotel',
      tipoAlojamiento: json['tipo_alojamiento']?.toString(),
      capacidadAdultos: capAd > 0 ? capAd : 2,
      capacidadNinos: capNi >= 0 ? capNi : 0,
      numHabitaciones: numHab > 0 ? numHab : 1,
      numCamas: _parseInt(json['camas'], 1),
      descripcionCamas: json['descripcion_camas']?.toString(),
      banos: _parseInt(json['banos'], 1),
      tienePiscina: tienePiscinaFlag,
      tieneParqueadero: tieneParkingFlag,
      cancelacionGratis: json['cancelacionGratis'] != false && json['es_reembolsable'] != false,
      pagoEnAlojamiento: politicas['pago_en_alojamiento'] == true || json['pagoEnAlojamiento'] != false,
      regimen: formatearRegimenPlan(rawRegimen),
      checkinDesde: json['checkin_desde']?.toString() ?? politicas['checkin_desde']?.toString() ?? politicas['check_in']?.toString() ?? '14:00',
      checkinHasta: json['checkin_hasta']?.toString() ?? politicas['checkin_hasta']?.toString(),
      checkoutHasta: json['checkout_hasta']?.toString() ?? politicas['checkout_hasta']?.toString() ?? politicas['check_out']?.toString() ?? '11:00',
      distanciaCentroKm: ubicacion['distance_centre_km'] != null ? _parseDouble(ubicacion['distance_centre_km']) : null,
      direccion: json['direccion']?.toString() ?? ubicacion['address']?.toString(),
      amenidades: ams,
      habitaciones: roomsList,
    );
  }
}
