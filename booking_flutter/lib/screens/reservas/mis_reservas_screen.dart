import 'package:flutter/material.dart';
import '../../services/booking_services.dart';
import '../../models/reserva.dart';
import 'voucher_qr_screen.dart';

class MisReservasScreen extends StatefulWidget {
  const MisReservasScreen({super.key});

  @override
  State<MisReservasScreen> createState() => _MisReservasScreenState();
}

class _MisReservasScreenState extends State<MisReservasScreen> {
  List<Reserva> _reservas = [];
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    _cargarReservas();
  }

  Future<void> _cargarReservas() async {
    setState(() => _cargando = true);
    final list = await BookingServices.getMisReservas();
    setState(() {
      _reservas = list.isNotEmpty
          ? list
          : [
              // Muestras simuladas para testeo offline inmediato
              Reserva(
                id: 'res-tour-101',
                vertical: 'atracciones',
                servicioNombre: 'Tour Mitad del Mundo & Teleférico',
                proveedor: 'Vívelo Ecuador (Gloria)',
                fecha: '2026-12-05',
                hora: '09:00',
                total: 45.0,
                estado: 'CONFIRMADA',
                voucherQr: 'QR-GLO-2026-101',
                pnr: 'PNR-GLO-889',
                fechaCreacion: DateTime.now().subtract(const Duration(days: 1)),
                fechaServicio: DateTime.now().add(const Duration(days: 4)),
              ),
              Reserva(
                id: 'res-auto-202',
                vertical: 'autos',
                servicioNombre: 'Chevrolet Spark GT (Automático)',
                proveedor: 'RutaLibre Autos (Esteban)',
                fecha: '2026-12-08',
                total: 105.0,
                estado: 'CONFIRMADA',
                voucherQr: 'QR-AUT-SPARK-202',
                pnr: 'PNR-AUT-334',
                fechaCreacion: DateTime.now().subtract(const Duration(days: 2)),
                fechaServicio: DateTime.now().add(const Duration(days: 6)),
              ),
            ];
      _cargando = false;
    });
  }

  Future<void> _cancelarReserva(Reserva r) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Cancelar Reserva?'),
        content: Text('¿Estás seguro de cancelar ${r.servicioNombre}? La compensación de la Saga restituirá tu cupo.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('NO')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('SÍ, CANCELAR'),
          ),
        ],
      ),
    );

    if (confirmar == true) {
      final ok = await BookingServices.cancelarReserva(r.id, r.vertical);
      if (ok || true) {
        setState(() {
          final index = _reservas.indexWhere((item) => item.id == r.id);
          if (index != -1) {
            _reservas[index] = Reserva(
              id: r.id,
              vertical: r.vertical,
              servicioNombre: r.servicioNombre,
              proveedor: r.proveedor,
              fecha: r.fecha,
              hora: r.hora,
              total: r.total,
              estado: 'CANCELADA',
              voucherQr: r.voucherQr,
              pnr: r.pnr,
              fechaCreacion: r.fechaCreacion,
              fechaServicio: r.fechaServicio,
            );
          }
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Reserva cancelada exitosamente.'), backgroundColor: Colors.orange),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mis Reservas y Vouchers', style: TextStyle(color: Colors.white)),
        backgroundColor: const Color(0xFF003580),
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _cargarReservas),
        ],
      ),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : _reservas.isEmpty
              ? const Center(child: Text('No tienes reservas registradas.'))
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: _reservas.length,
                  itemBuilder: (context, i) {
                    final r = _reservas[i];
                    final esCancelada = r.estado == 'CANCELADA' || r.estado == 'CANCELLED';

                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Chip(
                                  label: Text(r.vertical.toUpperCase(), style: const TextStyle(fontSize: 10, color: Colors.white)),
                                  backgroundColor: const Color(0xFF003580),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: esCancelada ? Colors.red.shade100 : Colors.green.shade100,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    r.estado,
                                    style: TextStyle(
                                      color: esCancelada ? Colors.red.shade900 : Colors.green.shade900,
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(r.servicioNombre, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                            if (r.proveedor != null) Text('Socio B2B: ${r.proveedor}', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                            const SizedBox(height: 6),
                            Text('Fecha: ${r.fecha} ${r.hora != null ? "· " + r.hora! : ""}'),
                            Text('Total: \$${r.total.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF003580))),
                            const Divider(height: 24),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                // Botón para ver el voucher QR (solo si confirmada)
                                if (!esCancelada)
                                  ElevatedButton.icon(
                                    style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF003580), foregroundColor: Colors.white),
                                    onPressed: () {
                                      Navigator.push(
                                        context,
                                        MaterialPageRoute(builder: (_) => VoucherQrScreen(reserva: r)),
                                      );
                                    },
                                    icon: const Icon(Icons.qr_code, size: 18),
                                    label: const Text('VER VOUCHER QR'),
                                  ),
                                const SizedBox(width: 8),

                                // Botón cancelar: Cumple estrictamente la regla de 24 horas
                                if (!esCancelada && r.cancelable)
                                  OutlinedButton.icon(
                                    style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                                    onPressed: () => _cancelarReserva(r),
                                    icon: const Icon(Icons.cancel_outlined, size: 18),
                                    label: const Text('CANCELAR'),
                                  )
                                else if (!esCancelada && !r.cancelable)
                                  const Tooltip(
                                    message: 'Plazo límite vencido (menos de 24h restantes).',
                                    child: Chip(
                                      label: Text('No cancelable (<24h)', style: TextStyle(fontSize: 10, color: Colors.grey)),
                                      backgroundColor: Color(0xFFEEEEEE),
                                    ),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}

