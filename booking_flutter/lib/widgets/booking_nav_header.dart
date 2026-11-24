import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/currency_provider.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';
import '../screens/info/quiero_ser_proveedor_screen.dart';
import '../screens/perfil/facturas_screen.dart';
import '../screens/perfil/perfil_screen.dart';
import '../screens/reservas/mis_reservas_screen.dart';
import '../screens/vuelos/estado_vuelo_screen.dart';
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

  void _openCurrencyModal(BuildContext context, CurrencyProvider curProv) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Selecciona tu moneda', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Cuando corresponda, los precios se mostrarán en la moneda seleccionada.',
                  style: TextStyle(fontSize: 12.5, color: BookingColors.textMuted),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: CurrencyProvider.supportedCurrencies.map((c) {
                    final active = c.code == curProv.currency;
                    return InkWell(
                      onTap: () {
                        curProv.changeCurrency(c.code);
                        Navigator.pop(ctx);
                      },
                      borderRadius: BorderRadius.circular(6),
                      child: Container(
                        width: 148,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: active ? const Color(0xFFF0F6FD) : Colors.white,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: active ? BookingColors.actionBlue : Colors.grey.shade300),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.name, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                            Text(c.code, style: TextStyle(fontSize: 11, color: active ? BookingColors.actionBlue : BookingColors.textMuted, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar')),
        ],
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
    final currencyProv = Provider.of<CurrencyProvider>(context);
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
              // 1. Barra superior corporativa (Navbar.jsx parity)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Row(
                      children: [
                        Text(
                          'Booking.com',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 23,
                            fontWeight: FontWeight.bold,
                            letterSpacing: -0.4,
                          ),
                        ),
                      ],
                    ),
                    Flexible(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (isWide) ...[
                              TextButton(
                                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const EstadoVueloScreen())),
                                child: const Text('Estado de vuelo', style: TextStyle(color: Colors.white, fontSize: 13)),
                              ),
                              TextButton(
                                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const QuieroSerProveedorScreen())),
                                child: const Text('Registra tu propiedad', style: TextStyle(color: Colors.white, fontSize: 13)),
                              ),
                              TextButton(
                                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MisReservasScreen())),
                                child: const Text('Mis reservas', style: TextStyle(color: Colors.white, fontSize: 13)),
                              ),
                              TextButton(
                                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FacturasScreen())),
                                child: const Text('Facturas', style: TextStyle(color: Colors.white, fontSize: 13)),
                              ),
                              const SizedBox(width: 6),
                            ],
                            InkWell(
                              onTap: () => _openCurrencyModal(context, currencyProv),
                              borderRadius: BorderRadius.circular(4),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                                child: Text(
                                  currencyProv.currency,
                                  style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            if (auth.isAuthenticated)
                              InkWell(
                                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PerfilScreen())),
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
                                          (auth.user?.nombre ?? 'U').substring(0, 1).toUpperCase(),
                                          style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      Text(
                                        auth.user?.nombre ?? 'Usuario',
                                        style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                                      ),
                                    ],
                                  ),
                                ),
                              )
                            else
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  ElevatedButton(
                                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RegisterScreen())),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.white,
                                      foregroundColor: BookingColors.actionBlue,
                                      elevation: 0,
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                                      visualDensity: VisualDensity.compact,
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                                    ),
                                    child: const Text('Regístrate', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold)),
                                  ),
                                  const SizedBox(width: 6),
                                  ElevatedButton(
                                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LoginScreen())),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.white,
                                      foregroundColor: BookingColors.actionBlue,
                                      elevation: 0,
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                                      visualDensity: VisualDensity.compact,
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                                    ),
                                    child: const Text('Iniciar sesión', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold)),
                                  ),
                                ],
                              ),
                          ],
                        ),
                      ),
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

              // 3. Título Hero y Subtítulo
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
