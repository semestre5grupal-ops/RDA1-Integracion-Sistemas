double _autoParseDouble(dynamic val, [double fallback = 0.0]) {
  if (val is num) return val.toDouble();
  if (val is String) return double.tryParse(val) ?? fallback;
  if (val is Map && val['total'] != null) return _autoParseDouble(val['total'], fallback);
  return fallback;
}

int _autoParseInt(dynamic val, [int fallback = 0]) {
  if (val is num) return val.toInt();
  if (val is String) return int.tryParse(val) ?? fallback;
  return fallback;
}

class AutoFechaOcupada {
  final String pickup;
  final String dropoff;

  AutoFechaOcupada({required this.pickup, required this.dropoff});

  factory AutoFechaOcupada.fromJson(Map<String, dynamic> json) {
    return AutoFechaOcupada(
      pickup: (json['pickup'] ?? json['fecha_inicio'] ?? '').toString(),
      dropoff: (json['dropoff'] ?? json['fecha_fin'] ?? '').toString(),
    );
  }
}

class Auto {
  final String id;
  final String modelo;
  final String marca;
  final String categoria;
  final double precioPorDia;
  final double? precioBase;
  final double? ivaMonto;
  final double recargoConductorJoven;
  final String transmision;
  final int capacidadPasajeros;
  final int puertas;
  final int maletasGrandes;
  final int maletasPequenas;
  final bool aireAcondicionado;
  final bool kilometrajeIlimitado;
  final String politicaCombustible;
  final bool cancelacionGratuita;
  final String? imagenUrl;
  final List<String> images;
  final int supplierId;
  final String proveedor;
  final double proveedorRating;
  final String proveedorUbicacion;
  final String estado;
  final int cooldownSegundosRestantes;
  final int? unidadesDisponibles;
  final List<AutoFechaOcupada> fechasOcupadas;
  final int? kilometrajeActual;
  final int? proximoMantenimientoKm;
  final bool mantenimientoRequerido;

  Auto({
    required this.id,
    required this.modelo,
    required this.marca,
    required this.categoria,
    required this.precioPorDia,
    this.precioBase,
    this.ivaMonto,
    this.recargoConductorJoven = 0.0,
    required this.transmision,
    required this.capacidadPasajeros,
    this.puertas = 4,
    this.maletasGrandes = 2,
    this.maletasPequenas = 1,
    this.aireAcondicionado = true,
    this.kilometrajeIlimitado = true,
    this.politicaCombustible = 'Lleno a lleno',
    this.cancelacionGratuita = true,
    this.imagenUrl,
    this.images = const [],
    this.supplierId = 1,
    required this.proveedor,
    this.proveedorRating = 8.6,
    this.proveedorUbicacion = 'Aeropuerto Internacional (Terminal de Llegadas)',
    this.estado = 'DISPONIBLE',
    this.cooldownSegundosRestantes = 0,
    this.unidadesDisponibles,
    this.fechasOcupadas = const [],
    this.kilometrajeActual,
    this.proximoMantenimientoKm,
    this.mantenimientoRequerido = false,
  });

  String get carDisplayName {
    final m = modelo.trim();
    final b = marca.trim();
    if (b.toLowerCase() == m.toLowerCase() || m.toLowerCase().contains(b.toLowerCase())) {
      return m;
    }
    return '$b $m'.trim();
  }

  bool get enCooldown =>
      cooldownSegundosRestantes > 0 ||
      estado.toUpperCase() == 'EN_LIMPIEZA' ||
      estado.toUpperCase() == 'COOLDOWN' ||
      estado.toUpperCase() == 'MANTENIMIENTO';

  bool get noDisponibleTotal =>
      unidadesDisponibles == 0 ||
      (estado.toUpperCase() == 'RESERVADO' && (unidadesDisponibles == null || unidadesDisponibles! <= 0));

  bool matchesCompany(String targetCompany) {
    final compName = proveedor.toLowerCase();
    final target = targetCompany.toLowerCase();
    if (target == 'keddy by europcar' || target == 'keddy') {
      return compName.contains('keddy');
    }
    if (target == 'europcar') {
      return compName.contains('europcar') && !compName.contains('keddy');
    }
    return compName.contains(target);
  }

  bool matchesVehicleCategory(String targetCategory) {
    final combined = '${categoria.toUpperCase()} ${modelo.toUpperCase()}';
    if (targetCategory == 'Coche pequeño') {
      return combined.contains('PEQUEÑ') ||
          combined.contains('PEQUEN') ||
          combined.contains('ECONOM') ||
          combined.contains('MINI') ||
          combined.contains('SMALL') ||
          combined.contains('HATCHBACK');
    }
    if (targetCategory == 'Coche mediano') {
      return combined.contains('MEDIAN') ||
          combined.contains('COMPACT') ||
          combined.contains('INTERMED') ||
          combined.contains('STANDARD') ||
          (combined.contains('SEDAN') && !combined.contains('PREMIUM') && !combined.contains('GRAND'));
    }
    if (targetCategory == 'Coche grande') {
      return combined.contains('GRAND') ||
          combined.contains('LARGE') ||
          combined.contains('PREMIUM') ||
          combined.contains('LUJO') ||
          combined.contains('LUXURY') ||
          combined.contains('FULLSIZE') ||
          combined.contains('VAN') ||
          combined.contains('MINIVAN') ||
          combined.contains('CAMIONETA') ||
          combined.contains('PICKUP');
    }
    if (targetCategory == 'SUV') {
      return combined.contains('SUV') ||
          combined.contains('4X4') ||
          combined.contains('CROSSOVER') ||
          combined.contains('TODOTERRENO');
    }
    return combined.contains(targetCategory.toUpperCase());
  }

  factory Auto.fromJson(Map<String, dynamic> json) {
    final supId = _autoParseInt(json['proveedor_id'] ?? json['supplier_id'], 1);

    String prov = '';
    double pRating = 8.4;
    String pUbicacion = 'En el aeropuerto (Terminal Llegadas)';

    if (json['proveedor'] is Map) {
      final pMap = Map<String, dynamic>.from(json['proveedor']);
      if (pMap['nombre'] != null) prov = pMap['nombre'].toString();
      if (pMap['name'] != null && prov.isEmpty) prov = pMap['name'].toString();
      if (pMap['rating'] != null) pRating = _autoParseDouble(pMap['rating'], 8.4);
      if (pMap['ubicacion'] != null) pUbicacion = pMap['ubicacion'].toString();
    } else if (json['proveedor_nombre'] != null) {
      prov = json['proveedor_nombre'].toString();
    } else if (json['supplier_name'] != null) {
      prov = json['supplier_name'].toString();
    } else if (json['proveedor_codigo'] != null) {
      prov = json['proveedor_codigo'].toString();
    } else if (json['proveedor'] is String) {
      prov = json['proveedor'].toString();
    }

    if (prov.isEmpty) {
      if (supId == 2) {
        prov = 'Alamo';
        pRating = 8.6;
      } else if (supId == 3) {
        prov = 'Enterprise';
        pRating = 9.1;
      } else {
        prov = 'Europcar';
        pRating = 8.4;
      }
    }

    final price = _autoParseDouble(
      json['precio_diario'] ?? json['daily_price'] ?? json['price'] ?? json['precio_por_dia'] ?? json['precio'],
      35.50,
    );

    final imgs = <String>[];
    if (json['images'] is List) {
      for (final i in json['images'] as List) {
        if (i != null && i.toString().startsWith('http')) imgs.add(i.toString());
      }
    }
    final singleImg = json['foto_url']?.toString() ?? json['imagen_url']?.toString();
    if (singleImg != null && singleImg.startsWith('http') && !imgs.contains(singleImg)) {
      imgs.insert(0, singleImg);
    }
    if (imgs.isEmpty) {
      imgs.add('https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=600&q=80');
    }

    final rawOcupadas = json['fechas_ocupadas'] ?? json['occupied_dates'];
    final ocupadas = rawOcupadas is List
        ? rawOcupadas.whereType<Map>().map((f) => AutoFechaOcupada.fromJson(Map<String, dynamic>.from(f))).toList()
        : <AutoFechaOcupada>[];

    final idStr = json['vehicle_id']?.toString() ?? json['id']?.toString() ?? 'auto-01';
    final makeStr = json['marca']?.toString() ?? json['make']?.toString() ?? json['brand']?.toString() ?? 'Chevrolet';
    final modelStr = json['modelo']?.toString() ?? json['model']?.toString() ?? json['name']?.toString() ?? 'Spark GT';

    return Auto(
      id: idStr,
      modelo: modelStr,
      marca: makeStr,
      categoria: json['categoria']?.toString() ?? json['category']?.toString() ?? 'ECONOMICO',
      precioPorDia: price > 0 ? price : 35.50,
      precioBase: json['precio_base'] != null ? _autoParseDouble(json['precio_base']) : null,
      ivaMonto: json['iva_monto'] != null ? _autoParseDouble(json['iva_monto']) : null,
      recargoConductorJoven: _autoParseDouble(json['recargo_conductor_joven'], 0.0),
      transmision: json['transmision']?.toString() ?? json['transmission']?.toString() ?? 'Manual',
      capacidadPasajeros: _autoParseInt(
        json['asientos'] ?? json['seats'] ?? json['plazas'] ?? json['capacidad_pasajeros'] ?? json['capacidad'],
        5,
      ),
      puertas: _autoParseInt(json['puertas'] ?? json['doors'], 4),
      maletasGrandes: _autoParseInt(json['maletas_grandes'] ?? json['bag_capacity'] ?? json['maletas'], 1),
      maletasPequenas: _autoParseInt(json['maletas_pequenas'], 1),
      aireAcondicionado: json['aire_acondicionado'] ?? true,
      kilometrajeIlimitado: json['kilometraje_ilimitado'] ?? true,
      politicaCombustible: json['politica_combustible']?.toString() ?? 'Lleno a lleno',
      cancelacionGratuita: json['cancelacion_gratuita'] ?? true,
      imagenUrl: imgs.first,
      images: imgs,
      supplierId: supId,
      proveedor: prov,
      proveedorRating: pRating,
      proveedorUbicacion: pUbicacion,
      estado: json['estado']?.toString() ?? json['estado_operativo']?.toString() ?? json['status']?.toString() ?? 'DISPONIBLE',
      cooldownSegundosRestantes: _autoParseInt(json['segundos_restantes_cooldown'] ?? json['cooldown'], 0),
      unidadesDisponibles: json['unidades_disponibles'] != null ? _autoParseInt(json['unidades_disponibles']) : null,
      fechasOcupadas: ocupadas,
      kilometrajeActual: json['kilometraje_actual'] != null ? _autoParseInt(json['kilometraje_actual']) : null,
      proximoMantenimientoKm: json['proximo_mantenimiento_km'] != null ? _autoParseInt(json['proximo_mantenimiento_km']) : null,
      mantenimientoRequerido: json['mantenimiento_requerido'] == true,
    );
  }
}

class AutosSearchMetadata {
  final bool surchargeApplied;
  final double surchargeAmount;

  AutosSearchMetadata({
    this.surchargeApplied = false,
    this.surchargeAmount = 15.0,
  });

  factory AutosSearchMetadata.fromJson(Map<String, dynamic>? json) {
    if (json == null) return AutosSearchMetadata();
    return AutosSearchMetadata(
      surchargeApplied: json['surcharge_applied'] == true,
      surchargeAmount: _autoParseDouble(json['surcharge_amount'], 15.0),
    );
  }
}

class AutosSearchResponse {
  final List<Auto> autos;
  final AutosSearchMetadata metadata;

  AutosSearchResponse({required this.autos, required this.metadata});
}
