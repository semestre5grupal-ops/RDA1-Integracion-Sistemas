class Auto {
  final String id;
  final String modelo;
  final String marca;
  final String categoria;
  final double precioPorDia;
  final String transmision;
  final int capacidadPasajeros;
  final String? imagenUrl;
  final String proveedor;
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
    this.imagenUrl,
    required this.proveedor,
    this.estado = 'DISPONIBLE',
    this.cooldownSegundosRestantes = 0,
  });

  factory Auto.fromJson(Map<String, dynamic> json) {
    // Proveedor
    String prov = 'RutaLibre Autos';
    if (json['proveedor'] is Map && json['proveedor']['nombre'] != null) {
      prov = json['proveedor']['nombre'].toString();
    } else if (json['proveedor_codigo'] != null) {
      prov = json['proveedor_codigo'].toString();
    } else if (json['proveedor'] is String) {
      prov = json['proveedor'].toString();
    }

    return Auto(
      id: json['vehicle_id']?.toString() ?? json['id']?.toString() ?? '',
      modelo: json['modelo'] ?? json['name'] ?? 'Vehículo',
      marca: json['marca'] ?? 'Flota',
      categoria: json['categoria'] ?? 'Sedán',
      precioPorDia: (json['precio_diario'] ?? json['precio_por_dia'] ?? json['precio'] ?? 35.0).toDouble(),
      transmision: json['transmision'] ?? 'Automática',
      capacidadPasajeros: json['asientos'] ?? json['capacidad_pasajeros'] ?? 5,
      imagenUrl: json['foto_url'] ?? json['imagen_url'] ?? (json['images'] is List && (json['images'] as List).isNotEmpty ? json['images'][0] : null),
      proveedor: prov,
      estado: json['estado'] ?? 'DISPONIBLE',
      cooldownSegundosRestantes: json['segundos_restantes_cooldown'] ?? 0,
    );
  }

  bool get enCooldown => cooldownSegundosRestantes > 0 || estado == 'EN_LIMPIEZA';
}
