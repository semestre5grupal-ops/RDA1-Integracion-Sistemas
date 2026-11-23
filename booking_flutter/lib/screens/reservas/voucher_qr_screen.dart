import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../models/reserva.dart';

class VoucherQrScreen extends StatelessWidget {
  final Reserva reserva;
  const VoucherQrScreen({super.key, required this.reserva});

  @override
  Widget build(BuildContext context) {
    final qrData = reserva.voucherQr ?? 'BOOKING-${reserva.id}';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Voucher Digital de Check-in', style: TextStyle(color: Colors.white)),
        backgroundColor: const Color(0xFF003580),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Card(
            elevation: 4,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('BOOKING CENTRAL', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF003580), letterSpacing: 1.5)),
                  const SizedBox(height: 8),
                  Text(reserva.servicioNombre, textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  if (reserva.proveedor != null) Text('Operado por: ${reserva.proveedor}', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                  const Divider(height: 32),

                  // Código QR vectorial generado nativamente
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.grey.shade300),
                    ),
                    child: QrImageView(
                      data: qrData,
                      version: QrVersions.auto,
                      size: 220.0,
                    ),
                  ),

                  const SizedBox(height: 16),
                  Text('Código PNR: ${reserva.pnr ?? reserva.id}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 8),
                  Text('Fecha: ${reserva.fecha} ${reserva.hora != null ? "· " + reserva.hora! : ""}', style: TextStyle(color: Colors.grey.shade700)),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(color: Colors.blue.shade50, borderRadius: BorderRadius.circular(8)),
                    child: const Text(
                      'Presenta este código QR al guía o en el mostrador para tu Check-in digital sin contacto.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: Color(0xFF003580)),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

