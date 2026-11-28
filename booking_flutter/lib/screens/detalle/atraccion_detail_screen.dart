import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/atraccion.dart';
import '../../models/reserva.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_client.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';
import '../../offline/cola_reservas.dart';
import '../../utils/clave_compra.dart';
import '../../widgets/auth_guard_dialog.dart';
import '../../widgets/booking_rating_badge.dart';

class AtraccionDetailScreen extends StatefulWidget {
  final Atraccion atraccion;
  final DateTime? initialDate;

  const AtraccionDetailScreen({
    super.key,
    required this.atraccion,
    this.initialDate,
  });

  @override
  State<AtraccionDetailScreen> createState() => _AtraccionDetailScreenState();
}

class _AtraccionDetailScreenState extends State<AtraccionDetailScreen> {
  final ClavePorContenido _claveReserva = ClavePorContenido();
  late Atraccion _atr;
  late DateTime _selectedDate;
  int _photoIndex = 0;

  bool _loadingSlots = true;
  List<TimeSlot> _slots = [];
  String? _slotsError;
  TimeSlot? _selectedSlot;
  final Map<String, List<TimeSlot>> _slotsCache = {};

  int _adultos = 1;
  int _ninos = 0;
  int _seniors = 0;
  int _infantes = 0;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _atr = widget.atraccion;
    _selectedDate = widget.initialDate ?? DateTime.now().add(const Duration(days: 2));
    _loadData();
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) => _fetchSlots(silent: true));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadData() async {
    await Future.wait([
      _fetchDetail(),
      _fetchSlots(),
    ]);
  }

  Future<void> _fetchDetail() async {
    final det = await BookingServices.getAtraccionDetalle(widget.atraccion.id);
    if (det != null && mounted) {
      setState(() => _atr = det);
    }
  }

  Future<void> _fetchSlots({bool silent = false}) async {
    final dateStr = DateFormat('yyyy-MM-dd').format(_selectedDate);

    // Si ya tenemos los horarios en caché local para este día, mostrarlos de inmediato
    if (!silent && _slotsCache.containsKey(dateStr) && _slotsCache[dateStr]!.isNotEmpty) {
      final cachedSlots = _slotsCache[dateStr]!;
      TimeSlot? firstAvail = _selectedSlot;
      if (firstAvail == null || firstAvail.estaAgotado) {
        for (final s in cachedSlots) {
          if (!s.estaAgotado) {
            firstAvail = s;
            break;
          }
        }
      }
      setState(() {
        _slots = cachedSlots;
        _loadingSlots = false;
        _slotsError = null;
        _selectedSlot = firstAvail ?? cachedSlots.first;
        _clampTicketsToCupos();
      });
      // Continuar con actualización silenciosa para verificar si hubo cambios en vivo
      silent = true;
    } else if (!silent) {
      setState(() {
        _loadingSlots = true;
        _selectedSlot = null;
      });
    }

    final List<TimeSlot> slots;
    try {
      slots = await BookingServices.getDisponibilidadAtraccion(widget.atraccion.id, dateStr);
    } catch (_) {
      // Error transitorio del socio: en el sondeo silencioso se conservan los
      // últimos turnos reales; en una carga explícita se informa al usuario.
      if (mounted && !silent) {
        setState(() {
          _slots = [];
          _slotsError = 'No se pudo consultar la disponibilidad del proveedor. Reintentando…';
          _loadingSlots = false;
        });
      }
      return;
    }
    if (mounted) {
      _slotsCache[dateStr] = slots;
      TimeSlot? firstAvail = _selectedSlot;
      if (firstAvail == null || firstAvail.estaAgotado) {
        for (final s in slots) {
          if (!s.estaAgotado) {
            firstAvail = s;
            break;
          }
        }
      }
      setState(() {
        _slots = slots;
        _slotsError = null;
        _selectedSlot = firstAvail ?? (slots.isNotEmpty ? slots.first : null);
        if (!silent) _loadingSlots = false;
        _clampTicketsToCupos();
      });
    }
  }

  int get _maxCupos => _selectedSlot?.cuposDisponibles ?? 0;
  int get _totalTickets => _adultos + _ninos + _seniors + _infantes;

  void _clampTicketsToCupos() {
    if (_maxCupos <= 0) return;
    while (_totalTickets > _maxCupos) {
      if (_infantes > 0) {
        _infantes--;
      } else if (_ninos > 0) {
        _ninos--;
      } else if (_seniors > 0) {
        _seniors--;
      } else if (_adultos > 1) {
        _adultos--;
      } else {
        break;
      }
    }
  }

  double get _unitNino => _atr.precioNino ?? (_atr.precioAdulto * 0.5);
  double get _unitSenior => _atr.precioSenior ?? (_atr.precioAdulto * 0.7);

  double get _subtotalTickets {
    if (_atr.soloPersonas) return _adultos * _atr.precioAdulto;
    return (_adultos * _atr.precioAdulto) +
        (_ninos * _unitNino) +
        (_seniors * _unitSenior) +
        (_infantes * _atr.precioInfante);
  }

  Future<void> _openCheckoutModal() async {
    if (_selectedSlot == null || _selectedSlot!.estaAgotado) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Selecciona un horario con cupos disponibles.')),
      );
      return;
    }

    final auth = Provider.of<AuthProvider>(context, listen: false);
    final ok = await AuthGuardDialog.ensureAuthenticated(context, isAuthenticated: auth.isAuthenticated);
    if (!ok || !mounted) return;
    if (!Provider.of<AuthProvider>(context, listen: false).isAuthenticated) return;

    final user = Provider.of<AuthProvider>(context, listen: false).user;
    final token = Provider.of<AuthProvider>(context, listen: false).token;

    final nameCtrl = TextEditingController(text: user?.nombreCompleto ?? '');
    final emailCtrl = TextEditingController(text: user?.email ?? '');
    final telCtrl = TextEditingController(text: user?.telefono ?? '+593');
    final cardCtrl = TextEditingController(text: '4532 8900 1234 5678');

    final subtotal = _subtotalTickets;
    final iva = subtotal * 0.15;
    final totalFinal = subtotal + iva;
    bool submitting = false;
    String? errorMsg;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModal) {
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 18,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Confirmar entradas', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue)),
                        IconButton(icon: const Icon(Icons.close), onPressed: submitting ? null : () => Navigator.pop(ctx)),
                      ],
                    ),
                    const Divider(),
                    if (errorMsg != null)
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(color: const Color(0xFFFCE8E8), borderRadius: BorderRadius.circular(8)),
                        child: Text(errorMsg!, style: const TextStyle(color: BookingColors.errorRed, fontSize: 12)),
                      ),

                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(8)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_atr.nombre, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                          const SizedBox(height: 4),
                          Text(
                            'Fecha: ${DateFormat('dd MMM yyyy').format(_selectedDate)} · Horario: ${_selectedSlot!.horaInicio}',
                            style: const TextStyle(fontSize: 12, color: BookingColors.textMuted),
                          ),
                          Text(
                            'Total boletos: $_totalTickets · Subtotal US\$ ${subtotal.toStringAsFixed(2)} + 15% IVA = US\$ ${totalFinal.toStringAsFixed(2)}',
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: BookingColors.actionBlue),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    TextField(
                      controller: nameCtrl,
                      decoration: const InputDecoration(labelText: 'Nombre del visitante titular*', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: emailCtrl,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(labelText: 'Correo electrónico*', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: telCtrl,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(labelText: 'Teléfono WhatsApp*', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: cardCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Tarjeta de pago*', prefixIcon: Icon(Icons.credit_card), border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: submitting
                            ? null
                            : () async {
                                if (nameCtrl.text.trim().isEmpty || !emailCtrl.text.contains('@')) {
                                  setModal(() => errorMsg = 'Ingresa nombre completo y un correo válido.');
                                  return;
                                }
                                setModal(() {
                                  submitting = true;
                                  errorMsg = null;
                                });
                                try {
                                  final dateStr = DateFormat('yyyy-MM-dd').format(_selectedDate);
                                  final docId = (user?.cedula ?? '').isNotEmpty ? user!.cedula : '1755073481';
                                  final payload = <String, dynamic>{
                                    'atraccion_id': _atr.id,
                                    'atraccionId': _atr.id,
                                    'slot_id': _selectedSlot!.slotId,
                                    'date': dateStr,
                                    'fecha': dateStr,
                                    'time': _selectedSlot!.horaInicio,
                                    'hora': _selectedSlot!.horaInicio,
                                    'ticket_count': _totalTickets,
                                    'adult_count': _adultos,
                                    'child_count': _ninos,
                                    'senior_count': _seniors,
                                    'infant_count': _infantes,
                                    'customer_name': nameCtrl.text.trim(),
                                    'customer_email': emailCtrl.text.trim(),
                                    'customer_phone': telCtrl.text.trim(),
                                    'document_id': docId,
                                    'customer': {
                                      'full_name': nameCtrl.text.trim(),
                                      'nombre': nameCtrl.text.trim(),
                                      'email': emailCtrl.text.trim(),
                                      'phone': telCtrl.text.trim(),
                                      'telefono': telCtrl.text.trim(),
                                      'document_id': docId,
                                    },
                                    'payment_method': 'CREDIT_CARD',
                                    'metodo_pago': 'TARJETA',
                                    'proveedor_codigo': _atr.proveedorCodigo,
                                  };

                                  // Misma Idempotency-Key si se reintenta la misma reserva (corte de red):
                                  // no se cobra dos veces. Cambia solo si cambian los datos.
                                  final claveReserva = _claveReserva.para(payload);
                                  final Map<String, dynamic> resData;
                                  try {
                                    resData = await BookingServices.reservarAtraccion(_atr.id, payload, claveReserva, token: token);
                                  } catch (e) {
                                    if (!esErrorDeRed(e) || !mounted) rethrow;
                                    // Sin red: se guarda con la MISMA clave y se envía sola al volver.
                                    await Provider.of<ColaReservas>(this.context, listen: false).encolar(
                                      tipo: 'atraccion',
                                      payload: {'atraccionId': _atr.id, 'data': payload},
                                      idempotencyKey: claveReserva,
                                      titulo: _atr.nombre,
                                    );
                                    setModal(() {
                                      submitting = false;
                                      errorMsg = 'Sin conexión estable. Guardamos tu reserva y se enviará sola al volver la red (no se cobrará dos veces).';
                                    });
                                    return;
                                  }
                                  _claveReserva.reiniciar();

                                  final dataObj = resData['data'] is Map
                                      ? Map<String, dynamic>.from(resData['data'])
                                      : resData;
                                  final resId = dataObj['reservation_id']?.toString() ??
                                      dataObj['id']?.toString() ??
                                      'ATR-${DateTime.now().millisecondsSinceEpoch}';
                                  final pnr = dataObj['pnr']?.toString() ??
                                      dataObj['codigo_reserva']?.toString() ??
                                      resId;

                                  final nuevaReserva = Reserva(
                                    id: resId,
                                    vertical: 'atracciones',
                                    servicioNombre: _atr.nombre,
                                    proveedor: _atr.proveedor,
                                    fecha: dateStr,
                                    hora: _selectedSlot!.horaInicio,
                                    total: totalFinal,
                                    estado: (dataObj['status'] ?? dataObj['estado'] ?? 'CONFIRMADA').toString().toUpperCase(),
                                    voucherQr: dataObj['voucher_qr']?.toString() ?? 'BOOKING-ATR-$pnr',
                                    pnr: pnr,
                                    imagenUrl: _atr.imagenUrl,
                                    fechaCreacion: DateTime.now(),
                                    fechaServicio: _selectedDate,
                                  );

                                  BookingServices.agregarReservaDirecta(nuevaReserva);

                                  // Decremento optimista inmediato de la capacidad disponible en UI
                                  setState(() {
                                    final idx = _slots.indexWhere((s) => s.slotId == _selectedSlot?.slotId);
                                    if (idx != -1) {
                                      final cur = _slots[idx];
                                      final newCupos = (cur.cuposDisponibles - _totalTickets).clamp(0, cur.capacidadTotal);
                                      _slots[idx] = TimeSlot(
                                        slotId: cur.slotId,
                                        horaInicio: cur.horaInicio,
                                        horaFin: cur.horaFin,
                                        cuposDisponibles: newCupos,
                                        capacidadTotal: cur.capacidadTotal,
                                        estado: newCupos <= 0 ? 'AGOTADO' : (newCupos <= 5 ? 'ULTIMOS_CUPOS' : 'DISPONIBLE'),
                                      );
                                      _selectedSlot = _slots[idx];
                                    }
                                  });
                                  // Sincronización silenciosa en segundo plano con el servidor
                                  _fetchSlots(silent: true);

                                  if (!ctx.mounted) return;
                                  Navigator.pop(ctx);
                                  if (!mounted) return;
                                  _showBookingSuccessDialog(nuevaReserva);
                                } catch (e) {
                                  setModal(() {
                                    submitting = false;
                                    errorMsg = e is ApiException ? e.userMessageConCodigo : 'Error al reservar la atracción: $e';
                                  });
                                }
                              },
                        style: ElevatedButton.styleFrom(backgroundColor: BookingColors.successGreen),
                        child: submitting
                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                            : const Text('Confirmar y pagar entrada(s)', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _showBookingSuccessDialog(Reserva r) async {
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.check_circle_rounded, color: BookingColors.successGreen, size: 28),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                '¡Reserva Confirmada!',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: BookingColors.textDark),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Tu reserva para "' + r.servicioNombre + '" ha sido confirmada con éxito.', style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Código PNR:', style: TextStyle(fontSize: 12, color: BookingColors.textMuted)),
                      SelectableText(
                        r.pnr ?? r.id,
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, fontFamily: 'monospace', color: BookingColors.primaryBlue),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Fecha y Horario:', style: TextStyle(fontSize: 12, color: BookingColors.textMuted)),
                      Text(r.fecha + (r.hora != null ? ' · ' + r.hora! : ''), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Total pagado:', style: TextStyle(fontSize: 12, color: BookingColors.textMuted)),
                      Text('US\$ ${r.total.toStringAsFixed(2)}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Puedes consultar o gestionar tu reserva en cualquier momento desde la sección Mis Reservas.',
              style: TextStyle(fontSize: 11, color: BookingColors.textMuted),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(dialogCtx);
              Navigator.pop(context);
            },
            child: const Text('Seguir explorando', style: TextStyle(color: BookingColors.textMuted)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(dialogCtx);
              Navigator.pushNamed(context, '/reservas');
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: BookingColors.primaryBlue,
              foregroundColor: Colors.white,
            ),
            child: const Text('Ir a Mis Reservas'),
          ),
        ],
      ),
    );
  }

  List<DateTime> get _dateStrip {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final sel = DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day);

    // Centrar la fecha seleccionada para que siempre aparezca directamente visible en la tira
    DateTime start = sel.subtract(const Duration(days: 2));
    if (start.isBefore(today)) start = today;
    return List.generate(14, (i) => start.add(Duration(days: i)));
  }

  @override
  Widget build(BuildContext context) {
    final photos = _atr.fotosUrls.isNotEmpty ? _atr.fotosUrls : [_atr.imagenUrl ?? ''];
    final dateStrip = _dateStrip;

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(_atr.nombre, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.only(bottom: 110),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Galería
            SizedBox(
              height: 230,
              child: Stack(
                children: [
                  PageView.builder(
                    itemCount: photos.length,
                    onPageChanged: (i) => setState(() => _photoIndex = i),
                    itemBuilder: (_, i) => Image.network(
                      photos[i],
                      fit: BoxFit.cover,
                      width: double.infinity,
                      errorBuilder: (_, __, ___) => Container(
                        color: Colors.grey.shade200,
                        child: const Icon(Icons.attractions, size: 54),
                      ),
                    ),
                  ),
                  if (_atr.freeCancellation)
                    Positioned(
                      top: 12,
                      left: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(color: BookingColors.successGreen, borderRadius: BorderRadius.circular(6)),
                        child: const Text('Cancelación gratuita (24h)', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                      ),
                    ),
                  Positioned(
                    bottom: 10,
                    right: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(14)),
                      child: Text('${_photoIndex + 1} / ${photos.length}', style: const TextStyle(color: Colors.white, fontSize: 12)),
                    ),
                  ),
                ],
              ),
            ),

            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${_atr.ciudad} · Operado por ${_atr.proveedor}', style: const TextStyle(fontSize: 12, color: BookingColors.actionBlue, fontWeight: FontWeight.w600)),
                            const SizedBox(height: 4),
                            Text(_atr.nombre, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
                          ],
                        ),
                      ),
                      BookingRatingBadge(rating: _atr.rating, reviewsCount: _atr.reviewsCount),
                    ],
                  ),
                  const SizedBox(height: 10),

                  Wrap(
                    spacing: 12,
                    runSpacing: 6,
                    children: [
                      _infoPill(Icons.schedule, _atr.duracion),
                      _infoPill(Icons.translate, _atr.idiomas.join(', ')),
                      if (_atr.puntoEncuentro != null) _infoPill(Icons.place_outlined, _atr.puntoEncuentro!),
                    ],
                  ),
                  const SizedBox(height: 14),

                  Text(_atr.longDescription, style: const TextStyle(fontSize: 13, height: 1.45, color: BookingColors.textDark)),
                  const SizedBox(height: 14),

                  if (_atr.includes.isNotEmpty) ...[
                    const Text('¿Qué incluye esta experiencia?', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    ..._atr.includes.map((inc) => Padding(
                          padding: const EdgeInsets.only(bottom: 5),
                          child: Row(
                            children: [
                              const Icon(Icons.check_circle, size: 16, color: BookingColors.successGreen),
                              const SizedBox(width: 8),
                              Expanded(child: Text(inc, style: const TextStyle(fontSize: 13))),
                            ],
                          ),
                        )),
                    const SizedBox(height: 14),
                  ],

                  // Preguntas frecuentes (FAQ parity)
                  const ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: Text('Información importante y FAQ', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    children: [
                      ListTile(
                        dense: true,
                        title: Text('Presenta tu confirmación de reserva (PNR) y documento de identidad en el punto de encuentro 15 minutos antes de la hora reservada.'),
                      ),
                      ListTile(
                        dense: true,
                        title: Text('Cancelación gratuita permitida hasta 24 horas antes del inicio del tour.'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // 1. Selector de Fecha horizontal + Calendario
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('1. Elige la fecha', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                      TextButton.icon(
                        icon: const Icon(Icons.calendar_month, size: 16),
                        label: const Text('Otra fecha'),
                        onPressed: () async {
                          final p = await showDatePicker(
                            context: context,
                            initialDate: _selectedDate,
                            firstDate: DateTime.now(),
                            lastDate: DateTime.now().add(const Duration(days: 365)),
                          );
                          if (p != null) {
                            setState(() => _selectedDate = p);
                            _fetchSlots();
                          }
                        },
                      ),
                    ],
                  ),
                  Container(
                    margin: const EdgeInsets.only(top: 4, bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(
                      color: BookingColors.actionBlue.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: BookingColors.actionBlue.withValues(alpha: 0.2)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.event_available, size: 16, color: BookingColors.actionBlue),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Fecha seleccionada: ' + DateFormat('EEEE, d MMM yyyy').format(_selectedDate),
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: BookingColors.actionBlue),
                          ),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    height: 62,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      itemCount: dateStrip.length,
                      itemBuilder: (_, i) {
                        final d = dateStrip[i];
                        final isSel = d.year == _selectedDate.year && d.month == _selectedDate.month && d.day == _selectedDate.day;
                        return InkWell(
                          onTap: () {
                            setState(() => _selectedDate = d);
                            _fetchSlots();
                          },
                          child: Container(
                            width: 68,
                            margin: const EdgeInsets.only(right: 8),
                            decoration: BoxDecoration(
                              color: isSel ? BookingColors.actionBlue : Colors.white,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: isSel ? BookingColors.actionBlue : Colors.grey.shade300),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(DateFormat('EEE').format(d), style: TextStyle(fontSize: 11, color: isSel ? Colors.white70 : BookingColors.textMuted)),
                                Text(DateFormat('dd MMM').format(d), style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: isSel ? Colors.white : BookingColors.textDark)),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 16),

                  // 2. Horarios / TimeSlots en vivo
                  const Text('2. Horarios disponibles en vivo', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  if (_loadingSlots)
                    const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
                  else if (_slots.isEmpty && _slotsError != null)
                    Row(
                      children: [
                        Expanded(child: Text(_slotsError!, style: const TextStyle(color: BookingColors.errorRed))),
                        TextButton(onPressed: () => _fetchSlots(), child: const Text('Reintentar')),
                      ],
                    )
                  else if (_slots.isEmpty)
                    const Text('No hay horarios registrados para este día.', style: TextStyle(color: BookingColors.errorRed))
                  else
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _slots.map((slot) {
                        final selected = _selectedSlot?.slotId == slot.slotId;
                        final agotado = slot.estaAgotado;
                        return InkWell(
                          onTap: agotado
                              ? null
                              : () {
                                  setState(() {
                                    _selectedSlot = slot;
                                    _clampTicketsToCupos();
                                  });
                                },
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(
                              color: agotado
                                  ? Colors.grey.shade200
                                  : (selected ? BookingColors.actionBlue : Colors.white),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: agotado
                                    ? Colors.grey.shade300
                                    : (selected ? BookingColors.actionBlue : Colors.grey.shade400),
                              ),
                            ),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  slot.horaInicio,
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                    decoration: agotado ? TextDecoration.lineThrough : null,
                                    color: agotado ? BookingColors.textMuted : (selected ? Colors.white : BookingColors.textDark),
                                  ),
                                ),
                                Text(
                                  agotado ? 'AGOTADO' : '${slot.cuposDisponibles} cupos',
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: agotado ? BookingColors.errorRed : (selected ? Colors.white70 : BookingColors.successGreen),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  const SizedBox(height: 18),

                  // 3. Matriz de entradas según categorías habilitadas
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('3. Selecciona entradas', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                      if (_selectedSlot != null)
                        Text(
                          'Cupo máximo: $_totalTickets / $_maxCupos',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: BookingColors.actionBlue),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      child: Column(
                        children: [
                          _ticketRow(
                            title: _atr.soloPersonas ? 'Personas / Entradas' : 'Adultos (15+ años)',
                            priceText: 'US\$ ${_atr.precioAdulto.toStringAsFixed(2)}',
                            value: _adultos,
                            min: 1,
                            canAdd: _totalTickets < _maxCupos,
                            onChange: (v) => setState(() => _adultos = v),
                          ),
                          if (!_atr.soloPersonas && _atr.admiteNinos) ...[
                            const Divider(height: 12),
                            _ticketRow(
                              title: 'Niños (4 - 14 años)',
                              priceText: 'US\$ ${_unitNino.toStringAsFixed(2)}',
                              value: _ninos,
                              min: 0,
                              canAdd: _totalTickets < _maxCupos,
                              onChange: (v) => setState(() => _ninos = v),
                            ),
                          ],
                          if (!_atr.soloPersonas && _atr.admiteSeniors) ...[
                            const Divider(height: 12),
                            _ticketRow(
                              title: 'Tercera Edad (65+ años)',
                              priceText: 'US\$ ${_unitSenior.toStringAsFixed(2)}',
                              value: _seniors,
                              min: 0,
                              canAdd: _totalTickets < _maxCupos,
                              onChange: (v) => setState(() => _seniors = v),
                            ),
                          ],
                          if (!_atr.soloPersonas && _atr.admiteInfantes) ...[
                            const Divider(height: 12),
                            _ticketRow(
                              title: 'Infantes (0 - 3 años)',
                              priceText: _atr.precioInfante == 0 ? 'Gratis' : 'US\$ ${_atr.precioInfante.toStringAsFixed(2)}',
                              value: _infantes,
                              min: 0,
                              canAdd: _totalTickets < _maxCupos,
                              onChange: (v) => setState(() => _infantes = v),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
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
                    Text('$_totalTickets entrada(s) · ${_selectedSlot?.horaInicio ?? "Sin turno"}', style: const TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                    Text(
                      'US\$ ${(_subtotalTickets * 1.15).toStringAsFixed(2)}',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                    ),
                    const Text('Incluye 15% IVA SRI', style: TextStyle(fontSize: 10, color: BookingColors.successGreen)),
                  ],
                ),
              ),
              ElevatedButton(
                onPressed: (_selectedSlot == null || _selectedSlot!.estaAgotado) ? null : _openCheckoutModal,
                style: ElevatedButton.styleFrom(
                  backgroundColor: BookingColors.actionBlue,
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                ),
                child: const Text('Reservar ahora', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoPill(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.grey.shade300)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: BookingColors.actionBlue),
          const SizedBox(width: 5),
          Flexible(child: Text(text, style: const TextStyle(fontSize: 12))),
        ],
      ),
    );
  }

  Widget _ticketRow({
    required String title,
    required String priceText,
    required int value,
    required int min,
    required bool canAdd,
    required ValueChanged<int> onChange,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              Text(priceText, style: const TextStyle(fontSize: 12, color: BookingColors.actionBlue, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
        Row(
          children: [
            IconButton(
              onPressed: value > min ? () => onChange(value - 1) : null,
              icon: const Icon(Icons.remove_circle_outline),
            ),
            Text('$value', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            IconButton(
              onPressed: canAdd ? () => onChange(value + 1) : null,
              icon: const Icon(Icons.add_circle_outline, color: BookingColors.actionBlue),
            ),
          ],
        ),
      ],
    );
  }
}
