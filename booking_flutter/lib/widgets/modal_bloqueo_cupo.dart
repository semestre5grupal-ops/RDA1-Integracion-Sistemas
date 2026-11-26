import 'dart:async';

import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../models/vuelo.dart';
import '../services/api_client.dart';
import '../services/booking_services.dart';
import '../utils/json_parse.dart';
import 'vuelos_modal_kit.dart';

/// Réplica de `ModalBloqueoCupo.jsx`: elegir cabina y bloquear el cupo con
/// `POST /vuelos/offers/hold`.
///
/// · El hold retiene inventario y CONGELA el precio durante el tiempo que fija
///   el backend (`expiresAt` / `ttlMinutes`). La cuenta atrás se calcula
///   contra `expiresAt`, no contra una duración supuesta.
/// · El hold NO asigna asientos: el mapa se muestra como referencia.
/// · La `Idempotency-Key` se genera UNA vez al abrir y se reutiliza en todos los
///   reintentos: un doble clic no crea dos holds ni consume doble inventario.
class ResultadoHold {
  final Map<String, dynamic> hold;
  final VueloCabinOption cabina;
  const ResultadoHold(this.hold, this.cabina);

  String get holdId => hold['holdId']?.toString() ?? '';
  String? get expiresAt => hold['expiresAt']?.toString();
}

const Map<String, String> _cabinEs = {
  'ECONOMY': 'Economica',
  'PREMIUM_ECONOMY': 'Premium Economy',
  'BUSINESS': 'Ejecutiva',
  'FIRST': 'Primera',
};

/// Segundos → `m:ss`.
String formatoCuentaAtras(int segundos) {
  final s = segundos < 0 ? 0 : segundos;
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

class ModalBloqueoCupo extends StatefulWidget {
  final Vuelo oferta;
  final Map<String, int> pasajeros;
  final String? cabinaInicial;
  final String? token;

  const ModalBloqueoCupo({super.key, required this.oferta, required this.pasajeros, this.cabinaInicial, this.token});

  static Future<ResultadoHold?> show(
    BuildContext context, {
    required Vuelo oferta,
    required Map<String, int> pasajeros,
    String? cabinaInicial,
    String? token,
  }) {
    return showDialog<ResultadoHold>(
      context: context,
      barrierDismissible: false,
      builder: (_) => ModalBloqueoCupo(oferta: oferta, pasajeros: pasajeros, cabinaInicial: cabinaInicial, token: token),
    );
  }

  @override
  State<ModalBloqueoCupo> createState() => _ModalBloqueoCupoState();
}

class _ModalBloqueoCupoState extends State<ModalBloqueoCupo> {
  // Una clave por intención de negocio: se genera al abrir y NO cambia al reintentar.
  final String _clave = const Uuid().v4();

  String? _cabina;
  Map<String, dynamic>? _mapa;
  bool _cargandoMapa = true;
  bool _creando = false;
  String? _error;
  Map<String, dynamic>? _hold;
  int _restantes = 0;
  Timer? _timer;

  VueloItinerary? get _itinerario => widget.oferta.itineraries.isNotEmpty ? widget.oferta.itineraries.first : null;
  List<VueloCabinOption> get _opciones => _itinerario?.pricingOptions ?? const [];

  @override
  void initState() {
    super.initState();
    final opciones = _opciones;
    _cabina = opciones.any((o) => o.cabinClass == widget.cabinaInicial) ? widget.cabinaInicial : (opciones.isNotEmpty ? opciones.first.cabinClass : null);
    _cargarMapa();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _cargarMapa() async {
    final segId = _itinerario?.segments.isNotEmpty == true ? _itinerario!.segments.first.segmentId : '';
    // El mapa es informativo: si falla, el hold sigue siendo posible.
    final datos = await BookingServices.obtenerMapaAsientos(widget.oferta.offerId, segId);
    if (!mounted) return;
    setState(() {
      _mapa = datos;
      _cargandoMapa = false;
    });
  }

  void _arrancarCuentaAtras() {
    _timer?.cancel();
    final expira = DateTime.tryParse(_hold?['expiresAt']?.toString() ?? '');
    if (expira == null) return;
    void calcular() {
      final s = expira.difference(DateTime.now()).inSeconds;
      if (mounted) setState(() => _restantes = s < 0 ? 0 : s);
      if (s <= 0) _timer?.cancel();
    }

    calcular();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => calcular());
  }

  Future<void> _confirmar() async {
    final cabina = _cabina;
    if (cabina == null) return;
    setState(() {
      _creando = true;
      _error = null;
    });
    try {
      final opcion = _opciones.firstWhere((o) => o.cabinClass == cabina);
      // Una selección por itinerario (ida y, si existe, vuelta) con la cabina elegida.
      final selections = widget.oferta.itineraries.map((it) => {'itineraryId': it.itineraryId, 'cabinClass': cabina, 'fareBrand': opcion.fareBrand}).toList();
      final respuesta = await BookingServices.crearHoldVuelo(
        offerId: widget.oferta.offerId,
        itinerarySelections: selections,
        passengersBreakdown: widget.pasajeros,
        idempotencyKey: _clave,
        token: widget.token,
      );
      final hold = respuesta['data'] is Map ? Map<String, dynamic>.from(respuesta['data']) : respuesta;
      if ((hold['holdId']?.toString() ?? '').isEmpty) {
        // No se inventa un holdId: sin él la reserva posterior fallaría.
        throw ApiException(statusCode: 502, title: 'Hold inválido', detail: 'La aerolínea no devolvió un identificador de bloqueo.');
      }
      setState(() => _hold = hold);
      _arrancarCuentaAtras();
    } catch (e) {
      setState(() => _error = (e is ApiException && e.detail.isNotEmpty) ? e.userMessageConCodigo : 'No se pudo bloquear el cupo. Intentalo de nuevo.');
    } finally {
      if (mounted) setState(() => _creando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final seg = _itinerario?.segments.isNotEmpty == true ? _itinerario!.segments.first : null;
    final hold = _hold;
    final caducado = hold != null && hold['expiresAt'] != null && _restantes <= 0;

    return VuelosModalShell(
      titulo: 'Elegir cabina y bloquear el cupo',
      onCerrar: _creando ? null : () => Navigator.of(context).pop(),
      cuerpo: [
        Text(
          '${seg != null ? '${seg.originIata} → ${seg.destinationIata} · ${seg.flightNumber}' : 'Vuelo'} · ${widget.oferta.airlineName}',
          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: VuelosModalColors.textDark),
        ),
        const SizedBox(height: 12),
        const Text('Cabina', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        if (_opciones.isEmpty)
          const VuelosModalNota('Este vuelo no tiene cabinas con disponibilidad.')
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _opciones
                .map((o) => VuelosRadioCard(
                      activo: _cabina == o.cabinClass,
                      nombre: _cabinEs[o.cabinClass] ?? o.cabinClass,
                      meta: '${o.availableSeats} libres',
                      onTap: (_creando || hold != null) ? null : () => setState(() => _cabina = o.cabinClass),
                    ))
                .toList(),
          ),
        const SizedBox(height: 16),
        const Text.rich(TextSpan(children: [
          TextSpan(text: 'Mapa de asientos', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          TextSpan(text: ' referencial; el hold no asigna asientos', style: TextStyle(fontSize: 11, color: VuelosModalColors.textMuted)),
        ])),
        const SizedBox(height: 6),
        if (_cargandoMapa) const VuelosModalNota('Cargando mapa de asientos…') else _MapaAsientosReferencial(mapa: _mapa),
        if (_error != null) ...[const SizedBox(height: 12), VuelosModalError(_error!)],
      ],
      pie: hold != null
          ? Semantics(
              liveRegion: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('✓ Cupo bloqueado por ${hold['ttlMinutes'] ?? ''} minutos',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: VuelosModalColors.exito)),
                  const SizedBox(height: 2),
                  Text.rich(
                      TextSpan(children: [
                        const TextSpan(text: 'Precio congelado '),
                        TextSpan(text: formatearMoneda(context, hold['lockedPrice']), style: const TextStyle(fontWeight: FontWeight.w700)),
                      ]),
                      style: const TextStyle(fontSize: 12, color: VuelosModalColors.textMuted)),
                  if (hold['expiresAt'] != null)
                    Text(
                      caducado ? 'El bloqueo ha caducado' : 'Caduca en ${formatoCuentaAtras(_restantes)}',
                      style: TextStyle(
                        fontSize: 16.8,
                        fontWeight: FontWeight.w800,
                        color: caducado ? VuelosModalColors.errorFg : VuelosModalColors.bookingBlue,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  Text('Hold ID: ${hold['holdId']}', style: const TextStyle(fontSize: 12, color: VuelosModalColors.textMuted)),
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerRight,
                    child: VuelosBoton(
                      'Continuar con los pasajeros',
                      onPressed: caducado
                          ? null
                          : () => Navigator.of(context).pop(
                                ResultadoHold(hold, _opciones.firstWhere((o) => o.cabinClass == _cabina)),
                              ),
                    ),
                  ),
                ],
              ),
            )
          : Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 12,
              runSpacing: 8,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Total a bloquear', style: TextStyle(fontSize: 12, color: VuelosModalColors.textMuted)),
                    Text(formatearMoneda(context, widget.oferta.totalPrice),
                        style: const TextStyle(fontSize: 18.4, fontWeight: FontWeight.w800, color: VuelosModalColors.bookingBlue)),
                  ],
                ),
                Wrap(
                  spacing: 8,
                  children: [
                    VuelosBoton('Cancelar', tipo: VuelosBotonTipo.secundario, onPressed: _creando ? null : () => Navigator.of(context).pop()),
                    VuelosBoton(_creando ? 'Bloqueando…' : 'Bloquear cupo', onPressed: (_creando || _cabina == null) ? null : _confirmar),
                  ],
                ),
              ],
            ),
    );
  }
}

/// Mapa de asientos de solo lectura (`cabins[].rows[].seats[]` del contrato).
class _MapaAsientosReferencial extends StatelessWidget {
  final Map<String, dynamic>? mapa;
  const _MapaAsientosReferencial({required this.mapa});

  @override
  Widget build(BuildContext context) {
    final cabinas = extractList(mapa?['cabins'] is List ? mapa!['cabins'] : const []);
    if (cabinas.isEmpty) {
      return const VuelosModalNota('No se pudo cargar el mapa de asientos. Puedes bloquear el cupo igualmente.');
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final cab in cabinas) ...[
          Text(_cabinEs[cab['cabinClass']] ?? cab['cabinClass']?.toString() ?? '',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: VuelosModalColors.textMuted)),
          const SizedBox(height: 4),
          for (final fila in extractList(cab['rows'] is List ? cab['rows'] : const []))
            Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    SizedBox(width: 24, child: Text('${fila['rowNumber'] ?? ''}', style: const TextStyle(fontSize: 11, color: VuelosModalColors.textMuted))),
                    for (final a in extractList(fila['seats'] is List ? fila['seats'] : const [])) _asiento(a),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 8),
        ],
        Row(children: [
          _celda('A', true),
          const Text(' libre   ', style: TextStyle(fontSize: 11)),
          _celda('A', false),
          const Text(' ocupado', style: TextStyle(fontSize: 11)),
        ]),
      ],
    );
  }

  Widget _asiento(Map<String, dynamic> a) {
    final numero = a['seatNumber']?.toString() ?? '';
    final libre = parseBool(a['isAvailable']);
    final caract = stringList(a['characteristics']);
    return Tooltip(
      message: libre ? '$numero libre${caract.isNotEmpty ? ' · ${caract.join(', ')}' : ''}' : '$numero ocupado',
      child: _celda(numero.replaceFirst(RegExp(r'^\d+'), ''), libre),
    );
  }

  static Widget _celda(String letra, bool libre) => Container(
        width: 22,
        height: 22,
        margin: const EdgeInsets.only(right: 3),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: libre ? const Color(0xFFE8F1FD) : const Color(0xFFE5E7EB),
          border: Border.all(color: libre ? VuelosModalColors.bookingBlue : const Color(0xFFBDBDBD)),
          borderRadius: BorderRadius.circular(3),
        ),
        child: Text(letra, style: TextStyle(fontSize: 10, color: libre ? VuelosModalColors.bookingBlue : const Color(0xFF9E9E9E))),
      );
}
