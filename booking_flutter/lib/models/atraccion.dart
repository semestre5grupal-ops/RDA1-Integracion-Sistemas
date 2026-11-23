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
    required this.horaFin,
    required this.cuposDisponibles,
    required this.capacidadTotal,
    required this.estado,
  });

  factory TimeSlot.fromJson(Map<String, dynamic> json) {
    return TimeSlot(
      slotId: json['slot_id']?.toString() ?? json['id']?.toString() ?? 'slot-default',
      horaInicio: json['hora_inicio'] ?? json['time'] ?? json['hora'] ?? '09:00',
      horaFin: json['hora_fin'] ?? '11:00',
      cuposDisponibles: json['cupos_disponibles'] ?? json['cupos'] ?? json['capacity'] ?? 0,
      capacidadTotal: json['capacidad_total'] ?? 20,
      estado: json['estado'] ?? (json['cupos_disponibles'] != null && json['cupos_disponibles'] > 0 ? 'DISPONIBLE' : 'AGOTADO'),
    );
  }
}

class Atraccion {
  final String id;
  final String nombre;
  final String descripcion;
  final String ciudad;
  final double precio;
  final String? imagenUrl;
  final String proveedor;
  final double rating;
  final List<String> categorias;
  final List<TimeSlot> turnos;

  Atraccion({
    required this.id,
    required this.nombre,
    required this.descripcion,
    required this.ciudad,
    required this.precio,
    this.imagenUrl,
    required this.proveedor,
    this.rating = 4.8,
    this.categorias = const [],
    this.turnos = const [],
  });

  factory Atraccion.fromJson(Map<String, dynamic> json) {
    var rawSlots = json['time_slots'] ?? json['turnos'] ?? json['horarios'];
    List<TimeSlot> slots = [];
    if (rawSlots is List) {
      slots = rawSlots.map((s) => TimeSlot.fromJson(s as Map<String, dynamic>)).toList();
    }

    // Resolucion resiliente de precio (puede ser number o Map en Azure)
    double precioParsed = 0.0;
    if (json['precio_unitario_adulto'] != null) {
      precioParsed = (json['precio_unitario_adulto'] as num).toDouble();
    } else if (json['precio'] is num) {
      precioParsed = (json['precio'] as num).toDouble();
    } else if (json['precio'] is Map && json['precio']['total'] != null) {
      precioParsed = (json['precio']['total'] as num).toDouble();
    } else if (json['price'] is Map && json['price']['total'] != null) {
      precioParsed = (json['price']['total'] as num).toDouble();
    } else if (json['price'] is num) {
      precioParsed = (json['price'] as num).toDouble();
    }

    // Resolucion de imagen
    String? img = json['foto_url'] ?? json['photoUrl'] ?? json['imagen'] ?? json['imagen_url'] ?? json['foto'];
    if (img == null && json['fotos_urls'] is List && (json['fotos_urls'] as List).isNotEmpty) {
      img = json['fotos_urls'][0].toString();
    }

    // Proveedor
    String prov = 'Socio B2B';
    if (json['proveedor'] is Map && json['proveedor']['nombre_comercial'] != null) {
      prov = json['proveedor']['nombre_comercial'].toString();
    } else if (json['proveedor_codigo'] != null) {
      prov = json['proveedor_codigo'].toString();
    } else if (json['proveedor'] is String) {
      prov = json['proveedor'].toString();
    }

    return Atraccion(
      id: json['id']?.toString() ?? '',
      nombre: json['nombre'] ?? json['name'] ?? 'Atracción Turística',
      descripcion: json['descripcion_corta'] ?? json['short_description'] ?? json['descripcion'] ?? json['description'] ?? '',
      ciudad: json['ciudad'] ?? json['city'] ?? json['ubicacion'] ?? 'Ecuador',
      precio: precioParsed > 0 ? precioParsed : 15.0,
      imagenUrl: img,
      proveedor: prov,
      rating: (json['rating'] is Map ? (json['rating']['score'] ?? 4.8) : (json['rating'] ?? 4.8)).toDouble(),
      categorias: (json['categorias'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
      turnos: slots,
    );
  }
}
