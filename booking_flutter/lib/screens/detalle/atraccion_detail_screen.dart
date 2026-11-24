import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/atraccion.dart';
import '../../models/cart_item.dart';
import '../../services/booking_services.dart';
import '../../providers/cart_provider.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/auth_guard_dialog.dart';
import '../../widgets/booking_rating_badge.dart';
import '../../theme/booking_colors.dart';

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

    if (mounted) {
      setState(() {
        _slotsDisponibles = slots;
        if (slots.isNotEmpty) {
          _slotSeleccionado = slots.firstWhere((s) => s.cuposDisponibles > 0, orElse: () => slots.first);
        }
        _cargandoSlots = false;
      });
    }
  }

  Future<void> _seleccionarFecha() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _fechaSeleccionada,
      firstDate: DateTime.now().add(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 90)),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: BookingColors.primaryBlue,
              onPrimary: Colors.white,
              onSurface: BookingColors.textDark,
            ),
          ),
          child: child!,
        );
      },
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
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        title: Text(a.nombre, style: const TextStyle(color: Colors.white, fontSize: 18)),
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Image.network(
                a.imagenUrl ?? 'https://images.unsplash.com/photo-1589394815804-964ed0be2eb5?w=800',
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  color: Colors.blueGrey.shade100,
                  child: const Center(child: Icon(Icons.photo, size: 50, color: BookingColors.textMuted)),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: BookingColors.primaryBlue.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          a.proveedor,
                          style: const TextStyle(fontWeight: FontWeight.bold, color: BookingColors.primaryBlue, fontSize: 12),
                        ),
                      ),
                      BookingRatingBadge(rating: a.rating, reviewsCount: 88),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    a.nombre,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: BookingColors.textDark),
                  ),
                  Row(
                    children: [
                      const Icon(Icons.location_on, color: BookingColors.primaryBlue, size: 16),
                      const SizedBox(width: 4),
                      Text('${a.ciudad}, Ecuador', style: const TextStyle(color: BookingColors.textMuted, fontSize: 14)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(a.descripcion, style: const TextStyle(fontSize: 14, height: 1.4, color: BookingColors.textDark)),
                  const Divider(height: 32, color: BookingColors.borderLight),

                  // Selector de fecha
                  const Text('1. Selecciona la fecha de visita:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _seleccionarFecha,
                    icon: const Icon(Icons.calendar_today, color: BookingColors.primaryBlue),
                    label: Text('Fecha seleccionada: $fechaFmt', style: const TextStyle(color: BookingColors.primaryBlue, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(height: 20),

                  // Selector dinámico de turnos con cupos libres en tiempo real
                  const Text('2. Turnos y Cupos Disponibles en Vivo:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 8),
                  if (_cargandoSlots)
                    const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator(color: BookingColors.primaryBlue)))
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
                                style: TextStyle(fontSize: 10, color: isSelected ? Colors.white70 : (agotado ? Colors.red : BookingColors.successGreen)),
                              ),
                            ],
                          ),
                          selectedColor: BookingColors.primaryBlue,
                          backgroundColor: Colors.white,
                        );
                      }).toList(),
                    ),

                  const SizedBox(height: 20),

                  // Selector de boletos
                  Row(
                    children: [
                      const Text('Cantidad de Boletos:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                      const Spacer(),
                      IconButton(
                        onPressed: _cantidad > 1 ? () => setState(() => _cantidad--) : null,
                        icon: const Icon(Icons.remove_circle_outline, color: BookingColors.primaryBlue),
                      ),
                      Text('$_cantidad', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      IconButton(
                        onPressed: () => setState(() => _cantidad++),
                        icon: const Icon(Icons.add_circle_outline, color: BookingColors.primaryBlue),
                      ),
                    ],
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
                      onPressed: (_slotSeleccionado == null || _slotSeleccionado!.cuposDisponibles <= 0)
                          ? null
                          : () async {
                              final auth = context.read<AuthProvider>();
                              if (!auth.isAuthenticated) {
                                final proceed = await AuthGuardDialog.ensureAuthenticated(context, isAuthenticated: false);
                                if (!proceed) return;
                              }

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

                              if (context.mounted) {
                                context.read<CartProvider>().addItem(item);
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text('${a.nombre} agregado al carrito exitosamente.'),
                                    backgroundColor: BookingColors.successGreen,
                                  ),
                                );
                                Navigator.pop(context);
                              }
                            },
                      icon: const Icon(Icons.add_shopping_cart),
                      label: Text(
                        'RESERVAR POR US\$ ${(a.precio * _cantidad).toStringAsFixed(2)}',
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
