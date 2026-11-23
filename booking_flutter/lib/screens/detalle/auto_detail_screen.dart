import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/auto.dart';
import '../../models/cart_item.dart';
import '../../providers/cart_provider.dart';

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
      appBar: AppBar(
        title: Text('${auto.marca} ${auto.modelo}', style: const TextStyle(color: Colors.white)),
        backgroundColor: const Color(0xFF003580),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Alerta de Cooldown si aplica
            if (auto.enCooldown)
              Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.amber.shade100, borderRadius: BorderRadius.circular(8)),
                child: const Row(
                  children: [
                    Icon(Icons.schedule, color: Colors.orange),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Vehículo en ciclo de limpieza/cooldown obligatorio de 2 horas. Disponible para reservas futuras.',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),

            Text('${auto.marca} ${auto.modelo}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            Text('${auto.categoria} · ${auto.transmision} · Proveedor: ${auto.proveedor}', style: TextStyle(color: Colors.grey.shade700)),
            const SizedBox(height: 12),
            Text('\$${auto.precioPorDia.toStringAsFixed(2)} / día', style: const TextStyle(fontSize: 20, color: Color(0xFF003580), fontWeight: FontWeight.bold)),

            const Divider(height: 32),

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
            Text('Total: $_diasRenta días de alquiler', style: const TextStyle(fontWeight: FontWeight.bold)),

            const Divider(height: 32),

            const Text('Opciones de Cobertura:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            RadioListTile<String>(
              title: const Text('Cobertura Básica (Con franquicia)'),
              subtitle: const Text('Incluida en el precio'),
              value: 'BASICA',
              groupValue: _cobertura,
              onChanged: (v) => setState(() => _cobertura = v!),
            ),
            RadioListTile<String>(
              title: const Text('Cobertura Total (Sin franquicia)'),
              subtitle: const Text('+\$15.00 / día · Protección contra todo riesgo'),
              value: 'TOTAL',
              groupValue: _cobertura,
              onChanged: (v) => setState(() => _cobertura = v!),
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
                    id: 'auto-${DateTime.now().millisecondsSinceEpoch}',
                    vertical: 'autos',
                    titulo: 'Renta: ${auto.marca} ${auto.modelo}',
                    subtitulo: '$_diasRenta días (${DateFormat('dd/MM').format(_fechaRecogida)} a ${DateFormat('dd/MM').format(_fechaDevolucion)}) · Cobertura $_cobertura',
                    precioUnitario: _precioTotal,
                    cantidad: 1,
                    fecha: DateFormat('yyyy-MM-dd').format(_fechaRecogida),
                    metadata: {
                      'auto_id': auto.id,
                      'dias': _diasRenta,
                      'cobertura': _cobertura,
                      'proveedor': auto.proveedor,
                    },
                  );

                  context.read<CartProvider>().addItem(item);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Auto agregado al carrito.'), backgroundColor: Colors.green),
                  );
                  Navigator.pop(context);
                },
                icon: const Icon(Icons.add_shopping_cart),
                label: Text('AGREGAR POR \$${_precioTotal.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

