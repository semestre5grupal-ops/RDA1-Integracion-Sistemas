import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/alojamiento.dart';
import '../../models/cart_item.dart';
import '../../providers/cart_provider.dart';

class AlojamientoDetailScreen extends StatefulWidget {
  final Alojamiento alojamiento;
  const AlojamientoDetailScreen({super.key, required this.alojamiento});

  @override
  State<AlojamientoDetailScreen> createState() => _AlojamientoDetailScreenState();
}

class _AlojamientoDetailScreenState extends State<AlojamientoDetailScreen> {
  DateTime _checkIn = DateTime.now().add(const Duration(days: 2));
  DateTime _checkOut = DateTime.now().add(const Duration(days: 5));
  TipoHabitacion? _habitacionSeleccionada;

  int get _noches {
    final diff = _checkOut.difference(_checkIn).inDays;
    return diff > 0 ? diff : 1;
  }

  @override
  void initState() {
    super.initState();
    if (widget.alojamiento.habitaciones.isNotEmpty) {
      _habitacionSeleccionada = widget.alojamiento.habitaciones.first;
    }
  }

  @override
  Widget build(BuildContext context) {
    final h = widget.alojamiento;
    final precioNoche = _habitacionSeleccionada?.precioPorNoche ?? h.precioPorNoche;
    final totalEstadia = precioNoche * _noches;

    return Scaffold(
      appBar: AppBar(
        title: Text(h.nombre, style: const TextStyle(color: Colors.white)),
        backgroundColor: const Color(0xFF003580),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(h.nombre, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            Text('${h.ciudad} · ★ ${h.rating}', style: TextStyle(color: Colors.grey.shade700)),
            const SizedBox(height: 8),
            Text(h.descripcion),
            const Divider(height: 32),

            const Text('Fechas de Estadía:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            Text('$_noches noches: ${DateFormat('dd/MM').format(_checkIn)} al ${DateFormat('dd/MM/yyyy').format(_checkOut)}'),
            const SizedBox(height: 16),

            const Text('Selecciona Tipo de Habitación:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            if (h.habitaciones.isEmpty)
              const Text('Habitación estándar con desayuno incluido')
            else
              Column(
                children: h.habitaciones.map((room) {
                  return RadioListTile<TipoHabitacion>(
                    title: Text(room.nombre),
                    subtitle: Text('Capacidad: ${room.capacidadHuespedes} personas'),
                    secondary: Text('\$${room.precioPorNoche.toStringAsFixed(2)}/noche', style: const TextStyle(fontWeight: FontWeight.bold)),
                    value: room,
                    groupValue: _habitacionSeleccionada,
                    onChanged: (v) => setState(() => _habitacionSeleccionada = v),
                  );
                }).toList(),
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
                    id: 'hotel-${DateTime.now().millisecondsSinceEpoch}',
                    vertical: 'alojamientos',
                    titulo: h.nombre,
                    subtitulo: '$_noches noches · ${_habitacionSeleccionada?.nombre ?? "Habitación"}',
                    precioUnitario: totalEstadia,
                    cantidad: 1,
                    fecha: DateFormat('yyyy-MM-dd').format(_checkIn),
                    metadata: {
                      'hotel_id': h.id,
                      'noches': _noches,
                    },
                  );

                  context.read<CartProvider>().addItem(item);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Alojamiento agregado al carrito.'), backgroundColor: Colors.green),
                  );
                  Navigator.pop(context);
                },
                icon: const Icon(Icons.add_shopping_cart),
                label: Text('RESERVAR POR \$${totalEstadia.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

