import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/reserva.dart';
import '../../providers/auth_provider.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';
import '../auth/login_screen.dart';
import 'detalle_reserva_vuelo_screen.dart';
import 'voucher_qr_screen.dart';
import '../../widgets/booking_footer.dart';
import '../../widgets/modal_cambio_fecha.dart';
import '../../widgets/modal_postventa.dart';

class MisReservasScreen extends StatefulWidget {
  const MisReservasScreen({super.key});

  @override
  State<MisReservasScreen> createState() => _MisReservasScreenState();
}

class _MisReservasScreenState extends State<MisReservasScreen> {
  bool _loading = true;
  List<Reserva> _reservas = [];
  String _selectedVertical = 'todos'; // todos, alojamientos, vuelos, autos, atracciones
  String? _lastAuthKey;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _startSilentPolling();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  void _startSilentPolling() {
    _pollTimer?.cancel();
    // Sondeo periódico cada 2.8s (simulación gRPC / eventos reactivos en segundo plano)
    _pollTimer = Timer.periodic(const Duration(milliseconds: 2800), (_) => _pollReservasSilencioso());
  }

  Future<void> _pollReservasSilencioso() async {
    if (!mounted) return;
    final auth = Provider.of<AuthProvider>(context, listen: false);
    try {
      final list = await BookingServices.getMisReservas(
        token: auth.token,
        email: auth.user?.email,
      );
      if (!mounted) return;
      // Verificar si hubo cambios en cantidad o en estados (ej. CONFIRMED -> CONFIRMADO_ASISTIDO)
      bool hayCambios = list.length != _reservas.length;
      if (!hayCambios) {
        for (int i = 0; i < list.length; i++) {
          if (list[i].id != _reservas[i].id || list[i].estado != _reservas[i].estado) {
            hayCambios = true;
            break;
          }
        }
      }
      if (hayCambios) {
        setState(() {
          _reservas = list;
        });
      }
    } catch (_) {
      // Ignorar errores transitorios de red en el sondeo de fondo
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final auth = Provider.of<AuthProvider>(context);
    final authKey = '${auth.isAuthenticated}|${auth.user?.email ?? ''}';
    if (_lastAuthKey != authKey) {
      _lastAuthKey = authKey;
      _loadReservas();
    }
  }

  Future<void> _loadReservas() async {
    if (!mounted) return;
    setState(() => _loading = true);
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final list = await BookingServices.getMisReservas(
      token: auth.token,
      email: auth.user?.email,
    );
    if (mounted) {
      setState(() {
        _reservas = list;
        _loading = false;
      });
    }
  }

  void _avisar(String mensaje, {bool ok = true}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(mensaje), backgroundColor: ok ? BookingColors.successGreen : BookingColors.errorRed),
    );
  }

  /// Postventa de vuelos (ModalPostventa.jsx): check-in, equipaje o cancelación
  /// con cotización. Tras el éxito se recarga la lista, igual que React recarga
  /// la reserva en vez de parchear el estado a mano.
  Future<void> _postventaVuelo(Reserva r, TipoPostventa tipo) async {
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final res = await ModalPostventa.show(context, tipo: tipo, bookingId: r.id, pnr: r.pnr ?? r.id, token: auth.token);
    if (res == null || !mounted) return;
    _avisar(res.mensaje);
    _loadReservas();
  }

  Future<void> _cambiarFechaVuelo(Reserva r) async {
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final res = await ModalCambioFecha.show(context, bookingId: r.id, pnr: r.pnr ?? r.id, token: auth.token);
    if (res == null || !mounted) return;
    _avisar(res.mensaje);
    _loadReservas();
  }

  Future<void> _confirmarCancelacion(Reserva r) async {
    // Vuelos: el backend exige el quoteId de /cancellation-quote (CancelBookingRequestDto).
    if (r.vertical.toLowerCase().contains('vuelo')) {
      return _postventaVuelo(r, TipoPostventa.cancelar);
    }
    final reasonCtrl = TextEditingController(text: 'Cambio de planes de viaje');
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancelar reserva', style: TextStyle(fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('¿Seguro que deseas cancelar "${r.servicioNombre}" (PNR: ${r.pnr ?? r.id})?'),
            const SizedBox(height: 10),
            TextField(
              controller: reasonCtrl,
              decoration: const InputDecoration(
                labelText: 'Motivo de cancelación',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Mantener reserva')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: BookingColors.errorRed),
            child: const Text('Sí, cancelar', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirm != true || !mounted) return;

    final auth = Provider.of<AuthProvider>(context, listen: false);
    final ok = await BookingServices.cancelarReserva(
      r.id,
      r.vertical,
      token: auth.token,
      reason: reasonCtrl.text.trim().isNotEmpty ? reasonCtrl.text.trim() : 'Cancelación cliente',
    );

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok ? 'Reserva cancelada correctamente.' : 'No se pudo cancelar en el proveedor.'),
        backgroundColor: ok ? BookingColors.successGreen : BookingColors.errorRed,
      ),
    );
    if (ok) _loadReservas();
  }

  List<Reserva> get _filteredReservas {
    if (_selectedVertical == 'todos') return _reservas;
    return _reservas.where((r) => r.vertical.toLowerCase().contains(_selectedVertical)).toList();
  }

  IconData _verticalIcon(String v) {
    final l = v.toLowerCase();
    if (l.contains('vuelo')) return Icons.flight;
    if (l.contains('auto')) return Icons.directions_car;
    if (l.contains('alojamiento')) return Icons.hotel;
    return Icons.attractions;
  }

  String _verticalLabel(String v) {
    final l = v.toLowerCase();
    if (l.contains('vuelo')) return 'Vuelo';
    if (l.contains('auto')) return 'Auto';
    if (l.contains('alojamiento')) return 'Alojamiento';
    return 'Atracción';
  }

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);
    final list = _filteredReservas;

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Mis Reservas y Viajes', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 17)),
        actions: [
          IconButton(
            tooltip: 'Actualizar',
            icon: const Icon(Icons.refresh),
            onPressed: _loadReservas,
          ),
        ],
      ),
      body: Column(
        children: [
          if (!auth.isAuthenticated)
            Container(
              width: double.infinity,
              color: const Color(0xFFFFF8E1),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: BookingColors.primaryBlue, size: 20),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Inicia sesión para sincronizar tus reservas de alojamientos y historial completo.',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                  TextButton(
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LoginScreen())),
                    child: const Text('Entrar'),
                  ),
                ],
              ),
            ),

          // Filtros por categoría vertical
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  ...[
                    {'key': 'todos', 'label': 'Todos'},
                    {'key': 'alojamientos', 'label': 'Alojamientos'},
                    {'key': 'vuelos', 'label': 'Vuelos'},
                    {'key': 'autos', 'label': 'Autos'},
                    {'key': 'atracciones', 'label': 'Atracciones'},
                  ].map((item) {
                    final sel = _selectedVertical == item['key'];
                    return Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text(item['label']!, style: TextStyle(fontSize: 12, color: sel ? Colors.white : BookingColors.textDark)),
                        selected: sel,
                        selectedColor: BookingColors.actionBlue,
                        onSelected: (_) => setState(() => _selectedVertical = item['key']!),
                      ),
                    );
                  }),
                ],
              ),
            ),
          ),

          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _loadReservas,
                    child: list.isEmpty
                        ? ListView(
                            children: const [
                              SizedBox(height: 90),
                              Icon(Icons.confirmation_number_outlined, size: 60, color: BookingColors.textMuted),
                              SizedBox(height: 12),
                              Center(
                                child: Text(
                                  'No tienes reservas en esta categoría.',
                                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: BookingColors.textMuted),
                                ),
                              ),
                              SizedBox(height: 80),
                              BookingFooter(),
                            ],
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.all(14),
                            itemCount: list.length + 1,
                            itemBuilder: (_, i) {
                              if (i == list.length) {
                                return const Padding(
                                  padding: EdgeInsets.only(top: 20),
                                  child: BookingFooter(),
                                );
                              }
                              return _buildReservaCard(list[i]);
                            },
                          ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildReservaCard(Reserva r) {
    final isVuelo = r.vertical.toLowerCase().contains('vuelo');
    final canCheckIn = isVuelo && !r.esCancelada && !r.esAsistido;
    final statusColor = r.esCancelada
        ? BookingColors.errorRed
        : (r.esAsistido ? const Color(0xFF15803D) : BookingColors.successGreen);
    final statusBg = r.esCancelada
        ? BookingColors.errorRed.withValues(alpha: 0.12)
        : (r.esAsistido ? const Color(0xFFDCFCE7) : BookingColors.successGreen.withValues(alpha: 0.12));

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: Colors.grey.shade200)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(_verticalIcon(r.vertical), size: 18, color: BookingColors.primaryBlue),
                    const SizedBox(width: 6),
                    Text(
                      _verticalLabel(r.vertical).toUpperCase(),
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusBg,
                    borderRadius: BorderRadius.circular(5),
                    border: Border.all(color: statusColor.withValues(alpha: 0.35)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (r.esAsistido) ...[
                        const Icon(Icons.check_circle_rounded, size: 13, color: Color(0xFF15803D)),
                        const SizedBox(width: 4),
                      ],
                      Text(
                        r.estadoDisplay,
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: statusColor),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(r.servicioNombre, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
            if (r.esAsistido) ...[
              const SizedBox(height: 3),
              Row(
                children: [
                  const Icon(Icons.verified, size: 13, color: Color(0xFF15803D)),
                  const SizedBox(width: 4),
                  Text(
                    r.vertical.contains('auto')
                        ? '• Llaves entregadas (Servicio en curso)'
                        : '• Asistencia confirmada (Sí asistió)',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF15803D)),
                  ),
                ],
              ),
            ],
            if (r.proveedor != null && r.proveedor!.isNotEmpty) Text(r.proveedor!, style: const TextStyle(fontSize: 12, color: BookingColors.textMuted)),
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(Icons.qr_code, size: 14, color: BookingColors.actionBlue),
                const SizedBox(width: 4),
                Text('PNR / Código: ${r.pnr ?? r.id}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, fontFamily: 'monospace')),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              r.checkin != null && r.checkout != null
                  ? 'Del ${r.checkin} al ${r.checkout}'
                  : 'Fecha: ${r.fecha}${r.hora != null && r.hora!.isNotEmpty ? " · ${r.hora}" : ""}',
              style: const TextStyle(fontSize: 12, color: BookingColors.textMuted),
            ),
            const Divider(height: 18),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Total pagado (incl. IVA)', style: TextStyle(fontSize: 10, color: BookingColors.textMuted)),
                    Text(
                      'US\$ ${r.total.toStringAsFixed(2)}',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                    ),
                  ],
                ),
                const SizedBox(width: 12),
                Flexible(
                  child: Wrap(
                    alignment: WrapAlignment.end,
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (isVuelo)
                        OutlinedButton.icon(
                          onPressed: () {
                            Navigator.push(context, MaterialPageRoute(builder: (_) => DetalleReservaVueloScreen(reserva: r)));
                          },
                          icon: const Icon(Icons.airplane_ticket_outlined, size: 16),
                          label: const Text('Boletos / Pase', style: TextStyle(fontSize: 12)),
                        ),
                      OutlinedButton.icon(
                        onPressed: () {
                          Navigator.push(context, MaterialPageRoute(builder: (_) => VoucherQrScreen(reserva: r)));
                        },
                        icon: const Icon(Icons.qr_code_2, size: 16),
                        label: const Text('Voucher QR', style: TextStyle(fontSize: 12)),
                      ),
                      if (isVuelo && !r.esCancelada && !r.esAsistido) ...[
                        OutlinedButton.icon(
                          onPressed: () => _cambiarFechaVuelo(r),
                          icon: const Icon(Icons.event_repeat, size: 16),
                          label: const Text('Cambiar fecha', style: TextStyle(fontSize: 12)),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => _postventaVuelo(r, TipoPostventa.equipaje),
                          icon: const Icon(Icons.luggage_outlined, size: 16),
                          label: const Text('Añadir equipaje', style: TextStyle(fontSize: 12)),
                        ),
                      ],
                      if (canCheckIn)
                        ElevatedButton(
                          onPressed: () => _postventaVuelo(r, TipoPostventa.checkin),
                          style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                          child: const Text('Check-in', style: TextStyle(color: Colors.white, fontSize: 12)),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            if (r.esCancelada) ...[
              Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF2F2),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: const Color(0xFFFECACA)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.cancel_outlined, size: 16, color: BookingColors.errorRed),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Esta reserva se encuentra cancelada.',
                        style: TextStyle(fontSize: 11, color: BookingColors.errorRed, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ] else if (r.esAsistido) ...[
              Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFFF0FDF4),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: const Color(0xFFBBF7D0)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.check_circle_outline, size: 16, color: Color(0xFF15803D)),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Check-in realizado / Asistencia confirmada. Servicio en curso. La cancelación no aplica una vez iniciado o completado el servicio.',
                        style: TextStyle(fontSize: 11, color: Color(0xFF15803D), fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ] else ...[
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      r.cancelable
                          ? 'Elegible para cancelación gratuita.'
                          : 'Ventana de cancelación expirada (${r.vertical.contains("alojamiento") ? "48h" : "24h"} previas).',
                      style: TextStyle(fontSize: 11, color: r.cancelable ? BookingColors.successGreen : BookingColors.textMuted),
                    ),
                  ),
                  if (r.cancelable)
                    TextButton(
                      onPressed: () => _confirmarCancelacion(r),
                      child: const Text('Cancelar reserva', style: TextStyle(color: BookingColors.errorRed, fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
