class Auto {
  final String id;
  final String modelo;
  final String marca;
  final String categoria;
  final double precioPorDia;
  final String transmision;
  final int capacidadPasajeros;
  final int puertas;
  final int maletasGrandes;
  final bool aireAcondicionado;
  final bool kilometrajeIlimitado;
  final String? imagenUrl;
  final String proveedor;
  final double proveedorRating;
  final String proveedorUbicacion;
  final String estado;
  final int cooldownSegundosRestantes;

  Auto({
    required this.id,
    required this.modelo,
    required this.marca,
    required this.categoria,
    required this.precioPorDia,
    required this.transmision,
    required this.capacidadPasajeros,
    this.puertas = 4,
    this.maletasGrandes = 2,
    this.aireAcondicionado = true,
    this.kilometrajeIlimitado = true,
    this.imagenUrl,
    required this.proveedor,
    this.proveedorRating = 8.6,
    this.proveedorUbicacion = 'Aeropuerto Internacional (Terminal de Llegadas)',
    this.estado = 'DISPONIBLE',
    this.cooldownSegundosRestantes = 0,
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
      estado == 'EN_LIMPIEZA' ||
      estado == 'COOLDOWN' ||
      estado == 'MANTENIMIENTO';

  factory Auto.fromJson(Map<String, dynamic> json) {
    // 1. Proveedor y ubicación
    String prov = 'RutaLibre Autos';
    double pRating = 8.6;
    String pUbicacion = 'Aeropuerto Internacional (Terminal de Llegadas)';

    if (json['proveedor'] is Map) {
      final pMap = json['proveedor'] as Map;
      if (pMap['nombre'] != null) prov = pMap['nombre'].toString();
      if (pMap['rating'] != null) {
        final r = pMap['rating'];
        pRating = (r is num) ? r.toDouble() : (double.tryParse(r.toString()) ?? 8.6);
      }
      if (pMap['ubicacion'] != null) pUbicacion = pMap['ubicacion'].toString();
    } else if (json['proveedor_nombre'] != null) {
      prov = json['proveedor_nombre'].toString();
    } else if (json['proveedor_codigo'] != null) {
      prov = json['proveedor_codigo'].toString();
    } else if (json['proveedor'] is String) {
      prov = json['proveedor'].toString();
    }

    // 2. Precio Diario Resiliente
    double price = 35.50;
    final rawPrice = json['precio_diario'] ??
        json['daily_price'] ??
        json['price'] ??
        json['precio_por_dia'] ??
        json['precio'];
    if (rawPrice is num) {
      price = rawPrice.toDouble();
    } else if (rawPrice is String) {
      price = double.tryParse(rawPrice) ?? 35.50;
    }

    // 3. Asientos / Pasajeros Resiliente
    int seats = 5;
    final rawSeats = json['asientos'] ??
        json['seats'] ??
        json['capacidad_pasajeros'] ??
        json['capacidad'];
    if (rawSeats is num) {
      seats = rawSeats.toInt();
    } else if (rawSeats is String) {
      seats = int.tryParse(rawSeats) ?? 5;
    }

    // 4. Puertas
    int doors = 4;
    final rawDoors = json['puertas'] ?? json['doors'];
    if (rawDoors is num) {
      doors = rawDoors.toInt();
    } else if (rawDoors is String) {
      doors = int.tryParse(rawDoors) ?? 4;
    }

    // 5. Maletas
    int bags = 2;
    final rawBags = json['maletas_grandes'] ?? json['bag_capacity'] ?? json['maletas'];
    if (rawBags is num) {
      bags = rawBags.toInt();
    } else if (rawBags is String) {
      bags = int.tryParse(rawBags) ?? 2;
    }

    // 6. Cooldown
    int cooldown = 0;
    final rawCooldown = json['segundos_restantes_cooldown'] ?? json['cooldown'];
    if (rawCooldown is num) {
      cooldown = rawCooldown.toInt();
    } else if (rawCooldown is String) {
      cooldown = int.tryParse(rawCooldown) ?? 0;
    }

    // 7. Imagen
    String? imgUrl = json['foto_url'] ?? json['imagen_url'];
    if (imgUrl == null && json['images'] is List) {
      final listImgs = json['images'] as List;
      if (listImgs.isNotEmpty && listImgs.first != null) {
        imgUrl = listImgs.first.toString();
      }
    }

    return Auto(
      id: json['vehicle_id']?.toString() ?? json['id']?.toString() ?? 'auto-01',
      modelo: json['modelo']?.toString() ?? json['name']?.toString() ?? 'Vehículo',
      marca: json['marca']?.toString() ?? 'Flota',
      categoria: json['categoria']?.toString() ?? 'Económico',
      precioPorDia: price,
      transmision: json['transmision']?.toString() ?? 'Manual',
      capacidadPasajeros: seats,
      puertas: doors,
      maletasGrandes: bags,
      aireAcondicionado: json['aire_acondicionado'] ?? true,
      kilometrajeIlimitado: json['kilometraje_ilimitado'] ?? true,
      imagenUrl: imgUrl,
      proveedor: prov,
      proveedorRating: pRating,
      proveedorUbicacion: pUbicacion,
      estado: json['estado']?.toString() ?? json['estado_operativo']?.toString() ?? 'DISPONIBLE',
      cooldownSegundosRestantes: cooldown,
    );
  }
}
