import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/reserva.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_client.dart';
import '../../services/booking_services.dart';
import '../../theme/booking_colors.dart';
import 'voucher_qr_screen.dart';

class DetalleReservaVueloScreen extends StatefulWidget {
  final Reserva reserva;

  const DetalleReservaVueloScreen({super.key, required this.reserva});

  @override
  State<DetalleReservaVueloScreen> createState() => _DetalleReservaVueloScreenState();
}

class _DetalleReservaVueloScreenState extends State<DetalleReservaVueloScreen> {
  bool _loading = true;
  bool _busyAction = false;
  Map<String, dynamic>? _detalle;
  List<Map<String, dynamic>> _tickets = [];
  List<Map<String, dynamic>> _pases = [];
  String? _statusMsg;
  String? _errorMsg;

  @override
  void initState() {
    super.initState();
    _cargarTodo();
  }

  Future<void> _cargarTodo() async {
    setState(() {
      _loading = true;
      _errorMsg = null;
    });

    final token = Provider.of<AuthProvider>(context, listen: false).token;
    final results = await Future.wait([
      BookingServices.getVueloBookingDetalle(widget.reserva.id, token: token),
      BookingServices.listarTicketsVuelo(widget.reserva.id, token: token),
      BookingServices.listarPasesAbordar(widget.reserva.id, token: token),
    ]);

    if (mounted) {
      setState(() {
        _detalle = results[0] as Map<String, dynamic>?;
        _tickets = results[1] as List<Map<String, dynamic>>;
        _pases = results[2] as List<Map<String, dynamic>>;
        _loading = false;
      });
    }
  }

  Future<void> _emitirBoletos() async {
    setState(() {
      _busyAction = true;
      _errorMsg = null;
      _statusMsg = null;
    });
    try {
      final token = Provider.of<AuthProvider>(context, listen: false).token;
      final res = await BookingServices.emitirTicketsVuelo(widget.reserva.id, token: token);
      final issued = res['issued'] ?? 1;
      setState(() {
        _statusMsg = 'Billetes emitidos ($issued). Ya puedes realizar el check-in.';
        _busyAction = false;
      });
      await _cargarTodo();
    } catch (e) {
      setState(() {
        _busyAction = false;
        _errorMsg = e is ApiException ? e.userMessage : 'No se pudieron emitir los boletos: $e';
      });
    }
  }

  Future<void> _hacerCheckin() async {
    setState(() {
      _busyAction = true;
      _errorMsg = null;
      _statusMsg = null;
    });
    try {
      final token = Provider.of<AuthProvider>(context, listen: false).token;
      await BookingServices.checkinVuelo(widget.reserva.id, token: token);
      setState(() {
        _statusMsg = 'Check-in registrado. Pases de abordar disponibles abajo.';
        _busyAction = false;
      });
      await _cargarTodo();
    } catch (e) {
      setState(() {
        _busyAction = false;
        _errorMsg = e is ApiException ? e.userMessage : 'No se pudo completar el check-in: $e';
      });
    }
  }

  Map<String, dynamic>? _findPassForTicket(Map<String, dynamic> ticket) {
    final tid = ticket['ticketId']?.toString() ?? ticket['id']?.toString();
    final paxName = ticket['passengerName']?.toString();
    for (final p in _pases) {
      if (tid != null && p['ticketId']?.toString() == tid) return p;
      if (paxName != null && p['passengerName']?.toString() == paxName) return p;
    }
    return _pases.isNotEmpty ? _pases.first : null;
  }

  @override
  Widget build(BuildContext context) {
    final statusStr = (_detalle?['status'] ?? widget.reserva.estado).toString().toUpperCase();
    final pnr = (_detalle?['pnr'] ?? widget.reserva.pnr ?? widget.reserva.id).toString();
    final isCancelled = statusStr.contains('CANCEL');

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text('Reserva $pnr', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 17)),
        actions: [
          IconButton(
            tooltip: 'Voucher QR',
            icon: const Icon(Icons.qr_code_2),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => VoucherQrScreen(reserva: widget.reserva))),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 820),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (_statusMsg != null)
                        Container(
                          width: double.infinity,
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(color: const Color(0xFFF2FBEE), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFB7E0A0))),
                          child: Text(_statusMsg!, style: const TextStyle(color: Color(0xFF1B6B1F), fontWeight: FontWeight.w600)),
                        ),
                      if (_errorMsg != null)
                        Container(
                          width: double.infinity,
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFF5C2C0))),
                          child: Text(_errorMsg!, style: const TextStyle(color: BookingColors.errorRed)),
                        ),

                      Card(
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(widget.reserva.servicioNombre, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                    decoration: BoxDecoration(color: const Color(0xFFEEF5FF), borderRadius: BorderRadius.circular(6)),
                                    child: Text(statusStr, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11, color: BookingColors.actionBlue)),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Text('PNR / Localizador: $pnr', style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600)),
                              Text('Fecha: ${widget.reserva.fecha} · Total: US\$ ${widget.reserva.total.toStringAsFixed(2)}', style: const TextStyle(fontSize: 13, color: BookingColors.textMuted)),
                              if (!isCancelled) ...[
                                const SizedBox(height: 12),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    if (_tickets.isEmpty || _tickets.any((t) => t['status'] != 'ISSUED'))
                                      OutlinedButton.icon(
                                        onPressed: _busyAction ? null : _emitirBoletos,
                                        icon: const Icon(Icons.confirmation_number_outlined, size: 16),
                                        label: const Text('Emitir boletos'),
                                      ),
                                    if (statusStr != 'CHECKED_IN')
                                      ElevatedButton.icon(
                                        onPressed: _busyAction ? null : _hacerCheckin,
                                        style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                                        icon: const Icon(Icons.flight_takeoff, size: 16, color: Colors.white),
                                        label: const Text('Check-in en línea', style: TextStyle(color: Colors.white)),
                                      ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      const Text('Billetes y Pases de Abordar (Boarding Pass)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),

                      if (_tickets.isEmpty)
                        const Card(
                          child: Padding(
                            padding: EdgeInsets.all(16),
                            child: Text('Los billetes aún están pendientes de emisión o no hay segmentos emitidos para mostrar.'),
                          ),
                        )
                      else
                        ..._tickets.map((t) => _buildBoardingPassCard(t, _findPassForTicket(t))),
                    ],
                  ),
                ),
              ),
            ),
    );
  }

  Widget _buildBoardingPassCard(Map<String, dynamic> ticket, Map<String, dynamic>? pass) {
    final tStatus = (ticket['status'] ?? 'PENDING').toString().toUpperCase();
    final isIssued = tStatus == 'ISSUED';
    final pax = ticket['passengerName']?.toString() ?? 'Pasajero';
    final tNum = ticket['ticketNumber']?.toString() ?? '--';
    final segs = ticket['segments'] is List ? ticket['segments'] as List : [];
    final firstSeg = segs.isNotEmpty && segs.first is Map ? Map<String, dynamic>.from(segs.first) : <String, dynamic>{};
    final seat = pass?['seatNumber']?.toString() ?? ticket['seatNumber']?.toString() ?? 'Asignación en puerta';
    final barcode = pass?['barcodeData']?.toString() ?? pass?['boardingPassCode']?.toString();

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: isIssued ? BookingColors.successGreen : Colors.orange.shade300),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: isIssued ? const Color(0xFF003B95) : const Color(0xFF475569),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('PASE DE ABORDAR', style: TextStyle(color: Colors.white70, fontSize: 10, letterSpacing: 1)),
                    Text(pax, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: isIssued ? BookingColors.successGreen : Colors.orange, borderRadius: BorderRadius.circular(4)),
                  child: Text(tStatus, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Vuelo', style: TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                        Text(firstSeg['flightNumber']?.toString() ?? '--', style: const TextStyle(fontWeight: FontWeight.bold, fontFamily: 'monospace')),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Ruta', style: TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                        Text('${firstSeg['origin'] ?? firstSeg['departureIataCode'] ?? '--'} ➔ ${firstSeg['destination'] ?? firstSeg['arrivalIataCode'] ?? '--'}', style: const TextStyle(fontWeight: FontWeight.bold)),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        const Text('Asiento / Butaca', style: TextStyle(fontSize: 11, color: BookingColors.textMuted)),
                        Text(seat, style: const TextStyle(fontWeight: FontWeight.bold, color: BookingColors.actionBlue)),
                      ],
                    ),
                  ],
                ),
                const Divider(height: 18),
                Text('N.º Boleto: $tNum', style: const TextStyle(fontSize: 12, fontFamily: 'monospace')),
                if (barcode != null) ...[
                  const SizedBox(height: 6),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(6)),
                    child: Text('Código de embarque: $barcode', style: const TextStyle(fontSize: 11, fontFamily: 'monospace')),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
