double _resParseDouble(dynamic val, [double fallback = 0.0]) {
  if (val is num) return val.toDouble();
  if (val is String) return double.tryParse(val) ?? fallback;
  if (val is Map && val['total'] != null) return _resParseDouble(val['total'], fallback);
  return fallback;
}

class Reserva {
  final String id;
  final String vertical; // atracciones, autos, alojamientos, vuelos
  final String servicioNombre;
  final String? proveedor;
  final String fecha;
  final String? hora;
  final String? checkin;
  final String? checkout;
  final double total;
  final String estado; // CONFIRMADA, CONFIRMED, CANCELADA, CANCELLED, CHECKED_IN, etc.
  final String? voucherQr;
  final String? pnr;
  final String? imagenUrl;
  final String? detalleExtra;
  final DateTime fechaCreacion;
  final DateTime fechaServicio;

  String get itemNombre => servicioNombre;
  String get tipo => vertical;
  bool get esCancelada => estado.toUpperCase() == 'CANCELADA' || estado.toUpperCase() == 'CANCELLED';

  Reserva({
    required this.id,
    required this.vertical,
    required this.servicioNombre,
    this.proveedor,
    required this.fecha,
    this.hora,
    this.checkin,
    this.checkout,
    required this.total,
    required this.estado,
    this.voucherQr,
    this.pnr,
    this.imagenUrl,
    this.detalleExtra,
    required this.fechaCreacion,
    required this.fechaServicio,
  });

  factory Reserva.fromJson(Map<String, dynamic> json, {String? forcedVertical}) {
    final vert = forcedVertical ??
        json['vertical']?.toString() ??
        json['tipo_servicio']?.toString() ??
        json['tipo']?.toString() ??
        'atracciones';

    final resId = json['bookingId']?.toString() ??
        json['reservation_id']?.toString() ??
        json['reservationId']?.toString() ??
        json['id_reserva']?.toString() ??
        json['reserva_id']?.toString() ??
        json['idReserva']?.toString() ??
        json['order_id']?.toString() ??
        json['orderId']?.toString() ??
        json['id']?.toString() ??
        json['_id']?.toString() ??
        '';

    final pnrVal = json['pnr']?.toString() ??
        json['codigo_reserva']?.toString() ??
        json['codigoReserva']?.toString() ??
        json['reservation_code']?.toString() ??
        json['external_order_id']?.toString() ??
        json['code']?.toString() ??
        resId;

    String nombre = json['servicio_nombre']?.toString() ??
        json['nombreAlojamiento']?.toString() ??
        json['titulo']?.toString() ??
        json['nombre']?.toString() ??
        '';

    if (nombre.isEmpty && json['vehiculo'] is Map) {
      final v = Map<String, dynamic>.from(json['vehiculo']);
      nombre = 'Renta: ${v['marca'] ?? ''} ${v['modelo'] ?? ''}'.trim();
    }
    if (nombre.isEmpty && json['origin'] != null && json['destination'] != null) {
      nombre = 'Vuelo ${json['origin']} ➔ ${json['destination']}';
    }
    if (nombre.isEmpty) {
      nombre = vert == 'vuelos'
          ? 'Reserva de Vuelo'
          : vert == 'autos'
              ? 'Alquiler de Vehículo'
              : vert == 'alojamientos'
                  ? 'Reserva de Alojamiento'
                  : 'Actividad Turística';
    }

    final fechaStr = (json['checkin'] ??
            json['pickup_date'] ??
            json['departureDate'] ??
            json['fecha'] ??
            json['date'] ??
            '')
        .toString()
        .split('T')
        .first;

    final totalVal = _resParseDouble(
      json['grandTotal'] ??
          json['totalPrice'] ??
          json['total_price'] ??
          json['total'] ??
          json['precio_total'] ??
          json['precio'],
      0.0,
    );

    final created = DateTime.tryParse(json['createdAt']?.toString() ?? json['created_at']?.toString() ?? '') ??
        DateTime.now();
    final serviceDate = DateTime.tryParse(fechaStr) ?? DateTime.now().add(const Duration(days: 3));

    return Reserva(
      id: resId.isNotEmpty ? resId : pnrVal,
      vertical: vert,
      servicioNombre: nombre,
      proveedor: json['proveedor']?.toString() ?? json['proveedor_codigo']?.toString() ?? json['destino']?.toString(),
      fecha: fechaStr.isNotEmpty ? fechaStr : created.toIso8601String().split('T').first,
      hora: json['hora']?.toString() ?? json['time']?.toString(),
      checkin: json['checkin']?.toString(),
      checkout: json['checkout']?.toString(),
      total: totalVal,
      estado: (json['status'] ?? json['estado'] ?? 'CONFIRMADA').toString().toUpperCase(),
      voucherQr: json['voucher_qr']?.toString() ??
          json['voucher_qr_data']?.toString() ??
          json['qr_code']?.toString() ??
          json['qr_data']?.toString() ??
          'BOOKING-${pnrVal.isNotEmpty ? pnrVal : resId}',
      pnr: pnrVal,
      imagenUrl: json['photoUrl']?.toString() ?? json['foto_url']?.toString(),
      fechaCreacion: created,
      fechaServicio: serviceDate,
    );
  }

  /// Regla estricta de cancelación: 48 horas para alojamientos, 24 horas para el resto.
  bool get cancelable {
    if (esCancelada) return false;
    final horasRestantes = fechaServicio.difference(DateTime.now()).inHours;
    final horasLimite = vertical.toLowerCase().contains('alojamiento') ? 48 : 24;
    return horasRestantes >= horasLimite;
  }
}
