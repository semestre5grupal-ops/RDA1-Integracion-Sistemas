import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Dónde se guarda la sesión (tokens y datos del usuario).
///
/// En el celular debe ser un almacén cifrado: los tokens en `SharedPreferences`
/// quedan en texto plano dentro del aparato. La interfaz existe para poder usar
/// una versión en memoria o con `SharedPreferences` en las pruebas.
abstract class SesionStorage {
  Future<String?> leer(String clave);
  Future<void> escribir(String clave, String valor);
  Future<void> borrar(String clave);

  /// Mueve datos guardados por versiones anteriores (que usaban
  /// `SharedPreferences`). Por defecto no hace nada.
  Future<void> migrarLegado(List<String> claves) async {}
}

/// Almacén cifrado del sistema (Keystore en Android). Nunca lanza: si el
/// almacén falla (por ejemplo, una copia de seguridad restaurada en otro
/// aparato que ya no puede descifrarse), se comporta como "sin sesión" y el
/// usuario simplemente vuelve a iniciar sesión.
class SecureSesionStorage implements SesionStorage {
  SecureSesionStorage([FlutterSecureStorage? almacen]) : _almacen = almacen ?? const FlutterSecureStorage();

  final FlutterSecureStorage _almacen;

  @override
  Future<String?> leer(String clave) async {
    try {
      return await _almacen.read(key: clave);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> escribir(String clave, String valor) async {
    try {
      await _almacen.write(key: clave, value: valor);
    } catch (_) {
      // Sin almacén no hay persistencia; la sesión sigue viva en memoria.
    }
  }

  @override
  Future<void> borrar(String clave) async {
    try {
      await _almacen.delete(key: clave);
    } catch (_) {}
  }

  /// Sesiones guardadas antes en `SharedPreferences`: se pasan al almacén
  /// cifrado y se borran del texto plano, para no obligar a iniciar sesión de nuevo.
  @override
  Future<void> migrarLegado(List<String> claves) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      for (final k in claves) {
        final v = prefs.get(k);
        if (v == null) continue;
        if (await leer(k) == null) await escribir(k, v.toString());
        await prefs.remove(k);
      }
    } catch (_) {}
  }
}

/// Versión con `SharedPreferences`: solo para pruebas que ya usan sus valores simulados.
class PrefsSesionStorage implements SesionStorage {
  @override
  Future<String?> leer(String clave) async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.get(clave);
    return v?.toString();
  }

  @override
  Future<void> escribir(String clave, String valor) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(clave, valor);
  }

  @override
  Future<void> borrar(String clave) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(clave);
  }

  @override
  Future<void> migrarLegado(List<String> claves) async {}
}

/// Versión en memoria para pruebas.
class MemorySesionStorage implements SesionStorage {
  MemorySesionStorage([Map<String, String>? inicial]) : datos = {...?inicial};

  final Map<String, String> datos;

  @override
  Future<String?> leer(String clave) async => datos[clave];

  @override
  Future<void> escribir(String clave, String valor) async => datos[clave] = valor;

  @override
  Future<void> borrar(String clave) async => datos.remove(clave);

  @override
  Future<void> migrarLegado(List<String> claves) async {}
}
