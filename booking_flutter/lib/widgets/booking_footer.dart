import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../screens/info/privacidad_screen.dart';
import '../screens/info/terminos_screen.dart';
import '../theme/booking_colors.dart';

class CookieConsentHelper {
  static Future<void> openPreferencesDialog(BuildContext context) async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('booking_cookie_decision') ?? 'essential';
    bool analytics = saved == 'all';

    if (!context.mounted) return;
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setD) {
          return AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.cookie_outlined, color: BookingColors.primaryBlue),
                SizedBox(width: 8),
                Text('Preferencias de cookies', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17)),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Gestiona el uso de almacenamiento y rastreadores en Booking Prototipo.',
                  style: TextStyle(fontSize: 13, color: BookingColors.textMuted),
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: true,
                  onChanged: null,
                  title: const Text('Cookies esenciales', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  subtitle: const Text('Necesarias para sesión JWT, moneda e idempotencia.', style: TextStyle(fontSize: 11)),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: analytics,
                  onChanged: (v) => setD(() => analytics = v),
                  title: const Text('Analítica y experiencia', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  subtitle: const Text('Permite recordar sugerencias recientes.', style: TextStyle(fontSize: 11)),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () async {
                  await prefs.setString('booking_cookie_decision', 'essential');
                  if (ctx.mounted) Navigator.pop(ctx);
                },
                child: const Text('Solo esenciales'),
              ),
              ElevatedButton(
                onPressed: () async {
                  await prefs.setString('booking_cookie_decision', analytics ? 'all' : 'essential');
                  if (ctx.mounted) Navigator.pop(ctx);
                },
                style: ElevatedButton.styleFrom(backgroundColor: BookingColors.actionBlue),
                child: const Text('Guardar preferencias', style: TextStyle(color: Colors.white)),
              ),
            ],
          );
        },
      ),
    );
  }
}

class BookingFooter extends StatelessWidget {
  const BookingFooter({super.key});

  @override
  Widget build(BuildContext context) {
    final anio = DateTime.now().year;

    return Container(
      width: double.infinity,
      color: const Color(0xFFF5F7FA),
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1140),
          child: Column(
            children: [
              // Enlaces legales (Footer.jsx parity)
              Wrap(
                alignment: WrapAlignment.center,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 8,
                runSpacing: 4,
                children: [
                  InkWell(
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PrivacidadScreen())),
                    child: const Text('Política de Privacidad', style: TextStyle(color: BookingColors.actionBlue, fontSize: 13, decoration: TextDecoration.underline)),
                  ),
                  const Text('·', style: TextStyle(color: BookingColors.textMuted, fontSize: 14)),
                  InkWell(
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TerminosScreen())),
                    child: const Text('Términos de Uso', style: TextStyle(color: BookingColors.actionBlue, fontSize: 13, decoration: TextDecoration.underline)),
                  ),
                  const Text('·', style: TextStyle(color: BookingColors.textMuted, fontSize: 14)),
                  InkWell(
                    onTap: () => CookieConsentHelper.openPreferencesDialog(context),
                    child: const Text('Preferencias de cookies', style: TextStyle(color: BookingColors.actionBlue, fontSize: 13, decoration: TextDecoration.underline)),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              RichText(
                textAlign: TextAlign.center,
                text: TextSpan(
                  style: const TextStyle(fontSize: 12, color: BookingColors.textDark),
                  children: [
                    TextSpan(text: '© $anio '),
                    const TextSpan(text: 'Booking Prototipo', style: TextStyle(fontWeight: FontWeight.bold)),
                    const TextSpan(text: ' — Proyecto Integrador de Sistemas · Universidad'),
                  ],
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Powered by NestJS · React · PostgreSQL · Docker',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 11, color: BookingColors.textMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
