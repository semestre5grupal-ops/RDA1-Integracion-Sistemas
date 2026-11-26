import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../models/auto.dart';
import '../../models/reserva.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_client.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';
import '../../widgets/auth_guard_dialog.dart';
import '../../widgets/booking_rating_badge.dart';
import '../reservas/voucher_qr_screen.dart';

class AutoDetailScreen extends StatefulWidget {
  final Auto auto;
  final DateTime? initialPickupDate;
  final DateTime? initialDropoffDate;
  final String? pickupTime;
  final String? dropoffTime;
  final String? pickupLocation;
  final int initialDriverAge;

  const AutoDetailScreen({
    super.key,
    required this.auto,
    this.initialPickupDate,
    this.initialDropoffDate,
    this.pickupTime,
    this.dropoffTime,
    this.pickupLocation,
    this.initialDriverAge = 30,
  });

  @override
  State<AutoDetailScreen> createState() => _AutoDetailScreenState();
}

class _AutoDetailScreenState extends State<AutoDetailScreen> {
  static const double _coberturaTotalPorDia = 18.0;
  static const double _recargoJovenPorDiaDefault = 15.0;

  late Auto _auto;
  late DateTime _pickupDate;
  late DateTime _dropoffDate;
  late String _pickupTime;
  late String _dropoffTime;
  late String _location;
  late int _driverAge;

  bool _coberturaTotal = false;
  int _pickupTabIndex = 0; // 0: Recogida, 1: Qué incluye

  int get _days {
    final d = _dropoffDate.difference(_pickupDate).inDays;
    return d.clamp(1, 30);
  }

  double get _youngFeePerDay {
    if (_driverAge >= 25) return 0.0;
    return _auto.recargoConductorJoven > 0 ? _auto.recargoConductorJoven : _recargoJovenPorDiaDefault;
  }

  double get _baseRentalTotal => _auto.precioPorDia * _days;
  double get _youngFeeTotal => _youngFeePerDay * _days;
  double get _coverageTotal => (_coberturaTotal ? _coberturaTotalPorDia : 0.0) * _days;
  double get _subtotal => _baseRentalTotal + _youngFeeTotal + _coverageTotal;
  double get _iva => _subtotal * 0.15;
  double get _grandTotal => _subtotal + _iva;

  @override
  void initState() {
    super.initState();
    _auto = widget.auto;
    _pickupDate = widget.initialPickupDate ?? DateTime.now().add(const Duration(days: 3));
    _dropoffDate = (widget.initialDropoffDate != null && widget.initialDropoffDate!.isAfter(_pickupDate))
        ? widget.initialDropoffDate!
        : _pickupDate.add(const Duration(days: 3));
    _pickupTime = widget.pickupTime ?? '10:00';
    _dropoffTime = widget.dropoffTime ?? '10:00';
    _location = (widget.pickupLocation != null && widget.pickupLocation!.isNotEmpty) ? widget.pickupLocation! : 'Quito';
    _driverAge = widget.initialDriverAge.clamp(18, 99);
    _fetchFreshDetail();
  }

  Future<void> _fetchFreshDetail() async {
    final det = await BookingServices.getAutoDetalle(widget.auto.id);
    if (det != null && mounted) {
      setState(() => _auto = det);
    }
  }

  AutoFechaOcupada? _findConflictingRange() {
    for (final occ in _auto.fechasOcupadas) {
      final start = DateTime.tryParse(occ.pickup.split('T').first);
      final end = DateTime.tryParse(occ.dropoff.split('T').first);
      if (start == null || end == null) continue;
      final overlaps = !_dropoffDate.isBefore(start) && !_pickupDate.isAfter(end);
      if (overlaps) return occ;
    }
    return null;
  }

  void _showImportantInfoModal() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Información importante del alquiler', style: TextStyle(fontWeight: FontWeight.bold)),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('• Política de combustible: ${_auto.politicaCombustible}.'),
              const SizedBox(height: 6),
              Text(
                _coberturaTotal
                    ? '• Depósito de seguridad: US\$ 0 (Cobertura Total activa).'
                    : '• Depósito reembolsable al retirar: US\$ 1,200 retenido en tarjeta de crédito.',
              ),
              const SizedBox(height: 6),
              const Text('• Edad mínima: 18 años. Menores de 25 años incluyen recargo de conductor joven.'),
              const SizedBox(height: 6),
              const Text('• Cooldown 2h: La flota pasa por inspección técnica y desinfección entre reservas.'),
              const SizedBox(height: 6),
              const Text('• Documentos requeridos: Licencia vigente + Cédula/Pasaporte + Tarjeta a nombre del titular.'),
            ],
          ),
        ),
        actions: [
          ElevatedButton(onPressed: () => Navigator.pop(ctx), child: const Text('Entendido')),
        ],
      ),
    );
  }

  Future<void> _openAdjustRentalDialog() async {
    DateTime p = _pickupDate;
    DateTime d = _dropoffDate;
    int age = _driverAge;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setD) {
          return AlertDialog(
            title: const Text('Ajustar fechas y conductor'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.calendar_today),
                  title: const Text('Fecha de recogida'),
                  subtitle: Text('${DateFormat('dd MMM yyyy').format(p)} ($_pickupTime)'),
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: p,
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (picked != null) {
                      setD(() {
                        p = picked;
                        if (!d.isAfter(p)) d = p.add(const Duration(days: 2));
                      });
                    }
                  },
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.event),
                  title: const Text('Fecha de devolución (máx. 30 días)'),
                  subtitle: Text('${DateFormat('dd MMM yyyy').format(d)} ($_dropoffTime)'),
                  onTap: () async {
                    final maxD = p.add(const Duration(days: 30));
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: d.isAfter(maxD) ? maxD : d,
                      firstDate: p.add(const Duration(days: 1)),
                      lastDate: maxD,
                    );
                    if (picked != null) setD(() => d = picked);
                  },
                ),
                const Divider(),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Edad conductor:'),
                    Row(
                      children: [
                        IconButton(
                          onPressed: age > 18 ? () => setD(() => age--) : null,
                          icon: const Icon(Icons.remove_circle_outline),
                        ),
                        Text('$age años', style: const TextStyle(fontWeight: FontWeight.bold)),
                        IconButton(
                          onPressed: age < 99 ? () => setD(() => age++) : null,
                          icon: const Icon(Icons.add_circle_outline),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
              ElevatedButton(
                onPressed: () {
                  setState(() {
                    _pickupDate = p;
                    _dropoffDate = d;
                    _driverAge = age;
                  });
                  Navigator.pop(ctx);
                },
                child: const Text('Aplicar'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _openCheckoutModal() async {
    final conflict = _findConflictingRange();
    if (conflict != null || _auto.noDisponibleTotal) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('El vehículo no está disponible en las fechas seleccionadas.'), backgroundColor: BookingColors.errorRed),
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
    final docCtrl = TextEditingController(text: user?.cedula ?? '');
    final licCtrl = TextEditingController(text: user?.cedula ?? '');
    final cardCtrl = TextEditingController(text: '4532 8900 1234 5678');

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
                        const Text('Reservar vehículo', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue)),
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
                          Text('${_auto.carDisplayName} (${_auto.proveedor})', style: const TextStyle(fontWeight: FontWeight.bold)),
                          Text('${_days} día(s) · ${_coberturaTotal ? "Cobertura Total" : "Cobertura Básica"}',
                              style: const TextStyle(fontSize: 12, color: BookingColors.textMuted)),
                          Text('Total + 15% IVA: US\$ ${_grandTotal.toStringAsFixed(2)}',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: BookingColors.actionBlue)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: nameCtrl,
                      decoration: const InputDecoration(labelText: 'Conductor principal*', border: OutlineInputBorder()),
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
                      decoration: const InputDecoration(labelText: 'Teléfono*', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: docCtrl,
                            decoration: const InputDecoration(labelText: 'Cédula / Pasaporte*', border: OutlineInputBorder()),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextField(
                            controller: licCtrl,
                            decoration: const InputDecoration(labelText: 'N.º Licencia*', border: OutlineInputBorder()),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: cardCtrl,
                      keyboardType: TextInputType.number,
                      decoration:
                          const InputDecoration(labelText: 'Tarjeta de pago y garantía*', prefixIcon: Icon(Icons.credit_card), border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: submitting
                            ? null
                            : () async {
                                if (nameCtrl.text.trim().isEmpty || !emailCtrl.text.contains('@') || licCtrl.text.trim().length < 5) {
                                  setModal(() => errorMsg = 'Completa datos del conductor y número de licencia.');
                                  return;
                                }
                                setModal(() {
                                  submitting = true;
                                  errorMsg = null;
                                });
                                try {
                                  final pStr = DateFormat('yyyy-MM-dd').format(_pickupDate);
                                  final dStr = DateFormat('yyyy-MM-dd').format(_dropoffDate);
                                  final payload = <String, dynamic>{
                                    'vehicle_id': _auto.id,
                                    'auto_id': _auto.id,
                                    'pickup_location': _location,
                                    'pickup_date': pStr,
                                    'pickup_time': _pickupTime,
                                    'dropoff_date': dStr,
                                    'dropoff_time': _dropoffTime,
                                    'dias': _days,
                                    'driver_age': _driverAge,
                                    'cobertura': _coberturaTotal ? 'TOTAL' : 'BASICA',
                                    'seguro_total': _coberturaTotal,
                                    'cliente_nombre': nameCtrl.text.trim(),
                                    'cliente_email': emailCtrl.text.trim(),
                                    'cliente_telefono': telCtrl.text.trim(),
                                    'documento': docCtrl.text.trim(),
                                    'licencia_conducir': licCtrl.text.trim(),
                                    'metodo_pago': 'TARJETA',
                                    'moneda': 'USD',
                                  };

                                  final resData = await BookingServices.reservarAuto(
                                    payload,
                                    const Uuid().v4(),
                                    token: token,
                                  );

                                  final dataObj = resData['data'] is Map ? Map<String, dynamic>.from(resData['data']) : resData;
                                  final resId = dataObj['order_id']?.toString() ?? dataObj['id']?.toString() ?? 'AUTO-${DateTime.now().millisecondsSinceEpoch}';
                                  final pnr = dataObj['codigo_reserva']?.toString() ?? dataObj['pnr']?.toString() ?? resId;

                                  final nuevaReserva = Reserva(
                                    id: resId,
                                    vertical: 'autos',
                                    servicioNombre: 'Renta: ${_auto.carDisplayName}',
                                    proveedor: _auto.proveedor,
                                    fecha: pStr,
                                    hora: _pickupTime,
                                    checkin: pStr,
                                    checkout: dStr,
                                    total: _grandTotal,
                                    estado: (dataObj['status'] ?? dataObj['estado'] ?? 'CONFIRMADA').toString().toUpperCase(),
                                    voucherQr: dataObj['voucher_qr']?.toString() ?? 'BOOKING-AUTO-$pnr',
                                    pnr: pnr,
                                    imagenUrl: _auto.imagenUrl,
                                    fechaCreacion: DateTime.now(),
                                    fechaServicio: _pickupDate,
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
                                    errorMsg = e is ApiException ? e.userMessage : 'No se pudo reservar el auto: $e';
                                  });
                                }
                              },
                        style: ElevatedButton.styleFrom(backgroundColor: BookingColors.successGreen),
                        child: submitting
                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                            : const Text('Confirmar alquiler de auto', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
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

  @override
  Widget build(BuildContext context) {
    final conflict = _findConflictingRange();

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(_auto.carDisplayName, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            tooltip: 'Información importante',
            icon: const Icon(Icons.info_outline),
            onPressed: _showImportantInfoModal,
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.only(bottom: 115),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Tarjeta principal del vehículo
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(4)),
                            child: Text(_auto.proveedor, style: const TextStyle(fontWeight: FontWeight.bold, color: BookingColors.primaryBlue, fontSize: 12)),
                          ),
                          BookingRatingBadge(rating: _auto.proveedorRating),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Center(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(
                            _auto.imagenUrl ?? '',
                            height: 165,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const SizedBox(height: 140, child: Icon(Icons.directions_car, size: 70)),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text('${_auto.carDisplayName} o similar', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
                      Text('${_auto.categoria} · ${_auto.transmision}', style: const TextStyle(fontSize: 13, color: BookingColors.textMuted)),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 14,
                        runSpacing: 8,
                        children: [
                          _spec(Icons.person_outline, '${_auto.capacidadPasajeros} personas'),
                          _spec(Icons.sensor_door_outlined, '${_auto.puertas} puertas'),
                          _spec(Icons.luggage_outlined, '${_auto.maletasGrandes} maleta(s) grande(s)'),
                          _spec(Icons.backpack_outlined, '${_auto.maletasPequenas} pequeña(s)'),
                          _spec(Icons.speed, _auto.kilometrajeIlimitado ? 'Km ilimitados' : 'Km limitados'),
                          _spec(Icons.local_gas_station, _auto.politicaCombustible),
                          if (_auto.aireAcondicionado) _spec(Icons.ac_unit, 'Aire acondicionado'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),

              if (conflict != null)
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFCE8E8),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: BookingColors.errorRed),
                  ),
                  child: Text(
                    'Conflicto de calendario: este vehículo ya tiene una reserva entre ${conflict.pickup} y ${conflict.dropoff}. Cambia tus fechas.',
                    style: const TextStyle(color: BookingColors.errorRed, fontWeight: FontWeight.w600, fontSize: 12),
                  ),
                ),

              // Ajustar Alquiler & Conductor
              Card(
                child: ListTile(
                  leading: const Icon(Icons.tune, color: BookingColors.actionBlue),
                  title: Text('$_days día(s) · Conductor $_driverAge años', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  subtitle: Text(
                    '${DateFormat('dd MMM yyyy').format(_pickupDate)} ($_pickupTime) → ${DateFormat('dd MMM yyyy').format(_dropoffDate)} ($_dropoffTime)',
                    style: const TextStyle(fontSize: 12),
                  ),
                  trailing: TextButton(onPressed: _openAdjustRentalDialog, child: const Text('Editar')),
                ),
              ),
              const SizedBox(height: 12),

              // Recogida & Qué incluye tabs
              Row(
                children: [
                  Expanded(
                    child: ChoiceChip(
                      label: const Center(child: Text('Recogida y horario')),
                      selected: _pickupTabIndex == 0,
                      onSelected: (_) => setState(() => _pickupTabIndex = 0),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ChoiceChip(
                      label: const Center(child: Text('Qué incluye')),
                      selected: _pickupTabIndex == 1,
                      onSelected: (_) => setState(() => _pickupTabIndex = 1),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: _pickupTabIndex == 0
                      ? Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Mostrador: ${_auto.proveedorUbicacion}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                            const SizedBox(height: 4),
                            Text('Ciudad de búsqueda: $_location · Atención en Terminal Llegadas 24h.',
                                style: const TextStyle(fontSize: 12, color: BookingColors.textMuted)),
                          ],
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _incRow('Cancelación gratuita hasta 24h antes'),
                            _incRow('Inspección y Cooldown sanitario de 2 horas'),
                            _incRow('Asistencia en carretera en todo Ecuador 24/7'),
                          ],
                        ),
                ),
              ),
              const SizedBox(height: 16),

              // Selección de Cobertura (Básica vs Total +$18/día)
              const Text('Elige tu nivel de protección', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              _coverageOptionCard(
                selected: !_coberturaTotal,
                title: 'Cobertura Básica (Estándar)',
                priceText: '+US\$ 0.00 / día',
                desc: 'Incluye seguro obligatorio contra terceros. Requiere depósito reembolsable de US\$ 1,200.',
                onTap: () => setState(() => _coberturaTotal = false),
              ),
              const SizedBox(height: 8),
              _coverageOptionCard(
                selected: _coberturaTotal,
                title: 'Cobertura Total / Protección Completa',
                priceText: '+US\$ 18.00 / día',
                desc: 'Cero franquicia (\$0 deducible). Cubre daños por colisión, vidrios, llantas y robo sin depósito bloqueado.',
                badge: 'RECOMENDADO',
                onTap: () => setState(() => _coberturaTotal = true),
              ),
              const SizedBox(height: 16),

              // Desglose de tarifa claro
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Desglose de precio', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                      const Divider(height: 16),
                      _priceLine('Alquiler del vehículo ($_days días × \$${_auto.precioPorDia.toStringAsFixed(2)})', _baseRentalTotal),
                      if (_youngFeeTotal > 0) _priceLine('Recargo conductor joven (<25 años · $_days d)', _youngFeeTotal),
                      if (_coverageTotal > 0) _priceLine('Cobertura Total (+US\$ 18.00/día × $_days d)', _coverageTotal),
                      _priceLine('IVA (15% Ecuador)', _iva),
                      const Divider(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Total Final', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          Text('US\$ ${_grandTotal.toStringAsFixed(2)}',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: BookingColors.primaryBlue)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
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
                    Text('$_days día(s) · ${_coberturaTotal ? "Cobertura Total" : "Básica"}',
                        style: const TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                    Text('US\$ ${_grandTotal.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue)),
                    const Text('IVA 15% incluido', style: TextStyle(fontSize: 10, color: BookingColors.successGreen)),
                  ],
                ),
              ),
              ElevatedButton(
                onPressed: (conflict != null || _auto.noDisponibleTotal) ? null : _openCheckoutModal,
                style: ElevatedButton.styleFrom(
                  backgroundColor: BookingColors.actionBlue,
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                ),
                child: const Text('Ir a reservar', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _spec(IconData icon, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: BookingColors.actionBlue),
        const SizedBox(width: 5),
        Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
      ],
    );
  }

  Widget _incRow(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          const Icon(Icons.check_circle, size: 15, color: BookingColors.successGreen),
          const SizedBox(width: 6),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 12))),
        ],
      ),
    );
  }

  Widget _coverageOptionCard({
    required bool selected,
    required String title,
    required String priceText,
    required String desc,
    String? badge,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFEFF6FF) : Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: selected ? BookingColors.actionBlue : Colors.grey.shade300, width: selected ? 2 : 1),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(selected ? Icons.radio_button_checked : Icons.radio_button_off, color: BookingColors.actionBlue),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14))),
                      Text(priceText, style: const TextStyle(fontWeight: FontWeight.bold, color: BookingColors.actionBlue, fontSize: 13)),
                    ],
                  ),
                  if (badge != null) ...[
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: BookingColors.successGreen, borderRadius: BorderRadius.circular(4)),
                      child: Text(badge, style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold)),
                    ),
                  ],
                  const SizedBox(height: 4),
                  Text(desc, style: const TextStyle(fontSize: 12, color: BookingColors.textMuted)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _priceLine(String label, double val) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(child: Text(label, style: const TextStyle(fontSize: 12, color: BookingColors.textDark))),
          Text('US\$ ${val.toStringAsFixed(2)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
