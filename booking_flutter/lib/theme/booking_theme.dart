import 'package:flutter/material.dart';
import 'booking_colors.dart';

class BookingTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: BookingColors.backgroundLight,
      colorScheme: ColorScheme.fromSeed(
        seedColor: BookingColors.primaryBlue,
        primary: BookingColors.primaryBlue,
        secondary: BookingColors.accentYellow,
        surface: BookingColors.cardBg,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: BookingColors.primaryBlue,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: BookingColors.actionBlue,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(6),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
        ),
      ),
      cardTheme: const CardThemeData(
        color: BookingColors.cardBg,
        elevation: 1.5,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
          side: BorderSide(color: BookingColors.borderLight, width: 0.8),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Colors.white,
        selectedItemColor: BookingColors.primaryBlue,
        unselectedItemColor: BookingColors.textMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),
    );
  }
}
