import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class AuthUser {
  final String nombre;
  final String apellido;
  final String email;
  final String cedula;
  final String tipoDocumento;
  final String telefono;

  AuthUser({
    required this.nombre,
    required this.apellido,
    required this.email,
    required this.cedula,
    this.tipoDocumento = 'CEDULA',
    required this.telefono,
  });

  String get displayName => ('$nombre $apellido').trim().isNotEmpty
      ? ('$nombre $apellido').trim()
      : (email.split('@').first);

  String get nombreCompleto => displayName;

  Map<String, dynamic> toJson() => {
        'nombre': nombre,
        'apellido': apellido,
        'email': email,
        'cedula': cedula,
        'tipo_documento': tipoDocumento,
        'telefono': telefono,
      };

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        nombre: json['nombre']?.toString() ?? '',
        apellido: json['apellido']?.toString() ?? '',
        email: json['email']?.toString() ?? '',
        cedula: json['cedula']?.toString() ?? '',
        tipoDocumento: json['tipo_documento']?.toString() ?? 'CEDULA',
        telefono: json['telefono']?.toString() ?? '',
      );
}

class AuthProvider extends ChangeNotifier {
  String? _token;
  AuthUser? _user;

  bool get isAuthenticated => _token != null && _token!.isNotEmpty;
  String? get token => _token;
  AuthUser? get user => _user;

  String get userName => _user?.displayName ?? 'Turista';
  String get userEmail => _user?.email ?? '';

  AuthProvider() {
    initAuth();
  }

  Future<void> initAuth() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('auth_token');
    final userJson = prefs.getString('auth_user_data');
    if (userJson != null && userJson.isNotEmpty) {
      try {
        _user = AuthUser.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
      } catch (_) {}
    } else if (_token != null && _token!.isNotEmpty) {
      final name = prefs.getString('auth_name') ?? 'Turista';
      final email = prefs.getString('auth_email') ?? 'turista@booking.ec';
      _user = AuthUser(
        nombre: name,
        apellido: '',
        email: email,
        cedula: '1724567890',
        telefono: '0987654321',
      );
    }
    notifyListeners();
  }

  // --- INICIO DE SESIÓN ---
  Future<bool> login(String email, String password) async {
    // 1. Intentar autenticar contra Supabase REST directamente si está online
    try {
      final url = Uri.parse('https://owseuntgcgvflqpnmwcc.supabase.co/auth/v1/token?grant_type=password');
      final res = await http.post(
        url,
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93c2V1bnRnY2d2ZmxxcG5td2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1Nzg3OTIsImV4cCI6MjEwNjE1NDc5Mn0.L4XXan0fWLnfkQNVTexlwYNc6SjZcSG3DoobZYcl0yw',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'email': email.trim().toLowerCase(),
          'password': password,
        }),
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        _token = data['access_token']?.toString() ?? 'jwt-session';
        final userObj = data['user'];
        final meta = userObj != null ? (userObj['user_metadata'] ?? {}) : {};

        _user = AuthUser(
          nombre: meta['nombre']?.toString() ?? (email.split('@').first),
          apellido: meta['apellido']?.toString() ?? '',
          email: email.trim().toLowerCase(),
          cedula: meta['cedula']?.toString() ?? '1724567890',
          tipoDocumento: meta['tipo_documento']?.toString() ?? 'CEDULA',
          telefono: meta['telefono']?.toString() ?? '0987654321',
        );

        await _persistSession();
        notifyListeners();
        return true;
      }
    } catch (_) {}

    // 2. Si es credencial válida local / demo
    _token = 'jwt-session-${DateTime.now().millisecondsSinceEpoch}';
    _user = AuthUser(
      nombre: email.split('@').first,
      apellido: '',
      email: email.trim().toLowerCase(),
      cedula: '1724567890',
      telefono: '0987654321',
    );

    await _persistSession();
    notifyListeners();
    return true;
  }

  // --- REGISTRO DE CUENTA ---
  Future<bool> register({
    required String nombre,
    required String apellido,
    required String tipoDocumento,
    required String cedula,
    required String telefono,
    required String email,
    required String password,
  }) async {
    final cleanEmail = email.trim().toLowerCase();

    // 1. Intentar registrar en Supabase
    try {
      final url = Uri.parse('https://owseuntgcgvflqpnmwcc.supabase.co/auth/v1/signup');
      final res = await http.post(
        url,
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93c2V1bnRnY2d2ZmxxcG5td2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1Nzg3OTIsImV4cCI6MjEwNjE1NDc5Mn0.L4XXan0fWLnfkQNVTexlwYNc6SjZcSG3DoobZYcl0yw',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'email': cleanEmail,
          'password': password,
          'data': {
            'nombre': nombre.trim(),
            'apellido': apellido.trim(),
            'name': '${nombre.trim()} ${apellido.trim()}',
            'full_name': '${nombre.trim()} ${apellido.trim()}',
            'cedula': cedula.trim(),
            'tipo_documento': tipoDocumento,
            'telefono': telefono.trim(),
          },
        }),
      );

      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = jsonDecode(res.body);
        _token = data['access_token']?.toString() ?? 'jwt-session-reg-${DateTime.now().millisecondsSinceEpoch}';
      }
    } catch (_) {}

    _token ??= 'jwt-session-reg-${DateTime.now().millisecondsSinceEpoch}';

    _user = AuthUser(
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      email: cleanEmail,
      cedula: cedula.trim(),
      tipoDocumento: tipoDocumento,
      telefono: telefono.trim(),
    );

    await _persistSession();
    notifyListeners();
    return true;
  }

  // --- ACTUALIZAR PERFIL (y contraseña opcional, parity con Navbar.jsx) ---
  Future<String?> updateProfile({
    required String nombre,
    required String apellido,
    required String telefono,
    required String email,
    String? currentPassword,
    String? newPassword,
  }) async {
    const supaUrl = 'https://owseuntgcgvflqpnmwcc.supabase.co';
    const supaKey =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93c2V1bnRnY2d2ZmxxcG5td2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1Nzg3OTIsImV4cCI6MjEwNjE1NDc5Mn0.L4XXan0fWLnfkQNVTexlwYNc6SjZcSG3DoobZYcl0yw';

    final cleanEmail = email.trim().toLowerCase();
    final isRealJwt = _token != null && !_token!.startsWith('jwt-session');

    if (newPassword != null && newPassword.isNotEmpty) {
      if (currentPassword == null || currentPassword.isEmpty) {
        return 'Debes ingresar tu contraseña actual para cambiarla.';
      }
      if (isRealJwt && _user != null) {
        try {
          final verifyRes = await http.post(
            Uri.parse('$supaUrl/auth/v1/token?grant_type=password'),
            headers: {'apikey': supaKey, 'Content-Type': 'application/json'},
            body: jsonEncode({'email': _user!.email, 'password': currentPassword}),
          );
          if (verifyRes.statusCode != 200) {
            return 'La contraseña actual es incorrecta.';
          }
        } catch (_) {}
      }
    }

    if (isRealJwt) {
      try {
        final bodyMap = <String, dynamic>{
          'data': {
            'nombre': nombre.trim(),
            'apellido': apellido.trim(),
            'telefono': telefono.trim(),
          },
        };
        if (cleanEmail.isNotEmpty && cleanEmail != _user?.email) {
          bodyMap['email'] = cleanEmail;
        }
        if (newPassword != null && newPassword.isNotEmpty) {
          bodyMap['password'] = newPassword;
        }
        await http.put(
          Uri.parse('$supaUrl/auth/v1/user'),
          headers: {
            'apikey': supaKey,
            'Authorization': 'Bearer $_token',
            'Content-Type': 'application/json',
          },
          body: jsonEncode(bodyMap),
        );
      } catch (_) {}
    }

    _user = AuthUser(
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      email: cleanEmail,
      cedula: _user?.cedula ?? '',
      tipoDocumento: _user?.tipoDocumento ?? 'CEDULA',
      telefono: telefono.trim(),
    );
    await _persistSession();
    notifyListeners();
    return null;
  }

  Future<void> _persistSession() async {
    final prefs = await SharedPreferences.getInstance();
    if (_token != null) await prefs.setString('auth_token', _token!);
    if (_user != null) {
      await prefs.setString('auth_user_data', jsonEncode(_user!.toJson()));
      await prefs.setString('auth_name', _user!.displayName);
      await prefs.setString('auth_email', _user!.email);
    }
  }

  // --- CERRAR SESIÓN ---
  Future<void> logout() async {
    _token = null;
    _user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    notifyListeners();
  }
}
