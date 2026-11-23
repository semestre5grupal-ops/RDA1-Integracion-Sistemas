import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/vuelo.dart';
import '../../models/cart_item.dart';
import '../../providers/cart_provider.dart';

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
      appBar: AppBar(
        title: Text('Vuelo ${v.numeroVuelo}', style: const TextStyle(color: Colors.white)),
        backgroundColor: const Color(0xFF003580),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(v.origen, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                        const Icon(Icons.flight_takeoff, color: Color(0xFF003580), size: 28),
                        Text(v.destino, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Salida: ${v.horaSalida}'),
                        Text('Llegada: ${v.horaLlegada}'),
                      ],
                    ),
                    const Divider(height: 24),
                    Text('${v.aerolinea} · Vuelo ${v.numeroVuelo}'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            const Text('Selección de Asiento:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            DropdownButton<String>(
              value: _asiento,
              isExpanded: true,
              items: ['12A (Ventana)', '12B (Medio)', '12C (Pasillo)', '14A (Ventana)']
                  .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                  .toList(),
              onChanged: (v) => setState(() => _asiento = v!),
            ),

            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Pasajeros:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.remove_circle_outline),
                      onPressed: _pasajeros > 1 ? () => setState(() => _pasajeros--) : null,
                    ),
                    Text('$_pasajeros', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    IconButton(
                      icon: const Icon(Icons.add_circle_outline),
                      onPressed: () => setState(() => _pasajeros++),
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF003580),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                onPressed: () {
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
                    },
                  );

                  context.read<CartProvider>().addItem(item);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Vuelo agregado al carrito.'), backgroundColor: Colors.green),
                  );
                  Navigator.pop(context);
                },
                icon: const Icon(Icons.add_shopping_cart),
                label: Text('AGREGAR POR \$${total.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

