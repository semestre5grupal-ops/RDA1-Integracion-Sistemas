import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/alojamiento.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/auth_guard_dialog.dart';
import '../../widgets/direct_booking_modal.dart';
import '../../widgets/auth_guard_dialog.dart';
import '../../widgets/booking_rating_badge.dart';
import '../../theme/booking_colors.dart';

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
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        title: Text(h.nombre, style: const TextStyle(color: Colors.white, fontSize: 18)),
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Foto destacada
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Image.network(
                h.imagenUrl ?? 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  color: Colors.blueGrey.shade100,
                  child: const Center(child: Icon(Icons.hotel, size: 50, color: BookingColors.textMuted)),
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
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              h.nombre,
                              style: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                                color: BookingColors.textDark,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                const Icon(Icons.location_on, color: BookingColors.primaryBlue, size: 16),
                                const SizedBox(width: 4),
                                Text(
                                  '${h.ciudad}, Ecuador',
                                  style: const TextStyle(fontSize: 14, color: BookingColors.textMuted),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      BookingRatingBadge(rating: h.rating, reviewsCount: 124),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    h.descripcion,
                    style: const TextStyle(fontSize: 14, height: 1.4, color: BookingColors.textDark),
                  ),
                  const Divider(height: 32, color: BookingColors.borderLight),

                  // Fechas de estadía
                  const Text('Fechas de Estadía:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: BookingColors.borderLight),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '$_noches noches: ${DateFormat('dd MMM').format(_checkIn)} al ${DateFormat('dd MMM yyyy').format(_checkOut)}',
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                        ),
                        const Icon(Icons.calendar_month, color: BookingColors.primaryBlue),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Habitaciones disponibles
                  const Text('Selecciona Tipo de Habitación:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 8),
                  if (h.habitaciones.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: BookingColors.borderLight),
                      ),
                      child: const Text('Habitación estándar con cama matrimonial y desayuno continental incluido.'),
                    )
                  else
                    Column(
                      children: h.habitaciones.map((room) {
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                            side: BorderSide(
                              color: _habitacionSeleccionada?.id == room.id
                                  ? BookingColors.actionBlue
                                  : BookingColors.borderLight,
                              width: _habitacionSeleccionada?.id == room.id ? 1.5 : 0.8,
                            ),
                          ),
                          child: RadioListTile<TipoHabitacion>(
                            title: Text(room.nombre, style: const TextStyle(fontWeight: FontWeight.bold)),
                            subtitle: Text('Capacidad: ${room.capacidadHuespedes} personas'),
                            secondary: Text(
                              'US\$ ${room.precioPorNoche.toStringAsFixed(2)}/noche',
                              style: const TextStyle(fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                            ),
                            value: room,
                            activeColor: BookingColors.actionBlue,
                            groupValue: _habitacionSeleccionada,
                            onChanged: (v) => setState(() => _habitacionSeleccionada = v),
                          ),
                        );
                      }).toList(),
                    ),

                  const SizedBox(height: 24),

                  // Botón de Reserva con Auth Guard
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
                          vertical: 'alojamientos',
                          titulo: h.nombre,
                          subtitulo: '$_noches noches · ${_habitacionSeleccionada?.nombre ?? "Habitación Estándar"} · ${h.ciudad}',
                          proveedor: 'Hospedaje Booking',
                          fecha: DateFormat('yyyy-MM-dd').format(_checkIn),
                          subtotal: totalEstadia,
                          metadata: {
                            'hotel_id': h.id,
                            'noches': _noches,
                            'check_out': DateFormat('yyyy-MM-dd').format(_checkOut),
                          },
                        );
                      },
                      icon: const Icon(Icons.flash_on),
                      label: Text(
                        'RESERVAR AHORA · US\$ ${totalEstadia.toStringAsFixed(2)}',
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
