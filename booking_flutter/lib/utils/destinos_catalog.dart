class DestinoOption {
  final String nombre;
  final String region;
  final String pais;
  final bool popular;

  const DestinoOption({
    required this.nombre,
    required this.region,
    this.pais = 'Ecuador',
    this.popular = false,
  });
}

class AeropuertoOption {
  final String codigo;
  final String nombre;
  final bool esEcuador;

  const AeropuertoOption({
    required this.codigo,
    required this.nombre,
    this.esEcuador = true,
  });
}

class DestinosCatalog {
  static const List<DestinoOption> destinosAlojamientos = [
    DestinoOption(nombre: 'Quito', region: 'Pichincha', popular: true),
    DestinoOption(nombre: 'Guayaquil', region: 'Guayas', popular: true),
    DestinoOption(nombre: 'Cuenca', region: 'Azuay', popular: true),
    DestinoOption(nombre: 'Baños de Agua Santa', region: 'Tungurahua', popular: true),
    DestinoOption(nombre: 'Montañita', region: 'Santa Elena', popular: true),
    DestinoOption(nombre: 'Islas Galápagos', region: 'Galápagos'),
    DestinoOption(nombre: 'Puerto Ayora', region: 'Galápagos'),
    DestinoOption(nombre: 'Salinas', region: 'Santa Elena'),
    DestinoOption(nombre: 'Manta', region: 'Manabí'),
    DestinoOption(nombre: 'Puerto López', region: 'Manabí'),
    DestinoOption(nombre: 'Mindo', region: 'Pichincha'),
    DestinoOption(nombre: 'Otavalo', region: 'Imbabura'),
    DestinoOption(nombre: 'Tena', region: 'Napo'),
    DestinoOption(nombre: 'Loja', region: 'Loja'),
    DestinoOption(nombre: 'Ambato', region: 'Tungurahua'),
    DestinoOption(nombre: 'Riobamba', region: 'Chimborazo'),
    DestinoOption(nombre: 'Esmeraldas', region: 'Esmeraldas'),
    DestinoOption(nombre: 'Cancún', region: 'Quintana Roo', pais: 'México', popular: true),
    DestinoOption(nombre: 'Cartagena', region: 'Bolívar', pais: 'Colombia'),
    DestinoOption(nombre: 'Medellín', region: 'Antioquia', pais: 'Colombia'),
  ];

  static const List<AeropuertoOption> aeropuertosEcuador = [
    AeropuertoOption(codigo: 'UIO', nombre: 'Quito (UIO)'),
    AeropuertoOption(codigo: 'GYE', nombre: 'Guayaquil (GYE)'),
    AeropuertoOption(codigo: 'CUE', nombre: 'Cuenca (CUE)'),
    AeropuertoOption(codigo: 'MEC', nombre: 'Manta (MEC)'),
    AeropuertoOption(codigo: 'OCC', nombre: 'Coca (OCC)'),
    AeropuertoOption(codigo: 'LOH', nombre: 'Loja (LOH)'),
    AeropuertoOption(codigo: 'ESM', nombre: 'Esmeraldas (ESM)'),
    AeropuertoOption(codigo: 'LTX', nombre: 'Latacunga (LTX)'),
    AeropuertoOption(codigo: 'MCH', nombre: 'Machala (MCH)'),
    AeropuertoOption(codigo: 'TPC', nombre: 'Tarapoa (TPC)'),
    AeropuertoOption(codigo: 'GPS', nombre: 'Galápagos - Baltra (GPS)'),
    AeropuertoOption(codigo: 'SCY', nombre: 'Galápagos - San Cristóbal (SCY)'),
  ];

  static const List<AeropuertoOption> aeropuertosInternacionales = [
    AeropuertoOption(codigo: 'BOG', nombre: 'Bogotá, Colombia (BOG)', esEcuador: false),
    AeropuertoOption(codigo: 'LIM', nombre: 'Lima, Perú (LIM)', esEcuador: false),
    AeropuertoOption(codigo: 'MIA', nombre: 'Miami, EE. UU. (MIA)', esEcuador: false),
    AeropuertoOption(codigo: 'MAD', nombre: 'Madrid, España (MAD)', esEcuador: false),
  ];

  static List<AeropuertoOption> get todosAeropuertos => [
        ...aeropuertosEcuador,
        ...aeropuertosInternacionales,
      ];

  static const List<String> sugerenciasAutos = [
    'Quito',
    'Guayaquil',
    'Cuenca',
    'Manta',
    'Aeropuerto Mariscal Sucre',
    'Aeropuerto José Joaquín de Olmedo',
    'Loja',
    'Machala',
    'Chevrolet',
    'Toyota',
    'Mercedes-Benz',
    'Kia',
    'Hyundai',
    'Nissan',
    'SUV',
  ];

  static const List<String> sugerenciasAtracciones = [
    'Quito',
    'Guayaquil',
    'Cuenca',
    'Baños',
    'Galápagos',
    'Mindo',
    'Mitad del Mundo',
    'Otavalo',
    'Puerto López',
  ];

  static String normalizar(String texto) {
    return texto
        .toLowerCase()
        .replaceAll('á', 'a')
        .replaceAll('é', 'e')
        .replaceAll('í', 'i')
        .replaceAll('ó', 'o')
        .replaceAll('ú', 'u')
        .replaceAll('ü', 'u')
        .replaceAll('ñ', 'n')
        .trim();
  }

  static List<DestinoOption> buscarDestinosAlojamientos(String query, {List<String> extraCatalogo = const []}) {
    final map = <String, DestinoOption>{
      for (final d in destinosAlojamientos) normalizar(d.nombre): d,
    };
    for (final raw in extraCatalogo) {
      final clean = raw.trim();
      if (clean.isEmpty) continue;
      final key = normalizar(clean);
      map.putIfAbsent(key, () => DestinoOption(nombre: clean, region: 'Ecuador'));
    }

    final list = map.values.toList();
    final q = normalizar(query);
    if (q.isEmpty) {
      return list.where((d) => d.popular).take(6).toList();
    }
    return list
        .where((d) => normalizar(d.nombre).contains(q) || normalizar(d.region).contains(q))
        .take(6)
        .toList();
  }

  static bool esViajeInternacional(String origenIata, String destinoIata) {
    final ecCodes = aeropuertosEcuador.map((e) => e.codigo).toSet();
    return !ecCodes.contains(origenIata.toUpperCase()) || !ecCodes.contains(destinoIata.toUpperCase());
  }
}

