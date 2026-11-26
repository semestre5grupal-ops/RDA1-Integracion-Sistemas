import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/alojamiento.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_client.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';
import '../../widgets/auth_guard_dialog.dart';
import '../../widgets/booking_rating_badge.dart';
import '../../widgets/occupancy_picker_sheet.dart';
import '../reservas/voucher_qr_screen.dart';
import '../../widgets/alojamiento_checkout_modal.dart';

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

    final selectedRooms = _products.where((r) => (_selectedCounts[r.productId] ?? 0) > 0).toList();
    if (selectedRooms.isEmpty) return;
    // ReservationRequestDto admite UN tipo de habitación (tipo_habitacion_id) por
    // reserva, igual que AlojamientoDetail.jsx (cotizacion.producto).
    if (selectedRooms.length > 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Reserva un tipo de habitación por vez: el hotel registra un solo tipo por reserva.')),
      );
      return;
    }

    final resultado = await AlojamientoCheckoutModal.show(
      context,
      AlojamientoCheckoutModal(
        alojamiento: _prop,
        checkin: _checkIn,
        checkout: _checkOut,
        adults: _occupancy.adultos,
        edadesNinos: _occupancy.edadesNinos,
        rooms: _totalRoomsSelected,
        tipoHabitacion: selectedRooms.first,
        nightsCount: _nights,
        totalPrice: _subtotalSelected,
      ),
    );
    if (resultado == null || !mounted) return;
    switch (resultado.accion) {
      case AccionTrasReserva.verVoucher:
        Navigator.push(context, MaterialPageRoute(builder: (_) => VoucherQrScreen(reserva: resultado.reserva)));
        break;
      case AccionTrasReserva.irAMisReservas:
        Navigator.pushNamed(context, '/reservas');
        break;
      case AccionTrasReserva.ninguna:
        break;
    }
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
