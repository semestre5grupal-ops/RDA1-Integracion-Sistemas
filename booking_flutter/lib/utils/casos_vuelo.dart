import '../models/admin_models.dart';

/// Pasos que forman la barra de una compra, en orden.
const List<String> pasosCompra = ['busqueda', 'hold', 'asiento', 'cobro', 'reserva_aerolinea', 'factura', 'confirmada'];

enum EstadoCaso { completada, fallo, critico, abandonada, curso }

/// Una compra (o actividad) agrupada por su código de correlación.
class CasoVuelo {
  final String correlacion;
  final List<EventoTraza> eventos;
  final EstadoCaso estado;
  final String etiqueta;
  final String? cliente;
  final double? monto;
  final String ultimaHora;
  const CasoVuelo({required this.correlacion, required this.eventos, required this.estado, required this.etiqueta, this.cliente, this.monto, required this.ultimaHora});
}

/// Quienes de prueba no cuentan en el monitoreo (igual que la web).
bool esPrueba(EventoTraza e) => RegExp(r'example\.com', caseSensitive: false).hasMatch(e.cliente ?? '') || RegExp(r'^corr-e2e').hasMatch(e.correlacion);

/// Minutos tras los que un hold sin cobro se considera abandonado.
const int minutosAbandono = 16;

/// Agrupa por correlación solo las compras (las que llegaron a pedir hold),
/// del caso más reciente al más antiguo. Versión resumida de `armarCasos` de la
/// web: sin post-venta por PNR ni eventos de fondo.
List<CasoVuelo> armarCasosCompra(List<EventoTraza> eventos, {DateTime? ahora, bool incluirPruebas = false}) {
  final ahoraT = ahora ?? DateTime.now();
  final porCorr = <String, List<EventoTraza>>{};
  for (final e in [...eventos]..sort((a, b) => a.seq.compareTo(b.seq))) {
    if (!incluirPruebas && esPrueba(e)) continue;
    if (e.correlacion.isEmpty) continue;
    porCorr.putIfAbsent(e.correlacion, () => []).add(e);
  }
  final casos = <CasoVuelo>[];
  for (final entry in porCorr.entries) {
    final evs = entry.value;
    final hold = evs.where((e) => e.paso == 'hold').toList();
    if (hold.isEmpty) continue;
    final pasos = evs.map((e) => e.paso).toSet();
    final ultimo = evs.last;
    EstadoCaso estado;
    String etiqueta;
    final reembolsoError = evs.any((e) => e.paso == 'reembolso' && e.resultado == 'error');
    final fallo = evs.where((e) => pasosCompra.contains(e.paso) && e.resultado == 'error').toList();
    final inicioHold = DateTime.tryParse(hold.first.ts);
    final minutos = inicioHold == null ? 0 : ahoraT.difference(inicioHold).inMinutes;
    if (reembolsoError) {
      estado = EstadoCaso.critico;
      etiqueta = 'Cobrado sin reserva';
    } else if (pasos.contains('confirmada')) {
      estado = EstadoCaso.completada;
      etiqueta = 'Completada';
    } else if (fallo.isNotEmpty) {
      estado = EstadoCaso.fallo;
      final en = fallo.last.paso;
      etiqueta = 'Falló en ${_nombre(en)}${pasos.contains('reembolso') ? ' · cobro devuelto' : ''}';
    } else if (pasos.contains('soltar') || (!pasos.contains('cobro') && minutos > minutosAbandono)) {
      estado = EstadoCaso.abandonada;
      etiqueta = 'Abandonada';
    } else {
      estado = EstadoCaso.curso;
      etiqueta = 'En curso · ${_nombre(ultimo.paso)}';
    }
    casos.add(CasoVuelo(
      correlacion: entry.key,
      eventos: evs,
      estado: estado,
      etiqueta: etiqueta,
      cliente: evs.map((e) => e.cliente).firstWhere((c) => c != null && c.isNotEmpty, orElse: () => null),
      monto: (evs.where((e) => e.paso == 'cobro' && e.resultado == 'ok' && e.monto != null).map((e) => e.monto).firstOrNull) ?? hold.first.monto,
      ultimaHora: ultimo.ts,
    ));
  }
  casos.sort((a, b) => b.ultimaHora.compareTo(a.ultimaHora));
  return casos;
}

String _nombre(String paso) {
  const n = {
    'busqueda': 'Búsqueda', 'hold': 'Hold', 'asiento': 'Asiento', 'cobro': 'Cobro', 'reserva_aerolinea': 'Reserva',
    'factura': 'Factura', 'confirmada': 'Confirmada', 'reembolso': 'Reembolso', 'soltar': 'Soltar',
  };
  return n[paso] ?? paso;
}
