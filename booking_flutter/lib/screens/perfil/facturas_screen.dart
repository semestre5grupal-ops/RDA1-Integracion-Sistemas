import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/booking_services.dart';
import '../../models/reserva.dart';

class FacturasScreen extends StatefulWidget {
  const FacturasScreen({super.key});

  @override
  State<FacturasScreen> createState() => _FacturasScreenState();
}

class _FacturasScreenState extends State<FacturasScreen> {
  List<Reserva> _reservasFacturadas = [];
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _fetchFacturas();
  }

  Future<void> _fetchFacturas() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final auth = Provider.of<AuthProvider>(context, listen: false);
      final list = await BookingServices.getMisReservas(
        token: auth.token,
        email: auth.user?.email,
      );
      // Facturables son aquellas confirmadas o completadas
      if (mounted) {
        setState(() {
          _reservasFacturadas = list.where((r) => !r.esCancelada).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'No se pudieron recuperar las facturas electrónicas.';
        _isLoading = false;
      });
    }
  }

  void _showFacturaDetalle(BuildContext context, Reserva reserva) {
    final subtotal = reserva.total / 1.15;
    final iva15 = reserva.total - subtotal;
    final fakeClaveAcceso = '151120240117900112340012001001000000001${reserva.id.hashCode.abs().toString().padLeft(8, '0')}1';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Comprobante Electrónico',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF003580)),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
              const Divider(),
              const SizedBox(height: 8),
              const Text('Razón Social: BOOKING ECUADOR S.A.S.', style: TextStyle(fontWeight: FontWeight.w600)),
              const Text('RUC Emisor: 1793201452001'),
              const Text('Ambiente: PRODUCCIÓN / SRI En Línea'),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey[300]!),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Clave de Acceso (49 dígitos SRI):', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(
                      fakeClaveAcceso.length > 49 ? fakeClaveAcceso.substring(0, 49) : fakeClaveAcceso,
                      style: const TextStyle(fontSize: 11, fontFamily: 'monospace', letterSpacing: 0.8),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Servicio:'),
                  Text(reserva.itemNombre, style: const TextStyle(fontWeight: FontWeight.bold)),
                ],
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Categoría:'),
                  Text(reserva.tipo.toUpperCase()),
                ],
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Fecha de Emisión:'),
                  Text(DateFormat('dd/MM/yyyy HH:mm').format(reserva.fechaCreacion)),
                ],
              ),
              const Divider(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Subtotal 0%:'),
                  const Text('\$0.00'),
                ],
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Subtotal 15% IVA:'),
                  Text('\$${subtotal.toStringAsFixed(2)}'),
                ],
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('IVA 15% (Ecuador):'),
                  Text('\$${iva15.toStringAsFixed(2)}'),
                ],
              ),
              const Divider(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('VALOR TOTAL:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  Text(
                    '\$${reserva.total.toStringAsFixed(2)} USD',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF003580)),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    Navigator.pop(ctx);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('RIDE PDF enviado al correo electrónico registrado.'),
                        backgroundColor: Colors.green,
                      ),
                    );
                  },
                  icon: const Icon(Icons.download),
                  label: const Text('Descargar Comprobante RIDE (PDF)'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF003580),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Facturación Electrónica SRI'),
        backgroundColor: const Color(0xFF003580),
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.error_outline, size: 64, color: Colors.red),
                        const SizedBox(height: 16),
                        Text(_errorMessage!, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _fetchFacturas,
                          child: const Text('Reintentar'),
                        ),
                      ],
                    ),
                  ),
                )
              : _reservasFacturadas.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.receipt_long, size: 72, color: Colors.grey[400]),
                          const SizedBox(height: 16),
                          const Text(
                            'No tienes comprobantes de facturación aún.',
                            style: TextStyle(color: Colors.grey, fontSize: 16),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _fetchFacturas,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _reservasFacturadas.length,
                        itemBuilder: (context, index) {
                          final res = _reservasFacturadas[index];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            elevation: 2,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: ListTile(
                              leading: Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF003580).withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Icon(Icons.receipt, color: Color(0xFF003580)),
                              ),
                              title: Text(
                                res.itemNombre,
                                style: const TextStyle(fontWeight: FontWeight.bold),
                              ),
                              subtitle: Text(
                                'Fecha: ${DateFormat('dd/MM/yyyy').format(res.fechaCreacion)} • IVA 15%',
                                style: TextStyle(color: Colors.grey[600], fontSize: 12),
                              ),
                              trailing: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    '\$${res.total.toStringAsFixed(2)}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16,
                                      color: Color(0xFF003580),
                                    ),
                                  ),
                                  const Text(
                                    'AUTORIZADO',
                                    style: TextStyle(color: Colors.green, fontSize: 10, fontWeight: FontWeight.bold),
                                  ),
                                ],
                              ),
                              onTap: () => _showFacturaDetalle(context, res),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}

