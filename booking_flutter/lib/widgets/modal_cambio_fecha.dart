import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../services/api_client.dart';
import '../services/booking_services.dart';
import '../utils/json_parse.dart';
import 'vuelos_modal_kit.dart';

/// Réplica de `ModalCambioFecha.jsx`.
///
/// Tres pasos, no uno: `date-change/search` devuelve ofertas que caducan a 30
/// minutos; se MUESTRAN con su diferencia de precio y solo se aplican con un
/// botón aparte (`date-change`). La `Idempotency-Key` se genera al abrir.
/// El `segmentId` no cambia: boleto y asiento se conservan. El módulo no
/// devuelve dinero: si el vuelo nuevo es más barato la diferencia es 0.
class ResultadoCambioFecha {
  final Map<String, dynamic> resultado;
  final Map<String, dynamic> oferta;
  const ResultadoCambioFecha(this.resultado, this.oferta);

  /// Mensaje de `trasCambioFecha()` en DetalleReservaPage.jsx.
  String get mensaje {
    final segs = extractList(oferta['segments'] is List ? oferta['segments'] : const []);
    final vuelo = segs.isNotEmpty ? (segs.first['flightNumber']?.toString() ?? '') : '';
    return 'Fecha cambiada a ${fechaLegible(oferta['newDepartureDate']?.toString())}'
        '${vuelo.isNotEmpty ? ' en el vuelo $vuelo' : ''}. Tu boleto y tu asiento se mantienen.';
  }
}

/// `2026-11-12` → `12 nov 2026`, trabajando sobre la cadena (sin zona horaria).
String fechaLegible(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(iso);
  if (m == null) return iso;
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return '${m[3]} ${meses[int.parse(m[2]!) - 1]} ${m[1]}';
}

/// `2026-11-12T15:00:00.000Z` → `15:00` (sobre la cadena, como React).
String horaDeIso(String? iso) {
  final m = RegExp(r'T(\d{2}:\d{2})').firstMatch(iso ?? '');
  return m?.group(1) ?? '--:--';
}

class ModalCambioFecha extends StatefulWidget {
  final String bookingId;
  final String pnr;
  final String? token;

  const ModalCambioFecha({super.key, required this.bookingId, required this.pnr, this.token});

  static Future<ResultadoCambioFecha?> show(BuildContext context, {required String bookingId, required String pnr, String? token}) {
    return showDialog<ResultadoCambioFecha>(
      context: context,
      barrierDismissible: false,
      builder: (_) => ModalCambioFecha(bookingId: bookingId, pnr: pnr, token: token),
    );
  }

  @override
  State<ModalCambioFecha> createState() => _ModalCambioFechaState();
}

class _ModalCambioFechaState extends State<ModalCambioFecha> {
  final String _clave = const Uuid().v4();

  String? _error;
  bool _enviando = false;
  bool _buscando = false;
  bool _cargandoReserva = true;

  List<Map<String, dynamic>> _itinerarios = [];
  String _itinerarioId = '';
  DateTime _fecha = DateTime.now();

  List<Map<String, dynamic>>? _ofertas;
  int _elegida = 0;

  @override
  void initState() {
    super.initState();
    _cargarReserva();
  }

  String _detalle(Object e, String fallback) => (e is ApiException && e.detail.isNotEmpty) ? e.detail : fallback;

  /// React recibe `reserva` ya cargada; aquí se obtiene `GET /vuelos/bookings/:id`
  /// para conocer sus itinerarios.
  Future<void> _cargarReserva() async {
    final detalle = await BookingServices.getVueloBookingDetalle(widget.bookingId, token: widget.token);
    if (!mounted) return;
    final its = extractList(detalle?['itineraries'] is List ? detalle!['itineraries'] : const []);
    setState(() {
      _itinerarios = its;
      _itinerarioId = its.isNotEmpty ? (its.first['itineraryId']?.toString() ?? '') : '';
      _cargandoReserva = false;
      if (its.isEmpty) _error = 'No se pudo cargar el itinerario de la reserva.';
    });
  }

  Future<void> _buscar() async {
    if (_itinerarioId.isEmpty) return;
    setState(() {
      _buscando = true;
      _error = null;
      _ofertas = null;
      _elegida = 0;
    });
    try {
      final r = await BookingServices.buscarCambioFechaVuelo(
        widget.bookingId,
        itineraryId: _itinerarioId,
        newDepartureDate: DateFormat('yyyy-MM-dd').format(_fecha),
        token: widget.token,
      );
      if (mounted) setState(() => _ofertas = r);
    } catch (e) {
      if (mounted) setState(() => _error = _detalle(e, 'No se pudo buscar disponibilidad para esa fecha.'));
    } finally {
      if (mounted) setState(() => _buscando = false);
    }
  }

  Future<void> _confirmar() async {
    final oferta = (_ofertas ?? const []).length > _elegida ? _ofertas![_elegida] : null;
    if (oferta == null) {
      setState(() => _error = 'Elige un vuelo antes de aplicar el cambio.');
      return;
    }
    setState(() {
      _enviando = true;
      _error = null;
    });
    try {
      final changeOfferId = oferta['changeOfferId'].toString();
      final aPagar = _aPagar(oferta);
      final resultado = await BookingServices.confirmarCambioFechaVuelo(
        widget.bookingId,
        changeOfferId: changeOfferId,
        // El backend exige paymentReference cuando hay diferencia (si no, 422).
        paymentReference: aPagar > 0 ? 'cambio_${changeOfferId.substring(0, changeOfferId.length < 8 ? changeOfferId.length : 8)}' : null,
        idempotencyKey: _clave,
        token: widget.token,
      );
      if (mounted) Navigator.of(context).pop(ResultadoCambioFecha(resultado, oferta));
    } catch (e) {
      if (mounted) setState(() => _error = _detalle(e, 'No se pudo aplicar el cambio de fecha.'));
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  Map<String, dynamic> _diferencia(Map<String, dynamic>? o) =>
      o?['priceDifference'] is Map ? Map<String, dynamic>.from(o!['priceDifference']) : <String, dynamic>{};

  double _aPagar(Map<String, dynamic>? o) => parseDouble(_diferencia(o)['totalToPay']);

  String _rutaItinerario(Map<String, dynamic> it) {
    final segs = extractList(it['segments'] is List ? it['segments'] : const []);
    final ruta = segs.map((s) => '${s['departureIataCode'] ?? ''}–${s['arrivalIataCode'] ?? ''}').join(', ');
    return '$ruta (${it['itineraryId']})';
  }

  @override
  Widget build(BuildContext context) {
    final ofertas = _ofertas ?? const <Map<String, dynamic>>[];
    final hayOfertas = ofertas.isNotEmpty;
    final oferta = hayOfertas ? ofertas[_elegida] : null;
    final aPagar = _aPagar(oferta);
    final hayDiferencia = aPagar > 0;
    final dif = _diferencia(oferta);

    return VuelosModalShell(
      titulo: 'Cambiar la fecha',
      onCerrar: _enviando ? null : () => Navigator.of(context).pop(),
      cuerpo: [
        if (_error != null) VuelosModalError(_error!),
        Text.rich(TextSpan(children: [
          const TextSpan(text: 'Vas a cambiar la fecha del vuelo de la reserva '),
          TextSpan(text: widget.pnr, style: const TextStyle(fontWeight: FontWeight.w700)),
          const TextSpan(text: '. Tu boleto y tu asiento se conservan: solo se mueve el vuelo.'),
        ])),
        const SizedBox(height: 12),
        if (_cargandoReserva)
          const Center(child: Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator()))
        else ...[
          if (_itinerarios.length > 1)
            VuelosCampo(
              etiqueta: 'Itinerario',
              child: DropdownButtonFormField<String>(
                value: _itinerarioId,
                isExpanded: true,
                decoration: vuelosInputDecoration(),
                items: _itinerarios
                    .map((it) => DropdownMenuItem(
                          value: it['itineraryId']?.toString() ?? '',
                          child: Text(_rutaItinerario(it), overflow: TextOverflow.ellipsis),
                        ))
                    .toList(),
                onChanged: (v) => setState(() {
                  _itinerarioId = v ?? _itinerarioId;
                  _ofertas = null;
                }),
              ),
            ),
          VuelosCampo(
            etiqueta: 'Nueva fecha de salida',
            child: InkWell(
              onTap: () async {
                final hoy = DateTime.now();
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _fecha.isBefore(hoy) ? hoy : _fecha,
                  firstDate: DateTime(hoy.year, hoy.month, hoy.day),
                  lastDate: hoy.add(const Duration(days: 365)),
                );
                if (picked != null) {
                  setState(() {
                    _fecha = picked;
                    _ofertas = null;
                  });
                }
              },
              child: InputDecorator(
                decoration: vuelosInputDecoration(),
                child: Row(
                  children: [
                    const Icon(Icons.calendar_today_outlined, size: 16, color: VuelosModalColors.textMuted),
                    const SizedBox(width: 8),
                    Text(fechaLegible(DateFormat('yyyy-MM-dd').format(_fecha))),
                  ],
                ),
              ),
            ),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: VuelosBoton(
              _buscando ? 'Buscando…' : 'Buscar vuelos',
              tipo: VuelosBotonTipo.secundario,
              onPressed: (_buscando || _enviando || _itinerarioId.isEmpty) ? null : _buscar,
            ),
          ),
        ],
        Semantics(
          liveRegion: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_ofertas != null && !hayOfertas) const VuelosModalNota('No hay ningún vuelo con la misma ruta en esa fecha. Prueba con otra.'),
              if (hayOfertas) ...[
                VuelosModalNota(ofertas.length == 1 ? '1 vuelo disponible. Elige y revisa la diferencia.' : '${ofertas.length} vuelos disponibles. Elige uno.'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (var i = 0; i < ofertas.length; i++)
                      () {
                        final o = ofertas[i];
                        final segs = extractList(o['segments'] is List ? o['segments'] : const []);
                        final seg = segs.isNotEmpty ? segs.first : <String, dynamic>{};
                        return VuelosRadioCard(
                          activo: _elegida == i,
                          nombre: seg['flightNumber']?.toString() ?? '',
                          meta: '${fechaLegible(o['newDepartureDate']?.toString())} · '
                              '${horaDeIso(seg['departureAt']?.toString())}–${horaDeIso(seg['arrivalAt']?.toString())} · '
                              '${seg['availableSeats'] ?? 0} libres',
                          onTap: _enviando ? null : () => setState(() => _elegida = i),
                        );
                      }(),
                  ],
                ),
                if (oferta != null)
                  VuelosCotizacion([
                    CotizacionFila('Diferencia de tarifa', formatearMoneda(context, dif['fareDifference'])),
                    CotizacionFila('Diferencia de impuestos', formatearMoneda(context, dif['taxDifference'])),
                    CotizacionFila('Gastos de cambio', formatearMoneda(context, dif['changeFee'])),
                    CotizacionFila('Total a pagar', formatearMoneda(context, aPagar), total: true),
                  ]),
                VuelosModalNota(hayDiferencia
                    ? 'Te cobraremos solo la diferencia. Tu boleto y tu asiento se mantienen.'
                    : 'Este vuelo no tiene diferencia de precio sobre el que tenías. Tu boleto y tu asiento se mantienen.'),
                const VuelosModalNota(
                  'Esta versión del módulo no devuelve dinero en un cambio de fecha: si el vuelo nuevo saliera más barato, la diferencia se calcularía en cero.',
                ),
              ],
            ],
          ),
        ),
      ],
      pie: Wrap(
        alignment: WrapAlignment.end,
        spacing: 8,
        runSpacing: 8,
        children: [
          VuelosBoton('Cancelar', tipo: VuelosBotonTipo.secundario, onPressed: _enviando ? null : () => Navigator.of(context).pop()),
          VuelosBoton(
            _enviando
                ? 'Aplicando…'
                : hayDiferencia
                    ? 'Pagar ${formatearMoneda(context, aPagar)} y cambiar'
                    : 'Cambiar sin coste',
            onPressed: (_enviando || !hayOfertas) ? null : _confirmar,
          ),
        ],
      ),
    );
  }
}
