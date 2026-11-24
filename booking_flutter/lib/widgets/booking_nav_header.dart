import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../theme/booking_colors.dart';
import '../providers/auth_provider.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';
import '../screens/perfil/perfil_screen.dart';

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
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? Colors.white.withOpacity(0.18) : Colors.transparent,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isSelected ? Colors.white : Colors.transparent,
              width: 1.5,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: Colors.white, size: 18),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
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

    return Container(
      color: BookingColors.primaryBlue,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 1. Barra superior corporativa
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Row(
                  children: [
                    Icon(Icons.travel_explore, color: Colors.white, size: 26),
                    SizedBox(width: 8),
                    Text(
                      'Booking Central',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.monetization_on_outlined, color: Colors.white, size: 14),
                          SizedBox(width: 4),
                          Text('USD', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    if (auth.isAuthenticated)
                      InkWell(
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => const PerfilScreen()),
                          );
                        },
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 16,
                              backgroundColor: Colors.white,
                              child: Text(
                                auth.user?.nombre.isNotEmpty == true ? auth.user!.nombre[0].toUpperCase() : 'U',
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: BookingColors.primaryBlue,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              auth.user?.nombre ?? 'Mi Cuenta',
                              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      )
                    else
                      Row(
                        children: [
                          OutlinedButton(
                            onPressed: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(builder: (_) => const RegisterScreen()),
                              );
                            },
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.white,
                              side: const BorderSide(color: Colors.white),
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              visualDensity: VisualDensity.compact,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                            ),
                            child: const Text('Regístrate', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                          ),
                          const SizedBox(width: 6),
                          ElevatedButton(
                            onPressed: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(builder: (_) => const LoginScreen()),
                              );
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              foregroundColor: BookingColors.primaryBlue,
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              visualDensity: VisualDensity.compact,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                            ),
                            child: const Text('Iniciar sesión', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ),
                  ],
                ),
              ],
            ),
          ),

          // 2. Barra de píldoras de categorías
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                _buildCategoryPill(
                  context,
                  category: MarketplaceCategory.alojamientos,
                  icon: Icons.hotel,
                  label: 'Alojamientos',
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
                  label: 'Alquiler de autos',
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

          // 3. Título Hero y Subtítulo
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _heroTitle,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _heroSubtitle,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.9),
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
