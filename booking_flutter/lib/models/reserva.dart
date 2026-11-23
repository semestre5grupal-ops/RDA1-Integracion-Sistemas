class Reserva {
  final String id;
  final String vertical; // atracciones, autos, alojamientos, vuelos
  final String servicioNombre;
  final String? proveedor;
  final String fecha;
  final String? hora;
  final double total;
  final String estado; // CONFIRMADA, CANCELADA, PENDIENTE
  final String? voucherQr;
  final String? pnr;
  final DateTime fechaCreacion;
  final DateTime fechaServicio;

  Reserva({
    required this.id,
    required this.vertical,
    required this.servicioNombre,
    this.proveedor,
    required this.fecha,
    this.hora,
    required this.total,
    required this.estado,
    this.voucherQr,
    this.pnr,
    required this.fechaCreacion,
    required this.fechaServicio,
  });

  factory Reserva.fromJson(Map<String, dynamic> json) {
    DateTime created = DateTime.tryParse(json['created_at']?.toString() ?? '') ?? DateTime.now();
    DateTime serviceDate = DateTime.tryParse(json['fecha']?.toString() ?? '') ?? DateTime.now().add(const Duration(days: 3));

    return Reserva(
      id: json['id']?.toString() ?? '',
      vertical: json['vertical'] ?? json['tipo_servicio'] ?? 'atracciones',
      servicioNombre: json['servicio_nombre'] ?? json['titulo'] ?? json['nombre'] ?? 'Servicio Turístico',
      proveedor: json['proveedor'] ?? json['proveedor_codigo'],
      fecha: json['fecha']?.toString() ?? '',
      hora: json['hora']?.toString(),
      total: (json['total'] ?? json['precio_total'] ?? 0.0).toDouble(),
      estado: (json['estado'] ?? json['status'] ?? 'CONFIRMADA').toString().toUpperCase(),
      voucherQr: json['voucher_qr'] ?? json['qr_code'] ?? json['qr_data'] ?? 'VOUCHER-${json['id']}',
      pnr: json['pnr'] ?? json['external_order_id'] ?? json['codigo_reserva'],
      fechaCreacion: created,
      fechaServicio: serviceDate,
    );
  }

  // Regla estricta de cancelación 24 horas (48h para hoteles)
  bool get cancelable {
    if (estado == 'CANCELADA' || estado == 'CANCELLED') return false;
    final horasRestantes = fechaServicio.difference(DateTime.now()).inHours;
    final horasLimite = vertical.toLowerCase().contains('alojamiento') ? 48 : 24;
    return horasRestantes >= horasLimite;
  }
}

