import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';
import '../screens/perfil/perfil_screen.dart';
import '../screens/reservas/mis_reservas_screen.dart';
import '../theme/booking_colors.dart';

enum MarketplaceCategory {
  alojamientos,
  vuelos,
  autos,
  atracciones,
}

class BookingNavHeader extends StatelessWidget {
  final MarketplaceCategory currentCategory;
  final ValueChanged<MarketplaceCategory> onCategoryChanged;

  const BookingNavHeader({
    super.key,
    required this.currentCategory,
    required this.onCategoryChanged,
  });

  String get _heroTitle {
    switch (currentCategory) {
      case MarketplaceCategory.alojamientos:
        return 'Encuentra tu próximo alojamiento';
      case MarketplaceCategory.vuelos:
        return 'Compara y reserva vuelos fácilmente';
      case MarketplaceCategory.autos:
        return 'Alquiler de autos para cualquier viaje';
      case MarketplaceCategory.atracciones:
        return 'Atracciones, actividades y tours';
    }
  }

  String get _heroSubtitle {
    switch (currentCategory) {
      case MarketplaceCategory.alojamientos:
        return 'Busca ofertas en hoteles, cabañas, casas y mucho más en Ecuador...';
      case MarketplaceCategory.vuelos:
        return 'Viaja por Ecuador y el mundo con aerolíneas aliadas al mejor precio.';
      case MarketplaceCategory.autos:
        return 'Grandes marcas, precios claros y cobertura total sin sorpresas.';
      case MarketplaceCategory.atracciones:
        return 'Descubre experiencias inolvidables con cupos y guías certificados.';
    }
  }

  void _showUserDropdown(BuildContext context, AuthProvider auth) {
    final user = auth.user;
    if (user == null) return;

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Cabecera: Nombre y correo (parity con Navbar.jsx)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 20,
                      backgroundColor: BookingColors.actionBlue,
                      child: Text(
                        (user.nombre.isNotEmpty ? user.nombre : 'U').substring(0, 1).toUpperCase(),
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user.nombreCompleto.isNotEmpty ? user.nombreCompleto : user.nombre,
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: BookingColors.textDark),
                          ),
                          Text(
                            user.email,
                            style: const TextStyle(fontSize: 12.5, color: BookingColors.textMuted),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.person_outline, color: BookingColors.actionBlue),
                title: const Text('👤 Editar Perfil', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                onTap: () {
                  Navigator.pop(ctx);
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const PerfilScreen()));
                },
              ),
              ListTile(
                leading: const Icon(Icons.logout, color: BookingColors.errorRed),
                title: const Text('🚪 Cerrar sesión', style: TextStyle(color: BookingColors.errorRed, fontWeight: FontWeight.w600, fontSize: 14)),
                onTap: () async {
                  Navigator.pop(ctx);
                  await auth.logout();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCategoryPill(
    BuildContext context, {
    required MarketplaceCategory category,
    required IconData icon,
    required String label,
  }) {
    final isSelected = currentCategory == category;

    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: InkWell(
        onTap: () => onCategoryChanged(category),
        borderRadius: BorderRadius.circular(24),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 9),
          decoration: BoxDecoration(
            color: isSelected ? Colors.white.withValues(alpha: 0.16) : Colors.transparent,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: isSelected ? Colors.white : Colors.transparent,
              width: 1.5,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: Colors.white, size: 18),
              const SizedBox(width: 7),
              Text(
                label,
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);
    final isWide = MediaQuery.of(context).size.width >= 860;

    return Container(
      width: double.infinity,
      color: BookingColors.primaryBlue,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1140),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 1. Barra superior corporativa (1:1 Navbar.jsx de React)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Logo Booking.com
                    InkWell(
                      onTap: () => onCategoryChanged(MarketplaceCategory.alojamientos),
                      child: const Text(
                        'Booking.com',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 23,
                          fontWeight: FontWeight.bold,
                          letterSpacing: -0.4,
                        ),
                      ),
                    ),
                    // Acciones superiores
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (auth.isAuthenticated) ...[
                          // Botón outline "Mis reservas" (Navbar.jsx parity)
                          OutlinedButton(
                            onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => const MisReservasScreen()),
                            ),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.white,
                              side: const BorderSide(color: Colors.white, width: 1.2),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                              visualDensity: VisualDensity.compact,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                            ),
                            child: const Text(
                              'Mis reservas',
                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white),
                            ),
                          ),
                          const SizedBox(width: 10),
                          // Píldora de usuario con avatar, nombre y flecha ▼
                          InkWell(
                            onTap: () => _showUserDropdown(context, auth),
                            borderRadius: BorderRadius.circular(20),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.14),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  CircleAvatar(
                                    radius: 13,
                                    backgroundColor: BookingColors.actionBlue,
                                    child: Text(
                                      (auth.user?.nombre.isNotEmpty == true ? auth.user!.nombre : 'U')
                                          .substring(0, 1)
                                          .toUpperCase(),
                                      style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                                    ),
                                  ),
                                  const SizedBox(width: 7),
                                  Text(
                                    auth.user?.nombre.isNotEmpty == true ? auth.user!.nombre : 'Usuario',
                                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                                  ),
                                  const SizedBox(width: 4),
                                  const Icon(Icons.arrow_drop_down, color: Colors.white, size: 18),
                                ],
                              ),
                            ),
                          ),
                        ] else ...[
                          // Botones cuando NO está autenticado (Navbar.jsx parity)
                          ElevatedButton(
                            onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => const RegisterScreen()),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              foregroundColor: BookingColors.actionBlue,
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                              visualDensity: VisualDensity.compact,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                            ),
                            child: const Text('Regístrate', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => const LoginScreen()),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              foregroundColor: BookingColors.actionBlue,
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                              visualDensity: VisualDensity.compact,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                            ),
                            child: const Text('Iniciar sesión', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),

              // 2. Barra de píldoras de categorías (Exactamente 4: Hospedajes, Vuelos, Renta de autos, Atracciones)
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    _buildCategoryPill(
                      context,
                      category: MarketplaceCategory.alojamientos,
                      icon: Icons.hotel,
                      label: 'Hospedajes',
                    ),
                    _buildCategoryPill(
                      context,
                      category: MarketplaceCategory.vuelos,
                      icon: Icons.flight,
                      label: 'Vuelos',
                    ),
                    _buildCategoryPill(
                      context,
                      category: MarketplaceCategory.autos,
                      icon: Icons.directions_car,
                      label: 'Renta de autos',
                    ),
                    _buildCategoryPill(
                      context,
                      category: MarketplaceCategory.atracciones,
                      icon: Icons.attractions,
                      label: 'Atracciones',
                    ),
                  ],
                ),
              ),

              // 3. Título Hero y Subtítulo según la categoría activa
              Padding(
                padding: EdgeInsets.fromLTRB(16, isWide ? 24 : 12, 16, isWide ? 44 : 30),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _heroTitle,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: isWide ? 36 : 24,
                        fontWeight: FontWeight.bold,
                        height: 1.15,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _heroSubtitle,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.92),
                        fontSize: isWide ? 18 : 14,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
