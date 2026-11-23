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
    return Auto(
      id: json['id']?.toString() ?? '',
      modelo: json['modelo'] ?? json['name'] ?? 'Vehículo',
      marca: json['marca'] ?? 'Flota General',
      categoria: json['categoria'] ?? 'Sedán',
      precioPorDia: (json['precio_por_dia'] ?? json['precio'] ?? json['daily_rate'] ?? 35.0).toDouble(),
      transmision: json['transmision'] ?? 'Automática',
      capacidadPasajeros: json['capacidad_pasajeros'] ?? json['pasajeros'] ?? 5,
      imagenUrl: json['imagen_url'] ?? json['image_url'] ?? json['foto'],
      proveedor: json['proveedor'] ?? json['proveedor_codigo'] ?? 'RutaLibre Autos',
      estado: json['estado'] ?? 'DISPONIBLE',
      cooldownSegundosRestantes: json['segundos_restantes_cooldown'] ?? 0,
    );
  }

  bool get enCooldown => cooldownSegundosRestantes > 0 || estado == 'EN_LIMPIEZA';
}

