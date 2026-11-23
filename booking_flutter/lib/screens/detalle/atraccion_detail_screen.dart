import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/atraccion.dart';
import '../../models/cart_item.dart';
import '../../services/booking_services.dart';
import '../../providers/cart_provider.dart';

class AtraccionDetailScreen extends StatefulWidget {
  final Atraccion atraccion;
  const AtraccionDetailScreen({super.key, required this.atraccion});

  @override
  State<AtraccionDetailScreen> createState() => _AtraccionDetailScreenState();
}

class _AtraccionDetailScreenState extends State<AtraccionDetailScreen> {
  DateTime _fechaSeleccionada = DateTime.now().add(const Duration(days: 2));
  TimeSlot? _slotSeleccionado;
  List<TimeSlot> _slotsDisponibles = [];
  bool _cargandoSlots = false;
  int _cantidad = 1;

  @override
  void initState() {
    super.initState();
    _cargarDisponibilidad();
  }

  Future<void> _cargarDisponibilidad() async {
    setState(() {
      _cargandoSlots = true;
      _slotSeleccionado = null;
    });

    final fechaStr = DateFormat('yyyy-MM-dd').format(_fechaSeleccionada);
    final slots = await BookingServices.getDisponibilidadAtraccion(widget.atraccion.id, fechaStr);

    setState(() {
      _slotsDisponibles = slots;
      if (slots.isNotEmpty) {
        _slotSeleccionado = slots.firstWhere((s) => s.cuposDisponibles > 0, orElse: () => slots.first);
      }
      _cargandoSlots = false;
    });
  }

  Future<void> _seleccionarFecha() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _fechaSeleccionada,
      firstDate: DateTime.now().add(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (picked != null && picked != _fechaSeleccionada) {
      setState(() => _fechaSeleccionada = picked);
      _cargarDisponibilidad();
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.atraccion;
    final fechaFmt = DateFormat('dd/MM/yyyy').format(_fechaSeleccionada);

    return Scaffold(
      appBar: AppBar(
        title: Text(a.nombre, style: const TextStyle(color: Colors.white, fontSize: 18)),
        backgroundColor: const Color(0xFF003580),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (a.imagenUrl != null && a.imagenUrl!.isNotEmpty)
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(
                  a.imagenUrl!,
                  height: 200,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    height: 140,
                    color: Colors.grey.shade300,
                    child: const Icon(Icons.photo, size: 50),
                  ),
                ),
              ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(a.ciudad, style: TextStyle(color: Colors.grey.shade700, fontSize: 14, fontWeight: FontWeight.w500)),
                Text(
                  '\$${a.precio.toStringAsFixed(2)} / persona',
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF003580)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(a.descripcion, style: const TextStyle(fontSize: 14, height: 1.4)),
            const Divider(height: 32),

            // Selector de fecha
            const Text('1. Selecciona la fecha de visita:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _seleccionarFecha,
              icon: const Icon(Icons.calendar_today, color: Color(0xFF003580)),
              label: Text('Fecha seleccionada: $fechaFmt', style: const TextStyle(color: Color(0xFF003580))),
            ),
            const SizedBox(height: 20),

            // Selector dinámico de turnos con cupos libres en tiempo real
            const Text('2. Turnos y Cupos Disponibles en Vivo:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            if (_cargandoSlots)
              const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
            else if (_slotsDisponibles.isEmpty)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.orange.shade50, borderRadius: BorderRadius.circular(8)),
                child: const Text('No se encontraron turnos para esta fecha. Intenta con otra fecha.', style: TextStyle(color: Colors.deepOrange)),
              )
            else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _slotsDisponibles.map((slot) {
                  final isSelected = _slotSeleccionado?.slotId == slot.slotId;
                  final agotado = slot.cuposDisponibles <= 0;

                  return ChoiceChip(
                    selected: isSelected,
                    onSelected: agotado ? null : (_) => setState(() => _slotSeleccionado = slot),
                    label: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(slot.horaInicio, style: TextStyle(fontWeight: FontWeight.bold, color: isSelected ? Colors.white : Colors.black87)),
                        Text(
                          agotado ? 'Agotado' : '${slot.cuposDisponibles} libres',
                          style: TextStyle(fontSize: 10, color: isSelected ? Colors.white70 : (agotado ? Colors.red : Colors.green)),
                        ),
                      ],
                    ),
                    selectedColor: const Color(0xFF003580),
                    backgroundColor: Colors.grey.shade100,
                  );
                }).toList(),
              ),

            const SizedBox(height: 20),

            // Selector de cantidad de boletos
            Row(
              children: [
                const Text('Cantidad de Boletos:', style: TextStyle(fontWeight: FontWeight.bold)),
                const Spacer(),
                IconButton(
                  onPressed: _cantidad > 1 ? () => setState(() => _cantidad--) : null,
                  icon: const Icon(Icons.remove_circle_outline),
                ),
                Text('$_cantidad', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                IconButton(
                  onPressed: () => setState(() => _cantidad++),
                  icon: const Icon(Icons.add_circle_outline),
                ),
              ],
            ),

            const SizedBox(height: 24),

            // Botón Agregar al Carrito
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF003580),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                onPressed: (_slotSeleccionado == null || _slotSeleccionado!.cuposDisponibles <= 0)
                    ? null
                    : () {
                        final item = CartItem(
                          id: 'item-${DateTime.now().millisecondsSinceEpoch}',
                          vertical: 'atracciones',
                          titulo: a.nombre,
                          subtitulo: '${DateFormat('dd/MM/yyyy').format(_fechaSeleccionada)} · ${_slotSeleccionado!.horaInicio}',
                          precioUnitario: a.precio,
                          cantidad: _cantidad,
                          fecha: DateFormat('yyyy-MM-dd').format(_fechaSeleccionada),
                          slotId: _slotSeleccionado!.slotId,
                          metadata: {
                            'proveedor': a.proveedor,
                            'atraccion_id': a.id,
                          },
                        );

                        context.read<CartProvider>().addItem(item);

                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('${a.nombre} agregado al carrito.'),
                            backgroundColor: Colors.green,
                          ),
                        );
                        Navigator.pop(context);
                      },
                icon: const Icon(Icons.add_shopping_cart),
                label: const Text('AGREGAR AL CARRITO', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

