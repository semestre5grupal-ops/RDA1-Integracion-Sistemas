class CartItem {
  final String id;
  final String vertical; // atracciones, autos, alojamientos, vuelos
  final String titulo;
  final String subtitulo;
  final double precioUnitario;
  final int cantidad;
  final String fecha;
  final String? slotId;
  final Map<String, dynamic> metadata;

  CartItem({
    required this.id,
    required this.vertical,
    required this.titulo,
    required this.subtitulo,
    required this.precioUnitario,
    this.cantidad = 1,
    required this.fecha,
    this.slotId,
    this.metadata = const {},
  });

  double get subtotal => precioUnitario * cantidad;
  double get iva => subtotal * 0.15; // IVA 15% ecuatoriano
  double get totalConIva => subtotal + iva;
}

