import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/cart_provider.dart';
import 'providers/auth_provider.dart';
import 'screens/main_shell.dart';
import 'screens/checkout/cart_screen.dart';
import 'screens/reservas/mis_reservas_screen.dart';
import 'screens/vuelos/estado_vuelo_screen.dart';

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
        ChangeNotifierProvider(create: (_) => CartProvider()),
        ChangeNotifierProvider(create: (_) => AuthProvider()..initAuth()),
      ],
      child: MaterialApp(
        title: 'Booking Ecuador',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF003580),
            primary: const Color(0xFF003580),
            secondary: const Color(0xFFFEBB02), // Booking Gold accent
            surface: Colors.white,
          ),
          appBarTheme: const AppBarTheme(
            backgroundColor: Color(0xFF003580),
            foregroundColor: Colors.white,
            elevation: 0,
            centerTitle: false,
          ),
          elevatedButtonTheme: ElevatedButtonThemeData(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF003580),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
          cardTheme: const CardThemeData(
            elevation: 2,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(12)),
            ),
          ),
        ),
        initialRoute: '/',
        routes: {
          '/': (context) => const MainShell(),
          '/cart': (context) => const CartScreen(),
          '/reservas': (context) => const MisReservasScreen(),
          '/estado-vuelo': (context) => const EstadoVueloScreen(),
        },
      ),
    );
  }
}
