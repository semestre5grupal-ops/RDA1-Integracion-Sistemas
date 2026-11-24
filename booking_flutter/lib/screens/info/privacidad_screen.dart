import 'package:flutter/material.dart';
import '../../theme/booking_colors.dart';

class PrivacidadScreen extends StatelessWidget {
  const PrivacidadScreen({super.key});

  static const _secciones = [
    {
      'titulo': '1. Responsable del tratamiento',
      'texto':
          'Booking Prototipo es una plataforma de reservas de vuelos, alojamiento, atracciones y vehículos. Frente a las aerolíneas y proveedores de inventario, actúa como encargada: recibe los datos del usuario y los transmite únicamente para completar la reserva solicitada.',
    },
    {
      'titulo': '2. Datos que se recolectan',
      'texto':
          '• Datos identificatorios: nombre, apellido, tipo y número de documento o pasaporte.\n• Datos de contacto: correo electrónico y número de teléfono.\n• Fecha de nacimiento y nacionalidad exigidas por aerolíneas.\n• La plataforma NO almacena números completos de tarjeta ni códigos CVV.',
    },
    {
      'titulo': '3. Finalidad del tratamiento',
      'texto':
          'Gestionar búsqueda, cotización, emisión y seguimiento de reservas, transmitir datos indispensables al proveedor, cumplir obligaciones regulatorias y atender solicitudes de soporte y postventa.',
    },
    {
      'titulo': '4. Base legal',
      'texto':
          'Consentimiento explícito del titular, ejecución del contrato de reserva, cumplimiento legal y prevención de fraude.',
    },
    {
      'titulo': '5. Derechos del titular',
      'texto':
          'El titular puede ejercer en cualquier momento sus derechos de acceso, rectificación, supresión y oposición conforme a la Ley Orgánica de Protección de Datos Personales (LOPDP).',
    },
    {
      'titulo': '6. Seguridad de la información',
      'texto':
          'Transmisión cifrada con TLS, control de acceso mediante OAuth2 y JWT de corta duración, y aislamiento lógico por usuario.',
    },
    {
      'titulo': '7. Cookies y preferencias',
      'texto':
          'La plataforma utiliza almacenamiento local para mantener la sesión segura, moneda preferida e historial del asistente virtual. Puedes gestionar tu consentimiento desde el pie de página.',
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Política de Privacidad', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 17)),
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
                    const Text('Política de Privacidad — Booking Prototipo', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue)),
                    const SizedBox(height: 6),
                    const Text('Protección de datos personales en vuelos, alojamientos, autos y atracciones.', style: TextStyle(fontSize: 13, color: BookingColors.textMuted)),
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

