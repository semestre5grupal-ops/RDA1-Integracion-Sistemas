import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../services/api_client.dart';
import '../services/booking_services.dart';
import '../utils/json_parse.dart';
import 'vuelos_modal_kit.dart';

/// Réplica de `ModalPostventa.jsx`: check-in, equipaje y cancelación de una
/// reserva de vuelo en un único diálogo.
///
/// · La `Idempotency-Key` se genera AL ABRIR y se reutiliza en todos los
///   reintentos: un doble clic no cobra ni cancela dos veces.
/// · La cotización de cancelación se pide AL ABRIR (`/cancellation-quote` crea
///   una fila nueva por llamada y caduca a 15 min); se confirma con su `quoteId`.
/// · No se cierra a mitad de un envío.
enum TipoPostventa { checkin, equipaje, cancelar }

class ResultadoPostventa {
  final TipoPostventa tipo;
  final Map<String, dynamic> resultado;
  const ResultadoPostventa(this.tipo, this.resultado);

  /// Mensaje de éxito de `trasPostventa()` en DetalleReservaPage.jsx.
  String get mensaje {
    switch (tipo) {
      case TipoPostventa.checkin:
        return 'Check-in registrado. Ya tienes tu pase de abordar.';
      case TipoPostventa.equipaje:
        return 'Maleta añadida. ${resultado['totalBaggage'] ?? ''} en total por este trayecto.';
      case TipoPostventa.cancelar:
        if (resultado['status']?.toString() == 'CANCELLATION_PENDING') {
          return 'Cancelación registrada y pendiente de revisión. Te avisaremos por correo.';
        }
        return 'Reserva cancelada. Se devuelven ${resultado['refundAmount'] ?? '0.00'} ${resultado['currency'] ?? ''}'.trim();
    }
  }
}

class ModalPostventa extends StatefulWidget {
  final TipoPostventa tipo;
  final String bookingId;
  final String pnr;
  final String? token;

  const ModalPostventa({super.key, required this.tipo, required this.bookingId, required this.pnr, this.token});

  static Future<ResultadoPostventa?> show(
    BuildContext context, {
    required TipoPostventa tipo,
    required String bookingId,
    required String pnr,
    String? token,
  }) {
    return showDialog<ResultadoPostventa>(
      context: context,
      barrierDismissible: false,
      builder: (_) => ModalPostventa(tipo: tipo, bookingId: bookingId, pnr: pnr, token: token),
    );
  }

  @override
  State<ModalPostventa> createState() => _ModalPostventaState();
}

class _ModalPostventaState extends State<ModalPostventa> {
  static const _titulos = {
    TipoPostventa.checkin: 'Hacer check-in',
    TipoPostventa.equipaje: 'Añadir equipaje',
    TipoPostventa.cancelar: 'Cancelar reserva',
  };
  static const _textoConfirmar = {
    TipoPostventa.checkin: 'Confirmar check-in',
    TipoPostventa.equipaje: 'Añadir maleta',
    TipoPostventa.cancelar: 'Cancelar definitivamente',
  };

  // UNA clave por apertura (claveRef de React).
  final String _clave = const Uuid().v4();

  String? _error;
  bool _enviando = false;
  bool _cargando = true;

  Map<String, dynamic>? _cotizacion;
  final _motivoCtrl = TextEditingController();

  List<Map<String, dynamic>> _pasajeros = [];
  List<Map<String, dynamic>> _opcionesEquipaje = [];
  int _opcion = 0;
  int _cantidad = 1;

  @override
  void initState() {
    super.initState();
    _cargarDatosIniciales();
  }

  @override
  void dispose() {
    _motivoCtrl.dispose();
    super.dispose();
  }

  String _detalle(Object e, String fallback) => (e is ApiException && e.detail.isNotEmpty) ? e.detail : fallback;

  Future<void> _cargarDatosIniciales() async {
    try {
      switch (widget.tipo) {
        case TipoPostventa.cancelar:
          final c = await BookingServices.cotizarCancelacionVuelo(widget.bookingId, token: widget.token);
          if (mounted) setState(() => _cotizacion = c);
          break;
        case TipoPostventa.checkin:
        case TipoPostventa.equipaje:
          final detalle = await BookingServices.getVueloBookingDetalle(widget.bookingId, token: widget.token);
          final pax = extractList(detalle?['passengers'] is List ? detalle!['passengers'] : const []);
          List<Map<String, dynamic>> opciones = const [];
          if (widget.tipo == TipoPostventa.equipaje) {
            opciones = await BookingServices.listarOpcionesEquipaje(widget.bookingId, token: widget.token);
          }
          if (mounted) {
            setState(() {
              _pasajeros = pax;
              _opcionesEquipaje = opciones;
            });
          }
          break;
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = _detalle(
              e,
              widget.tipo == TipoPostventa.cancelar ? 'No se pudo calcular la penalidad.' : 'No se pudieron cargar las opciones de equipaje.',
            ));
      }
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  Future<void> _confirmar() async {
    setState(() {
      _enviando = true;
      _error = null;
    });
    try {
      Map<String, dynamic> resultado;
      switch (widget.tipo) {
        case TipoPostventa.checkin:
          resultado = await BookingServices.checkinVuelo(widget.bookingId, token: widget.token);
          break;
        case TipoPostventa.equipaje:
          final elegida = _opcionesEquipaje.isNotEmpty ? _opcionesEquipaje[_opcion] : null;
          if (elegida == null) {
            setState(() {
              _error = 'Elige un pasajero.';
              _enviando = false;
            });
            return;
          }
          resultado = await BookingServices.agregarEquipajeVuelo(
            widget.bookingId,
            passengerId: elegida['passengerId'].toString(),
            itineraryId: elegida['itineraryId'].toString(),
            quantity: _cantidad,
            // Referencia de la Payment API: esta API no procesa tarjetas.
            paymentReference: 'PAY-WEB-${_clave.substring(0, 8)}',
            idempotencyKey: _clave,
            token: widget.token,
          );
          break;
        case TipoPostventa.cancelar:
          if (_cotizacion == null) return;
          resultado = await BookingServices.cancelarReservaVuelo(
            widget.bookingId,
            quoteId: _cotizacion!['quoteId'].toString(),
            reason: _motivoCtrl.text,
            idempotencyKey: _clave,
            token: widget.token,
          );
          break;
      }
      if (mounted) Navigator.of(context).pop(ResultadoPostventa(widget.tipo, resultado));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = _detalle(
          e,
          switch (widget.tipo) {
            TipoPostventa.checkin => 'No se pudo hacer el check-in.',
            TipoPostventa.equipaje => 'No se pudo añadir la maleta.',
            TipoPostventa.cancelar => 'No se pudo cancelar la reserva.',
          }));
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  String _nombrePasajero(String passengerId) {
    for (final p in _pasajeros) {
      if (p['passengerId']?.toString() == passengerId) {
        return '${p['firstName'] ?? ''} ${p['lastName'] ?? ''}'.trim();
      }
    }
    return passengerId;
  }

  @override
  Widget build(BuildContext context) {
    final deshabilitado = _enviando ||
        _cargando ||
        (widget.tipo == TipoPostventa.cancelar && _cotizacion == null) ||
        (widget.tipo == TipoPostventa.equipaje && _opcionesEquipaje.isEmpty);

    return VuelosModalShell(
      titulo: _titulos[widget.tipo]!,
      onCerrar: _enviando ? null : () => Navigator.of(context).pop(),
      cuerpo: [
        if (_error != null) VuelosModalError(_error!),
        if (_cargando)
          const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
        else
          ...switch (widget.tipo) {
            TipoPostventa.checkin => _cuerpoCheckin(),
            TipoPostventa.equipaje => _cuerpoEquipaje(),
            TipoPostventa.cancelar => _cuerpoCancelar(),
          },
      ],
      pie: Wrap(
        alignment: WrapAlignment.end,
        spacing: 8,
        runSpacing: 8,
        children: [
          VuelosBoton(
            widget.tipo == TipoPostventa.cancelar ? 'Conservar reserva' : 'Cerrar',
            tipo: VuelosBotonTipo.secundario,
            onPressed: _enviando ? null : () => Navigator.of(context).pop(),
          ),
          VuelosBoton(
            _enviando ? 'Procesando…' : _textoConfirmar[widget.tipo]!,
            tipo: widget.tipo == TipoPostventa.cancelar ? VuelosBotonTipo.peligro : VuelosBotonTipo.primario,
            onPressed: deshabilitado ? null : _confirmar,
          ),
        ],
      ),
    );
  }

  List<Widget> _cuerpoCheckin() => [
        Text.rich(TextSpan(children: [
          const TextSpan(text: 'Vas a presentar el documento de viaje de la reserva '),
          TextSpan(text: widget.pnr, style: const TextStyle(fontWeight: FontWeight.w700)),
          const TextSpan(text: '. El check-in queda registrado y ya no podrás repetirlo.'),
        ])),
        const SizedBox(height: 8),
        for (final p in _pasajeros)
          Padding(
            padding: const EdgeInsets.only(left: 8, top: 4),
            child: Text(
              '• ${p['firstName'] ?? ''} ${p['lastName'] ?? ''} — '
              '${p['documentType'] == 'PASSPORT' ? 'Pasaporte' : 'Cédula'} ${p['documentNumber'] ?? ''}',
              style: const TextStyle(fontSize: 13),
            ),
          ),
        const VuelosModalNota('El check-in abre 48 horas antes de la salida.'),
      ];

  List<Widget> _cuerpoEquipaje() {
    final elegida = _opcionesEquipaje.isNotEmpty ? _opcionesEquipaje[_opcion] : null;
    final comprado = parseInt(elegida?['alreadyPurchased']);
    final maxCompra = (3 - comprado).clamp(0, 3);
    final precioUnitario = parseDouble(elegida?['price']);
    final total = precioUnitario * _cantidad;
    if (_opcionesEquipaje.isEmpty) {
      return const [VuelosModalNota('Esta reserva no tiene opciones de equipaje adicional.')];
    }
    return [
      VuelosCampo(
        etiqueta: 'Pasajero',
        child: DropdownButtonFormField<int>(
          value: _opcion,
          isExpanded: true,
          decoration: vuelosInputDecoration(),
          items: [
            for (var i = 0; i < _opcionesEquipaje.length; i++)
              DropdownMenuItem(
                value: i,
                child: Text(
                  () {
                    final o = _opcionesEquipaje[i];
                    final ya = parseInt(o['alreadyPurchased']);
                    final base = parseInt(o['maxAllowed']) - ya;
                    return '${_nombrePasajero(o['passengerId'].toString())} — incluye base de $base'
                        '${ya > 0 ? ', ya extra compradas: $ya' : ''}';
                  }(),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
          onChanged: (v) => setState(() {
            _opcion = v ?? 0;
            _cantidad = 1;
          }),
        ),
      ),
      VuelosCampo(
        etiqueta: 'Equipaje de bodega extra',
        child: Row(
          children: [
            IconButton(
              tooltip: 'Quitar una maleta',
              onPressed: _cantidad > 1 ? () => setState(() => _cantidad--) : null,
              icon: const Icon(Icons.remove_circle_outline),
            ),
            Text('$_cantidad', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            IconButton(
              tooltip: 'Añadir una maleta',
              onPressed: _cantidad < maxCompra ? () => setState(() => _cantidad++) : null,
              icon: const Icon(Icons.add_circle_outline),
            ),
            const SizedBox(width: 8),
            Flexible(child: Text('Máximo $maxCompra', style: const TextStyle(fontSize: 12, color: VuelosModalColors.textMuted))),
          ],
        ),
      ),
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Text('Total a pagar', style: TextStyle(fontSize: 13, color: VuelosModalColors.textMuted)),
          Text(formatearMoneda(context, total), style: const TextStyle(fontSize: 18.4, fontWeight: FontWeight.w800, color: VuelosModalColors.bookingBlue)),
        ],
      ),
      const VuelosModalNota('Las maletas se cobran aparte del vuelo y no son reembolsables.'),
    ];
  }

  List<Widget> _cuerpoCancelar() {
    final c = _cotizacion;
    if (c == null) {
      return [if (_error == null) const Text('Calculando la penalidad…')];
    }
    final reembolso = parseDouble(c['refundAmount']);
    final penalidad = parseDouble(c['penaltyAmount']);
    final expira = DateTime.tryParse(c['expiresAt']?.toString() ?? '')?.toLocal();
    return [
      VuelosCotizacion([
        CotizacionFila('Importe de la reserva', formatearMoneda(context, reembolso + penalidad)),
        CotizacionFila('Penalidad por cancelación', '−${formatearMoneda(context, penalidad)}', penalidad: true),
        CotizacionFila('Te devolveríamos', formatearMoneda(context, reembolso), total: true),
      ]),
      if (!parseBool(c['isRefundable'], true))
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: const Color(0xFFFFF7E6), borderRadius: BorderRadius.circular(6)),
          child: const Text.rich(TextSpan(children: [
            TextSpan(text: 'Esta reserva '),
            TextSpan(text: 'no admite reembolso', style: TextStyle(fontWeight: FontWeight.w700)),
            TextSpan(text: '. Se enviará a revisión manual y quedará pendiente de cancelación.'),
          ])),
        ),
      VuelosCampo(
        etiqueta: 'Motivo (opcional)',
        child: TextField(
          controller: _motivoCtrl,
          maxLength: 200,
          inputFormatters: [LengthLimitingTextInputFormatter(200)],
          decoration: vuelosInputDecoration(hint: 'Por ejemplo: cambio de planes').copyWith(counterText: ''),
        ),
      ),
      if (expira != null) VuelosModalNota('Cotización válida hasta las ${DateFormat('HH:mm').format(expira)}.'),
    ];
  }
}
