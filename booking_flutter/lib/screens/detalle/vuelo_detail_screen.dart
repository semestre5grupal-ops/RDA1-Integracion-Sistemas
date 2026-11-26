import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../models/reserva.dart';
import '../../models/vuelo.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_client.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';
import '../../utils/destinos_catalog.dart';
import '../../widgets/auth_guard_dialog.dart';
import '../../widgets/vuelo_passengers_sheet.dart';
import '../reservas/voucher_qr_screen.dart';

class _PassengerFormControllers {
  final String passengerType; // ADULT, YOUTH, CHILD, INFANT
  final String label;
  final TextEditingController firstName = TextEditingController();
  final TextEditingController lastName = TextEditingController();
  String docType = 'CEDULA';
  final TextEditingController docNumber = TextEditingController();
  final TextEditingController birthDate = TextEditingController();

  _PassengerFormControllers({required this.passengerType, required this.label});

  void dispose() {
    firstName.dispose();
    lastName.dispose();
    docNumber.dispose();
    birthDate.dispose();
  }
}

class VueloDetailScreen extends StatefulWidget {
  final Vuelo oferta;
  final VueloCabinOption? tarifaSeleccionada;
  final VueloPassengersSelection? pasajeros;
  final List<Vuelo>? ofertasGrupo;

  const VueloDetailScreen({
    super.key,
    required this.oferta,
    this.tarifaSeleccionada,
    this.pasajeros,
    this.ofertasGrupo,
  });

  @override
  State<VueloDetailScreen> createState() => _VueloDetailScreenState();
}

class _VueloDetailScreenState extends State<VueloDetailScreen> {
  late Vuelo _activeOffer;
  late VueloCabinOption _activeOption;
  late VueloPassengersSelection _pax;

  int _step = 0; // 0: Resumen + Hold + Asientos | 1: Pasajeros + Pago + Emisión
  bool _creatingHold = false;
  bool _loadingSeats = false;
  bool _submittingBooking = false;
  String? _errorMsg;

  String? _holdId;
  String? _holdExpiresAt;
  bool _bookingCompleted = false;

  // Mapa de asientos
  List<Map<String, dynamic>> _seatsList = [];
  final Set<String> _selectedSeatNumbers = {};

  // Pasajeros & Contacto
  late List<_PassengerFormControllers> _paxControllers;
  late TextEditingController _contactEmailCtrl;
  late TextEditingController _contactPhoneCtrl;
  final TextEditingController _cardNumCtrl = TextEditingController(text: '4532 8900 1234 5678');
  final TextEditingController _cardExpCtrl = TextEditingController(text: '09/29');
  final TextEditingController _cardCvvCtrl = TextEditingController(text: '842');

  @override
  void initState() {
    super.initState();
    _activeOffer = widget.oferta;
    _pax = widget.pasajeros ?? const VueloPassengersSelection(adults: 1);
    _activeOption = widget.tarifaSeleccionada ??
        (_activeOffer.itineraries.isNotEmpty && _activeOffer.itineraries.first.pricingOptions.isNotEmpty
            ? _activeOffer.itineraries.first.pricingOptions.first
            : VueloCabinOption(
                cabinClass: 'ECONOMY',
                fareBrand: 'STANDARD',
                availableSeats: _activeOffer.availableSeats,
              ));

    final auth = Provider.of<AuthProvider>(context, listen: false);
    final user = auth.user;
    _contactEmailCtrl = TextEditingController(text: user?.email ?? '');
    _contactPhoneCtrl = TextEditingController(text: user?.telefono.isNotEmpty == true ? user!.telefono : '+593990000000');

    _paxControllers = [];
    for (int i = 0; i < _pax.adults; i++) {
      final c = _PassengerFormControllers(passengerType: 'ADULT', label: 'Adulto ${i + 1} (15+ años)');
      if (i == 0 && user != null) {
        c.firstName.text = user.nombre;
        c.lastName.text = user.apellido;
        c.docNumber.text = user.cedula;
        c.docType = user.tipoDocumento == 'PASAPORTE' ? 'PASSPORT' : 'CEDULA';
      }
      c.birthDate.text = '1994-05-15';
      _paxControllers.add(c);
    }
    for (int i = 0; i < _pax.youths; i++) {
      final c = _PassengerFormControllers(passengerType: 'YOUTH', label: 'Joven ${i + 1} (12-14 años)');
      c.birthDate.text = '2013-04-10';
      _paxControllers.add(c);
    }
    for (int i = 0; i < _pax.children; i++) {
      final c = _PassengerFormControllers(passengerType: 'CHILD', label: 'Niño ${i + 1} (2-11 años)');
      c.birthDate.text = '2019-06-20';
      _paxControllers.add(c);
    }
    for (int i = 0; i < _pax.infants; i++) {
      final c = _PassengerFormControllers(passengerType: 'INFANT', label: 'Bebé ${i + 1} (<2 años)');
      c.birthDate.text = '2025-03-01';
      _paxControllers.add(c);
    }
  }

  @override
  void dispose() {
    if (_holdId != null && !_bookingCompleted) {
      BookingServices.liberarHoldVuelo(_holdId!);
    }
    for (final c in _paxControllers) {
      c.dispose();
    }
    _contactEmailCtrl.dispose();
    _contactPhoneCtrl.dispose();
    _cardNumCtrl.dispose();
    _cardExpCtrl.dispose();
    _cardCvvCtrl.dispose();
    super.dispose();
  }

  double get _computedTotal {
    final map = _activeOption.pricePerPassengerType;
    if (map.isEmpty) return _activeOffer.totalPrice;
    final pAdult = map['ADULT'] ?? _activeOffer.totalPrice / (_pax.seatedTotal > 0 ? _pax.seatedTotal : 1);
    final pYouth = map['YOUTH'] ?? pAdult;
    final pChild = map['CHILD'] ?? pAdult;
    final pInfant = map['INFANT'] ?? 0.0;
    final sum = (_pax.adults * pAdult) + (_pax.youths * pYouth) + (_pax.children * pChild) + (_pax.infants * pInfant);
    return sum > 0 ? sum : _activeOffer.totalPrice;
  }

  bool get _esInternacional => DestinosCatalog.esViajeInternacional(_activeOffer.origen, _activeOffer.destino);

  bool _validarCedulaEC(String c) {
    if (!RegExp(r'^\d{10}$').hasMatch(c)) return false;
    final prov = int.parse(c.substring(0, 2));
    final third = int.parse(c[2]);
    if ((prov < 1 || prov > 24) && prov != 30) return false;
    if (third > 5) return false;
    int sum = 0;
    for (int i = 0; i < 9; i++) {
      int d = int.parse(c[i]);
      if (i % 2 == 0) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    final check = (10 - (sum % 10)) % 10;
    return check == int.parse(c[9]);
  }

  Future<void> _crearHoldYCargarAsientos() async {
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final ok = await AuthGuardDialog.ensureAuthenticated(context, isAuthenticated: auth.isAuthenticated);
    if (!ok || !mounted) return;
    if (!Provider.of<AuthProvider>(context, listen: false).isAuthenticated) return;

    setState(() {
      _creatingHold = true;
      _errorMsg = null;
    });

    try {
      final selections = _activeOffer.itineraries.isNotEmpty
          ? _activeOffer.itineraries
              .map((it) => {
                    'itineraryId': it.itineraryId,
                    'cabinClass': _activeOption.cabinClass,
                    'fareBrand': _activeOption.fareBrand,
                  })
              .toList()
          : [
              {
                'itineraryId': 'ITIN-1',
                'cabinClass': _activeOption.cabinClass,
                'fareBrand': _activeOption.fareBrand,
              }
            ];

      final holdRes = await BookingServices.crearHoldVuelo(
        offerId: _activeOffer.offerId,
        itinerarySelections: selections,
        passengersBreakdown: _pax.toApiMap(),
        idempotencyKey: const Uuid().v4(),
        token: Provider.of<AuthProvider>(context, listen: false).token,
      );

      final dataObj = holdRes['data'] is Map ? Map<String, dynamic>.from(holdRes['data']) : holdRes;
      _holdId = dataObj['holdId']?.toString() ?? dataObj['id']?.toString() ?? 'HOLD-${DateTime.now().millisecondsSinceEpoch}';
      _holdExpiresAt = dataObj['expiresAt']?.toString();

      setState(() {
        _creatingHold = false;
        _step = 1;
        _loadingSeats = true;
      });

      final seg = _activeOffer.primerSegmento;
      if (seg != null && seg.segmentId.isNotEmpty) {
        final seatRes = await BookingServices.obtenerMapaAsientos(_activeOffer.offerId, seg.segmentId, holdId: _holdId);
        if (mounted && seatRes != null) {
          final rawSeats = seatRes['seats'] ?? (seatRes['data'] is Map ? seatRes['data']['seats'] : null);
          if (rawSeats is List) {
            setState(() {
              _seatsList = rawSeats.whereType<Map>().map((s) => Map<String, dynamic>.from(s)).toList();
            });
          }
        }
      }
      if (mounted) setState(() => _loadingSeats = false);
    } catch (e) {
      if (mounted) {
        setState(() {
          _creatingHold = false;
          _loadingSeats = false;
          _errorMsg = e is ApiException ? e.userMessage : 'No se pudo bloquear la tarifa: $e';
        });
      }
    }
  }

  Future<void> _confirmarReservaFinal() async {
    for (final p in _paxControllers) {
      if (p.firstName.text.trim().length < 2 || p.lastName.text.trim().length < 2) {
        setState(() => _errorMsg = 'Completa nombre y apellido válido para ${p.label}.');
        return;
      }
      final doc = p.docNumber.text.trim();
      if (_esInternacional || p.docType == 'PASSPORT') {
        if (doc.length < 6) {
          setState(() => _errorMsg = 'El pasaporte de ${p.label} debe tener al menos 6 caracteres.');
          return;
        }
      } else if (p.docType == 'CEDULA') {
        if (!_validarCedulaEC(doc)) {
          setState(() => _errorMsg = 'La cédula ecuatoriana de ${p.label} no es válida (dígito verificador).');
          return;
        }
      } else if (doc.length < 5) {
        setState(() => _errorMsg = 'Ingresa un documento válido para ${p.label}.');
        return;
      }
    }

    if (!_contactEmailCtrl.text.contains('@')) {
      setState(() => _errorMsg = 'Ingresa un correo de contacto válido.');
      return;
    }

    setState(() {
      _submittingBooking = true;
      _errorMsg = null;
    });

    try {
      final token = Provider.of<AuthProvider>(context, listen: false).token;
      final segId = _activeOffer.primerSegmento?.segmentId ?? 'SEG-1';

      if (_selectedSeatNumbers.isNotEmpty && _holdId != null) {
        final seatsPayload = _selectedSeatNumbers.map((seatNum) => {'segmentId': segId, 'seatNumber': seatNum}).toList();
        await BookingServices.bloquearAsientos(
          _activeOffer.offerId,
          _holdId!,
          seatsPayload,
          expiresAt: _holdExpiresAt,
        );
      }

      final payload = <String, dynamic>{
        'holdId': _holdId,
        'offerId': _activeOffer.offerId,
        'passengers': _paxControllers
            .map((p) => {
                  'type': p.passengerType,
                  'firstName': p.firstName.text.trim(),
                  'lastName': p.lastName.text.trim(),
                  'documentType': p.docType,
                  'documentNumber': p.docNumber.text.trim(),
                  'birthDate': p.birthDate.text.trim(),
                })
            .toList(),
        'contact': {
          'email': _contactEmailCtrl.text.trim(),
          'phone': _contactPhoneCtrl.text.trim(),
        },
        'payment': {
          'method': 'CARD',
          'currency': _activeOffer.currency,
          'amount': _computedTotal,
        },
      };

      final resData = await BookingServices.crearReservaVuelo(
        payload,
        const Uuid().v4(),
        token: token,
      );

      _bookingCompleted = true;

      final dataObj = resData['data'] is Map ? Map<String, dynamic>.from(resData['data']) : resData;
      final resId = dataObj['bookingId']?.toString() ?? dataObj['id']?.toString() ?? 'VUE-${DateTime.now().millisecondsSinceEpoch}';
      final pnr = dataObj['pnr']?.toString() ?? dataObj['recordLocator']?.toString() ?? resId;

      final nuevaReserva = Reserva(
        id: resId,
        vertical: 'vuelos',
        servicioNombre: 'Vuelo ${_activeOffer.origen} ➔ ${_activeOffer.destino} (${_activeOffer.numeroVuelo})',
        proveedor: _activeOffer.airlineName,
        fecha: _activeOffer.fechaSalida,
        hora: _activeOffer.horaSalida,
        total: _computedTotal,
        estado: (dataObj['status'] ?? 'CONFIRMED').toString().toUpperCase(),
        voucherQr: 'BOOKING-VUELO-$pnr',
        pnr: pnr,
        fechaCreacion: DateTime.now(),
        fechaServicio: DateTime.tryParse(_activeOffer.fechaSalida) ?? DateTime.now().add(const Duration(days: 5)),
      );

      BookingServices.agregarReservaDirecta(nuevaReserva);

      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => VoucherQrScreen(reserva: nuevaReserva)),
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          _submittingBooking = false;
          _errorMsg = e is ApiException ? e.userMessage : 'No se pudo emitir la reserva de vuelo: $e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalFinal = _computedTotal;

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(
          _step == 0 ? 'Resumen de vuelo (${_activeOffer.origen} ➔ ${_activeOffer.destino})' : 'Pasajeros y pago',
          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_errorMsg != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFCE8E8),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: BookingColors.errorRed),
                ),
                child: Text(_errorMsg!, style: const TextStyle(color: BookingColors.errorRed, fontSize: 12)),
              ),
            if (_step == 0) ...[
              // Resumen del itinerario (ResumenViaje.jsx parity)
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(_activeOffer.airlineName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: BookingColors.primaryBlue)),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: const Color(0xFFE7F6EC), borderRadius: BorderRadius.circular(4)),
                            child: Text(_activeOption.fareBrand,
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11, color: BookingColors.successGreen)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Cabina ${_activeOption.cabinLabelEs} · ${_pax.resumenTexto}',
                        style: const TextStyle(fontSize: 12, color: BookingColors.textMuted),
                      ),
                      const Divider(height: 18),
                      if (_activeOffer.itineraries.isNotEmpty)
                        ..._activeOffer.itineraries.asMap().entries.map((entry) {
                          final idx = entry.key;
                          final it = entry.value;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  idx == 0 ? 'Vuelo de Ida' : 'Vuelo de Regreso',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: BookingColors.actionBlue),
                                ),
                                const SizedBox(height: 6),
                                ...it.segments.map((seg) => ListTile(
                                      dense: true,
                                      contentPadding: EdgeInsets.zero,
                                      leading: const Icon(Icons.flight, color: BookingColors.primaryBlue),
                                      title: Text(
                                          '${seg.originIata} (${extraerHoraIso(seg.departureAt)}) → ${seg.destinationIata} (${extraerHoraIso(seg.arrivalAt)})',
                                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                      subtitle: Text(
                                        'Vuelo ${seg.flightNumber} · ${extraerFechaIso(seg.departureAt)} · ${seg.aircraft ?? "Jet comercial"}',
                                        style: const TextStyle(fontSize: 11),
                                      ),
                                    )),
                              ],
                            ),
                          );
                        })
                      else
                        Text(
                            '${_activeOffer.origen} (${_activeOffer.horaSalida}) → ${_activeOffer.destino} (${_activeOffer.horaLlegada}) · Vuelo ${_activeOffer.numeroVuelo}'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Equipaje y reglas de tarifa
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Equipaje y condiciones de tarifa', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      const SizedBox(height: 8),
                      Text('• Artículo personal debajo del asiento: ${_activeOption.personalItemIncluded ? "Incluido" : "No incluido"}'),
                      Text('• Equipaje de mano en cabina: ${_activeOption.carryOnIncluded} pieza(s)'),
                      Text('• Equipaje facturado en bodega: ${_activeOption.checkedBaggageIncluded} maleta(s)'),
                      Text('• Cambios: ${_activeOption.isChangeable ? "Permitidos" : "Con restricción"}'),
                      Text('• Reembolso: ${_activeOption.isRefundable ? "Reembolsable" : "No reembolsable"}'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),

              if (_esInternacional)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                      color: const Color(0xFFFFF8E1), borderRadius: BorderRadius.circular(8), border: Border.all(color: BookingColors.accentYellow)),
                  child: const Row(
                    children: [
                      Icon(Icons.public, color: Colors.orange),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Ruta internacional: todos los pasajeros requerirán Pasaporte vigente.',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ),
            ] else ...[
              // Banner de Hold Activo
              Container(
                padding: const EdgeInsets.all(10),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFE7F6EC),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: BookingColors.successGreen),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.lock_clock, color: BookingColors.successGreen),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Tarifa bloqueada (Hold: $_holdId). Completa tus pasajeros para emitir tu PNR.',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF0A5C2B)),
                      ),
                    ),
                  ],
                ),
              ),

              // Selección de Asientos (Seatmap)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Selección de asientos (Opcional)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                          Text('${_selectedSeatNumbers.length} / ${_pax.seatedTotal}',
                              style: const TextStyle(color: BookingColors.actionBlue, fontWeight: FontWeight.bold)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (_loadingSeats)
                        const Center(child: Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator()))
                      else if (_seatsList.isEmpty)
                        const Text(
                          'La aerolínea asignará tus asientos automáticamente en check-in.',
                          style: TextStyle(fontSize: 12, color: BookingColors.textMuted),
                        )
                      else
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: _seatsList.take(36).map((s) {
                            final numStr = s['seatNumber']?.toString() ?? s['number']?.toString() ?? '';
                            final status = s['status']?.toString().toUpperCase() ?? 'AVAILABLE';
                            final avail = status == 'AVAILABLE' || status == 'FREE';
                            final selected = _selectedSeatNumbers.contains(numStr);
                            return InkWell(
                              onTap: !avail
                                  ? null
                                  : () {
                                      setState(() {
                                        if (selected) {
                                          _selectedSeatNumbers.remove(numStr);
                                        } else if (_selectedSeatNumbers.length < _pax.seatedTotal) {
                                          _selectedSeatNumbers.add(numStr);
                                        }
                                      });
                                    },
                              child: Container(
                                width: 42,
                                height: 36,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: !avail ? Colors.grey.shade300 : (selected ? BookingColors.actionBlue : Colors.white),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: !avail ? Colors.grey.shade400 : (selected ? BookingColors.actionBlue : BookingColors.primaryBlue),
                                  ),
                                ),
                                child: Text(
                                  numStr,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: !avail ? Colors.grey.shade600 : (selected ? Colors.white : BookingColors.textDark),
                                  ),
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Formulario de Pasajeros
              ..._paxControllers.map((p) => Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p.label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: BookingColors.primaryBlue)),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: p.firstName,
                                  decoration: const InputDecoration(labelText: 'Nombres*', border: OutlineInputBorder(), isDense: true),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: TextField(
                                  controller: p.lastName,
                                  decoration: const InputDecoration(labelText: 'Apellidos*', border: OutlineInputBorder(), isDense: true),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                flex: 2,
                                child: DropdownButtonFormField<String>(
                                  value: _esInternacional ? 'PASSPORT' : p.docType,
                                  decoration: const InputDecoration(labelText: 'Tipo Doc.', border: OutlineInputBorder(), isDense: true),
                                  items: [
                                    if (!_esInternacional) const DropdownMenuItem(value: 'CEDULA', child: Text('Cédula EC')),
                                    const DropdownMenuItem(value: 'PASSPORT', child: Text('Pasaporte')),
                                    if (!_esInternacional) const DropdownMenuItem(value: 'ID_CARD', child: Text('Otro ID')),
                                  ],
                                  onChanged: (v) {
                                    if (v != null) setState(() => p.docType = v);
                                  },
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                flex: 3,
                                child: TextField(
                                  controller: p.docNumber,
                                  decoration: const InputDecoration(labelText: 'Número documento*', border: OutlineInputBorder(), isDense: true),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: p.birthDate,
                            decoration: const InputDecoration(labelText: 'Fecha nacimiento (AAAA-MM-DD)*', border: OutlineInputBorder(), isDense: true),
                          ),
                        ],
                      ),
                    ),
                  )),

              // Contacto y Pago
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Contacto y Tarjeta de Pago', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _contactEmailCtrl,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(labelText: 'Correo electrónico para e-ticket*', border: OutlineInputBorder(), isDense: true),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _contactPhoneCtrl,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(labelText: 'Teléfono E.164 (ej. +593990000000)*', border: OutlineInputBorder(), isDense: true),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _cardNumCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                            labelText: 'Tarjeta de crédito/débito*', prefixIcon: Icon(Icons.credit_card), border: OutlineInputBorder(), isDense: true),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                              child: TextField(
                                  controller: _cardExpCtrl,
                                  decoration: const InputDecoration(labelText: 'MM/AA', border: OutlineInputBorder(), isDense: true))),
                          const SizedBox(width: 8),
                          Expanded(
                              child: TextField(
                                  controller: _cardCvvCtrl,
                                  obscureText: true,
                                  decoration: const InputDecoration(labelText: 'CVV', border: OutlineInputBorder(), isDense: true))),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
      bottomSheet: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        decoration: const BoxDecoration(
          color: Colors.white,
          boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, -2))],
        ),
        child: SafeArea(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${_activeOption.fareBrand} · ${_pax.resumenTexto}', style: const TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                    Text(
                      'US\$ ${totalFinal.toStringAsFixed(2)}',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                    ),
                    const Text('Tarifa total con tasas incluidas', style: TextStyle(fontSize: 10, color: BookingColors.successGreen)),
                  ],
                ),
              ),
              if (_step == 0)
                ElevatedButton(
                  onPressed: _creatingHold ? null : _crearHoldYCargarAsientos,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: BookingColors.actionBlue,
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                  ),
                  child: _creatingHold
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Continuar a reserva', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                )
              else
                ElevatedButton(
                  onPressed: _submittingBooking ? null : _confirmarReservaFinal,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: BookingColors.successGreen,
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                  ),
                  child: _submittingBooking
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Pagar y emitir PNR', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
