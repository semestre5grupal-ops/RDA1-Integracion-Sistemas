import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';
import '../screens/perfil/perfil_screen.dart';
import '../screens/reservas/mis_reservas_screen.dart';
import '../theme/booking_colors.dart';
import '../utils/pantalla.dart';

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
        return 'Vuelos nacionales';
      case MarketplaceCategory.autos:
        return 'Alquiler de coches para cualquier tipo de viaje';
      case MarketplaceCategory.atracciones:
        return 'Atracciones, actividades y experiencias';
    }
  }

  String get _heroSubtitle {
    switch (currentCategory) {
      case MarketplaceCategory.alojamientos:
        return 'Busca ofertas en hoteles, casas y mucho más...';
      case MarketplaceCategory.vuelos:
        return 'Encuentra y reserva tu vuelo en Ecuador al mejor precio.';
      case MarketplaceCategory.autos:
        return 'Coches fantásticos a precios increíbles de las principales empresas de alquiler';
      case MarketplaceCategory.atracciones:
        return 'Descubre nuevas atracciones y experiencias que coincidan con tus intereses y estilo de viaje en Ecuador';
    }
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

  /// Vertical en celular: ícono arriba y nombre corto abajo; las 4 caben siempre.
  Widget _buildCategoryTab({required MarketplaceCategory category, required IconData icon, required String label}) {
    final isSelected = currentCategory == category;
    return Expanded(
      child: Semantics(
        selected: isSelected,
        button: true,
        child: InkWell(
          onTap: () => onCategoryChanged(category),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            constraints: const BoxConstraints(minHeight: 56),
            margin: const EdgeInsets.symmetric(horizontal: 3),
            padding: const EdgeInsets.symmetric(vertical: 6),
            decoration: BoxDecoration(
              color: isSelected ? Colors.white.withValues(alpha: 0.16) : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: isSelected ? Colors.white : Colors.transparent, width: 1.5),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, color: Colors.white, size: 22),
                const SizedBox(height: 4),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: isSelected ? FontWeight.bold : FontWeight.w500),
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
    final compacto = esCompacto(context);
    final auth = Provider.of<AuthProvider>(context);
    final user = auth.user;
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
                      child: Text(
                        'Booking.com',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: compacto ? 21 : 23,
                          fontWeight: FontWeight.bold,
                          letterSpacing: -0.4,
                        ),
                      ),
                    ),
                    // Acciones superiores
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (auth.isAuthenticated && user != null) ...[
                          // Botón outline "Mis reservas" (Navbar.jsx parity). En celular
                          // ya está en la barra inferior.
                          if (!compacto) OutlinedButton(
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
                          if (!compacto) const SizedBox(width: 10),
                          // Píldora de usuario con menú desplegable anclado flotante (Navbar.jsx dropdown parity)
                          Theme(
                            data: Theme.of(context).copyWith(
                              cardColor: Colors.white,
                              popupMenuTheme: PopupMenuThemeData(
                                color: Colors.white,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                elevation: 8,
                              ),
                            ),
                            child: PopupMenuButton<String>(
                              offset: const Offset(0, 36),
                              tooltip: 'Menú de usuario',
                              onSelected: (val) async {
                                if (val == 'perfil') {
                                  Navigator.push(context, MaterialPageRoute(builder: (_) => const PerfilScreen()));
                                } else if (val == 'logout') {
                                  await auth.logout();
                                }
                              },
                              itemBuilder: (ctx) => [
                                // Cabecera con Nombre y Email
                                PopupMenuItem<String>(
                                  enabled: false,
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        user.nombreCompleto.isNotEmpty ? user.nombreCompleto : user.nombre,
                                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Color(0xFF333333)),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        user.email,
                                        style: const TextStyle(fontSize: 12, color: Color(0xFF666666)),
                                      ),
                                    ],
                                  ),
                                ),
                                const PopupMenuDivider(),
                                // 👤 Editar Perfil
                                const PopupMenuItem<String>(
                                  value: 'perfil',
                                  child: Row(
                                    children: [
                                      Text('👤 ', style: TextStyle(fontSize: 14)),
                                      Text('Editar Perfil', style: TextStyle(color: Color(0xFF333333), fontSize: 13, fontWeight: FontWeight.w500)),
                                    ],
                                  ),
                                ),
                                const PopupMenuDivider(),
                                // 🚪 Cerrar sesión
                                const PopupMenuItem<String>(
                                  value: 'logout',
                                  child: Row(
                                    children: [
                                      Text('🚪 ', style: TextStyle(fontSize: 14)),
                                      Text('Cerrar sesión', style: TextStyle(color: Color(0xFFD32F2F), fontSize: 13, fontWeight: FontWeight.w500)),
                                    ],
                                  ),
                                ),
                              ],
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
                                        (user.nombre.isNotEmpty ? user.nombre : 'U').substring(0, 1).toUpperCase(),
                                        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                    const SizedBox(width: 7),
                                    if (!compacto) Text(
                                      user.nombre.isNotEmpty ? user.nombre : 'Usuario',
                                      style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                                    ),
                                    const SizedBox(width: 4),
                                    const Icon(Icons.arrow_drop_down, color: Colors.white, size: 18),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ] else ...[
                          // Botones cuando NO está autenticado (Navbar.jsx parity). En celular
                          // solo "Iniciar sesión": desde ahí se llega a crear cuenta.
                          if (!compacto) ElevatedButton(
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
                          if (!compacto) const SizedBox(width: 8),
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

              // 2. Categorías. En celular: 4 pestañas iguales que siempre caben.
              if (compacto)
                Padding(
                  padding: const EdgeInsets.fromLTRB(13, 6, 13, 4),
                  child: Row(children: [
                    _buildCategoryTab(category: MarketplaceCategory.alojamientos, icon: Icons.hotel, label: 'Hospedajes'),
                    _buildCategoryTab(category: MarketplaceCategory.vuelos, icon: Icons.flight, label: 'Vuelos'),
                    _buildCategoryTab(category: MarketplaceCategory.autos, icon: Icons.directions_car, label: 'Autos'),
                    _buildCategoryTab(category: MarketplaceCategory.atracciones, icon: Icons.attractions, label: 'Atracciones'),
                  ]),
                )
              else
              // Barra de píldoras de categorías (Exactamente 4: Hospedajes, Vuelos, Renta de autos, Atracciones)
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
