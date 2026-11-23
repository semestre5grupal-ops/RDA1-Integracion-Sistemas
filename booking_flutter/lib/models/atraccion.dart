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

    return Atraccion(
      id: json['id']?.toString() ?? '',
      nombre: json['nombre'] ?? json['name'] ?? 'Atracción Turística',
      descripcion: json['descripcion'] ?? json['short_description'] ?? json['description'] ?? '',
      ciudad: json['ciudad'] ?? json['city'] ?? json['ubicacion'] ?? 'Ecuador',
      precio: (json['precio'] ?? json['price'] ?? 0.0).toDouble(),
      imagenUrl: json['imagen_url'] ?? json['image_url'] ?? json['foto'],
      proveedor: json['proveedor'] ?? json['proveedor_codigo'] ?? 'Socio B2B',
      rating: (json['rating'] ?? json['calificacion'] ?? 4.8).toDouble(),
      categorias: (json['categorias'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
      turnos: slots,
    );
  }
}

