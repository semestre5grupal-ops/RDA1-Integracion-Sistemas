import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../services/sesion_storage.dart';

class AuthUser {
  final String nombre;
  final String apellido;
  final String email;
  final String cedula;
  final String tipoDocumento;
  final String telefono;

  /// `app_metadata.role` de Supabase. Solo el servidor lo puede escribir (no el
  /// propio usuario), por eso es lo único fiable junto con la lista de correos.
  final String rolApp;

  AuthUser({
    required this.nombre,
    required this.apellido,
    required this.email,
    required this.cedula,
    this.tipoDocumento = 'CEDULA',
    required this.telefono,
    this.rolApp = '',
  });

  /// Mismos correos fijos que `AdminGuard.jsx`. Solo decide si se MUESTRA el
  /// panel: el backend vuelve a comprobarlo en cada petición de `/admin/*`.
  static const List<String> correosAdmin = ['admin@booking.com', 'alejandroflores@booking.com'];

  /// Misma regla que la web: correo de la lista o `app_metadata.role == 'admin'`.
  /// Nunca se mira `user_metadata.role`, que el usuario puede escribir.
  bool get esAdmin => correosAdmin.contains(email.toLowerCase()) || rolApp == 'admin';

  String get displayName => ('$nombre $apellido').trim().isNotEmpty ? ('$nombre $apellido').trim() : (email.split('@').first);

  String get nombreCompleto => displayName;

  Map<String, dynamic> toJson() => {
        'nombre': nombre,
        'apellido': apellido,
        'email': email,
        'cedula': cedula,
        'tipo_documento': tipoDocumento,
        'telefono': telefono,
        'rol_app': rolApp,
      };

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        nombre: json['nombre']?.toString() ?? '',
        apellido: json['apellido']?.toString() ?? '',
        email: json['email']?.toString() ?? '',
        cedula: json['cedula']?.toString() ?? '',
        tipoDocumento: json['tipo_documento']?.toString() ?? 'CEDULA',
        telefono: json['telefono']?.toString() ?? '',
        rolApp: json['rol_app']?.toString() ?? '',
      );
}

/// Resultado de una operación de autenticación.
///
/// [ok] solo es `true` cuando Supabase confirmó la operación. [error] trae un
/// mensaje listo para mostrar; [info] un aviso no bloqueante (p. ej. "revisa tu
/// correo para confirmar la cuenta", caso en que el alta fue correcta pero no
/// hay sesión todavía).
class AuthResult {
  final bool ok;
  final String? error;
  final String? info;
  const AuthResult.exito({this.info})
      : ok = true,
        error = null;
  const AuthResult.fallo(this.error)
      : ok = false,
        info = null;
}

/// Sesión de usuario contra Supabase Auth (mismo proyecto que `frontend/`).
///
/// Paridad con `LoginPage.jsx` / `RegisterPage.jsx` (supabase-js): una sesión
/// SOLO existe si Supabase devolvió un `access_token`. No hay modo "demo": una
/// contraseña incorrecta o un fallo de red devuelven error y no crean sesión.
///
/// Persistencia: supabase-js guarda la sesión (access + refresh token) en
/// localStorage por defecto (`persistSession: true`), así que la web sobrevive a
/// una recarga. Aquí se replica en un almacén cifrado del sistema
/// (`SesionStorage`, Keystore en Android): se guardan access token, refresh token
/// y caducidad, y al arrancar se renueva con `grant_type=refresh_token` si el
/// access token expiró. Si la renovación falla, la sesión se descarta.
class AuthProvider extends ChangeNotifier {
  static const String _supabaseUrl = 'https://owseuntgcgvflqpnmwcc.supabase.co';

  /// Clave pública "anon" (la misma que usa el frontend). No es un secreto: la
  /// seguridad la imponen las políticas RLS y el JWT del usuario.
  static const String _anonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93c2V1bnRnY2d2ZmxxcG5td2NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1Nzg3OTIsImV4cCI6MjEwNjE1NDc5Mn0.L4XXan0fWLnfkQNVTexlwYNc6SjZcSG3DoobZYcl0yw';

  static const _kToken = 'auth_token';
  static const _kRefresh = 'auth_refresh_token';
  static const _kExpiresAt = 'auth_expires_at';
  static const _kUser = 'auth_user_data';
  static const _kName = 'auth_name';
  static const _kEmail = 'auth_email';

  static const Duration _timeout = Duration(seconds: 20);

  static const _clavesSesion = [_kToken, _kRefresh, _kExpiresAt, _kUser, _kName, _kEmail];

  final http.Client _http;
  final SesionStorage _storage;

  String? _token;
  String? _refreshToken;
  int? _expiresAt; // segundos epoch, como `expires_at` de Supabase
  AuthUser? _user;
  Future<void>? _init;

  bool get isAuthenticated => _token != null && _token!.isNotEmpty && _user != null;
  String? get token => _token;
  AuthUser? get user => _user;

  String get userName => _user?.displayName ?? 'Turista';
  String get userEmail => _user?.email ?? '';

  AuthProvider({http.Client? client, SesionStorage? storage})
      : _http = client ?? http.Client(),
        _storage = storage ?? SecureSesionStorage() {
    initAuth();
  }

  Map<String, String> _headers({String? bearer}) => {
        'apikey': _anonKey,
        'Content-Type': 'application/json',
        if (bearer != null) 'Authorization': 'Bearer $bearer',
      };

  /// Idempotente: el constructor y `main.dart` pueden llamarla; solo se ejecuta
  /// una vez (dos renovaciones concurrentes gastarían el mismo refresh token, que
  /// Supabase invalida al usarlo, y la segunda cerraría la sesión).
  Future<void> initAuth() => _init ??= _restaurarSesion();

  Future<void> _restaurarSesion() async {
    await _storage.migrarLegado(_clavesSesion);
    final token = await _storage.leer(_kToken);
    final userJson = await _storage.leer(_kUser);

    // Sesiones inventadas por el antiguo modo demo ('jwt-session-…') o
    // incompletas: no son válidas en el backend y se descartan.
    if (token == null || token.isEmpty || token.startsWith('jwt-session') || userJson == null || userJson.isEmpty) {
      if (token != null) await _borrarSesionGuardada();
      notifyListeners();
      return;
    }
    try {
      _user = AuthUser.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
    } catch (_) {
      await _borrarSesionGuardada();
      notifyListeners();
      return;
    }
    _token = token;
    _refreshToken = await _storage.leer(_kRefresh);
    _expiresAt = int.tryParse(await _storage.leer(_kExpiresAt) ?? '');

    final ahora = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    if (_expiresAt != null && _expiresAt! <= ahora + 30) {
      final renovada = await _renovarSesion();
      if (!renovada) await _cerrarLocal();
    }
    notifyListeners();
  }

  /// `POST /auth/v1/token?grant_type=refresh_token`. Devuelve si hay sesión válida.
  Future<bool> _renovarSesion() async {
    final refresh = _refreshToken;
    if (refresh == null || refresh.isEmpty) return false;
    try {
      final res = await _http
          .post(
            Uri.parse('$_supabaseUrl/auth/v1/token?grant_type=refresh_token'),
            headers: _headers(),
            body: jsonEncode({'refresh_token': refresh}),
          )
          .timeout(_timeout);
      if (res.statusCode != 200) return false;
      final data = jsonDecode(res.body);
      if (data is! Map || (data['access_token']?.toString() ?? '').isEmpty) return false;
      _aplicarSesion(Map<String, dynamic>.from(data), emailRespaldo: _user?.email ?? '');
      await _persistSession();
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Toma `access_token`, `refresh_token`, `expires_at|expires_in` y `user` de
  /// una respuesta de Supabase Auth.
  void _aplicarSesion(Map<String, dynamic> data, {required String emailRespaldo, AuthUser? usuarioRespaldo}) {
    _token = data['access_token'].toString();
    _refreshToken = data['refresh_token']?.toString();
    final expiresAt = data['expires_at'];
    final expiresIn = data['expires_in'];
    if (expiresAt is num) {
      _expiresAt = expiresAt.toInt();
    } else if (expiresIn is num) {
      _expiresAt = DateTime.now().millisecondsSinceEpoch ~/ 1000 + expiresIn.toInt();
    }
    final userObj = data['user'] is Map ? Map<String, dynamic>.from(data['user']) : <String, dynamic>{};
    _user = _usuarioDesdeSupabase(userObj, emailRespaldo: emailRespaldo) ?? usuarioRespaldo ?? _user;
  }

  AuthUser? _usuarioDesdeSupabase(Map<String, dynamic> userObj, {required String emailRespaldo}) {
    if (userObj.isEmpty) return null;
    final meta = userObj['user_metadata'] is Map ? Map<String, dynamic>.from(userObj['user_metadata']) : <String, dynamic>{};
    final email = (userObj['email']?.toString() ?? emailRespaldo).trim().toLowerCase();
    final appMeta = userObj['app_metadata'] is Map ? Map<String, dynamic>.from(userObj['app_metadata']) : <String, dynamic>{};
    return AuthUser(
      rolApp: appMeta['role']?.toString() ?? '',
      nombre: meta['nombre']?.toString() ?? email.split('@').first,
      apellido: meta['apellido']?.toString() ?? '',
      email: email,
      cedula: meta['cedula']?.toString() ?? '', // sin cédula inventada: la pide el formulario
      tipoDocumento: meta['tipo_documento']?.toString() ?? 'CEDULA',
      telefono: meta['telefono']?.toString() ?? '',
    );
  }

  /// Mensaje legible de un error de Supabase Auth (`error_description`, `msg`,
  /// `message` o `error`).
  static String _mensajeSupabase(http.Response res) {
    try {
      final d = jsonDecode(res.body);
      if (d is Map) {
        for (final k in const ['error_description', 'msg', 'message', 'error']) {
          final v = d[k]?.toString();
          if (v != null && v.isNotEmpty) return v;
        }
      }
    } catch (_) {}
    return 'HTTP ${res.statusCode}';
  }

  static const String _errorConexion = 'No se pudo conectar con el servidor de autenticación. Revisa tu conexión e inténtalo de nuevo.';

  // --- INICIO DE SESIÓN (LoginPage.jsx → supabase.auth.signInWithPassword) ---
  Future<AuthResult> login(String email, String password) async {
    final cleanEmail = email.trim().toLowerCase();
    final http.Response res;
    try {
      res = await _http
          .post(
            Uri.parse('$_supabaseUrl/auth/v1/token?grant_type=password'),
            headers: _headers(),
            body: jsonEncode({'email': cleanEmail, 'password': password}),
          )
          .timeout(_timeout);
    } catch (_) {
      return const AuthResult.fallo(_errorConexion);
    }

    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      if (data is! Map || (data['access_token']?.toString() ?? '').isEmpty) {
        return const AuthResult.fallo('El servidor de autenticación no devolvió una sesión válida.');
      }
      _aplicarSesion(Map<String, dynamic>.from(data), emailRespaldo: cleanEmail);
      await _persistSession();
      notifyListeners();
      return const AuthResult.exito();
    }

    final msg = _mensajeSupabase(res);
    if (msg.contains('Invalid login credentials')) {
      return const AuthResult.fallo('Correo o contraseña invalidos'); // texto exacto de LoginPage.jsx
    }
    if (msg.toLowerCase().contains('email not confirmed')) {
      return const AuthResult.fallo('Debes confirmar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.');
    }
    if (res.statusCode == 429) {
      return const AuthResult.fallo('Demasiados intentos de inicio de sesión. Espera unos minutos e inténtalo de nuevo.');
    }
    return AuthResult.fallo(msg);
  }

  // --- REGISTRO (RegisterPage.jsx → supabase.auth.signUp) ---
  Future<AuthResult> register({
    required String nombre,
    required String apellido,
    required String tipoDocumento,
    required String cedula,
    required String telefono,
    required String email,
    required String password,
  }) async {
    final cleanEmail = email.trim().toLowerCase();
    final http.Response res;
    try {
      res = await _http
          .post(
            Uri.parse('$_supabaseUrl/auth/v1/signup'),
            headers: _headers(),
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
          )
          .timeout(_timeout);
    } catch (_) {
      return const AuthResult.fallo(_errorConexion);
    }

    if (res.statusCode != 200 && res.statusCode != 201) {
      final msg = _mensajeSupabase(res);
      final lower = msg.toLowerCase();
      if (lower.contains('already registered')) {
        return const AuthResult.fallo('Este correo electrónico ya se encuentra registrado. Debes usar un correo diferente para crear una cuenta nueva.');
      }
      if (res.statusCode == 429 || lower.contains('rate limit')) {
        return const AuthResult.fallo('Has intentado registrarte demasiadas veces (límite de seguridad). Espera una hora o intenta con otro correo.');
      }
      if (msg.contains('Database error saving new user')) {
        return const AuthResult.fallo('Error al registrar usuario en la base de datos. Por favor, intenta de nuevo.');
      }
      if (res.statusCode == 400 || res.statusCode == 422) {
        return const AuthResult.fallo('Solicitud inválida. Es probable que este correo ya esté en uso o tenga un formato bloqueado. Prueba con otro correo.');
      }
      return AuthResult.fallo(msg);
    }

    final decoded = jsonDecode(res.body);
    final data = decoded is Map ? Map<String, dynamic>.from(decoded) : <String, dynamic>{};
    // Con confirmación de correo activa, Supabase devuelve el usuario en la raíz
    // (sin sesión); con autoconfirmación, una sesión con `user` dentro.
    final userObj = data['user'] is Map ? Map<String, dynamic>.from(data['user']) : (data['id'] != null ? data : <String, dynamic>{});

    // Supabase ofusca el alta de un correo ya existente: devuelve un usuario
    // con `identities` vacío (misma detección que RegisterPage.jsx).
    final identities = userObj['identities'];
    if (identities is List && identities.isEmpty) {
      return const AuthResult.fallo('Este correo electrónico ya se encuentra registrado. Usa uno diferente o inicia sesión.');
    }

    if ((data['access_token']?.toString() ?? '').isNotEmpty) {
      _aplicarSesion(
        data,
        emailRespaldo: cleanEmail,
        usuarioRespaldo: AuthUser(
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          email: cleanEmail,
          cedula: cedula.trim(),
          tipoDocumento: tipoDocumento,
          telefono: telefono.trim(),
        ),
      );
      await _persistSession();
      notifyListeners();
      return const AuthResult.exito();
    }

    // Alta correcta pero sin sesión: hay que confirmar el correo.
    return const AuthResult.exito(
      info: '¡Registro exitoso! Por seguridad, revisa tu correo electrónico para confirmar tu cuenta y luego inicia sesión.',
    );
  }

  // --- ACTUALIZAR PERFIL (y contraseña opcional, parity con Navbar.jsx) ---
  /// Devuelve `null` si todo se guardó en Supabase, o el mensaje de error.
  Future<String?> updateProfile({
    required String nombre,
    required String apellido,
    required String telefono,
    required String email,
    String? currentPassword,
    String? newPassword,
  }) async {
    final user = _user;
    if (!isAuthenticated || user == null) return 'Tu sesión no es válida. Inicia sesión nuevamente.';
    final cleanEmail = email.trim().toLowerCase();

    if (newPassword != null && newPassword.isNotEmpty) {
      if (currentPassword == null || currentPassword.isEmpty) {
        return 'Debes ingresar tu contraseña actual para cambiarla.';
      }
      try {
        final verifyRes = await _http
            .post(
              Uri.parse('$_supabaseUrl/auth/v1/token?grant_type=password'),
              headers: _headers(),
              body: jsonEncode({'email': user.email, 'password': currentPassword}),
            )
            .timeout(_timeout);
        if (verifyRes.statusCode != 200) return 'La contraseña actual es incorrecta.';
      } catch (_) {
        // Sin verificar la contraseña actual no se cambia la contraseña.
        return _errorConexion;
      }
    }

    final bodyMap = <String, dynamic>{
      'data': {'nombre': nombre.trim(), 'apellido': apellido.trim(), 'telefono': telefono.trim()},
      if (cleanEmail.isNotEmpty && cleanEmail != user.email) 'email': cleanEmail,
      if (newPassword != null && newPassword.isNotEmpty) 'password': newPassword,
    };
    final http.Response res;
    try {
      res = await _http.put(Uri.parse('$_supabaseUrl/auth/v1/user'), headers: _headers(bearer: _token), body: jsonEncode(bodyMap)).timeout(_timeout);
    } catch (_) {
      return _errorConexion;
    }
    if (res.statusCode == 401) {
      await _cerrarLocal();
      notifyListeners();
      return 'Tu sesión expiró. Inicia sesión nuevamente.';
    }
    if (res.statusCode != 200) {
      final msg = _mensajeSupabase(res);
      if (res.statusCode == 429 || msg.contains('rate')) {
        return 'Supabase bloqueó temporalmente los cambios por demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
      }
      if (msg.contains('already')) return 'Ese correo ya está en uso por otra cuenta.';
      return 'Error al actualizar el perfil: $msg';
    }

    // Con cambio de correo, Supabase mantiene el correo actual hasta que se
    // confirme el nuevo; se refleja lo que devuelve el servidor.
    final decoded = jsonDecode(res.body);
    final servidor = decoded is Map ? _usuarioDesdeSupabase(Map<String, dynamic>.from(decoded), emailRespaldo: user.email) : null;
    _user = AuthUser(
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      email: servidor?.email ?? user.email,
      cedula: user.cedula,
      tipoDocumento: user.tipoDocumento,
      telefono: telefono.trim(),
      rolApp: servidor?.rolApp ?? user.rolApp,
    );
    await _persistSession();
    notifyListeners();
    return null;
  }

  Future<void> _persistSession() async {
    if (_token != null) await _storage.escribir(_kToken, _token!);
    if (_refreshToken != null) await _storage.escribir(_kRefresh, _refreshToken!);
    if (_expiresAt != null) await _storage.escribir(_kExpiresAt, _expiresAt!.toString());
    if (_user != null) {
      await _storage.escribir(_kUser, jsonEncode(_user!.toJson()));
      await _storage.escribir(_kName, _user!.displayName);
      await _storage.escribir(_kEmail, _user!.email);
    }
  }

  /// Borra SOLO las claves de sesión: el consentimiento de cookies, la huella del
  /// dispositivo (X-Device-Fingerprint, que identifica al dueño de las reservas de
  /// vuelo) y la moneda elegida siguen en `SharedPreferences` y no se tocan.
  Future<void> _borrarSesionGuardada() async {
    for (final k in _clavesSesion) {
      await _storage.borrar(k);
    }
  }

  Future<void> _cerrarLocal() async {
    _token = null;
    _refreshToken = null;
    _expiresAt = null;
    _user = null;
    await _borrarSesionGuardada();
  }

  // --- CERRAR SESIÓN (supabase.auth.signOut) ---
  Future<void> logout() async {
    final token = _token;
    await _cerrarLocal();
    notifyListeners();
    if (token != null) {
      // Revoca el refresh token en Supabase; si falla, la sesión local ya se cerró.
      try {
        await _http.post(Uri.parse('$_supabaseUrl/auth/v1/logout'), headers: _headers(bearer: token)).timeout(_timeout);
      } catch (_) {}
    }
  }
}
