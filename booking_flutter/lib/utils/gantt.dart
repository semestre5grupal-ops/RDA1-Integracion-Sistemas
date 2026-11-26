import '../models/admin_models.dart';

/// Una barra del diagrama de tiempos de una compra.
class BarraGantt {
  final int id;
  final String paso;
  final String? nodo;
  final String resultado;
  final int durMs;
  final DateTime inicio;
  final DateTime fin;
  /// Milisegundos desde el primer paso de la compra.
  final int desdeMs;
  const BarraGantt({required this.id, required this.paso, required this.nodo, required this.resultado, required this.durMs, required this.inicio, required this.fin, required this.desdeMs});
}

class ResultadoGantt {
  final List<BarraGantt> barras;
  final int totalMs;
  final BarraGantt? masLarga;
  final int pctMasLarga;
  const ResultadoGantt(this.barras, this.totalMs, this.masLarga, this.pctMasLarga);
}

/// Misma regla que `barrasGantt` de la web: solo pasos con duración, sin las
/// consultas; cada evento se registra al TERMINAR, así que su inicio es
/// `ts - ms`. Ordenadas por inicio y luego por fin.
ResultadoGantt barrasGantt(List<EventoTraza> eventos) {
  final barras = <BarraGantt>[];
  for (final e in eventos) {
    final ms = e.ms ?? 0;
    final fin = DateTime.tryParse(e.ts);
    if (e.paso == 'consulta' || ms <= 0 || fin == null) continue;
    barras.add(BarraGantt(
      id: e.seq,
      paso: e.paso,
      nodo: e.nodo,
      resultado: e.resultado,
      durMs: ms,
      inicio: fin.subtract(Duration(milliseconds: ms)),
      fin: fin,
      desdeMs: 0,
    ));
  }
  if (barras.isEmpty) return const ResultadoGantt([], 0, null, 0);
  barras.sort((a, b) {
    final c = a.inicio.compareTo(b.inicio);
    return c != 0 ? c : a.fin.compareTo(b.fin);
  });
  final t0 = barras.map((b) => b.inicio).reduce((a, b) => a.isBefore(b) ? a : b);
  final tFin = barras.map((b) => b.fin).reduce((a, b) => a.isAfter(b) ? a : b);
  final total = tFin.difference(t0).inMilliseconds;
  final conDesde = [
    for (final b in barras)
      BarraGantt(id: b.id, paso: b.paso, nodo: b.nodo, resultado: b.resultado, durMs: b.durMs, inicio: b.inicio, fin: b.fin, desdeMs: b.inicio.difference(t0).inMilliseconds),
  ];
  final larga = conDesde.reduce((a, b) => b.durMs > a.durMs ? b : a);
  return ResultadoGantt(conDesde, total, larga, total > 0 ? (larga.durMs / total * 100).round() : 0);
}

/// Nombres de los pasos, como en el panel web.
const Map<String, String> etiquetaPaso = {
  'busqueda': 'Búsqueda',
  'hold': 'Hold',
  'asiento': 'Asiento',
  'cobro': 'Cobro',
  'reserva_aerolinea': 'Reserva',
  'copia': 'Copia',
  'factura': 'Factura',
  'confirmada': 'Confirmada',
  'reembolso': 'Reembolso',
  'cancelacion': 'Cancelación',
  'checkin': 'Check-in',
  'cambio_fecha': 'Cambio de fecha',
  'estado_vuelo': 'Estado de vuelo',
  'consulta': 'Consulta',
  'boleto': 'Boleto',
  'pase': 'Pase',
  'cotizacion': 'Cotización',
  'soltar': 'Soltar hold',
  'webhook': 'Webhook',
  'integracion': 'Integración',
};
