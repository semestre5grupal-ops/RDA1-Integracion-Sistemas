import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/admin_models.dart';
import '../../providers/auth_provider.dart';
import '../../services/admin_services.dart';
import '../../services/api_client.dart';
import '../../theme/booking_colors.dart';
import '../../utils/casos_vuelo.dart';
import '../../utils/gantt.dart';

/// Panel de administración para el celular (solo lectura): resumen del negocio,
/// objetivos de servicio y compras de vuelos con su diagrama de tiempos.
///
/// Mostrarlo solo a administradores es comodidad; quien manda es el servidor,
/// que responde 403 a cualquier otra cuenta.
class AdminScreen extends StatelessWidget {
  const AdminScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    if (user == null || auth.token == null) {
      return Scaffold(appBar: AppBar(title: const Text('Administración')), body: const _Aviso('Inicia sesión para entrar al panel de administración.'));
    }
    if (!user.esAdmin) {
      return Scaffold(appBar: AppBar(title: const Text('Administración')), body: const _Aviso('No tienes permisos de administrador.'));
    }
    final token = auth.token!;
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Administración'),
          bottom: const TabBar(tabs: [Tab(text: 'Resumen'), Tab(text: 'Objetivos'), Tab(text: 'Compras')]),
        ),
        body: TabBarView(children: [_ResumenTab(token: token), _SloTab(token: token), _ComprasTab(token: token)]),
      ),
    );
  }
}

class _Aviso extends StatelessWidget {
  const _Aviso(this.texto);
  final String texto;
  @override
  Widget build(BuildContext context) => Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(texto, textAlign: TextAlign.center)));
}

String _error(Object e) => e is ApiException ? (e.statusCode == 403 ? 'El servidor no te reconoce como administrador.' : e.userMessageConCodigo) : 'No se pudo conectar. Revisa tu conexión.';

/// Carga un dato, muestra espera/error con reintento y permite arrastrar para refrescar.
class _Cargador<T> extends StatefulWidget {
  const _Cargador({super.key, required this.cargar, required this.builder});
  final Future<T> Function() cargar;
  final Widget Function(BuildContext, T) builder;
  @override
  State<_Cargador<T>> createState() => _CargadorState<T>();
}

class _CargadorState<T> extends State<_Cargador<T>> {
  late Future<T> _f = widget.cargar();

  Future<void> _refrescar() async {
    setState(() => _f = widget.cargar());
    try {
      await _f;
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: _f,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (snap.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(_error(snap.error!), textAlign: TextAlign.center),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: _refrescar, child: const Text('Reintentar')),
              ]),
            ),
          );
        }
        return RefreshIndicator(onRefresh: _refrescar, child: widget.builder(context, snap.data as T));
      },
    );
  }
}

String _usd(double v) => '\$${v.toStringAsFixed(2).replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => ',')}';

// ─── Resumen ────────────────────────────────────────────────────────────────

class _ResumenTab extends StatefulWidget {
  const _ResumenTab({required this.token});
  final String token;
  @override
  State<_ResumenTab> createState() => _ResumenTabState();
}

class _ResumenTabState extends State<_ResumenTab> {
  int _dias = 30;

  @override
  Widget build(BuildContext context) {
    return _Cargador<MetricasAdmin>(
      key: ValueKey(_dias),
      cargar: () => AdminServices.metricas(token: widget.token, dias: _dias),
      builder: (context, m) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          Wrap(spacing: 8, children: [
            for (final d in const [7, 30, 90, 365])
              ChoiceChip(label: Text('$d días'), selected: _dias == d, onSelected: (_) => setState(() => _dias = d)),
          ]),
          const SizedBox(height: 12),
          Text('${m.desde} → ${m.hasta}', style: const TextStyle(color: BookingColors.textMuted, fontSize: 12)),
          const SizedBox(height: 8),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 1.6,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            children: [
              _Kpi('Ingresos', _usd(m.kpis.ingresos), KpisAdmin.variacion(m.kpis.ingresos, m.kpisAnterior.ingresos)),
              _Kpi('Reservas', '${m.kpis.reservas}', KpisAdmin.variacion(m.kpis.reservas.toDouble(), m.kpisAnterior.reservas.toDouble())),
              _Kpi('Comisión', _usd(m.kpis.comision), KpisAdmin.variacion(m.kpis.comision, m.kpisAnterior.comision)),
              _Kpi('Ticket promedio', _usd(m.kpis.ticketPromedio), KpisAdmin.variacion(m.kpis.ticketPromedio, m.kpisAnterior.ticketPromedio)),
              _Kpi('Cancelación', '${m.kpis.tasaCancelacion}%', null),
              _Kpi('Cobradas', '${m.kpis.reservasCobradas}', null),
            ],
          ),
          const SizedBox(height: 16),
          const Text('Ingresos por día', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          _BarrasSerie(serie: m.serie),
          const SizedBox(height: 16),
          const Text('Por vertical', style: TextStyle(fontWeight: FontWeight.w700)),
          for (final v in m.porVertical)
            ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text(v.vertical), subtitle: Text('${v.kpis.reservas} reservas'), trailing: Text(_usd(v.kpis.ingresos), style: const TextStyle(fontWeight: FontWeight.w600))),
          const SizedBox(height: 8),
          const Text('Destinos más reservados', style: TextStyle(fontWeight: FontWeight.w700)),
          if (m.topDestinos.isEmpty) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Sin reservas con destino en el período.', style: TextStyle(color: BookingColors.textMuted))),
          for (final d in m.topDestinos)
            ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text(d.destino), subtitle: Text('${d.reservas} reservas'), trailing: Text(_usd(d.ingresos), style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi(this.titulo, this.valor, this.variacion);
  final String titulo;
  final String valor;
  final double? variacion;
  @override
  Widget build(BuildContext context) {
    final sube = (variacion ?? 0) >= 0;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
          Text(titulo, style: const TextStyle(color: BookingColors.textMuted, fontSize: 12)),
          const SizedBox(height: 4),
          FittedBox(fit: BoxFit.scaleDown, child: Text(valor, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
          if (variacion != null)
            Text('${sube ? '▲' : '▼'} ${variacion!.abs().toStringAsFixed(1)}% vs. período anterior', style: TextStyle(fontSize: 11, color: sube ? BookingColors.successGreen : BookingColors.errorRed)),
        ]),
      ),
    );
  }
}

class _BarrasSerie extends StatelessWidget {
  const _BarrasSerie({required this.serie});
  final List<DiaSerie> serie;
  @override
  Widget build(BuildContext context) {
    if (serie.isEmpty) return const Text('Sin datos.', style: TextStyle(color: BookingColors.textMuted));
    final maxV = serie.map((d) => d.ingresos).fold<double>(0, (a, b) => b > a ? b : a);
    return SizedBox(
      height: 90,
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        for (final d in serie)
          Expanded(
            child: Tooltip(
              message: '${d.fecha}: ${_usd(d.ingresos)} · ${d.reservas} reservas',
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 0.5),
                height: maxV <= 0 ? 2 : (2 + 88 * d.ingresos / maxV),
                color: BookingColors.actionBlue,
              ),
            ),
          ),
      ]),
    );
  }
}

// ─── Objetivos (SLO) ────────────────────────────────────────────────────────

Color _colorEstado(String e) => switch (e) {
      'critico' => BookingColors.errorRed,
      'atencion' => const Color(0xFFB36B00),
      'ok' => BookingColors.successGreen,
      _ => BookingColors.textMuted,
    };

String _textoEstado(String e) => switch (e) {
      'critico' => 'Crítico',
      'atencion' => 'Atención',
      'ok' => 'En meta',
      _ => 'Sin datos',
    };

class _SloTab extends StatelessWidget {
  const _SloTab({required this.token});
  final String token;
  @override
  Widget build(BuildContext context) {
    return _Cargador<InformeSlo>(
      cargar: () => AdminServices.slo(token: token),
      builder: (context, i) {
        if (!i.disponible) return ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(16), children: [Text(i.motivo ?? 'Objetivos no disponibles.')]);
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Text('Presupuesto de error de los últimos ${i.ventanaDias} días: lo que puede fallar sin incumplir la meta.', style: const TextStyle(color: BookingColors.textMuted, fontSize: 12)),
            const SizedBox(height: 8),
            for (final s in i.slos) _SloCard(s),
            const SizedBox(height: 8),
            const Text('Tiempos de respuesta (ms)', style: TextStyle(fontWeight: FontWeight.w700)),
            if (i.latencias.isEmpty) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Todavía no hay tiempos en este período.', style: TextStyle(color: BookingColors.textMuted))),
            for (final l in i.latencias)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text('${etiquetaPaso[l.paso] ?? l.paso}${l.nodo == null ? '' : ' · ${l.nodo}'}'),
                subtitle: Text('${l.n} medidos · p50 ${l.p50 ?? '—'} · p95 ${l.p95 ?? '—'} · p99 ${l.p99 ?? '—'} · máx ${l.max ?? '—'}'),
              ),
          ],
        );
      },
    );
  }
}

class _SloCard extends StatelessWidget {
  const _SloCard(this.s);
  final SloAdmin s;
  @override
  Widget build(BuildContext context) {
    final c = _colorEstado(s.estado);
    final consumo = s.presupuestoConsumidoPct;
    String x(double? v) => v == null ? '—' : v.toStringAsFixed(1);
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: s.estado == 'critico' ? c : BookingColors.borderLight)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(s.nombre, style: const TextStyle(fontWeight: FontWeight.w800))),
            Text(_textoEstado(s.estado), style: TextStyle(color: c, fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 4),
          Text(s.cumplimiento == null ? '—' : '${(s.cumplimiento! * 100).toStringAsFixed(2)}%', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
          Text('Meta: ${s.meta} · ${s.total} medidos, ${s.malos} fallaron', style: const TextStyle(color: BookingColors.textMuted, fontSize: 12)),
          if (consumo != null) ...[
            const SizedBox(height: 8),
            LinearProgressIndicator(value: consumo.isFinite ? (consumo / 100).clamp(0.0, 1.0) : 1.0, color: c, backgroundColor: BookingColors.borderLight),
            const SizedBox(height: 4),
            Text('Presupuesto gastado: ${consumo.isFinite ? '${consumo.toStringAsFixed(0)} %' : 'agotado'} (se permitían ${s.fallosPermitidos})', style: const TextStyle(fontSize: 12)),
          ],
          const SizedBox(height: 4),
          Text('Ritmo de gasto: 1 h ${x(s.burn1h)}x · 6 h ${x(s.burn6h)}x · 24 h ${x(s.burn24h)}x', style: const TextStyle(fontSize: 12)),
          if (s.mensaje.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(s.mensaje, style: TextStyle(fontSize: 12, color: c))),
        ]),
      ),
    );
  }
}

// ─── Compras de vuelos ──────────────────────────────────────────────────────

Color _colorCaso(EstadoCaso e) => switch (e) {
      EstadoCaso.completada => BookingColors.successGreen,
      EstadoCaso.fallo => const Color(0xFFB36B00),
      EstadoCaso.critico => BookingColors.errorRed,
      EstadoCaso.abandonada => BookingColors.textMuted,
      EstadoCaso.curso => BookingColors.actionBlue,
    };

class _ComprasTab extends StatefulWidget {
  const _ComprasTab({required this.token});
  final String token;
  @override
  State<_ComprasTab> createState() => _ComprasTabState();
}

class _ComprasTabState extends State<_ComprasTab> {
  int _horas = 24;

  @override
  Widget build(BuildContext context) {
    return _Cargador<List<EventoTraza>>(
      key: ValueKey(_horas),
      cargar: () => AdminServices.monitoreo(token: widget.token, horas: _horas),
      builder: (context, eventos) {
        final casos = armarCasosCompra(eventos);
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Wrap(spacing: 8, children: [
              for (final h in const [1, 6, 24, 72])
                ChoiceChip(label: Text('$h h'), selected: _horas == h, onSelected: (_) => setState(() => _horas = h)),
            ]),
            const SizedBox(height: 8),
            Text('${casos.length} compras · ${casos.where((c) => c.estado == EstadoCaso.completada).length} completadas · ${casos.where((c) => c.estado == EstadoCaso.fallo || c.estado == EstadoCaso.critico).length} con falla', style: const TextStyle(color: BookingColors.textMuted, fontSize: 12)),
            if (casos.isEmpty) const Padding(padding: EdgeInsets.only(top: 24), child: Center(child: Text('Sin compras en esta ventana.'))),
            for (final c in casos)
              Card(
                child: ListTile(
                  title: Text(c.etiqueta, style: TextStyle(color: _colorCaso(c.estado), fontWeight: FontWeight.w700)),
                  subtitle: Text('${c.cliente ?? 'sin cliente'}\n${c.correlacion}'),
                  isThreeLine: true,
                  trailing: Text(c.monto == null ? '' : _usd(c.monto!)),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TrazaCompraScreen(token: widget.token, caso: c))),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Diagrama de tiempos y lista de pasos de una compra.
class TrazaCompraScreen extends StatelessWidget {
  const TrazaCompraScreen({super.key, required this.token, required this.caso});
  final String token;
  final CasoVuelo caso;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Compra de vuelo')),
      body: _Cargador<List<EventoTraza>>(
        cargar: () => AdminServices.traza(token: token, id: caso.correlacion),
        builder: (context, eventos) {
          final g = barrasGantt(eventos);
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              Text(caso.etiqueta, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: _colorCaso(caso.estado))),
              SelectableText(caso.correlacion, style: const TextStyle(color: BookingColors.textMuted, fontSize: 12)),
              const SizedBox(height: 12),
              if (g.barras.isEmpty) const Text('Sin pasos con duración para dibujar.', style: TextStyle(color: BookingColors.textMuted)),
              if (g.barras.isNotEmpty) ...[
                Text('Total ${g.totalMs} ms · el paso más lento fue ${etiquetaPaso[g.masLarga!.paso] ?? g.masLarga!.paso} (${g.pctMasLarga}% del tiempo)', style: const TextStyle(fontSize: 12)),
                const SizedBox(height: 8),
                for (final b in g.barras) _FilaGantt(b: b, totalMs: g.totalMs),
              ],
              const Divider(height: 32),
              const Text('Pasos', style: TextStyle(fontWeight: FontWeight.w700)),
              for (final e in eventos)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(e.resultado == 'error' ? Icons.error_outline : e.resultado == 'aviso' ? Icons.warning_amber : Icons.check_circle_outline, color: e.resultado == 'error' ? BookingColors.errorRed : e.resultado == 'aviso' ? const Color(0xFFB36B00) : BookingColors.successGreen),
                  title: Text('${etiquetaPaso[e.paso] ?? e.paso}${e.nodo == null ? '' : ' · ${e.nodo}'}'),
                  subtitle: Text('${e.detalle}${e.ms != null ? '  (${e.ms} ms)' : ''}'),
                ),
              if (eventos.isNotEmpty && eventos.first.traceId != null) SelectableText('trace_id: ${eventos.first.traceId}', style: const TextStyle(color: BookingColors.textMuted, fontSize: 11)),
            ],
          );
        },
      ),
    );
  }
}

class _FilaGantt extends StatelessWidget {
  const _FilaGantt({required this.b, required this.totalMs});
  final BarraGantt b;
  final int totalMs;
  @override
  Widget build(BuildContext context) {
    final color = b.resultado == 'error' ? BookingColors.errorRed : b.resultado == 'aviso' ? const Color(0xFFB36B00) : BookingColors.actionBlue;
    final izq = totalMs <= 0 ? 0.0 : b.desdeMs / totalMs;
    final ancho = totalMs <= 0 ? 1.0 : (b.durMs / totalMs).clamp(0.01, 1.0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        SizedBox(width: 84, child: Text(etiquetaPaso[b.paso] ?? b.paso, style: const TextStyle(fontSize: 12), overflow: TextOverflow.ellipsis)),
        Expanded(
          child: LayoutBuilder(builder: (context, c) {
            final x = (izq * c.maxWidth).clamp(0.0, c.maxWidth - 2);
            final w = (ancho * c.maxWidth).clamp(2.0, c.maxWidth - x);
            return SizedBox(height: 14, child: Stack(children: [Positioned(left: x, width: w, top: 0, bottom: 0, child: Container(decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))))]));
          }),
        ),
        SizedBox(width: 58, child: Text('${b.durMs} ms', textAlign: TextAlign.right, style: const TextStyle(fontSize: 11))),
      ]),
    );
  }
}
