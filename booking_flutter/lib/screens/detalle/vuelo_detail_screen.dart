import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/vuelo.dart';
import '../../models/cart_item.dart';
import '../../providers/cart_provider.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/auth_guard_dialog.dart';
import '../../theme/booking_colors.dart';

class VueloDetailScreen extends StatefulWidget {
  final Vuelo vuelo;
  const VueloDetailScreen({super.key, required this.vuelo});

  @override
  State<VueloDetailScreen> createState() => _VueloDetailScreenState();
}

class _VueloDetailScreenState extends State<VueloDetailScreen> {
  String _asiento = '12A (Ventana)';
  int _pasajeros = 1;

  @override
  Widget build(BuildContext context) {
    final v = widget.vuelo;
    final total = v.precio * _pasajeros;

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        title: Text('Vuelo ${v.numeroVuelo}', style: const TextStyle(color: Colors.white, fontSize: 18)),
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              elevation: 2,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(v.origen, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
                            Text('Salida: ${v.horaSalida}', style: const TextStyle(color: BookingColors.textMuted, fontSize: 13)),
                          ],
                        ),
                        const Icon(Icons.flight_takeoff, color: BookingColors.primaryBlue, size: 32),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(v.destino, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
                            Text('Llegada: ${v.horaLlegada}', style: const TextStyle(color: BookingColors.textMuted, fontSize: 13)),
                          ],
                        ),
                      ],
                    ),
                    const Divider(height: 24, color: BookingColors.borderLight),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('${v.aerolinea} · Vuelo ${v.numeroVuelo}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: BookingColors.successGreen.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            v.estado,
                            style: const TextStyle(color: BookingColors.successGreen, fontWeight: FontWeight.bold, fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            const Text('Selección de Asiento:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: BookingColors.borderLight),
              ),
              child: DropdownButton<String>(
                value: _asiento,
                isExpanded: true,
                underline: const SizedBox(),
                items: ['12A (Ventana)', '12B (Medio)', '12C (Pasillo)', '14A (Ventana)']
                    .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                    .toList(),
                onChanged: (val) {
                  if (val != null) setState(() => _asiento = val);
                },
              ),
            ),

            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Pasajeros:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.remove_circle_outline, color: BookingColors.primaryBlue),
                      onPressed: _pasajeros > 1 ? () => setState(() => _pasajeros--) : null,
                    ),
                    Text('$_pasajeros', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                    IconButton(
                      icon: const Icon(Icons.add_circle_outline, color: BookingColors.primaryBlue),
                      onPressed: () => setState(() => _pasajeros++),
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 24),

            // Botón Agregar con Auth Guard
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

                  final item = CartItem(
                    id: 'vuelo-${DateTime.now().millisecondsSinceEpoch}',
                    vertical: 'vuelos',
                    titulo: 'Vuelo ${v.origen} ➔ ${v.destino}',
                    subtitulo: '${v.aerolinea} (${v.numeroVuelo}) · Asiento: $_asiento',
                    precioUnitario: v.precio,
                    cantidad: _pasajeros,
                    fecha: v.fechaSalida,
                    metadata: {
                      'numero_vuelo': v.numeroVuelo,
                      'asiento': _asiento,
                      'origen': v.origen,
                      'destino': v.destino,
                    },
                  );

                  if (context.mounted) {
                    context.read<CartProvider>().addItem(item);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Vuelo agregado al carrito exitosamente.'),
                        backgroundColor: BookingColors.successGreen,
                      ),
                    );
                    Navigator.pop(context);
                  }
                },
                icon: const Icon(Icons.add_shopping_cart),
                label: Text(
                  'RESERVAR POR US\$ ${total.toStringAsFixed(2)}',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
