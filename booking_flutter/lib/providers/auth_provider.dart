import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AuthUser {
  final String nombre;
  final String email;

  AuthUser({required this.nombre, required this.email});
}

class AuthProvider extends ChangeNotifier {
  String? _token;
  String? _userEmail;
  String? _userName;

  bool get isAuthenticated => _token != null && _token!.isNotEmpty;
  String? get token => _token;
  String get userEmail => _userEmail ?? 'turista@booking.ec';
  String get userName => _userName ?? 'Turista Booking';

  AuthUser? get user => isAuthenticated
      ? AuthUser(nombre: _userName ?? 'Turista', email: _userEmail ?? '')
      : null;

  AuthProvider() {
    initAuth();
  }

  Future<void> initAuth() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('auth_token');
    _userEmail = prefs.getString('auth_email');
    _userName = prefs.getString('auth_name');
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    _token = 'jwt-session-turista-${DateTime.now().millisecondsSinceEpoch}';
    _userEmail = email;
    _userName = email.split('@').first;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', _token!);
    await prefs.setString('auth_email', _userEmail!);
    await prefs.setString('auth_name', _userName!);
    notifyListeners();
    return true;
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
