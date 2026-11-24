import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/reserva.dart';
import '../providers/auth_provider.dart';
import '../services/booking_services.dart';
import '../theme/booking_colors.dart';
import '../screens/reservas/voucher_qr_screen.dart';

class DirectBookingModal {
  static Future<void> show(
    BuildContext context, {
    required String vertical, // 'alojamientos', 'vuelos', 'autos', 'atracciones'
    required String titulo,
    required String subtitulo,
    String? proveedor,
    required String fecha,
    String? hora,
    required double subtotal,
    Map<String, dynamic>? metadata,
    String? pnr,
    String? voucherQr,
  }) async {
    final auth = context.read<AuthProvider>();
    final user = auth.user;

    final iva = subtotal * 0.15; // 15% IVA SRI
    final total = subtotal + iva;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        bool confirmando = false;

        return StatefulBuilder(
          builder: (context, setModalState) {
            return Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
              ),
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Barra decorativa superior
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Encabezado
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: BookingColors.primaryBlue.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(
                            vertical == 'alojamientos'
                                ? Icons.hotel
                                : vertical == 'vuelos'
                                    ? Icons.flight_takeoff
                                    : vertical == 'autos'
                                        ? Icons.directions_car
                                        : Icons.attractions,
                            color: BookingColors.primaryBlue,
                            size: 26,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Confirmar Reserva Directa',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 18,
                                  color: BookingColors.textDark,
                                ),
                              ),
                              Text(
                                'Reserva inmediata sin comisiones extra',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, color: Colors.grey),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const Divider(height: 24),

                    // Resumen del Servicio
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: BookingColors.backgroundLight,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: BookingColors.borderLight),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            titulo,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                              color: BookingColors.primaryBlue,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            subtitulo,
                            style: const TextStyle(fontSize: 13, color: BookingColors.textDark),
                          ),
                          if (proveedor != null) ...[
                            const SizedBox(height: 4),
                            Text(
                              'Operador / Proveedor: $proveedor',
                              style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                            ),
                          ],
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              const Icon(Icons.calendar_today, size: 14, color: BookingColors.primaryBlue),
                              const SizedBox(width: 6),
                              Text(
                                'Fecha: $fecha ${hora != null ? "· $hora" : ""}',
                                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Datos del Huésped / Pasajero (pre-llenados)
                    const Text(
                      'Datos del Titular de la Reserva',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: BookingColors.textDark),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: BookingColors.borderLight),
                      ),
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('Nombre:', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                              Text(
                                user?.nombreCompleto ?? 'Turista Booking',
                                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('Documento:', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                              Text(
                                '${user?.tipoDocumento ?? "Cédula"}: ${user?.cedula ?? "1712345678"}',
                                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('Correo:', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                              Text(
                                user?.email ?? 'turista@booking.ec',
                                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('Celular:', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                              Text(
                                user?.telefono ?? '0991234567',
                                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Desglose de Precios con IVA SRI 15%
                    const Text(
                      'Desglose de Tarifas e Impuestos SRI',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: BookingColors.textDark),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: BookingColors.borderLight),
                      ),
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text('Tarifa base neta:', style: TextStyle(fontSize: 13, color: BookingColors.textMuted)),
                              Text('US\$ ${subtotal.toStringAsFixed(2)}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text('IVA SRI (15%):', style: TextStyle(fontSize: 13, color: BookingColors.textMuted)),
                              Text('US\$ ${iva.toStringAsFixed(2)}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                            ],
                          ),
                          const Divider(height: 16),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text('Total a Pagar:', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue)),
                              Text(
                                'US\$ ${total.toStringAsFixed(2)}',
                                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Botón Confirmar
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: BookingColors.successGreen,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: confirmando
                            ? null
                            : () async {
                                setModalState(() => confirmando = true);

                                final generatedId = 'res-${vertical.substring(0, 3)}-${DateTime.now().millisecondsSinceEpoch}';
                                final qr = voucherQr ?? 'QR-${vertical.toUpperCase()}-${DateTime.now().millisecondsSinceEpoch}';
                                final pnrCode = pnr ?? 'PNR-${vertical.substring(0, 3).toUpperCase()}-${DateTime.now().millisecondsSinceEpoch.toString().substring(7)}';

                                final nuevaReserva = Reserva(
                                  id: generatedId,
                                  vertical: vertical,
                                  servicioNombre: titulo,
                                  proveedor: proveedor ?? 'Booking Aliados',
                                  fecha: fecha,
                                  hora: hora,
                                  total: total,
                                  estado: 'CONFIRMADA',
                                  voucherQr: qr,
                                  pnr: pnrCode,
                                  fechaCreacion: DateTime.now(),
                                  fechaServicio: DateTime.now().add(const Duration(days: 3)),
                                );

                                // Guardar en memoria central para Mis Reservas
                                BookingServices.agregarReservaDirecta(nuevaReserva);

                                Navigator.pop(ctx); // Cierra bottom sheet

                                // Mostrar diálogo de confirmación exitosa con Voucher
                                await showDialog(
                                  context: context,
                                  builder: (dialogCtx) => AlertDialog(
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                                    title: const Row(
                                      children: [
                                        Icon(Icons.check_circle, color: BookingColors.successGreen, size: 28),
                                        SizedBox(width: 8),
                                        Text('¡Reserva Confirmada!', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                                      ],
                                    ),
                                    content: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text('Tu reserva para "$titulo" ha sido confirmada con éxito.'),
                                        const SizedBox(height: 10),
                                        Text('Código PNR / Localizador: $pnrCode', style: const TextStyle(fontWeight: FontWeight.bold, color: BookingColors.primaryBlue)),
                                        const SizedBox(height: 4),
                                        Text('Total pagado (con IVA 15%): US\$ ${total.toStringAsFixed(2)}'),
                                        const SizedBox(height: 6),
                                        const Text(
                                          'Tu voucher con código QR y la factura electrónica SRI ya están disponibles en tu sección de reservas.',
                                          style: TextStyle(fontSize: 12, color: BookingColors.textMuted),
                                        ),
                                      ],
                                    ),
                                    actions: [
                                      TextButton(
                                        onPressed: () {
                                          Navigator.pop(dialogCtx);
                                          Navigator.pushNamed(context, '/reservas');
                                        },
                                        child: const Text('Ir a Mis Reservas', style: TextStyle(color: BookingColors.textDark)),
                                      ),
                                      ElevatedButton.icon(
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor: BookingColors.primaryBlue,
                                          foregroundColor: Colors.white,
                                        ),
                                        onPressed: () {
                                          Navigator.pop(dialogCtx);
                                          Navigator.push(
                                            context,
                                            MaterialPageRoute(
                                              builder: (_) => VoucherQrScreen(reserva: nuevaReserva),
                                            ),
                                          );
                                        },
                                        icon: const Icon(Icons.qr_code, size: 18),
                                        label: const Text('Ver Voucher QR'),
                                      ),
                                    ],
                                  ),
                                );
                              },
                        child: confirmando
                            ? const SizedBox(
                                height: 22,
                                width: 22,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                              )
                            : Text(
                                'CONFIRMAR RESERVA · US\$ ${total.toStringAsFixed(2)}',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}
