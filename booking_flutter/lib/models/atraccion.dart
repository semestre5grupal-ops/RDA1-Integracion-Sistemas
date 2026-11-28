import '../utils/json_parse.dart';

double _atrParseDouble(dynamic val, [double fallback = 0.0]) => parseDouble(val, fallback);

int _atrParseInt(dynamic val, [int fallback = 0]) => parseInt(val, fallback);

class TimeSlot {
  final String slotId;
  final String horaInicio;
  final String horaFin;
  final int cuposDisponibles;
  final int capacidadTotal;
  final String estado;

  TimeSlot({
    required this.slotId,
    required this.horaInicio,
    this.horaFin = '',
    required this.cuposDisponibles,
    this.capacidadTotal = 20,
    required this.estado,
  });

  bool get estaAgotado => estado.toUpperCase() == 'AGOTADO' || cuposDisponibles <= 0;

  factory TimeSlot.fromJson(Map<String, dynamic> json) {
    final cupos = _atrParseInt(
      json['cupos_disponibles'] ??
          json['cupos'] ??
          json['available_spots'] ??
          json['available_slots'] ??
          json['disponibles'] ??
          json['cupo'] ??
          json['capacity'] ??
          json['capacidad'] ??
          json['aforo'],
      0,
    );
    final rawTotal = _atrParseInt(
      json['capacidad_total'] ??
          json['cupos_totales'] ??
          json['total_slots'] ??
          json['total_spots'] ??
          json['capacidad'] ??
          json['aforo'] ??
          json['capacity'],
      cupos,
    );
    final rawEstado = json['estado']?.toString() ?? json['status']?.toString();
    final estadoCalc = rawEstado != null && rawEstado.isNotEmpty
        ? rawEstado.toUpperCase()
        : (cupos <= 0 ? 'AGOTADO' : (cupos <= 5 ? 'ULTIMOS_CUPOS' : 'DISPONIBLE'));

    return TimeSlot(
      slotId: json['slot_id']?.toString() ?? json['id']?.toString() ?? 'slot-default',
      horaInicio: json['time']?.toString() ??
          json['hora_inicio']?.toString() ??
          json['horaInicio']?.toString() ??
          json['hora']?.toString() ??
          '09:00 a.m.',
      horaFin: json['hora_fin']?.toString() ?? '',
      cuposDisponibles: cupos,
      capacidadTotal: rawTotal > 0 ? rawTotal : (cupos > 0 ? cupos : 5),
      estado: estadoCalc,
    );
  }
}

class Atraccion {
  final String id;
  final String nombre;
  final String descripcion;
  final String longDescription;
  final String ciudad;
  final double precioAdulto;
  final double? precioNino;
  final double? precioSenior;
  final double precioInfante;
  final bool admiteNinos;
  final bool admiteSeniors;
  final bool admiteInfantes;
  final String duracion;
  final bool freeCancellation;
  final List<String> includes;
  final List<String> idiomas;
  final String? imagenUrl;
  final List<String> fotosUrls;
  final String proveedor;
  final String? proveedorCodigo;
  final double rating;
  final int reviewsCount;
  final List<String> categorias;
  final List<TimeSlot> turnos;
  final String? puntoEncuentro;

  double get precio => precioAdulto;
  bool get soloPersonas => !admiteNinos && !admiteSeniors && !admiteInfantes;

  Atraccion({
    required this.id,
    required this.nombre,
    required this.descripcion,
    required this.longDescription,
    required this.ciudad,
    required this.precioAdulto,
    this.precioNino,
    this.precioSenior,
    this.precioInfante = 0.0,
    this.admiteNinos = false,
    this.admiteSeniors = false,
    this.admiteInfantes = false,
    this.duracion = '2 horas - 3 horas',
    this.freeCancellation = true,
    this.includes = const [],
    this.idiomas = const ['Español', 'Inglés'],
    this.imagenUrl,
    this.fotosUrls = const [],
    required this.proveedor,
    this.proveedorCodigo,
    this.rating = 9.2,
    this.reviewsCount = 120,
    this.categorias = const [],
    this.turnos = const [],
    this.puntoEncuentro,
  });

  static const _fallbackEcuadorImages = [
    'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1598971861713-54ad16a7e72e?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&auto=format&fit=crop',
  ];

  static String _resolveCuratedImage(String text, int seed) {
    final t = text.toLowerCase();
    if (t.contains('mitad del mundo') || t.contains('equinoccial')) {
      return 'https://images.unsplash.com/photo-1598971861713-54ad16a7e72e?w=800&auto=format&fit=crop';
    }
    if (t.contains('galápagos') || t.contains('galapagos') || t.contains('santa cruz') || t.contains('isabela')) {
      return 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&auto=format&fit=crop';
    }
    if (t.contains('baños') || t.contains('banos') || t.contains('pailón') || t.contains('cascada')) {
      return 'https://images.unsplash.com/photo-1544644181-1484b3fdfc62?w=800&auto=format&fit=crop';
    }
    if (t.contains('cotopaxi') || t.contains('quilotoa') || t.contains('volcán')) {
      return 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop';
    }
    if (t.contains('cuenca') || t.contains('cajas')) {
      return 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800&auto=format&fit=crop';
    }
    if (t.contains('guayaquil') || t.contains('peñas') || t.contains('puerto lópez') || t.contains('machalilla')) {
      return 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&auto=format&fit=crop';
    }
    if (t.contains('mindo') || t.contains('bosque')) {
      return 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&auto=format&fit=crop';
    }
    return _fallbackEcuadorImages[seed.abs() % _fallbackEcuadorImages.length];
  }

  factory Atraccion.fromJson(Map<String, dynamic> json) {
    final rawSlots = json['time_slots'] ?? json['turnos'] ?? json['horarios'];
    final slots = rawSlots is List
        ? rawSlots.whereType<Map>().map((s) => TimeSlot.fromJson(Map<String, dynamic>.from(s))).toList()
        : <TimeSlot>[];

    // Mapas de precios (pueden venir en `json['precio']` o `json['price']`)
    final pMap = json['precio'] is Map
        ? Map<String, dynamic>.from(json['precio'])
        : (json['price'] is Map ? Map<String, dynamic>.from(json['price']) : <String, dynamic>{});

    double adulto = _atrParseDouble(
      json['precio_unitario_adulto'] ?? json['precio_unitario'] ?? json['precioTicket'] ?? json['adult_price'],
      0,
    );
    if (adulto <= 0) {
      adulto = _atrParseDouble(pMap['total'] ?? pMap['adult'] ?? pMap['adulto'] ?? pMap['adult_price'] ?? pMap['amount'] ?? json['precio'] ?? json['price'], 55.0);
    }
    if (adulto <= 0) adulto = 15.0;

    final rawChild = pMap['child'] ?? pMap['nino'];
    final childVal = rawChild != null ? _atrParseDouble(rawChild, -1) : -1.0;

    final rawSenior = pMap['senior'];
    final seniorVal = rawSenior != null ? _atrParseDouble(rawSenior, -1) : -1.0;

    final rawInfant = pMap['infant'] ?? pMap['infante'];
    final infantVal = rawInfant != null ? _atrParseDouble(rawInfant, -1) : -1.0;

    final provCode = json['proveedor_codigo']?.toString() ??
        json['proveedorCodigo']?.toString() ??
        (json['proveedor'] is Map ? json['proveedor']['codigo']?.toString() ?? json['proveedor']['id']?.toString() : null);

    final isSingleRateProvider = provCode == 'NODE_ATR_ARIEL' || provCode == 'NODE_ATR_GLORIA' || provCode == 'NODE_ATR_ALISSON';

    final admiteNinosFlag = json['admite_ninos'] != null
        ? parseBool(json['admite_ninos'])
        : (!isSingleRateProvider && childVal > 0 && childVal != adulto);

    final admiteSeniorsFlag = json['admite_seniors'] != null
        ? parseBool(json['admite_seniors'])
        : (!isSingleRateProvider && seniorVal > 0);

    final admiteInfantesFlag = json['admite_infantes'] != null
        ? parseBool(json['admite_infantes'])
        : (infantVal > 0);

    // Fotos
    final fotos = <String>[];
    if (json['photos'] is List) {
      for (final p in json['photos'] as List) {
        final u = p is Map ? p['url']?.toString() : p?.toString();
        if (u != null && u.startsWith('http') && !u.contains('example.com')) fotos.add(u);
      }
    }
    if (json['fotos_urls'] is List) {
      for (final p in json['fotos_urls'] as List) {
        final u = p?.toString();
        if (u != null && u.startsWith('http') && !u.contains('example.com')) fotos.add(u);
      }
    }
    final singleImg = json['foto_url']?.toString() ?? json['photoUrl']?.toString() ?? json['imagen_url']?.toString() ?? json['imagen']?.toString();
    if (singleImg != null && singleImg.startsWith('http') && !singleImg.contains('example.com') && !fotos.contains(singleImg)) {
      fotos.insert(0, singleImg);
    }

    final nom = json['nombre']?.toString() ?? json['name']?.toString() ?? json['title']?.toString() ?? 'Atracción Turística';
    final ciu = json['ciudad']?.toString() ?? json['city']?.toString() ?? json['ubicacion']?.toString() ?? 'Quito';
    final descCorta = json['descripcion_corta']?.toString() ?? json['short_description']?.toString() ?? json['descripcion']?.toString() ?? '';
    final descLarga = json['long_description']?.toString() ?? json['descripcion_larga']?.toString() ?? (descCorta.isNotEmpty ? descCorta : 'Descubre esta increíble experiencia turística en Ecuador.');

    if (fotos.isEmpty) {
      fotos.add(_resolveCuratedImage('$nom $ciu $descCorta', nom.hashCode));
    }

    String prov = 'Socio Operador Certificado';
    if (json['proveedor'] is Map && json['proveedor']['nombre_comercial'] != null) {
      prov = json['proveedor']['nombre_comercial'].toString();
    } else if (json['proveedor'] is Map && json['proveedor']['nombre'] != null) {
      prov = json['proveedor']['nombre'].toString();
    } else if (provCode != null && provCode.isNotEmpty) {
      prov = provCode;
    } else if (json['proveedor'] is String) {
      prov = json['proveedor'].toString();
    }

    final rawIncludes = json['includes'] ?? json['inclusiones'];
    final includesList = stringList(rawIncludes);

    final rawLangs = json['supported_languages'] ?? json['idiomas'];
    final parsedLangs = stringList(rawLangs);
    final langsList = parsedLangs.isNotEmpty ? parsedLangs : <String>['Español', 'Inglés'];

    final ratingsMap = json['ratings'] is Map
        ? Map<String, dynamic>.from(json['ratings'])
        : (json['rating'] is Map ? Map<String, dynamic>.from(json['rating']) : <String, dynamic>{});

    final score = _atrParseDouble(ratingsMap['score'] ?? ratingsMap['rating'] ?? json['rating_general'] ?? json['rating'], 9.0);
    final revs = _atrParseInt(ratingsMap['number_of_reviews'] ?? json['reviews_count'], 120);

    String? punto;
    if (json['locations'] is List && (json['locations'] as List).isNotEmpty) {
      final firstLoc = (json['locations'] as List).first;
      if (firstLoc is Map) punto = firstLoc['address']?.toString();
    }

    return Atraccion(
      id: json['id']?.toString() ??
          json['_id']?.toString() ??
          json['atraccion_id']?.toString() ??
          json['atraccionId']?.toString() ??
          json['idAtraccion']?.toString() ??
          json['id_atraccion']?.toString() ??
          '',
      nombre: nom,
      descripcion: descCorta.isNotEmpty ? descCorta : descLarga,
      longDescription: descLarga,
      ciudad: ciu,
      precioAdulto: adulto,
      precioNino: childVal > 0 ? childVal : (admiteNinosFlag ? double.parse((adulto * 0.5).toStringAsFixed(2)) : null),
      precioSenior: seniorVal > 0 ? seniorVal : (admiteSeniorsFlag ? double.parse((adulto * 0.7).toStringAsFixed(2)) : null),
      precioInfante: infantVal >= 0 ? infantVal : 0.0,
      admiteNinos: admiteNinosFlag,
      admiteSeniors: admiteSeniorsFlag,
      admiteInfantes: admiteInfantesFlag,
      duracion: json['duration']?.toString() ?? json['duracion']?.toString() ?? json['duracion_estimada']?.toString() ?? '2 horas - 3 horas',
      freeCancellation: parseBool(json['free_cancellation'] ?? json['cancelacion_gratis'], true),
      includes: includesList,
      idiomas: langsList,
      imagenUrl: fotos.first,
      fotosUrls: fotos,
      proveedor: prov,
      proveedorCodigo: provCode,
      rating: score > 0 ? score : 9.0,
      reviewsCount: revs,
      categorias: stringList(json['categorias']),
      turnos: slots,
      puntoEncuentro: punto,
    );
  }
}
