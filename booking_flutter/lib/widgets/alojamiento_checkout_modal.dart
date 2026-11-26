import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';

import '../models/alojamiento.dart';
import '../models/reserva.dart';
import '../offline/cola_reservas.dart';
import '../providers/auth_provider.dart';
import '../providers/currency_provider.dart';
import '../services/api_client.dart';
import '../services/booking_services.dart';
import '../utils/cedula_ecuador.dart';
import '../utils/json_parse.dart';

/// Réplica de `AlojamientoCheckoutModal.jsx`: checkout en 2 pasos + confirmación.
///
/// Paso 1 "Tus datos": titular, contacto, documento (solo hoteles de socios,
/// id con `~`), habitación elegida (camas, régimen, cancelación), huésped,
/// acompañantes y hora de llegada. Paso 2 "Finalizar reserva": pago en el
/// alojamiento con tarjeta de garantía. Paso 3: reserva confirmada.
///
/// Envío con el payload EXACTO de React (`ReservationRequestDto`); el backend
/// usa `forbidNonWhitelisted`, así que cualquier campo extra produce un 400.
/// Resiliencia de React: Idempotency-Key estable por intento, reintento único
/// con la misma clave ante timeout/red, espera de 2,5 s ante 409 "en proceso",
/// aviso de habitación agotada y confirmación explícita de reserva duplicada.
///
/// Impuestos: los mismos que calcula AlojamientoDetail.jsx — IVA 15 % y, si la
/// suma de cargos difiere del IVA, "Tarifa de limpieza / servicio". No existe
/// en el contrato ninguna tasa municipal adicional, por lo que no se inventa.
/// Qué hizo el usuario en la pantalla de confirmación.
enum AccionTrasReserva { ninguna, verVoucher, irAMisReservas }

class ResultadoCheckout {
  final Reserva reserva;
  final AccionTrasReserva accion;
  const ResultadoCheckout(this.reserva, this.accion);
}

class AlojamientoCheckoutModal extends StatefulWidget {
  final Alojamiento alojamiento;
  final DateTime checkin;
  final DateTime checkout;
  final int adults;
  final List<int> edadesNinos;
  final int rooms;
  final TipoHabitacion? tipoHabitacion;
  final int nightsCount;

  /// Precio de la estancia (todas las habitaciones), sin impuestos.
  final double totalPrice;

  const AlojamientoCheckoutModal({
    super.key,
    required this.alojamiento,
    required this.checkin,
    required this.checkout,
    required this.adults,
    required this.edadesNinos,
    required this.rooms,
    required this.tipoHabitacion,
    required this.nightsCount,
    required this.totalPrice,
  });

  /// Abre el checkout a pantalla completa. Devuelve la reserva confirmada y la
  /// acción elegida, o `null` si se cerró sin reservar.
  static Future<ResultadoCheckout?> show(BuildContext context, AlojamientoCheckoutModal modal) {
    return Navigator.of(context).push<ResultadoCheckout>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => modal));
  }

  @override
  State<AlojamientoCheckoutModal> createState() => _AlojamientoCheckoutModalState();
}

class _Pais {
  final String code;
  final String name;
  final String prefix;
  const _Pais(this.code, this.name, this.prefix);
}

const _paises = [
  _Pais('EC', 'Ecuador', '+593'),
  _Pais('CO', 'Colombia', '+57'),
  _Pais('PE', 'Perú', '+51'),
  _Pais('US', 'Estados Unidos', '+1'),
  _Pais('ES', 'España', '+34'),
  _Pais('AR', 'Argentina', '+54'),
  _Pais('CL', 'Chile', '+56'),
  _Pais('MX', 'México', '+52'),
  _Pais('BR', 'Brasil', '+55'),
];

const _horasLlegada = [
  'No lo sé',
  '12:00 - 13:00',
  '13:00 - 14:00',
  '14:00 - 15:00',
  '15:00 - 16:00',
  '16:00 - 17:00',
  '17:00 - 18:00',
  '18:00 - 19:00',
  '19:00 - 20:00',
  '20:00 - 21:00',
  '21:00 - 22:00',
  '22:00 - 23:00',
  '23:00 - 00:00',
];

class _Acompanante {
  final String tipo; // ADULTO | NINO
  final TextEditingController nombre = TextEditingController();
  final TextEditingController apellido = TextEditingController();
  int? edad;
  _Acompanante(this.tipo, {this.edad});
  void dispose() {
    nombre.dispose();
    apellido.dispose();
  }
}

class _C {
  static const azul = Color(0xFF003580);
  static const accion = Color(0xFF006CE4);
  static const texto = Color(0xFF1A1A1A);
  static const gris = Color(0xFF595959);
  static const borde = Color(0xFFE7E7E7);
  static const verde = Color(0xFF008009);
  static const rojo = Color(0xFFD4111E);
}

class _AlojamientoCheckoutModalState extends State<AlojamientoCheckoutModal> {
  int _step = 1; // 1: Tus datos · 2: Finalizar reserva · 3: Confirmada

  // ── Paso 1 ──
  late final TextEditingController _nombre;
  late final TextEditingController _apellidos;
  late final TextEditingController _email;
  late final TextEditingController _confirmEmail;
  late final TextEditingController _telefono;
  late final TextEditingController _documento;
  late final TextEditingController _nombreHuesped;
  final TextEditingController _peticiones = TextEditingController();
  String _pais = 'EC';
  String _prefijo = '+593';
  String _documentoTipo = 'CEDULA';
  bool _sinPapel = true;
  String _horaLlegada = '15:00 - 16:00';
  late final List<_Acompanante> _acompanantes;

  // ── Paso 2 (pago simulado del prototipo: tarjeta de demostración precargada) ──
  late final TextEditingController _titular;
  final TextEditingController _tarjeta = TextEditingController(text: '4111 1111 1111 1111');
  final TextEditingController _caducidad = TextEditingController(text: '12/30');
  final TextEditingController _cvc = TextEditingController(text: '123');
  final TextEditingController _promo = TextEditingController();
  bool _marketing = true;
  bool _promoAplicada = false;
  String _promoError = '';

  // ── UI ──
  bool _detalleImpuestos = false;
  bool _loading = false;
  String _errorMsg = '';
  Map<String, dynamic>? _confirmada;

  /// Clave ESTABLE por intento: si el primer envío expira pero el hotel sí
  /// reservó, el reintento recupera la misma reserva en vez de crear otra.
  String? _idempotencyKey;
  bool _confirmadoDuplicado = false;

  bool get _esDeSocio => widget.alojamiento.id.contains('~');

  // ── Importes (mismas fórmulas que AlojamientoDetail.jsx / el modal) ──
  double get _total => widget.totalPrice;
  double get _original => (_total * 1.14).roundToDouble();
  double get _taxes => (_total * 0.15).roundToDouble();
  double get _iva => (_total * 0.15 * 100).roundToDouble() / 100;
  double get _limpieza {
    final v = ((_taxes - _iva) * 100).roundToDouble() / 100;
    return v > 0 ? v : 0;
  }

  double get _costoCancelacion => (_total * 0.5 * 100).roundToDouble() / 100;
  double get _descuento => (_original - _total) > 0 ? _original - _total : 0;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthProvider>().user;
    final rawEmail = user?.email ?? '';
    // Correos técnicos o de prueba nunca se envían al socio.
    final esTecnico = RegExp(r'esb|placeholder|eval-|test', caseSensitive: false).hasMatch(rawEmail);
    final email = esTecnico ? '' : rawEmail;
    final nombre = user?.nombre ?? '';
    final apellido = user?.apellido ?? '';
    _nombre = TextEditingController(text: nombre);
    _apellidos = TextEditingController(text: apellido);
    _email = TextEditingController(text: email);
    _confirmEmail = TextEditingController(text: email);
    _telefono = TextEditingController(text: user?.telefono ?? '');
    _documento = TextEditingController(text: user?.cedula ?? '');
    if (['CEDULA', 'PASAPORTE', 'RUC'].contains(user?.tipoDocumento)) _documentoTipo = user!.tipoDocumento;
    _nombreHuesped = TextEditingController(text: '$nombre $apellido'.trim());
    _titular = TextEditingController(text: '$nombre $apellido'.trim());
    _acompanantes = [
      for (var i = 0; i < (widget.adults - 1).clamp(0, 20); i++) _Acompanante('ADULTO'),
      for (final e in widget.edadesNinos) _Acompanante('NINO', edad: e),
    ];
  }

  @override
  void dispose() {
    for (final c in [
      _nombre,
      _apellidos,
      _email,
      _confirmEmail,
      _telefono,
      _documento,
      _nombreHuesped,
      _peticiones,
      _titular,
      _tarjeta,
      _caducidad,
      _cvc,
      _promo
    ]) {
      c.dispose();
    }
    for (final a in _acompanantes) {
      a.dispose();
    }
    super.dispose();
  }

  String _precio(double v) => context.read<CurrencyProvider>().formatPrice(v);
  String _iso(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

  /// `formatearFecha()` de services/formato.js: "3 de noviembre de 2026".
  /// Sin DateFormat con locale 'es' (requiere initializeDateFormatting, que la
  /// app no ejecuta y lanzaría LocaleDataException en tiempo de ejecución).
  static const _meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  String _fecha(DateTime d) => '${d.day} de ${_meses[d.month - 1]} de ${d.year}';

  String get _unidad {
    final apto = widget.alojamiento.tipoPropiedad.toUpperCase() == 'APARTAMENTO';
    if (widget.rooms == 1) return apto ? 'apartamento' : 'habitación';
    return apto ? 'apartamentos' : 'habitaciones';
  }

  String get _ocupacionTexto {
    final ninos = widget.edadesNinos.length;
    return '${widget.adults} ${widget.adults == 1 ? 'adulto' : 'adultos'}'
        '${ninos > 0 ? ' y $ninos ${ninos == 1 ? 'niño' : 'niños'}' : ''}';
  }

  // ===========================================================================
  // Paso 1 → Paso 2 (handleAvanzarPaso2)
  // ===========================================================================
  void _avanzarPaso2() {
    String? err;
    if (_nombre.text.trim().isEmpty || _apellidos.text.trim().isEmpty) {
      err = 'Por favor completa tu nombre y apellidos.';
    } else if (_email.text.trim().isEmpty || _confirmEmail.text.trim().isEmpty) {
      err = 'Por favor introduce tu dirección de e-mail.';
    } else if (_email.text.trim().toLowerCase() != _confirmEmail.text.trim().toLowerCase()) {
      err = 'Las direcciones de e-mail no coinciden.';
    } else if (_telefono.text.trim().isEmpty) {
      err = 'Por favor ingresa un número de teléfono de contacto.';
    } else if (_esDeSocio) {
      final doc = _documento.text.trim();
      if (doc.isEmpty) {
        err = 'Por favor ingresa el número de documento del titular: el hotel lo exige para registrar la reserva.';
      } else {
        err = validarDocumento(_documentoTipo, doc);
      }
    }
    if (err != null) {
      setState(() => _errorMsg = err!);
      return;
    }
    setState(() {
      _errorMsg = '';
      if (_titular.text.trim().isEmpty) _titular.text = '${_nombre.text} ${_apellidos.text}'.trim();
      _step = 2;
    });
  }

  void _aplicarPromo() {
    final c = _promo.text.trim().toUpperCase();
    if (c.isEmpty) return;
    setState(() {
      if (c == 'BOOKING10' || c == 'DESCUENTO10') {
        _promoAplicada = true;
        _promoError = '';
      } else {
        _promoError = 'El código introducido no es válido o ha expirado.';
      }
    });
  }

  // ===========================================================================
  // Envío (handleCompletarReserva)
  // ===========================================================================
  Map<String, dynamic> _payload() {
    final nombreCompleto = '${_nombre.text} ${_apellidos.text}'.trim();
    final acompanantes = _acompanantes
        .where((a) => a.nombre.text.trim().isNotEmpty)
        .map((a) => {
              'nombre': a.nombre.text.trim(),
              if (a.apellido.text.trim().isNotEmpty) 'apellido': a.apellido.text.trim(),
              'tipo': a.tipo,
              if (a.tipo == 'NINO' && a.edad != null) 'edad': a.edad,
            })
        .toList();
    final telefono = '$_prefijo ${_telefono.text.trim()}';
    final peticiones = _peticiones.text.trim();
    return {
      'checkin': _iso(widget.checkin),
      'checkout': _iso(widget.checkout),
      'habitaciones_count': widget.rooms < 1 ? 1 : widget.rooms,
      'nights': widget.nightsCount < 1 ? 1 : widget.nightsCount,
      'customer_name': nombreCompleto.isNotEmpty ? nombreCompleto : 'Huésped',
      'customer_email': _email.text.trim(),
      'adultos': widget.adults < 1 ? 1 : widget.adults,
      'ninos': widget.edadesNinos.length,
      if (widget.tipoHabitacion != null && widget.tipoHabitacion!.productId.isNotEmpty) 'tipo_habitacion_id': widget.tipoHabitacion!.productId,
      if (_telefono.text.trim().isNotEmpty) 'phone': telefono.length > 30 ? telefono.substring(0, 30) : telefono,
      if (_esDeSocio && _documento.text.trim().isNotEmpty) ...{
        'documento_tipo': _documentoTipo,
        'documento_numero': _documento.text.trim().toUpperCase(),
      },
      if (peticiones.isNotEmpty) 'special_requests': peticiones.length > 1000 ? peticiones.substring(0, 1000) : peticiones,
      if (_horaLlegada != 'No lo sé') 'arrival_time': _horaLlegada,
      if (_nombreHuesped.text.trim().isNotEmpty && _nombreHuesped.text.trim() != nombreCompleto) 'guest_name': _nombreHuesped.text.trim(),
      if (acompanantes.isNotEmpty) 'acompanantes': acompanantes,
      if (_confirmadoDuplicado) 'confirmar_duplicado': true,
    };
  }

  Future<Map<String, dynamic>> _reservar(Map<String, dynamic> payload) {
    return BookingServices.reservarAlojamiento(
      widget.alojamiento.id,
      payload,
      _idempotencyKey!,
      token: context.read<AuthProvider>().token,
    );
  }

  Future<void> _completarReserva() async {
    if (_loading) return; // doble clic
    if (_titular.text.trim().isEmpty) {
      setState(() => _errorMsg = 'Ingresa el nombre del titular de la tarjeta.');
      return;
    }
    if (_tarjeta.text.replaceAll(RegExp(r'\s'), '').length < 13) {
      setState(() => _errorMsg = 'Por favor introduce un número de tarjeta válido.');
      return;
    }
    if (_caducidad.text.trim().isEmpty || _cvc.text.trim().isEmpty) {
      setState(() => _errorMsg = 'Completa la fecha de caducidad y el código CVC.');
      return;
    }
    setState(() {
      _loading = true;
      _errorMsg = '';
    });
    _idempotencyKey ??= const Uuid().v4();
    final payload = _payload();

    Object? err;
    try {
      _finalizar(await _reservar(payload));
      return;
    } catch (e) {
      err = e;
    }

    // Timeout o caída de red: el hotel PUDO haber reservado. Un único reintento
    // con la MISMA clave: el backend deduplica y devuelve la reserva ya creada.
    if (err is! ApiException) {
      try {
        _finalizar(await _reservar({...payload, 'confirmar_duplicado': true}));
        return;
      } catch (e2) {
        err = e2;
      }
    }

    // 409 porque la petición anterior sigue en curso (idempotencia en vuelo).
    if (err is ApiException && err.statusCode == 409) {
      final raw = '${err.detail} ${err.title}';
      final enProceso = RegExp(r'ya se est[aá] procesando|idempotency.*in[_\s]progress', caseSensitive: false).hasMatch(raw);
      if (enProceso) {
        await Future.delayed(const Duration(milliseconds: 2500));
        try {
          _finalizar(await _reservar(payload));
          return;
        } catch (e3) {
          err = e3;
        }
      }
    }

    if (!mounted) return;
    // Sin red tras el reintento: se guarda con la MISMA clave (antes se descartaba la clave y el
    // siguiente toque podía crear otra reserva) y se envía sola al volver la red.
    if (esErrorDeRed(err)) {
      await context.read<ColaReservas>().encolar(
            tipo: 'alojamiento',
            payload: {
              'alojamientoId': widget.alojamiento.id,
              'data': {...payload, 'confirmar_duplicado': true},
            },
            idempotencyKey: _idempotencyKey!,
            titulo: 'Hospedaje: ${widget.alojamiento.nombre}',
          );
      if (!mounted) return;
      setState(() {
        _loading = false;
        _errorMsg = 'Sin conexión estable. Guardamos tu reserva y se enviará sola al volver la red (no se cobrará dos veces).';
      });
      return;
    }
    setState(() => _loading = false);
    _manejarError(err);
  }

  void _manejarError(Object err) {
    if (err is! ApiException) {
      _idempotencyKey = null;
      setState(() => _errorMsg = 'Hubo un inconveniente al procesar tu reserva. Inténtalo de nuevo.');
      return;
    }
    final raw = '${err.detail} ${err.title}';
    final esSinCupo = err.statusCode == 409 &&
        (RegExp(
              r'no tiene suficientes habitaciones|no tiene esa habitaci|ya no est[aá] a la venta|sin cupo|no hay disponibilidad|room.*no.*longer.*available|out_of_stock',
              caseSensitive: false,
            ).hasMatch(raw) ||
            err.code == 'ROOM_NO_LONGER_AVAILABLE' ||
            (err.type ?? '').contains('room-no-longer-available'));
    final esDuplicado = err.statusCode == 409 && err.invalidParams.any((p) => p.name == 'confirmar_duplicado');

    if (esSinCupo) {
      _idempotencyKey = null;
      _dialogoSinCupo(err.detail.isNotEmpty ? err.detail : 'El hotel ya no cuenta con habitaciones disponibles para las fechas seleccionadas.');
    } else if (esDuplicado && !_confirmadoDuplicado) {
      _dialogoDuplicado(err.detail);
    } else if (err.statusCode == 409) {
      _idempotencyKey = null;
      setState(() => _errorMsg = RegExp(r'ya se est[aá] procesando', caseSensitive: false).hasMatch(err.detail)
          ? 'Tu reserva se está confirmando con el hotel. Por favor revisa la sección Mis Reservas en unos instantes.'
          : (err.detail.isNotEmpty ? err.detail : 'Esta reserva ya fue procesada anteriormente.'));
    } else {
      _idempotencyKey = null;
      final params = err.invalidParams.map((p) => '${p.name}: ${p.reason}').join(', ');
      setState(() =>
          _errorMsg = params.isNotEmpty ? params : (err.detail.isNotEmpty ? err.detail : 'Hubo un inconveniente al procesar tu reserva. Inténtalo de nuevo.'));
    }
  }

  Future<void> _dialogoDuplicado(String mensaje) async {
    final continuar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Ya tienes una reserva en estas fechas'),
        content: Text(mensaje.isNotEmpty ? mensaje : 'Ya existe una reserva tuya que coincide con estas fechas. ¿Quieres reservar de todos modos?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Reservar de todos modos')),
        ],
      ),
    );
    if (continuar == true && mounted) {
      _confirmadoDuplicado = true;
      await _completarReserva();
    }
  }

  Future<void> _dialogoSinCupo(String mensaje) async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Habitación sin disponibilidad'),
        content: Text('$mensaje\n\n${widget.alojamiento.nombre} · ${_iso(widget.checkin)} al ${_iso(widget.checkout)}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cambiar fechas')),
        ],
      ),
    );
    if (mounted) Navigator.of(context).pop();
  }

  void _finalizar(Map<String, dynamic> res) {
    if (!mounted) return;
    final data = res['data'] is Map ? Map<String, dynamic>.from(res['data']) : res;
    final codigo = firstString(data, const ['codigo_reserva', 'codigoReserva', 'reservation_id']) ?? 'BKG-${const Uuid().v4().substring(0, 6).toUpperCase()}';
    _confirmadoDuplicado = false;
    _idempotencyKey = null; // reserva cerrada: la próxima usa clave nueva
    final reserva = Reserva(
      id: firstString(data, const ['reservation_id', 'id']) ?? codigo,
      vertical: 'alojamientos',
      servicioNombre: '${widget.alojamiento.nombre} (${widget.nightsCount} noches)',
      proveedor: widget.alojamiento.ciudad,
      fecha: _iso(widget.checkin),
      checkin: _iso(widget.checkin),
      checkout: _iso(widget.checkout),
      total: _total + _taxes,
      estado: (data['status'] ?? 'CONFIRMED').toString().toUpperCase(),
      voucherQr: data['voucher_qr']?.toString() ?? 'BOOKING-ALO-$codigo',
      pnr: codigo,
      imagenUrl: widget.alojamiento.imagenUrl,
      fechaCreacion: DateTime.now(),
      fechaServicio: widget.checkin,
    );
    BookingServices.agregarReservaDirecta(reserva);
    setState(() {
      _loading = false;
      _confirmada = {...data, 'codigo': codigo, 'huesped': '${_nombre.text} ${_apellidos.text}'.trim(), 'reserva': reserva};
      _step = 3;
    });
  }

  ResultadoCheckout? _resultado(AccionTrasReserva accion) {
    final r = _confirmada?['reserva'];
    return r is Reserva ? ResultadoCheckout(r, accion) : null;
  }

  /// PIN determinista de React: |reduce(acc*31 + charCode, 7)| % 9000 + 1000,
  /// en aritmética de punto flotante como en JavaScript.
  String _pin(String codigo, dynamic pinServidor) {
    if (pinServidor != null && pinServidor.toString().isNotEmpty) return pinServidor.toString();
    double acc = 7;
    for (final c in codigo.codeUnits) {
      acc = acc * 31 + c;
    }
    return ((acc.abs() % 9000) + 1000).toInt().toString();
  }

  // ===========================================================================
  // UI
  // ===========================================================================
  @override
  Widget build(BuildContext context) {
    final ancho = MediaQuery.of(context).size.width;
    final dosColumnas = ancho > 900;
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        backgroundColor: const Color(0xFF003B95),
        foregroundColor: Colors.white,
        title: const Text('Booking.com', style: TextStyle(fontWeight: FontWeight.bold)),
        leading: IconButton(
          tooltip: 'Cerrar',
          icon: const Icon(Icons.close),
          onPressed: _loading ? null : () => Navigator.of(context).pop(_resultado(AccionTrasReserva.ninguna)),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1140),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _stepper(),
                const SizedBox(height: 16),
                if (_step == 3 && _confirmada != null)
                  _confirmacion()
                else if (dosColumnas)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(width: 370, child: _sidebar()),
                      const SizedBox(width: 24),
                      Expanded(child: _main()),
                    ],
                  )
                else ...[
                  _sidebar(),
                  const SizedBox(height: 16),
                  _main(),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _stepper() {
    Widget item(int n, String label) {
      final completado = n == 1 || _step > n - 1;
      final activo = _step == n - 1;
      return Row(mainAxisSize: MainAxisSize.min, children: [
        CircleAvatar(
          radius: 12,
          backgroundColor: completado || activo ? _C.accion : const Color(0xFFE7E7E7),
          child: completado && !activo
              ? const Icon(Icons.check, size: 14, color: Colors.white)
              : Text('$n', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: activo ? Colors.white : const Color(0xFF6B6B6B))),
        ),
        const SizedBox(width: 8),
        Text(label,
            style: TextStyle(
                fontSize: 14, fontWeight: activo ? FontWeight.w700 : FontWeight.w500, color: activo || completado ? _C.texto : const Color(0xFF6B6B6B))),
      ]);
    }

    Widget divisor() => const Expanded(child: Divider(color: _C.borde, thickness: 1, indent: 8, endIndent: 8));
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: ConstrainedBox(
        constraints: BoxConstraints(minWidth: MediaQuery.of(context).size.width > 1172 ? 1140 : MediaQuery.of(context).size.width - 32),
        child: IntrinsicWidth(
          child: Row(children: [
            item(1, 'Tu selección'),
            divisor(),
            item(2, 'Tus datos'),
            divisor(),
            item(3, 'Finalizar reserva'),
          ]),
        ),
      ),
    );
  }

  Widget _card({required List<Widget> children, Color? color, Color? borde}) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color ?? Colors.white,
          border: Border.all(color: borde ?? _C.borde),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
      );

  Widget _tituloCard(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Text(t, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _C.texto)),
      );

  // ── Barra lateral: hotel, fechas, precio, cancelación, promo, urgencia ──
  Widget _sidebar() {
    final a = widget.alojamiento;
    final t = widget.tipoHabitacion;
    final hoy = _iso(DateTime.now()) == _iso(widget.checkin);
    final score = a.rating;
    final scoreLabel = score >= 9
        ? 'Excelente'
        : score >= 8
            ? 'Fabuloso'
            : score >= 7
                ? 'Muy bien'
                : 'Aceptable';
    final pocas = (t?.availableRooms ?? 99) <= 3 || (a.habitacionesDisponibles ?? 99) <= 3;

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _card(children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: AspectRatio(
            aspectRatio: 16 / 9,
            child: Image.network(a.imagenUrl ?? '', fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: const Color(0xFFE7E7E7))),
          ),
        ),
        const SizedBox(height: 10),
        if (a.estrellas > 0)
          Row(children: [
            for (var i = 0; i < a.estrellas.clamp(1, 5); i++) const Icon(Icons.star, size: 14, color: Color(0xFFFEBB02)),
            if (score >= 8.5 || a.estrellas >= 4)
              Container(
                margin: const EdgeInsets.only(left: 4),
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                color: const Color(0xFFFEBB02),
                child: const Icon(Icons.thumb_up, size: 11, color: _C.texto),
              ),
          ]),
        Text(a.nombre, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _C.texto)),
        Text(a.direccion ?? a.ciudad, style: const TextStyle(fontSize: 13, color: _C.gris)),
        if (score > 0) ...[
          const SizedBox(height: 8),
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
              decoration: const BoxDecoration(
                  color: _C.azul, borderRadius: BorderRadius.only(topLeft: Radius.circular(4), topRight: Radius.circular(4), bottomRight: Radius.circular(4))),
              child: Text(score.toStringAsFixed(1), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
            ),
            const SizedBox(width: 6),
            Text(scoreLabel, style: const TextStyle(color: _C.verde, fontWeight: FontWeight.w700)),
            if (a.reviewsCount > 0) Text(' · ${a.reviewsCount} comentarios', style: const TextStyle(fontSize: 12, color: _C.gris)),
          ]),
        ],
        if (a.amenidades.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 4, children: [
            for (final am in a.amenidades.take(4))
              Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(_iconoAmenidad(am), size: 13, color: const Color(0xFF4B5563)),
                const SizedBox(width: 4),
                Text(am, style: const TextStyle(fontSize: 12, color: Color(0xFF4B5563))),
              ]),
          ]),
        ],
      ]),
      _card(children: [
        _tituloCard('Los datos de tu reserva'),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Entrada', style: TextStyle(fontSize: 12, color: _C.gris)),
              Text(_fecha(widget.checkin), style: const TextStyle(fontWeight: FontWeight.w700)),
              Text('A partir de las ${a.checkinDesde}', style: const TextStyle(fontSize: 12, color: _C.gris)),
              if (hoy)
                const Row(children: [
                  Icon(Icons.schedule, size: 13, color: _C.rojo),
                  SizedBox(width: 4),
                  Text('El check-in es hoy', style: TextStyle(fontSize: 12, color: _C.rojo)),
                ]),
            ]),
          ),
          Container(width: 1, height: 56, color: _C.borde, margin: const EdgeInsets.symmetric(horizontal: 10)),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Salida', style: TextStyle(fontSize: 12, color: _C.gris)),
              Text(_fecha(widget.checkout), style: const TextStyle(fontWeight: FontWeight.w700)),
              Text('Hasta las ${a.checkoutHasta}', style: const TextStyle(fontSize: 12, color: _C.gris)),
            ]),
          ),
        ]),
        const SizedBox(height: 10),
        Text.rich(TextSpan(style: const TextStyle(fontSize: 13), children: [
          const TextSpan(text: 'Duración total de la estancia: '),
          TextSpan(text: '${widget.nightsCount} ${widget.nightsCount == 1 ? 'noche' : 'noches'}', style: const TextStyle(fontWeight: FontWeight.w700)),
        ])),
        const Divider(height: 20),
        const Text('Has seleccionado', style: TextStyle(fontSize: 12, color: _C.gris)),
        Text(
          '${widget.rooms} $_unidad${t?.nombre != null ? ' (${t!.nombre})' : ''} para $_ocupacionTexto',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        if (_step == 1)
          TextButton(
            style: TextButton.styleFrom(padding: EdgeInsets.zero),
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cambiar selección', style: TextStyle(color: _C.accion)),
          ),
      ]),
      _card(children: [
        _tituloCard('Desglose del precio'),
        _filaPrecio('Precio original', _precio(_original), tachado: true),
        if (_descuento > 0) _filaPrecio('Descuento promocional', '- ${_precio(_descuento)}', color: _C.verde),
        const Divider(height: 20),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          const Text('Precio', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(width: 8),
          // FittedBox: importes largos (COP, CLP) se reducen en vez de desbordar.
          Flexible(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerRight,
              child: Text(_precio(_total), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
            ),
          ),
        ]),
        Align(
          alignment: Alignment.centerRight,
          child: Text('+ ${_precio(_taxes)} de impuestos y cargos', style: const TextStyle(fontSize: 12, color: _C.gris)),
        ),
        TextButton(
          style: TextButton.styleFrom(padding: EdgeInsets.zero),
          onPressed: () => setState(() => _detalleImpuestos = !_detalleImpuestos),
          child: Text(_detalleImpuestos ? 'Ocultar detalles ▲' : 'Información sobre el precio ▼', style: const TextStyle(color: _C.accion, fontSize: 13)),
        ),
        if (_detalleImpuestos)
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: const Color(0xFFF9FAFB), borderRadius: BorderRadius.circular(6)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('No incluye ${_precio(_taxes)} en impuestos y cargos:', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(height: 4),
              _filaPrecio('15% IVA', _precio(_iva)),
              if (_limpieza > 0) _filaPrecio('Tarifa de limpieza / servicio', _precio(_limpieza)),
            ]),
          ),
      ]),
      _card(children: [
        _tituloCard('¿Cuánto cuesta cancelar?'),
        Text.rich(TextSpan(style: const TextStyle(fontSize: 13), children: [
          const TextSpan(text: 'Si cancelas, tendrás que pagar: '),
          TextSpan(text: _precio(_costoCancelacion), style: const TextStyle(fontWeight: FontWeight.w700)),
        ])),
      ]),
      if (_step == 2)
        _card(children: [
          _tituloCard('¿Tienes un código promocional?'),
          Row(children: [
            Expanded(child: TextField(controller: _promo, decoration: _deco(hint: 'Introduce el código'))),
            const SizedBox(width: 8),
            OutlinedButton(onPressed: _promoAplicada ? null : _aplicarPromo, child: Text(_promoAplicada ? 'Aplicado' : 'Aplicar')),
          ]),
          if (_promoAplicada)
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text('¡Código de descuento aplicado con éxito!', style: TextStyle(color: _C.verde, fontSize: 12, fontWeight: FontWeight.w600)),
            ),
          if (_promoError.isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 6), child: Text(_promoError, style: const TextStyle(color: _C.rojo, fontSize: 12))),
        ]),
      if (pocas)
        _card(color: const Color(0xFFFFF5F5), borde: const Color(0xFFF87171), children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.schedule, color: Color(0xFF991B1B), size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Poca disponibilidad para tus fechas:', style: TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF991B1B))),
                Text(
                  t != null && t.availableRooms <= 3
                      ? '¡Solo quedan ${t.availableRooms} habitaciones de este tipo en nuestra web!'
                      : '¡Quedan pocas unidades disponibles para estas fechas!',
                  style: const TextStyle(fontSize: 13),
                ),
              ]),
            ),
          ]),
        ]),
    ]);
  }

  IconData _iconoAmenidad(String am) {
    final a = am.toLowerCase();
    if (a.contains('wifi') || a.contains('internet')) return Icons.wifi;
    if (a.contains('mascota') || a.contains('pet')) return Icons.pets;
    if (a.contains('traslado') || a.contains('aeropuerto') || a.contains('shuttle')) return Icons.airport_shuttle;
    if (a.contains('estacionamiento') || a.contains('parking') || a.contains('parqueadero')) return Icons.local_parking;
    return Icons.check;
  }

  Widget _filaPrecio(String l, String v, {bool tachado = false, Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Flexible(child: Text(l, style: TextStyle(fontSize: 13, color: color))),
          const SizedBox(width: 8),
          Text(v, style: TextStyle(fontSize: 13, color: color ?? (tachado ? _C.gris : null), decoration: tachado ? TextDecoration.lineThrough : null)),
        ]),
      );

  InputDecoration _deco({String? hint, String? helper, Widget? prefix}) => InputDecoration(
        hintText: hint,
        helperText: helper,
        helperMaxLines: 2,
        prefixIcon: prefix,
        isDense: true,
        border: const OutlineInputBorder(),
        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      );

  Widget _campo(String label, Widget input) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _C.texto)),
          const SizedBox(height: 4),
          input,
        ]),
      );

  /// Dos campos en fila (bkg-form-grid-2) o apilados en móvil.
  Widget _grid2(Widget a, Widget b) => LayoutBuilder(
        builder: (_, c) => c.maxWidth < 560
            ? Column(children: [a, b])
            : Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: a), const SizedBox(width: 12), Expanded(child: b)]),
      );

  // ── Columna principal ──
  Widget _main() {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (_errorMsg.isNotEmpty)
        Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(color: const Color(0xFFFEF2F2), border: Border.all(color: const Color(0xFFF87171)), borderRadius: BorderRadius.circular(6)),
          child: Semantics(
            liveRegion: true,
            child: Text(_errorMsg, style: const TextStyle(color: Color(0xFFB91C1C), fontSize: 14, fontWeight: FontWeight.w600)),
          ),
        ),
      if (_step == 1) ..._paso1() else ..._paso2(),
    ]);
  }

  List<Widget> _paso1() {
    final t = widget.tipoHabitacion;
    final camas = (t?.descripcionCamas?.isNotEmpty == true)
        ? t!.descripcionCamas!
        : (t != null && t.camas > 0 ? '${t.camas} ${t.camas == 1 ? 'cama' : 'camas'}' : '1 cama doble grande');
    return [
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(color: const Color(0xFFEEF5FF), border: Border.all(color: const Color(0xFFCCE0FF)), borderRadius: BorderRadius.circular(8)),
        child: const Row(children: [
          Icon(Icons.info_outline, size: 18, color: _C.azul),
          SizedBox(width: 8),
          Expanded(child: Text('¡Ya casi está! Solo llena los datos obligatorios marcados con *', style: TextStyle(fontSize: 13))),
        ]),
      ),
      const SizedBox(height: 16),
      _card(children: [
        _tituloCard('Introduce tus datos'),
        _grid2(
          _campo('Nombre *', TextField(controller: _nombre, decoration: _deco(hint: 'Ej. Juan'))),
          _campo('Apellidos *', TextField(controller: _apellidos, decoration: _deco(hint: 'Ej. Pérez Cadena'))),
        ),
        _grid2(
          _campo(
              'Dirección de e-mail *',
              TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: _deco(hint: 'nombre@ejemplo.com', helper: 'El e-mail de confirmación se enviará a esta dirección'))),
          _campo('Confirmar dirección de e-mail *',
              TextField(controller: _confirmEmail, keyboardType: TextInputType.emailAddress, decoration: _deco(hint: 'nombre@ejemplo.com'))),
        ),
        _grid2(
          _campo(
            'País o territorio *',
            DropdownButtonFormField<String>(
              value: _pais,
              isExpanded: true,
              decoration: _deco(),
              items: [for (final p in _paises) DropdownMenuItem(value: p.code, child: Text(p.name))],
              onChanged: (v) => setState(() {
                _pais = v ?? _pais;
                _prefijo = _paises.firstWhere((p) => p.code == _pais).prefix;
              }),
            ),
          ),
          _campo(
            'Número de teléfono *',
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(
                width: 132,
                child: DropdownButtonFormField<String>(
                  value: _prefijo,
                  isExpanded: true,
                  decoration: _deco(),
                  items: [for (final p in _paises) DropdownMenuItem(value: p.prefix, child: Text('${p.code} ${p.prefix}', overflow: TextOverflow.ellipsis))],
                  onChanged: (v) => setState(() => _prefijo = v ?? _prefijo),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: TextField(
                  controller: _telefono,
                  keyboardType: TextInputType.phone,
                  decoration: _deco(hint: '0991234567', helper: 'Por si el alojamiento necesita contactar contigo.'),
                ),
              ),
            ]),
          ),
        ),
        if (_esDeSocio)
          _campo(
            'Documento del titular *',
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(
                width: 130,
                child: DropdownButtonFormField<String>(
                  value: _documentoTipo,
                  isExpanded: true,
                  decoration: _deco(),
                  items: const [
                    DropdownMenuItem(value: 'CEDULA', child: Text('Cédula', overflow: TextOverflow.ellipsis)),
                    DropdownMenuItem(value: 'PASAPORTE', child: Text('Pasaporte', overflow: TextOverflow.ellipsis)),
                    DropdownMenuItem(value: 'RUC', child: Text('RUC', overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) => setState(() => _documentoTipo = v ?? _documentoTipo),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: TextField(
                  controller: _documento,
                  maxLength: 13,
                  decoration: _deco(
                    hint: _documentoTipo == 'PASAPORTE' ? 'AB123456' : (_documentoTipo == 'RUC' ? '1790012345001' : '1710034065'),
                    helper: 'El hotel lo usa para registrarte y confirmar tu llegada en recepción.',
                  ).copyWith(counterText: ''),
                ),
              ),
            ]),
          ),
        // Material propio: dentro de una tarjeta con fondo, el ListTile no podría
        // pintar su tinta (aserción "ListTile background color... may be invisible").
        Material(
            type: MaterialType.transparency,
            child: CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              activeColor: _C.accion,
              value: _sinPapel,
              onChanged: (v) => setState(() => _sinPapel = v ?? true),
              title: const Text('Sí, quiero confirmación sin papel gratuita (recomendado)', style: TextStyle(fontSize: 13)),
            )),
      ]),
      _card(children: [
        _tituloCard('${widget.rooms > 1 ? '${widget.rooms} × ' : ''}${t?.nombre ?? widget.alojamiento.tipoAlojamiento ?? 'Habitación'}'),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: const Color(0xFFF9FAFB), borderRadius: BorderRadius.circular(6)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${widget.rooms} ${widget.rooms == 1 ? 'habitación reservada' : 'habitaciones reservadas'}',
                style: const TextStyle(fontWeight: FontWeight.w700, color: _C.azul)),
            const SizedBox(height: 6),
            Text('$camas${t?.tamanoM2 != null ? ' · ${t!.tamanoM2!.toStringAsFixed(0)} m²' : ''}', style: const TextStyle(fontWeight: FontWeight.w600)),
            Text('Para $_ocupacionTexto', style: const TextStyle(fontSize: 12, color: _C.gris)),
            const SizedBox(height: 6),
            Wrap(spacing: 12, runSpacing: 4, children: [
              if (t?.reembolsable ?? widget.alojamiento.cancelacionGratis)
                const _Check('Cancelación gratis (hasta 48h antes del check-in)', color: _C.verde, bold: true),
              // Régimen alimenticio del tipo de habitación elegido (no se elige aquí:
              // en React viene fijado por la tarifa seleccionada en la ficha).
              if (t != null && t.mealPlan.isNotEmpty) _Check(formatearRegimenPlan(t.mealPlan)),
              for (final am in (t?.amenidades ?? const <String>[]).take(3)) _Check(am),
            ]),
          ]),
        ),
        const SizedBox(height: 12),
        _campo('Nombre completo del huésped *', TextField(controller: _nombreHuesped, decoration: _deco(hint: 'Nombre del huésped que se alojará'))),
        if (_acompanantes.isNotEmpty) ...[
          const Text.rich(TextSpan(children: [
            TextSpan(text: 'Otros huéspedes ', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            TextSpan(text: '(opcional)', style: TextStyle(fontSize: 13, color: _C.gris)),
          ])),
          const SizedBox(height: 6),
          for (var i = 0; i < _acompanantes.length; i++) _filaAcompanante(i),
        ],
      ]),
      _card(children: [
        _tituloCard('Peticiones especiales'),
        const Text(
          'Las peticiones especiales no se pueden garantizar, pero el alojamiento hará todo lo posible por cumplirlas.',
          style: TextStyle(fontSize: 13, color: _C.gris),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _peticiones,
          maxLines: 3,
          maxLength: 1000,
          decoration: _deco(hint: 'Ej. habitación en piso alto, cuna para bebé…'),
        ),
      ]),
      _card(children: [
        _tituloCard('Tu hora de llegada'),
        Text('Tu habitación estará lista para el check-in a partir de las ${widget.alojamiento.checkinDesde}.', style: const TextStyle(fontSize: 13)),
        const SizedBox(height: 4),
        const Text('Recepción 24 horas: ¡siempre habrá alguien para recibirte!', style: TextStyle(fontSize: 12, color: _C.gris)),
        const SizedBox(height: 12),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 320),
          child: _campo(
            'Añade tu hora estimada de llegada',
            DropdownButtonFormField<String>(
              value: _horaLlegada,
              decoration: _deco(),
              items: [for (final h in _horasLlegada) DropdownMenuItem(value: h, child: Text(h.replaceAll(' - ', ' – ')))],
              onChanged: (v) => setState(() => _horaLlegada = v ?? _horaLlegada),
            ),
          ),
        ),
      ]),
      Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        runSpacing: 12,
        children: [
          const Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.verified_user_outlined, size: 18, color: _C.verde),
            SizedBox(width: 6),
            Text('Igualamos el precio', style: TextStyle(fontSize: 13, color: _C.verde, fontWeight: FontWeight.w600)),
          ]),
          _botonPrimario('Siguiente: últimos datos  >', _avanzarPaso2),
        ],
      ),
    ];
  }

  Widget _filaAcompanante(int i) {
    final a = _acompanantes[i];
    final esNino = a.tipo == 'NINO';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(children: [
        Expanded(
          child: Semantics(
            label: 'Nombre del ${esNino ? 'niño' : 'acompañante'} ${i + 1}',
            child: TextField(controller: a.nombre, maxLength: 100, decoration: _deco(hint: esNino ? 'Nombre del niño' : 'Nombre').copyWith(counterText: '')),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Semantics(
            label: 'Apellido del ${esNino ? 'niño' : 'acompañante'} ${i + 1}',
            child: TextField(controller: a.apellido, maxLength: 100, decoration: _deco(hint: 'Apellido').copyWith(counterText: '')),
          ),
        ),
        if (esNino) ...[
          const SizedBox(width: 8),
          SizedBox(
            width: 110,
            child: DropdownButtonFormField<int?>(
              value: a.edad,
              isExpanded: true,
              decoration: _deco(),
              hint: const Text('Edad', overflow: TextOverflow.ellipsis),
              items: [for (var e = 0; e < 18; e++) DropdownMenuItem(value: e, child: Text('$e ${e == 1 ? 'año' : 'años'}', overflow: TextOverflow.ellipsis))],
              onChanged: (v) => setState(() => a.edad = v),
            ),
          ),
        ],
      ]),
    );
  }

  List<Widget> _paso2() {
    const marcas = [
      ('AMEX', Color(0xFF002663)),
      ('UnionPay', Color(0xFFD9222A)),
      ('Diners Club', Color(0xFF004A98)),
      ('Discover', Color(0xFFF76B1C)),
      ('JCB', Color(0xFF006241)),
      ('MasterCard', Color(0xFFEB001B)),
      ('VISA', Color(0xFF1A1F71)),
    ];
    return [
      _card(color: const Color(0xFFF9FAFB), borde: const Color(0xFFE5E7EB), children: const [
        Text('Paga en el alojamiento', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        SizedBox(height: 4),
        Text('El alojamiento gestionará el pago. La fecha de cargo depende de las condiciones de la reserva.', style: TextStyle(fontSize: 13)),
      ]),
      _card(children: [
        _tituloCard('¿Cómo quieres pagar?'),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final (n, c) in marcas)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
              decoration: BoxDecoration(color: const Color(0xFFF0F0F0), borderRadius: BorderRadius.circular(3)),
              child: Text(n, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: c)),
            ),
        ]),
        const SizedBox(height: 12),
        _campo('Nombre del titular de la tarjeta *', TextField(controller: _titular, decoration: _deco())),
        _campo(
          'Número de tarjeta *',
          TextField(
            controller: _tarjeta,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(16), _GruposDe4()],
            decoration: _deco(prefix: const Icon(Icons.credit_card, color: Color(0xFF6B7280))),
          ),
        ),
        _grid2(
          _campo(
            'Fecha de caducidad *',
            TextField(
              controller: _caducidad,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4), _MesAnio()],
              decoration: _deco(hint: 'MM/AA'),
            ),
          ),
          _campo(
            'CVC *',
            TextField(
              controller: _cvc,
              keyboardType: TextInputType.number,
              obscureText: true,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
              decoration: _deco(hint: 'Código de 3 o 4 dígitos al reverso de la tarjeta'),
            ),
          ),
        ),
      ]),
      _card(children: [
        // Material propio: dentro de una tarjeta con fondo, el ListTile no podría
        // pintar su tinta (aserción "ListTile background color... may be invisible").
        Material(
            type: MaterialType.transparency,
            child: CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              activeColor: _C.accion,
              value: _marketing,
              onChanged: (v) => setState(() => _marketing = v ?? false),
              title: const Text(
                'Acepto recibir e-mails de marketing de Booking.com, como ofertas, promociones, recomendaciones personalizadas y novedades sobre productos y servicios.',
                style: TextStyle(fontSize: 13),
              ),
            )),
        const Padding(
          padding: EdgeInsets.only(left: 24),
          child: Text(
            'Puedes cancelar la suscripción en cualquier momento haciendo clic en el enlace del pie de página de nuestros e-mails. Consulta nuestra política de privacidad.',
            style: TextStyle(fontSize: 12, color: _C.gris, height: 1.4),
          ),
        ),
      ]),
      Text.rich(
        TextSpan(style: const TextStyle(fontSize: 12, color: _C.gris, height: 1.4), children: [
          TextSpan(text: 'Tu reserva es directamente con ${widget.alojamiento.nombre}. Al pulsar en "Completar reserva", aceptas las '),
          const TextSpan(text: 'condiciones de la reserva', style: TextStyle(color: _C.accion, decoration: TextDecoration.underline)),
          const TextSpan(text: ', las '),
          const TextSpan(text: 'condiciones generales', style: TextStyle(color: _C.accion, decoration: TextDecoration.underline)),
          const TextSpan(text: ' y la '),
          const TextSpan(text: 'política de privacidad', style: TextStyle(color: _C.accion, decoration: TextDecoration.underline)),
          const TextSpan(text: '.'),
        ]),
      ),
      const SizedBox(height: 12),
      Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        runSpacing: 12,
        children: [
          TextButton(
            onPressed: _loading ? null : () => setState(() => _step = 1),
            child: const Text('← Modificar tus datos', style: TextStyle(color: _C.accion)),
          ),
          _botonPrimario(_loading ? 'Confirmando reserva...' : 'Completar reserva', _loading ? null : _completarReserva, icono: Icons.lock),
        ],
      ),
    ];
  }

  Widget _botonPrimario(String texto, VoidCallback? onPressed, {IconData? icono}) => ElevatedButton.icon(
        onPressed: onPressed,
        icon: icono != null ? Icon(icono, size: 16) : const SizedBox.shrink(),
        label: Text(texto),
        style: ElevatedButton.styleFrom(
          backgroundColor: _C.accion,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        ),
      );

  // ── Paso 3: confirmación ──
  Widget _confirmacion() {
    final c = _confirmada!;
    final codigo = c['codigo'].toString();
    final reserva = c['reserva'] as Reserva;
    Widget fila(String l, String v, {TextStyle? estilo}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 120, child: Text(l, style: const TextStyle(fontWeight: FontWeight.w700))),
            Expanded(child: Text(v, style: estilo)),
          ]),
        );
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: _card(children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const CircleAvatar(radius: 26, backgroundColor: Color(0xFFD1FAE5), child: Icon(Icons.check, size: 32, color: Color(0xFF059669))),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('¡Tu reserva está confirmada!', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text.rich(TextSpan(style: const TextStyle(fontSize: 14, color: Color(0xFF4B5563)), children: [
                  const TextSpan(text: 'Hemos enviado la confirmación y los detalles de tu factura a '),
                  TextSpan(text: _email.text.trim(), style: const TextStyle(fontWeight: FontWeight.w700)),
                  const TextSpan(text: '.'),
                ])),
              ]),
            ),
          ]),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration:
                BoxDecoration(color: const Color(0xFFF8FAFC), border: Border.all(color: const Color(0xFFE2E8F0)), borderRadius: BorderRadius.circular(8)),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('NÚMERO DE CONFIRMACIÓN (PNR)', style: TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.w700)),
                SelectableText(codigo, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: _C.azul, letterSpacing: 1)),
              ]),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                const Text('PIN DE SEGURIDAD', style: TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.w700)),
                Text(_pin(codigo, c['pin']), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Color(0xFF334155))),
              ]),
            ]),
          ),
          const SizedBox(height: 8),
          fila('Alojamiento', widget.alojamiento.nombre),
          fila('Huésped', c['huesped'].toString()),
          fila('Check-in', '${_fecha(widget.checkin)} (a partir de las ${widget.alojamiento.checkinDesde})'),
          fila('Check-out', '${_fecha(widget.checkout)} (hasta las ${widget.alojamiento.checkoutHasta})'),
          fila('Estancia', '${widget.nightsCount} ${widget.nightsCount == 1 ? 'noche' : 'noches'}, ${widget.rooms} $_unidad'),
          fila('Total', _precio(_total), estilo: const TextStyle(color: _C.verde, fontWeight: FontWeight.w800, fontSize: 18)),
          const SizedBox(height: 12),
          Wrap(spacing: 10, runSpacing: 10, children: [
            OutlinedButton.icon(
              onPressed: () => Navigator.of(context).pop(ResultadoCheckout(reserva, AccionTrasReserva.verVoucher)),
              icon: const Icon(Icons.qr_code_2),
              label: const Text('Ver voucher QR'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(ResultadoCheckout(reserva, AccionTrasReserva.irAMisReservas)),
              style: ElevatedButton.styleFrom(backgroundColor: _C.accion, foregroundColor: Colors.white),
              child: const Text('Ir a Mis Reservas'),
            ),
          ]),
        ]),
      ),
    );
  }
}

class _Check extends StatelessWidget {
  final String texto;
  final Color color;
  final bool bold;
  const _Check(this.texto, {this.color = _C.texto, this.bold = false});

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.check, size: 14, color: _C.verde),
        const SizedBox(width: 4),
        Flexible(child: Text(texto, style: TextStyle(fontSize: 13, color: color, fontWeight: bold ? FontWeight.w600 : FontWeight.w400))),
      ]);
}

/// "4111111111111111" → "4111 1111 1111 1111" (como el onChange de React).
class _GruposDe4 extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final d = newValue.text.replaceAll(' ', '');
    final b = StringBuffer();
    for (var i = 0; i < d.length; i++) {
      if (i > 0 && i % 4 == 0) b.write(' ');
      b.write(d[i]);
    }
    final t = b.toString();
    return TextEditingValue(text: t, selection: TextSelection.collapsed(offset: t.length));
  }
}

/// "1230" → "12/30".
class _MesAnio extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final d = newValue.text.replaceAll('/', '');
    final t = d.length > 2 ? '${d.substring(0, 2)}/${d.substring(2)}' : d;
    return TextEditingValue(text: t, selection: TextSelection.collapsed(offset: t.length));
  }
}
