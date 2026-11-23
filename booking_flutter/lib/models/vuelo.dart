class Vuelo {
  final String id;
  final String numeroVuelo;
  final String aerolinea;
  final String origen;
  final String destino;
  final String fechaSalida;
  final String horaSalida;
  final String horaLlegada;
  final double precio;
  final String estado;
  final String? puertaEmbarque;

  String get fecha => fechaSalida;

  Vuelo({
    required this.id,
    required this.numeroVuelo,
    required this.aerolinea,
    required this.origen,
    required this.destino,
    required this.fechaSalida,
    required this.horaSalida,
    required this.horaLlegada,
    required this.precio,
    this.estado = 'A TIEMPO',
    this.puertaEmbarque,
  });

  factory Vuelo.fromJson(Map<String, dynamic> json) {
    return Vuelo(
      id: json['id']?.toString() ?? '',
      numeroVuelo: json['numero_vuelo'] ?? json['flight_number'] ?? 'EQ-100',
      aerolinea: json['aerolinea'] ?? json['airline'] ?? 'Aerolíneas Aliadas',
      origen: json['origen'] ?? json['origin'] ?? 'UIO',
      destino: json['destino'] ?? json['destination'] ?? 'GYE',
      fechaSalida: json['fecha_salida'] ?? json['date'] ?? '2026-12-01',
      horaSalida: json['hora_salida'] ?? json['departure_time'] ?? '08:00',
      horaLlegada: json['hora_llegada'] ?? json['arrival_time'] ?? '09:00',
      precio: (json['precio'] ?? json['price'] ?? 89.0).toDouble(),
      estado: json['estado'] ?? json['status'] ?? 'A TIEMPO',
      puertaEmbarque: json['puerta_embarque'] ?? json['gate'] ?? 'A2',
    );
  }
}
