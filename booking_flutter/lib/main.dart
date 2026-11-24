import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/currency_provider.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';
import 'screens/info/privacidad_screen.dart';
import 'screens/info/quiero_ser_proveedor_screen.dart';
import 'screens/info/terminos_screen.dart';
import 'screens/main_shell.dart';
import 'screens/perfil/facturas_screen.dart';
import 'screens/reservas/mis_reservas_screen.dart';
import 'screens/vuelos/estado_vuelo_screen.dart';
import 'theme/booking_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const BookingApp());
}

class BookingApp extends StatelessWidget {
  const BookingApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()..initAuth()),
        ChangeNotifierProvider(create: (_) => CurrencyProvider()),
      ],
      child: MaterialApp(
        title: 'Booking.com | Viajes y Reservas',
        debugShowCheckedModeBanner: false,
        theme: BookingTheme.lightTheme,
        home: const MainShell(),
        routes: {
          '/login': (context) => const LoginScreen(),
          '/register': (context) => const RegisterScreen(),
          '/reservas': (context) => const MisReservasScreen(),
          '/estado-vuelo': (context) => const EstadoVueloScreen(),
          '/facturas': (context) => const FacturasScreen(),
          '/privacidad': (context) => const PrivacidadScreen(),
          '/terminos': (context) => const TerminosScreen(),
          '/ser-proveedor': (context) => const QuieroSerProveedorScreen(),
        },
      ),
    );
  }
}
