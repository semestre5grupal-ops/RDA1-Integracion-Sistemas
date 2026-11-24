import 'package:flutter/material.dart';
import '../theme/booking_colors.dart';
import '../screens/auth/login_screen.dart';

class AuthGuardDialog {
  static Future<bool> ensureAuthenticated(BuildContext context, {required bool isAuthenticated}) async {
    if (isAuthenticated) return true;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: const Row(
          children: [
            Icon(Icons.lock_outline, color: BookingColors.primaryBlue),
            SizedBox(width: 8),
            Text(
              'Iniciar Sesión Requerido',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
            ),
          ],
        ),
        content: const Text(
          'Para confirmar tu reserva, garantizar tus cupos y emitir tu voucher y factura electrónica autorizada por el SRI, debes acceder a tu cuenta de Booking Central.',
          style: TextStyle(fontSize: 14, color: BookingColors.textDark, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar', style: TextStyle(color: BookingColors.textMuted)),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx, true);
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const LoginScreen()),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: BookingColors.actionBlue,
              foregroundColor: Colors.white,
            ),
            child: const Text('Iniciar Sesión'),
          ),
        ],
      ),
    );

    return result ?? false;
  }
}
