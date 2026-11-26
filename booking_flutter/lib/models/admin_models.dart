import '../utils/json_parse.dart';

Map<String, dynamic> _mapa(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
List<Map<String, dynamic>> _lista(dynamic v) => v is List ? v.whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList() : <Map<String, dynamic>>[];
double _num(dynamic v) => parseDouble(v);
int _int(dynamic v) => parseDouble(v).round();

/// Indicadores de un período (`GET /admin/metricas`).
class KpisAdmin {
  final int reservas;
  final int reservasCobradas;
  final double ingresos;
  final double comision;
  final double ticketPromedio;
  final double tasaCancelacion;
  const KpisAdmin({this.reservas = 0, this.reservasCobradas = 0, this.ingresos = 0, this.comision = 0, this.ticketPromedio = 0, this.tasaCancelacion = 0});

  factory KpisAdmin.fromJson(dynamic j) {
    final m = _mapa(j);
    return KpisAdmin(
      reservas: _int(m['reservas']),
      reservasCobradas: _int(m['reservasCobradas']),
      ingresos: _num(m['ingresos']),
      comision: _num(m['comision']),
      ticketPromedio: _num(m['ticketPromedio']),
      tasaCancelacion: _num(m['tasaCancelacion']),
    );
  }

  /// Variación porcentual contra [anterior]; `null` si no hay base de comparación.
  static double? variacion(double actual, double anterior) => anterior == 0 ? null : (actual - anterior) / anterior * 100;
}

class DiaSerie {
  final String fecha;
  final int reservas;
  final double ingresos;
  const DiaSerie(this.fecha, this.reservas, this.ingresos);
}

class VerticalAdmin {
  final String vertical;
  final KpisAdmin kpis;
  const VerticalAdmin(this.vertical, this.kpis);
}

class DestinoAdmin {
  final String destino;
  final int reservas;
  final double ingresos;
  const DestinoAdmin(this.destino, this.reservas, this.ingresos);
}

class MetricasAdmin {
  final int dias;
  final String desde;
  final String hasta;
  final KpisAdmin kpis;
  final KpisAdmin kpisAnterior;
  final List<DiaSerie> serie;
  final List<VerticalAdmin> porVertical;
  final List<DestinoAdmin> topDestinos;
  const MetricasAdmin({
    required this.dias,
    required this.desde,
    required this.hasta,
    required this.kpis,
    required this.kpisAnterior,
    required this.serie,
    required this.porVertical,
    required this.topDestinos,
  });

  factory MetricasAdmin.fromJson(dynamic j) {
    final m = _mapa(j);
    return MetricasAdmin(
      dias: _int(m['dias']),
      desde: m['desde']?.toString() ?? '',
      hasta: m['hasta']?.toString() ?? '',
      kpis: KpisAdmin.fromJson(m['kpis']),
      kpisAnterior: KpisAdmin.fromJson(m['kpisAnterior']),
      serie: _lista(m['serieDiaria']).map((d) => DiaSerie(d['fecha']?.toString() ?? '', _int(d['reservas']), _num(d['ingresos']))).toList(),
      porVertical: _lista(m['porVertical']).map((v) => VerticalAdmin(v['vertical']?.toString() ?? '', KpisAdmin.fromJson(v))).toList(),
      topDestinos: _lista(m['topDestinos']).map((d) => DestinoAdmin(d['destino']?.toString() ?? '', _int(d['reservas']), _num(d['ingresos']))).toList(),
    );
  }
}

/// Un objetivo de servicio (SLO) ya evaluado por el servidor.
class SloAdmin {
  final String id;
  final String nombre;
  final String meta;
  final int total;
  final int malos;
  final double? cumplimiento; // 0..1
  final double? presupuestoConsumidoPct; // puede ser infinito
  final int fallosPermitidos;
  final double? burn1h;
  final double? burn6h;
  final double? burn24h;
  final String estado; // ok | atencion | critico | sin_datos
  final String mensaje;
  const SloAdmin({
    required this.id,
    required this.nombre,
    required this.meta,
    required this.total,
    required this.malos,
    required this.cumplimiento,
    required this.presupuestoConsumidoPct,
    required this.fallosPermitidos,
    required this.burn1h,
    required this.burn6h,
    required this.burn24h,
    required this.estado,
    required this.mensaje,
  });

  factory SloAdmin.fromJson(Map<String, dynamic> m) {
    final b = _mapa(m['burnRate']);
    return SloAdmin(
      id: m['id']?.toString() ?? '',
      nombre: m['nombre']?.toString() ?? '',
      meta: m['meta']?.toString() ?? '',
      total: _int(m['total']),
      malos: _int(m['malos']),
      cumplimiento: parseDoubleOrNull(m['cumplimiento']),
      presupuestoConsumidoPct: parseDoubleOrNull(m['presupuestoConsumidoPct']),
      fallosPermitidos: _int(m['fallosPermitidos']),
      burn1h: parseDoubleOrNull(b['h1']),
      burn6h: parseDoubleOrNull(b['h6']),
      burn24h: parseDoubleOrNull(b['h24']),
      estado: m['estado']?.toString() ?? 'sin_datos',
      mensaje: m['mensaje']?.toString() ?? '',
    );
  }
}

class LatenciaAdmin {
  final String paso;
  final String? nodo;
  final int n;
  final int? p50;
  final int? p95;
  final int? p99;
  final int? max;
  const LatenciaAdmin(this.paso, this.nodo, this.n, this.p50, this.p95, this.p99, this.max);
}

class InformeSlo {
  /// `false` cuando el servidor no puede medir (sin la traza compartida).
  final bool disponible;
  final String? motivo;
  final int ventanaDias;
  final List<SloAdmin> slos;
  final List<LatenciaAdmin> latencias;
  const InformeSlo({required this.disponible, this.motivo, this.ventanaDias = 0, this.slos = const [], this.latencias = const []});

  factory InformeSlo.fromJson(dynamic j) {
    final m = _mapa(j);
    if (m['disponible'] == false) return InformeSlo(disponible: false, motivo: m['motivo']?.toString());
    int? oi(dynamic v) => parseDoubleOrNull(v)?.round();
    return InformeSlo(
      disponible: true,
      ventanaDias: _int(m['ventanaDias']),
      slos: _lista(m['slos']).map(SloAdmin.fromJson).toList(),
      latencias: _lista(m['latencias']).map((l) => LatenciaAdmin(l['paso']?.toString() ?? '', l['nodo']?.toString(), _int(l['n']), oi(l['p50']), oi(l['p95']), oi(l['p99']), oi(l['max']))).toList(),
    );
  }
}

/// Un paso de una compra en la traza (`vuelos_traza`).
class EventoTraza {
  final int seq;
  final String ts;
  final String correlacion;
  final String paso;
  final String resultado; // ok | error | aviso
  final String detalle;
  final String? nodo;
  final int? ms;
  final double? monto;
  final String? cliente;
  final String? traceId;
  const EventoTraza({
    required this.seq,
    required this.ts,
    required this.correlacion,
    required this.paso,
    required this.resultado,
    required this.detalle,
    this.nodo,
    this.ms,
    this.monto,
    this.cliente,
    this.traceId,
  });

  factory EventoTraza.fromJson(Map<String, dynamic> m) => EventoTraza(
        seq: _int(m['seq']),
        ts: m['ts']?.toString() ?? '',
        correlacion: m['correlacion']?.toString() ?? '',
        paso: m['paso']?.toString() ?? '',
        resultado: m['resultado']?.toString() ?? '',
        detalle: m['detalle']?.toString() ?? '',
        nodo: m['nodo']?.toString(),
        ms: parseDoubleOrNull(m['ms'])?.round(),
        monto: parseDoubleOrNull(m['monto']),
        cliente: m['cliente']?.toString(),
        traceId: m['traceId']?.toString(),
      );

  static List<EventoTraza> lista(dynamic j) => _lista(j).map(EventoTraza.fromJson).toList();
}
