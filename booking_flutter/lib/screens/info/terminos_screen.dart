import 'package:flutter/material.dart';
import '../../theme/booking_colors.dart';

class TerminosScreen extends StatelessWidget {
  const TerminosScreen({super.key});

  static const _secciones = [
    {
      'titulo': '1. Aceptación de los términos',
      'texto':
          'Al utilizar esta plataforma o completar una reserva, el usuario declara haber leído, comprendido y aceptado estos Términos de Uso junto con la Política de Privacidad.',
    },
    {
      'titulo': '2. Descripción del servicio',
      'texto':
          'Booking Prototipo ofrece búsqueda, cotización y reserva de pasajes aéreos, hospedaje, renta de autos y atracciones turísticas actuando como intermediario tecnológico con proveedores conectados.',
    },
    {
      'titulo': '3. Reservas y confirmación',
      'texto':
          'Una reserva se considera confirmada cuando el proveedor emite el código PNR / voucher correspondiente. Los datos proporcionados deben ser exactos y verificables.',
    },
    {
      'titulo': '4. Precios, impuestos y pagos',
      'texto':
          'Los precios mostrados reflejan tasas e IVA ecuatoriano (15%) según la vertical. La plataforma no almacena datos completos de tarjetas ni códigos CVV.',
    },
    {
      'titulo': '5. Cambios, cancelaciones y reembolsos',
      'texto':
          'Las cancelaciones gratuitas aplican según las políticas de cada vertical (48 horas previas en alojamientos; 24 horas previas en atracciones y vehículos; reglas tarifarias en vuelos).',
    },
    {
      'titulo': '6. Equipaje y servicios adicionales',
      'texto':
          'El equipaje personal, equipaje de mano y maleta facturada dependen de la familia tarifaria elegida en vuelos y se muestran antes de confirmar el pago.',
    },
    {
      'titulo': '7. Uso aceptable de la plataforma',
      'texto':
          'El usuario se compromete a no realizar consultas automatizadas abusivas ni intentar acceder a cuentas o reservas de terceros.',
    },
    {
      'titulo': '8. Disponibilidad del servicio',
      'texto':
          'Los cupos, tarifas y horarios dependen en tiempo real de los nodos proveedores y aerolíneas asociadas.',
    },
    {
      'titulo': '9. Limitación de responsabilidad',
      'texto':
          'Las variaciones operativas propias de la aerolínea o proveedor local se rigen por el contrato directo con dicho operador y la normativa vigente.',
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Términos y Condiciones', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 17)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 820),
            child: Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Términos de Uso — Booking Prototipo', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue)),
                    const SizedBox(height: 6),
                    const Text('Condiciones generales aplicables al uso del marketplace multivertical.', style: TextStyle(fontSize: 13, color: BookingColors.textMuted)),
                    const Divider(height: 28),
                    ..._secciones.map((s) => Padding(
                          padding: const EdgeInsets.only(bottom: 18),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(s['titulo']!, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
                              const SizedBox(height: 6),
                              Text(s['texto']!, style: const TextStyle(fontSize: 13.5, height: 1.55, color: BookingColors.textDark)),
                            ],
                          ),
                        )),
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

