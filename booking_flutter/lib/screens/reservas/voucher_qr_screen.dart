import 'package:flutter/material.dart';
import '../../models/reserva.dart';
import '../../theme/booking_colors.dart';

class VoucherQrScreen extends StatelessWidget {
  final Reserva reserva;
  const VoucherQrScreen({super.key, required this.reserva});

  @override
  Widget build(BuildContext context) {
    final pnr = reserva.pnr ?? reserva.id;

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        title: const Text('Comprobante de Reserva', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Card(
              elevation: 3,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: BookingColors.successGreen.withValues(alpha: 0.12),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.check_circle_rounded, size: 48, color: BookingColors.successGreen),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'BOOKING CENTRAL',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: BookingColors.primaryBlue, letterSpacing: 1.5),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      reserva.servicioNombre,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: BookingColors.textDark),
                    ),
                    const SizedBox(height: 4),
                    if (reserva.proveedor != null && reserva.proveedor!.isNotEmpty)
                      Text(
                        'Operado por: ${reserva.proveedor}',
                        style: const TextStyle(color: BookingColors.textMuted, fontSize: 13),
                      ),
                    const Divider(height: 28),

                    // Caja destacada de Código PNR
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
                      decoration: BoxDecoration(
                        color: BookingColors.actionBlue.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: BookingColors.actionBlue.withValues(alpha: 0.25)),
                      ),
                      child: Column(
                        children: [
                          const Text(
                            'CÓDIGO DE RESERVA / PNR',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: BookingColors.actionBlue, letterSpacing: 1.0),
                          ),
                          const SizedBox(height: 4),
                          SelectableText(
                            pnr,
                            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, fontFamily: 'monospace', color: BookingColors.primaryBlue),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Detalles del servicio
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Fecha de servicio:', style: TextStyle(color: BookingColors.textMuted, fontSize: 13)),
                        Text(reserva.fecha, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      ],
                    ),
                    if (reserva.hora != null && reserva.hora!.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Horario reservado:', style: TextStyle(color: BookingColors.textMuted, fontSize: 13)),
                          Text(reserva.hora!, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        ],
                      ),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Total pagado:', style: TextStyle(color: BookingColors.textMuted, fontSize: 13)),
                        Text(
                          'US\$ ${reserva.total.toStringAsFixed(2)}',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: BookingColors.primaryBlue),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Estado:', style: TextStyle(color: BookingColors.textMuted, fontSize: 13)),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: reserva.esCancelada ? BookingColors.errorRed.withValues(alpha: 0.1) : BookingColors.successGreen.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            reserva.estadoDisplay,
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: reserva.esCancelada ? BookingColors.errorRed : BookingColors.successGreen),
                          ),
                        ),
                      ],
                    ),
                    const Divider(height: 28),

                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEFF6FF),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: const [
                          Icon(Icons.info_outline, color: BookingColors.actionBlue, size: 20),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Presenta tu código de reserva o tu cédula/pasaporte al presentarte con el operador.',
                              style: TextStyle(fontSize: 12, color: BookingColors.primaryBlue),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () => Navigator.pop(context),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: BookingColors.primaryBlue,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                        child: const Text('Volver a mis reservas', style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
