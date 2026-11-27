import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../theme/booking_colors.dart';
import '../auth/login_screen.dart';
import '../auth/register_screen.dart';
import '../info/quiero_ser_proveedor_screen.dart';
import '../reservas/mis_reservas_screen.dart';
import '../vuelos/estado_vuelo_screen.dart';
import '../admin/admin_screen.dart';
import 'facturas_screen.dart';

class PerfilScreen extends StatelessWidget {
  const PerfilScreen({super.key});

  Future<void> _openEditProfileModal(BuildContext context, AuthProvider auth) async {
    final user = auth.user;
    if (user == null) return;

    final nombreCtrl = TextEditingController(text: user.nombre);
    final apellidoCtrl = TextEditingController(text: user.apellido);
    final telCtrl = TextEditingController(text: user.telefono);
    final emailCtrl = TextEditingController(text: user.email);
    final currentPassCtrl = TextEditingController();
    final newPassCtrl = TextEditingController();
    String? errMsg;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(18))),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModal) => Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 18,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Editar datos de perfil', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue)),
                const SizedBox(height: 12),
                if (errMsg != null)
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(8)),
                    child: Text(errMsg!, style: const TextStyle(color: BookingColors.errorRed, fontSize: 12)),
                  ),
                TextField(
                  controller: nombreCtrl,
                  decoration: const InputDecoration(labelText: 'Nombre', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: apellidoCtrl,
                  decoration: const InputDecoration(labelText: 'Apellido', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Correo electrónico', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: telCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Teléfono', border: OutlineInputBorder()),
                ),
                const Divider(height: 22),
                const Text('Cambiar contraseña (opcional)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                const SizedBox(height: 8),
                TextField(
                  controller: currentPassCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Contraseña actual', border: OutlineInputBorder(), isDense: true),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: newPassCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Nueva contraseña', border: OutlineInputBorder(), isDense: true),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 46,
                  child: ElevatedButton(
                    onPressed: () async {
                      if (nombreCtrl.text.trim().isEmpty || !emailCtrl.text.contains('@')) {
                        setModal(() => errMsg = 'Nombre y correo válido requeridos.');
                        return;
                      }
                      final err = await auth.updateProfile(
                        nombre: nombreCtrl.text,
                        apellido: apellidoCtrl.text,
                        telefono: telCtrl.text,
                        email: emailCtrl.text,
                        currentPassword: currentPassCtrl.text,
                        newPassword: newPassCtrl.text,
                      );
                      if (err != null) {
                        setModal(() => errMsg = err);
                        return;
                      }
                      if (ctx.mounted) Navigator.pop(ctx);
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Perfil actualizado correctamente.'), backgroundColor: BookingColors.successGreen),
                        );
                      }
                    },
                    style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                    child: const Text('Guardar cambios', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);
    final user = auth.user;

    return Scaffold(
      backgroundColor: BookingColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: BookingColors.primaryBlue,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Mi Cuenta Booking', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 17)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!auth.isAuthenticated || user == null) ...[
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: BookingColors.primaryBlue,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: BookingColors.accentYellow,
                          child: Icon(Icons.person_outline, color: BookingColors.primaryBlue),
                        ),
                        SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'Inicia sesión o crea tu cuenta',
                            style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Accede a tus reservas de alojamientos, boletos aéreos, rentas de autos, vouchers QR y comprobantes SRI en un solo lugar.',
                      style: TextStyle(color: Colors.white70, fontSize: 13),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LoginScreen())),
                            style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                            child: const Text('Iniciar sesión', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RegisterScreen())),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.white,
                              side: const BorderSide(color: Colors.white),
                            ),
                            child: const Text('Crear cuenta', style: TextStyle(fontWeight: FontWeight.bold)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ] else ...[
              // Tarjeta de usuario autenticado + Genius
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [BookingColors.primaryBlue, Color(0xFF0057C2)]),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 26,
                          backgroundColor: BookingColors.accentYellow,
                          child: Text(
                            user.nombre.isNotEmpty ? user.nombre[0].toUpperCase() : 'B',
                            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: BookingColors.primaryBlue),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(user.nombreCompleto, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                              Text(user.email, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                              const SizedBox(height: 4),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(color: BookingColors.accentYellow, borderRadius: BorderRadius.circular(4)),
                                child: const Text('Genius Nivel 1', style: TextStyle(color: BookingColors.primaryBlue, fontSize: 10, fontWeight: FontWeight.bold)),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: 'Editar perfil',
                          onPressed: () => _openEditProfileModal(context, auth),
                          icon: const Icon(Icons.edit, color: Colors.white),
                        ),
                      ],
                    ),
                    const Divider(color: Colors.white24, height: 22),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('${user.tipoDocumento}: ${user.cedula.isNotEmpty ? user.cedula : "Sin registrar"}', style: const TextStyle(color: Colors.white, fontSize: 12)),
                        Text('Tel: ${user.telefono.isNotEmpty ? user.telefono : "Sin registrar"}', style: const TextStyle(color: Colors.white, fontSize: 12)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 20),

            const Text('Gestión de Viajes y Documentos', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: BookingColors.textDark)),
            const SizedBox(height: 8),

            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.confirmation_number_outlined, color: BookingColors.actionBlue),
                    title: const Text('Mis Reservas y Vouchers QR', style: TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: const Text('Alojamientos, vuelos, autos y atracciones'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MisReservasScreen())),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.receipt_long_outlined, color: BookingColors.actionBlue),
                    title: const Text('Comprobantes Electrónicos SRI', style: TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: const Text('Facturas con clave de acceso e IVA 15%'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FacturasScreen())),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.radar, color: BookingColors.actionBlue),
                    title: const Text('Estado de Vuelo en Tiempo Real', style: TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: const Text('Consulta puerta de embarque y horarios'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const EstadoVueloScreen())),
                  ),
                  if (panelAdminVisible && (auth.user?.esAdmin ?? false)) ...[
                    const Divider(height: 1),
                    ListTile(
                      leading: const Icon(Icons.admin_panel_settings_outlined, color: BookingColors.actionBlue),
                      title: const Text('Administración', style: TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: const Text('Resumen, objetivos de servicio y compras de vuelos'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminScreen())),
                    ),
                  ],
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.storefront_outlined, color: BookingColors.actionBlue),
                    title: const Text('Registra tu propiedad o negocio', style: TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: const Text('Postula como hotel, aerolínea, rentadora o tour'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const QuieroSerProveedorScreen())),
                  ),
                ],
              ),
            ),

            if (auth.isAuthenticated) ...[
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final confirm = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('Cerrar sesión'),
                        content: const Text('¿Deseas salir de tu cuenta en este dispositivo?'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
                          ElevatedButton(
                            onPressed: () => Navigator.pop(ctx, true),
                            style: ElevatedButton.styleFrom(backgroundColor: BookingColors.errorRed),
                            child: const Text('Salir', style: TextStyle(color: Colors.white)),
                          ),
                        ],
                      ),
                    );
                    if (confirm == true) await auth.logout();
                  },
                  icon: const Icon(Icons.logout, color: BookingColors.errorRed),
                  label: const Text('Cerrar sesión', style: TextStyle(color: BookingColors.errorRed, fontWeight: FontWeight.bold)),
                  style: OutlinedButton.styleFrom(side: const BorderSide(color: BookingColors.errorRed)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
