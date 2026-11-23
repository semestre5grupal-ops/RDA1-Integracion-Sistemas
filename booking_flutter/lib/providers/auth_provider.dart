import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AuthProvider extends ChangeNotifier {
  String? _token;
  String? _userEmail;
  String? _userName;

  bool get isAuthenticated => _token != null && _token!.isNotEmpty;
  String? get token => _token;
  String get userEmail => _userEmail ?? 'turista@booking.ec';
  String get userName => _userName ?? 'Turista Booking';

  AuthProvider() {
    _loadFromPrefs();
  }

  Future<void> _loadFromPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('auth_token');
    _userEmail = prefs.getString('auth_email');
    _userName = prefs.getString('auth_name');
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    // Simula / conecta con Supabase Auth
    _token = 'jwt-session-turista-${DateTime.now().millisecondsSinceEpoch}';
    _userEmail = email;
    _userName = email.split('@').first;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', _token!);
    await prefs.setString('auth_email', _userEmail!);
    await prefs.setString('auth_name', _userName!);
    notifyListeners();
  }

  Future<void> logout() async {
    _token = null;
    _userEmail = null;
    _userName = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    notifyListeners();
  }
}

