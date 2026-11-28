import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/booking_colors.dart';
import '../utils/pantalla.dart';
import '../widgets/booking_footer.dart';
import '../widgets/chatbot_flotante.dart';
import 'catalogo/home_screen.dart';
import 'perfil/perfil_screen.dart';
import 'reservas/mis_reservas_screen.dart';
import 'vuelos/estado_vuelo_screen.dart';

class MainShell extends StatefulWidget {
  final int initialIndex;
  const MainShell({super.key, this.initialIndex = 0});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  bool _showCookieBanner = false;

  /// El chat se esconde mientras se baja por la página y vuelve al subir,
  /// para no tapar precios ni textos (patrón habitual de botón flotante en Android).
  bool _chatVisible = true;

  /// Pestaña activa de la barra inferior (solo en celular):
  /// 0 Inicio · 1 Reservas · 2 Estado de vuelo · 3 Cuenta.
  late int _tab = widget.initialIndex.clamp(0, 3);

  @override
  void initState() {
    super.initState();
    _checkCookies();
  }

  /// Las pestañas que no son Inicio se crean al entrar y se destruyen al salir:
  /// así "Mis reservas" no sigue consultando al servidor en segundo plano.
  Widget _pestanaActual() {
    switch (_tab) {
      case 1:
        return const MisReservasScreen(key: ValueKey('tab-reservas'));
      case 2:
        return const EstadoVueloScreen(key: ValueKey('tab-estado'));
      case 3:
        return const PerfilScreen(key: ValueKey('tab-perfil'));
      default:
        return const SizedBox.shrink();
    }
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
    final compacto = esCompacto(context);
    final enInicio = !compacto || _tab == 0;

    final cuerpo = Stack(
      children: [
        // Inicio se mantiene vivo (conserva búsqueda y desplazamiento al cambiar de pestaña).
        Offstage(
          offstage: !enInicio,
          child: TickerMode(
            enabled: enInicio,
            child: NotificationListener<UserScrollNotification>(
              onNotification: (n) {
                if (n.metrics.axis != Axis.vertical) return false;
                final mostrar = n.direction != ScrollDirection.reverse;
                if (compacto && mostrar != _chatVisible) setState(() => _chatVisible = mostrar);
                return false;
              },
              child: const HomeScreen(),
            ),
          ),
        ),
        if (!enInicio) Positioned.fill(child: _pestanaActual()),

        // Chat flotante: solo en Inicio, para no tapar reservas, formularios ni pagos.
        if (enInicio)
          AnimatedPositioned(
            duration: const Duration(milliseconds: 200),
            right: 16,
            bottom: (!compacto || _chatVisible) ? (_showCookieBanner ? (compacto ? 150 : 96) : 18) : -90,
            child: const ChatbotFlotante(),
          ),

        if (_showCookieBanner)
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 780),
                child: _bannerCookies(compacto),
              ),
            ),
          ),
      ],
    );

    if (!compacto) return Scaffold(body: cuerpo);

    return Scaffold(
      body: cuerpo,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        height: 64,
        backgroundColor: Colors.white,
        indicatorColor: BookingColors.actionBlue.withValues(alpha: 0.12),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.search), selectedIcon: Icon(Icons.search, color: BookingColors.actionBlue), label: 'Inicio'),
          NavigationDestination(icon: Icon(Icons.confirmation_number_outlined), selectedIcon: Icon(Icons.confirmation_number, color: BookingColors.actionBlue), label: 'Reservas'),
          NavigationDestination(icon: Icon(Icons.flight_outlined), selectedIcon: Icon(Icons.flight, color: BookingColors.actionBlue), label: 'Estado vuelo'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person, color: BookingColors.actionBlue), label: 'Cuenta'),
        ],
      ),
    );
  }

  Widget _bannerCookies(bool compacto) {
    const texto = Text(
      'Usamos cookies esenciales para tu sesión y seguridad. Puedes configurar tus preferencias.',
      style: TextStyle(fontSize: 12, color: BookingColors.textDark),
    );
    final configurar = TextButton(
      onPressed: () => CookieConsentHelper.openPreferencesDialog(context).then((_) => _checkCookies()),
      child: const Text('Configurar', style: TextStyle(fontSize: 12)),
    );
    final esenciales = OutlinedButton(
      onPressed: () => _saveCookieDecision('essential'),
      child: const Text('Solo esenciales', style: TextStyle(fontSize: 12)),
    );
    final aceptar = ElevatedButton(
      onPressed: () => _saveCookieDecision('all'),
      style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
      child: const Text('Aceptar todas', style: TextStyle(color: Colors.white, fontSize: 12)),
    );

    return Material(
      elevation: 10,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: compacto
            ? Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.cookie_outlined, color: BookingColors.primaryBlue),
                      SizedBox(width: 8),
                      Expanded(child: texto),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(children: [
                    Expanded(child: esenciales),
                    const SizedBox(width: 8),
                    Expanded(child: aceptar),
                  ]),
                  Align(alignment: Alignment.centerLeft, child: configurar),
                ],
              )
            : Wrap(
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
                      SizedBox(width: 320, child: texto),
                    ],
                  ),
                  Row(mainAxisSize: MainAxisSize.min, children: [configurar, esenciales, const SizedBox(width: 6), aceptar]),
                ],
              ),
      ),
    );
  }
}
