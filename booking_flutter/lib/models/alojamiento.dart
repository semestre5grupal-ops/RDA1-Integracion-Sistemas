class TipoHabitacion {
  final String id;
  final String nombre;
  final double precioPorNoche;
  final int capacidadHuespedes;

  TipoHabitacion({
    required this.id,
    required this.nombre,
    required this.precioPorNoche,
    required this.capacidadHuespedes,
  });

  factory TipoHabitacion.fromJson(Map<String, dynamic> json) {
    return TipoHabitacion(
      id: json['id']?.toString() ?? 'std',
      nombre: json['nombre'] ?? json['name'] ?? 'Habitación Estándar',
      precioPorNoche: (json['precio_por_noche'] ?? json['precio'] ?? 50.0).toDouble(),
      capacidadHuespedes: json['capacidad'] ?? json['huespedes'] ?? 2,
    );
  }
}

class Alojamiento {
  final String id;
  final String nombre;
  final String descripcion;
  final String ciudad;
  final double precioPorNoche;
  final String? imagenUrl;
  final double rating;
  final List<TipoHabitacion> habitaciones;

  Alojamiento({
    required this.id,
    required this.nombre,
    required this.descripcion,
    required this.ciudad,
    required this.precioPorNoche,
    this.imagenUrl,
    this.rating = 4.7,
    this.habitaciones = const [],
  });

  factory Alojamiento.fromJson(Map<String, dynamic> json) {
    var rawRooms = json['habitaciones'] ?? json['tipos_habitacion'];
    List<TipoHabitacion> rooms = [];
    if (rawRooms is List) {
      rooms = rawRooms.map((r) => TipoHabitacion.fromJson(r as Map<String, dynamic>)).toList();
    }

    return Alojamiento(
      id: json['id']?.toString() ?? '',
      nombre: json['nombre'] ?? json['name'] ?? 'Hotel',
      descripcion: json['descripcion'] ?? json['description'] ?? '',
      ciudad: json['ciudad'] ?? json['city'] ?? 'Ecuador',
      precioPorNoche: (json['precio_por_noche'] ?? json['precio_minimo'] ?? json['precio'] ?? 60.0).toDouble(),
      imagenUrl: json['imagen_url'] ?? json['image_url'] ?? json['foto'],
      rating: (json['rating'] ?? json['estrellas'] ?? 4.7).toDouble(),
      habitaciones: rooms,
    );
  }
}

