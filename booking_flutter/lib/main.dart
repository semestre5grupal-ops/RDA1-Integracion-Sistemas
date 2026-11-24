import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'screens/main_shell.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';
import 'screens/reservas/mis_reservas_screen.dart';
import 'screens/vuelos/estado_vuelo_screen.dart';
import 'theme/booking_theme.dart';

void main() async {
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
      ],
      child: MaterialApp(
        title: 'Booking Central Ecuador',
        debugShowCheckedModeBanner: false,
        theme: BookingTheme.lightTheme,
        initialRoute: '/',
        routes: {
          '/': (context) => const MainShell(),
          '/login': (context) => const LoginScreen(),
          '/register': (context) => const RegisterScreen(),
          '/reservas': (context) => const MisReservasScreen(),
          '/estado-vuelo': (context) => const EstadoVueloScreen(),
        },
      ),
    );
  }
}
