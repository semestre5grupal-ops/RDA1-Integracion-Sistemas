import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/auto.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/auth_guard_dialog.dart';
import '../../widgets/direct_booking_modal.dart';
import '../../widgets/auth_guard_dialog.dart';
import '../../theme/booking_colors.dart';

class AutoDetailScreen extends StatefulWidget {
  final Auto auto;
  const AutoDetailScreen({super.key, required this.auto});

  @override
  State<AutoDetailScreen> createState() => _AutoDetailScreenState();
}

class _AutoDetailScreenState extends State<AutoDetailScreen> {
  DateTime _fechaRecogida = DateTime.now().add(const Duration(days: 1));
  DateTime _fechaDevolucion = DateTime.now().add(const Duration(days: 4));
  String _cobertura = 'BASICA'; // BASICA o TOTAL

  int get _diasRenta {
    final diff = _fechaDevolucion.difference(_fechaRecogida).inDays;
    return diff > 0 ? diff : 1;
  }

  double get _precioTotal {
    double base = widget.auto.precioPorDia * _diasRenta;
    if (_cobertura == 'TOTAL') base += 15.0 * _diasRenta;
    return base;
  }

  @override
  Widget build(BuildContext context) {
    final auto = widget.auto;

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        title: Text('${auto.marca} ${auto.modelo}', style: const TextStyle(color: Colors.white, fontSize: 18)),
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Imagen del vehículo
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Image.network(
                auto.imagenUrl ?? 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  color: Colors.blueGrey.shade100,
                  child: const Center(child: Icon(Icons.directions_car, size: 50, color: BookingColors.textMuted)),
                ),
              ),
            ),

            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Alerta de Cooldown si aplica
                  if (auto.enCooldown)
                    Container(
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.amber.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.amber.shade300),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.schedule, color: Colors.orange),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Vehículo en ciclo de limpieza y descanso obligatorio (2 horas). Disponible para tus fechas seleccionadas.',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.brown),
                            ),
                          ),
                        ],
                      ),
                    ),

                  Text('${auto.marca} ${auto.modelo}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
                  Text('${auto.categoria} · ${auto.transmision} · Proveedor: ${auto.proveedor}', style: const TextStyle(color: BookingColors.textMuted, fontSize: 14)),
                  const SizedBox(height: 8),
                  Text('US\$ ${auto.precioPorDia.toStringAsFixed(2)} / día', style: const TextStyle(fontSize: 20, color: BookingColors.primaryBlue, fontWeight: FontWeight.bold)),

                  const Divider(height: 32, color: BookingColors.borderLight),

                  const Text('Fechas de Alquiler:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () async {
                            final picked = await showDatePicker(
                              context: context,
                              initialDate: _fechaRecogida,
                              firstDate: DateTime.now(),
                              lastDate: DateTime.now().add(const Duration(days: 90)),
                            );
                            if (picked != null) {
                              setState(() {
                                _fechaRecogida = picked;
                                if (_fechaDevolucion.isBefore(_fechaRecogida)) {
                                  _fechaDevolucion = _fechaRecogida.add(const Duration(days: 1));
                                }
                              });
                            }
                          },
                          child: Text('Recogida: ${DateFormat('dd/MM').format(_fechaRecogida)}'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () async {
                            final picked = await showDatePicker(
                              context: context,
                              initialDate: _fechaDevolucion,
                              firstDate: _fechaRecogida.add(const Duration(days: 1)),
                              lastDate: DateTime.now().add(const Duration(days: 90)),
                            );
                            if (picked != null) {
                              setState(() => _fechaDevolucion = picked);
                            }
                          },
                          child: Text('Devolución: ${DateFormat('dd/MM').format(_fechaDevolucion)}'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text('Duración: $_diasRenta días de alquiler', style: const TextStyle(fontWeight: FontWeight.bold)),

                  const Divider(height: 32, color: BookingColors.borderLight),

                  const Text('Opciones de Cobertura:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  RadioListTile<String>(
                    title: const Text('Cobertura Básica (Con franquicia)'),
                    subtitle: const Text('Incluida sin cargo adicional'),
                    value: 'BASICA',
                    groupValue: _cobertura,
                    activeColor: BookingColors.actionBlue,
                    onChanged: (v) => setState(() => _cobertura = v!),
                  ),
                  RadioListTile<String>(
                    title: const Text('Cobertura Total (Sin franquicia)'),
                    subtitle: const Text('+US\$ 15.00 / día · Cobertura completa contra todo riesgo'),
                    value: 'TOTAL',
                    groupValue: _cobertura,
                    activeColor: BookingColors.actionBlue,
                    onChanged: (v) => setState(() => _cobertura = v!),
                  ),

                  const SizedBox(height: 24),

                  // Botón Agregar al Carrito con Auth Guard
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: BookingColors.actionBlue,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: () async {
                        final auth = context.read<AuthProvider>();
                        if (!auth.isAuthenticated) {
                          final proceed = await AuthGuardDialog.ensureAuthenticated(context, isAuthenticated: false);
                          if (!proceed) return;
                        }

                        if (!context.mounted) return;

                        await DirectBookingModal.show(
                          context,
                          vertical: 'autos',
                          titulo: 'Renta: ${auto.marca} ${auto.modelo}',
                          subtitulo: '$_diasRenta días (${DateFormat('dd/MM').format(_fechaRecogida)} a ${DateFormat('dd/MM').format(_fechaDevolucion)}) · Cobertura $_cobertura',
                          proveedor: auto.proveedor,
                          fecha: DateFormat('yyyy-MM-dd').format(_fechaRecogida),
                          subtotal: _precioTotal,
                          voucherQr: 'QR-AUT-${auto.marca.toUpperCase()}-${DateTime.now().millisecondsSinceEpoch}',
                          metadata: {
                            'auto_id': auto.id,
                            'dias': _diasRenta,
                            'cobertura': _cobertura,
                          },
                        );
                      },
                      icon: const Icon(Icons.flash_on),
                      label: Text(
                        'ALQUILAR VEHÍCULO · US\$ ${_precioTotal.toStringAsFixed(2)}',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
