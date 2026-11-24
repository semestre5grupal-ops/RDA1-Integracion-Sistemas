import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/booking_colors.dart';
import '../widgets/booking_footer.dart';
import '../widgets/chatbot_flotante.dart';
import 'catalogo/home_screen.dart';
import 'perfil/perfil_screen.dart';
import 'reservas/mis_reservas_screen.dart';

class MainShell extends StatefulWidget {
  final int initialIndex;
  const MainShell({super.key, this.initialIndex = 0});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  late int _currentIndex;
  bool _showCookieBanner = false;

  final List<Widget> _screens = const [
    HomeScreen(),
    MisReservasScreen(),
    PerfilScreen(),
  ];

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _checkCookies();
  }

  Future<void> _checkCookies() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (!prefs.containsKey('booking_cookie_decision') && mounted) {
        await Future.delayed(const Duration(milliseconds: 500));
        if (mounted) setState(() => _showCookieBanner = true);
      }
    } catch (_) {}
  }

  Future<void> _saveCookieDecision(String value) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('booking_cookie_decision', value);
    } catch (_) {}
    if (mounted) setState(() => _showCookieBanner = false);
  }

  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.of(context).size.width >= 900;

    return Scaffold(
      body: Stack(
        children: [
          IndexedStack(
            index: isWide ? 0 : _currentIndex,
            children: _screens,
          ),
          // Chatbot flotante (esquina inferior derecha, parity con ChatbotFlotante.jsx)
          Positioned(
            right: 16,
            bottom: _showCookieBanner ? 96 : 18,
            child: const ChatbotFlotante(),
          ),
          // Banner de consentimiento de cookies (primera visita, parity con BannerCookies.jsx)
          if (_showCookieBanner)
            Positioned(
              left: 16,
              right: 16,
              bottom: 12,
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 780),
                  child: Material(
                    elevation: 10,
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.grey.shade300),
                      ),
                      child: Wrap(
                        alignment: WrapAlignment.spaceBetween,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 12,
                        runSpacing: 8,
                        children: [
                          const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.cookie_outlined, color: BookingColors.primaryBlue),
                              SizedBox(width: 8),
                              SizedBox(
                                width: 320,
                                child: Text(
                                  'Usamos cookies esenciales para tu sesión y seguridad. Puedes configurar tus preferencias.',
                                  style: TextStyle(fontSize: 12, color: BookingColors.textDark),
                                ),
                              ),
                            ],
                          ),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              TextButton(
                                onPressed: () => CookieConsentHelper.openPreferencesDialog(context).then((_) => _checkCookies()),
                                child: const Text('Configurar', style: TextStyle(fontSize: 12)),
                              ),
                              OutlinedButton(
                                onPressed: () => _saveCookieDecision('essential'),
                                child: const Text('Solo esenciales', style: TextStyle(fontSize: 12)),
                              ),
                              const SizedBox(width: 6),
                              ElevatedButton(
                                onPressed: () => _saveCookieDecision('all'),
                                style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                                child: const Text('Aceptar todas', style: TextStyle(color: Colors.white, fontSize: 12)),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: isWide
          ? null
          : BottomNavigationBar(
              currentIndex: _currentIndex,
              onTap: (index) => setState(() => _currentIndex = index),
              type: BottomNavigationBarType.fixed,
              backgroundColor: Colors.white,
              selectedItemColor: BookingColors.primaryBlue,
              unselectedItemColor: BookingColors.textMuted,
              selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
              unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.normal, fontSize: 12),
              elevation: 10,
              items: const [
                BottomNavigationBarItem(
                  icon: Icon(Icons.explore_outlined),
                  activeIcon: Icon(Icons.explore),
                  label: 'Explorar',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.confirmation_number_outlined),
                  activeIcon: Icon(Icons.confirmation_number),
                  label: 'Mis Reservas',
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.person_outline),
                  activeIcon: Icon(Icons.person),
                  label: 'Mi Cuenta',
                ),
              ],
            ),
    );
  }
}
