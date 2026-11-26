import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../models/alojamiento.dart';
import '../../models/reserva.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_client.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';
import '../../widgets/auth_guard_dialog.dart';
import '../../widgets/booking_rating_badge.dart';
import '../../widgets/occupancy_picker_sheet.dart';
import '../reservas/voucher_qr_screen.dart';

class AlojamientoDetailScreen extends StatefulWidget {
  final Alojamiento alojamiento;
  final DateTime? initialCheckIn;
  final DateTime? initialCheckOut;
  final OccupancySelection? initialOccupancy;

  const AlojamientoDetailScreen({
    super.key,
    required this.alojamiento,
    this.initialCheckIn,
    this.initialCheckOut,
    this.initialOccupancy,
  });

  @override
  State<AlojamientoDetailScreen> createState() => _AlojamientoDetailScreenState();
}

class _AlojamientoDetailScreenState extends State<AlojamientoDetailScreen> {
  late Alojamiento _prop;
  late DateTime _checkIn;
  late DateTime _checkOut;
  late OccupancySelection _occupancy;

  int _photoIndex = 0;
  bool _loadingAvail = true;
  String? _availError;
  List<TipoHabitacion> _products = [];
  final Map<String, int> _selectedCounts = {};

  int get _nights {
    final d = _checkOut.difference(_checkIn).inDays;
    return d > 0 ? d : 1;
  }

  @override
  void initState() {
    super.initState();
    _prop = widget.alojamiento;
    _checkIn = widget.initialCheckIn ?? DateTime.now().add(const Duration(days: 3));
    _checkOut = widget.initialCheckOut != null && widget.initialCheckOut!.isAfter(_checkIn) ? widget.initialCheckOut! : _checkIn.add(const Duration(days: 2));
    _occupancy = widget.initialOccupancy ?? const OccupancySelection(adultos: 2, habitaciones: 1);
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    await Future.wait([
      _fetchDetail(),
      _fetchAvailability(),
    ]);
  }

  Future<void> _fetchDetail() async {
    final det = await BookingServices.getAlojamientoDetalle(widget.alojamiento.id);
    if (det != null && mounted) {
      setState(() {
        _prop = det;
      });
    }
  }

  Future<void> _fetchAvailability() async {
    setState(() {
      _loadingAvail = true;
      _availError = null;
      _selectedCounts.clear();
    });

    try {
      final res = await BookingServices.consultarDisponibilidadAlojamiento(
        id: widget.alojamiento.id,
        checkin: DateFormat('yyyy-MM-dd').format(_checkIn),
        checkout: DateFormat('yyyy-MM-dd').format(_checkOut),
        adultos: _occupancy.adultos,
        edadesNinos: _occupancy.edadesNinos,
        habitaciones: _occupancy.habitaciones,
      );
      if (mounted) {
        final fallback = _prop.habitaciones.isNotEmpty
            ? _prop.habitaciones
            : [
                TipoHabitacion(
                  productId: '${_prop.id}-STD',
                  nombre: _prop.tipoAlojamiento ?? 'Habitación Estándar',
                  mealPlan: _prop.regimen,
                  reembolsable: _prop.cancelacionGratis,
                  price: _prop.precioPorNoche * _nights,
                  pricePerNight: _prop.precioPorNoche,
                  availableRooms: _prop.habitacionesDisponibles ?? 3,
                  capacidadAdultos: _prop.capacidadAdultos,
                  capacidadNinos: _prop.capacidadNinos,
                  camas: _prop.numCamas,
                  descripcionCamas: _prop.descripcionCamas,
                ),
              ];
        setState(() {
          _products = res.products.isNotEmpty ? res.products : fallback;
          _loadingAvail = false;
        });
      }
    } catch (e) {
      if (mounted) {
        final msg = e is ApiException ? e.userMessage : 'No se pudo consultar disponibilidad para esas fechas.';
        setState(() {
          _availError = msg;
          _products = _prop.habitaciones;
          _loadingAvail = false;
        });
      }
    }
  }

  int get _totalRoomsSelected => _selectedCounts.values.fold(0, (a, b) => a + b);

  int get _totalCapacityAdults {
    int sum = 0;
    for (final r in _products) {
      final qty = _selectedCounts[r.productId] ?? 0;
      sum += qty * r.capacidadAdultos;
    }
    return sum;
  }

  int get _totalCapacityGuests {
    int sum = 0;
    for (final r in _products) {
      final qty = _selectedCounts[r.productId] ?? 0;
      sum += qty * r.capacidadHuespedes;
    }
    return sum;
  }

  double get _subtotalSelected {
    double sum = 0.0;
    for (final r in _products) {
      final qty = _selectedCounts[r.productId] ?? 0;
      if (qty > 0) sum += r.price * qty;
    }
    return sum;
  }

  Future<void> _openCheckoutModal() async {
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final ok = await AuthGuardDialog.ensureAuthenticated(context, isAuthenticated: auth.isAuthenticated);
    if (!ok || !mounted) return;
    if (!Provider.of<AuthProvider>(context, listen: false).isAuthenticated) return;

    final user = Provider.of<AuthProvider>(context, listen: false).user;
    final token = Provider.of<AuthProvider>(context, listen: false).token;

    final selectedRooms = _products.where((r) => (_selectedCounts[r.productId] ?? 0) > 0).toList();
    if (selectedRooms.isEmpty) return;

    final nombreCtrl = TextEditingController(text: user?.nombre ?? '');
    final apellidoCtrl = TextEditingController(text: user?.apellido ?? '');
    final emailCtrl = TextEditingController(text: user?.email ?? '');
    final telCtrl = TextEditingController(text: user?.telefono ?? '+593');
    final docCtrl = TextEditingController(text: user?.cedula ?? '');
    final notasCtrl = TextEditingController();
    String docTipo = user?.tipoDocumento ?? 'CEDULA';
    String metodoPago = _prop.pagoEnAlojamiento ? 'TARJETA' : 'TARJETA';
    final cardNumCtrl = TextEditingController(text: '4532 8900 1234 5678');
    final cardExpCtrl = TextEditingController(text: '09/29');
    final cardCvvCtrl = TextEditingController(text: '842');

    int step = 0;
    bool submitting = false;
    String? errorMsg;

    final subtotal = _subtotalSelected;
    final iva = subtotal * 0.15;
    final grandTotal = subtotal + iva;

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
                        Text(
                          step == 0 ? 'Paso 1 de 2: Tus datos' : 'Paso 2 de 2: Pago y confirmación',
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: submitting ? null : () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const Divider(),
                    if (errorMsg != null)
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFCE8E8),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: BookingColors.errorRed),
                        ),
                        child: Text(errorMsg!, style: const TextStyle(color: BookingColors.errorRed, fontSize: 12)),
                      ),
                    if (step == 0) ...[
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: nombreCtrl,
                              decoration: const InputDecoration(labelText: 'Nombre*', border: OutlineInputBorder()),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextField(
                              controller: apellidoCtrl,
                              decoration: const InputDecoration(labelText: 'Apellido*', border: OutlineInputBorder()),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: emailCtrl,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(labelText: 'Email de confirmación*', border: OutlineInputBorder()),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: telCtrl,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(labelText: 'Teléfono de contacto*', border: OutlineInputBorder()),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            flex: 2,
                            child: DropdownButtonFormField<String>(
                              value: ['CEDULA', 'PASAPORTE', 'RUC'].contains(docTipo) ? docTipo : 'CEDULA',
                              decoration: const InputDecoration(labelText: 'Documento', border: OutlineInputBorder()),
                              items: const [
                                DropdownMenuItem(value: 'CEDULA', child: Text('Cédula')),
                                DropdownMenuItem(value: 'PASAPORTE', child: Text('Pasaporte')),
                                DropdownMenuItem(value: 'RUC', child: Text('RUC')),
                              ],
                              onChanged: (v) {
                                if (v != null) setModal(() => docTipo = v);
                              },
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            flex: 3,
                            child: TextField(
                              controller: docCtrl,
                              decoration: InputDecoration(
                                labelText: widget.alojamiento.id.contains('~') ? 'Número documento*' : 'Número documento',
                                border: const OutlineInputBorder(),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: notasCtrl,
                        maxLines: 2,
                        decoration: const InputDecoration(
                          labelText: 'Peticiones especiales (opcional)',
                          hintText: 'Ej. Piso alto, llegada tarde...',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 14),
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: ElevatedButton(
                          onPressed: () {
                            if (nombreCtrl.text.trim().isEmpty || apellidoCtrl.text.trim().isEmpty || !emailCtrl.text.contains('@')) {
                              setModal(() => errorMsg = 'Completa nombre, apellido y un correo válido.');
                              return;
                            }
                            if (widget.alojamiento.id.contains('~') && docCtrl.text.trim().length < 5) {
                              setModal(() => errorMsg = 'El número de documento es obligatorio para este hotel.');
                              return;
                            }
                            setModal(() {
                              errorMsg = null;
                              step = 1;
                            });
                          },
                          style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                          child: const Text('Siguiente: Revisar pago >', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                        ),
                      ),
                    ] else ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF8FAFC),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.grey.shade300),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_prop.nombre, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                            Text(
                              '${DateFormat('dd MMM yyyy').format(_checkIn)} → ${DateFormat('dd MMM yyyy').format(_checkOut)} ($_nights noches · $_totalRoomsSelected hab.)',
                              style: const TextStyle(fontSize: 12, color: BookingColors.textMuted),
                            ),
                            const Divider(height: 14),
                            ...selectedRooms.map((r) {
                              final qty = _selectedCounts[r.productId] ?? 1;
                              return Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(child: Text('$qty x ${r.nombre}', style: const TextStyle(fontSize: 12))),
                                  Text('US\$ ${(r.price * qty).toStringAsFixed(2)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                ],
                              );
                            }),
                            const SizedBox(height: 6),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('IVA (15% Ecuador):', style: TextStyle(fontSize: 12, color: BookingColors.textMuted)),
                                Text('US\$ ${iva.toStringAsFixed(2)}', style: const TextStyle(fontSize: 12)),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Total Final:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                                Text('US\$ ${grandTotal.toStringAsFixed(2)}',
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: BookingColors.actionBlue)),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: metodoPago,
                        decoration: const InputDecoration(labelText: 'Método de pago', border: OutlineInputBorder()),
                        items: [
                          const DropdownMenuItem(value: 'TARJETA', child: Text('Tarjeta de Crédito / Débito')),
                          if (_prop.pagoEnAlojamiento) const DropdownMenuItem(value: 'PAGO_EN_ALOJAMIENTO', child: Text('Pagar en el alojamiento (Check-in)')),
                        ],
                        onChanged: (v) {
                          if (v != null) setModal(() => metodoPago = v);
                        },
                      ),
                      if (metodoPago == 'TARJETA') ...[
                        const SizedBox(height: 10),
                        TextField(
                          controller: cardNumCtrl,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(labelText: 'Número de tarjeta', prefixIcon: Icon(Icons.credit_card), border: OutlineInputBorder()),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: cardExpCtrl,
                                decoration: const InputDecoration(labelText: 'Vencimiento (MM/AA)', border: OutlineInputBorder()),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: TextField(
                                controller: cardCvvCtrl,
                                obscureText: true,
                                decoration: const InputDecoration(labelText: 'CVV', border: OutlineInputBorder()),
                              ),
                            ),
                          ],
                        ),
                      ],
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          TextButton(
                            onPressed: submitting ? null : () => setModal(() => step = 0),
                            child: const Text('< Atrás'),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: SizedBox(
                              height: 48,
                              child: ElevatedButton(
                                onPressed: submitting
                                    ? null
                                    : () async {
                                        setModal(() {
                                          submitting = true;
                                          errorMsg = null;
                                        });
                                        try {
                                          final cin = DateFormat('yyyy-MM-dd').format(_checkIn);
                                          final cout = DateFormat('yyyy-MM-dd').format(_checkOut);
                                          final primary = selectedRooms.first;
                                          final payload = <String, dynamic>{
                                            'checkin': cin,
                                            'checkout': cout,
                                            'adultos': _occupancy.adultos,
                                            'ninos': _occupancy.ninos,
                                            'edades_ninos': _occupancy.edadesNinos,
                                            'habitaciones': _totalRoomsSelected,
                                            'tipo_habitacion_id': primary.productId,
                                            'product_id': primary.productId,
                                            'items': selectedRooms
                                                .map((r) => {
                                                      'tipo_habitacion_id': r.productId,
                                                      'product_id': r.productId,
                                                      'cantidad': _selectedCounts[r.productId] ?? 1,
                                                    })
                                                .toList(),
                                            'titular': {
                                              'nombre': nombreCtrl.text.trim(),
                                              'apellido': apellidoCtrl.text.trim(),
                                              'email': emailCtrl.text.trim(),
                                              'telefono': telCtrl.text.trim(),
                                              'documento_tipo': docTipo,
                                              if (docCtrl.text.trim().isNotEmpty) 'documento_numero': docCtrl.text.trim(),
                                            },
                                            'metodo_pago': metodoPago,
                                            if (notasCtrl.text.trim().isNotEmpty) 'notas_especiales': notasCtrl.text.trim(),
                                            'moneda': 'USD',
                                          };

                                          final resData = await BookingServices.reservarAlojamiento(
                                            _prop.id,
                                            payload,
                                            const Uuid().v4(),
                                            token: token,
                                          );

                                          final dataObj = resData['data'] is Map ? Map<String, dynamic>.from(resData['data']) : resData;
                                          final resId = dataObj['reservation_id']?.toString() ??
                                              dataObj['id']?.toString() ??
                                              'ALO-${DateTime.now().millisecondsSinceEpoch}';
                                          final pnr = dataObj['codigo_reserva']?.toString() ?? dataObj['pnr']?.toString() ?? resId;

                                          final nuevaReserva = Reserva(
                                            id: resId,
                                            vertical: 'alojamientos',
                                            servicioNombre: '${_prop.nombre} (${primary.nombre})',
                                            proveedor: _prop.ciudad,
                                            fecha: cin,
                                            checkin: cin,
                                            checkout: cout,
                                            total: grandTotal,
                                            estado: (dataObj['status'] ?? dataObj['estado'] ?? 'CONFIRMADA').toString().toUpperCase(),
                                            voucherQr: dataObj['voucher_qr']?.toString() ?? 'BOOKING-ALO-$pnr',
                                            pnr: pnr,
                                            imagenUrl: _prop.imagenUrl,
                                            fechaCreacion: DateTime.now(),
                                            fechaServicio: _checkIn,
                                          );

                                          BookingServices.agregarReservaDirecta(nuevaReserva);

                                          if (!ctx.mounted) return;
                                          Navigator.pop(ctx);
                                          if (!mounted) return;
                                          Navigator.pushReplacement(
                                            context,
                                            MaterialPageRoute(builder: (_) => VoucherQrScreen(reserva: nuevaReserva)),
                                          );
                                        } catch (e) {
                                          setModal(() {
                                            submitting = false;
                                            errorMsg = e is ApiException ? e.userMessage : 'No se pudo completar la reserva: $e';
                                          });
                                        }
                                      },
                                style: ElevatedButton.styleFrom(backgroundColor: BookingColors.successGreen),
                                child: submitting
                                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                                    : const Text('Confirmar y emitir voucher', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final photos = _prop.fotosUrls.isNotEmpty ? _prop.fotosUrls : [_prop.imagenUrl ?? ''];
    final capacityWarning = _totalRoomsSelected > 0 && _totalCapacityGuests < _occupancy.totalHuespedes;

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(_prop.nombre, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.only(bottom: 110),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Galería de fotos
            SizedBox(
              height: 235,
              child: Stack(
                children: [
                  PageView.builder(
                    itemCount: photos.length,
                    onPageChanged: (idx) => setState(() => _photoIndex = idx),
                    itemBuilder: (_, i) => Image.network(
                      photos[i],
                      fit: BoxFit.cover,
                      width: double.infinity,
                      errorBuilder: (_, __, ___) => Container(
                        color: Colors.blueGrey.shade100,
                        child: const Icon(Icons.hotel, size: 60, color: BookingColors.textMuted),
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: 10,
                    right: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(14)),
                      child: Text(
                        '${_photoIndex + 1} / ${photos.length}',
                        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                      ),
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
                            Row(
                              children: List.generate(
                                _prop.estrellas.clamp(1, 5),
                                (_) => const Icon(Icons.star, size: 15, color: Color(0xFFFFB700)),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(_prop.nombre, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                const Icon(Icons.location_on, size: 15, color: BookingColors.actionBlue),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Text(
                                    '${_prop.ciudad}${_prop.direccion != null ? " · ${_prop.direccion}" : ""}',
                                    style: const TextStyle(fontSize: 12, color: BookingColors.actionBlue),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      BookingRatingBadge(rating: _prop.rating, reviewsCount: _prop.reviewsCount > 0 ? _prop.reviewsCount : null),
                    ],
                  ),
                  const SizedBox(height: 12),

                  Text(_prop.descripcion, style: const TextStyle(fontSize: 13, height: 1.45, color: BookingColors.textDark)),
                  const SizedBox(height: 14),

                  // Amenidades del alojamiento
                  if (_prop.amenidades.isNotEmpty) ...[
                    const Text('Servicios populares', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: _prop.amenidades.map((am) {
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Colors.grey.shade300),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.check, size: 14, color: BookingColors.successGreen),
                              const SizedBox(width: 4),
                              Text(am, style: const TextStyle(fontSize: 12)),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Normas y Horarios
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Normas de la casa', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Check-in: desde ${_prop.checkinDesde}', style: const TextStyle(fontSize: 12)),
                            Text('Check-out: hasta ${_prop.checkoutHasta}', style: const TextStyle(fontSize: 12)),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _prop.cancelacionGratis ? '• Cancelación gratuita disponible hasta 48h antes.' : '• Tarifa sujeta a condiciones no reembolsables.',
                          style: TextStyle(fontSize: 12, color: _prop.cancelacionGratis ? BookingColors.successGreen : BookingColors.textMuted),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Barra de Disponibilidad Editable (BarraDisponibilidad.jsx parity)
                  const Text('Disponibilidad para tu estancia', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: BookingColors.accentYellow,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                style: OutlinedButton.styleFrom(backgroundColor: Colors.white),
                                icon: const Icon(Icons.calendar_today, size: 15),
                                label: Text('Entrada: ${DateFormat('dd MMM').format(_checkIn)}', style: const TextStyle(fontSize: 12)),
                                onPressed: () async {
                                  final p = await showDatePicker(
                                    context: context,
                                    initialDate: _checkIn,
                                    firstDate: DateTime.now(),
                                    lastDate: DateTime.now().add(const Duration(days: 365)),
                                  );
                                  if (p != null) {
                                    setState(() {
                                      _checkIn = p;
                                      if (!_checkOut.isAfter(_checkIn)) _checkOut = _checkIn.add(const Duration(days: 2));
                                    });
                                    _fetchAvailability();
                                  }
                                },
                              ),
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: OutlinedButton.icon(
                                style: OutlinedButton.styleFrom(backgroundColor: Colors.white),
                                icon: const Icon(Icons.event, size: 15),
                                label: Text('Salida: ${DateFormat('dd MMM').format(_checkOut)}', style: const TextStyle(fontSize: 12)),
                                onPressed: () async {
                                  final p = await showDatePicker(
                                    context: context,
                                    initialDate: _checkOut,
                                    firstDate: _checkIn.add(const Duration(days: 1)),
                                    lastDate: DateTime.now().add(const Duration(days: 365)),
                                  );
                                  if (p != null) {
                                    setState(() => _checkOut = p);
                                    _fetchAvailability();
                                  }
                                },
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(backgroundColor: Colors.white),
                            icon: const Icon(Icons.people_outline, size: 16),
                            label: Text('${_occupancy.resumenTexto} · $_nights noche(s)', style: const TextStyle(fontSize: 12)),
                            onPressed: () async {
                              final res = await OccupancyPickerSheet.show(context, initial: _occupancy);
                              if (res != null) {
                                setState(() => _occupancy = res);
                                _fetchAvailability();
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  if (_availError != null)
                    Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF3E0),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.orange),
                      ),
                      child: Text(_availError!, style: const TextStyle(fontSize: 12, color: Color(0xFF7A4100))),
                    ),

                  if (capacityWarning)
                    Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF8E1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: BookingColors.accentYellow),
                      ),
                      child: Text(
                        'Capacidad seleccionada: $_totalCapacityGuests persona(s) para $_totalRoomsSelected habitación(es). Tu búsqueda pide ${_occupancy.totalHuespedes} huésped(es).',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                    ),

                  // Lista de tipos de habitación reales y capacidades
                  if (_loadingAvail)
                    const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
                  else if (_products.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('No hay habitaciones disponibles para estas fechas. Prueba cambiar tus fechas o huéspedes.'),
                      ),
                    )
                  else
                    ..._products.map((room) {
                      final qty = _selectedCounts[room.productId] ?? 0;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                          side: BorderSide(
                            color: qty > 0 ? BookingColors.actionBlue : Colors.grey.shade300,
                            width: qty > 0 ? 1.8 : 1,
                          ),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      room.nombre,
                                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: BookingColors.actionBlue),
                                    ),
                                  ),
                                  if (room.tamanoM2 != null)
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(4)),
                                      child: Text('${room.tamanoM2!.toStringAsFixed(0)} m²', style: const TextStyle(fontSize: 11)),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 6),

                              // Capacidades y camas reales
                              Row(
                                children: [
                                  const Icon(Icons.person, size: 16, color: BookingColors.textDark),
                                  const SizedBox(width: 4),
                                  Text(
                                    'Máx: ${room.capacidadAdultos} adulto(s)${room.capacidadNinos > 0 ? ", ${room.capacidadNinos} niño(s)" : ""}',
                                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                                  ),
                                  const SizedBox(width: 12),
                                  const Icon(Icons.bed, size: 16, color: BookingColors.textMuted),
                                  const SizedBox(width: 4),
                                  Expanded(
                                    child: Text(
                                      room.descripcionCamas ?? '${room.camas} cama(s)',
                                      style: const TextStyle(fontSize: 12, color: BookingColors.textMuted),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),

                              Wrap(
                                spacing: 10,
                                runSpacing: 4,
                                children: [
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(Icons.restaurant, size: 14, color: BookingColors.successGreen),
                                      const SizedBox(width: 4),
                                      Text(room.mealPlan, style: const TextStyle(fontSize: 12, color: BookingColors.successGreen, fontWeight: FontWeight.w600)),
                                    ],
                                  ),
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        room.reembolsable ? Icons.check_circle_outline : Icons.info_outline,
                                        size: 14,
                                        color: room.reembolsable ? BookingColors.successGreen : BookingColors.textMuted,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(room.cancellationText, style: const TextStyle(fontSize: 11)),
                                    ],
                                  ),
                                ],
                              ),
                              if (room.amenidades.isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Text(
                                  room.amenidades.take(5).join(' · '),
                                  style: const TextStyle(fontSize: 11, color: BookingColors.textMuted),
                                ),
                              ],
                              const Divider(height: 16),

                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'US\$ ${room.price.toStringAsFixed(2)}',
                                        style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold, color: BookingColors.textDark),
                                      ),
                                      Text(
                                        '$_nights noche(s) (US\$ ${room.pricePerNight.toStringAsFixed(2)}/noche) + 15% IVA',
                                        style: const TextStyle(fontSize: 11, color: BookingColors.textMuted),
                                      ),
                                      Text(
                                        '${room.availableRooms} disponible(s)',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                          color: room.availableRooms <= 2 ? BookingColors.errorRed : BookingColors.successGreen,
                                        ),
                                      ),
                                    ],
                                  ),
                                  Row(
                                    children: [
                                      IconButton(
                                        onPressed: qty > 0
                                            ? () {
                                                setState(() {
                                                  if (qty <= 1) {
                                                    _selectedCounts.remove(room.productId);
                                                  } else {
                                                    _selectedCounts[room.productId] = qty - 1;
                                                  }
                                                });
                                              }
                                            : null,
                                        icon: const Icon(Icons.remove_circle_outline),
                                      ),
                                      Text('$qty', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                      IconButton(
                                        onPressed: qty < room.availableRooms ? () => setState(() => _selectedCounts[room.productId] = qty + 1) : null,
                                        icon: const Icon(Icons.add_circle_outline, color: BookingColors.actionBlue),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomSheet: _totalRoomsSelected > 0
          ? Container(
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
                          Text(
                            '$_totalRoomsSelected hab. · $_totalCapacityAdults adulto(s) · $_nights noches',
                            style: const TextStyle(fontSize: 11, color: BookingColors.textMuted),
                          ),
                          Text(
                            'US\$ ${(_subtotalSelected * 1.15).toStringAsFixed(2)}',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                          ),
                          const Text('Incluye 15% IVA', style: TextStyle(fontSize: 10, color: BookingColors.successGreen)),
                        ],
                      ),
                    ),
                    ElevatedButton(
                      onPressed: _openCheckoutModal,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: BookingColors.actionBlue,
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                      ),
                      child: const Text('Reservar ahora', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ),
            )
          : null,
    );
  }
}
