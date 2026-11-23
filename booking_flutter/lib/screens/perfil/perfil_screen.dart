import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import 'facturas_screen.dart';
import '../auth/login_screen.dart';

class PerfilScreen extends StatelessWidget {
  const PerfilScreen({super.key});

  void _showTermsDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Términos y Condiciones'),
        content: const SingleChildScrollView(
          child: Text(
            '1. Plataforma de Intermediación: Booking Ecuador actúa como orquestador de reservas entre el usuario y los socios comerciales (Atracciones, Autos, Alojamientos, Vuelos).\n\n'
            '2. Política de Cancelación: Cancelaciones con reembolso total aplican hasta 24 horas antes para autos/hoteles/vuelos y 48 horas antes para atracciones turísticas reguladas.\n\n'
            '3. Tarifas e Impuestos: Todas las transacciones en territorio ecuatoriano incluyen el 15% de Impuesto al Valor Agregado (IVA) conforme a la Ley Orgánica para Enfrentar el Conflicto Armado Interno (2024).\n\n'
            '4. Protección de Datos: Sus datos se procesan con fines exclusivos de confirmación de reserva y emisión de comprobantes electrónicos autorizados por el SRI.',
            style: TextStyle(fontSize: 13, height: 1.4),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
  }

  void _showPrivacyDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Política de Privacidad'),
        content: const SingleChildScrollView(
          child: Text(
            'Booking Ecuador garantiza la confidencialidad de la información personal de sus usuarios conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador.\n\n'
            'No comercializamos información a terceros ni compartimos identificadores fuera de los socios estrictamente vinculados a las reservas confirmadas.',
            style: TextStyle(fontSize: 13, height: 1.4),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cerrar'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mi Cuenta'),
        backgroundColor: const Color(0xFF003580),
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 16),
        children: [
          // Header del usuario
          Container(
            padding: const EdgeInsets.all(20),
            margin: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF003580), Color(0xFF0056B3)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.08),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 32,
                  backgroundColor: Colors.white,
                  child: Text(
                    auth.isAuthenticated
                        ? (auth.user?.nombre.isNotEmpty == true ? auth.user!.nombre[0].toUpperCase() : 'U')
                        : '?',
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF003580),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        auth.isAuthenticated ? (auth.user?.nombre ?? 'Usuario') : 'Invitado',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        auth.isAuthenticated ? (auth.user?.email ?? '') : 'Inicie sesión para guardar sus reservas',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.85),
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // Sección de gestión
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: Text(
              'SERVICIOS Y DOCUMENTOS',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: Colors.grey,
                letterSpacing: 1.1,
              ),
            ),
          ),

          ListTile(
            leading: const Icon(Icons.receipt_long, color: Color(0xFF003580)),
            title: const Text('Facturación Electrónica SRI'),
            subtitle: const Text('Comprobantes de pago con 15% IVA'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const FacturasScreen()),
              );
            },
          ),

          ListTile(
            leading: const Icon(Icons.notifications_outlined, color: Color(0xFF003580)),
            title: const Text('Notificaciones de Viaje'),
            subtitle: const Text('Alertas de vuelos, confirmaciones y cooldown'),
            trailing: Switch(
              value: true,
              activeColor: const Color(0xFF003580),
              onChanged: (val) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(val ? 'Notificaciones activadas.' : 'Notificaciones pausadas.'),
                    duration: const Duration(seconds: 1),
                  ),
                );
              },
            ),
          ),

          const Divider(height: 32),

          // Sección Legal
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: Text(
              'LEGAL Y TRANSPARENCIA',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: Colors.grey,
                letterSpacing: 1.1,
              ),
            ),
          ),

          ListTile(
            leading: const Icon(Icons.description_outlined, color: Color(0xFF003580)),
            title: const Text('Términos y Condiciones'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showTermsDialog(context),
          ),

          ListTile(
            leading: const Icon(Icons.security, color: Color(0xFF003580)),
            title: const Text('Política de Privacidad'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showPrivacyDialog(context),
          ),

          ListTile(
            leading: const Icon(Icons.info_outline, color: Color(0xFF003580)),
            title: const Text('Versión de la Aplicación'),
            subtitle: const Text('v1.0.0 (RDA3 Flutter Mobile Marketplace)'),
          ),

          const Divider(height: 32),

          // Botón de autenticación
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: auth.isAuthenticated
                ? OutlinedButton.icon(
                    onPressed: () {
                      auth.logout();
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Sesión cerrada exitosamente.')),
                      );
                    },
                    icon: const Icon(Icons.logout, color: Colors.red),
                    label: const Text('Cerrar Sesión', style: TextStyle(color: Colors.red)),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Colors.red),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  )
                : ElevatedButton.icon(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => const LoginScreen()),
                      );
                    },
                    icon: const Icon(Icons.login),
                    label: const Text('Iniciar Sesión'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF003580),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
